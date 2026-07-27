import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartState,
  type Grade,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { buildFactors, computeDerivedStats, physicalConditionFactors } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { marketValueYen } from '../src/marketValue'
import {
  STOCK_BUILD_FACTORS,
  effectiveCompound,
  effectiveGrip,
  type BuildFactors,
} from '../src/performance'
import { buildCarInstance } from './testFixtures'

/**
 * What an AFTERMARKET part does to the physics, which is the other half of the
 * question `conditionPhysics.test.ts` answers. A car of stock parts has to be an
 * exact identity here for the same reason it does there: the measured figures
 * every lap runs on describe a stock car, so nothing may move until a real
 * upgrade is fitted.
 *
 * The driven targets these are scored against, from two independently maxed road
 * cars: mechanical grip a shade over x1.40 of stock, landing in the region of
 * 1.23 to 1.25 on the cars fast enough to get there.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GRADE_ORDER: readonly Grade[] = ['stock', 'street', 'sport', 'race']

/** The best SKU of at most `maxGrade` that this car may legally be given for
 * `partId`: right fitment class, every required tag present, and never a
 * zone-scoped panel (which addresses a body zone, not a slot). Among equals at
 * the top grade an aero-functional SKU wins, since that is the one a build
 * chasing pace would pick. */
function bestPartFor(model: CarModel, partId: CarPartId, maxGrade: Grade): Part | null {
  const fitmentClass = fitmentClassForTier(model.tier)
  const candidates = PARTS.filter(
    (part) =>
      part.carPartId === partId &&
      part.fitmentClass === fitmentClass &&
      part.zoneId == null &&
      part.requiredTags.every((tag) => model.tags.includes(tag)) &&
      GRADE_ORDER.indexOf(part.grade) <= GRADE_ORDER.indexOf(maxGrade),
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => GRADE_ORDER.indexOf(b.grade) - GRADE_ORDER.indexOf(a.grade))
  const best = candidates.filter((c) => c.grade === candidates[0]!.grade)
  return best.find((c) => c.aeroFunctional) ?? best[0]!
}

/** A mint car built as far up the ladder as `maxGrade` allows in every slot the
 * catalogue offers one for - the maximal LEGAL build, assembled the way a player
 * would have to assemble it rather than by summing the catalogue. */
function buildAt(
  model: CarModel,
  maxGrade: Grade,
  overrides: Partial<Record<CarPartId, Grade>> = {},
): CarInstance {
  const parts = {} as Record<CarPartId, CarPartState>
  for (const partId of ALL_CAR_PART_IDS) {
    const part = bestPartFor(model, partId, overrides[partId] ?? maxGrade)
    parts[partId] = part
      ? {
          installed: {
            id: `build-${partId}`,
            partId: part.id,
            band: 'mint',
            genuinePeriod: false,
            origin: { kind: 'market', day: 0 },
          },
        }
      : { installed: null }
  }
  return buildCarInstance({ modelId: model.id, parts: parts as CarInstance['parts'] })
}

/** The mechanical grip a build actually corners on - the same quantity the lap
 * walks and the handling readout displays. */
function mechanicalGrip(model: CarModel, car: CarInstance): number {
  const compound = effectiveCompound(car, model, CONTEXT.partsById, ECONOMY.statFormulas.grip)
  const condition = physicalConditionFactors(car, model, PARTS_TAXONOMY, ECONOMY)
  const build = buildFactors(car, CONTEXT.partsById)
  return effectiveGrip(
    model,
    compound,
    ECONOMY.statFormulas.grip,
    ECONOMY.statFormulas.aero,
    condition.grip * build.grip,
  )
}

function factorsAt(model: CarModel, grade: Grade): BuildFactors {
  return buildFactors(buildAt(model, grade), CONTEXT.partsById)
}

const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
const GTR = CARS.find((c) => c.id === 'nissan-skyline-gtr-bnr32')!

describe('a car of stock parts is untouched by the aftermarket model', () => {
  it('every build factor is exactly 1 on a fully stock car, on every roster car', () => {
    for (const model of CARS) {
      expect(factorsAt(model, 'stock'), model.id).toEqual(STOCK_BUILD_FACTORS)
    }
  })

  it('no stock-grade SKU in the catalogue moves a physical dial', () => {
    const offenders = PARTS.filter(
      (part) =>
        part.grade === 'stock' &&
        (part.physicalModifiers.grip !== 1 ||
          part.physicalModifiers.braking !== 1 ||
          part.physicalModifiers.mass !== 1),
    ).map((part) => part.id)
    expect(offenders).toEqual([])
  })
})

