import type {
  AuctionLot,
  Buyer,
  CarModel,
  DayLogEntry,
  EconomyConfig,
  GameState,
  TurnoutBand,
} from '@midnight-garage/content'
import { currentGameYear } from './calendar'
import type { SimContext } from './context'
import { assignToParking, hasParkingSpace } from './facilities'
import { marketValueYen } from './marketValue'
import { bellNormal, createRng, hashStringToSeed } from './rng'

export type { TurnoutBand }

/**
 * Buyer archetypes with a genuinely stated interest in a model's tier - the
 * gate (Sprint 10). No entry for a tier means that archetype never bids on
 * it; there is no default fallback (that fallback was the original "every
 * buyer wants every car" bug). Exported (Sprint 11) so `selling.ts` can
 * apply the identical gate to walk-in/listing buyers - the same rule was
 * missing on the sell side, not a different rule.
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
 * The single value anchor (Sprint 20, auction rework II; body swapped
 * Sprint 21). Every other money number in this file (`privateValuationYen`,
 * `computeBuyoutPriceYen`, `reserveYen`) calls this ONE function, never
 * `marketValueYen` directly - that isolation is what let Sprint 21 re-anchor
 * every auction-money number at once by swapping one function's body.
 *
 * Sprint 21 decision 7: dealers buy at wholesale off the taste-free market
 * value (`marketValueYen`, the rolled lot car's condition/parts/heat, no
 * buyer stat-fit) - taste belongs to end customers, not the trade. The
 * `interestedBuyers` tier gate stays (reuse table: "still gates ... auction
 * participation") as a precondition, not a value input: it still answers
 * "does ANY dealer archetype care about this tier at all", returning 0 when
 * nobody does (the demand ceiling then sits below any reserve, so the lot
 * simply never opens on its own) - but no longer selects *which* buyer's
 * valuation to use, since `marketValueYen` doesn't take a buyer.
 *
 * Sprint 26 decision 4: drops the deleted `(1 - modelRiskDiscount)` term -
 * the hidden-issue system it discounted for is paused and removed; the
 * anchor is `marketValueYen` alone now, unadjusted.
 */
export function anchorValueYen(lot: AuctionLot, state: GameState, context: SimContext): number {
  const model = context.modelsById[lot.modelId]
  if (!model) return 0
  const interested = interestedBuyers(model, context.buyers)
  if (interested.length === 0) return 0
  const heatPercent = state.marketHeat[lot.modelId] ?? 100
  return marketValueYen(
    model,
    lot.car,
    heatPercent,
    currentGameYear(state.reputationTier),
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
}

/**
 * Seller's floor under a deal (GDD 6.5): a fraction of the lot's GUIDE VALUE.
 * Bidding opens here; a lot no rival cohort ever clears this on simply never
 * opens on its own (nobody came for it) - it can still be bought out, or bid
 * on directly by the player.
 *
 * Sprint 27 (Sprint 30 decision 2 pulled forward) rebased this off
 * `anchorValueYen` (= `marketValueYen` = the new restoration-bill
 * `instanceValue`), replacing the old `bookValueYen` basis. Once car value
 * dropped to reflect a worn car's restoration bill, a static book-value
 * reserve sat *above* most worn cars' actual guide value, so no lot could
 * clear and the whole auction market seized (balance harness: acquisitions
 * -95%, Flipper down to the do-nothing baseline). Coupling the reserve to the
 * same value everything else prices from (the auction anchor, buyout, walk-in
 * offers, bot bid caps) fixes that by construction: the reserve now moves with
 * this specific worn car, not with a static per-model constant. `state`/
 * `context` are threaded through purely to reach `anchorValueYen`, exactly
 * like `computeBuyoutPriceYen`/`privateValuationYen` already do.
 */
export function reserveYen(lot: AuctionLot, state: GameState, context: SimContext): number {
  return Math.round(
    anchorValueYen(lot, state, context) * context.economy.AUCTION_RESERVE_PRICE_FRACTION,
  )
}

/**
 * A private rival valuation of this lot (Sprint 27 decision 4, generalized
 * Sprint 30 decision 3): bell-shaped around `anchorValueYen * multiplier`,
 * seeded so it's a fixed, reproducible read for a given `(lot, cohortId)`
 * pair, not a per-day reroll - every bidder reads the same transparent
 * bands, but no two private valuations of the same car land exactly on the
 * shared anchor. `cohortId` distinguishes independent bidders pricing the
 * SAME lot: a bot's own single walk-away decision
 * (`bots/buyoutHelpers.ts`'s `walkAwayTargetYen`) defaults to the empty
 * string, preserving its pre-Sprint-30 seed exactly; the overnight
 * bidder-interest process below seeds one distinct value per rival cohort,
 * with its own (turnout-dependent) `spreadSD` override - see
 * `economy.auctionInterest.cohortValuationSpreadByTurnout`'s own doc comment
 * for why a rival dealer cohort's spread is turnout-dependent and (mostly)
 * wider than a bot's own tight `walkAwaySpread`.
 */
export function privateValuationYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  multiplier: number,
  cohortId = '',
  spreadSD = context.economy.valuation.walkAwaySpread,
): number {
  const anchor = anchorValueYen(lot, state, context)
  const rng = createRng(hashStringToSeed(`walk-away:${lot.id}${cohortId}`))
  const spreadMultiplier = bellNormal(1, spreadSD, rng)
  return Math.round(anchor * multiplier * spreadMultiplier)
}

