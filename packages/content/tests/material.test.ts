import { describe, expect, it } from 'vitest'
import materials from '../data/materials.json'
import { MaterialsSchema } from '../src'

describe('materials.json', () => {
  it('validates against the material schema, one entry per consumable SKU', () => {
    const result = MaterialsSchema.safeParse(materials)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(6)
    expect(new Set(result.data.map((m) => m.id)).size).toBe(6)
  })

  // Prices are signed economy values (pinned exactly, not merely checked positive).
  it('pins the six material prices exactly', () => {
    const priceById = Object.fromEntries(materials.map((m) => [m.id, m.priceYen]))
    expect(priceById).toEqual({
      filler: 1500,
      paper: 400,
      primer: 1200,
      paint: 2500,
      underseal: 2000,
      polish: 800,
    })
  })

  it('addresses each material to its consuming pipeline stage', () => {
    const stageById = Object.fromEntries(materials.map((m) => [m.id, m.stage]))
    expect(stageById).toEqual({
      filler: 'fillAndSand',
      paper: 'fillAndSand',
      primer: 'prime',
      paint: 'paint',
      underseal: 'paint',
      polish: 'polish',
    })
  })
})
