import {
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarPartId,
  type RepairJobKind,
  type StaffMember,
  type ToolTiers,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { energyMax } from '../src/laborSlots'
import { energyPlanFor } from '../src/repairJobs'
import { buildCarInstance, mintCarParts, testGameState, testToolTiers } from './testFixtures'

/**
 * A calibration probe, closed-form (no bots, no RNG) - the honest check that
 * the continuous daily labour bar is calibrated against the job model. Every
 * figure is a direct call into the real `energyMax` / `energyPlanFor`, so it
 * can never drift from what the game does.
 *
 * The job model prices work in STEPS: a repair is an ordered recipe and each
 * step costs `energy.energyPerStepPoints`, whatever band the part is at and
 * whatever the part costs in yen. So "throughput" here is recipe steps a shop
 * can afford in one day: the daily energy pool divided by the price of a step.
 *
 * There are exactly two levers on that figure, and this file measures both:
 * staff raise the POOL, and tools lower the PRICE of a step by taking it off
 * the slog rate. Day one is a fresh solo garage with tier-1 lines, which slogs
 * every tier-2 step by hand at `toolHire.slogMultiplier`; late game is a full
 * bench with the machines owned. The ratio between them is DISCLOSED (not
 * force-pinned) so the loosening curve stays honest.
 */
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)
const { basePoolPoints, pointsPerLabour, energyPerStepPoints } = ECONOMY.energy
const { slogMultiplier } = ECONOMY.toolHire

const benchMember = (laborSlotsPerDay: 1 | 2): StaffMember => ({
  id: `crew-${laborSlotsPerDay}`,
  displayName: 'Crew',
  stats: { engine: 1, chassis: 1, body: 1 },
  laborSlotsPerDay,
  assignment: 'bench',
  pendingAssignment: null,
  weeklyWageYen: 40_000,
  trait: 'night-owl',
})

/** Every tool line standing at the same tier. */
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

/**
 * The energy one repair job on one slot costs a shop whose lines all stand at
 * `tier`, summed off the live plan. `dampers` is the fixture of choice for the
 * tool lever: its Rebuild is two tier-2 steps and neither is welding or
 * machining, so both are genuinely sloggable and the lever shows on the whole
 * recipe rather than on part of it.
 */
function jobEnergy(carPartId: CarPartId, kind: RepairJobKind, tier: 1 | 2): number {
  const car = buildCarInstance({ parts: mintCarParts({ [carPartId]: 'poor' }) })
  const state = testGameState({ ownedCars: [car], toolTiers: allLinesAt(tier) })
  return energyPlanFor(
    state,
    CONTEXT,
    { kind: 'installed', carInstanceId: car.id, carPartId },
    kind,
  ).reduce((sum, points) => sum + points, 0)
}

describe('energy-bar calibration (a day is a step count; tools + staff loosen it)', () => {
  it('a fresh solo garage starts on the base pool of 8 labour slots, and a step costs four points', () => {
    expect(energyMax(testGameState(), ECONOMY)).toBe(basePoolPoints)
    expect(basePoolPoints).toBe(8 * pointsPerLabour)
    // A step is the unit of repair work, and its price is flat: what a job
    // costs is how many steps its recipe holds, never how far the band has to
    // climb or what the part is worth.
    expect(energyPerStepPoints).toBe(4)
    // The sizing statement the number exists to make: a two-step Service is
    // most of one labour slot, so a small job is felt without eating the day.
    expect((2 * energyPerStepPoints) / pointsPerLabour).toBe(0.8)
  })

  it('day-1 is not softlocked: the daily pool affords a whole slogged buried Rebuild with room to spare', () => {
    const daily = energyMax(testGameState(), ECONOMY)
    // `block` is buried and its Rebuild is three steps, every one of them
    // slogged at a fresh garage - the most expensive single-slot job a day-1
    // shop can take on, and it still fits.
    const worst = jobEnergy('block', 'rebuild', 1)
    expect(worst).toBe(3 * energyPerStepPoints * slogMultiplier)
    expect(worst).toBeLessThanOrEqual(daily)
  })

  it('owning the machines measurably raises throughput: the same job costs the slog multiple by hand', () => {
    const slogged = jobEnergy('dampers', 'rebuild', 1)
    const owned = jobEnergy('dampers', 'rebuild', 2)
    expect(owned).toBe(2 * energyPerStepPoints)
    expect(slogged).toBe(owned * slogMultiplier)
    expect(owned).toBeLessThan(slogged)
  })

  it('benching staff measurably raises the pool: a 2-slot member adds 2 x pointsPerLabour energy', () => {
    const solo = energyMax(testGameState(), ECONOMY)
    const withCrew = energyMax(testGameState({ staff: [benchMember(2)] }), ECONOMY)
    expect(withCrew).toBe(solo + 2 * pointsPerLabour)
    expect(withCrew).toBeGreaterThan(solo)
  })

  it('discloses the day-1 vs late-game throughput ratio (honest loosening), and the loosening is real', () => {
    // Throughput = recipe steps affordable per day = daily energy / step price.
    const day1Daily = energyMax(testGameState(), ECONOMY)
    // Work a fresh garage's own tier-1 tools already reach costs base rate:
    // twenty steps in a day, which is the day-1 ceiling on light work.
    expect(day1Daily / energyPerStepPoints).toBe(20)
    // Tier-2 bench work is what a fresh garage actually slogs, and that is the
    // rate the tool lever is measured against.
    const day1Throughput = day1Daily / (energyPerStepPoints * slogMultiplier)

    // Late game: a full bench of 2-slot members with the machines owned, so
    // nothing is slogged and every step is base rate.
    const fullBench = Array.from({ length: ECONOMY.staff.maxStaff }, () => benchMember(2))
    const lateDaily = energyMax(testGameState({ staff: fullBench }), ECONOMY)
    const lateThroughput = lateDaily / energyPerStepPoints

    // The honest day-1 to late-game loosening curve, pinned as assertions (not
    // a console disclosure - sim has no DOM/node lib). A day-1 garage slogs a
    // tier-2 step at 12 points and gets through 6 and two-thirds of them; a
    // full bench with the machines owned pays 4 a step and gets through 40.
    expect(day1Throughput).toBeCloseTo(20 / 3, 10)
    expect(lateThroughput).toBe(40)
    // Staff alone double the day; the machines alone triple what a step buys.
    expect(lateDaily / day1Daily).toBe(2)
    // The gate: the loosening is real (late game genuinely out-works day 1) but
    // not absurd (an order of magnitude is the sane ceiling for this arc).
    const ratio = lateThroughput / day1Throughput
    expect(ratio).toBeCloseTo(6, 10)
    expect(ratio).toBeGreaterThan(1)
    expect(ratio).toBeLessThan(10)
  })
})
