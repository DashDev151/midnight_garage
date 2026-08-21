import {
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ComponentId,
  type DayLogEntry,
  type GameState,
  type Job,
  type MachineGateOperation,
  type Part,
  type PartInstance,
  type StagedAction,
  type ToolLevel,
} from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import {
  bandIndex,
  hasForcedInduction,
  isPartMissing,
  planGroupRepair,
  presentPartIdsInGroup,
  repairCeilingForLevel,
  repairLevelForGroup,
} from './bands'
import { applyDerivedBodyBands, isBodyDerivedPart, refitCarrierZoneStates } from './bodyPipeline'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { pruneCuredCauses, verifyAndResolve, verifyManyAndResolve } from './diagnosis'
import { recordDynoSession } from './dyno'
import { carInBodyBay } from './facilities'
import { bookCashMovements } from './financeLedger'
import { machiningOperationById } from './machining'
import { completeMachiningJob, machiningLogEntryFor } from './machiningJobs'
import { partFitsCar, reconcileStations } from './parts'
import { isCustomerOriginPart } from './provenance'
import { liftAvailable } from './repairJobs'
import { updateServiceJobLedger } from './serviceJobLedger'
import { toolLevelsFor } from './toolLines'

/**
 * Labour (energy points) to pull one slot's part off a car: one flat figure,
 * `energy.actionPoints.removePart`, whatever the slot's depth class - 2 points
 * at the shipped default, so stripping a whole car costs just under a solo
 * shop's daily pool. The `carPartId` parameter stays for signature stability
 * with `installLaborSlotsFor` below.
 */
export function removeLaborSlotsFor(carPartId: CarPartId, context: SimContext): number {
  return context.economy.energy.actionPoints.removePart
}

/**
 * Install labour (energy points) by the target slot's own depth class
 * (`energy.energyByClass`). Defaults to `'bolt-on'` for an unresolvable part
 * (never happens for real content, matching every other taxonomy lookup's own
 * defensive fallback).
 */
export function installLaborSlotsFor(carPartId: CarPartId, context: SimContext): number {
  const depthClass = context.partsTaxonomyById[carPartId]?.depthClass ?? 'bolt-on'
  return context.economy.energy.energyByClass[depthClass]
}

/**
 * Labour cost for refitting a part from inventory onto a car: free if the part
 * matches the slot's `vacatedBaseline` exactly (unchanged refit), otherwise the
 * normal class-based labour cost. `installLaborSlotsFor` above is used for
 * service-job costing and repairs, where the slot always improves, so labour is
 * always charged; this is the one site where restoring an unchanged part-band
 * pair costs nothing (logistics, not work).
 */
export function refitLaborSlotsFor(
  car: CarInstance,
  carPartId: CarPartId,
  partInstance: PartInstance,
  context: SimContext,
): number {
  const baseline = car.parts[carPartId].vacatedBaseline
  if (baseline && baseline.partId === partInstance.partId && baseline.band === partInstance.band) {
    // An unchanged member's refit labour - free at the shipped default of 0.
    return context.economy.energy.actionPoints.refitUnchangedMember
  }
  return installLaborSlotsFor(carPartId, context)
}

/**
 * Whether installing `action` onto `carInstanceId` right now would resolve
 * for FREE - zero labour (the picked instance matches the target slot's own
 * vacated baseline exactly, the equivalence refit `refitLaborSlotsFor` prices
 * free) - independent of how the slot is reached (a zero-labour refit is free
 * on every access route, since zero times any multiplier is still zero, and
 * the lift never charges for work that is not there). Every install in this
 * game resolves instantly
 * on click; this only tells a caller whether that click would spend
 * anything, so the UI can render a free refit's button without a cost
 * figure. `false` for an unresolvable car/part/slot - the caller's own fit
 * gate has already refused those before this ever runs.
 */
export function isFreeInstallRefit(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'install' }>,
  context: SimContext,
): boolean {
  const car = findWorkableCar(state, carInstanceId)
  const partInstance = state.partInventory.find((p) => p.id === action.partInstanceId)
  const catalogPart = partInstance ? context.partsById[partInstance.partId] : undefined
  const targetPartId = action.carPartId ?? catalogPart?.carPartId
  if (!car || !partInstance || !targetPartId) return false
  return refitLaborSlotsFor(car, targetPartId, partInstance, context) === 0
}

/**
 * Whether an install onto `carPartId` replaces whatever already occupies the
 * slot rather than being refused for it - true for a `removable: false`
 * taxonomy entry (`chassis`, `bodywork`, `paint`), whose slot is never
 * genuinely empty and whose identity therefore changes by replacement.
 * Every other slot needs to be emptied (`resolveRemovePart`) before a
 * different part can go in. Distinct from `isBodyDerivedPart`
 * (bodyPipeline.ts): that answers whether the slot's BAND comes from zone
 * state, which is true for only two of these three (`chassis` keeps its own
 * band like any ordinary part).
 */
export function replacesOccupiedSlot(carPartId: CarPartId, context: SimContext): boolean {
  return context.partsTaxonomyById[carPartId]?.removable === false
}

/**
 * A car the player can work on - either an owned car or a customer's car
 * sitting in an active service job. Both are worked through the same job
 * system, so any job/labor/staging resolver resolves either the same way.
 * Shared home for a lookup every one of those (and the game-layer store's own
 * view-building `findWorkableCar`) needs identically.
 */
export function findWorkableCar(state: GameState, carInstanceId: string): CarInstance | undefined {
  return (
    state.ownedCars.find((c) => c.id === carInstanceId) ??
    state.activeServiceJobs.find((sj) => sj.car.id === carInstanceId)?.car
  )
}

/** Writes `car` back into whichever population holds it (owned, or a customer
 * service job) - `findWorkableCar`'s counterpart on the write side, and the
 * shared bookkeeping `resolveRemovePart` and `completeJob` each inline twice. */
export function writeCarBack(state: GameState, carInstanceId: string, car: CarInstance): GameState {
  const ownedIndex = state.ownedCars.findIndex((c) => c.id === carInstanceId)
  if (ownedIndex !== -1) {
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = car
    return { ...state, ownedCars }
  }
  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === carInstanceId)
  if (serviceIndex !== -1) {
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...activeServiceJobs[serviceIndex]!, car }
    return { ...state, activeServiceJobs }
  }
  return state
}

export function createJob(spec: NewJobSpec, id: string): Job {
  return {
    id,
    carInstanceId: spec.carInstanceId,
    kind: spec.kind,
    componentId: spec.componentId,
    partInstanceId: spec.partInstanceId,
    targetBand: spec.targetBand,
    carPartId: spec.carPartId,
    laborSlotsRequired: spec.laborSlotsRequired,
    laborSlotsSpent: 0,
  }
}

/** Applies labor to a job, clamped so it never exceeds laborSlotsRequired. */
export function applyLaborToJob(job: Job, slots: number): Job {
  const laborSlotsSpent = Math.min(job.laborSlotsRequired, job.laborSlotsSpent + slots)
  return { ...job, laborSlotsSpent }
}

export function isJobComplete(job: Job): boolean {
  return job.laborSlotsSpent >= job.laborSlotsRequired
}

/**
 * Whether `job` addresses a loose part at a station rather than a car in a
 * service bay - a machining operation performed on a loose part. Its
 * `carInstanceId` holds the part's own id for stable identity, so every
 * car-shaped check (the service bay, the car lookup) has to skip it.
 *
 * A machining operation performed on a FITTED part (`performedOn`, economy
 * content) is a car job like any other and is deliberately not exempt: setup
 * work is done to an assembled car, so the car has to be in a bay for it to
 * progress.
 */
