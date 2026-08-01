import { PARTS_TAXONOMY, ZoneIdSchema, type CarPartId, type ZoneId } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  regionAt,
  WORKSHOP_VIEW_H,
  WORKSHOP_VIEW_W,
  WORKSHOP_VIEWS,
  type ViewRect,
  type WorkshopRegion,
  type WorkshopViewId,
} from './workshopViewLayout'

/**
 * The workshop views' coherence test - the load-bearing piece is the
 * disjointness law below.
 *
 * Coverage is read from the LIVE taxonomy (`PARTS_TAXONOMY`) and the live
 * `ZoneIdSchema` rather than any re-encoding of either, so adding a part or a
 * zone fails here until it has been given somewhere to live on the car.
 */

const VIEW_IDS: readonly WorkshopViewId[] = ['body', 'engineBay', 'underside']

/**
 * `paint` derives its band from zone state, has no on-car action of its own
 * and no SKU to fit, so it is a value carrier rather than a work target and
 * gets no region at all. `panels` and `underbody` derive their bands the same
 * way but take a fitted body kit, so both do have one.
 */
const REGIONLESS_CARRIERS: readonly CarPartId[] = ['paint']

/** Positive-area intersection (a shared edge alone is not an overlap). */
function overlaps(a: ViewRect, b: ViewRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** A region's owner, for failure messages and for the uniqueness checks. */
function ownerOf(region: WorkshopRegion): string {
  return region.kind === 'zone' ? `zone ${region.zoneId}` : `part ${region.partId}`
}

function describeRect(rect: ViewRect): string {
  return `(${rect.x}, ${rect.y}, ${rect.w}, ${rect.h})`
}

/** Every rectangle in a view, tagged with the region that owns it. */
function flatRects(viewId: WorkshopViewId): { owner: string; rect: ViewRect }[] {
  return WORKSHOP_VIEWS[viewId].regions.flatMap((region) =>
    region.rects.map((rect) => ({ owner: ownerOf(region), rect })),
  )
}

const allRegions: readonly WorkshopRegion[] = VIEW_IDS.flatMap(
  (viewId) => WORKSHOP_VIEWS[viewId].regions,
)

describe('workshop view layout', () => {
  it('keys every view by its own id, with a label', () => {
    for (const viewId of VIEW_IDS) {
      expect(WORKSHOP_VIEWS[viewId].id, `${viewId} id`).toBe(viewId)
      expect(WORKSHOP_VIEWS[viewId].label.length, `${viewId} label`).toBeGreaterThan(0)
    }
    expect(Object.keys(WORKSHOP_VIEWS).sort()).toEqual([...VIEW_IDS].sort())
  })

  it('gives every region at least one rectangle', () => {
    for (const region of allRegions) {
      expect(region.rects.length, `${ownerOf(region)} has no rectangle`).toBeGreaterThan(0)
    }
  })

  /**
   * The disjointness law - the whole point of this module.
   *
   * Overlapping hit areas cost a whole bug class: a REMOVED part keeps its
   * full pointer-events footprint, so its now-empty rectangle swallows clicks
   * for whatever sits under it, which is how a removed set of rims leaves the
   * brakes behind them unreachable. Disjoint rectangles make that structurally
   * impossible rather than something defended against with a z-index shuffle,
   * and unlike hit-testing the property is provable without layout - which
   * matters, because happy-dom does none.
   *
   * The check is across ALL regions in a view, not within one: two rectangles
   * belonging to different parts must be disjoint just as strictly as two
   * belonging to the same part.
   */
  it('law: within a view, every pair of rectangles is disjoint, whatever owns them', () => {
    for (const viewId of VIEW_IDS) {
      const rects = flatRects(viewId)
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!
          const b = rects[j]!
          expect(
            overlaps(a.rect, b.rect),
            `${viewId}: ${a.owner} ${describeRect(a.rect)} overlaps ${b.owner} ${describeRect(b.rect)}`,
          ).toBe(false)
        }
      }
    }
  })

  it('keeps every rectangle inside the coordinate space, with positive area', () => {
    for (const viewId of VIEW_IDS) {
      for (const { owner, rect } of flatRects(viewId)) {
        const label = `${viewId}: ${owner} ${describeRect(rect)}`
        expect(rect.x, `${label} x`).toBeGreaterThanOrEqual(0)
        expect(rect.y, `${label} y`).toBeGreaterThanOrEqual(0)
        expect(rect.w, `${label} w`).toBeGreaterThan(0)
        expect(rect.h, `${label} h`).toBeGreaterThan(0)
        expect(rect.x + rect.w, `${label} right edge`).toBeLessThanOrEqual(WORKSHOP_VIEW_W)
        expect(rect.y + rect.h, `${label} bottom edge`).toBeLessThanOrEqual(WORKSHOP_VIEW_H)
      }
    }
  })

  it('covers every car part except paint', () => {
    const expected = PARTS_TAXONOMY.map((entry) => entry.id).filter(
      (id) => !REGIONLESS_CARRIERS.includes(id),
    )
    const covered = allRegions.filter((r) => r.kind === 'part').map((r) => r.partId)
    expect([...covered].sort()).toEqual([...expected].sort())
    for (const carrier of REGIONLESS_CARRIERS) {
      expect(covered, `${carrier} has nothing to fit and must have no region`).not.toContain(
        carrier,
      )
    }
  })

  it('covers every body zone exactly once', () => {
    const expected: readonly ZoneId[] = ZoneIdSchema.options
    const covered = allRegions.filter((r) => r.kind === 'zone').map((r) => r.zoneId)
    expect([...covered].sort()).toEqual([...expected].sort())
  })

  it('gives every part and every zone exactly one home across the three views', () => {
    // The two `chassis` regions on the underside are the reason this counts
    // parts and zones separately: `chassis` is legitimately both a body zone
    // and a drivetrain part, so the pair is not a duplicate.
    const partIds = allRegions.filter((r) => r.kind === 'part').map((r) => r.partId)
    const zoneIds = allRegions.filter((r) => r.kind === 'zone').map((r) => r.zoneId)
    expect(new Set(partIds).size, 'a part id appears in more than one region').toBe(partIds.length)
    expect(new Set(zoneIds).size, 'a zone id appears in more than one region').toBe(zoneIds.length)
  })
})

