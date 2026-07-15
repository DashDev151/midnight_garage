import {
  BUYERS,
  CARS,
  COMPONENT_DISPLAY_NAMES,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
} from '@midnight-garage/content'
import type {
  AuctionLot,
  AuctionTier,
  BayKind,
  Buyer,
  CarInstance,
  CarLedger,
  CarModel,
  CarPartId,
  ComponentId,
  ConditionBand,
  DayLogEntry,
  GameState,
  Grade,
  Job,
  MachineListing,
  Part,
  PartFitmentClass,
  PartInstance,
  ReputationTier,
  ServiceJob,
  ServiceJobTask,
  StagedAction,
  StatBlock,
  ToolTier,
} from '@midnight-garage/content'
import {
  componentDisplayName,
  fitmentClassForTier,
  partFitmentClassLabel,
  resolveCarDisplayName,
} from '@midnight-garage/content'
import {
  anchorValueYen,
  applyBayPurchase,
  applyMoves,
  applyToolUpgrade,
  assignToParking,
  availableLaborSlots,
  advanceDay,
  bandIndex,
  climbBand,
  bestFitBuyer,
  buildSimContext,
  carCostToBandYen,
  carCostToMintYen,
  carGuideValueYen,
  carLedgerFor,
  computeAuctionGrade,
  computeBuyoutPriceYen,
  computeDerivedStats,
  confirmStagedWork,
  createInitialGameState,
  createRng,
  describeOrigin,
  deriveReputationTier,
  emptyDayActions,
  expectationForCar,
  foundationFactor,
  generateAuctionCarInstance,
  groupCostToMintYen,
  installedPartsValueYen,
  hasParkingSpace,
  isCustomerOriginPart,
  isPartMissing,
  makeMarketOrigin,
  isServiceJobInTransit,
  isToolTierListed,
  isServiceTaskDone,
  isServiceWorkDone,
  moveCarToSlot as moveCarToSlotCore,
  naToTurboConversionBlocked,
  nextBayMinReputationTier,
  nextBayPriceYen,
  nextRaiseYen,
  nextToolTierRepGate,
  parkingOccupancy,
  partFitsCar,
  planGroupRepair,
  presentPartIdsInGroup,
  previewPlannedWork,
  reconditionQuote,
  PARTS_EXPRESS_SURCHARGE_FRACTION,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveBuyoutInstant,
  resolveBuyPart,
  reserveYen,
  resolveJobLabor,
  resolvePlaceBid,
  resolveReconditionLabor,
  resolveRejectOffer,
  resolveRemovePart,
  resolveScrapPart,
  resolveSellViaWalkIn,
  resolveServiceJob,
  resolveSetForSale,
  scrapValueYen,
  shopTitle,
  swapCars as swapCarsCore,
  toolDeficitSummary,
  unlockedTechniques,
  upgradeHintFor,
  valuateCarForBuyer,
  worstRepairableBandInGroup,
  type AuctionGrade,
  type DeliverySpeed,
  type NewJobSpec,
  type ServiceJobOutcome,
  type SimContext,
  type TurnoutBand,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { INSTALL_LABOR_SLOTS } from '../constants'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { appendSessionEvent, loadSave, writeSave } from '../save/saveDb'
import { offerCopy } from '../utils/offerCopy'
import { addressesOverlap } from '../utils/partAddress'

/**
 * Placeholder seed for the eager store init (immediately replaced by
 * `hydrate()` - either a loaded save or a fresh random career). Kept fixed
 * so store-level tests that read the pre-hydrate state stay deterministic.
 */
const DEFAULT_SEED = 1

/**
 * A fresh random career seed. Game-layer only (Math.random is fine here -
 * the sim stays fully deterministic *given* a seed). External review 2026-07
 * finding 3: a fixed default meant every player got the identical career.
 * Explicit seeds (dev console, tests, the balance harness) still bypass this.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}

/** The 6 real component groups, in a stable display order - shared by every
 * group-level and per-part view builder below (Sprint 26/27) so the order
 * lives in exactly one place. */
const REAL_COMPONENT_GROUPS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/** One real part within a group, for the car-detail screen's per-part breakdown
 * (Sprint 26; reshaped Sprint 32 for the stock-baseline/missing-slot model). */
export interface CarPartRowView {
  partId: CarPartId
  displayName: string
  /** The installed part's own condition band, or null when the slot is
   * empty (missing or legitimately absent - see `missing` below). */
  band: ConditionBand | null
  /** Display name of the installed PartInstance, or null if the slot is empty. */
  installedPartName: string | null
  /** The installed part's catalog grade ('stock' for the baseline every
   * slot starts filled with, 'street'/'sport'/'race' for an upgrade), or
   * null when the slot is empty. */
  grade: Grade | null
  /**
   * True when the slot is empty AND that's a real defect (Sprint 32
   * decision 3) - a stolen wheel, a gutted cat, a missing turbo on a
   * factory-turbo car - needing a fill prompt. False when the slot is
   * filled, or (the one legitimately-empty case) `forcedInduction` on an NA
   * car, which renders as permanently absent instead - see
   * `legitimatelyAbsent`.
   */
  missing: boolean
  /** True only for an empty `forcedInduction` slot on an NA car - no
   * defect, nothing to fill, distinct copy from `missing`. Always false for
   * every other part. */
  legitimatelyAbsent: boolean
  /** Sprint 41 decision 2: false for tyres/brakePadsDiscs/clutch - the
   * per-part repair row and the bench recondition control both hide
   * themselves when this is false; only Replace ever touches the part. */
  repairable: boolean
}

/** A car paired with its resolved model, display name, and derived stats. */
export interface DetailedCar {
  car: CarInstance
  model: CarModel
  displayName: string
  stats: StatBlock
}

/** Everything the car-detail screen needs for one car. */
export interface CarDetail extends DetailedCar {
  /** Jobs currently in progress on this car - created and labored on instantly (Sprint 11). */
  jobs: Job[]
  /** Set when this car belongs to a service job the player is working. */
  serviceJob?: ServiceJobView
  /** Whether this car is currently in a service bay (labor only reaches it if so). */
  inServiceBay: boolean
  /** Repair/install work staged on this car but not yet confirmed (Sprint 18). */
  stagedActions: StagedAction[]
  /**
   * Each of the 6 real groups' worst present-part band (Sprint 26) - the
   * group-level display this sprint ships; a real per-part breakdown is
   * Sprint 28 scope (sprint26.md decision 10/13's own deferral).
   */
  groupBands: Record<ComponentId, ConditionBand>
  /**
   * Sprint 41 decision 4 (condition-panel readability): each of the 6
   * groups' own scaled restoration bill (`groupCostToMintYen`, the car's
   * real tier factor applied) - the condition panel's per-group bill line.
   */
  groupBillYen: Record<ComponentId, number>
  /** Sprint 41 decision 4: the car's total restoration bill
   * (`carCostToMintYen`) - the same figure `marketValueYen` deducts,
   * surfaced as the condition panel's one total-bill line. */
  totalBillYen: number
  /**
   * Sprint 42 (the flip ledger): this car's money-in record - purchase
   * price (or null when unknown, e.g. a dev grant or a pre-v25 save),
   * repairs, and installed parts. Always populated (`carLedgerFor`'s
   * unknown-purchase default when no real entry exists), even for a
   * customer's service-job car - the financial panel itself only ever
   * renders for an owned car (mirrors `groupBillYen`/`totalBillYen`, which
   * are likewise computed unconditionally for both car kinds).
   */
  ledger: CarLedger
  /**
   * Sprint 42: the same guide value the auction house shows
   * (`bidding.ts`'s `anchorValueYen`, generalized to any car+model via
   * `carGuideValueYen` - zero new valuation math). The financial panel's
   * "projected profit" is this minus total spent.
   */
  guideValueYen: number
  /**
   * Sprint 60 (economy-bible.md law 5, the foundation law): non-null only
   * when a bad foundational part is withholding real aftermarket-premium
   * value from this car - the failing part display names and the withheld
   * yen, so the Finances panel can name what to fix first. Null when the
   * foundation is sound (factor 1.0) or the car carries no premium to
   * withhold in the first place.
   */
  foundationWarning: { failingParts: string[]; withheldYen: number } | null
  /** economy-bible law 1's legibility clause (Sprint 66): non-null when this
   * car has repair work available ABOVE its tier's expectation band, i.e. work
   * that costs more than it returns. See `passionSpendNoticeFor`. */
  passionSpendNotice: { band: ConditionBand; returnRate: number } | null
  /**
   * Sprint 48: the pre-Confirm estimate of what planned work will do to this
   * car - null when nothing is planned. Every figure assumes the plan fully
   * completes (labor permitting); "estimate, not confirmed" is the caller's
   * job to label.
   */
  plannedEstimate: PlannedEstimateView | null
}

/** Sprint 48: the Finances panel's pre-Confirm preview - null (via
 * `CarDetail.plannedEstimate`) when there's nothing planned yet. */
export interface PlannedEstimateView {
  /** What every currently planned repair action will charge at Confirm -
   * the exact figure `confirmStagedWork` will deduct, not a guess (planned
   * installs cost nothing NEW here; that cash already left when the part
   * was bought, already counted in `ledger.partsYen`). */
  plannedRepairCostYen: number
  /** Sprint 63: the total labour slots the planned work will require at
   * Confirm - the same accounting `confirmStagedWork` uses (a repair action's
   * `planGroupRepair.laborSlotsRequired`, plus `INSTALL_LABOR_SLOTS` per
   * planned install). The Confirm button shows THIS, not the remaining-today
   * figure, so the player knows what a click actually costs. */
  plannedLaborSlots: number
  /** The restoration bill remaining AFTER the plan completes. */
  billYenAfter: number
  /** The guide value AFTER the plan completes - the same `marketValueYen`
   * the real guide value already uses, on the projected car. */
  guideValueYenAfter: number
  /** Total spent (purchase + repairs + parts) AFTER the plan completes. */
  totalSpentYenAfter: number
  /** `guideValueYenAfter - totalSpentYenAfter` - the Finances panel's
   * headline "profit after" number. */
  projectedProfitYenAfter: number
}

/** A car sitting somewhere in the shop (a service bay or parking), for the bay layout. */
export interface ShopCarView {
  carId: string
  displayName: string
  /** True for a customer's car in for a service job - never owned. */
  isCustomerCar: boolean
  /**
   * True while an accepted service job's car hasn't actually arrived yet
   * (Sprint 25 task 2) - always false for an owned car. The slot renders it
   * dimmed, undraggable, and un-movable until this clears.
   */
  arrivingTomorrow: boolean
  /**
   * Sprint 68 decision 4 (playtest item 22): a live walk-in offer is waiting
   * on this car right now. Always false for a customer's car (never ours to
   * sell). The badge is what tells a player their listed car has something to
   * answer today, without opening it.
   */
  hasOffer: boolean
}

/** One tool line's ladder state, for the Upgrades screen (Sprint 36). */
/** One rung of a tool line's 3-node ladder (Sprint 43 tool wall). */
export interface ToolTierRungView {
  tier: ToolTier
  displayName: string
  /** True for every tier at or below the line's current tier. */
  owned: boolean
  /** Null for tier 1 (always owned, never priced) - the yen cost to reach this rung. */
  upgradePriceYen: number | null
  /** This rung's own reputation requirement, regardless of whether it's met yet - null on tier 1. */
  minReputationTier: ReputationTier | null
  /**
   * Sprint 52 decision 2: true only when a live classifieds listing exists
   * for exactly this line+tier - reputation/cash alone no longer make a
   * tier purchasable, so the Upgrade button reads this too.
   */
  isListed: boolean
}

/** Sprint 52 decision 2: the one live used-machinery classifieds listing,
 * surfaced for the Upgrades screen - null when nothing's on offer this
 * week ("nothing in the classifieds this week" empty state). */
export interface MachineListingView {
  componentId: ComponentId
  componentLabel: string
  tier: ToolTier
  displayName: string
  priceYen: number
  daysLeft: number
}

/** Sprint 48: one click-per-rung repair step, priced/labored off the real
 * plan - shared shape for the group row, the per-part row, and the bench
 * recondition control. */
export interface NextRepairStepView {
  targetBand: ConditionBand
  costYen: number
  laborSlotsRequired: number
}

export interface ToolLineView {
  componentId: ComponentId
  /** The line's group in display words ("Engine", never a raw id). */
  componentLabel: string
  currentTier: ToolTier
  /** The current tier's named, real-world kit ("Trolley jack & axle stands"). */
  currentTierName: string
  /** The next tier's name and price - null once the line is maxed. */
  nextTierName: string | null
  nextTierPriceYen: number | null
  /** The reputation tier still needed for the next rung, or null if already met/ungated/maxed
   * (Sprint 43 - mirrors `nextBayReputationGate`'s hint-only-when-unmet shape). */
  nextTierRepGate: ReputationTier | null
  maxed: boolean
  /** The full 3-rung ladder, for the tool-wall grid (Sprint 43). */
  tiers: ToolTierRungView[]
}

/** Sprint 43: a readable job-template name derived from its kebab-case
 * catalog id, zero new authored strings ("cooling-system-service" ->
 * "Cooling System Service"). Templates have no player-facing display name
 * anywhere else in the game (players only ever see a generated job's own
 * flavor text), so the id itself is the only real, derivable label. */
function humanizeTemplateId(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Sprint 43 tool-wall info box: what reaching `tier` of `componentId`'s
 * line actually unlocks - derived live from the real catalog, nothing
 * hand-authored. */
export interface ToolTierInfo {
  /** Real job templates with a task in this group whose minToolTier is
   * exactly this rung - "reaching this tier makes these jobs offerable"
   * (assuming no other group is deficient, same one-tier-away rule
   * `isTemplateOfferable` uses). */
  unlocksJobTemplateNames: string[]
  /** True only for engine tier 3 - the one real own-car capability ceiling
   * (`toolCeilings.naToTurboConversionEngineTier`). */
  unlocksNaToTurboConversion: boolean
  /** The speed effect every tier has, in plain words - `ceil(grades /
   * tier)` labor slots per grade climbed (`slotsNeededToClimb`, bands.ts). */
  laborSlotsPerGradeText: string
}

/** One line of the parts-market cart, aggregated by part (repeats in
 * `cartPartIds` = quantity), for the cart panel (Sprint 14). */
export interface CartItemView {
  part: Part
  quantity: number
  subtotalYen: number
}

/** One owned part paired with its catalog entry, for the staging inventory panel (Sprint 18). */
export interface StageablePartView {
  instance: PartInstance
  part: Part
}

/** One task's condition, for the offer/active-job board (Sprint 29). */
export interface ServiceJobTaskView {
  label: string
  done: boolean
}

/** Sprint 61 (item 10): one "fits this vehicle" option in the parts market -
 * an owned car or an accepted customer service-job car (arrived or inbound). */
export interface PartsFitVehicleOption {
  id: string
  label: string
  fitmentClass: PartFitmentClass | null
}

/** Sprint 62 (item 17): the reputation half of the Standing screen. */
export interface StandingReputationView {
  tier: ReputationTier
  points: number
  /** The next tier by name and its threshold, or null once at the top
   * (legend) - so the screen can say "X at N, you're at M". */
  nextTier: { tier: ReputationTier; threshold: number } | null
}

/** Sprint 62: one discipline's row on the Standing screen - its points and
 * the named tier-4 technique it earns (shown whether or not it's unlocked,
 * progression bible law 5: every unlock is a named real thing). */
export interface StandingSpecialtyView {
  componentId: ComponentId
  componentLabel: string
  points: number
  technique: { displayName: string; thresholdPoints: number; unlocked: boolean } | null
}

/** Sprint 62 (item 17): everything the Standing screen renders - granular
 * reputation, all six specialty disciplines, and the derived shop title. Pure
 * function of existing state (no new persisted field), the same shape Sprint
 * 39's title derivation already established. */
export interface StandingView {
  reputation: StandingReputationView
  specialties: StandingSpecialtyView[]
  shopTitleName: string | null
}

/** A service-job offer on the board (accept to bring the car into the shop). */
export interface ServiceJobOfferView {
  id: string
  customerName: string
  description: string
  tasks: ServiceJobTaskView[]
  carName: string
  /** Sprint 61: the customer car's fitment class (which class of parts fit
   * it) - `null` if the model is somehow unresolved. Rendered as a small chip
   * so the player knows which parts to buy for the job. */
  fitmentClass: PartFitmentClass | null
  payoutYen: number
  baseReputation: number
  expiresOnDay: number
  /**
   * False while any task's `minToolTier` exceeds its line's current tier
   * (Sprint 36) - `resolveAcceptServiceJob` refuses it, so the UI shows why
   * upfront rather than letting the click silently fail. Derived live, so
   * it flips true the moment the upgrade lands.
   */
  canAccept: boolean
  /** Set only when `canAccept` is false: the offer rule's upgrade-hint
   * string, "needs <the deficient line's next tier displayName>". */
  upgradeHint?: string
}

/** A service job in the shop, tracked against its car's real work state. */
export interface ServiceJobView {
  id: string
  customerName: string
  description: string
  tasks: ServiceJobTaskView[]
  carId: string
  carName: string
  /** Sprint 61: the customer car's fitment class - same chip as the offer
   * card, so the in-shop job also shows which parts fit it. `null` if the
   * model is somehow unresolved. */
  fitmentClass: PartFitmentClass | null
  payoutYen: number
  baseReputation: number
  /** True once every task has actually been done on the car. */
  workDone: boolean
  /** Reputation lost if this job is failed (handed back unfinished / overdue). */
  failureReputationPenalty: number
  /** Days remaining before the deadline auto-resolves it (null if somehow unset). */
  daysLeft: number | null
  /** Set while the customer's car hasn't arrived yet (Sprint 25 task 2); null once it has. */
  arrivesOnDay: number | null
  /**
   * True while the customer's car is still in transit (Sprint 40) - derived
   * via the same `isServiceJobInTransit` helper the sim's own completion
   * guard uses, rather than callers re-deriving `arrivesOnDay != null`
   * locally (CarDetailScreen's old local computed did exactly that - a small
   * DRY violation this field closes). The board and the car page both gate
   * their "work done" / "work outstanding" display on this, never `workDone`
   * alone - a job's tasks can read as satisfied on the rolled customer car
   * before it has even arrived, and that must never render as "hand it
   * back."
   */
  inTransit: boolean
}

/** Immediate feedback for a resolved service job (Sprint 10), for a completion modal. */
/**
 * Sprint 68 decision 5 (playtest item 23): the receipt for a completed sale -
 * mirrors `ServiceJobResultView`'s shape and its store-ref + global-mount
 * lifecycle exactly, because a sale closing with nothing to show for it was
 * the same gap `JobCompleteModal` already closed for a job.
 *
 * Everything here is a READ. The Sprint 42 car ledger already tracked purchase,
 * repairs and parts; `car-sold` already carried the price and a real
 * `profitYen`. None of it was ever rendered.
 */
export interface SaleResultView {
  displayName: string
  priceYen: number
  purchaseYen: number
  repairYen: number
  partsYen: number
  totalSpentYen: number
  /** Null when the purchase price was never known (e.g. a dev-granted car).
   * Never fabricated - the same honesty `car-sold`'s optional `profitYen`
   * already encodes. */
  profitYen: number | null
}

export interface ServiceJobResultView {
  outcome: 'paid' | 'failed'
  customerName: string
  /** Sprint 29: a job can have several tasks now - one label per task,
   * built from real part names, never the raw camelCase id. */
  taskLabels: string[]
  payoutYen: number
  /** Positive for a paid job, negative (or zero) for a failed one. */
  reputationDelta: number
  /**
   * Sprint 57: what the player actually paid, read from the job's own
   * ledger - present (0 when that kind of spend never happened) whether
   * the job paid or failed, so a repair-only job reports real numbers too.
   */
  repairCostYen: number
  partsCostYen: number
  /** `payoutYen - repairCostYen - partsCostYen` - always <= 0 on failure
   * (no payout, sunk cost only). */
  netProfitYen: number
  /** Per-group specialty earned or lost, split evenly across every group
   * the job's tasks touched - untouched groups are 0, not omitted. */
  specialtyGained: Record<ComponentId, number>
  /** Days between acceptance and this resolution. */
  daysSpent?: number
}

/**
 * An auction lot with the derived numbers the auction screen shows (Sprint
 * 20: the open-bidding board replaces the old sealed-bid headroom/interest
 * gauges - the state itself is now visible, so there's nothing left to
 * fuzz).
 */
export interface LotDetail {
  lot: AuctionLot
  model: CarModel
  displayName: string
  /** Sprint 61: the car's fitment class (which class of parts fit it),
   * rendered as a small chip on the lot card so a bidder knows what they'd be
   * buying parts for. */
  fitmentClass: PartFitmentClass
  /**
   * The card's headline number (Sprint 30 decision 2's UI half): the same
   * transparent `instanceValue` every price in the game reads from
   * (`bidding.ts`'s `anchorValueYen`, now age/mileage-aware per decision 1).
   * No `bookValueYen` field on purpose (Sprint 25 task 5, maintainer
   * decision): it's a static per-model constant unrelated to this specific
   * rolled car's actual condition, so showing it next to a condition-derived
   * guide value only invited "why doesn't this match" confusion.
   */
  guideValueYen: number
  /**
   * Sprint 27 (Sprint 30 decision 2 pulled forward) rebased `reserveYen`
   * itself onto the per-instance guide value above, so reserve and buyout
   * both derive from this specific car's real worth - they move together
   * with condition, no static book anchor left to reconcile against.
   */
  reserveYen: number
  /** Always visible, on every lot (maintainer decision 2). */
  buyoutPriceYen: number
  /** The literal price on the board - 0 before bidding opens. */
  currentBidYen: number
  /** Who holds `currentBidYen` - null only while it's still 0. */
  leadingBidder: 'player' | 'rival' | null
  /** Consecutive quiet overnight steps with no raise; hammers at `hammerThreshold`. */
  quietDays: number
  /** `AUCTION_QUIET_DAYS_TO_HAMMER` - lets the UI say "hammer at 2". */
  hammerThreshold: number
  /**
   * The lot's rolled bidder-count band (Sprint 30 decision 3: thin/steady/
   * packed now means a real number of rival cohorts, `bidding.ts`'s
   * `turnoutBidderCount`), read straight off `lot.turnout` - fixed for the
   * lot's whole life, not recomputed daily. Still shown as a word only, no
   * numeric gauge (maintainer decision 3: price is king).
   */
  turnout: TurnoutBand
  /** The smallest valid raise right now - pre-fills the raise input. */
  nextRaiseYen: number
  /** Set true on the player's first raise on this lot, never reset. */
  playerHasBid: boolean
  /**
   * Each of the 6 real groups' worst present-part band (Sprint 26 decision
   * 10) - lots are transparent now, no reveal machinery: this is always
   * populated, not gated behind an inspection step.
   */
  groupBands: Record<ComponentId, ConditionBand>
  /**
   * Sprint 50: a real-world auction-style condition summary (overall
   * number/letter plus exterior/interior letter grades) computed purely
   * from the car's existing band state - replaces the old expandable
   * 29-part condition report as this card's pre-bid condition signal.
   */
  auctionGrade: AuctionGrade
  /**
   * The real cost to bring every present part on this specific car to mint,
   * at the player's current (equipment-independent, per Sprint 26 decision
   * 7) repair-step costs - the same `restorationBill` `instanceValue`
   * itself deducts (Sprint 27 decision 1), surfaced directly so the player
   * can see exactly what the price already prices in.
   */
  restorationBillYen: number
  /** This lot's backstop close day (the Sprint 19 duration roll) - activity-
   * based closing (quiet-day hammer) usually resolves it sooner than this. */
  expiresOnDay: number
  /** Days remaining until the backstop, for the countdown label. */
  daysLeft: number
  /**
   * A plain-language close prediction (the anti-black-box fix): exactly how
   * soon this lot hammers if no one bids further, and the reassurance that a
   * bid resets it. The auction never closes silently or by surprise; a rival
   * raise always extends the lot a day so the player gets to respond (the
   * anti-snipe rule, `bidding.ts`'s `resolveLotForDay`).
   */
  closeLabel: string
  /**
   * The same countdown `closeLabel` carries, as a raw number the UI can
   * size up - null when there's no meaningful count (no bid yet, or
   * already down to "final call").
   */
  closeNightsLeft: number | null
}

/**
 * A ballpark market-value preview for an owned car (Sprint 31) - the
 * for-sale toggle's "roughly what to expect" number. Not a real offer: real
 * offers only exist once the daily draw actually rolls one (see
 * `pendingOffersView`/`offerFor` below); this is the best-fit buyer's own
 * valuation, un-spread, purely informational.
 */
export interface SaleValueEstimate {
  buyerId: string | undefined
  offerYen: number
}

/** A live, same-day-only offer on an owned car (Sprint 31 decision 2), ready
 * for the car-detail/garage offer panels. */
export interface PendingOfferView {
  carInstanceId: string
  carName: string
  buyerId: string
  buyerName: string
  priceYen: number
  /** "A tuner is offering ¥1,240,000 for the FC. Today only." (decision 5) -
   * the one canonical copy string, also reused by the day-report line
   * (`dayLogFormat.ts`'s `offer-received` case) via `utils/offerCopy.ts`. */
  copy: string
}

/** Summary of the day that just ended, for the end-of-day report modal. */
export interface DayReport {
  day: number
  entries: DayLogEntry[]
  cashDeltaYen: number
}

/**
 * The state bridge between the pure sim and Vue. Holds the one object Dexie
 * persists (`gameState`), the static content `context` (rebuilt each
 * session, never saved), and the running day log. Sprint 11: every player
 * action resolves the instant it's clicked (a direct call to the matching
 * sim instant resolver) - there is no queued plan anymore. `endDay()` is
 * purely a day-boundary tick (labor reset, rent, market drift, catalog
 * refresh). The interactive per-day seed uses the same `seed + day`
 * derivation as the balance harness, so a played game is as reproducible as
 * a bot career.
 */
export const useGameStore = defineStore('game', () => {
  // Content catalogs are static and heavy; shallowRef avoids deep reactivity we never mutate.
  const context = shallowRef<SimContext>(
    buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      SERVICE_JOB_TYPES,
      FACILITIES,
      SERVICE_JOB_CUSTOMER_NAMES,
      TOOL_LINES,
      ECONOMY,
    ),
  )
  const gameState = ref<GameState>(createInitialGameState(context.value, DEFAULT_SEED))
  const dayLog = ref<DayLogEntry[]>([])
  // Monotonic counter for dev-granted content ids (dev-only, so non-deterministic is fine).
  const grantCounter = ref(0)
  // End-of-day report shown after End Day.
  const lastDayReport = ref<DayReport | null>(null)
  const reportVisible = ref(false)
  // Immediate feedback shown after a "Complete Job" resolution (paid or failed).
  const lastJobResult = ref<ServiceJobResultView | null>(null)
  /** Sprint 68 (item 23): mirrors `lastJobResult` - set by `acceptOffer`,
   * cleared on dismiss, rendered by a globally-mounted modal. */
  const lastSaleResult = ref<SaleResultView | null>(null)
  /**
   * True once `hydrate()` has resolved AND actually loaded a real save
   * (Sprint 40) - `MenuScreen`'s own flag: Continue shows only when this is
   * true, and New Game skips its confirmation step when it's false (nothing
   * to lose yet). Starts false; `hydrate()` silently seeding a fresh career
   * when no save exists no longer matters for anything else, since the menu
   * is what reads this flag rather than inferring "is this a real save" any
   * other way.
   */
  const hasExistingSave = ref(false)

  /**
   * Session log v0 (Sprint 24, the record-real-play seed - maintainer idea
   * 2026-07-09): appends one raw event per player action, for a future
   * offline pass to parse into per-archetype rates/biases (see `TODO.md`).
   * Fire-and-forget by design - never awaited in an action path, since a
   * lost telemetry write must never break play (matches `writeSave`'s own
   * best-effort shape, `saveDb.ts`).
   */
  function logSessionEvent(type: string, payload: Record<string, unknown>): void {
    void appendSessionEvent({ day: gameState.value.day, type, payload, timestamp: Date.now() })
  }

  const day = computed(() => gameState.value.day)
  const cashYen = computed(() => gameState.value.cashYen)
  const reputationTier = computed(() => gameState.value.reputationTier)
  const reputationPoints = computed(() => gameState.value.reputationPoints)
  const ownedCarCount = computed(() => gameState.value.ownedCars.length)
  const laborSlotsPerDay = computed(() => availableLaborSlots(gameState.value))
  const laborSlotsRemainingToday = computed(() =>
    Math.max(0, laborSlotsPerDay.value - gameState.value.laborSlotsSpentToday),
  )
  const serviceJobOffers = computed(() => gameState.value.serviceJobOffers)
  const activeServiceJobs = computed(() => gameState.value.activeServiceJobs)

  /** Service-job offers on the board, presented for the accept screen. */
  const serviceJobOfferViews = computed<ServiceJobOfferView[]>(() =>
    gameState.value.serviceJobOffers.map((offer) => {
      const model = context.value.modelsById[offer.car.modelId]
      const canAccept =
        toolDeficitSummary(offer.tasks, gameState.value.toolTiers, context.value).maxDeficit === 0
      return {
        id: offer.id,
        customerName: offer.customerName,
        description: offer.description,
        tasks: serviceJobTaskViews(offer),
        carName: model ? resolveCarDisplayName(model) : offer.car.modelId,
        fitmentClass: model ? fitmentClassForTier(model.tier) : null,
        payoutYen: offer.payoutYen,
        baseReputation: offer.baseReputation,
        expiresOnDay: offer.expiresOnDay,
        canAccept,
        upgradeHint: canAccept
          ? undefined
          : (upgradeHintFor(offer.tasks, gameState.value.toolTiers, context.value) ?? undefined),
      }
    }),
  )

  /** Accepted service jobs in the shop, with each car's live work state. */
  const activeServiceJobViews = computed<ServiceJobView[]>(() =>
    gameState.value.activeServiceJobs.map(serviceJobViewFor),
  )

  /**
   * Sprint 68 decision 2 (playtest item 11): jobs whose work is finished and
   * whose car is sitting in the shop, unpaid, because nobody handed it back.
   * A day ends and that payout just does not arrive.
   */
  const finishedJobsAwaitingHandback = computed<ServiceJobView[]>(() =>
    activeServiceJobViews.value.filter((job) => job.workDone && !job.inTransit),
  )

  /** Sprint 68 decision 2 (item 11): cars carrying planned work that was never
   * confirmed - it costs nothing and does nothing until Confirm, so ending the
   * day on it is pure lost time. */
  const carsWithUnconfirmedWork = computed<string[]>(() =>
    Object.entries(gameState.value.stagedCarWork)
      .filter(([, actions]) => actions.length > 0)
      .map(([carId]) => carId),
  )

  /**
   * Sprint 61 (item 10): the parts market's "fits this vehicle" filter's
   * options - every owned car PLUS every accepted service-job customer car,
   * including one that hasn't arrived yet. The core loop is accept the job,
   * order the right-class parts, then car and parts arrive together the next
   * morning - so a customer car the player can't buy parts for until it's
   * physically in the shop would break exactly the flow this serves. Each
   * carries the car's fitment class directly (what the filter narrows to) and
   * a context-labelled name.
   */
  const partsFitVehicleOptions = computed<PartsFitVehicleOption[]>(() => {
    const owned = gameState.value.ownedCars.map((car) => {
      const model = context.value.modelsById[car.modelId]
      return {
        id: car.id,
        label: model ? resolveCarDisplayName(model) : car.modelId,
        fitmentClass: model ? fitmentClassForTier(model.tier) : null,
      }
    })
    const customer = gameState.value.activeServiceJobs.map((job) => {
      const model = context.value.modelsById[job.car.modelId]
      const name = model ? resolveCarDisplayName(model) : job.car.modelId
      const arriving = isServiceJobInTransit(job, gameState.value.day)
      const suffix =
        arriving && job.arrivesOnDay !== null
          ? ` (customer, arrives day ${job.arrivesOnDay})`
          : ' (customer, in the shop)'
      return {
        id: job.car.id,
        label: `${name}${suffix}`,
        fitmentClass: model ? fitmentClassForTier(model.tier) : null,
      }
    })
    return [...owned, ...customer]
  })

  function detailFor(car: CarInstance): DetailedCar {
    const model = context.value.modelsById[car.modelId]
    if (!model) throw new Error(`owned car ${car.id} references unknown model ${car.modelId}`)
    return {
      car,
      model,
      displayName: resolveCarDisplayName(model),
      stats: computeDerivedStats(
        model,
        car,
        context.value.partsById,
        context.value.partsTaxonomy,
        context.value.economy,
      ),
    }
  }

  /**
   * Each of the 6 real groups' worst present-part band (Sprint 26 decision
   * 10/13) - the group-level condition summary both the car-detail and the
   * (now always-transparent) auction lot-detail screens show. A group with
   * no present parts (never happens today - only `forcedInduction` can be
   * unfitted, and every group has other members) reports `'mint'`.
   */
  function groupBandsForCar(car: CarInstance): Record<ComponentId, ConditionBand> {
    const result = {} as Record<ComponentId, ConditionBand>
    for (const groupId of REAL_COMPONENT_GROUPS) {
      const partIds = presentPartIdsInGroup(car, groupId, context.value.partIdsByGroup)
      let worst: ConditionBand = 'mint'
      for (const partId of partIds) {
        // presentPartIdsInGroup already filters to installed !== null.
        const band = car.parts[partId].installed!.band
        if (bandIndex(band) < bandIndex(worst)) worst = band
      }
      result[groupId] = worst
    }
    return result
  }

  /**
   * Each of the 6 real groups' own scaled restoration bill (Sprint 41
   * decision 4) - `groupCostToMintYen` per group, the condition panel's
   * per-group bill line. Reuses the exact same function `repair()`'s own
   * cost preview and `carCostToMintYen`'s per-part sum both build on -
   * never a second bill computation.
   */
  function groupBillsForCar(car: CarInstance, model: CarModel): Record<ComponentId, number> {
    const result = {} as Record<ComponentId, number>
    for (const groupId of REAL_COMPONENT_GROUPS) {
      result[groupId] = groupCostToMintYen(
        car,
        model,
        groupId,
        context.value.partIdsByGroup,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy,
      )
    }
    return result
  }

  /**
   * The worst REPAIRABLE, sub-mint present-part band within a group (Sprint
   * 41 coordinator fix) - the group "Repair all" control's own floor,
   * distinct from `groupBandsForCar`'s display chip (which correctly
   * includes scrap/non-repairable parts in what it reports as the group's
   * worst condition - real information, left unchanged). Feeding THAT value
   * into `BandPicker`'s `currentBand` let a group with a scrap part next to
   * a merely-worn one offer `poor` as a selectable target - a dead action,
   * since `planGroupRepair` finds nothing repairable below `poor` and
   * silently no-ops. Null when nothing in the group is both repairable and
   * below mint - the signal the control should not render at all.
   */
  function groupRepairFloorBand(carId: string, componentId: ComponentId): ConditionBand | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    return worstRepairableBandInGroup(
      car,
      componentId,
      context.value.partIdsByGroup,
      context.value.partsTaxonomyById,
    )
  }

  /**
   * Sprint 48: one repairable row's or one whole group's NEXT single rung of
   * repair - "click to plan one more band," replacing the old BandPicker
   * (pick any target, then a separate Stage button). Priced/labored off the
   * REAL repair plan (never a hardcoded one-click-one-labor assumption):
   * computes the plan through the already-staged target (if any) and through
   * one rung further, and returns the DIFFERENCE - the true marginal cost of
   * this one click, whether it's the first click (climbing from the real
   * band) or a repeat click (climbing further from what's already staged).
   * Null when there is nothing left to plan (unrepairable, scrap, missing,
   * or already staged/installed at mint).
   */
  function nextRepairStep(
    carId: string,
    componentId: ComponentId,
    carPartId?: CarPartId,
  ): NextRepairStepView | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    const staged = stagedActionsFor(carId).find(
      (a) => a.kind === 'repair' && a.componentId === componentId && a.carPartId === carPartId,
    )
    const stagedTarget = staged && staged.kind === 'repair' ? staged.targetBand : null
    const realFloor = carPartId
      ? (car.parts[carPartId].installed?.band ?? null)
      : groupRepairFloorBand(carId, componentId)
    if (!realFloor) return null
    const effectiveCurrent = stagedTarget ?? realFloor
    if (effectiveCurrent === 'mint') return null
    const nextRung = climbBand(effectiveCurrent, 1)

    const planTo = (target: ConditionBand) =>
      planGroupRepair(
        car,
        componentId,
        target,
        gameState.value.toolTiers,
        context.value.partIdsByGroup,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy.restoration.repairStepFraction,
        carPartId,
      )
    const alreadyPlanned = stagedTarget
      ? planTo(stagedTarget)
      : { costYen: 0, laborSlotsRequired: 0, partIds: [] }
    const throughNextRung = planTo(nextRung)
    const costYen = throughNextRung.costYen - alreadyPlanned.costYen
    const laborSlotsRequired =
      throughNextRung.laborSlotsRequired - alreadyPlanned.laborSlotsRequired
    if (laborSlotsRequired <= 0) return null // nothing repairable left to climb (scrap/non-repairable)
    return { targetBand: nextRung, costYen, laborSlotsRequired }
  }

  /** Sprint 48: the bench recondition control's own next-rung step - reuses
   * `reconditionQuoteFor` (already the exact charge `reconditionPart` will
   * make) rather than re-deriving the plan, since bench work has no staging
   * step to diff against (each click executes immediately). Null when
   * there's nothing left to recondition (already mint, scrap, or
   * non-repairable). */
  function nextReconditionStep(partInstanceId: string): NextRepairStepView | null {
    const instance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    if (!instance || instance.band === 'mint') return null
    const nextRung = climbBand(instance.band, 1)
    const quote = reconditionQuoteFor(partInstanceId, nextRung)
    if (!quote) return null
    return {
      targetBand: nextRung,
      costYen: quote.costYen,
      laborSlotsRequired: quote.laborSlotsRequired,
    }
  }

  /** Sprint 41 decision 2: whether a real car part can be repaired at all -
   * false for tyres/brakePadsDiscs/clutch. The per-part repair row and the
   * bench recondition control (`PartCard.vue`) both key off this. */
  function isPartRepairable(carPartId: CarPartId): boolean {
    return context.value.partsTaxonomyById[carPartId]?.repairable ?? true
  }

  /**
   * Every real part addressed to `componentId`'s group on `car` (Sprint 26
   * decision 13) - operates on a `CarInstance` directly so both the
   * owned-car screen (`partsInGroup`, below, looked up by car id) and the
   * auction lot-detail screen (Sprint 27 decision 3, which has no owned car
   * to look up) share one row-building implementation rather than each
   * re-deriving it. `model` (Sprint 32) is needed to tell a genuinely
   * MISSING slot apart from the one legitimately-empty case
   * (`forcedInduction` on an NA car) - see `isPartMissing`, sim/bands.ts.
   *
   * Sprint 28: iterates every part the taxonomy assigns to the group
   * (`partIdsByGroup`), not just the present ones (`presentPartIdsInGroup`)
   * - the drill-down needs to show an empty slot too, so there's a row to
   * fill it from. Group-band/valuation math is unaffected: it still goes
   * through `presentPartIdsInGroup` on its own, unchanged.
   */
  function carPartRowsInGroup(
    car: CarInstance,
    model: CarModel,
    componentId: ComponentId,
  ): CarPartRowView[] {
    return context.value.partIdsByGroup[componentId].map((partId) => {
      const installed = car.parts[partId].installed
      const part = installed ? context.value.partsById[installed.partId] : undefined
      const missing = isPartMissing(car, model, partId)
      return {
        partId,
        displayName: carPartLabel(partId),
        band: installed ? installed.band : null,
        installedPartName: installed ? partName(installed.partId) : null,
        grade: part?.grade ?? null,
        missing,
        legitimatelyAbsent: !installed && !missing,
        repairable: isPartRepairable(partId),
      }
    })
  }

  /**
   * Every real part present in `componentId`'s group on this owned/workable
   * car - the per-part breakdown the car-detail screen shows below a
   * group's headline band, since a group can hold several parts now.
   */
  function partsInGroup(carId: string, componentId: ComponentId): CarPartRowView[] {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return []
    return carPartRowsInGroup(car, model, componentId)
  }

  const carsDetailed = computed<DetailedCar[]>(() => gameState.value.ownedCars.map(detailFor))

  const ownedCarNames = computed(() => carsDetailed.value.map((d) => d.displayName))

  function resolveModelName(modelId: string): string {
    const model = context.value.modelsById[modelId]
    return model ? resolveCarDisplayName(model) : modelId
  }

  /** Display label for a part (parody-branded from day one, no naming flip). */
  function partName(partId: string): string {
    const part = context.value.partsById[partId]
    return part ? `${part.brand} ${part.name}` : partId
  }

  /**
   * Display label for a component id - real words, never the raw camelCase
   * id (Sprint 25 task 6). Every template renders a component through this
   * instead of interpolating `componentId` directly.
   */
  function componentLabel(id: ComponentId): string {
    return componentDisplayName(id, COMPONENT_DISPLAY_NAMES)
  }

  /**
   * Display label for one of the 29 real car parts (Sprint 26) - reads the
   * taxonomy's own authored `displayName`, never the raw camelCase
   * `CarPartId`. Distinct from `componentLabel` above (that one's for the
   * 6 groups; this one's for a specific part within a group).
   */
  function carPartLabel(id: CarPartId): string {
    return context.value.partsTaxonomyById[id]?.displayName ?? id
  }

  /** Which of the 6 groups a real car part belongs to (Sprint 26) - the
   * catalog/taxonomy lookup every group-level UI action needs. */
  function groupForCarPart(id: CarPartId): ComponentId | undefined {
    return context.value.partsTaxonomyById[id]?.group
  }

  /**
   * Display label for a part's fitment class (Sprint 53) - the diegetic
   * name ("Kei & Compact", "Family", ...), never the raw code identifier
   * (`shitbox`/`common`/...). Every template renders a SKU's class through
   * this instead of interpolating `fitmentClass` directly.
   */
  function fitmentClassLabel(fitmentClass: PartFitmentClass): string {
    return partFitmentClassLabel(fitmentClass)
  }

  /**
   * A short human label for one service-job task (Sprint 29). Always built
   * from the real part's display name, never the raw camelCase `CarPartId`
   * (Sprint 25 task 6's rule, extended to the multi-task job shape - a
   * job's copy is built from `tasks` now, never a single `work` field).
   * Band/grade words (`mint`, `street`, ...) are already plain English, not
   * ids, so they render as-is - same convention `BandChip` uses.
   */
  function taskLabel(task: ServiceJobTask): string {
    const partName = carPartLabel(task.carPartId)
    return task.action === 'repair'
      ? `${partName} repair to ${task.targetBand}`
      : `${partName} install (${task.minGrade} or better)`
  }

  /** Every task on a service job, paired with whether it's actually done on
   * the car right now - the offer/active-job board's per-task breakdown. */
  function serviceJobTaskViews(job: ServiceJob): ServiceJobTaskView[] {
    return job.tasks.map((task) => ({
      label: taskLabel(task),
      done: isServiceTaskDone(job.car, task, context.value.partsById, job.baselineInstalledPartIds),
    }))
  }

  /**
   * A car the player can work on - either an owned car or a customer's car
   * sitting in an active service job. Both are worked through the same job
   * system, so the car-detail screen resolves either.
   */
  function findWorkableCar(carId: string): CarInstance | undefined {
    return (
      gameState.value.ownedCars.find((c) => c.id === carId) ??
      gameState.value.activeServiceJobs.find((sj) => sj.car.id === carId)?.car
    )
  }

  /**
   * True while `carId` is an accepted service job's customer car still in
   * transit (Sprint 25 task 2) - false for an owned car (never in transit)
   * and false once the car has actually arrived. Staging, moving, and
   * swapping all refuse while this is true; there's simply nothing there yet
   * to work on or relocate.
   */
  function isCarInTransit(carId: string): boolean {
    const job = gameState.value.activeServiceJobs.find((sj) => sj.car.id === carId)
    return job !== undefined && isServiceJobInTransit(job, gameState.value.day)
  }

  /** Full detail bundle for one workable car (owned or in-shop), or undefined. */
  /**
   * Sprint 60 (economy-bible.md law 5): the foundation-law surfacing for one
   * car - the failing foundational parts and the aftermarket-premium yen they
   * withhold, or null when the foundation is sound OR the car carries no
   * premium to withhold. Reads the same `foundationFactor`/
   * `installedPartsValueYen` the value formula itself uses, so what the panel
   * says and what the price does can never disagree.
   */
  function foundationWarningFor(
    car: CarInstance,
  ): { failingParts: string[]; withheldYen: number } | null {
    const economy = context.value.economy
    const premiumYen = installedPartsValueYen(car, context.value.partsById, economy)
    const factor = foundationFactor(car, economy)
    const withheldYen = Math.round(premiumYen * (1 - factor))
    if (withheldYen <= 0) return null
    const { parts, factorByState } = economy.valuation.foundation
    const failingParts = parts
      .filter((partId) => {
        const installed = car.parts[partId].installed
        const state = installed ? installed.band : 'missing'
        return factorByState[state] < 1
      })
      .map((partId) => carPartLabel(partId))
    return { failingParts, withheldYen }
  }

  /**
   * The legibility clause of economy-bible law 1 (as amended, Sprint 66),
   * which is part of the law and not a nicety: work planned ABOVE the car's
   * tier expectation band returns less than it costs, deliberately, and the
   * player has to be told so in the same breath as the price. A disclosed,
   * optional money-loser is a choice; an undisclosed one is a value trap.
   *
   * Returns null unless this car can ACTUALLY lose money above the band:
   * - `band === 'mint'`: nothing is above it.
   * - `beyondDiscount >= 1`: work past the band still returns more than it
   *   costs (the uncommon tier sits at 1.2), so it is a smaller profit, not a
   *   loss. Warning there would be a lie.
   * - no bill above the band: nothing to warn about.
   */
  function passionSpendNoticeFor(
    car: CarInstance,
    model: CarModel,
  ): { band: ConditionBand; returnRate: number } | null {
    const economy = context.value.economy
    const expectation = expectationForCar(model, economy)
    if (expectation.band === 'mint' || expectation.beyondDiscount >= 1) return null
    const billToMint = carCostToMintYen(
      car,
      model,
      context.value.partsById,
      context.value.partsTaxonomyById,
      economy,
    )
    const billToBand = carCostToBandYen(
      car,
      model,
      context.value.partsById,
      context.value.partsTaxonomyById,
      economy,
      expectation.band,
    )
    if (billToMint - billToBand <= 0) return null
    return { band: expectation.band, returnRate: expectation.beyondDiscount }
  }

  function carDetail(carId: string): CarDetail | undefined {
    const car = findWorkableCar(carId)
    if (!car) return undefined
    const model = context.value.modelsById[car.modelId]
    if (!model) return undefined
    const serviceJob = gameState.value.activeServiceJobs.find((sj) => sj.car.id === carId)
    return {
      ...detailFor(car),
      jobs: gameState.value.jobs.filter((j) => j.carInstanceId === carId),
      serviceJob: serviceJob ? serviceJobViewFor(serviceJob) : undefined,
      inServiceBay: gameState.value.serviceBayCarIds.includes(carId),
      stagedActions: gameState.value.stagedCarWork[carId] ?? [],
      groupBands: groupBandsForCar(car),
      groupBillYen: groupBillsForCar(car, model),
      totalBillYen: carCostToMintYen(
        car,
        model,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy,
      ),
      ledger: carLedgerFor(gameState.value, carId),
      guideValueYen: carGuideValueYen(car, model, gameState.value, context.value),
      foundationWarning: foundationWarningFor(car),
      passionSpendNotice: passionSpendNoticeFor(car, model),
      plannedEstimate: plannedEstimateFor(carId),
    }
  }

  /** The total yen every currently planned REPAIR action will charge at
   * Confirm - the exact figure `confirmStagedWork` deducts (Sprint 47: no
   * consumables fee on top). Planned installs charge nothing NEW here - that
   * cash already left when the part was bought. */
  function plannedRepairCostYen(carId: string): number {
    const car = findWorkableCar(carId)
    if (!car) return 0
    let total = 0
    for (const action of stagedActionsFor(carId)) {
      if (action.kind !== 'repair') continue
      total += planGroupRepair(
        car,
        action.componentId,
        action.targetBand,
        gameState.value.toolTiers,
        context.value.partIdsByGroup,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy.restoration.repairStepFraction,
        action.carPartId,
      ).costYen
    }
    return total
  }

  /** Sprint 63: the total labour slots the currently planned work will
   * require at Confirm - mirrors `confirmStagedWork`'s own accounting exactly
   * (a repair action's `planGroupRepair.laborSlotsRequired` when it has real
   * work, plus `INSTALL_LABOR_SLOTS` per planned install), so the Confirm
   * button shows what a click actually spends, not the day's remaining total. */
  function plannedLaborSlots(carId: string): number {
    const car = findWorkableCar(carId)
    if (!car) return 0
    let total = 0
    for (const action of stagedActionsFor(carId)) {
      if (action.kind === 'repair') {
        const plan = planGroupRepair(
          car,
          action.componentId,
          action.targetBand,
          gameState.value.toolTiers,
          context.value.partIdsByGroup,
          context.value.partsById,
          context.value.partsTaxonomyById,
          context.value.economy.restoration.repairStepFraction,
          action.carPartId,
        )
        if (plan.partIds.length > 0) total += plan.laborSlotsRequired
      } else {
        total += INSTALL_LABOR_SLOTS
      }
    }
    return total
  }

  /**
   * Sprint 67 decision 1 (playtest item 7): what the action planned at ONE
   * address will cost and cost in labour - null when nothing is planned there.
   *
   * The bug this closes: a row's caption used to show the NEXT rung's
   * increment, so a `poor -> fine` plan (2 rungs) read "+Y4,800 - +1 labour"
   * while Confirm correctly charged "Y9,600 - 2 labour". Both numbers were
   * individually right; the row was answering a different question than the
   * player was asking. Now the row shows the ROW's own planned total and the
   * increment lives in the `+` button's tooltip.
   *
   * Deliberately the same `planGroupRepair` call, with the same arguments, as
   * `plannedRepairCostYen`/`plannedLaborSlots` make - scoped to one staged
   * action instead of summed over all of them. That is what makes the row
   * totals sum to Confirm's figure by construction rather than by agreement,
   * and it is asserted directly in the store tests.
   */
  function plannedStepFor(
    carId: string,
    componentId: ComponentId,
    carPartId?: CarPartId,
  ): { costYen: number; laborSlots: number } | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    const action = stagedActionsFor(carId).find(
      (a) => a.kind === 'repair' && a.componentId === componentId && a.carPartId === carPartId,
    )
    if (!action || action.kind !== 'repair') return null
    const plan = planGroupRepair(
      car,
      action.componentId,
      action.targetBand,
      gameState.value.toolTiers,
      context.value.partIdsByGroup,
      context.value.partsById,
      context.value.partsTaxonomyById,
      context.value.economy.restoration.repairStepFraction,
      action.carPartId,
    )
    return {
      costYen: plan.costYen,
      // Mirrors `plannedLaborSlots`' own accounting: a plan with no real work
      // costs no labour, matching what `confirmStagedWork` actually spends.
      laborSlots: plan.partIds.length > 0 ? plan.laborSlotsRequired : 0,
    }
  }

  /** Sprint 48: the Finances panel's pre-Confirm estimate - null when
   * nothing is planned. Feeds the projected car (`previewPlannedWork`)
   * straight into the same `carCostToMintYen`/`carGuideValueYen` the real
   * bill/guide value already use, so "after" is never a parallel estimator. */
  function plannedEstimateFor(carId: string): PlannedEstimateView | null {
    if (stagedActionsFor(carId).length === 0) return null
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    const preview = previewPlannedWork(gameState.value, carId, context.value)
    if (!car || !model || !preview) return null

    const repairCostYen = plannedRepairCostYen(carId)
    const ledger = carLedgerFor(gameState.value, carId)
    const totalSpentYenAfter =
      (ledger.purchaseYen ?? 0) + ledger.repairYen + repairCostYen + ledger.partsYen
    const billYenAfter = carCostToMintYen(
      preview,
      model,
      context.value.partsById,
      context.value.partsTaxonomyById,
      context.value.economy,
    )
    const guideValueYenAfter = carGuideValueYen(preview, model, gameState.value, context.value)
    return {
      plannedRepairCostYen: repairCostYen,
      plannedLaborSlots: plannedLaborSlots(carId),
      billYenAfter,
      guideValueYenAfter,
      totalSpentYenAfter,
      projectedProfitYenAfter: guideValueYenAfter - totalSpentYenAfter,
    }
  }

  /** Present one active service job with its resolved car name and work state. */
  function serviceJobViewFor(job: ServiceJob): ServiceJobView {
    const model = context.value.modelsById[job.car.modelId]
    return {
      id: job.id,
      customerName: job.customerName,
      description: job.description,
      tasks: serviceJobTaskViews(job),
      carId: job.car.id,
      carName: model ? resolveCarDisplayName(model) : job.car.modelId,
      fitmentClass: model ? fitmentClassForTier(model.tier) : null,
      payoutYen: job.payoutYen,
      baseReputation: job.baseReputation,
      workDone: isServiceWorkDone(job, context.value),
      failureReputationPenalty: reputationForFailure(job.baseReputation),
      daysLeft: job.dueOnDay === null ? null : job.dueOnDay - gameState.value.day,
      arrivesOnDay: job.arrivesOnDay,
      inTransit: isServiceJobInTransit(job, gameState.value.day),
    }
  }

  // --- auction & market selectors --------------------------------------

  /** Display name for a buyer archetype (Sprint 31) - "Tuner", "Collector",
   * ... - the other half of the offer copy alongside the car's own name. */
  function buyerName(buyerId: string): string {
    return context.value.buyers.find((b) => b.id === buyerId)?.displayName ?? buyerId
  }

  /** True while `carId` is toggled "taking offers" (Sprint 31 decision 2). */
  function isForSale(carId: string): boolean {
    return gameState.value.carsForSale.some((f) => f.carInstanceId === carId)
  }

  function pendingOfferViewFor(carInstanceId: string): PendingOfferView | undefined {
    const offer = gameState.value.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
    if (!offer) return undefined
    const car = gameState.value.ownedCars.find((c) => c.id === carInstanceId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return undefined
    const carName = resolveCarDisplayName(model)
    const buyer = buyerName(offer.buyerId)
    return {
      carInstanceId,
      carName,
      buyerId: offer.buyerId,
      buyerName: buyer,
      priceYen: offer.priceYen,
      copy: offerCopy(buyer, carName, offer.priceYen),
    }
  }

  /** Today's live offer on one car, if any (Sprint 31) - the car-detail
   * screen's offer card. */
  function offerFor(carId: string): PendingOfferView | undefined {
    return pendingOfferViewFor(carId)
  }

  /** Every live offer across every owned car (Sprint 31) - the garage-wide
   * offers panel. */
  const pendingOffersView = computed<PendingOfferView[]>(() =>
    gameState.value.pendingOffers.flatMap((o) => {
      const view = pendingOfferViewFor(o.carInstanceId)
      return view ? [view] : []
    }),
  )

  /** Current auction catalog grouped by tier (only tiers with lots present). */
  const auctionLotsByTier = computed<{ tier: AuctionTier; lots: AuctionLot[] }[]>(() => {
    const byTier = new Map<AuctionTier, AuctionLot[]>()
    for (const lot of gameState.value.activeAuctionLots) {
      const list = byTier.get(lot.tier) ?? []
      list.push(lot)
      byTier.set(lot.tier, list)
    }
    return [...byTier.entries()].map(([tier, lots]) => ({ tier, lots }))
  })

  /** Derived numbers + the 6 real group bands for one lot (Sprint 26 decision
   * 10: lots are transparent now, no inspection gate). */
  /**
   * The plain-language close prediction shown on lots and active bids (the
   * anti-black-box fix). A lot hammers after `AUCTION_QUIET_DAYS_TO_HAMMER`
   * consecutive silent nights or at its backstop day, whichever comes first
   * on a QUIET night - any bid resets the quiet count and (per the anti-snipe
   * rule) extends the lot a day, so this is genuinely "soonest it can close
   * if nobody bids again," never a surprise.
   */
  /**
   * Nights left until this lot could next close (min of the quiet-day and
   * backstop arms) - null when there's nothing meaningful to show: nobody
   * has bid, or it's already down to the final night ("final call", not a
   * number). Shared by `auctionCloseLabel` and `LotDetail.closeNightsLeft`
   * so the two can never disagree.
   */
  function auctionNightsLeft(lot: AuctionLot): number | null {
    if (lot.currentBidYen === 0) return null
    const threshold = context.value.economy.AUCTION_QUIET_DAYS_TO_HAMMER
    const quietNightsLeft = Math.max(1, threshold - lot.quietDays)
    // Sprint 46 fix: the real backstop hammer fires when `day >= expiresOnDay`
    // (bidding.ts's resolveLotForDay), where `day` here is still today's
    // pre-increment value - so the backstop CANNOT fire tonight when
    // `day === expiresOnDay - 1`. The `+ 1` mirrors the quiet-days arm's own
    // implicit offset; without it this showed "final call" one full day
    // before the backstop could actually close the lot (playtest 2026-07-13).
    const backstopNightsLeft = Math.max(1, lot.expiresOnDay - gameState.value.day + 1)
    const nightsLeft = Math.min(quietNightsLeft, backstopNightsLeft)
    return nightsLeft > 1 ? nightsLeft : null
  }

  function auctionCloseLabel(lot: AuctionLot): string {
    if (lot.currentBidYen === 0) return 'no bids yet - open to bid'
    const nightsLeft = auctionNightsLeft(lot)
    if (nightsLeft === null) return 'final call: closes at End Day unless a new bid comes in'
    // Sprint 56 decision 5: the "(any bid resets the clock)" parenthetical
    // is gone (playtest 2026-07-14 item 8) - the "closes in N days unless
    // bid on" lead-in already carries the mechanic on its own.
    return `closes in ${nightsLeft} days unless bid on`
  }

  function lotDetail(lotId: string): LotDetail | undefined {
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) return undefined
    const model = context.value.modelsById[lot.modelId]
    if (!model) return undefined
    return {
      lot,
      model,
      displayName: resolveCarDisplayName(model),
      fitmentClass: fitmentClassForTier(model.tier),
      guideValueYen: anchorValueYen(lot, gameState.value, context.value),
      reserveYen: reserveYen(lot, gameState.value, context.value),
      buyoutPriceYen: computeBuyoutPriceYen(lot, gameState.value, context.value),
      currentBidYen: lot.currentBidYen,
      leadingBidder: lot.leadingBidder,
      quietDays: lot.quietDays,
      hammerThreshold: context.value.economy.AUCTION_QUIET_DAYS_TO_HAMMER,
      turnout: lot.turnout,
      nextRaiseYen: nextRaiseYen(lot, gameState.value, context.value),
      playerHasBid: lot.playerHasBid,
      groupBands: groupBandsForCar(lot.car),
      auctionGrade: computeAuctionGrade(lot.car, model, context.value.partIdsByGroup),
      restorationBillYen: carCostToMintYen(
        lot.car,
        model,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy,
      ),
      expiresOnDay: lot.expiresOnDay,
      daysLeft: lot.expiresOnDay - gameState.value.day,
      closeLabel: auctionCloseLabel(lot),
      closeNightsLeft: auctionNightsLeft(lot),
    }
  }

  /**
   * Ballpark market-value preview for an owned car (Sprint 31) - the
   * for-sale toggle's own estimate, NOT a live offer (real offers only exist
   * once the daily draw actually rolls one - `offerFor`/`pendingOffersView`
   * above). The best-fit buyer's own un-spread valuation, so it reads as
   * "roughly this," not a number the player can expect to see exactly.
   */
  function estimatedSaleValue(carId: string): SaleValueEstimate {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return { buyerId: undefined, offerYen: 0 }
    const heat = gameState.value.marketHeat[car.modelId] ?? 100
    const buyer: Buyer | undefined = bestFitBuyer(
      car,
      model,
      context.value.buyers,
      context.value.partsById,
      context.value.partsTaxonomy,
      context.value.partsTaxonomyById,
      heat,
      context.value.economy,
    )
    const offerYen = buyer
      ? valuateCarForBuyer(
          buyer,
          model,
          car,
          context.value.partsById,
          context.value.partsTaxonomy,
          context.value.partsTaxonomyById,
          heat,
          context.value.economy,
        )
      : 0
    return { buyerId: buyer?.id, offerYen: Math.round(offerYen) }
  }

  /**
   * Parts in inventory that fit an EMPTY slot within the given group
   * (Sprint 26 decision 13's "bridge": a group-level install still resolves
   * to whichever specific `CarPartId` in that group is actually empty and
   * the picked catalog part addresses). A scrap `PartInstance` never fits
   * anywhere (decision 6).
   *
   * Sprint 32: scans every part the taxonomy assigns to the group directly
   * (`partIdsByGroup`), not `presentPartIdsInGroup` - that helper now means
   * "physically occupied," so filtering it again for "not installed" would
   * always be empty (every slot it returns already has something
   * installed).
   */
  /**
   * Whether a loose inventory part is legally installable onto `carId` -
   * always true for a player-owned part, but a part whose origin traces to an
   * active customer job (Sprint 70) may only go back onto that SAME
   * customer's car, never a different one, including the player's own
   * (mirrors the sim-side gate, `installFitGate` in jobs.ts).
   */
  function isPartAvailableFor(part: PartInstance, carId: string): boolean {
    const owningJob = gameState.value.activeServiceJobs.find((job) =>
      isCustomerOriginPart(part, job),
    )
    return !owningJob || owningJob.car.id === carId
  }

  /**
   * Whether a loose inventory part currently belongs to an active service
   * job's customer (Sprint 70) - the badge/lock `PartCard.vue` shows. Asks the
   * same question as `isPartAvailableFor`, just without a target car in mind.
   */
  function isCustomerOwnedPart(part: PartInstance): boolean {
    return gameState.value.activeServiceJobs.some((job) => isCustomerOriginPart(part, job))
  }

  /** The dim "where did this come from" caption line `PartCard.vue` shows
   * beneath a part's name (Sprint 70). */
  function describePartOrigin(part: PartInstance): string {
    return describeOrigin(part.origin)
  }

  function installablePartsFor(carId: string, componentId: ComponentId): PartInstance[] {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return []
    const hasEmptySlot = context.value.partIdsByGroup[componentId].some(
      (partId) => !car.parts[partId].installed,
    )
    if (!hasEmptySlot) return []
    return gameState.value.partInventory.filter((pi) => {
      if (pi.band === 'scrap') return false
      if (!isPartAvailableFor(pi, carId)) return false
      const part = context.value.partsById[pi.partId]
      return part ? partFitsCar(part, model, componentId, context.value.partsTaxonomyById) : false
    })
  }

  /**
   * Sprint 28: the per-part counterpart to `installablePartsFor` above - the
   * CarDetailScreen drill-down's own per-part Replace drawer filters to
   * exactly this set (decision 3: "shows only catalog parts addressed to
   * that part that fit the car"). Checks the SPECIFIC slot's own
   * `installed` state, not just "some slot in the group is empty" - closes
   * the gap `installablePartsFor` has (see `installFitGate`'s Sprint 28 doc
   * comment, sim/jobs.ts). Deliberately does NOT gate on `fitted`: the whole
   * point of a per-part Replace on the one conditional slot
   * (`forcedInduction` on an NA car) is fitting a kit that isn't there yet.
   */
  function installablePartsForPart(carId: string, carPartId: CarPartId): PartInstance[] {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    const componentId = groupForCarPart(carPartId)
    if (!car || !model || !componentId) return []
    if (car.parts[carPartId].installed) return []
    return gameState.value.partInventory.filter((pi) => {
      if (pi.band === 'scrap') return false
      if (!isPartAvailableFor(pi, carId)) return false
      const part = context.value.partsById[pi.partId]
      return part
        ? partFitsCar(part, model, componentId, context.value.partsTaxonomyById, carPartId)
        : false
    })
  }

  /**
   * Sprint 37: the human-readable reason `installablePartsForPart`'s results
   * are all blocked for this slot right now - just the one own-car
   * capability ceiling (NA-to-turbo conversion), the same check
   * `installFitGate` enforces sim-side. Null when nothing is blocked, so the
   * Replace drawer can dim every candidate with a specific "Needs <tier>"
   * reason instead of the generic "doesn't fit here" hint.
   */
  function installBlockedReason(carId: string, carPartId: CarPartId): string | null {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!model) return null
    if (!naToTurboConversionBlocked(carPartId, model, gameState.value, context.value)) return null
    const requiredTier = context.value.economy.toolCeilings.naToTurboConversionEngineTier
    const tierName = context.value.toolLines.engine.tiers[requiredTier - 1]!.displayName
    return `Needs ${tierName}`
  }

  // --- facilities (bays) -------------------------------------------------

  /** Resolve one car currently in the shop (owned or a customer's), for the bay layout. */
  function shopCarView(carId: string): ShopCarView | undefined {
    const owned = gameState.value.ownedCars.find((c) => c.id === carId)
    if (owned) {
      const model = context.value.modelsById[owned.modelId]
      return {
        carId,
        displayName: model ? resolveCarDisplayName(model) : owned.modelId,
        isCustomerCar: false,
        arrivingTomorrow: false,
        hasOffer: gameState.value.pendingOffers.some((o) => o.carInstanceId === carId),
      }
    }
    const serviceCar = gameState.value.activeServiceJobs.find((sj) => sj.car.id === carId)
    if (serviceCar) {
      const model = context.value.modelsById[serviceCar.car.modelId]
      return {
        carId,
        displayName: model ? resolveCarDisplayName(model) : serviceCar.car.modelId,
        isCustomerCar: true,
        arrivingTomorrow: isServiceJobInTransit(serviceCar, gameState.value.day),
        hasOffer: false, // never ours to sell
      }
    }
    return undefined
  }

  /**
   * One entry per service bay slot - the car in it, or null if empty.
   * Sprint 17: `serviceBayCarIds` is real, index-addressable state now (one
   * entry per physical bay), so this is a direct map, not a compact-list-
   * plus-padding reconstruction.
   */
  const serviceBaysView = computed<(ShopCarView | null)[]>(() =>
    gameState.value.serviceBayCarIds.map((id) => (id ? (shopCarView(id) ?? null) : null)),
  )

  /** The parking counterpart to `serviceBaysView` above - same shape, same
   * reasoning (Sprint 17: `parkingCarIds` is real indexed state now, not
   * "every shop car not in a service bay"). */
  const parkingView = computed<(ShopCarView | null)[]>(() =>
    gameState.value.parkingCarIds.map((id) => (id ? (shopCarView(id) ?? null) : null)),
  )

  const parkingCapacity = computed(() => gameState.value.parkingBayCount)
  const parkingOccupancyCount = computed(() => parkingOccupancy(gameState.value))
  const parkingFull = computed(() => !hasParkingSpace(gameState.value))
  const serviceBayCount = computed(() => gameState.value.serviceBayCount)
  const serviceBayFreeCount = computed(
    () => gameState.value.serviceBayCarIds.filter((id) => id === null).length,
  )
  /** True when neither side has a free slot - a direct move can never succeed, only a swap can. */
  const shopAtCapacity = computed(() => parkingFull.value && serviceBayFreeCount.value <= 0)

  /**
   * Sprint 45: the one double-parked car (grace/overflow slot), if any -
   * reuses `shopCarView` since a double-parked car is still either an owned
   * car or a customer's, just without a real bay to sit in.
   */
  const graceParkedCarView = computed<ShopCarView | undefined>(() => {
    const carId = gameState.value.graceParkingCarId
    return carId ? shopCarView(carId) : undefined
  })

  /**
   * Whether the grace slot is occupied right now - the raw capacity fact
   * (for gating acquisition-loss warnings), distinct from
   * `graceParkedCarView` (which additionally needs the occupant to resolve
   * to a real, displayable car).
   */
  const graceSlotOccupied = computed(() => gameState.value.graceParkingCarId !== null)

  /** The daily fine charged (`resolveGraceParking`) while the grace slot stays occupied at End Day. */
  const doubleParkingFineYen = computed(() => context.value.economy.DOUBLE_PARKING_FINE_YEN)

  /** Price of the next bay of this kind, or null once it's maxed out. */
  function nextBayPrice(kind: BayKind): number | null {
    return nextBayPriceYen(gameState.value, kind, context.value.facilities)
  }

  /** Reputation tier still needed for the next bay of this kind (Sprint 16),
   * or null if that's already met, ungated, or the ladder is maxed. */
  function nextBayReputationGate(kind: BayKind): ReputationTier | null {
    return nextBayMinReputationTier(gameState.value, kind, context.value.facilities)
  }

  /**
   * Move a car between parking and a service bay - instant and free, no
   * limit on how many times a day (a pure sim core the store calls
   * directly). Returns whether the move actually happened (false if the car
   * isn't in the shop, is already there, or the destination has no room -
   * see `swapCars` for that last case).
   */
  function moveCar(carId: string, to: BayKind): boolean {
    if (isCarInTransit(carId)) return false
    const result = applyMoves(gameState.value, [{ carInstanceId: carId, to }])
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('moveCar', { carId, to })
    return true
  }

  /**
   * Swap a service-bay car and a parking car's positions atomically (Sprint
   * 11, round-2 playtest #3) - the fix for a shop that's exactly full
   * (services + parking cars == total capacity, zero slack): neither
   * direction of `moveCar` has anywhere to go, but a swap's net occupancy
   * change in each location is zero, so it always succeeds.
   */
  function swapCars(serviceCarId: string, parkingCarId: string): boolean {
    if (isCarInTransit(serviceCarId) || isCarInTransit(parkingCarId)) return false
    const result = swapCarsCore(gameState.value, serviceCarId, parkingCarId)
    if (!result.changed) return false
    gameState.value = result.state
    dayLog.value.push({ type: 'cars-swapped', serviceCarId, parkingCarId })
    logSessionEvent('swapCars', { serviceCarId, parkingCarId })
    return true
  }

  /**
   * Move (or swap) a car into a SPECIFIC slot - the real positional path
   * behind drag-and-drop (Sprint 17 playtest fix): dropping a car onto an
   * empty slot places it exactly there; dropping onto a slot occupied by a
   * different car exchanges their positions (same section or across
   * service/parking alike); dropping onto its own slot is a no-op. Unlike
   * `moveCar`/`swapCars` above (still used by the plain, non-positional
   * "→ parking"/"→ service bay" buttons and the click-fallback), this is
   * the only path that actually chooses which bay a car lands in.
   */
  function moveCarToSlot(carId: string, to: BayKind, slotIndex: number): boolean {
    if (isCarInTransit(carId)) return false
    const result = moveCarToSlotCore(gameState.value, carId, to, slotIndex)
    if (!result.changed) return false
    gameState.value = result.state
    dayLog.value.push({ type: 'car-moved', carInstanceId: carId, to })
    logSessionEvent('moveCarToSlot', { carId, to, slotIndex })
    return true
  }

  /**
   * Buy the next bay of this kind - instant, usable the same day. Returns
   * false if already at the max count or unaffordable.
   */
  function buyBay(kind: BayKind): boolean {
    const result = applyBayPurchase(gameState.value, kind, context.value.facilities)
    if (!result.applied) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('buyBay', { kind })
    return true
  }

  // --- tool lines (Sprint 36) ---------------------------------------------

  /** The six tool-line ladders with their current/next tier, for the
   * Upgrades screen (Sprint 36 - replaces the equipment catalog; Sprint 43
   * extends it into a full 3-rung ladder plus the reputation-gate hint). */
  const toolLineViews = computed<ToolLineView[]>(() =>
    REAL_COMPONENT_GROUPS.map((componentId) => {
      const line = context.value.toolLines[componentId]
      const currentTier = gameState.value.toolTiers[componentId]
      const nextTier = currentTier < 3 ? line.tiers[currentTier] : undefined
      return {
        componentId,
        componentLabel: componentLabel(componentId),
        currentTier,
        currentTierName: line.tiers[currentTier - 1]!.displayName,
        nextTierName: nextTier?.displayName ?? null,
        nextTierPriceYen: nextTier?.upgradePriceYen ?? null,
        nextTierRepGate: nextToolTierRepGate(gameState.value, componentId, context.value),
        maxed: currentTier >= 3,
        tiers: line.tiers.map((rung, i) => ({
          tier: (i + 1) as ToolTier,
          displayName: rung.displayName,
          owned: i + 1 <= currentTier,
          upgradePriceYen: i === 0 ? null : rung.upgradePriceYen,
          minReputationTier: rung.minReputationTier ?? null,
          isListed: isToolTierListed(gameState.value, componentId, (i + 1) as ToolTier),
        })),
      }
    }),
  )

  /**
   * Sprint 52 decision 2: the current classifieds listing for the Upgrades
   * screen, or null for the "nothing in the classifieds this week" empty
   * state.
   */
  const machineListingView = computed<MachineListingView | null>(() => {
    const listing: MachineListing | null = gameState.value.machineListing
    if (!listing) return null
    return {
      componentId: listing.componentId,
      componentLabel: componentLabel(listing.componentId),
      tier: listing.tier,
      displayName:
        context.value.toolLines[listing.componentId].tiers[listing.tier - 1]!.displayName,
      priceYen: listing.priceYen,
      daysLeft: Math.max(0, listing.expiresOnDay - gameState.value.day),
    }
  })

  /**
   * Sprint 43 tool-wall info box: what reaching `tier` of `componentId`'s
   * line unlocks, derived live from the real catalog (job templates whose
   * task list needs exactly this tier in this group, the engine tier-3
   * NA-to-turbo ceiling, and the tier's own speed effect).
   */
  function toolTierInfo(componentId: ComponentId, tier: ToolTier): ToolTierInfo {
    const unlocksJobTemplateNames = SERVICE_JOB_TYPES.filter((template) =>
      template.tasks.some(
        (task) =>
          context.value.partsTaxonomyById[task.carPartId]?.group === componentId &&
          task.minToolTier === tier,
      ),
    ).map((template) => humanizeTemplateId(template.id))
    return {
      unlocksJobTemplateNames,
      unlocksNaToTurboConversion:
        componentId === 'engine' &&
        tier === context.value.economy.toolCeilings.naToTurboConversionEngineTier,
      laborSlotsPerGradeText: `Repair work takes ceil(grades-to-climb / ${tier}) labor slots at this tier`,
    }
  }

  // --- specialty (Sprint 38) -----------------------------------------------

  /**
   * The six per-discipline specialty counters, dev-console-only (progression
   * bible law 4: no player-facing meter - this is the ONE debug exception).
   * Real players never see this; the actual surface is offer mix and copy.
   */
  const specialtyView = computed<
    { componentId: ComponentId; componentLabel: string; points: number }[]
  >(() =>
    REAL_COMPONENT_GROUPS.map((componentId) => ({
      componentId,
      componentLabel: componentLabel(componentId),
      points: gameState.value.specialty[componentId],
    })),
  )

  /**
   * Sprint 39: the shop's derived title copy ("the engine house"), or null
   * below `titleThresholdPoints` - plain text alongside reputation
   * (`GarageScreen.vue`), never a meter. Pure function of `specialty`; can
   * shift the moment another line overtakes, no ceremony, no lock-in.
   */
  const shopTitleName = computed<string | null>(() => {
    const group = shopTitle(gameState.value, context.value)
    return group ? context.value.specialtyCopy[group].titleName : null
  })

  /** The techniques the shop has unlocked right now (Sprint 39) - dev-
   * console-only, same "one sanctioned debug exception" as `specialtyView`. */
  const unlockedTechniqueViews = computed<{ id: string; displayName: string }[]>(() =>
    unlockedTechniques(gameState.value, context.value).map((t) => ({
      id: t.id,
      displayName: t.displayName,
    })),
  )

  /**
   * Sprint 62 (item 17): the Standing screen's whole payload - granular
   * reputation (points + the named next tier), all six specialty disciplines
   * (points + their named technique), and the shop title. Progression bible
   * law 4 was amended this sprint to permit these exact numbers on this ONE
   * dedicated view; every other surface stays meter-free. Pure derivation, no
   * new state.
   */
  const standingView = computed<StandingView>(() => {
    const points = gameState.value.reputationPoints
    const orderedTiers = (
      Object.entries(context.value.economy.reputation.tierThresholds) as [ReputationTier, number][]
    ).sort((a, b) => a[1] - b[1])
    const nextEntry = orderedTiers.find(([, threshold]) => threshold > points)
    const specialties: StandingSpecialtyView[] = REAL_COMPONENT_GROUPS.map((componentId) => {
      const technique = context.value.techniques.find((t) => t.componentId === componentId)
      const disciplinePoints = gameState.value.specialty[componentId]
      return {
        componentId,
        componentLabel: componentLabel(componentId),
        points: disciplinePoints,
        technique: technique
          ? {
              displayName: technique.displayName,
              thresholdPoints: technique.thresholdPoints,
              unlocked: disciplinePoints >= technique.thresholdPoints,
            }
          : null,
      }
    })
    return {
      reputation: {
        tier: gameState.value.reputationTier,
        points,
        nextTier: nextEntry ? { tier: nextEntry[0], threshold: nextEntry[1] } : null,
      },
      specialties,
      shopTitleName: shopTitleName.value,
    }
  })

  /**
   * Upgrade one tool line to its next tier - instant, effective the same day
   * (repair work sizes off the new tier immediately). Cash-gated only, no
   * reputation gate (Sprint 36). Returns false if maxed or unaffordable.
   */
  function upgradeToolLine(componentId: ComponentId): boolean {
    const result = applyToolUpgrade(gameState.value, componentId, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('upgradeToolLine', { componentId })
    return true
  }

  // --- instant actions (Sprint 11) ---------------------------------------

  /**
   * Repair a group (or, Sprint 28, one specific part within it when
   * `carPartId` is given - the drill-down's own per-part Repair row) -
   * instant, targeting `targetBand` (mint by default, the plain "Repair"
   * button's behavior; staging lets the player choose a lower target,
   * decision 5). Finds the car's already-open repair job for this exact
   * address (if the player already started it on an earlier day) or starts
   * a new one, sized for real by `planGroupRepair`, then immediately spends
   * up to today's remaining labor on it. A repeat click just continues the
   * same job; no separate "add labor" control needed.
   */
  function repair(
    carId: string,
    componentId: ComponentId,
    targetBand: ConditionBand = 'mint',
    carPartId?: CarPartId,
  ): void {
    const car = findWorkableCar(carId)
    if (!car) return
    const plan = planGroupRepair(
      car,
      componentId,
      targetBand,
      gameState.value.toolTiers,
      context.value.partIdsByGroup,
      context.value.partsById,
      context.value.partsTaxonomyById,
      context.value.economy.restoration.repairStepFraction,
      carPartId,
    )
    if (plan.partIds.length === 0) return
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'repair-zone',
      componentId,
      targetBand,
      carPartId,
      laborSlotsRequired: plan.laborSlotsRequired,
    }
    const result = resolveJobLabor(
      gameState.value,
      spec,
      laborSlotsRemainingToday.value,
      context.value,
    )
    gameState.value = result.state
    dayLog.value.push(...result.log)
  }

  /**
   * Install an owned part into an empty component - instant, same
   * continuation rule as `repair`. Sprint 28: `carPartId`, when given,
   * addresses one specific slot (the drill-down's own per-part Replace row)
   * rather than "whichever slot in the group the part's own address
   * resolves to."
   */
  function install(
    carId: string,
    componentId: ComponentId,
    partInstanceId: string,
    carPartId?: CarPartId,
  ): void {
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'install-part',
      componentId,
      partInstanceId,
      carPartId,
      laborSlotsRequired: INSTALL_LABOR_SLOTS,
    }
    const result = resolveJobLabor(
      gameState.value,
      spec,
      laborSlotsRemainingToday.value,
      context.value,
    )
    gameState.value = result.state
    dayLog.value.push(...result.log)
  }

  // --- staged repair/install work (Sprint 18) -----------------------------

  /**
   * True if this exact part instance is staged as an install anywhere in the
   * shop - on this car or a different one, any component. A staged part is
   * unavailable to stage again until its stage resolves (Confirm) or is
   * explicitly unstaged (decision 3): the inventory panel uses this to omit
   * it from what's currently pickable, and `stageAction` below enforces the
   * same rule as a real guard, not just a UI nicety.
   */
  function isPartStagedAnywhere(partInstanceId: string): boolean {
    return Object.values(gameState.value.stagedCarWork).some((actions) =>
      actions.some((a) => a.kind === 'install' && a.partInstanceId === partInstanceId),
    )
  }

  /** Everything currently staged on one car - empty if nothing is. */
  function stagedActionsFor(carId: string): StagedAction[] {
    return gameState.value.stagedCarWork[carId] ?? []
  }

  /**
   * Every owned part not currently staged anywhere, paired with its catalog
   * entry - the pick list for staging an install (decision 3), shared by the
   * standalone inventory screen and the panel embedded on a car's detail
   * screen (both show the exact same "available to stage" set).
   */
  const stageableParts = computed<StageablePartView[]>(() => {
    const entries: StageablePartView[] = []
    for (const instance of gameState.value.partInventory) {
      if (isPartStagedAnywhere(instance.id)) continue
      const part = context.value.partsById[instance.partId]
      if (part) entries.push({ instance, part })
    }
    return entries
  })

  /**
   * Stage a repair or install on a car's component - or, Sprint 28, on one
   * specific part within it when `action.carPartId` is set (the drill-down's
   * per-part Repair/Replace rows) - free, instant, and fully reversible
   * until Confirm. Refuses (returns false, no state change) for an unknown
   * car, an address that already has an open `Job` (decision 4: staging
   * never applies to work already in progress - that keeps its existing
   * single-click "Continue repair" flow, now generalized to per-part via
   * `addressesOverlap` - a group-level job blocks staging anything on any of
   * its parts, and vice versa), or an install whose part is already staged
   * elsewhere (decision 3). Staging over an address that already has a
   * *different, overlapping* staged action there replaces it (decision 8) -
   * the displaced entry (and its part, for a displaced install) simply stops
   * being staged, freeing it up again. A group-level stage displaces every
   * per-part stage inside that group (and vice versa); two per-part stages
   * on different parts of the same group coexist freely.
   */
  function stageAction(carId: string, action: StagedAction): boolean {
    const car = findWorkableCar(carId)
    if (!car) return false
    if (isCarInTransit(carId)) return false
    const busy = gameState.value.jobs.some(
      (j) => j.carInstanceId === carId && addressesOverlap(j, action),
    )
    if (busy) return false
    if (action.kind === 'install') {
      if (isPartStagedAnywhere(action.partInstanceId)) return false
      // Sprint 24 fix 2: refuse a part/component/model mismatch here too -
      // not just at Confirm's job-creation time - so a caller that bypasses
      // the UI's own filtered drawer (a bot, the dev console, a future
      // client) can't stage an install that would only fail silently later.
      // Sprint 28: when `action.carPartId` is set, also refuses a part whose
      // own catalog address doesn't match that exact slot, or whose exact
      // slot is already occupied (mirrors `installFitGate`, sim/jobs.ts).
      // Sprint 32: `slotEmpty` always resolves from the picked part's own
      // catalog address (`part.carPartId`), same fix as `installFitGate` -
      // most slots start filled with a stock part now, so a group-level
      // stage needs the same real occupied-slot check a per-part one always
      // had, not just when `action.carPartId` happens to be set.
      const model = context.value.modelsById[car.modelId]
      const partInstance = gameState.value.partInventory.find((p) => p.id === action.partInstanceId)
      const part = partInstance ? context.value.partsById[partInstance.partId] : undefined
      const slotEmpty = !!part && !car.parts[part.carPartId].installed
      if (
        !model ||
        !part ||
        !partInstance ||
        partInstance.band === 'scrap' ||
        !slotEmpty ||
        !partFitsCar(
          part,
          model,
          action.componentId,
          context.value.partsTaxonomyById,
          action.carPartId,
        ) ||
        // Sprint 37: the one own-car capability ceiling (NA-to-turbo
        // conversion) - mirrors `installFitGate`'s own check, same reason a
        // stage-then-silently-fail-at-Confirm bug can't happen here either.
        naToTurboConversionBlocked(part.carPartId, model, gameState.value, context.value)
      ) {
        return false
      }
    }

    const existing = stagedActionsFor(carId).filter((a) => !addressesOverlap(a, action))
    gameState.value = {
      ...gameState.value,
      stagedCarWork: { ...gameState.value.stagedCarWork, [carId]: [...existing, action] },
    }
    logSessionEvent('stageAction', { carId, action })
    return true
  }

  /**
   * Un-stage whatever's staged at this exact address, if anything - free,
   * no-op if nothing was staged there. Sprint 28: `carPartId`, when given,
   * un-stages only that specific part's own entry, leaving a sibling part's
   * stage (or the group's own) in the same group untouched - an exact
   * address match (`sameAddress` semantics inlined below), not the broader
   * `addressesOverlap` `stageAction` uses to decide what a NEW stage
   * displaces.
   */
  function unstageAction(carId: string, componentId: ComponentId, carPartId?: CarPartId): void {
    const remaining = stagedActionsFor(carId).filter(
      (a) => !(a.componentId === componentId && a.carPartId === carPartId),
    )
    const stagedCarWork = { ...gameState.value.stagedCarWork }
    if (remaining.length === 0) delete stagedCarWork[carId]
    else stagedCarWork[carId] = remaining
    gameState.value = { ...gameState.value, stagedCarWork }
    logSessionEvent('unstageAction', { carId, componentId })
  }

  /**
   * Confirm - locks in every staged action on this car at once: creates or
   * continues the real jobs and spends today's remaining labor and cash for
   * real, through the exact same resolvers the old instant-click flow
   * always used (Sprint 18). The staged list is cleared whether or not
   * every action could be fully labored today - a partial-labor action just
   * leaves a normal continuable job behind.
   */
  function confirmCarWork(carId: string): void {
    const result = confirmStagedWork(
      gameState.value,
      carId,
      laborSlotsRemainingToday.value,
      context.value,
    )
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('confirmCarWork', { carId })
  }

  /**
   * Pull whatever occupies `carPartId`'s slot into inventory (Sprint 32
   * decision 7) - free and instant, no staging step (there is no repair/
   * install work to schedule; the part just comes out). Removing an
   * aftermarket part reverts the slot to a fresh stock part (still filled);
   * removing a stock part leaves the slot genuinely empty (missing). A
   * no-op (returns false) if the slot is already empty or a job is
   * currently open on this address.
   */
  function removePart(carId: string, carPartId: CarPartId): boolean {
    const result = resolveRemovePart(gameState.value, carId, carPartId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('removePart', { carId, carPartId })
    return true
  }

  /**
   * The yen a scrap `PartInstance` would fetch if sold right now (Sprint 28)
   * - the "Scrap it" button's own price tag, mirroring `resolveScrapPart`'s
   * (sim/parts.ts) internal lookup so the UI can show the real number before
   * the player commits, not just after. Returns 0 for an unknown instance or
   * one that isn't actually scrap (the button never shows in that case).
   */
  function scrapValueForPart(partInstanceId: string): number {
    const instance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    if (!instance || instance.band !== 'scrap') return 0
    const part = context.value.partsById[instance.partId]
    const taxonomyEntry = part ? context.value.partsTaxonomyById[part.carPartId] : undefined
    return part && taxonomyEntry
      ? scrapValueYen(taxonomyEntry, context.value.economy, part.fitmentClass)
      : 0
  }

  /**
   * Sell a scrap `PartInstance` for scrap value (Sprint 26 decision 6) - the
   * only action available on it, since it can never be reinstalled anywhere.
   * Sprint 35: a customer-owned part (`customerJobId` set) is refused by the
   * resolver, so this returns false; the UI disables the control with a reason
   * rather than relying on the silent refusal alone.
   */
  function scrapPart(partInstanceId: string): boolean {
    const result = resolveScrapPart(gameState.value, partInstanceId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('scrapPart', { partInstanceId })
    return true
  }

  /**
   * A read-only recondition quote for a loose inventory part to `targetBand`
   * (Sprint 35) - the yen cost, labor slots, and whether the covering
   * equipment is owned, for the inventory card's recondition control. Routes
   * through the sim's `reconditionQuote`, which prices/sizes off the exact
   * same repair economy as an on-car repair. Null when there is nothing to do
   * (already at/above the target, or scrap - never reconditionable).
   */
  function reconditionQuoteFor(partInstanceId: string, targetBand: ConditionBand = 'mint') {
    return reconditionQuote(gameState.value, partInstanceId, targetBand, context.value)
  }

  /**
   * Recondition a loose inventory part to `targetBand` (Sprint 35, mint by
   * default - the same instant "climb to mint" an on-car Repair click does) -
   * instant, spending up to today's remaining labor, through the SAME repair
   * economy as an on-car repair (`resolveReconditionLabor`: same yen cost,
   * same labor-slot consumption, same equipment/repair-level gate). Works on
   * ANY inventory part, customer-owned or not.
   */
  function reconditionPart(partInstanceId: string, targetBand: ConditionBand = 'mint'): void {
    const result = resolveReconditionLabor(
      gameState.value,
      partInstanceId,
      targetBand,
      laborSlotsRemainingToday.value,
      context.value,
    )
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('reconditionPart', { partInstanceId, targetBand })
  }

  /**
   * Place or raise a bid on an auction lot (Sprint 20: open-raise semantics
   * - the amount is the literal number that lands on the board, not a
   * hidden max). The lot resolves via the overnight/hammer step in
   * `endDay`; the win/loss outcome shows up in that day's report like any
   * other day-boundary event, not as inline per-lot feedback. Validates the
   * increment ladder at the store level (`bidYen >= nextRaiseYen`) before
   * ever calling the resolver - mirrors, rather than replaces, the sim's own
   * identical check in `resolvePlaceBid`, so a UI misclick is refused here
   * without a round trip through the resolver's no-op path. Returns false if
   * the lot doesn't exist or the amount doesn't clear the ladder.
   */
  function placeBid(lotId: string, bidYen: number): boolean {
    if (bidYen <= 0) return false
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) return false
    if (bidYen < nextRaiseYen(lot, gameState.value, context.value)) return false
    const result = resolvePlaceBid(gameState.value, lotId, bidYen, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('placeBid', { lotId, bidYen })
    return true
  }

  /** Buy out a lot instantly - guaranteed purchase at a premium, no rival contest. */
  function buyout(lotId: string): boolean {
    const result = resolveBuyoutInstant(gameState.value, lotId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('buyout', { lotId })
    return true
  }

  /**
   * Buy a single catalog part directly, bypassing the cart - the primitive
   * `checkoutCart` calls per item below. Not wired to any "Buy" button on
   * `PartsMarketScreen.vue` (Sprint 14 replaced the instant per-row buy with
   * cart + checkout, specifically to stop a misclick from spending real
   * cash) but kept as a real store action for tests/dev use. Defaults to
   * 'express' - today's pre-Sprint-14 instant behavior.
   */
  function buyPart(partId: string, deliverySpeed: DeliverySpeed = 'express'): boolean {
    const result = resolveBuyPart(gameState.value, partId, context.value, deliverySpeed)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /** Add one unit of a catalog part to the cart - no cash spent yet. */
  function addToCart(partId: string): void {
    if (!context.value.partsById[partId]) return
    gameState.value = {
      ...gameState.value,
      cartPartIds: [...gameState.value.cartPartIds, partId],
    }
  }

  /** Remove one unit of a part from the cart (first matching occurrence). */
  function removeFromCart(partId: string): void {
    const index = gameState.value.cartPartIds.indexOf(partId)
    if (index === -1) return
    const cartPartIds = [...gameState.value.cartPartIds]
    cartPartIds.splice(index, 1)
    gameState.value = { ...gameState.value, cartPartIds }
  }

  /** The cart's contents, one entry per distinct part with its quantity and subtotal. */
  const cartItems = computed<CartItemView[]>(() => {
    const quantities = new Map<string, number>()
    for (const partId of gameState.value.cartPartIds) {
      quantities.set(partId, (quantities.get(partId) ?? 0) + 1)
    }
    const items: CartItemView[] = []
    for (const [partId, quantity] of quantities) {
      const part = context.value.partsById[partId]
      if (!part) continue
      items.push({ part, quantity, subtotalYen: part.priceYen * quantity })
    }
    return items
  })

  /** Base-price cart total (standard delivery - no surcharge). */
  const cartStandardTotalYen = computed<number>(() =>
    cartItems.value.reduce((sum, item) => sum + item.subtotalYen, 0),
  )

  /** Cart total including the express surcharge, for the checkout screen's two-option display. */
  const cartExpressTotalYen = computed<number>(() =>
    Math.round(cartStandardTotalYen.value * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION)),
  )

  /**
   * Checkout - buys every item currently in the cart at the chosen delivery
   * speed, one `resolveBuyPart` call per item (so a cart that's only
   * partially affordable buys what it can and leaves the rest in the cart,
   * rather than failing all-or-nothing). Returns how many line-units were
   * bought vs. left behind, for the confirmation UI.
   */
  function checkoutCart(deliverySpeed: DeliverySpeed): {
    boughtCount: number
    remainingCount: number
  } {
    const remaining: string[] = []
    let boughtCount = 0
    for (const partId of gameState.value.cartPartIds) {
      if (buyPart(partId, deliverySpeed)) {
        boughtCount += 1
      } else {
        remaining.push(partId)
      }
    }
    gameState.value = { ...gameState.value, cartPartIds: remaining }
    logSessionEvent('checkoutCart', {
      deliverySpeed,
      boughtCount,
      remainingCount: remaining.length,
    })
    return { boughtCount, remainingCount: remaining.length }
  }

  /** Standard-delivery orders still in transit, for a "pending orders" display. */
  const pendingPartOrders = computed(() => gameState.value.pendingPartOrders)

  /**
   * Accept a service-job offer - instant. The customer's car arrives in the
   * shop (parking) the moment this is called, not "next day" - needs a free
   * parking space to take delivery.
   */
  function acceptServiceJob(offerId: string): boolean {
    const result = resolveAcceptServiceJob(gameState.value, offerId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('acceptServiceJob', { offerId })
    return true
  }

  /**
   * "Complete Job" - resolves the service job **immediately** (not on End Day):
   * if the work is done the payout lands and reputation is granted; if not, the
   * job is failed (reputation penalty, no pay). Either way the car leaves now.
   * Populates `lastJobResult` for the completion feedback modal and returns
   * the outcome too, for callers that just need the bare result.
   */
  function completeServiceJob(jobId: string): ServiceJobOutcome {
    const job = gameState.value.activeServiceJobs.find((sj) => sj.id === jobId)
    const resolution = resolveServiceJob(gameState.value, jobId, context.value)
    if (!job || resolution.outcome === 'not-found') return 'not-found'
    // Sprint 40 defense in depth: the resolver itself already refused (no
    // state change) - a graceful no-op here too, never reachable through the
    // normal UI (the car-page "Complete Job" button only renders once the
    // car has arrived) but kept honest in case a caller bypasses that.
    if (resolution.outcome === 'in-transit') return 'in-transit'
    gameState.value = resolution.state
    dayLog.value.push(...resolution.log)

    const entry = resolution.log[0]
    if (entry?.type === 'service-job-completed') {
      lastJobResult.value = {
        outcome: 'paid',
        customerName: job.customerName,
        taskLabels: job.tasks.map(taskLabel),
        payoutYen: entry.payoutYen,
        reputationDelta: entry.reputationGained,
        repairCostYen: entry.repairCostYen,
        partsCostYen: entry.partsCostYen,
        netProfitYen: entry.netProfitYen,
        specialtyGained: entry.specialtyGained,
        daysSpent: entry.daysSpent,
      }
    } else if (entry?.type === 'service-job-failed') {
      lastJobResult.value = {
        outcome: 'failed',
        customerName: job.customerName,
        taskLabels: job.tasks.map(taskLabel),
        payoutYen: 0,
        reputationDelta: -entry.reputationLost,
        repairCostYen: entry.repairCostYen,
        partsCostYen: entry.partsCostYen,
        netProfitYen: entry.netProfitYen,
        specialtyGained: entry.specialtyGained,
      }
    }
    logSessionEvent('completeServiceJob', { jobId, outcome: resolution.outcome })
    return resolution.outcome
  }

  function dismissJobResult(): void {
    lastJobResult.value = null
  }

  /**
   * Accept today's live offer on an owned car - instant (Sprint 31). Resolves
   * through the same reputation/heat/event-log plumbing the old instant
   * walk-in sell always used; a no-op (returns false) if there's no live
   * offer on this car right now.
   */
  function acceptOffer(carId: string): boolean {
    // Read the ledger and the name BEFORE resolving - the sale removes the car
    // and its ledger, so afterwards there is nothing left to build a receipt
    // from.
    const detail = carDetail(carId)
    const ledger = carLedgerFor(gameState.value, carId)
    const result = resolveSellViaWalkIn(gameState.value, carId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)

    // Sprint 68 decision 5 (item 23): the receipt. Everything here already
    // existed and was simply never shown - the Sprint 42 ledger, and
    // `car-sold`'s own price/profit.
    const sold = result.log.find((e) => e.type === 'car-sold')
    if (sold?.type === 'car-sold' && detail) {
      const purchaseYen = ledger?.purchaseYen ?? 0
      const repairYen = ledger?.repairYen ?? 0
      const partsYen = ledger?.partsYen ?? 0
      lastSaleResult.value = {
        displayName: detail.displayName,
        priceYen: sold.priceYen,
        purchaseYen,
        repairYen,
        partsYen,
        totalSpentYen: purchaseYen + repairYen + partsYen,
        // `profitYen` is absent exactly when the purchase price was unknown.
        // Pass the gap through rather than inventing a number.
        profitYen: sold.profitYen ?? null,
      }
    }
    logSessionEvent('acceptOffer', { carId })
    return true
  }

  /** Sprint 68 decision 3 (item 21): turn today's offer down. The car stays
   * listed, so tomorrow's draw can bring a better one. */
  function rejectOffer(carId: string): boolean {
    const result = resolveRejectOffer(gameState.value, carId)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('rejectOffer', { carId })
    return true
  }

  function dismissSaleResult(): void {
    lastSaleResult.value = null
  }

  /**
   * Toggle "taking offers" on an owned car - free, instant, reversible any
   * time before it sells (Sprint 31 decision 2). Replaces both the old
   * instant walk-in sell and list-publicly buttons: the car itself does
   * nothing until a real offer arrives (the daily draw, End Day) and the
   * player accepts it via `acceptOffer` above.
   */
  function setForSale(carId: string, forSale: boolean): boolean {
    const before = gameState.value
    const result = resolveSetForSale(before, carId, forSale)
    if (result.state === before) return false
    gameState.value = result.state
    logSessionEvent('setForSale', { carId, forSale })
    return true
  }

  // --- day advance ------------------------------------------------------

  /**
   * End Day - purely a day-boundary tick now (Sprint 11): labor resets,
   * weekly rent/wages and market-heat drift fire on the 7-day boundary,
   * catalogs refresh and expire, and the service-job deadline backstop
   * runs. Nothing here *decides* a player action anymore - that already
   * happened, instantly, at the moment of each click.
   */
  function endDay(): void {
    const state = gameState.value
    const endedDay = state.day
    const cashBefore = state.cashYen
    logSessionEvent('endDay', { endedDay })
    const result = advanceDay(state, emptyDayActions(), state.seed + state.day, context.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)
    lastDayReport.value = {
      day: endedDay,
      entries: result.log,
      cashDeltaYen: result.state.cashYen - cashBefore,
    }
    reportVisible.value = true
  }

  function dismissReport(): void {
    reportVisible.value = false
  }

  /** Start a fresh career. Defaults to a random seed so players don't all get the same run. */
  function newGame(seed: number = randomSeed()): void {
    gameState.value = createInitialGameState(context.value, seed)
    dayLog.value = []
    lastDayReport.value = null
    reportVisible.value = false
  }

  // --- persistence (Sprint 07) ------------------------------------------

  /**
   * Load the autosaved career on startup (called once from main.ts before
   * mount). On any failure or absence, the fresh new game stays. Autosave
   * is wired after, so hydrate itself doesn't need to write.
   */
  async function hydrate(): Promise<void> {
    const code = await loadSave()
    if (!code) {
      // No save: start a fresh *random* career (not the fixed placeholder seed).
      hasExistingSave.value = false
      newGame()
      return
    }
    try {
      gameState.value = decodeSave(code)
      dayLog.value = []
      hasExistingSave.value = true
    } catch {
      // Corrupt/unreadable save - start fresh rather than crash.
      hasExistingSave.value = false
      newGame()
    }
  }

  /** The current career as a copy-paste save code (R2 backup). */
  function exportSaveCode(): string {
    return encodeSave(gameState.value)
  }

  /** Load a pasted save code, replacing the current career. Returns an error string on failure. */
  function importSaveCode(code: string): { ok: true } | { ok: false; error: string } {
    try {
      const state = decodeSave(code)
      gameState.value = state
      dayLog.value = []
      lastDayReport.value = null
      reportVisible.value = false
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not read that code.' }
    }
  }

  /** Autosave: every state mutation persists (best-effort; a no-op without IndexedDB). */
  watch(
    gameState,
    (state) => {
      void writeSave(encodeSave(state))
    },
    { flush: 'post' },
  )

  // --- dev-console affordances (dev build only) -------------------------

  function devGiveCash(amountYen: number): void {
    gameState.value = { ...gameState.value, cashYen: gameState.value.cashYen + amountYen }
  }

  /** Spawn a rough auction-grade car of the given model (random if omitted) into the garage. */
  function devGrantCar(modelId?: string): void {
    const models = context.value.models
    const model =
      (modelId && context.value.modelsById[modelId]) || models[grantCounter.value % models.length]
    if (!model) return
    grantCounter.value += 1
    const id = `dev-car-${grantCounter.value}`
    const car = generateAuctionCarInstance(
      model,
      id,
      createRng(grantCounter.value),
      context.value,
      Infinity,
      true,
      gameState.value.day,
    )
    // Sprint 17: parking is a real indexed array now - a granted car needs an
    // actual slot, not just membership in `ownedCars` (assignToParking grows
    // the array if parking happens to be nominally full, since this bypasses
    // the normal `hasParkingSpace` gate on purpose, same as it always has).
    gameState.value = assignToParking(
      { ...gameState.value, ownedCars: [...gameState.value.ownedCars, car] },
      id,
    )
  }

  /** Add a part from the catalog to inventory as a new instance. */
  function devGrantPart(partId: string): void {
    const part = context.value.partsById[partId]
    if (!part) return
    grantCounter.value += 1
    const instance: PartInstance = {
      id: `dev-part-${grantCounter.value}`,
      partId: part.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(gameState.value.day),
    }
    gameState.value = {
      ...gameState.value,
      partInventory: [...gameState.value.partInventory, instance],
    }
  }

  /** Set a tool line's tier directly, bypassing price - dev/test only. */
  function devSetToolTier(componentId: ComponentId, tier: ToolTier): void {
    gameState.value = {
      ...gameState.value,
      toolTiers: { ...gameState.value.toolTiers, [componentId]: tier },
    }
  }

  /** Add one more bay of this kind for free, bypassing price/reputation - dev/test only.
   * A no-op once the kind's ladder is already maxed (nothing to add). */
  function devGrantBay(kind: BayKind): void {
    const cfg = context.value.facilities[kind]
    const current =
      kind === 'service' ? gameState.value.serviceBayCount : gameState.value.parkingBayCount
    if (current >= cfg.maxCount) return
    gameState.value =
      kind === 'service'
        ? {
            ...gameState.value,
            serviceBayCount: current + 1,
            serviceBayCarIds: [...gameState.value.serviceBayCarIds, null],
          }
        : {
            ...gameState.value,
            parkingBayCount: current + 1,
            parkingCarIds: [...gameState.value.parkingCarIds, null],
          }
  }

  /**
   * Jump straight to a reputation tier, bypassing however many points it would
   * normally take to earn - dev/test only. Sets `reputationPoints` to that
   * tier's exact threshold (`economy.reputation.tierThresholds`) and re-derives
   * `reputationTier` from it in the same step, the same way every real
   * reputation change does (`applyReputationDelta`) - `reputationTier` is
   * never set directly anywhere, including here.
   */
  function devSetReputationTier(tier: ReputationTier): void {
    const reputationPoints = context.value.economy.reputation.tierThresholds[tier]
    gameState.value = {
      ...gameState.value,
      reputationPoints,
      reputationTier: deriveReputationTier(reputationPoints, context.value.economy),
    }
  }

  /** The parts catalog, for the dev grant picker. */
  const partsCatalog = computed<readonly Part[]>(() => context.value.parts)
  const modelsCatalog = computed<readonly CarModel[]>(() => context.value.models)

  return {
    gameState,
    dayLog,
    day,
    cashYen,
    reputationTier,
    reputationPoints,
    ownedCarCount,
    laborSlotsPerDay,
    laborSlotsRemainingToday,
    serviceJobOffers,
    activeServiceJobs,
    serviceJobOfferViews,
    activeServiceJobViews,
    partsFitVehicleOptions,
    carsDetailed,
    ownedCarNames,
    partsCatalog,
    modelsCatalog,
    auctionLotsByTier,
    resolveModelName,
    partName,
    componentLabel,
    fitmentClassLabel,
    buyerName,
    carDetail,
    groupBandsForCar,
    groupRepairFloorBand,
    nextRepairStep,
    plannedStepFor,
    isPartRepairable,
    isCustomerOwnedPart,
    describePartOrigin,
    partsInGroup,
    carPartLabel,
    groupForCarPart,
    lotDetail,
    isForSale,
    offerFor,
    pendingOffersView,
    estimatedSaleValue,
    installablePartsFor,
    installablePartsForPart,
    installBlockedReason,
    serviceBaysView,
    parkingView,
    parkingCapacity,
    parkingOccupancyCount,
    parkingFull,
    serviceBayCount,
    serviceBayFreeCount,
    shopAtCapacity,
    graceParkedCarView,
    graceSlotOccupied,
    doubleParkingFineYen,
    nextBayPrice,
    nextBayReputationGate,
    moveCar,
    swapCars,
    moveCarToSlot,
    buyBay,
    toolLineViews,
    toolTierInfo,
    upgradeToolLine,
    machineListingView,
    specialtyView,
    shopTitleName,
    unlockedTechniqueViews,
    standingView,
    repair,
    install,
    isPartStagedAnywhere,
    stagedActionsFor,
    stageableParts,
    stageAction,
    unstageAction,
    confirmCarWork,
    removePart,
    placeBid,
    buyout,
    buyPart,
    scrapPart,
    scrapValueForPart,
    reconditionQuoteFor,
    nextReconditionStep,
    reconditionPart,
    cartItems,
    cartStandardTotalYen,
    cartExpressTotalYen,
    addToCart,
    removeFromCart,
    checkoutCart,
    pendingPartOrders,
    acceptOffer,
    rejectOffer,
    setForSale,
    acceptServiceJob,
    completeServiceJob,
    lastJobResult,
    dismissJobResult,
    lastSaleResult,
    dismissSaleResult,
    finishedJobsAwaitingHandback,
    carsWithUnconfirmedWork,
    endDay,
    lastDayReport,
    reportVisible,
    dismissReport,
    hydrate,
    hasExistingSave,
    exportSaveCode,
    importSaveCode,
    newGame,
    devGiveCash,
    devGrantCar,
    devGrantPart,
    devSetToolTier,
    devGrantBay,
    devSetReputationTier,
  }
})
