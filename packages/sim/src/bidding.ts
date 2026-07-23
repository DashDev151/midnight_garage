import type {
  AuctionLot,
  AuctionTier,
  Buyer,
  CarInstance,
  CarModel,
  DayLogEntry,
  GameState,
  TurnoutBand,
} from '@midnight-garage/content'
import { setCarLedger } from './carLedger'
import type { SimContext } from './context'
import { sheetGuideValueYen } from './diagnosis'
import { assignToShop, hasAcquisitionSpace } from './facilities'
import { marketValueYen } from './marketValue'
import { bellNormal, createRng, hashStringToSeed } from './rng'

export type { TurnoutBand }

/**
 * Buyer archetypes with a genuinely stated interest in a model's tier. No
 * entry for a tier means that archetype never bids on it; there is no
 * default fallback. Also used by `selling.ts` to apply the identical gate
 * to walk-in/listing buyers - the same rule, not a different one.
 */
export function interestedBuyers(
  model: CarModel,
  buyers: readonly Buyer[],
): { buyer: Buyer; weight: number }[] {
  return buyers.flatMap((buyer) => {
    const preference = buyer.tierPreferences.find((p) => p.tier === model.tier)
    return preference && preference.weight > 0 ? [{ buyer, weight: preference.weight }] : []
  })
}

/**
 * The single value anchor. Every other money number in this file
 * (`privateValuationYen`, `computeBuyoutPriceYen`, `reserveYen`) calls this
 * ONE function, never `marketValueYen` directly - that isolation lets the
 * whole file re-anchor every auction-money number at once by swapping one
 * function's body.
 *
 * Dealers buy at wholesale off the taste-free market value
 * (`marketValueYen`, the rolled lot car's condition/parts/heat, no buyer
 * stat-fit) - taste belongs to end customers, not the trade. The
 * `interestedBuyers` tier gate stays as a precondition, not a value input:
 * it still answers "does ANY dealer archetype care about this tier at
 * all", returning 0 when nobody does (the demand ceiling then sits below
 * any reserve, so the lot simply never opens on its own) - but no longer
 * selects *which* buyer's valuation to use, since `marketValueYen` doesn't
 * take a buyer.
 *
 * A symptomatic car (`car.symptoms.length > 0`) prices through
 * `sheetGuideValueYen` (`diagnosis.ts`) instead - the fear-priced room read
 * off the car's APPARENT condition, never the true one. An honest car is
 * completely unaffected; `sheetGuideValueYen` itself degenerates to
 * `marketValueYen` for one anyway, so this branch exists for clarity (and
 * to skip the extra per-cause valuation work) rather than necessity. Every
 * downstream reader (`reserveYen`, `computeBuyoutPriceYen`,
 * `privateValuationYen`) calls this ONE function, so the whole room
 * reprices through this single seam - none of them, and no rival-valuation
 * code anywhere, ever reads `car.symptoms[].trueCauseId` or
 * `.remainingCauseIds` directly.
 */
export function carGuideValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  const interested = interestedBuyers(model, context.buyers)
  if (interested.length === 0) return 0
  if (car.symptoms.length > 0) return sheetGuideValueYen(car, model, state, context)
  const heatPercent = state.marketHeat[model.id] ?? 100
  return marketValueYen(
    model,
    car,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
}

export function anchorValueYen(lot: AuctionLot, state: GameState, context: SimContext): number {
  const model = context.modelsById[lot.modelId]
  if (!model) return 0
  return carGuideValueYen(lot.car, model, state, context)
}

/**
 * Seller's floor under a deal (GDD 6.5): a fraction of the lot's GUIDE
 * VALUE. Bidding opens here; a lot no rival cohort ever clears this on
 * simply never opens on its own (nobody came for it) - it can still be
 * bought out, or bid on directly by the player.
 *
 * Rebased off `anchorValueYen` (= `marketValueYen` = the restoration-bill
 * `instanceValue`), not a static `bookValueYen` basis - a static book-value
 * reserve would sit *above* most worn cars' actual guide value once car
 * value reflects a worn car's restoration bill, seizing the whole auction
 * market. Coupling the reserve to the same value everything else prices
 * from (the auction anchor, buyout, walk-in offers, bot bid caps) fixes
 * that by construction: the reserve moves with this specific worn car, not
 * with a static per-model constant.
 */