export function isPartLevelJob(job: Job, context: SimContext): boolean {
  if (job.kind !== 'machine-part') return false
  const operation = machiningOperationById(job.machiningOperationId, context.economy)
  return operation?.performedOn !== 'fitted-part'
}

export interface JobCompletionResult {
  state: GameState
  /**
   * Non-null when a completed install-part job could not actually apply
   * because its target slot was already occupied ('slot-occupied'). The
   * caller logs a job-blocked event with this reason and leaves the job
   * open to retry. A missing rig no longer blocks completion: the job's labour
   * was sized at the slog rate when it was created (`accessActionPoints` in
   * `findOrCreateJob`).
   */
  blockedReason: 'slot-occupied' | null
}

interface CarEffect {
  car: CarInstance
  partInventory: PartInstance[]
  blockedByOccupiedSlot: boolean
}

/**
 * The pure "apply a completed job to a car" core, shared by owned cars and
 * service-job cars. A job addresses a 6-way group, but its effect lands on
 * the real per-part state.
 *
 * Repair-zone: climbs every non-mint, non-scrap part in the group that's
 * still below `job.targetBand` up to it. Parts that reached scrap or mint
 * between creation and completion are skipped (already unrepairable/complete)
 * rather than erroring; the job was fully paid and labored. Empty slots are
 * skipped - there is nothing left to climb.
 *
 * Install-part: installs the picked `PartInstance` as-is, at whatever band
 * it carries - does NOT force slots to `mint` on install. A freshly-bought
 * part arrives already `mint` by construction; a previously-removed worn part
 * reinstalling at its real band is correct (forcing mint would let
 * remove+reinstall repair a part for free).
 *
 * A `removable: false` slot (`chassis`, `bodywork`, `paint`) is the one address
 * that takes an install over an OCCUPIED slot (`replacesOccupiedSlot`). Its
 * slot is never empty, so its identity changes by replacement rather than by
 * a remove followed by a fit, and the part coming off is not harvested (the
 * shell never leaves the car). For the two zone-derived carriers specifically
 * (`bodywork`/`paint`), the zones they cover are then refitted the way
 * `planInstallPanel` leaves a fresh panel, and the band re-derives from them,
 * so a fresh kit arrives on straight metal in bare primerless finish and the
 * car owes its paint. `chassis` has no zone to refit - its band is an
 * ordinary per-part one, so replacing it is nothing more than the identity
 * swap every install already does.
 *
 * Both branches run the result through `pruneCuredCauses` (cure-on-repair):
 * any symptom whose remaining causes all target parts now fitted strictly
 * better than they claim is cured, in whole or in part, the moment the band
 * actually climbs.
 */
function applyJobToCar(
  car: CarInstance,
  job: Job,
  partInventory: readonly PartInstance[],
  context: SimContext,
): CarEffect {
  if (job.kind === 'repair-zone') {
    const targetBand = job.targetBand
    if (!targetBand) {
      throw new Error(`repair-zone job ${job.id} missing targetBand`)
    }
    const parts = { ...car.parts }
    // A per-part job (job.carPartId set) climbs only that one part; a
    // group-level job (unset) climbs every eligible part in the group.
    const candidateIds = job.carPartId
      ? [job.carPartId]
      : presentPartIdsInGroup(car, job.componentId, context.partIdsByGroup)
    const touchedPartIds: CarPartId[] = []
    for (const partId of candidateIds) {
      const installed = parts[partId].installed
      if (!installed || installed.band === 'scrap') continue
      if (bandIndex(installed.band) >= bandIndex(targetBand)) continue
      parts[partId] = { installed: { ...installed, band: targetBand } }
      touchedPartIds.push(partId)
    }
    // A repair climbs a band, so it verifies exactly as removal does (the
    // spanner always tells - knowledge-and-diagnosis.md section 1, route 2):
    // every slot the repair actually touched is now known, whether it came
    // off the car first (bench work) or climbed in place (a fixed carrier).
    // Reveal-then-confirm at the click that queues this job is a UI-layer
    // concern; this resolver only ever sees the confirmed, real band.
    const { car: verifiedCar } = verifyManyAndResolve(
      pruneCuredCauses({ ...car, parts }, context),
      touchedPartIds,
      context,
    )
    return {
      car: verifiedCar,
      partInventory: [...partInventory],
      blockedByOccupiedSlot: false,
    }
  }

  if (!job.partInstanceId) {
    throw new Error(`install-part job ${job.id} missing partInstanceId`)
  }
  const partIndex = partInventory.findIndex((p) => p.id === job.partInstanceId)
  const partInstance = partIndex === -1 ? undefined : partInventory[partIndex]
  if (!partInstance) {
    throw new Error(`install-part job ${job.id} references a part not in inventory`)
  }
  const catalogPart = context.partsById[partInstance.partId]
  if (!catalogPart) {
    throw new Error(
      `install-part job ${job.id} references unknown catalog part ${partInstance.partId}`,
    )
  }
  const targetPartId = catalogPart.carPartId
  const targetState = car.parts[targetPartId]
  const replacesInPlace = replacesOccupiedSlot(targetPartId, context)
  if (targetState.installed && !replacesInPlace) {
    return { car, partInventory: [...partInventory], blockedByOccupiedSlot: true }
  }
  let fitted: CarInstance = {
    ...car,
    parts: {
      ...car.parts,
      [targetPartId]: { installed: partInstance },
    },
  }
  const model = context.modelsById[car.modelId]
  if (isBodyDerivedPart(targetPartId) && car.zoneState && model) {
    fitted = applyDerivedBodyBands(
      {
        ...fitted,
        zoneState: refitCarrierZoneStates(car.zoneState, targetPartId, partInstance.band),
      },
      model,
      context,
    )
  }
  // A fitted part was already known before it went on (loose warehouse
  // inventory is always verified - it's in hand), so the slot it lands in
  // is verified too, with nothing left to reveal there.
  const { car: verifiedFitted } = verifyAndResolve(
    pruneCuredCauses(fitted, context),
    targetPartId,
    context,
  )
  return {
    car: verifiedFitted,
    partInventory: partInventory.filter((_, i) => i !== partIndex),
    blockedByOccupiedSlot: false,
  }
}

/**
 * Applies a completed job's effect (group repair, part install, a run on the
 * rollers, or one machining operation) to GameState. For a car job the target
 * may be an owned car or a customer car sitting in a service job (the player
 * works both with the same job system). Does not remove the job from
 * state.jobs - the caller owns list bookkeeping.
 */
