import {
  ALL_CAR_PART_IDS,
  type Buyer,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type DayLogEntry,
  type EconomyConfig,
  type ForSaleEntry,
  type GameState,
  type Part,
  type PendingSaleOffer,
  type SellingChannelId,
} from '@midnight-garage/content'
import { interestedBuyers } from './bidding'
import { applyReputationDelta } from './calendar'
import { carLedgerFor, deleteCarLedger } from './carLedger'
import { saleQualityFor, saleReputationDeltaFor } from './carCondition'
import type { SimContext } from './context'
import { saleRevealLineFor } from './diagnosis'
import { releaseCarFromShop } from './facilities'
import { marketValueYen } from './marketValue'
import { bumpPlayerSales } from './marketHeat'
import type { Rng } from './rng'
import { dissolveAssembliesForCar } from './assemblies'
import { clearStagedWork } from './stagedWork'
import { channelBuyerTaste, valuateCarForBuyer, valuateCarForBuyerViaChannel } from './valuation'

/**
 * The trade network's own "buyer" - a fax to the dealer circle, never a
 * named persona (`sellingChannels.tradeNetwork` has no taste roll and no
 * `buyerPoolWeights`). Not a real `Buyer.id`, so a matched-sale lookup
 * against `context.buyers` naturally finds nobody and never fires the
 * matched bonus for this channel - the trade pays wholesale, not word of
 * mouth.
 */
const TRADE_NETWORK_BUYER_ID = 'trade-network'

export interface SaleOffer {
  buyerId: string
  priceYen: number
}

/**
 * The candidate buyer pool for a sale - only archetypes with a genuinely
 * stated interest in the car's tier. Reuses the exact gate `bidding.ts`
 * already applies to auction rivals - the same rule, not a different one.
 */
function saleCandidates(model: CarModel, buyers: readonly Buyer[]): Buyer[] {
  return interestedBuyers(model, buyers).map((i) => i.buyer)
}

/**
 * Weighted by fit, not uniformly random: a buyer who actually wants this
 * car is more likely to be the one who walks in - "someone happens by," not
 * "a stranger is offered a car they don't care about." Shared by
 * `sellViaWalkIn` below and every listing-channel draw
 * (`drawDailyOffers`/selling.ts) - one picking mechanism, channels only
 * change what happens to the pick afterward. Returns `undefined` when no
 * buyer archetype is interested in this tier at all.
 */
function pickWeightedCandidate(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  rng: Rng,
): { buyer: Buyer; value: number } | undefined {
  const candidates = saleCandidates(model, buyers)
  const valuations = candidates.map((buyer) => ({
    buyer,
    value: valuateCarForBuyer(
      buyer,
      model,
      car,
      partsById,
      partsTaxonomy,
      partsTaxonomyById,
      heatPercent,
      economy,
    ),
  }))

  let picked = valuations[0]
  const totalValue = valuations.reduce((sum, v) => sum + v.value, 0)
  if (totalValue > 0) {
    let roll = rng.next() * totalValue
    for (const v of valuations) {
      roll -= v.value
      if (roll <= 0) {
        picked = v
        break
      }
    }
  } else if (valuations.length > 0) {
    picked = valuations[rng.int(0, valuations.length - 1)]
  }
  return picked
}

/**
 * GDD 6.3: "fast, variable" - a buyer archetype rolls up the same day,
 * offering somewhat under (or, occasionally, a little over) their true
 * valuation for the convenience of an instant sale.
 *
 * This is the core roll the harness/tests use directly - the spread itself
 * lives in `economy.selling.offerSpread` (the content law: designer-tunable
 * numbers live in JSON). The daily offer-draw step (`drawDailyOffers`) does
 * not call this directly - each listing channel prices its own draw - but
 * this remains the plain, un-channelled walk-in computation.
 */
