import { BUYERS, CARS, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { buildSimContext, driveParamsForInstance } from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import { ARCADE_CONFIG } from './arcadeConfig'
import {
  ARCADE_DT_S,
  speedTargetControl,
  DEFAULT_TUNE,
  arcadeCarFor,
  createArcadeState,
  lateralCurve,
  stepArcade,
} from './arcadePhysics'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function arcadeSetup(id: string) {
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

describe('the arcade register', () => {
  it('holds lateral force past the peak instead of falling off a cliff', () => {
    expect(lateralCurve(1, 0.985)).toBeCloseTo(1, 5)
    expect(lateralCurve(3, 0.985)).toBeGreaterThan(0.98)
    expect(lateralCurve(-3, 0.985)).toBeLessThan(-0.98)
  })

  it('accelerates hard from rest and reaches road speed deterministically', () => {
    const params = arcadeSetup('honda-civic-sir2-eg6')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const a = createArcadeState(params)
    const b = createArcadeState(params)
    const input = { steer: 0, throttle: 1, brake: 0, handbrake: false }
    for (let i = 0; i < 120 * 8; i++) {
      stepArcade(a, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, 0, ARCADE_DT_S)
      stepArcade(b, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, 0, ARCADE_DT_S)
    }
    expect(a.speedMs).toBeGreaterThan(28)
    expect(a.speedMs).toBe(b.speedMs)
    expect(a.gear).toBeGreaterThan(1)
  })

  it('REGRESSION: trail-braking left turns the car LEFT, never right', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    // Up to speed first.
    for (let i = 0; i < 120 * 6; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    const h0 = st.headingRad
    for (let i = 0; i < 60; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 1, throttle: 0, brake: 1, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    expect(st.headingRad).toBeGreaterThan(h0 + 0.02)
  })

  it('the tiny reverse gear: engages near a standstill, capped, steerable', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const a = createArcadeState(params)
    const b = createArcadeState(params)
    const back = { steer: 0, throttle: 1, brake: 0, handbrake: false, reverse: true }
    for (let i = 0; i < 120 * 6; i++) {
      stepArcade(a, car, ARCADE_CONFIG, DEFAULT_TUNE, back, 1, 0, 0, ARCADE_DT_S)
      stepArcade(b, car, ARCADE_CONFIG, DEFAULT_TUNE, back, 1, 0, 0, ARCADE_DT_S)
    }
    expect(a.vLongMs).toBeLessThan(-2)
    expect(a.vLongMs).toBeGreaterThanOrEqual(-3.6)
    expect(a.vLongMs).toBe(b.vLongMs)
    // The reverse gear never engages at road speed.
    const c = createArcadeState(params)
    for (let i = 0; i < 120 * 5; i++) {
      stepArcade(c, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    const vBefore = c.vLongMs
    for (let i = 0; i < 30; i++) {
      stepArcade(c, car, ARCADE_CONFIG, DEFAULT_TUNE, back, 1, 0, 0, ARCADE_DT_S)
    }
    expect(c.vLongMs).toBeGreaterThan(vBefore - 3)
    expect(c.vLongMs).toBeGreaterThan(10)
  })

  it('the speed-target law cruises, trims, and reverses sensibly', () => {
    expect(speedTargetControl(30, 10).throttle).toBe(1)
    expect(speedTargetControl(30, 10).brake).toBe(0)
    expect(speedTargetControl(30, 29).throttle).toBeCloseTo(0.2, 5)
    expect(speedTargetControl(10, 16).brake).toBeGreaterThan(0)
    expect(speedTargetControl(10, 11).brake).toBe(0)
    const rev = speedTargetControl(-2, 0)
    expect(rev.reverse).toBe(true)
    expect(rev.throttle).toBeGreaterThan(0.5)
    const slow = speedTargetControl(-2, 20)
    expect(slow.reverse).toBe(false)
    expect(slow.brake).toBeCloseTo(0.6, 5)
  })

  it('a cross-slope pulls the car sideways: bank gravity is physical', () => {
    const params = arcadeSetup('honda-civic-sir2-eg6')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    const input = { steer: 0, throttle: 0.4, brake: 0, handbrake: false }
    for (let i = 0; i < 120 * 4; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, 0, ARCADE_DT_S)
    }
    const flatLat = st.vLatMs
    for (let i = 0; i < 120; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, 0, ARCADE_DT_S, 0.5)
    }
    // Surface rising to the left pushes the car right (negative vLat),
    // resisted but not cancelled by tyre grip.
    expect(st.vLatMs).toBeLessThan(flatLat)
  })

  it('braking with a disturbance and no steering straightens out, never swaps ends', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    for (let i = 0; i < 120 * 8; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    st.vLatMs = 1.2
    st.yawRadS = 0.12
    const h0 = st.headingRad
    for (let i = 0; i < 120 * 3.6; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 0, brake: 0.8, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    expect(Math.abs(st.headingRad - h0)).toBeLessThan(0.45)
    expect(st.speedMs).toBeLessThan(3)
  })

  it('downhill trail braking stays a drive, not a spin: MSR keeps engine drag in check', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    for (let i = 0; i < 120 * 5; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    let yawPk = 0
    for (let i = 0; i < 120 * 2.2; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.22, throttle: 0, brake: 0.7, handbrake: false }, 1, 0, -0.15, ARCADE_DT_S)
      yawPk = Math.max(yawPk, Math.abs(st.yawRadS))
    }
    expect(yawPk).toBeLessThan(1.3)
  })

  it('ABS: a fully held binary brake still lets the car turn in', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    for (let i = 0; i < 120 * 6; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    const h0 = st.headingRad
    let yawPk = 0
    for (let i = 0; i < 120 * 1.5; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.3, throttle: 0, brake: 1, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
      yawPk = Math.max(yawPk, Math.abs(st.yawRadS))
    }
    expect(Math.abs(st.headingRad - h0) * 57.3).toBeGreaterThan(40)
    expect(yawPk).toBeLessThan(1.6)
    expect(st.vLongMs).toBeLessThan(8)
  })

  it('a moderate braking arc at speed holds the steered line: no snap past the commanded rate', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    for (let i = 0; i < 120 * 6; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    let yawPk = 0
    for (let i = 0; i < 120 * 1.2; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.18, throttle: 0, brake: 0.6, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
      yawPk = Math.max(yawPk, Math.abs(st.yawRadS))
    }
    // Commanded kinematic yaw at this entry is about 1.26 rad/s: the
    // bound allows the driven arc plus margin, never a snap beyond it.
    expect(yawPk).toBeLessThan(1.5)
  })

  it('a full sideways slide under brakes bleeds out smoothly, no wall at the end', () => {
    const params = arcadeSetup('toyota-sprinter-trueno-ae86')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    st.vLongMs = 2
    st.vLatMs = 10
    st.speedMs = Math.hypot(2, 10)
    let prev = st.speedMs
    let maxDrop = 0
    let steps = 0
    while (st.speedMs > 0.4 && steps < 120 * 8) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 0, brake: 1, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
      maxDrop = Math.max(maxDrop, prev - st.speedMs)
      prev = st.speedMs
      steps++
    }
    expect(maxDrop).toBeLessThan(0.3)
    expect(steps).toBeLessThan(120 * 8)
  })

  it('the three drivetrains have distinct acceleration: AWD > FWD > RWD here', () => {
    const t100 = (id: string): number => {
      const params = arcadeSetup(id)
      const car = arcadeCarFor(params, DEFAULT_TUNE)
      const st = createArcadeState(params)
      const input = { steer: 0, throttle: 1, brake: 0, handbrake: false }
      for (let i = 0; i < 120 * 40; i++) {
        stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, 0, ARCADE_DT_S)
        if (st.vLongMs * 3.6 >= 100) return i / 120
      }
      return 999
    }
    const gtr = t100('nissan-skyline-gtr-bnr32')
    const civic = t100('honda-civic-sir2-eg6')
    const hachi = t100('toyota-sprinter-trueno-ae86')
    expect(gtr).toBeLessThan(civic - 1)
    expect(civic).toBeLessThan(hachi - 1)
  })

  it('AWD stays planted in a full-power corner: ATTESA feeds torque forward', () => {
    const params = arcadeSetup('nissan-skyline-gtr-bnr32')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    for (let i = 0; i < 120 * 6; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    let satPk = 0
    for (let i = 0; i < 120 * 2.5; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.45, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
      satPk = Math.max(satPk, st.latSatRear)
    }
    expect(satPk).toBeLessThan(1.05)
  })

  it('FWD lift-off oversteer: closing the throttle mid-corner rotates the car', () => {
    const params = arcadeSetup('honda-civic-sir2-eg6')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    for (let i = 0; i < 120 * 6; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    for (let i = 0; i < 120 * 1.5; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.4, throttle: 0.55, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
    }
    const yawOn = Math.abs(st.yawRadS)
    let yawLiftPk = 0
    for (let i = 0; i < 120 * 1.2; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.4, throttle: 0, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
      yawLiftPk = Math.max(yawLiftPk, Math.abs(st.yawRadS))
    }
    // The lift is a TRANSIENT now (a decaying pulse), not a standing
    // rear derate: expect a clear rotation nudge, not a snap.
    expect(yawLiftPk).toBeGreaterThan(yawOn * 1.12)
    expect(yawLiftPk).toBeLessThan(1.6)
  })

  it('FWD steady cornering at speed is an understeerer: no standing oversteer', () => {
    const params = arcadeSetup('honda-civic-sir2-eg6')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const st = createArcadeState(params)
    st.vLongMs = 22.2
    let betaPk = 0
    let slid = 0
    for (let i = 0; i < 120 * 3; i++) {
      stepArcade(st, car, ARCADE_CONFIG, DEFAULT_TUNE, { steer: 0.22, throttle: 0.45, brake: 0, handbrake: false }, 1, 0, 0, ARCADE_DT_S)
      betaPk = Math.max(betaPk, Math.abs(Math.atan2(st.vLatMs, Math.max(1, Math.abs(st.vLongMs)))))
      if (st.sliding) slid++
    }
    // A front-driver holding a moderate 80 km/h arc must keep its
    // body slip small and must not live in the drift state.
    expect(betaPk).toBeLessThan(0.22)
    expect(slid).toBeLessThan(30)
  })

  it('a descent adds pace: the grade force is physical', () => {
    const params = arcadeSetup('honda-civic-sir2-eg6')
    const car = arcadeCarFor(params, DEFAULT_TUNE)
    const flat = createArcadeState(params)
    const down = createArcadeState(params)
    const input = { steer: 0, throttle: 1, brake: 0, handbrake: false }
    for (let i = 0; i < 120 * 5; i++) {
      stepArcade(flat, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, 0, ARCADE_DT_S)
      stepArcade(down, car, ARCADE_CONFIG, DEFAULT_TUNE, input, 1, 0, -0.08, ARCADE_DT_S)
    }
    expect(down.speedMs).toBeGreaterThan(flat.speedMs + 1)
  })
})
