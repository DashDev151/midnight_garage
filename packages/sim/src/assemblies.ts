import type {
  AssemblyContainer,
  AssemblyDef,
  AssemblyId,
  CarInstance,
  CarPartId,
  DayLogEntry,
  GameState,
  PartInstance,
} from '@midnight-garage/content'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { revealOnRemoval } from './diagnosis'
import {
  findWorkableCar,
  refitLaborSlotsFor,
  removeMachineGateGroup,
  type MachineGateGroup,
} from './jobs'
import { updateServiceJobLedger } from './serviceJobLedger'

/**
 * Sprint 87 (the assembly model). An assembly is a BATCH over the per-slot
 * machinery, never a second labour model: remove pulls every member slot at
 * once (each stamping its own `vacatedBaseline`, Sprint 79), refit charges each
 * member by the same `refitLaborSlotsFor` equivalence rule a single part uses,
 * and the external blockers / machine gate are DERIVED from the members here,
 * not stored in content. `blockedBy` edges internal to an assembly (e.g. tyres
 * behind rims, clutch behind gearbox) stop mattering once it is on the bench -
 * that is the whole point of a bench.
 */

/** The uniform result of every atomic assembly operation - `ok` distinguishes
 * a real op from a refusal even when it cost 0 labour and emitted no log (a
 * free equivalence refit), which a bare log-length check could not. */
export interface AssemblyOpResult {
  state: GameState
  log: DayLogEntry[]
  /** Labour actually spent - 0 on a refusal, and also 0 on a free removal or
   * an all-equivalence refit (mirrors `RemovePartResult.laborSlotsUsed`). */
  laborSlotsUsed: number
  ok: boolean
}

export function assemblyDefById(
  assemblyId: AssemblyId,
  context: SimContext,
): AssemblyDef | undefined {
  return context.assembliesById[assemblyId]
}

/**
 * The blockers that point OUTSIDE the assembly - the union of every member's
 * `blockedBy` slots that are not themselves members. These are the slots that
 * must be vacant on the car before the assembly can come off or go back on
 * (the internal edges no longer matter once it is on the bench). For
 * `engineAssembly` this is `{intake, exhaust, cooling}`; for `gearboxAssembly`
 * `{driveline, exhaust}`; for `wheelAssembly` it is empty.
 */
export function externalBlockersFor(def: AssemblyDef, context: SimContext): CarPartId[] {
  const memberSet = new Set<CarPartId>(def.members)
  const external = new Set<CarPartId>()
  for (const member of def.members) {
    const entry = context.partsTaxonomyById[member]
    if (!entry) continue
    for (const blocker of entry.blockedBy) {
      if (!memberSet.has(blocker)) external.add(blocker)
    }
  }
  return [...external]
}

/** External blockers still installed on `car` - the assembly can't move while
 * any of these is occupied (the same symmetric rule per-slot ops use, lifted
 * to the assembly). */
function occupiedExternalBlockers(
  car: CarInstance,
  def: AssemblyDef,
  context: SimContext,
): CarPartId[] {
  return externalBlockersFor(def, context).filter((b) => car.parts[b].installed !== null)
}

/**
 * The one machine-shop assist fee an assembly op owes at the current tool
 * tiers - the sum over the DISTINCT machine-gate groups its members belong to
 * (engine crane / transmission bench), each charged once, or 0 when the group
 * is already owned. Since every member of a shipped assembly shares one group,
 * this is one fee: `engineAssembly` owes one engine fee, `gearboxAssembly` one
 * drivetrain fee, `wheelAssembly` none (rims/tyres are not machine-gated).
 * Applies to both remove and refit, so a full round trip costs two fees when
 * renting - the margin the maintainer's rental ruling intends.
 */
export function assemblyMachineAssistFeeYen(
  def: AssemblyDef,
  state: GameState,
  context: SimContext,
): number {
  const groups = new Set<MachineGateGroup>()
  for (const member of def.members) {
    const group = removeMachineGateGroup(member, context)
    if (group) groups.add(group)
  }
  let fee = 0
  for (const group of groups) {
    if (state.toolTiers[group] < 2) fee += context.economy.machineShopAssist.feeYenByGroup[group]
  }
  return fee
}

