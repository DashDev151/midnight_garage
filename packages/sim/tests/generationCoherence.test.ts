import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance, wearExposure } from '../src/auctions'
import { bandIndex } from '../src/bands'
import { isBodyDerivedPart } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'

/**
 * Generated cars must be COHERENT - a car's condition, mileage, age and
 * flavour blurb have to describe the same vehicle. The failure mode this
 * guards: a `1995 · 11 km` Nissan 180SX with MOSTLY WORN parts and
 * "dealer trade-in, service history unknown" ("was that 11km driven on
 * the surface of the sun?").
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GAME_YEAR = 1995

/** The worst band on any real installed part - the "how rough is this car".
 * Excludes `panels`/`paint`: those two are derived from zone state
 * (`bodyPipeline.ts`), and the zone roll (docs/design/
 * workshop-rework.md's generation table) is TIER-weighted alone, independent
 * of age or mileage - a deliberate, separate generation axis this wave adds,
 * not a claim the wear-model coherence tests below are about. */
function worstBand(car: CarInstance): string {
  let worst = 'mint'
  for (const partId of ALL_CAR_PART_IDS) {
    if (isBodyDerivedPart(partId)) continue
    const band = car.parts[partId].installed?.band
    if (band && bandIndex(band) < bandIndex(worst as never)) worst = band
  }
  return worst
}

describe('wearExposure (Sprint 66)', () => {
  it('is 0 at zero mileage and 1 once thoroughly used, rising monotonically', () => {
    expect(wearExposure(0, ECONOMY)).toBe(0)
    expect(wearExposure(200_000, ECONOMY)).toBe(1)
    let previous = -1
    for (const km of [0, 5_000, 20_000, 60_000, 120_000, 200_000]) {
      const exposure = wearExposure(km, ECONOMY)
      expect(exposure).toBeGreaterThanOrEqual(previous)
      expect(exposure).toBeGreaterThanOrEqual(0)
      expect(exposure).toBeLessThanOrEqual(1)
      previous = exposure
    }
  })
})

