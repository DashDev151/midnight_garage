import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'
import { CarModelsSchema } from '../src/schemas'

describe('content data', () => {
  it('cars.json validates against CarModelsSchema', () => {
    const result = CarModelsSchema.safeParse(cars)
    if (!result.success) {
      throw new Error(result.error.message)
    }
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('car ids are unique', () => {
    const parsed = CarModelsSchema.parse(cars)
    const ids = parsed.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
