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

export type StatBlock = z.infer<typeof StatBlockSchema>
export type StatModifier = z.infer<typeof StatModifierSchema>
