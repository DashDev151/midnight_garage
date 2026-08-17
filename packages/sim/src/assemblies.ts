import type {
  AssemblyContainer,
  AssemblyDef,
  AssemblyId,
  CarInstance,
  CarPartId,
  ComponentId,
  DayLogEntry,
  GameState,
  Part,
  PartInstance,
} from '@midnight-garage/content'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { verifyAndResolve, verifyManyAndResolve } from './diagnosis'
import {
  findWorkableCar,
  machineGateGroupFor,
  machineLaborMultiplier,
  partCapabilityRequirement,
  removeLaborSlotsFor,
  requiredEmptySlotsBehind,
  writeCarBack,
} from './jobs'
import { partFitsCar, reconcileStations } from './parts'
import { updateServiceJobLedger } from './serviceJobLedger'

/**
 * An assembly is a batch over the per-slot machinery, never a second labour
 * model: remove pulls every member slot at once (each stamping its own
 * `vacatedBaseline`), refit charges one flat set figure for the whole unit
 * however many members changed (`refitAssemblyLaborSlotsFor`), and the
 * external blockers / machine gate are derived from the members here, not
 * stored in content. `blockedBy` edges internal to an assembly (e.g. tyres
 * behind rims, clutch behind gearbox) stop mattering once it is on the bench
 * - that is the whole point of a bench - except for what the assembly's
 * refit would seal shut BEHIND it on the car (`requiredEmptySlotsBehind`),
 * which is external to the assembly by definition and still checked.
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
 * Economy-bible law 3, lifted to assembly level: `catalogPart` may only
 * occupy `memberSlot` on `car` if its fitment class matches the car's and it
 * carries every tag the car requires - the same test `partFitsCar` runs for
 * the on-car install path, so a wrong-class part is refused at the bench
 * exactly as it is refused on the car.
 */
function memberFitsCar(
  catalogPart: Part,
  car: CarInstance,
  memberSlot: CarPartId,
  context: SimContext,
): boolean {
  const model = context.modelsById[car.modelId]
  const group = context.partsTaxonomyById[memberSlot]?.group
  return (
    !!model &&
    !!group &&
    partFitsCar(catalogPart, model, group, context.partsTaxonomyById, memberSlot)
  )
}

/**
 * The machine-gate group an assembly's remove/refit op needs owned or hired
 * for the day, or null when none of its members gates a removal - structural
 * only, independent of ownership or hire, and the same
 * `machineGateGroupFor` answer a single slot gets. Every shipped assembly
 * names at most one group: `engineAssembly` engine, `gearboxAssembly`
 * drivetrain, `wheelAssembly` none (a rim gates nothing and a tyre gates only
 * its own bench fit). The gate applies identically to remove and refit.
 */
export function assemblyMachineGateGroup(
  def: AssemblyDef,
  context: SimContext,
): ComponentId | null {
  for (const member of def.members) {
    const group = machineGateGroupFor(member, 'remove', context)
    if (group) return group
  }
  return null
}

/** The deterministic id of the one container a given (car, assembly) can have
 * on the bench at a time - once removed, the car's member slots are empty, so
 * it can't be removed again until refit dissolves this container. */
function containerIdFor(carInstanceId: string, assemblyId: AssemblyId): string {
  return `assembly-${carInstanceId}-${assemblyId}`
}

/** Posts `yen` to `partsYen` on the car's ledger (owned) or its service job's
 * ledger (customer) - a changed member refitted onto the car lands its paid
 * price on the bill, the way `completeJob`'s install-part branch does. */
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
 * Labour to pull `def` off a car as a unit: the operation's own
 * `energy.actionPoints.removeAssembly` overhead plus every member actually
 * installed, each charged the same `removeLaborSlotsFor` a loose slot pays.
 * An assembly is a batch over the per-slot machinery, never a discount on it,
 * so pulling an engine costs exactly what pulling its four parts would; an
 * assembly that gains or loses a member re-prices itself with no lever to
 * move. Exported so the UI can quote the real figure before the player
 * commits.
 */