describe('one upgrade is never charged twice', () => {
  /**
   * The compound ladder already gives a tyre upgrade its whole effect through
   * the grip formula's own stock-to-fitted ratio. A grip modifier on a tyre SKU
   * would be that same upgrade a second time.
   */
  it('no tyre SKU carries a grip modifier', () => {
    const offenders = PARTS.filter(
      (part) => part.carPartId === 'tyres' && part.physicalModifiers.grip !== 1,
    ).map((part) => part.id)
    expect(offenders).toEqual([])
  })

  /**
   * The braking coefficient is DERIVED from mechanical grip
   * (`brakeMu = brakeRatio * mu * ...`), so a SKU that moved both would reach
   * braking once through `mu` and once through the dial - the same disjointness
   * the condition weights are held to.
   */
  it('no SKU carries both a grip modifier and a braking modifier', () => {
    const offenders = PARTS.filter(
      (part) => part.physicalModifiers.grip !== 1 && part.physicalModifiers.braking !== 1,
    ).map((part) => part.id)
    expect(offenders).toEqual([])
  })

  /**
   * Mass is not part of the grip product: it reduces the kerb weight the lap
   * model consumes directly, and cornering grip is mass-independent to first
   * order in this model. Keeping the two on disjoint SKU sets is not required by
   * the physics the way grip and braking are, but it is what makes each group
   * figure readable off the catalogue: the parts that stiffen a car and the
   * parts that lighten it are different parts.
   */
  it('a weight-reduction SKU never also carries grip', () => {
    const offenders = PARTS.filter(
      (part) => part.physicalModifiers.mass !== 1 && part.physicalModifiers.grip !== 1,
    ).map((part) => part.id)
    expect(offenders).toEqual([])
  })
})

describe('the grade ladder reaches the driven targets', () => {
  /** The measured stock-to-maxed grip target is x1.40; the spread is what the
   * tyre half's own width and era terms do per car, not slack in the ladder. */
  it('a maximal legal build lands near x1.40 of stock grip on every roster car', () => {
    for (const model of CARS) {
      const ratio =
        mechanicalGrip(model, buildAt(model, 'race')) /
        mechanicalGrip(model, buildAt(model, 'stock'))
      expect(ratio, `${model.id} reached x${ratio.toFixed(3)}`).toBeGreaterThan(1.35)
      expect(ratio, `${model.id} reached x${ratio.toFixed(3)}`).toBeLessThan(1.48)
    }
  })

  /**
   * THE ACCEPTANCE FOR THE WHOLE SPRINT. Two maxed road cars were driven at
   * mechanical grip 1.226 and 1.246, so a maximal legal build on the roster's
   * quicker machinery has to reach that region. A failure here means the ladder
   * is too weak, and the fix is the ladder, never this number.
   */
  it('a maximal legal build on the roster reaches at least 1.20 mechanical grip', () => {
    const best = CARS.map((model) => ({
      id: model.id,
      mu: mechanicalGrip(model, buildAt(model, 'race')),
    })).sort((a, b) => b.mu - a.mu)
    expect(best[0]!.mu, `best is ${best[0]!.id} at ${best[0]!.mu.toFixed(4)}`).toBeGreaterThan(1.2)
    expect(mechanicalGrip(GTR, buildAt(GTR, 'race'))).toBeGreaterThan(1.2)
  })

  it('the suspension and chassis SKUs compound to their group figures, never per part', () => {
    const suspensionOnly = buildFactors(
      buildAt(GTR, 'stock', { dampers: 'race', springs: 'race', antiRollBars: 'race' }),
      CONTEXT.partsById,
    )
    expect(suspensionOnly.grip).toBeCloseTo(1.09, 2)
    const oneDamper = buildFactors(buildAt(GTR, 'stock', { dampers: 'race' }), CONTEXT.partsById)
    expect(oneDamper.grip).toBeCloseTo(1.029, 4)
    expect(factorsAt(GTR, 'race').grip).toBeCloseTo(1.144, 3)
  })

  it('the two brake SKUs compound to x1.15 together, not each', () => {
    const pads = buildFactors(buildAt(GTR, 'stock', { brakePadsDiscs: 'race' }), CONTEXT.partsById)
    expect(pads.braking).toBeCloseTo(1.0724, 4)
    expect(factorsAt(GTR, 'race').braking).toBeCloseTo(1.15, 3)
  })

  it('a maximal legal build carries 90 per cent of its kerb weight', () => {
    expect(factorsAt(GTR, 'race').mass).toBeCloseTo(0.9, 3)
    expect(factorsAt(GTR, 'sport').mass).toBeCloseTo(0.933, 3)
    expect(factorsAt(GTR, 'street').mass).toBeCloseTo(0.966, 3)
  })

  it('every step up the ladder buys grip, braking and lightness on every roster car', () => {
    for (const model of CARS) {
      const ladder = GRADE_ORDER.map((grade) => factorsAt(model, grade))
      for (let i = 1; i < ladder.length; i++) {
        const step = `${model.id}: ${GRADE_ORDER[i]} is no better than ${GRADE_ORDER[i - 1]}`
        expect(ladder[i]!.grip, step).toBeGreaterThan(ladder[i - 1]!.grip)
        expect(ladder[i]!.braking, step).toBeGreaterThan(ladder[i - 1]!.braking)
        expect(ladder[i]!.mass, step).toBeLessThan(ladder[i - 1]!.mass)
      }
    }
  })
})

