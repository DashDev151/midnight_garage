import type {
  CarInstance,
  CarModel,
  Course,
  EconomyConfig,
  Grade,
  TyreCompound,
} from '@midnight-garage/content'
import { computeDerivedStats } from './derivedStats'
import { effectiveCompound, lapTime } from './performance'
import type { SimContext } from './context'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The reference board's entries are flavour cars (a power and a weight, no
 * chassis of their own), so they are timed on a single neutral chassis: a
 * mid-90s RWD NA coupe. Only the entry's weight, power, and tyre grade vary,
 * which is exactly what the board asks the player to read.
 */
function referenceCarModel(weightKg: number): CarModel {
  return {
    id: 'lap-reference-chassis',
    displayName: 'Reference chassis',
    brand: 'Reference',
    parodyName: 'Reference chassis',
    parodyBrand: 'Reference',
    tier: 'common',
    tags: ['FR', 'NA', 'Piston'],
    bookValueYen: 1,
    spec: {
      chassisCode: 'REF',
      engineCode: 'REF',
      yearFrom: 1995,
      curbWeightKg: weightKg,
      stockPowerPs: 1,
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
 * A car's lap on one course: the grip-and-pace model (`performance.ts`'s
 * `lapTime`) over that course's corner and straight segments, at the car's
 * CURRENT derived power (condition and parts matter - that is the build game)
 * and the compound its fitted tyres actually provide. Returns `null` (no time
 * can be set) when the tyres slot is empty or scrap-band - there is nothing to
 * grip the road with - or when the course id is unknown.
 */
export function lapTimeSecondsFor(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  courseId: string,
): number | null {
  const installed = car.parts.tyres.installed
  if (!installed || installed.band === 'scrap') return null
  const tyrePart = context.partsById[installed.partId]
  if (!tyrePart) return null

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
  return round1(lapTime(model, course, stats.power, compound, context.economy))
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
  return round1(lapTime(referenceCarModel(weightKg), course, powerPs, compound, economy))
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