export function completeJob(state: GameState, job: Job, context: SimContext): JobCompletionResult {
  // A dyno session books the car onto the rollers and changes nothing else -
  // no band, no slot, no stat. Handled here, before any of the car-mutating
  // paths below are reached, because there is nothing for them to do.
  if (job.kind === 'dyno-session') {
    return { state: recordDynoSession(state, job), blockedReason: null }
  }

  // Machining writes one operation onto the part fitted in its slot. It moves
  // no band and swaps no part, so it takes its own path here rather than
  // `applyJobToCar`'s, which only knows how to do those two things.
  if (job.kind === 'machine-part') {
    return { state: completeMachiningJob(state, job, context), blockedReason: null }
  }

  const ownedIndex = state.ownedCars.findIndex((c) => c.id === job.carInstanceId)
  if (ownedIndex !== -1) {
    const effect = applyJobToCar(state.ownedCars[ownedIndex]!, job, state.partInventory, context)
    if (effect.blockedByOccupiedSlot) return { state, blockedReason: 'slot-occupied' }
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = effect.car
    let next: GameState = { ...state, ownedCars, partInventory: effect.partInventory }
    if (job.kind === 'install-part') {
      // The part's own cost lands on the car's ledger the moment it's
      // physically installed (not at purchase).
      const pricePaidYen =
        state.partInventory.find((p) => p.id === job.partInstanceId)?.pricePaidYen ?? 0
      next = updateCarLedger(next, job.carInstanceId, (ledger) => ({
        ...ledger,
        partsYen: ledger.partsYen + pricePaidYen,
      }))
    }
    // The part just left the warehouse for a car slot, so whichever station
    // it was sitting on is now clear.
    return { state: reconcileStations(next), blockedReason: null }
  }

  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === job.carInstanceId)
  if (serviceIndex !== -1) {
    const serviceJob = state.activeServiceJobs[serviceIndex]!
    const effect = applyJobToCar(serviceJob.car, job, state.partInventory, context)
    if (effect.blockedByOccupiedSlot) return { state, blockedReason: 'slot-occupied' }
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...serviceJob, car: effect.car }
    let next: GameState = { ...state, activeServiceJobs, partInventory: effect.partInventory }
    if (job.kind === 'install-part') {
      // The paid-price accounting at job scope, so the completion report can
      // show what this specific job actually cost.
      const pricePaidYen =
        state.partInventory.find((p) => p.id === job.partInstanceId)?.pricePaidYen ?? 0
      next = updateServiceJobLedger(next, serviceJob.id, (ledger) => ({
        ...ledger,
        partsYen: ledger.partsYen + pricePaidYen,
      }))
    }
    // The part just left the warehouse for a car slot, so whichever station
    // it was sitting on is now clear.
    return { state: reconcileStations(next), blockedReason: null }
  }

  throw new Error(`job ${job.id} references unknown car ${job.carInstanceId}`)
}

export interface RemovePartResult {
  state: GameState
  log: DayLogEntry[]
  /** How much of the caller's offered labor was actually spent removing this
   * part - 0 on any refusal (not removable, blocked, no machine, no car, or
   * insufficient labor). Mirrors `LaborApplicationResult`'s own field. */
  laborSlotsUsed: number
}

/** Every `blockedBy` slot for `carPartId` that is still occupied on `car` -
 * empty when nothing blocks. The symmetric rule that both `resolveRemovePart`
 * and `installFitGate` gate on. */
export function occupiedBlockers(
  car: CarInstance,
  carPartId: CarPartId,
  context: SimContext,
): CarPartId[] {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry) return []
  return entry.blockedBy.filter((blockerId) => car.parts[blockerId].installed !== null)
}

/** Every slot whose own `blockedBy` list names `carPartId` - the taxonomy
 * graph read backwards from `occupiedBlockers`'s forward direction:
 * structural only, independent of car state, so it costs nothing to call
 * before a car is even resolved. What installing/occupying `carPartId`
 * would physically seal access to, whatever slot names it. */
export function slotsBlockedByPart(carPartId: CarPartId, context: SimContext): CarPartId[] {
  return context.partsTaxonomy
    .filter((entry) => entry.blockedBy.includes(carPartId))
    .map((entry) => entry.id)
}

/**
 * The REQUIRED slots that installing/occupying `carPartId` on `car` right
 * now would seal shut behind it - every slot `slotsBlockedByPart` names that
 * is currently EMPTY and genuinely missing rather than legitimately absent
 * (`isPartMissing`'s own forced-induction carve-out), minus anything in
 * `exclude`. An assembly's own refit passes its member set as `exclude`: an
 * internal empty member is not itself a defect the refit needs to fix, only
 * a slot external to the assembly is. The install-respects-the-graph-
 * downward law (sprint212.md): wheels going back on over stripped brakes/
 * suspension, or intake going back on over a pulled engine, are both this
 * same check read from the other direction of `occupiedBlockers`.
 */
export function requiredEmptySlotsBehind(
  car: CarInstance,
  model: CarModel,
  carPartId: CarPartId,
  context: SimContext,
  exclude: readonly CarPartId[] = [],
): CarPartId[] {
  const excluded = new Set(exclude)
  return slotsBlockedByPart(carPartId, context).filter(
    (slot) => !excluded.has(slot) && isPartMissing(car, model, slot),
  )
}

/**
 * The tool line whose tier-2 machine gates `operation` on `carPartId`, or
 * `null` when that operation on that slot needs no machine at all. The one
 * predicate every machine gate in the game asks, structural only and
 * independent of ownership or hire (`hasMachineLineFor` below answers that
 * half).
 *
 * Both halves of the answer come off the slot's own taxonomy row: which
 * operations it gates is `machineGate`, and the line is the row's own `group`.
 * So a buried engine slot names the engine line for an install and a removal,
 * a signature slot names its line for an install and a repair but never for
 * pulling the old one off, and `tyres` names the wheels line for a bench fit
 * and nothing else. Exported so the UI can pre-empt exactly the gate the
 * resolvers apply.
 */
export function machineGateGroupFor(
  carPartId: CarPartId,
  operation: MachineGateOperation,
  context: SimContext,
): ComponentId | null {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry || !entry.machineGate.includes(operation)) return null
  return entry.group
}

/**
 * Whether `group`'s machinery is owned outright - the ownership half of
 * "owned or hired today", extracted once so the fee helpers below, the hire
 * gate, and the hire resolver never diverge on what counts as owned. Read off
 * the line's LEVEL, so the shop covering a line owns its machinery just as the
 * tier-2 rung does.
 */
export function ownsMachineForGroup(
  group: ComponentId,
  state: GameState,
  context: SimContext,
): boolean {
  return toolLevelsFor(state, context)[group] >= 2
}

/** Whether `group`'s daily hire (`resolveHireToolLine`) has already been
 * paid today. */
export function machineHiredToday(group: ComponentId, state: GameState): boolean {
  return state.machineHirePaidDayByGroup?.[group] === state.day
}

/**
 * Whether `group`'s line is usable right now for every operation - owned
 * outright, or hired for today. The gate every machine-shop-gated operation
 * (signature repair, buried removal, buried/signature install) checks
 * before it proceeds.
 */
export function hasMachineLineFor(
  group: ComponentId,
  state: GameState,
  context: SimContext,
): boolean {
  return ownsMachineForGroup(group, state, context) || machineHiredToday(group, state)
}

/**
 * How a part is reached to move it on or off a car. `open` is anything that is
 * not buried: spanners reach it, and there is nothing to own, hire or slog.
 * A buried part needs its group's rig, and there are three ways to have one:
 * `own` (the line stands at tier 2 or above), `hired` (today's day-hire on that
 * group, which grants the whole tier-2 kit), or `slog` (by hand, the long way).
 */
export type AccessRoute = 'open' | 'own' | 'hired' | 'slog'

/** An access route and the labour rate it charges. */
export interface PartAccess {
  route: AccessRoute
  multiplier: number
}

/**
 * How `entry`'s slot is reached right now and what that access costs in labour.
 * The one resolver behind every remove and fit action, so a part costs the same
 * to move whoever asks.
 *
 * Access is a rate, never a wall: a buried part with no rig owned and no hire
 * booked still comes off, at `toolHire.slogMultiplier` times the labour.
 * Nothing here can refuse an operation.
 */
