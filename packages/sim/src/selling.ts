import {
  ALL_CAR_PART_IDS,
  type Buyer,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type DayLogEntry,
  type EconomyConfig,
  type GameState,
  type Part,
  type PendingSaleOffer,
} from '@midnight-garage/content'
import { interestedBuyers } from './bidding'
import { applyReputationDelta } from './calendar'
import { carLedgerFor, deleteCarLedger } from './carLedger'
import { saleQualityFor, saleReputationDeltaFor } from './carCondition'
import type { SimContext } from './context'
import { releaseCarFromShop } from './facilities'
import { bumpPlayerSales } from './marketHeat'
import type { Rng } from './rng'
import { clearStagedWork } from './stagedWork'
import { valuateCarForBuyer } from './valuation'

export interface SaleOffer {
  buyerId: string
  priceYen: number
}

/**
 * The candidate buyer pool for a sale - only archetypes with a genuinely
 * stated interest in the car's tier (Sprint 11, round-2 playtest #4: a
 * collector was making walk-in offers on a shitbox because nothing gated
 * who's even a candidate buyer on the sell side). Reuses the exact gate
 * `bidding.ts` already applies to auction rivals - the same rule, the
 * second place it was missing, not a different one.
 */
function saleCandidates(model: CarModel, buyers: readonly Buyer[]): Buyer[] {
  return interestedBuyers(model, buyers).map((i) => i.buyer)
}

/**
 * GDD 6.3: "fast, variable" - a buyer archetype rolls up the same day,
 * offering somewhat under (or, occasionally, a little over) their true
 * valuation for the convenience of an instant sale. Weighted by fit, not
 * uniformly random: a buyer who actually wants this car is more likely to
 * be the one who walks in - "someone happens by," not "a stranger is
 * offered a car they don't care about."
 *
 * Sprint 31: this is now the core roll BOTH the daily offer-draw step
 * (`drawDailyOffers`, called from advanceDay once per for-sale car per day)
 * and the harness/tests use directly - the spread itself moved from the old
 * sim-constant `WALK_IN_OFFER_RANGE` to `economy.selling.offerSpread` (the
 * content law: designer-tunable numbers live in JSON), but the shape of the
 * roll (weighted buyer pick, then a uniform spread around that buyer's own
 * valuation) is unchanged since Sprint 11.
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
  const totalValue = valuations.reduce((sum, v) => sum + v.value, 0)

  let picked = valuations[0]
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
 * Cold/normal/hot bucketing of today's market heat (Sprint 31 decision 2) -
 * feeds `offerChanceFor`'s heat multiplier below. Three flat bands, not a
 * continuous curve, mirroring the auction turnout-band style: simple enough
 * for a maintainer to eyeball-tune directly in economy.json.
 */
function heatBandFor(heatPercent: number, economy: EconomyConfig): 'cold' | 'normal' | 'hot' {
  const { heatBandColdBelowPercent, heatBandHotAtOrAbovePercent } = economy.selling
  if (heatPercent < heatBandColdBelowPercent) return 'cold'
  if (heatPercent >= heatBandHotAtOrAbovePercent) return 'hot'
  return 'normal'
}

/**
 * Today's chance a for-sale car draws an offer at all (Sprint 31 decision
 * 2): base x this model's rarity-tier desirability x today's heat-band
 * multiplier, clamped to [0, 1]. Independent of `saleCandidates` (whether
 * ANY buyer archetype is even a plausible fit for this tier) - that gate
 * still runs inside `sellViaWalkIn` itself, so a tier nobody wants never
 * produces a live offer even when this chance rolls true.
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
 * Toggle a car's "taking offers" flag (Sprint 31 decision 2) - free,
 * instant, reversible any time before it sells. This REPLACES both the old
 * instant walk-in sell and the list-publicly buttons: marking a car for sale
 * no longer sells it or resolves anything by itself, it just makes the car
 * eligible for the daily offer draw (`drawDailyOffers`) below. Turning it
 * off drops the toggle and any live offer on the car - there's nothing else
 * to reconcile, since an offer only ever lives one day anyway. A no-op for a
 * car not owned, or a toggle to the state it's already in.
 */
export function resolveSetForSale(
  state: GameState,
  carInstanceId: string,
  forSale: boolean,
): SetForSaleResult {
  const owned = state.ownedCars.some((c) => c.id === carInstanceId)
  if (!owned) return { state, log: [] }
  const already = state.carsForSale.some((f) => f.carInstanceId === carInstanceId)
  if (forSale === already) return { state, log: [] }

  if (forSale) {
    return {
      state: {
        ...state,
        carsForSale: [...state.carsForSale, { carInstanceId, sinceDay: state.day }],
      },
      log: [],
    }
  }
  return {
    state: {
      ...state,
      carsForSale: state.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
      pendingOffers: state.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
    },
    log: [],
  }
}

