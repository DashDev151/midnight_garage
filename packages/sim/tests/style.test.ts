import {
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeDerivedStats } from '../src/derivedStats'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'
import type { CarPartOverride } from './testFixtures'

/**
 * Style is the one stat where a part CLOSES A GAP rather than adding to a
 * total (desirability-system.md section 2):
 *
 *     fitted   = sum of statModifiers.style over installed parts
 *     reach    = min(1, fitted / styleSaturationPoints)
 *     styleRaw = styleBase + (styleCeiling - styleBase) * reach
 *     style    = round(clamp(styleRaw * conditionFactor, 0, 100))
 *
 * So the interesting claims are all about two cars given the same parts, and
 * about the two ends of a car's own range.
 */
const SATURATION = ECONOMY.statFormulas.styleSaturationPoints

const PARTS_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]))

/** Every style-bearing slot, and the highest-style SKU in each at a given
 * fitment class - resolved from the catalogue itself rather than a
 * hand-listed set of SKU ids, so an added or repriced part cannot leave this
 * file asserting against a build the game can no longer make. */
function bestStylePartsFor(model: CarModel): Part[] {
  const fitmentClass = fitmentClassForTier(model.tier)
  const bestBySlot = new Map<string, Part>()
  for (const part of PARTS) {
    if (part.fitmentClass !== fitmentClass) continue
    if (!part.statModifiers.style) continue
    const held = bestBySlot.get(part.carPartId)
    if (!held || part.statModifiers.style > held.statModifiers.style) {
      bestBySlot.set(part.carPartId, part)
    }
  }
  return [...bestBySlot.values()]
}

function carWithParts(
  model: CarModel,
  parts: readonly Part[],
  band: ConditionBand = 'mint',
): CarInstance {
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const part of parts) {
    overrides[part.carPartId as CarPartId] = {
      id: `fixture-${part.carPartId}`,
      partId: part.id,
      band,
      origin: { kind: 'market', day: 1 },
    }
  }
  return buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
}

function styleOf(model: CarModel, instance: CarInstance): number {
  return computeDerivedStats(model, instance, PARTS_BY_ID, PARTS_TAXONOMY, ECONOMY).style
}

/** A shipped car with real headroom to walk across: 45 stock, 92 built. */
const eg6 = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
/** A shipped car with almost none: 82 stock, 96 built. */
const fd3s = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

describe("the two ends of a car's own range", () => {
  it('a stock mint car scores exactly its own styleBase, on every shipped car', () => {
    for (const model of CARS) {
      const stockMint = buildCarInstance({ modelId: model.id })
      expect(styleOf(model, stockMint), model.id).toBe(model.spec.styleBase)
    }
  })

  it('a fully dressed mint car scores exactly its own styleCeiling, on every shipped car', () => {
    for (const model of CARS) {
      const dressed = carWithParts(model, bestStylePartsFor(model))
      expect(styleOf(model, dressed), model.id).toBe(model.spec.styleCeiling)
    }
  })

  /**
   * Saturation, not a cap on the sum: the best part in every style-bearing
   * slot totals 82 points against a saturation of 60, so the last 22 buy
   * nothing. Fitting a strict subset that already clears 60 must land on the
   * same ceiling as fitting everything.
   */
  it('fitting more style parts past saturation changes nothing', () => {
    const all = bestStylePartsFor(eg6)
    const fittedTotal = all.reduce((sum, p) => sum + p.statModifiers.style, 0)
    expect(fittedTotal).toBeGreaterThan(SATURATION)

    // Drop the smallest-contributing slot: still past saturation, so still
    // exactly at the ceiling.
    const withoutSmallest = all
      .slice()
      .sort((a, b) => b.statModifiers.style - a.statModifiers.style)
      .slice(0, -1)
    expect(
      withoutSmallest.reduce((sum, p) => sum + p.statModifiers.style, 0),
    ).toBeGreaterThanOrEqual(SATURATION)

    expect(styleOf(eg6, carWithParts(eg6, withoutSmallest))).toBe(eg6.spec.styleCeiling)
    expect(styleOf(eg6, carWithParts(eg6, all))).toBe(eg6.spec.styleCeiling)
  })

  it('a half-dressed car lands between the two, in proportion to what is fitted', () => {
    const rims = bestStylePartsFor(eg6).filter((p) => p.carPartId === 'rims')
    const fitted = rims.reduce((sum, p) => sum + p.statModifiers.style, 0)
    expect(fitted).toBeLessThan(SATURATION)

    const { styleBase, styleCeiling } = eg6.spec
    const reach = fitted / SATURATION
    const expected = Math.round(styleBase + (styleCeiling - styleBase) * reach)

    const half = styleOf(eg6, carWithParts(eg6, rims))
    expect(half).toBe(expected)
    expect(half).toBeGreaterThan(styleBase)
    expect(half).toBeLessThan(styleCeiling)
  })

  it('a worn style part buys less of the gap than a mint one', () => {
    const rims = bestStylePartsFor(eg6).filter((p) => p.carPartId === 'rims')
    const mint = styleOf(eg6, carWithParts(eg6, rims, 'mint'))
    const worn = styleOf(eg6, carWithParts(eg6, rims, 'worn'))
    expect(worn).toBeLessThan(mint)
    expect(worn).toBeGreaterThan(eg6.spec.styleBase * 0.5)
  })
})

