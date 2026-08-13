import { CARS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { driveDebugCars, stockDriveParams } from './driveDebugCars'

/**
 * Directive 24 for drive mode: every roster car drives the moment it has a
 * spec. The parameters are derived, never hand-authored per car, so the
 * check is that the derivation lands in a physically sane window for the
 * WHOLE roster, kei vans to flagships.
 */
describe('drive debug car roster', () => {
  it('offers every in-game car exactly once', () => {
    const cars = driveDebugCars()
    expect(cars).toHaveLength(CARS.length)
    expect(new Set(cars.map((c) => c.id)).size).toBe(CARS.length)
  })

  it('builds sane stock drive parameters for the whole roster', () => {
    for (const { model } of driveDebugCars()) {
      const params = stockDriveParams(model)
      expect(params.vMaxMs, model.id).toBeGreaterThan(20)
      expect(params.vMaxMs, model.id).toBeLessThan(120)
      expect(params.wheelbaseM, model.id).toBeGreaterThan(1.6)
      expect(params.wheelbaseM, model.id).toBeLessThan(3.2)
      expect(params.izz, model.id).toBeGreaterThan(0)
      expect(params.gearbox.gearCount, model.id).toBeGreaterThanOrEqual(4)
      expect(params.driveCapN, model.id).toBeGreaterThan(0)
      expect(Number.isFinite(params.peakSlipPerMuFront), model.id).toBe(true)
    }
  })
})
