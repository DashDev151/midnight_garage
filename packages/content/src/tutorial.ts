import { z } from 'zod'
import { AssemblyIdSchema } from './assembly'
import { AuctionTierSchema } from './auction'
import { CarPartIdSchema, ConditionBandSchema } from './tags'

/**
 * Sprint 89 (Yuki teaches you the game): the scripted tutorial that turns the
 * first story mission (`four-wheels`) into the guided first-run experience.
 * Every player-facing string here is orchestrator-swept copy applied verbatim
 * (content law); the overlay component that renders it (`packages/game`) reads
 * game/store state ONLY and never mutates the sim.
 */

/**
 * A declarative completion/visibility predicate over live game state (Sprint
 * 89 decision 1). The overlay evaluates these against `GameState` (and the
 * scripted lot/car), never a timer or a reflex input (accessibility law) -
 * every step advances on a player ACTION that leaves a readable state trace.
 *
 * - `missionActive`: the tutorial mission is `active` (the player accepted it).
 * - `lotInspected`: the scripted car's symptom has been narrowed to one cause
 *   (a yard inspection ran) - the sleeper-lesson reveal.
 * - `scriptedCarOwned`: the player owns the scripted car (won it).
 * - `partBandAtLeast`: the scripted car's `carPartId` slot holds a part at
 *   `band` or better - the "the wheel/engine work is done" signal.
 * - `missionDelivered`: the tutorial mission is `delivered`.
 * - `never`: never satisfied - the terminal sign-off card sits here until the
 *   player dismisses it.
 *
 * Sprint 95 (the tutorial actually guides) additions:
 * - `acknowledged`: the step's own id is in `gameState.tutorialAcknowledgedSteps`
 *   (the overlay's "Got it" button records it) - for purely informational steps.
 * - `scriptedCarInServiceBay`: the scripted car sits in a service bay.
 * - `inspectionVisitActive`: an inspection visit is live at the scripted lot's
 *   tier (`showWhen` only - it honestly regresses at End Day).
 * - `assemblyOnBench`: the named assembly is on the bench for the scripted car
 *   (`showWhen` only).
 * - `partInInventory`: a non-scrap inventory part addressed to `carPartId`
 *   exists - mirrors the bench swap-candidate rule (`showWhen` only).
 * - `partOnOrder`: a pending part order addressed to `carPartId` exists - the
 *   "your tyres are coming, End Day" waiting moment (`showWhen` only).
 * - `scriptedCarWhole`: the owned scripted car has no missing part (every slot
 *   installed or legitimately absent, `isPartMissing`) - the reassembly step's
 *   completion, so the machine can never march a part-missing car to delivery.
 * - `benchMemberBandAtLeast`: the scripted car's benched assembly member at
 *   `carPartId` holds an instance at `band` or better - the "fresh rubber is
 *   on the bench, refit it" beat (`showWhen`/`hideWhen` only).
 * - `testRun`: the scripted tutorial car's first symptom has had `testId` run
 *   (the test id appears in its `runTestIds`) - the diagnostic-test-done
 *   signal.
 */
const TutorialBaseConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('missionActive') }),
  z.object({ kind: z.literal('lotInspected') }),
  z.object({ kind: z.literal('scriptedCarOwned') }),
  z.object({
    kind: z.literal('partBandAtLeast'),
    carPartId: CarPartIdSchema,
    band: ConditionBandSchema,
  }),
  z.object({ kind: z.literal('missionDelivered') }),
  z.object({ kind: z.literal('never') }),
  z.object({ kind: z.literal('acknowledged') }),
  z.object({ kind: z.literal('scriptedCarInServiceBay') }),
  z.object({ kind: z.literal('inspectionVisitActive') }),
  z.object({ kind: z.literal('assemblyOnBench'), assemblyId: AssemblyIdSchema }),
  z.object({ kind: z.literal('partInInventory'), carPartId: CarPartIdSchema }),
  z.object({ kind: z.literal('partOnOrder'), carPartId: CarPartIdSchema }),
  z.object({ kind: z.literal('scriptedCarWhole') }),
  z.object({
    kind: z.literal('benchMemberBandAtLeast'),
    carPartId: CarPartIdSchema,
    band: ConditionBandSchema,
  }),
  z.object({ kind: z.literal('testRun'), testId: z.string().min(1) }),
])

export type TutorialBaseCondition = z.infer<typeof TutorialBaseConditionSchema>

