import type { GameState } from '@midnight-garage/content'
import { refreshCatalogs } from './catalogs'
import type { SimContext } from './context'
import { createRng } from './rng'

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
 *
 * Sprint 10: day 1 is seeded with a real auction catalog and service-job
 * board (via the same `refreshCatalogs` the weekly boundary uses) — a new
 * career used to be completely empty until day 7's first refresh, which
 * meant every playtest opened by "skip a week." The seed rng is derived
 * from the career `seed` alone (day 1 has no prior day to fold in), so a
 * given seed still produces a fully reproducible opening board.
 */
export function createInitialGameState(context: SimContext, seed: number): GameState {
  const base: GameState = {
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
    serviceBayCount: context.facilities.service.startCount,
    parkingBayCount: context.facilities.parking.startCount,
    serviceBayCarIds: new Array<null>(context.facilities.service.startCount).fill(null),
    parkingCarIds: new Array<null>(context.facilities.parking.startCount).fill(null),
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
  }

  const refresh = refreshCatalogs(base, context, base.day, createRng(seed))
  return {
    ...base,
    activeAuctionLots: refresh.freshLots,
    serviceJobOffers: refresh.freshOffers,
  }
}
