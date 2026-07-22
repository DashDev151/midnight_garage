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
import { bumpPlayerSales, updateMarketHeat } from '../src/marketHeat'
import {
  bestFitBuyer,
  drawDailyOffers,
  offerChanceFor,
  resolveRejectOffer,
  resolveScrapShell,
  resolveSellViaWalkIn,
  resolveSetForSale,
  sellViaWalkIn,
} from '../src/selling'
import { valuateCarForBuyer } from '../src/valuation'
import { createRng } from '../src/rng'
import {
  buildCarInstance,
  mintCarParts,
  testSpecialty,
  testToolTiers,
  uniformCarParts,
} from './testFixtures'

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
  parts: mintCarParts({ block: 'worn' }),
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
  it("offers within the configured spread of the chosen buyer's true valuation", () => {
    const offer = walkIn(car, model)
    const buyer = BUYERS.find((b) => b.id === offer.buyerId)
    if (!buyer) throw new Error('offer referenced an unknown buyer')
    const trueValue = valuate(buyer, car, model)
    const [min, max] = ECONOMY.selling.offerSpread
    expect(offer.priceYen).toBeGreaterThanOrEqual(Math.round(trueValue * min))
    expect(offer.priceYen).toBeLessThanOrEqual(Math.round(trueValue * max))
  })

  it('is deterministic for the same seed', () => {
    const a = walkIn(car, model, BUYERS, 100, createRng(7))
    const b = walkIn(car, model, BUYERS, 100, createRng(7))
    expect(a).toEqual(b)
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
})

function stateWithCar(car: CarInstance, overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    ownedCars: [car],
    partInventory: [],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [car.id],
    parkingCarIds: [],
    graceParkingCarId: null,
    energySpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
    ...overrides,
  }
}

/** `stateWithCar` plus a real live offer today on that car - the fixture
 * every `resolveSellViaWalkIn` test below needs, since accepting
 * consumes a pre-rolled `pendingOffers` entry instead of rolling one
 * itself. */
function stateWithOffer(
  car: CarInstance,
  priceYen: number,
  buyerId: string,
  overrides: Partial<GameState> = {},
): GameState {
  return stateWithCar(car, {
    carsForSale: [{ carInstanceId: car.id, sinceDay: 1 }],
    pendingOffers: [{ carInstanceId: car.id, buyerId, priceYen }],
    ...overrides,
  })
}

describe('resolveRejectOffer (Sprint 68 decision 3, playtest item 21)', () => {
  const BUYER = BUYERS[0]!.id

  it('drops the offer but LEAVES the car listed, so tomorrow can bring a better one', () => {
    const state = stateWithOffer(car, 500_000, BUYER)
    const result = resolveRejectOffer(state, car.id)

    expect(result.state.pendingOffers).toEqual([])
    // The whole point: rejecting one lowball is not the same as pulling the
    // car off the market.
    expect(result.state.carsForSale).toEqual([{ carInstanceId: car.id, sinceDay: 1 }])
  })

  it('logs what was turned down, and costs no reputation', () => {
    const state = stateWithOffer(car, 500_000, BUYER)
    const result = resolveRejectOffer(state, car.id)

    expect(result.log).toEqual([
      {
        type: 'offer-rejected',
        carInstanceId: car.id,
        modelId: car.modelId,
        buyerId: BUYER,
        priceYen: 500_000,
      },
    ])
    // Turning down a lowball is a negotiation, not a slight.
    expect(result.state.reputationPoints).toBe(state.reputationPoints)
  })

  it('takes no cash and keeps the car', () => {
    const state = stateWithOffer(car, 500_000, BUYER)
    const result = resolveRejectOffer(state, car.id)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.ownedCars.map((c) => c.id)).toContain(car.id)
  })

  it('is a no-op with no live offer, or for a car not owned', () => {
    const listedNoOffer = stateWithCar(car, {
      carsForSale: [{ carInstanceId: car.id, sinceDay: 1 }],
    })
    expect(resolveRejectOffer(listedNoOffer, car.id).state).toBe(listedNoOffer)
    expect(resolveRejectOffer(listedNoOffer, car.id).log).toEqual([])

    const withOffer = stateWithOffer(car, 500_000, BUYER)
    expect(resolveRejectOffer(withOffer, 'ghost-car').state).toBe(withOffer)
  })

  it("only drops the named car's offer, never another car's", () => {
    const other: CarInstance = { ...car, id: 'car-other' }
    const state = stateWithOffer(car, 500_000, BUYER, {
      ownedCars: [car, other],
      pendingOffers: [
        { carInstanceId: car.id, buyerId: BUYER, priceYen: 500_000 },
        { carInstanceId: other.id, buyerId: BUYER, priceYen: 400_000 },
      ],
    })
    const result = resolveRejectOffer(state, car.id)
    expect(result.state.pendingOffers).toEqual([
      { carInstanceId: other.id, buyerId: BUYER, priceYen: 400_000 },
    ])
  })
})

