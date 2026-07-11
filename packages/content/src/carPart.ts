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
  /** Yen cost to climb one grade (band) toward mint - the repair price atom
   * every repair cost, `costToMint`, and (via Sprint 29) job payout derives
   * from. */
  stepCostYen: z.number().int().positive(),
  /** Generic stock-equivalent replacement cost: a scrap part's `costToMint`
   * (there is no repair path to price), the fallback Replace price when no
   * catalog part happens to fit, and the basis for a scrap `PartInstance`'s
   * sell-for-scrap payout. */
  stockReplacementPriceYen: z.number().int().positive(),
  statWeights: StatModifierSchema,
})

export const CarPartTaxonomySchema = z.array(CarPartTaxonomyEntrySchema).min(1)

export type CarPartTaxonomyEntry = z.infer<typeof CarPartTaxonomyEntrySchema>
