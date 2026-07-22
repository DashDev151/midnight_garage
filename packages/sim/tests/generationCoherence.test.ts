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

/** The worst band on any real installed part - the "how rough is this car". */
function worstBand(car: CarInstance): string {
  let worst = 'mint'
  for (const partId of ALL_CAR_PART_IDS) {
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
  })

  /**
   * A symptom's cause sets its part to the worse of its current band and
   * the cause's own `setBand`, regardless of mileage - the entire point
   * of a symptom is a surprising, otherwise-inexplicable fault on a car
   * that looks fine everywhere else (a smoking engine on a genuinely
   * low-mileage example is exactly the scenario symptoms exist to
   * create). That is a deliberate exception to THIS test's wear-model
   * coherence claim, not a violation of it - cars that rolled a symptom
   * are excluded from the sample so this keeps checking the age/mileage/
   * upkeep chain alone (directive 17 case (a)).
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
      )
      if (car.mileageKm > 15_000) continue // only the barely-driven tail
      if (car.symptoms.length > 0) continue // a symptom is a deliberate exception, not wear
      sampled++
      // `worn` is the floor for a nearly-new car; `poor`/`scrap` are the bug.
      expect(
        bandIndex(worstBand(car) as never),
        `${car.mileageKm} km car rolled ${worstBand(car)} - a barely-driven car cannot be worn out`,
      ).toBeGreaterThanOrEqual(bandIndex('worn'))
    }
    expect(sampled, 'expected some low-mileage cars in the sample').toBeGreaterThan(0)
  })

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
  })

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