/**
 * Sprint 68 decision 3 (playtest item 21): turn an offer down explicitly.
 *
 * Drops just that car's pending offer and leaves `carsForSale` alone, so the
 * car stays on the market and tomorrow's `drawDailyOffers` can bring a better
 * one. The removal itself is the same one `resolveSetForSale`'s un-list branch
 * already performs, scoped to the offer instead of the listing.
 *
 * Deliberately no reputation cost: turning down a lowball is a negotiation,
 * not a slight. A no-op (unknown car, no live offer) returns the state
 * untouched with an empty log, like every other resolver here.
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

/**
 * The daily offer-draw step (Sprint 31 decision 2), called once per
 * advanceDay tick for the day about to begin: every for-sale, still-owned
 * car independently rolls `offerChanceFor`; a hit rolls a fresh
 * `sellViaWalkIn`-style offer and it becomes today's live offer on that car.
 * `pendingOffers` is REPLACED wholesale, not accumulated (the no-reflex
 * rule: an offer is valid the day it's drawn for only - see advanceDay.ts's
 * own call-site comment for the full day-cycle reasoning). `carsForSale` is
 * pruned to still-owned cars in the same pass, so a sold (or otherwise
 * departed) car's toggle never lingers.
 */
export function drawDailyOffers(
  state: GameState,
  context: SimContext,
  rng: Rng,
): DailyOfferDrawResult {
  const ownedIds = new Set(state.ownedCars.map((c) => c.id))
  const carsForSale = state.carsForSale.filter((f) => ownedIds.has(f.carInstanceId))
  const pendingOffers: PendingSaleOffer[] = []
  const log: DayLogEntry[] = []

  for (const entry of carsForSale) {
    const car = state.ownedCars.find((c) => c.id === entry.carInstanceId)
    const model = car ? context.modelsById[car.modelId] : undefined
    if (!car || !model) continue
    if (saleCandidates(model, context.buyers).length === 0) continue

    const heatPercent = state.marketHeat[car.modelId] ?? 100
    const chance = offerChanceFor(model, heatPercent, context.economy)
    if (rng.next() >= chance) continue

    const offer = sellViaWalkIn(
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
    pendingOffers.push({ carInstanceId: car.id, buyerId: offer.buyerId, priceYen: offer.priceYen })
    log.push({
      type: 'offer-received',
      carInstanceId: car.id,
      modelId: car.modelId,
      buyerId: offer.buyerId,
      priceYen: offer.priceYen,
    })
  }

  return { state: { ...state, carsForSale, pendingOffers }, log }
}

export interface SaleResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Resolve today's live offer on `carInstanceId`, if one exists - the sale
 * mechanics (reputation, market-heat ledger, staged-work cleanup, event log)
 * are the exact plumbing this resolver has carried since Sprint 11; only the
 * PRICE source changed (Sprint 31 decision 2): instead of rolling a fresh
 * walk-in offer the instant it's clicked, it consumes today's pre-rolled
 * `state.pendingOffers` entry (drawn by `drawDailyOffers` at the end of the
 * PREVIOUS day). A no-op (no offer live today, or the car isn't owned)
 * leaves state untouched, same contract as every other instant resolver in
 * this file. Seeded/random only via the offer already stored in state -
 * this function itself makes no further rolls, so a repeat call is inert
 * once the offer's gone.
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

  const nominalDelta = saleReputationDeltaFor(
    car,
    model,
    context.partsTaxonomyById,
    context.economy,
  )
  const clearedState = clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId)
  const released = applyReputationDelta(clearedState, nominalDelta, context.economy)
  // Sprint 24 fix 3: log what actually happened, not the nominal delta -
  // `applyReputationDelta` floors `reputationPoints` at 0, so a player at 2
  // points selling a lemon (nominal -5) only ever loses 2, not 5. The
  // *label* still comes from the nominal delta (`saleQualityFor`) - the
  // sale was still mechanically a lemon regardless of how much was left to
  // lose - but the logged number is the real, applied one.
  const appliedDelta = released.reputationPoints - clearedState.reputationPoints

  // Sprint 42: realized profit against the ledger recorded since acquisition
  // - only when the purchase price itself is known (never fabricated for an
  // unknown-purchase car, e.g. a dev grant or a pre-v25 save).
  const ledger = carLedgerFor(state, carInstanceId)
  const profitYen =
    ledger.purchaseYen === null
      ? undefined
      : offer.priceYen - (ledger.purchaseYen + ledger.repairYen + ledger.partsYen)

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
              saleQuality: saleQualityFor(nominalDelta, context.economy) ?? undefined,
            }
          : {}),
      },
    ],
  }
}

export interface ScrapShellResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Sprint 71 decision 7: scrap the whole car at once, shell and all - the
 * end-of-the-line donor move once a car is stripped down (or not worth
 * stripping further). Pays `model.bookValueYen * economy.bands.scrapValueFraction`
 * regardless of what's still installed (the same flat scrap-value fraction
 * `scrapValueYen` applies to a single part, here applied to the whole car),
 * removes the car and every part still on it, frees its bay/grace slot
 * (`releaseCarFromShop`, the same release a sale uses), clears any staged
 * work, and deletes its ledger entry - a car that no longer exists has
 * nothing left to account for.
 */
export function resolveScrapShell(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): ScrapShellResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model) return { state, log: [] }

  const priceYen = Math.round(model.bookValueYen * context.economy.bands.scrapValueFraction)
  const carPartIds = ALL_CAR_PART_IDS.filter((id) => car.parts[id].installed !== null)

  const clearedState = clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId)

  return {
    state: deleteCarLedger(
      {
        ...clearedState,
        cashYen: clearedState.cashYen + priceYen,
        ownedCars: clearedState.ownedCars.filter((c) => c.id !== carInstanceId),
        carsForSale: clearedState.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
        pendingOffers: clearedState.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
      },
      carInstanceId,
    ),
    log: [{ type: 'shell-scrapped', carInstanceId, modelId: car.modelId, priceYen, carPartIds }],
  }
}
