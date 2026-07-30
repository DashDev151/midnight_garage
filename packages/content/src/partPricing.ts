import { z } from 'zod'
import type { CarPartId, Grade } from './tags'
import type { PartFitmentClass } from './partFitment'

/**
 * One yen value per `CarPartId` - the period-anchored REFERENCE price of a
 * brand-new, stock-grade example of that component, taken from 1994-2004
 * catalogue data. It is a ladder, not a shelf price: no class's
 * `classFactors` entry is 1.0, because nobody keeping a 1988 saloon alive
 * pays new-OEM list for a block. `classFactors` carries what a part for that
 * kind of car actually trades at, sized so a tier's whole basket stays a
 * sensible fraction of what its cars are worth.
 *
 * Explicit per-part keys (not a generic `z.record`), matching this
 * codebase's established preference for a missing key to fail validation
 * rather than silently price a part at 0.
 */
const ByCarPartIdPriceSchema = z.object({
  block: z.number().int().positive(),
  internals: z.number().int().positive(),
  headValvetrain: z.number().int().positive(),
  camsTiming: z.number().int().positive(),
  intake: z.number().int().positive(),
  exhaust: z.number().int().positive(),
  fuelSystem: z.number().int().positive(),
  ignitionEcu: z.number().int().positive(),
  cooling: z.number().int().positive(),
  forcedInduction: z.number().int().positive(),
  gearbox: z.number().int().positive(),
  clutch: z.number().int().positive(),
  differential: z.number().int().positive(),
  driveline: z.number().int().positive(),
  chassis: z.number().int().positive(),
  dampers: z.number().int().positive(),
  springs: z.number().int().positive(),
  antiRollBars: z.number().int().positive(),
  steering: z.number().int().positive(),
  brakePadsDiscs: z.number().int().positive(),
  brakeCalipersLines: z.number().int().positive(),
  rims: z.number().int().positive(),
  tyres: z.number().int().positive(),
  panels: z.number().int().positive(),
  paint: z.number().int().positive(),
  underbody: z.number().int().positive(),
  aero: z.number().int().positive(),
  seats: z.number().int().positive(),
  dashGauges: z.number().int().positive(),
})

/**
 * `ByCarPartIdPriceSchema` plus the pricing bases that are not a `CarPartId`
 * at all - a catalog entry's `priceBasisPartId` can address one of these
 * instead of its own `carPartId` (`resolvePartPriceYen` below). `zonePanel`
 * is optional: only ships once a catalog entry actually prices from it.
 */
const ByPriceBasisIdPriceSchema = ByCarPartIdPriceSchema.extend({
  /** The stock, everyday-class base a zone-panel SKU prices from, independent
   * of the derived `panels` carPartId's own base. */
  zonePanel: z.number().int().positive().optional(),
})

const ByFitmentClassFactorSchema = z.object({
  entry: z.number().positive(),
  everyday: z.number().positive(),
  enthusiast: z.number().positive(),
  flagship: z.number().positive(),
})

const ByGradeFactorSchema = z.object({
  stock: z.number().positive(),
  street: z.number().positive(),
  sport: z.number().positive(),
  race: z.number().positive(),
})

/**
 * The grade ladder, per `CarPartId`, with a mandatory `default` every slot
 * without its own entry falls back to. Explicit optional per-part keys (not a
 * bare `z.record`) so a typo'd id fails validation rather than silently
 * creating an orphaned ladder nothing resolves to.
 *
 * A slot earns its own entry only when its price ladder must track a power
 * curve that is not the default's near-linear 1 / 1.3 / 2 / 3 shape - the
 * rule this schema exists to enforce: **a slot's price ladder moves in the
 * same change as its power curve, so climbing a ladder never improves value
 * per yen.** `ignitionEcu` is the one slot that needs it today (a threshold
 * power curve against the flat default ladder made the street rung nearly
 * three times worse value than the race one); every other power slot's
 * curve is close enough to the default shape that it stays on it.
 */
