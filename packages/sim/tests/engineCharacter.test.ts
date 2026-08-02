import { CARS, ECONOMY, PARTS, type EngineCharacter } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { hasForcedInduction } from '../src/bands'
import { engineCharacterOf, specificOutputOf } from '../src/derivedStats'

/**
 * `engineCharacterOf` splits every shipped car into one of three responses
 * (`hasForcedInduction` wins outright; otherwise specific output against the
 * signed 80.0 PS/effective-litre threshold). This file pins that
 * derivation - a drift here silently moves every power fraction the game
 * charges, so it is the single most consequential regression test this
 * mechanism has.
 */

/** One row per shipped car, hand-derived from `spec.stockPowerPs` and
 * `spec.displacementCc` (rotary cars scaled 1.8x first) against the signed
 * 80.0 threshold - `docs/sprints/sprint_archive/sprint135.md` lever 1's own table for the
 * ten NA cars; the sixteen forced-induction cars all read `forced` outright. */
const EXPECTED_CHARACTER: Readonly<Record<string, EngineCharacter>> = {
  'honda-city-e-aa': 'lazy-na',
  'suzuki-wagon-r-ct21s': 'high-strung-na',
  'honda-civic-sir2-eg6': 'high-strung-na',
  'toyota-sprinter-trueno-ae86': 'high-strung-na',
  'nissan-180sx-rps13': 'forced',
  'toyota-chaser-tourer-v-jzx90': 'forced',
  'nissan-silvia-ks-s14': 'forced',
  'mazda-savanna-rx7-fc3s': 'forced',
  'mazda-rx7-fd3s': 'forced',
  'toyota-supra-rz-jza80': 'forced',
  'toyota-carina-at150': 'lazy-na',
  'nissan-sunny-b12': 'lazy-na',
  'suzuki-alto-works-ha21s': 'forced',
  'honda-beat-pp1': 'high-strung-na',
  'honda-crx-sir-ef8': 'high-strung-na',
  'honda-city-turbo-ii-aa': 'forced',
  'toyota-sera-exy10': 'lazy-na',
  'honda-prelude-si-vtec-bb4': 'lazy-na',
  'nissan-silvia-s13': 'forced',
  'toyota-mr2-sw20': 'forced',
  'nissan-cefiro-a31': 'forced',
  'subaru-impreza-wrx-sti-gc8': 'forced',
  'nissan-skyline-gtr-bnr32': 'forced',
  'nissan-fairlady-z-z32': 'forced',
  'toyota-aristo-30v-jzs147': 'forced',
  'toyota-mr2-aw11': 'forced',
}

describe('engineCharacterOf pins every shipped car (Sprint 135 lever 1)', () => {
  it('covers all 26 shipped cars, no more, no fewer', () => {
    expect(Object.keys(EXPECTED_CHARACTER).sort()).toEqual(CARS.map((c) => c.id).sort())
  })

  for (const model of CARS) {
    it(`${model.id} derives ${EXPECTED_CHARACTER[model.id]}`, () => {
      expect(engineCharacterOf(model, ECONOMY)).toBe(EXPECTED_CHARACTER[model.id])
    })
  }

  it('both required sanity targets from lever 1: the Beat high-strung, the Carina lazy', () => {
    const beat = CARS.find((c) => c.id === 'honda-beat-pp1')!
    const carina = CARS.find((c) => c.id === 'toyota-carina-at150')!
    expect(specificOutputOf(beat)).toBeCloseTo(97.6, 1)
    expect(engineCharacterOf(beat, ECONOMY)).toBe('high-strung-na')
    expect(specificOutputOf(carina)).toBeCloseTo(57.2, 1)
    expect(engineCharacterOf(carina, ECONOMY)).toBe('lazy-na')
  })

  it('the Prelude Si VTEC reads lazy, because the authored 162 PS is the mild spec, not the threshold', () => {
    const prelude = CARS.find((c) => c.id === 'honda-prelude-si-vtec-bb4')!
    expect(specificOutputOf(prelude)).toBeCloseTo(75.1, 1)
    expect(specificOutputOf(prelude)).toBeLessThan(
      ECONOMY.statFormulas.engineCharacter.naHighStrungThreshold,
    )
    expect(engineCharacterOf(prelude, ECONOMY)).toBe('lazy-na')
  })
})

