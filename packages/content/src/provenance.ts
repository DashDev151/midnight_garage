import { z } from 'zod'

/**
 * Sprint 70: relocated from `packages/sim/src/auctions.ts`'s `PROVENANCE_POOL`
 * constant (a content-law violation flagged in `TODO.md`'s "Open engineering"
 * section) - same strings, same `(ageBand, upkeepTier)` keying (Sprint 66,
 * playtest 2026-07-15 item 6a). This is the CAR's flavour-text history line
 * (`CarInstance.provenanceNote`) - not to be confused with a `PartInstance`'s
 * `origin` (also Sprint 70), which is a structured per-part fact, not prose.
 */
export const AgeBandSchema = z.enum(['young', 'middling', 'old'])
export const UpkeepTierSchema = z.enum(['neglected', 'average', 'cherished'])

/** At least 2 lines per cell for real variety (same floor as every other
 * flavour-line pool in this codebase - `specialtyCopy.ts`, a template's own
 * `flavorPool`). */
export const ProvenanceLinesSchema = z.array(z.string().min(1)).min(2)

export const ProvenancePoolSchema = z.record(
  AgeBandSchema,
  z.record(UpkeepTierSchema, ProvenanceLinesSchema),
)

export type AgeBand = z.infer<typeof AgeBandSchema>
export type UpkeepTier = z.infer<typeof UpkeepTierSchema>
export type ProvenancePool = z.infer<typeof ProvenancePoolSchema>
