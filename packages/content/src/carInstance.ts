import { z } from 'zod'
import { DamagePatternIdSchema } from './damagePattern'
import { DamageGradeSchema } from './economy'
import { PartInstanceSchema } from './part'
import { CarPartIdSchema, ConditionBandSchema, GradeSchema } from './tags'

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
})

const CarPartStateSchema = z.object({
  installed: PartInstanceSchema.nullable().default(null),
  vacatedBaseline: PartBaselineSchema.optional(),
})

/**
 * All 28 real car parts, keyed by `CarPartId`. Explicit per-part keys (not a
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
 * Fields every zone carries, metal or trim alike: `finish` (0 show to 3
 * flaking or bare), `panelMissing` (true only while the zone's panel is
 * absent - rolled off a heavy history at generation, or removed by the
 * player and not yet replaced), `colour` (set at the paint stage, absent
 * until first painted), `primed` (true once the prime stage has run,
 * staying true until the paint stage consumes it or a fresh strip/prep bares
 * the zone again - the readiness gate the paint stage checks, since priming
 * does not itself move `finish`), and `panelGrade` (the grade of the physical
 * panel currently occupying the zone - a bonnet, a bumper, a skirt - set
 * whenever a real panel is fitted (`bodyPipeline.ts`'s `planInstallPanel`).
 * Absent reads as `stock`: generation and the whole-car carrier refit path
 * both only ever fit a stock panel, so a zone nobody has touched through the
 * per-zone install pipeline is always this. Meaningless while `panelMissing`
 * is true - a missing panel has no grade to report, and nothing reads this
 * field without checking `panelMissing` first - so it is left stale rather
 * than cleared on removal, the same choice already made for every other
 * field a missing zone carries.
 */
const TRIM_ZONE_FIELDS = {
  finish: z.number().int().min(0).max(3),
  panelMissing: z.boolean(),
  colour: z.string().min(1).optional(),
  primed: z.boolean().default(false),
  panelGrade: GradeSchema.optional(),
}

/**
 * A metal zone's work-model state (docs/design/systems/workshop-rework.md's
 * model section): every trim field, plus `metal` (0 straight to 3 rotten or
 * bent, and 4 beyond saving) and `surface` (0 ready to 2 raw). Metal 4 is
 * the one severity hand work cannot touch: beat and weld both refuse it and
 * only a fresh panel clears it.
 */
const MetalZoneStateSchema = z.object({
  metal: z.number().int().min(0).max(4),
  surface: z.number().int().min(0).max(2),
  ...TRIM_ZONE_FIELDS,
})

/**
 * A trim zone's work-model state: `metal` and `surface` do not exist here at
 * all, rather than existing and reading zero - a bumper or a skirt is never
 * beaten, welded, or filled and sanded, and a caller that tries to read
 * either field off a trim zone fails to compile instead of silently getting
 * a straight, sound panel it never actually has.
 */
const TrimZoneStateSchema = z.object(TRIM_ZONE_FIELDS)

/**
 * All nine zones, keyed by `ZoneId`, six metal and three trim. Explicit
 * per-zone keys (not a generic `z.record`), matching this codebase's
 * established preference for a missing key to fail validation rather than
 * silently vanish - and the reason a trim zone's key resolves to
 * `TrimZoneState` rather than to a union: indexing `zoneState['skirts']`
 * gives the narrower shape directly, with no runtime check needed to rule
 * `metal`/`surface` out.
 */
const ZoneStatesSchema = z.object({
  bonnet: MetalZoneStateSchema,
  boot: MetalZoneStateSchema,
  'left-front': MetalZoneStateSchema,
  'left-rear': MetalZoneStateSchema,
  'right-front': MetalZoneStateSchema,
  'right-rear': MetalZoneStateSchema,
  'front-bumper': TrimZoneStateSchema,
  'rear-bumper': TrimZoneStateSchema,
  skirts: TrimZoneStateSchema,
})

export const CarInstanceSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  year: z.number().int(),
  mileageKm: z.number().int().nonnegative(),
  /**
   * The pool entry (`CarModel.spec.factoryColours`) this specific car left
   * the factory wearing - a single palette id, or two joined with `+` for a
   * genuine factory two-tone. Required on every car, hand-authored or
   * generated: a car's paint has to be SOMETHING before any zone can read as
   * original or resprayed against it.
   */
  factoryColour: z.string().min(1),
  provenanceNote: z.string().default(''),
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
   * The work model's own resolution: nine zones, each carrying the finish
   * severity the derived `paint` band reads and, on the six metal zones,
   * metal/surface severities the derived `panels` band reads too
   * (worst-governs). Optional so every existing fixture and save parses
   * unchanged - absent reads as "not yet on the zone model."
   */
  zoneState: ZoneStatesSchema.optional(),
  /**
   * WHAT HAPPENED TO THIS CAR before it reached the block, rolled once at
   * generation from the care profile its model's culture and tier select
   * (docs/design/systems/generation-damage.md, layer 2). It is the single
   * cause the rest of the car's condition hangs off: how many band steps of
   * damage it carries, which upkeep tier it reads as, and how likely each
   * slot was to have been modified.
   *
   * Optional because a HAND-AUTHORED car genuinely has no rolled history -
   * the scripted tutorial lot, a probe car, a sandbox fixture - and absent
   * reads as exactly that rather than as a missing default.
   */
  history: DamageGradeSchema.optional(),
  /**
   * WHERE that history left its damage, drawn from the history at generation
   * (docs/design/systems/generation-damage.md, layer 3). The pattern is a
   * weighting over part slots and nothing else: it decided which slots the
   * damage budget degraded and which symptom the car presents, and it never
   * set a band or created a symptom itself.
   *
   * Stored for the same reason `history` is, and optional for the same reason:
   * a hand-authored car has no rolled pattern and absent reads as exactly that.
   */
  damagePattern: DamagePatternIdSchema.optional(),
})

export type CarInstance = z.infer<typeof CarInstanceSchema>
export type CarPartState = z.infer<typeof CarPartStateSchema>
export type PartBaseline = z.infer<typeof PartBaselineSchema>
export type MetalZoneState = z.infer<typeof MetalZoneStateSchema>
export type TrimZoneState = z.infer<typeof TrimZoneStateSchema>
/** Either zone shape - what indexing `ZoneStates` by a generic `ZoneId`
 * yields. A caller with a specific zone key already gets the narrower shape
 * directly; this is for a caller that only knows it has SOME zone. */
export type ZoneState = MetalZoneState | TrimZoneState
export type ZoneStates = z.infer<typeof ZoneStatesSchema>

/** Every real `CarPartId`, in the same order as `CarPartIdSchema` - the
 * canonical iteration order for anything that needs to walk every part on a
 * car (aggregation, generation, migration). */
export const ALL_CAR_PART_IDS = CarPartIdSchema.options