export function accessRoute(
  state: GameState,
  context: SimContext,
  entry: CarPartTaxonomyEntry,
): PartAccess {
  if (entry.depthClass !== 'buried') return { route: 'open', multiplier: 1 }
  if (ownsMachineForGroup(entry.group, state, context)) return { route: 'own', multiplier: 1 }
  if (machineHiredToday(entry.group, state)) return { route: 'hired', multiplier: 1 }
  return { route: 'slog', multiplier: context.economy.toolHire.slogMultiplier }
}

/**
 * What one remove or fit action on `entry`'s slot actually costs: `basePoints`
 * at the slot's own access rate (`accessRoute`), less the lift's
 * `lift.underCarStepDiscountPoints` when the work is done from underneath and
 * the lift is owned or hired for the day, floored at one point.
 *
 * A zero-point action stays free. An unchanged member going straight back on is
 * logistics rather than work (`refitLaborSlotsFor`), and there is nothing there
 * for a rig or a lift to change.
 */
export function accessActionPoints(
  basePoints: number,
  entry: CarPartTaxonomyEntry,
  state: GameState,
  context: SimContext,
): number {
  const points = basePoints * accessRoute(state, context, entry).multiplier
  if (points <= 0 || !entry.underCar || !liftAvailable(state)) return points
  return Math.max(1, points - context.economy.lift.underCarStepDiscountPoints)
}

/**
 * The labour rate a machine-gated operation pays: 1 with the group's machine
 * (owned tier 2+, or hired today), `toolHire.slogMultiplier` without it. The
 * machine gate is a RATE, never a wall: every gated operation stays possible at
 * tier 1, just slower, the same philosophy the repair job engine's own slog
 * route states outright. Hiring the line buys the day's work back to base rate,
 * which is the cash-versus-labour trade. `group` may be null (the op is not
 * gated at all)
 * for callers passing `machineGateGroupFor`'s answer straight through.
 *
 * Remove and fit actions no longer come through here: they are priced by
 * `accessRoute` above. What is left is the on-car repair path and the body
 * pipeline's weld stage.
 */
export function machineLaborMultiplier(
  group: ComponentId | null,
  state: GameState,
  context: SimContext,
): number {
  if (!group || hasMachineLineFor(group, state, context)) return 1
  return context.economy.toolHire.slogMultiplier
}

/**
 * The machine group a new repair-zone job's labour rate is priced against, or
 * null when the job is ungated. A per-part repair reads that slot's repair
 * gate; a group-level repair counts as gated when ANY slot in the group gates
 * a repair (the signature slots: chassis and bodywork, dampers and springs,
 * seats and dash), since a group climb that touches them is the overwhelmingly
 * common case. Bench repair and machining are deliberately not priced here:
 * a bench job prices its own steps (`energyPlanFor`, repairJobs.ts), and
 * machining has its own physical machine requirement. An install is priced by
 * `accessRoute` instead.
 */
function jobMachineGroup(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): ComponentId | null {
  if (spec.kind !== 'repair-zone') return null
  if (spec.carPartId) return machineGateGroupFor(spec.carPartId, 'repair', context)
  const gated = (context.partIdsByGroup[spec.componentId] ?? []).some(
    (partId) => machineGateGroupFor(partId, 'repair', context) !== null,
  )
  return gated ? spec.componentId : null
}

/** The taxonomy row for the slot an install-part spec is addressed at, read off
 * the picked instance's own catalogue address the way `applyJobToCar` reads it.
 * Undefined for a spec whose part or slot cannot be resolved - the fit gate has
 * already refused those. */
function installTargetEntry(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): CarPartTaxonomyEntry | undefined {
  const partId = state.partInventory.find((p) => p.id === spec.partInstanceId)?.partId
  const carPartId = partId ? context.partsById[partId]?.carPartId : undefined
  return carPartId ? context.partsTaxonomyById[carPartId] : undefined
}

/**
 * The labour a new job is created with. An install (or a refit from the
 * warehouse) is sized by how its target slot is reached and whether the lift is
 * under the car (`accessActionPoints`), so a buried engine part slogged in by
 * hand costs the multiple while every open slot costs its plain figure. A
 * repair-zone job is still sized by the machine gate on its group. Everything
 * else stands at the spec's own figure.
 */
function jobLaborSlotsRequired(state: GameState, spec: NewJobSpec, context: SimContext): number {
  if (spec.kind === 'install-part') {
    const entry = installTargetEntry(state, spec, context)
    return entry
      ? accessActionPoints(spec.laborSlotsRequired, entry, state, context)
      : spec.laborSlotsRequired
  }
  return (
    spec.laborSlotsRequired *
    machineLaborMultiplier(jobMachineGroup(state, spec, context), state, context)
  )
}

export type HireMachineLineGateReason = 'no-cash' | 'hire-cap'

/** The groups whose day-hire has been paid for today, other than `except` -
 * what the daily cap counts. A group already hired today is re-hired for free,
 * so it never counts against its own cap. */
function otherLinesHiredToday(state: GameState, except: ComponentId): ComponentId[] {
  const stamps = state.machineHirePaidDayByGroup ?? {}
  return (Object.keys(stamps) as ComponentId[]).filter(
    (group) => group !== except && stamps[group] === state.day,
  )
}

/**
 * Whether hiring `group`'s line for today is blocked right now - `null` when
 * it is not. Owning the group's tier-2 machine, a zero fee, or a group
 * already hired today is never blocked. Two things refuse: the day's hire
 * allowance is already spent on a different line (`'hire-cap'`, a hire day
 * being a plan built around one bench rather than a shopping spree), or the
 * cash is not there for a fee that is both nonzero and unpaid. The cap is
 * asked first: money cannot fix it, so it is the more useful thing to say.
 * Modelled on `attendAuctionGateReason` (bidding.ts).
 */
export function hireMachineLineGateReason(
  state: GameState,
  group: ComponentId,
  context: SimContext,
): HireMachineLineGateReason | null {
  if (ownsMachineForGroup(group, state, context)) return null
  const feeYen = context.economy.toolHire.feeYenByGroup[group]
  if (feeYen <= 0) return null
  if (machineHiredToday(group, state)) return null
  if (otherLinesHiredToday(state, group).length >= context.economy.toolHire.maxHiredLinesPerDay) {
    return 'hire-cap'
  }
  return state.cashYen < feeYen ? 'no-cash' : null
}

export interface HireMachineLineResult {
  state: GameState
  log: DayLogEntry[]
  outcome: 'hired' | HireMachineLineGateReason
}

/**
 * The daily-unlock seam: charges `group`'s hire fee the first time that line is
 * needed on a given day, granting that group's whole tier-2 kit until End Day.
 * Owning the tier-2 machine, or a group already hired today, is a silent no-op
 * - no charge, no state recorded - so a second hire the same day never charges
 * twice. A different line once the day's allowance is spent, or short cash,
 * refuses via `hireMachineLineGateReason`. The spend is a running cost, posted
 * to the day report exactly as rent is (never to a car's ledger) - modelled on
 * `resolveAttendAuction` (bidding.ts).
 */
