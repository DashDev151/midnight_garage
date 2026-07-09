import {
  BUYERS,
  CARS,
  PARTS,
  HIDDEN_ISSUES,
  type CarInstance,
  type CarModel,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { interestedBuyers } from '../src/bidding'
import { buildSimContext } from '../src/context'
import {
  bestFitBuyer,
  listPubliclyAskingPrice,
  resolveListForSale,
  resolveSellViaWalkIn,
  sellViaWalkIn,
} from '../src/selling'
import { valuateCarForBuyer } from '../src/valuation'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)

const model: CarModel | undefined = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
if (!model) throw new Error('fixture car missing from seed content')

const car: CarInstance = {
  id: 'car-0001',
  modelId: model.id,
  year: 1992,
  mileageKm: 90_000,
  color: 'White',
  provenanceNote: '',
  hiddenIssues: [],
  authenticityPercent: 85,
  components: {
    engine: { condition: 80, installed: null },
    forcedInduction: { condition: 80, installed: null },
    drivetrain: { condition: 80, installed: null },
    suspension: { condition: 80, installed: null },
    brakes: { condition: 80, installed: null },
    wheels: { condition: 80, installed: null },
    body: { condition: 80, installed: null },
    interior: { condition: 80, installed: null },
  },
}

describe('sellViaWalkIn', () => {
  it("offers at or below the chosen buyer's true valuation", () => {
    const rng = createRng(1)
    const offer = sellViaWalkIn(car, model, BUYERS, {}, rng)
    const buyer = BUYERS.find((b) => b.id === offer.buyerId)
    if (!buyer) throw new Error('offer referenced an unknown buyer')
    const trueValue = valuateCarForBuyer(buyer, model, car, {})
    expect(offer.priceYen).toBeLessThanOrEqual(trueValue)
  })

  it('is deterministic for the same seed', () => {
    const a = sellViaWalkIn(car, model, BUYERS, {}, createRng(7))
    const b = sellViaWalkIn(car, model, BUYERS, {}, createRng(7))
    expect(a).toEqual(b)
  })
})

describe('listPubliclyAskingPrice', () => {
  it('scales up with market heat', () => {
    const cool = listPubliclyAskingPrice(car, model, BUYERS, {}, 80)
    const hot = listPubliclyAskingPrice(car, model, BUYERS, {}, 130)
    expect(hot).toBeGreaterThan(cool)
  })

  it('returns 0 with no buyers to value the car', () => {
    expect(listPubliclyAskingPrice(car, model, [], {}, 100)).toBe(0)
  })
})

describe('bestFitBuyer', () => {
  it('returns the highest-valuing buyer among those genuinely interested in this tier', () => {
    // Sprint 11: bestFitBuyer only ever picks from the gated (tier-interested)
    // pool, same as sellViaWalkIn/listPubliclyAskingPrice — an uninterested
    // archetype's raw valuation is irrelevant, it was never a candidate.
    const best = bestFitBuyer(car, model, BUYERS, {})
    if (!best) throw new Error('expected a best-fit buyer')
    const bestValue = valuateCarForBuyer(best, model, car, {})
    const candidates = interestedBuyers(model, BUYERS).map((i) => i.buyer)
    expect(candidates.length).toBeGreaterThan(0)
    for (const buyer of candidates) {
      expect(valuateCarForBuyer(buyer, model, car, {})).toBeLessThanOrEqual(bestValue)
    }
  })

  it('returns undefined with no buyers', () => {
    expect(bestFitBuyer(car, model, [], {})).toBeUndefined()
  })
})

describe('sell-side buyer gate (Sprint 11, round-2 playtest #4)', () => {
  const shitboxModel = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!shitboxModel) throw new Error('fixture car missing from seed content')
  const shitboxCar: CarInstance = { ...car, modelId: shitboxModel.id }

  it('a collector never appears as the walk-in buyer for a shitbox-tier car', () => {
    // Per buyers.json, collector's tierPreferences list legend/gaisha/rare/
    // uncommon only — no shitbox entry at all.
    for (let seed = 0; seed < 50; seed++) {
      const offer = sellViaWalkIn(shitboxCar, shitboxModel, BUYERS, {}, createRng(seed))
      expect(offer.buyerId).not.toBe('collector')
    }
  })

  it('listPubliclyAskingPrice only averages genuinely-interested buyers, not the full roster', () => {
    // Shitbox has exactly one interested archetype (first-timer) — the gated
    // price should equal that buyer's own valuation exactly, not be dragged
    // down by averaging in four buyers who were never real candidates.
    const gatedPrice = listPubliclyAskingPrice(shitboxCar, shitboxModel, BUYERS, {}, 100)
    const firstTimer = BUYERS.find((b) => b.id === 'first-timer')!
    const firstTimerValue = Math.round(valuateCarForBuyer(firstTimer, shitboxModel, shitboxCar, {}))
    expect(gatedPrice).toBe(firstTimerValue)
  })
})

function stateWithCar(car: CarInstance, overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    ownedCars: [car],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    activeListings: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [car.id],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    ...overrides,
  }
}

describe('resolveSellViaWalkIn (Sprint 11 instant resolver)', () => {
  it('sells the car instantly, adds cash, and releases its service bay slot', () => {
    const state = stateWithCar(car)
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual([])
    expect(result.state.cashYen).toBeGreaterThan(0)
    expect(result.log[0]).toMatchObject({ type: 'car-sold', channel: 'walk-in-offer' })
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveSellViaWalkIn(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('resolveListForSale (Sprint 11 instant resolver)', () => {
  it('creates the listing instantly at a locked asking price, and releases its service bay slot', () => {
    const state = stateWithCar(car)
    const result = resolveListForSale(state, car.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual([])
    expect(result.state.activeListings).toHaveLength(1)
    expect(result.state.activeListings[0]?.askingPriceYen).toBeGreaterThan(0)
    expect(result.state.cashYen).toBe(0) // the sale itself still waits for resolvesOnDay
    expect(result.log[0]).toMatchObject({ type: 'listing-created' })
  })

  it('honors a custom wait, defaulting otherwise', () => {
    const state = stateWithCar(car)
    const result = resolveListForSale(state, car.id, CONTEXT, 3)
    expect(result.state.activeListings[0]?.resolvesOnDay).toBe(state.day + 3)
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveListForSale(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})
