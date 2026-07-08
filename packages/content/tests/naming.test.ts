import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'
import parts from '../data/parts.json'
import {
  CarModelsSchema,
  PartsSchema,
  REAL_BRANDS,
  REAL_MODEL_TOKENS,
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
    const parsedParts = PartsSchema.parse(parts)
    const realBrandsLower = REAL_BRANDS.map((b) => b.toLowerCase())
    for (const part of parsedParts) {
      expect(realBrandsLower.includes(part.brand.toLowerCase())).toBe(false)
    }
  })
})
