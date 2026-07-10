import type {
  Buyer,
  CarInstance,
  CarModel,
  DayLogEntry,
  GameState,
  Part,
  PublicListing,
} from '@midnight-garage/content'
import { interestedBuyers } from './bidding'
import { applyReputationDelta } from './calendar'
import { saleReputationDeltaFor } from './carCondition'
import { PUBLIC_LISTING_WAIT_DAYS, WALK_IN_OFFER_RANGE } from './constants'
import type { SimContext } from './context'
import { releaseCarFromShop } from './facilities'
import { createRng, hashStringToSeed, type Rng } from './rng'
import { valuateCarForBuyer } from './valuation'

export interface SaleOffer {
  buyerId: string
  priceYen: number
}

/**
 * The candidate buyer pool for a sale — only archetypes with a genuinely
 * stated interest in the car's tier (Sprint 11, round-2 playtest #4: a
 * collector was making walk-in offers on a shitbox because nothing gated
 * who's even a candidate buyer on the sell side). Reuses the exact gate
 * `bidding.ts` already applies to auction rivals — the same rule, the
 * second place it was missing, not a different one.
 */
function saleCandidates(model: CarModel, buyers: readonly Buyer[]): Buyer[] {
  return interestedBuyers(model, buyers).map((i) => i.buyer)
}

/**
 * GDD 6.3: "fast, variable" — a buyer archetype rolls up the same day,
 * offering somewhat under their true valuation for the convenience of an
 * instant sale. Weighted by fit, not uniformly random: a buyer who
 * actually wants this car is more likely to be the one who walks in —
 * "someone happens by," not "a stranger is offered a car they don't
 * care about." Uniform selection made this channel punishing for any
 * car that didn't match the randomly-chosen archetype's taste, on top
 * of the discount below — a double penalty that made flipping
 * unviable regardless of how cheap the purchase was.
 */
export function sellViaWalkIn(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  rng: Rng,
): SaleOffer {
  const candidates = saleCandidates(model, buyers)
  const valuations = candidates.map((buyer) => ({
    buyer,
    value: valuateCarForBuyer(buyer, model, car, partsById),
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

  const [min, max] = WALK_IN_OFFER_RANGE
  const priceYen = Math.round(picked.value * (min + rng.next() * (max - min)))
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * GDD 6.3: "slow, market price" — the average valuation across every
 * genuinely-interested buyer archetype (Sprint 11: gated, same as walk-in —
 * averaging in buyers with no real interest was dragging the "market
 * price" below what a single well-matched buyer would pay, inverting this
 * channel's intended fast/cheap vs. slow/valuable relationship), scaled by
 * market heat, locked in at listing time (the asking price doesn't drift
 * with market heat while the listing waits).
 */
export function listPubliclyAskingPrice(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  marketHeatPercent: number,
): number {
  const candidates = saleCandidates(model, buyers)
  if (candidates.length === 0) return 0
  const total = candidates.reduce(
    (sum, buyer) => sum + valuateCarForBuyer(buyer, model, car, partsById),
    0,
  )
  const average = total / candidates.length
  return Math.round(average * (marketHeatPercent / 100))
}

/**
 * The best-fit buyer for a resolved public listing — flavor/log purposes
 * only. The actual sale price is the locked askingPriceYen from listing
 * time, not recomputed against this buyer.
 */
export function bestFitBuyer(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
): Buyer | undefined {
  let best: { buyer: Buyer; value: number } | undefined
  for (const buyer of saleCandidates(model, buyers)) {
    const value = valuateCarForBuyer(buyer, model, car, partsById)
    if (!best || value > best.value) {
      best = { buyer, value }
    }
  }
  return best?.buyer
}

export interface SaleResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The instant walk-in-sell resolver (Sprint 11): resolves the moment it's
 * clicked. Seeded on the car id + day (not a shared day-tick rng) so a
 * single click is fully reproducible, and re-attempting a pulled-back car on
 * a later day rolls a fresh offer rather than repeating the same one forever.
 */
export function resolveSellViaWalkIn(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): SaleResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model || context.buyers.length === 0) return { state, log: [] }

  const rng = createRng(hashStringToSeed(`${carInstanceId}:walkin:${state.day}`))
  const offer = sellViaWalkIn(car, model, context.buyers, context.partsById, rng)
  const reputationDelta = saleReputationDeltaFor(car)
  const released = applyReputationDelta(releaseCarFromShop(state, carInstanceId), reputationDelta)
  return {
    state: {
      ...released,
      cashYen: released.cashYen + offer.priceYen,
      ownedCars: released.ownedCars.filter((c) => c.id !== carInstanceId),
    },
    log: [
      {
        type: 'car-sold',
        carInstanceId,
        channel: 'walk-in-offer',
        priceYen: offer.priceYen,
        ...(reputationDelta !== 0 ? { reputationDelta } : {}),
      },
    ],
  }
}

/**
 * The instant list-creation resolver (Sprint 11): the listing itself (and
 * its locked asking price) appears the moment it's clicked; the sale still
 * resolves after `waitDays` — that multi-day wait is the intentional "slow,
 * market price" mechanic, not a queue artifact.
 */
export function resolveListForSale(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
  waitDaysOverride?: number,
): SaleResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model || context.buyers.length === 0) return { state, log: [] }

  const marketHeatPercent = state.marketHeat[car.modelId] ?? 100
  const askingPriceYen = listPubliclyAskingPrice(
    car,
    model,
    context.buyers,
    context.partsById,
    marketHeatPercent,
  )
  const waitDays = waitDaysOverride ?? PUBLIC_LISTING_WAIT_DAYS
  const listing: PublicListing = {
    id: `listing-${state.day}-${carInstanceId}`,
    carInstanceId,
    modelId: car.modelId,
    askingPriceYen,
    resolvesOnDay: state.day + waitDays,
    // Captured now, not at resolution: the real CarInstance leaves state the
    // moment this listing is created, so its condition can't be re-read days
    // later when the listing actually resolves (see selling.ts's own note
    // above and sprint15.md decision 4).
    reputationDeltaOnSale: saleReputationDeltaFor(car),
  }
  const released = releaseCarFromShop(state, carInstanceId)
  return {
    state: {
      ...released,
      ownedCars: released.ownedCars.filter((c) => c.id !== carInstanceId),
      activeListings: [...released.activeListings, listing],
    },
    log: [
      {
        type: 'listing-created',
        listingId: listing.id,
        carInstanceId,
        askingPriceYen,
        resolvesOnDay: listing.resolvesOnDay,
      },
    ],
  }
}
