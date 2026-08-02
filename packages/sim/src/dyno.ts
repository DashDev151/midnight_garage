import type {
  CarInstance,
  CarModel,
  CarPartTaxonomyEntry,
  DayLogEntry,
  DynoState,
  EconomyConfig,
  EngineCharacter,
  GameState,
  Job,
  Part,
  Subsystem,
} from '@midnight-garage/content'
import type { SimContext } from './context'
import {
  computeDerivedStats,
  effectiveDisplacementCcOf,
  engineCharacterOf,
  reliabilityBreakdownOf,
  specificOutputOf,
  type ReliabilityBreakdown,
} from './derivedStats'
import { bookCashMovements } from './financeLedger'
import { applyAvailableLaborToJob, findWorkableCar, type LaborApplicationResult } from './jobs'
import { reputationAtLeast } from './reputation'
import { supportRatios, supportVerdict, type SupportVerdict } from './support'

/**
 * The rolling road. A dyno MEASURES and never changes: no reading here moves
 * a band, a stat, a price or a lap time, and the reliability an incoherent
 * build is already carrying is carried whether or not a session is ever paid
 * for. What a session buys is precision - the numbers behind the always-on
 * warning the car's own readout already shows.
 *
 * Structurally it is a workshop tool that is not a tool line: it belongs to no
 * `ComponentId`, so it carries its own record (`DynoStateSchema`) and its own
 * three economy values rather than a seventh column in the six-keyed
 * `toolLines.json`/`machineShopAssist.feeYenByGroup`. Behaviourally it is one
 * of them - hired for the day or bought outright, on the same day-stamp shape
 * `machineHirePaidDayByGroup` uses and the same reputation gate a tool tier
 * has.
 */

/** A shop with no dyno at all - what an absent `state.dyno` reads as. */
const NO_DYNO: DynoState = { owned: false, hirePaidDay: null, sessionCarId: null }

/** The shop's dyno record, defaulted for a state that has never had one (the
 * genuinely-optional-key pattern). Every reader below goes through this, so
 * absence is handled once. */
export function dynoStateOf(state: GameState): DynoState {
  return state.dyno ?? NO_DYNO
}

/** Whether the shop owns a dyno outright - the ownership half of "owned or
 * hired today", and the half that ends the hire fee for good. */
export function dynoOwned(state: GameState): boolean {
  return dynoStateOf(state).owned
}

/** Whether a portable dyno's hire has already been paid today. */
export function dynoHiredToday(state: GameState): boolean {
  return dynoStateOf(state).hirePaidDay === state.day
}

/** Whether the rollers are usable right now - owned outright, or hired for
 * today. The gate a session checks before it charges anything. */
export function hasDynoAccess(state: GameState): boolean {
  return dynoOwned(state) || dynoHiredToday(state)
}

/** The car currently strapped to the rollers, or `null` when the dyno is
 * empty. Cleared at the day boundary, so a session covers the day it was paid
 * for and no longer. */
export function dynoSessionCarId(state: GameState): string | null {
  return dynoStateOf(state).sessionCarId
}

/** Writes `dyno` back onto the state, preserving the fields not being moved. */
function withDyno(state: GameState, changes: Partial<DynoState>): GameState {
  return { ...state, dyno: { ...dynoStateOf(state), ...changes } }
}

/** Books `carInstanceId` onto the rollers - the whole effect of a completed
 * `dyno-session` job, and deliberately the whole of it: the car itself is
 * never touched. `completeJob` (jobs.ts) calls this and nothing else. */
export function recordDynoSession(state: GameState, job: Job): GameState {
  return withDyno(state, { sessionCarId: job.carInstanceId })
}

// --- buying one ----------------------------------------------------------

export type BuyDynoGateReason = 'already-owned' | 'reputation' | 'no-cash'

/**
 * Why buying a dyno is refused right now, or `null` when nothing refuses it.
 * The same three gates a tool tier's purchase has, minus the classifieds
 * listing: a dyno is bought from the trade rather than waited for.
 */
export function buyDynoGateReason(state: GameState, context: SimContext): BuyDynoGateReason | null {
  if (dynoOwned(state)) return 'already-owned'
  const { purchasePriceYen, minReputationTier } = context.economy.dyno
  if (!reputationAtLeast(state.reputationTier, minReputationTier)) return 'reputation'
  return state.cashYen < purchasePriceYen ? 'no-cash' : null
}

export interface BuyDynoResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * Buys the shop its own dyno outright - shop investment, never a running
 * cost, exactly as a tool tier's purchase is. Every gate refuses as a silent
 * no-op, matching `applyToolUpgrade`. Owning it ends the hire fee: every
 * later session is free of cash and costs only its labour.
 */
