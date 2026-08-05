import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type Grade,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'
import { isTasteMatched } from '../src/valuation'
import { carWithGrades } from './testFixtures'

/**
 * The measurement sprint182.md is built to prove (Stage E v5 amendment,
 * sale-value-system.md): a generated car can no longer match most scenes
 * untouched. Before this sprint, 94 per cent of 400 real generated auction
 * lots matched at least one scene on arrival, and a full restoration to
 * mint stock parts still left every one of them matching something - a
 * weighted average can never disqualify anything. The champion gate and the
 * culture multiplier are what let a buyer refuse a car, and the whole point
 * is that MATCHED should read as a genuine progression across a build, not
 * three flat near-100s.
 *
 * This is asserted as a GRADIENT rather than pinned percentages - the
 * design's own measurement lands near 9 / 37 / 89 per cent of cars matching
 * at least one scene at arrival / restored / built, but that exact
 * shape depends on the generator's roll distribution and the roster mix,
 * neither of which this test exists to pin. What it must prove, and what
 * the pre-sprint182 mean-only formula could never produce, is that arrival
 * sits well below restored, and restored sits well below built. A test that
 * only checked "some cars are unmatched" would have passed against the old
 * flat behaviour too, since a handful of cars always failed the old
 * weighted mean - the gradient is the part only a real gate can produce.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const LOT_COUNT = 400

/** `lot` restored to mint using only stock parts - no aftermarket grade
 * anywhere, the "nothing but a restoration" stage the design measures. */
function restoredStockMint(model: CarModel): CarInstance {
  return carWithGrades(model, CONTEXT, {}, 'mint')
}

/** `lot` built to sport grade in every slot that has a sport-grade catalog
 * SKU for this model's fitment class; a slot with no sport-grade option
 * (an absent forced-induction slot on an NA car, for instance) stays a mint
 * stock part rather than being left worn - this is a BUILD stage, not a
 * neglect one. */
function builtSport(model: CarModel): CarInstance {
  const sportEverywhere = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => [partId, 'sport' as Grade]),
  )
  return carWithGrades(model, CONTEXT, sportEverywhere, 'mint')
}

interface StageMeasurement {
  /** Fraction of lots matching at least one of the six scenes. */
  atLeastOneFraction: number
  /** Mean number of the six scenes matched per lot. */
  meanScenesMatched: number
}

function measureStage(
  lots: readonly { model: CarModel; car: CarInstance }[],
  toCar: (model: CarModel, generated: CarInstance) => CarInstance,
): StageMeasurement {
  let atLeastOne = 0
  let totalMatched = 0
  for (const lot of lots) {
    const car = toCar(lot.model, lot.car)
    let matchedAny = false
    for (const buyer of BUYERS) {
      if (isTasteMatched(buyer, lot.model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)) {
        totalMatched++
        matchedAny = true
      }
    }
    if (matchedAny) atLeastOne++
  }
  return {
    atLeastOneFraction: atLeastOne / lots.length,
    meanScenesMatched: totalMatched / lots.length,
  }
}

describe('the champion gate and culture multiplier produce a real matched gradient (sprint182.md)', () => {
  const lots = Array.from({ length: LOT_COUNT }, (_, i) => {
    const model = CARS[i % CARS.length]!
    const car = generateAuctionCarInstance(model, `gradient-lot-${i}`, createRng(i), CONTEXT)
    return { model, car }
  })

  const arrival = measureStage(lots, (_model, car) => car)
  const restored = measureStage(lots, (model) => restoredStockMint(model))
  const built = measureStage(lots, (model) => builtSport(model))

  it('matches almost nothing on arrival - a generated lot is not pre-matched to whoever turns up', () => {
    // Measured against the design's own 9 per cent: bounded loosely so a
    // roster or generator change does not make this brittle, but tight
    // enough that the old ~94 per cent flat-average behaviour fails it hard.
    expect(arrival.atLeastOneFraction).toBeLessThan(0.25)
  })

  it('restoring to stock mint recovers real ground, but not everything - the gate still bites on an unbuilt car', () => {
    expect(restored.atLeastOneFraction).toBeGreaterThan(arrival.atLeastOneFraction + 0.2)
    // The old formula reached 100 per cent here (a stock mint car clears
    // every buyer's mean for free); the gate keeps this stage well short of
    // that, because a stock car is nobody's specialist build.
    expect(restored.atLeastOneFraction).toBeLessThan(0.85)
  })

  it('a sport build clears the bar for most cars - the progression completes', () => {
    expect(built.atLeastOneFraction).toBeGreaterThan(restored.atLeastOneFraction + 0.2)
    expect(built.atLeastOneFraction).toBeGreaterThan(0.6)
  })

  it('the mean number of scenes matched rises the same way, arrival well below restored well below built', () => {
    expect(restored.meanScenesMatched).toBeGreaterThan(arrival.meanScenesMatched + 0.2)
    expect(built.meanScenesMatched).toBeGreaterThan(restored.meanScenesMatched + 0.5)
  })

  it('every stage produces a real, finite measurement (sanity: the sample is not degenerate)', () => {
    for (const stage of [arrival, restored, built]) {
      expect(stage.atLeastOneFraction).toBeGreaterThanOrEqual(0)
      expect(stage.atLeastOneFraction).toBeLessThanOrEqual(1)
      expect(Number.isFinite(stage.meanScenesMatched)).toBe(true)
    }
  })
})
