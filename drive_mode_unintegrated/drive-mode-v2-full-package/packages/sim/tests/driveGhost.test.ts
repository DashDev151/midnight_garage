import { CARS, COURSES, ECONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { runGhostLap } from '../src/drive/ghost'

const MODELS = [
  CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!,
  CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!,
  CARS.find((c) => c.id === 'nissan-skyline-gtr-bnr32')!,
]

const LAP_COURSES = ['misaki', 'hakone', 'wangan'].map((id) => COURSES.find((c) => c.id === id)!)

/**
 * The plan's acceptance test: a clean scripted lap of the drive model lands
 * within a few percent of the point-mass lap model for the same stock car.
 * The lap model is known to run 2-3 percent optimistic at high grip on
 * corner-heavy courses, so the band sits slightly wide on the slow side.
 */
describe('ghost lap acceptance against the lap model', () => {
  for (const course of LAP_COURSES) {
    describe(course.id, () => {
      for (const model of MODELS) {
        it(`${model.id} lands within the acceptance band`, () => {
          const result = runGhostLap(model, course, ECONOMY)
          console.log(
            `${course.id} ${model.id}: drive ${result.driveLapS.toFixed(2)} s, ` +
              `model ${result.modelLapS.toFixed(2)} s, ratio ${result.ratio.toFixed(4)}, ` +
              `max lateral ${result.maxLateralM.toFixed(2)} m, end st ${result.endStationM.toFixed(0)} ` +
              `at ${result.endTimeS.toFixed(0)} s lat ${result.endLateralM.toFixed(1)}`,
          )
          expect(result.driveLapS).toBeLessThan(Infinity)
          expect(result.ratio).toBeGreaterThan(0.96)
          expect(result.ratio).toBeLessThan(1.07)
        })
      }
    })
  }
})
