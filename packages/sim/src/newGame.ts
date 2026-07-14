import type { GameState } from '@midnight-garage/content'
import { currentGameYear } from './calendar'
import { refreshCatalogs } from './catalogs'
import { SERVICE_JOB_EXPIRY_DAYS } from './constants'
import type { SimContext } from './context'
import { createRng } from './rng'
import { freshSpecialty, generateDailyServiceJobOffers } from './serviceJobs'
import { freshToolTiers } from './toolLines'

/**
 * The canonical day-1 GameState for a new career - used by both the
 * interactive game (the Sprint 04 Pinia bridge) and the headless balance
 * harness. Lives here rather than in the bots module because a fresh game
 * is not a "bot career"; bots just happened to be the first caller.
 *
 * Sprint 10: day 1 is seeded with a real auction catalog (via the same
 * `refreshCatalogs` the weekly boundary uses) - a new career used to be
 * completely empty until day 7's first refresh, which meant every playtest
 * opened by "skip a week." Sprint 29: service-job offers are seeded
 * alongside it via the same daily-cadence generator `advanceDay`'s own daily
 * step calls, so day 1 isn't an empty job board either even though the
 * mechanic is now daily, not weekly. The seed rng is derived from the career
 * `seed` alone (day 1 has no prior day to fold in), so a given seed still
 * produces a fully reproducible opening board.
 */
export function createInitialGameState(context: SimContext, seed: number): GameState {
  const base: GameState = {
    day: 1,
    seed,
    cashYen: context.economy.STARTING_CASH_YEN,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: freshSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: Object.fromEntries(context.models.map((model) => [model.id, 100])),
    marketLedger: { lotSupply: {}, playerSales: {} },
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: context.facilities.service.startCount,
    parkingBayCount: context.facilities.parking.startCount,
    serviceBayCarIds: new Array<null>(context.facilities.service.startCount).fill(null),
    parkingCarIds: new Array<null>(context.facilities.parking.startCount).fill(null),
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    toolTiers: freshToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
  }

  // One rng stream for both, in sequence - the same "one rng per day, drawn
  // from for whichever concerns run" shape advanceDay itself uses.
  const rng = createRng(seed)
  const refresh = refreshCatalogs(base, context, base.day, rng)
  const serviceJobOffers = generateDailyServiceJobOffers(
    context,
    base.day,
    SERVICE_JOB_EXPIRY_DAYS,
    rng,
    currentGameYear(base.reputationTier),
    base.toolTiers,
    base.reputationTier,
    base.specialty,
  )
  return {
    ...base,
    activeAuctionLots: refresh.freshLots,
    serviceJobOffers,
  }
}