/** `anyOf` is deliberately one level deep (members are base conditions, never
 * nested compositions): its whole job is the completion monotonicity law
 * (Sprint 95 decision 2) - a step a player skipped past must read complete via
 * a later stage's condition - and one OR layer expresses that exactly. */
const TutorialAnyOfSchema = z.object({
  kind: z.literal('anyOf'),
  of: z.array(TutorialBaseConditionSchema).min(1),
})

export const TutorialConditionSchema = z.union([TutorialBaseConditionSchema, TutorialAnyOfSchema])

export type TutorialCondition = z.infer<typeof TutorialConditionSchema>

/** One coach line: `yuki` speaks in-character; `instruction` is the game's
 * second-person coach voice. `text` is the swept copy verbatim, with
 * `{budgetCap}`/`{payout}`/`{model}`/`{part}` tokens the overlay interpolates
 * at render time. `showWhen`, when present, gates the line on a live
 * condition. `anchorTestId`, when present, overrides the step's spotlight
 * while this is the last visible anchored line (Sprint 95: the spotlight
 * follows the sub-state through a step). A line's anchor may be a CHAIN of
 * test ids tried in DOM order - a multi-screen errand (the shop trip) then
 * spotlights the deepest control that exists right now (the slot card inside
 * the department, the department card on the shop's home, the nav tab from
 * anywhere else). */
export const TutorialLineSchema = z.object({
  speaker: z.enum(['yuki', 'instruction']),
  text: z.string().min(1),
  showWhen: TutorialConditionSchema.optional(),
  /** Retires a line whose instruction has been carried out (playtest
   * 2026-07-19 item 19: the box must never end on an errand already run) -
   * the line hides while this condition is MET. Composable with `showWhen`:
   * a line renders when shown and not yet retired. */
  hideWhen: TutorialConditionSchema.optional(),
  anchorTestId: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
})

export type TutorialLine = z.infer<typeof TutorialLineSchema>

/** One guided beat. `anchorScreen` is the router route name the step lives on;
 * `anchorTestId` is the `data-test` control the overlay spotlights (a
 * `{lotId}` token resolves to the scripted lot at render time). `completion`
 * is the state predicate that advances past this step. */
export const TutorialStepSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  anchorScreen: z.string().min(1),
  anchorTestId: z.string().min(1),
  lines: z.array(TutorialLineSchema).min(1),
  completion: TutorialConditionSchema,
})

export type TutorialStep = z.infer<typeof TutorialStepSchema>

export const TutorialStepsSchema = z.array(TutorialStepSchema).min(1)

/** One part-slot band override on the scripted car, layered over `baseBand`. */
const TutorialPartOverrideSchema = z.object({
  carPartId: CarPartIdSchema,
  band: ConditionBandSchema,
})

/** The scripted symptom (Sprint 89 decision 2): a real generated-shape symptom
 * whose `trueCauseId` is the MINOR cause, so a yard inspection reveals the
 * room's fear was unearned. `apparent` records each damaged part's pre-symptom
 * band exactly as generation's `apparentBandByPartId` would. */
const TutorialSymptomSchema = z.object({
  symptomId: z.string().min(1),
  trueCauseId: z.string().min(1),
  apparent: z.array(TutorialPartOverrideSchema).min(1),
})

/**
 * The scripted auction lot recipe (Sprint 89 decisions 2-3). A fixed
 * shitbox-class runabout, deterministic under any career seed (no RNG draws) -
 * the satisfiability probe (`packages/sim/tests/tutorialProbe.test.ts`) derives
 * the recipe's economics and asserts purchase-at-reserve + parts + fees +
 * assist ops land comfortably under the mission's `budgetCapYen` with slack for
 * one player mistake, and that the payout still clears a visible profit.
 */
export const TutorialLotRecipeSchema = z.object({
  /** The story mission this tutorial guides (`storyMissions.json`). */
  missionId: z.string().min(1),
  lotId: z.string().min(1),
  carId: z.string().min(1),
  tier: AuctionTierSchema,
  modelId: z.string().min(1),
  year: z.number().int(),
  mileageKm: z.number().int().nonnegative(),
  color: z.string().min(1),
  /** Reused verbatim from `provenance.json`'s pool - not invented copy. */
  provenanceNote: z.string().min(1),
  authenticityPercent: z.number().min(0).max(100),
  /** The band every slot starts at before `partOverrides` are applied. */
  baseBand: ConditionBandSchema,
  partOverrides: z.array(TutorialPartOverrideSchema),
  symptom: TutorialSymptomSchema,
})

export type TutorialLotRecipe = z.infer<typeof TutorialLotRecipeSchema>
