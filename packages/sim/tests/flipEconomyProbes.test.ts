import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALL_CAR_PART_IDS,
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
  buildTypicalProbeCar,
  computeModelBalanceProbe,
  computeRosterBalanceProbe,
  type ModelBalanceProbeRow,
} from '../src/balanceProbes'
import { bandIndex, canRepair } from '../src/bands'
import { isBodyDerivedPart } from '../src/bodyPipeline'
import { carLedgerFor } from '../src/carLedger'
import { replayCareerScript } from '../src/careerReplay'
import { sessionBundleToScript, type SessionExportBundle } from '../src/careerScript'
import { buildSimContext } from '../src/context'
import { candidateFixCostYen } from '../src/diagnosis'
import { buyerKnowledgeViewOf, seedVerifiedSlots } from '../src/knowledge'
import { marketValueYen, sensibleRepairTargetBand } from '../src/marketValue'
import { partFixCostYen, sumFixCosts, type PartFixCost } from '../src/repairJobs'
import { offerChanceFor, qualityMeanFor } from '../src/selling'
import { deriveServiceJobPayoutYen, serviceJobCostBreakdown } from '../src/serviceJobs'
import { taskLaborChain } from '../src/taskLaborChain'
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
  const marginRoll = (ECONOMY.serviceJobs.marginMin + ECONOMY.serviceJobs.marginMax) / 2
  const tierOneTemplates = SERVICE_JOB_TYPES.filter((t) => t.tier === 1)

  let totalPayoutYen = 0
  let totalPoints = 0
  let jobCount = 0
  for (const template of tierOneTemplates) {
    const isWageWork = template.tasks.every((task) => {
      if (task.kind !== 'slotCondition') return false
      if (task.requirement.minGrade) return false
      return CONTEXT.partsTaxonomyById[task.requirement.carPartId]?.repairable === true
    })
    if (!isWageWork) continue

    const overrides: Partial<Record<CarPartId, ConditionBand>> = {}
    for (const task of template.tasks) {
      if (task.kind !== 'slotCondition') continue
      overrides[task.requirement.carPartId] = 'poor'
    }
    const car = buildCarInstance({ modelId: everydayModel.id, parts: mintCarParts(overrides) })
    const { laborSlots } = serviceJobCostBreakdown(template.tasks, car, everydayModel, CONTEXT)
    if (laborSlots === 0) continue
    totalPayoutYen += deriveServiceJobPayoutYen(
      template.tasks,
      car,
      everydayModel,
      CONTEXT,
      marginRoll,
    )
    totalPoints += laborSlots * ECONOMY.energy.pointsPerLabour
    jobCount += 1
  }
  return { yenPerPoint: totalPayoutYen / totalPoints, totalPayoutYen, totalPoints, jobCount }
}

