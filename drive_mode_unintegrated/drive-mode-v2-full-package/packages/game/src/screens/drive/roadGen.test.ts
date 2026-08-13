import { describe, expect, it } from 'vitest'
import {
  CHUNK_SAMPLES,
  SAMPLE_SPACING_M,
  dropChunk,
  generateChunk,
  locateOnRoad,
  maintainWindow,
  makeRoad,
  surfaceAtLateral,
  surfaceZAt,
  waterHazardAt,
} from './roadGen'

describe('endless road generation', () => {
  it('is deterministic per seed, exactly spaced, and bounded', () => {
    const a = makeRoad(1234)
    const b = makeRoad(1234)
    for (let i = 0; i < 6; i++) {
      generateChunk(a)
      generateChunk(b)
    }
    expect(a.samples[321]!.xM).toBe(b.samples[321]!.xM)
    let kMax = 0
    for (let i = 1; i < a.samples.length; i++) {
      const p = a.samples[i - 1]!
      const q = a.samples[i]!
      expect(Math.hypot(q.xM - p.xM, q.yM - p.yM)).toBeCloseTo(SAMPLE_SPACING_M, 2)
      kMax = Math.max(kMax, Math.abs(q.curvature))
    }
    // Minimum radius stays gentle: this is a cruise, not a hairpin stage.
    // The turned-up register: sharp elbows exist (down to ~20 m) but
    // never below a drivable floor.
    expect(1 / kMax).toBeGreaterThan(15)
    expect(1 / kMax).toBeLessThan(38)
  })

  it('has a smooth analytic surface: no 2 m staircase for the car to ride', () => {
    const road = makeRoad(77)
    for (let i = 0; i < 4; i++) generateChunk(road)
    let maxStep = 0
    for (let s = 10; s < 700; s += 0.3) {
      maxStep = Math.max(maxStep, Math.abs(road.elevationAt(s + 0.3) - road.elevationAt(s)))
    }
    expect(maxStep).toBeLessThan(0.08)
  })

  it('locates against the window and survives chunk drops with a rebased hint', () => {
    const road = makeRoad(9)
    for (let i = 0; i < 6; i++) generateChunk(road)
    const target = road.samples[420]!
    const fix = locateOnRoad(road, target.xM + 0.5, target.yM, 400)
    expect(Math.abs(fix.stationM - target.stationM)).toBeLessThan(3)
    const before = road.samples.length
    dropChunk(road)
    expect(road.samples.length).toBe(before - CHUNK_SAMPLES)
    const fix2 = locateOnRoad(road, target.xM, target.yM, fix.index - CHUNK_SAMPLES)
    expect(Math.abs(fix2.stationM - target.stationM)).toBeLessThan(3)
  })

  it('maintains the window: generates ahead, drops behind, reports the rebase', () => {
    const road = makeRoad(5)
    const chunkStarts: number[] = []
    generateChunk(road)
    let dropped = maintainWindow(road, 0, (i) => chunkStarts.push(i))
    expect(dropped).toBe(0)
    expect(road.chunksGenerated).toBeGreaterThanOrEqual(7)
    dropped = maintainWindow(road, CHUNK_SAMPLES * 4, (i) => chunkStarts.push(i))
    expect(dropped).toBeGreaterThan(0)
  })

  it('never approaches itself in plan: overlap is impossible', () => {
    // The map-on-top-of-the-map bug: an integrated-heading road is a
    // random walk and recrosses itself (measured within 1 m). The
    // monotone-progress construction keeps far-apart stations far
    // apart in plan; skirts reach 92 m, so 120 m is the safety floor.
    for (const seed of [3, 11]) {
      const road = makeRoad(seed)
      for (let c = 0; c < 15; c++) generateChunk(road)
      const s2 = road.samples
      let minD = Infinity
      for (let a = 0; a < s2.length; a += 3) {
        for (let b = a + 78; b < s2.length; b += 3) {
          const o = s2[a]!
          const p2 = s2[b]!
          if (p2.stationM - o.stationM <= 150) continue
          const d = Math.hypot(o.xM - p2.xM, o.yM - p2.yM)
          if (d < minD) minD = d
        }
      }
      expect(minD).toBeGreaterThan(120)
    }
  })

  it('assigns deterministic zones and reaches every kind', () => {
    const a = makeRoad(7)
    const b = makeRoad(7)
    const kinds = new Set<number>()
    for (let s2 = 0; s2 < 12000; s2 += 40) {
      const za = a.zoneAt(s2)
      expect(za.kind).toBe(b.zoneAt(s2).kind)
      expect(za.fogNearM).toBeCloseTo(b.zoneAt(s2).fogNearM, 10)
      kinds.add(za.kind)
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4)
  })

  it('keeps generating chunks far past the first drops (the 2 km stall)', () => {
    const road = makeRoad(5)
    let hint = 0
    const builds: Array<[number, number]> = []
    const step = (): void => {
      const dropped = maintainWindow(road, hint, (startIndex) => {
        const end = Math.min(road.samples.length - 1, startIndex + 100)
        builds.push([startIndex + road.samplesDropped, end + road.samplesDropped])
      })
      hint -= dropped
    }
    for (let i = 0; i < 2100; i++) {
      hint += 1
      step()
    }
    const globalCar = hint + road.samplesDropped
    expect(globalCar).toBeGreaterThan(2000)
    expect(road.chunksGenerated).toBeGreaterThanOrEqual(Math.floor(globalCar / 100) + 5)
    expect(road.samples.length).toBeLessThanOrEqual(100 * 10)
    builds.sort((a, b) => a[0]! - b[0]!)
    let cover = builds[0]![1]
    for (let i = 1; i < builds.length; i++) {
      expect(builds[i]![0]).toBeLessThanOrEqual(cover)
      cover = Math.max(cover, builds[i]![1])
    }
    expect(cover).toBeGreaterThan(2000)
  })

  it('lit zones are deterministic and cover part of the road', () => {
    const a = makeRoad(7)
    const b = makeRoad(7)
    let lit = 0
    for (let st = 0; st < 8000; st += 2) {
      expect(a.litAt(st)).toBe(b.litAt(st))
      if (a.litAt(st)) lit += 1
    }
    expect(lit).toBeGreaterThan(400)
    expect(lit).toBeLessThan(3600)
  })

  it('the sea takes you back to the road: cliff lips are tighter than beaches', () => {
    const coastCliff = { kind: 3, waterSide: 1, cliff: true } as never
    const coastBeach = { kind: 3, waterSide: 1, cliff: false } as never
    const hills = { kind: 0, waterSide: 1, cliff: false } as never
    expect(waterHazardAt(coastCliff, 7.2)).toBe(true)
    expect(waterHazardAt(coastCliff, 6.8)).toBe(false)
    expect(waterHazardAt(coastBeach, 13.6)).toBe(true)
    expect(waterHazardAt(coastBeach, 13.2)).toBe(false)
    expect(waterHazardAt(coastBeach, -20)).toBe(false)
    expect(waterHazardAt(hills, 40)).toBe(false)
  })

  it('the cross-slope: bounded, deterministic, flat in villages, uphill on coast land', () => {
    const road = makeRoad(31)
    let anySteep = false
    for (let s = 0; s < 20000; s += 95) {
      const t = road.tiltAt(s)
      expect(Math.abs(t)).toBeLessThanOrEqual(1)
      expect(t).toBe(makeRoad(31).tiltAt(s))
      const zone = road.zoneAt(s)
      const centred = s % 760 > 200 && s % 760 < 560
      if (zone.kind === 2 && centred) expect(Math.abs(t)).toBeLessThan(0.15)
      if (zone.kind === 3 && centred) expect(t * zone.waterSide).toBeLessThanOrEqual(0)
      if (Math.abs(t) > 0.7) anySteep = true
    }
    expect(anySteep).toBe(true)
  })

  it('the drawn surface is what the car rides: continuous, and exact on the road', () => {
    const road = makeRoad(12)
    for (let i = 0; i < 8; i++) generateChunk(road)
    for (let s = 30; s < 1400; s += 41) {
      expect(surfaceZAt(road, s, 0)).toBe(road.elevationAt(s))
      expect(surfaceZAt(road, s, 3)).toBe(road.elevationAt(s))
      let prev = surfaceZAt(road, s, -95)
      for (let lat = -94.6; lat <= 95; lat += 0.4) {
        const z = surfaceZAt(road, s, lat)
        expect(Number.isFinite(z)).toBe(true)
        expect(Math.abs(z - prev)).toBeLessThan(1.6)
        prev = z
      }
    }
    // A cliff coast drops to the sea.
    outer: for (let s = 0; s < 30000; s += 380) {
      const zn = road.zoneAt(s)
      if (zn.kind === 3 && zn.cliff && s % 760 > 250 && s % 760 < 500) {
        const drop = road.elevationAt(s) - surfaceZAt(road, s, 30 * zn.waterSide)
        expect(drop).toBeCloseTo(22, 5)
        break outer
      }
    }
  })

  it('grass off the tarmac, never a wall', () => {
    const grass = { grip: 0.6, extraDragMs2: 2 }
    expect(surfaceAtLateral(0, grass).grip).toBe(1)
    expect(surfaceAtLateral(9, grass)).toBe(grass)
  })
})
