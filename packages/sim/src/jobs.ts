import {
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type DayLogEntry,
  type GameState,
  type Job,
  type PartInstance,
  type ServiceJob,
} from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import {
  bandIndex,
  canRepair,
  hasForcedInduction,
  planGroupRepair,
  planPartRepair,
  presentPartIdsInGroup,
  repairLevelForGroup,
  type PartRepairPlan,
} from './bands'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { partFitsCar } from './parts'
import { updateServiceJobLedger } from './serviceJobLedger'

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
   * True if an install-part job was skipped because its target slot was
   * already occupied - the caller logs a job-blocked event rather than
   * silently overwriting the existing part.
   */
  blockedByOccupiedSlot: boolean
}

interface CarEffect {
  car: CarInstance
  partInventory: PartInstance[]
  blockedByOccupiedSlot: boolean
}

/**
 * The pure "apply a completed job to a car" core, shared by owned cars and
 * service-job cars (Sprint 26: rewritten for the group-level "bridge",
 * decision 13 - a job addresses a 6-way group, but its effect lands on the
 * real per-part state).
 *
 * Repair-zone: climbs every non-mint, non-scrap part in the group that's
 * still below `job.targetBand` up to it - exactly the set `planGroupRepair`
 * priced and sized at job creation (decision 5). A part reached scrap or
 * mint between creation and completion is simply skipped now (scrap stays
 * unrepairable; mint has nothing left to climb) rather than erroring - the
 * job was already fully paid for and labored, so there is nothing to refund.
 * A slot that's become empty since creation (e.g. removed mid-job) is also
 * skipped - there is nothing left to climb.
 *
 * Install-part: resolves which CarPartId the picked catalog part actually
 * addresses (`context.partsById[...].carPartId`, decision 13's "only that
 * one part's slot changes") and installs the `PartInstance` as-is, at
 * whatever band it already carries. Sprint 32: this no longer forces the
 * slot to `mint` on install (the old model's slot-level `band` did, as a
 * side effect of every install) - the instance's own band is the single
 * truth now, and a freshly-bought part is already `mint` by construction
 * (`resolveBuyPart`); a previously-removed, still-worn part (decision 7)
 * reinstalling at its real band is the correct, necessary consequence of
 * that, not a bug - forcing mint here would let remove+reinstall repair a
 * part for free.
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
    // Sprint 28: a per-part job (job.carPartId set) climbs only that one
    // part; a group-level job (unset) climbs every eligible part in the
    // group, exactly as before.
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
      car: { ...car, parts },
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
    car: {
      ...car,
      parts: {
        ...car.parts,
        [targetPartId]: { installed: partInstance },
      },
    },
    partInventory: partInventory.filter((_, i) => i !== partIndex),
    blockedByOccupiedSlot: false,
  }
}

/**
 * Sprint 35: a completed `recondition-part` job's effect - climb the loose
 * `PartInstance` in `partInventory` to the job's `targetBand`, exactly the
 * way `applyJobToCar`'s repair-zone branch climbs an installed part (skip
 * scrap, skip anything already at/above the target). No car, no slot; the
 * part's own band is the only state that moves. A part that vanished from
 * inventory since the job was created (sold, installed, reconciled at
 * close-out) is simply a no-op - the job was already paid and labored, so
 * there is nothing to refund, same as `applyJobToCar`'s own mid-job-departure
 * handling.
 */
function completeReconditionJob(state: GameState, job: Job, context: SimContext): GameState {
  const targetBand = job.targetBand
  if (!job.partInstanceId || !targetBand) return state
  let changed = false
  const partInventory = state.partInventory.map((instance) => {
    if (instance.id !== job.partInstanceId) return instance
    const catalogPart = context.partsById[instance.partId]
    const entry = catalogPart ? context.partsTaxonomyById[catalogPart.carPartId] : undefined
    if (
      !entry ||
      !canRepair(instance.band, entry) ||
      bandIndex(instance.band) >= bandIndex(targetBand)
    ) {
      return instance
    }
    changed = true
    return { ...instance, band: targetBand }
  })
  return changed ? { ...state, partInventory } : state
}

