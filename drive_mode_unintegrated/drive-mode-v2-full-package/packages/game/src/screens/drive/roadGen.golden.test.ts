import { describe, expect, it } from 'vitest'
import { BUYERS, CARS, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { buildSimContext, driveParamsForInstance } from '@midnight-garage/sim'
import { makeRoad, generateChunk } from './roadGen'
import { ARCADE_DT_S, DEFAULT_TUNE, arcadeCarFor, createArcadeState, stepArcade } from './arcadePhysics'
import { ARCADE_CONFIG } from './arcadeConfig'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
function setup(id: string) {
  const model = CARS.find((c) => c.id === id)!
  // The screen passes a real instance; tests reuse the sim test route via
  // a stock mint instance assembled by the sim package's own fixtures is
  // not importable here, so derive through driveParamsForInstance with a
  // minimal mint instance built from the parts taxonomy.
  const partIds = PARTS_TAXONOMY.map((e) => e.id)
  const stockFor = (partId: string) =>
    PARTS.find((p) => p.carPartId === partId && p.grade === 'stock')?.id ??
    PARTS.find((p) => p.carPartId === partId)!.id
  const parts = Object.fromEntries(
    partIds.map((pid) => [pid, { installed: { partId: stockFor(pid), band: 'mint' } }]),
  )
  const car = {
    id: 'test-car',
    modelId: model.id,
    nickname: null,
    parts,
    provenance: [],
  }
  const p = driveParamsForInstance(car as never, model, CONTEXT)
  expect(p).not.toBeNull()
  return p!
}

describe('the golden road: cross-stack parity pins', () => {
  // These checksums were verified DIGIT-IDENTICAL against the artifact
  // stack (v16.1 parity audit). Any formula drift in generation,
  // elevation, zones, tilt or ridges breaks them.
  it('three seeds, every subsystem', () => {
    const expected = [
      { seed: 1, xy: 127120.5, z: 2288.1, h: -3.7659, tilt: 18.7297, ridge: 10356.38, zones: 563 },
      { seed: 7, xy: 144355.32, z: -1689.2, h: 3.8197, tilt: 42.8053, ridge: 9176.19, zones: 743 },
      { seed: 23, xy: 142691.86, z: 494.14, h: 13.6044, tilt: -20.2708, ridge: 10133.3, zones: 420 },
    ]
    for (const e of expected) {
      const road = makeRoad(e.seed)
      for (let c = 0; c < 10; c++) generateChunk(road)
      let sx = 0
      let sz = 0
      let sh = 0
      let st2 = 0
      let sr = 0
      let zk = 0
      for (let i = 0; i < road.samples.length; i += 7) {
        const p = road.samples[i]!
        sx += p.xM + p.yM
        sz += p.zM
        sh += p.headingRad
      }
      for (let s2 = 0; s2 < 7000; s2 += 53) {
        st2 += road.tiltAt(s2)
        sr += road.ridgeAt(s2, 0) + road.ridgeAt(s2, 1)
        zk += road.zoneAt(s2).kind + (road.zoneAt(s2).cliff ? 10 : 0)
      }
      expect(sx).toBeCloseTo(e.xy, 1)
      expect(sz).toBeCloseTo(e.z, 1)
      expect(sh).toBeCloseTo(e.h, 3)
      expect(st2).toBeCloseTo(e.tilt, 3)
      expect(sr).toBeCloseTo(e.ridge, 1)
      expect(zk).toBe(e.zones)
    }
  })
})
