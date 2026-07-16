import { z } from 'zod'
import {
  CarPartIdSchema,
  ComponentIdSchema,
  ConditionBandSchema,
  ReputationTierSchema,
} from './tags'
import { ToolTierSchema, ToolTiersSchema } from './toolLines'
import { CarInstanceSchema } from './carInstance'
import { PartInstanceSchema, PendingPartOrderSchema } from './part'
import { StaffMemberSchema } from './staff'
import { JobKindSchema, JobSchema } from './job'
import { AuctionLotSchema, AuctionTierSchema } from './auction'
import { ForSaleEntrySchema, PendingSaleOfferSchema, SaleChannelSchema } from './sale'
import { ServiceJobSchema } from './serviceJob'
import { BayKindSchema } from './facilities'
import { StagedActionSchema } from './stagedWork'

/**
 * Sprint 21: the two exponentially-decayed counters `marketHeat.ts`'s
 * weekly supply/demand update reads - `lotSupply` (fresh auction lots of
 * this model, bumped on catalog refresh) and `playerSales` (the player's own
 * resolved sales of this model, bumped on offer acceptance). Plain
 * `Record<modelId, number>` maps, default `{}` for both - a model with no
 * entry simply hasn't had a lot or a sale counted yet.
 */
export const MarketLedgerSchema = z.object({
  lotSupply: z.record(z.string(), z.number()).default({}),
  playerSales: z.record(z.string(), z.number()).default({}),
})

export type MarketLedger = z.infer<typeof MarketLedgerSchema>

/**
 * Sprint 42 (the flip ledger): one owned car's money-in record - what it
 * cost to acquire (auction win or buyout hammer price), plus every yen sunk
 * into it since (repairs, installed parts). Pure bookkeeping: recording this
 * never changes an economic outcome, it only surfaces money that already
 * moves through the existing resolvers (auction/buyout, repair-job creation,
 * install completion). `purchaseYen: null` means unknown - a pre-Sprint-42
 * save's already-owned cars, or a dev-granted car - so the panel shows "-"
 * rather than fabricating a number.
 */
export const CarLedgerSchema = z.object({
  purchaseYen: z.number().int().nonnegative().nullable(),
  repairYen: z.number().int().nonnegative().default(0),
  partsYen: z.number().int().nonnegative().default(0),
})

/**
 * Sprint 57: the same repairYen/partsYen shape as `CarLedgerSchema`, at job
 * scope instead of car scope - what the player actually spent on a customer's
 * service job (repair charges fronted on their car, parts installed at their
 * paid price), keyed by job id. No `purchaseYen`: a service job has no
 * acquisition cost. Created lazily (a job with no entry has spent nothing
 * yet) and deleted at close-out (`resolveServiceJob`), same lifecycle as
 * `CarLedgerSchema` minus the "created at acquisition" step.
 */
export const ServiceJobLedgerSchema = z.object({
  repairYen: z.number().int().nonnegative().default(0),
  partsYen: z.number().int().nonnegative().default(0),
})

export type ServiceJobLedger = z.infer<typeof ServiceJobLedgerSchema>

export type CarLedger = z.infer<typeof CarLedgerSchema>

/**
 * Sprint 52 decision 2: the one live used-machinery classified listing, if
 * any - reputation gates which tool tiers are ELIGIBLE (Sprint 43,
 * unchanged), but only a listing for this exact `componentId`+`tier` makes
 * it actually PURCHASABLE (`applyToolUpgrade`, toolLines.ts). `priceYen` is
 * captured at listing time (the tier's own `upgradePriceYen`, which never
 * changes mid-career, but locking it here keeps the listing self-contained).
 * At most one live at a time by construction (`GameState.machineListing` is
 * a single nullable field, never a list).
 */
export const MachineListingSchema = z.object({
  componentId: ComponentIdSchema,
  tier: ToolTierSchema,
  priceYen: z.number().int().nonnegative(),
  postedOnDay: z.number().int().positive(),
  expiresOnDay: z.number().int().positive(),
})

export type MachineListing = z.infer<typeof MachineListingSchema>

