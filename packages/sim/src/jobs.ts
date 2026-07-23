import {
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type DayLogEntry,
  type GameState,
  type Job,
  type PartInstance,
} from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import {
  bandIndex,
  canRepair,
  clampRepairTarget,
  hasForcedInduction,
  planGroupRepair,
  planPartRepair,
  presentPartIdsInGroup,
  repairCeilingForLevel,
  repairLevelForGroup,
  type PartRepairPlan,
} from './bands'
import { isBodyDerivedPart } from './bodyPipeline'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { crewEnergySaved, perfectionistCostMultiplier } from './crewSkills'
import { pruneCuredCauses, revealOnRemoval } from './diagnosis'
import { partFitsCar } from './parts'
import { isCustomerOriginPart } from './provenance'
import { updateServiceJobLedger } from './serviceJobLedger'

/**
 * Labour (energy points) to pull one slot's part off a car: one flat figure,
 * `energy.actionPoints.removePart`, whatever the slot's depth class - free at
 * the shipped default of 0. The `carPartId` parameter stays for signature
 * stability with `installLaborSlotsFor` below.
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
  if (
    baseline &&
    baseline.partId === partInstance.partId &&
    baseline.band === partInstance.band &&
    baseline.genuinePeriod === partInstance.genuinePeriod
  ) {
    // An unchanged member's refit labour - free at the shipped default of 0.
    return context.economy.energy.actionPoints.refitUnchangedMember
  }
  return installLaborSlotsFor(carPartId, context)
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

export interface JobCompletionResult {
  state: GameState
  /**
   * Non-null when a completed install-part job could not actually apply:
   * its target slot was already occupied ('slot-occupied'), or its group's
   * machine line is neither owned nor hired today ('machine-line'). The
   * caller logs a job-blocked event with this reason and leaves the job
   * open to retry.
   */
  blockedReason: 'slot-occupied' | 'machine-line' | null
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
    for (const partId of candidateIds) {
      const installed = parts[partId].installed
      if (!installed || installed.band === 'scrap') continue
      if (bandIndex(installed.band) >= bandIndex(targetBand)) continue
      parts[partId] = { installed: { ...installed, band: targetBand } }
    }
    return {
      car: pruneCuredCauses({ ...car, parts }, context),
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
  if (targetState.installed) {
    return { car, partInventory: [...partInventory], blockedByOccupiedSlot: true }
  }
  return {
    car: pruneCuredCauses(
      {
        ...car,
        parts: {
          ...car.parts,
          [targetPartId]: { installed: partInstance },
        },
      },
      context,
    ),
    partInventory: partInventory.filter((_, i) => i !== partIndex),
    blockedByOccupiedSlot: false,
  }
}

/**
 * A completed `recondition-part` job's effect - climb the loose `PartInstance`
 * in `partInventory` to the job's `targetBand`, exactly the way
 * `applyJobToCar`'s repair-zone branch climbs an installed part (skip scrap,
 * skip anything already at/above the target). No car, no slot; the part's own
 * band is the only state that moves. A part that vanished from inventory since
 * the job was created (sold, installed, reconciled at close-out) is simply a
 * no-op - the job was already paid and labored.
 */
function completeReconditionJob(state: GameState, job: Job, context: SimContext): GameState {
  const targetBand = job.targetBand
  if (!job.partInstanceId || !targetBand) return state
  // The part may be a loose bin part or a member sitting in an open assembly
  // container (`findLoosePart`) - it climbs its band wherever it lives.
  const instance = findLoosePart(state, job.partInstanceId)
  if (!instance) return state
  const catalogPart = context.partsById[instance.partId]
  const entry = catalogPart ? context.partsTaxonomyById[catalogPart.carPartId] : undefined
  if (
    !entry ||
    !canRepair(instance.band, entry) ||
    bandIndex(instance.band) >= bandIndex(targetBand)
  ) {
    return state
  }
  return updateLoosePart(state, job.partInstanceId, (inst) => ({ ...inst, band: targetBand }))
}

/**
 * Applies a completed job's effect (group repair, part install, or an
 * in-inventory recondition) to GameState. For a car job the target may be an
 * owned car or a customer car sitting in a service job (the player works both
 * with the same job system); a `recondition-part` job targets a loose
 * inventory part instead. Does not remove the job from state.jobs - the
 * caller owns list bookkeeping.
 */