describe('a build reaches the lap, and the readout agrees with it', () => {
  it('each grade of build is quicker than the last, on every course and both drivetrains', () => {
    for (const model of [CIVIC, GTR]) {
      for (const course of COURSES) {
        const times = GRADE_ORDER.map((grade) =>
          lapTimeSecondsFor(buildAt(model, grade), model, CONTEXT, course.id)!,
        )
        for (let i = 1; i < times.length; i++) {
          expect(
            times[i]!,
            `${model.id} / ${course.id}: ${GRADE_ORDER[i]} (${times[i]}s) is not quicker than ${GRADE_ORDER[i - 1]} (${times[i - 1]}s)`,
          ).toBeLessThan(times[i - 1]!)
        }
      }
    }
  })

  it('suspension alone, with no engine or tyre work, is worth real lap time', () => {
    const stock = buildAt(CIVIC, 'stock')
    const sprung = buildAt(CIVIC, 'stock', {
      dampers: 'race',
      springs: 'race',
      antiRollBars: 'race',
      chassis: 'race',
    })
    const stockStats = computeDerivedStats(CIVIC, stock, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    const sprungStats = computeDerivedStats(
      CIVIC,
      sprung,
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    // The engine is untouched, so any lap gain is the chassis and nothing else.
    expect(sprungStats.power).toBe(stockStats.power)
    expect(sprungStats.handling).toBeGreaterThan(stockStats.handling)
    for (const course of COURSES) {
      expect(lapTimeSecondsFor(sprung, CIVIC, CONTEXT, course.id)!, course.id).toBeLessThanOrEqual(
        lapTimeSecondsFor(stock, CIVIC, CONTEXT, course.id)!,
      )
    }
    expect(lapTimeSecondsFor(sprung, CIVIC, CONTEXT, 'hakone')!).toBeLessThan(
      lapTimeSecondsFor(stock, CIVIC, CONTEXT, 'hakone')!,
    )
  })
})

describe('performance never moves value', () => {
  /**
   * A part raising performance and a part raising value are two independent
   * effects of the same purchase. Stripping every physical modifier out of the
   * catalogue must leave every price the model quotes exactly where it was: if
   * it does not, a physical delta has found a route into the ledger.
   */
  it('stripping every physical modifier out of the catalogue moves no price', () => {
    const neutral: Record<string, Part> = {}
    for (const part of PARTS) {
      neutral[part.id] = { ...part, physicalModifiers: { grip: 1, braking: 1, mass: 1 } }
    }
    for (const model of CARS) {
      for (const grade of GRADE_ORDER) {
        const car = buildAt(model, grade)
        expect(
          marketValueYen(model, car, 100, neutral, CONTEXT.partsTaxonomyById, ECONOMY),
          `${model.id} @${grade}`,
        ).toBe(
          marketValueYen(model, car, 100, CONTEXT.partsById, CONTEXT.partsTaxonomyById, ECONOMY),
        )
      }
    }
  })
})