describe('workshop view regionAt', () => {
  it('finds the region a point falls in', () => {
    const bonnet = regionAt(WORKSHOP_VIEWS.body, 40, 80)
    expect(bonnet).toEqual({ kind: 'zone', zoneId: 'bonnet', rects: expect.anything() })

    const seats = regionAt(WORKSHOP_VIEWS.body, 200, 90)
    expect(seats?.kind === 'part' ? seats.partId : null).toBe('seats')

    const block = regionAt(WORKSHOP_VIEWS.engineBay, 100, 130)
    expect(block?.kind === 'part' ? block.partId : null).toBe('block')

    // The two same-named regions on the underside resolve to different things.
    const chassisPart = regionAt(WORKSHOP_VIEWS.underside, 270, 70)
    expect(chassisPart?.kind).toBe('part')
    const chassisZone = regionAt(WORKSHOP_VIEWS.underside, 270, 110)
    expect(chassisZone?.kind).toBe('zone')
  })

  it('returns null for bare stage', () => {
    expect(regionAt(WORKSHOP_VIEWS.body, 2, 2)).toBeNull()
    expect(regionAt(WORKSHOP_VIEWS.engineBay, 310, 175)).toBeNull()
    expect(regionAt(WORKSHOP_VIEWS.underside, 160, 175)).toBeNull()
  })

  it('treats a rectangle as half-open, so a shared edge belongs to one region only', () => {
    // x=98 is the bonnet's right edge and the roof's left edge.
    const atEdge = regionAt(WORKSHOP_VIEWS.body, 98, 80)
    expect(atEdge?.kind === 'zone' ? atEdge.zoneId : null).toBe('roof')
  })
})
