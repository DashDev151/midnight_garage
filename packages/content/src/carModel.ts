import { z } from 'zod'
import { ComponentIdSchema, RarityTierSchema, TagSchema, type Tag } from './tags'

const LAYOUT_TAGS = ['FR', 'FF', 'AWD', 'MR', 'RR'] as const
const INDUCTION_TAGS = ['NA', 'Turbo', 'Supercharged'] as const
const ENGINE_FAMILY_TAGS = ['Piston', 'Rotary'] as const

function countMatching(tags: readonly Tag[], set: readonly string[]): number {
  return tags.filter((t) => (set as readonly string[]).includes(t)).length
}

const HiddenIssueWeightSchema = z.object({
  componentId: ComponentIdSchema,
  weight: z.number().min(0).max(1),
})

/**
 * Naming Layer (GDD 2.4, roadmap risk R5): `spec` holds real, immutable
 * data — unprotectable fact. `displayName`/`brand` (real) and
 * `parodyName`/`parodyBrand` are the only fields a naming-mode flip
 * touches; see naming.ts.
 *
 * There is no separate `spec.drivetrain` field: layout (FR/FF/AWD/MR/RR)
 * lives in `tags` like every other platform facet (GDD 4.4), and the
 * refinements below guarantee exactly one layout, induction, and
 * engine-family tag is present — see `layoutTagOf`.
 */
export const CarModelSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    displayName: z.string().min(1),
    brand: z.string().min(1),
    parodyName: z.string().min(1),
    parodyBrand: z.string().min(1),
    spec: z.object({
      chassisCode: z.string().min(1),
      engineCode: z.string().min(1),
      yearFrom: z.number().int().gte(1955).lte(2010),
      curbWeightKg: z.number().int().positive(),
      stockPowerPs: z.number().int().positive(),
    }),
    tier: RarityTierSchema,
    tags: z.array(TagSchema).min(1),
    bookValueYen: z.number().int().positive(),
    hiddenIssueWeights: z.array(HiddenIssueWeightSchema).default([]),
  })
  .refine((m) => countMatching(m.tags, LAYOUT_TAGS) === 1, {
    message: 'tags must include exactly one layout tag (FR/FF/AWD/MR/RR)',
    path: ['tags'],
  })
  .refine((m) => countMatching(m.tags, INDUCTION_TAGS) === 1, {
    message: 'tags must include exactly one induction tag (NA/Turbo/Supercharged)',
    path: ['tags'],
  })
  .refine((m) => countMatching(m.tags, ENGINE_FAMILY_TAGS) === 1, {
    message: 'tags must include exactly one engine-family tag (Piston/Rotary)',
    path: ['tags'],
  })

export const CarModelsSchema = z.array(CarModelSchema).min(1)

export type CarModel = z.infer<typeof CarModelSchema>

/** The car's layout tag (FR/FF/AWD/MR/RR) — schema-guaranteed to exist exactly once. */
export function layoutTagOf(model: CarModel): Tag {
  const found = model.tags.find((t) => (LAYOUT_TAGS as readonly string[]).includes(t))
  if (!found) {
    throw new Error(`car ${model.id} has no layout tag — should be impossible past schema parse`)
  }
  return found
}