export function resolveHireToolLine(
  state: GameState,
  group: ComponentId,
  context: SimContext,
): HireMachineLineResult {
  if (ownsMachineForGroup(group, state, context)) return { state, log: [], outcome: 'hired' }
  const feeYen = context.economy.toolHire.feeYenByGroup[group]
  if (feeYen <= 0) return { state, log: [], outcome: 'hired' }
  if (machineHiredToday(group, state)) return { state, log: [], outcome: 'hired' }
  const gateReason = hireMachineLineGateReason(state, group, context)
  if (gateReason) return { state, log: [], outcome: gateReason }
  const nextState: GameState = {
    ...state,
    cashYen: state.cashYen - feeYen,
    machineHirePaidDayByGroup: { ...state.machineHirePaidDayByGroup, [group]: state.day },
  }
  const log: DayLogEntry[] = [{ type: 'machine-hired', componentId: group, priceYen: feeYen }]
  return {
    state: bookCashMovements(nextState, log, context.economy),
    log,
    outcome: 'hired',
  }
}

/**
 * Pulls whatever occupies `carPartId`'s slot into inventory and leaves the
 * slot genuinely EMPTY (`installed: null`), whatever grade the removed part
 * was. The removed instance drops to inventory at whatever band it actually
 * carried; an empty slot is a defect for every part but a legitimately-absent
 * forced-induction slot, priced as a full replacement in the restoration bill
 * (`bands.ts`'s `carCostToMintYen`). A no-op when the slot is already empty,
 * the car/part/its taxonomy group can't be resolved, or a Job is currently
 * open on this exact address (component- or part-level) - a part can't be
 * yanked out from under work already in progress.
 *
 * No synthesised stock backfill: removal does not backfill a MINT OEM instance,
 * even when the removed part's catalogue grade was not `stock`. There is no
 * factory part magically underneath an aftermarket one. An installed part and a
 * `vacatedBaseline` can never coexist (see `content/src/carInstance.ts`).
 * `refitLaborSlotsFor` was always correct and is untouched.
 *
 * Removal has two refusal cases, both silent no-ops - `removeBlockReason`
 * below is the single predicate the UI queries to explain them. Shell parts
 * (`removable: false`) never come off. Blocked slots (occupied by a part that
 * must stay installed until reassembled) refuse while the blocker is still
 * occupied. Tools never refuse a removal: a buried slot with no rig owned and
 * no hire booked comes off the slow way (`accessRoute`).
 *
 * Removal labour reads `energy.actionPoints.removePart` (2 in shipped
 * content) at the slot's own access rate, gating on `laborAvailable` and
 * spending into `energySpentToday`. The removed instance's own
 * `{partId, band}` is stamped onto the resulting slot as
 * `vacatedBaseline` - what a later refit is compared against
 * (`refitLaborSlotsFor`) to decide whether putting the car back together is
 * free logistics or chargeable work.
 *
 * Parts pulled off a service-job customer's car land in `partInventory`,
 * tracked and reconditionable, locked from sale/scrap, and reconciled at
 * close-out. Parts pulled off owned cars join inventory unchanged. The removed
 * instance's immutable `origin` (set at part creation) determines ownership
 * for all later operations (see `provenance.ts`).
 */
export function resolveRemovePart(
  state: GameState,
  carInstanceId: string,
  carPartId: CarPartId,
  context: SimContext,
  laborAvailable: number = Infinity,
): RemovePartResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return { state, log: [], laborSlotsUsed: 0 }
  const installed = car.parts[carPartId].installed
  if (!installed) return { state, log: [], laborSlotsUsed: 0 }
  const entry = context.partsTaxonomyById[carPartId]
  const componentId = entry?.group
  if (!entry || !componentId) return { state, log: [], laborSlotsUsed: 0 }
  // Assembly members are worked only via their assembly, never pulled off
  // individually. Refuse here so the direct-caller path matches the UI.
  if (context.assemblies.some((a) => a.members.includes(carPartId))) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  const busy = state.jobs.some(
    (j) =>
      j.carInstanceId === carInstanceId &&
      (j.carPartId ? j.carPartId === carPartId : j.componentId === componentId),
  )
  if (busy) return { state, log: [], laborSlotsUsed: 0 }
  if (!entry.removable) return { state, log: [], laborSlotsUsed: 0 }
  if (occupiedBlockers(car, carPartId, context).length > 0) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  // A buried slot works at base rate with that group's rig (owned outright, or
  // hired for today) and at the slog multiplier without it - slower by hand,
  // never refused - and the lift lightens anything worked from underneath.
  const laborSlotsUsed = accessActionPoints(
    removeLaborSlotsFor(carPartId, context),
    entry,
    state,
    context,
  )
  if (laborSlotsUsed > laborAvailable) return { state, log: [], laborSlotsUsed: 0 }

  // Removal empties the slot and stamps the removed instance's identity as
  // `vacatedBaseline` - a matching refit later is free logistics, anything
  // else is charged (`refitLaborSlotsFor`). No stock backfill: installed part
  // and baseline never coexist on one slot.
  const vacatedBaseline = {
    partId: installed.partId,
    band: installed.band,
  }
  const updatedCar: CarInstance = {
    ...car,
    parts: {
      ...car.parts,
      [carPartId]: { installed: null, vacatedBaseline },
    },
  }
  const withLabor: GameState = {
    ...state,
    energySpentToday: state.energySpentToday + laborSlotsUsed,
  }

  const ownedIndex = withLabor.ownedCars.findIndex((c) => c.id === carInstanceId)
  if (ownedIndex !== -1) {
    // An owned car: the removed part is ours, kept as-is. The spanner always
    // tells - uninstall verifies the slot and reveals truth at no extra cost
    // (knowledge-and-diagnosis.md section 1, route 1).
    const {
      car: revealedCar,
      revealedCauseId,
      eliminated,
    } = verifyAndResolve(updatedCar, carPartId, context)
    const ownedCars = [...withLabor.ownedCars]
    ownedCars[ownedIndex] = revealedCar
    const partInventory = [...withLabor.partInventory, installed]
    const log: DayLogEntry[] = [
      {
        type: 'part-removed',
        carInstanceId,
        carPartId,
        partInstanceId: installed.id,
        ...(revealedCauseId ? { revealedCauseId } : {}),
      },
      ...(eliminated
        ? [{ type: 'symptom-cause-eliminated', carInstanceId, carPartId } as const]
        : []),
    ]
    const base: GameState = { ...withLabor, ownedCars, partInventory }
    return { state: base, log, laborSlotsUsed }
  }

  const log: DayLogEntry[] = [
    { type: 'part-removed', carInstanceId, carPartId, partInstanceId: installed.id },
  ]

  const serviceIndex = withLabor.activeServiceJobs.findIndex((sj) => sj.car.id === carInstanceId)
  if (serviceIndex !== -1) {
    // A customer's car: a pulled part stays in our inventory - not ours to
    // sell or scrap, but ours to recondition until the job closes out.
    // No tagging needed on the way into inventory: `installed` already carries
    // its immutable origin from birth (the customer's car, or the market if the
    // player bought and fitted it), and that is what every ownership question
    // reads (`provenance.ts`).
    const serviceJob = withLabor.activeServiceJobs[serviceIndex]!
    const activeServiceJobs = [...withLabor.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...serviceJob, car: updatedCar }
    const partInventory = [...withLabor.partInventory, installed]
    const base: GameState = { ...withLabor, activeServiceJobs, partInventory }
    return { state: base, log, laborSlotsUsed }
  }

  return { state, log: [], laborSlotsUsed: 0 }
}

export type RemoveBlockReason =
  { kind: 'not-removable' } | { kind: 'blocked-by'; blockedBy: CarPartId[] }

