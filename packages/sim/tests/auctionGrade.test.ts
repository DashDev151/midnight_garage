import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeAuctionGrade } from '../src/auctionGrade'
import { buildSimContext, type SimContext } from '../src/context'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

// honda-city-e-aa: the roster's cheapest model (shitbox tier, book
// Y180,000), naturally aspirated so its forcedInduction slot is
// legitimately absent rather than a genuine defect (isPartMissing,
// sim/bands.ts).
const MODEL = CONTEXT.modelsById['honda-city-e-aa']!
// honda-civic-sir2-eg6: a mid-priced roster model (common tier, book
// Y650,000) - big enough that one cheap wheel replacement stays a small
// slice of its book value, unlike on the roster's cheapest car.
const MID_MODEL = CONTEXT.modelsById['honda-civic-sir2-eg6']!
// toyota-supra-rz-jza80: a high-value roster model (rare tier, book
// Y4,200,000) - the expensive end of the imbalance probe below.
const EXPENSIVE_MODEL = CONTEXT.modelsById['toyota-supra-rz-jza80']!

function grade(car: CarInstance, model: CarModel = MODEL) {
  return computeAuctionGrade(car, model, CONTEXT)
}

describe('computeAuctionGrade', () => {
  it('grades an all-mint car S, with every letter A', () => {
    const car = buildCarInstance({ modelId: MODEL.id, parts: uniformCarParts('mint') })
    expect(grade(car)).toEqual({ overall: 'S', mechanical: 'A', exterior: 'A', interior: 'A' })
  })

  it('a scrap wheel steps down its own area letter without cratering the overall', () => {
    const car = buildCarInstance({ modelId: MID_MODEL.id, parts: mintCarParts({ rims: 'scrap' }) })
    const result = grade(car, MID_MODEL)
    expect(result.mechanical).toBe('A')
    expect(result.interior).toBe('A')
    // Six exterior parts (4 body + rims + tyres), one scrap: average band
    // index (4 mint * 4 + 0 scrap + 1 mint * 4) / 6 = 3.33, rounds to B,
    // then steps down one letter for the scrap part to C.
    expect(result.exterior).toBe('C')
    // A Y30,000 wheel against a Y650,000 book value is a 4.6% bill -
    // comfortably inside the S/6/5 band, nowhere near what a
    // worst-single-part rule would have produced.
    expect(result.overall).toBe('5')
  })

  it('a scrap mechanical part forces R and its own letter reflects the wreckage', () => {
    const car = buildCarInstance({ modelId: MODEL.id, parts: mintCarParts({ block: 'scrap' }) })
    const result = grade(car)
    expect(result.overall).toBe('R')
    // 21 mechanical parts, one scrap: average (20 mint * 4) / 21 = 3.81,
    // rounds to A, then steps down one letter for the scrap part to B.
    expect(result.mechanical).toBe('B')
    expect(result.exterior).toBe('A')
    expect(result.interior).toBe('A')
  })

  it('the same worn interior grades a cheap model worse than an expensive one, though both read the same letter', () => {
    const wornInterior = mintCarParts({ seats: 'worn', dashGauges: 'worn' })
    const cheapCar = buildCarInstance({ modelId: MODEL.id, parts: wornInterior })
    const expensiveCar = buildCarInstance({ modelId: EXPENSIVE_MODEL.id, parts: wornInterior })
    const cheapGrade = grade(cheapCar, MODEL)
    const expensiveGrade = grade(expensiveCar, EXPENSIVE_MODEL)

    // Same parts at the same bands: the same STATE claim, so the same letter.
    expect(cheapGrade.interior).toBe(expensiveGrade.interior)
    expect(cheapGrade.interior).toBe('C')

    // The identical yen repair bill is a much bigger slice of the cheap
    // model's own book value than of the expensive one's, so the priced
    // overall - never the letter - carries the imbalance.
    const OVERALL_RANK: readonly string[] = ['S', '6', '5', '4.5', '4', '3.5', '3', '2', '1']
    expect(OVERALL_RANK.indexOf(cheapGrade.overall)).toBeGreaterThan(
      OVERALL_RANK.indexOf(expensiveGrade.overall),
    )
    expect(cheapGrade.overall).toBe('5')
    expect(expensiveGrade.overall).toBe('S')
  })

  it("an NA car's empty forced-induction slot grades identically to a fully-mint car", () => {
    const car = buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ forcedInduction: null }),
    })
    expect(car.parts.forcedInduction.installed).toBeNull()
    expect(grade(car)).toEqual({ overall: 'S', mechanical: 'A', exterior: 'A', interior: 'A' })
  })

  it('an area with no parts assigned to it reads A regardless of the car beneath it', () => {
    const emptyInteriorContext: SimContext = {
      ...CONTEXT,
      partIdsByGroup: { ...CONTEXT.partIdsByGroup, interior: [] },
    }
    const car = buildCarInstance({ modelId: MODEL.id, parts: uniformCarParts('scrap') })
    expect(computeAuctionGrade(car, MODEL, emptyInteriorContext).interior).toBe('A')
  })

  it('a genuinely missing mechanical part counts as scrap for its letter and also forces R', () => {
    const car = buildCarInstance({ modelId: MODEL.id, parts: mintCarParts({ gearbox: null }) })
    const result = grade(car)
    expect(result.overall).toBe('R')
    // Same 21-part mechanical average as the scrap-block case above: one
    // part contributes 0 instead of 4, giving B after the step-down.
    expect(result.mechanical).toBe('B')
    expect(result.exterior).toBe('A')
    expect(result.interior).toBe('A')
  })

  it('a genuinely missing non-mechanical part counts as scrap for its letter but never forces R', () => {
    const car = buildCarInstance({ modelId: MODEL.id, parts: mintCarParts({ seats: null }) })
    const result = grade(car)
    expect(result.overall).not.toBe('R')
    expect(result.overall).toBe('5')
    expect(result.mechanical).toBe('A')
    expect(result.exterior).toBe('A')
    // Two interior parts, one genuinely missing: average (0 + 4) / 2 = 2,
    // rounds to C, then steps down one letter for the missing part to D.
    expect(result.interior).toBe('D')
  })
})
