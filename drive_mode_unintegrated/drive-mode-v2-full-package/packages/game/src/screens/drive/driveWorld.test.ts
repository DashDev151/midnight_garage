import { describe, expect, it } from 'vitest'
import { DriftStats, RainMachine, TrafficMachine, codeToSeed, seedToCode, todNow } from './driveWorld'

describe('driveWorld', () => {
  it('todNow lands exactly on each mood at quarter points and blends between', () => {
    for (let k = 0; k < 4; k++) {
      const m = todNow(k / 4, 0)
      expect(m.amb).toBeCloseTo([0.78, 1, 0.82, 0.92][k]!, 5)
    }
    const mid = todNow(0.125, 0)
    expect(mid.amb).toBeGreaterThan(0.78)
    expect(mid.amb).toBeLessThan(1)
  })

  it('rain wet always stays in [0,1] and showers end', () => {
    const rng = (() => {
      let s = 7
      return () => {
        s = (s * 16807) % 2147483647
        return (s % 1000) / 1000
      }
    })()
    const r = new RainMachine(rng)
    let sawOn = false
    let sawOffAfter = false
    for (let i = 0; i < 60 * 60 * 20; i++) {
      r.advance(1 / 60)
      expect(r.wet).toBeGreaterThanOrEqual(0)
      expect(r.wet).toBeLessThanOrEqual(1)
      if (r.on) sawOn = true
      if (sawOn && !r.on) sawOffAfter = true
    }
    expect(sawOn).toBe(true)
    expect(sawOffAfter).toBe(true)
  })

  it('traffic keeps left: the oncoming car uses the right half', () => {
    const t = new TrafficMachine(() => 0)
    t.clock = 0
    t.advance(1 / 60, 1000, 0, true)
    expect(t.car).not.toBeNull()
    expect(t.car!.lat).toBeLessThan(0)
  })

  it('drift stats keep the longest continuous slide only', () => {
    const d = new DriftStats()
    for (let i = 0; i < 60; i++) d.advance(1 / 60, true)
    d.advance(1 / 60, false)
    for (let i = 0; i < 30; i++) d.advance(1 / 60, true)
    expect(d.commit()).toBeCloseTo(1, 1)
  })

  it('route codes round-trip any seed', () => {
    for (const s of [0, 1, 12345, 0x7fffffff, 0xffffffff]) {
      expect(codeToSeed(seedToCode(s))).toBe(s >>> 0)
    }
    expect(codeToSeed('not a code!!')).toBeNull()
  })
})