/**
 * Applies a completed job's effect (group repair, part install, or - Sprint
 * 35 - an in-inventory recondition) to GameState. For a car job the target
 * may be an owned car OR a customer car sitting in a service job (the player
 * works both with the same job system); a `recondition-part` job targets a
 * loose inventory part instead. Does not remove the job from state.jobs - the
 * caller owns list bookkeeping.
 */
export function completeJob(state: GameState, job: Job, context: SimContext): JobCompletionResult {
  if (job.kind === 'recondition-part') {
    return { state: completeReconditionJob(state, job, context), blockedByOccupiedSlot: false }
  }

  const ownedIndex = state.ownedCars.findIndex((c) => c.id === job.carInstanceId)
  if (ownedIndex !== -1) {
    const effect = applyJobToCar(state.ownedCars[ownedIndex]!, job, state.partInventory, context)
    if (effect.blockedByOccupiedSlot) return { state, blockedByOccupiedSlot: true }
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = effect.car
    let next: GameState = { ...state, ownedCars, partInventory: effect.partInventory }
    if (job.kind === 'install-part') {
      // Sprint 42: the part's own cost lands on the car's ledger the moment
      // it's physically installed (not at purchase - a bought-but-not-yet-
      // installed part sits in inventory, spent but not yet "on" any car).
      const pricePaidYen =
        state.partInventory.find((p) => p.id === job.partInstanceId)?.pricePaidYen ?? 0
      next = updateCarLedger(next, job.carInstanceId, (ledger) => ({
        ...ledger,
        partsYen: ledger.partsYen + pricePaidYen,
      }))
    }
    return { state: next, blockedByOccupiedSlot: false }
  }

  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === job.carInstanceId)
  if (serviceIndex !== -1) {
    const serviceJob = state.activeServiceJobs[serviceIndex]!
    const effect = applyJobToCar(serviceJob.car, job, state.partInventory, context)
    if (effect.blockedByOccupiedSlot) return { state, blockedByOccupiedSlot: true }
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...serviceJob, car: effect.car }
    let next: GameState = { ...state, activeServiceJobs, partInventory: effect.partInventory }
    if (job.kind === 'install-part') {
      // Sprint 57: the same paid-price accounting as the owned-car branch
      // above, at job scope instead of car scope, so the completion report
      // can show what this specific job actually cost, not a catalog price.
      const pricePaidYen =
        state.partInventory.find((p) => p.id === job.partInstanceId)?.pricePaidYen ?? 0
      next = updateServiceJobLedger(next, serviceJob.id, (ledger) => ({
        ...ledger,
        partsYen: ledger.partsYen + pricePaidYen,
      }))
    }
    return { state: next, blockedByOccupiedSlot: false }
  }

  throw new Error(`job ${job.id} references unknown car ${job.carInstanceId}`)
}

