import type { AuctionTier, GameState, VenueNameByTier } from '@midnight-garage/content'
import { currentGameYear } from './calendar'
import { refreshCatalogs } from './catalogs'
import type { SimContext } from './context'
import { createRng, hashStringToSeed } from './rng'
import { freshSpecialty, generateDailyServiceJobOffers } from './serviceJobs'
import { freshToolTiers } from './toolLines'
import { radialOffersGated } from './tutorial'

const VENUE_NAME_TIERS: readonly AuctionTier[] = [
  'local-yard',
  'regional',
  'premium',
  'collector-network',
]

/**
 * One rolled venue name per auction tier, seeded off the career `seed` but
 * through its OWN independent rng stream (`hashStringToSeed`, the same
 * per-concern-stream idiom used elsewhere in this codebase) rather than the
 * shared day-1 `rng` catalog generation already consumes - pure flavour, so
 * it must never shift a single auction/symptom roll it has nothing to do
 * with. Deterministic per seed: the same career seed always rolls the same
 * four names.
 */
function rollVenueNameByTier(context: SimContext, seed: number): VenueNameByTier {
  const rng = createRng(hashStringToSeed(`venue-names:${seed}`))
  const result = {} as Record<AuctionTier, string>
  for (const tier of VENUE_NAME_TIERS) {
    result[tier] = rng.pick(context.venueNames[tier])
  }
  return result as VenueNameByTier
}

export interface NewGameOptions {
  /** Builds this career as a guided-tutorial career, stamping
   * `tutorialStatus: 'active'` before day-1 board generation - both day-1
   * isolation rules (the Yuki-only job board and the no-second-Wagon-R
   * auction exclusion) are predicates applied at generation time, so the
   * intent must enter here rather than in `installTutorial` (run
   * afterwards by the game layer). */
  tutorial?: boolean
}

/**
 * The canonical day-1 GameState for a new career - used by both the
 * interactive game and the headless balance harness. Lives here rather
 * than in the bots module because a fresh game is not a "bot career".
 *
 * Day 1 is seeded with a real auction catalog and service-job offers
 * (never an empty board); the seed rng derives from the career `seed`
 * alone, so a given seed produces a fully reproducible opening board.
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
    venueNameByTier: rollVenueNameByTier(context, seed),
    // Genuinely-optional-key pattern (content gameState.ts): the key exists
    // only on a tutorial career, so bots/probes/tests stay untouched by any
    // tutorial machinery.
    ...(options.tutorial ? { tutorialStatus: 'active' as const } : {}),
  }

  // One rng stream for both, in sequence - the same "one rng per day, drawn
  // from for whichever concerns run" shape advanceDay itself uses. `base`
  // already carries the tutorial flag when asked for, so the catalog refresh
  // applies the tutorial-model exclusion to the day-1 batch.
  const rng = createRng(seed)
  const refresh = refreshCatalogs(base, context, base.day, rng)
  // A tutorial career's day-1 job board is Yuki-only - the same radial-offer
  // gate advanceDay applies at its daily generation point, applied to the seed
  // batch here.
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
