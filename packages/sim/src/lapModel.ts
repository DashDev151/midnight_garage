import type {
  CarInstance,
  CarModel,
  CarPartId,
  Course,
  EconomyConfig,
  Grade,
  TyreCompound,
} from '@midnight-garage/content'
import { buildFactors, computeDerivedStats, physicalConditionFactors } from './derivedStats'
import { effectiveCompound, effectiveDownforce, lapTime } from './performance'
import type { SimContext } from './context'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The reference board's entries are flavour cars (a power and a weight, no
 * chassis of their own), so they are timed on a single neutral chassis: a
 * mid-90s RWD NA coupe. Only the entry's weight, power, and tyre grade vary,
 * which is exactly what the board asks the player to read.
 *
 * The chassis carries the entry's own power as its STOCK power, not a
 * placeholder. The chassis has no measured acceleration, so its behaviour comes
 * from the fallback regression, whose predictor is power-to-weight: a
 * placeholder figure would predict the launch and power of a car with no engine
 * and then run the lap at the real one.
 */
function referenceCarModel(weightKg: number, powerPs: number): CarModel {
  return {
    id: 'lap-reference-chassis',
    displayName: 'Reference chassis',
    brand: 'Reference',
    parodyName: 'Reference chassis',
    parodyBrand: 'Reference',
    tier: 'everyday',
    rarity: 'common',
    origin: 'jdm',
    tags: ['FR', 'NA', 'Piston'],
    bookValueYen: 1,
    spec: {
      chassisCode: 'REF',
      engineCode: 'REF',
      yearFrom: 1995,
      curbWeightKg: weightKg,
      stockPowerPs: powerPs,
      engineConfig: 'I4',
      aspiration: 'NA',
      weightDistributionFront: 53,
      wheelbaseMm: 2500,
      comHeightMm: 470,
      dragCd: 0.33,
      widthMm: 1720,
      heightMm: 1330,
      stockTyre: '205/55R15',
      tyreCompound: 'performance',
      topSpeedKmh: 240,
    },
  }
}

/**
 * Every part currently stopping the car being driven at all, in taxonomy order,
 * empty for a car that can run. Most parts degrade gradually and a ruined one
 * only costs pace, which the condition dials carry; the parts marked
 * `scrapDisablesCar` in the taxonomy are function-or-fail, and at scrap they
 * stop the car rather than slow it - an engine that will not run, a driveline
 * that puts nothing on the road, or no steering, brakes or rubber. An empty or
 * unresolvable slot is strictly worse than a ruined one and counts the same.
 *
 * The set is read from the content rather than listed here, so a part cannot be
 * added to the game and silently escape the rule. This is also the ONE
 * predicate `lapTimeSecondsFor` refuses on, so a refusal and its reason can
 * never disagree: a caller that shows the player why gets exactly the parts the
 * model is refusing over.
 *
 * The car's model is not needed: no part carrying the flag is ever legitimately
 * absent (`forcedInduction` on an NA car is the only slot that can be, and a
 * dead turbo still runs badly rather than not at all).
 */
export function lapBlockers(car: CarInstance, context: SimContext): CarPartId[] {
  const blockers: CarPartId[] = []
  for (const entry of context.partsTaxonomy) {
    if (!entry.scrapDisablesCar) continue
    const installed = car.parts[entry.id].installed
    if (!installed || installed.band === 'scrap' || !context.partsById[installed.partId]) {
      blockers.push(entry.id)
    }
  }
  return blockers
}

/**
 * A car's time on one course: the measured-behaviour model (`performance.ts`'s
 * `lapTime`) at the car's CURRENT derived power (condition and parts matter -
 * that is the build game), the compound its fitted tyres actually provide, what
 * the grades it is built from are worth on grip, braking and mass, and the
 * state its grip, brake, driveline and aero parts are actually in. A
 * segmented course is walked corner by corner; a standing-kilometre course
 * routes to its own standing-start evaluator. Returns `null` (no time can be
 * set) for a car with any `lapBlockers` (above) or when the course id is
 * unknown.
 */
