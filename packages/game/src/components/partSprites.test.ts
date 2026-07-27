import { ALL_CAR_PART_IDS, ASSEMBLIES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { PART_SPRITE_GRID } from './partSprites'

/**
 * The sprite catalogue's own coherence. Every surface that draws a part draws
 * it from `partSprites.ts` - the car screen's docked panel and bench strip,
 * the parts market's department heroes - so the two rules here are what stop a
 * new part shipping with nothing to render, or an odd-sized template quietly
 * breaking the grid every layout is sized against.
 *
 * Read against the LIVE taxonomy and assembly list rather than a re-encoding
 * of them, so adding a part fails here until its sprite exists.
 */
describe('part sprite footprints', () => {
  const STANDARD = { w: 24, h: 16 }
  const LARGE = { w: 32, h: 22 }

  it('has exactly one sprite footprint per car part and per assembly, no extras', () => {
    const expected = [...ALL_CAR_PART_IDS, ...ASSEMBLIES.map((a) => a.id)].sort()
    for (const id of expected) {
      expect(PART_SPRITE_GRID[id], `missing sprite footprint for ${id}`).toBeDefined()
    }
    expect(Object.keys(PART_SPRITE_GRID).sort()).toEqual(expected)
  })

  it('every sprite footprint is one of the two authored grid sizes', () => {
    for (const [id, grid] of Object.entries(PART_SPRITE_GRID)) {
      const ok =
        (grid.w === STANDARD.w && grid.h === STANDARD.h) ||
        (grid.w === LARGE.w && grid.h === LARGE.h)
      expect(ok, `${id} footprint ${grid.w}x${grid.h} is neither 24x16 nor 32x22`).toBe(true)
    }
  })
})
