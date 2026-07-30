import { z } from 'zod'

/** The five derived stats shown on a car's radar chart (GDD 4.2). */
export const StatBlockSchema = z.object({
  power: z.number(),
  handling: z.number(),
  style: z.number(),
  reliability: z.number(),
  authenticity: z.number(),
})

/**
 * How much a taxonomy part's condition band contributes to each derived
 * stat (`CarPartTaxonomyEntryContentSchema.statWeights`) - a weighting, not a
 * delta. Same five-key shape `StatModifierSchema` used to share before power
 * went proportional; split out once `StatModifierSchema.power` became a
 * per-character object, since a condition weight is still one plain number
 * per stat.
 */
export const StatWeightsSchema = z.object({
  power: z.number().default(0),
  handling: z.number().default(0),
  style: z.number().default(0),
  reliability: z.number().default(0),
  authenticity: z.number().default(0),
})

/**
 * A fraction of the car's own STOCK power this SKU contributes, one value per
 * `EngineCharacter` - what a part actually gives depends on the engine it is
 * bolted to (`engineCharacterOf`), so the fraction is authored per character
 * rather than as one number. Consumed as
 * `model.spec.stockPowerPs * powerFraction[character] * bandFactor(band)` in
 * `computeDerivedStats`: it scales off STOCK power, never current power, so
 * contributions never compound and install order cannot matter (GDD 4.2's
 * no-hidden-maths rule). Zero on every SKU outside the eight power-bearing
 * engine slots, and zero at `stock` grade everywhere.
 */
export const PowerFractionSchema = z.object({
  'high-strung-na': z.number().default(0),
  'lazy-na': z.number().default(0),
  forced: z.number().default(0),
})

/** A part's effect on the four stats - deltas, so any sign, no change by
 * default. `power` retired in favour of `powerFraction` (proportional,
 * per-engine-character power) - a flat PS delta could not tell an NA Beat
 * from a twin-turbo Supra apart. `reliability` retired the same way: a part
 * does not add reliability, the build supports its own output or it does not
 * (`packages/sim/src/support.ts`), and reliability is condition plus
 * coherence rather than a sum of per-part deltas. `StatWeightsSchema.
 * reliability` is untouched - condition still reaches reliability through
 * it. */
export const StatModifierSchema = z.object({
  handling: z.number().default(0),
  style: z.number().default(0),
  authenticity: z.number().default(0),
  powerFraction: PowerFractionSchema.default({
    'high-strung-na': 0,
    'lazy-na': 0,
    forced: 0,
  }),
})

/**
 * A part's effect on the physical dials the lap model actually runs on, as
 * MULTIPLIERS of the car's own stock figure. 1 means "leaves the dial exactly
 * where the car's measurement put it", so a stock part carries none of these
 * and a car built out of stock parts reproduces its measured behaviour.
 *
 * Multiplicative rather than additive because every dial here is a coefficient
 * the whole roster shares: nine tenths of the kerb weight means the same thing
 * on a kei car and on a GT, where a fixed number of kilograms does not.
 *
 * Two dials the model has are deliberately absent, because each already has
 * exactly one path a part reaches it by. POWER moves through
 * `StatModifierSchema.powerFraction` and the car's current derived power
 * figure. DOWNFORCE comes from an aero-functional SKU's grade through
 * `statFormulas.aero.byGrade`. A second path for either would charge one
 * upgrade twice.
 */
export const PhysicalModifierSchema = z.object({
  /** Mechanical lateral grip, before compound: what the suspension and the
   * shell contribute. The tyre is not here - its compound tier already carries
   * it through the grip formula's own ratio. */
  grip: z.number().positive().default(1),
  /** The braking coefficient, on top of whatever the rubber supplies. */
  braking: z.number().positive().default(1),
  /** The fraction of the car's kerb weight the build still carries. */
  mass: z.number().positive().default(1),
})

export type StatBlock = z.infer<typeof StatBlockSchema>
export type StatWeights = z.infer<typeof StatWeightsSchema>
export type PowerFraction = z.infer<typeof PowerFractionSchema>
export type StatModifier = z.infer<typeof StatModifierSchema>
export type PhysicalModifier = z.infer<typeof PhysicalModifierSchema>