export function sellViaWalkIn(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  rng: Rng,
): SaleOffer {
  const picked = pickWeightedCandidate(
    car,
    model,
    buyers,
    partsById,
    partsTaxonomy,
    partsTaxonomyById,
    heatPercent,
    economy,
    rng,
  )
  if (!picked) {
    throw new RangeError(`sellViaWalkIn: no buyer archetype is interested in tier "${model.tier}"`)
  }

  const [min, max] = economy.selling.offerSpread
  const priceYen = Math.round(picked.value * (min + rng.next() * (max - min)))
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * The best-fit buyer for a car - flavor/estimate purposes (the for-sale
 * toggle's ballpark preview, a bot's accept-threshold reference value).
 */
export function bestFitBuyer(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
): Buyer | undefined {
  let best: { buyer: Buyer; value: number } | undefined
  for (const buyer of saleCandidates(model, buyers)) {
    const value = valuateCarForBuyer(
      buyer,
      model,
      car,
      partsById,
      partsTaxonomy,
      partsTaxonomyById,
      heatPercent,
      economy,
    )
    if (!best || value > best.value) {
      best = { buyer, value }
    }
  }
  return best?.buyer
}

/**
 * Cold/normal/hot bucketing of today's market heat - feeds
 * `offerChanceFor`'s heat multiplier below. Three flat bands, not a
 * continuous curve, mirroring the auction turnout-band style: simple
 * enough to eyeball-tune directly in economy.json.
 */
function heatBandFor(heatPercent: number, economy: EconomyConfig): 'cold' | 'normal' | 'hot' {
  const { heatBandColdBelowPercent, heatBandHotAtOrAbovePercent } = economy.selling
  if (heatPercent < heatBandColdBelowPercent) return 'cold'
  if (heatPercent >= heatBandHotAtOrAbovePercent) return 'hot'
  return 'normal'
}

/**
 * Today's chance a for-sale car draws an offer at all: base x this
 * model's rarity-tier desirability x today's heat-band multiplier,
 * clamped to [0, 1]. Independent of `saleCandidates` (whether ANY buyer
 * archetype is even a plausible fit for this tier) - that gate still runs
 * inside `sellViaWalkIn` itself, so a tier nobody wants never produces a
 * live offer even when this chance rolls true.
 */
export function offerChanceFor(
  model: CarModel,
  heatPercent: number,
  economy: EconomyConfig,
): number {
  const { offerChanceBase, offerChanceByTier, offerChanceByHeatBand } = economy.selling
  const band = heatBandFor(heatPercent, economy)
  const chance = offerChanceBase * offerChanceByTier[model.tier] * offerChanceByHeatBand[band]
  return Math.max(0, Math.min(1, chance))
}

export interface SetForSaleResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Toggle a car's "taking offers" flag, and (while turning on) which channel
 * to list it on - free to unlist, but listing on a channel charges that
 * channel's `feeYen` immediately (`shopFront`/`tradeNetwork` are 0).
 * Marking a car for sale doesn't sell it or resolve anything by itself, it
 * just makes the car eligible for the daily offer draw (`drawDailyOffers`)
 * below. Turning it off drops the toggle and any live offer on the car -
 * there's nothing else to reconcile, since an offer only ever lives one day
 * anyway. A no-op for a car not owned.
 *
 * Re-listing on a DIFFERENT channel pays that channel's fee again. Re-listing
 * on the SAME channel is an idempotent no-op, except `weekendMeet`: that
 * channel's one guaranteed draw is spent the moment it resolves
 * (`weekendMeetPending`), so listing on it again - even unchanged - is the
 * "attend again" flow and re-charges the fee for one more draw. Insufficient
 * cash refuses quietly (no log entry), the same silent gate-reason idiom
 * every other cash-gated resolver in this codebase uses.
 */
export function resolveSetForSale(
  state: GameState,
  carInstanceId: string,
  forSale: boolean,
  context: SimContext,
  channelId: SellingChannelId = 'shopFront',
): SetForSaleResult {
  const owned = state.ownedCars.some((c) => c.id === carInstanceId)
  if (!owned) return { state, log: [] }
  const existing = state.carsForSale.find((f) => f.carInstanceId === carInstanceId)

  if (!forSale) {
    if (!existing) return { state, log: [] }
    return {
      state: {
        ...state,
        carsForSale: state.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
        pendingOffers: state.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
      },
      log: [],
    }
  }

  if (existing && existing.channelId === channelId && channelId !== 'weekendMeet') {
    return { state, log: [] }
  }

  const feeYen = context.economy.sellingChannels[channelId].feeYen
  if (state.cashYen < feeYen) return { state, log: [] }

  const entry: ForSaleEntry = {
    carInstanceId,
    sinceDay: state.day,
    channelId,
    weekendMeetPending: channelId === 'weekendMeet',
  }
  return {
    state: {
      ...state,
      cashYen: state.cashYen - feeYen,
      carsForSale: [...state.carsForSale.filter((f) => f.carInstanceId !== carInstanceId), entry],
    },
    log: [],
  }
}

/**
 * Turn an offer down explicitly.
 *
 * Drops just that car's pending offer and leaves `carsForSale` alone, so
 * the car stays on the market and tomorrow's `drawDailyOffers` can bring a
 * better one. The removal itself is the same one `resolveSetForSale`'s
 * un-list branch already performs, scoped to the offer instead of the
 * listing.
 *
 * Deliberately no reputation cost: turning down a lowball is a
 * negotiation, not a slight. A no-op (unknown car, no live offer) returns
 * the state untouched with an empty log, like every other resolver here.
 */
export function resolveRejectOffer(state: GameState, carInstanceId: string): SetForSaleResult {
  const offer = state.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
  if (!offer) return { state, log: [] }
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  return {
    state: {
      ...state,
      pendingOffers: state.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
    },
    log: [
      {
        type: 'offer-rejected',
        carInstanceId,
        modelId: car.modelId,
        buyerId: offer.buyerId,
        priceYen: offer.priceYen,
      },
    ],
  }
}

export interface DailyOfferDrawResult {
  state: GameState
  log: DayLogEntry[]
}

/** `chance`, clamped into a real [0, 1] probability - every channel's own
 * offer-chance factor multiplies `offerChanceFor`'s base and needs the same
 * clamp that function already applies to its own result. */
function clampedChance(chance: number): number {
  return Math.max(0, Math.min(1, chance))
}

/**
 * shopFront/freeAdsPaper: the same weighted persona pick `sellViaWalkIn`
 * uses, priced through the channel's own taste band (`channelBuyerTaste` -
 * clamped at `tasteCeiling` for these two channels, never a mismatch gate).
 * The wrong crowd for a channel simply never pays above its ceiling; there is
 * no separate no-show roll.
 */
function drawClampedChannelOffer(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  heatPercent: number,
  tasteCeiling: number,
  rng: Rng,
): SaleOffer | undefined {
  const picked = pickWeightedCandidate(
    car,
    model,
    context.buyers,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    rng,
  )
  if (!picked) return undefined
  const value = valuateCarForBuyerViaChannel(
    picked.buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    tasteCeiling,
  )
  const [min, max] = context.economy.selling.offerSpread
  const priceYen = Math.round(value * (min + rng.next() * (max - min)))
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * tunerMagazine/weekendMeet: draw the persona first (the same weighted
 * pick), then check MATCHED - the picked persona's channel taste (extended
 * up to `tasteCeiling`) is `>= 1.0`, i.e. the car meets that buyer's visible
 * want - before pricing anything. A mismatch draws no offer at all: the ad
 * (or the meet) simply drew nobody today, never a hidden penalty.
 */
function drawMatchedChannelOffer(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  heatPercent: number,
  tasteCeiling: number,
  rng: Rng,
): SaleOffer | undefined {
  const picked = pickWeightedCandidate(
    car,
    model,
    context.buyers,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    rng,
  )
  if (!picked) return undefined
  const taste = channelBuyerTaste(
    picked.buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.economy,
    tasteCeiling,
  )
  if (taste < 1) return undefined

  const value = valuateCarForBuyerViaChannel(
    picked.buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    tasteCeiling,
  )
  const [min, max] = context.economy.selling.offerSpread
  const priceYen = Math.round(value * (min + rng.next() * (max - min)))
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * tradeNetwork: no persona, no taste roll - the offer is priceBand-uniform
 * around plain `marketValueYen`, the buyer presented as the trade network
 * itself (`TRADE_NETWORK_BUYER_ID`).
 */
function drawTradeNetworkOffer(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  heatPercent: number,
  priceBand: { min: number; max: number },
  rng: Rng,
): SaleOffer {
  const value = marketValueYen(
    model,
    car,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const { min, max } = priceBand
  const priceYen = Math.round(value * (min + rng.next() * (max - min)))
  return { buyerId: TRADE_NETWORK_BUYER_ID, priceYen }
}

interface ChannelDraw {
  offer?: SaleOffer
  /** Present only for `weekendMeet` - whether its one-shot flag is still
   * owed after this draw. Always `false` the moment a draw runs, hit or
   * miss (the meet is spent either way). */
  weekendMeetPending?: boolean
}

/**
 * One listed car's channel-aware offer draw for today - dispatches on the
 * listing's own `channelId` (the five listing channels). Each channel's own
 * cadence/taste/pricing lives in its own small function above; this is only
 * the switch between them, plus each channel's own offer-chance roll
 * (`weekendMeet` has none - it is a guaranteed single draw instead, gated on
 * `weekendMeetPending`).
 */
function drawOfferForChannel(
  car: CarInstance,
  model: CarModel,
  entry: ForSaleEntry,
  context: SimContext,
  heatPercent: number,
  rng: Rng,
): ChannelDraw {
  const channel = context.economy.sellingChannels[entry.channelId]
  const baseChance = offerChanceFor(model, heatPercent, context.economy)

  switch (entry.channelId) {
    case 'shopFront': {
      if (rng.next() >= clampedChance(baseChance * channel.offerChanceFactor!)) return {}
      return {
        offer: drawClampedChannelOffer(
          car,
          model,
          context,
          heatPercent,
          channel.tasteCeiling!,
          rng,
        ),
      }
    }
    case 'freeAdsPaper': {
      const factor = channel.offerChanceFactorByTierClass![model.tier]
      if (rng.next() >= clampedChance(baseChance * factor)) return {}
      return {
        offer: drawClampedChannelOffer(
          car,
          model,
          context,
          heatPercent,
          channel.tasteCeiling!,
          rng,
        ),
      }
    }
    case 'tunerMagazine': {
      if (rng.next() >= clampedChance(baseChance * channel.offerChanceFactor!)) return {}
      return {
        offer: drawMatchedChannelOffer(
          car,
          model,
          context,
          heatPercent,
          channel.tasteCeiling!,
          rng,
        ),
      }
    }
    case 'tradeNetwork': {
      if (rng.next() >= clampedChance(baseChance * channel.offerChanceFactor!)) return {}
      return {
        offer: drawTradeNetworkOffer(car, model, context, heatPercent, channel.priceBand!, rng),
      }
    }
    case 'weekendMeet': {
      if (!entry.weekendMeetPending) return {}
      return {
        offer: drawMatchedChannelOffer(
          car,
          model,
          context,
          heatPercent,
          channel.tasteCeiling!,
          rng,
        ),
        weekendMeetPending: false,
      }
    }
    default:
      return {}
  }
}

/**
 * The daily offer-draw step, called once per advanceDay tick for the day
 * about to begin: every for-sale, still-owned car draws through its own
 * listing channel (`drawOfferForChannel`); a hit becomes today's live offer
 * on that car. `pendingOffers` is REPLACED wholesale, not accumulated (the
 * no-reflex rule: an offer is valid the day it's drawn for only - see
 * advanceDay.ts's own call-site comment for the full day-cycle reasoning).
 * `carsForSale` entries are pruned to still-owned cars in the same pass, so
 * a sold (or otherwise departed) car's toggle never lingers.
 */
export function drawDailyOffers(
  state: GameState,
  context: SimContext,
  rng: Rng,
): DailyOfferDrawResult {
  const ownedIds = new Set(state.ownedCars.map((c) => c.id))
  const stillListed = state.carsForSale.filter((f) => ownedIds.has(f.carInstanceId))
  const carsForSale: ForSaleEntry[] = []
  const pendingOffers: PendingSaleOffer[] = []
  const log: DayLogEntry[] = []

  for (const entry of stillListed) {
    const car = state.ownedCars.find((c) => c.id === entry.carInstanceId)
    const model = car ? context.modelsById[car.modelId] : undefined
    if (!car || !model) {
      carsForSale.push(entry)
      continue
    }

    const heatPercent = state.marketHeat[car.modelId] ?? 100
    const draw = drawOfferForChannel(car, model, entry, context, heatPercent, rng)
    carsForSale.push(
      draw.weekendMeetPending === undefined
        ? entry
        : { ...entry, weekendMeetPending: draw.weekendMeetPending },
    )
    if (draw.offer) {
      pendingOffers.push({
        carInstanceId: car.id,
        buyerId: draw.offer.buyerId,
        priceYen: draw.offer.priceYen,
      })
      log.push({
        type: 'offer-received',
        carInstanceId: car.id,
        modelId: car.modelId,
        buyerId: draw.offer.buyerId,
        priceYen: draw.offer.priceYen,
      })
    }
  }

  return { state: { ...state, carsForSale, pendingOffers }, log }
}

export interface SaleResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Resolve today's live offer on `carInstanceId`, if one exists - the sale
 * mechanics (reputation, market-heat ledger, staged-work cleanup, event
 * log) are this resolver's plumbing; the PRICE comes from consuming
 * today's pre-rolled `state.pendingOffers` entry (drawn by
 * `drawDailyOffers` at the end of the PREVIOUS day), never a fresh roll on
 * click. A no-op (no offer live today, or the car isn't owned) leaves
 * state untouched, same contract as every other instant resolver in this
 * file. Seeded/random only via the offer already stored in state - this
 * function itself makes no further rolls, so a repeat call is inert once
 * the offer's gone.
 */
export function resolveSellViaWalkIn(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): SaleResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const offer = state.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
  if (!offer) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model) return { state, log: [] }

  // MATCHED (the same definition `drawDailyOffers`' channel draws use): the
  // buyer's taste for this car is >= 1.0. `trade-network` (the trade
  // channel's non-persona buyer) never resolves to a real Buyer, so a trade
  // sale is never matched. The channel's own tasteCeiling decides the band
  // the taste is read through; a channel with no ceiling (tradeNetwork)
  // can't match either.
  const listingChannelId = state.carsForSale.find(
    (f) => f.carInstanceId === carInstanceId,
  )?.channelId
  const buyer = context.buyers.find((b) => b.id === offer.buyerId)
  const tasteCeiling = listingChannelId
    ? context.economy.sellingChannels[listingChannelId].tasteCeiling
    : undefined
  const matched =
    buyer !== undefined && tasteCeiling !== undefined
      ? channelBuyerTaste(
          buyer,
          model,
          car,
          context.partsById,
          context.partsTaxonomy,
          context.economy,
          tasteCeiling,
        ) >= 1
      : false
  const matchedBonus = matched ? context.economy.reputation.matchedSaleRepBonus : 0

  const conditionDelta = saleReputationDeltaFor(
    car,
    model,
    context.partsTaxonomyById,
    context.economy,
  )
  const nominalDelta = conditionDelta + matchedBonus
  const clearedState = dissolveAssembliesForCar(
    clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId),
    carInstanceId,
  )
  const released = applyReputationDelta(clearedState, nominalDelta, context.economy)
  // Log what actually happened, not the nominal delta - `applyReputationDelta`
  // floors `reputationPoints` at 0, so a player at 2 points selling a lemon
  // (nominal -5) only ever loses 2, not 5. The logged number is the real,
  // applied one.
  const appliedDelta = released.reputationPoints - clearedState.reputationPoints

  // Realised profit against the ledger recorded since acquisition - only when
  // the purchase price itself is known.
  const ledger = carLedgerFor(state, carInstanceId)
  const profitYen =
    ledger.purchaseYen === null
      ? undefined
      : offer.priceYen - (ledger.purchaseYen + ledger.repairYen + ledger.partsYen)

  // Computed against the original, pre-sale `state`/`car` - the same snapshot
  // every other figure above reads from, before this sale's own
  // reputation/heat effects apply.
  const saleRevealLine = saleRevealLineFor(car, model, state, context)

  return {
    state: bumpPlayerSales(
      deleteCarLedger(
        {
          ...released,
          cashYen: released.cashYen + offer.priceYen,
          ownedCars: released.ownedCars.filter((c) => c.id !== carInstanceId),
          carsForSale: released.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
          pendingOffers: released.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
        },
        carInstanceId,
      ),
      car.modelId,
    ),
    log: [
      {
        type: 'car-sold',
        carInstanceId,
        channel: 'walk-in-offer',
        priceYen: offer.priceYen,
        ...(profitYen !== undefined ? { profitYen } : {}),
        ...(appliedDelta !== 0
          ? {
              reputationDelta: appliedDelta,
              saleQuality: saleQualityFor(conditionDelta, context.economy) ?? undefined,
            }
          : {}),
        ...(saleRevealLine !== undefined ? { saleRevealLine } : {}),
        ...(matchedBonus > 0 ? { matchedSale: true as const } : {}),
      },
    ],
  }
}