describe('generated cars are coherent (Sprint 66, item 6a)', () => {
  it('never generates a car younger than AUCTION_MIN_AGE_YEARS when a real year is known', () => {
    for (const model of CARS) {
      for (let seed = 0; seed < 30; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `age-${model.id}-${seed}`,
          createRng(seed),
          CONTEXT,
          GAME_YEAR,
        )
        // A car can never predate its own model, so a model released inside
        // the window is the one legitimate exception.
        if (model.spec.yearFrom > GAME_YEAR - ECONOMY.AUCTION_MIN_AGE_YEARS) continue
        expect(GAME_YEAR - car.year).toBeGreaterThanOrEqual(ECONOMY.AUCTION_MIN_AGE_YEARS)
      }
    }
  }, 30_000)

  /**
   * The wear model alone, asked of it alone. Generation has two further,
   * deliberate damage stages after it, and neither is a claim about mileage:
   * a symptom's cause sets its part to the worse of its current band and the
   * cause's own `setBand` regardless of how far the car has been driven (the
   * whole point of a symptom is a surprising fault on a car that looks fine
   * everywhere else), and the damage budget spends a rolled grade's worth of
   * band steps on whatever the car has. `allowSymptoms: false` stops
   * generation exactly where this test's own claim ends, so the age -> mileage
   * -> condition chain is measured on its own rather than through a filter
   * that could never have excluded the budget anyway (directive 17 case (a)).
   */
  it('a barely-driven car is never rough from the wear model alone, at ANY upkeep tier', () => {
    const model = CARS.find((c) => c.id === 'nissan-180sx-rps13')
    if (!model) throw new Error('fixture car missing from seed content')

    let sampled = 0
    for (let seed = 0; seed < 600; seed++) {
      const car = generateAuctionCarInstance(
        model,
        `low-${seed}`,
        createRng(seed),
        CONTEXT,
        GAME_YEAR,
        true,
        0,
        false, // the wear model and the Law 2 ceiling, and nothing after them
      )
      if (car.mileageKm > 15_000) continue // only the barely-driven tail
      sampled++
      // `worn` is the floor for a nearly-new car; `poor`/`scrap` are the bug.
      expect(
        bandIndex(worstBand(car) as never),
        `${car.mileageKm} km car rolled ${worstBand(car)} - a barely-driven car cannot be worn out`,
      ).toBeGreaterThanOrEqual(bandIndex('worn'))
    }
    expect(sampled, 'expected some low-mileage cars in the sample').toBeGreaterThan(0)
  })

  /**
   * ...and the whole pipeline, on the claim that still holds there: a
   * barely-driven car is TYPICALLY tidy. The damage budget can put real
   * damage on a low-mileage car and is meant to - a barn find is exactly a
   * car with no miles and perished everything - but that is the tail, not the
   * shape. The original bug this file exists for (a `1995 - 11 km` 180SX with
   * mostly worn parts) is a claim about the typical car, and this measures it
   * as one: close to four in ten barely-driven cars carry nothing ruined at
   * all and nine in ten carry no more than four ruined slots out of 26.
   */
  it('a barely-driven car is typically tidy once every generation stage has run', () => {
    const model = CARS.find((c) => c.id === 'nissan-180sx-rps13')
    if (!model) throw new Error('fixture car missing from seed content')

    const ruinedCounts: number[] = []
    for (let seed = 0; seed < 4000; seed++) {
      const car = generateAuctionCarInstance(
        model,
        `low-full-${seed}`,
        createRng(seed),
        CONTEXT,
        GAME_YEAR,
      )
      if (car.mileageKm > 15_000) continue
      let ruined = 0
      for (const partId of ALL_CAR_PART_IDS) {
        if (isBodyDerivedPart(partId)) continue
        const band = car.parts[partId].installed?.band
        if (band && bandIndex(band) < bandIndex('worn')) ruined += 1
      }
      ruinedCounts.push(ruined)
    }
    expect(ruinedCounts.length, 'expected some low-mileage cars in the sample').toBeGreaterThan(500)

    const sorted = [...ruinedCounts].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!
    const mean = ruinedCounts.reduce((sum, n) => sum + n, 0) / ruinedCounts.length
    const noneRuined = ruinedCounts.filter((count) => count === 0).length / ruinedCounts.length
    // The retired core-loop floor put roughly twelve ruined slots on every one
    // of these cars regardless of mileage, which is what this bar catches.
    //
    // An exact-median bar (`median === 0`) would sit on a knife edge here: it
    // pins the tipping point of a distribution whose zero share is barely over
    // a third, so concentrating damage into a pattern flips it by moving that
    // share to 0.388 - the same total damage on fewer parts, which is the
    // whole point of concentrating it. The shape such a bar stands
    // for is asserted directly instead, and every bar below is measured rather
    // than relaxed: 0.388 with nothing ruined, median 1, p90 4, mean 1.558 of
    // the car's 26 ordinary slots - the nine-zone body model spreads the same
    // damage budget across four more zones than the six-zone one did, which
    // is why both the none-ruined share and the mean moved slightly against
    // the figures measured there.
    //
    // The tail thickened by exactly one slot when the damage pattern started
    // offsetting the condition roll, and it is concentration rather than
    // damage: run against the same seeds with
    // `patternConditionSwingPercent` at 0, these cars carry 29.73 band steps
    // apiece and a p90 of 3; at the shipped 7 they carry 29.98 and a p90 of 4.
    // Same damage, fewer slots, which is what a pattern is for.
    expect(noneRuined).toBeGreaterThan(0.37)
    expect(median).toBeLessThanOrEqual(1)
    expect(p90).toBeLessThanOrEqual(4)
    expect(mean).toBeLessThan(1.65)
  }, 30_000)

  it('still lets neglect bite hard on a thoroughly-used car (the model is scaled, not defanged)', () => {
    // Across the whole roster and a wide seed sweep, high-mileage cars must
    // still produce genuinely rough examples - exposure scales wear by use, it
    // does not remove it.
    let sawRoughHighMileage = false
    for (const model of CARS) {
      for (let seed = 0; seed < 40; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `high-${model.id}-${seed}`,
          createRng(seed),
          CONTEXT,
          GAME_YEAR,
        )
        if (car.mileageKm < 60_000) continue
        if (bandIndex(worstBand(car) as never) <= bandIndex('poor')) sawRoughHighMileage = true
      }
    }
    expect(sawRoughHighMileage).toBe(true)
  }, 30_000)

  it("a car's provenance blurb fits its age - a nearly-new car is never a barn find", () => {
    const OLD_ONLY = ['parked up for years', 'barn find', 'long-term collection', 'estate sale']
    for (const model of CARS) {
      for (let seed = 0; seed < 40; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `prov-${model.id}-${seed}`,
          createRng(seed),
          CONTEXT,
          GAME_YEAR,
        )
        const ageYears = GAME_YEAR - car.year
        if (ageYears >= 15) continue
        for (const phrase of OLD_ONLY) {
          expect(
            car.provenanceNote,
            `a ${ageYears}-year-old car claimed "${car.provenanceNote}"`,
          ).not.toContain(phrase)
        }
      }
    }
  })
})
