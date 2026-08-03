import { z } from 'zod'
import { AssemblyIdSchema } from './assembly'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema, GradeSchema } from './tags'
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
   * One body-pipeline stage on one zone (docs/design/systems/workshop-rework.md's
   * pipeline table) - strip/prep, beat, weld, fill-and-sand, prime, or
   * polish, the six stages with no extra player input beyond which zone.
   * Excludes `paint`, which needs its own extra field below. `beat`, `weld`
   * and `fillAndSand` are metal-only; a trim zone refuses them at the sim
   * level (`bodyPipeline.ts`), not here - the zone id alone does not say
   * which shape it addresses.
   */
  z.object({
    kind: z.literal('pipeline-stage'),
    stage: PipelineStageIdSchema.exclude(['paint']),
    zoneId: ZoneIdSchema,
  }),
  /**
   * Pull a zone's current panel onto the shelf as a `PartInstance` and mark
   * the zone missing - the same remove-to-inventory shape every other slot
   * uses. A no-op on an already-missing zone: there is nothing there to pull.
   */
  z.object({
    kind: z.literal('pipeline-remove-panel'),
    zoneId: PanelZoneIdSchema,
  }),
  /**
   * Fit the inventory `PartInstance` at `partInstanceId` onto `zoneId` - the
   * install-from-inventory half of the same pair. Needs the zone missing
   * first: a zone still carrying its old panel is removed before it is
   * installed over, exactly like every other occupied slot.
   */
  z.object({
    kind: z.literal('pipeline-install-panel'),
    zoneId: PanelZoneIdSchema,
    partInstanceId: z.string().min(1),
  }),
  /** The paint stage, with the colour chosen for this zone and the finish
   * grade - stock, street, sport or race - which sets the tin charged and
   * which paint SKU the completed stage installs. Stock is refused
   * everywhere but the car's own factory colour. */
  z.object({
    kind: z.literal('pipeline-paint'),
    zoneId: ZoneIdSchema,
    colour: z.string().min(1),
    grade: GradeSchema,
  }),
])

export const StagedActionsSchema = z.array(StagedActionSchema)

export type StagedAction = z.infer<typeof StagedActionSchema>