describe('resolveSetForSale (Sprint 31)', () => {
  it('toggles a car for sale on and off', () => {
    const state = stateWithCar(car)
    const on = resolveSetForSale(state, car.id, true)
    expect(on.state.carsForSale).toEqual([{ carInstanceId: car.id, sinceDay: state.day }])

    const off = resolveSetForSale(on.state, car.id, false)
    expect(off.state.carsForSale).toEqual([])
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveSetForSale(state, 'ghost-car', true)
    expect(result.state).toBe(state)
  })

  it('is a no-op when toggling to the state it is already in', () => {
    const state = resolveSetForSale(stateWithCar(car), car.id, true).state
    const result = resolveSetForSale(state, car.id, true)
    expect(result.state).toBe(state)
  })

  it('turning off drops any live pending offer on that car too', () => {
    const state = stateWithOffer(car, 900_000, 'tuner')
    const result = resolveSetForSale(state, car.id, false)
    expect(result.state.pendingOffers).toEqual([])
    expect(result.state.carsForSale).toEqual([])
  })
})

describe('offerChanceFor (Sprint 31 decision 2)', () => {
  it('is higher in a hot market than a cold one for the same model', () => {
    const cold = offerChanceFor(model, 70, ECONOMY)
    const hot = offerChanceFor(model, 130, ECONOMY)
    expect(hot).toBeGreaterThan(cold)
  })

  it('never leaves the [0, 1] probability range', () => {
    expect(offerChanceFor(model, 500, ECONOMY)).toBeLessThanOrEqual(1)
    expect(offerChanceFor(model, 0, ECONOMY)).toBeGreaterThanOrEqual(0)
  })
})

describe('drawDailyOffers (Sprint 31 decision 2)', () => {
  it('is deterministic for the same seed', () => {
    const state = {
      ...stateWithCar(car),
      carsForSale: [{ carInstanceId: car.id, sinceDay: 1 }],
    }
    const a = drawDailyOffers(state, CONTEXT, createRng(9))
    const b = drawDailyOffers(state, CONTEXT, createRng(9))
    expect(a.state.pendingOffers).toEqual(b.state.pendingOffers)
    expect(a.log).toEqual(b.log)
  })

  it('never draws an offer for a car not marked for sale', () => {
    const state = stateWithCar(car) // carsForSale empty
    const result = drawDailyOffers(state, CONTEXT, createRng(1))
    expect(result.state.pendingOffers).toEqual([])
  })

  it('prunes a stale for-sale entry once the car is no longer owned', () => {
    const state = {
      ...stateWithCar(car),
      ownedCars: [],
      carsForSale: [{ carInstanceId: car.id, sinceDay: 1 }],
    }
    const result = drawDailyOffers(state, CONTEXT, createRng(1))
    expect(result.state.carsForSale).toEqual([])
  })

  it('draws a real, logged offer within a reasonable number of seeded attempts', () => {
    const state = {
      ...stateWithCar(car),
      carsForSale: [{ carInstanceId: car.id, sinceDay: 1 }],
    }
    let found = false
    for (let seed = 0; seed < 40 && !found; seed++) {
      const result = drawDailyOffers(state, CONTEXT, createRng(seed))
      if (result.state.pendingOffers.length > 0) {
        found = true
        expect(result.log).toContainEqual(
          expect.objectContaining({ type: 'offer-received', carInstanceId: car.id }),
        )
      }
    }
    expect(found).toBe(true)
  })
})

