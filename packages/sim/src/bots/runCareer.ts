import type { GameState, ReputationTier } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { advanceDay } from '../advanceDay'
import type { SimContext } from '../context'
import { createInitialGameState } from '../newGame'
import { createRng, type Rng } from '../rng'

export type BotStrategy = (state: GameState, context: SimContext, rng: Rng) => DayActions

export interface CareerSnapshot {
  day: number
  cashYen: number
  carsOwned: number
  /** Cash plus owned cars valued at book price — a simple, transparent proxy, not a real buyer valuation. */
  netWorthEstimateYen: number
  reputationTier: ReputationTier
}

/**
 * Plays one bot strategy for `days`, returning one snapshot per day. The
 * bot's own decision-making draws from a separate seeded RNG stream than
 * advanceDay's internal resolution (auction generation, the lemon rule,
 * market-heat drift) — both fully deterministic from the one career
 * `seed`, but never sharing draws with each other.
 */
export function runCareer(
  strategy: BotStrategy,
  seed: number,
  days: number,
  context: SimContext,
): CareerSnapshot[] {
  let state = createInitialGameState(context, seed)
  const snapshots: CareerSnapshot[] = []

  for (let day = 1; day <= days; day++) {
    const decisionRng = createRng(seed * 7919 + day)
    const actions = strategy(state, context, decisionRng)
    const result = advanceDay(state, actions, seed + state.day, context)
    state = result.state

    const carsBookValue = state.ownedCars.reduce((sum, car) => {
      const model = context.modelsById[car.modelId]
      return sum + (model?.bookValueYen ?? 0)
    }, 0)

    snapshots.push({
      day,
      cashYen: state.cashYen,
      carsOwned: state.ownedCars.length,
      netWorthEstimateYen: state.cashYen + carsBookValue,
      reputationTier: state.reputationTier,
    })
  }

  return snapshots
}
