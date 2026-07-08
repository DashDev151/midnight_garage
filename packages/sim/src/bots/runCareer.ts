import type { GameState, ReputationTier } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { advanceDay } from '../advanceDay'
import type { SimContext } from '../context'
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
 * Balance-harness finding (Sprint 03): 100 days of WEEKLY_RENT_YEN
 * (Y1,260,000) almost exactly consumes the original economy-v0.md draft
 * of Y1,200,000, leaving zero operating margin for any strategy — even
 * one with genuinely profitable trades goes under from a single bad run
 * or a slow start. Bumped to give real working capital; economy-v0.md
 * updated to match.
 */
const STARTING_CASH_YEN = 1_500_000

export function createInitialCareerState(context: SimContext, seed: number): GameState {
  return {
    day: 1,
    seed,
    cashYen: STARTING_CASH_YEN,
    reputationTier: 'unknown',
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: Object.fromEntries(context.models.map((model) => [model.id, 100])),
    activeAuctionLots: [],
    activeListings: [],
  }
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
  let state = createInitialCareerState(context, seed)
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
