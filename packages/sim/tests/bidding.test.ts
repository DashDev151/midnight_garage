import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type AuctionLot,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  anchorValueYen,
  attendAuctionGateReason,
  carGuideValueYen,
  computeBuyoutPriceYen,
  privateValuationYen,
  resolveAttendAuction,
  resolveBuyoutInstant,
  settleAuctionHammer,
} from '../src/bidding'
import { generateAuctionCatalog } from '../src/auctions'
import { buildSimContext, type SimContext } from '../src/context'
import { createRng } from '../src/rng'
import { testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
/** A context with no interested buyers at all - forces `anchorValueYen`
 * (and therefore every private valuation) to 0 for every lot. */
const NO_BUYERS_CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/** A nonzero admission fee at every tier - the real content ships all four
 * at 0, so the charge-and-record behaviour needs a test override to exercise
 * at all. */
const ATTENDANCE_FEE_YEN = 5_000
const ATTENDANCE_CONTEXT: SimContext = {
  ...CONTEXT,
  economy: {
    ...CONTEXT.economy,
    auctionRoom: {
      ...CONTEXT.economy.auctionRoom,
      attendanceFeeYenByTier: {
        'local-yard': ATTENDANCE_FEE_YEN,
        regional: ATTENDANCE_FEE_YEN,
        premium: ATTENDANCE_FEE_YEN,
        'collector-network': ATTENDANCE_FEE_YEN,
      },
    },
  },
}

function stateWithLots(lots: AuctionLot[], overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 10_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: lots,
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
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

/** A freshly rolled lot for a broadly-desired rare car (strong, reliable
 * interest across several buyer archetypes) - the fixture most of this
 * file's scenario tests build on. */
function sampleLot(seed: number) {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')
  const [lot] = generateAuctionCatalog([model], 'premium', 7, 1, createRng(seed), CONTEXT)
  if (!lot) throw new Error('expected exactly one lot')
  return { lot, model }
}

/** Many distinct lot ids sharing the same car/model/book value - a large,
 * effectively-random sample over bidding.ts's per-lot-id-seeded valuation,
 * for statistical (distribution) properties. */
function statLots(count: number, prefix = 'stat-lot'): AuctionLot[] {
  const { lot } = sampleLot(1)
  return Array.from({ length: count }, (_, i) => ({ ...lot, id: `${prefix}-${i}` }))
}

describe('anchorValueYen', () => {
  it('is a pure function of its inputs - no hidden RNG', () => {
    const { lot } = sampleLot(1)
    const state = stateWithLots([lot])
    const a = anchorValueYen(lot, state, CONTEXT)
    const b = anchorValueYen(lot, state, CONTEXT)
    expect(a).toEqual(b)
    expect(a).toBeGreaterThan(0)
  })

  it('is 0 when no buyer archetype has a stated interest in this tier', () => {
    const { lot } = sampleLot(2)
    const state = stateWithLots([lot])
    expect(anchorValueYen(lot, state, NO_BUYERS_CONTEXT)).toBe(0)
  })
})

describe('carGuideValueYen (generalises anchorValueYen to any car+model, not just a lot)', () => {
  it("agrees exactly with anchorValueYen on a lot's own car+model - a pure refactor, not a new formula", () => {
    const { lot, model } = sampleLot(3)
    const state = stateWithLots([lot])
    expect(carGuideValueYen(lot.car, model, state, CONTEXT)).toBe(
      anchorValueYen(lot, state, CONTEXT),
    )
  })

  it('is 0 when no buyer archetype has a stated interest in this tier - same gate as anchorValueYen', () => {
    const { lot, model } = sampleLot(4)
    const state = stateWithLots([lot])
    expect(carGuideValueYen(lot.car, model, state, NO_BUYERS_CONTEXT)).toBe(0)
  })
})

describe('privateValuationYen', () => {
  it('is deterministic for a given lot', () => {
    const { lot } = sampleLot(3)
    const state = stateWithLots([lot])
    const a = privateValuationYen(lot, state, CONTEXT, ECONOMY.AUCTION_WHOLESALE_FRACTION)
    const b = privateValuationYen(lot, state, CONTEXT, ECONOMY.AUCTION_WHOLESALE_FRACTION)
    expect(a).toBe(b)
  })

  it('is 0 whenever the anchor itself is 0', () => {
    const { lot } = sampleLot(4)
    const state = stateWithLots([lot])
    expect(
      privateValuationYen(lot, state, NO_BUYERS_CONTEXT, ECONOMY.AUCTION_WHOLESALE_FRACTION),
    ).toBe(0)
  })

  it('centers around the multiplier across many distinct lots of the same car', () => {
    const state = stateWithLots([])
    const { lot, model } = sampleLot(1)
    const anchor = anchorValueYen(lot, state, CONTEXT)
    const ratios = statLots(300, 'private-valuation').map(
      (l) => privateValuationYen(l, state, CONTEXT, ECONOMY.AUCTION_WHOLESALE_FRACTION) / anchor,
    )
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    expect(mean).toBeGreaterThan(ECONOMY.AUCTION_WHOLESALE_FRACTION * 0.9)
    expect(mean).toBeLessThan(ECONOMY.AUCTION_WHOLESALE_FRACTION * 1.1)
    expect(model.tier).toBe('rare') // sanity: this fixture is still JZA80
  })
})

describe('computeBuyoutPriceYen', () => {
  it('is exactly the value anchor times AUCTION_BUYOUT_PREMIUM', () => {
    const { lot } = sampleLot(15)
    const state = stateWithLots([lot])
    const anchor = anchorValueYen(lot, state, CONTEXT)
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    expect(priceYen).toBe(Math.round(anchor * ECONOMY.AUCTION_BUYOUT_PREMIUM))
  })

  it('is a pure function of its inputs', () => {
    const { lot } = sampleLot(16)
    const state = stateWithLots([lot])
    const a = computeBuyoutPriceYen(lot, state, CONTEXT)
    const b = computeBuyoutPriceYen(lot, state, CONTEXT)
    expect(a).toBe(b)
  })
})

describe('resolveBuyoutInstant', () => {
  it('buys the lot at computeBuyoutPriceYen, guaranteed', () => {
    const { lot } = sampleLot(40)
    const state = stateWithLots([lot])
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.cashYen).toBe(state.cashYen - priceYen)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log).toEqual([
      {
        type: 'lot-bought-out',
        lotId: lot.id,
        priceYen,
        modelId: lot.car.modelId,
        year: lot.car.year,
      },
    ])
  })

  it('creates the car ledger with purchaseYen = the buyout price', () => {
    const { lot } = sampleLot(44)
    const state = stateWithLots([lot])
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    const carId = result.state.ownedCars[0]!.id
    expect(result.state.carLedgers[carId]).toEqual({
      purchaseYen: priceYen,
      repairYen: 0,
      partsYen: 0,
    })
  })

  it('is a no-op when unaffordable, leaving the lot on the board', () => {
    const { lot } = sampleLot(41)
    const state = stateWithLots([lot], { cashYen: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('lands in an open service bay when parking is full, instead of being refused', () => {
    const { lot } = sampleLot(42)
    const state = stateWithLots([lot], { parkingBayCount: 0, serviceBayCount: 1 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.serviceBayCarIds).toContain(lot.car.id)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(false)
  })

  it('double-parks in the grace slot when parking AND every service bay are full, instead of being refused', () => {
    const { lot } = sampleLot(43)
    const state = stateWithLots([lot], { parkingBayCount: 0, serviceBayCount: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.graceParkingCarId).toBe(lot.car.id)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(false)
  })

  it('leaves the lot on the board (no money spent) only once parking, every service bay, AND the grace slot are all full', () => {
    const { lot } = sampleLot(45)
    const state = stateWithLots([lot], {
      parkingBayCount: 0,
      serviceBayCount: 0,
      graceParkingCarId: 'someone-elses-car',
    })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.activeAuctionLots).toHaveLength(1)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'buyout', reason: 'no-space' },
    ])
  })
})

/**
 * The live auction room hammer settlement: a pure purchase at whatever price
 * the room closed at, sharing its settlement core with resolveBuyoutInstant
 * above (win settles, insufficient cash refuses quietly, no-space forfeits
 * loudly, determinism unaffected).
 */
describe('settleAuctionHammer', () => {
  it('settles a win: spends the hammer price, transfers the car, removes the lot, logs the win', () => {
    const { lot } = sampleLot(50)
    const state = stateWithLots([lot])
    const hammerYen = Math.round(anchorValueYen(lot, state, CONTEXT) * 0.8)
    const result = settleAuctionHammer(state, lot.id, hammerYen, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.ownedCars[0]!.id).toBe(lot.car.id)
    expect(result.state.cashYen).toBe(state.cashYen - hammerYen)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log).toEqual([
      {
        type: 'auction-hammer-won',
        lotId: lot.id,
        priceYen: hammerYen,
        modelId: lot.car.modelId,
        year: lot.car.year,
      },
    ])
  })

  it('creates the car ledger with purchaseYen = the hammer price', () => {
    const { lot } = sampleLot(51)
    const state = stateWithLots([lot])
    const hammerYen = Math.round(anchorValueYen(lot, state, CONTEXT) * 0.9)
    const result = settleAuctionHammer(state, lot.id, hammerYen, CONTEXT)
    const carId = result.state.ownedCars[0]!.id
    expect(result.state.carLedgers[carId]).toEqual({
      purchaseYen: hammerYen,
      repairYen: 0,
      partsYen: 0,
    })
  })

  it("refuses quietly when cash is short, in the codebase's established refusal shape", () => {
    const { lot } = sampleLot(52)
    const state = stateWithLots([lot], { cashYen: 0 })
    const hammerYen = Math.round(anchorValueYen(lot, state, CONTEXT) * 0.8) || 1
    const result = settleAuctionHammer(state, lot.id, hammerYen, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('forfeits loudly (no-space) only once parking, every service bay, AND the grace slot are all full', () => {
    const { lot } = sampleLot(53)
    const state = stateWithLots([lot], {
      parkingBayCount: 0,
      serviceBayCount: 0,
      graceParkingCarId: 'someone-elses-car',
    })
    const hammerYen = Math.round(anchorValueYen(lot, state, CONTEXT) * 0.8)
    const result = settleAuctionHammer(state, lot.id, hammerYen, CONTEXT)
    expect(result.state.activeAuctionLots).toHaveLength(1)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-space' },
    ])
  })

  it('is a no-op for an unknown lot id', () => {
    const state = stateWithLots([sampleLot(54).lot])
    const result = settleAuctionHammer(state, 'no-such-lot', 1_000_000, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a pure function of its inputs - calling it twice never double-spends and always agrees', () => {
    const { lot } = sampleLot(55)
    const state = stateWithLots([lot])
    const hammerYen = Math.round(anchorValueYen(lot, state, CONTEXT) * 0.85)
    const a = settleAuctionHammer(state, lot.id, hammerYen, CONTEXT)
    const b = settleAuctionHammer(state, lot.id, hammerYen, CONTEXT)
    expect(a).toEqual(b)
  })
})

/**
 * The room-entry admission charge: per tier, per day, at the seat. The real
 * content ships every tier at 0 (built dark), so every scenario that expects
 * an actual charge needs `ATTENDANCE_CONTEXT`'s nonzero override; the real
 * `CONTEXT` proves the zero-fee path stays silent.
 */
describe('attendAuctionGateReason / resolveAttendAuction', () => {
  it('never blocks and never charges under the real, all-zero content', () => {
    const state = stateWithLots([])
    expect(attendAuctionGateReason(state, 'local-yard', CONTEXT)).toBeNull()
    const result = resolveAttendAuction(state, 'local-yard', CONTEXT)
    expect(result.outcome).toBe('attended')
    expect(result.state).toBe(state)
    expect(result.state.attendanceFeePaidDayByTier).toBeUndefined()
  })

  it('charges the first seat at a tier once a fee is nonzero', () => {
    const state = stateWithLots([], { cashYen: 100_000 })
    const result = resolveAttendAuction(state, 'regional', ATTENDANCE_CONTEXT)
    expect(result.outcome).toBe('attended')
    expect(result.state.cashYen).toBe(100_000 - ATTENDANCE_FEE_YEN)
    expect(result.state.attendanceFeePaidDayByTier).toEqual({ regional: state.day })
  })

  it('does not charge a second seat at the same tier the same day', () => {
    const state = stateWithLots([], { cashYen: 100_000 })
    const first = resolveAttendAuction(state, 'regional', ATTENDANCE_CONTEXT)
    const second = resolveAttendAuction(first.state, 'regional', ATTENDANCE_CONTEXT)
    expect(second.outcome).toBe('attended')
    expect(second.state).toBe(first.state)
    expect(second.state.cashYen).toBe(100_000 - ATTENDANCE_FEE_YEN)
  })

  it('charges again the next day', () => {
    const state = stateWithLots([], { cashYen: 100_000 })
    const day1 = resolveAttendAuction(state, 'regional', ATTENDANCE_CONTEXT)
    const nextDayState = { ...day1.state, day: day1.state.day + 1 }
    const day2 = resolveAttendAuction(nextDayState, 'regional', ATTENDANCE_CONTEXT)
    expect(day2.outcome).toBe('attended')
    expect(day2.state.cashYen).toBe(100_000 - 2 * ATTENDANCE_FEE_YEN)
    expect(day2.state.attendanceFeePaidDayByTier).toEqual({ regional: nextDayState.day })
  })

  it('a different tier the same day is its own, separately-charged admission', () => {
    const state = stateWithLots([], { cashYen: 100_000 })
    const regional = resolveAttendAuction(state, 'regional', ATTENDANCE_CONTEXT)
    const premium = resolveAttendAuction(regional.state, 'premium', ATTENDANCE_CONTEXT)
    expect(premium.outcome).toBe('attended')
    expect(premium.state.cashYen).toBe(100_000 - 2 * ATTENDANCE_FEE_YEN)
    expect(premium.state.attendanceFeePaidDayByTier).toEqual({
      regional: state.day,
      premium: state.day,
    })
  })

  it("refuses on short cash, quietly, matching this file's established refusal shape", () => {
    const state = stateWithLots([], { cashYen: ATTENDANCE_FEE_YEN - 1 })
    expect(attendAuctionGateReason(state, 'regional', ATTENDANCE_CONTEXT)).toBe('no-cash')
    const result = resolveAttendAuction(state, 'regional', ATTENDANCE_CONTEXT)
    expect(result.outcome).toBe('no-cash')
    expect(result.state).toBe(state)
  })

  it('buyout never touches it - resolveBuyoutInstant records no attendance charge', () => {
    const { lot } = sampleLot(60)
    const state = stateWithLots([lot], { cashYen: 10_000_000 })
    const result = resolveBuyoutInstant(state, lot.id, ATTENDANCE_CONTEXT)
    expect(result.state.attendanceFeePaidDayByTier).toBeUndefined()
  })
})
