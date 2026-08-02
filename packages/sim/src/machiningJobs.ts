import type {
  CarInstance,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  DayLogEntry,
  EconomyConfig,
  EngineCharacter,
  GameState,
  Job,
  MachiningOperation,
  Part,
  Subsystem,
} from '@midnight-garage/content'
import { bandFactor } from './bands'
import type { SimContext } from './context'
import { authenticityPercentOf, computeDerivedStats, engineCharacterOf } from './derivedStats'
import { machinableSlots, machiningOf, machiningOperationsForSlot } from './machining'
import { applyAvailableLaborToJob, findWorkableCar, type LaborApplicationResult } from './jobs'
import { supportRatios, supportVerdict, type SupportVerdict } from './support'

/**
 * The machine shop: where an operation is chosen, paid for in labour, and
 * written onto the part.
 *
 * Machining reuses the one job system rather than growing a second one. An
 * operation is a `Job` with kind `machine-part`, spending its labour through
 * the same `applyAvailableLaborToJob` a repair does, accruing across days the
 * same way, and gating on the same service bay. The loose-part analogue
 * (`resolveReconditionLabor`) and the rollers (`resolveDynoSession`) are built
 * the same way for the same reason.
 *
 * What an operation DOES lives in `machining.ts`; this file decides whether it
 * may be done, does it, and reports what the shop can offer.
 */

/**
 * One operation's own job id - one open job per car, slot and operation, so a
 * repeat click continues the same work rather than opening a second and two
 * different operations on the same block can be under way at once. Mirrors
 * `dynoJobIdFor`'s deterministic-id contract (dyno.ts).
 */
export function machiningJobIdFor(
  carInstanceId: string,
  carPartId: CarPartId,
  operationId: string,
): string {
  return `machine-${carInstanceId}-${carPartId}-${operationId}`
}

export type MachiningGateReason =
  | 'not-found'
  | 'not-in-service-bay'
  | 'tool-tier'
  | 'unknown-operation'
  | 'slot-empty'
  | 'not-mint'
  | 'already-applied'

/**
 * Why machining `operationId` onto whatever is fitted in its own slot on
 * `carInstanceId` is refused right now, or `null` when nothing refuses it. The
 * one predicate: the UI shows the same reason before the click that the
 * resolver enforces after it.
 *
 * `tool-tier` is the whole of the money gate. The engine line's top rung
 * (`economy.machining.minEngineToolTier`, already named "Machine-shop tooling"
 * in `toolLines.json`) is what buys the means of production; once it is owned,
 * an operation costs labour and nothing else. Owning it also clears the
 * buried-slot machine gate by construction, since that asks only for tier 2.
 *
 * `not-mint` is the design's own rule: you do not bore a worn block, you
 * rebuild it first.
 */
export function machiningGateReason(
  state: GameState,
  carInstanceId: string,
  operationId: string,
  context: SimContext,
): MachiningGateReason | null {
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return 'not-found'
  if (!state.serviceBayCarIds.includes(carInstanceId)) return 'not-in-service-bay'
  if (state.toolTiers.engine < context.economy.machining.minEngineToolTier) return 'tool-tier'
  const operation = context.economy.machining.operations.find((o) => o.id === operationId)
  if (!operation) return 'unknown-operation'
  const installed = car.parts[operation.carPartId].installed
  if (!installed) return 'slot-empty'
  if (installed.band !== 'mint') return 'not-mint'
  if (machiningOf(installed).includes(operationId)) return 'already-applied'
  return null
}

/**
 * Writes one finished operation onto the part still fitted in its slot - the
 * whole effect of a completed `machine-part` job. Appends to the instance's
 * own record and touches nothing else: no band moves, no part is swapped, no
 * money changes hands.
 *
 * A slot whose part has changed since the job opened is left alone, matching
 * `completeReconditionJob`'s treatment of a part that left inventory: the job
 * was already laboured, and machining a part nobody quoted for would be worse
 * than doing nothing. A repeat of an operation the part already carries is
 * likewise a no-op rather than a second entry.
 */
export function completeMachiningJob(state: GameState, job: Job, context: SimContext): GameState {
  const { carPartId, machiningOperationId, partInstanceId } = job
  if (!carPartId || !machiningOperationId || !partInstanceId) return state
  if (!context.economy.machining.operations.some((o) => o.id === machiningOperationId)) return state

  const applyToCar = (car: CarInstance): CarInstance | null => {
    const installed = car.parts[carPartId].installed
    if (!installed || installed.id !== partInstanceId) return null
    if (machiningOf(installed).includes(machiningOperationId)) return null
    return {
      ...car,
      parts: {
        ...car.parts,
        [carPartId]: {
          ...car.parts[carPartId],
          installed: { ...installed, machining: [...machiningOf(installed), machiningOperationId] },
        },
      },
    }
  }

  const ownedIndex = state.ownedCars.findIndex((c) => c.id === job.carInstanceId)
  if (ownedIndex !== -1) {
    const machined = applyToCar(state.ownedCars[ownedIndex]!)
    if (!machined) return state
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = machined
    return { ...state, ownedCars }
  }

  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === job.carInstanceId)
  if (serviceIndex !== -1) {
    const serviceJob = state.activeServiceJobs[serviceIndex]!
    const machined = applyToCar(serviceJob.car)
    if (!machined) return state
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...serviceJob, car: machined }
    return { ...state, activeServiceJobs }
  }

  return state
}

/**
 * The player-facing resolver: open (or continue) the job for this operation
 * and spend as much of today's remaining labour on it as it will take. The
 * same two primitives every other piece of work uses, so an operation that
 * outruns today's pool carries over to tomorrow exactly as a repair does.
 *
 * Any refusal is a silent no-op with nothing spent - `machiningGateReason` is
 * the one predicate, and the UI shows the same reason before the click.
 */
