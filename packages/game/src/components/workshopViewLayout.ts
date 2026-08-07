import type { CarPartId, ZoneId } from '@midnight-garage/content'

/**
 * The hand-authored geometry for the three workshop views - the body
 * schematic, the engine bay from above, and the underside on the lift. One
 * region per thing you can work on, drawn as a set of rectangles on a fixed
 * 16:9 stage the component renders as percentages.
 *
 * The load-bearing rule is that every rectangle in a view is disjoint from
 * every other rectangle in that view, REGARDLESS of owner. Overlapping hit
 * areas can communicate teardown order by occlusion, but they pay for it: a
 * removed part keeps its full pointer-events footprint and swallows clicks for
 * everything underneath. Disjoint regions make that structurally impossible
 * instead of defending against it with a z-shuffle.
 * `workshopViewLayout.test.ts` asserts the property pairwise.
 *
 * This module carries ONLY presentation geometry. Zone state, part state, the
 * taxonomy and every rule about what may be worked on stay in content and the
 * sim; the views render that data, they do not duplicate it (directive 16).
 */

/**
 * The views' coordinate space: 320x180 (the art bible's 640x360 logical stage,
 * halved).
 */
export const WORKSHOP_VIEW_W = 320
export const WORKSHOP_VIEW_H = 180

/** A rectangle in the 320x180 space, origin top-left. */
export interface ViewRect {
  /** Top-left x in the coordinate space above. */
  x: number
  /** Top-left y in the coordinate space above. */
  y: number
  /** Rectangle width in the coordinate space. */
  w: number
  /** Rectangle height in the coordinate space. */
  h: number
}

export type WorkshopViewId = 'body' | 'engineBay' | 'underside'

/**
 * A click region: either a body ZONE or a car PART, never something that could
 * be read as both. The discriminant is what stops a consumer dispatching a
 * zone id into a part-keyed lookup.
 *
 * A region owns a SET of rectangles, not one: several parts exist at four
 * corners of a car (brakes, dampers, springs), and forcing one rectangle per
 * region would either lie about the car or push the art toward one arbitrary
 * corner. The placeholder geometry below mostly uses a single band per region;
 * the capability is here because the finished art needs it.
 */
export type WorkshopRegion =
  | { kind: 'zone'; zoneId: ZoneId; rects: readonly ViewRect[] }
  | { kind: 'part'; partId: CarPartId; rects: readonly ViewRect[] }

export interface WorkshopView {
  id: WorkshopViewId
  /** The view's tab caption. */
  label: string
  regions: readonly WorkshopRegion[]
}

function zone(zoneId: ZoneId, ...rects: readonly ViewRect[]): WorkshopRegion {
  return { kind: 'zone', zoneId, rects }
}

function part(partId: CarPartId, ...rects: readonly ViewRect[]): WorkshopRegion {
  return { kind: 'part', partId, rects }
}

/**
 * The three views, keyed by id. Between them the regions cover the nine body
 * zones and 27 of the 28 car parts: `paint` gets no region at all, because its
 * band derives from zone state, it carries no on-car work (`repairStepFor`,
 * `repairCeilingCaption` and `repairGateReasonFor` all early-return for it)
 * and the catalogue sells nothing to fit there. Repair work on the shell
 * happens on zones.
 *
 * `bodywork` derives its band the same way and is still never repaired
 * directly, but a body kit is fitted at it, so it still has a region to fit
 * one at: the frame the body plan sits inside. Coverage is asserted against
 * the live `PARTS_TAXONOMY`, so a taxonomy change fails here rather than
 * shipping a part with nowhere to click.
 */
