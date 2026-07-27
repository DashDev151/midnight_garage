import { describe, expect, it } from 'vitest'
import { PART_SPRITE_PALETTE } from './partSprites'
import { WORKSHOP_VIEW_SPRITE_GRID, WORKSHOP_VIEW_SPRITE_TEMPLATES } from './workshopViewSprites'
import {
  WORKSHOP_VIEW_H,
  WORKSHOP_VIEW_W,
  WORKSHOP_VIEWS,
  type WorkshopViewId,
} from './workshopViewLayout'

/**
 * The view backdrops' own coherence.
 *
 * The row-width rule is the load-bearing one. `templateGrid` takes a
 * template's width from its FIRST row, so a row that is one character short
 * does not fail anywhere: it shifts every pixel after it by one and silently
 * corrupts the raster. Nothing else in the app would notice, so it is checked
 * here, row by row.
 *
 * Read against the live view list rather than a re-encoding of it, so adding
 * a view fails here until its backdrop exists.
 */
describe('workshop view backdrops', () => {
  const GRID = { w: 80, h: 45 }
  const VIEW_IDS = Object.keys(WORKSHOP_VIEWS) as WorkshopViewId[]

  it('has exactly one backdrop per workshop view, no extras', () => {
    const expected = [...VIEW_IDS].sort()
    for (const id of expected) {
      expect(WORKSHOP_VIEW_SPRITE_GRID[id], `missing backdrop for ${id}`).toBeDefined()
    }
    expect(Object.keys(WORKSHOP_VIEW_SPRITE_GRID).sort()).toEqual(expected)
  })

  it('every backdrop is 80x45, with every single row exactly 80 characters', () => {
    for (const id of VIEW_IDS) {
      expect(WORKSHOP_VIEW_SPRITE_GRID[id], `${id} footprint`).toEqual(GRID)

      const template = WORKSHOP_VIEW_SPRITE_TEMPLATES[id]
      expect(template, `${id} row count`).toHaveLength(GRID.h)
      const ragged = template
        .map((row, index) => ({ index, width: row.length }))
        .filter((row) => row.width !== GRID.w)
      expect(ragged, `${id} has rows that are not ${GRID.w} characters wide`).toEqual([])
    }
  })

  it('draws only in the shared sprite palette, so the art and the CSS cannot drift apart', () => {
    const allowed = new Set([...Object.keys(PART_SPRITE_PALETTE), '.'])
    for (const id of VIEW_IDS) {
      const used = new Set(WORKSHOP_VIEW_SPRITE_TEMPLATES[id].join('').split(''))
      const stray = [...used].filter((char) => !allowed.has(char)).sort()
      expect(stray, `${id} uses tokens outside the shared palette`).toEqual([])
    }
  })

  it('gives each view its own drawing rather than one shared silhouette', () => {
    const drawings = VIEW_IDS.map((id) => WORKSHOP_VIEW_SPRITE_TEMPLATES[id].join('\n'))
    expect(new Set(drawings).size, 'two views share a backdrop').toBe(VIEW_IDS.length)
  })

  it('is authored at the stage aspect ratio, so a backdrop neither stretches nor crops', () => {
    for (const id of VIEW_IDS) {
      const { w, h } = WORKSHOP_VIEW_SPRITE_GRID[id]
      expect(w / h, `${id} aspect ratio`).toBeCloseTo(WORKSHOP_VIEW_W / WORKSHOP_VIEW_H, 10)
    }
  })
})