describe('resolveSellViaWalkIn (Sprint 31: resolves today’s pre-rolled offer)', () => {
  it('sells the car, adds cash, and releases its service bay slot', () => {
    const state = stateWithOffer(car, 900_000, 'tuner')
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual([null]) // slot cleared, not removed
    expect(result.state.cashYen).toBe(900_000)
    expect(result.state.carsForSale).toEqual([])
    expect(result.state.pendingOffers).toEqual([])
    expect(result.log[0]).toMatchObject({
      type: 'car-sold',
      channel: 'walk-in-offer',
      priceYen: 900_000,
    })
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithOffer(car, 900_000, 'tuner')
    const result = resolveSellViaWalkIn(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a no-op when there is no live offer today (Sprint 31: nothing to accept)', () => {
    const state = stateWithCar(car)
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('drops the car’s staged work (Sprint 18) so it never outlives the departed car', () => {
    const state = stateWithOffer(car, 900_000, 'tuner', {
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'engine', targetBand: 'mint' }] },
    })
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state.stagedCarWork[car.id]).toBeUndefined()
  })

  describe('Sprint 42: profitYen + ledger cleanup', () => {
    it('logs profitYen = priceYen minus (purchase + repairs + parts) when the purchase price is known, and deletes the ledger entry', () => {
      const state = stateWithOffer(car, 900_000, 'tuner', {
        carLedgers: {
          [car.id]: { purchaseYen: 500_000, repairYen: 100_000, partsYen: 50_000 },
        },
      })
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).toMatchObject({ profitYen: 900_000 - (500_000 + 100_000 + 50_000) })
      expect(result.state.carLedgers).not.toHaveProperty(car.id)
    })

    it('logs no profitYen when the purchase price is unknown (no ledger entry at all - a dev grant or pre-v25 save)', () => {
      const state = stateWithOffer(car, 900_000, 'tuner') // no carLedgers entry for car.id
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).not.toHaveProperty('profitYen')
    })

    it('logs no profitYen when the ledger exists but purchaseYen is explicitly null', () => {
      const state = stateWithOffer(car, 900_000, 'tuner', {
        carLedgers: { [car.id]: { purchaseYen: null, repairYen: 20_000, partsYen: 0 } },
      })
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).not.toHaveProperty('profitYen')
      // The ledger entry is still cleaned up even though profit couldn't be computed.
      expect(result.state.carLedgers).not.toHaveProperty(car.id)
    })

    it('a negative profitYen (a loss) is logged as-is, not clamped', () => {
      const state = stateWithOffer(car, 900_000, 'tuner', {
        carLedgers: { [car.id]: { purchaseYen: 1_200_000, repairYen: 0, partsYen: 0 } },
      })
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).toMatchObject({ profitYen: 900_000 - 1_200_000 })
    })

    it('cleaning up the ledger is a no-op (nothing to remove) when the car had no entry', () => {
      const state = stateWithOffer(car, 900_000, 'tuner')
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.state.carLedgers).toEqual({})
    })
  })

  describe('the organic teacher (Sprint 75 decision 2)', () => {
    const symptomaticCar: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        headValvetrain: { installed: { ...car.parts.headValvetrain.installed!, band: 'worn' } },
      },
      symptoms: [
        {
          symptomId: 'smokes-on-startup',
          trueCauseId: 'valve-seals',
          remainingCauseIds: ['valve-seals', 'tired-rings', 'head-gasket'],
          runTestIds: [],
        },
      ],
      apparentBandByPartId: { headValvetrain: 'mint' },
    }

    it('attaches a real saleRevealLine when the sold car still carries an unresolved symptom', () => {
      const state = stateWithOffer(symptomaticCar, 900_000, 'tuner')
      const result = resolveSellViaWalkIn(state, symptomaticCar.id, CONTEXT)
      const entry = result.log[0]
      expect(entry).toMatchObject({ type: 'car-sold' })
      expect(entry && 'saleRevealLine' in entry ? entry.saleRevealLine : undefined).toContain(
        'Valve seals',
      )
    })

    it('omits saleRevealLine for an honest car', () => {
      const state = stateWithOffer(car, 900_000, 'tuner')
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).not.toHaveProperty('saleRevealLine')
    })

    it('omits saleRevealLine once the symptom is already fully resolved (a workup or reveal-on-removal ran first)', () => {
      const resolvedCar: CarInstance = {
        ...symptomaticCar,
        symptoms: [{ ...symptomaticCar.symptoms[0]!, remainingCauseIds: ['valve-seals'] }],
      }
      const state = stateWithOffer(resolvedCar, 900_000, 'tuner')
      const result = resolveSellViaWalkIn(state, resolvedCar.id, CONTEXT)
      expect(result.log[0]).not.toHaveProperty('saleRevealLine')
    })
  })
})

