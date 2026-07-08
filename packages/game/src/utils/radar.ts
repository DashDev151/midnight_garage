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

/** SVG `points` string for the outer grid pentagon (all axes at full magnitude). */
export function gridPolygonPoints(size: number): string {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  return RADAR_AXES.map((_, i) => {
    const p = axisPoint(i, 1, cx, cy, r)
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}
