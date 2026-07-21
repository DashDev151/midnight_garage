import { z } from 'zod'
import { CarPartIdSchema, ConditionBandSchema } from './tags'

/**
 * The global failure-mode registry: one specific fault in one specific
 * component, at one severity band - the terminal node of the diagnosis map.
 * A symptom's own `causes` entries (`symptom.ts`'s `CauseSchema`) reference
 * an entry here by `id` rather than repeating `carPartId`/`setBand` inline,
 * so a failure mode genuinely shared by two symptoms (the same fault, the
 * same part, the same band) is authored once. `setBand` is a floor, never a
 * ceiling: generation (`auctions.ts`) sets the true band to the WORSE of the
 * part's already-rolled band and this value, exactly as before this
 * registry existed.
 */
export const FailureModeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  carPartId: CarPartIdSchema,
  setBand: ConditionBandSchema,
})

export const FailureModesSchema = z
  .array(FailureModeSchema)
  .min(1)
  .refine((modes) => new Set(modes.map((mode) => mode.id)).size === modes.length, {
    message: 'failure mode ids must be unique across the registry',
  })

export type FailureMode = z.infer<typeof FailureModeSchema>
