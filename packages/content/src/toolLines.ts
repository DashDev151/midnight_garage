import { z } from 'zod'
import { ComponentIdSchema } from './tags'

/**
 * One tier of a tool line (Sprint 36 - replaces binary equipment ownership).
 * Every line is always owned at some tier; a tier is never "unowned", only
 * not-yet-upgraded-to. `upgradePriceYen` is what upgrading TO this tier
 * costs (0 for tier 1, owned from day one); `consumablesCostYen` is the
 * flat per-job charge repair work in this line pays while this tier is the
 * line's current tier.
 */
export const ToolLineTierSchema = z.object({
  displayName: z.string().min(1),
  upgradePriceYen: z.number().int().nonnegative(),
  consumablesCostYen: z.number().int().nonnegative(),
})

/**
 * One always-owned tool ladder per component group (progression bible:
 * "tool line / tool tier", never "equipment ownership"). Exactly 3 tiers;
 * tier 1 is free (owned from the start) and upgrade prices strictly
 * increase up the ladder.
 */
export const ToolLineSchema = z
  .object({
    tiers: z.array(ToolLineTierSchema).length(3, 'every tool line has exactly 3 tiers'),
  })
  .refine((line) => line.tiers[0]?.upgradePriceYen === 0, {
    message: 'tier 1 is owned from the start - its upgradePriceYen must be 0',
  })
  .refine(
    (line) =>
      line.tiers.every(
        (tier, i) => i === 0 || tier.upgradePriceYen > line.tiers[i - 1]!.upgradePriceYen,
      ),
    { message: 'upgrade prices must strictly increase within a line' },
  )

/**
 * The six tool lines, keyed by the existing 6-group `ComponentId` vocabulary
 * (no new vocabulary, no mapping layer). Zod 4's enum-keyed record is
 * exhaustive: all six keys are required at parse time.
 */
export const ToolLinesSchema = z.record(ComponentIdSchema, ToolLineSchema)

/** A tool line's tier: 1, 2, or 3 - exactly the `repairLevel` ladder the
 * banded repair formula has used since Sprint 26, re-sourced (Sprint 36). */
export const ToolTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

/**
 * The shop's current tier per tool line (Sprint 36 - replaces the retired
 * equipment-ownership list). Keyed by the six `ComponentId` groups; Zod 4's
 * enum-keyed record is exhaustive, so all six keys are required. Every line
 * starts at 1 (nothing basic is ever locked - progression bible law 1).
 */
export const ToolTiersSchema = z.record(ComponentIdSchema, ToolTierSchema)

export type ToolLineTier = z.infer<typeof ToolLineTierSchema>
export type ToolLine = z.infer<typeof ToolLineSchema>
export type ToolLines = z.infer<typeof ToolLinesSchema>
export type ToolTier = z.infer<typeof ToolTierSchema>
export type ToolTiers = z.infer<typeof ToolTiersSchema>
