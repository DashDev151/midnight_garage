import {
  BUYERS,
  CARS,
  DIAGNOSTIC_TESTS,
  PARTS,
  PARTS_TAXONOMY,
  SYMPTOMS,
  type AuctionLot,
  type CarInstance,
  type GameState,
  type StaffMember,
  type Symptom,
  type TestApplication,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, privateValuationYen } from '../src/bidding'
import { buildSimContext } from '../src/context'
import {
  apparentViewOf,
  availableTestIdsFor,
  beginInspectionVisit,
  bestNextTestId,
  displayedBandFor,
  expectedTrueValueYen,
  inspectionVisitGateReason,
  ownedWorkupGateReason,
  playerEstimateYen,
  pruneCuredCauses,
  resolveOwnedWorkup,
  resolveSendInspector,
  revealOnRemoval,
  runDiagnosticTest,
  saleRevealLineFor,
  sendInspectorGateReason,
  sheetGuideValueYen,
  worstRemainingBandFor,
} from '../src/diagnosis'
import { marketValueYen } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { valuateCarForBuyer } from '../src/valuation'
import { buildCarInstance, mintCarParts } from './testFixtures'

const MODEL = CARS[0]!

/** A minimal, hand-computable one-symptom two-cause fixture: 50/50 weights
 * so the expected value is a plain average, not a real-content weighted
 * split - decouples this test from any future content retune. Carries one
 * real test (`test-diagnostic`, a clean 1-vs-1 partition) so the
 * verb-gating tests below don't have to depend on real content's own
 * partitions. */
const TEST_SYMPTOM: Symptom = {
  id: 'test-symptom',
  cardLine: 'Test symptom.',
  causes: [
    {
      id: 'cause-mild',
      carPartId: 'headValvetrain',
      setBand: 'worn',
      weight: 50,
    },
    {
      id: 'cause-severe',
      carPartId: 'headValvetrain',
      setBand: 'poor',
      weight: 50,
    },
  ],
  tests: [
    {
      testId: 'test-diagnostic',
      partition: [['cause-mild'], ['cause-severe']],
      resultCopy: ['Points at the mild cause.', 'Points at the severe cause.'],
    },
  ],
}

/** A second fixture symptom whose three causes target THREE different
 * parts - `TEST_SYMPTOM` above can't exercise `revealOnRemoval`'s "the
 * removed part isn't the true cause's own target" branch or
 * `displayedBandFor`'s "resolved for THIS part while other causes remain
 * open" case, since both its causes share one part. */
const MULTI_PART_SYMPTOM: Symptom = {
  id: 'multi-part-symptom',
  cardLine: 'Multi-part test symptom.',
  causes: [
    { id: 'cause-a', carPartId: 'headValvetrain', setBand: 'worn', weight: 40 },
    { id: 'cause-b', carPartId: 'internals', setBand: 'poor', weight: 30 },
    { id: 'cause-c', carPartId: 'intake', setBand: 'poor', weight: 30 },
  ],
  tests: [],
}

/** A two-test symptom exercising the `unlockedBy` chain -
 * `routed-locked-test` is offered only once `routed-root-test` has run AND
 * resolved to partition group 0 (`routed-cause-a`); it stays locked
 * forever against a car whose true cause resolves the root to group 1. */
const ROUTED_SYMPTOM: Symptom = {
  id: 'routed-symptom',
  cardLine: 'Routed test symptom.',
  causes: [
    { id: 'routed-cause-a', carPartId: 'headValvetrain', setBand: 'worn', weight: 50 },
    { id: 'routed-cause-b', carPartId: 'headValvetrain', setBand: 'poor', weight: 50 },
  ],
  tests: [
    {
      testId: 'routed-root-test',
      partition: [['routed-cause-a'], ['routed-cause-b']],
      resultCopy: ['Points at cause A.', 'Points at cause B.'],
    },
    {
      testId: 'routed-locked-test',
      partition: [['routed-cause-a'], ['routed-cause-b']],
      resultCopy: ['Confirms cause A.', 'Confirms cause B.'],
      unlockedBy: { testId: 'routed-root-test', group: 0 },
    },
  ],
}

/** A symptom whose `unlockedBy` carries no `group` - `groupless-child-test`
 * is offered once `groupless-root-test` has run at all, whichever
 * partition group it resolved to (this is how a whole board of follow-up
 * tests opens after a first look, rather than one branch of it). */
const ROUTED_GROUPLESS_SYMPTOM: Symptom = {
  id: 'routed-groupless-symptom',
  cardLine: 'Routed groupless test symptom.',
  causes: [
    { id: 'groupless-cause-a', carPartId: 'headValvetrain', setBand: 'worn', weight: 50 },
    { id: 'groupless-cause-b', carPartId: 'headValvetrain', setBand: 'poor', weight: 50 },
  ],
  tests: [
    {
      testId: 'groupless-root-test',
      partition: [['groupless-cause-a'], ['groupless-cause-b']],
      resultCopy: ['Points at cause A.', 'Points at cause B.'],
    },
    {
      testId: 'groupless-child-test',
      partition: [['groupless-cause-a'], ['groupless-cause-b']],
      resultCopy: ['Confirms cause A.', 'Confirms cause B.'],
      unlockedBy: { testId: 'groupless-root-test' },
    },
  ],
}

/** Cure-on-repair: a two-cause symptom, both causes on `clutch` - the
 * haunted-Carina fixture, narrowed to one remaining cause the same way a
 * workup or a test would leave it. */
const CLUTCH_SYMPTOM: Symptom = {
  id: 'clutch-test-symptom',
  cardLine: 'Clutch test symptom.',
  causes: [
    { id: 'clutch-cause-mild', carPartId: 'clutch', setBand: 'worn', weight: 50 },
    { id: 'clutch-cause-severe', carPartId: 'clutch', setBand: 'poor', weight: 50 },
  ],
  tests: [],
}

/** Four causes on four different parts, all still live - the partial-prune
 * fixture (repairing one part past its own cause's claim must lose exactly
 * that cause, leaving the other three untouched). */
const FOUR_CAUSE_SYMPTOM: Symptom = {
  id: 'four-cause-symptom',
  cardLine: 'Four cause test symptom.',
  causes: [
    { id: 'four-cause-1', carPartId: 'headValvetrain', setBand: 'poor', weight: 25 },
    { id: 'four-cause-2', carPartId: 'internals', setBand: 'poor', weight: 25 },
    { id: 'four-cause-3', carPartId: 'intake', setBand: 'poor', weight: 25 },
    { id: 'four-cause-4', carPartId: 'exhaust', setBand: 'poor', weight: 25 },
  ],
  tests: [],
}

/**
 * A two-step routed board (`send-inspector` fixture): the root splits four
 * causes into a head group and a block group, each with its own follow-up
 * test that finishes the job - the reading policy's own cheapest route to
 * ANY true cause is root (10m) then the matching follow-up (10m), 20m
 * total, exactly what `resolveSendInspector`'s own parity/minutes/budget
 * probes below need a real multi-step walk to check against.
 */
const INSPECTOR_SYMPTOM: Symptom = {
  id: 'inspector-test-symptom',
  cardLine: 'Inspector test symptom.',
  causes: [
    { id: 'insp-cause-a', carPartId: 'headValvetrain', setBand: 'worn', weight: 25 },
    { id: 'insp-cause-b', carPartId: 'headValvetrain', setBand: 'poor', weight: 25 },
    { id: 'insp-cause-c', carPartId: 'internals', setBand: 'worn', weight: 25 },
    { id: 'insp-cause-d', carPartId: 'internals', setBand: 'poor', weight: 25 },
  ],
  tests: [
    {
      testId: 'insp-root-test',
      partition: [
        ['insp-cause-a', 'insp-cause-b'],
        ['insp-cause-c', 'insp-cause-d'],
      ],
      resultCopy: ['Points at the head.', 'Points at the block.'],
    },
    {
      testId: 'insp-head-test',
      partition: [['insp-cause-a'], ['insp-cause-b']],
      resultCopy: ['Confirms the mild head cause.', 'Confirms the severe head cause.'],
      unlockedBy: { testId: 'insp-root-test', group: 0 },
    },
    {
      testId: 'insp-block-test',
      partition: [['insp-cause-c'], ['insp-cause-d']],
      resultCopy: ['Confirms the mild block cause.', 'Confirms the severe block cause.'],
      unlockedBy: { testId: 'insp-root-test', group: 1 },
    },
  ],
}

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    TEST_SYMPTOM,
    MULTI_PART_SYMPTOM,
    ROUTED_SYMPTOM,
    ROUTED_GROUPLESS_SYMPTOM,
    CLUTCH_SYMPTOM,
    FOUR_CAUSE_SYMPTOM,
    INSPECTOR_SYMPTOM,
  ],
  [
    { id: 'test-diagnostic', minutes: 15 },
    { id: 'routed-root-test', minutes: 10 },
    { id: 'routed-locked-test', minutes: 10 },
    { id: 'groupless-root-test', minutes: 10 },
    { id: 'groupless-child-test', minutes: 10 },
    { id: 'insp-root-test', minutes: 10 },
    { id: 'insp-head-test', minutes: 10 },
    { id: 'insp-block-test', minutes: 10 },
  ],
)

