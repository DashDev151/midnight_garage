import {
  EngineCharacterSchema,
  type CarPartId,
  type ConditionBand,
  type DayLogEntry,
  type EngineCharacter,
  type GameState,
  type Job,
  type MachiningOperation,
  type Part,
  type PartInstance,
  type ToolLevels,
} from '@midnight-garage/content'
import { bandFactor } from './bands'
import type { SimContext } from './context'
import {
  machiningAuthenticityCostOf,
  machiningOf,
  machiningOperationById,
  machiningOperationsForSlot,
} from './machining'
import {
  applyAvailableLaborToJob,
  findWorkableCar,
  writeCarBack,
  type LaborApplicationResult,
} from './jobs'
import { toolLevelsFor } from './toolLines'

/**
 * Where an operation is chosen, paid for in labour, and written onto the metal
 * it was quoted against.
 *
 * Machining reuses the one job system rather than growing a second one. An
 * operation is a `Job` with kind `machine-part`, spending its labour through
 * the same `applyAvailableLaborToJob` a repair does and accruing across days
 * the same way.
 *
 * **One mechanism, two address kinds**, decided by the operation's own
 * `performedOn` (economy content) rather than by which screen asked:
 *
 * - `loose-part`, which is nearly all of them: the operation addresses one
 *   `PartInstance` and is done in the machine shop, exactly as a bench
 *   recondition (`resolveReconditionLabor`) addresses one, so the part has to
 *   be carried to the machine before any of it can start.
 * - `fitted-part`: setup work that can only be judged with the car assembled,
 *   so it addresses a car and a slot, needs the car in a service bay like any
 *   other car job, and writes onto whatever is installed there.
 *
 * What an operation DOES lives in `machining.ts`; this file decides whether it
 * may be done, does it, and reports what each room can offer.
 */

/** Every engine character an operation is authored against - the one list,
 * read from the schema so the shop can never quote a character no model has. */
const ENGINE_CHARACTERS: readonly EngineCharacter[] = EngineCharacterSchema.options

/**
 * A loose-part operation's own job id - one open job per part and operation, so
 * a repeat click continues the same work rather than opening a second, and two
 * different operations on the same block can be under way at once. Mirrors
 * `dynoJobIdFor`'s deterministic-id contract (dyno.ts).
 */
export function machiningJobIdFor(partInstanceId: string, operationId: string): string {
  return `machine-${partInstanceId}-${operationId}`
}

/**
 * A fitted-part operation's own job id, addressed the way every other car job
 * is: the car, the slot, and then what is being done to it. One open job per
 * car, slot and operation, on the same deterministic-id contract as the loose
 * form above.
 */
export function fittedMachiningJobIdFor(
  carInstanceId: string,
  carPartId: CarPartId,
  operationId: string,
): string {
  return `machine-${carInstanceId}-${carPartId}-${operationId}`
}

/** Why the machine shop refuses one operation on the part on the machine. */
export type MachiningGateReason =
  /** No such part in the warehouse - installed on a car, sold, or never there. */
  | 'not-found'
  /** In the warehouse, but not on the machine. Carry it to the machine shop. */
  | 'not-on-machine'
  | 'tool-tier'
  /** Not a cut this shop makes: no such operation, or one that is only done
   * with the part fitted to a car. */
  | 'unknown-operation'
  /** The operation addresses a different slot than the part on the machine
   * does - you do not port and polish a gearbox. */
  | 'wrong-slot'
  | 'not-mint'
  | 'already-applied'

/**
 * Why the car refuses one setup operation on one of its own slots - the
 * fitted-part twin of `MachiningGateReason` above, and deliberately its own
 * union: the two paths refuse for different reasons and a caller reads whichever
 * gate matches the operation's `performedOn`, never one standing in for the
 * other.
 */