export const WORKSHOP_VIEWS: Record<WorkshopViewId, WorkshopView> = {
  /**
   * The representative panel schematic - one stylised body shared by every
   * model, plan view with the front of the car at screen-left, laid out so it
   * reads as a car from above rather than as a grid of boxes: a bumper caps
   * each end, the bonnet and boot fill the front and rear thirds of the
   * centre band, the cabin (`dashGauges`/`seats`) fills the middle third, a
   * corner zone sits at each end of the two flanking bands with `skirts`
   * (one zone, two rects either side) running the length between them, and
   * `aero` closes the plan on the rear edge the way a wing overhangs a boot.
   * Neither `roof` nor `chassis` appears here: nobody replaces a roof, and
   * `chassis` is a normal `body`-group part with no zone of its own (see
   * `underside`).
   */
  body: {
    id: 'body',
    label: 'Body',
    regions: [
      // The two end caps, full height so a bumper reads as wrapping the
      // corners the way it does on the real car.
      zone('front-bumper', { x: 10, y: 20, w: 18, h: 140 }),
      zone('rear-bumper', { x: 292, y: 20, w: 16, h: 140 }),
      // The centre band: bonnet forward, boot aft, the cabin between them.
      zone('bonnet', { x: 28, y: 42, w: 88, h: 96 }),
      part('dashGauges', { x: 116, y: 42, w: 44, h: 96 }),
      part('seats', { x: 160, y: 42, w: 44, h: 96 }),
      zone('boot', { x: 204, y: 42, w: 88, h: 96 }),
      // The two flanking bands: a corner at each end, `skirts` (one zone,
      // one rect per side) running the length between them.
      zone('right-front', { x: 28, y: 20, w: 40, h: 22 }),
      zone('skirts', { x: 68, y: 20, w: 184, h: 22 }, { x: 68, y: 138, w: 184, h: 22 }),
      zone('right-rear', { x: 252, y: 20, w: 40, h: 22 }),
      zone('left-front', { x: 28, y: 138, w: 40, h: 22 }),
      zone('left-rear', { x: 252, y: 138, w: 40, h: 22 }),
      // The wing overhanging the tail, closing the plan on the side the
      // frame below deliberately leaves open.
      part('aero', { x: 308, y: 20, w: 12, h: 140 }),
      // The shell as a whole - the outline the plan sits inside, which is
      // where a body kit changes a car's shape. A frame rather than a
      // rectangle over the car, so it can never swallow a zone's clicks, and
      // left open on the right, where `aero` closes it instead.
      part(
        'bodywork',
        { x: 0, y: 10, w: 320, h: 10 },
        { x: 0, y: 20, w: 10, h: 140 },
        { x: 0, y: 160, w: 320, h: 10 },
      ),
    ],
  },

  /**
   * The engine bay from above, front of the car at screen-left: the ten engine
   * parts laid out as the bay reads with the bonnet up - rad pack across the
   * nose, the induction and spark side along the top, the block and its
   * internals below, fuel and exhaust down the far side.
   */
  engineBay: {
    id: 'engineBay',
    label: 'Engine bay',
    regions: [
      part('cooling', { x: 20, y: 25, w: 40, h: 130 }),
      part('intake', { x: 60, y: 25, w: 60, h: 45 }),
      part('forcedInduction', { x: 120, y: 25, w: 55, h: 45 }),
      part('ignitionEcu', { x: 175, y: 25, w: 55, h: 45 }),
      part('camsTiming', { x: 60, y: 70, w: 50, h: 45 }),
      part('headValvetrain', { x: 110, y: 70, w: 120, h: 45 }),
      part('block', { x: 60, y: 115, w: 90, h: 40 }),
      part('internals', { x: 150, y: 115, w: 80, h: 40 }),
      part('fuelSystem', { x: 230, y: 25, w: 70, h: 65 }),
      part('exhaust', { x: 230, y: 90, w: 70, h: 65 }),
    ],
  },

  /**
   * The car on the lift, front at screen-left: suspension and brakes along the
   * top, the drivetrain run through the middle, and the wheels along the
   * bottom. `chassis` lives here as a plain `body`-group part (a stiffening
   * kit bolted or welded to the shell) - it carries no zone of its own, so
   * unlike the pre-rebuild view it appears exactly once, not twice.
   */
  underside: {
    id: 'underside',
    label: 'Underside',
    regions: [
      part('steering', { x: 20, y: 20, w: 50, h: 35 }),
      part('dampers', { x: 70, y: 20, w: 45, h: 35 }),
      part('springs', { x: 115, y: 20, w: 45, h: 35 }),
      part('antiRollBars', { x: 160, y: 20, w: 50, h: 35 }),
      part('brakePadsDiscs', { x: 210, y: 20, w: 45, h: 35 }),
      part('brakeCalipersLines', { x: 255, y: 20, w: 45, h: 35 }),
      part('clutch', { x: 20, y: 55, w: 50, h: 40 }),
      part('gearbox', { x: 70, y: 55, w: 70, h: 40 }),
      part('driveline', { x: 140, y: 55, w: 60, h: 40 }),
      part('differential', { x: 200, y: 55, w: 50, h: 40 }),
      part('chassis', { x: 250, y: 55, w: 50, h: 40 }),
      // Widened to reclaim the band the old chassis zone used to occupy -
      // the wheels now read as the bottom third of the lift rather than a
      // thin strip under a dead middle band.
      part('rims', { x: 20, y: 95, w: 140, h: 65 }),
      part('tyres', { x: 160, y: 95, w: 140, h: 65 }),
    ],
  },
}

/**
 * The region containing a point, or null if the point is bare stage.
 *
 * There is no z-order, no tie-break and no "topmost" here, and there does not
 * need to be: the rectangles in a view are pairwise disjoint, so at most one
 * region can ever contain a given point. That is the whole reason the
 * disjointness law is worth a test.
 *
 * `x` and `y` are in the 320x180 coordinate space; a caller working in pixels
 * or percentages converts first. The right and bottom edges belong to the next
 * rectangle along, matching the half-open convention the disjointness test
 * uses (touching edges are not an overlap).
 */
export function regionAt(view: WorkshopView, x: number, y: number): WorkshopRegion | null {
  for (const region of view.regions) {
    for (const rect of region.rects) {
      if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
        return region
      }
    }
  }
  return null
}
