import {
  PARTS_TAXONOMY,
  type CarInstance,
  type CarPartId,
  type CarPartState,
  type ComponentId,
  type ConditionBand,
} from '@midnight-garage/content'

/**
 * Sprint 26 shared test fixture: every real car now carries 29 keyed parts
 * instead of 8 - this one helper builds a full `CarInstance.parts` map so no
 * test file has to hand-write all 29 keys itself. Every part defaults to
 * mint/uninstalled/fitted; pass `overrides` (keyed by `CarPartId`) to set
 * specific parts to a different band, an installed `PartInstance`, or (for
 * `forcedInduction` only) `fitted: false`.
 */
export function mintCarParts(
  overrides: Partial<Record<CarPartId, Partial<CarPartState>>> = {},
): CarInstance['parts'] {
  const defaults: CarPartState = { band: 'mint', installed: null, fitted: true }
  const base: Record<CarPartId, CarPartState> = {
    block: { ...defaults },
    internals: { ...defaults },
    headValvetrain: { ...defaults },
    camsTiming: { ...defaults },
    intake: { ...defaults },
    exhaust: { ...defaults },
    fuelSystem: { ...defaults },
    ignitionEcu: { ...defaults },
    cooling: { ...defaults },
    forcedInduction: { ...defaults },
    gearbox: { ...defaults },
    clutch: { ...defaults },
    differential: { ...defaults },
    driveline: { ...defaults },
    chassis: { ...defaults },
    dampers: { ...defaults },
    springs: { ...defaults },
    antiRollBars: { ...defaults },
    steering: { ...defaults },
    brakePadsDiscs: { ...defaults },
    brakeCalipersLines: { ...defaults },
    rims: { ...defaults },
    tyres: { ...defaults },
    panels: { ...defaults },
    paint: { ...defaults },
    underbody: { ...defaults },
    aero: { ...defaults },
    seats: { ...defaults },
    dashGauges: { ...defaults },
  }
  for (const [partId, override] of Object.entries(overrides) as [
    CarPartId,
    Partial<CarPartState>,
  ][]) {
    base[partId] = { ...base[partId], ...override }
  }
  return base
}

/** Every real part set to the same `band` - handy for "a car that's uniformly X" fixtures. */
export function uniformCarParts(band: ConditionBand): CarInstance['parts'] {
  const parts = mintCarParts()
  for (const partId of Object.keys(parts) as CarPartId[]) {
    parts[partId] = { ...parts[partId], band }
  }
  return parts
}

/**
 * Sets every part belonging to each named group to that group's band -
 * mirrors how test fixtures used to set one flat `condition` per component
 * before Sprint 26. Membership is resolved from `PARTS_TAXONOMY` itself
 * (never a second, hand-maintained group->parts list), so this stays
 * correct even if the taxonomy changes. Parts in an unmentioned group stay
 * mint.
 */
export function groupCarParts(
  bandsByGroup: Partial<Record<ComponentId, ConditionBand>>,
): CarInstance['parts'] {
  const parts = mintCarParts()
  for (const entry of PARTS_TAXONOMY) {
    const band = bandsByGroup[entry.group]
    if (band) parts[entry.id] = { ...parts[entry.id], band }
  }
  return parts
}

const BASE_CAR_INSTANCE: Omit<CarInstance, 'parts'> = {
  id: 'car-test-0001',
  modelId: 'test-model',
  year: 1990,
  mileageKm: 80_000,
  color: 'White',
  provenanceNote: '',
  authenticityPercent: 80,
}

/** A full, valid `CarInstance` with every part mint - override whatever the test needs. */
export function buildCarInstance(overrides: Partial<CarInstance> = {}): CarInstance {
  return { ...BASE_CAR_INSTANCE, parts: mintCarParts(), ...overrides }
}