export type FittedMachiningGateReason =
  /** No such car - sold, handed back, or never owned. */
  | 'no-car'
  /** Parked. Setup work is done to the whole car, so it needs a bay. */
  | 'not-in-service-bay'
  /** Nothing fitted in the slot the operation addresses. */
  | 'slot-empty'
  /** Not a job done on the car: no such operation, or one the machine shop
   * does with the part off. */
  | 'unknown-operation'
  | 'tool-tier'
  | 'not-mint'
  | 'already-applied'

/**
 * The capability gate one operation needs regardless of any specific car: the
 * tool LEVEL of the line its own `carPartId` belongs to, and nothing else.
 * Tools are bought with money and the market decides whether the work was
 * worth doing, so no standing anywhere gates an operation. The one check both
 * the machine shop (`machiningGateReason` below, part-specific) and the
 * service-job board (`isCraftOperationUnlocked`, serviceJobs.ts) share, so a
 * signature job can never be offered ahead of what the garage's own cars could
 * actually get.
 *
 * An operation carrying a `scene` gates on `craftOperationToolTier`; every
 * other one gates on `minEngineToolTier`. Both sit at level 3, and both are
 * read against the operation's own line, so which of the two applies changes
 * nothing about what is required while they agree.
 */
export function craftOperationCapabilityGateReason(
  operation: MachiningOperation,
  toolLevels: ToolLevels,
  context: SimContext,
): 'tool-tier' | null {
  const group = context.partsTaxonomyById[operation.carPartId].group
  const requiredLevel = operation.scene
    ? context.economy.machining.craftOperationToolTier
    : context.economy.machining.minEngineToolTier
  return toolLevels[group] < requiredLevel ? 'tool-tier' : null
}

/** The slot the loose `partInstanceId` addresses, resolved through its own
 * catalogue entry - what an operation's `carPartId` has to match, and what the
 * machine shop labels the part with. `null` when the part is not in the
 * warehouse or its catalogue entry cannot be resolved. */
function slotOfLoosePart(state: GameState, partInstanceId: string, context: SimContext) {
  const instance = state.partInventory.find((p) => p.id === partInstanceId)
  const part = instance ? context.partsById[instance.partId] : undefined
  return instance && part ? { instance, part } : null
}

/**
 * Why machining `operationId` onto `partInstanceId` is refused right now, or
 * `null` when nothing refuses it. The one predicate: the UI shows the same
 * reason before the click that the resolver enforces after it.
 *
 * The part has to be on the MACHINE. Machining is what the machine shop does
 * and nothing else does it, so a part in the warehouse or on the workshop
 * floor's bench is refused however good the tools are.
 *
 * Only a `loose-part` operation resolves here at all. A setup operation is
 * done on the assembled car (`fittedMachiningGateReason` below), so asking for
 * one at the machine reads as `unknown-operation`: it is not a cut this room
 * makes.
 *
 * `wrong-slot` keeps an operation on its own metal: `operation.carPartId` has
 * to be the slot the part itself addresses.
 *
 * `tool-tier` is the whole of the capability gate
 * (`craftOperationCapabilityGateReason` above): the machine shop is what buys
 * the means of production, and once it is owned an operation costs labour and
 * nothing else.
 *
 * `not-mint` is the design's own rule: you do not bore a worn block, you
 * rebuild it first.
 */
export function machiningGateReason(
  state: GameState,
  partInstanceId: string,
  operationId: string,
  context: SimContext,
): MachiningGateReason | null {
  const found = slotOfLoosePart(state, partInstanceId, context)
  if (!found) return 'not-found'
  const operation = machiningOperationById(operationId, context.economy, 'loose-part')
  if (!operation) return 'unknown-operation'
  if (operation.carPartId !== found.part.carPartId) return 'wrong-slot'
  if (state.machinePartId !== partInstanceId) return 'not-on-machine'
  const capabilityReason = craftOperationCapabilityGateReason(
    operation,
    toolLevelsFor(state, context),
    context,
  )
  if (capabilityReason) return capabilityReason
  if (found.instance.band !== 'mint') return 'not-mint'
  if (machiningOf(found.instance).includes(operationId)) return 'already-applied'
  return null
}