/**
 * The pure "why can't this come off" predicate - what the UI queries
 * proactively (mirrors `naToTurboConversionBlocked`'s own reuse shape),
 * independent of today's remaining labour (a separate, dynamic
 * concern the UI already shows via the labor bar). `null` when nothing
 * structural blocks it (it may still be refused for insufficient labor, or
 * simply already removed).
 *
 * A missing rig no longer blocks anything here: a buried removal without one
 * proceeds at the slog rate (`accessRoute`), so the cost shows on the button
 * instead of a refusal.
 */
export function removeBlockReason(
  car: CarInstance,
  carPartId: CarPartId,
  _state: GameState,
  context: SimContext,
): RemoveBlockReason | null {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry || !entry.removable) return { kind: 'not-removable' }
  const blockedBy = occupiedBlockers(car, carPartId, context)
  if (blockedBy.length > 0) return { kind: 'blocked-by', blockedBy }
  return null
}

/**
 * An open job's stable id - one job per car+component+kind at a time
 * (group-level), or one per car+component+kind+part (per-part addressing).
 * The `carPartId` suffix lets per-part jobs on different parts in the same
 * group stay open at once without colliding, and never collides with a
 * group-level job on the same group.
 */
function jobIdFor(spec: NewJobSpec): string {
  const address = spec.carPartId ? `${spec.componentId}-${spec.carPartId}` : spec.componentId
  return `job-${spec.carInstanceId}-${spec.kind}-${address}`
}

export type RepairJobGate = { ok: true; state: GameState } | { ok: false; log: DayLogEntry[] }

/**
 * The single money step shared by on-car repair (`repairJobGate` below) and
 * the repair job engine (`repairJobs.ts`) - charges the already-priced repair
 * work against cash, or refuses silently when unaffordable. One repair
 * economy: every path
 * deducts the same banded-repair `costYen`. No per-job flat consumables fee -
 * bill truth is structural: this IS the number
 * `carCostToMintYen`/`planGroupRepair` already show.
 */
export function chargeRepairWork(
  state: GameState,
  repairCostYen: number,
): { ok: true; state: GameState; totalCostYen: number } | { ok: false } {
  if (state.cashYen < repairCostYen) return { ok: false }
  return {
    ok: true,
    state: { ...state, cashYen: state.cashYen - repairCostYen },
    totalCostYen: repairCostYen,
  }
}

/**
 * The repair-cost gate on starting a new repair-zone job - checked once at
 * creation, never again. Tool lines are always owned per progression bible
 * law 1, so the shop's current tool tier mostly just sets the repair level
 * the work climbs at; the one real ownership gate is a suspension/body/
 * interior signature slot, which needs its group's machinery owned or
 * hired for today.
 *
 * Repair-zone charges the real yen cost of the work from `planGroupRepair`'s
 * `costYen`, nothing else. A group with nothing left to repair refuses with a
 * reason, `beyond-repair` when something in it is past saving and
 * `nothing-to-repair` when it is simply already good enough - the screen has
 * to be able to say which. `install-part` is a no-op here
 * (charges only the part itself, bought separately). Shared by the player's
 * instant `findOrCreateJob` path and advanceDay's bot batch job-creation.
 */
export function repairJobGate(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): RepairJobGate {
  if (spec.kind === 'install-part') return { ok: true, state }

  if (!spec.targetBand) return { ok: false, log: [] }
  const car = findWorkableCar(state, spec.carInstanceId)
  if (!car) return { ok: false, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model) return { ok: false, log: [] }
  // Per-part repairs on a removable slot are bench-only - refuse explicitly so
  // the UI has a real reason to show, rather than silently falling through.
  // The part comes off, goes to the warehouse, and is repaired on the
  // workshop floor's bench; only the three fixed body carriers stay on the car.
  if (spec.carPartId && context.partsTaxonomyById[spec.carPartId]?.removable !== false) {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason: 'bench-only' }],
    }
  }
  // `bodywork`/`paint` are derived from zone state on a car that's on the
  // zone model - a per-part repair addressed at either of them refuses
  // outright (`bodyPipeline.ts`'s single-writer projection is the only
  // thing allowed to move their band); the zone's own pipeline stages are
  // how a player actually improves them.
  if (spec.carPartId && car.zoneState && isBodyDerivedPart(spec.carPartId)) {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason: 'derived-band' }],
    }
  }
  // A REPAIR climbs a part only to the group's tool-level ceiling
  // (`economy.repairBandCeilingByTier`) - level-1 caps at fine; mint needs the
  // group's tier-2 machine owned. Jobs targeting bands above the ceiling are
  // refused with a `tool-tier` reason (the UI already renders this) rather
  // than silently clamped. Mint is still reachable at any level via BUYING a
  // mint replacement and fitting it (install, never gated); owning tier-2
  // only lets you REPAIR the existing part to mint (cheaper).
  const toolLevels = toolLevelsFor(state, context)
  const repairCeiling = repairCeilingForLevel(
    repairLevelForGroup(toolLevels, spec.componentId),
    context.economy,
  )
  if (bandIndex(spec.targetBand) > bandIndex(repairCeiling)) {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason: 'tool-tier' }],
    }
  }
  // Pass the benched crew so the charge reflects a perfectionist's parts
  // discount; the caller already sized the job's labour with the same crew,
  // so cost and slots stay consistent for the player.
  const plan = planGroupRepair(
    car,
    spec.componentId,
    spec.targetBand,
    toolLevels,
    context.partIdsByGroup,
    context.partsById,
    context.partsTaxonomyById,
    context.economy.restoration.repairStepFraction,
    context.economy.energy.energyPerBandStepByToolTier,
    spec.carPartId,
    { staff: state.staff, economy: context.economy },
  )
  if (plan.partIds.length === 0) {
    // Nothing climbs, and the two ways that happens want different answers
    // from the player: something here is past saving and wants replacing
    // (`beyond-repair`), or the work was already done (`nothing-to-repair`).
    const reason = plan.unrepairablePartIds.length > 0 ? 'beyond-repair' : 'nothing-to-repair'
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason }],
    }
  }

  const charged = chargeRepairWork(state, plan.costYen)
  // Can't afford the work right now - a silent refusal, matching every
  // other can't-afford-it gate in this codebase.
  if (!charged.ok) return { ok: false, log: [] }
  // This gate also runs a customer's service-job car (the player fronts the
  // repair, gets paid via the job's payout on handback). Owned cars get a car
  // ledger entry; customer cars get the job's own ledger entry so the
  // completion report shows what was actually spent.
  const isOwnedCar = state.ownedCars.some((c) => c.id === spec.carInstanceId)
  if (isOwnedCar) {
    const chargedState = updateCarLedger(charged.state, spec.carInstanceId, (ledger) => ({
      ...ledger,
      repairYen: ledger.repairYen + charged.totalCostYen,
    }))
    return { ok: true, state: chargedState }
  }
  const serviceJob = state.activeServiceJobs.find((sj) => sj.car.id === spec.carInstanceId)
  const chargedState = serviceJob
    ? updateServiceJobLedger(charged.state, serviceJob.id, (ledger) => ({
        ...ledger,
        repairYen: ledger.repairYen + charged.totalCostYen,
      }))
    : charged.state
  return { ok: true, state: chargedState }
}

export type InstallFitGate = { ok: true } | { ok: false; log: DayLogEntry[] }

/** One tool line standing at one level - what fitting a given part asks of the
 * shop, and what the refusal names. */
export interface ToolRequirement {
  group: ComponentId
  level: ToolLevel
}