export function removeAssemblyLaborSlotsFor(
  car: CarInstance,
  def: AssemblyDef,
  context: SimContext,
): number {
  return def.members.reduce(
    (total, member) =>
      car.parts[member].installed ? total + removeLaborSlotsFor(member, context) : total,
    context.economy.energy.actionPoints.removeAssembly,
  )
}

/**
 * Remove an assembly as a unit (car-level). Legal when every external
 * blocker is vacant and no member has an open job; labour is
 * `removeAssemblyLaborSlotsFor` above, gated on
 * `laborAvailable`; the machine gate (`assemblyMachineGateGroup`)
 * needs that group's line owned or hired for the day - a running cost, never
 * posted to the car's own ledger. Each installed member moves into
 * one container in `assemblyInventory`, and each vacated member slot stamps its
 * `vacatedBaseline` exactly as per-slot removal does - so refit later reads
 * those baselines back for the equivalence charge. An already-empty member slot
 * simply carries `null` into the container, its car slot untouched. Refuses
 * (no-op, `ok:false`) with nothing to pull, an occupied external blocker, an
 * open member job, an existing container for this (car, assembly), or the
 * machine gate unmet.
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

  // Without the group's machine the pull still happens, at the machine-less
  // labour rate - the gate is a rate, never a wall (`machineLaborMultiplier`).
  const gateGroup = assemblyMachineGateGroup(def, context)
  const laborSlotsUsed =
    removeAssemblyLaborSlotsFor(car, def, context) *
    machineLaborMultiplier(gateGroup, state, context)
  if (laborSlotsUsed > laborAvailable) return fail

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
          },
        },
      },
    }
    // The spanner always tells (free) - owned cars only, exactly as per-slot
    // removal does. A customer's car never carries symptoms.
    let revealedCauseId: string | undefined
    let eliminated = false
    if (isOwned) {
      const revealed = verifyAndResolve(nextCar, member, context)
      nextCar = revealed.car
      revealedCauseId = revealed.revealedCauseId ?? undefined
      eliminated = revealed.eliminated
    }
    updatedCar = nextCar
    log.push({
      type: 'part-removed',
      carInstanceId,
      carPartId: member,
      partInstanceId: installed.id,
      ...(revealedCauseId ? { revealedCauseId } : {}),
    })
    if (eliminated) {
      log.push({ type: 'symptom-cause-eliminated', carInstanceId, carPartId: member })
    }
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
  }
  return { state: next, log, laborSlotsUsed, ok: true }
}

/**
 * Labour to refit `container` back onto `car`: a flat
 * `energy.actionPoints.refitAssembly` figure, whatever changed and whatever
 * didn't - fitting an engine takes the same sweat whether one cam or all
 * four corners of it moved, because the machine line, not the parts list,
 * decides the pace (sprint212.md, "the labour laws"). The per-member
 * changed/unchanged equivalence fork (`refitLaborSlotsFor`) still prices the
 * PARTS bill (`resolveRefitAssembly`'s own `addPartsYen` step charges every
 * changed member's paid price); it no longer prices labour here. `car` and
 * `container` stay on the signature for call-site stability even though
 * this reads only the flat figure now. Exported so the UI can quote the real
 * figure, and gate the refit button on it, before the player commits - the
 * refit counterpart of `removeAssemblyLaborSlotsFor`, and the one place
 * `resolveRefitAssembly` itself sizes the operation, so the quote and the
 * charge can never drift apart.
 */
export function refitAssemblyLaborSlotsFor(
  car: CarInstance,
  def: AssemblyDef,
  container: AssemblyContainer,
  context: SimContext,
): number {
  return context.economy.energy.actionPoints.refitAssembly
}