const STATE = createInitialGameState(CONTEXT, 1)

/** A car whose true headValvetrain band (`worn`, the mild cause's own
 * `setBand`) is genuinely worse than its recorded apparent band (`mint`) -
 * matching real generation's own invariant (true is always the WORSE of
 * the two). */
function carWithSymptom(): CarInstance {
  return {
    ...buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ headValvetrain: 'worn' }),
    }),
    symptoms: [
      {
        symptomId: 'test-symptom',
        trueCauseId: 'cause-mild',
        remainingCauseIds: ['cause-mild', 'cause-severe'],
        runTestIds: [],
      },
    ],
    apparentBandByPartId: { headValvetrain: 'mint' },
  }
}

/** A car carrying `MULTI_PART_SYMPTOM`, its true bands set to each cause's
 * own claim (matching real generation's "true is the worse of apparent and
 * the rolled cause" rule) - `trueCauseId`/`remainingCauseIds` vary per test. */
function carWithMultiPartSymptom(trueCauseId: string, remainingCauseIds: string[]): CarInstance {
  return {
    ...buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ headValvetrain: 'worn', internals: 'poor', intake: 'poor' }),
    }),
    symptoms: [{ symptomId: 'multi-part-symptom', trueCauseId, remainingCauseIds, runTestIds: [] }],
    apparentBandByPartId: { headValvetrain: 'mint', internals: 'mint', intake: 'mint' },
  }
}

/** A car carrying `ROUTED_SYMPTOM` - `trueCauseId` and `runTestIds` vary
 * per test to exercise `availableTestIdsFor`'s and `runDiagnosticTest`'s
 * own locked/unlocked gating. */
function carWithRoutedSymptom(trueCauseId: string, runTestIds: string[] = []): CarInstance {
  return {
    ...buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ headValvetrain: 'worn' }),
    }),
    symptoms: [
      {
        symptomId: 'routed-symptom',
        trueCauseId,
        remainingCauseIds: ['routed-cause-a', 'routed-cause-b'],
        runTestIds,
      },
    ],
    apparentBandByPartId: { headValvetrain: 'mint' },
  }
}

/** A car carrying `ROUTED_GROUPLESS_SYMPTOM` - `trueCauseId` and
 * `runTestIds` vary per test to exercise `availableTestIdsFor`'s and
 * `runDiagnosticTest`'s own group-less unlock gating. */
function carWithGrouplessRoutedSymptom(
  trueCauseId: string,
  runTestIds: string[] = [],
): CarInstance {
  return {
    ...buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ headValvetrain: 'worn' }),
    }),
    symptoms: [
      {
        symptomId: 'routed-groupless-symptom',
        trueCauseId,
        remainingCauseIds: ['groupless-cause-a', 'groupless-cause-b'],
        runTestIds,
      },
    ],
    apparentBandByPartId: { headValvetrain: 'mint' },
  }
}

/** A car carrying `INSPECTOR_SYMPTOM` (send-inspector fixture) - `trueCauseId`
 * varies per test; a second, single-test symptom (`TEST_SYMPTOM`'s own shape)
 * joins when `withSecondSymptom` is set, so a walk can be checked moving on
 * to a second symptom once the first resolves. */
function carWithInspectorSymptom(trueCauseId: string, withSecondSymptom = false): CarInstance {
  const symptoms: CarInstance['symptoms'] = [
    {
      symptomId: 'inspector-test-symptom',
      trueCauseId,
      remainingCauseIds: INSPECTOR_SYMPTOM.causes.map((c) => c.id),
      runTestIds: [],
    },
  ]
  if (withSecondSymptom) {
    symptoms.push({
      symptomId: 'test-symptom',
      trueCauseId: 'cause-mild',
      remainingCauseIds: ['cause-mild', 'cause-severe'],
      runTestIds: [],
    })
  }
  return { ...buildCarInstance({ modelId: MODEL.id }), symptoms }
}

/** A benched `master-inspector` - `resolveSendInspector`'s own gate (a) and
 * every probe below that needs one hired and on the bench. */
function masterInspectorStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'inspector-1',
    displayName: 'Rie',
    stats: { engine: 1, chassis: 1, body: 1 },
    laborSlotsPerDay: 1,
    assignment: 'bench',
    pendingAssignment: null,
    weeklyWageYen: 5000,
    trait: 'master-inspector',
    ...overrides,
  }
}

/** A minimal `AuctionLot` at `local-yard` wrapping `car` - the fixture
 * every verb test needs to reach `state.activeAuctionLots`. */
function buildLot(car: CarInstance, tier: AuctionLot['tier'] = 'local-yard'): AuctionLot {
  return {
    id: 'lot-diag-test',
    tier,
    modelId: MODEL.id,
    car,
    bookValueYen: MODEL.bookValueYen,
    expiresOnDay: 8,
    turnout: 'steady',
  }
}

/** A fresh initial `GameState` (real starting cash/labour) with `car` listed
 * as the sole active lot - the common starting point for the visit/test
 * verb tests below. */
function stateWithLot(
  car: CarInstance,
  context: ReturnType<typeof buildSimContext> = CONTEXT,
  tier: AuctionLot['tier'] = 'local-yard',
): GameState {
  return { ...createInitialGameState(context, 1), activeAuctionLots: [buildLot(car, tier)] }
}

describe('apparentViewOf (Sprint 73 decision 3)', () => {
  it('returns the same car, unchanged, for an honest car (no symptoms)', () => {
    const honest = buildCarInstance({ modelId: MODEL.id })
    expect(apparentViewOf(honest)).toBe(honest)
  })

  it('swaps a damaged part back to its recorded apparent band, without mutating the original car or touching any other part', () => {
    const car = carWithSymptom()
    // The TRUE band (currently installed) is worse than the apparent one -
    // exactly what a symptom's cause does at generation time.
    const damaged: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        headValvetrain: { installed: { ...car.parts.headValvetrain.installed!, band: 'poor' } },
      },
    }
    const view = apparentViewOf(damaged)
    expect(view.parts.headValvetrain.installed?.band).toBe('mint')
    expect(damaged.parts.headValvetrain.installed?.band).toBe('poor') // original untouched
    expect(view.parts.dampers).toEqual(damaged.parts.dampers) // every other part unchanged
  })
})

