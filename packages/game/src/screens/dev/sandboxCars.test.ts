import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
} from '@midnight-garage/content'
import { buildSimContext } from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import LAPSIM_DATA from '../../../../../docs/design/car-performance/lapsim/lapsim-data.json'
import { SANDBOX_ROSTER } from './sandboxCars'
import { defaultBuild, evaluateBuild, modelAtTier, sandboxCars } from './sandboxModel'

/**
 * THE ACCEPTANCE CHECK FOR THE GENERATED SANDBOX ROSTER.
 *
 * Every one of the 85 vetted cars, at stock and mint, must reproduce the lap
 * harness's own time for it on all four courses. That is the same oracle the
 * shipped physics is held to (`packages/sim/tests/harnessAcceptance.test.ts`),
 * and here it holds the GENERATOR honest as well: 59 of the 85 are models
 * `tools/sandbox/generateCars.mjs` synthesises from the spec book, and a
 * synthesised model that is wrong says so in its stock lap time.
 *
 * `pnpm sandbox:cars` regenerates the roster and then runs this, so a
 * generation that corrupts a car cannot be committed.
 *
 * A miss is never fixed by widening the tolerance. The tolerance is 0.2 s only
 * because the fixture is rounded to a tenth.
 */

const TOLERANCE_SECONDS = 0.2

/**
 * The ONE known difference between the harness and the shipped physics, and it
 * is not the generator's.
 *
 * The harness hands part of a car's crank-to-effective power shortfall back
 * above 161 km/h, on a car whose tyres run out before its engine does ("THE
 * TRACTION RELEASE ABOVE 161 KM/H", `lapsim-report.txt`). By its own report it
 * fires on 3 of the 85 (the Countach LP5000 QV, the LFA and the Ferrari 512 TR)
 * and always makes the car faster. `performance.ts` does not carry that term, so
 * those cars come out fractionally slow here.
 *
 * The 512 TR's movement (0.03%) is inside the tolerance and needs no entry. The
 * other two are named individually, at their own stated bound, so the difference
 * cannot grow unnoticed and no other car can hide behind it. Every derived
 * quantity these two run on (mechanical grip, launch plateau, effective wheel
 * power) reproduces the fixture exactly, which is what says the models are right
 * and the lap walk is where the gap is.
 */
const KNOWN_PORT_GAP: Readonly<Record<string, number>> = {
  'lexus-lfa': 0.35,
  'lamborghini-countach-lp5000-qv': 0.25,
}

/** The fixture's course names to the shipped course ids. */
const COURSE_ID_BY_FIXTURE_NAME: Readonly<Record<string, string>> = {
  Hakone: 'hakone',
  Wangan: 'wangan',
  Misaki: 'misaki',
  Yatabe: 'yatabe',
}

interface FixtureCar {
  id: string
  t: Record<string, number>
}

const REFERENCE = new Map(
  (LAPSIM_DATA as { cars: FixtureCar[] }).cars.map((car) => [car.id, car.t]),
)

const context = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

const cars = sandboxCars(context)

describe('the generated sandbox roster', () => {
  it('carries all 85 spec-book cars, 26 from content and 59 synthesised', () => {
    expect(SANDBOX_ROSTER.length).toBe(85)
    expect(cars.length).toBe(85)
    expect(cars.filter((car) => car.inGame).length).toBe(26)
    expect(cars.filter((car) => !car.inGame).length).toBe(59)
    // Every in-game entry resolves to the real content model, never a copy.
    for (const entry of SANDBOX_ROSTER) {
      if (entry.inGame) expect(entry.model).toBeUndefined()
      else expect(entry.model).toBeDefined()
    }
    expect(REFERENCE.size).toBe(85)
  })

  for (const car of cars) {
    it(`${car.displayName} reproduces the harness at stock and mint`, () => {
      const reference = REFERENCE.get(car.id)
      expect(reference, `${car.id} has no entry in lapsim-data.json`).toBeDefined()

      const model = modelAtTier(car, car.defaultTier)
      const result = evaluateBuild(model, defaultBuild(model), car.inGame, context)
      expect(result.blockers).toEqual([])

      const allowed = KNOWN_PORT_GAP[car.id] ?? TOLERANCE_SECONDS
      for (const [fixtureName, courseId] of Object.entries(COURSE_ID_BY_FIXTURE_NAME)) {
        const ours = result.laps[courseId]
        expect(ours, `${car.id} produced no time on ${courseId}`).not.toBeNull()
        expect(Math.abs(ours! - reference![fixtureName]!)).toBeLessThanOrEqual(allowed)
      }

      // `stockMintYen` is what the SAME car is worth with every slot mint and
      // stock, so at the mint-and-stock build it must be exactly the build's own
      // value. And a car is priceable exactly when it is in the game, because a
      // research entry has no book value for `marketValueYen` to price from.
      expect(result.value.currentYen).toBe(result.value.stockMintYen)
      expect(result.value.currentYen === null).toBe(!car.inGame)
    })
  }
})
