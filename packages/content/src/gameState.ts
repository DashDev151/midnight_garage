import { z } from 'zod'
import { BuyerArchetypeSchema } from './buyer'
import {
  CarPartIdSchema,
  ComponentIdSchema,
  ConditionBandSchema,
  ReputationTierSchema,
} from './tags'
import { SellingChannelIdSchema } from './economy'
import { PipelineStageIdSchema } from './material'
import { ZoneIdSchema } from './zone'
import { ToolTierSchema, ToolTiersSchema } from './toolLines'
import { AssemblyIdSchema } from './assembly'
import { CarInstanceSchema } from './carInstance'
import { PartInstanceSchema, PendingPartOrderSchema } from './part'
import { StaffMemberSchema } from './staff'
import { JobKindSchema, JobSchema } from './job'
import { AuctionLotSchema, AuctionTierSchema } from './auction'
import { ForSaleEntrySchema, PendingSaleOfferSchema, SaleChannelSchema } from './sale'
import { SceneCommissionSchema } from './sceneCommission'
import { ServiceJobSchema } from './serviceJob'
import { BayKindSchema } from './facilities'
import { StagedActionSchema } from './stagedWork'
import { VenueNameByTierSchema } from './venueNames'

/**
 * The two exponentially-decayed counters `marketHeat.ts`'s weekly
 * supply/demand update reads - `lotSupply` (fresh auction lots of this model,
 * bumped on catalog refresh) and `playerSales` (the player's own resolved
 * sales of this model, bumped on offer acceptance). Plain `Record<modelId,
 * number>` maps, default `{}` for both - a model with no entry simply hasn't
 * had a lot or a sale counted yet.
 */
export const MarketLedgerSchema = z.object({
  lotSupply: z.record(z.string(), z.number()).default({}),
  playerSales: z.record(z.string(), z.number()).default({}),
})

export type MarketLedger = z.infer<typeof MarketLedgerSchema>

/**
 * One week's cost sheet: the five money lines the weekly summary reports, in
 * yen, all held as positive magnitudes (the four out-lines are money spent,
 * not signed deltas). Which line a given movement lands on is decided once,
 * by `cashMovementFor` (cashLedger.ts), against the attribution law stated in
 * `CarLedgerSchema` below - this schema only stores the totals it produces.
 *
 * The week's net cash movement is `incomeYen - (onCarsYen + stockYen +
 * runningYen + investmentYen)` (`netCashYen`), and that identity holding to
 * the yen against the shop's real cash is what makes the sheet complete
 * rather than merely plausible.
 *
 * `stockYen` is separate from `onCarsYen` because cash leaves the till when a
 * part is bought but `CarLedger.partsYen` only bumps when it is fitted:
 * calling the purchase a car cost would name the wrong car, and deferring it
 * to fitting would break the week's arithmetic. `investmentYen` is separate
 * from `runningYen` because a bay costing millions in the same line as a few
 * thousand yen of rent destroys the running figure entirely.
 */
export const FinanceWeekSchema = z.object({
  incomeYen: z.number().int().default(0),
  onCarsYen: z.number().int().default(0),
  stockYen: z.number().int().default(0),
  runningYen: z.number().int().default(0),
  investmentYen: z.number().int().default(0),
})

export type FinanceWeek = z.infer<typeof FinanceWeekSchema>

/**
 * The flip ledger: one owned car's money-in record - what it cost to
 * acquire (auction win or buyout hammer price), plus every yen sunk into it
 * since (repairs, installed parts, listing fees). Pure bookkeeping:
 * recording this never changes an economic outcome, it only surfaces money
 * that already moves through the existing resolvers (auction/buyout,
 * repair-job creation, install completion, listing). `purchaseYen: null`
 * means unknown - an already-owned car with no recorded acquisition, or a
 * dev-granted car - so the panel shows "-" rather than fabricating a number.
 *
 * What belongs here and what does not is a design law, not a convenience: a
 * cost attributes to a car when it is charged FOR that car, and accrues to
 * the business when it is not. Purchase,
 * repairs, parts and listing fees are per-car. Machine-shop hire, rent, bays
 * and staff wages are running costs and must never be posted here: a day's
 * engine-crane hire can pull four engines, so charging it to one car would
 * be a fiction.
 *
 * `cashMovementFor` (cashLedger.ts) is that law's one full enumeration, over
 * every cash-moving day-log entry there is. Anything that needs to know which
 * side of the line a movement falls on reads it there rather than deciding
 * again.
 */
export const CarLedgerSchema = z.object({
  purchaseYen: z.number().int().nonnegative().nullable(),
  repairYen: z.number().int().nonnegative().default(0),
  partsYen: z.number().int().nonnegative().default(0),
  /** Every listing fee this car has been charged, summed - a re-list on a
   * dearer channel pays again and adds again (`resolveSetForSale`,
   * sim/selling.ts), so this is a running total per car, not the last fee
   * paid. */
  listingFeesYen: z.number().int().nonnegative().default(0),
})

/**
 * The repair/parts half of `CarLedgerSchema`'s shape, at job scope
 * instead of car scope - what the player actually spent on a customer's
 * service job (repair charges fronted on their car, parts installed at their
 * paid price), keyed by job id. No `purchaseYen` and no `listingFeesYen`: a
 * customer's car is never bought and never listed. Created lazily (a job
 * with no entry has spent nothing
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
 * The one live used-machinery classified listing, if any - reputation gates
 * which tool tiers are ELIGIBLE, but only a listing for this exact
 * `componentId`+`tier` makes it actually PURCHASABLE (`applyToolUpgrade`,
 * toolLines.ts). `priceYen` is captured at listing time (the tier's own
 * `upgradePriceYen`, which never changes mid-career, but locking it here
 * keeps the listing self-contained). At most one live at a time by
 * construction (`GameState.machineListing` is a single nullable field, never
 * a list).
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
 * An active yard inspection visit, at one auction tier -
 * `beginInspectionVisit` (`diagnosis.ts`) stamps this once the 1-slot cost +
 * tiered `travelFeeYenByTier` fee are both paid; `runDiagnosticTest`
 * decrements `minutesLeft` per test run. At most one live at a time
 * (`GameState.inspectionVisit` is a single nullable field, mirroring
 * `MachineListingSchema`'s own "one live at a time" shape above).
 */
export const InspectionVisitSchema = z.object({
  tier: AuctionTierSchema,
  minutesLeft: z.number().int().nonnegative(),
})

export type InspectionVisit = z.infer<typeof InspectionVisitSchema>

/** The live auction room's fuse-length accessibility preset: standard runs the
 * config's own `clockMs`; relaxed and unhurried scale it longer. The room
 * machine itself never reads this - the caller building a room scales the
 * config object it hands in and the machine stays ignorant of the setting. */