/**
 * The wheels-group bench fee for a tyre-into-assembly op (Sprint 87 decision
 * 1) - `economy.machineShopAssist.feeYenByGroup.wheels` unless the shop owns
 * the tier-2 tyre machine. Applies ONLY to swapping the `tyres` member; every
 * other member swap is free. Deliberately separate from
 * `machineAssistFeeYen`, which stays engine/drivetrain-only (a coherence probe
 * pins `machineAssistFeeYen('tyres') === 0`).
 */
export function benchSwapFeeYen(
  memberSlot: CarPartId,
  state: GameState,
  context: SimContext,
): number {
  if (memberSlot !== 'tyres') return 0
  return state.toolTiers.wheels >= 2 ? 0 : context.economy.machineShopAssist.feeYenByGroup.wheels
}

/** The deterministic id of the one container a given (car, assembly) can have
 * on the bench at a time - once removed, the car's member slots are empty, so
 * it can't be removed again until refit dissolves this container. */
function containerIdFor(carInstanceId: string, assemblyId: AssemblyId): string {
  return `assembly-${carInstanceId}-${assemblyId}`
}

/** Writes `car` back into whichever population holds it (owned or a customer
 * service job) - the shared bookkeeping `resolveRemovePart` inlines twice. */
function writeCarBack(state: GameState, carInstanceId: string, car: CarInstance): GameState {
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

/** Posts `yen` to `repairYen` on the car's ledger (owned) or its service job's
 * ledger (customer) - the existing repair-cost path, so mission budget caps
 * and service-job billing see assembly fees exactly as they see per-slot ones. */
function addRepairYen(state: GameState, carInstanceId: string, yen: number): GameState {
  if (yen <= 0) return state
  if (state.ownedCars.some((c) => c.id === carInstanceId)) {
    return updateCarLedger(state, carInstanceId, (l) => ({ ...l, repairYen: l.repairYen + yen }))
  }
  const job = state.activeServiceJobs.find((sj) => sj.car.id === carInstanceId)
  return job
    ? updateServiceJobLedger(state, job.id, (l) => ({ ...l, repairYen: l.repairYen + yen }))
    : state
}

/** Posts `yen` to `partsYen`, same owned/customer dispatch as `addRepairYen` -
 * a changed member refitted onto the car lands its paid price on the bill, the
 * way `completeJob`'s install-part branch does. */
function addPartsYen(state: GameState, carInstanceId: string, yen: number): GameState {
  if (yen <= 0) return state
  if (state.ownedCars.some((c) => c.id === carInstanceId)) {
    return updateCarLedger(state, carInstanceId, (l) => ({ ...l, partsYen: l.partsYen + yen }))
  }
  const job = state.activeServiceJobs.find((sj) => sj.car.id === carInstanceId)
  return job
    ? updateServiceJobLedger(state, job.id, (l) => ({ ...l, partsYen: l.partsYen + yen }))
    : state
}

/** True if any of the assembly's member slots has an open job on this car -
 * a part can't be yanked out from under work in progress (mirrors
 * `resolveRemovePart`'s busy check, over every member). */
function anyMemberBusy(
  state: GameState,
  carInstanceId: string,
  def: AssemblyDef,
  context: SimContext,
): boolean {
  return state.jobs.some(
    (j) =>
      j.carInstanceId === carInstanceId &&
      def.members.some((m) =>
        j.carPartId ? j.carPartId === m : j.componentId === context.partsTaxonomyById[m]?.group,
      ),
  )
}

/**
 * Remove an assembly as a unit (car-level, Sprint 87 operation 1). Legal when
 * every external blocker is vacant and no member has an open job; 0 labour
 * (Sprint 79 removal law); the machine gate is satisfied by ownership or the
 * assist fee (posted to the car/job ledger). Each installed member moves into
 * one container in `assemblyInventory`, and each vacated member slot stamps its
 * `vacatedBaseline` exactly as per-slot removal does - so refit later reads
 * those baselines back for the equivalence charge. An already-empty member slot
 * simply carries `null` into the container, its car slot untouched. Refuses
 * (no-op, `ok:false`) with nothing to pull, an occupied external blocker, an
 * open member job, or an existing container for this (car, assembly).
 */
export function resolveRemoveAssembly(
  state: GameState,
  carInstanceId: string,
  assemblyId: AssemblyId,
  context: SimContext,
  laborAvailable: number = Infinity,
): AssemblyOpResult {
  const fail: AssemblyOpResult = { state, log: [], laborSlotsUsed: 0, ok: false }
  const def = assemblyDefById(assemblyId, context)
  if (!def) return fail
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return fail
  const containerId = containerIdFor(carInstanceId, assemblyId)
  if ((state.assemblyInventory ?? []).some((c) => c.id === containerId)) return fail
  if (!def.members.some((m) => car.parts[m].installed !== null)) return fail // nothing to pull
  if (anyMemberBusy(state, carInstanceId, def, context)) return fail
  if (occupiedExternalBlockers(car, def, context).length > 0) return fail

  // Sprint 79: removal is always free labour; the gate below (content law)
  // cannot fire while every class costs 0, but stays for a future re-tune.
  const laborSlotsUsed = 0
  if (laborSlotsUsed > laborAvailable) return fail

  const assistFeeYen = assemblyMachineAssistFeeYen(def, state, context)
  const isOwned = state.ownedCars.some((c) => c.id === carInstanceId)
  const members: AssemblyContainer['members'] = {}
  const log: DayLogEntry[] = []
  let updatedCar: CarInstance = car
  for (const member of def.members) {
    const installed = updatedCar.parts[member].installed
    if (!installed) {
      members[member] = null
      continue
    }
    members[member] = installed
    let nextCar: CarInstance = {
      ...updatedCar,
      parts: {
        ...updatedCar.parts,
        [member]: {
          installed: null,
          vacatedBaseline: {
            partId: installed.partId,
            band: installed.band,
            genuinePeriod: installed.genuinePeriod,
          },
        },
      },
    }
    // Sprint 74: uninstall reveals truth (free) - owned cars only, exactly as
    // per-slot removal does. A customer's car never carries symptoms.
    let revealedCauseId: string | undefined
    if (isOwned) {
      const revealed = revealOnRemoval(nextCar, member, context)
      nextCar = revealed.car
      revealedCauseId = revealed.revealedCauseId ?? undefined
    }
    updatedCar = nextCar
    log.push({
      type: 'part-removed',
      carInstanceId,
      carPartId: member,
      partInstanceId: installed.id,
      ...(revealedCauseId ? { revealedCauseId } : {}),
    })
  }

  const container: AssemblyContainer = {
    id: containerId,
    assemblyId,
    members,
    sourceCarId: carInstanceId,
  }
  const withCar = writeCarBack(state, carInstanceId, updatedCar)
  const next: GameState = {
    ...withCar,
    assemblyInventory: [...(withCar.assemblyInventory ?? []), container],
    energySpentToday: withCar.energySpentToday + laborSlotsUsed,
    cashYen: withCar.cashYen - assistFeeYen,
  }
  return { state: addRepairYen(next, carInstanceId, assistFeeYen), log, laborSlotsUsed, ok: true }
}

/**
 * Refit an assembly as a unit (car-level, Sprint 87 operation 3). 0 labour for
 * the operation itself PLUS per-member charging: a member equal to the slot's
 * `vacatedBaseline` refits free (`refitLaborSlotsFor` returns 0), a changed
 * member charges its normal install labour (`installLaborSlotsFor`, reading
 * `economy.energy.energyByClass`). The machine gate applies as
 * on removal (so a full round trip is two fees when renting). Each changed
 * member's `pricePaidYen` lands on the bill. The container dissolves back into
 * the car's slots. `overrideCarId` refits a bench-BUILT assembly (no
 * `sourceCarId`) onto a chosen car - every member is then new to that car, so
 * every member charges install labour, as new-to-car parts do. Refuses if the
 * car is gone, an external blocker is occupied, a target slot is already full,
 * or the total labour exceeds `laborAvailable` (the op is atomic).
 */
export function resolveRefitAssembly(
  state: GameState,
  containerId: string,
  context: SimContext,
  laborAvailable: number = Infinity,
  overrideCarId?: string,
): AssemblyOpResult {
  const fail: AssemblyOpResult = { state, log: [], laborSlotsUsed: 0, ok: false }
  const container = (state.assemblyInventory ?? []).find((c) => c.id === containerId)
  if (!container) return fail
  const def = assemblyDefById(container.assemblyId, context)
  if (!def) return fail
  const carInstanceId = overrideCarId ?? container.sourceCarId
  if (!carInstanceId) return fail
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return fail
  if (occupiedExternalBlockers(car, def, context).length > 0) return fail
  for (const member of def.members) {
    if (car.parts[member].installed !== null) return fail // a target slot is still occupied
  }

  let laborSlotsRequired = 0
  for (const member of def.members) {
    const instance = container.members[member]
    if (!instance) continue
    laborSlotsRequired += refitLaborSlotsFor(car, member, instance, context)
  }
  if (laborSlotsRequired > laborAvailable) return fail

  const assistFeeYen = assemblyMachineAssistFeeYen(def, state, context)
  let parts = { ...car.parts }
  let partsCostYen = 0
  for (const member of def.members) {
    const instance = container.members[member]
    if (!instance) continue
    parts = { ...parts, [member]: { installed: instance } }
    partsCostYen += instance.pricePaidYen ?? 0
  }
  const updatedCar: CarInstance = { ...car, parts }
  const withCar = writeCarBack(state, carInstanceId, updatedCar)
  let next: GameState = {
    ...withCar,
    assemblyInventory: (withCar.assemblyInventory ?? []).filter((c) => c.id !== containerId),
    energySpentToday: withCar.energySpentToday + laborSlotsRequired,
    cashYen: withCar.cashYen - assistFeeYen,
  }
  next = addRepairYen(next, carInstanceId, assistFeeYen)
  next = addPartsYen(next, carInstanceId, partsCostYen)
  return { state: next, log: [], laborSlotsUsed: laborSlotsRequired, ok: true }
}

export interface AssemblyMemberMoveResult {
  state: GameState
  log: DayLogEntry[]
  ok: boolean
}

/**
 * Swap a member of an open assembly on the bench (Sprint 87 operation 2): move
 * `newPartInstanceId` from the parts bin into the member slot, and the displaced
 * member (if any) back to the bin. A tyre-into-assembly op costs the wheels
 * bench fee unless the tier-2 tyre machine is owned (`benchSwapFeeYen`), posted
 * to the source car's ledger. Refuses if the container/part is missing, the
 * part does not address this member slot, or the part is scrap.
 */
export function resolveSwapAssemblyMember(
  state: GameState,
  containerId: string,
  memberSlot: CarPartId,
  newPartInstanceId: string,
  context: SimContext,
): AssemblyMemberMoveResult {
  const fail: AssemblyMemberMoveResult = { state, log: [], ok: false }
  const containers = state.assemblyInventory ?? []
  const containerIndex = containers.findIndex((c) => c.id === containerId)
  if (containerIndex === -1) return fail
  const container = containers[containerIndex]!
  const def = assemblyDefById(container.assemblyId, context)
  if (!def || !def.members.includes(memberSlot)) return fail
  const newPart = state.partInventory.find((p) => p.id === newPartInstanceId)
  if (!newPart || newPart.band === 'scrap') return fail
  const catalogPart = context.partsById[newPart.partId]
  if (!catalogPart || catalogPart.carPartId !== memberSlot) return fail

  const feeYen = benchSwapFeeYen(memberSlot, state, context)
  const displaced = container.members[memberSlot] ?? null
  const nextContainers = [...containers]
  nextContainers[containerIndex] = {
    ...container,
    members: { ...container.members, [memberSlot]: newPart },
  }
  let partInventory = state.partInventory.filter((p) => p.id !== newPartInstanceId)
  if (displaced) partInventory = [...partInventory, displaced]
  let next: GameState = {
    ...state,
    assemblyInventory: nextContainers,
    partInventory,
    cashYen: state.cashYen - feeYen,
  }
  if (container.sourceCarId) next = addRepairYen(next, container.sourceCarId, feeYen)
  return { state: next, log: [], ok: true }
}

/**
 * Pull a mounted member OUT of an open assembly on the bench (playtest
 * 2026-07-19 item 25: dead tyres come off the rims and go in the bin BEFORE
 * fresh ones go on - the swap-only bench forced scrap rubber to stay mounted
 * until its replacement existed). The instance moves to the parts bin and the
 * member slot reads empty; refit already skips empty members, and
 * `resolveSwapAssemblyMember` fits into an empty slot exactly as it displaces
 * a full one. Free and ungated, like every removal (Sprint 79 law - the
 * wheels-group fee is for FITTING a tyre, never for dismounting one).
 * Refuses if the container, member slot, or mounted instance is missing.
 */
export function resolveRemoveAssemblyMember(
  state: GameState,
  containerId: string,
  memberSlot: CarPartId,
): AssemblyMemberMoveResult {
  const fail: AssemblyMemberMoveResult = { state, log: [], ok: false }
  const allContainers = containers(state)
  const containerIndex = allContainers.findIndex((c) => c.id === containerId)
  if (containerIndex === -1) return fail
  const container = allContainers[containerIndex]!
  const mounted = container.members[memberSlot]
  if (!mounted) return fail

  const nextContainers = [...allContainers]
  nextContainers[containerIndex] = {
    ...container,
    members: { ...container.members, [memberSlot]: null },
  }
  return {
    state: {
      ...state,
      assemblyInventory: nextContainers,
      partInventory: [...state.partInventory, mounted],
    },
    log: [],
    ok: true,
  }
}

/**
 * Build an assembly on the bench from loose bin parts (Sprint 87 operation 4) -
 * a container with `sourceCarId: null` holding the named members. Installing it
 * onto a car (`resolveRefitAssembly` with `overrideCarId`) then charges install
 * labour for every member, as new-to-car parts do. Refuses if a named part is
 * missing, scrap, or does not address its member slot.
 */
export function resolveBuildAssembly(
  state: GameState,
  assemblyId: AssemblyId,
  memberInstanceIds: Partial<Record<CarPartId, string>>,
  context: SimContext,
): AssemblyMemberMoveResult {
  const fail: AssemblyMemberMoveResult = { state, log: [], ok: false }
  const def = assemblyDefById(assemblyId, context)
  if (!def) return fail
  const members: AssemblyContainer['members'] = {}
  const takenIds: string[] = []
  for (const member of def.members) {
    const id = memberInstanceIds[member]
    if (!id) {
      members[member] = null
      continue
    }
    const part = state.partInventory.find((p) => p.id === id)
    const catalogPart = part ? context.partsById[part.partId] : undefined
    if (!part || part.band === 'scrap' || !catalogPart || catalogPart.carPartId !== member) {
      return fail
    }
    members[member] = part
    takenIds.push(id)
  }
  if (takenIds.length === 0) return fail // nothing to build from
  const containerId = `assembly-build-${assemblyId}-${[...takenIds].sort().join('_')}`
  if (containers(state).some((c) => c.id === containerId)) return fail
  const partInventory = state.partInventory.filter((p) => !takenIds.includes(p.id))
  const container: AssemblyContainer = { id: containerId, assemblyId, members, sourceCarId: null }
  return {
    state: { ...state, partInventory, assemblyInventory: [...containers(state), container] },
    log: [],
    ok: true,
  }
}

function containers(state: GameState): readonly AssemblyContainer[] {
  return state.assemblyInventory ?? []
}

/**
 * Sprint 87: on a car leaving the shop (sold, or a customer service job handed
 * back), dissolve any of its assemblies still on the bench - every member drops
 * to the parts bin. The existing close-out reconciliation
 * (`partsOriginatingFromCar`) then returns a customer's benched members with
 * their car; an owned car's benched members simply stay the player's. A no-op
 * (same reference) when the car has no benched assembly.
 */
export function dissolveAssembliesForCar(state: GameState, carInstanceId: string): GameState {
  const all = containers(state)
  const staying = all.filter((c) => c.sourceCarId !== carInstanceId)
  if (staying.length === all.length) return state
  const freed: PartInstance[] = []
  for (const container of all) {
    if (container.sourceCarId !== carInstanceId) continue
    for (const member of Object.values(container.members)) {
      if (member) freed.push(member)
    }
  }
  return {
    ...state,
    assemblyInventory: staying,
    partInventory: [...state.partInventory, ...freed],
  }
}

/** The container for a given (car, assembly) currently on the bench, or
 * undefined - the lookup the store/staged callers use to turn an assemblyId
 * into the container id `resolveRefitAssembly` needs. */
export function assemblyContainerFor(
  state: GameState,
  carInstanceId: string,
  assemblyId: AssemblyId,
): AssemblyContainer | undefined {
  return containers(state).find(
    (c) => c.sourceCarId === carInstanceId && c.assemblyId === assemblyId,
  )
}
