import { z } from 'zod'
import { PartInstanceSchema } from './part'
import { CarPartIdSchema, ConditionBandSchema } from './tags'

/**
 * One real car part's condition state (Sprint 26 - replaces the Sprint 12
 * flat `condition: 0-100` model). The band IS the condition; no percent
 * survives alongside it. `fitted` only means anything for the
 * `forcedInduction` part: `true` (with a real rolled `band`) on
 * `Turbo`-tagged models, `false` on NA cars where the slot is simply empty
 * until a kit part is installed (fitting one sets `fitted: true, band:
 * 'mint'`). Every other part is always present, `fitted` ignored for it.
 */
const CarPartStateSchema = z.object({
  band: ConditionBandSchema,
  installed: PartInstanceSchema.nullable().default(null),
  fitted: z.boolean().default(true),
})

/**
 * All 29 real car parts (Sprint 26), keyed by `CarPartId` - replaces the old
 * 8-key `components` map. Explicit per-part keys (not a generic `z.record`),
 * matching this codebase's established preference (`ByAuctionTierSchema`
 * etc.) for a missing key to fail validation rather than silently vanish.
 */
const CarPartsSchema = z.object({
  block: CarPartStateSchema,
  internals: CarPartStateSchema,
  headValvetrain: CarPartStateSchema,
  camsTiming: CarPartStateSchema,
  intake: CarPartStateSchema,
  exhaust: CarPartStateSchema,
  fuelSystem: CarPartStateSchema,
  ignitionEcu: CarPartStateSchema,
  cooling: CarPartStateSchema,
  forcedInduction: CarPartStateSchema,
  gearbox: CarPartStateSchema,
  clutch: CarPartStateSchema,
  differential: CarPartStateSchema,
  driveline: CarPartStateSchema,
  chassis: CarPartStateSchema,
  dampers: CarPartStateSchema,
  springs: CarPartStateSchema,
  antiRollBars: CarPartStateSchema,
  steering: CarPartStateSchema,
  brakePadsDiscs: CarPartStateSchema,
  brakeCalipersLines: CarPartStateSchema,
  rims: CarPartStateSchema,
  tyres: CarPartStateSchema,
  panels: CarPartStateSchema,
  paint: CarPartStateSchema,
  underbody: CarPartStateSchema,
  aero: CarPartStateSchema,
  seats: CarPartStateSchema,
  dashGauges: CarPartStateSchema,
})

export const CarInstanceSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  year: z.number().int(),
  mileageKm: z.number().int().nonnegative(),
  color: z.string().min(1),
  provenanceNote: z.string().default(''),
  authenticityPercent: z.number().min(0).max(100),
  parts: CarPartsSchema,
})

export type CarInstance = z.infer<typeof CarInstanceSchema>
export type CarPartState = z.infer<typeof CarPartStateSchema>

/** Every real `CarPartId`, in the same order as `CarPartIdSchema` (Sprint
 * 26) - the canonical iteration order for anything that needs to walk every
 * part on a car (aggregation, generation, migration). */
export const ALL_CAR_PART_IDS = CarPartIdSchema.options
