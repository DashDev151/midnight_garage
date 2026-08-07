import type {
  CarInstance,
  CarModel,
  CarPartId,
  ComponentId,
  ConditionBand,
  DayLogEntry,
  GameState,
  SellingChannelId,
  StagedAction,
} from '@midnight-garage/content'
import {
  confirmStagedWork,
  energyMax,
  resolveBuyPart,
  resolveFittedMachiningLabor,
  resolveHireMachineLine,
  resolveRemovePart,
  resolveSetForSale,
  type SimContext,
} from '@midnight-garage/sim'
import { BENCH_CAR_ID } from './economyBench'
import { benchValueYen } from './economyBenchReadout'
import { describeLogEntry } from '../../utils/dayLogFormat'

/**
 * THE ECONOMY BENCH'S ACTIONS.
 *
 * Every action here is the REAL resolver, not a shortcut. Fitting a part
 * stages an install and runs `confirmStagedWork`, exactly as the workshop
 * floor's Confirm does. Repairing stages a repair and runs the same function.
 * Machining runs the machining resolver. Nothing bypasses a gate, so a refusal
 * on the bench is the refusal the player would get.
 *
 * The value delta on each line is `marketValueYen` after minus before. That is
 * exact by construction, because it IS the difference: no attribution, no
 * decomposition, no error.
 */

export type BenchAction =
  | { kind: 'buy-part'; partId: string }
  | { kind: 'fit-part'; partInstanceId: string; carPartId: CarPartId }
  | { kind: 'remove-part'; carPartId: CarPartId }
  | { kind: 'repair'; componentId: ComponentId; carPartId?: CarPartId; targetBand: ConditionBand }
  | { kind: 'machine-fitted'; operationId: string }
  | { kind: 'hire-machine-line'; group: ComponentId }
  | { kind: 'list-for-sale'; channelId: SellingChannelId }
  | { kind: 'delist' }
  | { kind: 'refill-labour' }

interface Resolution {
  state: GameState
  log: DayLogEntry[]
}

/** Today's labour still in the pool - the same figure the game store passes
 * every resolver. */
export function labourRemaining(state: GameState, context: SimContext): number {
  return Math.max(0, energyMax(state, context.economy) - state.energySpentToday)
}

/** Stages one action on the bench car and resolves it through Confirm - the
 * install and repair path the workshop floor uses, with the bench's own
 * single-action list in place of a player's queue. */
function stageAndConfirm(state: GameState, action: StagedAction, context: SimContext): Resolution {
  const staged: GameState = {
    ...state,
    stagedCarWork: { ...state.stagedCarWork, [BENCH_CAR_ID]: [action] },
  }
  return confirmStagedWork(staged, BENCH_CAR_ID, labourRemaining(staged, context), context)
}

function resolveBenchAction(
  state: GameState,
  action: BenchAction,
  context: SimContext,
): Resolution {
  switch (action.kind) {
    case 'buy-part':
      return resolveBuyPart(state, action.partId, context, 'express')
    case 'fit-part': {
      const group = context.partsTaxonomyById[action.carPartId]?.group
      if (!group) return { state, log: [] }
      return stageAndConfirm(
        state,
        {
          kind: 'install',
          componentId: group,
          partInstanceId: action.partInstanceId,
          carPartId: action.carPartId,
        },
        context,
      )
    }
    case 'remove-part':
      return resolveRemovePart(
        state,
        BENCH_CAR_ID,
        action.carPartId,
        context,
        labourRemaining(state, context),
      )
    case 'repair':
      return stageAndConfirm(
        state,
        {
          kind: 'repair',
          componentId: action.componentId,
          targetBand: action.targetBand,
          ...(action.carPartId ? { carPartId: action.carPartId } : {}),
        },
        context,
      )
    case 'machine-fitted':
      return resolveFittedMachiningLabor(
        state,
        BENCH_CAR_ID,
        action.operationId,
        labourRemaining(state, context),
        context,
      )
    case 'hire-machine-line':
      return resolveHireMachineLine(state, action.group, context)
    case 'list-for-sale':
      return resolveSetForSale(state, BENCH_CAR_ID, true, context, action.channelId)
    case 'delist':
      return resolveSetForSale(state, BENCH_CAR_ID, false, context)
    // The dev console's own labour refill, so a bench session is not rationed
    // by a day it never ends. Labour is pacing, never a yen, so this can move
    // no figure on the screen.
    case 'refill-labour':
      return { state: { ...state, energySpentToday: 0 }, log: [] }
  }
}