export function resolveMachiningLabor(
  state: GameState,
  carInstanceId: string,
  operationId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const operation = context.economy.machining.operations.find((o) => o.id === operationId)
  if (!operation) return { state, log: [], laborSlotsUsed: 0 }
  const jobId = machiningJobIdFor(carInstanceId, operation.carPartId, operationId)
  if (state.jobs.some((j) => j.id === jobId)) {
    return applyAvailableLaborToJob(state, jobId, laborAvailable, context)
  }

  if (machiningGateReason(state, carInstanceId, operationId, context) !== null) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  const car = findWorkableCar(state, carInstanceId)!
  const installed = car.parts[operation.carPartId].installed!

  const job: Job = {
    id: jobId,
    carInstanceId,
    kind: 'machine-part',
    // Machining is engine work, and the four machinable slots are all in that
    // group. `componentId` is required by the job schema; nothing branches on
    // it for this kind.
    componentId: 'engine',
    carPartId: operation.carPartId,
    // The instance the work was quoted against, so a slot that changes hands
    // mid-job is left alone rather than machined by accident.
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
    carInstanceId: job.carInstanceId,
    carPartId: job.carPartId!,
    partInstanceId: job.partInstanceId!,
    machiningOperationId: job.machiningOperationId!,
  }
}

// --- what the shop offers ------------------------------------------------

/** One operation as the workshop page shows it: everything it would do to
 * this car, and whether it can be done at all. */
export interface MachiningOfferRow {
  operation: MachiningOperation
  /** PS this operation would add to THIS car, on its own engine character and
   * at the fitted part's own grade and band. The figure the page leads with,
   * because a fraction of stock power means nothing without the car. */
  powerPs: number
  /** The same figure as the fraction it really is, for a page that wants to
   * show both. */
  powerFraction: number
  /** What it adds to its slot's support contribution. */
  spec: number
  /** What it actually costs this car in authenticity - the operation's own
   * rating on a stock part, and zero on an aftermarket one, because that slot
   * has nothing left to lose. */
  authenticityCost: number
  labourPoints: number
  /** The share of the car's own reliability base this operation takes, as a
   * fraction. */
  reliabilityCost: number
  applied: boolean
  /** Why it cannot be done right now, or `null` when it can. */
  gateReason: MachiningGateReason | null
}

/** One machinable slot, with what is fitted in it and every operation the shop
 * would quote for it. */
export interface MachiningSlotRow {
  carPartId: CarPartId
  /** The fitted SKU, or `null` for an empty or unresolvable slot. */
  part: Part | null
  band: string | null
  /** The operations already on this part, in the order they were done. */
  applied: readonly string[]
  offers: readonly MachiningOfferRow[]
}

/**
 * Everything the machine shop reports about one car, read from the sim's own
 * derivations and never recomputed here. It shows EVERYTHING to begin with:
 * each operation's power on this engine's character, its support, its
 * authenticity cost, its labour and its reliability cost.
 *
 * It carries the five support ratios too, and not as decoration. Support only
 * moves the headline when it lifts the weakest subsystem, so an operation
 * bought on a subsystem that was never the constraint changes nothing visible.
 * Without the ratios in view that reads as a bug rather than as the model
 * working.
 */
export interface MachiningReading {
  carId: string
  engineCharacter: EngineCharacter
  stockPowerPs: number
  powerPs: number
  authenticity: number
  reliabilityStat: number
  ratios: Record<Subsystem, number>
  verdict: SupportVerdict
  slots: readonly MachiningSlotRow[]
}

export function machiningReadingFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  context: SimContext,
): MachiningReading {
  const character = engineCharacterOf(model, economy)
  const stats = computeDerivedStats(model, car, partsById, partsTaxonomy, economy)
  const slots = machinableSlots(economy).map((carPartId) =>
    slotRowFor(car, model, carPartId, character, state, partsById, economy, context),
  )
  return {
    carId: car.id,
    engineCharacter: character,
    stockPowerPs: model.spec.stockPowerPs,
    powerPs: stats.power,
    authenticity: authenticityPercentOf(car, model, partsById, partsTaxonomy, economy),
    reliabilityStat: stats.reliability,
    ratios: supportRatios(car, model, partsById, economy),
    verdict: supportVerdict(car, model, partsById, economy),
    slots,
  }
}

function slotRowFor(
  car: CarInstance,
  model: CarModel,
  carPartId: CarPartId,
  character: EngineCharacter,
  state: GameState,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
  context: SimContext,
): MachiningSlotRow {
  const installed = car.parts[carPartId].installed
  const part = (installed && partsById[installed.partId]) || null
  const applied = machiningOf(installed).slice()
  const gradeMultiplier = part ? economy.machining.gradeMultiplier[part.grade] : 0
  const wear = installed ? bandFactor(installed.band, economy) : 0
  const offers = machiningOperationsForSlot(carPartId, economy).map((operation) => {
    const powerFraction = operation.powerFraction[character] * gradeMultiplier * wear
    return {
      operation,
      powerPs: model.spec.stockPowerPs * powerFraction,
      powerFraction,
      spec: operation.spec,
      authenticityCost: part?.grade === 'stock' ? operation.authenticityCost : 0,
      labourPoints: operation.labourPoints,
      reliabilityCost: economy.machining.reliabilityCostPerOperation,
      applied: applied.includes(operation.id),
      gateReason: machiningGateReason(state, car.id, operation.id, context),
    }
  })
  return { carPartId, part, band: installed?.band ?? null, applied, offers }
}