/**
 * Sprint 74 (diagnosis II): an active yard inspection visit, at one auction
 * tier - `beginInspectionVisit` (`diagnosis.ts`) stamps this once the 1-slot
 * cost + tiered `travelFeeYenByTier` fee are both paid; `runDiagnosticTest`
 * decrements `minutesLeft` per test run. At most one live at a time
 * (`GameState.inspectionVisit` is a single nullable field, mirroring
 * `MachineListingSchema`'s own "one live at a time" shape above).
 */
export const InspectionVisitSchema = z.object({
  tier: AuctionTierSchema,
  minutesLeft: z.number().int().nonnegative(),
})

export type InspectionVisit = z.infer<typeof InspectionVisitSchema>

/**
 * Sprint 76 (story missions I): one campaign mission's live progress - the
 * mission itself (`StoryMission`, content) is static; this is the only part
 * that changes across a career. Absent from `GameState.storyMissions`
 * entirely means locked (never yet reached its `gateReputationPoints`, or an
 * earlier mission in the strictly linear order still isn't `delivered`). At
 * most one `offered`/`active` record exists at any time (`advanceDay`'s
 * mission hook, `missions.ts`). `acceptedOnDay`/`dueOnDay` stamp at accept;
 * `reofferOnDay` stamps at lapse and clears (back to `null`) the moment the
 * mission returns to `offered`.
 */
export const StoryMissionRecordSchema = z.object({
  missionId: z.string().min(1),
  status: z.enum(['offered', 'active', 'delivered', 'lapsed']),
  acceptedOnDay: z.number().int().positive().nullable(),
  dueOnDay: z.number().int().positive().nullable(),
  reofferOnDay: z.number().int().positive().nullable(),
})

