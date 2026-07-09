import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import equipment from '../data/equipment.json'
import hiddenIssues from '../data/hidden-issues.json'
import parts from '../data/parts.json'
import traits from '../data/traits.json'
import {
  BuyersSchema,
  CarModelsSchema,
  EquipmentsSchema,
  HiddenIssuesSchema,
  PartsSchema,
  TraitDefinitionsSchema,
} from '../src'

describe('seed content validates against schemas', () => {
  it('cars.json', () => {
    const result = CarModelsSchema.safeParse(cars)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('parts.json', () => {
    const result = PartsSchema.safeParse(parts)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('buyers.json', () => {
    const result = BuyersSchema.safeParse(buyers)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('hidden-issues.json', () => {
    const result = HiddenIssuesSchema.safeParse(hiddenIssues)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('traits.json', () => {
    const result = TraitDefinitionsSchema.safeParse(traits)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('equipment.json', () => {
    const result = EquipmentsSchema.safeParse(equipment)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })
})

describe('seed content ids are unique', () => {
  it('car ids', () => {
    const ids = CarModelsSchema.parse(cars).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('part ids', () => {
    const ids = PartsSchema.parse(parts).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('buyer ids', () => {
    const ids = BuyersSchema.parse(buyers).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('hidden issue ids', () => {
    const ids = HiddenIssuesSchema.parse(hiddenIssues).map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('equipment ids', () => {
    const ids = EquipmentsSchema.parse(equipment).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
