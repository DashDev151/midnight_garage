import { z } from 'zod'
import { AssemblyIdSchema } from './assembly'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema } from './tags'
import { PanelZoneIdSchema, ZoneIdSchema } from './zone'
import { PipelineStageIdSchema } from './material'

/**
 * One piece of work the player intends to do on a car but hasn't committed to
 * yet - staged freely, at zero cost, until Confirm resolves the whole list at
 * once through the existing job/labor system. Mirrors `ServiceJobWorkSchema`'s
 * repair/install split, but carries the specific `partInstanceId` for an
 * install stage (the drag gesture onto a component row *is* the part choice).
 *
 * A repair stage has `targetBand` - the player chooses how far to climb, not
 * always mint; Confirm climbs every non-mint, non-scrap part in the group
 * toward it, labor allowing.
 *
 * Both kinds gain an optional `carPartId` - the per-part address added
 * alongside the existing group-level addressing. When absent, behavior is
 * exactly group-level (a `repair` climbs every eligible part in the group;
 * an `install` targets whichever slot in the group the picked catalog part's
 * own address resolves to). When present, a `repair` climbs only that one
 * part, and an `install` is additionally checked against that exact slot
 * (not just "some empty slot somewhere in the group") - see `installFitGate`
 * (sim/jobs.ts).
 */
export const StagedActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('repair'),
    componentId: ComponentIdSchema,
    targetBand: ConditionBandSchema,
    carPartId: CarPartIdSchema.optional(),
  }),
  z.object({
    kind: z.literal('install'),
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1),
    carPartId: CarPartIdSchema.optional(),
  }),
  /**
   * Pull / put back one sub-assembly as a unit. Addressed by `assemblyId`
   * rather than a container id so a "remove then refit" pair stages coherently
   * before the container exists - at Confirm the remove creates the container
   * and the refit finds it (at most one container per (car, assembly) is ever
   * on the bench). The confirm/labour pipeline itself is untouched;
   * `confirmStagedWork` just calls the assembly resolvers for these two kinds.
   */
  z.object({ kind: z.literal('remove-assembly'), assemblyId: AssemblyIdSchema }),
  z.object({ kind: z.literal('refit-assembly'), assemblyId: AssemblyIdSchema }),
  /**
   * One body-pipeline stage on one zone (docs/design/workshop-rework.md's
   * pipeline table) - strip/prep, beat, weld, fill-and-sand, prime, or
   * polish, the six stages with no extra player input beyond which zone.
   * Excludes `swapPanel` and `paint`, which need their own extra field below.
   */
  z.object({
    kind: z.literal('pipeline-stage'),
    stage: PipelineStageIdSchema.exclude(['swapPanel', 'paint']),
    zoneId: ZoneIdSchema,
  }),
  /** Swap a zone's panel for the inventory `PartInstance` at `partInstanceId`
   * - never the chassis zone, which has no panel. */
  z.object({
    kind: z.literal('pipeline-swap-panel'),
    zoneId: PanelZoneIdSchema,
    partInstanceId: z.string().min(1),
  }),
  /** The paint stage, with the colour chosen for this zone (chassis:
   * underseal, so `colour` there is the underseal shade, not a chosen hue). */
  z.object({ kind: z.literal('pipeline-paint'), zoneId: ZoneIdSchema, colour: z.string().min(1) }),
])

export const StagedActionsSchema = z.array(StagedActionSchema)

export type StagedAction = z.infer<typeof StagedActionSchema>
