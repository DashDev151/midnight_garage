import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { PANEL_ZONE_IDS } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { stocknessOf } from '../src/derivedStats'
import { createRng, hashStringToSeed } from '../src/rng'

/**
 * Generation's own paint history (docs/design/systems/paint-system-design.md,
 * "Generation: five states, never random per zone"): every car leaves the lot
 * wearing a real colour, one of a whole-car roll rather than an independent
 * draw per zone, so a mismatch can never be more than one panel.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GAME_YEAR = 1995
const SEEDS_PER_MODEL = 20

function carsAcrossRoster(): CarInstance[] {
  const cars: CarInstance[] = []
  for (const model of CARS) {
    for (let seed = 0; seed < SEEDS_PER_MODEL; seed++) {
      const key = `paint-generation-${model.id}-${seed}`
      cars.push(
        generateAuctionCarInstance(
          model,
          key,
          createRng(hashStringToSeed(key)),
          CONTEXT,
          GAME_YEAR,
        ),
      )
    }
  }
  return cars
}

describe('a car generates wearing a colour', () => {
  it('rolls a factoryColour that is one of the model’s own pool entries', () => {
    for (const model of CARS) {
      const pool = new Set(model.spec.factoryColours)
      for (let seed = 0; seed < SEEDS_PER_MODEL; seed++) {
        const key = `paint-pool-${model.id}-${seed}`
        const car = generateAuctionCarInstance(
          model,
          key,
          createRng(hashStringToSeed(key)),
          CONTEXT,
          GAME_YEAR,
        )
        expect(pool.has(car.factoryColour), `${model.id} seed ${seed}`).toBe(true)
      }
    }
  })

  it('paints at least one panel zone on every generated car - the retired all-bare state is gone', () => {
    for (const car of carsAcrossRoster()) {
      const painted = PANEL_ZONE_IDS.some((zoneId) => car.zoneState![zoneId].colour != null)
      expect(painted, car.id).toBe(true)
    }
  })
})

describe('the anti-clown rule: a mismatch is always exactly one zone', () => {
  /**
   * Never more than one panel zone reads outside the car's own factory set,
   * or primed, UNLESS every zone shares one uniform colour outside that set
   * (a whole-car respray, which disagrees with nobody). Covers all five
   * outcomes at once: original and factory two-tone read zero here (every
   * zone is in the set); resprayed is caught by the uniform-respray carve-out;
   * mismatchedPanel and primedPanel each read exactly one.
   */
  it('never lands three panels disagreeing, over the whole roster and many seeds', () => {
    let sawMismatch = 0
    let sawPrimed = 0
    let sawResprayed = 0
    for (const car of carsAcrossRoster()) {
      const factorySet = new Set(car.factoryColour.split('+'))
      const zones = PANEL_ZONE_IDS.map((zoneId) => car.zoneState![zoneId])
      const definedColours = zones.map((z) => z.colour).filter((c): c is string => c != null)
      const uniformOutOfSet =
        definedColours.length === zones.length &&
        definedColours.every((c) => c === definedColours[0]) &&
        !factorySet.has(definedColours[0]!)
      if (uniformOutOfSet) {
        sawResprayed += 1
        continue
      }
      const outOfSetCount = zones.filter(
        (z) => z.colour != null && !factorySet.has(z.colour),
      ).length
      const primedCount = zones.filter((z) => z.primed).length
      expect(outOfSetCount + primedCount, car.id).toBeLessThanOrEqual(1)
      if (outOfSetCount === 1) sawMismatch += 1
      if (primedCount === 1) sawPrimed += 1
    }
    // Reachability: over this many draws, every non-original outcome should
    // actually turn up at least once.
    expect(sawResprayed, 'resprayed reachable').toBeGreaterThan(0)
    expect(sawMismatch, 'mismatched panel reachable').toBeGreaterThan(0)
    expect(sawPrimed, 'primed panel reachable').toBeGreaterThan(0)
  })

  it('the same seed produces the same paint state every time (determinism)', () => {
    const model = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86') ?? CARS[0]!
    const key = 'paint-determinism'
    const a = generateAuctionCarInstance(
      model,
      key,
      createRng(hashStringToSeed(key)),
      CONTEXT,
      GAME_YEAR,
    )
    const b = generateAuctionCarInstance(
      model,
      key,
      createRng(hashStringToSeed(key)),
      CONTEXT,
      GAME_YEAR,
    )
    expect(a.factoryColour).toBe(b.factoryColour)
    expect(a.zoneState).toEqual(b.zoneState)
    expect(a.parts.paint.installed?.partId).toBe(b.parts.paint.installed?.partId)
  })
})