describe('the rotary equivalency factor (1.8x effective displacement)', () => {
  const fc = CARS.find((c) => c.id === 'mazda-savanna-rx7-fc3s')!
  const fd = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

  it('both rotaries read a plausible PS-per-effective-litre figure', () => {
    // Real-world 13B territory (86 to 108 PS/L) once the 1.8x factor is
    // applied - implausibly high (150+) on the raw 1308cc figure instead.
    expect(specificOutputOf(fc)).toBeCloseTo(86.2, 1)
    expect(specificOutputOf(fd)).toBeCloseTo(108.3, 1)
  })

  it("the factor's effect asserted both ways: applying it more than halves the raw reading, on both rotaries", () => {
    for (const model of [fc, fd]) {
      const withFactor = specificOutputOf(model)
      const withoutFactor = model.spec.stockPowerPs / (model.spec.displacementCc! / 1000)
      expect(withFactor, model.id).toBeLessThan(withoutFactor)
      // 1.8x displacement halves-ish the PS/L reading (1/1.8 = 0.556).
      expect(withFactor / withoutFactor, model.id).toBeCloseTo(1 / 1.8, 3)
    }
  })

  it('neither rotary needs the factor to derive its character: both are factory turbo (forced wins outright)', () => {
    expect(hasForcedInduction(fc)).toBe(true)
    expect(hasForcedInduction(fd)).toBe(true)
    expect(engineCharacterOf(fc, ECONOMY)).toBe('forced')
    expect(engineCharacterOf(fd, ECONOMY)).toBe('forced')
  })
})

describe('the flagship case: a race ECU on a turbo car against the same grade on a high-strung NA car', () => {
  it('is worth roughly ten times as much, as a fraction of stock power', () => {
    const raceEcu = PARTS.find(
      (p) => p.carPartId === 'ignitionEcu' && p.grade === 'race' && p.fitmentClass === 'everyday',
    )!
    const forcedFraction = raceEcu.statModifiers.powerFraction.forced
    const highStrungFraction = raceEcu.statModifiers.powerFraction['high-strung-na']
    const ratio = forcedFraction / highStrungFraction
    expect(ratio).toBeGreaterThan(5)
    expect(ratio).toBeLessThan(15)
  })
})

