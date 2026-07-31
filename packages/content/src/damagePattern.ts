import { z } from 'zod'
import { ComponentIdSchema } from './tags'
import { PanelZoneIdSchema } from './zone'

/**
 * The named things that happen to a car (docs/design/systems/generation-damage.md,
 * layer 3). A car's rolled history picks one of these, and the pattern is the
 * single answer to WHERE that history left its damage.
 *
 * The list is an enum in code rather than free ids in the JSON so the roll that
 * selects a pattern (`economy.partsGeneration.damageGrades.patternWeightsByGrade`)
 * can key every id explicitly: a pattern added here without a draw weight fails
 * validation instead of silently becoming unreachable. Same arrangement as
 * `CarCultureSchema` and the care-profile table it feeds.
 */
export const DamagePatternIdSchema = z.enum([
  'garaged',
  'neglected-commuter',
  'frontal-collision',
  'drifted',
  'grenade',
])

export type DamagePatternId = z.infer<typeof DamagePatternIdSchema>
export const DAMAGE_PATTERN_IDS = DamagePatternIdSchema.options

/** One non-negative draw weight per taxonomy group, keyed explicitly so a
 * missing group fails validation rather than silently reading as zero (which
 * would quietly make a whole third of the car unreachable). */
const GroupSlotWeightsSchema = z
  .object({
    engine: z.number().nonnegative(),
    drivetrain: z.number().nonnegative(),
    suspension: z.number().nonnegative(),
    wheels: z.number().nonnegative(),
    body: z.number().nonnegative(),
    interior: z.number().nonnegative(),
  })
  .strict()

/**
 * One non-negative draw weight per PANEL zone. The chassis zone is deliberately
 * absent: `underbody` is the only carrier that reads it and it reads that zone
 * alone, so there is never a choice between zones to weight. Weighting it would
 * be authoring a number nothing can ever read.
 */
const ZoneSlotWeightsSchema = z
  .object({
    bonnet: z.number().nonnegative(),
    boot: z.number().nonnegative(),
    left: z.number().nonnegative(),
    right: z.number().nonnegative(),
    roof: z.number().nonnegative(),
  })
  .strict()

/**
 * A DAMAGE PATTERN IS A WEIGHTING OVER PART SLOTS AND NOTHING ELSE.
 *
 * It answers "where", never "how much" and never "which band". How much is the
 * damage budget's job (`damageGrades.bandStepsByGrade`, off the same rolled
 * history) and which band is the degrade step's job. A pattern that also
 * carried a band and an amount would be `applySymptoms` minus the causes, the
 * tests and the price: a second, worse diagnosis system growing beside the
 * good one.
 *
 * The weighting is expressed at the two grouping levels the game ALREADY
 * authors, and no third one is invented: `parts-taxonomy.json`'s six `group`s
 * for whole slots, and `zoneState`'s panel zones for bodywork. Two consumers
 * read the one weighting (`packages/sim/src/damagePatterns.ts`):
 *
 * - the damage budget draws which slot to degrade from `groups`, and which
 *   body zone a body carrier's step lands on from `zones`; and
 * - the symptom draw weights each candidate symptom by how much its causes'
 *   `carPartId`s sit in the groups this pattern implicates.
 *
 * That single join is what makes a car a story: a car that rolled
 * `frontal-collision` spends its damage on the bonnet, the wings and the engine
 * bay AND is likelier to present a front-end symptom than a gearbox whine.
 *
 * Weights are relative within their own map (authored to sum to 100 for
 * readability, never required to). A weight of zero makes a group or zone
 * unreachable for this pattern, which is stronger than any pattern needs:
 * every authored row keeps a real floor everywhere, so a pattern biases rather
 * than filters.
 */
export const DamagePatternSchema = z
  .object({
    id: DamagePatternIdSchema,
    /** The line a player would use for it, in plain garage English. Not yet
     * surfaced anywhere; `CarInstance.damagePattern` carries the id that
     * selects it. */
    displayName: z.string().min(1),
    slotWeights: z
      .object({
        groups: GroupSlotWeightsSchema,
        zones: ZoneSlotWeightsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((pattern, ctx) => {
    const groupTotal = ComponentIdSchema.options.reduce(
      (sum, group) => sum + pattern.slotWeights.groups[group],
      0,
    )
    if (groupTotal <= 0) {
      ctx.addIssue(`"${pattern.id}" weights every taxonomy group at zero, so no slot can be picked`)
    }
    const zoneTotal = PanelZoneIdSchema.options.reduce(
      (sum, zone) => sum + pattern.slotWeights.zones[zone],
      0,
    )
    if (zoneTotal <= 0) {
      ctx.addIssue(`"${pattern.id}" weights every body zone at zero, so no zone can be picked`)
    }
  })

export type DamagePattern = z.infer<typeof DamagePatternSchema>

/** Exactly one entry per `DamagePatternId`, so the file and the enum can never
 * drift apart in either direction. */
export const DamagePatternsSchema = z.array(DamagePatternSchema).superRefine((patterns, ctx) => {
  const seen = new Set(patterns.map((pattern) => pattern.id))
  for (const id of DAMAGE_PATTERN_IDS) {
    if (!seen.has(id)) ctx.addIssue(`damagePatterns.json has no entry for "${id}"`)
  }
  if (seen.size !== patterns.length) {
    ctx.addIssue('damagePatterns.json declares the same pattern id twice')
  }
})
