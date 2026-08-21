import {
  ALL_CAR_PART_IDS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type ConditionBand,
  type GameState,
  type RepairJobKind,
  type ToolTiers,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { bandIndex } from '../src/bands'
import { buildSimContext } from '../src/context'
import { energyPlanFor, targetBandFor } from '../src/repairJobs'
import {
  buildCarInstance,
  testGameState,
  testToolShopsOwned,
  testToolTiers,
  uniformCarParts,
} from './testFixtures'

/**
 * A real, content-driven anchor for "how many days does a full restoration
 * take", built from explicit, hand-set condition fixtures rather than the
 * RNG-driven generator, so this stays a stable anchor on the LABOUR economy
 * specifically. Real `PARTS` are needed: a repair job resolves each installed
 * instance's own catalogue part before it can name a recipe, and skips
 * anything it cannot resolve.
 *
 * The unit of work is a recipe STEP. Each of the three job kinds carries its
 * own recipe per slot, and which kind a band asks for is fixed by
 * `economy.repairJobs`: Service finishes at worn, Rebuild at fine, Restore at
 * mint. So the day count here is a step count divided by the day's pool, and
 * two things fall out of that which the old band-step model did not have:
 *
 * - How far a part has FALLEN costs no extra labour. A poor part and a worn
 *   part both take one Restore, of the same length. Distance is money, not
 *   work.
 * - The tool lines are not a discount on a step, they are the difference
 *   between working it and slogging it. A tier-2 step costs
 *   `toolHire.slogMultiplier` times as much by hand as it does on the machine,
 *   and a Restore's shop-tier steps need the covering shop outright.
 *
 * Removal and refit around a bench job are not counted here: this is an anchor
 * on the repair work itself, and the teardown loop has its own file
 * (`accessRoute.test.ts`).
 */
const CONTEXT = buildSimContext([], PARTS, [], PARTS_TAXONOMY)

/** Every tool line standing at the same tier. Level 3 is not a tier a line can
 * be set to: it is what owning the covering shop produces. */
function allLinesAt(tier: 1 | 2): ToolTiers {
  return testToolTiers({
    engine: tier,
    drivetrain: tier,
    suspension: tier,
    wheels: tier,
    body: tier,
    interior: tier,
  })
}

/** A fresh garage: every line at the new-game floor, no shop, nothing hired. */
const FRESH_GARAGE = testGameState()

/** The other end of the ladder: the machines owned and every line covered by
 * its shop, which is the only garage that can work a Restore's shop-tier steps
 * at all. */
const FULLY_EQUIPPED = testGameState({
  toolTiers: allLinesAt(2),
  toolShopsOwned: testToolShopsOwned(
    'engine',
    'drivetrain',
    'suspension',
    'wheels',
    'body',
    'interior',
  ),
})

/** The tier-2 machines owned outright on every line, and no shop: the garage a
 * Rebuild stops costing the slog multiple for. */
const MACHINES_OWNED = testGameState({ toolTiers: allLinesAt(2) })

/**
 * Total labour ENERGY to run `kind` on every slot of `car` that is still below
 * that job's finished band, summed off the live plan so it can never drift
 * from what the game charges. A slot with no recipe ladder (a consumable, or a
 * zone-derived body carrier) plans no steps and so contributes nothing.
 */
function totalRepairEnergyPoints(car: CarInstance, kind: RepairJobKind, state: GameState): number {
  const target = bandIndex(targetBandFor(kind, CONTEXT))
  const withCar = { ...state, ownedCars: [car] }
  let total = 0
  for (const carPartId of ALL_CAR_PART_IDS) {
    const installed = car.parts[carPartId].installed
    if (!installed || bandIndex(installed.band) >= target) continue
    total += energyPlanFor(
      withCar,
      CONTEXT,
      { kind: 'installed', carInstanceId: car.id, carPartId },
      kind,
    ).reduce((sum, points) => sum + points, 0)
  }
  return total
}

// The daily budget is a solo garage's energy pool (`basePoolPoints`), and the
// total above is energy, so days-to-restore stays a stable pacing anchor.
function daysToRestore(car: CarInstance, state: GameState = FULLY_EQUIPPED): number {
  return Math.ceil(totalRepairEnergyPoints(car, 'restore', state) / ECONOMY.energy.basePoolPoints)
}

function carAt(band: ConditionBand): CarInstance {
  return buildCarInstance({ parts: uniformCarParts(band) })
}

describe('restoration pacing anchor (Sprint 33 decision 7; the job model since Sprint 227)', () => {
  it('a typical worn used car restores in a sane number of days', () => {
    const days = daysToRestore(carAt('worn'))
    // The anchor: a real, multi-day job for the bench work alone, not a single
    // click. Recalibrate this band deliberately if the daily pool, the step
    // price, or the recipe ladder moves again.
    expect(days).toBeGreaterThanOrEqual(1)
    expect(days).toBeLessThanOrEqual(8)
  })

  it('a genuinely rough (mostly poor) car costs the same bench work as a worn one, and still restores well under the old ~20-day pace', () => {
    const rough = carAt('poor')
    // A Restore is a Restore: the recipe is the same length whichever band the
    // part fell from, so a rough car costs more in PARTS and not a step more
    // in labour.
    expect(totalRepairEnergyPoints(rough, 'restore', FULLY_EQUIPPED)).toBe(
      totalRepairEnergyPoints(carAt('worn'), 'restore', FULLY_EQUIPPED),
    )
    expect(daysToRestore(rough)).toBeLessThan(20)
  })

  it('owning the machines works a Rebuild strictly faster than slogging it by hand', () => {
    const car = carAt('worn')
    const slogged = totalRepairEnergyPoints(car, 'rebuild', FRESH_GARAGE)
    const owned = totalRepairEnergyPoints(car, 'rebuild', MACHINES_OWNED)
    // Rebuild is where the tool lines are a RATE: every tier-2 step a fresh
    // garage cannot reach is worked by hand at the slog multiple, and buying
    // the machines buys all of that back. (Restore is not a rate but a wall -
    // its shop-tier steps want the covering shop - so the ladder's top rung is
    // measured here on the job the machines actually price.)
    expect(owned).toBeLessThan(slogged)
    // Nothing is slogged once the machines are owned, so the whole car's
    // Rebuild is exactly its step count at the flat step price.
    expect(owned % ECONOMY.energy.energyPerStepPoints).toBe(0)
  })

  it('a car already mint needs no labour at all', () => {
    expect(totalRepairEnergyPoints(carAt('mint'), 'restore', FULLY_EQUIPPED)).toBe(0)
  })
})