export interface ScrapShellResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Scrap the whole car at once, shell and all - the end-of-the-line donor move
 * once a car is stripped down (or not worth stripping further). Pays
 * `model.bookValueYen * economy.bands.scrapValueFraction` regardless of
 * what's still installed, removes the car and every part still on it, frees
 * its bay/grace slot, clears any staged work, and deletes its ledger entry.
 *
 * Labour is `energy.actionPoints.scrapShell` (0 in shipped content), gated on
 * `laborAvailable` when raised and spent into `energySpentToday`.
 */
export function resolveScrapShell(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
  laborAvailable: number = Infinity,
): ScrapShellResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model) return { state, log: [] }
  const laborSlotsUsed = context.economy.energy.actionPoints.scrapShell
  if (laborSlotsUsed > laborAvailable) return { state, log: [] }

  const priceYen = Math.round(model.bookValueYen * context.economy.bands.scrapValueFraction)
  const carPartIds = ALL_CAR_PART_IDS.filter((id) => car.parts[id].installed !== null)

  const clearedState = dissolveAssembliesForCar(
    clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId),
    carInstanceId,
  )

  return {
    state: deleteCarLedger(
      {
        ...clearedState,
        cashYen: clearedState.cashYen + priceYen,
        ownedCars: clearedState.ownedCars.filter((c) => c.id !== carInstanceId),
        carsForSale: clearedState.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
        pendingOffers: clearedState.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
        energySpentToday: clearedState.energySpentToday + laborSlotsUsed,
      },
      carInstanceId,
    ),
    log: [{ type: 'shell-scrapped', carInstanceId, modelId: car.modelId, priceYen, carPartIds }],
  }
}
