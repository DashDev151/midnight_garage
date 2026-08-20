import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  SCRIPTED_SERVICE_JOB,
  type BuyerArchetype,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type GameState,
  type SellingChannelId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { interestedBuyers } from '../src/bidding'
import { buildSimContext } from '../src/context'
import { resolveHireMachineLine } from '../src/jobs'
import { isSlotVerified, seedVerifiedSlots } from '../src/knowledge'
import { bumpPlayerSales, updateMarketHeat } from '../src/marketHeat'
import { marketValueYen } from '../src/marketValue'
import {
  bestFitBuyer,
  channelDrawWeighting,
  channelPriceBandRangeFor,
  drawDailyOffers,
  isSellingChannelUnlocked,
  likelyChannelBuyer,
  offerChanceFor,
  qualityMeanFor,
  resolveRejectOffer,
  resolveScrapShell,
  resolveSellViaWalkIn,
  resolveSetForSale,
  sellViaWalkIn,
  stalenessFor,
  type ChannelDrawWeighting,
} from '../src/selling'
import {
  channelBuyerTaste,
  valuateCarForBuyer,
  valuateCarForBuyerViaChannel,
} from '../src/valuation'
import { createRng, type Rng } from '../src/rng'
import {
  assertPlacementInvariant,
  buildCarInstance,
  carWithGrades,
  mintCarParts,
  neutralCulturePreferences,
  testSceneStanding,
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
  parts: mintCarParts({ block: 'worn' }),
})

/**
 * Authenticity fixtures for the synthetic authenticity-only buyers below.
 * The stat is derived from the slots now, so a fixture that wants a
 * particular authenticity has to BE that car rather than declare it.
 *
 * `authenticCar` is all stock and all mint, which is exactly 100 by
 * definition. `modifiedCar` swaps the heaviest-weighted slots the catalogue
 * actually ships an aftermarket SKU for, which lands well under any bar.
 * `strippedShell` has every slot empty: nothing original and nothing in any
 * condition, so it is the only fixture that reaches exactly 0 - the taste
 * floor cannot be reached with modification alone, because three body slots
 * carry no non-stock SKU at all.
 */
function authenticCar(modelId = model!.id): CarInstance {
  return buildCarInstance({ modelId, parts: uniformCarParts('mint') })
}

function modifiedCar(forModel: CarModel = model!): CarInstance {
  return carWithGrades(forModel, CONTEXT, {
    block: 'race',
    internals: 'race',
    headValvetrain: 'race',
    camsTiming: 'race',
    gearbox: 'race',
    aero: 'race',
    rims: 'race',
    seats: 'race',
  })
}

function strippedShell(modelId = model!.id): CarInstance {
  const empty = Object.fromEntries(ALL_CAR_PART_IDS.map((partId) => [partId, null]))
  return buildCarInstance({ modelId, parts: mintCarParts(empty) })
}

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

/**
 * Every channel-opening mission delivered - the default precondition for the
 * listing tests below, which are about fees, clocks and cadence rather than
 * about who has put your name forward yet. Derived from the shipped campaign
 * rather than naming mission ids, so re-authoring which mission opens which
 * channel never silently un-arms this fixture. The unlock behaviour itself is
 * tested against `storyMissions: []` in its own block.
 */
const EVERY_CHANNEL_OPEN: GameState['storyMissions'] = CONTEXT.storyMissions
  .filter((mission) => mission.unlocksSellingChannel !== undefined)
  .map((mission) => ({ missionId: mission.id, status: 'delivered' as const, acceptedOnDay: 1 }))

/**
 * The service-job counterpart to `EVERY_CHANNEL_OPEN` above: every channel a
 * service job (rather than a mission) claims, already unlocked - currently
 * just `freeAdsPaper`, via the stand owner's scripted job. Derived from
 * content rather than a hard-coded channel id, same reasoning as
 * `EVERY_CHANNEL_OPEN`.
 */
const EVERY_SERVICE_JOB_CHANNEL_OPEN: GameState['serviceJobChannelUnlocks'] = [
  ...CONTEXT.serviceJobTypes
    .map((t) => t.unlocksSellingChannel)
    .filter((channelId): channelId is SellingChannelId => channelId !== undefined),
  SCRIPTED_SERVICE_JOB.unlocksSellingChannel,
]

function stateWithCar(car: CarInstance, overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    sceneStanding: testSceneStanding(),
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
    benchParts: {},
    lift: { owned: false, hirePaidDay: null },
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    toolShopsOwned: [],
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
    storyMissions: EVERY_CHANNEL_OPEN,
    serviceJobChannelUnlocks: EVERY_SERVICE_JOB_CHANNEL_OPEN,
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
    const result = resolveRejectOffer(state, car.id, CONTEXT)

    expect(result.state.pendingOffers).toEqual([])
    // The whole point: rejecting one lowball is not the same as pulling the
    // car off the market. Normal-band heat (the fixture default), so no
    // second-offer roll happens at all.
    expect(result.state.carsForSale).toEqual([
      { carInstanceId: car.id, offersSeen: 0, channelId: 'shopFront', weekendMeetPending: false },
    ])
  })

  it('logs what was turned down, and costs no reputation', () => {
    const state = stateWithOffer(car, 500_000, BUYER)
    const result = resolveRejectOffer(state, car.id, CONTEXT)

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
    const result = resolveRejectOffer(state, car.id, CONTEXT)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.ownedCars.map((c) => c.id)).toContain(car.id)
  })

  it('is a no-op with no live offer, or for a car not owned', () => {
    const listedNoOffer = stateWithCar(car, {
      carsForSale: [
        { carInstanceId: car.id, offersSeen: 0, channelId: 'shopFront', weekendMeetPending: false },
      ],
    })
    expect(resolveRejectOffer(listedNoOffer, car.id, CONTEXT).state).toBe(listedNoOffer)
    expect(resolveRejectOffer(listedNoOffer, car.id, CONTEXT).log).toEqual([])

    const withOffer = stateWithOffer(car, 500_000, BUYER)
    expect(resolveRejectOffer(withOffer, 'ghost-car', CONTEXT).state).toBe(withOffer)
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
    const result = resolveRejectOffer(state, car.id, CONTEXT)
    expect(result.state.pendingOffers).toEqual([
      { carInstanceId: other.id, buyerId: BUYER, priceYen: 400_000 },
    ])
  })
})

/**
 * The hot-band second-offer roll (`economy.selling.hotSecondOfferChance`):
 * a rejection on a hot-band model gives the market one more seeded chance
 * to bring a different buyer to the same car the same day. Cold and normal
 * bands never roll at all - only the band changes, never the mechanism.
 */
