import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema } from './tags'
import { StatWeightsSchema } from './stats'

/**
 * How much this part's condition band degrades each physical dial of the
 * performance model, weighted against every other part that reaches the same
 * dial. Zero (the default) on every dial the part has no physical bearing on,
 * which is most parts on most dials.
 *
 * `grip` and `braking` must stay DISJOINT part sets, and `tyres` belongs to
 * `grip` alone. The two dials are not independent: the model derives the
 * braking coefficient from mechanical grip (`bmu = brakeRatio * mu`), so a part
 * weighted on both would reach braking twice, once through `mu` and once
 * through the dial. Tyre condition is already carried at the right magnitude by
 * the `mu` path, since braking and cornering both scale roughly proportionally
 * with tyre grip; the `braking` dial carries what the brake HARDWARE
 * contributes on top, which is what its name says.
 */
export const PhysicalWeightsSchema = z.object({
  grip: z.number().nonnegative().default(0),
  braking: z.number().nonnegative().default(0),
  driveline: z.number().nonnegative().default(0),
  aero: z.number().nonnegative().default(0),
})

/**
 * How deep a slot sits in the car - `surface` (the shell/trim, repaired in
 * place, never bench-only), `bolt-on` (one removal step), `buried` (behind
 * other parts, the deepest jobs). Drives which slots are bench-only
 * (`repairJobGate`) and how much labour an install costs.
 */
export const DepthClassSchema = z.enum(['surface', 'bolt-on', 'buried'])

export type DepthClass = z.infer<typeof DepthClassSchema>

/**
 * One operation a slot's tool line can gate: `install` is a part going ONTO a
 * car, `remove` one coming off it, `repair` heavy work climbing an installed
 * part's band in place, and `bench-fit` a member being mounted into an
 * assembly on the workbench. Four distinct sites, because a line that is
 * needed at one is not automatically needed at another: an engine crane lifts
 * the block in and out of the car but has no part in bolting a piston to it on
 * the bench, and a tyre machine is the whole of mounting rubber on a rim while
 * the car it belongs to is untouched.
 */
export const MachineGateOperationSchema = z.enum(['install', 'remove', 'repair', 'bench-fit'])

export type MachineGateOperation = z.infer<typeof MachineGateOperationSchema>

/**
 * One entry in the 28-part taxonomy - the fixed structural mapping from a
 * real car part to its group, display name, and repair economics.
 *
 * `statWeights` is `StatWeightsSchema`: not a delta a part applies when
 * installed (`Part.statModifiers`), but how much this part's condition band
 * contributes to each derived stat. The two schemas shared one shape until
 * the installed-part power delta went proportional (`statModifiers.
 * powerFraction`, per-character) - a condition weight is still one plain
 * number per stat, so they split rather than forcing power's new shape onto
 * this meaning too.
 *
 * `forcedInduction` is the one part whose presence on a given car is
 * conditional - every other part is always present on every car.
 *
 * This is the raw, hand-authored content shape - no price field. The
 * per-class stock-replacement price is derived (see `CarPartTaxonomyEntrySchema`
 * below), never hand-typed here.
 */