/**
 * How many rival cohorts a lot's rolled `TurnoutBand` (`auctions.ts`'s
 * `generateAuctionCatalog`, persisted on the lot) represents (Sprint 30
 * decision 3) - an integer rolled once from
 * `economy.auctionInterest.turnoutBidderCounts[lot.turnout]`, seeded on the
 * lot id alone so it's stable for the lot's whole life, matching
 * `privateValuationYen`'s own "fixed per lot, not a daily reroll" contract.
 */
export function turnoutBidderCount(lot: AuctionLot, economy: EconomyConfig): number {
  const [min, max] = economy.auctionInterest.turnoutBidderCounts[lot.turnout]
  const rng = createRng(hashStringToSeed(`turnout-count:${lot.id}`))
  return rng.int(min, max)
}

/**
 * How much a lot's current price (relative to its guide value) sharpens or
 * dulls a rival cohort's nightly eagerness to bid (Sprint 30 decision 3):
 * `1 + valueGapEagerBonus * (1 - currentBid/guideValue)`, clamped to
 * `[valueGapFloor, valueGapCeiling]`. An unopened or cheap lot (price well
 * under guide value) multiplies UP toward the ceiling; a lot already at or
 * above guide value multiplies DOWN toward the floor, but never to zero -
 * a cohort still eligible (its own private walk-away hasn't been cleared)
 * can always still show up, just less often.
 */
function valueGapFactor(
  currentBidYen: number,
  guideValueYen: number,
  economy: EconomyConfig,
): number {
  if (guideValueYen <= 0) return 0
  const { valueGapEagerBonus, valueGapFloor, valueGapCeiling } = economy.auctionInterest
  const priceRatio = currentBidYen / guideValueYen
  const raw = 1 + valueGapEagerBonus * (1 - priceRatio)
  return Math.max(valueGapFloor, Math.min(valueGapCeiling, raw))
}

/**
 * The bid ladder (Sprint 20): `max(Y10,000, 5% of book rounded to the
 * nearest Y10,000)` - one increment size for the player, the dealers, and
 * every bidding bot alike. Fixed off the lot's own book value, not the
 * current bid, so the ladder doesn't compress as a lot's price climbs.
 */
export function bidIncrementYen(lot: AuctionLot, economy: EconomyConfig): number {
  const raw = lot.bookValueYen * economy.AUCTION_BID_INCREMENT_FRACTION
  const roundedTo10k = Math.round(raw / 10_000) * 10_000
  return Math.max(10_000, roundedTo10k)
}

/**
 * The smallest valid raise right now: the reserve price if bidding hasn't
 * opened yet, otherwise one increment above the current board price.
 * Exported so bots (the war helper, `bots/buyoutHelpers.ts`) and the game
 * UI (the raise control, pre-filled to this) share the exact same ladder
 * math `resolvePlaceBid` itself validates against, rather than each
 * re-deriving reserve-or-increment logic independently.
 *
 * Sprint 27: takes `state`/`context` (was `economy`) so the reserve branch
 * can reach the new guide-value-based `reserveYen`. The increment branch is
 * unchanged - `bidIncrementYen` is still a fixed fraction of book value (a
 * ladder step, not a value floor), so it doesn't move with condition.
 */