/**
 * Why setting `operationId` up on `carInstanceId` is refused right now, or
 * `null` when nothing refuses it - the fitted-part twin of
 * `machiningGateReason` above, and the same one-predicate contract: the UI
 * shows the same reason before the click that the resolver enforces after it.
 *
 * The operation names its own slot, so there is no address to get wrong and no
 * `wrong-slot` to report; what there is instead is a car, which has to exist
 * and be in a service bay, and a slot, which has to have something in it. Only
 * a `fitted-part` operation resolves here, so asking the car for a bore reads
 * as `unknown-operation`.
 *
 * `tool-tier`, `not-mint` and `already-applied` are the same checks the
 * machine shop makes, read off the installed part rather than the loose one.
 * The tool gate is the operation's OWN line
 * (`craftOperationCapabilityGateReason`): corner weighting answers to
 * suspension and show fitment to wheels, neither to the engine.
 */
export function fittedMachiningGateReason(
  state: GameState,
  carInstanceId: string,
  operationId: string,
  context: SimContext,
): FittedMachiningGateReason | null {
  const operation = machiningOperationById(operationId, context.economy, 'fitted-part')
  if (!operation) return 'unknown-operation'
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return 'no-car'
  if (!state.serviceBayCarIds.includes(carInstanceId)) return 'not-in-service-bay'
  const installed = car.parts[operation.carPartId].installed
  if (!installed) return 'slot-empty'
  const capabilityReason = craftOperationCapabilityGateReason(
    operation,
    toolLevelsFor(state, context),
    context,
  )
  if (capabilityReason) return capabilityReason
  if (installed.band !== 'mint') return 'not-mint'
  if (machiningOf(installed).includes(operationId)) return 'already-applied'
  return null
}

/**
 * Writes one finished operation onto the metal it was quoted against - the
 * whole effect of a completed `machine-part` job, on whichever of the two
 * address kinds the operation uses. Appends to that instance's own record and
 * touches nothing else: no band moves, no part is swapped, no money changes
 * hands.
 *
 * A loose part that left the warehouse since the job opened, or a slot whose
 * part has been swapped since, is left alone - matching
 * `completeReconditionJob`'s own treatment: the job was already laboured, and
 * machining metal nobody quoted for would be worse than doing nothing. A repeat
 * of an operation the part already carries is likewise a no-op rather than a
 * second entry.
 */
export function completeMachiningJob(state: GameState, job: Job, context: SimContext): GameState {
  const operation = machiningOperationById(job.machiningOperationId, context.economy)
  if (!operation || !job.machiningOperationId) return state
  return operation.performedOn === 'fitted-part'
    ? completeFittedMachining(state, job, job.machiningOperationId, operation.carPartId)
    : completeLooseMachining(state, job, job.machiningOperationId)
}

/**
 * The loose half: the operation lands on the `PartInstance` in the warehouse.
 * The work travels with the part, so refitting it to a car carries the
 * operation onto that car's power, support, authenticity and value with no
 * further bookkeeping (`derivedStats.ts` sums machining over installed parts).
 */
function completeLooseMachining(state: GameState, job: Job, operationId: string): GameState {
  const { partInstanceId } = job
  if (!partInstanceId) return state
  const index = state.partInventory.findIndex((p) => p.id === partInstanceId)
  if (index === -1) return state
  const instance = state.partInventory[index]!
  if (machiningOf(instance).includes(operationId)) return state

  const machined: PartInstance = {
    ...instance,
    machining: [...machiningOf(instance), operationId],
  }
  const partInventory = [...state.partInventory]
  partInventory[index] = machined
  return { ...state, partInventory }
}