export function completeJob(state: GameState, job: Job, context: SimContext): JobCompletionResult {
  if (job.kind === 'recondition-part') {
    return { state: completeReconditionJob(state, job, context), blockedReason: null }
  }

  if (job.kind === 'install-part') {
    // A buried engine/drivetrain fit or a suspension/body/interior
    // signature fit needs that group's machine line - owned outright, or
    // hired for today. Checked before the part ever touches the car, so a
    // blocked install leaves the car and the job untouched, exactly like
    // the occupied-slot block below.
    const carPartId = installTargetCarPartId(state, job, context)
    const machineGroup = carPartId ? machineLineGroupFor(carPartId, context) : null
    if (machineGroup && !hasMachineLineFor(machineGroup, state)) {
      return { state, blockedReason: 'machine-line' }
    }
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
    return { state: next, blockedReason: null }
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
    return { state: next, blockedReason: null }
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

/**
 * The two component groups whose buried slots need a tier-2 machine (or the
 * group's line hired for the day) - the engine crane and the transmission
 * bench.
 */
export type MachineGateGroup = 'engine' | 'drivetrain'

/**
 * The tool line (and its tier-2 machine) a buried slot in that group needs -
 * `null` for a surface/bolt-on slot, or any group other than engine/drivetrain
 * (no machine gate exists elsewhere). Exported so the UI can pre-empt the same
 * gate `resolveRemovePart`/`completeJob` uses.
 */
export function removeMachineGateGroup(
  carPartId: CarPartId,
  context: SimContext,
): MachineGateGroup | null {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry || entry.depthClass !== 'buried') return null
  return entry.group === 'engine' || entry.group === 'drivetrain' ? entry.group : null
}

/**
 * The group whose signature heavy op (a repair or install/replace of one of
 * `economy.machineShopAssist.signatureSlotsByGroup[group]`) `carPartId` is,
 * or `null` when it names no signature slot - structural only, independent
 * of ownership or hire. The suspension/body/interior analogue of
 * `removeMachineGateGroup`'s engine/drivetrain buried-slot check.
 */
export function signatureGroupFor(carPartId: CarPartId, context: SimContext): ComponentId | null {
  const group = context.partsTaxonomyById[carPartId]?.group
  if (!group) return null
  const signatureSlots = context.economy.machineShopAssist.signatureSlotsByGroup[group]
  return signatureSlots && signatureSlots.includes(carPartId) ? group : null
}

/**
 * The single group, if any, whose machine line gates a REMOVE or
 * INSTALL/REPLACE of `carPartId` - a buried engine/drivetrain slot or a
 * suspension/body/interior signature slot. `null` for everything else. A
 * carPartId is gated by at most one group.
 */
export function machineLineGroupFor(carPartId: CarPartId, context: SimContext): ComponentId | null {
  return removeMachineGateGroup(carPartId, context) ?? signatureGroupFor(carPartId, context)
}

/**
 * Whether `group`'s tier-2 machine is owned outright - the ownership half of
 * "owned or hired today", extracted once so the fee helpers below, the hire
 * gate, and the hire resolver never diverge on what counts as owned.
 */
export function ownsMachineForGroup(group: ComponentId, state: GameState): boolean {
  return state.toolTiers[group] >= 2
}

/** Whether `group`'s daily hire (`resolveHireMachineLine`) has already been
 * paid today. */
export function machineHiredToday(group: ComponentId, state: GameState): boolean {
  return state.machineHirePaidDayByGroup?.[group] === state.day
}

/**
 * Whether `group`'s line is usable right now for every operation - owned
 * outright, or hired for today. The gate every machine-line-gated operation
 * (signature repair, buried removal, buried/signature install) checks
 * before it proceeds.
 */
export function hasMachineLineFor(group: ComponentId, state: GameState): boolean {
  return ownsMachineForGroup(group, state) || machineHiredToday(group, state)
}

/**
 * The cash fee a machine-gated operation (remove or install) on `carPartId`
 * would cost without owning the tier-2 machine -
 * `economy.machineShopAssist.feeYenByGroup[group]` for a buried
 * engine/drivetrain slot, or 0 when no machine gate applies or the machine
 * is already owned. No longer charged per operation - the group's daily
 * hire (`resolveHireMachineLine`) replaced that - kept as the
 * ownership-only signal the amortisation probes and the hire panel's
 * pricing read.
 */
export function machineAssistFeeYen(
  carPartId: CarPartId,
  state: GameState,
  context: SimContext,
): number {
  const group = removeMachineGateGroup(carPartId, context)
  if (!group || ownsMachineForGroup(group, state)) return 0
  return context.economy.machineShopAssist.feeYenByGroup[group]
}

/**
 * The machine-shop fee a group's signature heavy op would cost without
 * owning that group's tier-2 machine, or 0 otherwise - the
 * suspension/body/interior analogue of `machineAssistFeeYen`. No longer
 * charged per operation; kept for the same reasons.
 */
export function signatureOpFeeYen(
  carPartId: CarPartId,
  state: GameState,
  context: SimContext,
): number {
  const group = signatureGroupFor(carPartId, context)
  if (!group || ownsMachineForGroup(group, state)) return 0
  return context.economy.machineShopAssist.feeYenByGroup[group]
}

/**
 * The catalog carPartId an install-part `job` targets, resolved from the
 * part still sitting in `state.partInventory` at this point - shared by the
 * machine-line install gate and the ledger's parts-cost lookup.
 */
function installTargetCarPartId(state: GameState, job: Job, context: SimContext): CarPartId | null {
  const partId = state.partInventory.find((p) => p.id === job.partInstanceId)?.partId
  const carPartId = partId ? context.partsById[partId]?.carPartId : undefined
  return carPartId ?? null
}

export type HireMachineLineGateReason = 'no-cash'

/**
 * Whether hiring `group`'s line for today is blocked right now - `null` when
 * it is not. Owning the group's tier-2 machine, a zero fee, or a group
 * already hired today is never blocked; the only real reason is short cash
 * for a fee that is both nonzero and unpaid. Modelled on
 * `attendAuctionGateReason` (bidding.ts).
 */
export function hireMachineLineGateReason(
  state: GameState,
  group: ComponentId,
  context: SimContext,
): HireMachineLineGateReason | null {
  if (ownsMachineForGroup(group, state)) return null
  const feeYen = context.economy.machineShopAssist.feeYenByGroup[group]
  if (feeYen <= 0) return null
  if (machineHiredToday(group, state)) return null
  return state.cashYen < feeYen ? 'no-cash' : null
}

export interface HireMachineLineResult {
  state: GameState
  log: DayLogEntry[]
  outcome: 'hired' | HireMachineLineGateReason
}

/**
 * The daily-unlock seam: charges `group`'s hire fee the first time that
 * line is needed on a given day, unlocking every operation on it (signature
 * repair, buried removal, buried/signature install) until End Day. Owning
 * the tier-2 machine, or a group already hired today, is a silent no-op - no
 * charge, no state recorded - so a second hire the same day never charges
 * twice. Short cash refuses via `hireMachineLineGateReason`. The spend is a
 * running cost, posted to the day report exactly as rent is (never to a
 * car's ledger) - modelled on `resolveAttendAuction` (bidding.ts).
 */
export function resolveHireMachineLine(
  state: GameState,
  group: ComponentId,
  context: SimContext,
): HireMachineLineResult {
  if (ownsMachineForGroup(group, state)) return { state, log: [], outcome: 'hired' }
  const feeYen = context.economy.machineShopAssist.feeYenByGroup[group]
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
  return { state: nextState, log, outcome: 'hired' }
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
 * Removal has three refusal cases, all silent no-ops - `removeBlockReason`
 * below is the single predicate the UI queries to explain them. Shell parts
 * (`removable: false`) never come off. Blocked slots (occupied by a part that
 * must stay installed until reassembled) refuse while the blocker is still
 * occupied. Buried engine/drivetrain slots need the tier-2 machine owned or
 * hired for the day (`hasMachineLineFor`) - a removal that needs a line
 * neither owned nor hired today refuses rather than charging a fee.
 *
 * Removal labour reads `energy.actionPoints.removePart` (0 in shipped
 * content, so removal is free today); a figure above zero gates on
 * `laborAvailable` and spends into `energySpentToday`. Access is gated
 * separately (the machine/blocker checks above). The removed instance's own
 * `{partId, band, genuinePeriod}` is stamped onto the resulting slot as
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
  const laborSlotsUsed = removeLaborSlotsFor(carPartId, context)
  if (laborSlotsUsed > laborAvailable) return { state, log: [], laborSlotsUsed: 0 }

  // Buried engine/drivetrain removal needs that group's machine line - owned
  // outright, or hired for today (`resolveHireMachineLine`).
  const machineGroup = removeMachineGateGroup(carPartId, context)
  if (machineGroup && !hasMachineLineFor(machineGroup, state)) {
    return { state, log: [], laborSlotsUsed: 0 }
  }

  // Removal empties the slot and stamps the removed instance's identity as
  // `vacatedBaseline` - a matching refit later is free logistics, anything
  // else is charged (`refitLaborSlotsFor`). No stock backfill: installed part
  // and baseline never coexist on one slot.
  const vacatedBaseline = {
    partId: installed.partId,
    band: installed.band,
    genuinePeriod: installed.genuinePeriod,
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
    // An owned car: the removed part is ours, kept as-is. Uninstall reveals
    // truth diagnoses at no extra cost.
    const { car: revealedCar, revealedCauseId } = revealOnRemoval(updatedCar, carPartId, context)
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
  | { kind: 'not-removable' }
  | { kind: 'blocked-by'; blockedBy: CarPartId[] }
  | { kind: 'machine-line'; group: ComponentId }

/**
 * The pure "why can't this come off" predicate - what the UI queries
 * proactively (mirrors `naToTurboConversionBlocked`'s own reuse shape),
 * independent of today's remaining labour (a separate, dynamic
 * concern the UI already shows via the labor bar). `null` when nothing
 * structural blocks it (it may still be refused for insufficient labor, or
 * simply already removed).
 *
 * A buried engine/drivetrain slot without the tier-2 machine owned or hired
 * for today is blocked here (`machine-line`) - hire the line, or buy the
 * tools.
 */
export function removeBlockReason(
  car: CarInstance,
  carPartId: CarPartId,
  state: GameState,
  context: SimContext,
): RemoveBlockReason | null {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry || !entry.removable) return { kind: 'not-removable' }
  const blockedBy = occupiedBlockers(car, carPartId, context)
  if (blockedBy.length > 0) return { kind: 'blocked-by', blockedBy }
  const machineGroup = removeMachineGateGroup(carPartId, context)
  if (machineGroup && !hasMachineLineFor(machineGroup, state)) {
    return { kind: 'machine-line', group: machineGroup }
  }
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
 * in-inventory recondition (`resolveReconditionLabor`) - charges the
 * already-priced repair work against cash, or refuses silently when
 * unaffordable. One repair economy: both paths deduct the same banded-repair
 * `costYen`. No per-job flat consumables fee - bill truth is structural:
 * this IS the number `carCostToMintYen`/`planGroupRepair` already show.
 */
function chargeRepairWork(
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
 * interior signature slot, which needs its group's machine line owned or
 * hired for today.
 *
 * Repair-zone charges the real yen cost of the work from `planGroupRepair`'s
 * `costYen`, nothing else. A group with nothing left to repair (all parts at
 * or above target, or scrap) refuses quietly. `install-part` is a no-op here
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
  // Per-part repairs on buried slots are bench-only - refuse explicitly so
  // the UI has a real reason to show, rather than silently falling through.
  if (spec.carPartId && context.partsTaxonomyById[spec.carPartId]?.depthClass !== 'surface') {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason: 'bench-only' }],
    }
  }
  // `panels`/`paint`/`underbody` are derived from zone state on a car that's
  // on the zone model - a per-part repair addressed at exactly one of them
  // refuses outright (`bodyPipeline.ts`'s single-writer projection is the
  // only thing allowed to move their band); the zone's own pipeline stages
  // are how a player actually improves them.
  if (spec.carPartId && car.zoneState && isBodyDerivedPart(spec.carPartId)) {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason: 'derived-band' }],
    }
  }
  // A REPAIR climbs a part only to the group's tool-tier ceiling
  // (`economy.repairBandCeilingByTier`) - tier-1 caps at fine; mint needs the
  // group's tier-2 machine owned. Jobs targeting bands above the ceiling are
  // refused with a `tool-tier` reason (the UI already renders this) rather
  // than silently clamped. Mint is still reachable at any tier via BUYING a
  // mint replacement and fitting it (install, never gated); owning tier-2
  // only lets you REPAIR the existing part to mint (cheaper).
  const repairCeiling = repairCeilingForLevel(
    repairLevelForGroup(state.toolTiers, spec.componentId),
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
    state.toolTiers,
    context.partIdsByGroup,
    context.partsById,
    context.partsTaxonomyById,
    context.economy.restoration.repairStepFraction,
    context.economy.energy.energyPerBandStepByToolTier,
    spec.carPartId,
    { staff: state.staff, economy: context.economy },
  )
  if (plan.partIds.length === 0) {
    // Nothing repairable is below the target band right now (all mint
    // already, or every part in the group is scrap) - a silent no-op.
    return { ok: false, log: [] }
  }

  // A repair that climbs a suspension/body/interior signature slot needs
  // that group's machine line - owned outright, or hired for today
  // (`resolveHireMachineLine`). Engine/drivetrain/wheels have no signature
  // slots, so their repairs are never gated here.
  const needsMachineLine = plan.partIds.some(
    (partId) => signatureGroupFor(partId, context) !== null,
  )
  if (needsMachineLine && !hasMachineLineFor(spec.componentId, state)) {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: jobIdFor(spec), reason: 'machine-line' }],
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

