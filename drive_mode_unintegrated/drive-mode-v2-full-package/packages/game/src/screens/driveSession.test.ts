import { describe, expect, it } from 'vitest'
import { createDriveTimer, formatDeltaS, formatLapS, recordCrossing } from './driveSession'
import { paintCarSprite } from './carArt'

describe('drive session timing', () => {
  it('interpolates crossings inside the step and tracks best', () => {
    const t = createDriveTimer()
    // A step sweeping the line three quarters through: 100 s + 0.75 dt.
    expect(recordCrossing(t, 2698, 2702, 2700, 100 + 1 / 120, 1 / 120)).toBe(true)
    expect(t.lastLapS).toBeCloseTo(100 + (1 / 120) * 0.5, 5)
    expect(t.bestLapS).toBe(t.lastLapS)
    expect(t.lapsDone).toBe(1)
    // No crossing, no change.
    expect(recordCrossing(t, 10, 20, 2700, 105, 1 / 120)).toBe(false)
    // A slower second lap keeps the best.
    const firstBest = t.bestLapS!
    recordCrossing(t, 2699, 2701, 2700, t.lapStartS + 130, 1 / 120)
    expect(t.bestLapS).toBe(firstBest)
    expect(t.lapsDone).toBe(2)
  })

  it('formats laps and deltas', () => {
    expect(formatLapS(null)).toBe('-')
    expect(formatLapS(58.213)).toBe('58.21')
    expect(formatLapS(83.4)).toBe('1:23.40')
    expect(formatDeltaS(124.5, 122.24)).toBe('+2.26')
    expect(formatDeltaS(121.9, 122.24)).toBe('-0.34')
    expect(formatDeltaS(null, 122.24)).toBe('')
  })
})

describe('placeholder car art', () => {
  it('paints a sprite of the right pixel size without a real canvas', () => {
    const sprite = paintCarSprite(4.2, '#ff5470')
    expect(sprite.canvas.width).toBe(Math.ceil(4.2 * sprite.pxPerM))
    expect(sprite.canvas.height).toBe(Math.ceil(1.7 * sprite.pxPerM))
    expect(sprite.widthM).toBeCloseTo(1.7)
  })
})