export const FusePresetSchema = z.enum(['standard', 'relaxed', 'unhurried'])

export type FusePreset = z.infer<typeof FusePresetSchema>

/**
 * A small persisted player-preference slice, separate from any sim-economic
 * state - the fuse-length preset and the auction room's auto-bid enable
 * toggle, both set from the settings screen. Genuinely optional (not
 * defaulted): a save that predates either field reads it as absent, which
 * every caller treats as the off/standard default, so no existing
 * `GameState` literal needs a new field. `autoBidEnabled` defaults to off:
 * the room only auto-bids once the player has opted in.
 */
export const UiSettingsSchema = z.object({
  fusePreset: FusePresetSchema,
  autoBidEnabled: z.boolean().optional(),
})

export type UiSettings = z.infer<typeof UiSettingsSchema>

/**
 * One campaign mission's live progress - the mission itself (`StoryMission`,
 * content) is static; this is the only part that changes across a career.
 * Absent from `GameState.storyMissions` entirely means locked (never yet
 * reached its `gateReputationPoints`, or an earlier mission in the strictly
 * linear order still isn't `delivered`). At most one `offered`/`active`
 * record exists at any time (`advanceDay`'s mission hook, `missions.ts`).
 * `acceptedOnDay` stamps at accept. Story missions are unfailable: there is
 * no `lapsed` status or deadline field, only offered, accepted, delivered.
 */
export const StoryMissionRecordSchema = z.object({
  missionId: z.string().min(1),
  status: z.enum(['offered', 'active', 'delivered']),
  acceptedOnDay: z.number().int().positive().nullable(),
})

export type StoryMissionRecord = z.infer<typeof StoryMissionRecordSchema>

/**
 * One live job ad on the Staff Office board. `candidate` is a fully-rolled
 * `StaffMember` (stats within the hiring tier's budget, wage derived by
 * formula) - hiring simply moves it into `GameState.staff` unchanged. `bio`
 * is drawn from `staffCandidates.json` for the ad's own flavour and is not
 * part of the persisted staff member (the roster shows the trait copy
 * instead). `postedOnDay` drives expiry (`economy.staff.adExpiryDays`) and
 * the "posted / expires" line on the ad card. At most
 * `economy.staff.maxOpenAds` live at once; refreshed on the weekly tick
 * (`advanceDay`).
 */
export const StaffAdSchema = z.object({
  candidate: StaffMemberSchema,
  bio: z.string().min(1),
  postedOnDay: z.number().int().positive(),
})

export type StaffAd = z.infer<typeof StaffAdSchema>

/**
 * One sub-assembly sitting on the bench, pulled off a car as a unit
 * (`assemblyId`, e.g. `engineAssembly`). `members` holds each member slot's
 * loose `PartInstance`, or `null` for a member slot that was already empty
 * when the assembly came off (a missing part) or is not yet fitted on a
 * bench-built assembly. The per-slot `vacatedBaseline` that decides a
 * refit's equivalence charge is NOT stored here - it stays on
 * `sourceCarId`'s own car slots exactly as per-slot removal leaves it, so
 * refit reuses `refitLaborSlotsFor` verbatim. `sourceCarId` is the car this
 * came off (refit reassembles onto it and reads those baselines), or `null`
 * for an assembly built on the bench from loose parts.
 */
export const AssemblyContainerSchema = z.object({
  id: z.string().min(1),
  assemblyId: AssemblyIdSchema,
  members: z.partialRecord(CarPartIdSchema, PartInstanceSchema.nullable()),
  sourceCarId: z.string().min(1).nullable(),
})

export type AssemblyContainer = z.infer<typeof AssemblyContainerSchema>

/**
 * The rolling road's whole persisted state. Structurally separate from the six
 * tool lines because a dyno is not a `ComponentId` - `ToolTiersSchema` and
 * `machineShopAssist.feeYenByGroup` are both exhaustive over the six part
 * groups, and nothing is repaired on a dyno - but deliberately the same shape:
 * `owned` is the ownership half `toolTiers[group] >= 2` answers for a machine
 * line, and `hirePaidDay` is `machineHirePaidDayByGroup`'s day stamp with one
 * entry instead of six.
 *
 * `sessionCarId` is the car currently strapped to the rollers, or `null` when
 * the dyno is empty - at most one at a time by construction, the same single
 * nullable field `machineListing` and `inspectionVisit` use. Its reading is
 * derived live from that car's current build rather than frozen, which is
 * exactly right for a car sitting on the rollers: change something and the
 * numbers change with it. `advanceDay` clears it at the day boundary, so a
 * session covers the day it was paid for and no longer.
 */
export const DynoStateSchema = z.object({
  owned: z.boolean().default(false),
  hirePaidDay: z.number().int().positive().nullable().default(null),
  sessionCarId: z.string().min(1).nullable().default(null),
})

export type DynoState = z.infer<typeof DynoStateSchema>

/**
 * The climbing chain (docs/sprints/scene-standing-arc.md step 0): the top of
 * the market's power appetite, tracked separately from any buyer's own
 * `statTargets.power` (`economy.statFormulas.powerNormalizationCeiling`
 * above governs ordinary appetite; this governs only the moving figure at
 * the top). `bestPowerPs` is the highest power, in PS, any car has ever sold
 * for - measured at the moment of delivery (`resolveSellViaWalkIn`,
 * sim/selling.ts), never a listed or built figure that was never actually
 * sold. `climbedSteps` indexes
 * `economy.statFormulas.powerExpectationChainStepDiscounts`: `0` immediately
 * after a new personal best, incrementing (capped at the table's last step)
 * each further delivery that clears the CURRENT bar without beating the best
 * outright; a delivery below the current bar leaves both fields untouched.
 * `currentPowerExpectationBarPs` (sim/valuation.ts) is the one place this is
 * read into a PS figure - nothing in shipped content consumes it yet, and no
 * buyer's own taste target moves with it. The genuinely-optional-key pattern
 * (like `dyno` above), so no existing `GameState` literal needs touching;
 * absent means nobody has ever delivered a car, which is exactly true of a
 * fresh career.
 */
export const PowerExpectationChainSchema = z.object({
  bestPowerPs: z.number().positive(),
  climbedSteps: z.number().int().nonnegative(),
})

export type PowerExpectationChain = z.infer<typeof PowerExpectationChainSchema>

/**
 * How well known the shop is within one buyer scene - the shop's own
 * reputation with that scene, distinct from a car's fit against a buyer's
 * own `statTargets`. `none` is a scene that has never heard of the shop;
 * each later stage moves that scene's own taste band
 * (`channelTasteMultiplier`, sim/valuation.ts) and nothing else -
 * `docs/sprints/scene-standing-arc.md` is the design of record for how it
 * is earned and what else it eventually grants, neither of which is wired
 * up yet.
 */