export interface RemovePartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Sprint 32 decision 7: pulls whatever occupies `carPartId`'s slot into
 * inventory - free and instant (no labor cost is specified for pulling a
 * part, only for repairing or installing one, so this mirrors
 * `resolveScrapPart`'s own free-instant shape, parts.ts). Removing an
 * aftermarket part (any non-`'stock'` grade) reverts the slot to a fresh
 * mint generic stock `PartInstance` - the factory part underneath, assumed
 * present until it's pulled too - and drops the removed instance to
 * inventory at whatever band it actually carried. Removing a stock part
 * drops that same instance to inventory and leaves the slot genuinely
 * empty (a defect, priced as a full replacement in the restoration bill -
 * `bands.ts`'s `carCostToMintYen`). A no-op when the slot is already empty,
 * the car/part/its taxonomy group can't be resolved, or a Job is currently
 * open on this exact address (component- or part-level) - a part can't be
 * yanked out from under work already in progress.
 *
 * Sprint 35 decision 2 (supersedes Sprint 33 decision 8): a part pulled off a
 * service-job CUSTOMER's car is no longer discarded - it lands in OUR
 * `partInventory` tagged `customerJobId` with that job's id, so it can be
 * tracked and reconditioned (the PC-Building-Sim model) while staying locked
 * from sale/scrap and reconciled out at close-out (`resolveServiceJob`). A
 * part pulled off a car we actually own is kept untagged (player-owned),
 * unchanged from Sprint 32. The slot's own replacement (a fresh stock
 * instance, or genuinely empty for a removed stock part) is identical either
 * way; only the inventory side-effect's tag differs by ownership.
 */
export function resolveRemovePart(
  state: GameState,
  carInstanceId: string,
  carPartId: CarPartId,
  context: SimContext,
): RemovePartResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return { state, log: [] }
  const installed = car.parts[carPartId].installed
  if (!installed) return { state, log: [] }
  const componentId = context.partsTaxonomyById[carPartId]?.group
  if (!componentId) return { state, log: [] }
  const busy = state.jobs.some(
    (j) =>
      j.carInstanceId === carInstanceId &&
      (j.carPartId ? j.carPartId === carPartId : j.componentId === componentId),
  )
  if (busy) return { state, log: [] }

  const model = context.modelsById[car.modelId]
  const fitmentClass = model ? fitmentClassForTier(model.tier) : 'common'
  const removedCatalogPart = context.partsById[installed.partId]
  const isStock = removedCatalogPart?.grade === 'stock'
  const stockCatalogPart = context.stockPartByCarPartId[fitmentClass]?.[carPartId]
  const freshStockInstance: PartInstance | null = stockCatalogPart
    ? {
        id: `part-removed-${state.day}-${state.partInventory.length}`,
        partId: stockCatalogPart.id,
        band: 'mint',
        genuinePeriod: false,
      }
    : null

  const updatedCar: CarInstance = {
    ...car,
    parts: { ...car.parts, [carPartId]: { installed: isStock ? null : freshStockInstance } },
  }
  const log: DayLogEntry[] = [
    { type: 'part-removed', carInstanceId, carPartId, partInstanceId: installed.id },
  ]

  const ownedIndex = state.ownedCars.findIndex((c) => c.id === carInstanceId)
  if (ownedIndex !== -1) {
    // An owned car: the removed part is ours, keep it (unchanged from Sprint 32).
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = updatedCar
    const partInventory = [...state.partInventory, installed]
    return { state: { ...state, ownedCars, partInventory }, log }
  }

  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === carInstanceId)
  if (serviceIndex !== -1) {
    // A customer's car (Sprint 35 decision 2): a pulled part stays in our
    // inventory tagged with the owning job - not ours to sell or scrap, but
    // ours to recondition until the job closes out.
    //
    // Sprint 68 decision 1 (playtest item 17): the tag now depends on whose
    // part it actually IS, not on where the car happens to be parked. Before
    // this, the branch tagged EVERY removed part unconditionally, so a damper
    // the player bought and fitted became the customer's property the instant
    // they pulled it back off - and `resolveServiceJob`'s close-out, which
    // drops every inventory entry carrying the job's id, then confiscated it
    // outright. The player was robbed of their own part for changing their
    // mind.
    const serviceJob = state.activeServiceJobs[serviceIndex]!
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...serviceJob, car: updatedCar }
    const keptPart = isCustomersOwnPart(serviceJob, carPartId, installed)
      ? { ...installed, customerJobId: serviceJob.id }
      : installed
    const partInventory = [...state.partInventory, keptPart]
    return { state: { ...state, activeServiceJobs, partInventory }, log }
  }

  return { state, log: [] }
}