export function resolveBuyDyno(state: GameState, context: SimContext): BuyDynoResult {
  if (buyDynoGateReason(state, context) !== null) return { state, log: [], applied: false }
  const priceYen = context.economy.dyno.purchasePriceYen
  const log: DayLogEntry[] = [{ type: 'dyno-bought', priceYen }]
  const bought = withDyno({ ...state, cashYen: state.cashYen - priceYen }, { owned: true })
  return { state: bookCashMovements(bought, log, context.economy), log, applied: true }
}

// --- hiring one ----------------------------------------------------------

export type HireDynoGateReason = 'no-cash'

/**
 * Whether hiring a dyno in for today is blocked right now. Owning one, or a
 * day already paid for, is never blocked; the only real reason is short cash.
 * Modelled on `hireMachineLineGateReason` (jobs.ts).
 */
export function hireDynoGateReason(
  state: GameState,
  context: SimContext,
): HireDynoGateReason | null {
  if (hasDynoAccess(state)) return null
  return state.cashYen < context.economy.dyno.hireFeeYen ? 'no-cash' : null
}

export interface HireDynoResult {
  state: GameState
  log: DayLogEntry[]
  outcome: 'hired' | HireDynoGateReason
}

/**
 * Charges the day's hire the first time the rollers are needed on a given
 * day. Owning one, or a day already hired, is a silent no-op success - no
 * charge, nothing recorded - so a second session the same day never pays
 * twice. The spend is a running cost, posted to the day report the way rent
 * and machine hire are and never to the ledger of the car being measured: the
 * day's dyno can read four cars, so charging it to one would be a fiction.
 */
export function resolveHireDyno(state: GameState, context: SimContext): HireDynoResult {
  if (hasDynoAccess(state)) return { state, log: [], outcome: 'hired' }
  const gateReason = hireDynoGateReason(state, context)
  if (gateReason) return { state, log: [], outcome: gateReason }
  const priceYen = context.economy.dyno.hireFeeYen
  const log: DayLogEntry[] = [{ type: 'dyno-hired', priceYen }]
  const hired = withDyno(
    { ...state, cashYen: state.cashYen - priceYen },
    { hirePaidDay: state.day },
  )
  return { state: bookCashMovements(hired, log, context.economy), log, outcome: 'hired' }
}

// --- running a session ---------------------------------------------------

/**
 * A session's own job id - one open session per car, so a repeat click
 * continues the same job rather than opening a second. Mirrors
 * `reconditionJobIdFor`'s deterministic-id contract (jobs.ts).
 */
export function dynoJobIdFor(carInstanceId: string): string {
  return `dyno-${carInstanceId}`
}

/** The labour one session costs: exactly one slot (GDD 5.4), in the same
 * energy points every other action spends. */
export function dynoSessionLabourPoints(economy: EconomyConfig): number {
  return economy.energy.pointsPerLabour
}

export type DynoSessionGateReason = 'not-found' | 'not-in-service-bay' | 'no-labour' | 'no-cash'

/**
 * Why a session on `carInstanceId` is refused right now, or `null` when
 * nothing refuses it. Checked before a yen moves, so a refusal never leaves a
 * paid-for session that cannot run: a hire buys ONE day, and a session that
 * has to wait for tomorrow's labour would be a day's fee for nothing.
 *
 * `laborAvailable` is today's remaining labour. A session is one slot and it
 * happens today or not at all - it is a car on the rollers for an afternoon,
 * not work that carries across days.
 */
export function dynoSessionGateReason(
  state: GameState,
  carInstanceId: string,
  laborAvailable: number,
  context: SimContext,
): DynoSessionGateReason | null {
  if (!findWorkableCar(state, carInstanceId)) return 'not-found'
  if (!state.serviceBayCarIds.includes(carInstanceId)) return 'not-in-service-bay'
  const job = state.jobs.find((j) => j.id === dynoJobIdFor(carInstanceId))
  const needed =
    (job?.laborSlotsRequired ?? dynoSessionLabourPoints(context.economy)) -
    (job?.laborSlotsSpent ?? 0)
  if (laborAvailable < needed) return 'no-labour'
  return hireDynoGateReason(state, context)
}

