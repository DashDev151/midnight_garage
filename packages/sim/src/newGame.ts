import type { GameState } from '@midnight-garage/content'
import type { SimContext } from './context'

/**
 * Balance-harness finding (Sprint 03): 100 days of WEEKLY_RENT_YEN
 * (Y1,260,000) almost exactly consumes the original economy-v0.md draft
 * of Y1,200,000, leaving zero operating margin for any strategy - even
 * one with genuinely profitable trades goes under from a single bad run
 * or a slow start. Bumped to give real working capital; economy-v0.md
 * updated to match.
 */
export const STARTING_CASH_YEN = 1_500_000

/**
 * The canonical day-1 GameState for a new career - used by both the
 * interactive game (the Sprint 04 Pinia bridge) and the headless balance
 * harness. Lives here rather than in the bots module because a fresh game
 * is not a "bot career"; bots just happened to be the first caller.
 */
export function createInitialGameState(context: SimContext, seed: number): GameState {
  return {
    day: 1,
    seed,
    cashYen: STARTING_CASH_YEN,
    reputationTier: 'unknown',
    reputationPoints: 0,
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: Object.fromEntries(context.models.map((model) => [model.id, 100])),
    activeAuctionLots: [],
    activeListings: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
  }
}
