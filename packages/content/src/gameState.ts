import { z } from 'zod'
import { ReputationTierSchema } from './tags'
import { CarInstanceSchema } from './carInstance'
import { PartInstanceSchema, PendingPartOrderSchema } from './part'
import { StaffMemberSchema } from './staff'
import { JobKindSchema, JobSchema } from './job'
import { AuctionLotSchema, AuctionTierSchema } from './auction'
import { PublicListingSchema, SaleChannelSchema } from './sale'
import { ServiceJobSchema } from './serviceJob'
import { BayKindSchema } from './facilities'
import { StagedActionSchema } from './stagedWork'

/**
 * Sprint 21: the two exponentially-decayed counters `marketHeat.ts`'s
 * weekly supply/demand update reads - `lotSupply` (fresh auction lots of
 * this model, bumped on catalog refresh) and `playerSales` (the player's own
 * resolved sales of this model, bumped on walk-in/listing resolution). Plain
 * `Record<modelId, number>` maps, default `{}` for both - a model with no
 * entry simply hasn't had a lot or a sale counted yet.
 */
export const MarketLedgerSchema = z.object({
  lotSupply: z.record(z.string(), z.number()).default({}),
  playerSales: z.record(z.string(), z.number()).default({}),
})

export type MarketLedger = z.infer<typeof MarketLedgerSchema>

export const GameStateSchema = z.object({
  day: z.number().int().min(1),
  seed: z.number().int(),
  cashYen: z.number().int(),
  /** Derived from reputationPoints (Sprint 15's deriveReputationTier) every
   * time the points change - never set directly anywhere else. */
  reputationTier: ReputationTierSchema,
  /** Accrued reputation points (Sprint 08 scaffold; Sprint 15 derives
   * reputationTier from this via applyReputationDelta). */
  reputationPoints: z.number().int().nonnegative().default(0),
  ownedCars: z.array(CarInstanceSchema).default([]),
  partInventory: z.array(PartInstanceSchema).default([]),
  staff: z.array(StaffMemberSchema).default([]),
  jobs: z.array(JobSchema).default([]),
  /** Demand index per CarModel id, base 100 (GDD 6.4). */
  marketHeat: z.record(z.string(), z.number()).default({}),
  /** Sprint 21: the supply/demand counters `marketHeat.ts`'s weekly update
   * reads to compute each model's target heat. Purely additive (v12 -> v13
   * save migration): a pre-v13 save never tracked these, so it defaults to
   * both counters empty - correct, since the concept didn't exist yet. */
  marketLedger: MarketLedgerSchema.default({ lotSupply: {}, playerSales: {} }),
  activeAuctionLots: z.array(AuctionLotSchema).default([]),
  activeListings: z.array(PublicListingSchema).default([]),
  /** Service jobs offered for the player to accept (GDD Act 1). */
  serviceJobOffers: z.array(ServiceJobSchema).default([]),
  /** Service jobs the player has accepted and is working. */
  activeServiceJobs: z.array(ServiceJobSchema).default([]),
  /**
   * Facilities (Sprint 09). Defaults here are the save-migration fallback for
   * pre-v3 saves that never had a bay system - kept in sync with
   * facilities.json's `startCount`s, which is what a genuinely new game reads
   * (see sim's createInitialGameState). Two sources of the same "1" / "3"
   * because they answer different questions (migrate an old save vs. seed a
   * new one), not duplication to clean up.
   */
  serviceBayCount: z.number().int().positive().default(1),
  parkingBayCount: z.number().int().positive().default(3),
  /**
   * Real, index-addressable service-bay slots (Sprint 17 positional fix):
   * `serviceBayCarIds[i]` is the car physically sitting in bay `i`, or
   * `null` if that bay is empty. Array length tracks `serviceBayCount`
   * exactly under normal play (`applyBayPurchase` appends a `null` slot
   * when a new bay is bought) - a car's specific bay is real, persisted
   * state now, not incidental array order recomputed by exclusion.
   */
  serviceBayCarIds: z.array(z.string().min(1).nullable()).default([]),
  /** The parking counterpart to `serviceBayCarIds` above - same shape, same
   * invariant (length tracks `parkingBayCount`). Before Sprint 17, "parking"
   * was never its own stored array - a car counted as parked purely by not
   * appearing in `serviceBayCarIds`, so a specific parking slot had no
   * identity a drag-and-drop could target or a player could rely on. */
  parkingCarIds: z.array(z.string().min(1).nullable()).default([]),
  /**
   * Labor slots already spent today (Sprint 11). Instant actions (repair,
   * install, inspect) decrement against `availableLaborSlots(state) -
   * laborSlotsSpentToday` the moment they're clicked, instead of a
   * client-only queue deciding allocation at End Day. Reset to 0 by
   * advanceDay's day-boundary tick.
   */
  laborSlotsSpentToday: z.number().int().nonnegative().default(0),
  /**
   * Ids of owned Equipment items (Sprint 13) - what REPAIR is gated on. Purely
   * additive: a pre-Sprint-13 save decodes with this defaulted to `[]`, which
   * is correct (no save ever owned equipment before this existed).
   */
  ownedEquipmentIds: z.array(z.string().min(1)).default([]),
  /**
   * Standard-delivery part purchases in transit (Sprint 14) - resolved by
   * advanceDay's day-boundary tick once `arrivesOnDay` is reached, exactly
   * like `activeListings`. Purely additive.
   */
  pendingPartOrders: z.array(PendingPartOrderSchema).default([]),
  /**
   * The player's parts-market cart (Sprint 14): part ids awaiting checkout,
   * repeats meaning quantity > 1. Deliberately persistent (survives a
   * reload) per the maintainer's explicit call, so it lives on GameState and
   * rides the existing autosave/save-code mechanism rather than a separate
   * one - inert to the sim, read/written only by the game layer.
   */
  cartPartIds: z.array(z.string().min(1)).default([]),
  /**
   * Staged (not-yet-confirmed) repair/install work per car (Sprint 18),
   * keyed by `carInstanceId`. Freely add/remove at zero cost - nothing here
   * touches cash, labor, or a real `Job` until `confirmStagedWork` resolves
   * it, mirroring the parts-market cart's own stage-then-confirm shape
   * (Sprint 14). Every car-exit path (walk-in sale, listing, service-job
   * resolution) drops its entry so staged work never outlives the car.
   */
  stagedCarWork: z.record(z.string(), z.array(StagedActionSchema)).default({}),
})

