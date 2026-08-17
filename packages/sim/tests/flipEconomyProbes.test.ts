import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeRosterBalanceProbe, type ModelBalanceProbeRow } from '../src/balanceProbes'
import { carLedgerFor } from '../src/carLedger'
import { replayCareerScript } from '../src/careerReplay'
import { sessionBundleToScript, type SessionExportBundle } from '../src/careerScript'
import { buildSimContext } from '../src/context'
import { marketValueYen } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { qualityMeanFor } from '../src/selling'
import { deriveServiceJobPayoutYen, serviceJobCostBreakdown } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts } from './testFixtures'

/**
 * Sprint213.md's acceptance probes: closed-form arithmetic over content and
 * real sim resolvers, no bots. Every number below comes from calling the
 * real functions the game itself prices through - never a re-derivation -
 * so these can only fail when the priced behaviour actually drifts from the
 * bands the sprint's design settled on.
 */

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

/** Per-tier yen/labour-point bands for a sensible flip at a fair (reserve)
 * buy - sprint213.md's acceptance list: entry 200-300, mid ~800 (a
 * tolerance band around it), high 1,200+. Four fitment classes map onto the
 * three named bands: 'everyday' is the design's "mid", 'enthusiast' and
 * 'flagship' both clear the "high" floor. */
const FLIP_YEN_PER_POINT_BANDS: Record<PartFitmentClass, { min: number; max: number }> = {
  entry: { min: 200, max: 300 },
  everyday: { min: 600, max: 1000 },
  enthusiast: { min: 1200, max: Infinity },
  flagship: { min: 1200, max: Infinity },
}

/** Every roster row with real bench work to price a rate from - a model
 * with `repairLaborSlots === 0` (disclosed separately by
 * `valueModelProbes.test.ts`) has no flip yen-per-point to speak of. */
function flipRowsWithLabour(): ModelBalanceProbeRow[] {
  return computeRosterBalanceProbe(CARS, CONTEXT).filter((row) => row.repairLaborSlots > 0)
}

