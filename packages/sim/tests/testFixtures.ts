import {
  ALL_CAR_PART_IDS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarPartId,
  type CarPartState,
  type ComponentId,
  type ConditionBand,
  type PartInstance,
  type ToolTiers,
} from '@midnight-garage/content'

/**
 * Sprint 36 shared fixture: a full six-line `toolTiers` map, every line at
 * 1 (the new-game floor) unless overridden - so no test file hand-writes
 * all six keys to move one line.
 */
export function testToolTiers(overrides: Partial<ToolTiers> = {}): ToolTiers {
  return {
    engine: 1,
    drivetrain: 1,
    suspension: 1,
    wheels: 1,
    body: 1,
    interior: 1,
    ...overrides,
  }
}

/**
 * One `grade: 'stock'` catalog part id per `CarPartId` (Sprint 32 decision 1
 * guarantees exactly one) - what a fixture car's slot defaults to, same as
 * real generation (`generateAuctionCarInstance`, sim/auctions.ts).
 */
const STOCK_PART_ID_BY_CAR_PART_ID: Record<string, string> = Object.fromEntries(
  PARTS.filter((part) => part.grade === 'stock').map((part) => [part.carPartId, part.id]),
)

function stockInstanceFor(partId: CarPartId, band: ConditionBand): PartInstance {
  return {
    id: `fixture-stock-${partId}`,
    partId: STOCK_PART_ID_BY_CAR_PART_ID[partId]!,
    band,
    genuinePeriod: false,
  }
}

/**
 * One slot override (Sprint 32): a bare `ConditionBand` keeps the slot
 * filled with the real catalog stock part at that band - the common case,
 * mirroring the pre-Sprint-32 `{ band: 'X' }` shorthand every test file
 * used to write; a `PartInstance` installs that exact instance (an
 * aftermarket part, or any other specific band/grade combination); `null`
 * leaves the slot genuinely empty (missing, or - for `forcedInduction` -
 * legitimately absent, depending on the test's own model tags).
 */
export type CarPartOverride = ConditionBand | PartInstance | null

function resolveOverride(partId: CarPartId, override: CarPartOverride): CarPartState {
  if (override === null) return { installed: null }
  if (typeof override === 'string') return { installed: stockInstanceFor(partId, override) }
  return { installed: override }
}

/**
 * Sprint 26 shared test fixture, reshaped Sprint 32 for the stock-baseline/
 * missing-slot model: every real car now carries 29 keyed parts instead of
 * 8 - this one helper builds a full `CarInstance.parts` map so no test file
 * has to hand-write all 29 keys itself. Every part defaults to a mint
 * catalog stock part (matching real generation); pass `overrides` (keyed by
 * `CarPartId`) to set a specific part's band, install a specific
 * `PartInstance`, or leave it empty (`null`) - see `CarPartOverride`.
 */
export function mintCarParts(
  overrides: Partial<Record<CarPartId, CarPartOverride>> = {},
): CarInstance['parts'] {
  const base = {} as Record<CarPartId, CarPartState>
  for (const partId of ALL_CAR_PART_IDS) {
    base[partId] = { installed: stockInstanceFor(partId, 'mint') }
  }
  for (const [partId, override] of Object.entries(overrides) as [CarPartId, CarPartOverride][]) {
    base[partId] = resolveOverride(partId, override)
  }
  return base as CarInstance['parts']
}

/** Every real part set to the same `band` (a mint catalog stock part at
 * that band) - handy for "a car that's uniformly X" fixtures. */
export function uniformCarParts(band: ConditionBand): CarInstance['parts'] {
  const overrides = Object.fromEntries(ALL_CAR_PART_IDS.map((partId) => [partId, band])) as Partial<
    Record<CarPartId, CarPartOverride>
  >
  return mintCarParts(overrides)
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
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const entry of PARTS_TAXONOMY) {
    const band = bandsByGroup[entry.group]
    if (band) overrides[entry.id] = band
  }
  return mintCarParts(overrides)
}

/**
 * `mileageKm: 60_000` is deliberate (Sprint 30): it's the neutral point of
 * `economy.json`'s `valuation.mileageFactorCurve` (factor exactly 1.0), so a
 * test built from this fixture without overriding mileage gets the
 * pre-Sprint-30 "clean value == book value at heat 100" behavior unchanged,
 * unless the test is specifically exercising mileage. Car age no longer
 * factors into value at all (post-Sprint-30 maintainer decision) - `year` is
 * stored/displayed flavor text only.
 */
const BASE_CAR_INSTANCE: Omit<CarInstance, 'parts'> = {
  id: 'car-test-0001',
  modelId: 'test-model',
  year: 1990,
  mileageKm: 60_000,
  color: 'White',
  provenanceNote: '',
  authenticityPercent: 80,
}

/** A full, valid `CarInstance` with every part a mint stock part - override
 * whatever the test needs. */
export function buildCarInstance(overrides: Partial<CarInstance> = {}): CarInstance {
  return { ...BASE_CAR_INSTANCE, parts: mintCarParts(), ...overrides }
}