export function reserveYen(lot: AuctionLot, state: GameState, context: SimContext): number {
  return Math.round(
    anchorValueYen(lot, state, context) * context.economy.AUCTION_RESERVE_PRICE_FRACTION,
  )
}

/**
 * A private rival valuation of this lot: bell-shaped around
 * `anchorValueYen * multiplier`, seeded so it's a fixed, reproducible read
 * for a given lot, not a per-day reroll. A bot's own walk-away decision
 * (`bots/buyoutHelpers.ts`'s `walkAwayTargetYen`) is this file's one
 * remaining caller.
 */
export function privateValuationYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  multiplier: number,
): number {
  const anchor = anchorValueYen(lot, state, context)
  const rng = createRng(hashStringToSeed(`walk-away:${lot.id}`))
  const spreadMultiplier = bellNormal(1, context.economy.valuation.walkAwaySpread, rng)
  return Math.round(anchor * multiplier * spreadMultiplier)
}

/**
 * The real, chargeable instant-buyout price: `anchorValueYen *
 * AUCTION_BUYOUT_PREMIUM` - the same exported anchor every private
 * valuation centers on. Buyout is available on every lot, priced rather
 * than forbidden.
 */
export function computeBuyoutPriceYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
): number {
  const anchor = anchorValueYen(lot, state, context)
  return Math.round(anchor * context.economy.AUCTION_BUYOUT_PREMIUM)
}

export interface AcquisitionResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The shared instant-purchase core (spends `priceYen`, checks space, moves
 * the lot's car into the shop, removes the lot): the one settlement path
 * `resolveBuyoutInstant` and `settleAuctionHammer` both resolve through -
 * a buyout and a live-room hammer win are the same mechanical event, cash
 * out and car in the same day, differing only in how `priceYen` was priced.
 * Insufficient cash refuses quietly (no log entry, matching this file's
 * established no-escrow refusal shape); a full garage forfeits loudly via
 * `acquisition-blocked` under the caller's own `blockedKind`.
 */
function settleLotPurchase(
  state: GameState,
  lot: AuctionLot,
  priceYen: number,
  blockedKind: 'buyout' | 'auction-win',
  buildLogEntry: (priceYen: number) => DayLogEntry,
): AcquisitionResult {
  if (state.cashYen < priceYen) return { state, log: [] }
  if (!hasAcquisitionSpace(state)) {
    return { state, log: [{ type: 'acquisition-blocked', kind: blockedKind, reason: 'no-space' }] }
  }

  const withCar = assignToShop(
    setCarLedger(
      {
        ...state,
        cashYen: state.cashYen - priceYen,
        ownedCars: [...state.ownedCars, lot.car],
        activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== lot.id),
      },
      lot.car.id,
      { purchaseYen: priceYen, repairYen: 0, partsYen: 0 },
    ),
    lot.car.id,
  )
  return { state: withCar, log: [buildLogEntry(priceYen)] }
}

/**
 * The instant buyout resolver: a guaranteed purchase at
 * `computeBuyoutPriceYen`, no rival contest - a full garage just means the
 * purchase doesn't happen right now (no money spent), the lot stays on the
 * board for a retry once space frees up. Shared by the player's instant
 * click and advanceDay's bot batch loop.
 */
export function resolveBuyoutInstant(
  state: GameState,
  lotId: string,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  const priceYen = computeBuyoutPriceYen(lot, state, context)
  return settleLotPurchase(state, lot, priceYen, 'buyout', (settledYen) => ({
    type: 'lot-bought-out',
    lotId,
    priceYen: settledYen,
    modelId: lot.car.modelId,
    year: lot.car.year,
  }))
}

