import { z } from 'zod'
import { PartInstanceSchema } from './part'
import { CarPartIdSchema } from './tags'

/**
 * One real car part's condition state (Sprint 32 - replaces the Sprint 26
 * `{ band, installed, fitted }` triple). The part occupying the slot -
 * stock or aftermarket - carries its own condition `band` (`PartInstance`
 * has always had one, Sprint 26); there is no separate slot-level band
 * anymore. `installed: null` means the slot is genuinely EMPTY: for every
 * part except `forcedInduction` this is always a defect (a stolen wheel, a
 * gutted cat) that tanks value until filled; for `forcedInduction` it is a
 * defect only on a Turbo/Supercharged-tagged model - on an NA model an
 * empty forced-induction slot is legitimate and permanent unless a kit is
 * installed. Which of those two `forcedInduction` cases applies is derived
 * from the car's model tags (`bands.ts`'s `hasForcedInduction`), never
 * stored redundantly here - see sprint32.md decisions 2-3.
 */
const CarPartStateSchema = z.object({
  installed: PartInstanceSchema.nullable().default(null),
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
