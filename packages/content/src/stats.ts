import { z } from 'zod'

/** The five derived stats shown on a car's radar chart (GDD 4.2). */
export const StatBlockSchema = z.object({
  power: z.number(),
  handling: z.number(),
  style: z.number(),
  reliability: z.number(),
  authenticity: z.number(),
})

/** A part's effect on the five stats - deltas, so any sign, no change by default. */
export const StatModifierSchema = z.object({
  power: z.number().default(0),
  handling: z.number().default(0),
  style: z.number().default(0),
  reliability: z.number().default(0),
  authenticity: z.number().default(0),
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
 * `StatModifierSchema.power` and the car's current derived power figure.
 * DOWNFORCE comes from an aero-functional SKU's grade through
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
export type StatModifier = z.infer<typeof StatModifierSchema>
export type PhysicalModifier = z.infer<typeof PhysicalModifierSchema>