/**
 * Sim contract: advanceDay(state, actions, seed) -> newState + eventLog.
 * DayLog is that eventLog - a typed record of what happened on a day, not
 * part of GameState itself.
 */
export const DayLogEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rent-paid'), amountYen: z.number().int() }),
  z.object({
    type: z.literal('wage-paid'),
    staffId: z.string().min(1),
    amountYen: z.number().int(),
  }),
  z.object({
    type: z.literal('job-created'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
  }),
  z.object({
    type: z.literal('job-progress'),
    jobId: z.string().min(1),
    laborSlotsSpent: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('job-completed'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
  }),
  z.object({
    type: z.literal('job-blocked'),
    jobId: z.string().min(1),
    reason: z.enum([
      'slot-occupied',
      'not-in-service-bay',
      'equipment-missing',
      /** Sprint 24 fix 2: the sim's own install-fit check refused a
       * part/component/model mismatch, independent of the UI's filter. */
      'part-does-not-fit',
    ]),
  }),
  z.object({
    type: z.literal('labor-overbooked'),
    requestedSlots: z.number().int().positive(),
    availableSlots: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('service-bay-income'), amountYen: z.number().int() }),
  z.object({
    type: z.literal('market-heat-shift'),
    modelId: z.string().min(1),
    deltaPercent: z.number(),
  }),
  z.object({
    type: z.literal('auction-catalog-refreshed'),
    tier: AuctionTierSchema,
    lotCount: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('lot-inspected'), lotId: z.string().min(1) }),
  z.object({
    type: z.literal('auction-bid-placed'),
    lotId: z.string().min(1),
    maxBidYen: z.number().int().positive(),
  }),
  /**
   * Sprint 20 (auction rework II): the overnight-step "you were outbid"
   * beat - fires only when the dealers' raise displaces the player as
   * `leadingBidder` (never on a dealer-vs-dealer raise, which logs nothing).
   */
  z.object({
    type: z.literal('auction-outbid'),
    lotId: z.string().min(1),
    newBidYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('auction-bid-won'),
    lotId: z.string().min(1),
    finalPriceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('auction-bid-lost'),
    lotId: z.string().min(1),
    winningPriceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('lot-bought-out'),
    lotId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /**
   * Sprint 22: fires on handover ONLY when the car was bought uninspected
   * and rolled at least one hidden issue - inspecting beforehand means the
   * same facts were already on the auction screen, so there's no surprise
   * left to report.
   */
  z.object({
    type: z.literal('issues-discovered'),
    carInstanceId: z.string().min(1),
    issueIds: z.array(z.string().min(1)).min(1),
  }),
  /**
   * Sprint 22: a `fix-issue` job's completion - distinct from `job-completed`
   * (which still fires alongside it, per the existing job lifecycle) so the
   * day report/modal can name the fixed issue without every job-completion
   * consumer needing to know about issues at all.
   */
  z.object({
    type: z.literal('issue-fixed'),
    carInstanceId: z.string().min(1),
    issueId: z.string().min(1),
  }),
  z.object({
    type: z.literal('service-job-accepted'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
  }),
  z.object({
    type: z.literal('service-job-completed'),
    jobId: z.string().min(1),
    payoutYen: z.number().int().nonnegative(),
    reputationGained: z.number().int().nonnegative(),
    /** Set for install jobs only: the installed part's price and the resulting
     * profit (payoutYen - partCostYen). Absent for repair jobs (no part cost). */
    partCostYen: z.number().int().nonnegative().optional(),
    profitYen: z.number().int().optional(),
    /** Days between acceptance and this completion, for the feedback modal. */
    daysSpent: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('service-job-failed'),
    jobId: z.string().min(1),
    reputationLost: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('listing-created'),
    listingId: z.string().min(1),
    carInstanceId: z.string().min(1),
    askingPriceYen: z.number().int().positive(),
    resolvesOnDay: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('car-sold'),
    carInstanceId: z.string().min(1),
    channel: SaleChannelSchema,
    priceYen: z.number().int().nonnegative(),
    /** Set when the sale earned or cost reputation (Sprint 15's quality/lemon
     * rule); absent for a reputation-neutral plain sale. */
    reputationDelta: z.number().int().optional(),
    /** Which of the quality/lemon outcomes fired (Sprint 23 decision 1's
     * clean/concours split) - set exactly when `reputationDelta` is, lets the
     * day report name the bonus instead of just its point value. */
    saleQuality: z.enum(['lemon', 'clean', 'concours']).optional(),
  }),
  z.object({
    type: z.literal('part-bought'),
    partId: z.string().min(1),
    partInstanceId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('part-ordered'),
    orderId: z.string().min(1),
    partId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
    arrivesOnDay: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('part-delivered'),
    orderId: z.string().min(1),
    partId: z.string().min(1),
    partInstanceId: z.string().min(1),
  }),
  z.object({
    type: z.literal('car-moved'),
    carInstanceId: z.string().min(1),
    to: BayKindSchema,
  }),
  z.object({
    type: z.literal('cars-swapped'),
    serviceCarId: z.string().min(1),
    parkingCarId: z.string().min(1),
  }),
  z.object({
    type: z.literal('bay-purchased'),
    kind: BayKindSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('acquisition-blocked'),
    kind: z.enum(['auction-win', 'buyout', 'service-accept']),
    /** `no-cash` (Sprint 19): a winning bid can no longer be covered on the lot's resolution
     * day - cash was reserved at bid time under the old instant-resolve model, but multi-day
     * bidding has no escrow, so affordability is only checked again when the lot actually
     * resolves. Mirrors `no-parking`'s existing forfeit shape exactly: no money spent, the win
     * is forfeited rather than the purchase failing loudly. */
    reason: z.enum(['no-parking', 'no-equipment', 'no-cash']),
  }),
  z.object({
    type: z.literal('equipment-purchased'),
    equipmentId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
])

export const DayLogSchema = z.array(DayLogEntrySchema)

export type GameState = z.infer<typeof GameStateSchema>
export type DayLogEntry = z.infer<typeof DayLogEntrySchema>
export type DayLog = z.infer<typeof DayLogSchema>