/**
 * Whether `installed` is the part the CUSTOMER arrived with, rather than one
 * the player bought and fitted (Sprint 68 decision 1, playtest item 17).
 *
 * `baselineInstalledPartIds` (Sprint 61, made total over the car in Sprint 68)
 * records the exact `PartInstance.id` in every slot at generation, so this is
 * a direct identity check: the customer's part is the one that was there when
 * the car arrived, and nothing else is.
 *
 * The `?? null` matters. A slot the car arrived with EMPTY has a recorded
 * baseline of `null`, which no real `PartInstance.id` can equal - so a part the
 * player fits into a genuinely empty slot is theirs, decided by the record
 * rather than by the absence of one.
 */
function isCustomersOwnPart(
  job: ServiceJob,
  carPartId: CarPartId,
  installed: PartInstance,
): boolean {
  return installed.id === job.baselineInstalledPartIds[carPartId]
}

/**
 * An open job's stable id - one job per car+component+kind at a time
 * (group-level), or one per car+component+kind+part (Sprint 28 per-part
 * addressing) - the `carPartId` suffix is what lets a per-part job on
 * `intake` and one on `exhaust` (same `engine` group) stay open at once
 * without colliding, and never collides with a group-level job on the same
 * group either. Omitted, this is byte-identical to the pre-Sprint-28 id.
 */
function jobIdFor(spec: NewJobSpec): string {
  const address = spec.carPartId ? `${spec.componentId}-${spec.carPartId}` : spec.componentId
  return `job-${spec.carInstanceId}-${spec.kind}-${address}`
}

export type RepairJobGate = { ok: true; state: GameState } | { ok: false; log: DayLogEntry[] }