/**
 * Refit an assembly as a unit (car-level). The operation itself costs
 * `energy.actionPoints.refitAssembly` (0 in shipped content) PLUS
 * per-member charging: a member equal to the slot's
 * `vacatedBaseline` refits at `energy.actionPoints.refitUnchangedMember`
 * (also 0 today, via `refitLaborSlotsFor`), a changed member charges its
 * normal install labour (`installLaborSlotsFor`, reading
 * `economy.energy.energyByClass`) - both through `refitAssemblyLaborSlotsFor`
 * above. The machine gate applies as on removal -
 * that group's line owned or hired for the day, one hire covering every
 * operation on it for the whole day, remove and refit alike. Each changed
 * member's `pricePaidYen` lands on the bill. The container dissolves back into
 * the car's slots. `overrideCarId` refits a bench-BUILT assembly (no
 * `sourceCarId`) onto a chosen car - every member is then new to that car, so
 * every member charges install labour, as new-to-car parts do. Going onto a
 * car other than `container.sourceCarId` (`overrideCarId`, or a bench-built
 * container with no `sourceCarId` at all) is the one path that can land a
 * member whose fitment was never checked against THIS car, so every member is
 * fitment-checked here (`memberFitsCar`) whenever that is true; refitting
 * straight back onto `container.sourceCarId` re-checks nothing, since every
 * member either never left that car or was already fitment-checked against
 * it by `resolveFitAssemblyMember`. That same foreign-car path is where a
 * member first reaches a car, so the one capability gate
 * (`partCapabilityRequirement`, jobs.ts) is checked there too, and says why
 * (a `job-blocked` `tool-tier` entry); refitting onto the source car re-proves
 * nothing, since every member either never left it or was gated on the way
 * into the container. Refuses if the car is gone, an external
 * blocker is occupied, a target slot is already full, a foreign-car member
 * does not fit or is beyond the shop's lines, the machine gate is unmet, or
 * the total labour exceeds `laborAvailable` (the op is atomic).
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
  const model = context.modelsById[car.modelId]
  if (!model) return fail
  if (occupiedExternalBlockers(car, def, context).length > 0) return fail
  // A member already fits `container.sourceCarId` - either it never left that
  // car, or `resolveFitAssemblyMember` fitment-checked it against that same
  // car when it went into the container - so refitting it back onto that
  // SAME car re-proves nothing. `overrideCarId`, or a bench-built container
  // (`sourceCarId` null), puts members onto a car they were never checked
  // against; that path is where a foreign part can slip through, so every
  // member is checked here.
  const targetIsForeignCar = carInstanceId !== container.sourceCarId
  for (const member of def.members) {
    if (car.parts[member].installed !== null) return fail // a target slot is still occupied
    if (targetIsForeignCar) {
      const instance = container.members[member]
      const catalogPart = instance && context.partsById[instance.partId]
      if (catalogPart && !memberFitsCar(catalogPart, car, member, context)) return fail
      if (catalogPart && partCapabilityRequirement(catalogPart, car, state, context)) {
        return {
          state,
          log: [
            {
              type: 'job-blocked',
              jobId: `assembly-refit-${containerId}-${member}`,
              reason: 'tool-tier',
            },
          ],
          laborSlotsUsed: 0,
          ok: false,
        }
      }
    }
  }

  // Refit refuses over a required slot the assembly would seal shut behind
  // it - the graph read backwards from `occupiedBlockers`'s own forward
  // direction (`requiredEmptySlotsBehind`, jobs.ts), external to the
  // assembly's own member set (an internal empty member - e.g. tyres still
  // off the rims that are about to go back on - is not itself a defect this
  // refit needs to fix). Wheels going back on over stripped brakes/
  // suspension is the sharp case: nothing else stops it structurally.
  for (const member of def.members) {
    const instance = container.members[member]
    if (!instance) continue
    if (requiredEmptySlotsBehind(car, model, member, context, def.members).length > 0) {
      return {
        state,
        log: [
          {
            type: 'job-blocked',
            jobId: `assembly-refit-${containerId}-${member}`,
            reason: 'blocks-access',
          },
        ],
        laborSlotsUsed: 0,
        ok: false,
      }
    }
  }

  // Machine-less refits proceed at the multiplied labour rate, never refused
  // (`machineLaborMultiplier`).
  const gateGroup = assemblyMachineGateGroup(def, context)
  const laborSlotsRequired =
    refitAssemblyLaborSlotsFor(car, def, container, context) *
    machineLaborMultiplier(gateGroup, state, context)
  if (laborSlotsRequired > laborAvailable) return fail

  let parts = { ...car.parts }
  let partsCostYen = 0
  const refittedMembers: CarPartId[] = []
  for (const member of def.members) {
    const instance = container.members[member]
    if (!instance) continue
    parts = { ...parts, [member]: { installed: instance } }
    partsCostYen += instance.pricePaidYen ?? 0
    refittedMembers.push(member)
  }
  // A refitted member was already known before it went back on - a benched
  // container is "in hand" the same way loose warehouse inventory is - so
  // every slot it lands in is verified with nothing left to reveal there.
  const { car: updatedCar } = verifyManyAndResolve({ ...car, parts }, refittedMembers, context)
  const withCar = writeCarBack(state, carInstanceId, updatedCar)
  let next: GameState = {
    ...withCar,
    assemblyInventory: (withCar.assemblyInventory ?? []).filter((c) => c.id !== containerId),
    energySpentToday: withCar.energySpentToday + laborSlotsRequired,
  }
  next = addPartsYen(next, carInstanceId, partsCostYen)
  return { state: next, log: [], laborSlotsUsed: laborSlotsRequired, ok: true }
}

export interface AssemblyMemberMoveResult {
  state: GameState
  log: DayLogEntry[]
  ok: boolean
}

/**
 * Fit a part into an EMPTY member slot of an open assembly on the bench:
 * move `newPartInstanceId` from the parts bin into the member slot. There is
 * no swap - a slot already carrying a member refuses outright, mirroring
 * `resolveRefitAssembly`'s own occupied-slot check (assemblies.ts:371); the
 * mounted member must come off first (`resolveRemoveAssemblyMember`), the
 * same remove-then-install ruling the car-level slots enforce. Labour is
 * `energy.actionPoints.benchFitMember` (0 in shipped content), gated on
 * `laborAvailable` when raised. A tyre-into-assembly op needs the wheels
 * line owned or hired for the day (the `bench-fit` half of the slot's
 * `machineGate`); every other member fit is ungated by that.
 * Refuses if the container/part is missing, the target slot is already
 * occupied, the part does not address this member slot, the part is scrap,
 * the machine gate is unmet, or (for a container pulled off a car) the
 * part's fitment class does not match that car's (`memberFitsCar`) - the
 * fitment law applies at the bench, not only on the car.
 *
 * The bench is an install path, so the one capability gate
 * (`partCapabilityRequirement`, jobs.ts) applies here exactly as it does on
 * the car, and is the only refusal here that says why (a `job-blocked`
 * `tool-tier` entry). A container built on the bench from bin parts has no car
 * to check against; those members are gated when the assembly goes onto one
 * (`resolveRefitAssembly`).
 */