/**
 * The case the whole shape exists for. Both cars are absent from `cars.json`,
 * so their real authored roster values are read onto a shipped chassis,
 * isolating the one thing under test: identical parts, identical condition,
 * two different cars.
 */
describe('the 2000GT case: the same parts on two cars', () => {
  const twoThousandGt: CarModel = {
    ...eg6,
    id: 'toyota-2000gt-mf10',
    spec: { ...eg6.spec, styleBase: 80, styleCeiling: 85 },
  }
  const threeFiftyZ: CarModel = {
    ...eg6,
    id: 'nissan-fairlady-z-z33',
    spec: { ...eg6.spec, styleBase: 45, styleCeiling: 96 },
  }

  it('gains the 2000GT five points and the 350Z fifty-one, off one build', () => {
    const kit = bestStylePartsFor(eg6)
    const gtGain = styleOf(twoThousandGt, carWithParts(twoThousandGt, kit)) - 80
    const zGain = styleOf(threeFiftyZ, carWithParts(threeFiftyZ, kit)) - 45
    expect(gtGain).toBe(5)
    expect(zGain).toBe(51)
    expect(zGain).toBeGreaterThan(gtGain * 10)
  })

  /**
   * A kit on a 2000GT still WORKS. It is never forbidden and never a special
   * case, it simply fits into a five-point gap, so it is never the play.
   */
  it('does not forbid the build on the 2000GT, it just makes it worth almost nothing', () => {
    const rims = bestStylePartsFor(eg6).filter((p) => p.carPartId === 'rims')
    const gt = styleOf(twoThousandGt, carWithParts(twoThousandGt, rims))
    expect(gt).toBeGreaterThan(80)
    expect(gt - 80).toBeLessThanOrEqual(2)
  })

  it('leaves a beautiful stock car far above a plain one, which addition never did', () => {
    const stock = buildCarInstance({ modelId: eg6.id })
    expect(styleOf(twoThousandGt, stock)).toBe(80)
    expect(styleOf(threeFiftyZ, stock)).toBe(45)
  })
})

describe('condition scales the whole result, not just the base', () => {
  it('a poor-condition maxed-out car scores below a mint maxed-out car', () => {
    const kit = bestStylePartsFor(eg6)
    const mint = styleOf(eg6, carWithParts(eg6, kit, 'mint'))
    const poor = styleOf(eg6, carWithParts(eg6, kit, 'poor'))
    expect(mint).toBe(eg6.spec.styleCeiling)
    expect(poor).toBeLessThan(mint)
  })

  /**
   * The claim that makes it a factor on the WHOLE result rather than on the
   * base alone: a rough car dressed to its ceiling still reads below a mint
   * car that has had nothing done to it, on a car whose headroom is small.
   */
  it('leaves a rough fully-built car below a mint untouched one when the headroom is small', () => {
    const kit = bestStylePartsFor(fd3s)
    const roughBuilt = carWithParts(fd3s, kit, 'poor')
    const mintStock = buildCarInstance({ modelId: fd3s.id })
    expect(styleOf(fd3s, roughBuilt)).toBeLessThan(styleOf(fd3s, mintStock))
  })

  it('reads a uniformly rough stock car at its base times the band factor', () => {
    for (const band of ['fine', 'worn', 'poor', 'scrap'] as const) {
      const rough = buildCarInstance({ modelId: eg6.id, parts: uniformCarParts(band) })
      const expected = Math.round(eg6.spec.styleBase * ECONOMY.bands.bandFactors[band])
      expect(styleOf(eg6, rough), band).toBe(expected)
    }
  })
})

describe('every shipped car carries the authored pair', () => {
  it('has both values, with the ceiling at or above the base', () => {
    for (const model of CARS) {
      expect(Number.isInteger(model.spec.styleBase), model.id).toBe(true)
      expect(Number.isInteger(model.spec.styleCeiling), model.id).toBe(true)
      expect(model.spec.styleCeiling, model.id).toBeGreaterThanOrEqual(model.spec.styleBase)
    }
  })
})