describe('a factory two-tone car never reads as damaged', () => {
  it('the AE86, rolled into its authored white+black scheme, has both colours in the factory set and no mismatch penalty', () => {
    const model = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!
    let sawTwoTone = false
    for (let seed = 0; seed < 300; seed++) {
      const key = `ae86-two-tone-${seed}`
      const car = generateAuctionCarInstance(
        model,
        key,
        createRng(hashStringToSeed(key)),
        CONTEXT,
        GAME_YEAR,
      )
      if (!car.factoryColour.includes('+')) continue
      const factorySet = new Set(car.factoryColour.split('+'))
      const zoneColours = PANEL_ZONE_IDS.map((zoneId) => car.zoneState![zoneId].colour).filter(
        (c): c is string => c != null,
      )
      // Isolate the `original` draw specifically: every zone in the factory
      // set, all five painted. A mismatched or primed draw on this same
      // two-tone car is a different, legitimately-penalised state, not what
      // this test is about.
      const allInSet =
        zoneColours.length === PANEL_ZONE_IDS.length && zoneColours.every((c) => factorySet.has(c))
      if (!allInSet) continue
      sawTwoTone = true
      // Both halves of the authored scheme actually appear on the car, not
      // just one repeated - proving the split is real, not incidental.
      expect(new Set(zoneColours).size, car.id).toBe(2)
    }
    expect(sawTwoTone, 'a genuine two-tone original AE86 should turn up in 300 seeds').toBe(true)
  })
})

describe('generation installs the paint SKU the rolled state implies', () => {
  it('a resprayed car has lost the paint slot’s authenticity weight; refitting stock wins it back', () => {
    const model = CARS.find((c) => c.id === 'honda-city-e-aa')!
    const fitmentClass = fitmentClassForTier(model.tier)
    let sawResprayed = false
    let sawOriginal = false
    for (let seed = 0; seed < 200 && !(sawResprayed && sawOriginal); seed++) {
      const key = `paint-authenticity-${seed}`
      const car = generateAuctionCarInstance(
        model,
        key,
        createRng(hashStringToSeed(key)),
        CONTEXT,
        GAME_YEAR,
      )
      const installed = car.parts.paint.installed!
      const catalogPart = CONTEXT.partsById[installed.partId]!
      const stockPaint = CONTEXT.stockPartByCarPartId[fitmentClass]!.paint!

      if (catalogPart.grade === 'stock') {
        sawOriginal = true
        // Already stock: refitting the identical stock SKU changes nothing.
        const before = stocknessOf(car, model, CONTEXT.partsById, CONTEXT.partsTaxonomy)
        const refitted: CarInstance = {
          ...car,
          parts: { ...car.parts, paint: { installed: { ...installed, partId: stockPaint.id } } },
        }
        const after = stocknessOf(refitted, model, CONTEXT.partsById, CONTEXT.partsTaxonomy)
        expect(after).toBe(before)
        continue
      }

      sawResprayed = true
      expect(catalogPart.grade, 'a generated respray is always the cheap street job').toBe('street')
      const before = stocknessOf(car, model, CONTEXT.partsById, CONTEXT.partsTaxonomy)
      const refitted: CarInstance = {
        ...car,
        parts: { ...car.parts, paint: { installed: { ...installed, partId: stockPaint.id } } },
      }
      const after = stocknessOf(refitted, model, CONTEXT.partsById, CONTEXT.partsTaxonomy)
      expect(after, `${car.id} stockness after refitting stock paint`).toBeGreaterThan(before)
    }
    expect(sawResprayed, 'a resprayed honda-city-e-aa should turn up in 200 seeds').toBe(true)
    expect(sawOriginal, 'an original honda-city-e-aa should turn up in 200 seeds').toBe(true)
  })
})
