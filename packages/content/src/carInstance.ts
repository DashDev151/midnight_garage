import { z } from 'zod'
import { PartInstanceSchema } from './part'
import { CarPartIdSchema, ConditionBandSchema } from './tags'

/**
 * One real car part's condition state. The part occupying the slot - stock
 * or aftermarket - carries its own condition `band` (`PartInstance`); there
 * is no separate slot-level band anymore. `installed: null` means the slot
 * is genuinely EMPTY: for every part except `forcedInduction` this is always
 * a defect (a stolen wheel, a gutted cat) that tanks value until filled; for
 * `forcedInduction` it is a defect only on a Turbo/Supercharged-tagged model
 * - on an NA model an empty forced-induction slot is legitimate and permanent
 * unless a kit is installed. Which of those two `forcedInduction` cases
 * applies is derived from the car's model tags (`bands.ts`'s
 * `hasForcedInduction`), never stored redundantly here.
 */
/**
 * What occupied this slot immediately before its CURRENT vacancy - stamped by
 * `resolveRemovePart` (sim/jobs.ts) at uninstall, never carried forward once
 * anything installs into the slot (a fresh `CarPartState` literal simply
 * omits this key, which reads as "no baseline"). A part matching every field
 * here refits for free: putting the car back the way it was found is
 * logistics, not work; a repaired, replaced, or upgraded part fails the match
 * and is charged.
 */
const PartBaselineSchema = z.object({
  partId: z.string().min(1),
  band: ConditionBandSchema,
  genuinePeriod: z.boolean(),
})

const CarPartStateSchema = z.object({
  installed: PartInstanceSchema.nullable().default(null),
  vacatedBaseline: PartBaselineSchema.optional(),
})

/**
 * All 29 real car parts, keyed by `CarPartId`. Explicit per-part keys (not a
 * generic `z.record`), matching this codebase's established preference for a
 * missing key to fail validation rather than silently vanish.
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

/**
 * One generated symptom on a car: `trueCauseId` is the actual root cause,
 * rolled at generation and never re-rolled; `remainingCauseIds` is the
 * PLAYER's own narrowing knowledge - starts as every cause in the symptom's
 * own cause list and shrinks as inspection tests eliminate partitions.
 * Economics never read this array - only `apparentBandByPartId` below and the
 * true `parts[..].band` matter to value. `runTestIds`: which diagnostic tests
 * have already been run on THIS symptom instance - `runDiagnosticTest` refuses
 * a repeat run, so re-testing the same thing twice is never a legal way to
 * burn a visit's minutes.
 */
const CarSymptomSchema = z.object({
  symptomId: z.string().min(1),
  trueCauseId: z.string().min(1),
  remainingCauseIds: z.array(z.string().min(1)),
  runTestIds: z.array(z.string().min(1)).default([]),
})

/**
 * One zone's work-model state (docs/design/workshop-rework.md's model
 * section): `metal` (0 straight to 3 rotten or bent), `surface` (0 ready to 2
 * raw), and `finish` (0 show to 3 flaking or bare - underseal on the chassis
 * zone rather than paint). `panelMissing` is true only while the zone's panel
 * has been removed and not yet replaced (never true for the chassis zone,
 * which has no panel). `colour` is set at the paint stage and carries the
 * car's own colour for that zone; absent until first painted. `primed` is
 * true once the prime stage has run and stays true until the paint stage
 * consumes it or a fresh strip/prep bares the zone again - the readiness gate
 * the paint stage checks, since priming does not itself move `finish`.
 */
const ZoneStateSchema = z.object({
  metal: z.number().int().min(0).max(3),
  surface: z.number().int().min(0).max(2),
  finish: z.number().int().min(0).max(3),
  panelMissing: z.boolean(),
  colour: z.string().min(1).optional(),
  primed: z.boolean().default(false),
})

/**
 * All six zones, keyed by `ZoneId`. Explicit per-zone keys (not a generic
 * `z.record`), matching this codebase's established preference for a missing
 * key to fail validation rather than silently vanish.
 */
const ZoneStatesSchema = z.object({
  bonnet: ZoneStateSchema,
  boot: ZoneStateSchema,
  left: ZoneStateSchema,
  right: ZoneStateSchema,
  roof: ZoneStateSchema,
  chassis: ZoneStateSchema,
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
  /** Every symptom this car was generated with (default `[]` - an honest car). */
  symptoms: z.array(CarSymptomSchema).default([]),
  /**
   * The PRE-damage band for exactly the parts a symptom's cause damaged, or
   * `null` for an honest car (no symptoms at all). Economics keep reading
   * `parts[..].band` (the truth) everywhere unchanged; this is display/
   * pricing-apparatus data only - the sheet-value seam (`diagnosis.ts`'s
   * `apparentViewOf`) is the one place that reads it to build the car as the
   * room sees it.
   */
  apparentBandByPartId: z
    .partialRecord(CarPartIdSchema, ConditionBandSchema)
    .nullable()
    .default(null),
  /**
   * The work model's own resolution: six zones, each carrying metal/surface/
   * finish severities the derived `panels`/`paint`/`underbody` bands read
   * (worst-governs). Optional so every existing fixture and save parses
   * unchanged - absent reads as "not yet on the zone model."
   */
  zoneState: ZoneStatesSchema.optional(),
})

export type CarInstance = z.infer<typeof CarInstanceSchema>
export type CarPartState = z.infer<typeof CarPartStateSchema>
export type PartBaseline = z.infer<typeof PartBaselineSchema>
export type ZoneState = z.infer<typeof ZoneStateSchema>
export type ZoneStates = z.infer<typeof ZoneStatesSchema>

/** Every real `CarPartId`, in the same order as `CarPartIdSchema` - the
 * canonical iteration order for anything that needs to walk every part on a
 * car (aggregation, generation, migration). */
export const ALL_CAR_PART_IDS = CarPartIdSchema.options