describe('expectedTrueValueYen / sheetGuideValueYen (Sprint 73 decision 3)', () => {
  it('an honest car: expectedTrueValueYen and sheetGuideValueYen both equal marketValueYen exactly', () => {
    const honest = buildCarInstance({ modelId: MODEL.id })
    const direct = marketValueYen(
      MODEL,
      honest,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    expect(expectedTrueValueYen(honest, MODEL, STATE, CONTEXT)).toBe(direct)
    expect(sheetGuideValueYen(honest, MODEL, STATE, CONTEXT)).toBe(direct)
  })

  it('a symptomatic car: expectedTrueValueYen matches a manual 50/50 weighted mean over the two causes', () => {
    const car = carWithSymptom()
    const apparent = apparentViewOf(car)
    const mildView: CarInstance = {
      ...apparent,
      parts: {
        ...apparent.parts,
        headValvetrain: {
          installed: { ...apparent.parts.headValvetrain.installed!, band: 'worn' },
        },
      },
    }
    const severeView: CarInstance = {
      ...apparent,
      parts: {
        ...apparent.parts,
        headValvetrain: {
          installed: { ...apparent.parts.headValvetrain.installed!, band: 'poor' },
        },
      },
    }
    const mildValue = marketValueYen(
      MODEL,
      mildView,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const severeValue = marketValueYen(
      MODEL,
      severeView,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const manualWeightedMean = 0.5 * mildValue + 0.5 * severeValue

    expect(expectedTrueValueYen(car, MODEL, STATE, CONTEXT)).toBe(manualWeightedMean)
  })

  it('sheetGuideValueYen equals expectedTrueValueYen exactly - the room prices the odds, with no premium on top', () => {
    const car = carWithSymptom()
    const apparent = apparentViewOf(car)
    const apparentValue = marketValueYen(
      MODEL,
      apparent,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const expectedTrueValue = expectedTrueValueYen(car, MODEL, STATE, CONTEXT)

    expect(sheetGuideValueYen(car, MODEL, STATE, CONTEXT)).toBe(expectedTrueValue)
    // The cause-weighted expectation itself carries the fear: while any
    // cause claims real damage, the sheet sits strictly below the
    // apparent-condition value.
    expect(expectedTrueValue).toBeLessThan(apparentValue)
  })
})

describe('rival blindness (Sprint 73 decision 3): rivals never read trueCauseId or remainingCauseIds', () => {
  it('anchorValueYen and privateValuationYen are byte-identical whether remainingCauseIds is the full list or already narrowed to one', () => {
    const wide = carWithSymptom()
    const narrowed: CarInstance = {
      ...wide,
      symptoms: [{ ...wide.symptoms[0]!, remainingCauseIds: ['cause-mild'] }],
    }
    const lotFor = (car: CarInstance) => ({
      id: 'lot-test',
      tier: 'local-yard' as const,
      modelId: MODEL.id,
      car,
      bookValueYen: MODEL.bookValueYen,
      expiresOnDay: 8,
      turnout: 'steady' as const,
    })

    expect(anchorValueYen(lotFor(narrowed), STATE, CONTEXT)).toBe(
      anchorValueYen(lotFor(wide), STATE, CONTEXT),
    )
    expect(privateValuationYen(lotFor(narrowed), STATE, CONTEXT, 1)).toBe(
      privateValuationYen(lotFor(wide), STATE, CONTEXT, 1),
    )
  })
})

describe('sale-side blindness (Sprint 73 decision 8): a sale always prices the true car, never the apparent one', () => {
  it("valuateCarForBuyer reads the car's own true marketValueYen directly - no apparentViewOf, no fear discount, even on a car carrying a symptom", () => {
    const car = carWithSymptom()
    const buyer = CONTEXT.buyers[0]!
    const expectedValue = marketValueYen(
      MODEL,
      car, // the TRUE car - buyers never see an apparent view
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const value = valuateCarForBuyer(
      buyer,
      MODEL,
      car,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.partsTaxonomyById,
      100,
      CONTEXT.economy,
    )
    // tasteMultiplier is buyer-specific, so compare the ratio rather than
    // asserting equality outright - the point is that the car-value half of
    // the formula is the TRUE marketValueYen, not the apparent/fear-priced
    // one this test's other describe blocks compute for the SAME car.
    const apparentValue = marketValueYen(
      MODEL,
      apparentViewOf(car),
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const sheetValue = sheetGuideValueYen(car, MODEL, STATE, CONTEXT)
    expect(expectedValue).not.toBe(apparentValue)
    expect(expectedValue).not.toBe(sheetValue)
    // The true car's own headValvetrain sits at 'worn' (this fixture's
    // trueCauseId), strictly worse than its recorded 'mint' apparent band -
    // so the true value is strictly below both the apparent and sheet reads.
    expect(expectedValue).toBeLessThan(apparentValue)
    expect(value).toBeGreaterThan(0)
  })
})

describe('beginInspectionVisit / inspectionVisitGateReason (Sprint 74 decision 1)', () => {
  it('refuses no-lots when no lot is live at the requested tier - the gate reason matches', () => {
    // createInitialGameState seeds a real starter board, so this has to
    // clear it explicitly rather than assume day 1 starts empty.
    const state: GameState = { ...createInitialGameState(CONTEXT, 1), activeAuctionLots: [] }
    expect(inspectionVisitGateReason(state, 'local-yard', CONTEXT)).toBe('no-lots')
    const result = beginInspectionVisit(state, 'local-yard', CONTEXT)
    expect(result.outcome).toBe('no-lots')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('refuses no-cash when cashYen is below the tier travel fee - the gate reason matches', () => {
    const state = { ...stateWithLot(carWithSymptom()), cashYen: 0 }
    expect(inspectionVisitGateReason(state, 'local-yard', CONTEXT)).toBe('no-cash')
    expect(beginInspectionVisit(state, 'local-yard', CONTEXT).outcome).toBe('no-cash')
  })

  it('refuses no-labor-slot when no free labour slot remains today - the gate reason matches', () => {
    const state = { ...stateWithLot(carWithSymptom()), energySpentToday: 999 }
    expect(inspectionVisitGateReason(state, 'local-yard', CONTEXT)).toBe('no-labor-slot')
    expect(beginInspectionVisit(state, 'local-yard', CONTEXT).outcome).toBe('no-labor-slot')
  })

  it('starts cleanly when nothing blocks it: spends the fee and one labour slot, sets minutesLeft to the full visitMinutes, logs inspection-visit', () => {
    const state = stateWithLot(carWithSymptom())
    expect(inspectionVisitGateReason(state, 'local-yard', CONTEXT)).toBeNull()
    const feeYen = CONTEXT.economy.diagnosis.travelFeeYenByTier['local-yard']
    const minutesGranted = CONTEXT.economy.diagnosis.visitMinutes
    const result = beginInspectionVisit(state, 'local-yard', CONTEXT)
    expect(result.outcome).toBe('started')
    expect(result.state.cashYen).toBe(state.cashYen - feeYen)
    expect(result.state.energySpentToday).toBe(
      state.energySpentToday + CONTEXT.economy.energy.pointsPerLabour,
    )
    expect(result.state.inspectionVisit).toEqual({
      tier: 'local-yard',
      minutesLeft: minutesGranted,
    })
    expect(result.log).toEqual([
      { type: 'inspection-visit', tier: 'local-yard', feeYen, minutesGranted },
    ])
  })

  it('grants a benched auction-rat extra Local Yard minutes (Sprint 82 decision 4): only that tier, only from the bench, no stacking', () => {
    const car = carWithSymptom()
    const base = stateWithLot(car)
    const rat: StaffMember = {
      id: 'rat',
      displayName: 'Kenji',
      stats: { engine: 1, chassis: 1, body: 1 },
      laborSlotsPerDay: 1,
      assignment: 'bench',
      pendingAssignment: null,
      weeklyWageYen: 4000,
      trait: 'auction-rat',
    }
    const baseMinutes = CONTEXT.economy.diagnosis.visitMinutes
    const bonus = CONTEXT.economy.staff.auctionRatExtraMinutes
    const feeYen = CONTEXT.economy.diagnosis.travelFeeYenByTier['local-yard']

    // Benched rat at the Local Yard: base + bonus, echoed in the log.
    const withRat = beginInspectionVisit({ ...base, staff: [rat] }, 'local-yard', CONTEXT)
    expect(withRat.state.inspectionVisit).toEqual({
      tier: 'local-yard',
      minutesLeft: baseMinutes + bonus,
    })
    expect(withRat.log).toEqual([
      { type: 'inspection-visit', tier: 'local-yard', feeYen, minutesGranted: baseMinutes + bonus },
    ])

    // Two benched rats add no more than one (no stacking).
    const twoRats = beginInspectionVisit(
      { ...base, staff: [rat, { ...rat, id: 'rat2' }] },
      'local-yard',
      CONTEXT,
    )
    expect(twoRats.state.inspectionVisit).toEqual({
      tier: 'local-yard',
      minutesLeft: baseMinutes + bonus,
    })

    // A contracted rat is busy elsewhere: no bonus.
    const contracted = beginInspectionVisit(
      { ...base, staff: [{ ...rat, assignment: 'contract' as const }] },
      'local-yard',
      CONTEXT,
    )
    expect(contracted.state.inspectionVisit).toEqual({
      tier: 'local-yard',
      minutesLeft: baseMinutes,
    })

    // A higher tier gets no bonus even with the rat benched.
    const regional = beginInspectionVisit(
      {
        ...base,
        staff: [rat],
        activeAuctionLots: [...base.activeAuctionLots, buildLot(car, 'regional')],
      },
      'regional',
      CONTEXT,
    )
    expect(regional.state.inspectionVisit).toEqual({
      tier: 'regional',
      minutesLeft: baseMinutes,
    })
  })

  it('replaces an already-active visit at a different tier, forfeiting its remaining minutes (decision 1: never refuses this)', () => {
    const car = carWithSymptom()
    const base = stateWithLot(car)
    const midway: GameState = {
      ...base,
      inspectionVisit: { tier: 'local-yard', minutesLeft: 10 },
      activeAuctionLots: [...base.activeAuctionLots, buildLot(car, 'regional')],
    }
    const replaced = beginInspectionVisit(midway, 'regional', CONTEXT)
    expect(replaced.outcome).toBe('started')
    expect(replaced.state.inspectionVisit).toEqual({
      tier: 'regional',
      minutesLeft: CONTEXT.economy.diagnosis.visitMinutes,
    })
  })
})

describe('runDiagnosticTest (Sprint 74 decision 2): gating and minutes accounting', () => {
  it('refuses no-visit when no visit is active', () => {
    const result = runDiagnosticTest(
      stateWithLot(carWithSymptom()),
      'lot-diag-test',
      0,
      'test-diagnostic',
      CONTEXT,
    )
    expect(result.outcome).toBe('no-visit')
    expect(result.resultCopy).toBeNull()
  })

  it('refuses wrong-tier when the active visit is at a different tier than the lot', () => {
    const state: GameState = {
      ...stateWithLot(carWithSymptom()),
      inspectionVisit: { tier: 'regional', minutesLeft: 60 },
    }
    expect(runDiagnosticTest(state, 'lot-diag-test', 0, 'test-diagnostic', CONTEXT).outcome).toBe(
      'wrong-tier',
    )
  })

  it('refuses not-found for an unknown lotId or a symptomIndex the car does not carry', () => {
    const state: GameState = {
      ...stateWithLot(carWithSymptom()),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    expect(runDiagnosticTest(state, 'no-such-lot', 0, 'test-diagnostic', CONTEXT).outcome).toBe(
      'not-found',
    )
    expect(runDiagnosticTest(state, 'lot-diag-test', 5, 'test-diagnostic', CONTEXT).outcome).toBe(
      'not-found',
    )
  })

  it('refuses test-not-applicable for a real test id this symptom does not offer', () => {
    const state: GameState = {
      ...stateWithLot(carWithSymptom()),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    // 'compression-test' is real content but not registered on TEST_SYMPTOM.
    expect(runDiagnosticTest(state, 'lot-diag-test', 0, 'compression-test', CONTEXT).outcome).toBe(
      'test-not-applicable',
    )
  })

  it('refuses already-run on a repeat call against the same symptom instance', () => {
    const state: GameState = {
      ...stateWithLot(carWithSymptom()),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const first = runDiagnosticTest(state, 'lot-diag-test', 0, 'test-diagnostic', CONTEXT)
    expect(first.outcome).toBe('ran')
    expect(
      runDiagnosticTest(first.state, 'lot-diag-test', 0, 'test-diagnostic', CONTEXT).outcome,
    ).toBe('already-run')
  })

  it('refuses not-enough-minutes when the visit has fewer minutes left than the test costs', () => {
    const state: GameState = {
      ...stateWithLot(carWithSymptom()),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 5 }, // test-diagnostic costs 15
    }
    expect(runDiagnosticTest(state, 'lot-diag-test', 0, 'test-diagnostic', CONTEXT).outcome).toBe(
      'not-enough-minutes',
    )
  })

  it('on a legal run: decrements minutesLeft by exactly the test cost, appends the testId to runTestIds, narrows remainingCauseIds to the partition group containing trueCauseId, and never writes a day-log entry', () => {
    const state: GameState = {
      ...stateWithLot(carWithSymptom()), // trueCauseId: 'cause-mild'
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const result = runDiagnosticTest(state, 'lot-diag-test', 0, 'test-diagnostic', CONTEXT)
    expect(result.outcome).toBe('ran')
    expect(result.state.inspectionVisit?.minutesLeft).toBe(45)
    const updatedSymptom = result.state.activeAuctionLots[0]!.car.symptoms[0]!
    expect(updatedSymptom.runTestIds).toEqual(['test-diagnostic'])
    expect(updatedSymptom.remainingCauseIds).toEqual(['cause-mild'])
    expect(result.resultCopy).toBe('Points at the mild cause.')
    expect(result.log).toEqual([])
  })
})

describe('sendInspectorGateReason / resolveSendInspector (Sprint 116, the master inspector)', () => {
  it('refuses not-found for an unknown lotId', () => {
    const state: GameState = {
      ...stateWithLot(carWithInspectorSymptom('insp-cause-a')),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    expect(sendInspectorGateReason(state, 'no-such-lot', CONTEXT)).toBe('not-found')
    const result = resolveSendInspector(state, 'no-such-lot', CONTEXT)
    expect(result.outcome).toBe('not-found')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('refuses no-inspector when no benched master-inspector is on staff - empty roster or one on contract alike', () => {
    const base = stateWithLot(carWithInspectorSymptom('insp-cause-a'))
    const noStaff: GameState = { ...base, inspectionVisit: { tier: 'local-yard', minutesLeft: 60 } }
    expect(sendInspectorGateReason(noStaff, 'lot-diag-test', CONTEXT)).toBe('no-inspector')
    expect(resolveSendInspector(noStaff, 'lot-diag-test', CONTEXT).outcome).toBe('no-inspector')

    const contracted: GameState = {
      ...noStaff,
      staff: [masterInspectorStaff({ assignment: 'contract' })],
    }
    expect(sendInspectorGateReason(contracted, 'lot-diag-test', CONTEXT)).toBe('no-inspector')
  })

  it('refuses no-visit when no visit is active, even with a benched inspector', () => {
    const state = stateWithLot(carWithInspectorSymptom('insp-cause-a'))
    const withInspector: GameState = { ...state, staff: [masterInspectorStaff()] }
    expect(sendInspectorGateReason(withInspector, 'lot-diag-test', CONTEXT)).toBe('no-visit')
    expect(resolveSendInspector(withInspector, 'lot-diag-test', CONTEXT).outcome).toBe('no-visit')
  })

  it('refuses wrong-tier when the active visit is at a different tier than the lot', () => {
    const state: GameState = {
      ...stateWithLot(carWithInspectorSymptom('insp-cause-a')),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'regional', minutesLeft: 60 },
    }
    expect(sendInspectorGateReason(state, 'lot-diag-test', CONTEXT)).toBe('wrong-tier')
    expect(resolveSendInspector(state, 'lot-diag-test', CONTEXT).outcome).toBe('wrong-tier')
  })

  it('refuses no-symptoms for an honest lot (no symptoms) even with an inspector and a matching visit', () => {
    const honest = buildCarInstance({ modelId: MODEL.id })
    const state: GameState = {
      ...stateWithLot(honest),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    expect(sendInspectorGateReason(state, 'lot-diag-test', CONTEXT)).toBe('no-symptoms')
    expect(resolveSendInspector(state, 'lot-diag-test', CONTEXT).outcome).toBe('no-symptoms')
  })

  it('refuses already-resolved once every symptom is already narrowed to one remaining cause', () => {
    const car = carWithInspectorSymptom('insp-cause-a')
    const resolved: CarInstance = {
      ...car,
      symptoms: [{ ...car.symptoms[0]!, remainingCauseIds: ['insp-cause-a'] }],
    }
    const state: GameState = {
      ...stateWithLot(resolved),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    expect(sendInspectorGateReason(state, 'lot-diag-test', CONTEXT)).toBe('already-resolved')
    expect(resolveSendInspector(state, 'lot-diag-test', CONTEXT).outcome).toBe('already-resolved')
  })

  it('refuses not-enough-minutes when the visit clock cannot cover even the first test the walk would run', () => {
    const state: GameState = {
      ...stateWithLot(carWithInspectorSymptom('insp-cause-a')),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 5 }, // insp-root-test costs 10
    }
    expect(sendInspectorGateReason(state, 'lot-diag-test', CONTEXT)).toBe('not-enough-minutes')
    const result = resolveSendInspector(state, 'lot-diag-test', CONTEXT)
    expect(result.outcome).toBe('not-enough-minutes')
    expect(result.state).toBe(state)
  })

  it('passes (null) once every gate clears: a benched inspector, a matching visit, an unresolved symptom, and enough minutes', () => {
    const state: GameState = {
      ...stateWithLot(carWithInspectorSymptom('insp-cause-a')),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    expect(sendInspectorGateReason(state, 'lot-diag-test', CONTEXT)).toBeNull()
  })

  it("parity: the resolver's own route through a fresh symptom equals the extracted walker's route, step for step", () => {
    const car = carWithInspectorSymptom('insp-cause-b') // root (group 0) then insp-head-test
    const state: GameState = {
      ...stateWithLot(car),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }

    // Independently replay the same walker the resolver itself calls -
    // `bestNextTestId` - against the fresh symptom, narrowing by hand the
    // same way `runDiagnosticTest` would, to build the route it predicts.
    let walkerSymptom = car.symptoms[0]!
    const walkerRoute: string[] = []
    for (;;) {
      const nextTestId = bestNextTestId(walkerSymptom, INSPECTOR_SYMPTOM, CONTEXT)
      if (!nextTestId) break
      walkerRoute.push(nextTestId)
      const testApplication = INSPECTOR_SYMPTOM.tests.find((t) => t.testId === nextTestId)!
      const group = testApplication.partition.find((g) => g.includes(walkerSymptom.trueCauseId))!
      walkerSymptom = {
        ...walkerSymptom,
        remainingCauseIds: walkerSymptom.remainingCauseIds.filter((id) => group.includes(id)),
        runTestIds: [...walkerSymptom.runTestIds, nextTestId],
      }
    }
    expect(walkerRoute).toEqual(['insp-root-test', 'insp-head-test'])

    const result = resolveSendInspector(state, 'lot-diag-test', CONTEXT)
    expect(result.outcome).toBe('done')
    const resolvedSymptom = result.state.activeAuctionLots[0]!.car.symptoms[0]!
    expect(resolvedSymptom.runTestIds).toEqual(walkerRoute)
    expect(resolvedSymptom.remainingCauseIds).toEqual(['insp-cause-b'])
  })

  it('minutes accounting: charges exactly the sum of every test actually run, across a second symptom too, and never touches cash or a day-log entry', () => {
    const car = carWithInspectorSymptom('insp-cause-c', true) // + TEST_SYMPTOM, trueCauseId cause-mild
    const state: GameState = {
      ...stateWithLot(car),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const cashBefore = state.cashYen

    const result = resolveSendInspector(state, 'lot-diag-test', CONTEXT)
    expect(result.outcome).toBe('done')
    // insp-root-test (10) + insp-block-test (10) resolves the first symptom;
    // test-diagnostic (15) resolves the second - 35 minutes total.
    expect(result.state.inspectionVisit?.minutesLeft).toBe(60 - 35)
    expect(result.state.cashYen).toBe(cashBefore)
    expect(result.log).toEqual([])

    const symptoms = result.state.activeAuctionLots[0]!.car.symptoms
    expect(symptoms[0]!.runTestIds).toEqual(['insp-root-test', 'insp-block-test'])
    expect(symptoms[0]!.remainingCauseIds).toEqual(['insp-cause-c'])
    expect(symptoms[1]!.runTestIds).toEqual(['test-diagnostic'])
    expect(symptoms[1]!.remainingCauseIds).toEqual(['cause-mild'])
  })

  it('budget exhaustion is honest: stops the instant the next test does not fit, leaving a partial trail and no free narrowing', () => {
    const car = carWithInspectorSymptom('insp-cause-b')
    const state: GameState = {
      ...stateWithLot(car),
      staff: [masterInspectorStaff()],
      // Covers insp-root-test (10) but not the insp-head-test (10) that
      // would follow it - 15 - 10 = 5, short of the second test's own cost.
      inspectionVisit: { tier: 'local-yard', minutesLeft: 15 },
    }

    const result = resolveSendInspector(state, 'lot-diag-test', CONTEXT)
    expect(result.outcome).toBe('done')
    expect(result.state.inspectionVisit?.minutesLeft).toBe(5)
    const symptom = result.state.activeAuctionLots[0]!.car.symptoms[0]!
    // Only the root ran - the head/block split is real information (down
    // from 4 candidates to 2), but the mild/severe split within it never
    // ran, so both group-0 causes are still standing: no test beyond what
    // was actually paid for ever narrows anything.
    expect(symptom.runTestIds).toEqual(['insp-root-test'])
    expect([...symptom.remainingCauseIds].sort()).toEqual(['insp-cause-a', 'insp-cause-b'])
  })

  it('determinism: the same lot and the same starting state always produce the same route and the same resulting state', () => {
    const car = carWithInspectorSymptom('insp-cause-d', true)
    const state: GameState = {
      ...stateWithLot(car),
      staff: [masterInspectorStaff()],
      inspectionVisit: { tier: 'local-yard', minutesLeft: 25 },
    }
    const first = resolveSendInspector(state, 'lot-diag-test', CONTEXT)
    const second = resolveSendInspector(state, 'lot-diag-test', CONTEXT)
    expect(second.outcome).toBe(first.outcome)
    expect(second.state).toEqual(first.state)
  })
})

describe('availableTestIdsFor (Sprint 106, routed diagnosis)', () => {
  it('a symptom with only root tests offers every test from the start, exactly as before the routing rework', () => {
    const carSymptom = carWithSymptom().symptoms[0]!
    expect(availableTestIdsFor(carSymptom, TEST_SYMPTOM)).toEqual(['test-diagnostic'])
  })

  it('a locked test is unavailable before its parent has run, even though the root is always offered', () => {
    const carSymptom = carWithRoutedSymptom('routed-cause-a').symptoms[0]!
    expect(availableTestIdsFor(carSymptom, ROUTED_SYMPTOM)).toEqual(['routed-root-test'])
  })

  it('the locked test becomes available once the root has run AND resolved to its own unlockedBy group', () => {
    // trueCauseId 'routed-cause-a' sits in partition group 0, matching
    // routed-locked-test's own unlockedBy: { testId: 'routed-root-test', group: 0 }.
    const carSymptom = carWithRoutedSymptom('routed-cause-a', ['routed-root-test']).symptoms[0]!
    expect(availableTestIdsFor(carSymptom, ROUTED_SYMPTOM)).toEqual([
      'routed-root-test',
      'routed-locked-test',
    ])
  })

  it('the locked test stays unavailable when the root resolved to the OTHER partition group', () => {
    // trueCauseId 'routed-cause-b' sits in partition group 1, which does not
    // match routed-locked-test's own unlockedBy group (0).
    const carSymptom = carWithRoutedSymptom('routed-cause-b', ['routed-root-test']).symptoms[0]!
    expect(availableTestIdsFor(carSymptom, ROUTED_SYMPTOM)).toEqual(['routed-root-test'])
  })

  it("an already-run test still counts as available - separating offered from already-run is the caller's job", () => {
    const carSymptom = carWithRoutedSymptom('routed-cause-a', [
      'routed-root-test',
      'routed-locked-test',
    ]).symptoms[0]!
    expect(availableTestIdsFor(carSymptom, ROUTED_SYMPTOM)).toEqual([
      'routed-root-test',
      'routed-locked-test',
    ])
  })

  it('a group-less locked test is unavailable before its parent has run', () => {
    const carSymptom = carWithGrouplessRoutedSymptom('groupless-cause-a').symptoms[0]!
    expect(availableTestIdsFor(carSymptom, ROUTED_GROUPLESS_SYMPTOM)).toEqual([
      'groupless-root-test',
    ])
  })

  it('a group-less locked test becomes available once the parent has run, regardless of which partition group it resolved to', () => {
    const resolvedA = carWithGrouplessRoutedSymptom('groupless-cause-a', ['groupless-root-test'])
      .symptoms[0]!
    expect(availableTestIdsFor(resolvedA, ROUTED_GROUPLESS_SYMPTOM)).toEqual([
      'groupless-root-test',
      'groupless-child-test',
    ])

    const resolvedB = carWithGrouplessRoutedSymptom('groupless-cause-b', ['groupless-root-test'])
      .symptoms[0]!
    expect(availableTestIdsFor(resolvedB, ROUTED_GROUPLESS_SYMPTOM)).toEqual([
      'groupless-root-test',
      'groupless-child-test',
    ])
  })
})

describe('runDiagnosticTest locked gate (Sprint 106, routed diagnosis)', () => {
  it('refuses locked for a test whose unlockedBy parent has not run yet, spending no minutes and leaving state unchanged', () => {
    const state: GameState = {
      ...stateWithLot(carWithRoutedSymptom('routed-cause-a')),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const result = runDiagnosticTest(state, 'lot-diag-test', 0, 'routed-locked-test', CONTEXT)
    expect(result.outcome).toBe('locked')
    expect(result.resultCopy).toBeNull()
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('refuses locked for a test whose parent resolved to the OTHER partition group, even after the parent has run', () => {
    const state: GameState = {
      ...stateWithLot(carWithRoutedSymptom('routed-cause-b', ['routed-root-test'])),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const result = runDiagnosticTest(state, 'lot-diag-test', 0, 'routed-locked-test', CONTEXT)
    expect(result.outcome).toBe('locked')
    expect(result.state).toBe(state)
  })

  it('runs cleanly once the parent has resolved to the matching group - the tree unlocks in sequence', () => {
    const state: GameState = {
      ...stateWithLot(carWithRoutedSymptom('routed-cause-a')),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const rootResult = runDiagnosticTest(state, 'lot-diag-test', 0, 'routed-root-test', CONTEXT)
    expect(rootResult.outcome).toBe('ran')
    const rootSymptom = rootResult.state.activeAuctionLots[0]!.car.symptoms[0]!
    expect(availableTestIdsFor(rootSymptom, ROUTED_SYMPTOM)).toEqual([
      'routed-root-test',
      'routed-locked-test',
    ])

    const childResult = runDiagnosticTest(
      rootResult.state,
      'lot-diag-test',
      0,
      'routed-locked-test',
      CONTEXT,
    )
    expect(childResult.outcome).toBe('ran')
    expect(childResult.resultCopy).toBe('Confirms cause A.')
    expect(childResult.state.inspectionVisit?.minutesLeft).toBe(60 - 10 - 10)
  })

  it('refuses locked for a group-less child test whose parent has not run yet, spending no minutes and leaving state unchanged', () => {
    const state: GameState = {
      ...stateWithLot(carWithGrouplessRoutedSymptom('groupless-cause-a')),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const result = runDiagnosticTest(state, 'lot-diag-test', 0, 'groupless-child-test', CONTEXT)
    expect(result.outcome).toBe('locked')
    expect(result.resultCopy).toBeNull()
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('runs a group-less child test cleanly once the parent has run, regardless of which partition group it resolved to', () => {
    // trueCauseId 'groupless-cause-b' resolves the root to partition group 1
    // - a group-specific unlockedBy would stay locked against this cause,
    // but a group-less one only cares that the parent ran at all.
    const state: GameState = {
      ...stateWithLot(carWithGrouplessRoutedSymptom('groupless-cause-b')),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 60 },
    }
    const rootResult = runDiagnosticTest(state, 'lot-diag-test', 0, 'groupless-root-test', CONTEXT)
    expect(rootResult.outcome).toBe('ran')
    expect(rootResult.resultCopy).toBe('Points at cause B.')

    const childResult = runDiagnosticTest(
      rootResult.state,
      'lot-diag-test',
      0,
      'groupless-child-test',
      CONTEXT,
    )
    expect(childResult.outcome).toBe('ran')
    expect(childResult.resultCopy).toBe('Confirms cause B.')
    expect(childResult.state.inspectionVisit?.minutesLeft).toBe(60 - 10 - 10)
  })
})

/**
 * The ordered chain of ancestor testIds (root-first) that must legally run
 * before `testApp` is offered to a real car whose true cause is
 * `trueCauseId` - empty for a root test itself. `null` when the chain is
 * inconsistent for this particular cause (some ancestor's own group never
 * matches its child's own `unlockedBy.group`), meaning a car with this true
 * cause can never unlock `testApp` at all - the cause resolved that ancestor
 * to its OTHER, short-branch group instead. A child whose own `unlockedBy`
 * carries no `group` unlocks once its parent has run at all, so the group
 * check is skipped entirely for it.
 */
function unlockChainFor(
  symptom: Symptom,
  testApp: TestApplication,
  trueCauseId: string,
): string[] | null {
  if (!testApp.unlockedBy) return []
  const parent = symptom.tests.find((t) => t.testId === testApp.unlockedBy!.testId)!
  if (testApp.unlockedBy.group !== undefined) {
    const parentGroupIndex = parent.partition.findIndex((group) => group.includes(trueCauseId))
    if (parentGroupIndex !== testApp.unlockedBy.group) return null
  }
  const parentChain = unlockChainFor(symptom, parent, trueCauseId)
  return parentChain === null ? null : [...parentChain, parent.testId]
}

describe('runDiagnosticTest partition narrowing against real content (Sprint 74 task 6): every symptom-test-cause triple', () => {
  const REAL_CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

  it('the real content actually offers symptom-test pairs to iterate (guards against a silent false pass below if content ever ships empty)', () => {
    expect(SYMPTOMS.some((s) => s.tests.length > 0)).toBe(true)
    expect(DIAGNOSTIC_TESTS.length).toBeGreaterThan(0)
  })

  function freshState(symptom: Symptom, trueCauseId: string): GameState {
    const car: CarInstance = {
      ...buildCarInstance({ modelId: MODEL.id }),
      symptoms: [
        {
          symptomId: symptom.id,
          trueCauseId,
          remainingCauseIds: symptom.causes.map((c) => c.id),
          runTestIds: [],
        },
      ],
    }
    return {
      ...stateWithLot(car, REAL_CONTEXT),
      inspectionVisit: {
        tier: 'local-yard',
        minutesLeft: REAL_CONTEXT.economy.diagnosis.visitMinutes,
      },
    }
  }

  for (const symptom of SYMPTOMS) {
    for (const testApp of symptom.tests) {
      for (const trueCause of symptom.causes) {
        const chain = unlockChainFor(symptom, testApp, trueCause.id)

        if (chain === null) {
          it(`${symptom.id} / ${testApp.testId}: trueCause=${trueCause.id} never unlocks this test, so running it directly reports locked`, () => {
            const state = freshState(symptom, trueCause.id)
            const result = runDiagnosticTest(
              state,
              'lot-diag-test',
              0,
              testApp.testId,
              REAL_CONTEXT,
            )
            expect(result.outcome).toBe('locked')
            expect(result.state).toBe(state)
          })
          continue
        }

        it(`${symptom.id} / ${testApp.testId}: trueCause=${trueCause.id} narrows to its own partition group and returns the matching result copy`, () => {
          let state = freshState(symptom, trueCause.id)
          for (const ancestorId of chain) {
            const stepResult = runDiagnosticTest(
              state,
              'lot-diag-test',
              0,
              ancestorId,
              REAL_CONTEXT,
            )
            expect(stepResult.outcome).toBe('ran')
            state = stepResult.state
          }
          const priorRemaining = state.activeAuctionLots[0]!.car.symptoms[0]!.remainingCauseIds

          const result = runDiagnosticTest(state, 'lot-diag-test', 0, testApp.testId, REAL_CONTEXT)
          expect(result.outcome).toBe('ran')
          const groupIndex = testApp.partition.findIndex((group) => group.includes(trueCause.id))
          const expectedGroup = testApp.partition[groupIndex]!
          const expectedRemaining = priorRemaining.filter((id) => expectedGroup.includes(id))
          const updatedSymptom = result.state.activeAuctionLots[0]!.car.symptoms[0]!
          expect([...updatedSymptom.remainingCauseIds].sort()).toEqual(
            [...expectedRemaining].sort(),
          )
          expect(result.resultCopy).toBe(testApp.resultCopy[groupIndex])
        })
      }
    }
  }
})

describe('resolveOwnedWorkup / ownedWorkupGateReason (Sprint 74 decision 3)', () => {
  it('refuses not-found for an unknown carInstanceId - the gate reason matches', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(ownedWorkupGateReason(state, 'no-such-car', CONTEXT)).toBe('not-found')
    expect(resolveOwnedWorkup(state, 'no-such-car', CONTEXT).outcome).toBe('not-found')
  })

  it('refuses no-symptoms for an honest owned car - the gate reason matches', () => {
    const car = buildCarInstance({ modelId: MODEL.id })
    const state: GameState = { ...createInitialGameState(CONTEXT, 1), ownedCars: [car] }
    expect(ownedWorkupGateReason(state, car.id, CONTEXT)).toBe('no-symptoms')
    expect(resolveOwnedWorkup(state, car.id, CONTEXT).outcome).toBe('no-symptoms')
  })

  it('refuses no-labor-slot when no free labour slot remains today - the gate reason matches', () => {
    const car = carWithSymptom()
    const state: GameState = {
      ...createInitialGameState(CONTEXT, 1),
      ownedCars: [car],
      energySpentToday: 999,
    }
    expect(ownedWorkupGateReason(state, car.id, CONTEXT)).toBe('no-labor-slot')
    expect(resolveOwnedWorkup(state, car.id, CONTEXT).outcome).toBe('no-labor-slot')
  })

  it('refuses already-resolved once every symptom has narrowed to a single remaining cause, even with a free labour slot available', () => {
    const resolved: CarInstance = {
      ...carWithSymptom(),
      symptoms: [{ ...carWithSymptom().symptoms[0]!, remainingCauseIds: ['cause-mild'] }],
    }
    const state: GameState = { ...createInitialGameState(CONTEXT, 1), ownedCars: [resolved] }
    expect(ownedWorkupGateReason(state, resolved.id, CONTEXT)).toBe('already-resolved')
    expect(resolveOwnedWorkup(state, resolved.id, CONTEXT).outcome).toBe('already-resolved')
  })

  it('on success: collapses every symptom straight to its own trueCauseId, spends exactly 1 labour slot with no fee, and logs car-workup', () => {
    const car = carWithSymptom()
    const state: GameState = { ...createInitialGameState(CONTEXT, 1), ownedCars: [car] }
    const result = resolveOwnedWorkup(state, car.id, CONTEXT)
    expect(result.outcome).toBe('done')
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.energySpentToday).toBe(
      state.energySpentToday + CONTEXT.economy.energy.pointsPerLabour,
    )
    expect(result.state.ownedCars[0]!.symptoms[0]!.remainingCauseIds).toEqual(['cause-mild'])
    expect(result.log).toEqual([{ type: 'car-workup', carInstanceId: car.id }])
  })
})

describe('revealOnRemoval (Sprint 74 decision 4): uninstall reveals truth', () => {
  it('is a no-op for an honest car (no symptoms)', () => {
    const car = buildCarInstance({ modelId: MODEL.id })
    const result = revealOnRemoval(car, 'headValvetrain', CONTEXT)
    expect(result.car).toBe(car)
    expect(result.revealedCauseId).toBeNull()
  })

  it('is a no-op for an already-resolved symptom (remainingCauseIds already down to one)', () => {
    const car = carWithMultiPartSymptom('cause-a', ['cause-a'])
    const result = revealOnRemoval(car, 'internals', CONTEXT)
    expect(result.revealedCauseId).toBeNull()
    expect(result.car.symptoms[0]!.remainingCauseIds).toEqual(['cause-a'])
  })

  it("reveals the true cause when the removed part IS the true cause's own target: collapses remainingCauseIds to [trueCauseId] and reports it", () => {
    const car = carWithMultiPartSymptom('cause-a', ['cause-a', 'cause-b', 'cause-c'])
    const result = revealOnRemoval(car, 'headValvetrain', CONTEXT)
    expect(result.revealedCauseId).toBe('cause-a')
    expect(result.car.symptoms[0]!.remainingCauseIds).toEqual(['cause-a'])
  })

  it('silently eliminates every remaining candidate targeting the removed part when the true cause targets something else - no reveal reported', () => {
    const car = carWithMultiPartSymptom('cause-a', ['cause-a', 'cause-b', 'cause-c'])
    // 'internals' is cause-b's own part, not the true cause's (cause-a, headValvetrain).
    const result = revealOnRemoval(car, 'internals', CONTEXT)
    expect(result.revealedCauseId).toBeNull()
    expect(result.car.symptoms[0]!.remainingCauseIds.sort()).toEqual(['cause-a', 'cause-c'])
  })
})

describe('displayedBandFor (Sprint 74 decision 5): the one display rule', () => {
  it('shows the true band for an honest car (no apparentBandByPartId at all)', () => {
    const car = buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ headValvetrain: 'worn' }),
    })
    expect(displayedBandFor(car, 'headValvetrain', CONTEXT)).toEqual({
      band: 'worn',
      uncertain: false,
    })
  })

  it('shows the true band for a part with no recorded apparent entry, even on a symptomatic car', () => {
    const car = carWithSymptom() // apparentBandByPartId only records headValvetrain
    expect(displayedBandFor(car, 'dampers', CONTEXT)).toEqual({
      band: car.parts.dampers.installed!.band,
      uncertain: false,
    })
  })

  it('shows the APPARENT band, flagged uncertain, while a still-open symptom targets this part', () => {
    const car = carWithMultiPartSymptom('cause-a', ['cause-a', 'cause-b', 'cause-c'])
    expect(displayedBandFor(car, 'headValvetrain', CONTEXT)).toEqual({
      band: 'mint',
      uncertain: true,
    })
  })

  it('shows the true band once the symptom overall has narrowed to exactly one remaining cause', () => {
    const car = carWithMultiPartSymptom('cause-a', ['cause-a'])
    expect(displayedBandFor(car, 'headValvetrain', CONTEXT)).toEqual({
      band: 'worn',
      uncertain: false,
    })
  })

  it('shows the true band once every remaining cause for THIS part has been eliminated, even while the symptom overall is still open for another part', () => {
    const car = carWithMultiPartSymptom('cause-b', ['cause-b', 'cause-c']) // headValvetrain no longer a live candidate
    expect(displayedBandFor(car, 'headValvetrain', CONTEXT)).toEqual({
      band: 'worn',
      uncertain: false,
    })
    // 'internals' (cause-b) is still a live candidate targeting it - stays uncertain.
    expect(displayedBandFor(car, 'internals', CONTEXT)).toEqual({ band: 'mint', uncertain: true })
  })
})

describe('worstRemainingBandFor (Sprint 74 decision 5)', () => {
  it('returns null when nothing remaining targets the part', () => {
    const car = carWithMultiPartSymptom('cause-b', ['cause-b', 'cause-c'])
    expect(worstRemainingBandFor(car, 'headValvetrain', CONTEXT)).toBeNull()
  })

  it("returns the single remaining cause's own setBand when only one still targets the part", () => {
    const car = carWithMultiPartSymptom('cause-a', ['cause-a', 'cause-b'])
    expect(worstRemainingBandFor(car, 'headValvetrain', CONTEXT)).toBe('worn')
  })

  it('returns the worst (lowest-ranked) band among several still-remaining causes targeting the same part', () => {
    // TEST_SYMPTOM's two causes both target headValvetrain - worn vs poor.
    const car = carWithSymptom()
    expect(worstRemainingBandFor(car, 'headValvetrain', CONTEXT)).toBe('poor')
  })
})

describe('playerEstimateYen (Sprint 74 decision 6)', () => {
  it('equals expectedTrueValueYen exactly while nothing has narrowed - the full-weight reweight degenerates to the unfiltered case', () => {
    const car = carWithSymptom()
    expect(playerEstimateYen(car, MODEL, STATE, CONTEXT)).toBe(
      expectedTrueValueYen(car, MODEL, STATE, CONTEXT),
    )
  })

  it("once narrowed to one remaining cause, equals that cause's own exact value - no averaging left", () => {
    const narrowed: CarInstance = {
      ...carWithSymptom(),
      symptoms: [{ ...carWithSymptom().symptoms[0]!, remainingCauseIds: ['cause-severe'] }],
    }
    const apparent = apparentViewOf(narrowed)
    const severeView: CarInstance = {
      ...apparent,
      parts: {
        ...apparent.parts,
        headValvetrain: {
          installed: { ...apparent.parts.headValvetrain.installed!, band: 'poor' },
        },
      },
    }
    const severeValue = marketValueYen(
      MODEL,
      severeView,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    expect(playerEstimateYen(narrowed, MODEL, STATE, CONTEXT)).toBe(severeValue)
  })

  it('equals sheetGuideValueYen while nothing has narrowed, and moves off it the moment knowledge does', () => {
    const car = carWithSymptom()
    expect(playerEstimateYen(car, MODEL, STATE, CONTEXT)).toBe(
      sheetGuideValueYen(car, MODEL, STATE, CONTEXT),
    )
    // Eliminating the severe cause lifts the player's number above the
    // room's, which keeps averaging over both causes.
    const narrowed: CarInstance = {
      ...car,
      symptoms: [{ ...car.symptoms[0]!, remainingCauseIds: ['cause-mild'] }],
    }
    expect(playerEstimateYen(narrowed, MODEL, STATE, CONTEXT)).toBeGreaterThan(
      sheetGuideValueYen(narrowed, MODEL, STATE, CONTEXT),
    )
  })
})

describe('saleRevealLineFor (Sprint 75 decision 2): the organic teacher', () => {
  it('is undefined for an honest car (no symptoms)', () => {
    const car = buildCarInstance({ modelId: MODEL.id })
    expect(saleRevealLineFor(car, MODEL, STATE, CONTEXT)).toBeUndefined()
  })

  it('is undefined once every symptom has narrowed to a single remaining cause (nothing left to teach)', () => {
    const resolved: CarInstance = {
      ...carWithSymptom(),
      symptoms: [{ ...carWithSymptom().symptoms[0]!, remainingCauseIds: ['cause-mild'] }],
    }
    expect(saleRevealLineFor(resolved, MODEL, STATE, CONTEXT)).toBeUndefined()
  })

  it("fires buyerWon when the true cause (cause-mild, the cheaper of the two) prices ABOVE the player's own pre-sale estimate", () => {
    const car = carWithSymptom() // trueCauseId: 'cause-mild', both causes still remain
    const line = saleRevealLineFor(car, MODEL, STATE, CONTEXT)
    expect(line).toBe(
      CONTEXT.economy.diagnosis.saleRevealCopy.buyerWon.replace('<cause>', 'Cause mild'),
    )
  })

  it("fires playerWon when the true cause (cause-severe, the dearer of the two) prices AT OR BELOW the player's own pre-sale estimate", () => {
    const base = carWithSymptom()
    const severe: CarInstance = {
      ...base,
      parts: {
        ...base.parts,
        headValvetrain: { installed: { ...base.parts.headValvetrain.installed!, band: 'poor' } },
      },
      symptoms: [{ ...base.symptoms[0]!, trueCauseId: 'cause-severe' }],
    }
    const line = saleRevealLineFor(severe, MODEL, STATE, CONTEXT)
    expect(line).toBe(
      CONTEXT.economy.diagnosis.saleRevealCopy.playerWon.replace('<cause>', 'Cause severe'),
    )
  })
})

describe('pruneCuredCauses (cure-on-repair)', () => {
  /** A car resolved (the workup shape - `remainingCauseIds` narrowed to one)
   * to `clutch-cause-severe` - the clutch itself still at 'poor', matching
   * the cause's own claim, and `apparentBandByPartId` still recording the
   * room's pre-damage 'mint' read (nothing repairs that until the symptom
   * itself is cured). */
  function carWithResolvedClutchCause(): CarInstance {
    return {
      ...buildCarInstance({ modelId: MODEL.id, parts: mintCarParts({ clutch: 'poor' }) }),
      symptoms: [
        {
          symptomId: 'clutch-test-symptom',
          trueCauseId: 'clutch-cause-severe',
          remainingCauseIds: ['clutch-cause-severe'],
          runTestIds: [],
        },
      ],
      apparentBandByPartId: { clutch: 'mint' },
    }
  }

  it('the haunted-Carina regression: fitting a mint clutch cures the resolved cause outright, and sheetGuideValueYen/playerEstimateYen recover to the no-symptom figures', () => {
    const beforeCure = carWithResolvedClutchCause()
    const honestValue = marketValueYen(
      MODEL,
      { ...beforeCure, parts: mintCarParts() },
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    // Fear-priced while the poor clutch is still fitted - both numbers sit
    // below the honest (mint) value.
    expect(sheetGuideValueYen(beforeCure, MODEL, STATE, CONTEXT)).toBeLessThan(honestValue)
    expect(playerEstimateYen(beforeCure, MODEL, STATE, CONTEXT)).toBeLessThan(honestValue)

    // Fit a mint clutch - strictly better than the cause's own 'poor' claim.
    const mintClutchFitted: CarInstance = { ...beforeCure, parts: mintCarParts({ clutch: 'mint' }) }
    const cured = pruneCuredCauses(mintClutchFitted, CONTEXT)
    expect(cured.symptoms).toEqual([]) // cured outright - zero causes left

    expect(sheetGuideValueYen(cured, MODEL, STATE, CONTEXT)).toBe(honestValue)
    expect(playerEstimateYen(cured, MODEL, STATE, CONTEXT)).toBe(honestValue)
  })

  it('partial prune: an unresolved 4-cause symptom loses exactly the one cause whose part is repaired strictly past its own setBand', () => {
    const car: CarInstance = {
      ...buildCarInstance({
        modelId: MODEL.id,
        parts: mintCarParts({
          headValvetrain: 'poor',
          internals: 'poor',
          intake: 'poor',
          exhaust: 'poor',
        }),
      }),
      symptoms: [
        {
          symptomId: 'four-cause-symptom',
          trueCauseId: 'four-cause-1',
          remainingCauseIds: ['four-cause-1', 'four-cause-2', 'four-cause-3', 'four-cause-4'],
          runTestIds: [],
        },
      ],
    }
    // headValvetrain repaired to mint - strictly better than its own cause's
    // 'poor' claim; the other three parts (and their causes) are untouched.
    const repaired: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        headValvetrain: { installed: { ...car.parts.headValvetrain.installed!, band: 'mint' } },
      },
    }
    const result = pruneCuredCauses(repaired, CONTEXT)
    expect(result.symptoms).toHaveLength(1)
    expect([...result.symptoms[0]!.remainingCauseIds].sort()).toEqual(
      ['four-cause-2', 'four-cause-3', 'four-cause-4'].sort(),
    )
  })

  it("equal-band never cures: raising a part up to, but not past, its cause's own setBand leaves the cause in place", () => {
    const car: CarInstance = {
      ...buildCarInstance({ modelId: MODEL.id, parts: mintCarParts({ clutch: 'scrap' }) }),
      symptoms: [
        {
          symptomId: 'clutch-test-symptom',
          trueCauseId: 'clutch-cause-severe',
          remainingCauseIds: ['clutch-cause-severe'],
          runTestIds: [],
        },
      ],
    }
    // Repaired from 'scrap' up to EXACTLY the cause's own claim ('poor') -
    // a real band raise, but not strictly past it.
    const repaired: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        clutch: { installed: { ...car.parts.clutch.installed!, band: 'poor' } },
      },
    }
    const result = pruneCuredCauses(repaired, CONTEXT)
    expect(result).toBe(repaired) // unchanged reference - no cure fired
    expect(result.symptoms[0]!.remainingCauseIds).toEqual(['clutch-cause-severe'])
  })

  it('cures via a recondition-style partial climb: a bench recondition to fine (strictly past the poor claim, short of mint) still cures', () => {
    const beforeRecondition = carWithResolvedClutchCause()
    // A bench recondition lifts the clutch from 'poor' to 'fine' rather than
    // a fresh mint part - still strictly better than the cause's own claim.
    const reconditioned: CarInstance = {
      ...beforeRecondition,
      parts: {
        ...beforeRecondition.parts,
        clutch: { installed: { ...beforeRecondition.parts.clutch.installed!, band: 'fine' } },
      },
    }
    const cured = pruneCuredCauses(reconditioned, CONTEXT)
    expect(cured.symptoms).toEqual([])
  })

  it('is a no-op (same reference) for an honest car (no symptoms)', () => {
    const honest = buildCarInstance({ modelId: MODEL.id })
    expect(pruneCuredCauses(honest, CONTEXT)).toBe(honest)
  })
})