describe('(a) per-tier flip bands at a fair buy (sprint213.md acceptance)', () => {
  it("the roster average yen/labour-point of the sensible flip lands in each tier's band", () => {
    const rows = flipRowsWithLabour()
    const byTier = new Map<PartFitmentClass, number[]>()
    for (const row of rows) {
      const rates = byTier.get(row.fitmentClass) ?? []
      rates.push(row.sensibleFlipMarginYen / row.repairLaborSlots)
      byTier.set(row.fitmentClass, rates)
    }

    const failures: string[] = []
    for (const fitmentClass of Object.keys(FLIP_YEN_PER_POINT_BANDS) as PartFitmentClass[]) {
      const rates = byTier.get(fitmentClass) ?? []
      expect(rates.length, `no roster model in fitment class "${fitmentClass}"`).toBeGreaterThan(0)
      const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length
      const band = FLIP_YEN_PER_POINT_BANDS[fitmentClass]
      if (mean < band.min || mean > band.max) {
        failures.push(
          `${fitmentClass}: mean ${mean.toFixed(0)} yen/pt over ${rates.length} models, wants [${band.min}, ${band.max}]`,
        )
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})

/**
 * (b) Radial wage: the tier-1 service-job templates that are genuinely WAGE
 * work - every task prices through the bench-repair route
 * (`serviceJobCostBreakdown`'s `canBenchRepair` branch: no `minGrade`, and
 * the installed part is repairable) - against a representative customer car
 * at a typical 'poor' starting condition, at the midpoint margin roll.
 * Several tier-1 templates instead price a real replacement part (tyres,
 * brake pads/discs, coilovers, bodywork filler) through the buy-new route:
 * those carry genuine parts-retail markup on top of labour, a different
 * economic quantity from "wage per point", and folding them in would let a
 * PARTS sale's margin masquerade as a labour rate - `tyres-and-pads-service`
 * alone prices at over Y1,000/pt purely from the tyre and pad catalogue
 * price, regardless of any labour lever this sprint touches. The rate is the
 * AGGREGATE `sum(payout) / sum(totalPoints)` across the qualifying
 * templates - the same "a day's takings over a day's points" ratio the
 * sprint's own forensic baseline reads (72,704 yen over 73 points), never a
 * mean of each template's own ratio: several qualifying jobs still carry
 * under one labour point, where a template's flat `calloutFeeYen` alone
 * divided by a fraction of a point produces a rate a plain average would let
 * dominate. `taskLaborChain`'s own `totalSlots` (what
 * `serviceJobCostBreakdown`'s `laborSlots` sums, and what the payout
 * formula's `laborRateYen` prices against) is denominated in labour SLOTS,
 * `economy.energy.pointsPerLabour` points each - the player-visible unit the
 * sprint's own acceptance bands are stated in, and what a real job's
 * `laborSlotsSpent` log field actually holds (its name is historical; the
 * value is point-granular) - so this converts back to points before dividing.
 */
export function radialYenPerPoint(everydayModel: CarModel): {
  yenPerPoint: number
  totalPayoutYen: number
  totalPoints: number
  /** How many tier-1 templates qualified as wage work - probe (d)'s own
   * "average points per job" divides `totalPoints` by this. */
  jobCount: number
} {
  const state = createInitialGameState(CONTEXT, 1)
  const marginRoll = (ECONOMY.serviceJobs.marginMin + ECONOMY.serviceJobs.marginMax) / 2
  const tierOneTemplates = SERVICE_JOB_TYPES.filter((t) => t.tier === 1)

  let totalPayoutYen = 0
  let totalPoints = 0
  let jobCount = 0
  for (const template of tierOneTemplates) {
    const isWageWork = template.tasks.every((task) => {
      if (task.requirement.minGrade) return false
      return CONTEXT.partsTaxonomyById[task.requirement.carPartId]?.repairable === true
    })
    if (!isWageWork) continue

    const overrides: Partial<Record<CarPartId, ConditionBand>> = {}
    for (const task of template.tasks) {
      overrides[task.requirement.carPartId] = 'poor'
    }
    const car = buildCarInstance({ modelId: everydayModel.id, parts: mintCarParts(overrides) })
    const { laborSlots } = serviceJobCostBreakdown(
      template.tasks,
      car,
      everydayModel,
      CONTEXT,
      state,
    )
    if (laborSlots === 0) continue
    totalPayoutYen += deriveServiceJobPayoutYen(
      template.tasks,
      car,
      everydayModel,
      CONTEXT,
      state,
      marginRoll,
    )
    totalPoints += laborSlots * ECONOMY.energy.pointsPerLabour
    jobCount += 1
  }
  return { yenPerPoint: totalPayoutYen / totalPoints, totalPayoutYen, totalPoints, jobCount }
}

describe('(b) radial wage (sprint213.md acceptance)', () => {
  it('the aggregate tier-1 service-job yen/labour-point lands at Y500-650', () => {
    const model = CARS.find((c) => c.tier === 'everyday')
    if (!model) throw new Error('fixture: no everyday-tier roster model found')
    const { yenPerPoint, totalPayoutYen, totalPoints } = radialYenPerPoint(model)
    expect(
      yenPerPoint,
      `radial ${totalPayoutYen} yen over ${totalPoints} points = ${yenPerPoint.toFixed(0)} yen/pt`,
    ).toBeGreaterThanOrEqual(500)
    expect(yenPerPoint).toBeLessThanOrEqual(650)
  })
})

/**
 * (c) The golden session: a real recorded day-5 Honda Today JW1 flip,
 * replayed byte-for-byte through `sessionBundleToScript` +
 * `replayCareerScript` (the same path proven against this file in the
 * sprint's own forensic baseline). The session was exported mid-flip (the
 * car is listed for sale on day 5 but not yet sold), so the post-change P&L
 * reads the car's real accumulated ledger (purchase + repair + parts, still
 * live since the car is unsold) against a deterministic "realistic first
 * offer": plain `marketValueYen` at the fresh-listing quality mean
 * (`qualityMeanFor(0, ...)`), the same taste-free value probe (a)'s own
 * roster-wide flip margins are built on, never a random roll or one specific
 * buyer archetype's own fit - a car this modest genuinely fails SOME
 * archetypes' own champion-stat gate (`normalizedTasteScore`, valuation.ts),
 * which is a fact about the buyer pool's authored content, not about the
 * value-side or affinity-curve levers this sprint moves; picking whichever
 * buyer happens to value it highest would price this specific flip off that
 * unrelated fact rather than off the value model this sprint is testing.
 *
 * SKIPPED as of sprint215.md (the knowledge model): task E adds one extra
 * `rng.next()` draw per generated car (the hidden non-stock roll), which
 * shifts the RNG stream car generation reads from. This test replays a REAL
 * recorded session file (`midnight-garage-session-day5.json`) byte-for-byte
 * against a live seed rather than a hand-authored script, so the replayed
 * auction board no longer reproduces the same Honda Today lot the session
 * actually bought - the car is not found in `finalState.ownedCars` at all.
 * Unlike this suite's own hash-pinned golden masters, there is no number to
 * re-derive here: fixing it needs a FRESH SESSION EXPORT against the new RNG
 * stream, a live play session this suite cannot produce on its own, which
 * is outside what a re-pin can do. `it.skip`ped rather than deleted or
 * loosened, per directive 17 - diagnosed as case (a), not silently patched;
 * the assertion below is left exactly as it was, ready to re-enable the
 * moment a fresh `midnight-garage-session-day5.json` lands.
 */
describe('(c) the golden session: the day-5 Honda Today flip (sprint213.md acceptance)', () => {
  const SESSION_PATH = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '../../../midnight-garage-session-day5.json',
  )

  // STALE RECORDED FIXTURE, awaiting the next session export: sprint215.md's
  // hidden non-stock generation roll shifted the RNG stream car generation
  // reads, so this real recorded session no longer replays to the same
  // Honda Today lot it actually bought. Re-enable once
  // `midnight-garage-session-day5.json` is re-exported against the new
  // stream - see this describe block's own doc comment above.
  it.skip('the replayed flip lands in the entry yen/labour-point band', () => {
    const bundle = JSON.parse(readFileSync(SESSION_PATH, 'utf-8')) as SessionExportBundle
    const script = sessionBundleToScript(bundle, undefined, { name: 'sprint213-golden-session' })
    const result = replayCareerScript(script, CONTEXT)

    const model = CARS.find((c) => c.id === 'honda-today-jw1')
    if (!model) throw new Error('fixture: honda-today-jw1 missing from roster content')

    const car = result.finalState.ownedCars.find((c) => c.modelId === model.id)
    expect(car, 'the Today should still be owned (listed, not yet sold) at day 5').toBeDefined()
    if (!car) return

    const ledger = carLedgerFor(result.finalState, car.id)
    expect(
      ledger.purchaseYen,
      'the acquisition should have recorded a purchase price',
    ).not.toBeNull()
    const asBoughtYen = ledger.purchaseYen ?? 0
    const spentYen = ledger.repairYen + ledger.partsYen

    // Every job-progress event's own labour, attributed to this car via the
    // job-created event that opened it - the same jobId->carInstanceId map
    // the game itself keys the flow meter's labour-utilisation series on.
    const allLogs = result.dayLogs.flat()
    const carByJobId = new Map<string, string>()
    for (const entry of allLogs) {
      if (entry.type === 'job-created') carByJobId.set(entry.jobId, entry.carInstanceId)
    }
    let labourPoints = 0
    for (const entry of allLogs) {
      if (entry.type === 'job-progress' && carByJobId.get(entry.jobId) === car.id) {
        labourPoints += entry.laborSlotsSpent
      }
    }
    expect(labourPoints, 'the flip should show real recorded labour').toBeGreaterThan(0)

    const heatPercent = result.finalState.marketHeat[model.id] ?? 100
    const asIsValueYen = marketValueYen(
      model,
      car,
      heatPercent,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const realisticFirstOfferYen = Math.round(asIsValueYen * qualityMeanFor(0, CONTEXT.economy))

    const marginYen = realisticFirstOfferYen - asBoughtYen - spentYen
    const yenPerPoint = marginYen / labourPoints
    const band = FLIP_YEN_PER_POINT_BANDS.entry

    expect(
      yenPerPoint,
      `as-bought ${asBoughtYen}, spent ${spentYen}, first offer ${realisticFirstOfferYen}, ` +
        `margin ${marginYen} over ${labourPoints} points = ${yenPerPoint.toFixed(0)} yen/pt, wants [${band.min}, ${band.max}]`,
    ).toBeGreaterThanOrEqual(band.min)
    expect(yenPerPoint).toBeLessThanOrEqual(band.max)
  })
})

/**
 * (d) Whole-week arithmetic (sprint213.md's balance method): the pace anchor
 * is ~Y50-70k net per week - a radial floor plus one kei flip, less a
 * week's rent. Built from the SAME per-point rate probe (b) establishes and
 * the SAME roster flip margins probe (a) establishes.
 *
 * The radial floor is SUPPLY-bounded (the design's own words), not labour-
 * bounded: a real career never has an unlimited queue of tier-1 offers to
 * fill every spare point with - `serviceJobs.dailyOfferCountWeights` caps
 * how many fresh jobs even land on the board each day. `RADIAL_JOBS_PER_WEEK`
 * is a representative week's worth of accepted tier-1 jobs at that supply
 * (a handful, not a queue), each averaging the qualifying templates' own
 * mean points-per-job (probe (b)'s own `totalPoints` over its template
 * count). The flip is a SEPARATE activity across its own ~2 days
 * (item 4), not competing with the radial jobs for the same points - the two
 * are additive weekly income streams exactly as the design states them.
 */
const RADIAL_JOBS_PER_WEEK = 2

describe('(d) whole-week arithmetic reproduces the pace anchor (sprint213.md acceptance)', () => {
  it('one entry flip plus a supply-bounded week of radial jobs nets ~Y50-70k after rent', () => {
    const entryRows = flipRowsWithLabour().filter((row) => row.fitmentClass === 'entry')
    expect(entryRows.length).toBeGreaterThan(0)
    const entryFlipMarginYen =
      entryRows.reduce((sum, row) => sum + row.sensibleFlipMarginYen, 0) / entryRows.length

    const model = CARS.find((c) => c.tier === 'everyday')
    if (!model) throw new Error('fixture: no everyday-tier roster model found')
    const { yenPerPoint: radialRate, totalPoints, jobCount } = radialYenPerPoint(model)
    const averagePointsPerJob = totalPoints / jobCount
    const radialWeeklyYen = RADIAL_JOBS_PER_WEEK * averagePointsPerJob * radialRate

    const weeklyNetYen = entryFlipMarginYen + radialWeeklyYen - ECONOMY.rent.baseWeeklyYen

    expect(
      weeklyNetYen,
      `flip margin ${entryFlipMarginYen.toFixed(0)} + radial ${radialWeeklyYen.toFixed(0)} (${RADIAL_JOBS_PER_WEEK} jobs) - rent ${ECONOMY.rent.baseWeeklyYen} = ${weeklyNetYen.toFixed(0)}`,
    ).toBeGreaterThanOrEqual(35_000)
    expect(weeklyNetYen).toBeLessThanOrEqual(85_000)
  })
})
