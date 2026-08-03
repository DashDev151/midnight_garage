import { ECONOMY, type StatBlock } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  axisAnchor,
  axisDisplayValue,
  axisPoint,
  estimatedLabelWidth,
  gridPolygonPoints,
  normalizeStats,
  RADAR_AXES,
  RADAR_LABEL_MAGNITUDE,
  RADAR_RING_MAGNITUDES,
  radarPad,
  statPolygonPoints,
} from './radar'

const ZERO: StatBlock = { power: 0, handling: 0, style: 0, reliability: 0, authenticity: 0 }
const CEILING = ECONOMY.statFormulas.radarPowerCeilingPs

describe('normalizeStats', () => {
  it('maps 0-100 stats onto 0..1 and clamps', () => {
    const n = normalizeStats({ ...ZERO, handling: 50, style: 100, reliability: 200 }, ECONOMY)
    expect(n.handling).toBeCloseTo(0.5)
    expect(n.style).toBe(1)
    expect(n.reliability).toBe(1) // clamped, not 2
  })

  /**
   * Power is the only axis whose raw value is not already 0-100, so it is the
   * only one that can silently plot on a different scale from its neighbours.
   * It divides by `radarPowerCeilingPs`, a display scale that sits above the
   * fastest car the chart will draw. The buyer model's own
   * `powerNormalizationCeiling` is a different question and is far lower: used
   * here it pegged the spoke for nine stock cars and every built engine.
   */
  it('maps power against the radar display ceiling, not the buyer taste one', () => {
    expect(CEILING).toBeGreaterThan(ECONOMY.statFormulas.powerNormalizationCeiling)
    expect(normalizeStats({ ...ZERO, power: CEILING }, ECONOMY).power).toBe(1)
    expect(normalizeStats({ ...ZERO, power: CEILING / 2 }, ECONOMY).power).toBeCloseTo(0.5)
    expect(normalizeStats({ ...ZERO, power: CEILING * 3 }, ECONOMY).power).toBe(1) // clamped
  })
})

describe('axisDisplayValue', () => {
  /**
   * The number printed beside a label. All five read 0-100 so they can be
   * compared to each other: printing power's raw PS beside four percentages
   * invites reading 50 PS as "50 out of 100" when it is a sixth of the ceiling.
   */
  it('reads every axis on the same 0-100 footing, power included', () => {
    const stats: StatBlock = {
      power: CEILING / 2,
      handling: 40,
      style: 60,
      reliability: 80,
      authenticity: 100,
    }
    expect(axisDisplayValue('power', stats, ECONOMY)).toBe(50)
    expect(axisDisplayValue('handling', stats, ECONOMY)).toBe(40)
    expect(axisDisplayValue('style', stats, ECONOMY)).toBe(60)
    expect(axisDisplayValue('reliability', stats, ECONOMY)).toBe(80)
    expect(axisDisplayValue('authenticity', stats, ECONOMY)).toBe(100)
  })

  it('never prints raw PS, which is what made power incomparable', () => {
    const stats: StatBlock = { ...ZERO, power: 50 }
    expect(axisDisplayValue('power', stats, ECONOMY)).not.toBe(50)
    expect(axisDisplayValue('power', stats, ECONOMY)).toBe(Math.round((50 / CEILING) * 100))
  })
})

describe('axisPoint', () => {
  it('places the first axis straight up from center at full magnitude', () => {
    const p = axisPoint(0, 1, 50, 50, 50)
    expect(p.x).toBeCloseTo(50) // same x as center
    expect(p.y).toBeCloseTo(0) // straight up (smaller y)
  })

  it('a larger magnitude sits farther from center', () => {
    const cx = 50
    const near = axisPoint(1, 0.2, cx, 50, 50)
    const far = axisPoint(1, 0.9, cx, 50, 50)
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - cx, p.y - 50)
    expect(dist(far)).toBeGreaterThan(dist(near))
  })
})

describe('statPolygonPoints', () => {
  it('emits one vertex per axis', () => {
    const pts = statPolygonPoints({ ...ZERO, handling: 40 }, 100, ECONOMY).split(' ')
    expect(pts).toHaveLength(RADAR_AXES.length)
  })

  it('a stronger car draws a larger polygon (vertices farther from center)', () => {
    const size = 100
    const center = { x: 50, y: 50 }
    const spread = (block: StatBlock) => {
      const pts = statPolygonPoints(block, size, ECONOMY)
        .split(' ')
        .map((s) => {
          const [x, y] = s.split(',').map(Number)
          return Math.hypot(x! - center.x, y! - center.y)
        })
      return pts.reduce((a, b) => a + b, 0)
    }
    const weak: StatBlock = {
      power: 50,
      handling: 20,
      style: 20,
      reliability: 20,
      authenticity: 20,
    }
    const strong: StatBlock = {
      power: 400,
      handling: 90,
      style: 90,
      reliability: 90,
      authenticity: 90,
    }
    expect(spread(strong)).toBeGreaterThan(spread(weak))
  })
})

