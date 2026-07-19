import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema } from './tags'
import { StatModifierSchema } from './stats'

/**
 * Sprint 71 (the teardown game): how deep a slot sits in the car - `surface`
 * (the shell/trim, repaired in place, never bench-only), `bolt-on` (one
 * removal step), `buried` (behind other parts, the deepest jobs). Drives
 * which slots are bench-only (`repairJobGate`) and how much labour uninstall/
 * install cost (`economy.json`'s `teardown.removeSlotsByClass` and
 * `energy.energyByClass`, keyed by this same value).
 */
export const DepthClassSchema = z.enum(['surface', 'bolt-on', 'buried'])

export type DepthClass = z.infer<typeof DepthClassSchema>

/**
 * One entry in the 29-part taxonomy (Sprint 26) - the fixed structural
 * mapping from a real car part to its group, display name, and repair
 * economics. See `docs/sprints/sprint26.md`'s locked taxonomy table for the
 * full 29-part / 6-group list this schema validates against.
 *
 * `statWeights` reuses `StatModifierSchema`'s shape but means something
 * different here than it does on `Part`: not a delta a part applies when
 * installed, but how much this part's condition band contributes to each
 * derived stat (Sprint 26 decision 8) - the same five-key shape fits either
 * meaning, so this is deliberate reuse rather than a parallel schema.
 *
 * `forcedInduction` is the one part whose presence on a given car is
 * conditional (see `CarInstance.parts`'s `fitted` flag on that entry) -
 * every other part is always present on every car.
 *
 * Sprint 53 (economy-bible.md law 3): this is the raw, hand-authored content
 * shape - no price field. The per-class stock-replacement price is derived
 * (see `CarPartTaxonomyEntrySchema` below), never hand-typed here.
 */
export const CarPartTaxonomyEntryContentSchema = z.object({
  id: CarPartIdSchema,
  group: ComponentIdSchema,
  displayName: z.string().min(1),
  /**
   * Sprint 41 decision 2: false for exactly `tyres`, `brakePadsDiscs`, and
   * `clutch` - true consumables that wear to a genuine end-of-life, not
   * something a wrench can restore. `canRepair` (bands.ts) folds this in
   * alongside the existing scrap-is-terminal check, so every repair planner
   * (on-car, bench recondition, service-job costing) skips a non-repairable
   * part for free; only Replace ever touches one. Defaults true so every
   * other part needs no data change.
   */
  repairable: z.boolean().default(true),
  /** Sprint 71: `surface` slots (the shell/trim) stay repaired in place;
   * `bolt-on`/`buried` slots are bench-only - see `DepthClassSchema`. */
  depthClass: DepthClassSchema.default('bolt-on'),
  /** Sprint 71: whether this slot can be pulled at all - false for the shell
   * itself (`chassis`, `paint`, `underbody`), which is repaired in place and
   * never leaves the car short of scrapping the whole thing. */
  removable: z.boolean().default(true),
  /** Sprint 71: every `CarPartId` that must be EMPTY before this slot can be
   * uninstalled or installed (the symmetric blocker rule) - e.g. `clutch` is
   * blocked by `gearbox`, so the gearbox must come off first. Defaults to
   * none: most slots block nothing. */
  blockedBy: z.array(CarPartIdSchema).default([]),
  statWeights: StatModifierSchema,
})

export const CarPartTaxonomyContentSchema = z.array(CarPartTaxonomyEntryContentSchema).min(1)

export type CarPartTaxonomyEntryContent = z.infer<typeof CarPartTaxonomyEntryContentSchema>

const StockReplacementPriceByClassSchema = z.object({
  shitbox: z.number().int().positive(),
  common: z.number().int().positive(),
  uncommon: z.number().int().positive(),
  rare: z.number().int().positive(),
})

/**
 * The resolved taxonomy shape sim/game consume. Sprint 53: the old flat
 * `stockReplacementPriceYen` becomes `stockReplacementPriceYenByClass` -
 * generic stock-equivalent replacement cost, PER FITMENT CLASS: a scrap
 * part's `costToMint` (there is no repair path to price), the fallback
 * Replace price when no catalog part happens to fit, and the basis for a
 * scrap `PartInstance`'s sell-for-scrap payout. Derived once by `data.ts`
 * from the resolved catalog's own class-priced stock SKUs - never a
 * hand-maintained mirror, so it can never drift from the catalog it
 * describes (closes the exact drift class the pre-Sprint-53 flat mirror
 * needed its own integrity test to catch).
 */
export const CarPartTaxonomyEntrySchema = CarPartTaxonomyEntryContentSchema.extend({
  stockReplacementPriceYenByClass: StockReplacementPriceByClassSchema,
})

export const CarPartTaxonomySchema = z.array(CarPartTaxonomyEntrySchema).min(1)

export type CarPartTaxonomyEntry = z.infer<typeof CarPartTaxonomyEntrySchema>