export type StoryMissionRecord = z.infer<typeof StoryMissionRecordSchema>

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
  /**
   * Specialty (Sprint 38, progression bible's horizontal axis): per-
   * discipline word of mouth, earned from completed service-job work in
   * that group (`resolveServiceJob`, serviceJobs.ts). Reputation gates
   * BREADTH; specialty gates DEPTH (offer bias, in-lane payout premium) -
   * never the same reward twice (bible law 3). Purely additive: a pre-v24
   * save simply never earned any, so it defaults all-zero, no migration.
   */
  specialty: z.record(ComponentIdSchema, z.number().int().nonnegative()).default({
    engine: 0,
    drivetrain: 0,
    suspension: 0,
    wheels: 0,
    body: 0,
    interior: 0,
  }),
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
  /**
   * Cars the player has toggled "taking offers" on (Sprint 31) - replaces
   * `activeListings`. Purely additive for the save law's sake, but the
   * migration is not: see `saveCodec.ts`'s v19 -> v20 entry for how an old
   * save's pending listings are resolved rather than silently dropped.
   */
  carsForSale: z.array(ForSaleEntrySchema).default([]),
  /**
   * Today's drawn offers (Sprint 31) - at most one per for-sale car,
   * completely replaced (not accumulated) by advanceDay's daily offer-draw
   * step every day, so an unaccepted offer never survives past End Day.
   */
  pendingOffers: z.array(PendingSaleOfferSchema).default([]),
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
   * Sprint 45: the one "double parking" overflow slot - always exactly one
   * slot past whatever real parking/service-bay capacity the player
   * currently owns, never purchasable or expandable. A car lands here only
   * when both `parkingCarIds` and `serviceBayCarIds` are full at acquisition
   * time (`facilities.ts`'s `assignToShop`); occupying it costs a daily fine
   * (`resolveGraceParking`) until real capacity opens up or the car leaves
   * the shop entirely. `null` when nothing is double-parked - the common
   * case. Purely additive.
   */
  graceParkingCarId: z.string().min(1).nullable().default(null),
  /**
   * Labor slots already spent today (Sprint 11). Instant actions (repair,
   * install, inspect) decrement against `availableLaborSlots(state) -
   * laborSlotsSpentToday` the moment they're clicked, instead of a
   * client-only queue deciding allocation at End Day. Reset to 0 by
   * advanceDay's day-boundary tick.
   */
  laborSlotsSpentToday: z.number().int().nonnegative().default(0),
  /**
   * The shop's current tier per tool line (Sprint 36 - replaces the
   * Sprint 13 binary equipment-ownership model). Tier IS the
   * repair level (`bands.ts`'s `repairLevelForGroup`); all six lines start
   * at 1. Not defaulted: the v22 -> v23 save migration reconstructs it from
   * a legacy save's owned machines (see `saveCodec.ts`).
   */
  toolTiers: ToolTiersSchema,
  /**
   * Standard-delivery part purchases in transit (Sprint 14) - resolved by
   * advanceDay's day-boundary tick once `arrivesOnDay` is reached, the same
   * "due today resolves" shape `resolveServiceJobArrivals` uses. Purely
   * additive.
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
   * (Sprint 14). Every car-exit path (a sold car, service-job resolution)
   * drops its entry so staged work never outlives the car.
   */
  stagedCarWork: z.record(z.string(), z.array(StagedActionSchema)).default({}),
  /**
   * Sprint 42 (the flip ledger): per-owned-car spend record, keyed by
   * carInstanceId - created at acquisition (auction win/buyout), updated by
   * repair charges and part installs, deleted at sale. Entries exist only
   * for owned cars, never customer service-job cars (never ours). A car with
   * no entry (a pre-v25 save's already-owned cars, a dev grant) reads as
   * unknown-purchase, not a fabricated zero - see `CarLedgerSchema` above.
   */
  carLedgers: z.record(z.string(), CarLedgerSchema).default({}),
  /**
   * Sprint 52 decision 2: the current classifieds listing, if any - `null`
   * is the common case (nothing on offer right now). Purely additive.
   */
  machineListing: MachineListingSchema.nullable().default(null),
  /**
   * The day the NEXT listing is due to roll (`rollMachineListings`,
   * toolLines.ts) - `null` while a listing is live (nothing to schedule
   * yet) or before anything has ever become tier-eligible (the gap timer
   * only starts once there's a real candidate, so reaching a reputation
   * milestone never instantly cashes in a silently-elapsed wait). Purely
   * additive.
   */
  nextMachineListingDay: z.number().int().positive().nullable().default(null),
  /**
   * Sprint 57: per-active-service-job spend record, keyed by job id -
   * created lazily by the two charge sites (a customer-car repair charge, an
   * install completion at the part's own paid price), read and deleted at
   * close-out (`resolveServiceJob`) so the completion report can show what
   * the player actually paid rather than a catalog-price reconstruction.
   * Purely additive.
   */
  serviceJobLedgers: z.record(z.string(), ServiceJobLedgerSchema).default({}),
  /**
   * Sprint 74 (diagnosis II): the yard inspection visit - one active visit
   * at a single auction tier, `minutesLeft` ticking down as
   * `runDiagnosticTest` spends them. `null` when no visit is active (the
   * common case, and always true at day start). Cleared unconditionally by
   * advanceDay's day-boundary tick, the same "dies at day end" treatment
   * `laborSlotsSpentToday`'s reset already gives labour - minutes spent
   * chasing a lot that sells to someone else overnight are simply spent, no
   * carry-over negotiation. Purely additive.
   */
  inspectionVisit: InspectionVisitSchema.nullable().default(null),
  /**
   * Sprint 76 (story missions I): the hand-authored campaign's live progress,
   * one record per mission that has ever left `locked` - see
   * `StoryMissionRecordSchema` above. Purely additive.
   */
  storyMissions: z.array(StoryMissionRecordSchema).default([]),
})

/**
 * Sim contract: advanceDay(state, actions, seed) -> newState + eventLog.
 * DayLog is that eventLog - a typed record of what happened on a day, not
 * part of GameState itself.
 */
