import { z } from 'zod'
import { CarCultureSchema, CarTierSchema } from './tags'

export const BuyerArchetypeSchema = z.enum([
  'collector',
  'tuner',
  'show-crowd',
  'racer',
  'daily-drivers',
  'touge',
])

/** Taste by market position: which league of car this archetype turns up for.
 * No entry for a tier means the archetype never bids on it - there is no
 * default fallback (`interestedBuyers`, sim/bidding.ts). */
const TierPreferenceSchema = z.object({
  tier: CarTierSchema,
  weight: z.number().min(0),
})

/** Taste by car culture (docs/design/buyer-culture-affinity.csv): the same
 * shape as `TierPreferenceSchema`, but exhaustive rather than sparse - see
 * `CulturePreferencesSchema` below for why. */
const CulturePreferenceSchema = z.object({
  culture: CarCultureSchema,
  weight: z.number().min(0),
})

const CULTURE_COUNT = CarCultureSchema.options.length

/**
 * Every buyer's per-culture affinity, one entry per `CarCulture` with no
 * default: an unauthored culture failing validation is the point, because a
 * silent fallback to 1.0 would make that buyer invisibly culture-blind (the
 * Stage E v5 amendment, sale-value-system.md). `.length` fixes the entry
 * count at exactly thirteen and the `.refine` below checks the cultures
 * named are thirteen DISTINCT ones - together they rule out both a missing
 * culture and a duplicate standing in for it.
 */
const CulturePreferencesSchema = z
  .array(CulturePreferenceSchema)
  .length(CULTURE_COUNT)
  .refine((prefs) => new Set(prefs.map((p) => p.culture)).size === CULTURE_COUNT, {
    message: `culturePreferences must name each of the ${CULTURE_COUNT} car cultures exactly once`,
  })

/**
 * One derived stat's fit for a buyer archetype: taste is a match, not a
 * mean (sprint146.md). `target` is the normalised [0, 1] value that fully
 * satisfies the buyer on this stat - clearing it earns exactly as much as
 * exceeding it, which is what lets a specialised car reach a perfect match
 * instead of a generalist one always sitting closer to the middle. `upper`,
 * when present, is the point past which the car starts actively working
 * against the buyer (a caged race car putting off a Daily Drivers buyer, a
 * built engine putting off a collector); absent, there is no ceiling on this
 * stat. `importance` weights how much this stat counts toward the overall
 * match; 0 means the buyer genuinely does not look at it.
 */
const StatTasteSchema = z.object({
  target: z.number(),
  upper: z.number().optional(),
  importance: z.number().min(0),
})

/** Every derived stat's taste profile for a buyer archetype - the whole
 * shape `normalizedTasteScore` (sim/valuation.ts) scores a car against. */
const TasteProfileSchema = z.object({
  power: StatTasteSchema,
  handling: StatTasteSchema,
  style: StatTasteSchema,
  reliability: StatTasteSchema,
  authenticity: StatTasteSchema,
})

export const BuyerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    archetype: BuyerArchetypeSchema,
    displayName: z.string().min(1),
    statTargets: TasteProfileSchema,
    tierPreferences: z.array(TierPreferenceSchema).default([]),
    culturePreferences: CulturePreferencesSchema,
    /**
     * One authored line naming this archetype's want, shown alongside an
     * offer so the want IS the read (design doc `selling-rework.md` section
     * 3) - the want is the taste ceiling, surfaced rather than hidden.
     * Orchestrator-authored copy, transplanted verbatim from
     * `docs/sprints/sprint_archive/sprint114.md`'s "Authored copy" section.
     */
    wantLine: z.string().min(1),
  })
  .strict()

export const BuyersSchema = z.array(BuyerSchema).min(1)

export type BuyerArchetype = z.infer<typeof BuyerArchetypeSchema>
export type Buyer = z.infer<typeof BuyerSchema>
