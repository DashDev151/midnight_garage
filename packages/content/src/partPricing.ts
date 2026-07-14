import { z } from 'zod'
import type { CarPartId, Grade } from './tags'
import type { PartFitmentClass } from './partFitment'

/**
 * One yen value per `CarPartId` (Sprint 53) - the stock-grade, `common`-class
 * baseline every SKU's price scales from. Explicit per-part keys (not a
 * generic `z.record`), matching this codebase's established preference
 * (`economy.ts`'s `ByCarPartIdWeightSchema`) for a missing key to fail
 * validation rather than silently price a part at 0.
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

const ByFitmentClassFactorSchema = z.object({
  shitbox: z.number().positive(),
  common: z.number().positive(),
  uncommon: z.number().positive(),
  rare: z.number().positive(),
})

const ByGradeFactorSchema = z.object({
  stock: z.number().positive(),
  street: z.number().positive(),
  sport: z.number().positive(),
  race: z.number().positive(),
})

/**
 * Sprint 53 (economy-bible.md's centralised pricing sheet): every catalog
 * SKU's price resolves from these five knobs, not from a hand-authored
 * `priceYen` field - a whole-market rebalance is a handful of multiplications,
 * never a mass content edit. `overrides` ships EMPTY; every entry is a
 * deliberate, individually-justified maintainer decision, and Sprint 55's
 * coherence report flags any override that drifts far from its formula price.
 */
export const PartPricingSheetSchema = z.object({
  baseCostYen: ByCarPartIdPriceSchema,
  classFactors: ByFitmentClassFactorSchema,
  gradeFactors: ByGradeFactorSchema,
  globalFactor: z.number().positive(),
  overrides: z.record(z.string(), z.number().int().nonnegative()).default({}),
})

export type PartPricingSheet = z.infer<typeof PartPricingSheetSchema>

/**
 * The one formula every SKU's price runs through (economy-bible.md): an
 * override wins outright; otherwise `round100(base x class x grade x
 * global)`. Rounds to the nearest Y100 - fine-grained enough that the
 * class/grade ladder still reads distinctly, coarse enough that a shop's
 * price tags never carry single-yen noise.
 */
export function resolvePartPriceYen(
  entry: { id: string; carPartId: CarPartId; fitmentClass: PartFitmentClass; grade: Grade },
  sheet: PartPricingSheet,
): number {
  const override = sheet.overrides[entry.id]
  if (override !== undefined) return override
  const raw =
    sheet.baseCostYen[entry.carPartId] *
    sheet.classFactors[entry.fitmentClass] *
    sheet.gradeFactors[entry.grade] *
    sheet.globalFactor
  return Math.round(raw / 100) * 100
}
