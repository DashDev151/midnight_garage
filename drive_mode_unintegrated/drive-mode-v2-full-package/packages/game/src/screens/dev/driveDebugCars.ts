/**
 * THE DRIVE DEBUG SCREEN'S CAR LIST. Dev-only data: it is imported by the
 * drive debug screen alone, which is reachable only through the
 * `import.meta.env.DEV` gate in `router/index.ts`, so a production build
 * drops this file with it.
 *
 * Every in-game car is offered, because directive 24 says every roster car
 * must drive the moment it has a spec; the colocated test holds that promise
 * by building drive parameters for the whole roster. The parameter assembly
 * is exactly the stock build the lap model and the ghost harness run on:
 * factory aero, mint condition, stock parts.
 */
import { CARS, ECONOMY, type CarModel } from '@midnight-garage/content'
import {
  carBlock,
  driveParamsFor,
  factoryDownforceCoeff,
  MINT_CONDITION_FACTORS,
  STOCK_BUILD_FACTORS,
  type DriveParams,
} from '@midnight-garage/sim'

export interface DriveDebugCar {
  id: string
  label: string
  model: CarModel
}

/** All in-game cars, labelled for the select, alphabetical by label. */
export function driveDebugCars(): DriveDebugCar[] {
  return CARS.map((model) => ({
    id: model.id,
    label: `${model.displayName} (${model.spec.stockPowerPs} PS)`,
    model,
  })).sort((a, b) => a.label.localeCompare(b.label))
}

/** The stock drive parameters for a car: the same assembly the ghost
 * acceptance harness compares against the lap model. */
export function stockDriveParams(model: CarModel): DriveParams {
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
