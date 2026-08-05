import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type Buyer,
  type BuyerArchetype,
  type CarInstance,
  type CarPartId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { coherenceFactorFor } from '../src/derivedStats'
import {
  expectationForCar,
  foundationFactor,
  installedPartsValueYen,
  marketValueYen,
  retentionFor,
} from '../src/marketValue'
import { supportVerdict } from '../src/support'
import { valuateCarForBuyer } from '../src/valuation'
import { carWithGrades, neutralCulturePreferences } from './testFixtures'

/**
 * Stage C (the coherence discount) and Stage D (coherence-scaled retention)
 * of the value stack (`marketValue.ts`, section 3C/3D of
 * `sale-value-system.md`). The invariant that both stages touch nothing on
 * an all-stock car is asserted separately, across the whole 26-car roster,
 * in `stockCarValuationInvariant.test.ts` - this file exercises the two
 * stages themselves, on real generated builds.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/** Flagship tier (`aftermarketReturn` 1.0 - see economy.json's
 * `valuation.expectationByTier.flagship`), forced induction, so the premium
 * term isolates retention's own effect rather than a tier discount. */
const FLAGSHIP_CAR = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!

/** The same "maximal forced-induction build, race grade throughout" shape
 * `supportRatios.test.ts` already pins at headline 1.111 (adequate) on a
 * different forced-induction car - reused here, not re-derived, to build a
 * genuinely coherent premium. */
const ALL_RACE_SUPPORTED: Partial<Record<CarPartId, 'race'>> = {
  block: 'race',
  internals: 'race',
  headValvetrain: 'race',
  camsTiming: 'race',
  intake: 'race',
  exhaust: 'race',
  fuelSystem: 'race',
  ignitionEcu: 'race',
  cooling: 'race',
  forcedInduction: 'race',
  gearbox: 'race',
  clutch: 'race',
  driveline: 'race',
  differential: 'race',
}

/** The raw sum of what the fitted non-stock, non-scrap parts cost at
 * catalog price - deliberately NOT the value formula (no retention, no
 * foundation factor, no tier return): the baseline "sum of its parts" every
 * Stage D test in this file compares the CREDITED premium against. */
function partsSumYen(car: CarInstance): number {
  let total = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const installed = car.parts[partId].installed
    if (!installed || installed.band === 'scrap') continue
    const part = CONTEXT.partsById[installed.partId]
    if (!part || part.grade === 'stock') continue
    total += part.priceYen
  }
  return total
}

function creditedPremiumYen(car: CarInstance, coherenceFactor: number): number {
  const retention = retentionFor(coherenceFactor, ECONOMY)
  return (
    foundationFactor(car, ECONOMY) *
    expectationForCar(FLAGSHIP_CAR, ECONOMY).aftermarketReturn *
    installedPartsValueYen(car, CONTEXT.partsById, retention, ECONOMY)
  )
}

describe('retentionFor (Stage D curve)', () => {
  it('is retentionFloor at coherenceFactor 0 and retentionCeiling at coherenceFactor 1', () => {
    const { retentionFloor, retentionCeiling } = ECONOMY.valuation
    expect(retentionFor(0, ECONOMY)).toBe(retentionFloor)
    expect(retentionFor(1, ECONOMY)).toBe(retentionCeiling)
  })

  it('is monotonically non-decreasing in coherenceFactor', () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map((cf) => retentionFor(cf, ECONOMY))
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!)
    }
  })
})

describe('Stage D: a coherent build is worth more than the sum of its parts, an incoherent one less', () => {
  it('a fully supported build (headline adequate, coherenceFactor 1) credits MORE than its parts catalog price', () => {
    const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, ALL_RACE_SUPPORTED, 'mint')
    const verdict = supportVerdict(car, FLAGSHIP_CAR, CONTEXT.partsById, ECONOMY)
    expect(verdict.band).toBe('adequate') // sanity: this build really is coherent
    const coherenceFactor = coherenceFactorFor(verdict.headline, ECONOMY)
    expect(coherenceFactor).toBe(1)

    const sumYen = partsSumYen(car)
    expect(sumYen).toBeGreaterThan(0) // sanity: the fixture really fits a premium
    expect(creditedPremiumYen(car, coherenceFactor)).toBeGreaterThan(sumYen)
  })

  it('a bare race turbo with no supporting mods (headline dangerous, coherenceFactor < 1) credits LESS than its parts catalog price', () => {
    const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, { forcedInduction: 'race' }, 'mint')
    const verdict = supportVerdict(car, FLAGSHIP_CAR, CONTEXT.partsById, ECONOMY)
    expect(verdict.band).not.toBe('adequate') // sanity: this build really is incoherent
    const coherenceFactor = coherenceFactorFor(verdict.headline, ECONOMY)
    expect(coherenceFactor).toBeLessThan(1)

    const sumYen = partsSumYen(car)
    expect(sumYen).toBeGreaterThan(0)
    expect(creditedPremiumYen(car, coherenceFactor)).toBeLessThan(sumYen)
  })
})