/**
 * The fitted half: the operation lands on whatever is installed in the car's
 * own slot, so it reaches every derivation the same way a part machined loose
 * and then bolted on does. The job's `partInstanceId` is the part that was
 * quoted for; anything else in the slot now means the car was taken apart mid
 * job, and the work is dropped rather than applied to a stranger.
 */
function completeFittedMachining(
  state: GameState,
  job: Job,
  operationId: string,
  carPartId: CarPartId,
): GameState {
  const car = findWorkableCar(state, job.carInstanceId)
  const installed = car?.parts[carPartId].installed
  if (!car || !installed || installed.id !== job.partInstanceId) return state
  if (machiningOf(installed).includes(operationId)) return state
  return writeCarBack(state, car.id, {
    ...car,
    parts: {
      ...car.parts,
      [carPartId]: {
        installed: { ...installed, machining: [...machiningOf(installed), operationId] },
      },
    },
  })
}

/**
 * The player-facing resolver for a loose-part operation: open (or continue) the
 * job for this operation and spend as much of today's remaining labour on it as
 * it will take. The same two primitives every other piece of work uses, so an
 * operation that outruns today's pool carries over to tomorrow exactly as a
 * repair does.
 *
 * Any refusal is a silent no-op with nothing spent - `machiningGateReason` is
 * the one predicate, and the UI shows the same reason before the click.
 */
export function resolveMachiningLabor(
  state: GameState,
  partInstanceId: string,
  operationId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const operation = machiningOperationById(operationId, context.economy, 'loose-part')
  if (!operation) return { state, log: [], laborSlotsUsed: 0 }
  const jobId = machiningJobIdFor(partInstanceId, operationId)
  if (state.jobs.some((j) => j.id === jobId)) {
    return applyAvailableLaborToJob(state, jobId, laborAvailable, context)
  }

  if (machiningGateReason(state, partInstanceId, operationId, context) !== null) {
    return { state, log: [], laborSlotsUsed: 0 }
  }

  const job: Job = {
    id: jobId,
    // No car - a loose part on the machine. `carInstanceId` (required by the
    // job schema) holds the part's own id purely for stable non-empty
    // identity, exactly as a `recondition-part` job's does; the
    // `machine-part` kind is what every resolver branches on.
    carInstanceId: partInstanceId,
    kind: 'machine-part',
    // Machining is engine work, and the four machinable slots are all in that
    // group. `componentId` is required by the job schema; nothing branches on
    // it for this kind.
    componentId: 'engine',
    carPartId: operation.carPartId,
    partInstanceId,
    machiningOperationId: operationId,
    laborSlotsRequired: operation.labourPoints,
    laborSlotsSpent: 0,
  }
  return applyAvailableLaborToJob(
    { ...state, jobs: [...state.jobs, job] },
    jobId,
    laborAvailable,
    context,
  )
}

/**
 * The player-facing resolver for a fitted-part operation - the same shape as
 * `resolveMachiningLabor` above, addressed at a car and a slot instead of a
 * loose part, and refusing silently on `fittedMachiningGateReason`.
 *
 * The job it opens is an ordinary car job: it carries the car's own id, so the
 * service bay is required for the labour to go in, and it holds the slot's
 * group and the installed part's id, so pulling that part out from under the
 * work is refused for as long as the job is open (`resolveRemovePart`).
 */
