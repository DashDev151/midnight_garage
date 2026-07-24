import { z } from 'zod'
import { RarityTierSchema, TagSchema, TyreCompoundSchema, type Tag } from './tags'

const LAYOUT_TAGS = ['FR', 'FF', 'AWD', 'MR', 'RR'] as const
const INDUCTION_TAGS = ['NA', 'Turbo', 'Supercharged'] as const
const ENGINE_FAMILY_TAGS = ['Piston', 'Rotary'] as const

function countMatching(tags: readonly Tag[], set: readonly string[]): number {
  return tags.filter((t) => (set as readonly string[]).includes(t)).length
}

/**
 * Naming Layer (GDD 2.4, roadmap risk R5): `spec` holds real, immutable
 * data - unprotectable fact. `displayName`/`brand` (real) and
 * `parodyName`/`parodyBrand` are the only fields a naming-mode flip
 * touches; see naming.ts.
 *
 * There is no separate `spec.drivetrain` field: layout (FR/FF/AWD/MR/RR)
 * lives in `tags` like every other platform facet (GDD 4.4), and the
 * refinements below guarantee exactly one layout, induction, and
 * engine-family tag is present - see `layoutTagOf`.
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
      quotedPowerPs: z.number().int().positive().optional(),
      powerRpm: z.number().int().positive().optional(),
      peakTorqueNm: z.number().int().positive().optional(),
      torqueRpm: z.number().int().positive().optional(),
      redlineRpm: z.number().int().positive().optional(),
      displacementCc: z.number().int().positive().optional(),
      engineConfig: z
        .enum([
          'I3',
          'I4',
          'I5',
          'I6',
          'V6',
          'V8',
          'V10',
          'V12',
          'flat-4',
          'flat-6',
          'rotary-2',
          'rotary-3',
        ])
        .optional(),
      aspiration: z.enum(['NA', 'turbo', 'twin-turbo', 'supercharged']).optional(),
      weightDistributionFront: z.number().gte(30).lte(70).optional(),
      wheelbaseMm: z.number().int().positive().optional(),
      comHeightMm: z.number().int().positive().optional(),
      dragCd: z.number().positive().optional(),
      stockTyre: z.string().min(1).optional(),
      tyreCompound: TyreCompoundSchema.optional(),
      /** Factory active torque-vectoring (ATTESA E-TS Pro / Super AYC), the
       * cornering edge that lifts an equipped AWD car's mechanical grip above
       * a passive one. Absent on every car without it. */
      activeYaw: z.enum(['attesa', 'ayc']).optional(),
      zeroToHundredS: z.number().positive().optional(),
      topSpeedKmh: z.number().int().positive().optional(),
      dataConfidence: z.enum(['HIGH', 'MED', 'LOW']).optional(),
      estimatedFields: z.array(z.string()).optional(),
    }),
    tier: RarityTierSchema,
    tags: z.array(TagSchema).min(1),
    bookValueYen: z.number().int().positive(),
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

/** The car's layout tag (FR/FF/AWD/MR/RR) - schema-guaranteed to exist exactly once. */
export function layoutTagOf(model: CarModel): Tag {
  const found = model.tags.find((t) => (LAYOUT_TAGS as readonly string[]).includes(t))
  if (!found) {
    throw new Error(`car ${model.id} has no layout tag - should be impossible past schema parse`)
  }
  return found
}
