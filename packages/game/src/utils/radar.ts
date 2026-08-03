import type { EconomyConfig, StatBlock } from '@midnight-garage/content'

/** The five radar axes, in draw order starting from the top and going clockwise. */
export const RADAR_AXES = ['power', 'handling', 'style', 'reliability', 'authenticity'] as const
export type RadarAxis = (typeof RADAR_AXES)[number]

export interface Point {
  x: number
  y: number
}

/**
 * Normalizes a StatBlock to 0..1 per axis. Four of the five are already 0-100
 * and divide by it; power is raw PS against `statFormulas.radarPowerCeilingPs`,
 * a display scale that sits above the fastest thing the chart will draw.
 *
 * **Not `powerNormalizationCeiling`**, which is the buyer model's taste term
 * and answers a different question: where a buyer stops caring, not where a
 * chart runs out of room. Using it here pegged the spoke for nine stock cars
 * and every built engine.
 */
export function normalizeStats(
  stats: StatBlock,
  economy: EconomyConfig,
): Record<RadarAxis, number> {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
  return {
    power: clamp01(stats.power / economy.statFormulas.radarPowerCeilingPs),
    handling: clamp01(stats.handling / 100),
    style: clamp01(stats.style / 100),
    reliability: clamp01(stats.reliability / 100),
    authenticity: clamp01(stats.authenticity / 100),
  }
}

/**
 * What an axis reads as a number beside its label: the same 0-100 footing for
 * all five, so they can be compared to each other. Power is the reason this
 * exists, since its raw value is PS and printing that beside four percentages
 * invites reading 50 PS as "50 out of 100".
 */
export function axisDisplayValue(
  axis: RadarAxis,
  stats: StatBlock,
  economy: EconomyConfig,
): number {
  return Math.round(normalizeStats(stats, economy)[axis] * 100)
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
export function statPolygonPoints(stats: StatBlock, size: number, economy: EconomyConfig): string {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  const norm = normalizeStats(stats, economy)
  return RADAR_AXES.map((axis, i) => {
    const p = axisPoint(i, norm[axis], cx, cy, r)
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

/**
 * SVG `points` string for a grid pentagon at `magnitude` (default 1, the outer
 * rim). Concentric rings are just this same function at 0.25/0.5/0.75.
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
 * The concentric grid rings, OUTERMOST FIRST - that order is load
 * bearing, not cosmetic. SVG paints in document order, and the rim is the only
 * ring carrying the panel fill; drawn last it would paint over every inner
 * hairline.
 */
export const RADAR_RING_MAGNITUDES = [1, 0.75, 0.5, 0.25] as const

/**
 * The SVG `text-anchor` for an axis's label, derived from where that axis
 * actually sits. Anchoring by side makes the text grow AWAY from the plot:
 * right of centre it starts at the vertex, left of centre it ends at it, and
 * at the top/bottom (where there is no side to grow toward) it stays centred.
 *
 * Reuses `axisPoint` on a unit circle rather than repeating the trig, so the
 * anchors can never disagree with where the vertices actually are.
 */
export function axisAnchor(index: number): 'start' | 'middle' | 'end' {
  const p = axisPoint(index, 1, 0, 0, 1)
  if (Math.abs(p.x) < 0.01) return 'middle'
  return p.x > 0 ? 'start' : 'end'
}

/**
 * How far out from centre a label's own anchor point sits, as a multiple of
 * the rim radius - just past the rim so the anchor never rides into the
 * plotted polygon. Shared between the label's own position and `radarPad`
 * below so the two can never disagree about where a label actually starts.
 */
export const RADAR_LABEL_MAGNITUDE = 1.12

/** The `.label` font size (CSS px, which inside an unscaled SVG viewBox are
 * the same user units every other radar coordinate is in) - kept here so
 * `radarPad` can reason about label width in the units it actually draws at. */
const LABEL_FONT_SIZE_PX = 10

/**
 * A generous estimate of an upper-cased label's rendered width, in the font
 * size above. There is no text-measurement API at this layer (no canvas, no
 * DOM) to read a real glyph width from, so this is a fixed per-glyph
 * allowance rather than a measured one - wide enough that a real render
 * comes in under it, not tight to the pixel.
 */
export function estimatedLabelWidth(text: string): number {
  const GLYPH_WIDTH_EM = 0.6
  const TRACKING_EM = 0.05 // matches `.label`'s own letter-spacing
  return text.length * LABEL_FONT_SIZE_PX * (GLYPH_WIDTH_EM + TRACKING_EM)
}

/**
 * The viewBox padding a radar of `size` needs so every axis label clears the
 * edge instead of clipping - the longest one ("authenticity"), anchored
 * nearest the horizontal where a side-anchored label commits its whole width
 * to one direction, is the binding case. A side label's own reach does not
 * scale with `size` (the font is a fixed CSS px figure), so a padding
 * fraction of `size` alone under-pads a small radar; this adds the fixed
 * allowance a proportional pad cannot cover, sized per axis from its actual
 * anchor position and label length rather than one flat, guessed constant.
 */
export function radarPad(size: number): number {
  const r = size / 2
  const baseFloor = size * 0.15 // headroom for the top label's own two-line block
  const overshoots = RADAR_AXES.map((axis, i) => {
    const anchor = axisAnchor(i)
    if (anchor === 'middle') return 0 // grows evenly both ways from near dead-centre, never the tight side
    const p = axisPoint(i, RADAR_LABEL_MAGNITUDE, r, r, r)
    const width = estimatedLabelWidth(axis.toUpperCase())
    const spaceAvailable = anchor === 'end' ? p.x : size - p.x
    return width - spaceAvailable
  })
  return Math.max(baseFloor, ...overshoots)
}