describe('the readable radar (Sprint 67 decision 5, playtest item 8)', () => {
  it('draws four concentric rings, outermost first so the filled rim paints beneath them', () => {
    // The order is load bearing: SVG paints in document order and only the rim
    // is filled, so a rim drawn last hides every inner ring and the radar is
    // back to the one lonely pentagon item 8 complained about.
    expect([...RADAR_RING_MAGNITUDES]).toEqual([1, 0.75, 0.5, 0.25])
  })

  it('a smaller ring sits strictly inside a larger one', () => {
    const distances = RADAR_RING_MAGNITUDES.map((m) => {
      const [x, y] = gridPolygonPoints(100, m).split(' ')[0]!.split(',').map(Number)
      return Math.hypot(x! - 50, y! - 50)
    })
    // Outermost first, so distances descend.
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]!).toBeLessThan(distances[i - 1]!)
    }
  })

  it('every ring has one vertex per axis', () => {
    for (const magnitude of RADAR_RING_MAGNITUDES) {
      expect(gridPolygonPoints(100, magnitude).split(' ')).toHaveLength(RADAR_AXES.length)
    }
  })

  it('defaults to the rim, so existing callers are unchanged', () => {
    expect(gridPolygonPoints(100)).toBe(gridPolygonPoints(100, 1))
  })

  it('anchors each label away from the plot, never centred over a side vertex', () => {
    // The bug: every label was `text-anchor="middle"`, so a long one
    // ("authenticity") was centred on its vertex and half of it rode into the
    // polygon. A label right of centre must START at its vertex and grow
    // right; left of centre it must END at its vertex and grow left.
    RADAR_AXES.forEach((axis, i) => {
      const p = axisPoint(i, 1, 0, 0, 1)
      const anchor = axisAnchor(i)
      if (Math.abs(p.x) < 0.01) expect(anchor, axis).toBe('middle')
      else if (p.x > 0) expect(anchor, axis).toBe('start')
      else expect(anchor, axis).toBe('end')
    })
  })

  it('puts the top axis at middle and gives both sides an outward anchor', () => {
    expect(axisAnchor(0)).toBe('middle') // straight up - no side to grow toward
    const anchors = RADAR_AXES.map((_, i) => axisAnchor(i))
    expect(anchors).toContain('start')
    expect(anchors).toContain('end')
  })
})

describe('radarPad (playtest complaint: the authenticity label clips)', () => {
  // "authenticity" is the longest axis name and sits nearest the horizontal
  // (index 4, the same |cos| magnitude as "handling"), where a side-anchored
  // label commits its whole width to one direction rather than splitting it -
  // the combination that clips first.

  /** No axis's label, at the given pad, reaches past the padded viewBox edge. */
  function fitsEveryLabel(size: number, pad: number): boolean {
    const r = size / 2
    return RADAR_AXES.every((axis, i) => {
      const anchor = axisAnchor(i)
      if (anchor === 'middle') return true
      const p = axisPoint(i, RADAR_LABEL_MAGNITUDE, r, r, r)
      const width = estimatedLabelWidth(axis.toUpperCase())
      const spaceAvailable = anchor === 'end' ? p.x + pad : size - p.x + pad
      return width <= spaceAvailable
    })
  }

  it('fits every label at the sizes the game actually renders (150 on CarDetailScreen, 200 the prop default)', () => {
    for (const size of [150, 200, 280]) {
      expect(fitsEveryLabel(size, radarPad(size)), `size ${size}`).toBe(true)
    }
  })

  it('the old flat 0.38-of-size padding under-pads a small radar - a fixed-px label does not shrink with size', () => {
    const size = 150
    const oldPad = size * 0.38
    expect(fitsEveryLabel(size, oldPad)).toBe(false)
    expect(radarPad(size)).toBeGreaterThan(oldPad)
  })

  it("authenticity is the binding label at the game's own radar size", () => {
    const size = 150
    const r = size / 2
    const authenticityIndex = RADAR_AXES.indexOf('authenticity')
    const p = axisPoint(authenticityIndex, RADAR_LABEL_MAGNITUDE, r, r, r)
    const width = estimatedLabelWidth('AUTHENTICITY')
    // anchor is 'end' here (left of centre) - the space available before
    // padding is the anchor's own x coordinate.
    expect(axisAnchor(authenticityIndex)).toBe('end')
    expect(radarPad(size)).toBeGreaterThanOrEqual(width - p.x)
  })
})
