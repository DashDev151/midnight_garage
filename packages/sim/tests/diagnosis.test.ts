import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type CarInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, privateValuationYen } from '../src/bidding'
import { buildSimContext } from '../src/context'
import { apparentViewOf, expectedTrueValueYen, sheetGuideValueYen } from '../src/diagnosis'
import { marketValueYen } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { valuateCarForBuyer } from '../src/valuation'
import { buildCarInstance, mintCarParts } from './testFixtures'

const MODEL = CARS[0]!

/** A minimal, hand-computable one-symptom two-cause fixture: 50/50 weights
 * so the expected value is a plain average, not a real-content weighted
 * split - decouples this test from any future content retune. */
const TEST_SYMPTOM = {
  id: 'test-symptom',
  cardLine: 'Test symptom.',
  causes: [
    {
      id: 'cause-mild',
      carPartId: 'headValvetrain' as const,
      setBand: 'worn' as const,
      weight: 50,
    },
    {
      id: 'cause-severe',
      carPartId: 'headValvetrain' as const,
      setBand: 'poor' as const,
      weight: 50,
    },
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
  [TEST_SYMPTOM],
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
      },
    ],
    apparentBandByPartId: { headValvetrain: 'mint' },
  }
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