/** Whether the shop's lines currently stand high enough for `requirement`.
 * Capability is read off the LEVEL alone (`toolLevelsFor`, so a rung and the
 * shop above it are one ladder); a day's machine hire buys the machinery for
 * an operation, never a line's capability, so it is deliberately not consulted
 * here. */
function meetsToolRequirement(
  requirement: ToolRequirement,
  state: GameState,
  context: SimContext,
): boolean {
  return toolLevelsFor(state, context)[requirement.group] >= requirement.level
}

/**
 * The NA-to-turbo rule, structurally: what fitting `carPartId` onto `model`
 * asks of the engine line, or `null` when the rule does not apply. Converting
 * a factory-NA car to forced induction - fitting the FIRST turbo/supercharger
 * into a legitimately-empty slot - is fabrication work, gated behind
 * `economy.toolCeilings.naToTurboConversionEngineTier`; at 3 that means owning
 * the shop covering the engine line. A car that already carries forced
 * induction (factory) swaps freely at any level.
 */
function naToTurboRequirement(
  carPartId: CarPartId,
  model: CarModel,
  context: SimContext,
): ToolRequirement | null {
  if (carPartId !== 'forcedInduction' || hasForcedInduction(model)) return null
  return {
    group: 'engine',
    level: context.economy.toolCeilings.naToTurboConversionEngineTier,
  }
}

/**
 * The grade rule, structurally: a SKU's own grade asks its own line for
 * `economy.toolCeilings.installGradeToolLevel[grade]`. The part declares
 * nothing - `grade` and `carPartId` are already on all 580 SKUs, so this costs
 * no authoring rows. `null` only for a `carPartId` the taxonomy cannot
 * resolve, matching every other taxonomy lookup's own defensive fallback.
 */
function gradeRequirement(part: Part, context: SimContext): ToolRequirement | null {
  const group = context.partsTaxonomyById[part.carPartId]?.group
  if (!group) return null
  return { group, level: context.economy.toolCeilings.installGradeToolLevel[part.grade] }
}

/**
 * The one capability gate on INSTALLING a part: the requirement that refuses
 * `part` onto `car` right now, or `null` when the shop can fit it. Every
 * install path runs this - the ordinary slot path (`installFitGate` below,
 * which bots call directly), the bench (`resolveFitAssemblyMember` and the
 * foreign-car half of `resolveRefitAssembly`, assemblies.ts) and the nine body
 * zones (`resolvePipelineInstallPanelAction`, stagedWork.ts) - so there is one
 * answer rather than one per path.
 *
 * The rules compose in order and the first UNMET one is returned, so the
 * refusal names the requirement that actually binds. Every rule names the
 * part's own line, so a stricter rule earlier in the list can never hide a
 * looser one later: NA-to-turbo asks the engine line for 3, above anything the
 * grade ladder asks of it.
 *
 * A part declares no requirement of its own: each rule derives its (group,
 * level) pair from what the SKU already carries (`grade`, `carPartId`) and
 * from the car's own state. A body-panel rule - sport and race zone panels
 * asking the body line for 3 - is one more entry here between the two below,
 * derived from `part.zoneId` and `part.grade`, once its level is signed.
 *
 * Only INSTALL is gated. Removal runs none of this, so a race part that
 * arrived on a bought car or came off a stripped donor can still be pulled,
 * kept and sold by a shop that could not have fitted it.
 */
export function partCapabilityRequirement(
  part: Part,
  car: CarInstance,
  state: GameState,
  context: SimContext,
): ToolRequirement | null {
  const model = context.modelsById[car.modelId]
  const rules = [
    model ? naToTurboRequirement(part.carPartId, model, context) : null,
    gradeRequirement(part, context),
  ]
  for (const requirement of rules) {
    if (requirement && !meetsToolRequirement(requirement, state, context)) return requirement
  }
  return null
}

/**
 * Whether the NA-to-turbo conversion rule refuses this fit right now - the
 * one rule above, read as a yes/no. Exported so the UI can pre-empt the same
 * refusal `installFitGate` below enforces, one source of truth for both.
 */
export function naToTurboConversionBlocked(
  carPartId: CarPartId,
  model: CarModel,
  state: GameState,
  context: SimContext,
): boolean {
  const requirement = naToTurboRequirement(carPartId, model, context)
  return requirement !== null && !meetsToolRequirement(requirement, state, context)
}

/**
 * Validates part-component fit on install - this was only done in the UI
 * before. A separate gate beside `repairJobGate`, exported and called from
 * both `findOrCreateJob` (the player's instant path) and `advanceDay`'s bot
 * batch job-creation loop.
 *
 * Universally rejects any `PartInstance` whose band is `scrap` - scrap parts
 * cannot move between cars, only be replaced or scrap-sold. Fit is checked
 * against the target GROUP (`spec.componentId`), resolved via the catalog
 * part's own taxonomy group, not a direct componentId match.
 *
 * For per-part installs (when `spec.carPartId` is set), additionally requires
 * the catalog part's own address to match that exact slot (`partFitsCar`'s
 * optional param). Slot emptiness always resolves from the picked part's OWN
 * catalog address (`part.carPartId`), closing a gap where group-level specs
 * used to check the wrong slot. Every `removable: false` slot
 * (`replacesOccupiedSlot`) is the one exception to emptiness: its slot is
 * never empty, so an install addressed at one replaces what is fitted there
 * rather than being refused.
 * unconditionally `true` (no per-part check at all), which barely mattered
 * when almost every slot started genuinely empty pre-Sprint-32, but now
 * that every slot starts filled with a stock part by default, a group-level
 * install into an already-occupied specific slot would otherwise pass this
 * gate, create a real job, and only fail silently at completion
 * (`JobCompletionResult.blockedReason`) - stranding that job open forever
 * (nothing ever removes a blocked job from `state.jobs`). Checking the
 * resolved slot here
 * is behaviorally identical to the old per-part check when `spec.carPartId`
 * is set (already guaranteed equal to `part.carPartId` by the `partFitsCar`
 * call below whenever `fits` can be true) and closes the group-level gap
 * for free.
 */
export function installFitGate(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): InstallFitGate {
  if (spec.kind !== 'install-part') return { ok: true }
  const id = jobIdFor(spec)
  if (!spec.partInstanceId)
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'part-does-not-fit' }] }

  const car = findWorkableCar(state, spec.carInstanceId)
  const model = car ? context.modelsById[car.modelId] : undefined
  const partInstance = state.partInventory.find((p) => p.id === spec.partInstanceId)
  const part = partInstance ? context.partsById[partInstance.partId] : undefined
  const slotTakesPart =
    !!part &&
    (!car?.parts[part.carPartId]?.installed ||
      // A `removable: false` slot is never empty, so it takes an install
      // over what is already there - see `applyJobToCar`.
      replacesOccupiedSlot(part.carPartId, context))
  const fits =
    car &&
    model &&
    part &&
    partInstance &&
    partInstance.band !== 'scrap' &&
    slotTakesPart &&
    partFitsCar(part, model, spec.componentId, context.partsTaxonomyById, spec.carPartId)
  if (!fits) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'part-does-not-fit' }] }
  }
  // A part whose origin traces to an active customer job is only ever ours to
  // recondition and reinstall onto that SAME customer's car - never sold,
  // scrapped, or installed onto a different car, including the player's own.
  // `partInstance` is guaranteed defined here (part of the `fits` conjunction).
  const owningJob = state.activeServiceJobs.find((job) => isCustomerOriginPart(partInstance!, job))
  if (owningJob && owningJob.car.id !== spec.carInstanceId) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'not-your-part' }] }
  }
  // car and part are both guaranteed defined here (part of the `fits`
  // conjunction above) - TS doesn't narrow through the boolean variable.
  if (partCapabilityRequirement(part!, car!, state, context)) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'tool-tier' }] }
  }
  // Install requires every `blockedBy` slot for the TARGET address empty,
  // exactly like uninstall (`resolveRemovePart`) - reassembly order matters
  // (e.g. the clutch can't go back in before the gearbox is on).
  if (occupiedBlockers(car!, part!.carPartId, context).length > 0) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'blocked-by' }] }
  }
  // Install also refuses the graph read backwards: fitting this part must not
  // seal a required slot shut behind it (wheels over stripped brakes, intake
  // over a pulled engine) - `model!` is guaranteed defined here (part of the
  // `fits` conjunction above).
  if (requiredEmptySlotsBehind(car!, model!, part!.carPartId, context).length > 0) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'blocks-access' }] }
  }
  return { ok: true }
}

