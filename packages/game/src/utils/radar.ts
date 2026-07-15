import type { StatBlock } from '@midnight-garage/content'
import { RADAR_POWER_REFERENCE_PS } from '../constants'

/** The five radar axes, in draw order starting from the top and going clockwise. */
export const RADAR_AXES = ['power', 'handling', 'style', 'reliability', 'authenticity'] as const
export type RadarAxis = (typeof RADAR_AXES)[number]

export interface Point {
  x: number
  y: number
}

/**
 * Normalizes a StatBlock to 0..1 per axis. Handling/style/reliability/
 * authenticity are already 0-100; power is raw PS mapped against a fixed
 * reference ceiling (display-only, decision 3) and clamped so a monster
 * engine doesn't blow past the chart.
 */
export function normalizeStats(stats: StatBlock): Record<RadarAxis, number> {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
  return {
    power: clamp01(stats.power / RADAR_POWER_REFERENCE_PS),
    handling: clamp01(stats.handling / 100),
    style: clamp01(stats.style / 100),
    reliability: clamp01(stats.reliability / 100),
    authenticity: clamp01(stats.authenticity / 100),
  }
}

/** Position of an axis's vertex at a given 0..1 magnitude, top = index 0, clockwise. */
export function axisPoint(
  index: number,
  magnitude: number,
  cx: number,
  cy: number,
  r: number,
): Point {
  const angle = -Math.PI / 2 + (index / RADAR_AXES.length) * Math.PI * 2
  return {
    x: cx + Math.cos(angle) * r * magnitude,
    y: cy + Math.sin(angle) * r * magnitude,
  }
}

/** SVG `points` string for the filled stat polygon. */
export function statPolygonPoints(stats: StatBlock, size: number): string {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  const norm = normalizeStats(stats)
  return RADAR_AXES.map((axis, i) => {
    const p = axisPoint(i, norm[axis], cx, cy, r)
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

/**
 * SVG `points` string for a grid pentagon at `magnitude` (default 1, the outer
 * rim).
 *
 * Sprint 67 decision 5 (playtest item 8): the radar had exactly ONE grid
 * element - this pentagon, at magnitude 1 - so a plotted shape had nothing to
 * be read against; you could see it was a pentagon but not what any value was.
 * Concentric rings are just this same function at 0.25/0.5/0.75, which is why
 * it takes a magnitude now instead of gaining a sibling.
 */
export function gridPolygonPoints(size: number, magnitude = 1): string {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  return RADAR_AXES.map((_, i) => {
    const p = axisPoint(i, magnitude, cx, cy, r)
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

/**
 * The concentric grid rings (Sprint 67), OUTERMOST FIRST - that order is load
 * bearing, not cosmetic. SVG paints in document order, and the rim is the only
 * ring carrying the panel fill; drawn last it would paint over every inner
 * hairline and put the radar right back to one lonely pentagon.
 */
export const RADAR_RING_MAGNITUDES = [1, 0.75, 0.5, 0.25] as const

/**
 * The SVG `text-anchor` for an axis's label, derived from where that axis
 * actually sits (Sprint 67 decision 5, playtest item 8).
 *
 * Every label used to be `text-anchor="middle"`, so a long one ("authenticity",
 * "reliability") was centred over its vertex and half of it rode straight into
 * the polygon. Anchoring by side makes the text grow AWAY from the plot: right
 * of centre it starts at the vertex, left of centre it ends at it, and at the
 * top/bottom (where there is no side to grow toward) it stays centred.
 *
 * Reuses `axisPoint` on a unit circle rather than repeating the trig, so the
 * anchors can never disagree with where the vertices actually are.
 */
export function axisAnchor(index: number): 'start' | 'middle' | 'end' {
  const p = axisPoint(index, 1, 0, 0, 1)
  if (Math.abs(p.x) < 0.01) return 'middle'
  return p.x > 0 ? 'start' : 'end'
}