export const CarPartTaxonomyEntryContentSchema = z.object({
  id: CarPartIdSchema,
  group: ComponentIdSchema,
  displayName: z.string().min(1),
  /**
   * False for exactly `tyres`, `brakePadsDiscs`, and `clutch` - true
   * consumables that wear to a genuine end-of-life, not something a wrench
   * can restore. `canRepair` (bands.ts) folds this in alongside the existing
   * scrap-is-terminal check, so every repair planner (on-car, bench
   * recondition, service-job costing) skips a non-repairable part for free;
   * only Replace ever touches one. Defaults true so every other part needs
   * no data change.
   */
  repairable: z.boolean().default(true),
  /** `surface` slots (the shell/trim) stay repaired in place; `bolt-on`/
   * `buried` slots are bench-only - see `DepthClassSchema`. */
  depthClass: DepthClassSchema.default('bolt-on'),
  /** Whether this slot can be pulled at all - false for the shell itself
   * (`chassis`, `paint`), which is repaired in place and never leaves the
   * car short of scrapping the whole thing. */
  removable: z.boolean().default(true),
  /** Every `CarPartId` that must be EMPTY before this slot can be uninstalled
   * or installed (the symmetric blocker rule) - e.g. `clutch` is blocked by
   * `gearbox`, so the gearbox must come off first. Defaults to none: most
   * slots block nothing. */
  blockedBy: z.array(CarPartIdSchema).default([]),
  statWeights: StatWeightsSchema,
  /**
   * Which operations on this slot need a tier-2 machine owned outright or
   * hired for the day (`machineGateGroupFor` + `hasMachineLineFor`,
   * sim/jobs.ts). The line is always the slot's own `group`, already on this
   * row, so it is not restated here; this field says only WHICH operations it
   * gates. Empty by default: most slots are spanners and a jack.
   *
   * Three shapes ship, and the difference between them is what the machine is
   * actually for:
   * - a buried engine or drivetrain slot gates `install` and `remove`. The
   *   crane and the transmission bench are how the part gets into and out of
   *   the car; once it is out, work on it needs neither.
   * - a signature slot (`dampers`, `springs`, `bodywork`, `chassis`, `seats`,
   *   `dashGauges`) gates `install` and `repair`. The two-post lift, the MIG
   *   welder and the trim bench are what DO the heavy work; unbolting the old
   *   one is just spanners, so removal stays free.
   * - `tyres` gates `bench-fit` alone. Mounting rubber onto a rim is the tyre
   *   machine's whole job; levering a dead tyre off is not, and the wheels
   *   line has no say over the car itself.
   */
  machineGate: z.array(MachineGateOperationSchema).default([]),
  /** This part's pull on each physical dial of the performance model - see
   * `PhysicalWeightsSchema`. Omitted on the parts that move no dial, which
   * resolves to zero weight everywhere. */
  physicalWeights: PhysicalWeightsSchema.default({ grip: 0, braking: 0, driveline: 0, aero: 0 }),
  /**
   * Whether this part at `scrap` stops the car being driven at all. Most parts
   * degrade gradually and a ruined one only makes the car slow, which the
   * condition curves already say. Some are function-or-fail: a cracked block, a
   * snapped timing belt, a dead fuel pump, a gearbox with nothing left inside
   * it, no steering, no brakes or no rubber is not a slower car, it is a car
   * that does not move or cannot be driven. `lapModel.ts`'s `lapTimeSecondsFor`
   * returns no time when any slot carrying this flag is scrap-band, empty or
   * unresolvable, an absent part being strictly worse than a ruined one.
   *
   * Gradual and binary are both true of the same part: worn plugs misfire under
   * load, which is a real power loss the stat curves carry, and scrap ignition
   * does not start at all, which is this flag. The rule lives in the data rather
   * than in a list in code so a new part cannot silently escape it. Defaults
   * false.
   */
  scrapDisablesCar: z.boolean().default(false),
  /** Worked from under the car: the two-post lift's energy discount applies. */
  underCar: z.boolean().default(false),
})

export const CarPartTaxonomyContentSchema = z.array(CarPartTaxonomyEntryContentSchema).min(1)

export type CarPartTaxonomyEntryContent = z.infer<typeof CarPartTaxonomyEntryContentSchema>

const StockReplacementPriceByClassSchema = z.object({
  entry: z.number().int().positive(),
  everyday: z.number().int().positive(),
  enthusiast: z.number().int().positive(),
  flagship: z.number().int().positive(),
})

/**
 * The resolved taxonomy shape sim/game consume. The old flat
 * `stockReplacementPriceYen` becomes `stockReplacementPriceYenByClass` -
 * generic stock-equivalent replacement cost, PER FITMENT CLASS: a scrap
 * part's `costToMint` (there is no repair path to price), the fallback
 * Replace price when no catalog part happens to fit, and the basis for a
 * scrap `PartInstance`'s sell-for-scrap payout. Derived once by `data.ts`
 * from the resolved catalog's own class-priced stock SKUs - never a
 * hand-maintained mirror, so it can never drift from the catalog it describes.
 */
export const CarPartTaxonomyEntrySchema = CarPartTaxonomyEntryContentSchema.extend({
  stockReplacementPriceYenByClass: StockReplacementPriceByClassSchema,
})

export const CarPartTaxonomySchema = z.array(CarPartTaxonomyEntrySchema).min(1)

export type CarPartTaxonomyEntry = z.infer<typeof CarPartTaxonomyEntrySchema>