describe('resolveScrapShell (Sprint 71 decision 7: the teardown game, scrap the whole car at once)', () => {
  it("pays the model's book value at the flat scrap fraction, removes the car, frees its bay, and clears its ledger", () => {
    const state = stateWithCar(car, {
      cashYen: 100_000,
      carLedgers: { [car.id]: { purchaseYen: 500_000, repairYen: 0, partsYen: 0 } },
    })
    const result = resolveScrapShell(state, car.id, CONTEXT)
    const expectedPriceYen = Math.round(
      model.bookValueYen * CONTEXT.economy.bands.scrapValueFraction,
    )

    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual([null]) // slot cleared, not removed
    expect(result.state.cashYen).toBe(100_000 + expectedPriceYen)
    expect(result.state.carLedgers).not.toHaveProperty(car.id)
    expect(result.log).toEqual([
      {
        type: 'shell-scrapped',
        carInstanceId: car.id,
        modelId: car.modelId,
        priceYen: expectedPriceYen,
        carPartIds: expect.arrayContaining(['block']), // still-installed slots
      },
    ])
  })

  it('lists only the parts still actually installed - a stripped-down car logs a smaller manifest', () => {
    const strippedCar: CarInstance = buildCarInstance({
      id: 'car-stripped',
      modelId: car.modelId,
      parts: mintCarParts({ dampers: null, seats: null }),
    })
    const state = stateWithCar(strippedCar)
    const result = resolveScrapShell(state, strippedCar.id, CONTEXT)
    const carPartIds = result.log[0]!.type === 'shell-scrapped' ? result.log[0]!.carPartIds : []
    expect(carPartIds).not.toContain('dampers')
    expect(carPartIds).not.toContain('seats')
    expect(carPartIds).toContain('block') // untouched slot, still on the stripped shell
  })

  it('drops the car’s staged work so it never outlives the scrapped shell', () => {
    const state = stateWithCar(car, {
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'engine', targetBand: 'mint' }] },
    })
    const result = resolveScrapShell(state, car.id, CONTEXT)
    expect(result.state.stagedCarWork[car.id]).toBeUndefined()
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveScrapShell(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('reputation side effects (Sprint 15; re-based on bands, Sprint 26; Sprint 31: via an accepted offer)', () => {
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

  it('accepting an offer on a quality car grants reputation immediately', () => {
    const state = stateWithOffer(qualityCar, 1_000_000, 'collector')
    const result = resolveSellViaWalkIn(state, qualityCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBeGreaterThan(0)
    expect(result.log[0]).toMatchObject({ reputationDelta: result.state.reputationPoints })
  })

  it('accepting an offer on a lemon logs the applied loss, not the nominal penalty (Sprint 24 fix 3)', () => {
    // A player at 2 points selling a lemon (nominal -5) only has 2 to
    // lose - `applyReputationDelta` floors at 0.
    const state = stateWithOffer(lemonCar, 300_000, 'first-timer', { reputationPoints: 2 })
    const result = resolveSellViaWalkIn(state, lemonCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0)
    expect(result.log[0]).toMatchObject({ reputationDelta: -2, saleQuality: 'lemon' })
  })

  it('accepting an offer on a lemon already at zero reputation has nothing left to lose, so logs no reputationDelta', () => {
    const state = stateWithOffer(lemonCar, 300_000, 'first-timer') // reputationPoints: 0
    const result = resolveSellViaWalkIn(state, lemonCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0)
    expect(result.log[0]).not.toHaveProperty('reputationDelta')
  })

  it('accepting an offer on an ordinary car carries no reputationDelta field', () => {
    const state = stateWithOffer(car, 900_000, 'tuner') // fixture car: one worn part, otherwise mint - unremarkable
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.log[0]).not.toHaveProperty('reputationDelta')
  })
})

describe('flooding interaction (Sprint 31): dumping copies of one model degrades its own offer odds via existing heat', () => {
  const controlModel = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!controlModel) throw new Error('fixture car missing from seed content')

  /**
   * Same flood-probe shape marketHeat.test.ts's own "flood probe" uses (20
   * bumps, two weekly updates, compared against an untouched control model)
   * - the sprint doc's own task framing is "dumping 3 same-model cars," but
   * a flood of only 3 isn't reliably bigger than a model's own +/-12 weekly
   * demand-wave noise (`marketPressure.WAVE_AMPLITUDE`), so this uses the
   * same well-beyond-the-wave magnitude the existing precedent established
   * to keep the proof real rather than occasionally flaky.
   */
  it('flooding one model with resolved sales lowers its offerChanceFor below an untouched control (existing heat mechanism, reused verbatim)', () => {
    let state = stateWithCar(car)
    for (let i = 0; i < 20; i++) state = bumpPlayerSales(state, model.id)
    state = { ...state, day: 7 }

    const week1 = updateMarketHeat(state, CONTEXT).state
    const week2 = updateMarketHeat({ ...week1, day: 14 }, CONTEXT).state

    const floodedHeat = week2.marketHeat[model.id] ?? 100
    const controlHeat = week2.marketHeat[controlModel.id] ?? 100
    expect(floodedHeat).toBeLessThan(controlHeat)

    const floodedChance = offerChanceFor(model, floodedHeat, ECONOMY)
    const controlChance = offerChanceFor(controlModel, controlHeat, ECONOMY)
    expect(floodedChance).toBeLessThan(controlChance)
  })
})
