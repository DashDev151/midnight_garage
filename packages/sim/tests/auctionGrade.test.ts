import { CARS, PARTS, PARTS_TAXONOMY, type CarInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeAuctionGrade } from '../src/auctionGrade'
import { buildSimContext } from '../src/context'
import { buildCarInstance, groupCarParts, uniformCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)
// honda-city-e-aa is NA (Sprint 32 fixture convention): forcedInduction
// generates genuinely empty, never a "missing" defect for that model.
const MODEL = CONTEXT.modelsById['honda-city-e-aa']!

function grade(car: CarInstance) {
  return computeAuctionGrade(car, MODEL, CONTEXT.partIdsByGroup)
}

describe('computeAuctionGrade (Sprint 50)', () => {
  it('grades an all-mint car S/A/A', () => {
    const car = buildCarInstance({ modelId: MODEL.id, parts: uniformCarParts('mint') })
    expect(grade(car)).toEqual({ overall: 'S', exterior: 'A', interior: 'A' })
  })

  it('grades an all-poor car with a low overall number and D/D letters', () => {
    const car = buildCarInstance({ modelId: MODEL.id, parts: uniformCarParts('poor') })
    const result = grade(car)
    expect(result.exterior).toBe('D')
    expect(result.interior).toBe('D')
    expect(['1', '2']).toContain(result.overall)
  })

  it('a legitimately-absent forced-induction slot on an NA car never counts as a defect', () => {
    const car = buildCarInstance({
      modelId: MODEL.id,
      parts: { ...uniformCarParts('mint'), forcedInduction: { installed: null } },
    })
    expect(car.parts.forcedInduction.installed).toBeNull()
    expect(grade(car).overall).toBe('S')
  })

  describe('the mechanical/exterior/interior partition (no double-counting)', () => {
    it('a scrap or missing part in a MECHANICAL group forces R, but never touches the letter grades', () => {
      const scrapEngine = buildCarInstance({
        modelId: MODEL.id,
        parts: groupCarParts({ engine: 'scrap' }),
      })
      expect(grade(scrapEngine)).toEqual({ overall: 'R', exterior: 'A', interior: 'A' })

      const missingDrivetrain = buildCarInstance({
        modelId: MODEL.id,
        parts: { ...uniformCarParts('mint'), gearbox: { installed: null } },
      })
      expect(grade(missingDrivetrain)).toEqual({ overall: 'R', exterior: 'A', interior: 'A' })
    })

    it('a scrap or missing part in body/wheels/interior changes ONLY the matching letter grade, never the overall number', () => {
      const scrapBody = buildCarInstance({
        modelId: MODEL.id,
        parts: groupCarParts({ body: 'scrap' }),
      })
      const scrapBodyGrade = grade(scrapBody)
      expect(scrapBodyGrade.overall).not.toBe('R')
      expect(scrapBodyGrade.exterior).toBe('E')
      expect(scrapBodyGrade.interior).toBe('A')

      const missingInterior = buildCarInstance({
        modelId: MODEL.id,
        parts: { ...uniformCarParts('mint'), seats: { installed: null } },
      })
      const missingInteriorGrade = grade(missingInterior)
      expect(missingInteriorGrade.overall).not.toBe('R')
      expect(missingInteriorGrade.exterior).toBe('A')
      expect(missingInteriorGrade.interior).toBe('E')
    })

    it('a worn wheel drags exterior down even when body itself is mint, and never moves the overall number', () => {
      const car = buildCarInstance({ modelId: MODEL.id, parts: groupCarParts({ wheels: 'worn' }) })
      const result = grade(car)
      expect(result.exterior).toBe('C')
      expect(result.interior).toBe('A')
      expect(result.overall).toBe('S')
    })

    it('poor mechanical groups alongside a mint body/interior read a low overall number but a clean A/A letter grade', () => {
      const car = buildCarInstance({
        modelId: MODEL.id,
        parts: groupCarParts({ engine: 'poor', drivetrain: 'poor', suspension: 'poor' }),
      })
      const result = grade(car)
      expect(['1', '2']).toContain(result.overall)
      expect(result.exterior).toBe('A')
      expect(result.interior).toBe('A')
    })
  })
})
