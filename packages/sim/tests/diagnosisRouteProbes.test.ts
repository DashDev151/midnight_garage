import {
  DIAGNOSTIC_TESTS,
  SYMPTOMS,
  type Symptom,
  type TestApplication,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { availableTestIdsFor } from '../src/diagnosis'

/**
 * Closed-form walks over the real routed-diagnosis content: no bots, no RNG,
 * no game state beyond the four fields a car's own symptom instance carries.
 * Every check below brute-forces the real content's own test orderings and
 * reasons about the resulting `remainingCauseIds`, exactly mirroring
 * `runDiagnosticTest`'s narrowing rule (`diagnosis.ts`) and its own
 * `availableTestIdsFor` gate, without going through any state/visit/minutes
 * plumbing those functions also handle.
 *
 * The "board opens" shape: a symptom's root test (no `unlockedBy`) is a
 * single, mandatory first look - level 1 teaches, it is never a choice. Every
 * test that test unlocks (via a group-less `unlockedBy`, "ran, either
 * outcome") forms the board that opens once that first look has run: several
 * tests become available at once, only some of which narrow anything given
 * what the first look showed. A player who reads the level-1 result and
 * reasons about it can route straight to the narrowing test; a player who
 * clicks blind pays for the dead ones too.
 */

/**
 * Deliberately unresolvable (symptomId, causeId) pairs: recorded design
 * decisions where the yard cannot isolate this cause from its siblings even
 * with every available test run (docs/design/failure-map.md's "deliberate
 * residual ambiguity" lever, e.g. an ECU-versus-cams call that only a bench
 * strip can settle). The resolution-accounting probe below treats any
 * (symptomId, causeId) pair NOT listed here as an authoring gap and fails
 * naming it. Empty for the three built trees, which fully resolve.
 */
export const DECLARED_AMBIGUOUS: ReadonlyArray<{ symptomId: string; causeId: string }> = []

const SLICE_SYMPTOM_IDS = [
  'damp-passenger-footwell',
  'smokes-on-startup',
  'crunch-into-second',
  'non-starter',
  'tick-at-idle',
  'wont-idle',
  'clunk-over-bumps',
  'overheats-in-traffic',
  'diff-whine',
  'sagging-spring',
  'quarter-panel-filler',
  'oil-pressure-flutter',
  'hesitates-under-load',
] as const

type SliceSymptomId = (typeof SLICE_SYMPTOM_IDS)[number]

/** The tests built to teach nothing new at their own unlock node - an
 * identical partition to whichever test unlocks them, so any remaining set
 * reaching them is already wholly inside one of their own two groups. */
const DEAD_END_TEST_BY_SYMPTOM: Record<SliceSymptomId, string> = {
  'damp-passenger-footwell': 'carpet-lift',
  'smokes-on-startup': 'pull-a-plug',
  'crunch-into-second': 'try-it-warm',
  'non-starter': 'stethoscope',
  'tick-at-idle': 'pull-a-plug',
  'wont-idle': 'fuel-sniff',
  'clunk-over-bumps': 'ride-height-check',
  'overheats-in-traffic': 'hose-squeeze',
  'diff-whine': 'stethoscope',
  'sagging-spring': 'bounce-test',
  'quarter-panel-filler': 'open-the-boot',
  'oil-pressure-flutter': 'stethoscope',
  'hesitates-under-load': 'pull-a-plug',
}

function symptomById(id: string): Symptom {
  const symptom = SYMPTOMS.find((s) => s.id === id)
  if (!symptom) throw new Error(`slice symptom "${id}" missing from real content`)
  return symptom
}

/** Symptoms whose tests actually route (carry at least one `unlockedBy`) -
 * today exactly the three slice symptoms above, but written against the real
 * content rather than the fixed list so a later sweep adding more routed
 * symptoms inherits every check in this file for free. */
function routedSymptoms(): Symptom[] {
  return SYMPTOMS.filter((symptom) => symptom.tests.some((test) => test.unlockedBy))
}

const MINUTES_BY_TEST_ID: Record<string, number> = Object.fromEntries(
  DIAGNOSTIC_TESTS.map((t) => [t.id, t.minutes]),
)

interface ProbeCarSymptom {
  symptomId: string
  trueCauseId: string
  remainingCauseIds: string[]
  runTestIds: string[]
}

function freshCarSymptom(symptom: Symptom, trueCauseId: string): ProbeCarSymptom {
  return {
    symptomId: symptom.id,
    trueCauseId,
    remainingCauseIds: symptom.causes.map((c) => c.id),
    runTestIds: [],
  }
}

/** Runs `testId` against `carSymptom` exactly the way `runDiagnosticTest`
 * narrows: the true cause's own partition group replaces `remainingCauseIds`
 * with its intersection, and `testId` joins `runTestIds`. */
function narrow(carSymptom: ProbeCarSymptom, symptom: Symptom, testId: string): ProbeCarSymptom {
  const testApplication = symptom.tests.find((t) => t.testId === testId)
  if (!testApplication) throw new Error(`"${symptom.id}" has no test "${testId}"`)
  const group = testApplication.partition.find((g) => g.includes(carSymptom.trueCauseId))
  if (!group) throw new Error(`"${testId}" partition never covers "${carSymptom.trueCauseId}"`)
  return {
    ...carSymptom,
    remainingCauseIds: carSymptom.remainingCauseIds.filter((id) => group.includes(id)),
    runTestIds: [...carSymptom.runTestIds, testId],
  }
}

function causeWeight(symptom: Symptom, causeId: string): number {
  const cause = symptom.causes.find((c) => c.id === causeId)
  if (!cause) throw new Error(`"${symptom.id}" has no cause "${causeId}"`)
  return cause.weight
}

function weightSum(symptom: Symptom, causeIds: readonly string[]): number {
  return causeIds.reduce((sum, id) => sum + causeWeight(symptom, id), 0)
}

function stateKey(remaining: readonly string[], run: readonly string[]): string {
  return `${[...remaining].sort().join(',')}|${[...run].sort().join(',')}`
}

/** A test's own testApplication entry on `symptom`, or throws - every
 * lookup below is against real content, so a miss is a fixture bug, not a
 * result worth reporting as `undefined`. */
function testApplicationFor(symptom: Symptom, testId: string): TestApplication {
  const testApplication = symptom.tests.find((t) => t.testId === testId)
  if (!testApplication) throw new Error(`"${symptom.id}" has no test "${testId}"`)
  return testApplication
}

/** A purely structural view of "which unrun tests does `availableTestIdsFor`
 * offer" for a bare (remaining, run) pair, with no particular trueCauseId in
 * mind - safe because every group-gated `unlockedBy` only ever asks which
 * partition group of an ALREADY-RUN parent test contains the true cause, and
 * `remaining` (by construction, as the intersection of every already-run
 * test's own resolved group) is always wholly inside that same group for any
 * candidate still standing - so which member of `remaining` stands in for
 * the true cause here never changes the answer. */
function availableUnrunAt(
  remaining: readonly string[],
  run: readonly string[],
  symptom: Symptom,
): string[] {
  const probe: ProbeCarSymptom = {
    symptomId: symptom.id,
    trueCauseId: remaining[0]!,
    remainingCauseIds: [...remaining],
    runTestIds: [...run],
  }
  return availableTestIdsFor(probe, symptom).filter((id) => !run.includes(id))
}

/** True when running `testApplication` against a node whose live candidates
 * are exactly `remaining` would actually shrink that set - both of its
 * partition groups intersect `remaining`, so the outcome the true cause
 * lands in genuinely depends on which member of `remaining` it is. False
 * (a "dead" test at this node) when `remaining` sits wholly inside one
 * group already - the result tells the player nothing they didn't know. */
function narrowsAt(remaining: readonly string[], testApplication: TestApplication): boolean {
  const inGroup0 = remaining.some((id) => testApplication.partition[0].includes(id))
  const inGroup1 = remaining.some((id) => testApplication.partition[1].includes(id))
  return inGroup0 && inGroup1
}

interface ReachableState {
  remaining: string[]
  run: string[]
}

/** Every (remaining, run) pair reachable from the fresh state via any legal
 * ordering of any outcome of any available test, breadth-first so states
 * come out in non-decreasing `run.length` order - `boardNodes` below relies
 * on that ordering to find the shortest path into each distinct remaining
 * set. Purely structural (see `availableUnrunAt`): no trueCauseId walks
 * needed, since a test's own partition intersected with the current
 * `remaining` set already determines both which outcomes are reachable and
 * whether either one narrows. */
function allReachableStates(symptom: Symptom): ReachableState[] {
  const allCauseIds = symptom.causes.map((c) => c.id)
  const visited = new Map<string, ReachableState>()
  const queue: ReachableState[] = [{ remaining: allCauseIds, run: [] }]
  while (queue.length > 0) {
    const state = queue.shift()!
    const key = stateKey(state.remaining, state.run)
    if (visited.has(key)) continue
    visited.set(key, state)
    if (state.remaining.length <= 1) continue
    for (const testId of availableUnrunAt(state.remaining, state.run, symptom)) {
      const testApplication = testApplicationFor(symptom, testId)
      const nextRun = [...state.run, testId]
      for (const group of testApplication.partition) {
        const groupRemaining = state.remaining.filter((id) => group.includes(id))
        if (groupRemaining.length > 0) queue.push({ remaining: groupRemaining, run: nextRun })
      }
    }
  }
  return [...visited.values()]
}

/**
 * The board as first presented for each distinct remaining set a symptom's
 * tree can narrow down to: the shortest-path state reaching that remaining
 * set (via `allReachableStates`'s breadth-first order), excluding the bare
 * opening state (`run.length === 0`, level 1's own single mandatory test,
 * governed by the root-shape law instead) and any already-resolved set
 * (nothing left to choose between). A remaining set reached again later, via
 * extra tests that never changed it, is not a second board - it is the same
 * board with fewer unrun options left, which is not what "choice everywhere"
 * or "waste and signal" are describing.
 */
function boardNodes(symptom: Symptom): ReachableState[] {
  const seenRemaining = new Set<string>()
  const nodes: ReachableState[] = []
  for (const state of allReachableStates(symptom)) {
    if (state.run.length === 0) continue
    if (state.remaining.length <= 1) continue
    const remainingKey = [...state.remaining].sort().join(',')
    if (seenRemaining.has(remainingKey)) continue
    seenRemaining.add(remainingKey)
    nodes.push(state)
  }
  return nodes
}

/** The fewest minutes any legal route needs to fully resolve `symptom` down
 * to `trueCauseId` alone - brute-forces every ordering of every available
 * test, pruning any branch already worse than the best full route found so
 * far. Trees this small (at most six tests) make the search trivial. */
function bestRouteMinutesToResolve(symptom: Symptom, trueCauseId: string): number {
  let best: number | null = null
  const visit = (state: ProbeCarSymptom, minutesSpent: number): void => {
    if (state.remainingCauseIds.length <= 1) {
      if (best === null || minutesSpent < best) best = minutesSpent
      return
    }
    if (best !== null && minutesSpent >= best) return
    const available = availableTestIdsFor(state, symptom).filter(
      (id) => !state.runTestIds.includes(id),
    )
    for (const testId of available) {
      visit(narrow(state, symptom, testId), minutesSpent + MINUTES_BY_TEST_ID[testId]!)
    }
  }
  visit(freshCarSymptom(symptom, trueCauseId), 0)
  if (best === null) {
    throw new Error(`"${symptom.id}" has no route that ever resolves trueCauseId="${trueCauseId}"`)
  }
  return best
}

/** True when some legal sequence of available tests can narrow "symptom"
 * down to "causeId" alone - reuses the same brute-force search as
 * `bestRouteMinutesToResolve`, since "some route resolves this cause" and
 * "the cheapest such route costs N minutes" are the same reachability
 * question, differing only in throw-versus-return shape; the resolution-
 * accounting probe wants a boolean, not a minutes budget. */
function isIsolatable(symptom: Symptom, causeId: string): boolean {
  try {
    bestRouteMinutesToResolve(symptom, causeId)
    return true
  } catch {
    return false
  }
}

/** The reading player's own expected minutes: the weighted (by real cause
 * weight) average of the cheapest full-resolution route for each possible
 * true cause - a player who reads every result and always picks the test
 * that routes shortest to the answer. */
function readerMinutes(symptom: Symptom): number {
  const total = weightSum(
    symptom,
    symptom.causes.map((c) => c.id),
  )
  return symptom.causes.reduce(
    (sum, cause) => sum + (cause.weight / total) * bestRouteMinutesToResolve(symptom, cause.id),
    0,
  )
}

/**
 * The blind clicker's own expected minutes: at every node, pick uniformly at
 * random among the currently offered unrun tests, weighting each outcome by
 * the real (renormalised) cause weights still live in `remaining` - an exact
 * expectation by recursion over (remaining, run) states, memoised since the
 * same state recurs across different random click orders. Throws if a node
 * is ever left with zero unrun tests while more than one cause remains live -
 * that would mean blind clicking can never finish, a real content bug this
 * probe exists to catch, not a value to paper over with a fallback.
 */
function blindExpectedMinutes(
  symptom: Symptom,
  remaining: readonly string[],
  run: readonly string[],
  memo: Map<string, number>,
): number {
  if (remaining.length <= 1) return 0
  const key = stateKey(remaining, run)
  const cached = memo.get(key)
  if (cached !== undefined) return cached

  const available = availableUnrunAt(remaining, run, symptom)
  if (available.length === 0) {
    throw new Error(
      `"${symptom.id}" is stuck at remaining=[${remaining.join(',')}] run=[${run.join(',')}]: no unrun test left, blind clicking can never resolve it`,
    )
  }
  const totalWeight = weightSum(symptom, remaining)
  let totalMinutes = 0
  for (const testId of available) {
    const testApplication = testApplicationFor(symptom, testId)
    const nextRun = [...run, testId]
    let expectedAfter = 0
    for (const group of testApplication.partition) {
      const groupRemaining = remaining.filter((id) => group.includes(id))
      if (groupRemaining.length === 0) continue
      const probability = weightSum(symptom, groupRemaining) / totalWeight
      expectedAfter += probability * blindExpectedMinutes(symptom, groupRemaining, nextRun, memo)
    }
    totalMinutes += MINUTES_BY_TEST_ID[testId]! + expectedAfter
  }
  const result = totalMinutes / available.length
  memo.set(key, result)
  return result
}

function blindMinutesFor(symptom: Symptom): number {
  const allCauseIds = symptom.causes.map((c) => c.id)
  return blindExpectedMinutes(symptom, allCauseIds, [], new Map())
}

/** True once `scrapCauseId` is either eliminated from `remaining` or is the
 * only candidate left - "decided", short of needing full resolution. */
function grenadeDecided(remaining: readonly string[], scrapCauseId: string): boolean {
  if (!remaining.includes(scrapCauseId)) return true
  return remaining.length === 1
}

/** The fewest minutes any legal route needs to decide `symptom`'s own
 * scrap-band cause in or out, given a real `trueCauseId` - brute-forces
 * every ordering of every available test exactly like
 * `bestRouteMinutesToResolve`, but stops as soon as the scrap cause's own
 * fate is settled rather than waiting for full resolution. */
function bestGrenadeRouteMinutes(
  symptom: Symptom,
  trueCauseId: string,
  scrapCauseId: string,
): number {
  let best: number | null = null
  const visit = (state: ProbeCarSymptom, minutesSpent: number): void => {
    if (grenadeDecided(state.remainingCauseIds, scrapCauseId)) {
      if (best === null || minutesSpent < best) best = minutesSpent
      return
    }
    if (best !== null && minutesSpent >= best) return
    const available = availableTestIdsFor(state, symptom).filter(
      (id) => !state.runTestIds.includes(id),
    )
    for (const testId of available) {
      visit(narrow(state, symptom, testId), minutesSpent + MINUTES_BY_TEST_ID[testId]!)
    }
  }
  visit(freshCarSymptom(symptom, trueCauseId), 0)
  if (best === null) {
    throw new Error(
      `"${symptom.id}" has no route that ever decides the grenade for trueCauseId="${trueCauseId}"`,
    )
  }
  return best
}

describe('root shape: a root outcome worth more than a quarter of the weight always opens a board', () => {
  for (const symptom of routedSymptoms()) {
    it(`${symptom.id}`, () => {
      const totalWeight = weightSum(
        symptom,
        symptom.causes.map((c) => c.id),
      )
      const roots = symptom.tests.filter((t) => !t.unlockedBy)
      expect(
        roots.length,
        `"${symptom.id}" routes tests but has no root test`,
      ).toBeGreaterThanOrEqual(1)

      for (const root of roots) {
        for (const group of root.partition) {
          const share = weightSum(symptom, group) / totalWeight
          if (share <= 0.25) continue // a rare direct hit is allowed to resolve on the spot
          expect(
            group.length,
            `"${symptom.id}" root "${root.testId}" outcome [${group.join(',')}] carries ${(share * 100).toFixed(0)}% of the weight but resolves to a single cause - the board never opens for the common case`,
          ).toBeGreaterThan(1)
        }
      }
    })
  }
})

describe('choice everywhere: once the board opens, every unresolved node offers a real choice', () => {
  for (const symptom of routedSymptoms()) {
    it(`${symptom.id}`, () => {
      for (const { remaining, run } of boardNodes(symptom)) {
        const available = availableUnrunAt(remaining, run, symptom)
        expect(
          available.length,
          `"${symptom.id}" node (remaining=[${[...remaining].sort().join(',')}], run=[${[...run].sort().join(',')}]) offers only ${available.length} unrun test(s) - not a real choice`,
        ).toBeGreaterThanOrEqual(2)
      }
    })
  }
})

describe('waste and signal: every open board offers both a dead click and a narrowing one', () => {
  for (const symptom of routedSymptoms()) {
    it(`${symptom.id}`, () => {
      for (const { remaining, run } of boardNodes(symptom)) {
        const available = availableUnrunAt(remaining, run, symptom)
        const narrowing = available.filter((id) =>
          narrowsAt(remaining, testApplicationFor(symptom, id)),
        )
        const dead = available.filter(
          (id) => !narrowsAt(remaining, testApplicationFor(symptom, id)),
        )
        const label = `"${symptom.id}" node (remaining=[${[...remaining].sort().join(',')}], run=[${[...run].sort().join(',')}])`
        expect(dead.length, `${label} offers no test that wastes minutes`).toBeGreaterThanOrEqual(1)
        expect(
          narrowing.length,
          `${label} offers no test that actually narrows`,
        ).toBeGreaterThanOrEqual(1)
      }
    })
  }
})

describe('resolution accounting: every cause is isolatable by some route, or declared ambiguous', () => {
  for (const symptom of routedSymptoms()) {
    it(`${symptom.id}`, () => {
      for (const cause of symptom.causes) {
        const declared = DECLARED_AMBIGUOUS.some(
          (entry) => entry.symptomId === symptom.id && entry.causeId === cause.id,
        )
        if (declared) continue
        expect(
          isIsolatable(symptom, cause.id),
          `"${symptom.id}" cause "${cause.id}" is not isolatable by any route and is not declared ambiguous - author a route that narrows to it alone, or add {symptomId: "${symptom.id}", causeId: "${cause.id}"} to DECLARED_AMBIGUOUS with the design reason recorded in docs/design/failure-map.md`,
        ).toBe(true)
      }
    })
  }
})

describe('dead-end law: the identical-partition test narrows nothing once it is on offer', () => {
  for (const symptomId of SLICE_SYMPTOM_IDS) {
    const symptom = symptomById(symptomId)
    const deadEndTestId = DEAD_END_TEST_BY_SYMPTOM[symptomId]
    const deadEndTest = symptom.tests.find((t) => t.testId === deadEndTestId)
    if (!deadEndTest?.unlockedBy) {
      throw new Error(`"${symptomId}"'s dead-end test "${deadEndTestId}" is missing its unlockedBy`)
    }
    const parentTestId = deadEndTest.unlockedBy.testId

    it(`${symptomId}: ${deadEndTestId} narrows nothing at every node reachable after "${parentTestId}" ran`, () => {
      let checked = 0
      for (const { remaining, run } of allReachableStates(symptom)) {
        if (remaining.length <= 1) continue
        if (!run.includes(parentTestId)) continue
        checked += 1
        expect(
          narrowsAt(remaining, deadEndTest),
          `"${symptomId}"'s "${deadEndTestId}" narrows remaining=[${[...remaining].sort().join(',')}] after run=[${[...run].sort().join(',')}] - it should always be a dead click there`,
        ).toBe(false)
      }
      expect(
        checked,
        `no reachable node ever offers "${deadEndTestId}" - the fixture never exercised it`,
      ).toBeGreaterThan(0)
    })
  }
})

/**
 * Reader minutes (best-route, weighted by real cause weight) against blind
 * minutes (uniform-random clicking, exact expectation) - measured, not
 * estimated, by the search/recursion above. Reading the level-1 result and
 * routing off it must be substantially cheaper than clicking blind, or the
 * board teaches nothing.
 *
 * Measured: damp-passenger-footwell reader=17.40min blind=31.77min (1.83x,
 * clears the bar); smokes-on-startup reader=19.10min blind=30.80min (1.61x,
 * clears the bar); crunch-into-second reader=25.00min blind=42.50min (1.70x,
 * clears the bar); non-starter reader=21.65min blind=32.60min (1.51x, clears
 * the bar, the tightest margin on the map - four causes behind one 15min
 * root leaves little slack); tick-at-idle reader=10.00min blind=25.30min
 * (2.53x, clears the bar); wont-idle reader=18.75min blind=31.88min (1.70x,
 * clears the bar); clunk-over-bumps reader=15.00min blind=28.92min (1.93x,
 * clears the bar); overheats-in-traffic reader=20.40min blind=37.22min
 * (1.82x, clears the bar); diff-whine reader=16.50min blind=33.13min (2.01x,
 * clears the bar); sagging-spring reader=18.50min blind=33.25min (1.80x,
 * clears the bar); quarter-panel-filler reader=15.00min blind=27.00min
 * (1.80x, clears the bar); oil-pressure-flutter reader=15.25min
 * blind=30.13min (1.98x, clears the bar); hesitates-under-load
 * reader=17.00min blind=31.13min (1.83x, clears the bar).
 */
describe('reading pays: blind clicking costs at least 1.5x what reading and routing costs', () => {
  for (const symptomId of SLICE_SYMPTOM_IDS) {
    it(`${symptomId}`, () => {
      const symptom = symptomById(symptomId)
      const reader = readerMinutes(symptom)
      const blind = blindMinutesFor(symptom)
      expect(
        blind,
        `"${symptomId}": reader=${reader.toFixed(2)}min blind=${blind.toFixed(2)}min (${(blind / reader).toFixed(2)}x) - blind clicking should cost at least 1.5x reading and routing`,
      ).toBeGreaterThanOrEqual(1.5 * reader)
    })
  }
})

/**
 * Grenade budgets: the worst-case (over every possible true cause) minutes
 * needed to decide each symptom's own scrap-band cause in or out, re-measured
 * against the rebuilt cause tables.
 *
 * Measured: damp-passenger-footwell 15min (heater/grommet/sunroof are free
 * at the root's own 5min; scuttle/bulkhead need one more 10min test);
 * smokes-on-startup 30min (head-gasket is free at the root's own 10min;
 * valve-seals and gunked-breather each settle with one more 10min test off
 * the root; tired-rings needs the root plus two more 10min tests);
 * crunch-into-second 25min (worn-synchros/dragging-clutch are free at the
 * root's own 15min; low-thin-oil/chewed-gearset need one more 10min test);
 * non-starter 15min (every cause is decided at the root's own 15min - the
 * scrap cause, seized-engine, is hand-crank's own group0, so its fate is
 * settled the instant the root runs either way); tick-at-idle 10min (lifter
 * and rocker are free at the root's own 5min; manifold and rod-knock both
 * settle with one more 5min test off the root, exhaust-glove-test, which
 * happens to fall exactly on that boundary); wont-idle 30min (leak and ECU
 * are free at the root's own 5min; cams and burnt-valve both need one more
 * 25min test, compression-test); clunk-over-bumps 15min (bushes and
 * steering are free at the root's own 5min; dampers and subframe both
 * settle with one more 10min test, bounce-test); overheats-in-traffic 35min
 * (fan and radiator are free at the root's own 10min; gasket and block both
 * need one more 25min test, compression-test); diff-whine 20min (the wheel
 * bearing and centre bearing are free at the root's own 5min, since the
 * scrap cause sits wholly in the other group; the diff bearings and the
 * ring and pinion both need one more 15min test, gearbox-oil-check, to tell
 * them apart); sagging-spring 25min (sagging springs and perished spring
 * seats are free at the root's own 10min; the broken spring and the rotted
 * strut turret both need one more 15min test, wheel-off-look or
 * undercarriage-look); quarter-panel-filler 20min (the respray and tired
 * lacquer are free at the root's own 5min; the rust patch settles with one
 * more 10min test, magnet-check, but the structural rail repair needs one
 * more 15min test, undercarriage-look, which sets the worst case); oil-
 * pressure-flutter 25min (the tired sender and thin oil are free at the
 * root's own 5min; worn oil pump and worn main bearings both need one more
 * 20min test, oil-pressure-check); hesitates-under-load 30min (the clogged
 * filter and stale fuel are free at the root's own 5min; the stretched and
 * jumped timing chain both need one more 25min test, compression-test).
 */
const GRENADE_MINUTE_BUDGET: Record<SliceSymptomId, number> = {
  'damp-passenger-footwell': 15,
  'smokes-on-startup': 30,
  'crunch-into-second': 25,
  'non-starter': 15,
  'tick-at-idle': 10,
  'wont-idle': 30,
  'clunk-over-bumps': 15,
  'overheats-in-traffic': 35,
  'diff-whine': 20,
  'sagging-spring': 25,
  'quarter-panel-filler': 20,
  'oil-pressure-flutter': 25,
  'hesitates-under-load': 30,
}

describe('grenade budget: every possible true cause reaches a verdict on the scrap cause within budget', () => {
  for (const symptomId of SLICE_SYMPTOM_IDS) {
    const symptom = symptomById(symptomId)
    const scrapCause = symptom.causes.find((c) => c.setBand === 'scrap')
    if (!scrapCause) throw new Error(`"${symptomId}" has no scrap-band cause`)
    const budget = GRENADE_MINUTE_BUDGET[symptomId]

    it(`${symptomId}: every trueCauseId reaches a verdict on "${scrapCause.id}" within ${budget} minutes`, () => {
      for (const cause of symptom.causes) {
        const minutes = bestGrenadeRouteMinutes(symptom, cause.id, scrapCause.id)
        expect(
          minutes,
          `trueCauseId=${cause.id} needs ${minutes} minutes to decide the grenade, over the ${budget}-minute budget`,
        ).toBeLessThanOrEqual(budget)
      }
    })
  }
})
