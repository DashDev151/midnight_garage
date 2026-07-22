import { describe, expect, it } from 'vitest'
import lapReferences from '../data/lapReferences.json'
import { LapReferencesSchema } from '../src'

/**
 * The reference-lap board's content guards: schema parse, exactly one grip
 * anchor, exactly 12 pool entries, and unique ids across the whole list. The
 * "times-within-range through the model" assertion lives in
 * `packages/sim/tests/lapModel.test.ts` instead - only sim can compute a
 * real lap time (the boundary law: content never depends on sim).
 */
const PARSED = LapReferencesSchema.parse(lapReferences)

describe('lap reference content (Sprint 77)', () => {
  it('parses cleanly', () => {
    expect(PARSED.length).toBeGreaterThan(0)
  })

  it('has exactly one grip anchor entry', () => {
    const anchors = PARSED.filter((entry) => entry.anchor)
    expect(anchors).toHaveLength(1)
  })

  it('has exactly 12 pool entries', () => {
    const pool = PARSED.filter((entry) => !entry.anchor)
    expect(pool).toHaveLength(12)
  })

  it('every id is unique', () => {
    const ids = PARSED.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every pool entry (and only pool entries) carries a tyreGrade', () => {
    for (const entry of PARSED) {
      if (entry.anchor) {
        expect('tyreGrade' in entry).toBe(false)
      } else {
        expect(entry.tyreGrade).toBeDefined()
      }
    }
  })
})