export function resolveFitAssemblyMember(
  state: GameState,
  containerId: string,
  memberSlot: CarPartId,
  newPartInstanceId: string,
  context: SimContext,
  laborAvailable: number = Infinity,
): AssemblyMemberMoveResult {
  const fail: AssemblyMemberMoveResult = { state, log: [], ok: false }
  const containers = state.assemblyInventory ?? []
  const containerIndex = containers.findIndex((c) => c.id === containerId)
  if (containerIndex === -1) return fail
  const container = containers[containerIndex]!
  const def = assemblyDefById(container.assemblyId, context)
  if (!def || !def.members.includes(memberSlot)) return fail
  if (container.members[memberSlot] != null) return fail // the slot is occupied - take it off first, no swap
  const newPart = state.partInventory.find((p) => p.id === newPartInstanceId)
  if (!newPart || newPart.band === 'scrap') return fail
  const catalogPart = context.partsById[newPart.partId]
  if (!catalogPart || catalogPart.carPartId !== memberSlot) return fail
  if (container.sourceCarId) {
    const sourceCar = findWorkableCar(state, container.sourceCarId)
    if (!sourceCar || !memberFitsCar(catalogPart, sourceCar, memberSlot, context)) return fail
    if (partCapabilityRequirement(catalogPart, sourceCar, state, context)) {
      return {
        state,
        log: [
          {
            type: 'job-blocked',
            jobId: `bench-${containerId}-${memberSlot}`,
            reason: 'tool-tier',
          },
        ],
        ok: false,
      }
    }
  }
  // A gated bench fit (tyres onto rims) without the wheels machine costs the
  // machine-less labour rate instead of being refused (`machineLaborMultiplier`).
  const gateGroup = machineGateGroupFor(memberSlot, 'bench-fit', context)
  const laborSlotsUsed =
    context.economy.energy.actionPoints.benchFitMember *
    machineLaborMultiplier(gateGroup, state, context)
  if (laborSlotsUsed > laborAvailable) return fail

  const nextContainers = [...containers]
  nextContainers[containerIndex] = {
    ...container,
    members: { ...container.members, [memberSlot]: newPart },
  }
  const partInventory = state.partInventory.filter((p) => p.id !== newPartInstanceId)
  // The fitted part has left the warehouse for the assembly, so whichever
  // station it was on is now clear.
  const next: GameState = reconcileStations({
    ...state,
    assemblyInventory: nextContainers,
    partInventory,
    energySpentToday: state.energySpentToday + laborSlotsUsed,
  })
  return { state: next, log: [], ok: true }
}

