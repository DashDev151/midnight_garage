import { z } from 'zod'

/**
 * The seven stages of the body pipeline (docs/design/systems/workshop-rework.md's
 * pipeline table), in sequence: strip/prep bares a zone to raw finish;
 * metalwork straightens it by hand (`beat`) or with the body line (`weld`) -
 * both metal-only, refused outright on a trim zone; `fillAndSand` and `prime`
 * ready a straight zone for colour; `paint` lays the finish; `polish` lifts
 * it. A fresh panel is not a stage of its own: it is a remove followed by an
 * install, through the same part-shelf path every other slot uses. Every
 * stage runs through the staged-work machine; only
 * `fillAndSand`/`prime`/`paint`/`polish` consume a material.
 */
export const PipelineStageIdSchema = z.enum([
  'stripPrep',
  'beat',
  'weld',
  'fillAndSand',
  'prime',
  'paint',
  'polish',
])

export type PipelineStageId = z.infer<typeof PipelineStageIdSchema>

/**
 * A cheap consumable SKU billed into a pipeline stage's cost line at point of
 * use (no pre-stocking) - filler/paper/primer/paint/underseal/polish. Priced
 * flat in yen, not through the class/grade pricing formula: a tin of primer
 * costs the same whether it is going on a kei or a grand tourer.
 */
export const MaterialSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  priceYen: z.number().int().positive(),
  stage: PipelineStageIdSchema,
})

export const MaterialsSchema = z.array(MaterialSchema).min(1)

export type Material = z.infer<typeof MaterialSchema>