/**
 * Settles a live auction room's hammer: the room (`packages/game/src/
 * screens/auctionRoom.ts`) negotiates its own price entirely off-sim (the
 * seeded clearing draw, the raise pacing, the reactions), then this is the
 * one pure call that makes a win real - spends `priceYen`, transfers the
 * car, removes the lot, same day. Reuses `resolveBuyoutInstant`'s exact
 * settlement core (`settleLotPurchase`): a room win and an instant buyout
 * are the same purchase, only priced differently. Refuses the same way
 * `resolveBuyoutInstant` does if the lot is gone, cash is short, or the shop
 * is genuinely full. `context` guards against a lot whose model has since
 * dropped out of the loaded catalog (defensive, mirrors `anchorValueYen`'s
 * own guard) rather than pricing anything itself - the room already priced
 * the hammer.
 */
export function settleAuctionHammer(
  state: GameState,
  lotId: string,
  priceYen: number,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  if (!context.modelsById[lot.modelId]) return { state, log: [] }
  return settleLotPurchase(state, lot, priceYen, 'auction-win', (settledYen) => ({
    type: 'auction-hammer-won',
    lotId,
    priceYen: settledYen,
    modelId: lot.car.modelId,
    year: lot.car.year,
  }))
}

/**
 * Settles a live room's hammer to a RIVAL dealer: the lot leaves the board
 * with no cash or car movement on the player's side - a room loss carries no
 * economic effect beyond the lot's absence. Mirrors the plain removal
 * `settleLotPurchase` performs on a win, without a purchase to go with it. No
 * day-log entry: the room's own log already narrates the loss, and there is
 * no new information for the day report to add. A missing lot is a quiet
 * no-op, matching every other resolver in this file.
 */
export function settleAuctionLotLost(state: GameState, lotId: string): GameState {
  if (!state.activeAuctionLots.some((l) => l.id === lotId)) return state
  return {
    ...state,
    activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== lotId),
  }
}

export type AttendAuctionGateReason = 'no-cash'

/**
 * Whether attending a live room at `tier` right now is blocked - `null` when
 * it is not. A zero fee, or a tier already paid today, is never blocked; the
 * only real reason is short cash for a fee that is both nonzero and unpaid.
 */
export function attendAuctionGateReason(
  state: GameState,
  tier: AuctionTier,
  context: SimContext,
): AttendAuctionGateReason | null {
  const feeYen = context.economy.auctionRoom.attendanceFeeYenByTier[tier]
  if (feeYen <= 0) return null
  if (state.attendanceFeePaidDayByTier?.[tier] === state.day) return null
  return state.cashYen < feeYen ? 'no-cash' : null
}

export interface AttendAuctionResult {
  state: GameState
  log: DayLogEntry[]
  outcome: 'attended' | AttendAuctionGateReason
}

/**
 * The room-entry seam: charges `tier`'s admission the first time a room
 * seats there on a given day. A zero fee (`attendanceFeeYenByTier[tier]`) is
 * a silent no-op - no charge, no state recorded - and a tier already paid
 * today is likewise a no-op success, so a second sitting the same day never
 * charges twice. Short cash refuses via `attendAuctionGateReason`, same
 * quiet-refusal shape as every other instant resolver in this file. Buyout
 * never calls this - the desk, not the room.
 */
export function resolveAttendAuction(
  state: GameState,
  tier: AuctionTier,
  context: SimContext,
): AttendAuctionResult {
  const feeYen = context.economy.auctionRoom.attendanceFeeYenByTier[tier]
  if (feeYen <= 0) return { state, log: [], outcome: 'attended' }
  if (state.attendanceFeePaidDayByTier?.[tier] === state.day) {
    return { state, log: [], outcome: 'attended' }
  }
  const gateReason = attendAuctionGateReason(state, tier, context)
  if (gateReason) return { state, log: [], outcome: gateReason }
  const nextState: GameState = {
    ...state,
    cashYen: state.cashYen - feeYen,
    attendanceFeePaidDayByTier: { ...state.attendanceFeePaidDayByTier, [tier]: state.day },
  }
  return { state: nextState, log: [], outcome: 'attended' }
}