export function nextRaiseYen(lot: AuctionLot, state: GameState, context: SimContext): number {
  if (lot.currentBidYen === 0) return reserveYen(lot, state, context)
  return lot.currentBidYen + bidIncrementYen(lot, context.economy)
}

/**
 * The real, chargeable instant-buyout price (Sprint 20): `max(anchorValueYen
 * * AUCTION_BUYOUT_PREMIUM, currentBidYen + one increment)` - the same
 * exported anchor every rival cohort's private valuation centers on, floored
 * above whatever's currently on the board so a buyout always ends the
 * auction outright, never undercuts it (maintainer decision 2: buyout is
 * available on every lot, priced rather than forbidden - with wholesale
 * clearing around 0.6-0.8x value and buyout at ~1.25x value, it's always
 * available and almost never rational).
 */
export function computeBuyoutPriceYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
): number {
  const anchor = anchorValueYen(lot, state, context)
  const anchoredFloor = Math.round(anchor * context.economy.AUCTION_BUYOUT_PREMIUM)
  const bidFloor = lot.currentBidYen + bidIncrementYen(lot, context.economy)
  return Math.max(anchoredFloor, bidFloor)
}

export interface OvernightStepResult {
  lot: AuctionLot
  log: DayLogEntry[]
}

/**
 * How many of a lot's rolled rival cohorts (`bidderCount`, from
 * `turnoutBidderCount`) still have room to place `atOrAboveYen` - i.e. their
 * own private valuation (`privateValuationYen`, seeded
 * `${lot.id}:cohort:${i}`, wholesale-centered per `AUCTION_WHOLESALE_FRACTION`)
 * is at least that much. A cohort whose private ceiling has already been
 * cleared by the current price has walked away for good - `privateValuationYen`
 * is seeded on the lot alone, so this is a stable, monotonically-shrinking
 * pool as the price climbs, never a daily reroll.
 */
function eligibleCohortCount(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  atOrAboveYen: number,
  bidderCount: number,
): number {
  const spreadSD = context.economy.auctionInterest.cohortValuationSpreadByTurnout[lot.turnout]
  let eligible = 0
  for (let i = 0; i < bidderCount; i++) {
    const cohortWalkAwayYen = privateValuationYen(
      lot,
      state,
      context,
      context.economy.AUCTION_WHOLESALE_FRACTION,
      `:cohort:${i}`,
      spreadSD,
    )
    if (cohortWalkAwayYen >= atOrAboveYen) eligible++
  }
  return eligible
}

/**
 * The competing pressure behind tonight's bid roll (behavioral proof (c)):
 * `eligible^2 / bidderCount`, not the raw `eligible` count. A THIN lot's
 * sole cohort (`bidderCount` 1-2) IS its whole field - `eligible` stays
 * equal to `bidderCount` right up until that lone cohort's own true ceiling,
 * so it keeps trying reliably all the way there, occasionally a genuinely
 * high private valuation. A PACKED lot's last straggler (`eligible` 1 out of
 * a `bidderCount` of 5-7) is a shrunken remnant of a crowd that mostly
 * already dropped out - the crowd's own exit is the signal the price has
 * left "what most dealers think this is worth," so that lone survivor's
 * pressure is damped toward zero rather than treated as a full cohort. The
 * net effect: a packed field's winning price clusters near its own
 * wholesale-centered crowd, rarely reaching a single outlier's tail value;
 * a thin field's winning price IS that outlier's value, tail and all.
 */
function competitivePressure(eligible: number, bidderCount: number): number {
  return bidderCount > 0 ? (eligible * eligible) / bidderCount : 0
}