export function resolveFittedMachiningLabor(
  state: GameState,
  carInstanceId: string,
  operationId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const operation = machiningOperationById(operationId, context.economy, 'fitted-part')
  if (!operation) return { state, log: [], laborSlotsUsed: 0 }
  const jobId = fittedMachiningJobIdFor(carInstanceId, operation.carPartId, operationId)
  if (state.jobs.some((j) => j.id === jobId)) {
    return applyAvailableLaborToJob(state, jobId, laborAvailable, context)
  }

  if (fittedMachiningGateReason(state, carInstanceId, operationId, context) !== null) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  const installed = findWorkableCar(state, carInstanceId)?.parts[operation.carPartId].installed
  if (!installed) return { state, log: [], laborSlotsUsed: 0 }

  const job: Job = {
    id: jobId,
    carInstanceId,
    kind: 'machine-part',
    componentId: context.partsTaxonomyById[operation.carPartId].group,
    carPartId: operation.carPartId,
    // The part the work was quoted against, so a slot emptied or swapped
    // mid-job drops the operation rather than landing it on a stranger.
    partInstanceId: installed.id,
    machiningOperationId: operationId,
    laborSlotsRequired: operation.labourPoints,
    laborSlotsSpent: 0,
  }
  return applyAvailableLaborToJob(
    { ...state, jobs: [...state.jobs, job] },
    jobId,
    laborAvailable,
    context,
  )
}

/** The day-log entry a finished operation reports, built where the job's own
 * fields are known so the log and the effect can never describe different
 * work. */
export function machiningLogEntryFor(job: Job): DayLogEntry {
  return {
    type: 'part-machined',
    carPartId: job.carPartId!,
    partInstanceId: job.partInstanceId!,
    machiningOperationId: job.machiningOperationId!,
  }
}

// --- what the shop offers ------------------------------------------------

/** One operation as the machine shop shows it: everything it would do to the
 * part on the machine, and whether it can be done at all. */
export interface MachiningOfferRow {
  operation: MachiningOperation
  /**
   * The fraction of a car's own STOCK power this operation makes, at this
   * part's grade and band, one entry per engine character. A part on the
   * machine is not on a car, so there is no single PS figure to quote: what
   * the same cut is worth depends on the engine it ends up in, which is the
   * fact the shop should be showing anyway.
   */
  powerFractionByCharacter: Record<EngineCharacter, number>
  /** What it adds to its slot's support contribution. */
  spec: number
  /** What it costs in authenticity - the operation's own rating on a stock
   * part, and zero on an aftermarket one, because that part has nothing left
   * to lose. */
  authenticityCost: number
  labourPoints: number
  /** The share of a car's own reliability base this operation takes, as a
   * fraction, once the part is fitted. */
  reliabilityCost: number
  applied: boolean
  /** Why it cannot be done right now, or `null` when it can. */
  gateReason: MachiningGateReason | null
}

/**
 * Everything the machine shop reports about the part on the machine: what it
 * is, what has already been done to it, and every operation the shop would
 * quote for it with its full price in support, authenticity, labour and
 * reliability.
 *
 * Nothing here is car-scoped, because nothing on the machine is on a car. The
 * work travels with the part: fit it and the car's own sheets (the dyno
 * readout's support ratios, the value panel's originality) pick the operation
 * up through the ordinary installed-part derivations.
 */
export interface MachiningReading {
  partInstanceId: string
  /** The SKU on the machine, as the catalogue knows it. */
  part: Part
  /** The slot it addresses - what the shop calls the thing on the bench. */
  carPartId: CarPartId
  band: ConditionBand
  /** The operations already on this part, in the order they were done. */
  applied: readonly string[]
  offers: readonly MachiningOfferRow[]
}

/**
 * The machine shop's sheet for whatever is on the machine, or `null` when the
 * machine is empty (or holds a part the catalogue cannot resolve). No car is
 * needed and none is consulted: the machine shop opens on a part, and it quotes
 * only the operations that are done with the part off (`loose-part`).
 */
export function machiningReadingFor(
  state: GameState,
  context: SimContext,
): MachiningReading | null {
  const partInstanceId = state.machinePartId
  if (!partInstanceId) return null
  const found = slotOfLoosePart(state, partInstanceId, context)
  if (!found) return null
  const { instance, part } = found
  const applied = machiningOf(instance).slice()
  return {
    partInstanceId,
    part,
    carPartId: part.carPartId,
    band: instance.band,
    applied,
    offers: machiningOperationsForSlot(part.carPartId, context.economy, 'loose-part').map(
      (operation) => offerRowFor(operation, instance, part, applied, state, context),
    ),
  }
}

