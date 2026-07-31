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
  type SellingChannelId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { interestedBuyers } from '../src/bidding'
import { buildSimContext } from '../src/context'
import { bumpPlayerSales, updateMarketHeat } from '../src/marketHeat'
import { marketValueYen } from '../src/marketValue'
import {
  bestFitBuyer,
  drawDailyOffers,
  offerChanceFor,
  qualityMeanFor,
  resolveRejectOffer,
  resolveScrapShell,
  resolveSellViaWalkIn,
  resolveSetForSale,
  sellViaWalkIn,
  stalenessFor,
} from '../src/selling'
import { channelBuyerTaste, valuateCarForBuyer } from '../src/valuation'
import { createRng, type Rng } from '../src/rng'
import {
  assertPlacementInvariant,
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
  it("offers within the fresh quality-draw band of the chosen buyer's true valuation", () => {
    const offer = walkIn(car, model)
    const buyer = BUYERS.find((b) => b.id === offer.buyerId)
    if (!buyer) throw new Error('offer referenced an unknown buyer')
    const trueValue = valuate(buyer, car, model)
    // A walk-in prices at offersSeen = 0 (sellViaWalkIn.ts), so the drawn
    // fraction is clamped to [qualityFloor, 1.0] - never above true value,
    // never below the floor even on the tail of the Normal draw.
    const { qualityFloor } = ECONOMY.liquidity
    expect(offer.priceYen).toBeGreaterThanOrEqual(Math.round(trueValue * qualityFloor))
    expect(offer.priceYen).toBeLessThanOrEqual(trueValue)
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
  const entryModel = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!entryModel) throw new Error('fixture car missing from seed content')
  const entryCar: CarInstance = { ...car, modelId: entryModel.id }

  it('a collector never appears as the walk-in buyer for an entry-tier car', () => {
    // Per buyers.json, collector's tierPreferences list flagship and
    // enthusiast only, never entry.
    for (let seed = 0; seed < 50; seed++) {
      const offer = walkIn(entryCar, entryModel, BUYERS, 100, createRng(seed))
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
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
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
 * itself. Listed on `shopFront` by default; pass `carsForSale` in
 * `overrides` to test a different channel. */
function stateWithOffer(
  car: CarInstance,
  priceYen: number,
  buyerId: string,
  overrides: Partial<GameState> = {},
): GameState {
  return stateWithCar(car, {
    carsForSale: [
      { carInstanceId: car.id, offersSeen: 0, channelId: 'shopFront', weekendMeetPending: false },
    ],
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
    expect(result.state.carsForSale).toEqual([
      { carInstanceId: car.id, offersSeen: 0, channelId: 'shopFront', weekendMeetPending: false },
    ])
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
      carsForSale: [
        { carInstanceId: car.id, offersSeen: 0, channelId: 'shopFront', weekendMeetPending: false },
      ],
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

describe('resolveSetForSale (Sprint 31; channels, Sprint 114)', () => {
  it('toggles a car for sale on and off, defaulting to the free shopFront channel', () => {
    const state = stateWithCar(car)
    const on = resolveSetForSale(state, car.id, true, CONTEXT)
    expect(on.state.carsForSale).toEqual([
      {
        carInstanceId: car.id,
        offersSeen: 0,
        channelId: 'shopFront',
        weekendMeetPending: false,
      },
    ])

    const off = resolveSetForSale(on.state, car.id, false, CONTEXT)
    expect(off.state.carsForSale).toEqual([])
  })

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveSetForSale(state, 'ghost-car', true, CONTEXT)
    expect(result.state).toBe(state)
  })

  it('is a no-op when toggling to the state it is already in, on a non-weekendMeet channel', () => {
    const state = resolveSetForSale(stateWithCar(car), car.id, true, CONTEXT).state
    const result = resolveSetForSale(state, car.id, true, CONTEXT)
    expect(result.state).toBe(state)
  })

  it('turning off drops any live pending offer on that car too', () => {
    const state = stateWithOffer(car, 900_000, 'tuner')
    const result = resolveSetForSale(state, car.id, false, CONTEXT)
    expect(result.state.pendingOffers).toEqual([])
    expect(result.state.carsForSale).toEqual([])
  })

  it('listing on a channel charges its feeYen immediately (freeAdsPaper: 1,500)', () => {
    const state = stateWithCar(car, { cashYen: 100_000 })
    const result = resolveSetForSale(state, car.id, true, CONTEXT, 'freeAdsPaper')
    expect(result.state.cashYen).toBe(100_000 - CONTEXT.economy.sellingChannels.freeAdsPaper.feeYen)
    expect(result.state.carsForSale).toEqual([
      {
        carInstanceId: car.id,
        offersSeen: 0,
        channelId: 'freeAdsPaper',
        weekendMeetPending: false,
      },
    ])
  })

  it('shopFront and tradeNetwork carry no fee', () => {
    const state = stateWithCar(car, { cashYen: 100_000 })
    const shopFront = resolveSetForSale(state, car.id, true, CONTEXT, 'shopFront')
    expect(shopFront.state.cashYen).toBe(100_000)
    const tradeNetwork = resolveSetForSale(state, car.id, true, CONTEXT, 'tradeNetwork')
    expect(tradeNetwork.state.cashYen).toBe(100_000)
  })

  it('re-listing on a DIFFERENT channel pays that channel fee again, replacing the entry', () => {
    const listed = resolveSetForSale(
      stateWithCar(car, { cashYen: 100_000 }),
      car.id,
      true,
      CONTEXT,
      'shopFront',
    ).state
    const relisted = resolveSetForSale(listed, car.id, true, CONTEXT, 'tunerMagazine')
    expect(relisted.state.cashYen).toBe(
      100_000 - CONTEXT.economy.sellingChannels.tunerMagazine.feeYen,
    )
    expect(relisted.state.carsForSale).toEqual([
      {
        carInstanceId: car.id,
        offersSeen: 0,
        channelId: 'tunerMagazine',
        weekendMeetPending: false,
      },
    ])
  })

  it('carries a stale listing’s offersSeen forward at relistRecovery on a channel switch, rather than resetting to fresh (sprint147)', () => {
    const listed = resolveSetForSale(
      stateWithCar(car, { cashYen: 100_000 }),
      car.id,
      true,
      CONTEXT,
      'shopFront',
    ).state
    // resolveSetForSale itself never rolls the RNG or advances the day, so
    // offersSeen is seeded directly here rather than accumulated through a
    // probabilistic run of drawDailyOffers - this keeps the test a pure
    // check of the recovery formula.
    const stale = {
      ...listed,
      carsForSale: [{ ...listed.carsForSale[0]!, offersSeen: 10 }],
    }
    const relisted = resolveSetForSale(stale, car.id, true, CONTEXT, 'tunerMagazine')
    expect(relisted.state.carsForSale).toEqual([
      {
        carInstanceId: car.id,
        offersSeen: Math.round(10 * (1 - CONTEXT.economy.liquidity.relistRecovery)),
        channelId: 'tunerMagazine',
        weekendMeetPending: false,
      },
    ])
    // Never a full reset back to fresh, and never worse than it already was.
    expect(relisted.state.carsForSale[0]?.offersSeen).toBeLessThan(10)
    expect(relisted.state.carsForSale[0]?.offersSeen).toBeGreaterThan(0)
  })

  it('insufficient cash refuses quietly - no state change, no log entry', () => {
    const poor = stateWithCar(car, {
      cashYen: CONTEXT.economy.sellingChannels.tunerMagazine.feeYen - 1,
    })
    const result = resolveSetForSale(poor, car.id, true, CONTEXT, 'tunerMagazine')
    expect(result.state).toBe(poor)
    expect(result.log).toEqual([])
  })

  it('weekendMeet: listing sets weekendMeetPending, and re-listing on the SAME channel re-charges the fee (attend again)', () => {
    const state = stateWithCar(car, { cashYen: 100_000 })
    const first = resolveSetForSale(state, car.id, true, CONTEXT, 'weekendMeet')
    expect(first.state.carsForSale).toEqual([
      {
        carInstanceId: car.id,
        offersSeen: 0,
        channelId: 'weekendMeet',
        weekendMeetPending: true,
      },
    ])
    expect(first.state.cashYen).toBe(100_000 - CONTEXT.economy.sellingChannels.weekendMeet.feeYen)

    // Spend the flag, as drawDailyOffers would, then list again: the fee is
    // charged a second time and the flag comes back.
    const spent = {
      ...first.state,
      carsForSale: [{ ...first.state.carsForSale[0]!, weekendMeetPending: false }],
    }
    const again = resolveSetForSale(spent, car.id, true, CONTEXT, 'weekendMeet')
    expect(again.state.carsForSale[0]?.weekendMeetPending).toBe(true)
    expect(again.state.cashYen).toBe(
      spent.cashYen - CONTEXT.economy.sellingChannels.weekendMeet.feeYen,
    )
  })
})

describe('resolveSetForSale and the forecourt (sprint148)', () => {
  it('listing on a requiresForecourt channel moves the car onto the forecourt and frees its real slot', () => {
    // stateWithCar sits the car in the one service bay by default.
    const state = stateWithCar(car, { cashYen: 100_000 })
    const result = resolveSetForSale(state, car.id, true, CONTEXT, 'shopFront')
    expect(CONTEXT.economy.sellingChannels.shopFront.requiresForecourt).toBe(true)
    expect(result.state.forecourtCarIds).toEqual([car.id, null])
    expect(result.state.serviceBayCarIds).toEqual([null])
    assertPlacementInvariant(result.state)
  })

  it('refuses to list on a requiresForecourt channel with no forecourt slot free, no state change, and logs the block', () => {
    const state = stateWithCar(car, {
      cashYen: 100_000,
      forecourtBayCount: 1,
      forecourtCarIds: ['someone-elses-car'],
    })
    const result = resolveSetForSale(state, car.id, true, CONTEXT, 'shopFront')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'listing', reason: 'no-forecourt-space' },
    ])
  })

  it('switching between two forecourt-requiring channels keeps the same forecourt slot - no release and retake', () => {
    const listed = resolveSetForSale(
      stateWithCar(car, { cashYen: 100_000 }),
      car.id,
      true,
      CONTEXT,
      'shopFront',
    ).state
    expect(CONTEXT.economy.sellingChannels.freeAdsPaper.requiresForecourt).toBe(true)
    const switched = resolveSetForSale(listed, car.id, true, CONTEXT, 'freeAdsPaper')
    expect(switched.state.forecourtCarIds).toEqual(listed.forecourtCarIds)
    expect(switched.state.carsForSale[0]?.channelId).toBe('freeAdsPaper')
    assertPlacementInvariant(switched.state)
  })

  it('switching to the trade network (no forecourt needed) is a real move back to a real slot', () => {
    const listed = resolveSetForSale(
      stateWithCar(car, { cashYen: 100_000 }),
      car.id,
      true,
      CONTEXT,
      'shopFront',
    ).state
    expect(listed.forecourtCarIds).toContain(car.id)
    expect(CONTEXT.economy.sellingChannels.tradeNetwork.requiresForecourt).toBe(false)
    const switched = resolveSetForSale(listed, car.id, true, CONTEXT, 'tradeNetwork')
    expect(switched.state.forecourtCarIds).not.toContain(car.id)
    expect(
      switched.state.serviceBayCarIds.includes(car.id) ||
        switched.state.parkingCarIds.includes(car.id) ||
        switched.state.graceParkingCarId === car.id,
    ).toBe(true)
    assertPlacementInvariant(switched.state)
  })

  it('delisting a forecourt car with no real slot free takes the grace slot', () => {
    const state: GameState = {
      ...stateWithCar(car, { cashYen: 100_000 }),
      serviceBayCount: 1,
      serviceBayCarIds: ['other-car'],
      parkingBayCount: 1,
      parkingCarIds: ['another-car'],
      forecourtBayCount: 2,
      forecourtCarIds: [car.id, null],
      carsForSale: listedOn('shopFront'),
      graceParkingCarId: null,
    }
    const result = resolveSetForSale(state, car.id, false, CONTEXT)
    expect(result.state.graceParkingCarId).toBe(car.id)
    expect(result.state.forecourtCarIds).toEqual([null, null])
    expect(result.state.carsForSale).toEqual([])
    // assertPlacementInvariant only checks state.ownedCars (just `car` here,
    // per stateWithCar's own fixture) - 'other-car'/'another-car' are plain
    // slot-filler ids, not owned cars, so they're outside its scope.
    assertPlacementInvariant(result.state)
  })

  it('refuses to delist when even the grace slot is taken too - no state change', () => {
    const state: GameState = {
      ...stateWithCar(car, { cashYen: 100_000 }),
      serviceBayCount: 1,
      serviceBayCarIds: ['other-car'],
      parkingBayCount: 1,
      parkingCarIds: ['another-car'],
      forecourtBayCount: 2,
      forecourtCarIds: [car.id, null],
      carsForSale: listedOn('shopFront'),
      graceParkingCarId: 'someone-elses-car',
    }
    const result = resolveSetForSale(state, car.id, false, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
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

describe('stalenessFor / qualityMeanFor (sprint147: the normalised listing clock)', () => {
  it('a fresh listing (offersSeen = 0) has no staleness discount at all', () => {
    expect(stalenessFor(0, ECONOMY)).toBe(1)
  })

  it('offer chance falls as offersSeen rises, flooring at stalenessFloor and never below it', () => {
    const { stalenessFloor } = ECONOMY.liquidity
    const early = stalenessFor(1, ECONOMY)
    const later = stalenessFor(10, ECONOMY)
    expect(early).toBeLessThan(1)
    expect(later).toBeLessThan(early)
    expect(later).toBeGreaterThanOrEqual(stalenessFloor)
    expect(stalenessFor(10_000, ECONOMY)).toBeCloseTo(stalenessFloor, 6)
  })

  it("a fresh listing's expected offer is near qualityFresh; a long-stale one decays toward qualityFloor", () => {
    const { qualityFresh, qualityFloor } = ECONOMY.liquidity
    expect(qualityMeanFor(0, ECONOMY)).toBeCloseTo(qualityFresh, 6)
    expect(qualityMeanFor(10_000, ECONOMY)).toBeCloseTo(qualityFloor, 6)
    // Monotonic in between - more offers seen never IMPROVES the mean.
    expect(qualityMeanFor(1, ECONOMY)).toBeLessThan(qualityFresh)
    expect(qualityMeanFor(1, ECONOMY)).toBeGreaterThan(qualityMeanFor(10, ECONOMY))
  })

  it('both curves read offersSeen only - never a day count (the hard constraint this sprint exists to enforce)', () => {
    // Nothing about either function's signature accepts a day; this is a
    // structural guard as much as a behavioural one - the same offersSeen
    // value must produce the identical reading no matter how many
    // in-game days have elapsed around it.
    expect(stalenessFor(4, ECONOMY)).toBe(stalenessFor(4, ECONOMY))
    expect(qualityMeanFor(4, ECONOMY)).toBe(qualityMeanFor(4, ECONOMY))
  })
})

/** A listing entry on `channelId`, `shopFront`'s own defaults otherwise. */
function listedOn(
  channelId: SellingChannelId,
  overrides: Partial<GameState['carsForSale'][number]> = {},
): GameState['carsForSale'] {
  return [
    {
      carInstanceId: car.id,
      offersSeen: 0,
      channelId,
      weekendMeetPending: channelId === 'weekendMeet',
      ...overrides,
    },
  ]
}

describe('drawDailyOffers (Sprint 31 decision 2; channels, Sprint 114)', () => {
  it('is deterministic for the same seed', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
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
    const state = { ...stateWithCar(car), ownedCars: [], carsForSale: listedOn('shopFront') }
    const result = drawDailyOffers(state, CONTEXT, createRng(1))
    expect(result.state.carsForSale).toEqual([])
  })

  it('draws a real, logged offer within a reasonable number of seeded attempts', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
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

  describe('tradeNetwork', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('tradeNetwork') }

    it('prices priceBand-uniform against plain market value, buyer presented as the trade network itself', () => {
      let found = false
      for (let seed = 0; seed < 40 && !found; seed++) {
        const result = drawDailyOffers(state, CONTEXT, createRng(seed))
        const offer = result.state.pendingOffers[0]
        if (!offer) continue
        found = true
        expect(offer.buyerId).toBe('trade-network')
        const value = marketValueYen(
          model,
          car,
          100,
          CONTEXT.partsById,
          CONTEXT.partsTaxonomyById,
          ECONOMY,
        )
        const { min, max } = ECONOMY.sellingChannels.tradeNetwork.priceBand!
        expect(offer.priceYen).toBeGreaterThanOrEqual(Math.round(value * min))
        expect(offer.priceYen).toBeLessThanOrEqual(Math.round(value * max))
      }
      expect(found).toBe(true)
    })

    it('is deterministic for the same seed', () => {
      const a = drawDailyOffers(state, CONTEXT, createRng(3))
      const b = drawDailyOffers(state, CONTEXT, createRng(3))
      expect(a.state.pendingOffers).toEqual(b.state.pendingOffers)
    })
  })

  describe('weekendMeet: one guaranteed draw, then spent', () => {
    it('the flag is always consumed by the draw, hit or miss', () => {
      const state = { ...stateWithCar(car), carsForSale: listedOn('weekendMeet') }
      for (let seed = 0; seed < 10; seed++) {
        const result = drawDailyOffers(state, CONTEXT, createRng(seed))
        expect(result.state.carsForSale[0]?.weekendMeetPending).toBe(false)
      }
    })

    it('never draws again once the flag is spent, for any seed', () => {
      const spent = {
        ...stateWithCar(car),
        carsForSale: listedOn('weekendMeet', { weekendMeetPending: false }),
      }
      for (let seed = 0; seed < 20; seed++) {
        const result = drawDailyOffers(spent, CONTEXT, createRng(seed))
        expect(result.state.pendingOffers).toEqual([])
      }
    })

    it('can actually produce a real offer while the flag is still owed', () => {
      const state = { ...stateWithCar(car), carsForSale: listedOn('weekendMeet') }
      let found = false
      for (let seed = 0; seed < 40 && !found; seed++) {
        const result = drawDailyOffers(state, CONTEXT, createRng(seed))
        if (result.state.pendingOffers.length > 0) found = true
      }
      expect(found).toBe(true)
    })
  })

  describe('the mismatch mechanism (tunerMagazine, matchedOnly)', () => {
    /**
     * No REAL archetype's authored targets can fail this gate on every car,
     * because the taste-match formula's worst case is bounded
     * away from 0 (`1 - weighted-mean(target)`, never lower) whenever a
     * buyer's targets sit below 1.0 - true of all six shipped archetypes.
     * The tunerMagazine's own high ceiling (1.17) then stretches that floor
     * comfortably above the `>= 1` matched threshold for every real
     * archetype/car pairing tried. A synthetic buyer that cares only about
     * authenticity (target 1, importance 1 - the same pattern the
     * matched-sale block above uses) keeps this test's actual point alive:
     * the channel's own `matchedOnly` flag genuinely excludes a car the
     * buyer does not want, while the shop front still takes it.
     */
    const inauthenticityAverseBuyer = {
      id: 'entry-authenticity-only',
      archetype: 'first-timer' as const,
      displayName: 'Entry Authenticity Only',
      statTargets: {
        power: { target: 0, importance: 0 },
        handling: { target: 0, importance: 0 },
        style: { target: 0, importance: 0 },
        reliability: { target: 0, importance: 0 },
        authenticity: { target: 1, importance: 1 },
      },
      tierPreferences: [{ tier: 'entry' as const, weight: 1 }],
      wantLine: 'synthetic fixture buyer - no authored copy needed',
    }
    const mismatchContext = buildSimContext(
      CARS,
      PARTS,
      [inauthenticityAverseBuyer],
      PARTS_TAXONOMY,
    )

    const entryModel = CARS.find((c) => c.id === 'honda-city-e-aa')
    if (!entryModel) throw new Error('fixture car missing from seed content')
    const entryCar: CarInstance = buildCarInstance({
      modelId: entryModel.id,
      authenticityPercent: 0,
      parts: uniformCarParts('mint'),
    })

    it('an inauthentic entry-tier car listed in the magazine draws no offer on a seeded day the same car on shopFront does', () => {
      const shopFrontState: GameState = {
        ...stateWithCar(entryCar),
        carsForSale: listedOn('shopFront', { carInstanceId: entryCar.id }),
      }
      const magazineState: GameState = {
        ...shopFrontState,
        carsForSale: listedOn('tunerMagazine', { carInstanceId: entryCar.id }),
      }
      // Search for a seed that actually clears shopFront's own chance roll,
      // rather than pin one by hand - robust to any future change in how
      // much RNG each channel draw consumes.
      let found = false
      for (let seed = 0; seed < 100 && !found; seed++) {
        const shopFrontResult = drawDailyOffers(shopFrontState, mismatchContext, createRng(seed))
        if (shopFrontResult.state.pendingOffers.length === 0) continue
        found = true
        const magazineResult = drawDailyOffers(magazineState, mismatchContext, createRng(seed))
        expect(magazineResult.state.pendingOffers).toEqual([])
      }
      expect(found, 'no seed in range cleared shopFront’s own chance roll').toBe(true)
    })
  })

  describe('flag-driven dispatch (D1): a channel needs no code change to work', () => {
    // A channel defined only by existing content flags (offerChanceFactor,
    // tasteCeiling), added here in-test rather than to economy.json, and
    // never named in selling.ts. If dispatch still branches on channel id
    // anywhere, this channel falls through to no offer, ever - the exact
    // failure `matchedOnly` shipped with (declared and authored, ignored by
    // the code that reads channel id instead of channel flags).
    const FICTIONAL_CHANNEL_ID = 'fictionalChannel' as unknown as SellingChannelId
    const economyWithFictionalChannel = {
      ...CONTEXT.economy,
      sellingChannels: {
        ...CONTEXT.economy.sellingChannels,
        fictionalChannel: {
          feeYen: 0,
          offerChanceFactor: 1000,
          tasteCeiling: CONTEXT.economy.sellingChannels.shopFront.tasteCeiling,
        },
      },
    } as unknown as typeof CONTEXT.economy
    const fictionalContext: typeof CONTEXT = {
      ...CONTEXT,
      economy: economyWithFictionalChannel,
    }

    it('draws a real, logged offer through a channel selling.ts has never heard of', () => {
      const state = { ...stateWithCar(car), carsForSale: listedOn(FICTIONAL_CHANNEL_ID) }
      let found = false
      for (let seed = 0; seed < 10 && !found; seed++) {
        const result = drawDailyOffers(state, fictionalContext, createRng(seed))
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
})

describe('the normalised listing clock, end to end (sprint147)', () => {
  /** Never clears any real cadence chance (always < 1) - a deterministic
   * stand-in for "no buyer ever shows up," so the test below is an exact
   * assertion rather than a seed sweep hoping to avoid a lucky roll. */
  const neverShowsUp: Rng = {
    next: () => 0.999999,
    int: (min) => min,
    pick: (items) => items[0]!,
  }

  it('a listing that draws NO offers does not go stale over many days - the assertion that catches a day-based clock', () => {
    let state: GameState = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    for (let day = 0; day < 90; day++) {
      state = drawDailyOffers(state, CONTEXT, neverShowsUp).state
    }
    const entry = state.carsForSale[0]
    expect(entry?.offersSeen).toBe(0)
    expect(stalenessFor(entry?.offersSeen ?? -1, ECONOMY)).toBe(1)
    expect(qualityMeanFor(entry?.offersSeen ?? -1, ECONOMY)).toBeCloseTo(
      ECONOMY.liquidity.qualityFresh,
      6,
    )
  })

  it('offersSeen climbs by one each time a buyer genuinely shows up (the cadence roll clears), hit or miss', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    let seedThatClears: number | undefined
    for (let seed = 0; seed < 40; seed++) {
      const result = drawDailyOffers(state, CONTEXT, createRng(seed))
      if (result.state.carsForSale[0]?.offersSeen === 1) {
        seedThatClears = seed
        break
      }
    }
    expect(seedThatClears, 'no seed in range cleared the cadence roll').not.toBeUndefined()
  })

  it('the quality draw is deterministic for the same seed, per the seeding rule', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    const a = drawDailyOffers(state, CONTEXT, createRng(5))
    const b = drawDailyOffers(state, CONTEXT, createRng(5))
    expect(a.state.pendingOffers).toEqual(b.state.pendingOffers)
    expect(a.state.carsForSale).toEqual(b.state.carsForSale)
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

  it('frees the forecourt slot too, when the sold car was listed there (sprint148)', () => {
    const state = stateWithOffer(car, 900_000, 'tuner', {
      serviceBayCarIds: [], // not in a real slot any more - it's on the forecourt
      forecourtCarIds: [car.id, null],
    })
    const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.forecourtCarIds).toEqual([null, null])
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

  describe('the matched-sale word-of-mouth bonus (Sprint 114)', () => {
    // A synthetic buyer that cares only about authenticity (target 1,
    // importance 1; every other stat importance 0): `authenticity` is a
    // direct, uncapped passthrough of `car.authenticityPercent` (unlike
    // power/handling/style/reliability, which all cap below 100 through
    // their own stat formulas), so this is the one stat a fixture can push
    // to an exact match of 1.0 without depending on roster content.
    // score=1 -> shopFront taste clamps to exactly its 1.00 ceiling
    // (matched); the same buyer at authenticity 0 scores 0 -> taste 0.88
    // (not matched).
    const authenticityBuyer = {
      id: 'authenticity-only',
      archetype: 'collector' as const,
      displayName: 'Authenticity Only',
      statTargets: {
        power: { target: 0, importance: 0 },
        handling: { target: 0, importance: 0 },
        style: { target: 0, importance: 0 },
        reliability: { target: 0, importance: 0 },
        authenticity: { target: 1, importance: 1 },
      },
      tierPreferences: [{ tier: 'everyday' as const, weight: 1 }],
      wantLine: 'synthetic fixture buyer - no authored copy needed',
    }
    const matchedCar: CarInstance = buildCarInstance({
      modelId: car.modelId,
      authenticityPercent: 100,
      parts: uniformCarParts('mint'),
    })
    const mismatchedCar: CarInstance = buildCarInstance({
      modelId: car.modelId,
      authenticityPercent: 0,
      parts: uniformCarParts('mint'),
    })

    it('fires (stacks a reputation point on top) exactly when the buyer taste was >= 1.0', () => {
      expect(
        channelBuyerTaste(authenticityBuyer, model, matchedCar, {}, PARTS_TAXONOMY, ECONOMY, 1),
      ).toBeGreaterThanOrEqual(1)

      const matchedState = stateWithOffer(matchedCar, 900_000, authenticityBuyer.id)
      const matchedResult = resolveSellViaWalkIn(
        matchedState,
        matchedCar.id,
        buildSimContext(CARS, PARTS, [...BUYERS, authenticityBuyer], PARTS_TAXONOMY),
      )
      expect(matchedResult.log[0]).toMatchObject({ matchedSale: true })
      expect(matchedResult.state.reputationPoints).toBeGreaterThanOrEqual(
        CONTEXT.economy.reputation.matchedSaleRepBonus,
      )
    })

    it('never fires below taste 1.0', () => {
      expect(
        channelBuyerTaste(authenticityBuyer, model, mismatchedCar, {}, PARTS_TAXONOMY, ECONOMY, 1),
      ).toBeLessThan(1)

      const mismatchedState = stateWithOffer(mismatchedCar, 900_000, authenticityBuyer.id)
      const result = resolveSellViaWalkIn(
        mismatchedState,
        mismatchedCar.id,
        buildSimContext(CARS, PARTS, [...BUYERS, authenticityBuyer], PARTS_TAXONOMY),
      )
      expect(result.log[0]).not.toHaveProperty('matchedSale')
    })

    it('never fires through the trade network (no real persona behind the offer)', () => {
      const state = stateWithOffer(car, 900_000, 'trade-network', {
        carsForSale: [
          {
            carInstanceId: car.id,
            offersSeen: 0,
            channelId: 'tradeNetwork',
            weekendMeetPending: false,
          },
        ],
      })
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).not.toHaveProperty('matchedSale')
    })
  })
})

describe('ceiling clamps (Sprint 114): honest, per the lever table', () => {
  // Same authenticity-only synthetic buyer as the matched-sale block above -
  // score=1 exercises every channel's ceiling at its exact top.
  const perfectFitBuyer = {
    id: 'authenticity-only',
    archetype: 'collector' as const,
    displayName: 'Authenticity Only',
    statTargets: {
      power: { target: 0, importance: 0 },
      handling: { target: 0, importance: 0 },
      style: { target: 0, importance: 0 },
      reliability: { target: 0, importance: 0 },
      authenticity: { target: 1, importance: 1 },
    },
    tierPreferences: [],
    wantLine: 'synthetic fixture buyer - no authored copy needed',
  }
  const perfectFitCar: CarInstance = buildCarInstance({
    modelId: car.modelId,
    authenticityPercent: 100,
    parts: uniformCarParts('mint'),
  })

  it('shopFront never yields taste above its 1.00 ceiling, even at a perfect stat fit', () => {
    const taste = channelBuyerTaste(
      perfectFitBuyer,
      model,
      perfectFitCar,
      {},
      PARTS_TAXONOMY,
      ECONOMY,
      ECONOMY.sellingChannels.shopFront.tasteCeiling!,
    )
    expect(taste).toBeLessThanOrEqual(1.0)
  })

  it('the tuner magazine can exceed the standard 1.12 band top, up to its own 1.17 ceiling, on a matched draw', () => {
    const taste = channelBuyerTaste(
      perfectFitBuyer,
      model,
      perfectFitCar,
      {},
      PARTS_TAXONOMY,
      ECONOMY,
      ECONOMY.sellingChannels.tunerMagazine.tasteCeiling!,
    )
    expect(taste).toBeGreaterThan(1 + ECONOMY.valuation.tasteSpread)
    expect(taste).toBeLessThanOrEqual(ECONOMY.sellingChannels.tunerMagazine.tasteCeiling!)
  })

  it('the low end never moves - every channel shares the same floor as the standard band', () => {
    const worstFitCar: CarInstance = buildCarInstance({
      modelId: car.modelId,
      authenticityPercent: 0,
      parts: uniformCarParts('mint'),
    })
    const floor = 1 - ECONOMY.valuation.tasteSpread
    for (const channelId of [
      'shopFront',
      'freeAdsPaper',
      'tunerMagazine',
      'weekendMeet',
    ] as const) {
      const ceiling = ECONOMY.sellingChannels[channelId].tasteCeiling!
      const taste = channelBuyerTaste(
        perfectFitBuyer,
        model,
        worstFitCar,
        {},
        PARTS_TAXONOMY,
        ECONOMY,
        ceiling,
      )
      expect(taste).toBeCloseTo(floor, 6)
    }
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
    // 'trade-network' resolves to no real Buyer (TRADE_NETWORK_BUYER_ID,
    // selling.ts), so the matched-sale bonus structurally cannot fire here
    // regardless of taste - the fixture car (one worn part, otherwise mint)
    // is deliberately unremarkable enough to clear condition-based
    // reputation too - a real archetype is no longer a safe choice for
    // "definitely unmatched" here, since the taste-match formula reads this
    // car as a reasonable fit for most of them.
    const state = stateWithOffer(car, 900_000, 'trade-network')
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
