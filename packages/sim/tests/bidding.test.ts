import {
  BUYERS,
  CARS,
  ECONOMY,
  HIDDEN_ISSUES,
  PARTS,
  type AuctionLot,
  type DayLogEntry,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  advanceLotOvernight,
  anchorValueYen,
  bidIncrementYen,
  computeBuyoutPriceYen,
  demandCeilingYen,
  nextRaiseYen,
  resolveBuyoutInstant,
  resolveLotForDay,
  resolvePlaceBid,
  turnoutBand,
} from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
/** A context with no interested buyers at all - forces `anchorValueYen`
 * (and therefore the demand ceiling) to 0 for every lot, so a lot never
 * opens on its own no matter how many days pass. */
const NO_BUYERS_CONTEXT = buildSimContext(CARS, PARTS, [], HIDDEN_ISSUES)

const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)

function stateWithLots(lots: AuctionLot[], overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 10_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: lots,
    activeListings: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
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

/** A freshly rolled lot for a broadly-desired rare car (strong, reliable
 * interest across several buyer archetypes) - the fixture most of this
 * file's scenario tests build on, same as the pre-Sprint-20 file did. */
function sampleLot(seed: number) {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')
  const [lot] = generateAuctionCatalog(
    [model],
    'premium',
    HIDDEN_ISSUES_BY_COMPONENT,
    7,
    1,
    createRng(seed),
    ECONOMY,
  )
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
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      1,
      createRng(startSeed + i),
      ECONOMY,
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

describe('demandCeilingYen (Sprint 25 task 4: re-seeded daily)', () => {
  it('is deterministic for a given lot/day, but a different day can roll differently', () => {
    const { lot } = sampleLot(3)
    const state = stateWithLots([lot])
    const a = demandCeilingYen(lot, state, CONTEXT, 5)
    const b = demandCeilingYen(lot, state, CONTEXT, 5)
    expect(a).toBe(b)
    // Not a guarantee for any single lot (a coincidental tie is possible),
    // but across a real population, day-to-day values genuinely differ -
    // that's the entire point of the fix (a lot stuck below reserve now
    // gets a fresh roll every day instead of the same one forever).
    const sample = statLots(100, 'ceiling-day-variance')
    const day1 = sample.map((l) => demandCeilingYen(l, state, CONTEXT, 1))
    const day2 = sample.map((l) => demandCeilingYen(l, state, CONTEXT, 2))
    expect(day1).not.toEqual(day2)
  })

  it('is 0 whenever the anchor itself is 0', () => {
    const { lot } = sampleLot(4)
    const state = stateWithLots([lot])
    expect(demandCeilingYen(lot, state, NO_BUYERS_CONTEXT, 1)).toBe(0)
  })

  it('centers around AUCTION_WHOLESALE_FRACTION of the anchor across many lots', () => {
    const state = stateWithLots([])
    const { model } = sampleLot(1)
    const anchor = anchorValueYen(sampleLot(1).lot, state, CONTEXT)
    const ratios = statLots(300).map((lot) => demandCeilingYen(lot, state, CONTEXT, 1) / anchor)
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    // Center is AUCTION_WHOLESALE_FRACTION (0.75); the thin-turnout tail
    // pulls the mean down a little, so a loose band around it is the honest
    // claim, not an exact match.
    expect(mean).toBeGreaterThan(ECONOMY.AUCTION_WHOLESALE_FRACTION * 0.75)
    expect(mean).toBeLessThan(ECONOMY.AUCTION_WHOLESALE_FRACTION * 1.15)
    expect(model.tier).toBe('rare') // sanity: this fixture is still JZA80
  })

  /**
   * The sprint doc's own required test: a lot whose day-1 ceiling can't
   * clear reserve is no longer permanently dead - some later day's re-roll
   * does, so it can open organically. Searches a real population rather
   * than asserting on one seed, since which specific lot starts below
   * reserve (and which later day clears it) is itself random.
   */
  it('a lot with ceiling below reserve on day 1 can still open on a later day', () => {
    const state = stateWithLots([])
    const candidates = statLots(300, 'reopen-check')
    let found = false
    for (const lot of candidates) {
      const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
      if (demandCeilingYen(lot, state, CONTEXT, 1) >= reserve) continue // already opens day 1
      for (let day = 2; day <= 30 && !found; day++) {
        if (demandCeilingYen(lot, state, CONTEXT, day) >= reserve) found = true
      }
      if (found) break
    }
    expect(found).toBe(true)
  })
})

describe('turnoutBand (replaces computeLotInterest - a coarse pre-bid flavor read)', () => {
  it('is deterministic and pure for a given day', () => {
    const { lot } = sampleLot(50)
    const state = stateWithLots([lot])
    const a = turnoutBand(lot, state, CONTEXT, 1)
    const b = turnoutBand(lot, state, CONTEXT, 1)
    expect(a).toBe(b)
    expect(['thin', 'steady', 'packed']).toContain(a)
  })

  it('reads thin when nobody is interested in this tier at all', () => {
    const { lot } = sampleLot(51)
    const state = stateWithLots([lot])
    expect(turnoutBand(lot, state, NO_BUYERS_CONTEXT, 1)).toBe('thin')
  })

  it('matches the ratio thresholds in AUCTION_TURNOUT_BANDS across a population, honesty override aside', () => {
    const state = stateWithLots([])
    const anchor = anchorValueYen(sampleLot(1).lot, state, CONTEXT)
    const center = anchor * ECONOMY.AUCTION_WHOLESALE_FRACTION
    const [thinBelow, packedAbove] = ECONOMY.AUCTION_TURNOUT_BANDS
    let checked = 0
    for (const lot of statLots(150, 'turnout-band-check')) {
      const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
      const ceiling = demandCeilingYen(lot, state, CONTEXT, 1)
      const ratio = ceiling / center
      // Sprint 25 task 4: below-reserve always reads thin, regardless of ratio.
      const expected =
        ceiling < reserve
          ? 'thin'
          : ratio < thinBelow
            ? 'thin'
            : ratio > packedAbove
              ? 'packed'
              : 'steady'
      expect(turnoutBand(lot, state, CONTEXT, 1)).toBe(expected)
      checked++
    }
    expect(checked).toBe(150)
  })

  it('every band is genuinely reachable across a large population', () => {
    const state = stateWithLots([])
    const bands = statLots(400, 'turnout-band-coverage').map((lot) =>
      turnoutBand(lot, state, CONTEXT, 1),
    )
    expect(bands).toContain('thin')
    expect(bands).toContain('steady')
    expect(bands).toContain('packed')
  })

  /**
   * The sprint doc's own required test: the badge must never overclaim
   * interest on a lot that structurally can't open. Sprint 25 task 4 fixed
   * the exact bug where a favorable spread roll on an absolutely weak lot
   * (ceiling still below reserve) could read "packed" - checked across many
   * lots and several days each, since both the lot population and the daily
   * re-roll are random.
   */
  it('never reads packed while the ceiling is below reserve', () => {
    const state = stateWithLots([])
    let checked = 0
    for (const lot of statLots(200, 'packed-honesty-check')) {
      const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
      for (let day = 1; day <= 5; day++) {
        const ceiling = demandCeilingYen(lot, state, CONTEXT, day)
        if (ceiling < reserve) {
          expect(turnoutBand(lot, state, CONTEXT, day)).not.toBe('packed')
        }
        checked++
      }
    }
    expect(checked).toBe(1000)
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
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
    expect(nextRaiseYen(lot, ECONOMY)).toBe(reserve)

    const opened: AuctionLot = { ...lot, currentBidYen: reserve, leadingBidder: 'rival' }
    expect(nextRaiseYen(opened, ECONOMY)).toBe(reserve + bidIncrementYen(lot, ECONOMY))
  })
})

describe('resolvePlaceBid (Sprint 20 - open-raise semantics)', () => {
  it('opens an unopened lot at exactly the reserve price', () => {
    const { lot } = sampleLot(10)
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
    const state = stateWithLots([lot])
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
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
    const state = stateWithLots([lot])
    const result = resolvePlaceBid(state, lot.id, reserve - 10_000, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('increment enforcement: a raise below current + increment is a no-op, exactly current + increment succeeds', () => {
    const { lot } = sampleLot(12)
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
    const opened = resolvePlaceBid(stateWithLots([lot]), lot.id, reserve, CONTEXT).state
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
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
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

  it('opens most lots of a broadly-desired car at the reserve price once the demand ceiling clears it', () => {
    const { lot } = sampleLot(22)
    const state = stateWithLots([lot])
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
    // JZA80 at premium tier is broadly desired, so its ceiling clears reserve
    // most of the time - but a thin-turnout roll combined with a low spread
    // draw can occasionally leave a lot bidless on day 1, so this is a
    // statistical majority claim, not "every single lot", to avoid a flaky
    // assertion on the tail. Threshold at 0.65 (Sprint 25 task 4): re-seeding
    // demandCeilingYen on `lot.id:day` instead of `lot.id` alone changes every
    // draw against this 200-lot sample (the point of the fix - a lot's
    // ceiling isn't the same fixed roll forever) - measured real value on
    // day 1 is 146/200 = 0.73, comfortably above 0.65, still a real majority.
    const opened = statLots(200, 'open-check').map(
      (l) => advanceLotOvernight(l, state, CONTEXT, 1).lot,
    )
    const openedCount = opened.filter(
      (l) => l.currentBidYen === reserve && l.leadingBidder === 'rival',
    ).length
    expect(openedCount / opened.length).toBeGreaterThan(0.65)
  })

  it('at or above the ceiling: silence - quietDays increments, the board never moves', () => {
    const { lot } = sampleLot(23)
    const state = stateWithLots([lot])
    // A currentBidYen far above any realistic ceiling forces the
    // deterministic "at/above ceiling" branch every time, regardless of the
    // per-day RNG roll.
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

  it('a dealer raise that displaces the player logs auction-outbid; dealer-vs-dealer raises log nothing', () => {
    const { lot } = sampleLot(24)
    const state = stateWithLots([lot])
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)

    // Find a lot id/day combination where the overnight step genuinely
    // raises (not silence) - search a small population for one, since the
    // raise itself is a seeded coin flip. Keeps the matched candidate's OWN
    // car/anchor value (not the outer sampleLot's) - a mismatch here is a
    // real latent bug: the search and the assertion must price the same lot.
    let raised: { opened: AuctionLot; day: number } | undefined
    for (const candidate of statLots(60, 'outbid-search')) {
      const opened: AuctionLot = { ...candidate, currentBidYen: reserve, leadingBidder: 'player' }
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
      currentBidYen: reserve,
      leadingBidder: 'player',
      playerHasBid: true,
    }
    const displaced = advanceLotOvernight(playerLed, state, CONTEXT, raised.day)
    expect(displaced.lot.leadingBidder).toBe('rival')
    expect(displaced.log).toEqual([
      { type: 'auction-outbid', lotId: playerLed.id, newBidYen: displaced.lot.currentBidYen },
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
    const state = stateWithLots([dominant], { cashYen: lot.bookValueYen * 10 })

    const day1 = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(day1.state.activeAuctionLots).toHaveLength(1) // 1 quiet day: not hammered yet
    expect(day1.state.activeAuctionLots[0]?.quietDays).toBe(1)

    const day2 = resolveLotForDay(day1.state, day1.state.activeAuctionLots[0]!, CONTEXT, 2)
    expect(day2.state.activeAuctionLots).toHaveLength(0) // 2 quiet days: hammered
    expect(day2.state.ownedCars).toHaveLength(1)
    expect(day2.state.cashYen).toBe(state.cashYen - dominant.currentBidYen)
    expect(day2.log.some((e) => e.type === 'auction-bid-won')).toBe(true)
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
    // quietDays to 1 (below the threshold of 2), but the backstop forces
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

  /**
   * Sprint 25 task 4 changed the ceiling from a fixed-forever number to a
   * daily re-roll, so "at the ceiling" is now a per-day fact, not something
   * that holds for 10 days running against one snapshot value. Re-derives
   * that day's own ceiling before each step instead of assuming yesterday's
   * still applies - the tie invariant itself (a bid exactly at TODAY's
   * ceiling is never overtaken today) is unchanged.
   */
  it("ceiling-tie goes to the player: a player bid exactly at a day's demand ceiling is never overtaken that day", () => {
    const { lot } = sampleLot(34)
    const state = stateWithLots([lot])
    let sawARealCeiling = false
    for (let day = 1; day <= 10; day++) {
      const ceiling = demandCeilingYen(lot, state, CONTEXT, day)
      if (ceiling <= 0) continue // no interested buyer for this seed - nothing to tie against
      sawARealCeiling = true
      const atCeiling: AuctionLot = {
        ...lot,
        currentBidYen: ceiling,
        leadingBidder: 'player',
        quietDays: 0,
        playerHasBid: true,
        expiresOnDay: 1000,
      }
      const step = advanceLotOvernight(atCeiling, state, CONTEXT, day)
      expect(step.lot.leadingBidder).toBe('player') // never displaced
      expect(step.lot.currentBidYen).toBe(ceiling) // never raised past the tie
    }
    expect(sawARealCeiling).toBe(true)
  })

  it('a won lot forfeits (no-parking) without spending cash, still logging the loss', () => {
    const { lot } = sampleLot(35)
    const dominant: AuctionLot = {
      ...lot,
      currentBidYen: lot.bookValueYen * 2,
      leadingBidder: 'player',
      quietDays: 2,
      playerHasBid: true,
      expiresOnDay: 1000,
    }
    const state = stateWithLots([dominant], { parkingBayCount: 0 })
    const result = resolveLotForDay(state, dominant, CONTEXT, 1)
    expect(result.state.ownedCars).toHaveLength(0)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(
      result.log.some((e) => e.type === 'acquisition-blocked' && e.reason === 'no-parking'),
    ).toBe(true)
    expect(result.log.some((e) => e.type === 'auction-bid-lost')).toBe(true)
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
    // Sprint 22: an uninspected buyout with real rolled issues also logs the
    // discovery beat - derived from the lot itself so this holds regardless
    // of whether this specific seed happens to roll one.
    const expectedLog: DayLogEntry[] = [{ type: 'lot-bought-out', lotId: lot.id, priceYen }]
    if (lot.car.hiddenIssues.length > 0) {
      expectedLog.push({
        type: 'issues-discovered',
        carInstanceId: lot.car.id,
        issueIds: lot.car.hiddenIssues.map((i) => i.issueId),
      })
    }
    expect(result.log).toEqual(expectedLog)
  })

  it('is a no-op when unaffordable, leaving the lot on the board', () => {
    const { lot } = sampleLot(41)
    const state = stateWithLots([lot], { cashYen: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('leaves the lot on the board (no money spent) when parking is full', () => {
    const { lot } = sampleLot(42)
    const state = stateWithLots([lot], { parkingBayCount: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.activeAuctionLots).toHaveLength(1)
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' },
    ])
  })

  it('always exceeds the current board price - a live bid never blocks a buyout', () => {
    const { lot } = sampleLot(43)
    const reserve = Math.round(lot.bookValueYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
    const contested: AuctionLot = { ...lot, currentBidYen: reserve, leadingBidder: 'rival' }
    const state = stateWithLots([contested])
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
  it('hammer/anchor lands below the wholesale center on typical lots, with a real upper tail', () => {
    // No player involvement at all: every lot clears purely via dealers
    // bidding among themselves (the "background market selling to itself"),
    // stepped directly through `advanceLotOvernight` up to its own hammer
    // (quietDays or backstop) - the exact rule `resolveLotForDay` applies.
    // 250 genuinely independent lots (own rolled duration each, not a
    // shared one) for real flash/standard/long variety.
    //
    // Empirically measured against this exact population (deterministic,
    // fixed seed range - not a flaky sample), AFTER Sprint 21 re-anchored
    // `anchorValueYen` onto taste-free `marketValueYen` (decision 7): p10
    // ~0.51, median ~0.71. Sprint 20's own original measurement (median
    // ~0.54) was against the pre-Sprint-21 anchor, which included buyer
    // taste (`valuateCarForBuyer`, bounded [0.88, 1.12]) on top of market
    // value - removing that taste multiplier from the anchor's denominator
    // is exactly why the ratio rose; the underlying hammer mechanics
    // (AUCTION_COUNTER_CHANCE 0.7, AUCTION_QUIET_DAYS_TO_HAMMER 2) are
    // unchanged. First-pass values, openly adjustable in economy.json; this
    // test pins today's real behavior rather than a guessed number, per the
    // codebase's own precedent (report, don't force a number nobody's
    // confirmed).
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
    expect(p10).toBeGreaterThan(0.35)
    expect(median).toBeGreaterThan(0.55)
    expect(median).toBeLessThan(0.85)
    expect(p90).toBeGreaterThan(0.55)
    // A real upper tail: some lots roll high enough spread/turnout to clear
    // well above the median.
    expect(finalRatios.some((r) => r > 0.8)).toBe(true)
  })

  it('a scripted patient bidder (raises to a fair target, walks above it) acquires cheaper than buyout on >= 70% of lots it pursues', () => {
    // Empirically measured against this exact (deterministic) population:
    // 196/200 (98%) - comfortably clears the sprint doc's >= 70% target.
    // "Pursues" = a lot the bidder is willing to open at all (its opening
    // price doesn't already exceed the target); "acquires cheaper than
    // buyout" = wins it, at a price below what an instant buyout would
    // have cost at the moment the lot first appeared.
    const TARGET_MULTIPLIER = 1.0 // never pays more than the car is genuinely worth
    let pursued = 0
    let acquiredCheap = 0

    for (const initial of independentLots(200, 9000)) {
      let state = stateWithLots([initial])
      const anchor = anchorValueYen(initial, state, CONTEXT)
      if (anchor <= 0) continue
      const targetYen = Math.round(anchor * TARGET_MULTIPLIER)
      const buyoutAtStartYen = computeBuyoutPriceYen(initial, state, CONTEXT)
      if (nextRaiseYen(initial, ECONOMY) > targetYen) continue // wouldn't even open at a price it likes
      pursued++

      let lot = initial
      let won = false
      let finalPriceYen = 0
      for (let day = 1; day <= 40; day++) {
        if (lot.leadingBidder !== 'player') {
          const raiseToYen = nextRaiseYen(lot, ECONOMY)
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

      if (won && finalPriceYen < buyoutAtStartYen) acquiredCheap++
    }

    expect(pursued).toBeGreaterThan(50)
    expect(acquiredCheap / pursued).toBeGreaterThanOrEqual(0.7)
  })
})
