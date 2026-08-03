import { describe, expect, it } from 'vitest'
import paintColours from '../data/paintColours.json'
import { PaintColourSchema, PaintColoursSchema } from '../src'

const EM_DASH = String.fromCharCode(0x2014)

/**
 * The paint stage's swatch vocabulary: schema parse, the 34 consolidated
 * factory colours, unique kebab-case ids, a shade brief on every entry, and a
 * strictly-formed hex on every entry. No price or stat is asserted because a
 * colour carries neither - the stage's cost lives with its material SKU.
 */
describe('paintColours.json', () => {
  it('validates against the paint colour schema', () => {
    const result = PaintColoursSchema.safeParse(paintColours)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(34)
  })

  it('every id is unique', () => {
    const ids = paintColours.map((colour) => colour.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every id is kebab-case', () => {
    for (const colour of paintColours) {
      expect(colour.id, `${colour.id} is not kebab-case`).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('every hex is a lowercase six-digit colour', () => {
    for (const colour of paintColours) {
      expect(colour.hex, `${colour.id} has a malformed hex`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('every name is non-empty and free of the em dash', () => {
    for (const colour of paintColours) {
      expect(colour.name.trim().length, `${colour.id} has an empty name`).toBeGreaterThan(0)
      expect(colour.name.includes(EM_DASH), `${colour.id} carries an em dash`).toBe(false)
    }
  })

  it('every shade brief is non-empty and free of the em dash', () => {
    for (const colour of paintColours) {
      expect(colour.shade.trim().length, `${colour.id} has an empty shade`).toBeGreaterThan(0)
      expect(colour.shade.includes(EM_DASH), `${colour.id} carries an em dash`).toBe(false)
    }
  })

  /**
   * The hex guard checks itself: a malformed colour renders as a broken swatch
   * instead of throwing, so the schema is the only thing standing between bad
   * content and a silently wrong UI. These cases are the proof it holds.
   */
  it.each(['1f2b4d', '#1F2B4D', '#1f2b4', '#1f2b4dd', '#1f2b4z', ''])(
    'rejects the malformed hex "%s"',
    (hex) => {
      const result = PaintColourSchema.safeParse({
        id: 'probe',
        name: 'Probe',
        shade: 'Probe shade brief.',
        hex,
        family: 'Reds',
      })
      expect(result.success).toBe(false)
    },
  )

  /**
   * A family of one has no near neighbour to offer a mismatched or primed
   * panel, which is the whole reason the field exists - so every family must
   * clear this floor, not just the grouping as a whole.
   */
  it('every family has at least two members', () => {
    const countByFamily = new Map<string, number>()
    for (const colour of paintColours) {
      countByFamily.set(colour.family, (countByFamily.get(colour.family) ?? 0) + 1)
    }
    for (const [family, count] of countByFamily) {
      expect(count, `${family} has only ${count} member(s)`).toBeGreaterThanOrEqual(2)
    }
  })
})
