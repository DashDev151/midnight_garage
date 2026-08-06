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
  type ConditionBand,
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
const BANDS_BEST_FIRST: readonly ConditionBand[] = ['mint', 'fine', 'worn', 'poor', 'scrap']
const SUB_MINT_BANDS = BANDS_BEST_FIRST.slice(1)
/** The three grades that carry an advantage for a band curve to scale. A stock
 * SKU's modifiers are all exactly 1, so its row can never move a dial however
 * steep it is; it exists to hold the pre-grade-split identity, not to deliver
 * anything. */
const GRADES_WITH_ADVANTAGE: readonly Grade[] = ['street', 'sport', 'race']

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
            origin: { kind: 'market', day: 0 },
          },
        }
      : { installed: null }
  }
  return buildCarInstance({ modelId: model.id, parts: parts as CarInstance['parts'] })
}

/** Same override pattern as `buildAt`, but pins one slot to an explicit band
 * rather than always `mint`, so a test can exercise the interpolation
 * `buildFactors` performs. */
function buildAtBand(
  model: CarModel,
  partId: CarPartId,
  grade: Grade,
  band: ConditionBand,
): CarInstance {
  const car = buildAt(model, 'stock', { [partId]: grade } as Partial<Record<CarPartId, Grade>>)
  const installed = car.parts[partId].installed!
  return { ...car, parts: { ...car.parts, [partId]: { installed: { ...installed, band } } } }
}

/** The same build with every filled slot moved to one band. */
function atBand(car: CarInstance, band: ConditionBand): CarInstance {
  const parts = { ...car.parts }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = parts[partId].installed
    if (installed) parts[partId] = { installed: { ...installed, band } }
  }
  return { ...car, parts }
}

/** The bare product of the fitted SKUs' `physicalModifiers`, with no condition
 * scaling at all - what `buildFactors` must return exactly at mint. */
function rawProductOf(car: CarInstance): BuildFactors {
  const product = { ...STOCK_BUILD_FACTORS }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    const modifiers = CONTEXT.partsById[installed.partId]?.physicalModifiers
    if (!modifiers) continue
    product.grip *= modifiers.grip
    product.braking *= modifiers.braking
    product.mass *= modifiers.mass
  }
  return product
}

/** The fraction of its own advantage a single fitted SKU still delivers, read
 * back out of the real build factors: `(effective - 1) / (modifier - 1)`. Reads
 * the number the grade curve is denominated in, so it compares like with like
 * across parts whose modifiers differ. */
function retainedAdvantage(
  model: CarModel,
  partId: CarPartId,
  grade: Grade,
  band: ConditionBand,
  dial: keyof BuildFactors,
): number {
  const car = buildAtBand(model, partId, grade, band)
  const modifier = CONTEXT.partsById[car.parts[partId].installed!.partId]!.physicalModifiers[dial]
  const effective = buildFactors(car, CONTEXT.partsById, ECONOMY)[dial]
  return (effective - 1) / (modifier - 1)
}

/** The mechanical grip a build actually corners on - the same quantity the lap
 * walks and the handling readout displays. */
function mechanicalGrip(model: CarModel, car: CarInstance): number {
  const compound = effectiveCompound(car, model, CONTEXT.partsById, ECONOMY.statFormulas.grip)
  const condition = physicalConditionFactors(car, model, PARTS_TAXONOMY, ECONOMY)
  const build = buildFactors(car, CONTEXT.partsById, ECONOMY)
  return effectiveGrip(
    model,
    compound,
    ECONOMY.statFormulas.grip,
    ECONOMY.statFormulas.aero,
    condition.grip * build.grip,
  )
}

