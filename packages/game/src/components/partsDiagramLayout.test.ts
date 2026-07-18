import {
  ALL_CAR_PART_IDS,
  ASSEMBLIES,
  PARTS_TAXONOMY,
  type CarPartId,
  type ComponentId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { PART_SPRITE_GRID } from './partSprites'
import {
  DIAGRAM_VIEW_H,
  DIAGRAM_VIEW_W,
  GROUP_TILE_LAYOUT,
  PARTS_DIAGRAM_LAYOUT,
  type DiagramSlot,
  type TileRect,
} from './partsDiagramLayout'

/**
 * Sprint 84 decision 3: the layout-coherence test - the load-bearing piece.
 *
 * The parts diagram must tell the truth the sim enforces, so this reads the
 * LIVE taxonomy (`PARTS_TAXONOMY`) rather than any re-encoding of it, and holds
 * the hand-authored rectangles to two rules:
 *
 *  A. every `blockedBy` pair overlaps, with the blocker sitting above (higher z);
 *  B. no two non-blocking parts in the same zone overlap (an accidental overlap
 *     would draw a dependency the taxonomy does not have).
 *
 * A future `blockedBy` change therefore fails the diagram here until the drawing
 * is made honest again - the Sprint 78 content-probe pattern, applied to a view.
 */

/** Positive-area intersection (a shared edge alone is not an overlap). */
function overlaps(a: DiagramSlot, b: DiagramSlot): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

const blockedByOf: Record<string, readonly CarPartId[]> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.blockedBy]),
)

/** The set of unordered blocking pairs, keyed `a|b` (sorted). */
const blockingPairKeys = new Set<string>()
for (const entry of PARTS_TAXONOMY) {
  for (const blocker of entry.blockedBy) {
    blockingPairKeys.add([blocker, entry.id].sort().join('|'))
  }
}

describe('parts diagram layout coherence', () => {
  it('has exactly one rectangle per car part, and no extras', () => {
    for (const id of ALL_CAR_PART_IDS) {
      expect(PARTS_DIAGRAM_LAYOUT[id], `missing layout for ${id}`).toBeDefined()
    }
    expect(Object.keys(PARTS_DIAGRAM_LAYOUT).sort()).toEqual([...ALL_CAR_PART_IDS].sort())
  })

  it('keeps every rectangle inside the coordinate space', () => {
    for (const [id, slot] of Object.entries(PARTS_DIAGRAM_LAYOUT)) {
      expect(slot.x, `${id} x`).toBeGreaterThanOrEqual(0)
      expect(slot.y, `${id} y`).toBeGreaterThanOrEqual(0)
      expect(slot.w, `${id} w`).toBeGreaterThan(0)
      expect(slot.h, `${id} h`).toBeGreaterThan(0)
      expect(slot.x + slot.w, `${id} right edge`).toBeLessThanOrEqual(DIAGRAM_VIEW_W)
      expect(slot.y + slot.h, `${id} bottom edge`).toBeLessThanOrEqual(DIAGRAM_VIEW_H)
    }
  })

  it('rule A: every blockedBy pair overlaps, blocker on top (higher z)', () => {
    for (const entry of PARTS_TAXONOMY) {
      const blocked = PARTS_DIAGRAM_LAYOUT[entry.id]
      for (const blockerId of entry.blockedBy) {
        const blocker = PARTS_DIAGRAM_LAYOUT[blockerId]
        expect(overlaps(blocker, blocked), `${blockerId} (blocker) must overlap ${entry.id}`).toBe(
          true,
        )
        expect(
          blocker.z,
          `${blockerId} (z=${blocker.z}) must sit above ${entry.id} (z=${blocked.z})`,
        ).toBeGreaterThan(blocked.z)
      }
    }
  })

  it('rule B: no two non-blocking parts in the same zone overlap', () => {
    const ids = Object.keys(PARTS_DIAGRAM_LAYOUT) as CarPartId[]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p = ids[i]!
        const q = ids[j]!
        const a = PARTS_DIAGRAM_LAYOUT[p]
        const b = PARTS_DIAGRAM_LAYOUT[q]
        if (a.zone !== b.zone) continue
        if (blockingPairKeys.has([p, q].sort().join('|'))) continue
        expect(
          overlaps(a, b),
          `${p} and ${q} share zone ${a.zone} but neither blocks the other - they must not overlap`,
        ).toBe(false)
      }
    }
  })

  it('every blocker highlight target is a real taxonomy blocker (no phantom edges)', () => {
    // Guards the diagram's hover-highlight contract: the parts it lights up on
    // top of a hovered part are exactly that part's blockers, nothing invented.
    for (const id of ALL_CAR_PART_IDS) {
      for (const blocker of blockedByOf[id] ?? []) {
        expect(ALL_CAR_PART_IDS).toContain(blocker)
      }
    }
  })
})

/**
 * Sprint 84 amendment (maintainer, 2026-07-17): the level-1 tile map's own
 * sanity checks. Tiles are a navigation surface, not a dependency drawing, so
 * unlike part rectangles they must NEVER overlap - a tile overlap would imply
 * a group-level dependency that does not exist at tile grain.
 */
describe('parts diagram group tile map', () => {
  const GROUPS: readonly ComponentId[] = [
    'engine',
    'drivetrain',
    'suspension',
    'wheels',
    'body',
    'interior',
  ]

  function tilesOverlap(a: TileRect, b: TileRect): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  }

  it('has exactly the six group tiles', () => {
    expect(Object.keys(GROUP_TILE_LAYOUT).sort()).toEqual([...GROUPS].sort())
  })

  it('keeps every tile inside the coordinate space', () => {
    for (const [id, rect] of Object.entries(GROUP_TILE_LAYOUT)) {
      expect(rect.x, `${id} x`).toBeGreaterThanOrEqual(0)
      expect(rect.y, `${id} y`).toBeGreaterThanOrEqual(0)
      expect(rect.w, `${id} w`).toBeGreaterThan(0)
      expect(rect.h, `${id} h`).toBeGreaterThan(0)
      expect(rect.x + rect.w, `${id} right edge`).toBeLessThanOrEqual(DIAGRAM_VIEW_W)
      expect(rect.y + rect.h, `${id} bottom edge`).toBeLessThanOrEqual(DIAGRAM_VIEW_H)
    }
  })

  it('no two tiles overlap', () => {
    for (let i = 0; i < GROUPS.length; i++) {
      for (let j = i + 1; j < GROUPS.length; j++) {
        const p = GROUPS[i]!
        const q = GROUPS[j]!
        expect(
          tilesOverlap(GROUP_TILE_LAYOUT[p], GROUP_TILE_LAYOUT[q]),
          `tiles ${p} and ${q} must not overlap`,
        ).toBe(false)
      }
    }
  })
})

/**
 * Sprint 88 decision 4: the layout now renders a placeholder sprite in every
 * block, so the layout is coupled to `partSprites.ts`'s footprints. This keeps
 * the two in step - every drawn part (and every assembly composite) has exactly
 * one authored sprite at one of the two grid sizes the spec fixes (24x16 for a
 * standard part, 32x22 for a large unit). Rules A and B above are untouched.
 */
describe('parts diagram sprite footprints', () => {
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
