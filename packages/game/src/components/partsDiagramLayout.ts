import type { CarPartId, ComponentId } from '@midnight-garage/content'

/**
 * Sprint 84 (the parts diagram): the hand-authored layout map - one rectangle
 * per car part slot, positioned as a rough side-on shop view of the car so the
 * teardown hierarchy reads as physical occlusion (decision 2). It is authored
 * FROM `packages/content/data/parts-taxonomy.json`'s `blockedBy` data, not from
 * memory: the one visual rule (decision 1) is that a blocker's rectangle
 * overlaps every part it blocks and sits above it in `z`. The layout-coherence
 * test (`partsDiagramLayout.test.ts`, decision 3) reads the live taxonomy and
 * fails the moment this drawing stops telling the truth the sim enforces.
 *
 * This module carries ONLY presentation geometry. It never re-encodes the
 * hierarchy itself (`blockedBy`, groups, bands all stay in content/the sim) -
 * the diagram renders that data, it does not duplicate it (directive 16).
 */

/**
 * A rough visual cluster of the side-on view. Used ONLY by the coherence test's
 * rule B (no two non-blocking parts in the same zone may overlap, or the
 * drawing would imply a dependency the taxonomy does not have). It is not the
 * same thing as a taxonomy group: the brakes are a `suspension` group part but
 * live in the `wheelCorner` zone here, because that is where they are drawn.
 */
export type DiagramZone = 'engine' | 'drivetrain' | 'wheelCorner' | 'suspension' | 'shell' | 'cabin'

export interface DiagramSlot {
  /** The visual cluster this rectangle belongs to (coherence-test rule B). */
  zone: DiagramZone
  /** Top-left x in the fixed coordinate space below. */
  x: number
  /** Top-left y in the fixed coordinate space below. */
  y: number
  /** Rectangle width in the coordinate space. */
  w: number
  /** Rectangle height in the coordinate space. */
  h: number
  /**
   * Stacking order - higher draws on top. A blocker ALWAYS has a higher `z`
   * than every part it blocks (decision 1); the coherence test asserts it.
   */
  z: number
}

/**
 * The layout's coordinate space: 320x180 (the art bible's 640x360 logical
 * stage, halved - a clean 16:9 the component renders as percentages inside a
 * fixed-aspect container). All slot rectangles live inside these bounds.
 */
export const DIAGRAM_VIEW_W = 320
export const DIAGRAM_VIEW_H = 180

/**
 * One entry per `CarPartId` - the `Record` type makes a missing slot a compile
 * error, so the map can never silently drift out of step with the 29-part
 * roster. Geometry verified against the live taxonomy by the coherence test.
 */