function offerRowFor(
  operation: MachiningOperation,
  instance: PartInstance,
  part: Part,
  applied: readonly string[],
  state: GameState,
  context: SimContext,
): MachiningOfferRow {
  const { economy } = context
  // The same scaling a fitted part's own machining goes through
  // (`machiningPowerFractionOf`, machining.ts): better hardware uses more of
  // what a cut unlocks, and a worn part delivers what a worn part delivers.
  const scale = economy.machining.gradeMultiplier[part.grade] * bandFactor(instance.band, economy)
  const powerFractionByCharacter = {} as Record<EngineCharacter, number>
  for (const character of ENGINE_CHARACTERS) {
    powerFractionByCharacter[character] = operation.powerFraction[character] * scale
  }
  return {
    operation,
    powerFractionByCharacter,
    spec: operation.spec,
    authenticityCost: machiningAuthenticityCostOf(operation, part),
    labourPoints: operation.labourPoints,
    reliabilityCost: economy.machining.reliabilityCostPerOperation,
    applied: applied.includes(operation.id),
    gateReason: machiningGateReason(state, instance.id, operation.id, context),
  }
}

// --- what the car offers ---------------------------------------------------

/** One setup operation as the car's own screen shows it: what it would do to
 * this slot, what it costs, and whether it can be done at all. */
export interface FittedMachiningOfferRow {
  operation: MachiningOperation
  /** The extra fraction of the car's own MINT handling it adds, at this part's
   * grade - zero for an operation that buys no handling. */
  handlingFraction: number
  /** The style points it adds, on the fitted part's own scale. Never
   * grade-scaled, matching how style reads a catalogue part. */
  stylePoints: number
  /** What it costs in authenticity (`machiningAuthenticityCostOf`) - the
   * operation's own rating on a stock part, and zero on anything else,
   * including a slot whose SKU the catalogue cannot resolve. */
  authenticityCost: number
  labourPoints: number
  /** The share of the car's own reliability base this operation takes, as a
   * fraction. */
  reliabilityCost: number
  applied: boolean
  /** Why it cannot be done right now, or `null` when it can. */
  gateReason: FittedMachiningGateReason | null
}

/**
 * Every setup operation the slot `carPartId` offers on `carInstanceId`, in
 * catalogue order, each with its full price and its own refusal - the
 * fitted-part twin of `machiningReadingFor`, scoped to one slot because that is
 * what the car's own screen has selected. Empty for the slots no setup
 * operation addresses, which is nearly all of them.
 *
 * The figures are quoted the way the machine shop quotes its own: at the fitted
 * part's grade, and without the coherence factor a `coherenceSupported`
 * operation would later be scaled by, since a quote is what the operation is
 * worth rather than what the rest of the build makes of it.
 */
export function fittedMachiningOffersFor(
  state: GameState,
  carInstanceId: string,
  carPartId: CarPartId,
  context: SimContext,
): readonly FittedMachiningOfferRow[] {
  const operations = machiningOperationsForSlot(carPartId, context.economy, 'fitted-part')
  if (operations.length === 0) return []
  const installed = findWorkableCar(state, carInstanceId)?.parts[carPartId].installed ?? null
  const part = installed ? context.partsById[installed.partId] : undefined
  const applied = machiningOf(installed)
  const { economy } = context
  const gradeMultiplier = part ? economy.machining.gradeMultiplier[part.grade] : 1
  return operations.map((operation) => ({
    operation,
    handlingFraction: operation.handlingFraction * gradeMultiplier,
    stylePoints: operation.style,
    authenticityCost: machiningAuthenticityCostOf(operation, part),
    labourPoints: operation.labourPoints,
    reliabilityCost: economy.machining.reliabilityCostPerOperation,
    applied: applied.includes(operation.id),
    gateReason: fittedMachiningGateReason(state, carInstanceId, operation.id, context),
  }))
}
