import { CARS, ECONOMY, PARTS, PARTS_TAXONOMY, type CarModel } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeDerivedStats } from '../src/derivedStats'
import { marketValueYen } from '../src/marketValue'
import { buildCarInstance, mintCarParts } from './testFixtures'

/**
 * PERFORMANCE AND VALUE ARE INDEPENDENT, as an executable claim.
 *
 * A car is never worth more BECAUSE it is faster. `marketValueYen` enforces it
 * structurally by taking no derived stat at all: what it reads is the car's
 * book value, its tier, its mileage, market heat, and the condition and grade
 * of its parts. The only place a stat reaches a realised price is the taste
 * multiplier, which is bounded and decides which buyer pays where in a band,
 * never what the car is worth.
 *
 * The probe holds condition and fitted parts EXACTLY fixed - one and the same
 * `CarInstance` - and moves only the platform's own measured performance:
 * power, and the lateral pair the handling readout is built from. If value
 * ever started reading a stat, this is the test that would go red.
 */

const PARTS_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part]))
const TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<(typeof PARTS_TAXONOMY)[number]['id'], (typeof PARTS_TAXONOMY)[number]>

/** A shipped `common`-tier model, so the fixture's `common`-class stock parts
 * are the ones that fit it. */
const BASE_MODEL: CarModel = CARS.find((model) => model.tier === 'common')!

/** The same car with more engine and more grip, and NOTHING else touched. */
const FASTER_MODEL: CarModel = {
  ...BASE_MODEL,
  spec: {
    ...BASE_MODEL.spec,
    stockPowerPs: BASE_MODEL.spec.stockPowerPs * 2,
    lateralG97: 1.25,
    lateralG193: 1.35,
  },
}

const CAR = buildCarInstance({ modelId: BASE_MODEL.id, parts: mintCarParts() })

function statsFor(model: CarModel) {
  return computeDerivedStats(model, CAR, PARTS_BY_ID, PARTS_TAXONOMY, ECONOMY)
}

function valueFor(model: CarModel) {
  return marketValueYen(model, CAR, 100, PARTS_BY_ID, TAXONOMY_BY_ID, ECONOMY)
}

describe('value does not read performance', () => {
  it('the probe really does move the performance stats', () => {
    const before = statsFor(BASE_MODEL)
    const after = statsFor(FASTER_MODEL)
    expect(after.power).toBeGreaterThan(before.power)
    expect(after.handling).toBeGreaterThan(before.handling)
  })

  it('leaves market value untouched at identical condition and fitted parts', () => {
    expect(valueFor(FASTER_MODEL)).toBe(valueFor(BASE_MODEL))
  })
})
