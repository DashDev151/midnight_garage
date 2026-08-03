import { describe, expect, it } from 'vitest'
import paintAliases from '../data/paintAliases.json'
import paintColours from '../data/paintColours.json'
import { PaintAliasSchema, PaintAliasesSchema } from '../src'

const EM_DASH = String.fromCharCode(0x2014)

/**
 * The iconic-colour alias table: schema parse, the 37 researched aliases,
 * unique kebab-case ids, every `colourId` resolving to a real palette entry,
 * every roster number in range, and both names free of the em dash.
 */
describe('paintAliases.json', () => {
  it('validates against the paint alias schema', () => {
    const result = PaintAliasesSchema.safeParse(paintAliases)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(37)
  })

  it('every id is unique', () => {
    const ids = paintAliases.map((alias) => alias.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every id is kebab-case', () => {
    for (const alias of paintAliases) {
      expect(alias.id, `${alias.id} is not kebab-case`).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('every colourId resolves to a real palette colour, both halves of a two-tone included', () => {
    const paletteIds = new Set(paintColours.map((colour) => colour.id))
    for (const alias of paintAliases) {
      for (const id of alias.colourId.split('+')) {
        expect(paletteIds.has(id), `${alias.id} points at unknown colour "${id}"`).toBe(true)
      }
    }
  })

  it('every cars entry is an integer roster number from 1 to 94', () => {
    for (const alias of paintAliases) {
      expect(alias.cars.length, `${alias.id} has no cars`).toBeGreaterThan(0)
      for (const rosterNo of alias.cars) {
        expect(Number.isInteger(rosterNo), `${alias.id} has a non-integer roster number`).toBe(true)
        expect(rosterNo, `${alias.id} has an out-of-range roster number`).toBeGreaterThanOrEqual(1)
        expect(rosterNo, `${alias.id} has an out-of-range roster number`).toBeLessThanOrEqual(94)
      }
    }
  })

  it('every realName and parodyName is non-empty and free of the em dash', () => {
    for (const alias of paintAliases) {
      expect(alias.realName.trim().length, `${alias.id} has an empty realName`).toBeGreaterThan(0)
      expect(alias.realName.includes(EM_DASH), `${alias.id} realName carries an em dash`).toBe(
        false,
      )
      expect(alias.parodyName.trim().length, `${alias.id} has an empty parodyName`).toBeGreaterThan(
        0,
      )
      expect(alias.parodyName.includes(EM_DASH), `${alias.id} parodyName carries an em dash`).toBe(
        false,
      )
    }
  })

  it.each(['', 'Bad Id', 'UPPER-CASE', 'has_underscore'])('rejects the malformed id "%s"', (id) => {
    const result = PaintAliasSchema.safeParse({
      id,
      realName: 'Probe Real',
      parodyName: 'Probe Parody',
      colourId: 'white',
      cars: [1],
    })
    expect(result.success).toBe(false)
  })
})
