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
 *
 * `power`, `reliability` and `authenticity` are REQUIRED, not defaulted:
 * each is a live condition input (the same missing-entry-fails-loudly rule
 * `PowerFractionSchema` already applies to SKUs), so a taxonomy entry that
 * forgets one now fails schema validation instead of silently reading as
 * zero. `authenticity` does double duty and is the reason it joined them:
 * it weights the ORIGINALITY sum (`stocknessOf`, sim/derivedStats.ts) as
 * well as authenticity's own condition mean, so a slot left unauthored
 * would silently drop out of both. All 29 slots author it explicitly,
 * including the seven deliberate zeros (consumables and invisible bolt-ons,
 * which say nothing about whether a car is the car it claims to be).
 * `handling`/`style` keep their default.
 *
 * `.strict()`: a misspelt weight key is a slot silently carrying no weight
 * at all, which is exactly the failure the required keys above exist to
 * prevent, so an unknown key fails validation rather than being stripped.
 */
export const StatWeightsSchema = z
  .object({
    power: z.number(),
    handling: z.number().default(0),
    style: z.number().default(0),
    reliability: z.number(),
    authenticity: z.number(),
  })
  .strict()

/**
 * A fraction of the car's own STOCK power this SKU contributes, one value per
 * `EngineCharacter` - what a part actually gives depends on the engine it is
 * bolted to (`engineCharacterOf`), so the fraction is authored per character
 * rather than as one number. Consumed as
 * `model.spec.stockPowerPs * powerFraction[character] * bandFactor(band)` in
 * `computeDerivedStats`: it scales off STOCK power, never current power, so
 * contributions never compound and install order cannot matter (GDD 4.2's
 * no-hidden-maths rule). Zero on every SKU outside the eight power-bearing
 * engine slots, and zero at `stock` grade everywhere - authored explicitly as
 * zero, never left absent: all three keys are REQUIRED, with no `.default(0)`,
 * so a SKU missing one silently reading as zero power is a schema failure, not
 * a quiet no-op.
 */
export const PowerFractionSchema = z.object({
  'high-strung-na': z.number(),
  'lazy-na': z.number(),
  forced: z.number(),
})

/** A part's effect on the stats it still moves - deltas, so any sign, no
 * change by default. `power` retired in favour of `powerFraction`
 * (proportional, per-engine-character power) - a flat PS delta could not tell
 * an NA Beat from a twin-turbo Supra apart. `reliability` retired the same
 * way: a part does not add reliability, the build supports its own output or
 * it does not (`packages/sim/src/support.ts`), and reliability is condition
 * plus coherence rather than a sum of per-part deltas. `authenticity` retired
 * for the same class of reason: a part's `grade` already says whether it is
 * the original, so a second per-part authenticity number was a duplicate
 * answer to one question (and every one of the 472 shipped SKUs carried
 * exactly 0). The flat handling delta retired last: `physicalModifiers.grip`
 * already moves the quantity the handling readout is built from, and the
 * additive column on top of it was a second path to the same upgrade, which
 * `PhysicalModifierSchema` below bans by name for power and downforce. The
 * handling STAT is untouched - `computeDerivedStats` derives it from grip -
 * and so are `StatWeightsSchema`'s own handling, reliability and authenticity
 * columns, so condition and originality still reach their stats through the
 * taxonomy's weights. */
export const StatModifierSchema = z.object({
  style: z.number().default(0),
  // REQUIRED, not defaulted (Zod is non-strict, so an absent object here
  // would otherwise validate silently and every character's fraction would
  // read as 0 - a missing SKU must fail the schema, not fail loudly only in
  // a doc that claims it does). All 472 shipped SKUs author it explicitly.
  powerFraction: PowerFractionSchema,
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
   * it through the grip formula's own ratio. `.min(1)`: `buildFactors`
   * (sim/derivedStats.ts) interpolates a worn part's effective modifier as
   * `1 + (modifier - 1) * gradeBandFactor[grade][band]`, which pulls the
   * modifier BACK TOWARD 1 as the part wears. A modifier below 1 would get
   * BETTER as it wears out - a worn penalty part reading as an improvement
   * over mint. Every physicalModifier on this schema is an upgrade or a
   * no-op, never a stock-grade regression, so 1 is the floor. */
  grip: z.number().min(1).default(1),
  /** The braking coefficient, on top of whatever the rubber supplies.
   * `.min(1)` for the same reason as `grip` above. */
  braking: z.number().min(1).default(1),
  /** The fraction of the car's kerb weight the build still carries. `.max(1)`:
   * every aftermarket mass modifier in this catalogue is weight-SAVING or
   * neutral, never weight-adding, so 1 is the ceiling - the same
   * wear-interpolation reasoning as `grip`/`braking` above, mirrored: a
   * modifier above 1 would get LIGHTER as it wears toward 1.0. */
  mass: z.number().positive().max(1).default(1),
})

export type StatBlock = z.infer<typeof StatBlockSchema>
export type StatWeights = z.infer<typeof StatWeightsSchema>
export type PowerFraction = z.infer<typeof PowerFractionSchema>
export type StatModifier = z.infer<typeof StatModifierSchema>
export type PhysicalModifier = z.infer<typeof PhysicalModifierSchema>
