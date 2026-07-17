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
  advanceLotOvernight,
  anchorValueYen,
  bidIncrementYen,
  carGuideValueYen,
  computeBuyoutPriceYen,
  nextRaiseYen,
  privateValuationYen,
  reserveYen,
  resolveBuyoutInstant,
  resolveLotForDay,
  resolvePlaceBid,
  turnoutBidderCount,
} from '../src/bidding'
import { generateAuctionCatalog } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'
import { testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
/** A context with no interested buyers at all - forces `anchorValueYen`
 * (and therefore every rival cohort's private valuation) to 0 for every lot,
 * so a lot never opens on its own no matter how many days pass. */
const NO_BUYERS_CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

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
    laborSlotsSpentToday: 0,
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
 * file's scenario tests build on, same as the pre-Sprint-20 file did. */
function sampleLot(seed: number) {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')
  const [lot] = generateAuctionCatalog([model], 'premium', 7, 1, createRng(seed), CONTEXT)
  if (!lot) throw new Error('expected exactly one lot')
  return { lot, model }
}

/** Many distinct lot ids sharing the same car/model/book value - a large,
 * effectively-random sample over bidding.ts's per-lot-id-seeded demand
 * ceiling, for statistical (distribution, calibration) properties. Shares
 * one rolled `expiresOnDay` across the whole sample (fine for properties
 * that don't depend on duration, e.g. the ceiling's own distribution). */
function statLots(count: number, prefix = 'stat-lot'): AuctionLot[] {
  const { lot } = sampleLot(1)
  return Array.from({ length: count }, (_, i) => ({ ...lot, id: `${prefix}-${i}` }))
}

/** Many genuinely independent lots (own id, own rolled duration, own
 * condition/car instance) for the same fixture car - unlike `statLots`,
 * each one is its own `generateAuctionCatalog` call, so `expiresOnDay`
 * varies realistically across the sample (flash/standard/long), matching
 * how a real weekly catalog batch looks. Needed for anything that depends
 * on the backstop, not just the demand ceiling. */
function independentLots(count: number, startSeed: number): AuctionLot[] {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')
  return Array.from({ length: count }, (_, i) => {
    const [lot] = generateAuctionCatalog(
      [model],
      'premium',
      7,
      1,
      createRng(startSeed + i),
      CONTEXT,
    )
    if (!lot) throw new Error('expected exactly one lot')
    return { ...lot, id: `independent-lot-${startSeed}-${i}` }
  })
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

describe('carGuideValueYen (Sprint 42: generalizes anchorValueYen to any car+model, not just a lot)', () => {
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

describe('privateValuationYen (Sprint 30 decision 3: per-cohort private valuations replace the one-shot ceiling)', () => {
  it('is deterministic for a given lot/cohort, but distinct cohorts land differently', () => {
    const { lot } = sampleLot(3)
    const state = stateWithLots([lot])
    const a = privateValuationYen(
      lot,
      state,
      CONTEXT,
      ECONOMY.AUCTION_WHOLESALE_FRACTION,
      ':cohort:0',
    )
    const b = privateValuationYen(
      lot,
      state,
      CONTEXT,
      ECONOMY.AUCTION_WHOLESALE_FRACTION,
      ':cohort:0',
    )
    expect(a).toBe(b)
    const acrossCohorts = new Set(
      Array.from({ length: 20 }, (_, i) =>
        privateValuationYen(
          lot,
          state,
          CONTEXT,
          ECONOMY.AUCTION_WHOLESALE_FRACTION,
          `:cohort:${i}`,
        ),
      ),
    )
    expect(acrossCohorts.size).toBeGreaterThan(1)
  })

  it('is 0 whenever the anchor itself is 0', () => {
    const { lot } = sampleLot(4)
    const state = stateWithLots([lot])
    expect(
      privateValuationYen(
        lot,
        state,
        NO_BUYERS_CONTEXT,
        ECONOMY.AUCTION_WHOLESALE_FRACTION,
        ':cohort:0',
      ),
    ).toBe(0)
  })

  it('centers around AUCTION_WHOLESALE_FRACTION of the anchor across many cohorts', () => {
    const state = stateWithLots([])
    const { lot, model } = sampleLot(1)
    const anchor = anchorValueYen(lot, state, CONTEXT)
    const ratios = Array.from(
      { length: 300 },
      (_, i) =>
        privateValuationYen(
          lot,
          state,
          CONTEXT,
          ECONOMY.AUCTION_WHOLESALE_FRACTION,
          `:cohort:${i}`,
        ) / anchor,
    )
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    expect(mean).toBeGreaterThan(ECONOMY.AUCTION_WHOLESALE_FRACTION * 0.9)
    expect(mean).toBeLessThan(ECONOMY.AUCTION_WHOLESALE_FRACTION * 1.1)
    expect(model.tier).toBe('rare') // sanity: this fixture is still JZA80
  })
})

describe('turnoutBidderCount (Sprint 30 decision 3: turnout is a real bidder-count band now)', () => {
  it('is deterministic per lot id and stays within its band range', () => {
    const { lot } = sampleLot(5)
    const a = turnoutBidderCount(lot, ECONOMY)
    const b = turnoutBidderCount(lot, ECONOMY)
    expect(a).toBe(b)
    const [min, max] = ECONOMY.auctionInterest.turnoutBidderCounts[lot.turnout]
    expect(a).toBeGreaterThanOrEqual(min)
    expect(a).toBeLessThanOrEqual(max)
  })

  it('a packed lot rolls a higher bidder count, on average, than a thin one', () => {
    const { lot } = sampleLot(6)
    const meanCountFor = (turnout: AuctionLot['turnout']) => {
      const counts = Array.from({ length: 60 }, (_, i) =>
        turnoutBidderCount({ ...lot, id: `count-${turnout}-${i}`, turnout }, ECONOMY),
      )
      return counts.reduce((a, b) => a + b, 0) / counts.length
    }
    expect(meanCountFor('packed')).toBeGreaterThan(meanCountFor('thin'))
  })
})

describe('bidIncrementYen / nextRaiseYen', () => {
  it('is 5% of book, rounded to the nearest Y10,000', () => {
    const { lot } = sampleLot(5)
    const expected = Math.max(10_000, Math.round((lot.bookValueYen * 0.05) / 10_000) * 10_000)
    expect(bidIncrementYen(lot, ECONOMY)).toBe(expected)
  })

  it('floors at Y10,000 even for a very cheap lot', () => {
    const { lot } = sampleLot(6)
    const cheapLot: AuctionLot = { ...lot, bookValueYen: 50_000 }
    expect(bidIncrementYen(cheapLot, ECONOMY)).toBe(10_000)
  })

  it('nextRaiseYen is the reserve price when unopened, current + increment once open', () => {
    const { lot } = sampleLot(7)
    const state = stateWithLots([lot])
    const reserve = reserveYen(lot, state, CONTEXT)
    expect(nextRaiseYen(lot, state, CONTEXT)).toBe(reserve)

    const opened: AuctionLot = { ...lot, currentBidYen: reserve, leadingBidder: 'rival' }
    expect(nextRaiseYen(opened, state, CONTEXT)).toBe(reserve + bidIncrementYen(lot, ECONOMY))
  })
})

describe('resolvePlaceBid (Sprint 20 - open-raise semantics)', () => {
  it('opens an unopened lot at exactly the reserve price', () => {
    const { lot } = sampleLot(10)
    const state = stateWithLots([lot])
    const reserve = reserveYen(lot, state, CONTEXT)
    const result = resolvePlaceBid(state, lot.id, reserve, CONTEXT)
    const updated = result.state.activeAuctionLots[0]
    expect(updated?.currentBidYen).toBe(reserve)
    expect(updated?.leadingBidder).toBe('player')
    expect(updated?.playerHasBid).toBe(true)
    expect(updated?.quietDays).toBe(0)
    expect(result.log).toEqual([{ type: 'auction-bid-placed', lotId: lot.id, maxBidYen: reserve }])
  })

  it('rejects an opening bid below reserve - no-op', () => {
    const { lot } = sampleLot(11)
    const state = stateWithLots([lot])
    const reserve = reserveYen(lot, state, CONTEXT)
    const result = resolvePlaceBid(state, lot.id, reserve - 10_000, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('increment enforcement: a raise below current + increment is a no-op, exactly current + increment succeeds', () => {
    const { lot } = sampleLot(12)
    const state = stateWithLots([lot])
    const reserve = reserveYen(lot, state, CONTEXT)
    const opened = resolvePlaceBid(state, lot.id, reserve, CONTEXT).state
    const increment = bidIncrementYen(lot, ECONOMY)

    const tooLow = resolvePlaceBid(opened, lot.id, reserve + increment - 10_000, CONTEXT)
    expect(tooLow.state).toBe(opened)
    expect(tooLow.log).toEqual([])

    const exact = resolvePlaceBid(opened, lot.id, reserve + increment, CONTEXT)
    expect(exact.state.activeAuctionLots[0]?.currentBidYen).toBe(reserve + increment)
    expect(exact.state.activeAuctionLots[0]?.leadingBidder).toBe('player')
  })

  it('is a no-op for an unknown lot id', () => {
    const state = stateWithLots([sampleLot(13).lot])
    const result = resolvePlaceBid(state, 'no-such-lot', 1_000_000, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('resets quietDays and sets playerHasBid even when raising over a rival lead', () => {
    const { lot } = sampleLot(14)
    const state = stateWithLots([lot])
    const reserve = reserveYen(lot, state, CONTEXT)
    const rivalLed: AuctionLot = {
      ...lot,
      currentBidYen: reserve,
      leadingBidder: 'rival',
      quietDays: 1,
    }
    const increment = bidIncrementYen(lot, ECONOMY)
    const result = resolvePlaceBid(stateWithLots([rivalLed]), lot.id, reserve + increment, CONTEXT)
    const updated = result.state.activeAuctionLots[0]
    expect(updated?.leadingBidder).toBe('player')
    expect(updated?.playerHasBid).toBe(true)
    expect(updated?.quietDays).toBe(0)
  })
})

describe('computeBuyoutPriceYen', () => {
  it('the buyout floor always exceeds the current bid, across a matured population', () => {
    // Mature a population of lots through several overnight steps (no player
    // involvement) so currentBidYen varies realistically, then confirm the
    // buyout floor is always strictly above whatever's currently on the board.
    const state = stateWithLots([])
    let checked = 0
    for (const initial of statLots(100, 'buyout-floor')) {
      let lot = initial
      for (let day = 1; day <= 5; day++) {
        lot = advanceLotOvernight(lot, state, CONTEXT, day).lot
      }
      const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
      expect(priceYen).toBeGreaterThan(lot.currentBidYen)
      checked++
    }
    expect(checked).toBe(100)
  })

  it('is at least the value anchor times AUCTION_BUYOUT_PREMIUM on an untouched lot', () => {
    const { lot } = sampleLot(15)
    const state = stateWithLots([lot])
    const anchor = anchorValueYen(lot, state, CONTEXT)
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    expect(priceYen).toBeGreaterThanOrEqual(Math.round(anchor * ECONOMY.AUCTION_BUYOUT_PREMIUM))
  })
})

describe('advanceLotOvernight', () => {
  it('is deterministic - the same lot/day always steps identically', () => {
    const { lot } = sampleLot(20)
    const state = stateWithLots([lot])
    const a = advanceLotOvernight(lot, state, CONTEXT, 5)
    const b = advanceLotOvernight(lot, state, CONTEXT, 5)
    expect(a).toEqual(b)
  })

  it('a lot with no interested buyers never opens, no matter how many days pass', () => {
    const { lot } = sampleLot(21)
    const state = stateWithLots([lot])
    let current = lot
    for (let day = 1; day <= 30; day++) {
      current = advanceLotOvernight(current, state, NO_BUYERS_CONTEXT, day).lot
    }
    expect(current.currentBidYen).toBe(0)
    expect(current.leadingBidder).toBeNull()
  })

  it('opens most lots of a broadly-desired car at (or above) the reserve price once a rival cohort clears it', () => {
    const { lot } = sampleLot(22)
    const state = stateWithLots([lot])
    // `statLots` below all copy sampleLot(1)'s car, and each opens at ITS OWN
    // guide-value reserve. Sprint 27 rebased reserve off `anchorValueYen`
    // (guide value), so the reserve is no longer a per-model book constant -
    // compute it from the same car the sample uses (sampleLot(1)), not
    // sampleLot(22), whose independently-rolled condition gives a different
    // guide value hence a different reserve.
    const reserve = reserveYen(sampleLot(1).lot, state, CONTEXT)
    // JZA80 at premium tier is broadly desired, so a rival cohort's private
    // wholesale-centered valuation clears reserve most of the time - but a
    // thin-turnout roll combined with a low spread draw can occasionally
    // leave a lot bidless on day 1, so this is a statistical majority claim,
    // not "every single lot", to avoid a flaky assertion on the tail.
    //
    // `>= reserve`, not `=== reserve`: Sprint 30's process applies up to
    // `maxIncrementsPerNight` (2) raises in one overnight step when several
    // cohorts are eager, so a lot that opens on a well-desired car's first
    // night often immediately climbs one further increment past the bare
    // reserve too - still genuinely "opened," just already contested.
    //
    // Re-measured (not re-derived) against Sprint 30's daily bidder-interest
    // process (per-cohort private valuations centered at
    // AUCTION_WHOLESALE_FRACTION = 0.97 of guide value, reserve at 0.6 of
    // the same guide value, both Sprint 59 figures): the bar stays a plain
    // "clear majority" (> 0.5) with generous headroom rather than pinning the
    // exact rate, per this test's own established pattern.
    const opened = statLots(200, 'open-check').map(
      (l) => advanceLotOvernight(l, state, CONTEXT, 1).lot,
    )
    const openedCount = opened.filter(
      (l) => l.leadingBidder === 'rival' && l.currentBidYen >= reserve,
    ).length
    expect(openedCount / opened.length).toBeGreaterThan(0.5)
  })

  it('no eligible cohort left: silence - quietDays increments, the board never moves', () => {
    const { lot } = sampleLot(23)
    const state = stateWithLots([lot])
    // A currentBidYen far above any realistic cohort valuation forces the
    // deterministic "nobody left who'd pay this much" branch every time,
    // regardless of the per-day RNG roll.
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 100,
      leadingBidder: 'player',
      quietDays: 0,
      playerHasBid: true,
    }
    const step = advanceLotOvernight(dominant, state, CONTEXT, 1)
    expect(step.lot.currentBidYen).toBe(dominant.currentBidYen)
    expect(step.lot.leadingBidder).toBe('player')
    expect(step.lot.quietDays).toBe(1)
    expect(step.log).toEqual([])
  })

  /**
   * The Sprint 30 analog of the old "ceiling-tie goes to the player" test
   * (below, `resolveLotForDay` describe block): a player bid at (or above)
   * every eligible rival cohort's own private valuation is never overtaken,
   * because the next raise (`nextRaiseYen`, one increment higher) exceeds
   * every cohort's ceiling too - `eligibleCohortCount` is 0 every night.
   */
  it("a player bid at the maximum rival cohort's private valuation is never overtaken", () => {
    const { lot } = sampleLot(60)
    const state = stateWithLots([lot])
    const bidderCount = turnoutBidderCount(lot, ECONOMY)
    const maxCohortValuationYen = Math.max(
      0,
      ...Array.from({ length: bidderCount }, (_, i) =>
        privateValuationYen(
          lot,
          state,
          CONTEXT,
          ECONOMY.AUCTION_WHOLESALE_FRACTION,
          `:cohort:${i}`,
        ),
      ),
    )
    const atMax: AuctionLot = {
      ...lot,
      currentBidYen: maxCohortValuationYen,
      leadingBidder: 'player',
      quietDays: 0,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    for (let day = 1; day <= 10; day++) {
      const step = advanceLotOvernight(atMax, state, CONTEXT, day)
      expect(step.lot.leadingBidder).toBe('player')
      expect(step.lot.currentBidYen).toBe(maxCohortValuationYen)
      expect(step.log).toEqual([])
    }
  })

  it('a dealer raise that displaces the player logs auction-outbid; dealer-vs-dealer raises log nothing', () => {
    const { lot } = sampleLot(24)
    const state = stateWithLots([lot])

    // Find a lot id/day combination where the overnight step genuinely
    // raises (not silence) - search a small population for one, since the
    // raise itself is a seeded coin flip. Each candidate is opened at ITS OWN
    // guide-value reserve (Sprint 27: reserve is per-instance now, not a
    // per-model book constant) - the search and the assertion must price the
    // same lot, so `raised.opened` carries that candidate's own reserve
    // forward.
    let raised: { opened: AuctionLot; day: number } | undefined
    for (const candidate of statLots(60, 'outbid-search')) {
      const candidateReserve = reserveYen(candidate, state, CONTEXT)
      const opened: AuctionLot = {
        ...candidate,
        currentBidYen: candidateReserve,
        leadingBidder: 'player',
      }
      for (let day = 1; day <= 5 && !raised; day++) {
        const step = advanceLotOvernight(opened, state, CONTEXT, day)
        if (step.lot.currentBidYen > opened.currentBidYen) {
          raised = { opened, day }
        }
      }
      if (raised) break
    }
    if (!raised) throw new Error('expected at least one overnight raise across the sample')

    const playerLed: AuctionLot = {
      ...raised.opened,
      leadingBidder: 'player',
      playerHasBid: true,
    }
    const displaced = advanceLotOvernight(playerLed, state, CONTEXT, raised.day)
    expect(displaced.lot.leadingBidder).toBe('rival')
    expect(displaced.log).toEqual([
      {
        type: 'auction-outbid',
        lotId: playerLed.id,
        newBidYen: displaced.lot.currentBidYen,
        modelId: playerLed.car.modelId,
        year: playerLed.car.year,
      },
    ])

    const rivalLed: AuctionLot = { ...playerLed, leadingBidder: 'rival' }
    const dealerVsDealer = advanceLotOvernight(rivalLed, state, CONTEXT, raised.day)
    if (dealerVsDealer.lot.currentBidYen > rivalLed.currentBidYen) {
      expect(dealerVsDealer.log).toEqual([])
    }
  })
})

describe('resolveLotForDay - hammer and backstop', () => {
  it('hammers after AUCTION_QUIET_DAYS_TO_HAMMER consecutive quiet overnight steps, awarding the leader', () => {
    const { lot } = sampleLot(30)
    const threshold = CONTEXT.economy.AUCTION_QUIET_DAYS_TO_HAMMER
    // currentBidYen far above any realistic ceiling forces deterministic
    // silence every day, so quietDays climbs 1-2-3... with no RNG branch.
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 3,
      leadingBidder: 'player',
      quietDays: 0,
      playerHasBid: true,
      expiresOnDay: 1000, // far beyond the backstop, so only quietDays matters here
    }
    const initial = stateWithLots([dominant], { cashYen: lot.bookValueYen * 10 })

    // The first (threshold - 1) quiet steps do NOT hammer; quietDays climbs.
    let state = initial
    let current = dominant
    for (let n = 1; n < threshold; n++) {
      const step = resolveLotForDay(state, current, CONTEXT, n)
      expect(step.state.activeAuctionLots).toHaveLength(1)
      expect(step.state.activeAuctionLots[0]?.quietDays).toBe(n)
      state = step.state
      current = step.state.activeAuctionLots[0]!
    }

    // The threshold-th quiet step hammers to the leader (the player here).
    const final = resolveLotForDay(state, current, CONTEXT, threshold)
    expect(final.state.activeAuctionLots).toHaveLength(0)
    expect(final.state.ownedCars).toHaveLength(1)
    expect(final.state.cashYen).toBe(initial.cashYen - dominant.currentBidYen)
    expect(final.log.some((e) => e.type === 'auction-bid-won')).toBe(true)
  })

  it('ANTI-SNIPE: a rival raise on the backstop day never closes the lot that step - a leading player is not robbed and gets another day to respond', () => {
    const state = stateWithLots([sampleLot(24).lot])
    // Find a lot/day where the overnight step genuinely raises (a seeded coin
    // flip), the same search the outbid test above uses. Each candidate opens
    // at its own per-instance reserve.
    let raised: { opened: AuctionLot; day: number } | undefined
    for (const candidate of statLots(60, 'anti-snipe-search')) {
      const opened: AuctionLot = {
        ...candidate,
        currentBidYen: reserveYen(candidate, state, CONTEXT),
        leadingBidder: 'player',
        playerHasBid: true,
      }
      for (let day = 1; day <= 5 && !raised; day++) {
        if (
          advanceLotOvernight(opened, state, CONTEXT, day).lot.currentBidYen > opened.currentBidYen
        ) {
          raised = { opened, day }
        }
      }
      if (raised) break
    }
    if (!raised) throw new Error('expected at least one overnight raise across the sample')

    // Put the lot AT its backstop with quietDays already maxed - both close
    // conditions are "met" - and the player leading. A rival raises this very
    // step, and the anti-snipe rule must still refuse to hammer: the lot
    // stays on the board so the player can respond, not lose while leading.
    const atBackstop: AuctionLot = {
      ...raised.opened,
      leadingBidder: 'player',
      playerHasBid: true,
      quietDays: CONTEXT.economy.AUCTION_QUIET_DAYS_TO_HAMMER + 5,
      expiresOnDay: raised.day,
    }
    // Resolve against a state that actually HOLDS this lot (so the board
    // update lands), at the same default heat the search priced it at.
    const resolveState = stateWithLots([atBackstop], { cashYen: atBackstop.bookValueYen * 10 })
    const cashBefore = resolveState.cashYen
    const result = resolveLotForDay(resolveState, atBackstop, CONTEXT, raised.day)

    expect(result.state.activeAuctionLots).toHaveLength(1) // still on the board, extended
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.cashYen).toBe(cashBefore) // player not charged
    expect(result.log.some((e) => e.type === 'auction-bid-lost')).toBe(false) // NOT robbed
    expect(result.log.some((e) => e.type === 'auction-bid-won')).toBe(false)
    // It IS a genuine displacement (a real snipe attempt), just harmless now.
    expect(result.state.activeAuctionLots[0]?.leadingBidder).toBe('rival')
    expect(result.log.some((e) => e.type === 'auction-outbid')).toBe(true)
  })

  it('the backstop (expiresOnDay) hammers a lot even before quietDays reaches the threshold', () => {
    const { lot } = sampleLot(31)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 3,
      leadingBidder: 'player',
      quietDays: 0,
      playerHasBid: true,
      expiresOnDay: 5,
    }
    const state = stateWithLots([dominant], { cashYen: lot.bookValueYen * 10 })
    // Day 5 == expiresOnDay: the overnight step this same day only brings
    // quietDays to 1 (below the threshold), but the backstop (on a quiet step) forces
    // the hammer anyway.
    const result = resolveLotForDay(state, dominant, CONTEXT, 5)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.log.some((e) => e.type === 'auction-bid-won')).toBe(true)
  })

  it('a lot nobody ever bid on resolves silently at the backstop - no leader, no log, no sale', () => {
    const { lot } = sampleLot(32)
    const untouched: AuctionLot = { ...lot, expiresOnDay: 3 }
    const state = stateWithLots([untouched])
    const result = resolveLotForDay(state, untouched, NO_BUYERS_CONTEXT, 3)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.log).toEqual([])
  })

  it('a dealer win at the hammer logs the loss only when playerHasBid', () => {
    const { lot } = sampleLot(33)
    const rivalLed: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 100,
      leadingBidder: 'rival',
      quietDays: 0,
      playerHasBid: false,
      expiresOnDay: 5,
    }
    const state = stateWithLots([rivalLed])
    const result = resolveLotForDay(state, rivalLed, CONTEXT, 5)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.log).toEqual([]) // the player never had skin in this lot

    const withPlayerSkin: AuctionLot = { ...rivalLed, playerHasBid: true }
    const resultWithSkin = resolveLotForDay(
      stateWithLots([withPlayerSkin]),
      withPlayerSkin,
      CONTEXT,
      5,
    )
    expect(
      resultWithSkin.log.some(
        (e) => e.type === 'auction-bid-lost' && e.winningPriceYen === withPlayerSkin.currentBidYen,
      ),
    ).toBe(true)
  })

  it('a won lot forfeits (no-space) without spending cash, still logging the loss - ONLY once parking, every service bay, AND the grace slot are all full (Sprint 45)', () => {
    const { lot } = sampleLot(35)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: 2,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], {
      parkingBayCount: 0,
      serviceBayCount: 0,
      graceParkingCarId: 'someone-elses-car',
    })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.graceParkingCarId).toBe('someone-elses-car') // untouched, not overwritten
    expect(
      result.log.some((e) => e.type === 'acquisition-blocked' && e.reason === 'no-space'),
    ).toBe(true)
    expect(result.log.some((e) => e.type === 'auction-bid-lost')).toBe(true)
  })

  it('a won lot with parking full but a service bay open lands in the bay, not lost (Sprint 45 decision 1)', () => {
    const { lot } = sampleLot(37)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: 2,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], { parkingBayCount: 0, serviceBayCount: 1 })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.serviceBayCarIds).toContain(lot.car.id)
    expect(result.state.graceParkingCarId).toBeNull()
    expect(result.log.some((e) => e.type === 'auction-bid-won')).toBe(true)
    expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(false)
  })

  it('a won lot with parking AND every service bay full double-parks in the grace slot instead of being lost (Sprint 45 decision 2)', () => {
    const { lot } = sampleLot(38)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: 2,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], { parkingBayCount: 0, serviceBayCount: 0 })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.graceParkingCarId).toBe(lot.car.id)
    expect(result.log.some((e) => e.type === 'auction-bid-won')).toBe(true)
    expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(false)
  })

  it('a won lot forfeits (no-cash) without spending cash, still logging the loss', () => {
    const { lot } = sampleLot(36)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: 2,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], { cashYen: 0 })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.cashYen).toBe(0)
    expect(result.log.some((e) => e.type === 'acquisition-blocked' && e.reason === 'no-cash')).toBe(
      true,
    )
  })

  it('Sprint 42: a won lot creates the car ledger with purchaseYen = the hammer price, repairs/parts at 0', () => {
    const { lot } = sampleLot(37)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: CONTEXT.economy.AUCTION_QUIET_DAYS_TO_HAMMER,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], { cashYen: lot.bookValueYen * 10 })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.ownedCars).toHaveLength(1)
    const carId = result.state.ownedCars[0]!.id
    expect(result.state.carLedgers[carId]).toEqual({
      purchaseYen: dominant.currentBidYen,
      repairYen: 0,
      partsYen: 0,
    })
  })

  it('Sprint 42: a forfeited win (no-parking/no-cash) creates no ledger entry - no car changed hands', () => {
    const { lot } = sampleLot(38)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: 2,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], { cashYen: 0 })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.carLedgers).toEqual({})
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
    // Sprint 26: lots are transparent now - no reveal machinery, so the
    // handover log is exactly the buyout entry.
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

  it('Sprint 42: creates the car ledger with purchaseYen = the buyout price', () => {
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

  it('lands in an open service bay when parking is full, instead of being refused (Sprint 45 decision 1)', () => {
    const { lot } = sampleLot(42)
    const state = stateWithLots([lot], { parkingBayCount: 0, serviceBayCount: 1 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.serviceBayCarIds).toContain(lot.car.id)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(false)
  })

  it('double-parks in the grace slot when parking AND every service bay are full, instead of being refused (Sprint 45 decision 2)', () => {
    const { lot } = sampleLot(43)
    const state = stateWithLots([lot], { parkingBayCount: 0, serviceBayCount: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.graceParkingCarId).toBe(lot.car.id)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(false)
  })

  it('leaves the lot on the board (no money spent) only once parking, every service bay, AND the grace slot are all full (Sprint 45)', () => {
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

  it('always exceeds the current board price - a live bid never blocks a buyout', () => {
    const { lot } = sampleLot(43)
    const state = stateWithLots([lot])
    const reserve = reserveYen(lot, state, CONTEXT)
    const contested: AuctionLot = { ...lot, currentBidYen: reserve, leadingBidder: 'rival' }
    const priceYen = computeBuyoutPriceYen(contested, state, CONTEXT)
    expect(priceYen).toBeGreaterThan(contested.currentBidYen)
  })
})

/**
 * Distribution probes (the sprint's real acceptance evidence, sim-level, no
 * bots - sprint20.md's Testing bullets). Both sample a real population of
 * generated lots and simulate them purely through `resolveLotForDay`, the
 * exact function `advanceDay` calls.
 */
describe('distribution probes', () => {
  it('hammer/anchor clusters near guide value with a real frenzy tail (Sprint 59 retune)', () => {
    // No player involvement at all: every lot clears purely via dealers
    // bidding among themselves (the "background market selling to itself"),
    // stepped directly through `advanceLotOvernight` up to its own hammer
    // (quietDays or backstop) - the exact rule `resolveLotForDay` applies.
    // 250 genuinely independent lots (own rolled duration each, not a
    // shared one) for real flash/standard/long variety.
    //
    // Empirically measured against this exact population (deterministic,
    // fixed seed range - not a flaky sample). Sprint 30 replaced the old
    // one-shot demand ceiling with the daily per-cohort bidder-interest
    // process (decision 3); the underlying quiet-day/backstop hammer rule
    // (`AUCTION_QUIET_DAYS_TO_HAMMER` 2) is unchanged. First-pass values,
    // openly adjustable in economy.json; this test pins today's real
    // behavior rather than a guessed number, per the codebase's own
    // precedent (report, don't force a number nobody's confirmed).
    const finalRatios: number[] = []
    for (const initial of independentLots(250, 5000)) {
      const state = stateWithLots([initial])
      const anchor = anchorValueYen(initial, state, CONTEXT)
      if (anchor <= 0) continue
      let lot = initial
      let hammeredAtYen: number | null = null
      for (let day = 1; day <= 40 && hammeredAtYen === null; day++) {
        const step = advanceLotOvernight(lot, state, CONTEXT, day)
        lot = step.lot
        const shouldHammer =
          lot.quietDays >= ECONOMY.AUCTION_QUIET_DAYS_TO_HAMMER || day >= lot.expiresOnDay
        if (shouldHammer) {
          hammeredAtYen = lot.leadingBidder === null ? null : lot.currentBidYen
          break
        }
      }
      if (hammeredAtYen !== null) finalRatios.push(hammeredAtYen / anchor)
    }

    expect(finalRatios.length).toBeGreaterThan(50)
    finalRatios.sort((a, b) => a - b)
    const p10 = finalRatios[Math.floor(finalRatios.length * 0.1)]!
    const median = finalRatios[Math.floor(finalRatios.length / 2)]!
    const p90 = finalRatios[Math.floor(finalRatios.length * 0.9)]!
    // Sprint 59 (playtest item 19, the ~156k unimproved instant-flip bug):
    // `AUCTION_WHOLESALE_FRACTION` moved 0.75 -> 0.97 so a contested close
    // converges on fair value instead of a wholesale discount - re-measured
    // (not re-derived) against this exact population: p10 ~0.82, median
    // ~0.97 (right at the new wholesale center), p90 ~1.10, with a genuine
    // frenzy tail (93% of lots clear above 0.8x guide, 36% clear above guide
    // value outright). Bounds kept as generous headroom around the real
    // measurement, same "report the real number" policy as the rest of this
    // probe.
    expect(p10).toBeGreaterThan(0.6)
    expect(median).toBeGreaterThan(0.85)
    expect(median).toBeLessThan(1.1)
    expect(p90).toBeGreaterThan(0.9)
    // A real frenzy tail: a meaningful share of lots clear above guide value
    // outright, not just above some arbitrary threshold below it.
    expect(finalRatios.some((r) => r > 1.0)).toBe(true)
  })

  it('a scripted patient bidder (raises to a fair target, walks above it) wins less often post-Sprint-59, but every win beats buyout', () => {
    // Sprint 59 (playtest item 19) real, expected shape change: this test
    // used to measure 196/200 (98%) wins at target = guide value, comfortably
    // clearing the sprint20.md doc's >= 70% target. That target was only
    // ever high BECAUSE rivals bid to a wholesale-discounted ceiling
    // (`AUCTION_WHOLESALE_FRACTION` 0.75) - a disciplined bidder capped at
    // guide value rarely had to compete with anyone bidding ABOVE guide
    // value. Now that rivals price near/above guide value (0.97), the same
    // disciplined bidder wins only 82/200 (41%) of the lots it pursues -
    // that drop IS the fix (the free lunch this sprint closes was exactly
    // "rivals never contest past a wholesale discount"). What still holds,
    // and is worth hard-gating: EVERY win is still cheaper than an instant
    // buyout (82/82, 100%) - true by construction (the bidder's own target,
    // guide value, is always below `AUCTION_BUYOUT_PREMIUM` x guide value),
    // but worth a permanent regression test that the buyout premium itself
    // never accidentally collapses onto the target.
    //
    // "Pursues" = a lot the bidder is willing to open at all (its opening
    // price doesn't already exceed the target); "acquires cheaper than
    // buyout" = wins it, at a price below what an instant buyout would
    // have cost at the moment the lot first appeared.
    const TARGET_MULTIPLIER = 1.0 // never pays more than the car is genuinely worth
    let pursued = 0
    let wonCount = 0
    let acquiredCheap = 0

    for (const initial of independentLots(200, 9000)) {
      let state = stateWithLots([initial])
      const anchor = anchorValueYen(initial, state, CONTEXT)
      if (anchor <= 0) continue
      const targetYen = Math.round(anchor * TARGET_MULTIPLIER)
      const buyoutAtStartYen = computeBuyoutPriceYen(initial, state, CONTEXT)
      if (nextRaiseYen(initial, state, CONTEXT) > targetYen) continue // wouldn't even open at a price it likes
      pursued++

      let lot = initial
      let won = false
      let finalPriceYen = 0
      for (let day = 1; day <= 40; day++) {
        if (lot.leadingBidder !== 'player') {
          const raiseToYen = nextRaiseYen(lot, state, CONTEXT)
          if (raiseToYen <= targetYen) {
            const bidResult = resolvePlaceBid(state, lot.id, raiseToYen, CONTEXT)
            state = bidResult.state
            const updated = state.activeAuctionLots.find((l) => l.id === lot.id)
            if (updated) lot = updated
          }
        }
        const dayResult = resolveLotForDay(state, lot, CONTEXT, day)
        state = dayResult.state
        const stillActive = state.activeAuctionLots.find((l) => l.id === lot.id)
        if (stillActive) {
          lot = stillActive
          continue
        }
        const wonEntry = dayResult.log.find((e) => e.type === 'auction-bid-won')
        if (wonEntry && wonEntry.type === 'auction-bid-won') {
          won = true
          finalPriceYen = wonEntry.finalPriceYen
        }
        break
      }

      if (won) {
        wonCount++
        if (finalPriceYen < buyoutAtStartYen) acquiredCheap++
      }
    }

    expect(pursued).toBeGreaterThan(50)
    // Real, disclosed win rate at the new economics - not gated high (a
    // disciplined bidder is SUPPOSED to lose most contested lots now), just
    // bounded sane: not near-zero (the market isn't a total lockout) and
    // not near-100% (that would mean the fix didn't land).
    expect(wonCount / pursued).toBeGreaterThan(0.2)
    expect(wonCount / pursued).toBeLessThan(0.7)
    // Hard-gated: whenever this disciplined bidder DOES win, it is always
    // cheaper than an instant buyout would have been.
    expect(wonCount).toBeGreaterThan(20)
    expect(acquiredCheap).toBe(wonCount)
  })
})

/**
 * Sprint 30 decision 3's own three required behavioral proofs, seeded-
 * deterministic populations, each forcing `turnout` directly (rather than
 * relying on a lot's own roll) so "thin" and "packed" are compared like for
 * like against the identical underlying car/model.
 */
describe('Sprint 30 decision 3 behavioral proofs', () => {
  /**
   * (a) A packed lot cannot sit bidless while priced under its walk-away
   * band: with many rival cohorts (5-7) each independently rolling nightly
   * interest, the odds that NONE of them bid while the lot is still cheap
   * relative to guide value collapses fast - a thin lot (as few as 1 cohort)
   * has no such safety net and can genuinely stay silent for real stretches.
   */
  it('(a) a packed, underpriced lot goes bidless far less often than a thin one over several nights', () => {
    const { lot } = sampleLot(1)
    const state = stateWithLots([])
    const SAMPLE = 150
    const NIGHTS = 4

    function stillBidlessCount(turnout: AuctionLot['turnout']): number {
      const lots = Array.from({ length: SAMPLE }, (_, i) => ({
        ...lot,
        id: `bidless-${turnout}-${i}`,
        turnout,
      }))
      return lots.filter((initial) => {
        let current = initial
        for (let day = 1; day <= NIGHTS; day++) {
          current = advanceLotOvernight(current, state, CONTEXT, day).lot
        }
        return current.currentBidYen === 0
      }).length
    }

    const thinBidless = stillBidlessCount('thin')
    const packedBidless = stillBidlessCount('packed')
    expect(packedBidless).toBeLessThan(thinBidless)
    expect(packedBidless / SAMPLE).toBeLessThan(0.1)
  })

  /**
   * (b) A reserve snipe on the backstop day only succeeds when turnout was
   * genuinely thin: the player opens a lot at the bare reserve and never
   * raises again, hoping silence carries it all the way to the hammer. With
   * a packed field, some cohort almost always answers overnight and
   * displaces the sniper long before the backstop; with a thin field, real
   * silent runs are common enough that the snipe frequently survives.
   */
  it('(b) a bare-reserve snipe survives to the hammer far more often under thin turnout than packed', () => {
    const { lot } = sampleLot(1)
    const SAMPLE = 150

    function snipeWinRate(turnout: AuctionLot['turnout']): number {
      let attempts = 0
      let wins = 0
      for (let i = 0; i < SAMPLE; i++) {
        const candidate: AuctionLot = {
          ...lot,
          id: `snipe-${turnout}-${i}`,
          expiresOnDay: 25,
          turnout,
        }
        let state = stateWithLots([candidate])
        const reserve = reserveYen(candidate, state, CONTEXT)
        if (reserve <= 0) continue
        attempts++
        const opened = resolvePlaceBid(state, candidate.id, reserve, CONTEXT).state
        let current = opened.activeAuctionLots[0]!
        state = opened
        for (let day = 1; day <= 25; day++) {
          const result = resolveLotForDay(state, current, CONTEXT, day)
          state = result.state
          const stillActive = state.activeAuctionLots.find((l) => l.id === candidate.id)
          if (stillActive) {
            current = stillActive
            continue
          }
          if (result.log.some((e) => e.type === 'auction-bid-won')) wins++
          break
        }
      }
      return attempts > 0 ? wins / attempts : 0
    }

    const thinRate = snipeWinRate('thin')
    const packedRate = snipeWinRate('packed')
    expect(thinRate).toBeGreaterThan(packedRate)
    expect(packedRate).toBeLessThan(0.25)
  })

  /**
   * (c) Sprint 59 (playtest item 19) INVERTS this proof's own direction, and
   * the inversion is real, not a bug. Pre-Sprint-59, `AUCTION_WHOLESALE_
   * FRACTION` (0.75) was a genuine discount below guide value, so more
   * cohorts (packed) meant the price reliably converged on that discount -
   * "packed clusters near a wholesale center below guide value" was true.
   * Now the wholesale center is 0.97 (basically AT guide value), so there is
   * no discount left for a larger field to converge on: a PACKED field's
   * closing price is the near-maximum of 5-7 independent draws even from its
   * own tighter spread (0.08 SD), and order statistics push that maximum
   * meaningfully above the 0.97 center - often past guide value (1.0)
   * outright. A THIN field's closing price is the max of only 1-2 draws from
   * a much WIDER spread (0.3 SD) - usually close to the center, occasionally
   * a genuine high-tail outlier, but rarely pushed as far by sheer sample
   * count. Net effect, measured against this exact population: thin wins
   * clear above guide value 25% of the time; packed wins clear above guide
   * value 74% of the time - the opposite ranking from the pre-retune world,
   * and exactly what "rivals now price near fair value" should produce.
   */
  it('(c) wins above guide value are now MORE common under packed turnout than thin (Sprint 59 retune)', () => {
    const { lot } = sampleLot(1)
    const SAMPLE = 150
    const CEILING_MULTIPLIER = 1.3

    function aboveGuideWinShare(turnout: AuctionLot['turnout']): number {
      let totalWins = 0
      let aboveGuideWins = 0
      for (let i = 0; i < SAMPLE; i++) {
        const candidate: AuctionLot = {
          ...lot,
          id: `overpay-${turnout}-${i}`,
          expiresOnDay: 30,
          turnout,
        }
        let state = stateWithLots([candidate])
        const guideValueYen = anchorValueYen(candidate, state, CONTEXT)
        if (guideValueYen <= 0) continue
        const chaseCeilingYen = Math.round(guideValueYen * CEILING_MULTIPLIER)

        let current = candidate
        let finalPriceYen: number | null = null
        for (let day = 1; day <= 30 && finalPriceYen === null; day++) {
          if (current.leadingBidder !== 'player') {
            const raiseToYen = nextRaiseYen(current, state, CONTEXT)
            if (raiseToYen <= chaseCeilingYen) {
              const bidResult = resolvePlaceBid(state, current.id, raiseToYen, CONTEXT)
              state = bidResult.state
              const updated = state.activeAuctionLots.find((l) => l.id === candidate.id)
              if (updated) current = updated
            }
          }
          const dayResult = resolveLotForDay(state, current, CONTEXT, day)
          state = dayResult.state
          const stillActive = state.activeAuctionLots.find((l) => l.id === candidate.id)
          if (stillActive) {
            current = stillActive
            continue
          }
          const wonEntry = dayResult.log.find((e) => e.type === 'auction-bid-won')
          if (wonEntry && wonEntry.type === 'auction-bid-won')
            finalPriceYen = wonEntry.finalPriceYen
          break
        }

        if (finalPriceYen !== null) {
          totalWins++
          if (finalPriceYen > guideValueYen) aboveGuideWins++
        }
      }
      return totalWins > 0 ? aboveGuideWins / totalWins : 0
    }

    const thinShare = aboveGuideWinShare('thin')
    const packedShare = aboveGuideWinShare('packed')
    expect(packedShare).toBeGreaterThan(thinShare)
    expect(thinShare).toBeLessThan(0.45)
    expect(packedShare).toBeGreaterThan(0.55)
  })
})
