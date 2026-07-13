import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema } from './tags'
import { StatModifierSchema } from './stats'

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
 */
export const CarPartTaxonomyEntrySchema = z.object({
  id: CarPartIdSchema,
  group: ComponentIdSchema,
  displayName: z.string().min(1),
  /** Generic stock-equivalent replacement cost: a scrap part's `costToMint`
   * (there is no repair path to price), the fallback Replace price when no
   * catalog part happens to fit, and the basis for a scrap `PartInstance`'s
   * sell-for-scrap payout. */
  stockReplacementPriceYen: z.number().int().positive(),
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
  statWeights: StatModifierSchema,
})

export const CarPartTaxonomySchema = z.array(CarPartTaxonomyEntrySchema).min(1)

export type CarPartTaxonomyEntry = z.infer<typeof CarPartTaxonomyEntrySchema>