/**
 * Sprint 35: the single money step shared by on-car repair (`repairJobGate`
 * below) and in-inventory recondition (`resolveReconditionLabor`) - charges
 * the already-priced repair work against cash, or refuses silently when
 * unaffordable (matching every can't-afford gate in this codebase). ONE
 * repair economy: both paths deduct the exact same banded-repair `costYen`.
 * Sprint 47 decision 1 (maintainer, 2026-07-13: "get rid of the ¥2,000
 * charge"): the per-job flat consumables fee is gone - it was a hidden
 * surcharge the displayed restoration bill never included (the playtest's
 * "bill said 24k, charged 35k" complaint), so bill truth is now structural:
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
 * The repair-cost gate on *starting* a new repair-zone job - checked once,
 * at creation, never again. Sprint 36: there is NO ownership gate anymore
 * (tool lines are always owned - progression bible law 1); the shop's
 * current tool tier only sets the repair level the work climbs at.
 *
 * Sprint 26 decisions 5+7: repair-zone charges the real yen cost of the
 * work - `planGroupRepair`'s `costYen` (grades climbed times each part's
 * own catalog price, summed across every eligible part in the group), and
 * nothing else (Sprint 47 decision 1 removed the old per-job consumables
 * fee). A group with nothing left to repair (every part already at or
 * above the target, or every part scrap) refuses quietly - there is
 * nothing to create a job for. `install-part` is a no-op here (it has never
 * charged anything beyond the part itself, bought separately). Shared by the
 * player's instant `findOrCreateJob` path and advanceDay's bot batch
 * job-creation loop.
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
  const plan = planGroupRepair(
    car,
    spec.componentId,
    spec.targetBand,
    state.toolTiers,
    context.partIdsByGroup,
    context.partsById,
    context.partsTaxonomyById,
    context.economy.restoration.repairStepFraction,
    spec.carPartId,
  )
  if (plan.partIds.length === 0) {
    // Nothing repairable is below the target band right now (all mint
    // already, or every part in the group is scrap) - a silent no-op.
    return { ok: false, log: [] }
  }

  const charged = chargeRepairWork(state, plan.costYen)
  // Can't afford the work right now - a silent refusal, matching every
  // other can't-afford-it gate in this codebase.
  if (!charged.ok) return { ok: false, log: [] }
  // Sprint 42: this same gate also runs a customer's service-job car (the
  // player fronts the repair, gets paid via the job's own payout on
  // handback) - an owned car gets a car ledger entry; a customer's (Sprint
  // 57) gets its job's own ledger entry instead, so the completion report
  // can show what the player actually spent.
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
 * Sprint 37: the one own-car capability ceiling (progression bible's
 * bolt-on vs built line). Converting a factory-NA car to forced induction -
 * fitting the FIRST turbo/supercharger into a legitimately-empty slot
 * (`hasForcedInduction(model) === false`, same Sprint 26 distinction
 * `isPartMissing` uses) - is fabrication work, gated behind
 * `economy.toolCeilings.naToTurboConversionEngineTier`. A car that already
 * carries a forced-induction part, factory-turbo or from a previous
 * conversion, swaps freely at any tier: only the first conversion is gated,
 * never a same-slot replacement. Exported so the UI (`gameStore.ts`'s
 * `stageAction`/`installBlockedReason`) can pre-empt the same refusal
 * `installFitGate` below enforces, one source of truth for both.
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
 * Sprint 24 fix 2: the sim never validated part-component fit on install -
 * only the UI's own inline copy did. A separate, small gate beside
 * `repairJobGate` - exported and called from both `findOrCreateJob` below
 * (the player's instant path) AND `advanceDay`'s bot batch job-creation loop
 * directly.
 *
 * Sprint 26 decision 6: additionally, universally rejects any `PartInstance`
 * whose own band is `scrap` - a scrap part cannot move between cars, only be
 * replaced or scrap-sold (`resolveScrapPart`, parts.ts). Decision 13: fit is
 * now checked against the target GROUP (`spec.componentId`), resolved via
 * the catalog part's own taxonomy group, not a direct componentId match.
 *
 * Sprint 28: when `spec.carPartId` is set (the per-part Replace drawer),
 * additionally requires the catalog part's own address to match that exact
 * slot (`partFitsCar`'s new optional param).
 *
 * Sprint 32: `slotEmpty` now always resolves from the picked part's OWN
 * catalog address (`part.carPartId`), not just when `spec.carPartId` is
 * explicitly set - closing a real gap the Sprint 28 comment above used to
 * describe as "pre-existing": a group-level spec's `slotEmpty` used to be
 * unconditionally `true` (no per-part check at all), which barely mattered
 * when almost every slot started genuinely empty pre-Sprint-32, but now
 * that every slot starts filled with a stock part by default, a group-level
 * install into an already-occupied specific slot would otherwise pass this
 * gate, create a real job, and only fail silently at completion
 * (`blockedByOccupiedSlot`) - stranding that job open forever (nothing ever
 * removes a blocked job from `state.jobs`). Checking the resolved slot here
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
  // A customer-owned tagged part (Sprint 35 decision 2) is only ever ours to
  // recondition and reinstall onto the SAME customer's car it was pulled
  // from - never sold, scrapped, or (the gap this closes) installed onto a
  // different car, including the player's own. `partInstance` is guaranteed
  // defined here (part of the `fits` conjunction above).
  if (partInstance!.customerJobId) {
    const owningCarId = state.activeServiceJobs.find(
      (job) => job.id === partInstance!.customerJobId,
    )?.car.id
    if (owningCarId !== spec.carInstanceId) {
      return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'not-your-part' }] }
    }
  }
  // model and part are both guaranteed defined here (part of the `fits`
  // conjunction above) - TS doesn't narrow through the boolean variable.
  if (naToTurboConversionBlocked(part!.carPartId, model!, state, context)) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'tool-tier' }] }
  }
  return { ok: true }
}

/**
 * Finds the car's already-open job matching this spec's kind+component, or
 * creates one (Sprint 11). A car can only have one open job per component at
 * a time, so a repeat click on the same repair/install just continues the
 * existing job rather than creating a duplicate - the id is derived
 * deterministically from car+kind+componentId instead of a day/index
 * counter, so "the same job" is recognizable across days without extra
 * bookkeeping. Sprint 13: a *new* repair-zone job additionally passes
 * `repairJobGate` (repair cost affordable) before it's created - `job`
 * comes back `null` when the gate refuses, since
 * nothing was created to return. Sprint 24: a *new* install-part job
 * likewise passes `installFitGate` (fix 2).
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
 * Applies up to `laborAvailable` labor to one job (by id), completing it
 * immediately if that's enough - the single-job core shared by the player's
 * instant repair/install click and advanceDay's bot batch loop (Sprint 11).
 * Bumps `laborSlotsSpentToday` by exactly what was used, so the caller never
 * has to track the daily budget separately from the state transition itself.
 */
