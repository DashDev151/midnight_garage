import {
  ALL_CAR_PART_IDS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartState,
  type ComponentId,
  type ConditionBand,
  type GameState,
  type Grade,
  type PartInstance,
  type ToolTiers,
} from '@midnight-garage/content'
import { expect } from 'vitest'
import { isPayday, isRentDay } from '../src/calendar'
import type { SimContext } from '../src/context'

/**
 * The first day at or after `notBefore` that carries neither the weekly rent
 * bill (`calendar.rentDayOfWeek`) nor the wage run (`calendar.paydayOfWeek`)
 * - the day to put a test on when it asserts an exact cash figure across an
 * `advanceDay` tick but is not about rent or wages at all. Both landmarks
 * are read from `ECONOMY` rather than hard-coded, so moving either one can
 * never silently reintroduce a rent bill into an unrelated assertion
 * (sprint149.md gave each charge its own named day; before it, both fell on
 * `day % 7 === 0` and day 1 happened to be free of them).
 */
export function quietFinanceDay(notBefore = 1): number {
  for (let day = notBefore; day < notBefore + ECONOMY.calendar.daysPerWeek; day++) {
    if (!isRentDay(day, ECONOMY) && !isPayday(day, ECONOMY)) return day
  }
  throw new Error('no day in a full week is free of both rent and wages - check economy.calendar')
}

/** A full six-line `toolTiers` map, every line at 1 (the new-game floor)
 * unless overridden - so no test file hand-writes all six keys to move
 * one line. */
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

/** A full six-line `specialty` map, every line at 0 (a fresh shop's
 * floor) unless overridden - same shape as `testToolTiers` above. */
export function testSpecialty(
  overrides: Partial<Record<ComponentId, number>> = {},
): Record<ComponentId, number> {
  return {
    engine: 0,
    drivetrain: 0,
    suspension: 0,
    wheels: 0,
    body: 0,
    interior: 0,
    ...overrides,
  }
}

/**
 * One `grade: 'stock'` catalog part id per `CarPartId`, `common` fitment
 * class - what a fixture car's slot defaults to, same shape as real
 * generation (`generateAuctionCarInstance`, sim/auctions.ts) at the
 * `common` class. Zone-scoped panels (a `zoneId`-carrying SKU) address a
 * single body zone, never the whole slot, so they are excluded here just as
 * the live stock-filler index excludes them.
 */
const STOCK_PART_ID_BY_CAR_PART_ID: Record<string, string> = Object.fromEntries(
  PARTS.filter(
    (part) => part.grade === 'stock' && part.fitmentClass === 'everyday' && part.zoneId == null,
  ).map((part) => [part.carPartId, part.id]),
)

/** Every fixture-stock part carries the fixture car's own origin
 * (`BASE_CAR_INSTANCE.id` below) - plain, not-a-customer-job car origin,
 * so ownership-neutral tests never accidentally trip a provenance gate.
 * Tests that DO exercise ownership build their own specific
 * `PartInstance` (with an explicit `origin`) via the `CarPartOverride`
 * escape hatch instead. */
function stockInstanceFor(partId: CarPartId, band: ConditionBand): PartInstance {
  return {
    id: `fixture-stock-${partId}`,
    partId: STOCK_PART_ID_BY_CAR_PART_ID[partId]!,
    band,
    origin: { kind: 'car', carInstanceId: BASE_CAR_INSTANCE.id, carLabel: 'Test Car', day: 0 },
  }
}

/**
 * One slot override: a bare `ConditionBand` keeps the slot filled with
 * the real catalog stock part at that band - the common case; a
 * `PartInstance` installs that exact instance (an aftermarket part, or
 * any other specific band/grade combination); `null` leaves the slot
 * genuinely empty (missing, or - for `forcedInduction` - legitimately
 * absent, depending on the test's own model tags).
 */
export type CarPartOverride = ConditionBand | PartInstance | null