function factorsAt(model: CarModel, grade: Grade): BuildFactors {
  return buildFactors(buildAt(model, grade), CONTEXT.partsById, ECONOMY)
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
  /**
   * The measured stock-to-maxed grip target is x1.40; the spread is what the
   * tyre half's own width and era terms do per car, not slack in the ladder.
   *
   * The ceiling widens for cars built before 1975, and the reason is in the
   * target's own provenance: x1.40 was measured on two independently maxed road
   * cars of the modern era. A pre-radial car starts far lower - the Datsun 510
   * leaves the factory on 5.60-13 cross-plies, which the width rule classes
   * `eco` - so modern rubber multiplies from a smaller base and it reaches
   * x1.509. That is a bigger RATIO, not more grip: its maxed figure still sits
   * near the bottom of the roster in absolute terms. The claim being made is
   * about how much a build can add, so the older baseline gets its own bound
   * rather than the modern one being loosened for every car.
   */
  const maxRatioFor = (yearFrom: number): number => (yearFrom < 1975 ? 1.55 : 1.48)

  it('a maximal legal build lands near x1.40 of stock grip on every roster car', () => {
    for (const model of CARS) {
      const ratio =
        mechanicalGrip(model, buildAt(model, 'race')) /
        mechanicalGrip(model, buildAt(model, 'stock'))
      expect(ratio, `${model.id} reached x${ratio.toFixed(3)}`).toBeGreaterThan(1.35)
      expect(ratio, `${model.id} reached x${ratio.toFixed(3)}`).toBeLessThan(
        maxRatioFor(model.spec.yearFrom),
      )
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
      ECONOMY,
    )
    expect(suspensionOnly.grip).toBeCloseTo(1.09, 2)
    const oneDamper = buildFactors(
      buildAt(GTR, 'stock', { dampers: 'race' }),
      CONTEXT.partsById,
      ECONOMY,
    )
    expect(oneDamper.grip).toBeCloseTo(1.029, 4)
    expect(factorsAt(GTR, 'race').grip).toBeCloseTo(1.144, 3)
  })

  it('the two brake SKUs compound to x1.15 together, not each', () => {
    const pads = buildFactors(
      buildAt(GTR, 'stock', { brakePadsDiscs: 'race' }),
      CONTEXT.partsById,
      ECONOMY,
    )
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

describe("a part's own condition band scales its physical modifiers", () => {
  it("a mint build returns factors strictly equal to the raw product of the SKUs' physicalModifiers", () => {
    const car = buildAt(GTR, 'race')
    const rawProduct = rawProductOf(car)
    const built = buildFactors(car, CONTEXT.partsById, ECONOMY)
    expect(built.grip).toBe(rawProduct.grip)
    expect(built.braking).toBe(rawProduct.braking)
    expect(built.mass).toBe(rawProduct.mass)
  })

  it('a scrap race coilover delivers less grip than the same part at mint, and more than stock', () => {
    const mint = buildFactors(
      buildAtBand(GTR, 'dampers', 'race', 'mint'),
      CONTEXT.partsById,
      ECONOMY,
    )
    const scrap = buildFactors(
      buildAtBand(GTR, 'dampers', 'race', 'scrap'),
      CONTEXT.partsById,
      ECONOMY,
    )
    expect(scrap.grip).toBeLessThan(mint.grip)
    expect(scrap.grip).toBeGreaterThan(STOCK_BUILD_FACTORS.grip)
  })

  it('a scrap lightweight exhaust saves less mass than the same part at mint, and never adds mass over stock (the sign-error test)', () => {
    const mint = buildFactors(
      buildAtBand(GTR, 'exhaust', 'race', 'mint'),
      CONTEXT.partsById,
      ECONOMY,
    )
    const scrap = buildFactors(
      buildAtBand(GTR, 'exhaust', 'race', 'scrap'),
      CONTEXT.partsById,
      ECONOMY,
    )
    expect(scrap.mass).toBeLessThan(STOCK_BUILD_FACTORS.mass)
    expect(scrap.mass).toBeGreaterThan(mint.mass)
  })

  it('the five-band shape is pinned for one grip part and one mass part', () => {
    const gripInstalled = buildAtBand(GTR, 'dampers', 'race', 'mint').parts.dampers.installed!
    const massInstalled = buildAtBand(GTR, 'exhaust', 'race', 'mint').parts.exhaust.installed!
    const gripModifier = CONTEXT.partsById[gripInstalled.partId]!.physicalModifiers.grip
    const massModifier = CONTEXT.partsById[massInstalled.partId]!.physicalModifiers.mass
    for (const band of BANDS_BEST_FIRST) {
      // Both probe parts are race grade, so they run on the race row.
      const wear = ECONOMY.statFormulas.condition.gradeBandFactor.race[band]
      const expectedGrip = 1 + (gripModifier - 1) * wear
      const expectedMass = 1 + (massModifier - 1) * wear
      const grip = buildFactors(
        buildAtBand(GTR, 'dampers', 'race', band),
        CONTEXT.partsById,
        ECONOMY,
      ).grip
      const mass = buildFactors(
        buildAtBand(GTR, 'exhaust', 'race', band),
        CONTEXT.partsById,
        ECONOMY,
      ).mass
      expect(grip, band).toBeCloseTo(expectedGrip, 9)
      expect(mass, band).toBeCloseTo(expectedMass, 9)
    }
  })

  it('the delivered grip advantage is non-increasing as the band worsens, across all five bands', () => {
    const grips = BANDS_BEST_FIRST.map(
      (band) =>
        buildFactors(buildAtBand(GTR, 'dampers', 'race', band), CONTEXT.partsById, ECONOMY).grip,
    )
    for (let i = 1; i < grips.length; i++) {
      expect(grips[i], BANDS_BEST_FIRST[i]).toBeLessThanOrEqual(grips[i - 1]!)
    }
  })
})

/**
 * How sharply a part's own advantage fades is a property of its GRADE, not one
 * curve shared by the whole catalogue. A race part is highly strung and a stock
 * part is under-stressed, so at the same band the race part has given up more of
 * what it was bought for.
 *
 * Nothing here is a wear rate. No band moves during play, so these curves say
 * what a part in a given state delivers, never how fast it got there.
 */
describe('a part grade decides how sharply its own advantage fades', () => {
  const CURVES = ECONOMY.statFormulas.condition.gradeBandFactor

  it('the stock row is the value-side band curve exactly, and a stock build is unmoved at every band', () => {
    expect(CURVES.stock).toEqual(ECONOMY.bands.bandFactors)
    for (const model of CARS) {
      for (const band of BANDS_BEST_FIRST) {
        const car = atBand(buildAt(model, 'stock'), band)
        expect(buildFactors(car, CONTEXT.partsById, ECONOMY), `${model.id} @${band}`).toEqual(
          STOCK_BUILD_FACTORS,
        )
      }
    }
  })

  /** The identity that keeps `harnessAcceptance.test.ts` green, asserted
   * directly rather than inferred from a lap time. */
  it('every grade delivers its modifier exactly at mint', () => {
    for (const grade of GRADE_ORDER) {
      expect(CURVES[grade].mint, grade).toBe(1)
    }
    for (const model of [CIVIC, GTR]) {
      for (const grade of GRADE_ORDER) {
        const car = buildAt(model, grade)
        const raw = rawProductOf(car)
        const built = buildFactors(car, CONTEXT.partsById, ECONOMY)
        expect(built.grip, `${model.id} @${grade}`).toBe(raw.grip)
        expect(built.braking, `${model.id} @${grade}`).toBe(raw.braking)
        expect(built.mass, `${model.id} @${grade}`).toBe(raw.mass)
      }
    }
  })

  /** The whole point of the grade split, in one comparison: a knackered race
   * damper is worse than a healthy street one, so buying the sharpest part and
   * neglecting it is a real mistake rather than a slightly smaller gain. */
  it('a race coilover at poor delivers less grip than a street coilover at mint, and so does a sport one', () => {
    const gripAt = (grade: Grade, band: ConditionBand) =>
      buildFactors(buildAtBand(GTR, 'dampers', grade, band), CONTEXT.partsById, ECONOMY).grip
    const streetMint = gripAt('street', 'mint')
    expect(gripAt('race', 'poor')).toBeLessThan(streetMint)
    expect(gripAt('sport', 'poor')).toBeLessThan(streetMint)
    // Still an upgrade, never a penalty: a bad part is a bad part, not an absent one.
    expect(gripAt('race', 'poor')).toBeGreaterThan(STOCK_BUILD_FACTORS.grip)
  })

  it('for a fixed grade, a part delivers less of its advantage as its band worsens', () => {
    for (const grade of GRADES_WITH_ADVANTAGE) {
      const retained = BANDS_BEST_FIRST.map((band) =>
        retainedAdvantage(GTR, 'dampers', grade, band, 'grip'),
      )
      for (let i = 1; i < retained.length; i++) {
        expect(retained[i], `${grade} @${BANDS_BEST_FIRST[i]}`).toBeLessThan(retained[i - 1]!)
      }
    }
  })

  /** The property the grade split exists for, stated on its own: hold the band
   * still and climb the ladder, and each rung keeps less of what it promised. */
  it('for a fixed band below mint, a part delivers less of its advantage as its grade rises', () => {
    for (const band of SUB_MINT_BANDS) {
      const retained = GRADES_WITH_ADVANTAGE.map((grade) =>
        retainedAdvantage(GTR, 'dampers', grade, band, 'grip'),
      )
      for (let i = 1; i < retained.length; i++) {
        expect(retained[i], `${band} @${GRADES_WITH_ADVANTAGE[i]}`).toBeLessThan(retained[i - 1]!)
      }
    }
  })

  it('a lightweight part at poor saves less weight than a street one at mint, on both grades above street', () => {
    const massAt = (grade: Grade, band: ConditionBand) =>
      buildFactors(buildAtBand(GTR, 'exhaust', grade, band), CONTEXT.partsById, ECONOMY).mass
    const streetMint = massAt('street', 'mint')
    for (const grade of ['sport', 'race'] as const) {
      expect(massAt(grade, 'poor'), grade).toBeGreaterThan(streetMint)
    }
  })

  /** The sign test, over all four rows and the whole catalogue rather than one
   * probe part: a weight-saving modifier is below 1, so a curve that ever went
   * above 1 would make a worn part heavier than the stock item it replaced. */
  it('no SKU at any band adds mass over stock', () => {
    const offenders: string[] = []
    for (const part of PARTS) {
      for (const band of BANDS_BEST_FIRST) {
        const effective = 1 + (part.physicalModifiers.mass - 1) * CURVES[part.grade][band]
        if (effective > 1) offenders.push(`${part.id} @${band}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no grade curve leaves [0, 1]', () => {
    for (const grade of GRADE_ORDER) {
      for (const band of BANDS_BEST_FIRST) {
        const factor = CURVES[grade][band]
        expect(factor, `${grade} @${band}`).toBeGreaterThanOrEqual(0)
        expect(factor, `${grade} @${band}`).toBeLessThanOrEqual(1)
      }
    }
  })

  /** An unresolvable SKU never reaches the curve lookup at all, which is
   * stricter than the `stock` fallback the lookup itself carries. */
  it('a slot whose SKU the catalogue cannot resolve moves no dial', () => {
    const car = buildAtBand(GTR, 'dampers', 'race', 'poor')
    const orphaned: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        dampers: { installed: { ...car.parts.dampers.installed!, partId: 'no-such-sku' } },
      },
    }
    expect(buildFactors(orphaned, CONTEXT.partsById, ECONOMY)).toEqual(STOCK_BUILD_FACTORS)
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
