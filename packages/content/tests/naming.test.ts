import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'
import lapReferences from '../data/lapReferences.json'
import parts from '../data/parts.json'
import personas from '../data/personas.json'
import serviceJobs from '../data/serviceJobTemplates.json'
import storyMissions from '../data/storyMissions.json'
import {
  CarModelsSchema,
  LapReferencesSchema,
  PartCatalogEntriesSchema,
  PersonasSchema,
  REAL_BRANDS,
  REAL_MODEL_TOKENS,
  ServiceJobTypesSchema,
  StoryMissionsSchema,
  resolveCarBrand,
  resolveCarDisplayName,
} from '../src'

describe('naming layer: parody mode leaks no real-brand strings', () => {
  const parsedCars = CarModelsSchema.parse(cars)
  const realTokens = [...REAL_BRANDS, ...REAL_MODEL_TOKENS].map((t) => t.toLowerCase())

  it('every car resolves cleanly in parody mode', () => {
    for (const model of parsedCars) {
      const name = resolveCarDisplayName(model, 'parody').toLowerCase()
      const brand = resolveCarBrand(model, 'parody').toLowerCase()
      for (const token of realTokens) {
        expect(name.includes(token), `${model.id} parody name "${name}" leaks "${token}"`).toBe(
          false,
        )
        expect(brand.includes(token), `${model.id} parody brand "${brand}" leaks "${token}"`).toBe(
          false,
        )
      }
    }
  })

  it('parody mode differs from real mode for every car', () => {
    for (const model of parsedCars) {
      expect(resolveCarDisplayName(model, 'parody')).not.toBe(resolveCarDisplayName(model, 'real'))
      expect(resolveCarBrand(model, 'parody')).not.toBe(resolveCarBrand(model, 'real'))
    }
  })

  it('no part brand collides with a real car brand', () => {
    const parsedParts = PartCatalogEntriesSchema.parse(parts)
    const realBrandsLower = REAL_BRANDS.map((b) => b.toLowerCase())
    for (const part of parsedParts) {
      expect(realBrandsLower.includes(part.brand.toLowerCase())).toBe(false)
    }
  })

  /**
   * Sprint 10 item 2: a job's customer description once named a specific
   * model that didn't match the car the job actually attached to. The fix
   * made every description car-agnostic; this guards against that
   * mismatch recurring by ensuring no flavor line names a car at all.
   */
  it('no service-job flavor line references a specific car model or brand', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    for (const type of parsedTypes) {
      for (const line of type.flavorPool) {
        const text = line.toLowerCase()
        for (const token of realTokens) {
          expect(text.includes(token), `job type "${type.id}" flavor line leaks "${token}"`).toBe(
            false,
          )
        }
      }
    }
  })

  /**
   * Sprint 76 (story missions I): the hand-authored campaign's own copy
   * (mission request/delivered/lapsed lines, persona intros) is exactly the
   * kind of player-facing text the naming layer exists to protect - extends
   * the same leak guard rather than a second, parallel one.
   */
  it('no story-mission copy references a specific car model or brand', () => {
    const parsedMissions = StoryMissionsSchema.parse(storyMissions)
    for (const mission of parsedMissions) {
      const fields = [
        mission.title,
        mission.requestCopy,
        mission.deliveredCopy,
        mission.overdeliveredCopy,
        mission.lapsedCopy,
      ]
      for (const field of fields) {
        const text = field.toLowerCase()
        for (const token of realTokens) {
          expect(text.includes(token), `mission "${mission.id}" copy leaks "${token}"`).toBe(false)
        }
      }
    }
  })

  it('no persona copy references a specific car model or brand', () => {
    const parsedPersonas = PersonasSchema.parse(personas)
    for (const persona of parsedPersonas) {
      const text = `${persona.name} ${persona.intro}`.toLowerCase()
      for (const token of realTokens) {
        expect(text.includes(token), `persona "${persona.id}" copy leaks "${token}"`).toBe(false)
      }
    }
  })

  /**
   * Sprint 77 (story missions II): the reference-lap board's fictional
   * comparable names (a shop car, a touge regular's build, a magazine
   * feature car) are diegetic flavour text, so they get the same guard.
   */
  it('no lap-reference entry name references a specific car model or brand', () => {
    const parsedLapReferences = LapReferencesSchema.parse(lapReferences)
    for (const entry of parsedLapReferences) {
      const text = entry.name.toLowerCase()
      for (const token of realTokens) {
        expect(text.includes(token), `lap reference "${entry.id}" name leaks "${token}"`).toBe(
          false,
        )
      }
    }
  })
})
