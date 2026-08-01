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
 * zone id into a part-keyed lookup, which matters more here than anywhere else
 * in the app because `chassis` is a legal value of both id types.
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
 * The three views, keyed by id. Between them the regions cover the six body
 * zones and 28 of the 29 car parts: `paint` gets no region at all, because its
 * band derives from zone state, it carries no on-car work (`repairStepFor`,
 * `repairCeilingCaption` and `repairGateReasonFor` all early-return for it)
 * and the catalogue sells nothing to fit there. Repair work on the shell
 * happens on zones.
 *
 * `panels` and `underbody` derive their bands the same way and are still never
 * repaired directly, but a body kit is fitted at them, so each has a region to
 * fit it at: the frame the body plan sits inside, and the sills down the
 * lift's long edges. Coverage is asserted against the live `PARTS_TAXONOMY`,
 * so a taxonomy change fails here rather than shipping a part with nowhere to
 * click.
 */
export const WORKSHOP_VIEWS: Record<WorkshopViewId, WorkshopView> = {
  /**
   * The representative panel schematic - one stylised body shared by every
   * model, plan view with the front of the car at screen-left. The five PANEL
   * zones plus the aero part read as the outside of the car; `seats` and
   * `dashGauges` sit in the middle as a cabin cutaway, which is where they are
   * on a car seen from above. The chassis zone is NOT here (see `underside`).
   */
  body: {
    id: 'body',
    label: 'Body',
    regions: [
      zone('right', { x: 20, y: 30, w: 272, h: 22 }),
      zone('left', { x: 20, y: 128, w: 272, h: 22 }),
      zone('bonnet', { x: 20, y: 52, w: 78, h: 76 }),
      zone('roof', { x: 98, y: 52, w: 38, h: 76 }),
      part('dashGauges', { x: 136, y: 52, w: 44, h: 76 }),
      part('seats', { x: 180, y: 52, w: 52, h: 76 }),
      zone('boot', { x: 232, y: 52, w: 60, h: 76 }),
      part('aero', { x: 294, y: 30, w: 22, h: 120 }),
      // The shell as a whole - the outline the plan sits inside, which is
      // where a body kit changes a car's shape. A frame rather than a
      // rectangle over the car, so it can never swallow a panel zone's clicks.
      part(
        'panels',
        { x: 10, y: 20, w: 306, h: 10 },
        { x: 10, y: 30, w: 10, h: 120 },
        { x: 10, y: 150, w: 306, h: 10 },
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
   * top, the drivetrain run through the middle, the underbody across it, and
   * the wheels along the bottom.
   *
   * `chassis` appears TWICE on this view, deliberately, and it is not a
   * mistake to be tidied away. `chassis` is BOTH one of the six body zones
   * (the underbody metal and underseal, which the derived `underbody` band is
   * computed from) AND a `drivetrain`-group car part. They are two different
   * things that share a name - the taxonomy wart logged in `TODO.md` - and both
   * of them live on this view, because the lift is where you see both. The
   * discriminated union keeps them apart; deleting either region loses a real
   * work target.
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
      zone('chassis', { x: 20, y: 95, w: 280, h: 30 }),
      part('rims', { x: 20, y: 125, w: 140, h: 35 }),
      part('tyres', { x: 160, y: 125, w: 140, h: 35 }),
      // The sills down each long edge - the underside dress a skirt, splitter
      // or flat floor is fitted to, kept clear of the chassis zone the
      // underseal work itself happens on.
      part('underbody', { x: 0, y: 20, w: 20, h: 140 }, { x: 300, y: 20, w: 20, h: 140 }),
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
