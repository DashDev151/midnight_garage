import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema } from './tags'

/**
 * The three benches a removable part is worked on once it comes off the car -
 * one per pair of `ComponentId` groups (`benchByGroup` below). Not the same
 * vocabulary as `ComponentId`: a bench is a physical corner of the garage,
 * shared by two groups, not a per-group station.
 */
export const BenchIdSchema = z.enum(['engine-bench', 'chassis-bench', 'body-trim-bench'])

/**
 * The five work zones every bench carries - clean, fit, cut, join, measure -
 * each holding its own shadow-board tool set at up to three tiers (owned tier
 * 1, owned tier 2, or the covering shop). A recipe step's tool always resolves
 * inside exactly one zone of its bench, though the zone itself is not carried
 * on the step: the tool id alone is enough to find it, since ids are unique
 * within a bench.
 */
export const BenchZoneSchema = z.enum(['clean', 'fit', 'cut', 'join', 'measure'])

/** One tool on a bench's shadow board: a stable id and its display name. */
export const BenchToolSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict()

/**
 * A zone's tool set at each of the three tiers. `shop` defaults to empty:
 * most zones have no shop-only tool.
 */
export const BenchZoneToolsSchema = z
  .object({
    tier1: z.array(BenchToolSchema),
    tier2: z.array(BenchToolSchema),
    shop: z.array(BenchToolSchema).default([]),
  })
  .strict()

/**
 * One physical bench: its id, display name, and all five work zones. The
 * refine below requires every `BenchZoneSchema` member present, so a bench
 * can never ship with a zone silently missing.
 */
export const BenchSchema = z
  .object({
    id: BenchIdSchema,
    displayName: z.string().min(1),
    zones: z.record(BenchZoneSchema, BenchZoneToolsSchema),
  })
  .strict()
  .refine((bench) => BenchZoneSchema.options.every((zone) => bench.zones[zone] !== undefined), {
    message: 'a bench must carry all five zones',
  })

/**
 * One step of a repair recipe: the tool it needs and the copy shown for it.
 * `bench` is only set when the step borrows a tool from a bench other than
 * the part's own resolved bench (e.g. exhaust Rebuild's MIG lives on the
 * body-trim bench, not the engine bench the exhaust itself resolves to).
 * `requiresMachine` marks a step that can never be slogged - always false
 * unless the step names one of the four welding operations.
 */
export const RecipeStepSchema = z
  .object({
    tool: z.string().min(1),
    copy: z.string().min(1),
    bench: BenchIdSchema.optional(),
    requiresMachine: z.boolean().default(false),
  })
  .strict()

/**
 * One car part's three job recipes - service, rebuild, restore - each an
 * ordered, non-empty list of steps. All three are required: every repairable
 * part in `recipes` below has a full ladder.
 */
export const PartRecipesSchema = z
  .object({
    service: z.array(RecipeStepSchema).min(1),
    rebuild: z.array(RecipeStepSchema).min(1),
    restore: z.array(RecipeStepSchema).min(1),
  })
  .strict()

/**
 * The whole workbench content file: which bench each of the six `ComponentId`
 * groups resolves to, the three benches themselves, and every part's recipe
 * ladder. `recipes` is a `partialRecord`, not a `record`: only 23 of the 28
 * `CarPartId`s carry a recipe (`clutch`, `brakePadsDiscs`, `tyres`,
 * `bodywork`, `paint` are not bench-repaired, matching
 * `CarPartTaxonomyEntryContentSchema.repairable`), the same partial shape
 * `carInstance.ts` and `gameState.ts` already use for other CarPartId-keyed
 * maps that do not cover every part.
 *
 * Two invariants this schema deliberately does NOT enforce as refines, both
 * for the same reason: resolving a step's bench (`step.bench`, else
 * `benchByGroup[part.group]`) needs the parts taxonomy's `group` field, which
 * lives outside this file's data. `data.ts` is what joins this schema's
 * parsed output against other content, so importing the taxonomy back into
 * this file would cycle against it; parsing the taxonomy a second time,
 * separately, here would duplicate a validation `data.ts` already owns. Both
 * checks are asserted by `packages/content/tests/workbench.test.ts` instead,
 * against the fully composed content:
 * - every recipe step's tool id exists (at any tier) on its resolved bench.
 * - every `requiresMachine` step's tool is a tier2 or shop tool on its
 *   resolved bench, never tier1.
 */
export const WorkbenchContentSchema = z
  .object({
    benchByGroup: z.record(ComponentIdSchema, BenchIdSchema),
    benches: z.array(BenchSchema).length(3, 'exactly three benches'),
    recipes: z.partialRecord(CarPartIdSchema, PartRecipesSchema),
  })
  .strict()
  .refine(
    (content) =>
      ComponentIdSchema.options.every((group) => content.benchByGroup[group] !== undefined),
    { message: 'benchByGroup must cover all six component groups' },
  )
  .refine(
    (content) => new Set(content.benches.map((bench) => bench.id)).size === content.benches.length,
    { message: 'bench ids must be unique' },
  )
  .refine(
    (content) => {
      const ids = new Set(content.benches.map((bench) => bench.id))
      return (
        ids.size === BenchIdSchema.options.length &&
        BenchIdSchema.options.every((id) => ids.has(id))
      )
    },
    { message: 'benches must be exactly the three BenchId values' },
  )

/**
 * The three repair job kinds. Each names a condition-band target and a tool
 * tier in `economy.repairJobs`, and selects one of the three recipe ladders
 * every part carries above. Lives here, in content, beside the recipes it
 * indexes.
 */
export const RepairJobKindSchema = z.enum(['service', 'rebuild', 'restore'])

export type BenchId = z.infer<typeof BenchIdSchema>
export type BenchZone = z.infer<typeof BenchZoneSchema>
export type BenchTool = z.infer<typeof BenchToolSchema>
export type BenchZoneTools = z.infer<typeof BenchZoneToolsSchema>
export type Bench = z.infer<typeof BenchSchema>
export type RecipeStep = z.infer<typeof RecipeStepSchema>
export type PartRecipes = z.infer<typeof PartRecipesSchema>
export type WorkbenchContent = z.infer<typeof WorkbenchContentSchema>
export type RepairJobKind = z.infer<typeof RepairJobKindSchema>