/**
 * The one own-car capability ceiling (progression bible's bolt-on vs built
 * line). Converting a factory-NA car to forced induction - fitting the FIRST
 * turbo/supercharger into a legitimately-empty slot - is fabrication work,
 * gated behind `economy.toolCeilings.naToTurboConversionEngineTier`. A car
 * that already carries forced induction (factory or from a previous
 * conversion) swaps freely at any tier; only the first conversion is gated.
 * Exported so the UI can pre-empt the same refusal `installFitGate` below
 * enforces, one source of truth for both.
 */
export function naToTurboConversionBlocked(
  carPartId: CarPartId,
  model: CarModel,
  state: GameState,
  context: SimContext,
): boolean {
  if (carPartId !== 'forcedInduction' || hasForcedInduction(model)) return false
  return state.toolTiers.engine < context.economy.toolCeilings.naToTurboConversionEngineTier
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
 * used to check the wrong slot.
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
  const slotEmpty = !!part && !car?.parts[part.carPartId]?.installed
  const fits =
    car &&
    model &&
    part &&
    partInstance &&
    partInstance.band !== 'scrap' &&
    slotEmpty &&
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
  // model and part are both guaranteed defined here (part of the `fits`
  // conjunction above) - TS doesn't narrow through the boolean variable.
  if (naToTurboConversionBlocked(part!.carPartId, model!, state, context)) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'tool-tier' }] }
  }
  // Install requires every `blockedBy` slot for the TARGET address empty,
  // exactly like uninstall (`resolveRemovePart`) - reassembly order matters
  // (e.g. the clutch can't go back in before the gearbox is on).
  if (occupiedBlockers(car!, part!.carPartId, context).length > 0) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'blocked-by' }] }
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

  const job = createJob(spec, id)
  const totalCostYen = state.cashYen - gate.state.cashYen || undefined
  return {
    state: { ...gate.state, jobs: [...gate.state.jobs, job] },
    job,
    log: [
      {
        type: 'job-created',
        jobId: job.id,
        carInstanceId: job.carInstanceId,
        kind: job.kind,
        ...(totalCostYen ? { costYen: totalCostYen } : {}),
      },
    ],
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
  // A `recondition-part` job works a loose inventory part on the bench, not a
  // car - the in-service-bay requirement is a car-only constraint, so it's
  // skipped for reconditions (which have no car). Every other step below - the
  // daily labour budget, the completion path - is identical; one repair economy.
  if (job.kind !== 'recondition-part' && !state.serviceBayCarIds.includes(job.carInstanceId)) {
    return {
      state,
      log: [{ type: 'job-blocked', jobId: job.id, reason: 'not-in-service-bay' }],
      laborSlotsUsed: 0,
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
      if (updatedJob.kind === 'recondition-part') {
        // A loose-part recondition has no car to report against, so it logs
        // `part-reconditioned` rather than the car-oriented `job-completed`.
        log.push({
          type: 'part-reconditioned',
          partInstanceId: updatedJob.partInstanceId!,
          band: updatedJob.targetBand!,
        })
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

// --- in-inventory reconditioning ---

/** A recondition job's stable id - one open recondition per loose part at a
 * time (a repeat click continues the same job rather than duplicating it),
 * mirroring `jobIdFor`'s deterministic-id contract for car jobs. */
function reconditionJobIdFor(partInstanceId: string): string {
  return `recondition-${partInstanceId}`
}

/**
 * A loose `PartInstance` the player can bench-work right now - the parts bin
 * OR every member sitting in an open assembly container (`state.assemblyInventory`).
 * A benched member reconditions through the EXACT same path a bin part does
 * (`planReconditionPart` / `completeReconditionJob` both resolve via here);
 * no separate bench economy. Returns `undefined` when the id is nowhere loose
 * (installed on a car, sold, or never existed).
 */
export function findLoosePart(state: GameState, partInstanceId: string): PartInstance | undefined {
  const inBin = state.partInventory.find((p) => p.id === partInstanceId)
  if (inBin) return inBin
  for (const container of state.assemblyInventory ?? []) {
    for (const member of Object.values(container.members)) {
      if (member && member.id === partInstanceId) return member
    }
  }
  return undefined
}

/**
 * Applies `fn` to whichever loose location holds `partInstanceId` - the parts
 * bin or an open assembly container's member slot - leaving every other part
 * untouched. A no-op (same state reference) when the id is nowhere loose.
 * The bin/container split of `findLoosePart` above, on the write side.
 */
function updateLoosePart(
  state: GameState,
  partInstanceId: string,
  fn: (instance: PartInstance) => PartInstance,
): GameState {
  const binIndex = state.partInventory.findIndex((p) => p.id === partInstanceId)
  if (binIndex !== -1) {
    const partInventory = [...state.partInventory]
    partInventory[binIndex] = fn(partInventory[binIndex]!)
    return { ...state, partInventory }
  }
  const containers = state.assemblyInventory ?? []
  let changed = false
  const assemblyInventory = containers.map((container) => {
    const members = { ...container.members }
    let memberChanged = false
    for (const [slot, member] of Object.entries(members) as [CarPartId, PartInstance | null][]) {
      if (member && member.id === partInstanceId) {
        members[slot] = fn(member)
        memberChanged = true
      }
    }
    if (!memberChanged) return container
    changed = true
    return { ...container, members }
  })
  return changed ? { ...state, assemblyInventory } : state
}

interface ReconditionPlan {
  group: ComponentId
  plan: PartRepairPlan
  /** The effective target after tier ceiling clamp - the band the bench
   * recondition will actually reach and the band the created job must carry,
   * so completion never climbs the part past what the plan priced and labored. */
  targetBand: ConditionBand
}

/**
 * Everything the recondition gate/labour needs for a loose inventory part, or
 * null when it can't be reconditioned (not in inventory, no catalog/taxonomy
 * entry, scrap, non-repairable, or already at/above the target). Reuses the
 * on-car repair atoms exactly - `repairLevelForGroup` for the tool-tier repair
 * level and `planPartRepair` (bands.ts) for the cost + labour, priced off the
 * same `catalogPart.priceYen` an on-car repair of the identical instance would
 * use - so a loose part and the same part installed on a car price and size
 * identically. A part's repair price is intrinsic to the part, never to
 * whether or which car it's bolted to. There is no separate bench formula.
 */
function planReconditionPart(
  state: GameState,
  partInstanceId: string,
  targetBand: ConditionBand,
  context: SimContext,
): ReconditionPlan | null {
  const instance = findLoosePart(state, partInstanceId)
  if (!instance) return null
  const catalogPart = context.partsById[instance.partId]
  const taxonomyEntry = catalogPart ? context.partsTaxonomyById[catalogPart.carPartId] : undefined
  const group = taxonomyEntry?.group
  if (!catalogPart || !taxonomyEntry || !group) return null
  const repairLevel = repairLevelForGroup(state.toolTiers, group)
  // A bench recondition climbs only to the group's tool-tier ceiling. A
  // "sweep to a band" clamps rather than refuses - a tier-1 recondition of a
  // worn part toward mint repairs it as far as it can (to fine) and the
  // created job carries that clamped band, so mint by REPAIR needs the tier-2
  // machine while mint by BUYING a replacement part stays available at any tier.
  const effectiveTarget = clampRepairTarget(
    targetBand,
    repairCeilingForLevel(repairLevel, context.economy),
  )
  const plan = planPartRepair(
    instance.band,
    effectiveTarget,
    repairLevel,
    taxonomyEntry,
    catalogPart.priceYen,
    context.economy.restoration.repairStepFraction,
    context.economy.energy.energyPerBandStepByToolTier,
  )
  // Zero when scrap, non-repairable, nothing left to climb, or already at/above
  // the tier ceiling (a tier-1 recondition of an already-fine part toward mint).
  if (plan.laborSlotsRequired === 0) return null
  // Bench recondition shares the one repair economy: crew speed discounts and
  // perfectionist parts discounts apply here exactly as they do to on-car repairs.
  const adjusted: PartRepairPlan = {
    laborSlotsRequired:
      plan.laborSlotsRequired -
      crewEnergySaved(plan.laborSlotsRequired, group, state.staff, context.economy),
    costYen: Math.round(plan.costYen * perfectionistCostMultiplier(state.staff, context.economy)),
  }
  return { group, plan: adjusted, targetBand: effectiveTarget }
}

export interface ReconditionQuote {
  /** Yen the work costs (the banded-repair `costYen`) - the same figure
   * `chargeRepairWork` deducts, so the UI previews the real charge. */
  costYen: number
  /** Labor slots the recondition takes at the shop's current repair level. */
  laborSlotsRequired: number
}

/**
 * A read-only quote for reconditioning one loose inventory part to
 * `targetBand`, or null when there is nothing to do. Powers the inventory UI's
 * recondition control (cost/labour preview) without mutating; routes through
 * the exact same `planReconditionPart` the resolver does, so the previewed
 * cost/labour is precisely what the player will be charged. The current tool
 * tier affects only labour speed, never cost.
 */
export function reconditionQuote(
  state: GameState,
  partInstanceId: string,
  targetBand: ConditionBand,
  context: SimContext,
): ReconditionQuote | null {
  const planned = planReconditionPart(state, partInstanceId, targetBand, context)
  if (!planned) return null
  return {
    costYen: planned.plan.costYen,
    laborSlotsRequired: planned.plan.laborSlotsRequired,
  }
}

/**
 * The instant player-facing recondition resolver - the loose-part analogue of
 * `resolveJobLabor`. Finds the part's already-open recondition job (repeat
 * click continues it) or creates one through the SAME repair economy as an
 * on-car repair: same banded-repair charge (`chargeRepairWork`), same tool-tier
 * labour (`planPartRepair`). Spends today's remaining labour via the SAME
 * `applyAvailableLaborToJob` the on-car click uses (books the spend into
 * `energySpentToday` and completes by climbing the part's band). One repair
 * economy, targeting a loose part instead of a car slot. Works on ANY
 * inventory part. Bench work is always possible, just slower at tier 1.
 */
export function resolveReconditionLabor(
  state: GameState,
  partInstanceId: string,
  targetBand: ConditionBand,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const jobId = reconditionJobIdFor(partInstanceId)
  const existing = state.jobs.find((j) => j.id === jobId)

  if (existing) {
    return applyAvailableLaborToJob(state, jobId, laborAvailable, context)
  }

  const planned = planReconditionPart(state, partInstanceId, targetBand, context)
  if (!planned) return { state, log: [], laborSlotsUsed: 0 }

  const charged = chargeRepairWork(state, planned.plan.costYen)
  if (!charged.ok) return { state, log: [], laborSlotsUsed: 0 }

  // A bench recondition has no car ledger; the spend lands on the loose
  // PartInstance's own `pricePaidYen` (a reconditioned part "costs" its buy
  // price plus this work), charged at job creation like every other repair.
  // The instance may be a benched assembly member, so this routes through the
  // bin-or-container writer the band climb does.
  const pricedState: GameState = updateLoosePart(charged.state, partInstanceId, (instance) => ({
    ...instance,
    pricePaidYen: (instance.pricePaidYen ?? 0) + charged.totalCostYen,
  }))

  const job: Job = {
    id: jobId,
    // No car - a loose part on the bench. `carInstanceId` (required by schema)
    // holds the part's own id purely for stable non-empty identity; the
    // `recondition-part` kind is what every resolver branches on.
    carInstanceId: partInstanceId,
    kind: 'recondition-part',
    componentId: planned.group,
    partInstanceId,
    // The clamped target the plan actually priced/laboured, so
    // `completeReconditionJob` climbs the loose part to exactly that band.
    targetBand: planned.targetBand,
    laborSlotsRequired: planned.plan.laborSlotsRequired,
    laborSlotsSpent: 0,
  }
  const withJob: GameState = { ...pricedState, jobs: [...pricedState.jobs, job] }
  return applyAvailableLaborToJob(withJob, jobId, laborAvailable, context)
}
