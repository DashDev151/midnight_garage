import type {
  CarInstance,
  CarLedger,
  CarModel,
  GameState,
  StatBlock,
} from '@midnight-garage/content'
import {
  bookCostYen,
  carLedgerFor,
  foundationWithheldYen,
  realisedProfitYen,
  valueLedgerFor,
  type SimContext,
  type ValueLedgerLine,
  type ValueLedgerLineId,
} from '@midnight-garage/sim'
import {
  benchCarInstance,
  benchGameState,
  type BenchCarSpec,
  type BenchShopSpec,
} from './economyBench'
import {
  lapMeasurementsBetween,
  statDeltasBetween,
  type BenchLapMeasurement,
} from './economyBenchActions'
import { heatPercentFor } from './economyBenchReadout'
import { evaluateCarInstance } from './sandboxModel'

/**
 * THE ECONOMY BENCH'S PREVIEW.
 *
 * What the builder's pending settings would be worth, priced through the same
 * functions the car on the bench is priced through. It builds a THROWAWAY
 * `CarInstance` and `GameState` out of `benchCarInstance`/`benchGameState`, the
 * one pair the Rebuild button itself uses, so a previewed figure is the figure a
 * rebuild produces and not a forecast of it. Nothing here touches the session:
 * the car on the bench, the till and the running log are all untouched by a
 * preview.
 *
 * As everywhere else on the bench, no yen is derived here. The value is
 * `valueLedgerFor`'s own total, the reasons are its own lines, and a difference
 * between two of them is a subtraction of two sim answers.
 */

/** What one world (the bench's, or a pending one) is worth, and the ledger
 * behind it. */
export interface BenchValueSummary {
  /** `valueLedgerFor`'s total, which is `marketValueYen` to the yen. */
  valueYen: number
  lines: readonly ValueLedgerLine[]
  /** What a failing foundation is holding back - exact by construction, and
   * the usual reason the 'aftermarket' line moves. */
  foundationWithheldYen: number
  /** The books on this car: purchase, repairs, parts fitted, listing fees. */
  ledger: CarLedger
  /**
   * `bookCostYen`: everything those books say the car has cost. Null when no
   * purchase price is recorded, which is the same condition that leaves the
   * profit unmeasured, since it is the basis the profit is taken against.
   */
  bookCostYen: number | null
  /**
   * `realisedProfitYen` at this car's own market value: the sim's own realised
   * profit, asked the hypothetical question "if it sold for exactly what the
   * market says it is worth". Null when no purchase price is recorded, which is
   * what the sim does rather than measure a profit against nothing.
   */
  profitAtValueYen: number | null
}

export function benchValueSummaryFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): BenchValueSummary {
  const { partsById, partsTaxonomyById, economy } = context
  const ledger = valueLedgerFor(
    car,
    model,
    heatPercentFor(state, model),
    partsById,
    partsTaxonomyById,
    economy,
  )
  const carLedger = carLedgerFor(state, car.id)
  return {
    valueYen: ledger.totalYen,
    lines: ledger.lines,
    foundationWithheldYen: foundationWithheldYen(model, car, partsById, economy),
    ledger: carLedger,
    bookCostYen: bookCostYen(carLedger),
    profitAtValueYen: realisedProfitYen(ledger.totalYen, carLedger),
  }
}

/** The car the builder currently describes, and what it would be worth. */
export interface BenchPreview {
  car: CarInstance
  summary: BenchValueSummary
}

/**
 * The spec the builder currently holds, built and priced without disturbing
 * anything: a throwaway car in a throwaway world, discarded the moment the
 * figures are read off it. The car itself comes back out so the build's own
 * stats and lap times can be measured against the one on the bench without
 * building it a second time.
 */
export function benchPreviewFor(
  carSpec: BenchCarSpec,
  shopSpec: BenchShopSpec,
  model: CarModel,
  context: SimContext,
): BenchPreview {
  const car = benchCarInstance(carSpec, model, context)
  return {
    car,
    summary: benchValueSummaryFor(car, model, benchGameState(shopSpec, car, context), context),
  }
}

/** One ledger line, either side of the pending change. */
export interface BenchLedgerDiffRow {
  id: ValueLedgerLineId
  beforeYen: number
  afterYen: number
  deltaYen: number
}

/**
 * Which ledger lines the pending spec moves, and by how much.
 *
 * A line absent from a ledger is a genuine zero rather than a gap: 'heat' is
 * omitted at neutral heat, 'floor' while the scrap backstop does not bind,
 * 'coherence' on a build whose support does not discount it and 'aftermarket'
 * on a car carrying no credited premium. Each of those is an adjustment of
 * nothing, so reading an absent line as zero states the ledger's own meaning
 * rather than filling a hole.
 *
 * Lines that move are listed first, in the ledger's own order, so the reason
 * for a change is at the top of the panel rather than somewhere down a table of
 * unchanged rows.
 */
export function ledgerDiffRows(
  before: BenchValueSummary,
  after: BenchValueSummary,
): BenchLedgerDiffRow[] {
  const yenById = (summary: BenchValueSummary): Map<ValueLedgerLineId, number> =>
    new Map(summary.lines.map((line) => [line.id, line.yen]))
  const beforeById = yenById(before)
  const afterById = yenById(after)
  const ids: ValueLedgerLineId[] = []
  for (const line of [...before.lines, ...after.lines]) {
    if (!ids.includes(line.id)) ids.push(line.id)
  }
  const rows = ids.map((id) => {
    const beforeYen = beforeById.get(id) ?? 0
    const afterYen = afterById.get(id) ?? 0
    return { id, beforeYen, afterYen, deltaYen: afterYen - beforeYen }
  })
  return [...rows.filter((row) => row.deltaYen !== 0), ...rows.filter((row) => row.deltaYen === 0)]
}

/** The five stats and each course's lap, either side of the pending change -
 * the same two shapes a running-log line carries, measured the same way, so one
 * pair of readers renders both. */
export interface BenchBuildDelta {
  statDeltas: StatBlock
  laps: Record<string, BenchLapMeasurement>
}

/**
 * What the pending spec does to the car ITSELF, measured exactly as the running
 * log measures an action: the evaluator's own figures after minus before. Both
 * sides go through `evaluateCarInstance`, the evaluator the performance sandbox
 * shares, so the bench cannot disagree with it about a car they both hold.
 */
export function buildDeltaFor(
  before: CarInstance,
  after: CarInstance,
  model: CarModel,
  context: SimContext,
): BenchBuildDelta {
  const was = evaluateCarInstance(model, before, context)
  const now = evaluateCarInstance(model, after, context)
  return {
    statDeltas: statDeltasBetween(was.stats, now.stats),
    laps: lapMeasurementsBetween(was.laps, now.laps),
  }
}
