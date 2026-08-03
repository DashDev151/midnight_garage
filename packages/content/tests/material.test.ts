import { describe, expect, it } from 'vitest'
import materials from '../data/materials.json'
import { MaterialsSchema } from '../src'

describe('materials.json', () => {
  it('validates against the material schema, one entry per consumable SKU', () => {
    const result = MaterialsSchema.safeParse(materials)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(7)
    expect(new Set(result.data.map((m) => m.id)).size).toBe(7)
  })

  // Prices are signed economy values (pinned exactly, not merely checked positive).
  // Sized to the nine-zone body model so a full respray holds its own per-car
  // total rather than rising with the zone count: filler and paper divide over
  // six metal zones, the rest over all nine. `underseal` is deleted along with
  // the chassis zone it priced.
  it('pins the seven material prices exactly', () => {
    const priceById = Object.fromEntries(materials.map((m) => [m.id, m.priceYen]))
    expect(priceById).toEqual({
      filler: 1250,
      paper: 350,
      primer: 650,
      paint: 1400,
      'paint-metallic': 2750,
      'paint-pearl': 4150,
      polish: 450,
    })
  })

  it('addresses each material to its consuming pipeline stage', () => {
    const stageById = Object.fromEntries(materials.map((m) => [m.id, m.stage]))
    expect(stageById).toEqual({
      filler: 'fillAndSand',
      paper: 'fillAndSand',
      primer: 'prime',
      paint: 'paint',
      'paint-metallic': 'paint',
      'paint-pearl': 'paint',
      polish: 'polish',
    })
  })
})