export function lapTimeSecondsFor(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  courseId: string,
): number | null {
  if (lapBlockers(car, context).length > 0) return null

  const course = context.coursesById[courseId]
  if (!course) return null

  const stats = computeDerivedStats(
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.economy,
  )
  const compound = effectiveCompound(
    car,
    model,
    context.partsById,
    context.economy.statFormulas.grip,
  )
  const aeroEffect = effectiveDownforce(
    car,
    model,
    context.partsById,
    context.economy.statFormulas.aero,
  )
  const condition = physicalConditionFactors(car, model, context.partsTaxonomy, context.economy)
  const build = buildFactors(car, context.partsById)
  return round1(
    lapTime(model, course, stats.power, compound, context.economy, aeroEffect, condition, build),
  )
}

/** A pool/anchor entry's own content shape (`content/src/lapReference.ts`),
 * restated here without importing content's schema types directly - both
 * `selectBoardRows` callers pass either a `LapReferenceEntry` or the anchor
 * entry, and this is the only shape either function actually reads. */
export interface LapReferenceCar {
  id: string
  name: string
  powerPs: number
  weightKg: number
}

/** One row of the reference-lap board - a comparable car (or the grip
 * anchor, rendered once per tyre grade) with its model-computed time.
 * Times are never authored; they're always the live output of the grip-and-pace
 * model on the mission's own course, so a course or lever change retunes the
 * whole board for free. */
export interface LapBoardRow {
  id: string
  name: string
  powerPs: number
  weightKg: number
  tyreGrade: Grade
  timeSeconds: number
  isAnchor: boolean
}

const GRADES: readonly Grade[] = ['stock', 'street', 'sport', 'race']

interface TimedPoolEntry extends LapReferenceCar {
  tyreGrade: Grade
  timeSeconds: number
}

/**
 * A reference entry's time on a course: the neutral reference chassis at that
 * entry's weight and power, on the compound its tyre grade fits. The board's
 * timing primitive, exported so the board's numbers can be cross-checked
 * against the model directly.
 */
export function referenceLapTimeSeconds(
  powerPs: number,
  weightKg: number,
  tyreGrade: Grade,
  course: Course,
  economy: EconomyConfig,
): number {
  const compound: TyreCompound | undefined =
    economy.statFormulas.grip.gradeToCompound[tyreGrade] ?? undefined
  return round1(lapTime(referenceCarModel(weightKg, powerPs), course, powerPs, compound, economy))
}

function referenceTime(
  entry: LapReferenceCar,
  tyreGrade: Grade,
  course: Course,
  economy: EconomyConfig,
): number {
  return referenceLapTimeSeconds(entry.powerPs, entry.weightKg, tyreGrade, course, economy)
}

function timeEntries(
  entries: readonly (LapReferenceCar & { tyreGrade: Grade })[],
  course: Course,
  economy: EconomyConfig,
): TimedPoolEntry[] {
  return entries.map((entry) => ({
    ...entry,
    timeSeconds: referenceTime(entry, entry.tyreGrade, course, economy),
  }))
}

/** The 4 anchor rows - one grip-anchor car (`content/src/lapReference.ts`'s
 * `anchor: true` entry), rendered once per tyre grade so the player reads
 * the grade deltas off one identical car. */
function anchorRows(
  anchor: LapReferenceCar,
  course: Course,
  economy: EconomyConfig,
): LapBoardRow[] {
  return GRADES.map((tyreGrade) => ({
    id: `${anchor.id}-${tyreGrade}`,
    name: anchor.name,
    powerPs: anchor.powerPs,
    weightKg: anchor.weightKg,
    tyreGrade,
    timeSeconds: referenceTime(anchor, tyreGrade, course, economy),
    isAnchor: true,
  }))
}