export const PARTS_DIAGRAM_LAYOUT: Record<CarPartId, DiagramSlot> = {
  // Engine bay (front third): the cooling-over-cams, intake/exhaust/cooling
  // over-block, head-over-internals stack the taxonomy encodes.
  internals: { zone: 'engine', x: 82, y: 42, w: 28, h: 18, z: 0 },
  headValvetrain: { zone: 'engine', x: 74, y: 58, w: 36, h: 18, z: 2 },
  camsTiming: { zone: 'engine', x: 46, y: 54, w: 34, h: 18, z: 3 },
  intake: { zone: 'engine', x: 92, y: 64, w: 20, h: 46, z: 4 },
  block: { zone: 'engine', x: 54, y: 104, w: 50, h: 20, z: 1 },
  exhaust: { zone: 'engine', x: 96, y: 112, w: 52, h: 14, z: 3 },
  cooling: { zone: 'engine', x: 42, y: 64, w: 20, h: 48, z: 4 },
  forcedInduction: { zone: 'engine', x: 108, y: 80, w: 22, h: 20, z: 2 },
  fuelSystem: { zone: 'engine', x: 14, y: 128, w: 26, h: 16, z: 1 },
  ignitionEcu: { zone: 'engine', x: 14, y: 60, w: 24, h: 16, z: 1 },

  // The tunnel: gearbox behind the engine (with the exhaust dropping over it),
  // the driveline running back over the gearbox and the differential.
  gearbox: { zone: 'drivetrain', x: 120, y: 112, w: 38, h: 28, z: 2 },
  clutch: { zone: 'drivetrain', x: 110, y: 130, w: 32, h: 22, z: 0 },
  driveline: { zone: 'drivetrain', x: 150, y: 118, w: 104, h: 14, z: 3 },
  differential: { zone: 'drivetrain', x: 244, y: 116, w: 36, h: 26, z: 0 },

  // The front wheel corner: the rim sitting over the tyre and both brake slots.
  rims: { zone: 'wheelCorner', x: 44, y: 126, w: 52, h: 52, z: 3 },
  tyres: { zone: 'wheelCorner', x: 48, y: 150, w: 44, h: 26, z: 0 },
  brakePadsDiscs: { zone: 'wheelCorner', x: 50, y: 130, w: 18, h: 18, z: 0 },
  brakeCalipersLines: { zone: 'wheelCorner', x: 74, y: 130, w: 18, h: 18, z: 0 },

  // Suspension: laid along the floor, no blocking among them.
  dampers: { zone: 'suspension', x: 100, y: 104, w: 18, h: 26, z: 2 },
  springs: { zone: 'suspension', x: 122, y: 104, w: 18, h: 26, z: 2 },
  steering: { zone: 'suspension', x: 146, y: 104, w: 20, h: 26, z: 2 },
  antiRollBars: { zone: 'suspension', x: 170, y: 104, w: 26, h: 26, z: 2 },

  // The shell: the body panels the functional parts sit inside, drawn behind
  // everything (lowest z) as the backdrop. Tiled so none overlaps another.
  paint: { zone: 'shell', x: 110, y: 32, w: 126, h: 26, z: -2 },
  panels: { zone: 'shell', x: 60, y: 60, w: 210, h: 44, z: -2 },
  chassis: { zone: 'shell', x: 40, y: 132, w: 250, h: 18, z: -2 },
  underbody: { zone: 'shell', x: 40, y: 152, w: 250, h: 16, z: -2 },
  aero: { zone: 'shell', x: 272, y: 40, w: 32, h: 20, z: -2 },

  // The cabin inset.
  seats: { zone: 'cabin', x: 168, y: 60, w: 40, h: 34, z: 2 },
  dashGauges: { zone: 'cabin', x: 210, y: 62, w: 34, h: 28, z: 2 },
}

/** A level-1 group tile's rectangle - plain geometry, no z (tiles never
 * overlap; the sanity test in `partsDiagramLayout.test.ts` enforces it). */
export interface TileRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Sprint 84 amendment (maintainer, 2026-07-17): the level-1 view - six group
 * tiles positioned as car regions on the same canvas (front of car at left),
 * replacing the all-29-rectangles single view that read as clutter. Clicking a
 * tile opens level 2: that group's member slots from `PARTS_DIAGRAM_LAYOUT`
 * above, scaled up, plus any outside blockers as visiting rectangles.
 *
 * Tiles are disjoint by design: a level-1 overlap would imply a dependency
 * the way part-rectangle overlaps do in level 2, and groups have no such
 * relationship at tile grain (cross-group blocking is shown per part in
 * level 2 and as the inspector's "sit under" hint here).
 */
export const GROUP_TILE_LAYOUT: Record<ComponentId, TileRect> = {
  body: { x: 8, y: 8, w: 304, h: 40 },
  engine: { x: 8, y: 56, w: 100, h: 70 },
  drivetrain: { x: 116, y: 78, w: 76, h: 48 },
  interior: { x: 200, y: 56, w: 112, h: 44 },
  wheels: { x: 8, y: 134, w: 100, h: 38 },
  suspension: { x: 116, y: 134, w: 196, h: 38 },
}
