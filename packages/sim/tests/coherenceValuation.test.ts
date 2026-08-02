import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type Buyer,
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
import { carWithGrades } from './testFixtures'

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

describe('the tolerance ruling: the stancer is exempt, the tuner is halved, against a first-timer', () => {
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
  const stancerBuyer: Buyer = {
    id: 'test-stancer',
    archetype: 'stancer',
    displayName: 'Test Stancer',
    statTargets: trivialTargets,
    tierPreferences: [],
    wantLine: 'test',
  }
  const tunerBuyer: Buyer = { ...stancerBuyer, id: 'test-tuner', archetype: 'tuner' }
  // 'first-timer' carries no override in valuation.tolerance, so it reads
  // the same `default` (1.0) every buyer-agnostic caller uses.
  const firstTimerBuyer: Buyer = {
    ...stancerBuyer,
    id: 'test-first-timer',
    archetype: 'first-timer',
  }

  it('stancer > tuner > first-timer, on the same incoherent car, taste held constant', () => {
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

    const stancerValue = valueFor(stancerBuyer)
    const tunerValue = valueFor(tunerBuyer)
    const firstTimerValue = valueFor(firstTimerBuyer)

    expect(ECONOMY.valuation.tolerance.stancer).toBe(0)
    expect(ECONOMY.valuation.tolerance.tuner).toBe(0.5)
    expect(stancerValue).toBeGreaterThan(tunerValue)
    expect(tunerValue).toBeGreaterThan(firstTimerValue)
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
    expect(valueFor(stancerBuyer)).toBe(valueFor(tunerBuyer))
    expect(valueFor(tunerBuyer)).toBe(valueFor(firstTimerBuyer))
  })
})