/** Nearest `count` entries to `targetSeconds`, in the given direction
 * relative to it ('slower' = strictly greater time, 'faster' = strictly
 * less) - ties broken by whichever the input order already favours
 * (`Array.prototype.sort` is stable). */
function nearestInDirection(
  entries: readonly TimedPoolEntry[],
  targetSeconds: number,
  direction: 'slower' | 'faster',
  count: number,
): TimedPoolEntry[] {
  const filtered = entries.filter((entry) =>
    direction === 'slower' ? entry.timeSeconds > targetSeconds : entry.timeSeconds < targetSeconds,
  )
  filtered.sort(
    (a, b) => Math.abs(a.timeSeconds - targetSeconds) - Math.abs(b.timeSeconds - targetSeconds),
  )
  return filtered.slice(0, count)
}

/**
 * The board's straddling-selection rule, pure and deterministic. With a
 * candidate car picked: from the pool entries at the
 * SAME tyre grade, take the 2 nearest slower and 2 nearest faster; if
 * either side comes up short (fewer than 2 within that grade), pad it from
 * the rest of the pool - any grade, nearest by time - since a grade-
 * adjacent car naturally lands at a similar time by the formula's own
 * monotonic construction. With no candidate: skip the slower/faster split
 * entirely and take the 4 pool entries nearest `noCandidateTargetSeconds`
 * (the mission's own `lapTimeCeiling.maxSeconds`). The 4 anchor rows are
 * always appended, regardless of which branch ran, sorted fastest-first
 * like the pool rows.
 *
 * THE PLAYER'S OWN PREDICTED TIME NEVER APPEARS IN THE RETURNED ROWS - only
 * the pool/anchor entries' own times; `candidate.timeSeconds` is read here
 * purely to select which comparables to show, never surfaced in the result.
 */
export function selectBoardRows(
  pool: readonly (LapReferenceCar & { tyreGrade: Grade })[],
  anchor: LapReferenceCar,
  candidate: { timeSeconds: number; tyreGrade: Grade } | null,
  noCandidateTargetSeconds: number,
  economy: EconomyConfig,
  course: Course,
): LapBoardRow[] {
  const timedPool = timeEntries(pool, course, economy)

  let poolRows: TimedPoolEntry[]
  if (candidate) {
    const sameGrade = timedPool.filter((entry) => entry.tyreGrade === candidate.tyreGrade)
    let slower = nearestInDirection(sameGrade, candidate.timeSeconds, 'slower', 2)
    let faster = nearestInDirection(sameGrade, candidate.timeSeconds, 'faster', 2)
    const usedIds = new Set([...slower, ...faster].map((entry) => entry.id))
    const rest = timedPool.filter((entry) => !usedIds.has(entry.id))
    if (slower.length < 2) {
      const padded = nearestInDirection(rest, candidate.timeSeconds, 'slower', 2 - slower.length)
      slower = [...slower, ...padded]
    }
    if (faster.length < 2) {
      const restAfterSlowerPad = rest.filter((entry) => !slower.includes(entry))
      const padded = nearestInDirection(
        restAfterSlowerPad,
        candidate.timeSeconds,
        'faster',
        2 - faster.length,
      )
      faster = [...faster, ...padded]
    }
    // `faster` is ordered nearest-to-candidate first (descending time);
    // `slower` is ordered nearest-to-candidate first (ascending time) -
    // reversing `faster` and concatenating gives one fastest-first list.
    poolRows = [...faster].reverse().concat(slower)
  } else {
    poolRows = [...timedPool]
      .sort(
        (a, b) =>
          Math.abs(a.timeSeconds - noCandidateTargetSeconds) -
          Math.abs(b.timeSeconds - noCandidateTargetSeconds),
      )
      .slice(0, 4)
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
  }

  return [
    ...poolRows.map((entry) => ({ ...entry, isAnchor: false })),
    ...anchorRows(anchor, course, economy),
  ]
}