/**
 * Finds the car's already-open job matching this spec's kind+component, or
 * creates one. A car can only have one open job per component at a time, so
 * a repeat click on the same repair/install continues the existing job rather
 * than creating a duplicate; the id is deterministic from car+kind+componentId
 * so "the same job" is recognizable across days.
 *
 * A new repair-zone job additionally passes `repairJobGate` (repair cost
 * affordable) before creation; `job` comes back `null` when the gate refuses.
 * A new install-part job likewise passes `installFitGate`.
 */
export function findOrCreateJob(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): { state: GameState; job: Job | null; log: DayLogEntry[] } {
  const id = jobIdFor(spec)
  const existing = state.jobs.find((j) => j.id === id)
  if (existing) return { state, job: existing, log: [] }

  const fitGate = installFitGate(state, spec, context)
  if (!fitGate.ok) return { state, job: null, log: fitGate.log }

  const gate = repairJobGate(state, spec, context)
  if (!gate.ok) return { state, job: null, log: gate.log }

  // Labour is fixed at creation: the work was started under the conditions of
  // the day it began, and hiring a rig tomorrow does not speed the
  // half-stripped engine already on the floor.
  const laborSlotsRequired = jobLaborSlotsRequired(state, spec, context)
  const job = createJob(
    laborSlotsRequired === spec.laborSlotsRequired ? spec : { ...spec, laborSlotsRequired },
    id,
  )
  const totalCostYen = state.cashYen - gate.state.cashYen || undefined
  const log: DayLogEntry[] = [
    {
      type: 'job-created',
      jobId: job.id,
      carInstanceId: job.carInstanceId,
      kind: job.kind,
      ...(totalCostYen ? { costYen: totalCostYen } : {}),
    },
  ]
  return {
    state: bookCashMovements(
      { ...gate.state, jobs: [...gate.state.jobs, job] },
      log,
      context.economy,
    ),
    job,
    log,
  }
}

export interface LaborApplicationResult {
  state: GameState
  log: DayLogEntry[]
  /** How much of the caller's offered labor was actually consumed - 0 if the job was already complete. */
  laborSlotsUsed: number
}

/**
 * Applies up to `laborAvailable` labour to one job (by id), completing it
 * immediately if that's enough - the single-job core shared by the player's
 * instant repair/install click and advanceDay's bot batch loop.
 * Bumps `energySpentToday` by exactly what was used, so the caller never
 * has to track the daily budget separately from the state transition itself.
 */
export function applyAvailableLaborToJob(
  state: GameState,
  jobId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const job = state.jobs.find((j) => j.id === jobId)
  if (!job) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  // A loose-part `machine-part` job works a part on the machine in the machine
  // shop rather than a car, so the in-a-bay requirement (a car-only
  // constraint) is skipped for it. Every other step below - the daily
  // labour budget, the completion path - is identical; one repair economy.
  //
  // Interior parts (`seats`, `dashGauges`) and `aero` are body-shop work
  // (sprint212.md: interior and aero belong to the body bay) - their job
  // asks the body bay rather than a service bay; every other slot is
  // unaffected. `aero` shares its taxonomy group (`body`) with the two
  // zone-derived carriers (`bodywork`, `paint`), so it is named by
  // `carPartId` rather than by group.
  if (!isPartLevelJob(job, context)) {
    const needsBodyBay = job.componentId === 'interior' || job.carPartId === 'aero'
    const inRightBay = needsBodyBay
      ? carInBodyBay(state, job.carInstanceId)
      : state.serviceBayCarIds.includes(job.carInstanceId)
    if (!inRightBay) {
      return {
        state,
        log: [
          {
            type: 'job-blocked',
            jobId: job.id,
            reason: needsBodyBay ? 'not-in-body-bay' : 'not-in-service-bay',
          },
        ],
        laborSlotsUsed: 0,
      }
    }
  }

  const need = job.laborSlotsRequired - job.laborSlotsSpent
  // A surface-slot job may be created needing ZERO labour
  // (`economy.teardown.*SlotsByClass.surface` is 0) - it must still run
  // through `completeJob` below on this very call, or it would sit in
  // `state.jobs` forever, "complete" by `isJobComplete` yet never applied to
  // the car. Only a job that is BOTH incomplete and starved of labour today is
  // a genuine no-op.
  if (need > 0 && laborAvailable <= 0) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  const slotsToApply = Math.max(0, Math.min(laborAvailable, need))

  const updatedJob = applyLaborToJob(job, slotsToApply)
  let next: GameState = {
    ...state,
    jobs: state.jobs.map((j) => (j.id === jobId ? updatedJob : j)),
    energySpentToday: state.energySpentToday + slotsToApply,
  }
  const log: DayLogEntry[] =
    slotsToApply > 0 ? [{ type: 'job-progress', jobId, laborSlotsSpent: slotsToApply }] : []

  if (isJobComplete(updatedJob)) {
    const result = completeJob(next, updatedJob, context)
    next = result.state
    if (result.blockedReason) {
      log.push({ type: 'job-blocked', jobId, reason: result.blockedReason })
    } else {
      next = { ...next, jobs: next.jobs.filter((j) => j.id !== jobId) }
      if (updatedJob.kind === 'machine-part') {
        // A finished operation names itself, since "engine work completed"
        // would not tell the player which of nine jobs came back.
        log.push(machiningLogEntryFor(updatedJob))
      } else {
        log.push({
          type: 'job-completed',
          jobId,
          carInstanceId: updatedJob.carInstanceId,
          kind: updatedJob.kind,
        })
      }
    }
  }

  return { state: next, log, laborSlotsUsed: slotsToApply }
}

/**
 * The instant player-facing resolver: find-or-create the job for this
 * car+zone/slot, then apply as much of today's remaining labour as it needs.
 * Composes `findOrCreateJob` + `applyAvailableLaborToJob` - the same two
 * primitives advanceDay's bot batch loop uses, just for a single click.
 * `findOrCreateJob` can refuse to create a repair-zone job (no equipment /
 * can't afford it); `job` comes back `null` in that case.
 */
export function resolveJobLabor(
  state: GameState,
  spec: NewJobSpec,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const created = findOrCreateJob(state, spec, context)
  if (!created.job) return { state: created.state, log: created.log, laborSlotsUsed: 0 }
  const result = applyAvailableLaborToJob(created.state, created.job.id, laborAvailable, context)
  return { ...result, log: [...created.log, ...result.log] }
}
