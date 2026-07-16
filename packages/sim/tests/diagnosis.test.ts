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
  type Symptom,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, privateValuationYen } from '../src/bidding'
import { buildSimContext } from '../src/context'
import {
  apparentViewOf,
  beginInspectionVisit,
  displayedBandFor,
  expectedTrueValueYen,
  inspectionVisitGateReason,
  ownedWorkupGateReason,
  playerEstimateYen,
  resolveOwnedWorkup,
  revealOnRemoval,
  runDiagnosticTest,
  saleRevealLineFor,
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
 * split - decouples this test from any future content retune. Sprint 74
 * gives it one real test (`test-diagnostic`, a clean 1-vs-1 partition) so the
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

/** Sprint 74: a second fixture symptom whose three causes target THREE
 * different parts - `TEST_SYMPTOM` above can't exercise `revealOnRemoval`'s
 * "the removed part isn't the true cause's own target" branch or
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
  [TEST_SYMPTOM, MULTI_PART_SYMPTOM],
  [{ id: 'test-diagnostic', minutes: 15 }],
)

const STATE = createInitialGameState(CONTEXT, 1)

/** A car whose true headValvetrain band (`worn`, the mild cause's own
 * `setBand`) is genuinely worse than its recorded apparent band (`mint`) -
 * matching real generation's own invariant (decision 2: true is always the
 * WORSE of the two). */
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

/** A minimal `AuctionLot` at `local-yard` wrapping `car` - the fixture every
 * Sprint 74 verb test needs to reach `state.activeAuctionLots`. */
function buildLot(car: CarInstance, tier: AuctionLot['tier'] = 'local-yard'): AuctionLot {
  return {
    id: 'lot-diag-test',
    tier,
    modelId: MODEL.id,
    car,
    bookValueYen: MODEL.bookValueYen,
    expiresOnDay: 8,
    currentBidYen: 0,
    leadingBidder: null,
    quietDays: 0,
    playerHasBid: false,
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

  it('sheetGuideValueYen applies the fear premium arithmetic exactly: apparentValue - fearPremium x (apparentValue - expectedTrueValue)', () => {
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
    const expectedSheetValue =
      apparentValue - CONTEXT.economy.diagnosis.fearPremium * (apparentValue - expectedTrueValue)

    expect(sheetGuideValueYen(car, MODEL, STATE, CONTEXT)).toBe(expectedSheetValue)
    // fearPremium > 1 (schema-enforced) means the room prices a symptomatic
    // car strictly below the pure expectation whenever there's a real gap.
    expect(expectedSheetValue).toBeLessThan(expectedTrueValue)
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
      currentBidYen: 0,
      leadingBidder: null,
      quietDays: 0,
      playerHasBid: false,
      turnout: 'steady' as const,
    })

    expect(anchorValueYen(lotFor(narrowed), STATE, CONTEXT)).toBe(
      anchorValueYen(lotFor(wide), STATE, CONTEXT),
    )
    expect(privateValuationYen(lotFor(narrowed), STATE, CONTEXT, 1, 'cohort-1')).toBe(
      privateValuationYen(lotFor(wide), STATE, CONTEXT, 1, 'cohort-1'),
    )
  })
})

describe('sale-side blindness (Sprint 73 decision 8): a sale always prices the true car, never the apparent one', () => {
  it("valuateCarForBuyer reads the car's own true marketValueYen directly - no apparentViewOf, no fear premium, even on a car carrying a symptom", () => {
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
    // createInitialGameState seeds a real starter board (Sprint 10), so this
    // has to clear it explicitly rather than assume day 1 starts empty.
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
    const state = { ...stateWithLot(carWithSymptom()), laborSlotsSpentToday: 999 }
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
    expect(result.state.laborSlotsSpentToday).toBe(state.laborSlotsSpentToday + 1)
    expect(result.state.inspectionVisit).toEqual({
      tier: 'local-yard',
      minutesLeft: minutesGranted,
    })
    expect(result.log).toEqual([
      { type: 'inspection-visit', tier: 'local-yard', feeYen, minutesGranted },
    ])
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

describe('runDiagnosticTest partition narrowing against real content (Sprint 74 task 6): every symptom-test-cause triple', () => {
  const REAL_CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

  it('the real content actually offers symptom-test pairs to iterate (guards against a silent false pass below if content ever ships empty)', () => {
    expect(SYMPTOMS.some((s) => s.tests.length > 0)).toBe(true)
    expect(DIAGNOSTIC_TESTS.length).toBeGreaterThan(0)
  })

  for (const symptom of SYMPTOMS) {
    for (const testApp of symptom.tests) {
      for (const trueCause of symptom.causes) {
        it(`${symptom.id} / ${testApp.testId}: trueCause=${trueCause.id} narrows to its own partition group and returns the matching result copy`, () => {
          const car: CarInstance = {
            ...buildCarInstance({ modelId: MODEL.id }),
            symptoms: [
              {
                symptomId: symptom.id,
                trueCauseId: trueCause.id,
                remainingCauseIds: symptom.causes.map((c) => c.id),
                runTestIds: [],
              },
            ],
          }
          const state: GameState = {
            ...stateWithLot(car, REAL_CONTEXT),
            inspectionVisit: {
              tier: 'local-yard',
              minutesLeft: REAL_CONTEXT.economy.diagnosis.visitMinutes,
            },
          }
          const result = runDiagnosticTest(state, 'lot-diag-test', 0, testApp.testId, REAL_CONTEXT)
          expect(result.outcome).toBe('ran')
          const groupIndex = testApp.partition.findIndex((group) => group.includes(trueCause.id))
          const expectedGroup = testApp.partition[groupIndex]!
          const updatedSymptom = result.state.activeAuctionLots[0]!.car.symptoms[0]!
          expect([...updatedSymptom.remainingCauseIds].sort()).toEqual([...expectedGroup].sort())
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
      laborSlotsSpentToday: 999,
    }
    expect(ownedWorkupGateReason(state, car.id, CONTEXT)).toBe('no-labor-slot')
    expect(resolveOwnedWorkup(state, car.id, CONTEXT).outcome).toBe('no-labor-slot')
  })

  it('on success: collapses every symptom straight to its own trueCauseId, spends exactly 1 labour slot with no fee, and logs car-workup', () => {
    const car = carWithSymptom()
    const state: GameState = { ...createInitialGameState(CONTEXT, 1), ownedCars: [car] }
    const result = resolveOwnedWorkup(state, car.id, CONTEXT)
    expect(result.outcome).toBe('done')
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.laborSlotsSpentToday).toBe(state.laborSlotsSpentToday + 1)
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

  it('never applies the fear premium - strictly greater than sheetGuideValueYen for the same symptomatic car', () => {
    const car = carWithSymptom()
    expect(playerEstimateYen(car, MODEL, STATE, CONTEXT)).toBeGreaterThan(
      sheetGuideValueYen(car, MODEL, STATE, CONTEXT),
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
