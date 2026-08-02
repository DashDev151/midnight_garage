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
  type EngineCharacter,
  type Part,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { hasForcedInduction } from '../src/bands'
import { computeDerivedStats, engineCharacterOf } from '../src/derivedStats'
import { buildCarInstance, mintCarParts, type CarPartOverride } from './testFixtures'

/**
 * `statModifiers.power`, a flat PS delta, was retired in favour of
 * `powerFraction`, a per-character fraction of the car's own STOCK power.
 * This file is the mechanism's own acceptance test - the ratio property, the
 * per-character cap, the per-car pinned table, order independence, and band
 * scaling. `engineCharacter.test.ts` covers the character derivation itself.
 */

const PARTS_BY_ID: Readonly<Record<string, Part>> = Object.fromEntries(
  PARTS.map((part) => [part.id, part]),
)

/** The seven slots that carry a power fraction on every car regardless of
 * induction, plus `forcedInduction`, which only ships fitted on a car that
 * already has it from the factory - see `buildCapInstance`. */
const POWER_SLOTS: readonly CarPartId[] = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'ignitionEcu',
]
const FORCED_INDUCTION: CarPartId = 'forcedInduction'

/** The best (only) race-grade SKU for `carPartId` in `model`'s own fitment
 * class and tag set - the catalogue carries exactly one race SKU per slot
 * per class, so "best" is really "the" here. */
function raceSkuFor(model: CarModel, carPartId: CarPartId): Part {
  const fitmentClass = fitmentClassForTier(model.tier)
  const found = PARTS.find(
    (part) =>
      part.carPartId === carPartId &&
      part.grade === 'race' &&
      part.fitmentClass === fitmentClass &&
      part.zoneId == null &&
      part.requiredTags.every((tag) => model.tags.includes(tag)),
  )
  if (!found) throw new Error(`no race-grade ${carPartId} SKU fits ${model.id}`)
  return found
}

function installedFrom(part: Part, band: ConditionBand = 'mint'): PartInstance {
  return {
    id: `test-install-${part.id}`,
    partId: part.id,
    band,
    origin: { kind: 'market', day: 0 },
  }
}

/**
 * The maximal build this sprint's cap is measured against: every one of the
 * seven pure power slots at race grade, PLUS `forcedInduction` only when the
 * car already carries it from the factory. Bolting a turbo onto a factory-NA
 * car is legal (Lever 2's note on the `forcedInduction` row) but is a
 * DIFFERENT build from the character's pinned cap, which stays within the
 * car's own factory induction.
 */
function buildCapInstance(
  model: CarModel,
  includeForcedInduction = hasForcedInduction(model),
): CarInstance {
  const slots = includeForcedInduction ? [...POWER_SLOTS, FORCED_INDUCTION] : POWER_SLOTS
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const carPartId of slots) {
    overrides[carPartId] = installedFrom(raceSkuFor(model, carPartId))
  }
  return buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
}

function powerOf(model: CarModel, instance: CarInstance): number {
  return computeDerivedStats(model, instance, PARTS_BY_ID, PARTS_TAXONOMY, ECONOMY).power
}

const CAP_BY_CHARACTER: Readonly<Record<EngineCharacter, number>> = {
  'high-strung-na': 1.45,
  'lazy-na': 1.6,
  forced: 2.3,
}

describe("the ratio property: every car reaches its character's multiple of its own stock power", () => {
  for (const model of CARS) {
    const character = engineCharacterOf(model, ECONOMY)
    it(`${model.id} (${character})`, () => {
      const power = powerOf(model, buildCapInstance(model))
      const ratio = power / model.spec.stockPowerPs
      expect(ratio, `reached x${ratio.toFixed(4)}`).toBeCloseTo(CAP_BY_CHARACTER[character], 1)
    })
  }
})

describe('the cap, per character, exactly (Lever 2 summed at race grade, unrounded)', () => {
  function sumRaceFractions(character: EngineCharacter, includeForcedInduction: boolean): number {
    const slots = includeForcedInduction ? [...POWER_SLOTS, FORCED_INDUCTION] : POWER_SLOTS
    return slots.reduce((total, carPartId) => {
      const part = PARTS.find(
        (p) => p.carPartId === carPartId && p.grade === 'race' && p.fitmentClass === 'everyday',
      )!
      return total + part.statModifiers.powerFraction[character]
    }, 0)
  }

  it('high-strung NA: x1.45 (no turbo fitted)', () => {
    expect(1 + sumRaceFractions('high-strung-na', false)).toBeCloseTo(1.45, 6)
  })
  it('lazy NA: x1.60 (no turbo fitted)', () => {
    expect(1 + sumRaceFractions('lazy-na', false)).toBeCloseTo(1.6, 6)
  })
  it('forced: x2.30 (its own forced induction included)', () => {
    expect(1 + sumRaceFractions('forced', true)).toBeCloseTo(2.3, 6)
  })
  it('high-strung NA with a race turbo bolted on regardless: x1.65', () => {
    expect(1 + sumRaceFractions('high-strung-na', true)).toBeCloseTo(1.65, 6)
  })
  it('lazy NA with a race turbo bolted on regardless: x1.88', () => {
    expect(1 + sumRaceFractions('lazy-na', true)).toBeCloseTo(1.88, 6)
  })
})