/** One line on the running log. */
export interface BenchLogLine {
  action: BenchAction
  /** What the action was, in the bench's own words. */
  label: string
  valueBeforeYen: number
  valueAfterYen: number
  /** `marketValueYen` after minus before. Exact by construction. */
  deltaYen: number
  cashDeltaYen: number
  labourSpent: number
  /** The sim's own log entries, already worded. */
  notes: string[]
  /**
   * Why nothing happened, in the sim's own words where it gave any. Present
   * only when the action changed nothing at all.
   */
  refusal?: string
}

export interface BenchActionResult {
  state: GameState
  entries: DayLogEntry[]
  line: BenchLogLine
}

/** How the bench names each action on the log. */
export function benchActionLabel(
  action: BenchAction,
  context: SimContext,
  partName: (partId: string) => string,
): string {
  switch (action.kind) {
    case 'buy-part':
      return `Bought ${partName(action.partId)}`
    case 'fit-part':
      return `Fitted the ${context.partsTaxonomyById[action.carPartId]?.displayName ?? action.carPartId}`
    case 'remove-part':
      return `Removed the ${context.partsTaxonomyById[action.carPartId]?.displayName ?? action.carPartId}`
    case 'repair': {
      const where = action.carPartId
        ? (context.partsTaxonomyById[action.carPartId]?.displayName ?? action.carPartId)
        : action.componentId
      return `Repaired the ${where} to ${action.targetBand}`
    }
    case 'machine-fitted': {
      const operation = context.economy.machining.operations.find(
        (o) => o.id === action.operationId,
      )
      return `Set up: ${operation?.displayName ?? action.operationId}`
    }
    case 'hire-machine-line':
      return `Hired the ${action.group} line for the day`
    case 'list-for-sale':
      return `Listed on ${action.channelId}`
    case 'delist':
      return 'Took the car off the market'
    case 'refill-labour':
      return 'Refilled the labour pool'
  }
}

/**
 * Runs one action and measures what it did to the car's price.
 *
 * The measurement is the whole method: read `marketValueYen` before, run the
 * real resolver, read it after. Nothing is attributed and nothing is modelled,
 * so the figure cannot be wrong about anything except by the sim being wrong
 * about the price itself.
 */
export function runBenchAction(
  state: GameState,
  model: CarModel,
  action: BenchAction,
  context: SimContext,
  partName: (partId: string) => string,
  resolveModelName: (modelId: string) => string,
): BenchActionResult {
  const carBefore = state.ownedCars.find((c) => c.id === BENCH_CAR_ID)
  const valueBeforeYen = carBefore ? benchValueYen(carBefore, model, state, context) : 0

  const { state: next, log } = resolveBenchAction(state, action, context)

  const carAfter: CarInstance | undefined = next.ownedCars.find((c) => c.id === BENCH_CAR_ID)
  const valueAfterYen = carAfter ? benchValueYen(carAfter, model, next, context) : 0
  // Staging an action and clearing it again always returns a fresh state
  // object, so identity is not the question. What was actually spent, moved or
  // said is.
  const changed =
    log.length > 0 ||
    carAfter !== carBefore ||
    next.cashYen !== state.cashYen ||
    next.energySpentToday !== state.energySpentToday ||
    next.partInventory !== state.partInventory ||
    next.carsForSale !== state.carsForSale
  const notes = log.map((entry) => describeLogEntry(entry, resolveModelName))

  return {
    state: next,
    entries: log,
    line: {
      action,
      label: benchActionLabel(action, context, partName),
      valueBeforeYen,
      valueAfterYen,
      deltaYen: valueAfterYen - valueBeforeYen,
      cashDeltaYen: next.cashYen - state.cashYen,
      labourSpent: next.energySpentToday - state.energySpentToday,
      notes,
      ...(changed
        ? {}
        : {
            refusal: notes[0] ?? 'Refused: the sim changed nothing and offered no reason for it.',
          }),
    },
  }
}
