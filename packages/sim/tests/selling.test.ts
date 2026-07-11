import {
  BUYERS,
  CARS,
  ECONOMY,
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
    const offer = sellViaWalkIn(car, model, BUYERS, {}, 100, ECONOMY, rng)
    const buyer = BUYERS.find((b) => b.id === offer.buyerId)
    if (!buyer) throw new Error('offer referenced an unknown buyer')
    const trueValue = valuateCarForBuyer(buyer, model, car, {}, 100, ECONOMY)
    expect(offer.priceYen).toBeLessThanOrEqual(trueValue)
  })

  it('is deterministic for the same seed', () => {
    const a = sellViaWalkIn(car, model, BUYERS, {}, 100, ECONOMY, createRng(7))
    const b = sellViaWalkIn(car, model, BUYERS, {}, 100, ECONOMY, createRng(7))
    expect(a).toEqual(b)
  })
})

describe('listPubliclyAskingPrice', () => {
  it('scales up with market heat', () => {
    const cool = listPubliclyAskingPrice(car, model, BUYERS, {}, 80, ECONOMY)
    const hot = listPubliclyAskingPrice(car, model, BUYERS, {}, 130, ECONOMY)
    expect(hot).toBeGreaterThan(cool)
  })

  it('returns 0 with no buyers to value the car', () => {
    expect(listPubliclyAskingPrice(car, model, [], {}, 100, ECONOMY)).toBe(0)
  })

  /**
   * Sprint 21 decision 6: heat applies exactly once, inside `marketValueYen`
   * (via `valuateCarForBuyer`) — `listPubliclyAskingPrice` no longer
   * multiplies by heat a second time on top of that (the old double-count).
   * Proof: since neither `conditionFactor` nor `tasteMultiplier` depends on
   * heat, and `LISTING_PATIENCE_PREMIUM` is a flat constant, a 1.2x change
   * in heat should produce almost exactly a 1.2x change in the final price —
   * a double-count would instead compound to ~1.44x.
   */
  it('applies market heat exactly once (no double-count with marketValueYen)', () => {
    const heatBase = listPubliclyAskingPrice(car, model, BUYERS, {}, 100, ECONOMY)
    const heatHigh = listPubliclyAskingPrice(car, model, BUYERS, {}, 120, ECONOMY)
    expect(heatHigh / heatBase).toBeCloseTo(1.2, 1)
  })
})

describe('bestFitBuyer', () => {
  it('returns the highest-valuing buyer among those genuinely interested in this tier', () => {
    // Sprint 11: bestFitBuyer only ever picks from the gated (tier-interested)
    // pool, same as sellViaWalkIn/listPubliclyAskingPrice — an uninterested
    // archetype's raw valuation is irrelevant, it was never a candidate.
    const best = bestFitBuyer(car, model, BUYERS, {}, 100, ECONOMY)
    if (!best) throw new Error('expected a best-fit buyer')
    const bestValue = valuateCarForBuyer(best, model, car, {}, 100, ECONOMY)
    const candidates = interestedBuyers(model, BUYERS).map((i) => i.buyer)
    expect(candidates.length).toBeGreaterThan(0)
    for (const buyer of candidates) {
      const value = valuateCarForBuyer(buyer, model, car, {}, 100, ECONOMY)
      expect(value).toBeLessThanOrEqual(bestValue)
    }
  })

  it('returns undefined with no buyers', () => {
    expect(bestFitBuyer(car, model, [], {}, 100, ECONOMY)).toBeUndefined()
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
      const offer = sellViaWalkIn(
        shitboxCar,
        shitboxModel,
        BUYERS,
        {},
        100,
        ECONOMY,
        createRng(seed),
      )
      expect(offer.buyerId).not.toBe('collector')
    }
  })

  it('listPubliclyAskingPrice only averages genuinely-interested buyers, not the full roster', () => {
    // Shitbox has exactly one interested archetype (first-timer) — the gated
    // price should equal that buyer's own valuation exactly, not be dragged
    // down by averaging in four buyers who were never real candidates.
    const gatedPrice = listPubliclyAskingPrice(shitboxCar, shitboxModel, BUYERS, {}, 100, ECONOMY)
    const firstTimerValuation = valuateCarForBuyer(
      BUYERS.find((b) => b.id === 'first-timer')!,
      shitboxModel,
      shitboxCar,
      {},
      100,
      ECONOMY,
    )
    const premium = ECONOMY.valuation.listingPatiencePremium
    const expectedPrice = Math.round(firstTimerValuation * premium)
    expect(gatedPrice).toBe(expectedPrice)
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
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    ...overrides,
  }
}

describe('resolveSellViaWalkIn (Sprint 11 instant resolver)', () => {
  it('sells the car instantly, adds cash, and releases its service bay slot', () => {
    const state = stateWithCar(car)
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual([null]) // slot cleared, not removed
    expect(result.state.cashYen).toBeGreaterThan(0)
    expect(result.log[0]).toMatchObject({ type: 'car-sold', channel: 'walk-in-offer' })
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveSellViaWalkIn(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('drops the car’s staged work (Sprint 18) so it never outlives the departed car', () => {
    const state = stateWithCar(car, {
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'engine' }] },
    })
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state.stagedCarWork[car.id]).toBeUndefined()
  })
})

