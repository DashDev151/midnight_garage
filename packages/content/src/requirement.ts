import { z } from 'zod'
import { CarPartIdSchema, ConditionBandSchema, GradeSchema } from './tags'

/**
 * A `RequirementSpec` is an end-state predicate over a car, not an action -
 * "this slot must hold at least this band (and grade)", never "repair this"
 * or "install that". Any route that leaves the car in the required state
 * satisfies it. Lives here, in content, so `ServiceJobTaskSchema` can
 * validate against it as data; the actual evaluator (`evaluateRequirement`)
 * lives in `packages/sim/src/requirements.ts`, which imports this type - the
 * same content/sim split every other schema-vs-behaviour pair in this codebase
 * already follows.
 *
 * `slotCondition` ships with service jobs. Story missions add five more to
 * this SAME union - `statThreshold`/`statCeiling` (derived-stat floor/ceiling),
 * `budgetCap` (spend ceiling), `deadline` (day-of-delivery cutoff),
 * `tasteMatch` (a buyer archetype's own taste multiplier floor), and
 * `roadworthy` (every slot at `worn`+). Also `lapTimeCeiling` (a reference-lap
 * time floor) and `allPartsBandAtLeast` (every slot at a named band or
 * better - `roadworthy`'s general form, for a mission whose floor isn't
 * `worn`). A service-job task's own `requirement` field (`serviceJob.ts`)
 * stays pinned to `SlotConditionRequirementSchema` specifically, not the whole
 * union below - a service job only ever authors that one kind, so its own type
 * stays concrete rather than every existing call site needing a `kind` narrowing
 * check for sibling kinds it can never actually see.
 */
export const SlotConditionRequirementSchema = z.object({
  kind: z.literal('slotCondition'),
  carPartId: CarPartIdSchema,
  /** The slot's installed part must be at least this band. An empty or
   * scrap-band slot always fails, regardless of `minGrade`. */
  minBand: ConditionBandSchema,
  /** When present, the installed part's own catalog grade must also be at
   * least this - the former `install` task's requirement. Absent for a
   * pure band requirement (the former `repair` task). */
  minGrade: GradeSchema.optional(),
})

export type SlotConditionRequirement = z.infer<typeof SlotConditionRequirementSchema>

/** The `StatBlock` keys a `statThreshold`/`statCeiling` requirement can grade
 * against (`stats.ts`'s `StatBlockSchema` fields, restated as an enum since a
 * discriminated-union field needs a literal set, not an object shape). */
export const StatKeySchema = z.enum(['power', 'handling', 'style', 'reliability', 'authenticity'])

export type StatKey = z.infer<typeof StatKeySchema>

export const RequirementSpecSchema = z.discriminatedUnion('kind', [
  SlotConditionRequirementSchema,
  /** A derived-stat floor, over `computeDerivedStats` - "make it at least
   * this fast/tidy/reliable." */
  z.object({
    kind: z.literal('statThreshold'),
    stat: StatKeySchema,
    min: z.number(),
  }),
  /** The mirror-image ceiling - "keep it under this", e.g. a sleeper-build
   * brief that caps `style` on purpose. */
  z.object({
    kind: z.literal('statCeiling'),
    stat: StatKeySchema,
    max: z.number(),
  }),
  /** A spend ceiling over `carLedgerFor` - purchase (0 if unknown) + repairs +
   * parts must stay at or under `maxTotalSpendYen`. */
  z.object({
    kind: z.literal('budgetCap'),
    maxTotalSpendYen: z.number().int().nonnegative(),
  }),
  /** A day-of-delivery cutoff - evaluated against the caller's `day` at
   * grade/deliver time, not at accept time. */
  z.object({
    kind: z.literal('deadline'),
    dueOnDay: z.number().int().positive(),
  }),
  /** "This buyer archetype has to actually want it" - passes when
   * `valuateCarForBuyer / marketValueYen >= minMultiplier` (that ratio is a
   * buyer's own taste multiplier, which cancels heat). */
  z.object({
    kind: z.literal('tasteMatch'),
    buyerId: z.string().min(1),
    minMultiplier: z.number().positive(),
  }),
  /** Every one of the car's 29 slots holds an installed part at `worn`
   * condition or better - no empty or scrap slot anywhere, the "this has to
   * actually be driveable" floor. */
  z.object({
    kind: z.literal('roadworthy'),
  }),
  /** A reference-lap time ceiling on one named course - passes when
   * `lapTimeSecondsFor(car, model, context) <= maxSeconds`. Fails with
   * `actual: "no time set"` when the model returns `null` (no tyres fitted,
   * or a scrap-band set). */
  z.object({
    kind: z.literal('lapTimeCeiling'),
    courseId: z.string().min(1),
    maxSeconds: z.number().positive(),
  }),
  /** Every one of the car's 29 slots holds an installed part at `minBand` or
   * better - `roadworthy`'s general form, for a mission whose floor is
   * higher than `worn` (e.g. "every part fine or better"). A legitimately
   * empty slot (e.g. forced induction on an NA car) never counts, same as
   * `roadworthy`. */
  z.object({
    kind: z.literal('allPartsBandAtLeast'),
    minBand: ConditionBandSchema,
  }),
])

export type RequirementSpec = z.infer<typeof RequirementSpecSchema>
