import {
  BUYERS,
  ECONOMY,
  PARTS,
  type AuctionLot,
  type CarInstance,
  type CarModel,
  type ComponentId,
  type GameState,
  type HiddenIssue,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, nextRaiseYen, resolveLotForDay, resolvePlaceBid } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent, inspectLot } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { issueRepairCostYen, modelRiskDiscount } from '../src/issues'
import { createRng } from '../src/rng'
import { listPubliclyAskingPrice } from '../src/selling'

/**
 * Sprint 22 acceptance probes (sprint22.md's "Information-value" and
 * "Risk-discount" Testing bullets). Reuses Sprint 20/21's probe harness
 * shape (real generated lots, resolved purely through the same functions
 * `advanceDay` calls) — with two synthetic models built for full control
 * over risk profile: `HIGH_RISK_MODEL` almost always rolls a real engine
 * issue, `LOW_RISK_MODEL` never does, both sharing the same book value so
 * "equal value, different risk" is a real, controlled comparison rather
 * than a hunt through the real roster for two coincidentally-similar cars.
 */

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

/** severityMin/Max straddles `lemonSeverityThreshold` (40), skewed so a
 * MINORITY of rolls trigger walk-away — a real mix of "safe to buy" and
 * "walk away" outcomes, not an all-or-nothing population. `repairCostBaseYen`
 * is deliberately large relative to book value: at severity >= 40 the fix
 * cost genuinely exceeds what a full restoration's value uplift can cover
 * (that's the whole point — the issue must be able to flip a lot from a
 * profitable buy into a real loser, or there is nothing for inspection to
 * protect against). */
const HIGH_RISK_ISSUE: HiddenIssue = {
  id: 'synthetic-engine-knock',
  componentId: 'engine',
  severityMin: 10,
  severityMax: 60,
  hintText: 'a worrying knock under load',
  repairCostBaseYen: 2_500_000,
}

const MODEL_SHAPE: Omit<CarModel, 'id' | 'hiddenIssueWeights'> = {
  displayName: 'Probe Model',
  brand: 'Probe',
  parodyName: 'Probe Model',
  parodyBrand: 'Probe',
  spec: {
    chassisCode: 'PRB',
    engineCode: 'PRB',
    yearFrom: 1990,
    curbWeightKg: 1200,
    stockPowerPs: 160,
  },
  tier: 'rare',
  tags: ['FR', 'NA', 'Piston', '90s', 'JDM'],
  bookValueYen: 2_000_000,
}

const HIGH_RISK_MODEL: CarModel = {
  ...MODEL_SHAPE,
  id: 'synthetic-high-risk-model',
  hiddenIssueWeights: [{ componentId: 'engine', weight: 0.95 }],
}

const LOW_RISK_MODEL: CarModel = {
  ...MODEL_SHAPE,
  id: 'synthetic-low-risk-model',
  hiddenIssueWeights: [],
}

const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent([HIGH_RISK_ISSUE])
const CONTEXT = buildSimContext([HIGH_RISK_MODEL, LOW_RISK_MODEL], PARTS, BUYERS, [HIGH_RISK_ISSUE])

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

function independentLots(model: CarModel, count: number, startSeed: number): AuctionLot[] {
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
    return { ...lot, id: `issue-probe-lot-${startSeed}-${i}` }
  })
}

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

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

describe('risk-discount probe (acceptance, sprint22.md)', () => {
  it('hammer prices on a high-risk model sit measurably below an equal-value low-risk model, by ~modelRiskDiscount', () => {
    const state = stateWithLots([])
    const highAnchors = independentLots(HIGH_RISK_MODEL, 150, 10_000).map((l) =>
      anchorValueYen(l, state, CONTEXT),
    )
    const lowAnchors = independentLots(LOW_RISK_MODEL, 150, 20_000).map((l) =>
      anchorValueYen(l, state, CONTEXT),
    )
    const highMedian = median(highAnchors)
    const lowMedian = median(lowAnchors)
    expect(highMedian).toBeLessThan(lowMedian)

    const predictedDiscount = modelRiskDiscount(
      HIGH_RISK_MODEL,
      HIDDEN_ISSUES_BY_COMPONENT,
      ECONOMY,
    )
    expect(predictedDiscount).toBeGreaterThan(0)
    const measuredDiscount = 1 - highMedian / lowMedian
    // Same order of magnitude as the formula's own prediction — condition
    // noise (independent random rolls per lot) means this is never exact.
    expect(measuredDiscount).toBeGreaterThan(predictedDiscount * 0.5)
    expect(measuredDiscount).toBeLessThan(predictedDiscount * 1.5)
  })
})

