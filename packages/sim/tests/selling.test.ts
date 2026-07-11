import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
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
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

const model: CarModel | undefined = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
if (!model) throw new Error('fixture car missing from seed content')

const car: CarInstance = buildCarInstance({
  modelId: model.id,
  year: 1992,
  mileageKm: 90_000,
  authenticityPercent: 85,
  parts: mintCarParts({ block: { band: 'worn' } }),
})

function walkIn(
  target: CarInstance,
  targetModel: CarModel,
  buyers = BUYERS,
  heat = 100,
  rng = createRng(1),
) {
  return sellViaWalkIn(
    target,
    targetModel,
    buyers,
    {},
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heat,
    ECONOMY,
    rng,
  )
}

function listingPrice(target: CarInstance, targetModel: CarModel, buyers = BUYERS, heat = 100) {
  return listPubliclyAskingPrice(
    target,
    targetModel,
    buyers,
    {},
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heat,
    ECONOMY,
  )
}

function bestFit(target: CarInstance, targetModel: CarModel, buyers = BUYERS, heat = 100) {
  return bestFitBuyer(
    target,
    targetModel,
    buyers,
    {},
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heat,
    ECONOMY,
  )
}

function valuate(
  buyer: (typeof BUYERS)[number],
  target: CarInstance,
  targetModel: CarModel,
  heat = 100,
) {
  return valuateCarForBuyer(
    buyer,
    targetModel,
    target,
    {},
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heat,
    ECONOMY,
  )
}

describe('sellViaWalkIn', () => {
  it("offers at or below the chosen buyer's true valuation", () => {
    const offer = walkIn(car, model)
    const buyer = BUYERS.find((b) => b.id === offer.buyerId)
    if (!buyer) throw new Error('offer referenced an unknown buyer')
    const trueValue = valuate(buyer, car, model)
    expect(offer.priceYen).toBeLessThanOrEqual(trueValue)
  })

  it('is deterministic for the same seed', () => {
    const a = walkIn(car, model, BUYERS, 100, createRng(7))
    const b = walkIn(car, model, BUYERS, 100, createRng(7))
    expect(a).toEqual(b)
  })
})

describe('listPubliclyAskingPrice', () => {
  it('scales up with market heat', () => {
    const cool = listingPrice(car, model, BUYERS, 80)
    const hot = listingPrice(car, model, BUYERS, 130)
    expect(hot).toBeGreaterThan(cool)
  })

  it('returns 0 with no buyers to value the car', () => {
    expect(listingPrice(car, model, [])).toBe(0)
  })

  /**
   * Sprint 21 decision 6: heat applies exactly once, inside `marketValueYen`
   * (via `valuateCarForBuyer`) - `listPubliclyAskingPrice` no longer
   * multiplies by heat a second time on top of that (the old double-count).
   *
   * Sprint 27: value is now clean-value-minus-restoration-bill, so the whole
   * price no longer scales purely proportionally with heat once a car
   * carries any restoration bill - only cleanValue's own share does (see
   * marketValue.test.ts's dedicated "heat applies exactly once" tests for
   * the formula-level proof; the old flat `heatHigh/heatBase ~= 1.2` ratio
   * check no longer holds in general). What this test checks instead: the
   * real listing price, reconstructed from the same interested-buyer pool
   * `listPubliclyAskingPrice` itself averages over - proves there's no
   * second, hidden heat multiplication layered on top, without assuming a
   * ratio shape the new formula doesn't produce.
   */
  it('applies market heat exactly once (no double-count with marketValueYen)', () => {
    const candidates = interestedBuyers(model, BUYERS).map((i) => i.buyer)
    const expectedAt = (heat: number): number => {
      const total = candidates.reduce((sum, buyer) => sum + valuate(buyer, car, model, heat), 0)
      return Math.round((total / candidates.length) * ECONOMY.valuation.listingPatiencePremium)
    }
    expect(listingPrice(car, model, BUYERS, 100)).toBe(expectedAt(100))
    expect(listingPrice(car, model, BUYERS, 120)).toBe(expectedAt(120))
  })
})