describe('the per-car table, pinned (Lever 2, the maximal build)', () => {
  // Character's cap multiple x model.spec.stockPowerPs, rounded - the exact
  // figure `computeDerivedStats` returns for the maximal build defined by
  // `buildCapInstance` above. A drift here means either a car's stock power
  // moved in cars.json or the power formula itself moved - both are real
  // diagnoses, never a reason to loosen this test (directive 17).
  const EXPECTED_MAX_POWER_PS: Readonly<Record<string, number>> = {
    'honda-city-e-aa': 101,
    'suzuki-wagon-r-ct21s': 80,
    'honda-civic-sir2-eg6': 247,
    'toyota-sprinter-trueno-ae86': 189,
    'nissan-180sx-rps13': 361,
    'toyota-chaser-tourer-v-jzx90': 644,
    'nissan-silvia-ks-s14': 506,
    'mazda-savanna-rx7-fc3s': 467,
    'mazda-rx7-fd3s': 587,
    'toyota-supra-rz-jza80': 745,
    'toyota-carina-at150': 133,
    'nissan-sunny-b12': 136,
    'suzuki-alto-works-ha21s': 147,
    'honda-beat-pp1': 93,
    'honda-crx-sir-ef8': 232,
    'honda-city-turbo-ii-aa': 253,
    'toyota-sera-exy10': 174,
    'honda-prelude-si-vtec-bb4': 259,
    'nissan-silvia-s13': 403,
    'toyota-mr2-sw20': 561,
    'nissan-cefiro-a31': 472,
    'subaru-impreza-wrx-sti-gc8': 575,
    'nissan-skyline-gtr-bnr32': 644,
    'nissan-fairlady-z-z32': 644,
    'toyota-aristo-30v-jzs147': 745,
    'toyota-mr2-aw11': 338,
  }

  it('covers all 26 shipped cars', () => {
    expect(Object.keys(EXPECTED_MAX_POWER_PS).sort()).toEqual(CARS.map((c) => c.id).sort())
  })

  for (const model of CARS) {
    it(`${model.id}: stock ${model.spec.stockPowerPs} PS -> maximal ${EXPECTED_MAX_POWER_PS[model.id]} PS`, () => {
      expect(powerOf(model, buildCapInstance(model))).toBe(EXPECTED_MAX_POWER_PS[model.id])
    })
  }
})

describe('no compounding: power is order-independent', () => {
  it('installing the same parts in two different orders produces byte-identical power', () => {
    const gtr = CARS.find((c) => c.id === 'nissan-skyline-gtr-bnr32')!
    const order: readonly CarPartId[] = [
      'block',
      'ignitionEcu',
      'exhaust',
      'camsTiming',
      'forcedInduction',
    ]

    function instanceInOrder(slotsInOrder: readonly CarPartId[]): CarInstance {
      const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
      for (const carPartId of slotsInOrder) {
        overrides[carPartId] = installedFrom(raceSkuFor(gtr, carPartId))
      }
      return buildCarInstance({ modelId: gtr.id, parts: mintCarParts(overrides) })
    }

    const forward = powerOf(gtr, instanceInOrder(order))
    const reversed = powerOf(gtr, instanceInOrder([...order].reverse()))
    expect(forward).toBe(reversed)
  })
})

describe('band scaling: a worn SKU contributes bandFactor(worn) of its mint contribution', () => {
  it("exactly, on the Supra's race ECU, isolating the aftermarket term from the condition-weighting term", () => {
    const supra = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
    const raceEcu = raceSkuFor(supra, 'ignitionEcu')
    // An EMPTY taxonomy makes `weightedBandFactorForStat('power', ...)`
    // return exactly 1 regardless of any part's band (its own documented
    // fallback for "nothing on the car carries a weight"), which isolates
    // the part-loop's own `powerFraction * bandFactor(band)` term - the
    // thing this test is about - from the pre-existing, unrelated condition
    // weighting the ECU's band would otherwise also feed.
    const isolatedTaxonomy: typeof PARTS_TAXONOMY = []

    function powerAt(band: 'mint' | 'worn' | null): number {
      const overrides = band === null ? {} : { ignitionEcu: installedFrom(raceEcu, band) }
      const instance = buildCarInstance({ modelId: supra.id, parts: mintCarParts(overrides) })
      return computeDerivedStats(supra, instance, PARTS_BY_ID, isolatedTaxonomy, ECONOMY).power
    }

    const basePower = powerAt(null)
    expect(basePower).toBe(supra.spec.stockPowerPs)

    // `computeDerivedStats` accumulates every part's contribution unrounded
    // and rounds the total once, so the band factor scales the UNROUNDED mint
    // contribution. Scaling the already-rounded mint delta instead would
    // insert a second rounding step the formula does not have, and land a
    // whole PS out whenever the two roundings disagree.
    const mintContribution = supra.spec.stockPowerPs * raceEcu.statModifiers.powerFraction.forced
    expect(powerAt('mint') - basePower).toBe(Math.round(mintContribution))
    expect(powerAt('worn') - basePower).toBe(
      Math.round(mintContribution * ECONOMY.bands.bandFactors.worn),
    )
  })
})