describe('information-value probe (acceptance, sprint22.md)', () => {
  it('inspecting a high-risk model pays for itself: informed buying beats blind buying by more than the fee, in expectation', () => {
    // Real measurement (2026-07-11) forced a correction to this probe's own
    // design: walking away is a MINORITY outcome at this fixture's severity
    // range (~38% of lots), so the MEDIAN margin is dominated by the
    // majority "would have bought safely either way" case, where informed
    // buying is worse by exactly the inspection fee and nothing else — the
    // median is structurally blind to how catastrophic the AVOIDED lots
    // would have been. "Pays for itself" is an expected-value claim, so
    // MEAN margin (not median) is the correct statistic here; median stays
    // the right statistic for the restoration-uplift/full-flip probes
    // (Sprint 21) because those aren't gated on a minority-probability event.
    const WALK_AWAY_SEVERITY = ECONOMY.issues.lemonSeverityThreshold

    /** Runs one lot through acquire -> fix -> sell, informed (inspect first,
     * walk away from a real severe issue) or blind (never inspects, always
     * tries to acquire). Returns the realized margin as a fraction of book
     * value, or null if this lot was never pursued/won at all (excluded
     * from both policies' samples equally, so the comparison stays fair). */
    function runPolicy(initial: AuctionLot, informed: boolean): number | null {
      let lot = initial
      let state = stateWithLots([lot])
      let feePaidYen = 0

      if (informed) {
        const fee = ECONOMY.AUCTION_TRAVEL_FEE_YEN[lot.tier]
        feePaidYen = fee
        lot = inspectLot(lot)
        state = { ...state, cashYen: state.cashYen - fee, activeAuctionLots: [lot] }
        const hasSevereIssue = lot.car.hiddenIssues.some(
          (ri) => ri.severityPercent >= WALK_AWAY_SEVERITY,
        )
        if (hasSevereIssue) return -feePaidYen / HIGH_RISK_MODEL.bookValueYen
      }

      const anchor = anchorValueYen(lot, state, CONTEXT)
      if (anchor <= 0) return null
      const targetYen = anchor
      if (nextRaiseYen(lot, ECONOMY) > targetYen) return null

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
      if (wonPriceYen === null) return null

      const boughtCar = state.ownedCars.find((c) => c.id === initial.car.id)
      if (!boughtCar) return null

      // Both policies fix every real issue post-purchase (matching the
      // "fully restore" identity) — the only thing informed buying changes
      // is the pre-purchase walk-away decision above.
      const fixCostYen = boughtCar.hiddenIssues.reduce((sum, revealedIssue) => {
        const catalogEntry = CONTEXT.hiddenIssuesById[revealedIssue.issueId]
        return catalogEntry
          ? sum + issueRepairCostYen(catalogEntry, revealedIssue.severityPercent, ECONOMY)
          : sum
      }, 0)
      const fixedCar: CarInstance = {
        ...boughtCar,
        hiddenIssues: boughtCar.hiddenIssues.map((ri) => ({ ...ri, repaired: true })),
      }
      const restoredCar = fullyRestored(fixedCar)
      const salePriceYen = listPubliclyAskingPrice(
        restoredCar,
        HIGH_RISK_MODEL,
        CONTEXT.buyers,
        CONTEXT.partsById,
        100,
        CONTEXT.hiddenIssuesById,
        CONTEXT.economy,
      )
      const margin = salePriceYen - wonPriceYen - fixCostYen - feePaidYen
      return margin / HIGH_RISK_MODEL.bookValueYen
    }

    const lots = independentLots(HIGH_RISK_MODEL, 200, 30_000)
    const informedMargins: number[] = []
    const blindMargins: number[] = []
    for (const lot of lots) {
      const informed = runPolicy(lot, true)
      if (informed !== null) informedMargins.push(informed)
      const blind = runPolicy(lot, false)
      if (blind !== null) blindMargins.push(blind)
    }

    // Measured (2026-07-11, this exact deterministic population, n=200,
    // ~43% roll a real severe issue): blind buying nets a NEGATIVE mean
    // margin (-20.1% of book) once severe repair costs are real money, not
    // an afterthought — a car whose issue costs more to fix than the
    // restoration recovers. Informed buying, walking away from exactly
    // those lots, stays net positive (+3.2%). This is the actual claim:
    // inspection doesn't just make a good archetype slightly better, it's
    // the difference between a losing strategy and a winning one once real
    // risk is real money.
    expect(informedMargins.length).toBeGreaterThan(50)
    expect(blindMargins.length).toBeGreaterThan(50)

    const informedMean = mean(informedMargins)
    const blindMean = mean(blindMargins)
    const feeFraction = ECONOMY.AUCTION_TRAVEL_FEE_YEN.premium / HIGH_RISK_MODEL.bookValueYen

    // Inspecting must literally pay for itself: the informed edge has to
    // exceed what inspecting cost, not just be directionally better.
    expect(informedMean).toBeGreaterThan(blindMean + feeFraction)
  })
})