export function applyAvailableLaborToJob(
  state: GameState,
  jobId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const job = state.jobs.find((j) => j.id === jobId)
  if (!job || isJobComplete(job) || laborAvailable <= 0) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  // Sprint 35: a `recondition-part` job works a loose inventory part on the
  // bench, not a car - the in-service-bay requirement is a car-only
  // constraint, so it's skipped for reconditions (which have no car). Every
  // other step below - the daily labor budget, the completion path - is
  // identical, the ONE repair economy.
  if (job.kind !== 'recondition-part' && !state.serviceBayCarIds.includes(job.carInstanceId)) {
    return {
      state,
      log: [{ type: 'job-blocked', jobId: job.id, reason: 'not-in-service-bay' }],
      laborSlotsUsed: 0,
    }
  }

  const need = job.laborSlotsRequired - job.laborSlotsSpent
  const slotsToApply = Math.min(laborAvailable, need)
  if (slotsToApply <= 0) return { state, log: [], laborSlotsUsed: 0 }

  const updatedJob = applyLaborToJob(job, slotsToApply)
  let next: GameState = {
    ...state,
    jobs: state.jobs.map((j) => (j.id === jobId ? updatedJob : j)),
    laborSlotsSpentToday: state.laborSlotsSpentToday + slotsToApply,
  }
  const log: DayLogEntry[] = [{ type: 'job-progress', jobId, laborSlotsSpent: slotsToApply }]

  if (isJobComplete(updatedJob)) {
    const result = completeJob(next, updatedJob, context)
    next = result.state
    if (result.blockedByOccupiedSlot) {
      log.push({ type: 'job-blocked', jobId, reason: 'slot-occupied' })
    } else {
      next = { ...next, jobs: next.jobs.filter((j) => j.id !== jobId) }
      if (updatedJob.kind === 'recondition-part') {
        // Sprint 35: a loose-part recondition has no car to report against, so
        // it logs the bench-repair completion (`part-reconditioned`) rather
        // than the car-oriented `job-completed`.
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
 * The instant player-facing resolver (Sprint 11): find-or-create the job for
 * this car+zone/slot, then apply as much of today's remaining labor as it
 * needs. Composes `findOrCreateJob` + `applyAvailableLaborToJob` - the same
 * two primitives advanceDay's bot batch loop uses, just for a single click
 * instead of a whole day's queue. Sprint 13: `findOrCreateJob` can now refuse
 * to create a repair-zone job at all (no equipment / can't afford it) -
 * `job` comes back `null` in that case, and there's nothing left to apply
 * labor to.
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

// --- in-inventory reconditioning (Sprint 35) ----------------------------

/** A recondition job's stable id - one open recondition per loose part at a
 * time (a repeat click continues the same job rather than duplicating it),
 * mirroring `jobIdFor`'s deterministic-id contract for car jobs. */
function reconditionJobIdFor(partInstanceId: string): string {
  return `recondition-${partInstanceId}`
}

interface ReconditionPlan {
  group: ComponentId
  plan: PartRepairPlan
}

/**
 * Everything the recondition gate/labor needs for a loose inventory part, or
 * null when it can't be reconditioned (not in inventory, no catalog/taxonomy
 * entry, scrap, non-repairable, or already at/above the target). Reuses the
 * on-car repair atoms EXACTLY - `repairLevelForGroup` for the tool-tier
 * repair level and `planPartRepair` (bands.ts) for the cost + labor, priced
 * off the SAME `catalogPart.priceYen` an on-car repair of the identical
 * instance would use - so a loose part and the same part installed on a car
 * price and size identically (Sprint 44: the bench/on-car asymmetry Sprint 41
 * introduced is gone - a part's repair price is intrinsic to the part, never
 * to whether or which car it's bolted to). This is the reuse the sprint
 * exists to enforce: there is no separate bench formula.
 */
function planReconditionPart(
  state: GameState,
  partInstanceId: string,
  targetBand: ConditionBand,
  context: SimContext,
): ReconditionPlan | null {
  const instance = state.partInventory.find((p) => p.id === partInstanceId)
  if (!instance) return null
  const catalogPart = context.partsById[instance.partId]
  const taxonomyEntry = catalogPart ? context.partsTaxonomyById[catalogPart.carPartId] : undefined
  const group = taxonomyEntry?.group
  if (!catalogPart || !taxonomyEntry || !group) return null
  const repairLevel = repairLevelForGroup(state.toolTiers, group)
  const plan = planPartRepair(
    instance.band,
    targetBand,
    repairLevel,
    taxonomyEntry,
    catalogPart.priceYen,
    context.economy.restoration.repairStepFraction,
  )
  if (plan.laborSlotsRequired === 0) return null // scrap, non-repairable, or nothing to climb
  return { group, plan }
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
 * `targetBand`, or null when there is nothing to do (not repairable, or
 * already at/above the target). Powers the inventory UI's recondition control
 * (cost/labor preview) without mutating anything - it routes through the
 * exact same `planReconditionPart` the resolver does, so the previewed
 * cost/labor is precisely what the player will be charged. Sprint 36: no
 * tooling gate anymore - the current tool tier only sets speed. Sprint 47:
 * no consumables charge either (decision 1) - the current tool tier affects
 * only labor speed now, never cost.
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
 * The instant player-facing recondition resolver (Sprint 35) - the loose-part
 * analogue of `resolveJobLabor`. Finds the part's already-open recondition
 * job (a repeat click continues it) or creates one through the SAME repair
 * economy as an on-car repair: the same banded-repair charge
 * (`chargeRepairWork`), the same tool-tier-sized labor (`planPartRepair`).
 * Then it spends today's remaining labor via the SAME
 * `applyAvailableLaborToJob` the on-car click uses (which books the spend
 * into `laborSlotsSpentToday` identically and completes by climbing the
 * part's band). There is no second bench cost, no second labor pool - one
 * repair economy, targeting a loose part instead of a car slot. Works on ANY
 * inventory part, not only customer-owned ones. Sprint 36: no tooling gate -
 * bench work is always possible, just slower at tier 1.
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

  // Sprint 42: a bench recondition has no car ledger to charge - the spend
  // lands on the loose PartInstance's own `pricePaidYen` instead (a
  // reconditioned part "cost" its buy price plus this work), charged at job
  // creation, matching every other repair charge's timing.
  const partInventory = charged.state.partInventory.map((instance) =>
    instance.id === partInstanceId
      ? { ...instance, pricePaidYen: (instance.pricePaidYen ?? 0) + charged.totalCostYen }
      : instance,
  )
  const pricedState: GameState = { ...charged.state, partInventory }

  const job: Job = {
    id: jobId,
    // No car - a loose part on the bench. `carInstanceId` (required by the
    // schema) holds the part's own id purely so the field is a stable
    // non-empty identity; the `recondition-part` kind is what every resolver
    // branches on, never this value (it never resolves against a car or bay).
    carInstanceId: partInstanceId,
    kind: 'recondition-part',
    componentId: planned.group,
    partInstanceId,
    targetBand,
    laborSlotsRequired: planned.plan.laborSlotsRequired,
    laborSlotsSpent: 0,
  }
  const withJob: GameState = { ...pricedState, jobs: [...pricedState.jobs, job] }
  return applyAvailableLaborToJob(withJob, jobId, laborAvailable, context)
}
