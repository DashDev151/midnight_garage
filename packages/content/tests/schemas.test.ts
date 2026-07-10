import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import equipment from '../data/equipment.json'
import facilities from '../data/facilities.json'
import hiddenIssues from '../data/hidden-issues.json'
import parts from '../data/parts.json'
import traits from '../data/traits.json'
import {
  BuyersSchema,
  CarModelsSchema,
  EquipmentsSchema,
  FacilitiesSchema,
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

  it('facilities.json', () => {
    const result = FacilitiesSchema.safeParse(facilities)
    if (!result.success) throw new Error(result.error.message)
    // Sprint 16: minReputationTier must line up one-for-one with bayPricesYen
    // for every bay kind — the schema's own refine already enforces this at
    // parse time; this just names the invariant for anyone reading the test.
    expect(result.data.service.minReputationTier.length).toBe(
      result.data.service.bayPricesYen.length,
    )
    expect(result.data.parking.minReputationTier.length).toBe(
      result.data.parking.bayPricesYen.length,
    )
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
