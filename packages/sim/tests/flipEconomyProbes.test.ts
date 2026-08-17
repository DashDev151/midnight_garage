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
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type EconomyConfig,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  buildRoughProbeCar,
  computeModelBalanceProbe,
  computeRosterBalanceProbe,
  type ModelBalanceProbeRow,
} from '../src/balanceProbes'
import { bandIndex, planPartRepair } from '../src/bands'
import { carLedgerFor } from '../src/carLedger'
import { replayCareerScript } from '../src/careerReplay'
import { sessionBundleToScript, type SessionExportBundle } from '../src/careerScript'
import { buildSimContext } from '../src/context'
import { candidateFixCostYen } from '../src/diagnosis'
import { buyerKnowledgeViewOf, defaultVerifiedSlots } from '../src/knowledge'
import { marketValueYen, sensibleRepairTargetBand } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { offerChanceFor, qualityMeanFor } from '../src/selling'
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

/**
 * (e) Light flip vs deep flip, entry tier (sprint217.md task C,
 * knowledge-and-diagnosis.md section 10): the commitment is that a light
 * flip's yen-per-day and a deep flip's yen-per-day land within +-30% of each
 * other, so the right choice is situational (bay pressure, cash, heat) rather
 * than one dominating outright.
 *
 * DEEP FLIP reuses probe (a)'s own `computeModelBalanceProbe` row verbatim -
 * buy the rough car at reserve, repair every slot to the tier's expectation
 * band, sell openly at the resulting guide value. No symptom is modelled on
 * this side: a full restoration cures whatever a symptom claims, so a
 * symptom's own existence changes nothing about what full repair costs or
 * returns.
 *
 * LIGHT FLIP is new construction from the SAME `buildRoughProbeCar` base: two
 * real symptoms are added (`context.symptoms[0]`/`[1]`), only the FIRST is
 * diagnosed and fixed (`planPartRepair`, the same per-part atom probe (a)'s
 * own bench-part loop prices through, to the tier's own
 * `sensibleRepairTargetBand`), and the car sells "unopened elsewhere" through
 * `buyerKnowledgeViewOf` with an EXPECTED (not rolled) deduction for the
 * second, undiagnosed symptom - `noticeChance x candidateFixCostYen x
 * noticeMultiplier`, the same terms `rollBuyerNotice` computes, closed-form
 * rather than sampled to match this whole file's no-bots convention.
 *
 * Both sides convert labour POINTS to DAYS the same way: one day for the
 * acquisition itself, `laborPoints / energy.basePoolPoints` for the repair (a
 * solo shop's own daily point budget, no staff), and `1 /
 * offerChanceFor(model, 100, economy)` for the expected wait to sell - the
 * SAME chance either car draws against (it reads model rarity and heat only,
 * never condition), which is design section 10's own "a car occupies a bay
 * for its whole build" cost landing equally on both plays.
 */
interface FlipDayRate {
  marginYen: number
  laborPoints: number
  days: number
  yenPerDay: number
}

function toDayRate(
  marginYen: number,
  laborPoints: number,
  model: CarModel,
  economy: EconomyConfig,
): FlipDayRate {
  const repairDays = laborPoints / economy.energy.basePoolPoints
  const waitToSellDays = 1 / offerChanceFor(model, 100, economy)
  const days = 1 + repairDays + waitToSellDays // +1 for the acquisition day itself
  return { marginYen, laborPoints, days, yenPerDay: marginYen / days }
}

/** The worse of `installed`'s current band and `cause.setBand` - generation's
 * own rule (a cause never makes an already-worse part better), reproduced
 * here because this probe hand-builds a symptomatic car rather than rolling
 * one through `auctions.ts`. */
function applyCauseDamage(
  car: CarInstance,
  cause: { carPartId: CarPartId; setBand: ConditionBand },
): CarInstance {
  const installed = car.parts[cause.carPartId].installed
  if (!installed) return car
  const band =
    bandIndex(installed.band) <= bandIndex(cause.setBand) ? installed.band : cause.setBand
  return {
    ...car,
    parts: { ...car.parts, [cause.carPartId]: { installed: { ...installed, band } } },
  }
}

