import { z } from 'zod'
import { AssemblyIdSchema } from './assembly'
import { CarPartIdSchema, ComponentIdSchema, GradeSchema } from './tags'
import { PanelZoneIdSchema, ZoneIdSchema } from './zone'
import { PipelineStageIdSchema } from './material'
import { RepairJobKindSchema } from './workbench'

/**
 * One unit of work the player asks for - install or one of the four
 * body-pipeline ops - resolved the moment it's clicked, against today's
 * remaining labour, through the immediate resolvers in sim/jobs.ts and
 * sim/pipelineActions.ts. There is no staging or Confirm step anywhere in
 * this game: this type exists purely as the shared parameter shape those
 * resolvers (and the store functions that call them) take, so a
 * work-address lookup, a cost preview, and the actual resolution all
 * describe "which action" the same way. Carries the specific
 * `partInstanceId` for an install (the drag gesture onto a component row
 * *is* the part choice).
 *
 * `install` gains an optional `carPartId` - the per-part address added
 * alongside the existing group-level addressing. When absent, behavior is
 * exactly group-level (an `install` targets whichever slot in the group the
 * picked catalog part's own address resolves to). When present, an
 * `install` is additionally checked against that exact slot (not just "some
 * empty slot somewhere in the group") - see `installFitGate` (sim/jobs.ts).
 *
 * `repair-job`, `place-on-bench` and `take-off-bench` (below) are a
 * separate vocabulary for the headless paths that never click a UI control -
 * bots and career-script replay. They are DECLARED and not yet consumed:
 * nothing reads them, because `advanceDay` carries no queued-actions loop
 * over `StagedAction` at all, and the headless paths still reach the repair
 * engine through session events instead. The loop is the open half of the
 * work and is tracked in TODO.md; when it lands it calls the same instant
 * resolvers the live repair job engine uses (`resolveRepairStep`,
 * `resolvePlaceOnBench`, `resolveTakeOffBench`, sim/repairJobs.ts), never a
 * second implementation of the same work.
 */
export const StagedActionSchema = z.discriminatedUnion('kind', [
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
  /**
   * The whole-car respray: every currently primed zone finished in one pass
   * at booth quality, rather than one zone at a time
   * (docs/sprints/sprint222.md, "The respray"). Zoneless - unlike
   * `pipeline-paint`, it addresses whichever zones the plan finds primed
   * rather than one the player names. Needs the body line's full capability
   * and at least two primed zones; the same stock-grade colour gate
   * `pipeline-paint` enforces.
   */
  z.object({
    kind: z.literal('pipeline-respray'),
    colour: z.string().min(1),
    grade: GradeSchema,
  }),
  /**
   * Resolve one repair job's steps against the same instant resolver the
   * live path uses (`resolveRepairStep`, sim/repairJobs.ts), up to `steps`
   * times, stopping the moment any step is refused - never assumed to land.
   * Addressed the same way the engine's own `repair-step` session event is
   * (sessionEvent.ts): `carInstanceId` for a slot installed on a car,
   * `partInstanceId` for a loose part off it, `carPartId` names the exact
   * slot. `jobKind` selects which of the three recipe ladders
   * (`RepairJobKindSchema`, workbench.ts) to climb.
   */
  z.object({
    kind: z.literal('repair-job'),
    carInstanceId: z.string().min(1).optional(),
    carPartId: CarPartIdSchema.optional(),
    partInstanceId: z.string().min(1).optional(),
    jobKind: RepairJobKindSchema,
    steps: z.number().int().positive(),
  }),
  /**
   * Carry a loose part to whichever bench its group resolves to, or take it
   * back off - the queued counterpart to the engine's own `placeOnBench`/
   * `takeOffBench` session events, on the same declared-but-unconsumed
   * footing as `repair-job` above. Free and instant; a `repair-job` addressed
   * at a loose part refuses every step until the part is laid out on its
   * bench.
   */
  z.object({ kind: z.literal('place-on-bench'), partInstanceId: z.string().min(1) }),
  z.object({ kind: z.literal('take-off-bench'), partInstanceId: z.string().min(1) }),
])

export type StagedAction = z.infer<typeof StagedActionSchema>