export const DayLogEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rent-paid'), amountYen: z.number().int() }),
  /** Sprint 45: the daily cost of leaving `carInstanceId` in the grace/
   * "double parking" overflow slot - charged instead of, never alongside,
   * `car-moved` on any given day for that car (the migration check runs
   * first; a car that moves into real capacity is never also fined the same
   * day). */
  z.object({
    type: z.literal('double-parking-fine'),
    carInstanceId: z.string().min(1),
    amountYen: z.number().int().nonnegative(),
  }),
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
    /** Sprint 40 sanction: `jobs.ts`'s `findOrCreateJob` already emits this
     * (the repair/recondition consumables + banded-repair cost charged to
     * open the job) but the schema variant lacked the field - it survived
     * only via an untyped spread. No behavior change; Sprint 42's financial
     * ledger reads it. */
    costYen: z.number().int().nonnegative().optional(),
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
      /** Sprint 24 fix 2: the sim's own install-fit check refused a
       * part/component/model mismatch, independent of the UI's filter. */
      'part-does-not-fit',
      /** Sprint 37: the one own-car capability ceiling - converting a
       * factory-NA car to forced induction needs `economy.json`'s
       * `toolCeilings.naToTurboConversionEngineTier` (same vocabulary as the
       * Sprint 36 service-job accept refusal below). */
      'tool-tier',
      /** A customer-owned tagged part (Sprint 35 decision 2) can only be
       * reinstalled onto the same customer's car it was pulled from - never
       * a different car, including the player's own (closes the close-out
       * escape gap flagged in TODO.md, fixed 2026-07-12). */
      'not-your-part',
      /** Sprint 71 (the teardown game): a `bolt-on`/`buried` part is bench-
       * only - an on-car repair-zone job addressed at one exact non-surface
       * slot is refused (`repairJobGate`); it must come off the car first. */
      'bench-only',
      /** Sprint 71: the symmetric blocker rule - a slot with anything still
       * installed in its `blockedBy` list refuses install just as it refuses
       * uninstall, reassembly order matters (`installFitGate`). */
      'blocked-by',
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
  z.object({
    type: z.literal('auction-bid-placed'),
    lotId: z.string().min(1),
    maxBidYen: z.number().int().positive(),
  }),
  /**
   * Sprint 20 (auction rework II): the overnight-step "you were outbid"
   * beat - fires only when the dealers' raise displaces the player as
   * `leadingBidder` (never on a dealer-vs-dealer raise, which logs nothing).
   * `modelId`/`year` (Sprint 46) let the log name the car - the lot itself
   * is gone from state by the time this renders, so both are snapshotted
   * from `lot.car`/`model` at the point the entry is created, not resolved
   * later.
   */
  z.object({
    type: z.literal('auction-outbid'),
    lotId: z.string().min(1),
    newBidYen: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    year: z.number().int(),
  }),
  z.object({
    type: z.literal('auction-bid-won'),
    lotId: z.string().min(1),
    finalPriceYen: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    year: z.number().int(),
  }),
  z.object({
    type: z.literal('auction-bid-lost'),
    lotId: z.string().min(1),
    winningPriceYen: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    year: z.number().int(),
  }),
  z.object({
    type: z.literal('lot-bought-out'),
    lotId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    year: z.number().int(),
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
    /**
     * Sprint 57: what the player actually paid, read from the job's own
     * ledger (`ServiceJobLedgerSchema`) at close-out - never a catalog-price
     * reconstruction. Always present (0 when that kind of spend never
     * happened), so a repair-only job reports real numbers too, not just
     * install jobs.
     */
    repairCostYen: z.number().int().nonnegative(),
    partsCostYen: z.number().int().nonnegative(),
    /** Per-group specialty earned, split evenly across every distinct group
     * the job's tasks touched (`applySpecialtyDelta`) - untouched groups
     * are 0, not omitted. */
    specialtyGained: z.record(ComponentIdSchema, z.number().int()),
    /** `payoutYen - repairCostYen - partsCostYen`. */
    netProfitYen: z.number().int(),
    /** Days between acceptance and this completion, for the feedback modal. */
    daysSpent: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('service-job-failed'),
    jobId: z.string().min(1),
    reputationLost: z.number().int().nonnegative(),
    /** Sunk cost (Sprint 57): the same real spend a completed job reports,
     * shown even on a failure - honesty cuts both ways. */
    repairCostYen: z.number().int().nonnegative(),
    partsCostYen: z.number().int().nonnegative(),
    specialtyGained: z.record(ComponentIdSchema, z.number().int()),
    /** Always `<= 0`: `-repairCostYen - partsCostYen` (no payout on a failure). */
    netProfitYen: z.number().int(),
  }),
  /**
   * Sprint 72 decision 5: customer-origin parts leave with their car at
   * close-out, paid or failed alike - the receipt line naming what went
   * with them. `parts` are display strings ("<brand> <name>"), not ids: the
   * instances themselves leave `partInventory` in this same step and could
   * never be looked back up afterward. Omitted entirely when nothing
   * customer-owned was ever pulled.
   */
  z.object({
    type: z.literal('service-parts-returned'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
    parts: z.array(z.string().min(1)),
  }),
  /**
   * Sprint 31: a for-sale car drew a live offer, valid today only - the
   * day-report/offers-panel line ("A tuner is offering ... Today only").
   * `modelId` is a snapshot (mirrors the old `PublicListing.modelId`'s own
   * reasoning) purely so the UI can name the car without a second lookup;
   * unlike the old listing, the car itself never leaves `ownedCars`.
   */
  z.object({
    type: z.literal('offer-received'),
    carInstanceId: z.string().min(1),
    modelId: z.string().min(1),
    buyerId: z.string().min(1),
    priceYen: z.number().int().positive(),
  }),
  /**
   * Sprint 68 decision 3 (playtest item 21): the player turned an offer down.
   * The car stays listed, so tomorrow's draw can bring a better one. No
   * reputation field, deliberately - turning down a lowball is not a slight,
   * and there is no delta to record.
   */
  z.object({
    type: z.literal('offer-rejected'),
    carInstanceId: z.string().min(1),
    modelId: z.string().min(1),
    buyerId: z.string().min(1),
    priceYen: z.number().int().positive(),
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
    /** Sprint 42: `priceYen` minus the sold car's ledger (purchase + repairs
     * + parts) - set only when that car's `purchaseYen` was known. Absent
     * for an unknown-purchase car (never fabricated) and for any pre-v25
     * sale (the field didn't exist yet). */
    profitYen: z.number().int().optional(),
    /**
     * Sprint 75 decision 2 (the organic teacher): a fully-interpolated,
     * ready-to-render one-line reveal - set only when the sold car still
     * carried an unresolved symptom (`remainingCauseIds.length > 1` on at
     * least one). Absent for an honest sale or one already fully resolved
     * (nothing left to teach).
     */
    saleRevealLine: z.string().min(1).optional(),
  }),
  /** Sprint 71 (the teardown game): the whole car scrapped at once, shell and
   * all - `carPartIds` lists every slot that was still installed and went
   * down with it (an empty array if the car had already been stripped bare).
   * Removes the car from `ownedCars` entirely, unlike a `car-sold` sale. */
  z.object({
    type: z.literal('shell-scrapped'),
    carInstanceId: z.string().min(1),
    modelId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
    carPartIds: z.array(CarPartIdSchema),
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
  /** Sprint 26 decision 6: a scrap `PartInstance` sold for scrap value - the
   * only action available on it, since it can never be reinstalled. */
  z.object({
    type: z.literal('part-scrapped'),
    partInstanceId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /** Sprint 71 (the teardown game): a used, non-scrap loose `PartInstance`
   * sold at the donor-economy haircut (`economy.teardown.usedPartSaleFraction`)
   * - the every-day counterpart to `part-scrapped`, for a part still good
   * enough to be worth more than scrap value. */
  z.object({
    type: z.literal('part-sold'),
    partInstanceId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /** Sprint 35 decision 4: a loose inventory `PartInstance` finished
   * reconditioning - climbed to `band` through the same banded-repair economy
   * as an on-car repair. The completion counterpart to a car job's
   * `job-completed` (which carries a `carInstanceId` a loose part has no
   * equivalent of). */
  z.object({
    type: z.literal('part-reconditioned'),
    partInstanceId: z.string().min(1),
    band: ConditionBandSchema,
  }),
  /**
   * Sprint 32 decision 7: pulled `carPartId`'s installed part into
   * inventory. Removing an aftermarket part reverts the slot to a fresh
   * stock part (still filled); removing a stock part leaves the slot
   * genuinely empty (missing).
   */
  z.object({
    type: z.literal('part-removed'),
    carInstanceId: z.string().min(1),
    carPartId: CarPartIdSchema,
    partInstanceId: z.string().min(1),
    /** Sprint 74 decision 4: set when this removal collapsed one of the
     * car's symptoms down to exactly one remaining cause - the id of the
     * now-revealed true cause, so `describeLogEntry` can render "Opened it
     * up: <label>." Absent when this removal revealed nothing (an honest
     * car, or a symptom this part doesn't target). */
    revealedCauseId: z.string().min(1).optional(),
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
    /** `no-space` (renamed from `no-parking` in Sprint 45): parking, every service bay, AND the
     * one grace/"double parking" overflow slot are all full - genuinely nowhere to put the car.
     * No money spent, the win is forfeited rather than the purchase failing loudly.
     * `no-cash` (Sprint 19): a winning bid can no longer be covered on the lot's resolution
     * day - cash was reserved at bid time under the old instant-resolve model, but multi-day
     * bidding has no escrow, so affordability is only checked again when the lot actually
     * resolves. Mirrors `no-space`'s existing forfeit shape exactly: no money spent, the win
     * is forfeited rather than the purchase failing loudly.
     * `tool-tier` (Sprint 36): a service-job accept refused because at least one task's
     * `minToolTier` exceeds the line's current tier - replaces the old `no-equipment` refusal.
     * `technique` (Sprint 39): a signature template's `requiresTechnique` is no longer unlocked
     * at accept time (specialty dropped, or the offer is stale) - the technique-gated twin of
     * `tool-tier`. */
    reason: z.enum(['no-space', 'no-cash', 'tool-tier', 'technique']),
  }),
  /** Kept for old-log decode compatibility (Sprint 36 retired the buy-equipment
   * action itself; `tool-upgraded` below is its replacement). */
  z.object({
    type: z.literal('equipment-purchased'),
    equipmentId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /** Sprint 36: a tool line climbed one tier (the `upgradeToolLine` action). */
  z.object({
    type: z.literal('tool-upgraded'),
    componentId: ComponentIdSchema,
    toTier: ToolTierSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  /** Sprint 52 decision 2: a fresh used-machinery classified listing went
   * live today. */
  z.object({
    type: z.literal('machine-listed'),
    componentId: ComponentIdSchema,
    tier: ToolTierSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  /** Sprint 74 decision 1: `beginInspectionVisit` started a yard visit. */
  z.object({
    type: z.literal('inspection-visit'),
    tier: AuctionTierSchema,
    feeYen: z.number().int().nonnegative(),
    minutesGranted: z.number().int().positive(),
  }),
  /** Sprint 74 decision 3: `resolveOwnedWorkup` collapsed every one of this
   * owned car's symptoms to their true cause. */
  z.object({
    type: z.literal('car-workup'),
    carInstanceId: z.string().min(1),
  }),
  /** Sprint 76 decision 4: `resolveAcceptMission` - offered -> active. */
  z.object({
    type: z.literal('mission-accepted'),
    missionId: z.string().min(1),
    dueOnDay: z.number().int().positive(),
  }),
  /** Sprint 76 decision 4: `resolveDeliverMission` paid out (+ tip, if
   * earned) and applied the reputation/specialty reward. */
  z.object({
    type: z.literal('mission-delivered'),
    missionId: z.string().min(1),
    payoutYen: z.number().int().nonnegative(),
    tipYen: z.number().int().nonnegative(),
    reputationGained: z.number().int().nonnegative(),
    specialtyGained: z.record(ComponentIdSchema, z.number().int()),
  }),
  /** Sprint 76 decision 4: an active mission passed its `dueOnDay` unbuilt -
   * the player keeps the car; the reputation penalty and a future
   * `reofferOnDay` are the only consequence. */
  z.object({
    type: z.literal('mission-lapsed'),
    missionId: z.string().min(1),
    reputationLost: z.number().int().nonnegative(),
    reofferOnDay: z.number().int().positive(),
  }),
  /** Sprint 76 decision 4: a lapsed mission's `reofferOnDay` arrived -
   * lapsed -> offered again, the campaign never dead-ends. */
  z.object({
    type: z.literal('mission-reoffered'),
    missionId: z.string().min(1),
  }),
])

export const DayLogSchema = z.array(DayLogEntrySchema)

export type GameState = z.infer<typeof GameStateSchema>
export type DayLogEntry = z.infer<typeof DayLogEntrySchema>
export type DayLog = z.infer<typeof DayLogSchema>