/**
 * One lot's overnight step (Sprint 20 - the core new daily mechanic; Sprint
 * 30 decision 3 replaces the one-shot demand ceiling with this daily
 * bidder-interest process). Seeded on `lot.id:day` so each day's roll is
 * independent but fully reproducible. Applies up to
 * `auctionInterest.maxIncrementsPerNight` (2) raises in a loop, each one
 * gated the same way:
 *
 * - `nextRaiseYen` (reserve to open, one increment above the board
 *   otherwise) is the price a raise tonight would land at.
 * - `eligibleCohortCount` counts how many of the lot's rolled rival cohorts
 *   would still pay at least that much - zero means nobody's left who wants
 *   it at this price, so the loop (and the night) stops here.
 * - Otherwise, `1 - (1 - p)^competitivePressure` is the odds AT LEAST ONE
 *   of those cohorts actually bids tonight, where `p` is `auctionInterest
 *   .perCohortBidChance[tier]` scaled by `valueGapFactor` (cheap-relative-
 *   to-guide-value lots are more eagerly contested) and `competitivePressure`
 *   (below) weights the raw eligible count by how much of the lot's ORIGINAL
 *   field is still in play. A packed lot (many eligible cohorts, most of its
 *   field still active) makes this near-certain while the lot is genuinely
 *   underpriced; a thin lot (as few as one cohort, but that IS its whole
 *   field) can go quiet for real stretches even when technically still "in
 *   play," but persists reliably once it's the only game in town.
 * - A successful roll applies exactly that one raise and loops again (a
 *   second increment needs its own independent roll, capped by
 *   `maxIncrementsPerNight`); a failed roll stops the night, silent, at
 *   whatever's been raised so far (0 or more).
 *
 * The "you were outbid overnight" beat (`auction-outbid`) fires once if any
 * raise this step displaced the player as leader. Silence (zero increments
 * applied) increments `quietDays`; any real raise resets it to 0 -
 * `AUCTION_QUIET_DAYS_TO_HAMMER` consecutive silent steps is what "going
 * once, going twice" means mechanically.
 */
export function advanceLotOvernight(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  day: number,
): OvernightStepResult {
  const economy = context.economy
  const guideValueYen = anchorValueYen(lot, state, context)
  if (guideValueYen <= 0) {
    return { lot: { ...lot, quietDays: lot.quietDays + 1 }, log: [] } // nobody's interested in this tier at all
  }

  const rng = createRng(hashStringToSeed(`${lot.id}:${day}`))
  const bidderCount = turnoutBidderCount(lot, economy)
  let workingLot = lot
  let displacedPlayer = false
  let incrementsApplied = 0

  while (incrementsApplied < economy.auctionInterest.maxIncrementsPerNight) {
    const raiseToYen = nextRaiseYen(workingLot, state, context)
    if (raiseToYen <= 0) break // no seller floor (shouldn't happen once guideValueYen > 0, kept defensive)

    const eligible = eligibleCohortCount(workingLot, state, context, raiseToYen, bidderCount)
    if (eligible === 0) break // nobody left who'd still pay this much tonight

    const perCohortChance =
      economy.auctionInterest.perCohortBidChance[lot.tier] *
      valueGapFactor(workingLot.currentBidYen, guideValueYen, economy)
    const clampedChance = Math.max(0, Math.min(1, perCohortChance))
    const probabilityOfAnyBid =
      1 - Math.pow(1 - clampedChance, competitivePressure(eligible, bidderCount))
    if (rng.next() >= probabilityOfAnyBid) break // nobody actually stepped up tonight

    if (workingLot.leadingBidder === 'player') displacedPlayer = true
    workingLot = { ...workingLot, currentBidYen: raiseToYen, leadingBidder: 'rival', quietDays: 0 }
    incrementsApplied++
  }

  if (incrementsApplied === 0) {
    return { lot: { ...lot, quietDays: lot.quietDays + 1 }, log: [] }
  }
  return {
    lot: workingLot,
    log: displacedPlayer
      ? [{ type: 'auction-outbid', lotId: lot.id, newBidYen: workingLot.currentBidYen }]
      : [],
  }
}

export interface AcquisitionResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Places or raises a bid (Sprint 20 - open-raise semantics replace sealed
 * proxy bidding): the amount passed is the literal number that lands on the
 * board, not a hidden max. Must clear `minRaiseYen` (reserve to open an
 * unopened lot, one increment above the current board price otherwise) -
 * anything less is a no-op, same as before. Sets `leadingBidder: 'player'`,
 * `playerHasBid: true` (never reset once true), and resets `quietDays` to 0
 * - a player raise is exactly as much a "real raise" as a dealer's for
 * activity-based closing purposes. Shared by the player's instant click and
 * advanceDay's bot batch loop.
 */
export function resolvePlaceBid(
  state: GameState,
  lotId: string,
  bidYen: number,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot || bidYen <= 0) return { state, log: [] }
  if (bidYen < nextRaiseYen(lot, state, context)) return { state, log: [] }

  const updatedLot: AuctionLot = {
    ...lot,
    currentBidYen: bidYen,
    leadingBidder: 'player',
    quietDays: 0,
    playerHasBid: true,
  }
  return {
    state: {
      ...state,
      activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lotId ? updatedLot : l)),
    },
    log: [{ type: 'auction-bid-placed', lotId, maxBidYen: bidYen }],
  }
}

