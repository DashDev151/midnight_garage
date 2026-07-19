import type { GameState } from '@midnight-garage/content'
import { currentGameYear } from './calendar'
import { refreshCatalogs } from './catalogs'
import type { SimContext } from './context'
import { createRng } from './rng'
import { freshSpecialty, generateDailyServiceJobOffers } from './serviceJobs'
import { freshToolTiers } from './toolLines'
import { radialOffersGated } from './tutorial'

export interface NewGameOptions {
  /**
   * Sprint 95: build this career as a guided-tutorial career, stamping
   * `tutorialStatus: 'active'` BEFORE the day-1 board generation below. The
   * intent has to enter here rather than in `installTutorial` (which the
   * game layer runs afterwards): both day-1 isolation rules - the Yuki-only
   * job board (decision 4) and the no-second-Wagon-R auction exclusion
   * (decision 5) - are predicates applied AT generation time, and a post-hoc
   * cleanup could empty the job board but could not un-generate a
   * tutorial-model lot without visibly thinning the opening auction board.
   * Passing the intent in routes the day-1 batch through the exact gates
   * every later day's generation uses: one mechanism, no cleanup path.
   */
  tutorial?: boolean
}

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
export function createInitialGameState(
  context: SimContext,
  seed: number,
  options: NewGameOptions = {},
): GameState {
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
    staffAds: [],
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
    energySpentToday: 0,
    toolTiers: freshToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
    assemblyInventory: [],
    // Genuinely-optional-key pattern (content gameState.ts): the key exists
    // only on a tutorial career, so bots/probes/tests stay untouched by any
    // tutorial machinery.
    ...(options.tutorial ? { tutorialStatus: 'active' as const } : {}),
  }

  // One rng stream for both, in sequence - the same "one rng per day, drawn
  // from for whichever concerns run" shape advanceDay itself uses. `base`
  // already carries the tutorial flag when asked for, so the catalog refresh
  // applies the Sprint 95 tutorial-model exclusion to the day-1 batch.
  const rng = createRng(seed)
  const refresh = refreshCatalogs(base, context, base.day, rng)
  // Sprint 95 decision 4: a tutorial career's day-1 job board is Yuki-only -
  // the same radial-offer gate advanceDay applies at its daily generation
  // point, applied to the seed batch here.
  const serviceJobOffers = radialOffersGated(base)
    ? []
    : generateDailyServiceJobOffers(
        context,
        base.day,
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