describe('Stage C: the coherence discount on the whole car, at the market default tolerance', () => {
  it('an incoherent build is worth strictly less at the default (1.0) tolerance than at zero tolerance', () => {
    const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, { forcedInduction: 'race' }, 'mint')
    const atDefaultTolerance = marketValueYen(
      FLAGSHIP_CAR,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    const atZeroTolerance = marketValueYen(
      FLAGSHIP_CAR,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
      0,
    )
    expect(atZeroTolerance).toBeGreaterThan(atDefaultTolerance)
  })

  it('a fully coherent build is unaffected by tolerance - the discount is already zero', () => {
    const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, ALL_RACE_SUPPORTED, 'mint')
    const atDefaultTolerance = marketValueYen(
      FLAGSHIP_CAR,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    const atZeroTolerance = marketValueYen(
      FLAGSHIP_CAR,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
      0,
    )
    expect(atZeroTolerance).toBe(atDefaultTolerance)
  })
})

describe('the tolerance ruling: the Show Crowd is exempt, the tuner is halved, against a Daily Drivers buyer', () => {
  // Identical statTargets on all three, differing only by archetype, and
  // every target trivially cleared (0) at importance 1 regardless of what
  // the car actually measures - so the match, and therefore
  // tasteMultiplier, is bit-identical (always the ceiling) across the three
  // calls below, and any difference in valuateCarForBuyer's output isolates
  // the coherence discount's own per-archetype tolerance (economy.json's
  // valuation.tolerance) - not a difference in what each archetype likes.
  const trivialTargets = {
    power: { target: 0, importance: 1 },
    handling: { target: 0, importance: 1 },
    style: { target: 0, importance: 1 },
    reliability: { target: 0, importance: 1 },
    authenticity: { target: 0, importance: 1 },
  }
  const showCrowdBuyer: Buyer = {
    id: 'test-show-crowd',
    archetype: 'show-crowd',
    displayName: 'Test Show Crowd',
    statTargets: trivialTargets,
    tierPreferences: [],
    culturePreferences: neutralCulturePreferences(),
    wantLine: 'test',
  }
  const tunerBuyer: Buyer = { ...showCrowdBuyer, id: 'test-tuner', archetype: 'tuner' }
  // 'daily-drivers' carries no override in valuation.tolerance, so it reads
  // the same `default` (1.0) every buyer-agnostic caller uses.
  const dailyDriversBuyer: Buyer = {
    ...showCrowdBuyer,
    id: 'test-daily-drivers',
    archetype: 'daily-drivers',
  }

  it('show-crowd > tuner > daily-drivers, on the same incoherent car, taste held constant', () => {
    const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, { forcedInduction: 'race' }, 'mint')
    const verdict = supportVerdict(car, FLAGSHIP_CAR, CONTEXT.partsById, ECONOMY)
    expect(verdict.band).not.toBe('adequate') // sanity: there is a discount to feel here at all

    const valueFor = (buyer: Buyer) =>
      valuateCarForBuyer(
        buyer,
        FLAGSHIP_CAR,
        car,
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        CONTEXT.partsTaxonomyById,
        100,
        ECONOMY,
      )

    const showCrowdValue = valueFor(showCrowdBuyer)
    const tunerValue = valueFor(tunerBuyer)
    const dailyDriversValue = valueFor(dailyDriversBuyer)

    expect(ECONOMY.valuation.tolerance['show-crowd']).toBe(0)
    expect(ECONOMY.valuation.tolerance.tuner).toBe(0.5)
    expect(showCrowdValue).toBeGreaterThan(tunerValue)
    expect(tunerValue).toBeGreaterThan(dailyDriversValue)
  })

  it('all three agree exactly on a stock car - there is no discount for tolerance to differ on', () => {
    const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, {}, 'mint')
    const valueFor = (buyer: Buyer) =>
      valuateCarForBuyer(
        buyer,
        FLAGSHIP_CAR,
        car,
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        CONTEXT.partsTaxonomyById,
        100,
        ECONOMY,
      )
    expect(valueFor(showCrowdBuyer)).toBe(valueFor(tunerBuyer))
    expect(valueFor(tunerBuyer)).toBe(valueFor(dailyDriversBuyer))
  })
})