describe('resolveListForSale (Sprint 11 instant resolver)', () => {
  it('creates the listing instantly at a locked asking price, and releases its service bay slot', () => {
    const state = stateWithCar(car)
    const result = resolveListForSale(state, car.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual([null]) // slot cleared, not removed
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

  it('drops the car’s staged work (Sprint 18) so it never outlives the departed car', () => {
    const state = stateWithCar(car, {
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'engine' }] },
    })
    const result = resolveListForSale(state, car.id, CONTEXT)
    expect(result.state.stagedCarWork[car.id]).toBeUndefined()
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveListForSale(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('reputation side effects (Sprint 15)', () => {
  const qualityCar: CarInstance = {
    ...car,
    authenticityPercent: 90,
    components: {
      engine: { condition: 90, installed: null },
      forcedInduction: { condition: 90, installed: null },
      drivetrain: { condition: 90, installed: null },
      suspension: { condition: 90, installed: null },
      brakes: { condition: 90, installed: null },
      wheels: { condition: 90, installed: null },
      body: { condition: 90, installed: null },
      interior: { condition: 90, installed: null },
    },
  }
  const lemonCar: CarInstance = {
    ...car,
    components: {
      engine: { condition: 5, installed: null },
      forcedInduction: { condition: 80, installed: null },
      drivetrain: { condition: 80, installed: null },
      suspension: { condition: 80, installed: null },
      brakes: { condition: 80, installed: null },
      wheels: { condition: 80, installed: null },
      body: { condition: 80, installed: null },
      interior: { condition: 80, installed: null },
    },
  }

  it('a walk-in sale of a quality car grants reputation immediately', () => {
    const state = stateWithCar(qualityCar)
    const result = resolveSellViaWalkIn(state, qualityCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBeGreaterThan(0)
    expect(result.log[0]).toMatchObject({ reputationDelta: result.state.reputationPoints })
  })

  it('a walk-in sale of a lemon costs reputation immediately, clamped at zero', () => {
    const state = stateWithCar(lemonCar)
    const result = resolveSellViaWalkIn(state, lemonCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0) // started at 0, penalty clamps
    expect(result.log[0]).toMatchObject({ reputationDelta: expect.any(Number) })
    const delta = (result.log[0] as { reputationDelta: number }).reputationDelta
    expect(delta).toBeLessThan(0)
  })

  it('a walk-in sale of an ordinary car carries no reputationDelta field', () => {
    const state = stateWithCar(car) // fixture car: all components at 80, unremarkable
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.log[0]).not.toHaveProperty('reputationDelta')
  })

  it('a public listing captures the reputation delta at creation time, applying nothing yet', () => {
    const state = stateWithCar(qualityCar)
    const result = resolveListForSale(state, qualityCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0) // not applied yet
    expect(result.state.activeListings[0]?.reputationDeltaOnSale).toBeGreaterThan(0)
  })
})
