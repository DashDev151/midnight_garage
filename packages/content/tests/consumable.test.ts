import { describe, expect, it } from 'vitest'
import consumableTins from '../data/consumableTins.json'
import paintTins from '../data/paintTins.json'
import { ConsumableTinsSchema, PaintTinsSchema, paintStockKey } from '../src'

describe('consumableTins.json', () => {
  it('validates against the schema, one tin per one-size consumable', () => {
    const result = ConsumableTinsSchema.safeParse(consumableTins)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(4)
    expect(new Set(result.data.map((t) => t.id)).size).toBe(4)
  })

  // Pinned exactly (directive 22): every price here is approval-gated.
  // `paper` alone is a pack of 10 rather than the per-use price times 4 the
  // other three still carry (docs/sprints/sprint222.md, "paper"): felt
  // behaviour is that paper stops running out in lockstep with the 4-use
  // filler tin, so one pack outlasts two filler tins rather than matching
  // one exactly.
  it('pins the four tin prices and use counts exactly', () => {
    const byId = Object.fromEntries(consumableTins.map((t) => [t.id, t]))
    expect(byId).toEqual({
      filler: { id: 'filler', name: 'Body filler tin', usesPerTin: 4, priceYen: 5000 },
      paper: { id: 'paper', name: 'Sanding paper pack', usesPerTin: 10, priceYen: 3200 },
      primer: { id: 'primer', name: 'Primer tin', usesPerTin: 9, priceYen: 5850 },
      polish: { id: 'polish', name: 'Polish tin', usesPerTin: 9, priceYen: 4050 },
    })
  })
})

describe('paintTins.json', () => {
  it('validates against the schema: three finishes times two sizes, nothing else', () => {
    const result = PaintTinsSchema.safeParse(paintTins)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(6)
    const keys = new Set(result.data.map((t) => `${t.finish}:${t.size}`))
    expect(keys.size).toBe(6)
  })

  // Pinned exactly (directive 22). The large tin is consistently cheaper per
  // zone than three of the small tin, rewarding committing to a full respray
  // up front without punishing a small touch-up buy.
  it('pins the six paint tin prices and use counts exactly', () => {
    const byKey = Object.fromEntries(paintTins.map((t) => [`${t.finish}:${t.size}`, t]))
    expect(byKey).toEqual({
      'solid:small': { finish: 'solid', size: 'small', usesPerTin: 3, priceYen: 4200 },
      'solid:large': { finish: 'solid', size: 'large', usesPerTin: 9, priceYen: 11350 },
      'metallic:small': { finish: 'metallic', size: 'small', usesPerTin: 3, priceYen: 8250 },
      'metallic:large': { finish: 'metallic', size: 'large', usesPerTin: 9, priceYen: 22300 },
      'pearl:small': { finish: 'pearl', size: 'small', usesPerTin: 3, priceYen: 12450 },
      'pearl:large': { finish: 'pearl', size: 'large', usesPerTin: 9, priceYen: 33600 },
    })
  })

  it('prices the large tin cheaper per zone than the small tin, for every finish', () => {
    for (const finish of ['solid', 'metallic', 'pearl']) {
      const small = paintTins.find((t) => t.finish === finish && t.size === 'small')!
      const large = paintTins.find((t) => t.finish === finish && t.size === 'large')!
      const perZoneSmall = small.priceYen / small.usesPerTin
      const perZoneLarge = large.priceYen / large.usesPerTin
      expect(perZoneLarge).toBeLessThan(perZoneSmall)
    }
  })
})

describe('paintStockKey', () => {
  it('combines finish and colour, not size', () => {
    expect(paintStockKey('solid', 'white')).toBe('paint:solid:white')
    expect(paintStockKey('pearl', 'kaido-blue')).toBe('paint:pearl:kaido-blue')
  })

  it('keeps two finishes of the same colour distinct', () => {
    expect(paintStockKey('solid', 'white')).not.toBe(paintStockKey('metallic', 'white'))
  })
})