/**
 * The rename trap (scene-standing-arc.md): `coherenceToleranceFor`
 * (valuation.ts) hardcodes archetype strings and `economy.valuation.tolerance`
 * keys on the same strings, in two separate places that typecheck cannot
 * cross-check against each other - a renamed archetype whose branch string
 * and JSON key drift apart falls through to `default` silently, with no
 * error anywhere. This locks down, for all SIX shipped archetypes at once,
 * exactly which tolerance each one resolves to, so a future rename that
 * breaks this resolution fails here rather than shipping quietly.
 *
 * Isolates tolerance from taste the same way the describe block above does
 * (trivial statTargets, so tasteMultiplier is the constant `1 + tasteSpread`
 * regardless of archetype), then reconstructs the expected value by calling
 * `marketValueYen` directly with the EXPECTED tolerance and comparing against
 * `valuateCarForBuyer`'s real, buyer-driven result - if `coherenceToleranceFor`
 * ever resolved the wrong tolerance for an archetype, the two would diverge.
 */
describe('every archetype resolves to an authored tolerance, never the default by accident', () => {
  const trivialTargets = {
    power: { target: 0, importance: 1 },
    handling: { target: 0, importance: 1 },
    style: { target: 0, importance: 1 },
    reliability: { target: 0, importance: 1 },
    authenticity: { target: 0, importance: 1 },
  }

  // Two archetypes carry no explicit key in economy.json's tolerance object
  // at all - falling through to `default` is deliberate for them
  // (collector, racer, daily-drivers), not an accident. show-crowd, tuner and
  // touge are each authored explicitly.
  const EXPECTED_TOLERANCE: Record<BuyerArchetype, number> = {
    collector: ECONOMY.valuation.tolerance.default,
    tuner: ECONOMY.valuation.tolerance.tuner!,
    'show-crowd': ECONOMY.valuation.tolerance['show-crowd']!,
    racer: ECONOMY.valuation.tolerance.default,
    'daily-drivers': ECONOMY.valuation.tolerance.default,
    touge: ECONOMY.valuation.tolerance.touge!,
  }

  it.each(Object.entries(EXPECTED_TOLERANCE) as [BuyerArchetype, number][])(
    '%s resolves to its authored tolerance (%f) exactly',
    (archetype, expectedTolerance) => {
      const car = carWithGrades(FLAGSHIP_CAR, CONTEXT, { forcedInduction: 'race' }, 'mint')
      const buyer: Buyer = {
        id: `test-${archetype}`,
        archetype,
        displayName: 'Test',
        statTargets: trivialTargets,
        tierPreferences: [],
        culturePreferences: neutralCulturePreferences(),
        wantLine: 'test',
      }
      const actual = valuateCarForBuyer(
        buyer,
        FLAGSHIP_CAR,
        car,
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        CONTEXT.partsTaxonomyById,
        100,
        ECONOMY,
      )
      const expectedBaseValue = marketValueYen(
        FLAGSHIP_CAR,
        car,
        100,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        ECONOMY,
        expectedTolerance,
      )
      // Trivial targets clear every stat's shortfall to zero regardless of
      // archetype, so the taste match is always 1 and the multiplier is
      // always the ceiling `1 + tasteSpread` - the same constant for every
      // archetype, isolating tolerance as the only remaining variable.
      const tasteMultiplier = 1 + ECONOMY.valuation.tasteSpread
      expect(actual).toBe(Math.round(expectedBaseValue * tasteMultiplier))
    },
  )

  it('every real shipped buyer is covered - no archetype in BUYERS is missing from this guard', () => {
    const shippedArchetypes = new Set(BUYERS.map((b) => b.archetype))
    expect(new Set(Object.keys(EXPECTED_TOLERANCE))).toEqual(shippedArchetypes)
  })
})
