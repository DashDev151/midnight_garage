import { CARS, ECONOMY, type CarModel } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { envelopeAt } from '../src/drive/gearbox'
import { driveParamsFor, type DriveParams } from '../src/drive/params'
import {
  createDriveState,
  DRIVE_DT_S,
  stepDrive,
  TARMAC,
  type DriveInput,
  type DriveState,
} from '../src/drive/physics'
import {
  carBlock,
  factoryDownforceCoeff,
  MINT_CONDITION_FACTORS,
  STOCK_BUILD_FACTORS,
} from '../src/performance'

const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
const AE86 = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!
const GTR = CARS.find((c) => c.id === 'nissan-skyline-gtr-bnr32')!

/** The exact stock assembly the lap model runs on: factory aero, mint, stock. */
function stockParams(model: CarModel): DriveParams {
  const aero = ECONOMY.statFormulas.aero
  const block = carBlock(
    model,
    model.spec.stockPowerPs,
    model.spec.tyreCompound,
    ECONOMY.statFormulas.pace,
    ECONOMY.statFormulas.grip,
    aero,
    { downforceCoeff: factoryDownforceCoeff(model, aero), dragCdDelta: 0 },
    MINT_CONDITION_FACTORS,
    STOCK_BUILD_FACTORS,
  )
  return driveParamsFor(model, block, ECONOMY)
}

function input(partial: Partial<DriveInput>): DriveInput {
  return { steer: 0, throttle: 0, brake: 0, handbrake: false, assistLevel: 1, ...partial }
}

function run(state: DriveState, params: DriveParams, inp: DriveInput, seconds: number): void {
  const steps = Math.round(seconds / DRIVE_DT_S)
  for (let i = 0; i < steps; i++) stepDrive(state, params, inp, TARMAC, DRIVE_DT_S)
}

describe('drive physics calibration', () => {
  it('settles a full-throttle run at the calibrated terminal speed', () => {
    const params = stockParams(GTR)
    const state = createDriveState(params)
    run(state, params, input({ throttle: 1 }), 120)
    const before = state.speedMs
    run(state, params, input({ throttle: 1 }), 5)
    // Settled, and in the calibrated terminal band. The drive model runs on
    // effective power through the gear envelope, so it lands a shade under
    // the crank-power terminal the spec sheet quotes.
    expect(Math.abs(state.speedMs - before)).toBeLessThan(0.25)
    expect(state.speedMs).toBeGreaterThan(0.88 * params.vMaxMs)
    expect(state.speedMs).toBeLessThan(1.03 * params.vMaxMs)
  })

  it('shifts up through the box and respects the redline', () => {
    const params = stockParams(AE86)
    const state = createDriveState(params)
    let maxGear = 1
    let maxRpm = 0
    const steps = Math.round(60 / DRIVE_DT_S)
    const inp = input({ throttle: 1 })
    for (let i = 0; i < steps; i++) {
      stepDrive(state, params, inp, TARMAC, DRIVE_DT_S)
      maxGear = Math.max(maxGear, state.gear)
      maxRpm = Math.max(maxRpm, state.rpm)
    }
    expect(maxGear).toBe(params.gearbox.gearCount)
    expect(maxRpm).toBeLessThanOrEqual(params.gearbox.redlineRpm * 1.01)
  })

  it('normalises the power envelope to mean one over the top-gear sweep', () => {
    for (const model of [CIVIC, AE86, GTR]) {
      const params = stockParams(model)
      const box = params.gearbox
      // The window a gear actually sweeps: from the rev drop after an upshift
      // (previous gear's redline speed in this gear) up to the redline.
      const sweepFrom = box.redlineSpeeds[box.gearCount - 2]! / box.redlineSpeeds[box.gearCount - 1]!
      let sum = 0
      const n = 200
      for (let i = 0; i < n; i++) {
        sum += envelopeAt(box, sweepFrom + ((i + 0.5) / n) * (1 - sweepFrom))
      }
      expect(sum / n).toBeGreaterThan(0.98)
      expect(sum / n).toBeLessThan(1.02)
    }
  })

  it('reproduces the calibrated full-pedal stop with assists off', () => {
    const params = stockParams(CIVIC)
    const state = createDriveState(params)
    state.vLongMs = 30
    state.speedMs = 30
    let distance = 0
    let guard = 0
    const inp = input({ brake: 1, assistLevel: 0 })
    while (state.vLongMs > 0.2 && guard++ < 5000) {
      distance += state.vLongMs * DRIVE_DT_S
      stepDrive(state, params, inp, TARMAC, DRIVE_DT_S)
    }
    const ideal = (30 * 30) / (2 * params.block.brakeMu * params.gravity)
    expect(distance).toBeGreaterThan(0.94 * ideal)
    expect(distance).toBeLessThan(1.08 * ideal)
  })

  it('diverges FWD and RWD under mid-corner throttle', () => {
    const burst = (model: CarModel) => {
      const params = stockParams(model)
      const state = createDriveState(params)
      state.vLongMs = 16
      state.speedMs = 16
      // Settle into the corner raw, then a full-throttle burst.
      run(state, params, input({ steer: 0.5, throttle: 0.15, assistLevel: 0 }), 1.2)
      run(state, params, input({ steer: 0.5, throttle: 1, assistLevel: 0 }), 1.5)
      return state
    }
    const fwd = burst(CIVIC)
    const rwd = burst(AE86)
    // The friction circle spends the driven axle's lateral budget: the FWD
    // car loads its front axle, the RWD car its rear, and only the RWD car
    // builds real body slip. This is the spec's own acceptance wording.
    expect(fwd.frontUsage).toBeGreaterThan(fwd.rearUsage)
    expect(rwd.rearUsage).toBeGreaterThan(rwd.frontUsage)
    expect(Math.abs(rwd.bodySlipRad)).toBeGreaterThan(Math.abs(fwd.bodySlipRad))
  })
})
