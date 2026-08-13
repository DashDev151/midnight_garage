/**
 * Assembles drive parameters for a car the player actually OWNS, wear and
 * build included, by the exact route `lapTimeSecondsFor` takes: derived
 * power, effective compound, effective downforce, and the physical
 * condition and build factors. One assembly of a car's physics exists and
 * this reads it, so the car you drive is the car the lap board timed.
 *
 * `lapBlockers` gates driving the same way it gates the test track: a car
 * with no wheels does not lap and does not drive.
 */
import type { CarInstance, CarModel } from '@midnight-garage/content'
import { computeDerivedStats, physicalFactorsFor } from '../derivedStats'
import { lapBlockers } from '../lapModel'
import { carBlock, effectiveCompound, effectiveDownforce, lapTime } from '../performance'
import type { SimContext } from '../context'
import { driveParamsFor, type DriveParams } from './params'

export interface DriveSetup {
  params: DriveParams
  /** The lap model's own time for this instance on this course, s; the
   * target the driving player is chasing. Null on a standing-km course. */
  modelLapS: number | null
}

/**
 * Params-only assembly for modes with no course (the endless drive mode):
 * the same instance route as `driveSetupFor`, gated by `lapBlockers`,
 * with no lap-model target involved.
 */
export function driveParamsForInstance(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): DriveParams | null {
  if (lapBlockers(car, context).length > 0) return null
  const economy = context.economy
  const stats = computeDerivedStats(model, car, context.partsById, context.partsTaxonomy, economy)
  const compound = effectiveCompound(car, model, context.partsById, economy.statFormulas.grip)
  const aeroEffect = effectiveDownforce(car, model, context.partsById, economy.statFormulas.aero)
  const { condition, build } = physicalFactorsFor(
    car,
    model,
    context.partsById,
    context.partsTaxonomy,
    economy,
  )
  const block = carBlock(
    model,
    stats.power,
    compound,
    economy.statFormulas.pace,
    economy.statFormulas.grip,
    economy.statFormulas.aero,
    aeroEffect,
    condition,
    build,
  )
  return driveParamsFor(model, block, economy)
}

/**
 * Null when the car cannot run (see `lapBlockers`) or the course id is
 * unknown; otherwise the drive parameters and the matching target time.
 */
export function driveSetupFor(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  courseId: string,
): DriveSetup | null {
  if (lapBlockers(car, context).length > 0) return null
  const course = context.coursesById[courseId]
  if (!course) return null

  const economy = context.economy
  const stats = computeDerivedStats(model, car, context.partsById, context.partsTaxonomy, economy)
  const compound = effectiveCompound(car, model, context.partsById, economy.statFormulas.grip)
  const aeroEffect = effectiveDownforce(car, model, context.partsById, economy.statFormulas.aero)
  const { condition, build } = physicalFactorsFor(
    car,
    model,
    context.partsById,
    context.partsTaxonomy,
    economy,
  )

  const block = carBlock(
    model,
    stats.power,
    compound,
    economy.statFormulas.pace,
    economy.statFormulas.grip,
    economy.statFormulas.aero,
    aeroEffect,
    condition,
    build,
  )
  const params = driveParamsFor(model, block, economy)
  const modelLapS =
    course.kind === 'lap'
      ? lapTime(model, course, stats.power, compound, economy, aeroEffect, condition, build)
      : null
  return { params, modelLapS }
}