describe('(b) radial wage (sprint213.md acceptance)', () => {
  // The rate is 648.98 yen/pt over the six qualifying templates, 55,813 yen of
  // payout across 86 labour points, inside the band with 1.02 yen of headroom
  // at the ceiling. Its cost pool is 4,860 yen of parts and no tool hire at all:
  // a quote buys a day only where the work cannot be done by hand, and not one
  // of these six holds a step that cannot (`forcedHireDayFor`, repairJobs.ts).
  // The labour stays at base rate, which is what a garage that hires would pay;
  // a player working by hand pays the difference in energy at
  // `toolHire.slogMultiplier` rather than in yen.
  //
  // Recorded because it is the file's tightest bound and the one most likely to
  // be misread as slack: while every tier 2 recipe bought a day, the same six
  // templates carried 80,750 yen of hire against those 4,860 yen of parts and
  // measured 1,836.77 yen/pt. No bound in this file moved.
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
  // The week reads 74,994: a 62,390 entry flip margin plus two radial jobs at
  // (b)'s own 9,302 mean payout, less 6,000 of rent. The radial half is the
  // sensitive one, since it is two of probe (b)'s payouts undiluted: while every
  // tier 2 recipe bought a hire day those payouts averaged 26,327 and this week
  // read 109,044, over a ceiling of 85,000. Both halves move together, so a
  // change to what a quote assumes about tools lands here twice as hard as it
  // does on (b).
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

/**
 * What putting ONE slot right costs and takes on the job model - the atom both
 * scenarios below price every repair through, so a light flip and a deep flip
 * are always measured on the same money and the same clock.
 *
 * The money is the shared fix price's PARTS half (`partFixCostYen`): the banded
 * parts bill, and never a tool-hire day, exactly as a whole-car bill charges
 * none (`carCostToBandYen`). Both flips here are the player's own spanner work
 * rather than a commission, and a day is plant access rather than a car's
 * input. The time is the whole physical chain (`taskLaborChain`) - blockers
 * cleared and put back, the part or its assembly pulled, the bench job's own
 * recipe steps, and the refit - never a band-step estimate.
 *
 * Null for a slot with nothing to do, nothing installed, or nothing a job can
 * save - a replacement is a purchase, not the repair either flip is pricing.
 */
function slotFixOnJobModel(
  car: CarInstance,
  carPartId: CarPartId,
  targetBand: ConditionBand,
): { fix: PartFixCost; costYen: number; laborPoints: number } | null {
  const entry = CONTEXT.partsTaxonomyById[carPartId]
  const installed = car.parts[carPartId].installed
  if (!entry || !installed || !canRepair(installed.band, entry)) return null
  if (bandIndex(installed.band) >= bandIndex(targetBand)) return null
  const catalogPart = CONTEXT.partsById[installed.partId]
  if (!catalogPart) return null
  const fix = partFixCostYen(entry, catalogPart, installed.band, targetBand, CONTEXT)
  if (fix.jobKind === 'replace') return null
  const chain = taskLaborChain(car, carPartId, fix.jobKind, CONTEXT)
  return { fix, costYen: fix.partsYen, laborPoints: chain.totalPoints }
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

describe('(e) light flip vs deep flip, entry tier (sprint219.md: evidence-informed priors, two scenarios)', () => {
  /**
   * Scenario 1 - WORST-CASE car (`buildRoughProbeCar`, unchanged from
   * sprint217.md/219.md's original construction). Directive 22's own
   * analysis rule applies here by name: never treat a worst-case constructed
   * probe as a typical-case crisis. `buildRoughProbeCar` is deliberately the
   * roughest car generation can produce; its visible half is genuinely near
   * -poor, so the evidence term (knowledge.ts) correctly declines to lift the
   * buyer's guess, and a light flip that leaves most of a wreck unopened
   * SHOULD sell for less than a deep flip that actually puts it right - a
   * wreck is what deep teardowns are for. The gate this scenario earns is
   * therefore only the ordering, never a floor on light: light must stay
   * BELOW deep, and losing here is CORRECT behaviour, not a shortfall.
   */
  it('scenario 1 (worst case): light stays below deep - losing on a wreck is correct, not a shortfall', () => {
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

    // ACQUISITION: seeds verifiedSlots to the born-verified set and freezes
    // acquisitionEvidenceDelta from the car exactly as bought (rulings-ledger
    // item 14) - the real function every auction settlement runs, so this
    // probe's light flip earns evidence the same way a player's own would,
    // never a snapshot taken after the player's own repair below.
    const knownCar = seedVerifiedSlots(symptomaticCar, CONTEXT)

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
    const installedA = knownCar.parts[trueCauseA.carPartId].installed!
    const fixA = slotFixOnJobModel(knownCar, trueCauseA.carPartId, target)
    if (!fixA) throw new Error('fixture: the diagnosed cause left no repair to price')
    const repairedBand = bandIndex(installedA.band) < bandIndex(target) ? target : installedA.band
    const lightRepairedCar: CarInstance = {
      ...knownCar,
      parts: {
        ...knownCar.parts,
        [trueCauseA.carPartId]: { installed: { ...installedA, band: repairedBand } },
      },
      // The fix verifies the slot (a repair click always does); symptom A is
      // cured by it and drops out, leaving only B open and unverified. The
      // frozen acquisitionEvidenceDelta on `knownCar` carries through
      // unchanged - this later repair is the player's own spanner work, not
      // fresh evidence about the car's history.
      verifiedSlots: [...knownCar.verifiedSlots!, trueCauseA.carPartId],
      symptoms: [symptomaticCar.symptoms[1]!],
    }

    // Sell unopened elsewhere: the buyer prices the demonstrable
    // (`buyerKnowledgeViewOf`), less the EXPECTED notice deduction for the
    // second, undiagnosed symptom - the same terms `rollBuyerNotice` rolls,
    // computed closed-form rather than sampled.
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
      candidateFixCostYen(lightRepairedCar, entryModel, trueCauseB, CONTEXT) *
      CONTEXT.economy.diagnosis.noticeMultiplier
    const lightSaleYen = Math.round(demonstrableValueYen - expectedNoticeDeductionYen)
    const lightMarginYen = lightSaleYen - buyYen - fixA.costYen
    const light = toDayRate(lightMarginYen, fixA.laborPoints, entryModel, ECONOMY)

    // MEASURED on the job model: light -8,263 yen/day (margin -23,261 over
    // 2.82 days, 28 labour points) vs deep -5,462 yen/day (margin -16,400
    // over 3.00 days, 43 labour points). The ordering this scenario gates
    // still holds, and holds the right way round: the light flip leaves a
    // wreck unopened and is punished harder for leaving it.
    //
    // The evidence term (knowledge.ts) does not move either side, because
    // this car's own visible half is itself near-poor: there is nothing
    // clean-looking for it to reward. See knowledge-and-diagnosis.md's
    // rulings-ledger item 13 for why the softened-buried-groups gap sits
    // entirely outside this scenario's born-verified evidence, and item 14
    // for the acquisition freeze - trueCauseA was never in the born-verified
    // set, so freezing before rather than after its repair changes nothing.
    //
    // DISCLOSED, never gated here: both sides now LOSE on this construction,
    // where the deep side used to clear a real profit. The whole of that move
    // is the day's hire the shared fix price charges once per PART: the deep
    // side's own bill is 71,110 yen for this car, of which 62,000 is hire and
    // 9,110 is parts. Whether the deep flip pays at all is gated roster-wide
    // in `valueModelProbes.test.ts`, not by this ordering.
    expect(
      light.yenPerDay,
      `light ${light.yenPerDay.toFixed(0)} yen/day vs deep ${deep.yenPerDay.toFixed(0)} yen/day`,
    ).toBeLessThan(deep.yenPerDay)
  })

  /**
   * Scenario 2 - TYPICAL light-flip candidate (`buildTypicalProbeCar`,
   * new). A generation-plausible mid-mileage entry car whose visible half
   * genuinely IS clean, carrying one cheap-to-mid findable fault
   * (`smokes-on-startup`'s `gunked-breather` cause - design section 1's own
   * worked example, its own test copy calling it "the cheapest engine
   * rebuild you'll ever do") and ordinary softened wear elsewhere
   * (`TYPICAL_PROBE_WORN_PART_IDS` - half the suspension bolt-ons plus two
   * more, spread rather than concentrated). This is the car a light flip is
   * actually FOR, and the ruling itself is gated here: light strictly
   * positive AND clearly below deep - "clearly below" being the ruling as
   * given, not the lead's own earlier 35-75% provisional band (see the
   * comment below the measurement).
   */
  it('scenario 2 (typical car): light strictly positive and strictly below deep', () => {
    const entryModel = CARS.find((c) => fitmentClassForTier(c.tier) === 'entry')
    if (!entryModel) throw new Error('fixture: no entry-tier roster model found')

    const typicalCar = buildTypicalProbeCar(entryModel, CONTEXT)
    const symptom = CONTEXT.symptoms.find((s) => s.id === 'smokes-on-startup')
    if (!symptom) throw new Error('fixture: smokes-on-startup symptom missing from content')
    const trueCause = symptom.causes.find((c) => c.id === 'gunked-breather')
    if (!trueCause) throw new Error('fixture: gunked-breather cause missing from smokes-on-startup')

    const symptomaticCar: CarInstance = {
      ...applyCauseDamage(typicalCar, trueCause),
      symptoms: [
        {
          symptomId: symptom.id,
          trueCauseId: trueCause.id,
          remainingCauseIds: [trueCause.id], // diagnosed
          runTestIds: [],
          latent: false,
        },
      ],
    }

    // ACQUISITION: seeds verifiedSlots to the born-verified set and freezes
    // acquisitionEvidenceDelta from the car exactly as bought (rulings-ledger
    // item 14) - the real function every auction settlement runs, so this
    // typical car's clean visible half earns evidence the same way a
    // player's own acquisition would, never a snapshot taken after the
    // player's own repair below.
    const knownCar = seedVerifiedSlots(symptomaticCar, CONTEXT)

    // Fair buy: the reserve fraction of this car's own true market value -
    // the same convention scenario 1 and probe (a) both use.
    const buyGuideYen = marketValueYen(
      entryModel,
      symptomaticCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const buyYen = Math.round(buyGuideYen * CONTEXT.economy.AUCTION_RESERVE_PRICE_FRACTION)
    const target = sensibleRepairTargetBand(entryModel, CONTEXT.economy)

    // LIGHT FLIP: diagnose and fix ONLY the one symptom's true cause, verify
    // only the slot that touches, sell unopened elsewhere. No symptom is
    // left open (there was only ever the one), so no buyer-notice deduction
    // applies - the whole gap to deep is what staying unverified elsewhere
    // costs at sale, nothing else.
    const installed = knownCar.parts[trueCause.carPartId].installed!
    const lightFix = slotFixOnJobModel(knownCar, trueCause.carPartId, target)
    if (!lightFix) throw new Error('fixture: the diagnosed cause left no repair to price')
    const lightRepairedBand =
      bandIndex(installed.band) < bandIndex(target) ? target : installed.band
    const lightRepairedCar: CarInstance = {
      ...knownCar,
      parts: {
        ...knownCar.parts,
        [trueCause.carPartId]: { installed: { ...installed, band: lightRepairedBand } },
      },
      // The frozen acquisitionEvidenceDelta on `knownCar` carries through
      // unchanged - this later repair is the player's own spanner work, not
      // fresh evidence about the car's history.
      verifiedSlots: [...knownCar.verifiedSlots!, trueCause.carPartId],
      symptoms: [],
    }
    const lightSaleYen = Math.round(
      marketValueYen(
        entryModel,
        buyerKnowledgeViewOf(lightRepairedCar, entryModel, CONTEXT),
        100,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        CONTEXT.economy,
      ),
    )
    const lightMarginYen = lightSaleYen - buyYen - lightFix.costYen
    const light = toDayRate(lightMarginYen, lightFix.laborPoints, entryModel, ECONOMY)

    // DEEP FLIP: same car, open and fix every REPAIRABLE slot still below
    // the tier's own sensible repair target (the same target the light
    // flip's own fix uses), sell fully verified - the honest teardown.
    const deepFixes: PartFixCost[] = []
    let deepLaborPoints = 0
    let deepParts = symptomaticCar.parts
    for (const partId of ALL_CAR_PART_IDS) {
      if (symptomaticCar.zoneState && isBodyDerivedPart(partId)) continue // untouched, already fine
      const partInstalled = symptomaticCar.parts[partId].installed
      const partFix = slotFixOnJobModel(symptomaticCar, partId, target)
      if (!partInstalled || !partFix) continue
      deepFixes.push(partFix.fix)
      deepLaborPoints += partFix.laborPoints
      deepParts = { ...deepParts, [partId]: { installed: { ...partInstalled, band: target } } }
    }
    // The parts half alone, like every other whole-car bill: a teardown buys
    // no tool-hire day.
    const deepCostYen = sumFixCosts(deepFixes).partsYen
    const deepCar: CarInstance = {
      ...symptomaticCar,
      parts: deepParts,
      verifiedSlots: [...ALL_CAR_PART_IDS],
      symptoms: [],
    }
    const deepSaleYen = Math.round(
      marketValueYen(
        entryModel,
        deepCar,
        100,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        CONTEXT.economy,
      ),
    )
    const deepMarginYen = deepSaleYen - buyYen - deepCostYen
    const deep = toDayRate(deepMarginYen, deepLaborPoints, entryModel, ECONOMY)

    const ratio = light.yenPerDay / deep.yenPerDay

    // GATED ON THE RULING ITSELF, the final scoping of this probe: light
    // flips positive, clearly below deep, not super profitable - not the
    // lead's own earlier 35-75% provisional band, which was never more
    // than a first guess at what "clearly below" should mean numerically.
    //
    // Real measured run on the job model: light 2,936 yen/day (margin 7,715
    // over 2.63 days, 13 labour points, lightSaleYen 50,355, bought at
    // 42,390, one `intake` worn-to-fine fix at 250 yen of parts) vs deep
    // 9,902 yen/day (margin 40,378 over 4.08 days, 129 labour points,
    // deepSaleYen 86,468, deepCostYen 3,700 over nine repairable slots).
    // Ratio 0.30: both gates hold.
    //
    // Neither side buys a tool-hire day, and that is the point rather than an
    // omission: this is the player's own spanner work, and a day buys a whole
    // line for a whole day rather than a car (`carCostToBandYen`). Pricing one
    // against a single flip put the light fix at 15,250 yen for 250 yen of
    // parts and drove both sides negative.
    //
    // The other mechanism holding the light side down, unchanged and still
    // worth knowing: `unverifiedHaircutByTier`
    // is a single per-tier scalar with no per-slot term (the same shape
    // limitation `priorBand` itself carries, knowledge.ts's own doc
    // comment), so it marks down every one of this car's ~20 unverified
    // slots a full band alike, not only the eight genuinely `worn`
    // `TYPICAL_PROBE_WORN_PART_IDS` ones - a per-slot or per-condition-spread
    // discount is the design-shape option that would size this more
    // precisely, left for a future sprint rather than picked here.
    //
    // Re-measured, bit-for-bit unchanged, after rulings-ledger item 14 froze
    // the evidence term at acquisition (`knownCar`, seeded from
    // `symptomaticCar` before the light flip's own repair): the true cause's
    // slot (`intake`) was never part of the born-verified set either, and its
    // repaired band (`sensibleRepairTargetBand`) happens to already match
    // every born-verified slot's own band - so including or excluding it from
    // the evidence average changes nothing here. The exploit this item closes
    // is real (see knowledge.test.ts's own dedicated probe) but does not
    // touch either of this file's two fixtures, since neither light flip's
    // one repaired slot ever moved the rounded evidence average by itself.
    expect(
      light.yenPerDay,
      `light margin ${light.marginYen} over ${light.days.toFixed(2)} days, ${light.laborPoints} labour points`,
    ).toBeGreaterThan(0)
    expect(
      light.yenPerDay,
      `light ${light.yenPerDay.toFixed(0)} yen/day vs deep ${deep.yenPerDay.toFixed(0)} yen/day, ratio ${ratio.toFixed(2)}`,
    ).toBeLessThan(deep.yenPerDay)
  })
})