describe('bestFitBuyer', () => {
  it('returns the highest-valuing buyer among those genuinely interested in this tier', () => {
    const best = bestFit(car, model)
    if (!best) throw new Error('expected a best-fit buyer')
    const bestValue = valuate(best, car, model)
    const candidates = interestedBuyers(model, BUYERS).map((i) => i.buyer)
    expect(candidates.length).toBeGreaterThan(0)
    for (const buyer of candidates) {
      const value = valuate(buyer, car, model)
      expect(value).toBeLessThanOrEqual(bestValue)
    }
  })

  it('returns undefined with no buyers', () => {
    expect(bestFit(car, model, [])).toBeUndefined()
  })
})

describe('sell-side buyer gate (Sprint 11, round-2 playtest #4)', () => {
  const shitboxModel = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!shitboxModel) throw new Error('fixture car missing from seed content')
  const shitboxCar: CarInstance = { ...car, modelId: shitboxModel.id }

  it('a collector never appears as the walk-in buyer for a shitbox-tier car', () => {
    // Per buyers.json, collector's tierPreferences list legend/gaisha/rare/
    // uncommon only - no shitbox entry at all.
    for (let seed = 0; seed < 50; seed++) {
      const offer = walkIn(shitboxCar, shitboxModel, BUYERS, 100, createRng(seed))
      expect(offer.buyerId).not.toBe('collector')
    }
  })

  it('listPubliclyAskingPrice only averages genuinely-interested buyers, not the full roster', () => {
    // Shitbox has exactly one interested archetype (first-timer) - the gated
    // price should equal that buyer's own valuation exactly, not be dragged
    // down by averaging in four buyers who were never real candidates.
    const gatedPrice = listingPrice(shitboxCar, shitboxModel)
    const firstTimerValuation = valuate(
      BUYERS.find((b) => b.id === 'first-timer')!,
      shitboxCar,
      shitboxModel,
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
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'engine', targetBand: 'mint' }] },
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
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'engine', targetBand: 'mint' }] },
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

describe('reputation side effects (Sprint 15; re-based on bands, Sprint 26)', () => {
  const qualityCar: CarInstance = buildCarInstance({
    modelId: car.modelId,
    authenticityPercent: 90,
    parts: uniformCarParts('mint'),
  })
  const lemonCar: CarInstance = buildCarInstance({
    modelId: car.modelId,
    authenticityPercent: 80,
    parts: uniformCarParts('poor'),
  })

  it('a walk-in sale of a quality car grants reputation immediately', () => {
    const state = stateWithCar(qualityCar)
    const result = resolveSellViaWalkIn(state, qualityCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBeGreaterThan(0)
    expect(result.log[0]).toMatchObject({ reputationDelta: result.state.reputationPoints })
  })

  it('a walk-in sale of a lemon logs the applied loss, not the nominal penalty (Sprint 24 fix 3)', () => {
    // A player at 2 points selling a lemon (nominal -5) only has 2 to lose -
    // `applyReputationDelta` floors at 0. Before this fix, the log entry
    // carried the nominal -5 regardless of what actually applied.
    const state = stateWithCar(lemonCar, { reputationPoints: 2 })
    const result = resolveSellViaWalkIn(state, lemonCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0)
    expect(result.log[0]).toMatchObject({ reputationDelta: -2, saleQuality: 'lemon' })
  })

  it('a walk-in sale of a lemon already at zero reputation has nothing left to lose, so logs no reputationDelta', () => {
    const state = stateWithCar(lemonCar) // reputationPoints: 0
    const result = resolveSellViaWalkIn(state, lemonCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0)
    expect(result.log[0]).not.toHaveProperty('reputationDelta')
  })

  it('a walk-in sale of an ordinary car carries no reputationDelta field', () => {
    const state = stateWithCar(car) // fixture car: one worn part, otherwise mint - unremarkable
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