export const SceneStandingStageSchema = z.enum(['none', 'known', 'respected', 'shop'])

export type SceneStandingStage = z.infer<typeof SceneStandingStageSchema>

/**
 * The shop's standing in every buyer scene at once, one stage per
 * `BuyerArchetype` - every scene named explicitly (the same
 * `BuyerPoolWeightsSchema` idiom, content/src/economy.ts), so a silently
 * absent scene and a deliberate `none` can never be confused. Defaults every
 * scene to `none`: a fresh career is unknown everywhere, and a save from
 * before this field existed reads exactly the same way.
 */
export const SceneStandingSchema = z
  .object({
    collector: SceneStandingStageSchema,
    tuner: SceneStandingStageSchema,
    'show-crowd': SceneStandingStageSchema,
    racer: SceneStandingStageSchema,
    'daily-drivers': SceneStandingStageSchema,
    touge: SceneStandingStageSchema,
  })
  .strict()

export type SceneStanding = z.infer<typeof SceneStandingSchema>

/** Every scene at `none` - a fresh shop's standing, and the fallback a
 * pre-existing save reads once `SceneStandingSchema`'s own default fills it
 * in. */
export const FRESH_SCENE_STANDING: SceneStanding = {
  collector: 'none',
  tuner: 'none',
  'show-crowd': 'none',
  racer: 'none',
  'daily-drivers': 'none',
  touge: 'none',
}

/**
 * One matched delivery to a scene, as `GameState.sceneLedger` records it
 * permanently (docs/sprints/scene-standing-arc.md step 4) - the car, the
 * scene it counted for, the price, and the day, so the player's own read is
 * "I built those" rather than a number. `modelId` is a snapshot because the
 * delivered car itself leaves `ownedCars` in the same step this is recorded
 * (a sale or a mission hand-over), the same reasoning every other
 * `DayLogEntry` that names a departed car's model already carries
 * (`shell-scrapped`, `lot-bought-out`).
 */
export const SceneLedgerEntrySchema = z.object({
  carInstanceId: z.string().min(1),
  modelId: z.string().min(1),
  priceYen: z.number().int().nonnegative(),
  day: z.number().int().positive(),
})

export type SceneLedgerEntry = z.infer<typeof SceneLedgerEntrySchema>

/**
 * The shop's whole delivery history, one array per scene - every scene named
 * explicitly (the same idiom `SceneStandingSchema` above uses), never
 * pruned: standing never decays, so neither does the record of how it was
 * earned. `creditSceneDelivery` (sim/sceneStanding.ts) is the only writer.
 */
export const SceneLedgerSchema = z
  .object({
    collector: z.array(SceneLedgerEntrySchema),
    tuner: z.array(SceneLedgerEntrySchema),
    'show-crowd': z.array(SceneLedgerEntrySchema),
    racer: z.array(SceneLedgerEntrySchema),
    'daily-drivers': z.array(SceneLedgerEntrySchema),
    touge: z.array(SceneLedgerEntrySchema),
  })
  .strict()

export type SceneLedger = z.infer<typeof SceneLedgerSchema>

/** Every scene's ledger empty - a fresh shop has delivered nothing anywhere
 * yet, mirroring `FRESH_SCENE_STANDING` above. */
export const FRESH_SCENE_LEDGER: SceneLedger = {
  collector: [],
  tuner: [],
  'show-crowd': [],
  racer: [],
  'daily-drivers': [],
  touge: [],
}

/**
 * The shop's live commission board, one slot per scene (docs/sprints/
 * scene-standing-arc.md step 6) - `null` is a scene with no live commission
 * right now (below Respected, or its last one just delivered), the common
 * case. Every scene named explicitly, the same idiom `SceneStandingSchema`/
 * `SceneLedgerSchema` above use, so a silently-absent scene and a
 * deliberate "nothing live" can never be confused.
 */
export const SceneCommissionBoardSchema = z
  .object({
    collector: SceneCommissionSchema.nullable(),
    tuner: SceneCommissionSchema.nullable(),
    'show-crowd': SceneCommissionSchema.nullable(),
    racer: SceneCommissionSchema.nullable(),
    'daily-drivers': SceneCommissionSchema.nullable(),
    touge: SceneCommissionSchema.nullable(),
  })
  .strict()

export type SceneCommissionBoard = z.infer<typeof SceneCommissionBoardSchema>

/** Every scene with no live commission - a fresh shop (or any scene still
 * below Respected) reads this, mirroring `FRESH_SCENE_STANDING` above. */
export const FRESH_SCENE_COMMISSIONS: SceneCommissionBoard = {
  collector: null,
  tuner: null,
  'show-crowd': null,
  racer: null,
  'daily-drivers': null,
  touge: null,
}