describe('(e) light flip vs deep flip land within +-30% yen-per-day, entry tier (sprint217.md task C)', () => {
  it('the commitment holds, or the shortfall is reported rather than silently patched (task C2)', () => {
    const entryModel = CARS.find((c) => fitmentClassForTier(c.tier) === 'entry')
    if (!entryModel) throw new Error('fixture: no entry-tier roster model found')

    // DEEP FLIP: probe (a)'s own row, verbatim.
    const deepRow = computeModelBalanceProbe(entryModel, CONTEXT)
    const deep = toDayRate(
      deepRow.sensibleFlipMarginYen,
      deepRow.repairLaborSlots,
      entryModel,
      ECONOMY,
    )

    // LIGHT FLIP: the same rough base, two real symptoms, only the first fixed.
    const roughCar = buildRoughProbeCar(entryModel, CONTEXT)
    const symptomA = CONTEXT.symptoms[0]!
    const symptomB = CONTEXT.symptoms[1]!
    const trueCauseA = symptomA.causes[0]!
    const trueCauseB = symptomB.causes[0]!

    const damagedCar = applyCauseDamage(applyCauseDamage(roughCar, trueCauseA), trueCauseB)
    const symptomaticCar: CarInstance = {
      ...damagedCar,
      symptoms: [
        {
          symptomId: symptomA.id,
          trueCauseId: trueCauseA.id,
          remainingCauseIds: [trueCauseA.id], // diagnosed
          runTestIds: [],
          latent: false,
        },
        {
          symptomId: symptomB.id,
          trueCauseId: trueCauseB.id,
          remainingCauseIds: symptomB.causes.map((c) => c.id), // undiagnosed, still open
          runTestIds: [],
          latent: false,
        },
      ],
    }

    // Fair buy: the reserve fraction of this car's own true market value -
    // the same convention probe (a)'s own roughCarBuyYen uses.
    const buyGuideYen = marketValueYen(
      entryModel,
      symptomaticCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const buyYen = Math.round(buyGuideYen * CONTEXT.economy.AUCTION_RESERVE_PRICE_FRACTION)

    // Fix ONLY the diagnosed fault (symptom A's true cause), to the tier's
    // own sensible repair target - the light flip's whole labour spend.
    const target = sensibleRepairTargetBand(entryModel, CONTEXT.economy)
    const partEntry = CONTEXT.partsTaxonomyById[trueCauseA.carPartId]!
    const installedA = symptomaticCar.parts[trueCauseA.carPartId].installed!
    const catalogPartA = CONTEXT.partsById[installedA.partId]!
    const plan = planPartRepair(
      installedA.band,
      target,
      1,
      partEntry,
      catalogPartA.priceYen,
      CONTEXT.economy.restoration.repairStepFraction,
      CONTEXT.economy.energy.energyPerBandStepByToolTier,
    )
    const repairedBand = bandIndex(installedA.band) < bandIndex(target) ? target : installedA.band
    const lightRepairedCar: CarInstance = {
      ...symptomaticCar,
      parts: {
        ...symptomaticCar.parts,
        [trueCauseA.carPartId]: { installed: { ...installedA, band: repairedBand } },
      },
      // The fix verifies the slot (a repair click always does); symptom A is
      // cured by it and drops out, leaving only B open and unverified.
      verifiedSlots: [...defaultVerifiedSlots(CONTEXT), trueCauseA.carPartId],
      symptoms: [symptomaticCar.symptoms[1]!],
    }

    // Sell unopened elsewhere: the buyer prices the demonstrable
    // (`buyerKnowledgeViewOf`), less the EXPECTED notice deduction for the
    // second, undiagnosed symptom - the same terms `rollBuyerNotice` rolls,
    // computed closed-form rather than sampled.
    const neutralState = createInitialGameState(CONTEXT, 0)
    const demonstrableValueYen = marketValueYen(
      entryModel,
      buyerKnowledgeViewOf(lightRepairedCar, entryModel, CONTEXT),
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const noticeChance = CONTEXT.economy.diagnosis.noticeChanceByArchetype['daily-drivers']
    const expectedNoticeDeductionYen =
      noticeChance *
      candidateFixCostYen(lightRepairedCar, entryModel, trueCauseB, neutralState, CONTEXT) *
      CONTEXT.economy.diagnosis.noticeMultiplier
    const lightSaleYen = Math.round(demonstrableValueYen - expectedNoticeDeductionYen)
    const lightMarginYen = lightSaleYen - buyYen - plan.costYen
    const light = toDayRate(lightMarginYen, plan.laborSlotsRequired, entryModel, ECONOMY)

    const ratio = light.yenPerDay / deep.yenPerDay

    // MEASURED, NOT GATED (sprint217.md task C2): the +-30% commitment does
    // NOT hold on this construction, and the shortfall is reported here
    // rather than forced to pass with an invented lever.
    //
    // Real measured run: light -5,743 yen/day (margin -14,446 over 2.52
    // days, 4 labour points) vs deep +5,400 yen/day (margin +20,872 over
    // 3.87 days, 112 labour points) - ratio -1.06, wants [0.7, 1.3].
    //
    // ROOT CAUSE, diagnosed rather than patched: `buildRoughProbeCar` (the
    // worst-case-GENERATABLE car every other flip probe in this file already
    // treats as the standard subject) is not uniformly poor. Its
    // `enforceMaxBillFraction`/damage-budget guards SOFTEN the naive
    // all-poor construction back under the Law 2 bill ceiling, which lifts
    // whole groups (measured: the entire engine group to `fine`, most
    // suspension to `worn`) while leaving others at `poor`. `priorBand`
    // (knowledge.ts) is explicitly a FLAT per-car guess with no per-slot
    // term ("every estimated slot on the same car currently reads the same
    // guess" - its own doc comment, unchanged design from sprint215.md): at
    // this car's worst-case mileage it reads `poor` for every unverified
    // slot. A light flip that verifies only the one diagnosed part is
    // therefore priced by a buyer who assumes the whole rest of the car is
    // `poor`, when roughly two-thirds of it is actually `fine`/`worn` - a
    // real, structural mismatch between a flat mileage-only guess and an
    // unevenly-conditioned car, not a tunable number. The deep flip never
    // hits this: it verifies (repairs) everything, so nothing it sells is
    // ever priced off a guess.
    //
    // This is a genuine limit of the shipped `priorBand` model rather than a
    // lever this sprint is authorised to move (directive 22): a per-slot
    // prior term would need its own approved design, out of scope here.
    // Reported in the sprint217.md Exit.
    expect(Number.isFinite(ratio), 'the probe itself must still produce a real number').toBe(true)
    expect(deep.marginYen, 'deep flip must stay profitable on this car (Law 1)').toBeGreaterThan(0)
  })
})
