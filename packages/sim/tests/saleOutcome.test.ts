import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type Buyer,
  type CarInstance,
  type CarModel,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { championStatFor, saleOutcomeFor } from '../src/valuation'
import { buildCarInstance, carWithGrades, mintCarParts, uniformCarParts } from './testFixtures'

/**
 * What reputation reads at a sale (progression bible, fifth amendment, and
 * `docs/sprints/sprint_archive/sprint184.md`): the buyer's own verdict on the car they were
 * handed, and nothing else. Two rungs, Satisfied and Delighted, plus the
 * honest third answer of nothing at all.
 */
const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

const collector = BUYERS.find((b) => b.id === 'collector')!
const dailyDrivers = BUYERS.find((b) => b.id === 'daily-drivers')!
const showCrowd = BUYERS.find((b) => b.id === 'show-crowd')!
const tuner = BUYERS.find((b) => b.id === 'tuner')!

const silvia = CARS.find((c) => c.id === 'nissan-silvia-s13')!
const civic = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!

function outcomeFor(buyer: Buyer, model: CarModel, car: CarInstance) {
  return saleOutcomeFor(buyer, model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
}

function statsFor(model: CarModel, car: CarInstance) {
  return computeDerivedStats(model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
}

/** A part instance for a named catalogue SKU, at mint - the same shape every
 * other fixture in this suite builds an aftermarket fitment from. */
function fitted(partId: string, id: string) {
  return { id, partId, band: 'mint' as const, origin: { kind: 'market' as const, day: 1 } }
}

/**
 * Loud, low and deliberately rough underneath: a show build on a Silvia with
 * a poor head and poor cooling. The same fixture `valuation.test.ts` proves
 * reaches the Show Crowd's style target, reused rather than re-derived.
 */
function roughShowCar(): CarInstance {
  return buildCarInstance({
    modelId: silvia.id,
    parts: mintCarParts({
      aero: fitted('frp-race-aero', 'x-aero'),
      rims: fitted('ronin-race-forged', 'x-rims'),
      seats: fitted('zashiki-race-buckets', 'x-seats'),
      dashGauges: fitted('sokudo-digital-race-dash', 'x-dash'),
      exhaust: fitted('suzaku-race-header-kit', 'x-exhaust'),
      headValvetrain: 'poor',
      cooling: 'poor',
    }),
  })
}

describe('saleOutcomeFor: the champion gate is the Satisfied bar', () => {
  it("returns nothing when the buyer's champion stat misses its target, however good the rest is", () => {
    // An all-poor car has no reliability, which is the only thing Daily
    // Drivers came for (importance 1, target 0.75).
    const rough = buildCarInstance({ modelId: civic.id, parts: uniformCarParts('poor') })
    expect(championStatFor(dailyDrivers)).toBe('reliability')
    expect(statsFor(civic, rough).reliability).toBeLessThan(
      dailyDrivers.statTargets.reliability.target * 100,
    )
    expect(outcomeFor(dailyDrivers, civic, rough)).toBe('nothing')
  })

  it('returns satisfied when the champion clears but some other stat they care about does not', () => {
    // All stock and all mint reads authenticity exactly 100, clearing the
    // Collector's 0.9. A stock Civic misses their power target (0.3 of the
    // 600 PS normalisation ceiling, i.e. 180 PS), so this is not Delighted.
    const authentic = buildCarInstance({ modelId: civic.id, parts: uniformCarParts('mint') })
    const stats = statsFor(civic, authentic)
    expect(stats.authenticity).toBe(100)
    expect(stats.power / ECONOMY.statFormulas.powerNormalizationCeiling).toBeLessThan(
      collector.statTargets.power.target,
    )
    expect(outcomeFor(collector, civic, authentic)).toBe('satisfied')
  })

  it('returns delighted when every stat the buyer cares about clears its target', () => {
    // The Show Crowd cares about style (target 0.82), power (0.2) and
    // handling (0.1) and nothing else: reliability and authenticity are both
    // importance 0, so a rough engine and a modified shell cost nothing.
    const show = roughShowCar()
    const stats = statsFor(silvia, show)
    expect(stats.style).toBeGreaterThanOrEqual(showCrowd.statTargets.style.target * 100)
    expect(outcomeFor(showCrowd, silvia, show)).toBe('delighted')
  })
})

describe('the definition of done: the same car, two buyers, two answers', () => {
  it('a rough show car earns full reputation from the Show Crowd and nothing from a Daily Driver', () => {
    const show = roughShowCar()
    // The Show Crowd never asked about reliability, so a poor head and poor
    // cooling are somebody else's problem.
    expect(showCrowd.statTargets.reliability.importance).toBe(0)
    expect(outcomeFor(showCrowd, silvia, show)).toBe('delighted')

    // The Daily Driver asked for exactly that and did not get it.
    expect(statsFor(silvia, show).reliability).toBeLessThan(
      dailyDrivers.statTargets.reliability.target * 100,
    )
    expect(outcomeFor(dailyDrivers, silvia, show)).toBe('nothing')
  })
})

describe('a builder can reach the top rung (what concours never allowed)', () => {
  it('a heavily modified car reaches delighted against a buyer whose targets it clears', () => {
    // The Tuner's authenticity importance is 0, so the originality this build
    // gives up costs it nothing: power, handling, style and reliability are
    // the whole of what they asked for. Concours, which this replaces, wanted
    // 85 of 100 authenticity points and an aftermarket block alone costs 18.
    const built = carWithGrades(silvia, CONTEXT, {
      block: 'race',
      internals: 'race',
      headValvetrain: 'race',
      camsTiming: 'race',
      intake: 'race',
      exhaust: 'race',
      ignitionEcu: 'race',
      forcedInduction: 'race',
      cooling: 'race',
      fuelSystem: 'race',
      gearbox: 'race',
      clutch: 'race',
      driveline: 'race',
      dampers: 'race',
      springs: 'race',
      antiRollBars: 'race',
      brakePadsDiscs: 'race',
      tyres: 'race',
      rims: 'race',
      aero: 'race',
      seats: 'race',
      dashGauges: 'race',
    })
    expect(tuner.statTargets.authenticity.importance).toBe(0)
    expect(statsFor(silvia, built).authenticity).toBeLessThan(85)
    expect(outcomeFor(tuner, silvia, built)).toBe('delighted')
  })
})

describe('the predicate reads targets only', () => {
  it('a stat at importance 0 can never hold a sale back, whatever the car scores on it', () => {
    // Every stat the Show Crowd ignores is authored at target 0 as well as
    // importance 0, so the two facts agree in shipped content; the rule the
    // predicate applies is importance, which is what a buyer "caring" means.
    for (const buyer of BUYERS) {
      for (const key of ['power', 'handling', 'style', 'reliability', 'authenticity'] as const) {
        if (buyer.statTargets[key].importance === 0) {
          expect(buyer.statTargets[key].target).toBe(0)
        }
      }
    }
  })

  it('the champion is always inside the set delighted has to clear, so the rungs can never invert', () => {
    // Champion is the highest importance, which is non-zero for every shipped
    // archetype - so Delighted always implies Satisfied by construction.
    for (const buyer of BUYERS) {
      expect(buyer.statTargets[championStatFor(buyer)].importance).toBeGreaterThan(0)
    }
  })
})