/**
 * Pull a mounted member OUT of an open assembly on the bench: dead tyres come
 * off the rims and go in the bin BEFORE fresh ones go on. The instance moves
 * to the parts bin and the member slot reads empty; refit already skips empty
 * members, and `resolveFitAssemblyMember` then fits into that empty slot -
 * take off, then fit, never a swap. Labour is `energy.actionPoints.benchRemoveMember`
 * (0 in shipped content), gated on `laborAvailable` when raised; the
 * wheels-line gate applies to FITTING a tyre, never to dismounting one.
 * Refuses if the container, member slot, or mounted instance is missing.
 */
export function resolveRemoveAssemblyMember(
  state: GameState,
  containerId: string,
  memberSlot: CarPartId,
  context: SimContext,
  laborAvailable: number = Infinity,
): AssemblyMemberMoveResult {
  const fail: AssemblyMemberMoveResult = { state, log: [], ok: false }
  const allContainers = containers(state)
  const containerIndex = allContainers.findIndex((c) => c.id === containerId)
  if (containerIndex === -1) return fail
  const container = allContainers[containerIndex]!
  const mounted = container.members[memberSlot]
  if (!mounted) return fail
  const laborSlotsUsed = context.economy.energy.actionPoints.benchRemoveMember
  if (laborSlotsUsed > laborAvailable) return fail

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
      energySpentToday: state.energySpentToday + laborSlotsUsed,
    },
    log: [],
    ok: true,
  }
}

/**
 * Build an assembly on the bench from loose bin parts - a container with
 * `sourceCarId: null` holding the named members. Labour is
 * `energy.actionPoints.benchBuildAssembly` (0 in shipped content), gated on
 * `laborAvailable` when raised. Installing it onto a car
 * (`resolveRefitAssembly` with `overrideCarId`) then charges install labour
 * for every member, as new-to-car parts do. Refuses if a named part is
 * missing, scrap, or does not address its member slot.
 */
export function resolveBuildAssembly(
  state: GameState,
  assemblyId: AssemblyId,
  memberInstanceIds: Partial<Record<CarPartId, string>>,
  context: SimContext,
  laborAvailable: number = Infinity,
): AssemblyMemberMoveResult {
  const fail: AssemblyMemberMoveResult = { state, log: [], ok: false }
  const def = assemblyDefById(assemblyId, context)
  if (!def) return fail
  const laborSlotsUsed = context.economy.energy.actionPoints.benchBuildAssembly
  if (laborSlotsUsed > laborAvailable) return fail
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
    // Every member has left the warehouse for the new assembly, so any station
    // holding one of them is now clear.
    state: reconcileStations({
      ...state,
      partInventory,
      assemblyInventory: [...containers(state), container],
      energySpentToday: state.energySpentToday + laborSlotsUsed,
    }),
    log: [],
    ok: true,
  }
}

function containers(state: GameState): readonly AssemblyContainer[] {
  return state.assemblyInventory ?? []
}

/**
 * On a car leaving the shop (sold, or a customer service job handed back),
 * dissolve any of its assemblies still on the bench - every member drops
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