function resolveOverride(partId: CarPartId, override: CarPartOverride): CarPartState {
  if (override === null) return { installed: null }
  if (typeof override === 'string') return { installed: stockInstanceFor(partId, override) }
  return { installed: override }
}

/**
 * Builds a full `CarInstance.parts` map (29 keyed parts) so no test file
 * has to hand-write them itself. Every part defaults to a mint catalog
 * stock part (matching real generation); pass `overrides` (keyed by
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
 * Sets every part belonging to each named group to that group's band.
 * Membership is resolved from `PARTS_TAXONOMY` itself (never a second,
 * hand-maintained group->parts list), so this stays correct even if the
 * taxonomy changes. Parts in an unmentioned group stay mint.
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
 * `mileageKm: 60_000` is deliberate: it's the neutral point of
 * `economy.json`'s `valuation.mileageFactorCurve` (factor exactly 1.0),
 * so a test built from this fixture without overriding mileage gets
 * "clean value == book value at heat 100" unless the test is
 * specifically exercising mileage. Car age never factors into value -
 * `year` is stored/displayed flavor text only.
 */
const BASE_CAR_INSTANCE: Omit<CarInstance, 'parts'> = {
  id: 'car-test-0001',
  modelId: 'test-model',
  year: 1990,
  mileageKm: 60_000,
  color: 'White',
  factoryColour: 'white',
  provenanceNote: '',
  symptoms: [],
  apparentBandByPartId: null,
}

/** A full, valid `CarInstance` with every part a mint stock part - override
 * whatever the test needs. */
export function buildCarInstance(overrides: Partial<CarInstance> = {}): CarInstance {
  return { ...BASE_CAR_INSTANCE, parts: mintCarParts(), ...overrides }
}

/**
 * A real car model, built with a specific aftermarket grade fitted into
 * whichever slots `gradesByPartId` names (the model's own fitment class,
 * resolved from real catalog SKUs) and the model's own stock part
 * everywhere else - every slot at one uniform condition `band`. The
 * support-ratio and reliability model tests build a build's shape this way,
 * since `supportRatios` reads both the fitted grade (specification) and the
 * fitted band (condition) per slot.
 */
export function carWithGrades(
  model: CarModel,
  context: SimContext,
  gradesByPartId: Partial<Record<CarPartId, Grade>>,
  band: ConditionBand = 'mint',
): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const partId of ALL_CAR_PART_IDS) {
    const grade = gradesByPartId[partId] ?? 'stock'
    const part =
      grade === 'stock'
        ? context.stockPartByCarPartId[fitmentClass][partId]
        : context.aftermarketPartByCarPartId[fitmentClass][partId]?.[grade]
    if (!part) continue
    overrides[partId] = {
      id: `fixture-${partId}-${grade}`,
      partId: part.id,
      band,
      origin: { kind: 'market', day: 1 },
    }
  }
  return buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
}

/**
 * The placement invariant sprint148.md exists to protect: every OWNED car id
 * appears exactly once across `serviceBayCarIds`, `parkingCarIds`,
 * `forecourtCarIds` and `graceParkingCarId` - never two places at once,
 * never nowhere. Call after every state transition a test exercises (list,
 * delist, sell, buy, move, swap, bay purchase). A car that can be listed
 * while still holding its parking slot is exactly the failure this catches.
 */
export function assertPlacementInvariant(state: GameState): void {
  const allSlotIds = [
    ...state.serviceBayCarIds,
    ...state.parkingCarIds,
    ...state.forecourtCarIds,
    state.graceParkingCarId,
  ].filter((id): id is string => id !== null)
  for (const car of state.ownedCars) {
    const occurrences = allSlotIds.filter((id) => id === car.id).length
    expect(
      occurrences,
      `owned car ${car.id} appears in ${occurrences} slots (service/parking/forecourt/grace), expected exactly 1`,
    ).toBe(1)
  }
}