describe('the grade shapes from Lever 4, pinned per slot', () => {
  function fractionOf(
    carPartId: string,
    grade: 'street' | 'sport' | 'race',
    character: EngineCharacter,
  ): number {
    const part = PARTS.find(
      (p) => p.carPartId === carPartId && p.grade === grade && p.fitmentClass === 'everyday',
    )!
    return part.statModifiers.powerFraction[character]
  }

  /**
   * Lever 2 (race grade, authored directly) x Lever 4 (the grade shape),
   * pinned to three decimal places exactly as Task 5 authored it - the
   * catalogue values themselves, not a ratio derived from them, since a
   * ratio of two already-rounded 3dp numbers is too noisy to assert
   * precisely on the smallest fractions (ignitionEcu's high-strung street
   * rung is 0.005, where a single unit of rounding is a 20 per cent swing).
   */
  const EXPECTED: Readonly<
    Record<
      string,
      Readonly<Record<'street' | 'sport' | 'race', Readonly<Record<EngineCharacter, number>>>>
    >
  > = {
    block: {
      street: { 'high-strung-na': 0.04, 'lazy-na': 0.05, forced: 0.007 },
      sport: { 'high-strung-na': 0.08, 'lazy-na': 0.101, forced: 0.013 },
      race: { 'high-strung-na': 0.12, 'lazy-na': 0.15, forced: 0.02 },
    },
    internals: {
      street: { 'high-strung-na': 0.013, 'lazy-na': 0.017, forced: 0.01 },
      sport: { 'high-strung-na': 0.027, 'lazy-na': 0.034, forced: 0.02 },
      race: { 'high-strung-na': 0.04, 'lazy-na': 0.05, forced: 0.03 },
    },
    headValvetrain: {
      street: { 'high-strung-na': 0.036, 'lazy-na': 0.045, forced: 0.027 },
      sport: { 'high-strung-na': 0.06, 'lazy-na': 0.075, forced: 0.045 },
      race: { 'high-strung-na': 0.08, 'lazy-na': 0.1, forced: 0.06 },
    },
    camsTiming: {
      street: { 'high-strung-na': 0.033, 'lazy-na': 0.043, forced: 0.017 },
      sport: { 'high-strung-na': 0.067, 'lazy-na': 0.087, forced: 0.034 },
      race: { 'high-strung-na': 0.1, 'lazy-na': 0.13, forced: 0.05 },
    },
    intake: {
      street: { 'high-strung-na': 0.012, 'lazy-na': 0.018, forced: 0.03 },
      sport: { 'high-strung-na': 0.017, 'lazy-na': 0.026, forced: 0.043 },
      race: { 'high-strung-na': 0.02, 'lazy-na': 0.03, forced: 0.05 },
    },
    exhaust: {
      street: { 'high-strung-na': 0.02, 'lazy-na': 0.03, forced: 0.07 },
      sport: { 'high-strung-na': 0.032, 'lazy-na': 0.048, forced: 0.112 },
      race: { 'high-strung-na': 0.04, 'lazy-na': 0.06, forced: 0.14 },
    },
    ignitionEcu: {
      street: { 'high-strung-na': 0.005, 'lazy-na': 0.008, forced: 0.038 },
      sport: { 'high-strung-na': 0.017, 'lazy-na': 0.028, forced: 0.138 },
      race: { 'high-strung-na': 0.03, 'lazy-na': 0.05, forced: 0.25 },
    },
    forcedInduction: {
      street: { 'high-strung-na': 0.04, 'lazy-na': 0.056, forced: 0.07 },
      sport: { 'high-strung-na': 0.09, 'lazy-na': 0.126, forced: 0.158 },
      race: { 'high-strung-na': 0.2, 'lazy-na': 0.28, forced: 0.35 },
    },
  }

  const CHARACTERS: readonly EngineCharacter[] = ['high-strung-na', 'lazy-na', 'forced']
  const GRADES = ['street', 'sport', 'race'] as const

  for (const [slot, byGrade] of Object.entries(EXPECTED)) {
    for (const grade of GRADES) {
      for (const character of CHARACTERS) {
        it(`${slot}/${grade}/${character} = ${byGrade[grade][character]}`, () => {
          expect(fractionOf(slot, grade, character)).toBe(byGrade[grade][character])
        })
      }
    }
  }

  /**
   * forcedInduction is the one increasing power curve in the game - each
   * step up the ladder delivers strictly more than the step below it.
   * Asserted as the property, not the three numbers.
   */
  it('forcedInduction is INCREASING: each step up the ladder strictly exceeds the step below it, on every character', () => {
    for (const character of CHARACTERS) {
      const street = fractionOf('forcedInduction', 'street', character)
      const sport = fractionOf('forcedInduction', 'sport', character)
      const race = fractionOf('forcedInduction', 'race', character)
      const firstStep = street // street - stock, stock is always 0
      const secondStep = sport - street
      const thirdStep = race - sport
      expect(secondStep, character).toBeGreaterThan(firstStep)
      expect(thirdStep, character).toBeGreaterThan(secondStep)
    }
  })

  /**
   * The comparative half: forcedInduction's late growth (the race-to-sport
   * step against the sport-to-street step) is not merely increasing, it is
   * the STEEPEST late growth of any power-bearing slot - strictly ahead of
   * every neighbouring slot's own ratio, on every character. This is what
   * would catch an accidental edit landing on a neighbouring row instead of
   * forcedInduction: a slot's own street/sport/race pins already fail on any
   * value change, and this test additionally fails if a neighbour's shape
   * were pushed toward forcedInduction's steepness rather than its own.
   */
  it('forcedInduction has the steepest late growth of any power-bearing slot, on every character', () => {
    for (const character of CHARACTERS) {
      const ratios = Object.entries(EXPECTED).map(([slot, byGrade]) => {
        const secondStep = byGrade.sport[character] - byGrade.street[character]
        const thirdStep = byGrade.race[character] - byGrade.sport[character]
        return { slot, ratio: thirdStep / secondStep }
      })
      const forcedInductionRatio = ratios.find((r) => r.slot === 'forcedInduction')!.ratio
      const others = ratios.filter((r) => r.slot !== 'forcedInduction')
      for (const other of others) {
        expect(
          forcedInductionRatio,
          `${character}: forcedInduction vs ${other.slot}`,
        ).toBeGreaterThan(other.ratio)
      }
    }
  })

  it("intake is diminishing (a strictly SMALLER second step than first), unlike forcedInduction's linear shape", () => {
    const street = fractionOf('intake', 'street', 'high-strung-na')
    const sport = fractionOf('intake', 'sport', 'high-strung-na')
    const race = fractionOf('intake', 'race', 'high-strung-na')
    expect(race - sport).toBeLessThan(sport - street)
  })
})

// `hasForcedInduction` reads `spec.aspiration` and nothing else; the test that
// holds it to that, against a model whose induction tag deliberately disagrees,
// lives beside the function in packages/sim/tests/bands.test.ts. That the two
// representations agree on every shipped car is
// packages/content/tests/integrity.test.ts's.
