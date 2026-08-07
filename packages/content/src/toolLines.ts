import { z } from 'zod'
import { ComponentIdSchema, ReputationTierSchema } from './tags'

/**
 * One rung of a tool line. Every line is always owned at some rung; a rung is
 * never "unowned", only not-yet-upgraded-to. `upgradePriceYen` is what
 * upgrading TO this rung costs (0 for tier 1, owned from day one) - a higher
 * rung speeds labour only (`repairLevelForGroup`, bands.ts).
 * `minReputationTier` is the reputation floor required to buy UP TO this rung -
 * always absent on tier 1 (owned from day one, gating it would be
 * meaningless), always present on tier 2.
 */
export const ToolLineTierSchema = z.object({
  displayName: z.string().min(1),
  upgradePriceYen: z.number().int().nonnegative(),
  minReputationTier: ReputationTierSchema.optional(),
})

/**
 * One always-owned tool ladder per component group (progression bible:
 * "tool line / tool tier", never "equipment ownership"). Exactly 2 rungs;
 * tier 1 is free (owned from the start) and upgrade prices strictly increase
 * up the ladder. The top of the ladder is not a rung at all: it is a shop
 * (`ToolShopSchema`), bought once and covering several lines together.
 */
export const ToolLineSchema = z
  .object({
    tiers: z.array(ToolLineTierSchema).length(2, 'every tool line has exactly 2 tiers'),
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
  .refine((line) => line.tiers[0]?.minReputationTier === undefined, {
    message: 'tier 1 is owned from the start - it must not carry a minReputationTier',
  })
  .refine((line) => line.tiers.slice(1).every((tier) => tier.minReputationTier !== undefined), {
    message: 'tier 2 must carry a minReputationTier',
  })

/**
 * The six tool lines, keyed by the existing 6-group `ComponentId` vocabulary
 * (no new vocabulary, no mapping layer). Zod 4's enum-keyed record is
 * exhaustive: all six keys are required at parse time.
 */
export const ToolLinesSchema = z.record(ComponentIdSchema, ToolLineSchema)

/** A tool line's own rung: 1 or 2, bought one line at a time. */
export const ToolTierSchema = z.union([z.literal(1), z.literal(2)])

/**
 * What a line actually works at: its own rung, or 3 once the shop covering it
 * is owned. This is the `repairLevel` ladder the banded repair formula climbs
 * and the figure every capability threshold is compared against, so a rung and
 * a shop are read as one ladder rather than two.
 */
export const ToolLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

/**
 * The shop's current rung per tool line. Keyed by the six `ComponentId`
 * groups; Zod 4's enum-keyed record is exhaustive, so all six keys are
 * required. Every line starts at 1 (nothing basic is ever locked).
 */
export const ToolTiersSchema = z.record(ComponentIdSchema, ToolTierSchema)

/** The level every line works at right now (`toolLevelsFor`, sim/toolLines.ts) -
 * derived from the rungs owned and the shops owned, never persisted. */
export const ToolLevelsSchema = z.record(ComponentIdSchema, ToolLevelSchema)

/**
 * A shop: the top of the tool ladder, bought once and covering every line in
 * `covers` at level 3 together. One purchase rather than a rung per line,
 * because the equipment that does level-3 work stands in a room and serves
 * whatever is wheeled into it.
 *
 * `upgradePriceYen` and `minReputationTier` carry the same meaning they carry
 * on a rung, so the purchase flow, the classifieds listing and the reputation
 * gate are the ones tool tiers already use.
 */
export const ToolShopSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  covers: z.array(ComponentIdSchema).min(1),
  upgradePriceYen: z.number().int().positive(),
  minReputationTier: ReputationTierSchema,
})

/**
 * Every shop, in the order they are offered. Each line is covered by exactly
 * one shop, so "the shop that covers this line" is always a single answer and
 * no line can reach level 3 by two different purchases.
 */
export const ToolShopsSchema = z
  .array(ToolShopSchema)
  .min(1)
  .refine((shops) => new Set(shops.map((shop) => shop.id)).size === shops.length, {
    message: 'shop ids must be unique',
  })
  .refine(
    (shops) => {
      const covered = shops.flatMap((shop) => shop.covers)
      return (
        covered.length === ComponentIdSchema.options.length &&
        new Set(covered).size === covered.length
      )
    },
    { message: 'every tool line must be covered by exactly one shop' },
  )

export type ToolLineTier = z.infer<typeof ToolLineTierSchema>
export type ToolLine = z.infer<typeof ToolLineSchema>
export type ToolLines = z.infer<typeof ToolLinesSchema>
export type ToolTier = z.infer<typeof ToolTierSchema>
export type ToolTiers = z.infer<typeof ToolTiersSchema>
export type ToolLevel = z.infer<typeof ToolLevelSchema>
export type ToolLevels = z.infer<typeof ToolLevelsSchema>
export type ToolShop = z.infer<typeof ToolShopSchema>
export type ToolShops = z.infer<typeof ToolShopsSchema>