describe('resolveRejectOffer: hot-band second offer', () => {
  const BUYER = BUYERS[0]!.id
  const HOT_HEAT = 130
  const NORMAL_HEAT = 100
  const COLD_HEAT = 70
  const DAY_SWEEP = 200

  function stateAtHeat(heatPercent: number, day: number, offersSeen = 0): GameState {
    return stateWithOffer(car, 500_000, BUYER, {
      day,
      marketHeat: { [model!.id]: heatPercent },
      carsForSale: [
        { carInstanceId: car.id, offersSeen, channelId: 'shopFront', weekendMeetPending: false },
      ],
    })
  }

  /** The roll is keyed on `state.day` (among other things), so sweeping the
   * day is how these tests find a seed that lands a second offer without
   * threading an rng into the resolver itself - the resolver takes none,
   * by design, since the whole point is that it derives its own seed from
   * state a replay already has. */
  function firstHotHit(): { day: number; result: ReturnType<typeof resolveRejectOffer> } {
    for (let day = 1; day <= DAY_SWEEP; day++) {
      const result = resolveRejectOffer(stateAtHeat(HOT_HEAT, day), car.id, CONTEXT)
      if (result.state.pendingOffers.length > 0) return { day, result }
    }
    throw new Error('no hot-band day in the sweep produced a second offer')
  }

  it('can draw a second offer, same day, from a DIFFERENT buyer than the one just rejected', () => {
    const { result } = firstHotHit()
    const secondOffer = result.state.pendingOffers[0]
    if (!secondOffer) throw new Error('expected a second offer')

    expect(secondOffer.carInstanceId).toBe(car.id)
    expect(secondOffer.buyerId).not.toBe(BUYER)
    expect(result.log).toEqual([
      expect.objectContaining({ type: 'offer-rejected', carInstanceId: car.id, buyerId: BUYER }),
      expect.objectContaining({
        type: 'offer-received',
        carInstanceId: car.id,
        buyerId: secondOffer.buyerId,
        priceYen: secondOffer.priceYen,
      }),
    ])
  })

  it('advances offersSeen by one when the second offer lands', () => {
    const { result } = firstHotHit()
    expect(result.state.carsForSale).toEqual([
      { carInstanceId: car.id, offersSeen: 1, channelId: 'shopFront', weekendMeetPending: false },
    ])
  })

  it('never rolls a second offer in the normal band, for any day', () => {
    for (let day = 1; day <= DAY_SWEEP; day++) {
      const result = resolveRejectOffer(stateAtHeat(NORMAL_HEAT, day), car.id, CONTEXT)
      expect(result.state.pendingOffers).toEqual([])
      expect(result.log).toEqual([
        expect.objectContaining({ type: 'offer-rejected', carInstanceId: car.id }),
      ])
      expect(result.state.carsForSale[0]?.offersSeen).toBe(0)
    }
  })

  it('never rolls a second offer in the cold band, for any day', () => {
    for (let day = 1; day <= DAY_SWEEP; day++) {
      const result = resolveRejectOffer(stateAtHeat(COLD_HEAT, day), car.id, CONTEXT)
      expect(result.state.pendingOffers).toEqual([])
      expect(result.state.carsForSale[0]?.offersSeen).toBe(0)
    }
  })

  it('is deterministic: the same day, car and offersSeen always draw the same follow-up', () => {
    const { day } = firstHotHit()
    const a = resolveRejectOffer(stateAtHeat(HOT_HEAT, day), car.id, CONTEXT)
    const b = resolveRejectOffer(stateAtHeat(HOT_HEAT, day), car.id, CONTEXT)
    expect(a.state.pendingOffers).toEqual(b.state.pendingOffers)
    expect(a.state.carsForSale).toEqual(b.state.carsForSale)
    expect(a.log).toEqual(b.log)
  })

  it("a miss (roll fails, or nobody's interested) leaves the car with no live offer and no cash/reputation change", () => {
    // Sweep for a day that does NOT land a second offer - the flip side of
    // firstHotHit above - and confirm it behaves exactly like a plain
    // rejection.
    let missDay: number | undefined
    for (let day = 1; day <= DAY_SWEEP; day++) {
      const result = resolveRejectOffer(stateAtHeat(HOT_HEAT, day), car.id, CONTEXT)
      if (result.state.pendingOffers.length === 0) {
        missDay = day
        break
      }
    }
    if (missDay === undefined) throw new Error('every hot-band day in the sweep hit')
    const state = stateAtHeat(HOT_HEAT, missDay)
    const result = resolveRejectOffer(state, car.id, CONTEXT)
    expect(result.state.pendingOffers).toEqual([])
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.ownedCars.map((c) => c.id)).toContain(car.id)
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

/**
 * The running-cost law: rent, bays, staff and
 * machine-shop hire are RUNNING costs and accrue to the business; a listing
 * fee is charged FOR a car and attributes to it. Before sprint150.md the
 * ledger carried only purchase/repairs/parts, so every fee paid to advertise
 * a car made the profit the game reported wrong by exactly that fee.
 */
describe('listing fees land on the car ledger (sprint150.md)', () => {
  const paidChannelFeeYen = CONTEXT.economy.sellingChannels.tunerMagazine.feeYen

  it("posts the channel's fee to the car's own ledger, by exactly the fee charged", () => {
    const state = stateWithCar(car, {
      cashYen: 1_000_000,
      carLedgers: {
        [car.id]: { purchaseYen: 500_000, repairYen: 0, partsYen: 0, listingFeesYen: 0 },
      },
    })
    const result = resolveSetForSale(state, car.id, true, CONTEXT, 'tunerMagazine')
    expect(paidChannelFeeYen).toBeGreaterThan(0)
    expect(result.state.carLedgers[car.id]?.listingFeesYen).toBe(paidChannelFeeYen)
    // Cash out and ledger in are the same figure - the ledger records money
    // that already moved, it never charges anything itself.
    expect(state.cashYen - result.state.cashYen).toBe(paidChannelFeeYen)
    // Nothing else on the ledger moves.
    expect(result.state.carLedgers[car.id]).toMatchObject({
      purchaseYen: 500_000,
      repairYen: 0,
      partsYen: 0,
    })
  })

  it('accumulates across re-listings rather than replacing the last fee paid', () => {
    const state = stateWithCar(car, {
      cashYen: 1_000_000,
      carLedgers: {
        [car.id]: { purchaseYen: 500_000, repairYen: 0, partsYen: 0, listingFeesYen: 0 },
      },
    })
    const first = resolveSetForSale(state, car.id, true, CONTEXT, 'freeAdsPaper').state
    const second = resolveSetForSale(first, car.id, true, CONTEXT, 'tunerMagazine').state
    expect(second.carLedgers[car.id]?.listingFeesYen).toBe(
      CONTEXT.economy.sellingChannels.freeAdsPaper.feeYen + paidChannelFeeYen,
    )
  })

  it('a free channel posts nothing at all - no fee, no ledger entry minted', () => {
    const state = stateWithCar(car, { cashYen: 1_000_000 }) // no ledger entry
    const result = resolveSetForSale(state, car.id, true, CONTEXT, 'shopFront')
    expect(CONTEXT.economy.sellingChannels.shopFront.feeYen).toBe(0)
    expect(result.state.carLedgers).toEqual({})
  })

  it('changes the profit the sale reports by exactly the fee, and by nothing else', () => {
    const ledgerNoFee = {
      purchaseYen: 500_000,
      repairYen: 100_000,
      partsYen: 50_000,
      listingFeesYen: 0,
    }
    const without = resolveSellViaWalkIn(
      stateWithOffer(car, 900_000, 'tuner', { carLedgers: { [car.id]: ledgerNoFee } }),
      car.id,
      CONTEXT,
    )
    const with_ = resolveSellViaWalkIn(
      stateWithOffer(car, 900_000, 'tuner', {
        carLedgers: { [car.id]: { ...ledgerNoFee, listingFeesYen: paidChannelFeeYen } },
      }),
      car.id,
      CONTEXT,
    )
    const soldWithout = without.log[0]
    const soldWith = with_.log[0]
    expect(soldWithout?.type).toBe('car-sold')
    expect(soldWith?.type).toBe('car-sold')
    if (soldWithout?.type !== 'car-sold' || soldWith?.type !== 'car-sold') return
    expect(soldWithout.profitYen).toBe(900_000 - (500_000 + 100_000 + 50_000))
    expect(soldWith.profitYen).toBe(soldWithout.profitYen! - paidChannelFeeYen)
    // Only the profit moves - the buyer paid the same money either way.
    expect(soldWith.priceYen).toBe(soldWithout.priceYen)
  })

  /**
   * The other half of the same ruling, asserted so it cannot drift: a day's
   * machine-shop hire can pull four engines, so it belongs to no single car.
   * `resolveHireMachineLine` charges the day and must never touch a ledger.
   */
  it('machine-shop hire never appears on any car ledger', () => {
    const state = stateWithCar(car, { cashYen: 1_000_000 })
    const hired = resolveHireMachineLine(state, 'engine', CONTEXT)
    expect(hired.state.cashYen).toBeLessThan(state.cashYen) // a real charge landed
    expect(hired.state.carLedgers).toEqual({})
    expect(hired.log.some((e) => e.type === 'machine-hired')).toBe(true)
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
      weekendMeetPending: CONTEXT.economy.sellingChannels[channelId]?.oneDrawNextEndDay === true,
      ...overrides,
    },
  ]
}

describe('drawDailyOffers (Sprint 31 decision 2; channels, Sprint 114)', () => {
  it('is deterministic for the same seed', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    const a = drawDailyOffers(state, CONTEXT, createRng(9), state.day)
    const b = drawDailyOffers(state, CONTEXT, createRng(9), state.day)
    expect(a.state.pendingOffers).toEqual(b.state.pendingOffers)
    expect(a.log).toEqual(b.log)
  })

  it('never draws an offer for a car not marked for sale', () => {
    const state = stateWithCar(car) // carsForSale empty
    const result = drawDailyOffers(state, CONTEXT, createRng(1), state.day)
    expect(result.state.pendingOffers).toEqual([])
  })

  it('prunes a stale for-sale entry once the car is no longer owned', () => {
    const state = { ...stateWithCar(car), ownedCars: [], carsForSale: listedOn('shopFront') }
    const result = drawDailyOffers(state, CONTEXT, createRng(1), state.day)
    expect(result.state.carsForSale).toEqual([])
  })

  it('draws a real, logged offer within a reasonable number of seeded attempts', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    let found = false
    for (let seed = 0; seed < 40 && !found; seed++) {
      const result = drawDailyOffers(state, CONTEXT, createRng(seed), state.day)
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
        const result = drawDailyOffers(state, CONTEXT, createRng(seed), state.day)
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
      const a = drawDailyOffers(state, CONTEXT, createRng(3), state.day)
      const b = drawDailyOffers(state, CONTEXT, createRng(3), state.day)
      expect(a.state.pendingOffers).toEqual(b.state.pendingOffers)
    })

    it('reports the band as the two ends of the draw it actually takes', () => {
      const range = channelPriceBandRangeFor(car, model, 'tradeNetwork', 100, CONTEXT)!
      expect(range.channelId).toBe('tradeNetwork')
      expect(range.minYen).toBeLessThan(range.maxYen)

      // Every offer this channel can produce sits inside the reported range,
      // which is the whole claim the two figures make.
      let drawn = 0
      for (let seed = 0; seed < 60; seed++) {
        const offer = drawDailyOffers(state, CONTEXT, createRng(seed), state.day).state
          .pendingOffers[0]
        if (!offer) continue
        drawn += 1
        expect(offer.priceYen).toBeGreaterThanOrEqual(range.minYen)
        expect(offer.priceYen).toBeLessThanOrEqual(range.maxYen)
      }
      expect(drawn).toBeGreaterThan(0)
    })

    it('has no band to report on a channel that prices through taste', () => {
      expect(channelPriceBandRangeFor(car, model, 'shopFront', 100, CONTEXT)).toBeNull()
    })
  })

  describe('weekendMeet: one guaranteed draw, then spent, on its real day (sprint149)', () => {
    // The meet only resolves on calendar.meetDayOfWeek now, not on whichever
    // day happens to be the next End Day after listing - a non-meet day is
    // just any day that isn't it.
    const MEET_DAY = ECONOMY.calendar.meetDayOfWeek
    const NON_MEET_DAY = MEET_DAY === 1 ? 2 : 1

    it('stays pending, drawing nothing, on a non-meet day, for any seed', () => {
      const state = {
        ...stateWithCar(car),
        day: NON_MEET_DAY,
        carsForSale: listedOn('weekendMeet'),
      }
      for (let seed = 0; seed < 20; seed++) {
        const result = drawDailyOffers(state, CONTEXT, createRng(seed), NON_MEET_DAY)
        expect(result.state.carsForSale[0]?.weekendMeetPending).toBe(true)
        expect(result.state.pendingOffers).toEqual([])
      }
    })

    it('the flag is always consumed by the draw once the meet day arrives, hit or miss', () => {
      const state = { ...stateWithCar(car), day: MEET_DAY, carsForSale: listedOn('weekendMeet') }
      for (let seed = 0; seed < 10; seed++) {
        const result = drawDailyOffers(state, CONTEXT, createRng(seed), MEET_DAY)
        expect(result.state.carsForSale[0]?.weekendMeetPending).toBe(false)
      }
    })

    it('never draws again once the flag is spent, for any seed, meet day or not', () => {
      const spent = {
        ...stateWithCar(car),
        day: MEET_DAY,
        carsForSale: listedOn('weekendMeet', { weekendMeetPending: false }),
      }
      for (let seed = 0; seed < 20; seed++) {
        const result = drawDailyOffers(spent, CONTEXT, createRng(seed), MEET_DAY)
        expect(result.state.pendingOffers).toEqual([])
      }
    })

    it('can actually produce a real offer while the flag is still owed, on the meet day', () => {
      // The plain fixture `car` (one worn block, otherwise stock) now fails
      // every buyer's champion gate or culture affinity for weekendMeet's
      // matchedOnly bar - unmatchable is the sprint182.md point. A genuinely
      // matched car is needed to prove the "guaranteed draw" mechanism can
      // still produce a real offer: this build clears the Show Crowd's
      // champion (style) comfortably, and the car's own touge culture still
      // carries a real affinity (0.65) for that buyer.
      const matchedCar = carWithGrades(
        model,
        CONTEXT,
        { aero: 'race', rims: 'race', seats: 'race', dashGauges: 'race', exhaust: 'race' },
        'mint',
      )
      const state = {
        ...stateWithCar(matchedCar),
        day: MEET_DAY,
        carsForSale: listedOn('weekendMeet'),
      }
      let found = false
      for (let seed = 0; seed < 40 && !found; seed++) {
        const result = drawDailyOffers(state, CONTEXT, createRng(seed), MEET_DAY)
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
      archetype: 'daily-drivers' as const,
      displayName: 'Entry Authenticity Only',
      statTargets: {
        power: { target: 0, importance: 0 },
        handling: { target: 0, importance: 0 },
        style: { target: 0, importance: 0 },
        reliability: { target: 0, importance: 0 },
        authenticity: { target: 1, importance: 1 },
      },
      tierPreferences: [{ tier: 'entry' as const, weight: 1 }],
      culturePreferences: neutralCulturePreferences(),
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
    const entryCar: CarInstance = modifiedCar(entryModel)

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
        const shopFrontResult = drawDailyOffers(
          shopFrontState,
          mismatchContext,
          createRng(seed),
          shopFrontState.day,
        )
        if (shopFrontResult.state.pendingOffers.length === 0) continue
        found = true
        const magazineResult = drawDailyOffers(
          magazineState,
          mismatchContext,
          createRng(seed),
          magazineState.day,
        )
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
        const result = drawDailyOffers(state, fictionalContext, createRng(seed), state.day)
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
      state = drawDailyOffers(state, CONTEXT, neverShowsUp, state.day).state
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
      const result = drawDailyOffers(state, CONTEXT, createRng(seed), state.day)
      if (result.state.carsForSale[0]?.offersSeen === 1) {
        seedThatClears = seed
        break
      }
    }
    expect(seedThatClears, 'no seed in range cleared the cadence roll').not.toBeUndefined()
  })

  it('the quality draw is deterministic for the same seed, per the seeding rule', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    const a = drawDailyOffers(state, CONTEXT, createRng(5), state.day)
    const b = drawDailyOffers(state, CONTEXT, createRng(5), state.day)
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

  describe('Sprint 42: profitYen + ledger cleanup', () => {
    it('logs profitYen = priceYen minus (purchase + repairs + parts) when the purchase price is known, and deletes the ledger entry', () => {
      const state = stateWithOffer(car, 900_000, 'tuner', {
        carLedgers: {
          [car.id]: {
            purchaseYen: 500_000,
            repairYen: 100_000,
            partsYen: 50_000,
            listingFeesYen: 0,
          },
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
        carLedgers: {
          [car.id]: { purchaseYen: null, repairYen: 20_000, partsYen: 0, listingFeesYen: 0 },
        },
      })
      const result = resolveSellViaWalkIn(state, car.id, CONTEXT)
      expect(result.log[0]).not.toHaveProperty('profitYen')
      // The ledger entry is still cleaned up even though profit couldn't be computed.
      expect(result.state.carLedgers).not.toHaveProperty(car.id)
    })

    it('a negative profitYen (a loss) is logged as-is, not clamped', () => {
      const state = stateWithOffer(car, 900_000, 'tuner', {
        carLedgers: {
          [car.id]: { purchaseYen: 1_200_000, repairYen: 0, partsYen: 0, listingFeesYen: 0 },
        },
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
          latent: false,
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

  describe('the matched-sale word-of-mouth flag and its scene credit (Sprint 114)', () => {
    // A synthetic buyer that cares only about authenticity (target 1,
    // importance 1; every other stat importance 0): an all-stock, all-mint
    // car reads authenticity exactly 100 by construction (unlike
    // power/handling/style/reliability, which all cap below 100 through
    // their own stat formulas), so this is the one stat a fixture can push
    // to an exact match of 1.0 without depending on roster content.
    // score=1 -> shopFront taste clamps to exactly its 1.00 ceiling
    // (matched); a car that scores 0 on the same buyer gets taste 0.88
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
      culturePreferences: neutralCulturePreferences(),
      wantLine: 'synthetic fixture buyer - no authored copy needed',
    }
    const matchedCar: CarInstance = authenticCar()
    const mismatchedCar: CarInstance = modifiedCar()

    it('fires (and credits the scene) exactly when the buyer taste was >= 1.0', () => {
      expect(
        channelBuyerTaste(
          authenticityBuyer,
          model,
          matchedCar,
          CONTEXT.partsById,
          PARTS_TAXONOMY,
          ECONOMY,
          1,
        ),
      ).toBeGreaterThanOrEqual(1)

      const matchedState = stateWithOffer(matchedCar, 900_000, authenticityBuyer.id)
      const matchedResult = resolveSellViaWalkIn(
        matchedState,
        matchedCar.id,
        buildSimContext(CARS, PARTS, [...BUYERS, authenticityBuyer], PARTS_TAXONOMY),
      )
      expect(matchedResult.log[0]).toMatchObject({ matchedSale: true })
      // This buyer cares about exactly one stat and the car clears it, so
      // every stat they care about is cleared: Delighted, the top rung.
      expect(matchedResult.state.reputationPoints).toBe(
        CONTEXT.economy.reputation.delightedSaleBonus,
      )
      // Scene standing's own earn event (scene-standing-arc.md step 4): the
      // buyer's own archetype (`collector`) gets the ledger entry, with no
      // tag anywhere - the buyer IS the scene.
      expect(matchedResult.state.sceneLedger?.collector).toEqual([
        {
          carInstanceId: matchedCar.id,
          modelId: model.id,
          priceYen: 900_000,
          day: matchedState.day,
        },
      ])
    })

    it('never fires below taste 1.0', () => {
      expect(
        channelBuyerTaste(
          authenticityBuyer,
          model,
          mismatchedCar,
          CONTEXT.partsById,
          PARTS_TAXONOMY,
          ECONOMY,
          1,
        ),
      ).toBeLessThan(1)

      const mismatchedState = stateWithOffer(mismatchedCar, 900_000, authenticityBuyer.id)
      const result = resolveSellViaWalkIn(
        mismatchedState,
        mismatchedCar.id,
        buildSimContext(CARS, PARTS, [...BUYERS, authenticityBuyer], PARTS_TAXONOMY),
      )
      expect(result.log[0]).not.toHaveProperty('matchedSale')
      // No scene credited either - an unmatched sale earns nothing.
      expect(result.state.sceneLedger).toBeUndefined()
    })

    it('never fires through the trade network (no real persona behind the offer), and credits no scene standing at all', () => {
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
      // The trade's own non-persona buyer can never be a scene - the ledger
      // and every scene's stage stay exactly as they started.
      expect(result.state.sceneLedger).toBeUndefined()
      expect(result.state.sceneStanding).toEqual(state.sceneStanding)
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
    culturePreferences: neutralCulturePreferences(),
    wantLine: 'synthetic fixture buyer - no authored copy needed',
  }
  const perfectFitCar: CarInstance = authenticCar()

  it('shopFront never yields taste above its 1.00 ceiling, even at a perfect stat fit', () => {
    const taste = channelBuyerTaste(
      perfectFitBuyer,
      model,
      perfectFitCar,
      CONTEXT.partsById,
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
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
      ECONOMY.sellingChannels.tunerMagazine.tasteCeiling!,
    )
    expect(taste).toBeGreaterThan(1 + ECONOMY.valuation.tasteSpread)
    expect(taste).toBeLessThanOrEqual(ECONOMY.sellingChannels.tunerMagazine.tasteCeiling!)
  })

  it('the low end never moves - every channel shares the same floor as the standard band', () => {
    const worstFitCar: CarInstance = strippedShell()
    const floor = 1 - ECONOMY.valuation.tasteSpread
    for (const channelId of [
      'shopFront',
      'freeAdsPaper',
      'tunerMagazine',
      'weekendMeet',
      'collectorNetwork',
    ] as const) {
      const ceiling = ECONOMY.sellingChannels[channelId].tasteCeiling!
      const taste = channelBuyerTaste(
        perfectFitBuyer,
        model,
        worstFitCar,
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        ECONOMY,
        ceiling,
      )
      expect(taste).toBeCloseTo(floor, 6)
    }
  })
})

/**
 * A channel is a buyer base before it is a price with a fee attached
 * (sprint156.md). Every claim below is measured through the shipped draw
 * (`drawDailyOffers`) or the shipped deterministic read
 * (`likelyChannelBuyer`), never against a reimplementation of the weighting.
 */
describe('a channel is a buyer base (sprint156)', () => {
  function requireModel(modelId: string): CarModel {
    const found = CARS.find((c) => c.id === modelId)
    if (!found) throw new Error(`fixture car ${modelId} missing from seed content`)
    return found
  }
  const KEI_MODEL = requireModel('suzuki-wagon-r-ct21s')
  const STYLE_MODEL = requireModel('nissan-silvia-s13')

  /** A tidy example of `forModel`, built from that model's OWN fitment class
   * (never the fixture default's `everyday` parts, which would price a kei's
   * slots at four times what they cost). */
  function tidy(forModel: CarModel): CarInstance {
    return carWithGrades(forModel, CONTEXT, {})
  }

  /**
   * A Silvia genuinely wanted by two different buyers. A stock car (`tidy`)
   * is unmatchable by anybody now (sprint182.md's champion gate), so the
   * channel-comparison tests below need a build that clears more than one
   * buyer's own champion: full race engine work clears the Tuner's power
   * target (390 PS), the same pass at the style-bearing slots clears the
   * Show Crowd's, and the S13's own drift culture sits at 0.90+ affinity for
   * both, so neither gate is a near thing.
   */
  function builtStyleCar(): CarInstance {
    return carWithGrades(
      STYLE_MODEL,
      CONTEXT,
      {
        block: 'race',
        internals: 'race',
        headValvetrain: 'race',
        camsTiming: 'race',
        intake: 'race',
        exhaust: 'race',
        fuelSystem: 'race',
        ignitionEcu: 'race',
        cooling: 'race',
        forcedInduction: 'race',
        gearbox: 'race',
        clutch: 'race',
        driveline: 'race',
        differential: 'race',
        aero: 'race',
        rims: 'race',
        seats: 'race',
        dashGauges: 'race',
      },
      'mint',
    )
  }

  const MEET_DAY = ECONOMY.calendar.meetDayOfWeek

  /** Every offer `channelId` draws on `target` across `seedCount` seeded days,
   * through the real daily draw. A seed that draws nothing (the cadence roll
   * missed, or a matched-only channel rejected whoever turned up) contributes
   * nothing, which is itself part of what these tests measure. */
  function sweep(
    target: CarInstance,
    forModel: CarModel,
    channelId: SellingChannelId,
    seedCount = 200,
    stateOverrides: Partial<GameState> = {},
  ): { buyerId: string; priceYen: number }[] {
    const oneDraw = CONTEXT.economy.sellingChannels[channelId].oneDrawNextEndDay === true
    const day = oneDraw ? MEET_DAY : 1
    const base = stateWithCar(target, {
      day,
      carsForSale: [
        {
          carInstanceId: target.id,
          offersSeen: 0,
          channelId,
          weekendMeetPending: oneDraw,
        },
      ],
      ...stateOverrides,
    })
    const stateForModel: GameState = { ...base, ownedCars: [{ ...target, modelId: forModel.id }] }
    const offers: { buyerId: string; priceYen: number }[] = []
    for (let seed = 0; seed < seedCount; seed++) {
      const drawn = drawDailyOffers(stateForModel, CONTEXT, createRng(seed), day)
      for (const offer of drawn.state.pendingOffers) {
        offers.push({ buyerId: offer.buyerId, priceYen: offer.priceYen })
      }
    }
    return offers
  }

  function shareOf(offers: { buyerId: string }[], buyerIds: readonly string[]): number {
    if (offers.length === 0) return 0
    return offers.filter((o) => buyerIds.includes(o.buyerId)).length / offers.length
  }

  /** What `channelId` would price `target` at, through the buyer that channel
   * itself most likely brings - the same pair of reads the worked example's
   * quote table uses, with no roll in either. */
  function channelQuote(
    target: CarInstance,
    forModel: CarModel,
    channelId: SellingChannelId,
    reputationTier: GameState['reputationTier'] = 'unknown',
  ): { buyerId: string | undefined; priceYen: number } {
    const channel = ECONOMY.sellingChannels[channelId]
    const weighting = channelDrawWeighting(channel, reputationTier, ECONOMY)
    const buyer = likelyChannelBuyer(
      target,
      forModel,
      CONTEXT.buyers,
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      CONTEXT.partsTaxonomyById,
      100,
      ECONOMY,
      weighting,
    )
    if (!buyer || channel.tasteCeiling === undefined) return { buyerId: buyer?.id, priceYen: 0 }
    return {
      buyerId: buyer.id,
      priceYen: valuateCarForBuyerViaChannel(
        buyer,
        forModel,
        target,
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        CONTEXT.partsTaxonomyById,
        100,
        ECONOMY,
        channel.tasteCeiling,
      ),
    }
  }

  describe('the magazine and the meet are two buyer bases, not one with two invoices', () => {
    const styleCar = builtStyleCar()

    it('brings a different person, and therefore a different price, on the same car', () => {
      const magazine = channelQuote(styleCar, STYLE_MODEL, 'tunerMagazine')
      const meet = channelQuote(styleCar, STYLE_MODEL, 'weekendMeet')
      expect(magazine.buyerId).not.toBe(meet.buyerId)
      expect(magazine.priceYen).not.toBe(meet.priceYen)
    })

    it('draws measurably different crowds through the real daily draw', () => {
      const magazineOffers = sweep(styleCar, STYLE_MODEL, 'tunerMagazine')
      const meetOffers = sweep(styleCar, STYLE_MODEL, 'weekendMeet')
      expect(magazineOffers.length).toBeGreaterThan(20)
      expect(meetOffers.length).toBeGreaterThan(20)
      // The magazine is read by people chasing numbers; the meet is a car park
      // full of people looking at how a car sits.
      expect(shareOf(magazineOffers, ['tuner', 'racer'])).toBeGreaterThan(
        shareOf(meetOffers, ['tuner', 'racer']),
      )
      expect(shareOf(meetOffers, ['show-crowd'])).toBeGreaterThan(
        shareOf(magazineOffers, ['show-crowd']),
      )
    })
  })

  describe('a kei has a channel that is unambiguously good for it', () => {
    const keiCar = tidy(KEI_MODEL)

    it('the free ads paper beats the shop front on all three axes, once its job is delivered', () => {
      // Who: the archetypes that actually state an interest in this league of
      // car arrive far more often through the paper than off the forecourt.
      const keiInterested = CONTEXT.buyers
        .filter((b) => b.tierPreferences.some((p) => p.tier === KEI_MODEL.tier && p.weight > 0))
        .map((b) => b.id)
      expect(keiInterested).toEqual(expect.arrayContaining(['daily-drivers', 'touge']))
      const paperOffers = sweep(keiCar, KEI_MODEL, 'freeAdsPaper')
      const shopOffers = sweep(keiCar, KEI_MODEL, 'shopFront')
      expect(paperOffers.length).toBeGreaterThan(20)
      expect(shopOffers.length).toBeGreaterThan(20)
      expect(shareOf(paperOffers, keiInterested)).toBeGreaterThan(
        shareOf(shopOffers, keiInterested),
      )

      // How much: the paper's ceiling clears the shop front's 1.00.
      expect(channelQuote(keiCar, KEI_MODEL, 'freeAdsPaper').priceYen).toBeGreaterThan(
        channelQuote(keiCar, KEI_MODEL, 'shopFront').priceYen,
      )

      // How often: an ordinary car is exactly what the classifieds move.
      expect(
        ECONOMY.sellingChannels.freeAdsPaper.offerChanceFactorByRarity![KEI_MODEL.rarity],
      ).toBeGreaterThan(ECONOMY.sellingChannels.shopFront.offerChanceFactor!)

      // Unlike the two premium channels, nothing here needs a MISSION - the
      // stand owner's scripted service job claims it instead (sprint205.md),
      // so it is shut until that job is delivered rather than open for free.
      expect(
        isSellingChannelUnlocked(
          stateWithCar(keiCar, { storyMissions: [], serviceJobChannelUnlocks: [] }),
          CONTEXT,
          'freeAdsPaper',
        ),
      ).toBe(false)
      expect(
        isSellingChannelUnlocked(
          stateWithCar(keiCar, { storyMissions: [], serviceJobChannelUnlocks: ['freeAdsPaper'] }),
          CONTEXT,
          'freeAdsPaper',
        ),
      ).toBe(true)
    })

    /**
     * The Show Crowd's own meet weight rose to 2.2 (the single highest weight
     * on any persona channel), which makes the Show Crowd the meet's likely
     * buyer for almost any car, including a boring stock kei it does not
     * actually want (style far under its target). So the meet, once unlocked,
     * no longer dominates for this tier - the free ads paper does, and stays
     * the best-priced of the four even once the meet opens. Measured, not
     * assumed: daily-drivers 230,000 (shopFront) / 241,500 (freeAdsPaper),
     * racer 229,562 (tunerMagazine), show-crowd 224,894 (weekendMeet).
     */
    it('the free ads paper stays the best-priced channel of the four even once the weekend meet opens', () => {
      const quotes = (['shopFront', 'freeAdsPaper', 'tunerMagazine', 'weekendMeet'] as const).map(
        (channelId) => ({ channelId, ...channelQuote(keiCar, KEI_MODEL, channelId) }),
      )
      const paper = quotes.find((q) => q.channelId === 'freeAdsPaper')!
      const meet = quotes.find((q) => q.channelId === 'weekendMeet')!
      expect(paper.buyerId).toBe('daily-drivers')
      expect(meet.buyerId).toBe('show-crowd')
      for (const quote of quotes) {
        if (quote.channelId === 'freeAdsPaper') continue
        expect(paper.priceYen, `${quote.channelId}`).toBeGreaterThan(quote.priceYen)
      }
    })

    it('and the paper beats the tuner magazine on a kei on the measure a player actually compares', () => {
      // Not "does the magazine ever draw" - it does, because widening reaches
      // the people who would pay for an unmolested survivor, and that is right.
      // The question is what a listed day is worth: the classifieds move an
      // ordinary common car at more than twice the rate a tuning monthly does,
      // and cost ¥10,500 less to open. Measured over the same seeds through
      // the real draw, so the cadence, the matched gate and the pool all count.
      const SEEDS = 200
      const perDay = (channelId: SellingChannelId): number => {
        const offers = sweep(keiCar, KEI_MODEL, channelId, SEEDS)
        const total = offers.reduce((sum, o) => sum + o.priceYen, 0)
        return total / SEEDS
      }
      // Measured on a tidy Wagon R over these 200 seeds, for the record:
      // the paper draws on every one of them at a mean ¥227,155, the magazine
      // on 18 at a mean ¥235,466. ¥227,155 a listed day against ¥21,192, for
      // an eighth of the fee.
      expect(perDay('freeAdsPaper')).toBeGreaterThan(perDay('tunerMagazine'))
      expect(ECONOMY.sellingChannels.freeAdsPaper.feeYen).toBeLessThan(
        ECONOMY.sellingChannels.tunerMagazine.feeYen,
      )
      // And the magazine's own authoring says who it is for: Daily Drivers,
      // the practical archetype a kei sells to (hobbyist's deleted demand
      // inherited it), sits at the bottom of its pool and the top of the
      // paper's. Touge also has an entry-tier interest, but is a magazine
      // scene by nature (handling press), not a paper one, so it does not
      // share this direction and is deliberately not asserted here.
      const magazine = ECONOMY.sellingChannels.tunerMagazine.buyerPoolWeights!
      const paper = ECONOMY.sellingChannels.freeAdsPaper.buyerPoolWeights!
      expect(magazine['daily-drivers']).toBeLessThan(paper['daily-drivers'])
    })
  })

  describe('the shop front is the deliberate floor', () => {
    it('is free, open on day one with no mission delivered, and lists successfully', () => {
      const state = stateWithCar(car, { cashYen: 0, storyMissions: [] })
      expect(ECONOMY.sellingChannels.shopFront.feeYen).toBe(0)
      expect(isSellingChannelUnlocked(state, CONTEXT, 'shopFront')).toBe(true)
      const result = resolveSetForSale(state, car.id, true, CONTEXT, 'shopFront')
      expect(result.state.carsForSale).toHaveLength(1)
      expect(result.state.cashYen).toBe(0)
    })

    it('carries the lowest ceiling of any persona channel, so it can never pay the most', () => {
      const others = (['freeAdsPaper', 'tunerMagazine', 'weekendMeet'] as const).map(
        (id) => ECONOMY.sellingChannels[id].tasteCeiling!,
      )
      for (const ceiling of others) {
        expect(ECONOMY.sellingChannels.shopFront.tasteCeiling!).toBeLessThan(ceiling)
      }
    })

    it('never improves with standing - a flat pool is untouched by any focus exponent', () => {
      // The shop front's pool is exactly 1 on every archetype, and 1 raised to
      // anything is 1. That is the design rather than a coincidence of the
      // values: standing improves the channels you were let into, never the
      // one that was always there.
      const weights = Object.values(ECONOMY.sellingChannels.shopFront.buyerPoolWeights!)
      expect(new Set(weights)).toEqual(new Set([1]))
      for (const forModel of [KEI_MODEL, STYLE_MODEL]) {
        const target = tidy(forModel)
        expect(channelQuote(target, forModel, 'shopFront', 'legend')).toEqual(
          channelQuote(target, forModel, 'shopFront', 'unknown'),
        )
      }
    })
  })

  describe('channels open by named event, and never close', () => {
    const NEW_CAREER = stateWithCar(car, { cashYen: 500_000, storyMissions: [] })

    it('every channel-opening mission claims exactly one channel, and no mission claims a day-one or service-job channel', () => {
      const claimsByChannel = new Map<SellingChannelId, string[]>()
      for (const mission of CONTEXT.storyMissions) {
        if (!mission.unlocksSellingChannel) continue
        const claims = claimsByChannel.get(mission.unlocksSellingChannel) ?? []
        claims.push(mission.id)
        claimsByChannel.set(mission.unlocksSellingChannel, claims)
      }
      expect(claimsByChannel.get('weekendMeet')).toEqual(['low-and-loud'])
      expect(claimsByChannel.get('tunerMagazine')).toEqual(['street-power-street-manners'])
      // Ebisu's one beat, two doors (sprint209.md): the mission that opens
      // the premium auction room also opens the trade network.
      expect(claimsByChannel.get('tradeNetwork')).toEqual(['the-showroom-standard'])
      // Kurogane's own version of the same pattern, for the collector network.
      expect(claimsByChannel.get('collectorNetwork')).toEqual(['the-quiet-crate'])
      expect(claimsByChannel.has('shopFront')).toBe(false)
      expect(claimsByChannel.has('freeAdsPaper')).toBe(false)
    })

    it('a new career cannot list on a claimed channel - no state change, no fee taken', () => {
      for (const channelId of ['tunerMagazine', 'weekendMeet'] as const) {
        expect(isSellingChannelUnlocked(NEW_CAREER, CONTEXT, channelId)).toBe(false)
        const result = resolveSetForSale(NEW_CAREER, car.id, true, CONTEXT, channelId)
        expect(result.state, channelId).toBe(NEW_CAREER)
        expect(result.log, channelId).toEqual([])
      }
    })

    it('delivering the claiming mission opens it, and merely having it in hand does not', () => {
      const inProgress: GameState = {
        ...NEW_CAREER,
        storyMissions: [{ missionId: 'low-and-loud', status: 'active', acceptedOnDay: 1 }],
      }
      expect(isSellingChannelUnlocked(inProgress, CONTEXT, 'weekendMeet')).toBe(false)
      const delivered: GameState = {
        ...NEW_CAREER,
        storyMissions: [{ missionId: 'low-and-loud', status: 'delivered', acceptedOnDay: 1 }],
      }
      expect(isSellingChannelUnlocked(delivered, CONTEXT, 'weekendMeet')).toBe(true)
      const listed = resolveSetForSale(delivered, car.id, true, CONTEXT, 'weekendMeet')
      expect(listed.state.carsForSale[0]?.channelId).toBe('weekendMeet')
    })

    it('never closes: the delivered record is the whole of the fact, and nothing takes it back', () => {
      const delivered: GameState = {
        ...NEW_CAREER,
        storyMissions: [{ missionId: 'low-and-loud', status: 'delivered', acceptedOnDay: 1 }],
      }
      // Reputation collapse, cash gone, car sold, days passed: none of it is
      // read by the unlock, because none of it can undeliver a mission.
      const later: GameState = {
        ...delivered,
        day: 400,
        cashYen: 0,
        reputationPoints: 0,
        reputationTier: 'unknown',
        ownedCars: [],
        carsForSale: [],
        serviceBayCarIds: [],
      }
      expect(isSellingChannelUnlocked(later, CONTEXT, 'weekendMeet')).toBe(true)
    })
  })

  describe('the tier preference weight is finally read', () => {
    /** Two buyers identical in every way that touches valuation, differing
     * ONLY in how strongly they state an interest in this tier. Anything that
     * discarded the weight would draw them equally. */
    function preferenceProbe(id: string, weight: number) {
      return {
        id,
        archetype: 'collector' as const,
        displayName: id,
        statTargets: {
          power: { target: 0, importance: 0 },
          handling: { target: 0, importance: 0 },
          style: { target: 0, importance: 0 },
          reliability: { target: 0, importance: 0 },
          authenticity: { target: 0, importance: 0 },
        },
        tierPreferences: [{ tier: model!.tier, weight }],
        culturePreferences: neutralCulturePreferences(),
        wantLine: 'synthetic fixture buyer - no authored copy needed',
      }
    }

    it('draws a strongly-interested archetype far more often than a barely-interested one', () => {
      const buyers = [preferenceProbe('keen', 1), preferenceProbe('idle', 0.2)]
      const probeContext = { ...CONTEXT, buyers }
      const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
      const counts = { keen: 0, idle: 0 }
      for (let seed = 0; seed < 400; seed++) {
        const drawn = drawDailyOffers(state, probeContext, createRng(seed), state.day)
        const buyerId = drawn.state.pendingOffers[0]?.buyerId
        if (buyerId === 'keen') counts.keen++
        if (buyerId === 'idle') counts.idle++
      }
      expect(counts.keen + counts.idle).toBeGreaterThan(50)
      // The two value the car identically (no stat targets at all), so the
      // only thing separating them is the 5:1 preference weight.
      expect(counts.keen).toBeGreaterThan(counts.idle * 2)
    })
  })

  describe('poolWidening turns the tier gate into a weighting', () => {
    const keiCar = tidy(KEI_MODEL)

    function likelyBuyerIds(weighting: ChannelDrawWeighting): string[] {
      return CONTEXT.buyers
        .filter(
          (b) =>
            likelyChannelBuyer(
              keiCar,
              KEI_MODEL,
              [b],
              CONTEXT.partsById,
              PARTS_TAXONOMY,
              CONTEXT.partsTaxonomyById,
              100,
              ECONOMY,
              weighting,
            ) !== undefined,
        )
        .map((b) => b.id)
        .sort()
    }

    it('without it, only archetypes that state an interest in the tier can be drawn', () => {
      expect(likelyBuyerIds({ focusExponent: 1 })).toEqual(['daily-drivers', 'touge'])
    })

    it('with it, the rest of the market can be reached too', () => {
      expect(likelyBuyerIds({ focusExponent: 1, poolWidening: 0.25 })).toEqual([
        'collector',
        'daily-drivers',
        'racer',
        'show-crowd',
        'touge',
        'tuner',
      ])
    })

    it('is authored widest on the channel whose whole niche is reach', () => {
      const { shopFront, freeAdsPaper, tunerMagazine, weekendMeet } = ECONOMY.sellingChannels
      expect(freeAdsPaper.poolWidening!).toBeGreaterThan(weekendMeet.poolWidening!)
      expect(weekendMeet.poolWidening!).toBeGreaterThan(shopFront.poolWidening!)
      expect(shopFront.poolWidening!).toBeGreaterThan(tunerMagazine.poolWidening!)
    })
  })

  describe('standing improves who walks through an open door', () => {
    it("a legend's weekend meet draws its own crowd more reliably than an unknown's", () => {
      const styleCar = builtStyleCar()
      const unknown = sweep(styleCar, STYLE_MODEL, 'weekendMeet', 200)
      const legend = sweep(styleCar, STYLE_MODEL, 'weekendMeet', 200, {
        reputationTier: 'legend',
        reputationPoints: 2000,
      })
      expect(unknown.length).toBeGreaterThan(20)
      expect(legend.length).toBeGreaterThan(20)
      // The meet's own top-weighted archetype is the Show Crowd (2.2); standing
      // sharpens the pool toward it rather than opening anything new.
      expect(shareOf(legend, ['show-crowd'])).toBeGreaterThan(shareOf(unknown, ['show-crowd']))
    })

    it('is exactly 1 at unknown, so a new career draws every pool as authored', () => {
      expect(ECONOMY.selling.channelStandingFocusByReputationTier.unknown).toBe(1)
    })
  })

  describe('the trade network keeps its reason to exist', () => {
    it('is the only channel that needs no forecourt slot, and the fastest of the six', () => {
      const channels = ECONOMY.sellingChannels
      const noForecourt = Object.entries(channels)
        .filter(([, c]) => !c.requiresForecourt)
        .map(([id]) => id)
      expect(noForecourt).toEqual(['tradeNetwork'])
      for (const id of ['shopFront', 'tunerMagazine'] as const) {
        expect(channels.tradeNetwork.offerChanceFactor!).toBeGreaterThan(
          channels[id].offerChanceFactor!,
        )
      }
    })

    it('has no buyer pool at all, so it never turns a car away for being the wrong sort', () => {
      const keiCar = tidy(KEI_MODEL)
      expect(ECONOMY.sellingChannels.tradeNetwork.buyerPoolWeights).toBeUndefined()
      // No pool and no taste roll, so nothing can veto the draw: the trade
      // answers on far more days than any matched-only channel, on a car
      // neither of them was written for.
      const tradeOffers = sweep(keiCar, KEI_MODEL, 'tradeNetwork')
      expect(tradeOffers.length).toBeGreaterThan(sweep(keiCar, KEI_MODEL, 'tunerMagazine').length)
      expect(tradeOffers.length).toBeGreaterThan(20)
      expect(tradeOffers.every((o) => o.buyerId === 'trade-network')).toBe(true)
    })
  })

  describe("word of mouth scales a channel's own pool, never inverts it (scene-standing-arc.md step 5)", () => {
    it('even at the maximum stage multiplier and the full rolling-window cap, a channel cannot out-draw its own best-favoured archetype for its worst-favoured one', () => {
      // The literal guard: a Collector at The Shop (the highest word-of-mouth
      // multiplier there is, further scaled to the rolling window's own cap)
      // in the free ads paper, where collectors are authored at 0.4 and Daily
      // Drivers at 2.0 - the paper's own widest spread. Multiplicative scaling
      // can narrow that gap but must never close it: authoring stays the
      // aiming tool, word of mouth only nudges it.
      const { freeAdsPaper } = ECONOMY.sellingChannels
      const { shop } = ECONOMY.sceneStandingProgress.wordOfMouthMultiplierByStage
      const { rollingWindowShareCap } = ECONOMY.sceneStandingProgress
      const collectorAtMax = freeAdsPaper.buyerPoolWeights!.collector * shop * rollingWindowShareCap
      expect(collectorAtMax).toBeLessThan(freeAdsPaper.buyerPoolWeights!['daily-drivers'])
    })

    it('raises a scene’s own share of the real daily draw once Known, on the channel that already favoured it least, without handing it the channel', () => {
      const keiCar = tidy(KEI_MODEL)
      // Racers are the free ads paper's coldest scene (0.2); Known should
      // still move their share up from wherever it started, without the
      // paper becoming a racer's magazine.
      const cold = sweep(keiCar, KEI_MODEL, 'freeAdsPaper', 300)
      const known = sweep(keiCar, KEI_MODEL, 'freeAdsPaper', 300, {
        sceneStanding: { ...testSceneStanding(), racer: 'known' },
      })
      expect(cold.length).toBeGreaterThan(20)
      expect(known.length).toBeGreaterThan(20)
      expect(shareOf(known, ['racer'])).toBeGreaterThan(shareOf(cold, ['racer']))
      expect(shareOf(known, ['daily-drivers'])).toBeGreaterThan(shareOf(known, ['racer']))
    })

    it('a Collector at The Shop stage is still rarer in the free ads paper than Daily Drivers are, measured through the real draw', () => {
      const keiCar = tidy(KEI_MODEL)
      const offers = sweep(keiCar, KEI_MODEL, 'freeAdsPaper', 400, {
        sceneStanding: { ...testSceneStanding(), collector: 'shop' },
      })
      expect(offers.length).toBeGreaterThan(20)
      expect(shareOf(offers, ['collector'])).toBeLessThan(shareOf(offers, ['daily-drivers']))
    })

    it('pivots within days: recent deliveries alone shift the draw, with no second climb', () => {
      const keiCar = tidy(KEI_MODEL)
      const known: GameState['sceneStanding'] = { ...testSceneStanding(), touge: 'known' }
      const untouched = sweep(keiCar, KEI_MODEL, 'freeAdsPaper', 300, { sceneStanding: known })
      // A fortnight of deliveries to touge alone, ending the day before the
      // draw - recentSceneLedgerEntries' own inclusive-of-today boundary
      // means day 14 is the last day still inside a 14-day window measured
      // from day 15.
      const pivoted = sweep(keiCar, KEI_MODEL, 'freeAdsPaper', 300, {
        day: 15,
        sceneStanding: known,
        sceneLedger: {
          collector: [],
          tuner: [],
          'show-crowd': [],
          racer: [],
          'daily-drivers': [],
          touge: Array.from({ length: 14 }, (_, i) => ({
            carInstanceId: `touge-${i}`,
            modelId: KEI_MODEL.id,
            priceYen: 100_000,
            day: i + 1,
          })),
        },
      })
      expect(untouched.length).toBeGreaterThan(20)
      expect(pivoted.length).toBeGreaterThan(20)
      expect(shareOf(pivoted, ['touge'])).toBeGreaterThan(shareOf(untouched, ['touge']))
    })
  })
})

describe('resolveScrapShell (Sprint 71 decision 7: the teardown game, scrap the whole car at once)', () => {
  it("pays the model's book value at the flat scrap fraction, removes the car, frees its bay, and clears its ledger", () => {
    const state = stateWithCar(car, {
      cashYen: 100_000,
      carLedgers: {
        [car.id]: { purchaseYen: 500_000, repairYen: 0, partsYen: 0, listingFeesYen: 0 },
      },
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

  it('is a no-op for a car not owned', () => {
    const state = stateWithCar(car)
    const result = resolveScrapShell(state, 'ghost-car', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('reputation side effects (Sprint 15; re-based on the buyer verdict, Sprint 184)', () => {
  const authenticMintCar: CarInstance = buildCarInstance({
    modelId: car.modelId,
    parts: uniformCarParts('mint'),
  })
  const roughCar: CarInstance = buildCarInstance({
    modelId: car.modelId,
    parts: uniformCarParts('poor'),
  })

  it("accepting an offer pays the satisfied bonus when the buyer's champion stat cleared", () => {
    // All-stock and all-mint reads authenticity exactly 100, which clears the
    // Collector's own 0.9 authenticity target - the one stat they are known
    // for. A stock Civic misses their power target, so this is Satisfied
    // rather than Delighted.
    const state = stateWithOffer(authenticMintCar, 1_000_000, 'collector')
    const result = resolveSellViaWalkIn(state, authenticMintCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(ECONOMY.reputation.satisfiedSaleBonus)
    expect(result.log[0]).toMatchObject({
      reputationDelta: ECONOMY.reputation.satisfiedSaleBonus,
      saleQuality: 'satisfied',
    })
  })

  it('a buyer who did not get what they came for pays nothing, and takes nothing away', () => {
    // Daily Drivers came for reliability (target 0.75, importance 1) and an
    // all-poor car has none of it. Reputation only ever rises, so a shop
    // sitting on 40 points still has 40 afterwards.
    const state = stateWithOffer(roughCar, 300_000, 'daily-drivers', { reputationPoints: 40 })
    const result = resolveSellViaWalkIn(state, roughCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(40)
    expect(result.log[0]).not.toHaveProperty('reputationDelta')
    expect(result.log[0]).not.toHaveProperty('saleQuality')
  })

  it('a trade-network sale pays no reputation at all - nobody was behind the offer to be pleased', () => {
    // 'trade-network' resolves to no real Buyer (TRADE_NETWORK_BUYER_ID,
    // selling.ts), so there is no verdict to read however good the car is.
    const state = stateWithOffer(authenticMintCar, 900_000, 'trade-network')
    const result = resolveSellViaWalkIn(state, authenticMintCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0)
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
    state = { ...state, day: 5 }

    const week1 = updateMarketHeat(state, CONTEXT).state
    const week2 = updateMarketHeat({ ...week1, day: 10 }, CONTEXT).state

    const floodedHeat = week2.marketHeat[model.id] ?? 100
    const controlHeat = week2.marketHeat[controlModel.id] ?? 100
    expect(floodedHeat).toBeLessThan(controlHeat)

    const floodedChance = offerChanceFor(model, floodedHeat, ECONOMY)
    const controlChance = offerChanceFor(controlModel, controlHeat, ECONOMY)
    expect(floodedChance).toBeLessThan(controlChance)
  })
})

/**
 * Task A2's own guard: an offer never carries a band, whatever the seller's
 * own unverified truth looks like - `buyerKnowledgeViewOf` (knowledge.ts)
 * is the one place a band could leak through, and it never reaches the
 * SaleOffer/PendingSaleOffer shape at all, only a total.
 */
describe('offers surface totals only - no band ever leaks (sprint217.md task A2)', () => {
  it('a drawn offer carries no condition-band-shaped field, on an honest car with nothing to hide', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    let found = false
    for (let seed = 0; seed < 40 && !found; seed++) {
      const result = drawDailyOffers(state, CONTEXT, createRng(seed), state.day)
      const offer = result.state.pendingOffers[0]
      if (!offer) continue
      found = true
      expect(Object.keys(offer).sort()).toEqual(['buyerId', 'carInstanceId', 'priceYen'])
    }
    expect(found).toBe(true)
  })

  it('the day-report offer-received line carries the same closed shape (plus its own modelId snapshot), never a band', () => {
    const state = { ...stateWithCar(car), carsForSale: listedOn('shopFront') }
    let found = false
    for (let seed = 0; seed < 40 && !found; seed++) {
      const result = drawDailyOffers(state, CONTEXT, createRng(seed), state.day)
      const entry = result.log.find((e) => e.type === 'offer-received')
      if (!entry) continue
      found = true
      expect(Object.keys(entry).sort()).toEqual(
        ['buyerId', 'carInstanceId', 'modelId', 'priceYen', 'type'].sort(),
      )
    }
    expect(found).toBe(true)
  })
})

/**
 * Task B: buyer notice (knowledge-and-diagnosis.md section 6). The economy
 * pairs below share every lever except `diagnosis.noticeChanceByArchetype`/
 * `noticeChanceTradeNetwork` - forced to 1 (certain) in one, 0 (impossible)
 * in the other - so a shared seed draws the identical buyer at the identical
 * quality fraction in both: `rollBuyerNotice` consumes exactly one `rng.next()`
 * per open symptom regardless of the chance it compares against (the
 * threshold moves, the draw count never does), so nothing downstream of the
 * notice roll can drift out of step between the two runs. Any price gap is
 * therefore attributable to the notice deduction alone, never a different
 * buyer or a different quality draw.
 */
describe('buyer notice (sprint217.md task B)', () => {
  const symptom = CONTEXT.symptomsById['smokes-on-startup']
  if (!symptom) throw new Error('fixture: smokes-on-startup missing from seed content')
  const trueCause = symptom.causes[0]!

  function carWithOpenSymptom(): CarInstance {
    return seedVerifiedSlots(
      buildCarInstance({
        modelId: model!.id,
        mileageKm: 90_000,
        parts: mintCarParts({ [trueCause.carPartId]: trueCause.setBand }),
        symptoms: [
          {
            symptomId: symptom!.id,
            trueCauseId: trueCause.id,
            remainingCauseIds: symptom!.causes.map((c) => c.id),
            runTestIds: [],
            latent: false,
          },
        ],
      }),
      CONTEXT,
    )
  }

  function withNoticeChance(chance: number): EconomyConfig {
    const flatByArchetype = Object.fromEntries(
      Object.keys(ECONOMY.diagnosis.noticeChanceByArchetype).map((archetype) => [
        archetype,
        chance,
      ]),
    ) as Record<BuyerArchetype, number>
    return {
      ...ECONOMY,
      diagnosis: {
        ...ECONOMY.diagnosis,
        noticeChanceByArchetype: flatByArchetype,
        noticeChanceTradeNetwork: chance,
      },
    }
  }

  const NOTICED_CONTEXT = buildSimContext(
    CARS,
    PARTS,
    BUYERS,
    PARTS_TAXONOMY,
    [],
    undefined,
    [],
    undefined,
    withNoticeChance(1),
  )
  const UNNOTICED_CONTEXT = buildSimContext(
    CARS,
    PARTS,
    BUYERS,
    PARTS_TAXONOMY,
    [],
    undefined,
    [],
    undefined,
    withNoticeChance(0),
  )

  it("a certain-notice draw is cut below the same draw with notice impossible, and names the symptom's own card", () => {
    const symptomCar = carWithOpenSymptom()
    const state = {
      ...stateWithCar(symptomCar),
      carsForSale: listedOn('shopFront', { carInstanceId: symptomCar.id }),
    }
    let found = false
    for (let seed = 0; seed < 60 && !found; seed++) {
      const noticedResult = drawDailyOffers(state, NOTICED_CONTEXT, createRng(seed), state.day)
      const unnoticedResult = drawDailyOffers(state, UNNOTICED_CONTEXT, createRng(seed), state.day)
      const noticedOffer = noticedResult.state.pendingOffers[0]
      const unnoticedOffer = unnoticedResult.state.pendingOffers[0]
      if (!noticedOffer || !unnoticedOffer) continue
      found = true
      expect(noticedOffer.buyerId).toBe(unnoticedOffer.buyerId) // same buyer, same quality draw
      expect(unnoticedOffer.noticeLine).toBeUndefined()
      expect(noticedOffer.noticeLine).toBe(
        ECONOMY.diagnosis.noticeCopy.replace('<symptom>', symptom.cardLine),
      )
      expect(noticedOffer.priceYen).toBeLessThan(unnoticedOffer.priceYen)
    }
    expect(found).toBe(true)
  })

  it('never notices once the true cause is VERIFIED - the same certain-notice economy produces no line at all', () => {
    const openCar = carWithOpenSymptom()
    const verifiedCar: CarInstance = {
      ...openCar,
      verifiedSlots: [...(openCar.verifiedSlots ?? []), trueCause.carPartId],
    }
    expect(isSlotVerified(verifiedCar, trueCause.carPartId)).toBe(true)
    const state = {
      ...stateWithCar(verifiedCar),
      carsForSale: listedOn('shopFront', { carInstanceId: verifiedCar.id }),
    }
    let found = false
    for (let seed = 0; seed < 60 && !found; seed++) {
      const result = drawDailyOffers(state, NOTICED_CONTEXT, createRng(seed), state.day)
      const offer = result.state.pendingOffers[0]
      if (!offer) continue
      found = true
      expect(offer.noticeLine).toBeUndefined()
    }
    expect(found).toBe(true)
  })
})

describe('accepting a noticed offer costs reputation (sprint217.md task B2)', () => {
  const noticeLine = 'They noticed something on the way round: Smokes on startup.'

  it("subtracts noticeReputationPenalty from whatever the sale's own verdict otherwise paid", () => {
    const authenticCar = buildCarInstance({ modelId: model.id, parts: uniformCarParts('mint') })
    const state = stateWithOffer(authenticCar, 1_000_000, 'collector', {
      pendingOffers: [
        { carInstanceId: authenticCar.id, buyerId: 'collector', priceYen: 1_000_000, noticeLine },
      ],
      reputationPoints: 100,
    })
    const result = resolveSellViaWalkIn(state, authenticCar.id, CONTEXT)
    const expectedDelta =
      ECONOMY.reputation.satisfiedSaleBonus - ECONOMY.diagnosis.noticeReputationPenalty
    expect(result.state.reputationPoints).toBe(100 + expectedDelta)
    expect(result.log[0]).toMatchObject({ reputationDelta: expectedDelta, noticeLine })
  })

  it('costs the flat penalty even on a sale that pays no reputation of its own, floored at zero overall', () => {
    const roughCar = buildCarInstance({ modelId: model.id, parts: uniformCarParts('poor') })
    const state = stateWithOffer(roughCar, 300_000, 'daily-drivers', {
      pendingOffers: [
        { carInstanceId: roughCar.id, buyerId: 'daily-drivers', priceYen: 300_000, noticeLine },
      ],
      reputationPoints: 1,
    })
    const result = resolveSellViaWalkIn(state, roughCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(0) // floored, never negative
    expect(result.log[0]).toMatchObject({
      reputationDelta: -ECONOMY.diagnosis.noticeReputationPenalty,
      noticeLine,
    })
    expect(result.log[0]).not.toHaveProperty('saleQuality')
  })

  it('an un-noticed offer costs nothing extra - the existing reputation-only-ever-rises case, unchanged', () => {
    const authenticCar = buildCarInstance({ modelId: model.id, parts: uniformCarParts('mint') })
    const state = stateWithOffer(authenticCar, 1_000_000, 'collector', { reputationPoints: 100 })
    const result = resolveSellViaWalkIn(state, authenticCar.id, CONTEXT)
    expect(result.state.reputationPoints).toBe(100 + ECONOMY.reputation.satisfiedSaleBonus)
    expect(result.log[0]).not.toHaveProperty('noticeLine')
  })
})