/**
 * Resolves one lot for today (Sprint 20 - replaces `resolveDueAuctionLot`):
 * runs the overnight step, then hammers it - `quietDays >=
 * AUCTION_QUIET_DAYS_TO_HAMMER`, or `day >= expiresOnDay` (the duration-roll
 * backstop, preserving flash/standard/long velocity variation) - if either
 * condition is now met, otherwise the lot simply stays active with its
 * updated board state. Called once per still-active lot from `advanceDay`'s
 * day-boundary step, every day, not just on some fixed "due day" - activity-
 * based closing means there's no schedule to filter on anymore.
 *
 * At the hammer: no leader resolves silently (kept behavior, matching the
 * old "expired unsold" case); a dealer win logs the loss only when
 * `playerHasBid` (today's only-log-if-the-player-had-skin rule); a player
 * win runs the existing no-cash/no-parking forfeit checks (decision 7: no
 * escrow, cash and parking are only checked now) before the handover.
 */
export function resolveLotForDay(
  state: GameState,
  lot: AuctionLot,
  context: SimContext,
  day: number,
): AcquisitionResult {
  const step = advanceLotOvernight(lot, state, context, day)
  const updatedLot = step.lot
  const log: DayLogEntry[] = [...step.log]

  const shouldHammer =
    updatedLot.quietDays >= context.economy.AUCTION_QUIET_DAYS_TO_HAMMER ||
    day >= updatedLot.expiresOnDay

  const removeLot = (s: GameState): GameState => ({
    ...s,
    activeAuctionLots: s.activeAuctionLots.filter((l) => l.id !== lot.id),
  })

  if (!shouldHammer) {
    return {
      state: {
        ...state,
        activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lot.id ? updatedLot : l)),
      },
      log,
    }
  }

  if (updatedLot.leadingBidder === null) {
    return { state: removeLot(state), log } // nobody ever bid - silent no-sale
  }

  if (updatedLot.leadingBidder === 'rival') {
    if (updatedLot.playerHasBid) {
      log.push({
        type: 'auction-bid-lost',
        lotId: lot.id,
        winningPriceYen: updatedLot.currentBidYen,
      })
    }
    return { state: removeLot(state), log }
  }

  // The player leads - wins at currentBidYen, the literal board number
  // (first-price). No escrow: cash and parking are only checked now.
  if (!hasParkingSpace(state)) {
    log.push(
      { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-parking' },
      { type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: updatedLot.currentBidYen },
    )
    return { state: removeLot(state), log }
  }
  if (state.cashYen < updatedLot.currentBidYen) {
    log.push(
      { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-cash' },
      { type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: updatedLot.currentBidYen },
    )
    return { state: removeLot(state), log }
  }

  const withCar = assignToParking(
    {
      ...removeLot(state),
      cashYen: state.cashYen - updatedLot.currentBidYen,
      ownedCars: [...state.ownedCars, updatedLot.car],
    },
    updatedLot.car.id,
  )
  log.push({ type: 'auction-bid-won', lotId: lot.id, finalPriceYen: updatedLot.currentBidYen })
  return { state: withCar, log }
}

/**
 * The instant buyout resolver (Sprint 11; re-priced Sprint 20): a guaranteed
 * purchase at `computeBuyoutPriceYen`, no rival contest - a full garage just
 * means the purchase doesn't happen right now (no money spent), the lot
 * stays on the board for a retry once space frees up. Shared by the
 * player's instant click and advanceDay's bot batch loop.
 */
export function resolveBuyoutInstant(
  state: GameState,
  lotId: string,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  const priceYen = computeBuyoutPriceYen(lot, state, context)
  if (state.cashYen < priceYen) return { state, log: [] }
  if (!hasParkingSpace(state)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' }],
    }
  }

  const withCar = assignToParking(
    {
      ...state,
      cashYen: state.cashYen - priceYen,
      ownedCars: [...state.ownedCars, lot.car],
      activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== lotId),
    },
    lot.car.id,
  )
  return {
    state: withCar,
    log: [{ type: 'lot-bought-out', lotId, priceYen }],
  }
}
