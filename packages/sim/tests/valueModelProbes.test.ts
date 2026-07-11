import {
  BUYERS,
  CARS,
  ECONOMY,
  HIDDEN_ISSUES,
  PARTS,
  type AuctionLot,
  type CarInstance,
  type CarModel,
  type ComponentId,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, nextRaiseYen, resolveLotForDay, resolvePlaceBid } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { marketValueYen } from '../src/marketValue'
import { createRng } from '../src/rng'
import { listPubliclyAskingPrice } from '../src/selling'

/**
 * Sprint 21 acceptance probes (sprint21.md's "Restoration-uplift" and
 * "Full-flip" Testing bullets). Both reuse Sprint 20's probe harness shape
 * (`bidding.test.ts`'s `independentLots`/`stateWithLots`) - a real generated
 * lot population, resolved purely through the same functions `advanceDay`
 * calls, not a bot or a mocked shortcut.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)

const PROBE_MODEL = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
if (!PROBE_MODEL) throw new Error('fixture car missing from seed content')
const PROBE_MODELS: readonly CarModel[] = [PROBE_MODEL]

const ALL_COMPONENT_IDS: readonly ComponentId[] = [
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'wheels',
  'body',
  'interior',
]

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
    marketLedger: { lotSupply: {}, playerSales: {} },
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
    ...overrides,
  }
}

/** Many genuinely independent lots (own id, own rolled duration, own
 * condition/car instance) for the same fixture car - mirrors bidding.test.ts's
 * helper of the same name/shape. */
function independentLots(count: number, startSeed: number): AuctionLot[] {
  return Array.from({ length: count }, (_, i) => {
    const [lot] = generateAuctionCatalog(
      PROBE_MODELS,
      'premium',
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      1,
      createRng(startSeed + i),
      ECONOMY,
    )
    if (!lot) throw new Error('expected exactly one lot')
    return { ...lot, id: `value-probe-lot-${startSeed}-${i}` }
  })
}

/** Every one of the 8 real components set to condition 100 - a full
 * restoration - installed parts (never present on a fresh auction car, per
 * `generateAuctionCarInstance`) are left untouched either way. */
function fullyRestored(car: CarInstance): CarInstance {
  const components = { ...car.components }
  for (const componentId of ALL_COMPONENT_IDS) {
    components[componentId] = { ...components[componentId], condition: 100 }
  }
  return { ...car, components }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

describe('restoration-uplift probe (acceptance, sprint21.md)', () => {
  it('median marketValue(fully restored) - marketValue(as rolled) is 35-60% of book', () => {
    // Sanity note carried from the doc: the formula's theoretical max uplift
    // is 75% of book (weighted 0 -> 100), but the generator's baseline roll
    // is 30-90 (CAR_CONDITION_BASE_MIN/MAX), so the population MEDIAN lands
    // mid-band - individual wrecks may exceed 60%.
    const upliftFractions = independentLots(300, 1000).map((lot) => {
      const asRolledValue = marketValueYen(PROBE_MODEL, lot.car, 100, {}, ECONOMY)
      const restoredValue = marketValueYen(PROBE_MODEL, fullyRestored(lot.car), 100, {}, ECONOMY)
      return (restoredValue - asRolledValue) / PROBE_MODEL.bookValueYen
    })

    const upliftMedian = median(upliftFractions)
    // Measured (2026-07-11, this exact deterministic population): 36.7% of
    // book - clears the floor but by a real margin, not a coincidence of
    // rounding; see sprint21.md's Exit for the full measured set.
    expect(upliftMedian).toBeGreaterThan(0.35)
    expect(upliftMedian).toBeLessThan(0.6)
  })

  it('restoring a car never decreases its value (uplift is never negative)', () => {
    for (const lot of independentLots(100, 2000)) {
      const asRolledValue = marketValueYen(PROBE_MODEL, lot.car, 100, {}, ECONOMY)
      const restoredValue = marketValueYen(PROBE_MODEL, fullyRestored(lot.car), 100, {}, ECONOMY)
      expect(restoredValue).toBeGreaterThanOrEqual(asRolledValue)
    }
  })
})

describe('full-flip probe (acceptance, sprint21.md)', () => {
  it('acquire (scripted patient bidder) -> full restoration -> best-channel sale nets a positive margin most of the time', () => {
    // Rent is 0 (Sprint 20 decision, restored in Sprint 23) - this measures
    // the acquisition-restoration-sale loop itself, not the cost treadmill.
    // "Best-channel" sale price is `listPubliclyAskingPrice` (GDD 6.3's
    // "slow, market price" channel) - deterministic, unlike walk-in's rolled
    // discount, so the probe measures the value model, not channel RNG.
    const marginFractions: number[] = []

    for (const initial of independentLots(200, 3000)) {
      let state = stateWithLots([initial])
      const anchor = anchorValueYen(initial, state, CONTEXT)
      if (anchor <= 0) continue
      const targetYen = anchor // never pay more than the car is genuinely worth
      if (nextRaiseYen(initial, ECONOMY) > targetYen) continue // wouldn't even open at a price it likes

      let lot = initial
      let wonPriceYen: number | null = null
      for (let day = 1; day <= 40 && wonPriceYen === null; day++) {
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
          wonPriceYen = wonEntry.finalPriceYen
        }
        break
      }

      if (wonPriceYen === null) continue
      const boughtCar = state.ownedCars.find((c) => c.id === initial.car.id)
      if (!boughtCar) continue

      const restoredCar = fullyRestored(boughtCar)
      const salePriceYen = listPubliclyAskingPrice(
        restoredCar,
        PROBE_MODEL,
        CONTEXT.buyers,
        CONTEXT.partsById,
        100,
        CONTEXT.hiddenIssuesById,
        CONTEXT.economy,
      )
      marginFractions.push((salePriceYen - wonPriceYen) / PROBE_MODEL.bookValueYen)
    }

    expect(marginFractions.length).toBeGreaterThan(50)
    const marginMedian = median(marginFractions)
    const positiveShare = marginFractions.filter((m) => m > 0).length / marginFractions.length
    // Measured (2026-07-11, this exact deterministic population, n=197):
    // median margin 66.0% of book, 100% of flips positive - see sprint21.md's
    // Exit for the full measured set.

    expect(marginMedian).toBeGreaterThanOrEqual(0.15)
    expect(positiveShare).toBeGreaterThanOrEqual(0.7)
  })
})