export const GameStateSchema = z.object({
  day: z.number().int().min(1),
  seed: z.number().int(),
  cashYen: z.number().int(),
  /** Derived from reputationPoints (`deriveReputationTier`) every time the
   * points change - never set directly anywhere else. */
  reputationTier: ReputationTierSchema,
  /** Accrued reputation points; `reputationTier` derives from this via
   * `applyReputationDelta`. */
  reputationPoints: z.number().int().nonnegative().default(0),
  ownedCars: z.array(CarInstanceSchema).default([]),
  partInventory: z.array(PartInstanceSchema).default([]),
  staff: z.array(StaffMemberSchema).default([]),
  /**
   * The live job-ad board. Refreshed on the weekly tick (`advanceDay`):
   * expired ads drop, then seeded rolls top the board back up to
   * `economy.staff.maxOpenAds`. Empty at day 1 (a fresh career sees its first
   * ads on the first weekly boundary). Purely additive.
   */
  staffAds: z.array(StaffAdSchema).default([]),
  jobs: z.array(JobSchema).default([]),
  /** Demand index per CarModel id, base 100 (GDD 6.4). */
  marketHeat: z.record(z.string(), z.number()).default({}),
  /** The supply/demand counters `marketHeat.ts`'s weekly update reads to
   * compute each model's target heat. Purely additive: a pre-v13 save never
   * tracked these, so it defaults to both counters empty. */
  marketLedger: MarketLedgerSchema.default({ lotSupply: {}, playerSales: {} }),
  activeAuctionLots: z.array(AuctionLotSchema).default([]),
  /**
   * Cars the player has toggled "taking offers" on - replaces
   * `activeListings`. See `saveCodec.ts`'s v19 -> v20 entry for how an old
   * save's pending listings are resolved rather than silently dropped.
   */
  carsForSale: z.array(ForSaleEntrySchema).default([]),
  /**
   * Today's drawn offers - at most one per for-sale car, completely replaced
   * (not accumulated) by advanceDay's daily offer-draw step every day, so an
   * unaccepted offer never survives past End Day.
   */
  pendingOffers: z.array(PendingSaleOfferSchema).default([]),
  /** Service jobs offered for the player to accept (GDD Act 1). */
  serviceJobOffers: z.array(ServiceJobSchema).default([]),
  /** Service jobs the player has accepted and is working. */
  activeServiceJobs: z.array(ServiceJobSchema).default([]),
  /**
   * Defaults here are the save-migration fallback for a save that never had
   * a bay system - kept in sync with facilities.json's `startCount`s, which
   * is what a genuinely new game reads (see sim's createInitialGameState).
   * Three sources of the same "1" / "3" / "2" because they answer different
   * questions (migrate an old save vs. seed a new one), not duplication to
   * clean up.
   */
  serviceBayCount: z.number().int().positive().default(1),
  parkingBayCount: z.number().int().positive().default(3),
  /** The forecourt counterpart to `serviceBayCount`/`parkingBayCount` above -
   * how many cars can be on show for sale at once (sprint148.md). */
  forecourtBayCount: z.number().int().positive().default(2),
  /**
   * Real, index-addressable service-bay slots: `serviceBayCarIds[i]` is the
   * car physically sitting in bay `i`, or `null` if that bay is empty. Array
   * length tracks `serviceBayCount` exactly under normal play
   * (`applyBayPurchase` appends a `null` slot when a new bay is bought) - a
   * car's specific bay is real, persisted state, not incidental array order
   * recomputed by exclusion.
   */
  serviceBayCarIds: z.array(z.string().min(1).nullable()).default([]),
  /** The parking counterpart to `serviceBayCarIds` above - same shape, same
   * invariant (length tracks `parkingBayCount`); a specific parking slot has
   * real identity a drag-and-drop can target. */
  parkingCarIds: z.array(z.string().min(1).nullable()).default([]),
  /**
   * The forecourt counterpart to `serviceBayCarIds`/`parkingCarIds` above -
   * same shape, same invariant (length tracks `forecourtBayCount`), but a
   * different kind of occupant: a forecourt slot holds a car exactly while
   * it is listed on a channel that needs a buyer to come and look at it
   * (`requiresForecourt`, economy.ts) - `resolveSetForSale` (selling.ts)
   * moves a car here off its real slot, never a hand move or a fresh
   * acquisition (sprint148.md).
   */
  forecourtCarIds: z.array(z.string().min(1).nullable()).default([]),
  /**
   * The one "double parking" overflow slot - always exactly one slot past
   * whatever real parking/service-bay capacity the player currently owns,
   * never purchasable or expandable. A car lands here only when both
   * `parkingCarIds` and `serviceBayCarIds` are full at acquisition time
   * (`facilities.ts`'s `assignToShop`); occupying it costs a daily fine
   * (`resolveGraceParking`) until real capacity opens up or the car leaves
   * the shop entirely. `null` when nothing is double-parked - the common
   * case.
   */
  graceParkingCarId: z.string().min(1).nullable().default(null),
  /**
   * Labour energy points already spent today, in fine-grained integer points
   * (`pointsPerLabour` per labour slot). Instant actions (repair, install,
   * inspect) decrement against `energyMax(state, economy) -
   * energySpentToday` the moment they're clicked, instead of a client-only
   * queue deciding allocation at End Day. Reset to 0 by advanceDay's
   * day-boundary tick (a full night's rest - the pool never carries over).
   */
  energySpentToday: z.number().int().nonnegative().default(0),
  /**
   * The shop's current tier per tool line. Tier IS the repair level
   * (`bands.ts`'s `repairLevelForGroup`); all six lines start at 1. Not
   * defaulted: the v22 -> v23 save migration reconstructs it from a legacy
   * save's owned machines (see `saveCodec.ts`).
   */
  toolTiers: ToolTiersSchema,
  /**
   * Standard-delivery part purchases in transit - resolved by advanceDay's
   * day-boundary tick once `arrivesOnDay` is reached, the same "due today
   * resolves" shape `resolveServiceJobArrivals` uses.
   */
  pendingPartOrders: z.array(PendingPartOrderSchema).default([]),
  /**
   * The player's parts-market cart: part ids awaiting checkout, repeats
   * meaning quantity > 1. Deliberately persistent (survives a reload), so it
   * lives on GameState and rides the existing autosave/save-code mechanism
   * rather than a separate one - inert to the sim, read/written only by the
   * game layer.
   */
  cartPartIds: z.array(z.string().min(1)).default([]),
  /**
   * Staged (not-yet-confirmed) repair/install work per car, keyed by
   * `carInstanceId`. Freely add/remove at zero cost - nothing here touches
   * cash, labour, or a real `Job` until `confirmStagedWork` resolves it,
   * mirroring the parts-market cart's own stage-then-confirm shape. Every
   * car-exit path (a sold car, service-job resolution) drops its entry so
   * staged work never outlives the car.
   */
  stagedCarWork: z.record(z.string(), z.array(StagedActionSchema)).default({}),
  /**
   * The flip ledger: per-owned-car spend record, keyed by carInstanceId -
   * created at acquisition (auction win/buyout), updated by repair charges,
   * part installs and listing fees, deleted at sale. Entries exist only for owned cars,
   * never customer service-job cars (never ours). A car with no entry (an
   * already-owned car with no recorded acquisition, a dev grant) reads as
   * unknown-purchase, not a fabricated zero - see `CarLedgerSchema` above.
   */
  carLedgers: z.record(z.string(), CarLedgerSchema).default({}),
  /**
   * The weekly cost sheet's accumulator: one `FinanceWeek` per week the shop
   * moved money in, keyed by `weekIndex`'s number as a string. Bumped at the
   * charge sites themselves (`bookCashMovements`, sim/financeLedger.ts), never
   * reconstructed from the day log - the log is session-scoped, carries no
   * day, and is thrown away on reload. A week with no entry simply had no
   * money move in it.
   *
   * The genuinely-optional-key pattern (like `attendanceFeePaidDayByTier`
   * below), so no existing `GameState` literal needs touching: readers treat
   * absent as an empty sheet. A fresh career seeds it to `{}` explicitly
   * (`createInitialGameState`).
   */
  financeLedger: z.record(z.string(), FinanceWeekSchema).optional(),
  /** The current classifieds listing, if any - `null` is the common case
   * (nothing on offer right now). */
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
   * Per-active-service-job spend record, keyed by job id - created lazily by
   * the two charge sites (a customer-car repair charge, an install
   * completion at the part's own paid price), read and deleted at close-out
   * (`resolveServiceJob`) so the completion report can show what the player
   * actually paid rather than a catalog-price reconstruction.
   */
  serviceJobLedgers: z.record(z.string(), ServiceJobLedgerSchema).default({}),
  /**
   * The yard inspection visit - one active visit at a single auction tier,
   * `minutesLeft` ticking down as `runDiagnosticTest` spends them. `null`
   * when no visit is active (the common case, and always true at day
   * start). Cleared unconditionally by advanceDay's day-boundary tick, the
   * same "dies at day end" treatment `energySpentToday`'s reset already
   * gives labour - minutes spent chasing a lot that sells to someone else
   * overnight are simply spent, no carry-over negotiation.
   */
  inspectionVisit: InspectionVisitSchema.nullable().default(null),
  /** The hand-authored campaign's live progress, one record per mission
   * that has ever left `locked` - see `StoryMissionRecordSchema` above. */
  storyMissions: z.array(StoryMissionRecordSchema).default([]),
  /**
   * Sub-assemblies currently on the bench, pulled off a car as a unit
   * (`AssemblyContainerSchema`). `.optional()` rather than `.default([])`
   * deliberately - a genuinely optional key, so no existing `GameState`
   * literal needs touching to add it; readers treat absent as an empty bench
   * (`state.assemblyInventory ?? []`). A fresh career seeds it to `[]`
   * explicitly (`createInitialGameState`).
   */
  assemblyInventory: z.array(AssemblyContainerSchema).optional(),
  /**
   * The guided tutorial's one persisted bit. Absent (`.optional()`, the
   * genuinely-optional-key pattern) means "not a tutorial career" - every
   * bot, test fixture, and probe state, plus a save that predates the field,
   * so the sim's scripted-lot injection and the overlay both stay inert for
   * them. A real new career installs `'active'` (`installTutorial`, sim);
   * the player's skip control writes `'skipped'` (permanent for that
   * career) and the sign-off writes `'done'` - both suppress the overlay and
   * the scripted-lot injection for good. The sim reads this field but never
   * depends on its value for any economic outcome; it only gates whether the
   * tutorial lot is kept on the board.
   */
  tutorialStatus: z.enum(['active', 'skipped', 'done']).optional(),
  /**
   * The tutorial step ids the player has pressed "Got it" on - what the
   * `acknowledged` completion kind reads. Present only on tutorial careers
   * (the genuinely-optional-key pattern, matching `tutorialStatus` above);
   * the store's `acknowledgeTutorialStep` action appends to it, and the sim
   * never reads it.
   */
  tutorialAcknowledgedSteps: z.array(z.string().min(1)).optional(),
  /**
   * A small persisted player-preference slice (the live auction room's
   * fuse-length preset) - absent on a career that predates it, reading as the
   * standard preset everywhere it's consumed. The genuinely-optional-key
   * pattern (like `tutorialStatus` above), so no existing `GameState` literal
   * needs touching.
   */
  uiSettings: UiSettingsSchema.optional(),
  /**
   * One rolled venue name per auction tier, seeded once at `newGame` from
   * `VENUE_NAMES`' pools - pure flavour, no mechanics read it. Absent on any
   * state never built through `createInitialGameState` (bots, probes, a save
   * that predates it) - the genuinely-optional-key pattern (like
   * `uiSettings` above), so no existing `GameState` literal needs touching.
   */
  venueNameByTier: VenueNameByTierSchema.optional(),
  /**
   * The day each auction tier's admission was last charged
   * (`resolveAttendAuction`, sim/bidding.ts) - a tier entry equal to the
   * current day means today's sitting there is already covered, so a later
   * "Take a seat" at that tier the same day is free. Recorded only when a
   * nonzero fee is actually charged; a zero-fee tier (every tier today)
   * never gains an entry. The genuinely-optional-key pattern (like
   * `venueNameByTier` above), so no existing `GameState` literal needs
   * touching.
   */
  attendanceFeePaidDayByTier: z
    .partialRecord(AuctionTierSchema, z.number().int().positive())
    .optional(),
  /**
   * The day each machine group's daily hire was last paid
   * (`resolveHireMachineLine`, sim/jobs.ts) - a group entry equal to the
   * current day means every operation on that group is unlocked for today,
   * so a later signature repair, buried removal, or install on that group
   * the same day needs no further charge. Recorded only when a nonzero fee
   * is actually charged; a group whose tier-2 machine is already owned
   * never gains an entry. The genuinely-optional-key pattern (like
   * `attendanceFeePaidDayByTier` above), so no existing `GameState` literal
   * needs touching.
   */
  machineHirePaidDayByGroup: z
    .partialRecord(ComponentIdSchema, z.number().int().positive())
    .optional(),
  /**
   * The rolling road - owned or not, hired or not, and which car is on it
   * (see `DynoStateSchema` above). The genuinely-optional-key pattern (like
   * `machineHirePaidDayByGroup` above), so no existing `GameState` literal
   * needs touching; readers treat absent as a shop with no dyno, nothing
   * hired and nothing on the rollers.
   */
  dyno: DynoStateSchema.optional(),
  /**
   * How many coffee rounds have been bought at the cafe today
   * (`resolveBuyCoffee`, sim/cafe.ts), and which day that count is for - the
   * count reads as zero the moment `day` no longer matches `state.day`, the
   * same day-stamp idiom `dyno.hirePaidDay`/`machineHirePaidDayByGroup` use
   * for a once-a-day charge, generalised to a counted daily cap
   * (`economy.cafe.maxPurchasesPerDay`). The genuinely-optional-key pattern
   * (like `machineHirePaidDayByGroup` above), so no existing `GameState`
   * literal needs touching; readers treat absent as no coffee bought yet.
   */
  cafeCoffeesBoughtToday: z
    .object({ day: z.number().int().positive(), count: z.number().int().positive() })
    .optional(),
  /**
   * Consumable tins on the shelf, counted in USES rather than tins: a map of
   * consumable key to how many uses remain (docs/design/systems/
   * consumables-as-stock.md). Filler, paper, primer and polish key off their
   * own plain id; paint keys off `paintStockKey(finish, colour)`, since a tin
   * is mixed to one colour and two tins of a different colour are not the
   * same tin. The genuinely-optional-key pattern (like `dyno` above), so no
   * existing `GameState` literal needs touching; readers treat absent as an
   * empty shelf (`state.consumableStock ?? {}`).
   */
  consumableStock: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** The climbing chain's own state - see `PowerExpectationChainSchema`
   * above. The genuinely-optional-key pattern (like `consumableStock`
   * above); absent on every save until the first car is ever delivered. */
  powerExpectationChain: PowerExpectationChainSchema.optional(),
  /** The shop's standing per buyer scene - see `SceneStandingSchema` above.
   * Defaults every scene to `none`, so a save from before this field
   * existed reads as a shop nobody has heard of yet, exactly true of every
   * career before the mechanic existed. */
  sceneStanding: SceneStandingSchema.default(FRESH_SCENE_STANDING),
  /**
   * The shop ledger - see `SceneLedgerSchema` above. The genuinely-optional-
   * key pattern (like `powerExpectationChain` above, from the same arc): no
   * existing `GameState` literal needs touching, and readers treat absent as
   * every scene's ledger empty (`sceneLedgerFor`, sim/sceneStanding.ts). A
   * fresh career seeds it to `FRESH_SCENE_LEDGER` explicitly
   * (`createInitialGameState`).
   */
  sceneLedger: SceneLedgerSchema.optional(),
  /**
   * The shop's live commission board - see `SceneCommissionBoardSchema`
   * above. The genuinely-optional-key pattern (like `sceneLedger` above,
   * from the same arc): no existing `GameState` literal needs touching, and
   * readers treat absent as every scene with nothing live
   * (`sceneCommissionsFor`, sim/sceneCommissions.ts). A fresh career seeds
   * it to `FRESH_SCENE_COMMISSIONS` explicitly (`createInitialGameState`).
   */
  sceneCommissions: SceneCommissionBoardSchema.optional(),
})

/**
 * Sim contract: advanceDay(state, actions, seed) -> newState + eventLog.
 * DayLog is that eventLog - a typed record of what happened on a day, not
 * part of GameState itself.
 */
export const DayLogEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rent-paid'), amountYen: z.number().int() }),
  /** The daily cost of leaving `carInstanceId` in the grace/"double
   * parking" overflow slot - charged instead of, never alongside,
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
    /** The banded-repair cost charged to open the job - the whole of what a
     * repair or a bench recondition takes out of the till, and the day it
     * leaves. Emitted by `findOrCreateJob` and `resolveReconditionLabor`
     * (jobs.ts) alike; absent when the job opened free. A recondition's cost
     * is stock, a car job's is a car cost, and `kind` is what separates
     * them. */
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
      /** The sim's own install-fit check refused a part/component/model
       * mismatch, independent of the UI's filter. */
      'part-does-not-fit',
      /** The one own-car capability ceiling - converting a factory-NA car
       * to forced induction needs `economy.json`'s
       * `toolCeilings.naToTurboConversionEngineTier` (same vocabulary as the
       * service-job accept refusal below). */
      'tool-tier',
      /** A customer-owned tagged part can only be reinstalled onto the same
       * customer's car it was pulled from - never a different car,
       * including the player's own (closes the close-out escape gap flagged
       * in TODO.md). */
      'not-your-part',
      /** A `bolt-on`/`buried` part is bench-only - an on-car repair-zone job
       * addressed at one exact non-surface slot is refused
       * (`repairJobGate`); it must come off the car first. */
      'bench-only',
      /** The symmetric blocker rule - a slot with anything still installed
       * in its `blockedBy` list refuses install just as it refuses
       * uninstall, reassembly order matters (`installFitGate`). */
      'blocked-by',
      /** A buried engine/drivetrain or suspension/body/interior signature
       * slot's operation needs its group's machinery owned or hired for
       * today (`hasMachineLineFor`, sim/jobs.ts) - book the machine-shop
       * hire, or buy the tools. */
      'machine-line',
      /** `panels`/`paint` bands are derived from zone state (the body
       * pipeline, sim/bodyPipeline.ts) - a direct repair-zone job addressed
       * at one of them on a car already on the zone model refuses; work the
       * zone's pipeline stages instead. */
      'derived-band',
      /** A body-pipeline stage's consumable (filler, paper, primer, polish,
       * or the exact paint colour and finish it needs) is not on the shelf
       * in enough quantity - buy more from the parts shop's consumables
       * section (`hasStockFor`, sim/consumables.ts). */
      'out-of-stock',
    ]),
  }),
  z.object({
    type: z.literal('labor-overbooked'),
    requestedSlots: z.number().int().positive(),
    availableSlots: z.number().int().nonnegative(),
  }),
  /** The daily fleet-contract retainer earned by `contract`-assigned staff
   * (`serviceBay.ts`). Folded into the morning report's earned-money
   * split. */
  z.object({ type: z.literal('contract-income'), amountYen: z.number().int() }),
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
  /**
   * The live auction room's hammer win (`settleAuctionHammer`, sim/
   * bidding.ts): a contested win at whatever price the room actually closed
   * at, as opposed to `lot-bought-out`'s flat instant-buyout premium. Same
   * shape as `lot-bought-out` - the two channels resolve through the same
   * pure purchase path and differ only in how `priceYen` was arrived at.
   */
  z.object({
    type: z.literal('auction-hammer-won'),
    lotId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
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
  /** A room's admission was paid to take a seat at `tier` today
   * (`resolveAttendAuction`, sim/bidding.ts) - a running cost, the same
   * treatment rent and machine hire get, and charged once per tier per day
   * however many lots are sat through. Emitted only when a nonzero fee
   * actually changes hands; a free room is a silent no-op. */
  z.object({
    type: z.literal('auction-attended'),
    tier: AuctionTierSchema,
    feeYen: z.number().int().positive(),
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
     * What the player actually paid, read from the job's own ledger
     * (`ServiceJobLedgerSchema`) at close-out - never a catalog-price
     * reconstruction. Always present (0 when that kind of spend never
     * happened), so a repair-only job reports real numbers too, not just
     * install jobs.
     */
    repairCostYen: z.number().int().nonnegative(),
    partsCostYen: z.number().int().nonnegative(),
    /** `payoutYen - repairCostYen - partsCostYen`. */
    netProfitYen: z.number().int(),
    /** Days between acceptance and this completion, for the feedback modal. */
    daysSpent: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('service-job-failed'),
    jobId: z.string().min(1),
    reputationLost: z.number().int().nonnegative(),
    /** Sunk cost: the same real spend a completed job reports, shown even
     * on a failure - honesty cuts both ways. */
    repairCostYen: z.number().int().nonnegative(),
    partsCostYen: z.number().int().nonnegative(),
    /** Always `<= 0`: `-repairCostYen - partsCostYen` (no payout on a failure). */
    netProfitYen: z.number().int(),
  }),
  /**
   * Customer-origin parts leave with their car at close-out, paid or failed
   * alike - the receipt line naming what went with them. `parts` are
   * display strings ("<brand> <name>"), not ids: the instances themselves
   * leave `partInventory` in this same step and could never be looked back
   * up afterward. Omitted entirely when nothing customer-owned was ever
   * pulled.
   */
  z.object({
    type: z.literal('service-parts-returned'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
    parts: z.array(z.string().min(1)),
  }),
  /**
   * A for-sale car drew a live offer, valid today only - the
   * day-report/offers-panel line ("A tuner is offering ... Today only").
   * `modelId` is a snapshot so the UI can name the car without a second
   * lookup; the car itself never leaves `ownedCars`.
   */
  z.object({
    type: z.literal('offer-received'),
    carInstanceId: z.string().min(1),
    modelId: z.string().min(1),
    buyerId: z.string().min(1),
    priceYen: z.number().int().positive(),
  }),
  /**
   * The player turned an offer down. The car stays listed, so tomorrow's
   * draw can bring a better one. No reputation field, deliberately - turning
   * down a lowball is not a slight, and there is no delta to record.
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
    /** Set when the sale earned or cost reputation (the quality/lemon
     * rule); absent for a reputation-neutral plain sale. */
    reputationDelta: z.number().int().optional(),
    /** Which of the quality/lemon outcomes fired (the clean/concours split)
     * - set exactly when `reputationDelta` is, lets the day report name the
     * bonus instead of just its point value. */
    saleQuality: z.enum(['lemon', 'clean', 'concours']).optional(),
    /** `priceYen` minus the sold car's ledger (purchase + repairs + parts) -
     * set only when that car's `purchaseYen` was known. Absent for an
     * unknown-purchase car (never fabricated). */
    profitYen: z.number().int().optional(),
    /**
     * A fully-interpolated, ready-to-render one-line reveal - set only when
     * the sold car still carried an unresolved symptom
     * (`remainingCauseIds.length > 1` on at least one). Absent for an
     * honest sale or one already fully resolved (nothing left to teach).
     */
    saleRevealLine: z.string().min(1).optional(),
    /**
     * True when the buyer's taste for this car was >= 1.0 (the car met that
     * buyer's visible want) and `reputation.matchedSaleRepBonus` therefore
     * stacked into this sale's reputation delta - the word-of-mouth term,
     * revealed only in sale-close copy (progression bible law 4). Absent
     * for an unmatched sale, never emitted as `false`.
     */
    matchedSale: z.literal(true).optional(),
  }),
  /** A car was put up for sale on `channelId` and its advertising fee paid
   * (`resolveSetForSale`, sim/selling.ts). Charged FOR this car, so it lands
   * on the car's own ledger as well as the week's on-cars line. Emitted only
   * when the channel actually charges; a free channel lists silently. A
   * re-list on a dearer channel pays again and logs again. */
  z.object({
    type: z.literal('car-listed'),
    carInstanceId: z.string().min(1),
    channelId: SellingChannelIdSchema,
    feeYen: z.number().int().positive(),
  }),
  /** Materials drawn off the shelf for one body-pipeline stage on one zone
   * (`confirmStagedWork`, sim/stagedWork.ts) - filler, primer, paint and the
   * rest, drawn down from stock the moment the stage is confirmed. Carries
   * no cash movement of its own (`cashMovementFor` reads it as moneyless):
   * the tin was already paid for when it was bought (`consumable-bought`
   * below), so this only records the VALUE of what the car used, already
   * posted to that car's `repairYen`. Emitted only when the stage actually
   * draws something. */
  z.object({
    type: z.literal('body-materials-used'),
    carInstanceId: z.string().min(1),
    zoneId: ZoneIdSchema,
    stage: PipelineStageIdSchema,
    costYen: z.number().int().positive(),
  }),
  /** One consumable tin bought and put on the shelf (`resolveBuyConsumableTin`/
   * `resolveBuyPaintTin`, sim/consumables.ts) - filler, paper, primer, polish,
   * or a sized paint tin mixed to a colour. `consumableKey` is the exact
   * `GameState.consumableStock` key the purchase credits. Money out, on stock
   * nobody's car yet (the same bucket `part-bought` uses): the shelf, not any
   * one car, is what a tin belongs to until a pipeline stage draws it down. */
  z.object({
    type: z.literal('consumable-bought'),
    consumableKey: z.string().min(1),
    usesAdded: z.number().int().positive(),
    priceYen: z.number().int().positive(),
  }),
  /** The whole car scrapped at once, shell and all - `carPartIds` lists
   * every slot that was still installed and went down with it (an empty
   * array if the car had already been stripped bare). Removes the car from
   * `ownedCars` entirely, unlike a `car-sold` sale. */
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
  /** A scrap `PartInstance` sold for scrap value - the only action
   * available on it, since it can never be reinstalled. */
  z.object({
    type: z.literal('part-scrapped'),
    partInstanceId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /** A used, non-scrap loose `PartInstance` sold at the donor-economy
   * haircut (`economy.teardown.usedPartSaleFraction`) - the every-day
   * counterpart to `part-scrapped`, for a part still good enough to be
   * worth more than scrap value. */
  z.object({
    type: z.literal('part-sold'),
    partInstanceId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /** A loose inventory `PartInstance` finished reconditioning - climbed to
   * `band` through the same banded-repair economy as an on-car repair. The
   * completion counterpart to a car job's `job-completed` (which carries a
   * `carInstanceId` a loose part has no equivalent of). */
  z.object({
    type: z.literal('part-reconditioned'),
    partInstanceId: z.string().min(1),
    band: ConditionBandSchema,
  }),
  /** One machining operation finished on the part fitted in `carPartId`. The
   * operation is now on that `PartInstance` for good and travels with it; the
   * band is untouched, which is why this is its own entry rather than a
   * `job-completed`. Carries no money: the tooling was the purchase and
   * labour is the whole of what an operation costs. */
  z.object({
    type: z.literal('part-machined'),
    carInstanceId: z.string().min(1),
    carPartId: CarPartIdSchema,
    partInstanceId: z.string().min(1),
    machiningOperationId: z.string().min(1),
  }),
  /**
   * Pulled `carPartId`'s installed part into inventory. Removing an
   * aftermarket part reverts the slot to a fresh stock part (still filled);
   * removing a stock part leaves the slot genuinely empty (missing).
   */
  z.object({
    type: z.literal('part-removed'),
    carInstanceId: z.string().min(1),
    carPartId: CarPartIdSchema,
    partInstanceId: z.string().min(1),
    /** Set when this removal collapsed one of the car's symptoms down to
     * exactly one remaining cause - the id of the now-revealed true cause,
     * so `describeLogEntry` can render "Opened it up: <label>." Absent when
     * this removal revealed nothing (an honest car, or a symptom this part
     * doesn't target). */
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
    /** `auction-win` (repurposed for the live auction room's hammer settlement,
     * `settleAuctionHammer`): a room win with genuinely nowhere to put the car.
     * `buyout`: an instant-buyout purchase with nowhere to put the car. Both
     * resolve instantly against the current state - cash is checked at the same
     * moment and refuses quietly (no log entry) rather than forfeiting, so
     * neither channel can ever produce a `no-cash` reason here. `listing`
     * (sprint148.md): `resolveSetForSale` refused to list a car on a
     * forecourt-requiring channel because no forecourt slot is free - unlike
     * the other three kinds, no cash moves and no car is forfeited, the
     * listing simply does not happen. */
    kind: z.enum(['auction-win', 'buyout', 'service-accept', 'listing']),
    /** `no-space`: parking, every service bay, AND the one grace/"double
     * parking" overflow slot are all full - genuinely nowhere to put the
     * car. No money spent, the win is forfeited rather than the purchase
     * failing loudly. `tool-tier`: a service-job accept refused because at
     * least one task's `minToolTier` exceeds the line's current tier.
     * `operation`: a signature template's `requiresOperationId` is no longer
     * unlocked at accept time (the scene dropped below Shop, the tool line
     * dropped below tier 3, or the offer is stale) - the capability-gated
     * twin of `tool-tier`. `no-forecourt-space`
     * (sprint148.md, `kind: 'listing'` only): every forecourt slot already
     * holds a car - the forecourt half of `no-space`, kept as its own reason
     * because the fix is different (sell or delist something, not buy more
     * real capacity). */
    reason: z.enum(['no-space', 'tool-tier', 'operation', 'no-forecourt-space']),
  }),
  /** Kept for old-log decode compatibility (the buy-equipment action itself
   * is retired; `tool-upgraded` below is its replacement). */
  z.object({
    type: z.literal('equipment-purchased'),
    equipmentId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  /** A tool line climbed one tier (the `upgradeToolLine` action). */
  z.object({
    type: z.literal('tool-upgraded'),
    componentId: ComponentIdSchema,
    toTier: ToolTierSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  /** A fresh used-machinery classified listing went live today. */
  z.object({
    type: z.literal('machine-listed'),
    componentId: ComponentIdSchema,
    tier: ToolTierSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  /** A machine group's daily hire fee was paid (`resolveHireMachineLine`,
   * sim/jobs.ts) - a running cost, same treatment as rent: it never touches
   * a car's own ledger. */
  z.object({
    type: z.literal('machine-hired'),
    componentId: ComponentIdSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  /** A portable dyno was hired in for the day (`resolveHireDyno`, sim/
   * dyno.ts) - a running cost, treated exactly as a machine line's hire is,
   * and never posted to the car it happens to measure. */
  z.object({
    type: z.literal('dyno-hired'),
    priceYen: z.number().int().nonnegative(),
  }),
  /** A dyno was bought outright (`resolveBuyDyno`, sim/dyno.ts) - shop
   * investment, the same bucket a tool tier or a bay lands in. */
  z.object({
    type: z.literal('dyno-bought'),
    priceYen: z.number().int().nonnegative(),
  }),
  /** A coffee round was bought at the cafe (`resolveBuyCoffee`, sim/cafe.ts) -
   * a running cost, the same bucket a machine hire or a dyno hire lands in.
   * `labourPoints` is what the round actually restored, which can read below
   * `economy.cafe.coffeeLabourPoints` when less than that was still spent. */
  z.object({
    type: z.literal('coffee-bought'),
    priceYen: z.number().int().nonnegative(),
    labourPoints: z.number().int().nonnegative(),
  }),
  /** `beginInspectionVisit` started a yard visit. */
  z.object({
    type: z.literal('inspection-visit'),
    tier: AuctionTierSchema,
    feeYen: z.number().int().nonnegative(),
    minutesGranted: z.number().int().positive(),
  }),
  /** `resolveOwnedWorkup` collapsed every one of this owned car's symptoms
   * to their true cause. */
  z.object({
    type: z.literal('car-workup'),
    carInstanceId: z.string().min(1),
  }),
  /** `resolveAcceptMission` - offered -> active. No `dueOnDay` - story
   * missions are unfailable. */
  z.object({
    type: z.literal('mission-accepted'),
    missionId: z.string().min(1),
  }),
  /** `resolveDeliverMission` paid out (+ tip, if earned) and applied the
   * reputation reward. */
  z.object({
    type: z.literal('mission-delivered'),
    missionId: z.string().min(1),
    payoutYen: z.number().int().nonnegative(),
    tipYen: z.number().int().nonnegative(),
    reputationGained: z.number().int().nonnegative(),
  }),
  /** `resolveAcceptSceneCommission` (sim/sceneCommissions.ts) - offered ->
   * active. No payout figure yet: a commission's price is only known once a
   * real car is delivered against it. */
  z.object({
    type: z.literal('scene-commission-accepted'),
    scene: BuyerArchetypeSchema,
  }),
  /** `resolveDeliverSceneCommission` paid out and credited the scene's
   * standing exactly as a matched sale does (`creditSceneDelivery`).
   * `payoutYen` is `economy.sceneCommissions.payoutMultiplier` times the
   * delivered car's own open-market value for that scene's buyer - never a
   * flat authored figure. */
  z.object({
    type: z.literal('scene-commission-delivered'),
    scene: BuyerArchetypeSchema,
    carInstanceId: z.string().min(1),
    payoutYen: z.number().int().nonnegative(),
  }),
  /** The weekly job-ad refresh posted fresh candidates to the Staff Office
   * board (`count` new ads). Swallowed by the morning report like an
   * auction-catalog refresh - the player reads the board itself. */
  z.object({
    type: z.literal('staff-ads-refreshed'),
    count: z.number().int().positive(),
  }),
  /** `resolveHireStaff` took a candidate off the board and onto the
   * payroll. `introFeeYen` is the one-off introduction fee charged to cash
   * at hire (0 when disabled). */
  z.object({
    type: z.literal('staff-hired'),
    staffId: z.string().min(1),
    displayName: z.string().min(1),
    weeklyWageYen: z.number().int().nonnegative(),
    introFeeYen: z.number().int().nonnegative(),
  }),
  /** `resolveDismissStaff` let a member go - immediate, no severance (GDD
   * section 7: no morale sim). */
  z.object({
    type: z.literal('staff-dismissed'),
    staffId: z.string().min(1),
    displayName: z.string().min(1),
  }),
])

export const DayLogSchema = z.array(DayLogEntrySchema)

export type GameState = z.infer<typeof GameStateSchema>
export type DayLogEntry = z.infer<typeof DayLogEntrySchema>
export type DayLog = z.infer<typeof DayLogSchema>