const ByCarPartIdGradeFactorsSchema = z.object({
  block: ByGradeFactorSchema.optional(),
  internals: ByGradeFactorSchema.optional(),
  headValvetrain: ByGradeFactorSchema.optional(),
  camsTiming: ByGradeFactorSchema.optional(),
  intake: ByGradeFactorSchema.optional(),
  exhaust: ByGradeFactorSchema.optional(),
  fuelSystem: ByGradeFactorSchema.optional(),
  ignitionEcu: ByGradeFactorSchema.optional(),
  cooling: ByGradeFactorSchema.optional(),
  forcedInduction: ByGradeFactorSchema.optional(),
  gearbox: ByGradeFactorSchema.optional(),
  clutch: ByGradeFactorSchema.optional(),
  differential: ByGradeFactorSchema.optional(),
  driveline: ByGradeFactorSchema.optional(),
  chassis: ByGradeFactorSchema.optional(),
  dampers: ByGradeFactorSchema.optional(),
  springs: ByGradeFactorSchema.optional(),
  antiRollBars: ByGradeFactorSchema.optional(),
  steering: ByGradeFactorSchema.optional(),
  brakePadsDiscs: ByGradeFactorSchema.optional(),
  brakeCalipersLines: ByGradeFactorSchema.optional(),
  rims: ByGradeFactorSchema.optional(),
  tyres: ByGradeFactorSchema.optional(),
  panels: ByGradeFactorSchema.optional(),
  paint: ByGradeFactorSchema.optional(),
  underbody: ByGradeFactorSchema.optional(),
  aero: ByGradeFactorSchema.optional(),
  seats: ByGradeFactorSchema.optional(),
  dashGauges: ByGradeFactorSchema.optional(),
})

export const GradeFactorsSchema = ByCarPartIdGradeFactorsSchema.extend({
  default: ByGradeFactorSchema,
})

export type GradeFactors = z.infer<typeof GradeFactorsSchema>
type GradeFactorLadder = z.infer<typeof ByGradeFactorSchema>

/** `carPartId`'s own ladder if the sheet carries one, otherwise the sheet's
 * `default` ladder - the one place this resolution happens. Keyed on the
 * SKU's SLOT (`carPartId`), never its price basis: a zone-panel SKU prices
 * off a different yen base but still climbs its own slot's grade ladder. */
export function gradeFactorsFor(
  carPartId: CarPartId,
  gradeFactors: GradeFactors,
): GradeFactorLadder {
  return gradeFactors[carPartId] ?? gradeFactors.default
}

/**
 * Every catalog SKU's price resolves from these five knobs, not from a
 * hand-authored `priceYen` field - a whole-market rebalance is a handful of
 * multiplications, never a mass content edit. `overrides` ships EMPTY; every
 * entry is a deliberate, individually-justified decision.
 */
export const PartPricingSheetSchema = z.object({
  baseCostYen: ByPriceBasisIdPriceSchema,
  classFactors: ByFitmentClassFactorSchema,
  gradeFactors: GradeFactorsSchema,
  globalFactor: z.number().positive(),
  overrides: z.record(z.string(), z.number().int().nonnegative()).default({}),
})

export type PartPricingSheet = z.infer<typeof PartPricingSheetSchema>

/**
 * The one formula every SKU's price runs through: an override wins outright;
 * otherwise `round100(base x class x grade x global)`, where `base` is the
 * period reference price and `class` scales it to that tier's real market.
 * Rounds to the nearest Y100 - fine-grained enough that the class/grade ladder still reads
 * distinctly, coarse enough that a shop's price tags never carry single-yen
 * noise. `base` comes from `entry.priceBasisPartId` when the entry carries
 * one, otherwise from its own `carPartId` - so an entry that never sets the
 * field resolves byte-identically to before it existed.
 */
export function resolvePartPriceYen(
  entry: {
    id: string
    carPartId: CarPartId
    fitmentClass: PartFitmentClass
    grade: Grade
    priceBasisPartId?: string
  },
  sheet: PartPricingSheet,
): number {
  const override = sheet.overrides[entry.id]
  if (override !== undefined) return override
  const basisId = entry.priceBasisPartId ?? entry.carPartId
  const baseCostYen = (sheet.baseCostYen as Record<string, number | undefined>)[basisId]
  if (baseCostYen === undefined) {
    throw new Error(`resolvePartPriceYen: no price basis "${basisId}" in the pricing sheet`)
  }
  const gradeFactor = gradeFactorsFor(entry.carPartId, sheet.gradeFactors)[entry.grade]
  const raw =
    baseCostYen * sheet.classFactors[entry.fitmentClass] * gradeFactor * sheet.globalFactor
  return Math.round(raw / 100) * 100
}