/**
 * Puts `carInstanceId` on the rollers: the day's hire if one is not already
 * owned or paid for, then one labour slot through the REAL job system - the
 * same `Job` shape, the same `state.jobs` list, the same
 * `applyAvailableLaborToJob` an on-car repair spends its labour through, and
 * the same `energySpentToday` accounting. The loose-part analogue is
 * `resolveReconditionLabor` (jobs.ts), built the same way for the same
 * reason: there is one job system and this is it.
 *
 * Completing the job books the car onto the rollers (`recordDynoSession`) and
 * does nothing else. Every band, stat and value on that car is identical
 * before and after, and the reading the screen then shows is derived live
 * from the car's current build rather than frozen - which is what a car
 * sitting on a set of rollers should read.
 *
 * Any refusal is a silent no-op with no cash spent (`dynoSessionGateReason`
 * is the one predicate, and the UI shows the same reason before the click).
 */
export function resolveDynoSession(
  state: GameState,
  carInstanceId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  if (dynoSessionGateReason(state, carInstanceId, laborAvailable, context) !== null) {
    return { state, log: [], laborSlotsUsed: 0 }
  }

  const jobId = dynoJobIdFor(carInstanceId)
  if (state.jobs.some((j) => j.id === jobId)) {
    return applyAvailableLaborToJob(state, jobId, laborAvailable, context)
  }

  const hire = resolveHireDyno(state, context)
  if (hire.outcome !== 'hired') return { state, log: [], laborSlotsUsed: 0 }

  const job: Job = {
    id: jobId,
    carInstanceId,
    kind: 'dyno-session',
    // A run on the rollers is engine work; `componentId` is required by the
    // job schema and this is the group it belongs to. Nothing branches on it
    // for this kind - a session repairs no group and installs into no slot.
    componentId: 'engine',
    laborSlotsRequired: dynoSessionLabourPoints(context.economy),
    laborSlotsSpent: 0,
  }
  const opened: GameState = { ...hire.state, jobs: [...hire.state.jobs, job] }
  const worked = applyAvailableLaborToJob(opened, jobId, laborAvailable, context)
  return { ...worked, log: [...hire.log, ...worked.log] }
}

// --- what a session reads ------------------------------------------------

/**
 * Everything a dyno session reports about a car, read from the sim's own
 * derivations and never recomputed here: `supportRatios`/`supportVerdict`
 * (the support model), `computeDerivedStats` (power as built),
 * `reliabilityBreakdownOf` (what reliability is carrying and why), and
 * `engineCharacterOf`/`specificOutputOf` (how the engine responds). This
 * interface is a projection of those four; if any of them moves, this moves
 * with it, which is the point.
 */
export interface DynoReading {
  engineCharacter: EngineCharacter
  /** PS per litre of EFFECTIVE displacement, or `null` for a model carrying
   * no displacement figure at all. */
  specificOutputPsPerLitre: number | null
  /** The car's literal swept capacity, and the figure the specific output is
   * actually measured against - different only on a rotary, where the
   * equivalency is what makes the number comparable. Both are reported so the
   * conversion is visible rather than silently applied. */
  displacementCc: number | null
  effectiveDisplacementCc: number | null
  rotaryEquivalent: boolean
  /** What the car left the factory with, and what it makes as built. */
  stockPowerPs: number
  powerPs: number
  /** All five subsystem ratios, and the weakest link among them. */
  ratios: Record<Subsystem, number>
  verdict: SupportVerdict
  /** The reliability stat itself, exactly as `computeDerivedStats` returns it
   * - the same number the car's radar chart and every buyer read. */
  reliabilityStat: number
  /** What that number is made of: the car's own ceiling and the three
   * independent things taking it below there. */
  reliability: ReliabilityBreakdown
}

export function dynoReadingFor(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): DynoReading {
  const specificOutput = specificOutputOf(model)
  const effectiveDisplacementCc = effectiveDisplacementCcOf(model)
  const displacementCc = model.spec.displacementCc ?? null
  const stats = computeDerivedStats(model, car, partsById, partsTaxonomy, economy)
  return {
    engineCharacter: engineCharacterOf(model, economy),
    specificOutputPsPerLitre: Number.isNaN(specificOutput) ? null : specificOutput,
    displacementCc,
    effectiveDisplacementCc: effectiveDisplacementCc ?? null,
    rotaryEquivalent:
      displacementCc !== null &&
      effectiveDisplacementCc !== undefined &&
      effectiveDisplacementCc !== displacementCc,
    stockPowerPs: model.spec.stockPowerPs,
    powerPs: stats.power,
    ratios: supportRatios(car, model, partsById, economy),
    verdict: supportVerdict(car, model, partsById, economy),
    reliabilityStat: stats.reliability,
    reliability: reliabilityBreakdownOf(car, model, partsById, partsTaxonomy, economy),
  }
}
