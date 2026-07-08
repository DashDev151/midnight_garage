import type { StatBlock } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { RADAR_POWER_REFERENCE_PS } from '../constants'
import { axisPoint, normalizeStats, RADAR_AXES, statPolygonPoints } from './radar'

const ZERO: StatBlock = { power: 0, handling: 0, style: 0, reliability: 0, authenticity: 0 }

describe('normalizeStats', () => {
  it('maps 0-100 stats onto 0..1 and clamps', () => {
    const n = normalizeStats({ ...ZERO, handling: 50, style: 100, reliability: 200 })
    expect(n.handling).toBeCloseTo(0.5)
    expect(n.style).toBe(1)
    expect(n.reliability).toBe(1) // clamped, not 2
  })

  it('maps power against the reference ceiling', () => {
    expect(normalizeStats({ ...ZERO, power: RADAR_POWER_REFERENCE_PS }).power).toBe(1)
    expect(normalizeStats({ ...ZERO, power: RADAR_POWER_REFERENCE_PS / 2 }).power).toBeCloseTo(0.5)
    expect(normalizeStats({ ...ZERO, power: RADAR_POWER_REFERENCE_PS * 3 }).power).toBe(1) // clamped
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
    const pts = statPolygonPoints({ ...ZERO, handling: 40 }, 100).split(' ')
    expect(pts).toHaveLength(RADAR_AXES.length)
  })

  it('a stronger car draws a larger polygon (vertices farther from center)', () => {
    const size = 100
    const center = { x: 50, y: 50 }
    const spread = (block: StatBlock) => {
      const pts = statPolygonPoints(block, size)
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
