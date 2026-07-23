import {
  BUYERS,
  CARS,
  COMPONENT_DISPLAY_NAMES,
  ComponentIdSchema,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
} from '@midnight-garage/content'
import type {
  AssemblyId,
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
  FusePreset,
  GameState,
  Grade,
  Job,
  MachineListing,
  Part,
  PartFitmentClass,
  PartInstance,
  ReputationTier,
  RequirementSpec,
  SellingChannelId,
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
  titleCaseFromSlug,
} from '@midnight-garage/content'
import {
  anchorValueYen,
  apparentViewOf,
  applyBayPurchase,
  applyMoves,
  applyToolUpgrade,
  assemblyContainerFor,
  assemblyMachineGateGroup,
  assignToParking,
  attendAuctionGateReason as attendAuctionGateReasonCore,
  availableTestIdsFor,
  energyMax,
  advanceDay,
  bandFactor,
  bandIndex,
  benchedMemberWithTrait,
  benchSwapGateGroup,
  beginInspectionVisit as beginInspectionVisitCore,
  canRepair,
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
  installTutorial,
  describeOrigin,
  deriveReputationTier,
  displayedBandFor,
  emptyDayActions,
  expectationForCar,
  externalBlockersFor,
  foundationFactor,
  generateAuctionCarInstance,
  gradeMissionCar,
  groupCostToMintYen,
  hasMachineLineFor,
  installedPartsValueYen,
  installLaborSlotsFor,
  isFreeInstallRefit,
  refitLaborSlotsFor,
  hasParkingSpace,
  hireMachineLineGateReason as hireMachineLineGateReasonCore,
  inspectionVisitGateReason as inspectionVisitGateReasonCore,
  isBodyDerivedPart,
  isCustomerOriginPart,
  isPartMissing,
  lapTimeSecondsFor,
  ownedWorkupGateReason as ownedWorkupGateReasonCore,
  machineHiredToday,
  machineLineGroupFor,
  makeMarketOrigin,
  isServiceJobInTransit,
  isToolTierListed,
  isServiceTaskDone,
  isServiceWorkDone,
  marketValueYen,
  moveCarToSlot as moveCarToSlotCore,
  naToTurboConversionBlocked,
  ownsMachineForGroup,
  removeBlockReason,
  resolveHireMachineLine,
  signatureGroupFor,
  nextBayMinReputationTier,
  nextBayPriceYen,
  nextToolTierRepGate,
  parkingOccupancy,
  partFitsCar,
  planGroupRepair,
  planPaintStage,
  planPipelineStage,
  playerEstimateYen,
  presentPartIdsInGroup,
  previewPlannedWork,
  reconditionQuote,
  repairCeilingForLevel,
  repairLevelForGroup,
  PARTS_EXPRESS_SURCHARGE_FRACTION,
  reputationForFailure,
  requirementLabel,
  resolveAcceptMission,
  resolveAcceptServiceJob,
  resolveRejectServiceJobOffer,
  resolveAttendAuction as resolveAttendAuctionCore,
  resolveBuyoutInstant,
  resolveBuyPart,
  resolveDeliverMission,
  reserveYen,
  resolveJobLabor,
  resolveOwnedWorkup as resolveOwnedWorkupCore,
  resolveReconditionLabor,
  resolveRefitAssembly,
  resolveRejectOffer,
  resolveRemoveAssembly,
  resolveRemovePart,
  resolveRemoveAssemblyMember,
  resolveSendInspector as resolveSendInspectorCore,
  resolveSwapAssemblyMember,
  resolveScrapPart,
  resolveScrapShell,
  resolveSellPart,
  resolveSellViaWalkIn,
  resolveServiceJob,
  resolveSetForSale,
  roomLedgerFor,
  runDiagnosticTest as runDiagnosticTestCore,
  scrapValueYen,
  selectBoardRows,
  sendInspectorGateReason as sendInspectorGateReasonCore,
  settleAuctionHammer as settleAuctionHammerCore,
  settleAuctionLotLost as settleAuctionLotLostCore,
  shopTitle,
  swapCars as swapCarsCore,
  toolDeficitSummary,
  unlockedAuctionTiers as unlockedAuctionTiersCore,
  unlockedTechniques,
  upgradeHintFor,
  valuateCarForBuyer,
  valueLedgerFor,
  worstRemainingBandFor,
  worstRepairableBandInGroup,
  type AttendAuctionGateReason,
  type AuctionGrade,
  type CrewSkillContext,
  type DeliverySpeed,
  type HireMachineLineGateReason,
  type InspectionVisitGateReason,
  type LapBoardRow,
  type MissionGradeReport,
  type NewJobSpec,
  type OwnedWorkupGateReason,
  type SendInspectorGateReason,
  type ServiceJobOutcome,
  type SimContext,
  type TurnoutBand,
  type ValueLedger,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { appendSessionEvent, loadSave, writeSave } from '../save/saveDb'
import { machineLineGateCopy } from '../utils/dayLogFormat'
import { formatYen } from '../utils/formatYen'
import { offerCopy } from '../utils/offerCopy'
import { addressesOverlap, hasWorkAddress, stagedActionsCollide } from '../utils/partAddress'

/**
 * Placeholder seed for the eager store init (immediately replaced by
 * `hydrate()` - either a loaded save or a fresh random career). Kept fixed
 * so store-level tests that read the pre-hydrate state stay deterministic.
 */
const DEFAULT_SEED = 1

/**
 * A fresh random career seed. Game-layer only (Math.random is fine here -
 * the sim stays fully deterministic *given* a seed): a fixed default would
 * give every player the identical career.
 * Explicit seeds (dev console, tests, the balance harness) still bypass this.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}

/** The 6 real component groups, in a stable display order - shared by every
 * group-level and per-part view builder below so the order
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
 * (the stock-baseline/missing-slot model). */
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
   * True when the slot is empty AND that's a real defect - a stolen wheel, a gutted cat, a missing turbo on a
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
  /** False for tyres/brakePadsDiscs/clutch - the
   * per-part repair row and the bench recondition control both hide
   * themselves when this is false; only Replace ever touches the part. */
  repairable: boolean
  /** False only for chassis/paint/underbody -
   * the shell itself, repaired in place and never pulled. The car-detail
   * screen's "Take it off" control only ever renders when this is true. */
  removable: boolean
  /**
   * True when `band` above is the car's APPARENT band
   * rather than its true one - a still-open symptom targets this part and
   * hasn't narrowed enough to resolve it yet (`displayedBandFor`,
   * diagnosis.ts). Always false for a non-symptomatic car/part. The row
   * renders a "?" chip when true; `band` itself is never fabricated either
   * way, just chosen honestly between the two real values.
   */
  uncertain: boolean
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
  /** Jobs currently in progress on this car - created and labored on instantly. */
  jobs: Job[]
  /** Set when this car belongs to a service job the player is working. */
  serviceJob?: ServiceJobView
  /** Whether this car is currently in a service bay (labor only reaches it if so). */
  inServiceBay: boolean
  /** Repair/install work staged on this car but not yet confirmed. */
  stagedActions: StagedAction[]
  /**
   * Each of the 6 real groups' worst present-part band - the
   * group-level display; a real per-part breakdown also exists.
   */
  groupBands: Record<ComponentId, ConditionBand>
  /**
   * Each of the 6 real groups' completeness: true when any member slot is a
   * real defect empty slot (`groupIncompleteForCar`), never the
   * legitimately-empty NA `forcedInduction` case. The service diagram
   * consults this alongside `groupBands` so a stripped group never reads
   * healthy just because its remaining present parts band well.
   */
  groupIncomplete: Record<ComponentId, boolean>
  /**
   * Each of the 6
   * groups' own scaled restoration bill (`groupCostToMintYen`, the car's
   * real tier factor applied) - the condition panel's per-group bill line.
   */
  groupBillYen: Record<ComponentId, number>
  /**
   * This car's money-in record - purchase
   * price (or null when unknown, e.g. a dev grant or a pre-v25 save),
   * repairs, and installed parts. Always populated (`carLedgerFor`'s
   * unknown-purchase default when no real entry exists), even for a
   * customer's service-job car - the financial panel itself only ever
   * renders for an owned car (mirrors `groupBillYen`, which is likewise
   * computed unconditionally for both car kinds).
   */
  ledger: CarLedger
  /**
   * The same guide value the auction house shows
   * (`bidding.ts`'s `anchorValueYen`, generalized to any car+model via
   * `carGuideValueYen` - zero new valuation math).
   */
  guideValueYen: number
  /**
   * Your number - the Finances panel's "You say" row and its
   * projected-profit input: the remaining-cause estimate
   * (`playerEstimateYen`) while the car carries a symptom, the plain guide
   * value otherwise (the two are identical for an honest car). Moves only
   * when the player learns something.
   */
  yourNumberYen: number
  /**
   * The owner's honest receipt: the value-ledger decomposition of this
   * car's true market value (`valueLedgerFor` on the true bands - never a
   * fear line). Line ids only; screens map display labels via
   * `utils/ledgerLabels.ts` and never compute a yen figure of their own.
   */
  valueLedger: ValueLedger
  /**
   * What a sale can actually land at: the true market value spread across
   * the buyer taste band (`economy.valuation.tasteSpread`) - the Sell
   * section's "Expect A to B, depending who bites." line.
   */
  saleRangeYen: { lowYen: number; highYen: number }
  /**
   * Non-null only
   * when a bad foundational part is withholding real aftermarket-premium
   * value from this car (economy-bible.md law 5, the foundation law) - the
   * failing part display names and the withheld
   * yen, so the Finances panel can name what to fix first. Null when the
   * foundation is sound (factor 1.0) or the car carries no premium to
   * withhold in the first place.
   */
  foundationWarning: { failingParts: string[]; withheldYen: number } | null
  /** economy-bible law 1's legibility clause: non-null when this
   * car has repair work available ABOVE its tier's expectation band, i.e. work
   * that costs more than it returns. See `passionSpendNoticeFor`. */
  passionSpendNotice: { band: ConditionBand; returnRate: number } | null
  /**
   * The pre-Confirm estimate of what planned work will do to this
   * car - null when nothing is planned. Every figure assumes the plan fully
   * completes (labor permitting); "estimate, not confirmed" is the caller's
   * job to label.
   */
  plannedEstimate: PlannedEstimateView | null
  /**
   * This owned car's own symptom checklist (`[]` for
   * an honest car) - same shape as `LotDetail.symptoms`, but the UI never
   * renders its `tests` entries here (no yard tests on an owned car; the
   * full workup below supersedes them).
   */
  symptoms: LotDetail['symptoms']
  /**
   * Why the "Full workup" button is disabled
   * right now, `null` when it isn't (`ownedWorkupGateReason`).
   */
  workupGateReason: OwnedWorkupGateReason | null
}

/** The Finances panel's pre-Confirm preview - null (via
 * `CarDetail.plannedEstimate`) when there's nothing planned yet. */
export interface PlannedEstimateView {
  /** All NEW cash every currently planned action will charge at Confirm -
   * the exact figure `confirmStagedWork` will deduct, not a guess: parts +
   * labour only, plan cost with nothing folded in. Machine access (a buried
   * or signature slot's group owned or hired for the day) is a gate, never
   * a fee - a plan needing an unhired line shows its own gate reason
   * (`stagedActionGateReasonFor`) instead of inflating this total. A plain
   * install's PART price is not counted again here; that cash already left
   * when the part was bought, already counted in `ledger.partsYen`. */
  plannedRepairCostYen: number
  /** The total labour slots the planned work will require at
   * Confirm - the same accounting `confirmStagedWork` uses (a repair action's
   * `planGroupRepair.laborSlotsRequired`, plus the target
   * slot's own per-depth-class labour per planned install). The Confirm
   * button shows THIS, not the remaining-today figure, so the player knows
   * what a click actually costs. */
  plannedLaborSlots: number
  /** Labour slots the benched crew's speed skills shave
   * off `plannedLaborSlots` (0 when no crew covers the planned work). Surfaced
   * so the faster total is honest, not silent. */
  crewLaborSaved: number
  /** Yen a benched perfectionist takes off the planned
   * repair cost (0 when none is benched). */
  perfectionistCostSavedYen: number
  /** Total spent (purchase + repairs + parts) AFTER the plan completes. */
  totalSpentYenAfter: number
}

/** A car sitting somewhere in the shop (a service bay or parking), for the bay layout. */
export interface ShopCarView {
  carId: string
  displayName: string
  /** True for a customer's car in for a service job - never owned. */
  isCustomerCar: boolean
  /**
   * True while an accepted service job's car hasn't actually arrived yet -
   * always false for an owned car. The slot renders it
   * dimmed, undraggable, and un-movable until this clears.
   */
  arrivingTomorrow: boolean
  /**
   * A live walk-in offer is waiting
   * on this car right now. Always false for a customer's car (never ours to
   * sell). The badge is what tells a player their listed car has something to
   * answer today, without opening it.
   */
  hasOffer: boolean
}

/** One tool line's ladder state, for the Upgrades screen. */
/** One rung of a tool line's 3-node ladder (the tool wall). */
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
   * True only when a live classifieds listing exists
   * for exactly this line+tier - reputation/cash alone no longer make a
   * tier purchasable, so the Upgrade button reads this too.
   */
  isListed: boolean
}

/** The one live used-machinery classifieds listing,
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

/** One click-per-rung repair step, priced/labored off the real
 * plan - shared shape for the group row, the per-part row, and the bench
 * recondition control. */
export interface NextRepairStepView {
  targetBand: ConditionBand
  costYen: number
  laborSlotsRequired: number
}

/**
 * One assembly's car-level row - remove it as a
 * unit, or refit it once it is on the bench. `blockedReason` is a plain string
 * naming why the relevant action (remove when off the bench, refit when on
 * it) can't run right now - an external blocker still in the way, or the
 * assembly's machine line neither owned nor hired today - phrased the same
 * way `removeBlockedReason` phrases a single-part blocker. Null when nothing
 * blocks it.
 */
export interface AssemblyRowView {
  assemblyId: AssemblyId
  displayName: string
  group: ComponentId
  onBench: boolean
  canRemove: boolean
  canRefit: boolean
  blockedReason: string | null
}

/** One member slot of a benched assembly container - reconditioned
 * or swapped on the bench. */
export interface BenchMemberView {
  carPartId: CarPartId
  displayName: string
  /** The part currently in this member slot, or null for an empty slot. */
  instance: PartInstance | null
  band: ConditionBand | null
  partName: string | null
  repairable: boolean
  /** The next single-rung recondition step for this member, or null when
   * there is nothing to recondition (empty, mint, scrap, or non-repairable). */
  reconditionStep: NextRepairStepView | null
  /** Why fitting a part into this member slot is gated right now (only ever
   * set for the `tyres` member, needing the wheels line owned or hired
   * today), or null when nothing gates it. */
  swapGateReason: string | null
}

/** One assembly container on the bench for a given car. */
export interface BenchContainerView {
  id: string
  assemblyId: AssemblyId
  displayName: string
  members: BenchMemberView[]
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
   * (mirrors `nextBayReputationGate`'s hint-only-when-unmet shape). */
  nextTierRepGate: ReputationTier | null
  maxed: boolean
  /** The full 3-rung ladder, for the tool-wall grid. */
  tiers: ToolTierRungView[]
}

/** A readable job-template name derived from its kebab-case
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

/** Tool-wall info box: what reaching `tier` of `componentId`'s
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
  /** The speed effect every tier has, in plain words (the labour
   * ENERGY a repair costs per band step at this tier,
   * `energyPerBandStepByToolTier`). */
  laborSlotsPerGradeText: string
  /**
   * The one-line rental notice shown on a
   * group's tier-2 rung while the shop does not yet own that tier-2 machine -
   * null once owned, so the line then simply does not render. States the group's
   * per-job machine-shop fee, closing the "invisible until it disappears" gap.
   */
  rentalFeeText: string | null
}

/** One line of the parts-market cart, aggregated by part (repeats in
 * `cartPartIds` = quantity), for the cart panel. */
export interface CartItemView {
  part: Part
  quantity: number
  subtotalYen: number
}

/** One owned part paired with its catalog entry, for the staging inventory panel. */
export interface StageablePartView {
  instance: PartInstance
  part: Part
}

/** One task's condition, for the offer/active-job board. */
export interface ServiceJobTaskView {
  label: string
  done: boolean
}

/** One "fits this vehicle" option in the parts market -
 * an owned car or an accepted customer service-job car (arrived or inbound). */
export interface PartsFitVehicleOption {
  id: string
  label: string
  fitmentClass: PartFitmentClass | null
}

/** The reputation half of the Standing screen. */
export interface StandingReputationView {
  tier: ReputationTier
  points: number
  /** The next tier by name and its threshold, or null once at the top
   * (legend) - so the screen can say "X at N, you're at M". */
  nextTier: { tier: ReputationTier; threshold: number } | null
}

/** One discipline's row on the Standing screen - its points and
 * the named tier-4 technique it earns (shown whether or not it's unlocked,
 * progression bible law 5: every unlock is a named real thing). */
export interface StandingSpecialtyView {
  componentId: ComponentId
  componentLabel: string
  points: number
  technique: { displayName: string; thresholdPoints: number; unlocked: boolean } | null
}

/** Everything the Standing screen renders - granular
 * reputation, all six specialty disciplines, and the derived shop title. Pure
 * function of existing state (no new persisted field). */
export interface StandingView {
  reputation: StandingReputationView
  specialties: StandingSpecialtyView[]
  shopTitleName: string | null
}

/** The staff card/office view interfaces
 * (`StaffMemberCardView`, `StaffAdCardView`, `BenchCrewView`, `StaffOfficeView`)
 * live in `stores/staffStore.ts` alongside `useStaffStore`. */

/** A service-job offer on the board (accept to bring the car into the shop). */
export interface ServiceJobOfferView {
  id: string
  customerName: string
  description: string
  tasks: ServiceJobTaskView[]
  carName: string
  /** The customer car's fitment class (which class of parts fit
   * it) - `null` if the model is somehow unresolved. Rendered as a small chip
   * so the player knows which parts to buy for the job. */
  fitmentClass: PartFitmentClass | null
  payoutYen: number
  baseReputation: number
  expiresOnDay: number
  /**
   * False while any task's `minToolTier` exceeds its line's current tier -
   * `resolveAcceptServiceJob` refuses it, so the UI shows why
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
  /** The customer car's fitment class - same chip as the offer
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
  /** Set while the customer's car hasn't arrived yet; null once it has. */
  arrivesOnDay: number | null
  /**
   * True while the customer's car is still in transit - derived
   * via the same `isServiceJobInTransit` helper the sim's own completion
   * guard uses, rather than callers re-deriving `arrivesOnDay != null`
   * locally. The board and the car page both gate
   * their "work done" / "work outstanding" display on this, never `workDone`
   * alone - a job's tasks can read as satisfied on the rolled customer car
   * before it has even arrived, and that must never render as "hand it
   * back."
   */
  inTransit: boolean
}

/**
 * The campaign's pinned card - the currently
 * `offered` mission, if any (at most one exists at a time). This view's
 * surface is Accept only; grading and delivering use `ActiveStoryMissionView`.
 */
export interface StoryMissionOfferView {
  id: string
  personaName: string
  title: string
  requestCopy: string
  payoutYen: number
  budgetCapYen: number
}

/** The pinned card's active-mission counterpart. `requirementLines` is the
 * always-visible "labels only, no live pass/fail" checklist - real
 * requirement text computed WITHOUT a picked car, since
 * `requirementLabel` never reads the car itself. `lapTimeCeiling` is set
 * only when the mission has that requirement, telling the screen whether to
 * render the reference board at all. */
export interface ActiveStoryMissionView {
  id: string
  personaName: string
  title: string
  requirementLines: { label: string; required: string }[]
  lapTimeCeiling: { courseId: string; maxSeconds: number } | null
}

/** One picker option - an owned car the player might hand over. */
export interface MissionCarOption {
  id: string
  displayName: string
}

/** The mission-complete modal's own receipt -
 * the same "everything here is a READ" shape as `SaleResultView`/
 * `ServiceJobResultView`. `copy` is already the RIGHT template
 * (`overdeliveredCopy` when a tip landed, `deliveredCopy` otherwise) - the
 * modal never branches on `tipYen` itself. */
export interface MissionResultView {
  personaName: string
  copy: string
  payoutYen: number
  tipYen: number
  reputationGained: number
  specialtyGained: Record<ComponentId, number>
  /**
   * `payoutYen` minus the delivered car's ledger total (purchase + repairs +
   * parts, `carLedgerFor` - the same figure CarDetail's finances panel
   * sums), the same 0-for-unknown-purchase idiom that panel already uses.
   * Never includes the tip (shown on its own line) - this is what the car
   * itself earned back against what it cost to bring to this state.
   */
  profitYen: number
}

/** Immediate feedback for a resolved service job, for a completion modal. */
/**
 * The receipt for a completed sale -
 * mirrors `ServiceJobResultView`'s shape and its store-ref + global-mount
 * lifecycle exactly.
 *
 * Everything here is a READ: the car ledger already tracks purchase,
 * repairs and parts; `car-sold` already carries the price and a real
 * `profitYen`.
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
  /** True when this sale matched the buyer's visible want
   * (`car-sold`'s own `matchedSale` flag) - the word-of-mouth close line,
   * revealed only here (progression bible law 4, no ambient number). */
  matchedSale: boolean
}

export interface ServiceJobResultView {
  outcome: 'paid' | 'failed'
  customerName: string
  /** A job can have several tasks - one label per task,
   * built from real part names, never the raw camelCase id. */
  taskLabels: string[]
  payoutYen: number
  /** Positive for a paid job, negative (or zero) for a failed one. */
  reputationDelta: number
  /**
   * What the player actually paid, read from the job's own
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
  /** Display strings ("<brand> <name>") for every
   * customer-origin part that left with the car at close-out - paid or
   * failed alike. Empty when nothing customer-owned was ever pulled. */
  returnedParts: string[]
}

/**
 * An auction lot with the derived numbers the auction screen shows. The
 * hammer itself is settled by the live auction room
 * (`packages/game/src/screens/auctionRoom.ts`), seated straight off this
 * same `guideValueYen`/`ledger`/`turnout` - this view has nothing left to
 * fuzz.
 */
export interface LotDetail {
  lot: AuctionLot
  model: CarModel
  displayName: string
  /** The car's fitment class (which class of parts fit it),
   * rendered as a small chip on the lot card so a bidder knows what they'd be
   * buying parts for. */
  fitmentClass: PartFitmentClass
  /**
   * The room's number - the card's headline value ("the room says"): the
   * same `anchorValueYen` every auction price derives from, the apparent
   * car priced with every doubt at the odds. Never moves with the player's
   * knowledge; `playerEstimateYen` below is what moves.
   */
  guideValueYen: number
  /**
   * The room's receipt: the ledger lines summing exactly to `guideValueYen`
   * (`roomLedgerFor`), the fear line last on a symptomatic lot. Line ids
   * only; the screen maps display labels via `utils/ledgerLabels.ts` and
   * never computes a yen figure of its own.
   */
  ledger: ValueLedger
  /**
   * `reserveYen` is based on the per-instance guide value above, so reserve and buyout
   * both derive from this specific car's real worth - they move together
   * with condition, no static book anchor left to reconcile against.
   */
  reserveYen: number
  /** Always visible, on every lot. */
  buyoutPriceYen: number
  /**
   * The lot's rolled bidder-count band, read straight
   * off `lot.turnout` - fixed for the lot's whole life, not recomputed
   * daily. Feeds the live auction room's own turnout tuning. Still shown as
   * a word only, no numeric gauge (price is king).
   */
  turnout: TurnoutBand
  /**
   * Each of the 6 real groups' worst present-part band -
   * lots are transparent, no reveal machinery: this is always
   * populated, not gated behind an inspection step. Reads off the
   * car's APPARENT view for a symptomatic lot (`groupBands`/`auctionGrade`
   * both price consistently off what the room actually
   * shows - never the true, currently-installed band a symptom's cause set -
   * so a damaged part's grade never leaks the truth next to the sheet's own
   * fear-priced guide value).
   */
  groupBands: Record<ComponentId, ConditionBand>
  /**
   * A real-world auction-style condition summary (overall
   * number/letter plus exterior/interior letter grades) computed purely
   * from the car's existing band state.
   * Stays apparent forever on the lot, even once
   * the player narrows down (never eliminates) a symptom's true
   * cause - the sheet is a fixed listing, not a live readout.
   */
  auctionGrade: AuctionGrade
  /**
   * One entry per symptom this lot's car carries (`[]` for an honest car) -
   * the free, public card line and its cause checklist. Each cause's
   * `dealDeltaYen` is the honest per-cause deal impact: the apparent car's
   * market value with that cause's damage applied, minus the apparent car's
   * value as shown - what the price honestly moves if this cause is the
   * true one ("-¥15,000 if true"), always <= 0. `eliminated` is true once a
   * run test has ruled a cause out (`remainingCauseIds` no longer includes
   * it).
   *
   * `trail` is the run tests, in the order they ran, each carrying the
   * earned `resultLine` - the case file the player has already read. `tests`
   * is the FORK: only tests the routed tree currently offers
   * (`availableTestIdsFor`) that haven't run yet - a locked test is
   * invisible, not disabled, until its parent unlocks it. Both are `[]` once
   * the symptom is fully resolved (`remainingCauseIds.length <= 1` -
   * nothing left to narrow). `symptomIndex` is what `runDiagnosticTest`
   * addresses this symptom by.
   */
  symptoms: {
    symptomIndex: number
    line: string
    resolved: boolean
    causes: { causeId: string; label: string; dealDeltaYen: number; eliminated: boolean }[]
    trail: { testId: string; label: string; minutes: number; resultLine: string }[]
    tests: {
      testId: string
      label: string
      minutes: number
      alreadyRun: boolean
    }[]
  }[]
  /**
   * The player's own honest estimate, once they've
   * learned something about this lot (any test run, or any symptom
   * resolved by any other route) - null beforehand, so the UI only shows
   * "your estimate" once there is genuinely a player-side estimate to show,
   * never a number identical to the guide before any knowledge exists.
   */
  playerEstimateYen: number | null
  /** This lot's backstop close day (the duration roll) - a lot
   * settled sooner, via the live auction room or an instant buyout, never
   * reaches it. */
  expiresOnDay: number
  /** Days remaining until the backstop, for the countdown label. */
  daysLeft: number
}

/**
 * A ballpark market-value preview for an owned car - the
 * for-sale toggle's "roughly what to expect" number. Not a real offer: real
 * offers only exist once the daily draw actually rolls one (see
 * `pendingOffersView`/`offerFor` below); this is the best-fit buyer's own
 * valuation, un-spread, purely informational.
 */
export interface SaleValueEstimate {
  buyerId: string | undefined
  offerYen: number
}

/** A live, same-day-only offer on an owned car, ready
 * for the car-detail/garage offer panels. */
export interface PendingOfferView {
  carInstanceId: string
  carName: string
  buyerId: string
  buyerName: string
  priceYen: number
  /** "A tuner is offering ¥1,240,000 for the FC. Today only." -
   * the one canonical copy string, also reused by the day-report line
   * (`dayLogFormat.ts`'s `offer-received` case) via `utils/offerCopy.ts`. */
  copy: string
  /** This buyer archetype's authored want-line (`Buyer.wantLine`, content) -
   * the want IS the taste ceiling, surfaced alongside the offer so holding
   * out is an informed, rent-priced bet. */
  wantLine: string
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
 * session, never saved), and the running day log. Every player
 * action resolves the instant it's clicked (a direct call to the matching
 * sim instant resolver) - there is no queued plan. `endDay()` is
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
  /** Mirrors `lastJobResult` - set by `acceptOffer`,
   * cleared on dismiss, rendered by a globally-mounted modal. */
  const lastSaleResult = ref<SaleResultView | null>(null)
  /** Mirrors `lastSaleResult` - set by `deliverMission`, cleared
   * on dismiss, rendered by `MissionCompleteModal`. */
  const lastMissionResult = ref<MissionResultView | null>(null)
  /**
   * True once `hydrate()` has resolved AND actually loaded a real save -
   * `MenuScreen`'s own flag: Continue shows only when this is
   * true, and New Game skips its confirmation step when it's false (nothing
   * to lose yet). Starts false; `hydrate()` silently seeding a fresh career
   * when no save exists does not affect this flag, since the menu
   * reads this flag rather than inferring "is this a real save" any
   * other way.
   */
  const hasExistingSave = ref(false)

  /**
   * Session log v0: appends one raw event per player action, for a future
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
  // The daily labour pool and what's left of it are energy POINTS (see sim `energyMax`).
  // The store identifiers keep their names; the player-facing bar reads the integer point values.
  const laborSlotsPerDay = computed(() => energyMax(gameState.value, context.value.economy))
  const laborSlotsRemainingToday = computed(() =>
    Math.max(0, laborSlotsPerDay.value - gameState.value.energySpentToday),
  )
  /** Energy points one labour slot is worth - so a screen can render
   * a staff member's `laborSlotsPerDay` (1/2) as the labour they actually add to
   * the day's pool (`laborSlotsPerDay x pointsPerLabour`). */
  const pointsPerLabour = computed(() => context.value.economy.energy.pointsPerLabour)
  /** Every physical action's labour figure (`energy.actionPoints`) - screens
   * read a control's own figure here, showing it only when above zero. */
  const actionPoints = computed(() => context.value.economy.energy.actionPoints)
  const serviceJobOffers = computed(() => gameState.value.serviceJobOffers)
  const activeServiceJobs = computed(() => gameState.value.activeServiceJobs)
  /** The active yard visit, or `null` outside one - the fixed
   * "At the yard: Xm left" panel's own source. */
  const inspectionVisit = computed(() => gameState.value.inspectionVisit)

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

  /** The pinned mission card's own content - the one currently
   * `offered` mission, or `null` (locked, or already active/delivered). */
  const storyMissionOfferView = computed<StoryMissionOfferView | null>(() => {
    const record = gameState.value.storyMissions.find((r) => r.status === 'offered')
    if (!record) return null
    const mission = context.value.storyMissionsById[record.missionId]
    if (!mission) return null
    const persona = context.value.personasById[mission.personaId]
    return {
      id: mission.id,
      personaName: persona?.name ?? mission.personaId,
      title: mission.title,
      requestCopy: mission.requestCopy,
      payoutYen: mission.payoutYen,
      budgetCapYen: mission.budgetCapYen,
    }
  })

  /** The active-mission summary row's own content. */
  const activeStoryMissionView = computed<ActiveStoryMissionView | null>(() => {
    const record = gameState.value.storyMissions.find((r) => r.status === 'active')
    if (!record) return null
    const mission = context.value.storyMissionsById[record.missionId]
    if (!mission) return null
    const persona = context.value.personasById[mission.personaId]
    const requirementLines = mission.requirements.map((r) => requirementLabel(r, context.value))
    const lapRequirement = mission.requirements.find(
      (r): r is Extract<RequirementSpec, { kind: 'lapTimeCeiling' }> => r.kind === 'lapTimeCeiling',
    )
    return {
      id: mission.id,
      personaName: persona?.name ?? mission.personaId,
      title: mission.title,
      requirementLines,
      lapTimeCeiling: lapRequirement
        ? { courseId: lapRequirement.courseId, maxSeconds: lapRequirement.maxSeconds }
        : null,
    }
  })

  /** The deliver flow's own car picker options - every owned car,
   * by display name (no filtering; the mission's own requirements are what
   * decide fit, not this list). */
  const missionCarOptions = computed<MissionCarOption[]>(() =>
    carsDetailed.value.map((d) => ({ id: d.car.id, displayName: d.displayName })),
  )

  /**
   * Jobs whose work is finished and
   * whose car is sitting in the shop, unpaid, because nobody handed it back.
   * A day ends and that payout just does not arrive.
   */
  const finishedJobsAwaitingHandback = computed<ServiceJobView[]>(() =>
    activeServiceJobViews.value.filter((job) => job.workDone && !job.inTransit),
  )

  /** Cars carrying planned work that was never
   * confirmed - it costs nothing and does nothing until Confirm, so ending the
   * day on it is pure lost time. */
  const carsWithUnconfirmedWork = computed<string[]>(() =>
    Object.entries(gameState.value.stagedCarWork)
      .filter(([, actions]) => actions.length > 0)
      .map(([carId]) => carId),
  )

  /**
   * The parts market's "fits this vehicle" filter's
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
   * Each of the 6 real groups' worst present-part band - the
   * group-level condition summary both the car-detail and the
   * (now always-transparent) auction lot-detail screens show. A group with
   * no present parts (a fully torn-down group mid-service) reports `'mint'`
   * here by construction - this function only ever looks at parts that ARE
   * present, so it says nothing about whether the group is complete. Pair it
   * with `groupIncompleteForCar` before rendering a group's status; a
   * consumer that reads this alone will show a stripped group as healthy.
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
   * Whether each of the 6 real groups carries a real defect empty slot
   * (`isPartMissing`) - a part pulled for service, not the legitimately-empty
   * `forcedInduction` case on a naturally-aspirated car. The service diagram
   * reads this alongside `groupBandsForCar` so a group missing any of its
   * parts renders a distinct open/incomplete state instead of whatever band
   * its remaining present parts happen to carry (a fully stripped group's
   * band defaults to `'mint'`, since a band computed over zero parts finds
   * nothing wrong with any of them).
   */
  function groupIncompleteForCar(car: CarInstance, model: CarModel): Record<ComponentId, boolean> {
    const result = {} as Record<ComponentId, boolean>
    for (const groupId of REAL_COMPONENT_GROUPS) {
      result[groupId] = context.value.partIdsByGroup[groupId].some((partId) =>
        isPartMissing(car, model, partId),
      )
    }
    return result
  }

  /**
   * One entry per symptom `car` carries, its free public card line, its
   * cause checklist, its run-test trail, and its currently offered fork.
   * Shared by a lot's card (`lotDetail`) and an owned car's page
   * (`carDetail`) - the checklist shape is identical either way; only the UI
   * decides whether test buttons render (never on an owned car, where the
   * workup supersedes them). Each cause's `dealDeltaYen` is a plain, honest
   * value comparison - `marketValueYen` with that cause's own damage applied
   * to `apparentCar`, minus `apparentCar`'s own value - the deal impact if
   * that cause is the true one, never the fear-priced sheet gap (that is
   * what the room charges across the whole cause set, not what any one
   * cause is worth). `eliminated` and `resolved` both read
   * `carSymptom.remainingCauseIds`.
   *
   * `trail` walks `runTestIds` in run order; each entry's `resultLine` is
   * the same partition-group lookup `runDiagnosticTest` itself uses to pick
   * the copy it returns when the test runs (the group containing
   * `trueCauseId`), derived here rather than cached by any caller. `tests`
   * (the fork) is `availableTestIdsFor`'s offer, minus whatever's already in
   * `runTestIds` - a locked test is simply absent, never a disabled button.
   * Test `label`s derive from `titleCaseFromSlug` off the id, the same way
   * cause labels do.
   */
  function symptomChecklistForCar(
    car: CarInstance,
    apparentCar: CarInstance,
    model: CarModel,
  ): LotDetail['symptoms'] {
    if (car.symptoms.length === 0) return []
    const heatPercent = gameState.value.marketHeat[model.id] ?? 100
    const apparentValueYen = marketValueYen(
      model,
      apparentCar,
      heatPercent,
      context.value.partsById,
      context.value.partsTaxonomyById,
      context.value.economy,
    )
    return car.symptoms.flatMap((carSymptom, symptomIndex) => {
      const symptom = context.value.symptomsById[carSymptom.symptomId]
      if (!symptom) return []
      const resolved = carSymptom.remainingCauseIds.length <= 1
      const availableTestIds = new Set(availableTestIdsFor(carSymptom, symptom))
      const trail = carSymptom.runTestIds.flatMap((testId) => {
        const testApplication = symptom.tests.find((test) => test.testId === testId)
        if (!testApplication) return []
        const groupIndex = testApplication.partition.findIndex((group) =>
          group.includes(carSymptom.trueCauseId),
        )
        if (groupIndex === -1) return []
        return [
          {
            testId,
            label: titleCaseFromSlug(testId),
            minutes: context.value.diagnosticTestsById[testId]?.minutes ?? 0,
            resultLine: testApplication.resultCopy[groupIndex]!,
          },
        ]
      })
      return [
        {
          symptomIndex,
          line: symptom.cardLine,
          resolved,
          causes: symptom.causes.map((cause) => {
            const installed = apparentCar.parts[cause.carPartId].installed
            const causeValueYen = installed
              ? marketValueYen(
                  model,
                  {
                    ...apparentCar,
                    parts: {
                      ...apparentCar.parts,
                      [cause.carPartId]: { installed: { ...installed, band: cause.setBand } },
                    },
                  },
                  heatPercent,
                  context.value.partsById,
                  context.value.partsTaxonomyById,
                  context.value.economy,
                )
              : apparentValueYen
            return {
              causeId: cause.id,
              label: titleCaseFromSlug(cause.id),
              dealDeltaYen: causeValueYen - apparentValueYen,
              eliminated: !carSymptom.remainingCauseIds.includes(cause.id),
            }
          }),
          trail,
          tests: resolved
            ? []
            : symptom.tests
                .filter(
                  (test) =>
                    availableTestIds.has(test.testId) &&
                    !carSymptom.runTestIds.includes(test.testId),
                )
                .map((test) => ({
                  testId: test.testId,
                  label: titleCaseFromSlug(test.testId),
                  minutes: context.value.diagnosticTestsById[test.testId]?.minutes ?? 0,
                  alreadyRun: carSymptom.runTestIds.includes(test.testId),
                })),
        },
      ]
    })
  }

  /**
   * Each of the 6 real groups' own scaled restoration bill -
   * `groupCostToMintYen` per group, the condition panel's
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
   * The worst REPAIRABLE, sub-mint present-part band within a group - the
   * group "Repair all" control's own floor,
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
   * One repairable row's or one whole group's NEXT single rung of
   * repair - "click to plan one more band." Priced/labored off the
   * REAL repair plan (never a hardcoded one-click-one-labor assumption):
   * computes the plan through the already-staged target (if any) and through
   * one rung further, and returns the DIFFERENCE - the true marginal cost of
   * this one click, whether it's the first click (climbing from the real
   * band) or a repeat click (climbing further from what's already staged).
   * Null when there is nothing left to plan (unrepairable, scrap, missing,
   * or already staged/installed at mint).
   */
  /**
   * The shared computation behind `nextRepairStep` below - factored out so
   * `nextPartStepRange` can price the SAME next-rung
   * step against a band-overridden copy of `car` rather than always reading
   * `car`'s own true band, without duplicating the plan-diff arithmetic.
   */
  function repairStepFor(
    car: CarInstance,
    carId: string,
    componentId: ComponentId,
    carPartId?: CarPartId,
  ): NextRepairStepView | null {
    // A body value carrier's band is derived from zone state on a car that's
    // on the zone model (`bodyPipeline.ts`) - the per-part Repair control
    // never offers a step for it; work the zone's own pipeline stages
    // instead.
    if (carPartId && car.zoneState && isBodyDerivedPart(carPartId)) return null
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
    // A REPAIR climbs only to the group's own tool-tier ceiling (tier-1 caps at
    // fine; mint needs the tier-2 machine OWNED). Once the next rung would cross
    // that ceiling, there is no further "+" to offer - the sim's `repairJobGate`
    // would refuse the same target, so the affordance must not stage a rung
    // Confirm cannot honour. Mint stays reachable by BUYING and fitting a mint
    // part (Replace), never gated here; `repairCeilingCaption` names the machine
    // that lifts the ceiling.
    const repairCeiling = repairCeilingForLevel(
      gameState.value.toolTiers[componentId],
      context.value.economy,
    )
    if (bandIndex(nextRung) > bandIndex(repairCeiling)) return null

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
        context.value.economy.energy.energyPerBandStepByToolTier,
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

  function nextRepairStep(
    carId: string,
    componentId: ComponentId,
    carPartId?: CarPartId,
  ): NextRepairStepView | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    return repairStepFor(car, carId, componentId, carPartId)
  }

  /**
   * The range a repair-cost preview must show instead
   * of a single number, for a part whose true band is still hidden behind an
   * unresolved symptom (`displayedBandFor`'s `uncertain` flag) - the ordinary
   * preview (`nextRepairStep`) reads the car's real, true band directly,
   * which would silently leak it through the cost number itself. `best`
   * prices the next step as if the part were at its displayed APPARENT band;
   * `worst` as if it were at the worst still-live remaining cause's band
   * (`worstRemainingBandFor` - never better than apparent, since a cause's
   * `setBand` is always a floor). Either end can be `null` on its own
   * (apparent already mint, nothing needed there, while the worst case still
   * has real work) - `null` for the whole range only when the part isn't
   * uncertain at all, or nothing is repairable from either end.
   */
  function nextPartStepRange(
    carId: string,
    componentId: ComponentId,
    carPartId: CarPartId,
  ): { best: NextRepairStepView | null; worst: NextRepairStepView | null } | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    const displayed = displayedBandFor(car, carPartId, context.value)
    if (!displayed.uncertain || displayed.band === null) return null
    const worstBand = worstRemainingBandFor(car, carPartId, context.value)
    const installed = car.parts[carPartId].installed
    if (!worstBand || !installed) return null

    const carAt = (band: ConditionBand): CarInstance => ({
      ...car,
      parts: { ...car.parts, [carPartId]: { installed: { ...installed, band } } },
    })
    const best = repairStepFor(carAt(displayed.band), carId, componentId, carPartId)
    const worst = repairStepFor(carAt(worstBand), carId, componentId, carPartId)
    if (!best && !worst) return null
    return { best, worst }
  }

  /** The bench recondition control's own next-rung step - reuses
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

  /** Whether a real car part can be repaired at all -
   * false for tyres/brakePadsDiscs/clutch. The per-part repair row and the
   * bench recondition control (`PartCard.vue`) both key off this. */
  function isPartRepairable(carPartId: CarPartId): boolean {
    return context.value.partsTaxonomyById[carPartId]?.repairable ?? true
  }

  /**
   * The legibility caption shown at a per-part
   * repair affordance when the shop's own tools cannot finish this part past
   * fine - naming the group's tier-2 machine, the purchase that lifts the repair
   * ceiling to mint (same principle as the fee caption: show the
   * constraint at the point of the action). Returned only where a REPAIR is the
   * relevant, genuinely-capped action: the part is actually repairable now
   * (`canRepair` - not scrap, not a non-repairable consumable), it is below mint,
   * and the group's CURRENT tool tier caps a repair below mint (tier-1). Null at
   * tier-2+ (no cap) and for buy-only parts - the mint result there stays
   * reachable by buying and fitting a mint part, never by this repair route. Uses
   * the DISPLAYED band so an unresolved symptom's true band is never leaked.
   */
  function repairCeilingCaption(
    carId: string,
    componentId: ComponentId,
    carPartId: CarPartId,
  ): string | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    // A body value carrier's band is derived from zone state on a car that's
    // on the zone model (`bodyPipeline.ts`) - it never grows the on-car
    // repair "+" affordance this caption rides, so the caption never shows
    // for it either.
    if (car.zoneState && isBodyDerivedPart(carPartId)) return null
    const entry = context.value.partsTaxonomyById[carPartId]
    // Surface only: this caption rides the on-car per-part repair "+" affordance,
    // which exists solely for surface slots (bolt-on/buried parts are bench-only,
    // never grow an on-car repair button). The bench recondition caps at fine too
    // but is a separate control, out of this caption's placement.
    if (!entry || entry.depthClass !== 'surface') return null
    const { band } = displayedBandFor(car, carPartId, context.value)
    if (!band || !canRepair(band, entry) || bandIndex(band) >= bandIndex('mint')) return null
    const ceiling = repairCeilingForLevel(
      gameState.value.toolTiers[componentId],
      context.value.economy,
    )
    if (bandIndex(ceiling) >= bandIndex('mint')) return null // tier-2+ has no repair cap
    const tier2 = TOOL_LINES[componentId].tiers[1]
    if (!tier2) return null
    return `Your tools finish at fine. The ${tier2.displayName} reaches mint.`
  }

  /**
   * Every real part addressed to `componentId`'s group on `car` -
   * operates on a `CarInstance` directly so both the
   * owned-car screen (`partsInGroup`, below, looked up by car id) and the
   * auction lot-detail screen (which has no owned car
   * to look up) share one row-building implementation rather than each
   * re-deriving it. `model` is needed to tell a genuinely
   * MISSING slot apart from the one legitimately-empty case
   * (`forcedInduction` on an NA car) - see `isPartMissing`, sim/bands.ts.
   *
   * Iterates every part the taxonomy assigns to the group
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
      const displayed = displayedBandFor(car, partId, context.value)
      return {
        partId,
        displayName: carPartLabel(partId),
        band: displayed.band,
        installedPartName: installed ? partName(installed.partId) : null,
        grade: part?.grade ?? null,
        missing,
        legitimatelyAbsent: !installed && !missing,
        repairable: isPartRepairable(partId),
        removable: context.value.partsTaxonomyById[partId]?.removable ?? true,
        uncertain: displayed.uncertain,
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
   * id. Every template renders a component through this
   * instead of interpolating `componentId` directly.
   */
  function componentLabel(id: ComponentId): string {
    return componentDisplayName(id, COMPONENT_DISPLAY_NAMES)
  }

  /**
   * Display label for one of the 29 real car parts - reads the
   * taxonomy's own authored `displayName`, never the raw camelCase
   * `CarPartId`. Distinct from `componentLabel` above (that one's for the
   * 6 groups; this one's for a specific part within a group).
   */
  function carPartLabel(id: CarPartId): string {
    return context.value.partsTaxonomyById[id]?.displayName ?? id
  }

  /** Which of the 6 groups a real car part belongs to - the
   * catalog/taxonomy lookup every group-level UI action needs. */
  function groupForCarPart(id: CarPartId): ComponentId | undefined {
    return context.value.partsTaxonomyById[id]?.group
  }

  /**
   * Display label for a part's fitment class - the diegetic
   * name ("Kei & Compact", "Family", ...), never the raw code identifier
   * (`shitbox`/`common`/...). Every template renders a SKU's class through
   * this instead of interpolating `fitmentClass` directly.
   */
  function fitmentClassLabel(fitmentClass: PartFitmentClass): string {
    return partFitmentClassLabel(fitmentClass)
  }

  /**
   * A short human label for one service-job task - outcome-phrased, since a
   * task no longer prescribes an action. Always built from the real part's
   * display name, never the raw camelCase `CarPartId`, extended to the
   * multi-task job shape - a job's copy is built from `tasks`, never a
   * single `work` field. Band/grade words (`mint`, `street`, ...) are
   * already plain English, not ids, so they render as-is - same convention
   * `BandChip` uses.
   */
  function taskLabel(task: ServiceJobTask): string {
    const partName = carPartLabel(task.requirement.carPartId)
    return task.requirement.minGrade
      ? `${partName}: ${task.requirement.minGrade} or better, fitted and ${task.requirement.minBand}`
      : `${partName} must be ${task.requirement.minBand}`
  }

  /** Every task on a service job, paired with whether it's actually done on
   * the car right now - the offer/active-job board's per-task breakdown. */
  function serviceJobTaskViews(job: ServiceJob): ServiceJobTaskView[] {
    return job.tasks.map((task) => ({
      label: taskLabel(task),
      done: isServiceTaskDone(job.car, task, context.value),
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
   * transit - false for an owned car (never in transit)
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
   * The foundation-law surfacing for one
   * car (economy-bible.md law 5) - the failing foundational parts and the
   * aftermarket-premium yen they
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
   * The legibility clause of economy-bible law 1,
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
    const heatPercent = gameState.value.marketHeat[car.modelId] ?? 100
    // The true car's own market value - what a sale actually pays; the taste
    // band around it is the honest "expect A to B" sale range.
    const trueValueYen = marketValueYen(
      model,
      car,
      heatPercent,
      context.value.partsById,
      context.value.partsTaxonomyById,
      context.value.economy,
    )
    const tasteSpread = context.value.economy.valuation.tasteSpread
    const guideValueYen = carGuideValueYen(car, model, gameState.value, context.value)
    return {
      ...detailFor(car),
      jobs: gameState.value.jobs.filter((j) => j.carInstanceId === carId),
      serviceJob: serviceJob ? serviceJobViewFor(serviceJob) : undefined,
      inServiceBay: gameState.value.serviceBayCarIds.includes(carId),
      stagedActions: gameState.value.stagedCarWork[carId] ?? [],
      groupBands: groupBandsForCar(car),
      groupIncomplete: groupIncompleteForCar(car, model),
      groupBillYen: groupBillsForCar(car, model),
      ledger: carLedgerFor(gameState.value, carId),
      guideValueYen,
      // A symptomatic car's "you say" is the remaining-cause estimate (a
      // fully-resolved symptom prices at its exact true value); an honest
      // car's is the guide value itself - the same number by construction.
      yourNumberYen:
        car.symptoms.length > 0
          ? Math.round(playerEstimateYen(car, model, gameState.value, context.value))
          : guideValueYen,
      valueLedger: valueLedgerFor(
        car,
        model,
        heatPercent,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy,
      ),
      saleRangeYen: {
        lowYen: Math.round(trueValueYen * (1 - tasteSpread)),
        highYen: Math.round(trueValueYen * (1 + tasteSpread)),
      },
      foundationWarning: foundationWarningFor(car),
      passionSpendNotice: passionSpendNoticeFor(car, model),
      plannedEstimate: plannedEstimateFor(carId),
      symptoms: symptomChecklistForCar(car, apparentViewOf(car), model),
      workupGateReason: ownedWorkupGateReasonCore(gameState.value, carId, context.value),
    }
  }

  /** The benched crew a repair plan should be priced/sized against -
   * the same context the sim's own repair resolvers use,
   * so the store preview and the committed job agree. */
  function crewCtx(): CrewSkillContext {
    return { staff: gameState.value.staff, economy: context.value.economy }
  }

  /** The total yen every currently planned action will charge at Confirm -
   * the exact figure `confirmStagedWork` deducts: plan cost only (parts +
   * labour). A repair action charges its plan's own cost; an install
   * charges nothing for the part itself (that cash already left when it was
   * bought). Machine access (a buried or signature slot's group owned or
   * hired for the day) is a gate, never a fee here - a plan needing an
   * unhired line shows its own gate reason (`stagedActionGateReasonFor`)
   * instead of an inflated total, so the estimate is always the real charge.
   * `applyCrew` prices the repair portion against the benched crew (a
   * perfectionist's parts discount); passed `false` only to recover the
   * pre-crew base for the "saved" display. */
  function plannedRepairCostYen(carId: string, applyCrew = true): number {
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
          context.value.economy.energy.energyPerBandStepByToolTier,
          action.carPartId,
          applyCrew ? crewCtx() : undefined,
        )
        total += plan.costYen
      } else if (
        action.kind === 'pipeline-stage' ||
        action.kind === 'pipeline-swap-panel' ||
        action.kind === 'pipeline-paint'
      ) {
        total += pipelineActionPlan(car, action)?.costYen ?? 0
      }
    }
    return total
  }

  /** The total labour slots the currently planned work will
   * require at Confirm - mirrors `confirmStagedWork`'s own accounting exactly
   * (a repair action's `planGroupRepair.laborSlotsRequired` when it has real
   * work, plus the target slot's own per-depth-class labour per
   * planned install), so the Confirm button shows what a click actually
   * spends, not the day's remaining total. `applyCrew` sizes against
   * the benched crew's speed discount; passed `false` only to recover the base
   * for the "crew saved N labour" display. */
  /**
   * A staged body-pipeline action's own cost/labour - the same
   * `planPipelineStage`/`planPaintStage`/`planSwapPanel` calls
   * `resolvePipelineStageAction`/`resolvePipelinePaintAction`/
   * `resolvePipelineSwapPanelAction` (sim/stagedWork.ts) resolve with at
   * Confirm, so this preview and the real charge can never drift apart.
   * `null` when the car has no zone state, the zone's own prerequisite isn't
   * met yet, or (swap panel) the picked inventory part no longer fits - the
   * row then shows no total rather than a wrong one.
   */
  function pipelineActionPlan(
    car: CarInstance,
    action: Extract<
      StagedAction,
      { kind: 'pipeline-stage' | 'pipeline-swap-panel' | 'pipeline-paint' }
    >,
  ): { costYen: number; laborSlots: number } | null {
    if (!car.zoneState) return null
    const zone = car.zoneState[action.zoneId]
    const repairLevel = repairLevelForGroup(gameState.value.toolTiers, 'body')
    const rate = context.value.economy.energy.energyPerBandStepByToolTier[repairLevel]
    const capability = {
      unlocked: hasMachineLineFor('body', gameState.value),
      fullCapability:
        gameState.value.toolTiers.body >= 3 || machineHiredToday('body', gameState.value),
    }
    if (action.kind === 'pipeline-stage') {
      const plan = planPipelineStage(action.stage, zone, capability)
      if (!plan.ok) return null
      return { costYen: plan.materialsCostYen, laborSlots: plan.laborUnits * rate }
    }
    if (action.kind === 'pipeline-paint') {
      const plan = planPaintStage(zone, action.zoneId, action.colour, capability)
      if (!plan.ok) return null
      return { costYen: plan.materialsCostYen, laborSlots: plan.laborUnits * rate }
    }
    const model = context.value.modelsById[car.modelId]
    const partInstance = gameState.value.partInventory.find((p) => p.id === action.partInstanceId)
    const catalogPart = partInstance ? context.value.partsById[partInstance.partId] : undefined
    if (!model || !partInstance || !catalogPart) return null
    if (
      catalogPart.zoneId !== action.zoneId ||
      catalogPart.fitmentClass !== fitmentClassForTier(model.tier)
    ) {
      return null
    }
    return {
      costYen: 0,
      laborSlots: context.value.economy.energy.energyByClass['bolt-on'],
    }
  }

  /**
   * The labour one staged action will cost at Confirm - a repair action's
   * `planGroupRepair.laborSlotsRequired` (when it has real work), or an
   * install's per-depth-class fit, free when it matches the slot's vacated
   * baseline. A staged assembly op is never sized here (the sim's
   * resolvers charge it at Confirm; `previewPlannedWork` carries its
   * projection), so it returns 0. Shared by `plannedLaborSlots` (summed) and
   * the per-action confirm-bar attribution, so the item
   * rows sum to Confirm's own figure by construction.
   */
  function stagedActionLaborSlots(
    car: CarInstance,
    action: StagedAction,
    applyCrew: boolean,
  ): number {
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
        context.value.economy.energy.energyPerBandStepByToolTier,
        action.carPartId,
        applyCrew ? crewCtx() : undefined,
      )
      return plan.partIds.length > 0 ? plan.laborSlotsRequired : 0
    }
    if (action.kind === 'install') {
      const partInstance = gameState.value.partInventory.find((p) => p.id === action.partInstanceId)
      const catalogPart = partInstance ? context.value.partsById[partInstance.partId] : undefined
      const targetPartId = action.carPartId ?? catalogPart?.carPartId
      if (!targetPartId) return 0
      // A refit matching the slot's own vacated baseline (putting the car back
      // the way it was found) is free.
      return partInstance
        ? refitLaborSlotsFor(car, targetPartId, partInstance, context.value)
        : installLaborSlotsFor(targetPartId, context.value)
    }
    if (
      action.kind === 'pipeline-stage' ||
      action.kind === 'pipeline-swap-panel' ||
      action.kind === 'pipeline-paint'
    ) {
      return pipelineActionPlan(car, action)?.laborSlots ?? 0
    }
    return 0
  }

  function plannedLaborSlots(carId: string, applyCrew = true): number {
    const car = findWorkableCar(carId)
    if (!car) return 0
    let total = 0
    for (const action of stagedActionsFor(carId)) {
      total += stagedActionLaborSlots(car, action, applyCrew)
    }
    return total
  }

  /**
   * What ONE staged action costs in
   * yen and labour, for the confirm bar's per-item attribution. Read-only, and
   * built from the same `plannedStepFor`/`stagedActionLaborSlots` the totals
   * use - never a parallel estimator. An install's cash already left when the
   * part was bought (0 new yen here); its labour is 0 for a free equivalence
   * refit, its fit class otherwise.
   */
  function plannedActionAttribution(
    carId: string,
    action: StagedAction,
  ): { costYen: number; laborSlots: number } {
    if (action.kind === 'repair') {
      return (
        plannedStepFor(carId, action.componentId, action.carPartId) ?? { costYen: 0, laborSlots: 0 }
      )
    }
    const car = findWorkableCar(carId)
    if (
      car &&
      (action.kind === 'pipeline-stage' ||
        action.kind === 'pipeline-swap-panel' ||
        action.kind === 'pipeline-paint')
    ) {
      return pipelineActionPlan(car, action) ?? { costYen: 0, laborSlots: 0 }
    }
    return { costYen: 0, laborSlots: car ? stagedActionLaborSlots(car, action, true) : 0 }
  }

  /**
   * What the action planned at ONE
   * address will cost and cost in labour - null when nothing is planned there.
   * The row shows the ROW's own planned total (a `poor -> fine` plan, 2 rungs,
   * reads its full cost and labour); the increment lives in the `+` button's
   * tooltip instead.
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
      context.value.economy.energy.energyPerBandStepByToolTier,
      action.carPartId,
      // The row total is the crew-adjusted figure, so the rows still sum to
      // Confirm's own (crew-adjusted) total by construction.
      crewCtx(),
    )
    return {
      // Plan cost only - this row's own figure is exactly what Confirm will
      // charge for it. Machine access is a gate (`stagedActionGateReasonFor`),
      // never a fee folded into this total.
      costYen: plan.costYen,
      // Mirrors `plannedLaborSlots`' own accounting: a plan with no real work
      // costs no labour, matching what `confirmStagedWork` actually spends.
      laborSlots: plan.partIds.length > 0 ? plan.laborSlotsRequired : 0,
    }
  }

  /**
   * The machine group, if any, gating one staged action right now - `null`
   * when the action needs no line, or needs one already owned or hired for
   * today. A repair action gates on any signature slot its own plan
   * actually climbs (mirrors `repairJobGate`'s check exactly); an install
   * gates on its target slot (mirrors `completeJob`'s check). Assembly ops
   * are outside this rework's three gate sites and are never gated here.
   */
  function stagedActionGateGroup(carId: string, action: StagedAction): ComponentId | null {
    const car = findWorkableCar(carId)
    if (!car) return null
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
        context.value.economy.energy.energyPerBandStepByToolTier,
        action.carPartId,
      )
      const needsLine = plan.partIds.some((id) => signatureGroupFor(id, context.value) !== null)
      return needsLine && !hasMachineLineFor(action.componentId, gameState.value)
        ? action.componentId
        : null
    }
    if (action.kind === 'install') {
      const partInstance = gameState.value.partInventory.find((p) => p.id === action.partInstanceId)
      const catalogPart = partInstance ? context.value.partsById[partInstance.partId] : undefined
      const targetPartId = action.carPartId ?? catalogPart?.carPartId
      if (!targetPartId) return null
      const group = machineLineGroupFor(targetPartId, context.value)
      return group && !hasMachineLineFor(group, gameState.value) ? group : null
    }
    return null
  }

  /** The gate reason a staged row shows, or `null` - the Planned Work
   * panel's own explanation for why Confirm won't move this row, instead
   * of failing silently at Confirm time. */
  function stagedActionGateReasonFor(carId: string, action: StagedAction): string | null {
    const group = stagedActionGateGroup(carId, action)
    return group ? machineLineGateCopy(group) : null
  }

  /** Whether ANY currently staged action needs a machine line neither
   * owned nor hired today - the Confirm button's own disable condition, so
   * a gated plan explains itself instead of quietly doing nothing. */
  function stagedWorkGated(carId: string): boolean {
    return stagedActionsFor(carId).some((action) => stagedActionGateGroup(carId, action) !== null)
  }

  /** The Finances panel's pre-Confirm estimate - null when nothing is planned.
   * Real money only: what the plan will charge, its labour, and total spent after. */
  function plannedEstimateFor(carId: string): PlannedEstimateView | null {
    if (stagedActionsFor(carId).length === 0) return null
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    const preview = previewPlannedWork(gameState.value, carId, context.value)
    if (!car || !model || !preview) return null

    const repairCostYen = plannedRepairCostYen(carId)
    const laborSlots = plannedLaborSlots(carId)
    // The base (pre-crew) totals recover what the crew's speed and cost effects
    // shaved off, for an honest "the crew did this" line.
    const crewLaborSaved = plannedLaborSlots(carId, false) - laborSlots
    const perfectionistCostSavedYen = plannedRepairCostYen(carId, false) - repairCostYen
    const ledger = carLedgerFor(gameState.value, carId)
    const totalSpentYenAfter =
      (ledger.purchaseYen ?? 0) + ledger.repairYen + repairCostYen + ledger.partsYen
    return {
      plannedRepairCostYen: repairCostYen,
      plannedLaborSlots: laborSlots,
      crewLaborSaved,
      perfectionistCostSavedYen,
      totalSpentYenAfter,
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

  /** Display name for a buyer archetype - "Tuner", "Collector",
   * ... - the other half of the offer copy alongside the car's own name. */
  function buyerName(buyerId: string): string {
    return context.value.buyers.find((b) => b.id === buyerId)?.displayName ?? buyerId
  }

  /** This buyer archetype's authored want-line, or '' for an unknown id -
   * `PendingOfferView.wantLine`'s source. */
  function buyerWantLine(buyerId: string): string {
    return context.value.buyers.find((b) => b.id === buyerId)?.wantLine ?? ''
  }

  /** True while `carId` is toggled "taking offers". */
  function isForSale(carId: string): boolean {
    return gameState.value.carsForSale.some((f) => f.carInstanceId === carId)
  }

  /** The channel `carId` is currently listed on, `undefined` when it isn't
   * for sale - the Sell section's "Listed on ..." line. */
  function listingChannelId(carId: string): SellingChannelId | undefined {
    return gameState.value.carsForSale.find((f) => f.carInstanceId === carId)?.channelId
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
      wantLine: buyerWantLine(offer.buyerId),
      copy: offerCopy(buyer, carName, offer.priceYen),
    }
  }

  /** Today's live offer on one car, if any - the car-detail
   * screen's offer card. */
  function offerFor(carId: string): PendingOfferView | undefined {
    return pendingOfferViewFor(carId)
  }

  /** Every live offer across every owned car - the garage-wide
   * offers panel. */
  const pendingOffersView = computed<PendingOfferView[]>(() =>
    gameState.value.pendingOffers.flatMap((o) => {
      const view = pendingOfferViewFor(o.carInstanceId)
      return view ? [view] : []
    }),
  )

  /** Current auction catalog grouped by tier (only tiers with lots present).
   * A scripted lot (the tutorial car) sorts to the top of its tier so the
   * walkthrough's subject is the first card, not buried under the day's
   * random stock; the stable sort keeps the
   * remaining lots in state order. */
  const auctionLotsByTier = computed<{ tier: AuctionTier; lots: AuctionLot[] }[]>(() => {
    const byTier = new Map<AuctionTier, AuctionLot[]>()
    for (const lot of gameState.value.activeAuctionLots) {
      const list = byTier.get(lot.tier) ?? []
      list.push(lot)
      byTier.set(lot.tier, list)
    }
    return [...byTier.entries()].map(([tier, lots]) => ({
      tier,
      lots: [...lots].sort((a, b) => Number(b.scripted ?? false) - Number(a.scripted ?? false)),
    }))
  })

  /** Every auction tier open right now - derived from delivered guarantor
   * missions (`local-yard` always included). `AuctionScreen` reads this to
   * decide which tiers render their real board versus the locked-tier copy. */
  const unlockedAuctionTiers = computed<AuctionTier[]>(() =>
    unlockedAuctionTiersCore(gameState.value, context.value),
  )

  /** Derived numbers + the 6 real group bands for one lot (lots are
   * transparent, no inspection gate). */
  function lotDetail(lotId: string): LotDetail | undefined {
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) return undefined
    const model = context.value.modelsById[lot.modelId]
    if (!model) return undefined
    const apparentCar = apparentViewOf(lot.car)
    return {
      lot,
      model,
      displayName: resolveCarDisplayName(model),
      fitmentClass: fitmentClassForTier(model.tier),
      guideValueYen: anchorValueYen(lot, gameState.value, context.value),
      ledger: roomLedgerFor(lot.car, model, gameState.value, context.value),
      reserveYen: reserveYen(lot, gameState.value, context.value),
      buyoutPriceYen: computeBuyoutPriceYen(lot, gameState.value, context.value),
      turnout: lot.turnout,
      groupBands: groupBandsForCar(apparentCar),
      auctionGrade: computeAuctionGrade(apparentCar, model, context.value),
      expiresOnDay: lot.expiresOnDay,
      daysLeft: lot.expiresOnDay - gameState.value.day,
      symptoms: symptomChecklistForCar(lot.car, apparentCar, model),
      playerEstimateYen: lot.car.symptoms.some(
        (s) => s.runTestIds.length > 0 || s.remainingCauseIds.length <= 1,
      )
        ? Math.round(playerEstimateYen(lot.car, model, gameState.value, context.value))
        : null,
    }
  }

  /**
   * Ballpark market-value preview for an owned car - the
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
   * The yard visit's own gate reason for `tier` right
   * now (`inspectionVisitGateReasonCore`) - the per-tier "Inspect here"
   * button's proactive "why not" read, `null` when nothing blocks it.
   */
  function inspectionVisitGateReason(tier: AuctionTier): InspectionVisitGateReason | null {
    return inspectionVisitGateReasonCore(gameState.value, tier, context.value)
  }

  /** The travel fee `beginInspectionVisit` charges for a visit at `tier` -
   * the "Inspect here" button's own price tag. */
  function travelFeeYenFor(tier: AuctionTier): number {
    return context.value.economy.diagnosis.travelFeeYenByTier[tier]
  }

  /**
   * Whether taking a seat at `tier` right now is blocked
   * (`attendAuctionGateReasonCore`) - the "Take a seat" control's proactive
   * "why not" read, `null` when nothing blocks it.
   */
  function attendAuctionGateReason(tier: AuctionTier): AttendAuctionGateReason | null {
    return attendAuctionGateReasonCore(gameState.value, tier, context.value)
  }

  /** The admission fee a room at `tier` charges - the room header's own
   * price tag, and 0 for every tier at current tuning. */
  function attendanceFeeYenFor(tier: AuctionTier): number {
    return context.value.economy.auctionRoom.attendanceFeeYenByTier[tier]
  }

  // --- machine hire (the daily unlock) ------------------------------------

  /** Whether `group`'s tier-2 machine is owned outright - the "In-house"
   * chip's own condition. */
  function machineLineOwned(group: ComponentId): boolean {
    return ownsMachineForGroup(group, gameState.value)
  }

  /** Whether `group`'s daily hire has already been paid today - the "Hired
   * today" chip's own condition. */
  function machineLineHiredToday(group: ComponentId): boolean {
    return machineHiredToday(group, gameState.value)
  }

  /** Whether `group`'s line is usable right now for every operation - owned
   * outright, or hired for today. */
  function machineLineAvailable(group: ComponentId): boolean {
    return hasMachineLineFor(group, gameState.value)
  }

  /** The hire panel's own price tag for `group` - `economy.machineShopAssist
   * .feeYenByGroup[group]`, unchanged from the old per-operation fee, just a
   * daily charge now instead. */
  function machineLineFeeYen(group: ComponentId): number {
    return context.value.economy.machineShopAssist.feeYenByGroup[group]
  }

  /**
   * Whether hiring `group`'s line right now is blocked
   * (`hireMachineLineGateReasonCore`) - the hire panel's proactive "why
   * not" read, `null` when nothing blocks it (including when it is already
   * owned, hired, or free - the button simply never shows for those).
   */
  function hireMachineLineGateReason(group: ComponentId): HireMachineLineGateReason | null {
    return hireMachineLineGateReasonCore(gameState.value, group, context.value)
  }

  /** The live auction room's fuse-length preset, persisted across careers -
   * `standard` for any save that predates the setting (the genuinely-
   * optional-key `uiSettings` field). Set from the settings screen. */
  const fusePreset = computed<FusePreset>(
    () => gameState.value.uiSettings?.fusePreset ?? 'standard',
  )

  /** Sets the fuse-length preset - takes effect the next time a room is
   * built; the room machine itself never reads this. Preserves any other
   * `uiSettings` field already set (e.g. `autoBidEnabled`). */
  function setFusePreset(preset: FusePreset): void {
    gameState.value = {
      ...gameState.value,
      uiSettings: { ...gameState.value.uiSettings, fusePreset: preset },
    }
  }

  /** Whether the auction room auto-bids on the player's behalf, persisted
   * across careers - off for any save that predates the setting. Set from
   * the settings screen; the room only shows its ceiling input, and only
   * actually auto-bids, while this is on. */
  const autoBidEnabled = computed<boolean>(
    () => gameState.value.uiSettings?.autoBidEnabled ?? false,
  )

  /** Sets the auto-bid enable toggle - preserves the fuse preset already set. */
  function setAutoBidEnabled(enabled: boolean): void {
    gameState.value = {
      ...gameState.value,
      uiSettings: { fusePreset: fusePreset.value, autoBidEnabled: enabled },
    }
  }

  /**
   * Start (or replace) the yard inspection visit at `tier` - the per-tier
   * "Inspect here" button. Replacing an
   * already-active visit with minutes left forfeits the remainder; the
   * two-step confirm before that happens is the caller's own job -
   * this always commits immediately once called.
   */
  function beginInspectionVisit(tier: AuctionTier): boolean {
    const result = beginInspectionVisitCore(gameState.value, tier, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('beginInspectionVisit', { tier })
    return true
  }

  /**
   * Run `testId` against `lotId`'s `symptomIndex`-th symptom during the
   * active yard visit. Returns the authored result-
   * copy line for inline display on a legal run, `null` on any refusal.
   * No day-log entry either way (`runDiagnosticTestCore`'s own `log` is
   * always `[]`) - the result copy itself is the player-facing record.
   */
  function runDiagnosticTest(lotId: string, symptomIndex: number, testId: string): string | null {
    const result = runDiagnosticTestCore(
      gameState.value,
      lotId,
      symptomIndex,
      testId,
      context.value,
    )
    if (result.outcome !== 'ran') return null
    gameState.value = result.state
    logSessionEvent('runDiagnosticTest', { lotId, symptomIndex, testId })
    return result.resultCopy
  }

  /**
   * The owned-car full workup - spends `pointsPerLabour`
   * of the day's energy, no fee, no clock, collapses every one of
   * `carInstanceId`'s symptoms straight to their true cause. The only
   * bench-side route (alongside uninstall-reveals-truth) that resolves a
   * bench-only ambiguity like `wont-idle`.
   */
  function resolveOwnedWorkup(carInstanceId: string): boolean {
    const result = resolveOwnedWorkupCore(gameState.value, carInstanceId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('resolveOwnedWorkup', { carInstanceId })
    return true
  }

  /** The benched master inspector's own display name, if one is hired and
   * on the bench right now - the send control's own label and done line
   * both key off this. `undefined` when none is benched, which also means
   * `sendInspectorGateReason` is already refusing `no-inspector` on every
   * lot, so the button stays hidden regardless. */
  const masterInspectorName = computed<string | undefined>(
    () => benchedMemberWithTrait(gameState.value.staff, 'master-inspector')?.displayName,
  )

  /** The per-lot send-inspector control's own proactive "why not" read -
   * `sendInspectorGateReasonCore`, `null` once nothing blocks it. */
  function sendInspectorGateReason(lotId: string): SendInspectorGateReason | null {
    return sendInspectorGateReasonCore(gameState.value, lotId, context.value)
  }

  /**
   * Send the benched master inspector to walk `lotId`'s own open symptoms
   * against the active visit's clock - one explicit action, real tests,
   * real minutes, real trail entries (`resolveSendInspectorCore`). Returns
   * `true` once it actually ran at least one test, `false` on any refusal
   * (the gate already told the button why). No day-log entry either way,
   * matching `runDiagnosticTest`'s own convention - the trail itself is the
   * record.
   */
  function resolveSendInspector(lotId: string): boolean {
    const result = resolveSendInspectorCore(gameState.value, lotId, context.value)
    if (result.outcome !== 'done') return false
    gameState.value = result.state
    logSessionEvent('resolveSendInspector', { lotId })
    return true
  }

  /**
   * Parts in inventory that fit an EMPTY slot within the given group -
   * a group-level install still resolves
   * to whichever specific `CarPartId` in that group is actually empty and
   * the picked catalog part addresses. A scrap `PartInstance` never fits
   * anywhere.
   *
   * Scans every part the taxonomy assigns to the group directly
   * (`partIdsByGroup`), not `presentPartIdsInGroup` - that helper means
   * "physically occupied," so filtering it again for "not installed" would
   * always be empty (every slot it returns already has something
   * installed).
   */
  /**
   * Whether a loose inventory part is legally installable onto `carId` -
   * always true for a player-owned part, but a part whose origin traces to an
   * active customer job may only go back onto that SAME
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
   * job's customer - the badge/lock `PartCard.vue` shows. Asks the
   * same question as `isPartAvailableFor`, just without a target car in mind.
   */
  function isCustomerOwnedPart(part: PartInstance): boolean {
    return gameState.value.activeServiceJobs.some((job) => isCustomerOriginPart(part, job))
  }

  /** The dim "where did this come from" caption line `PartCard.vue` shows
   * beneath a part's name. */
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
   * The per-part counterpart to `installablePartsFor` above - the
   * CarDetailScreen drill-down's own per-part Replace drawer filters to
   * exactly this set (shows only catalog parts addressed to
   * that part that fit the car). Checks the SPECIFIC slot's own
   * `installed` state, not just "some slot in the group is empty" - closes
   * the gap `installablePartsFor` has (see `installFitGate`'s doc
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
   * The human-readable reason `installablePartsForPart`'s results
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

  /**
   * The human-readable reason `removePart`
   * would refuse this slot right now, or `null` when nothing structural
   * blocks it (it may still refuse for insufficient labor - the labor bar
   * already shows that separately). Mirrors `installBlockedReason`'s own
   * reuse shape, over the sim's `removeBlockReason` predicate. A buried
   * engine/drivetrain slot without the line owned or hired today gates here
   * too (`machine-line`) - the suspension/body/interior signature gates
   * never gate removal, only install/repair.
   */
  function removeBlockedReason(carId: string, carPartId: CarPartId): string | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    const reason = removeBlockReason(car, carPartId, gameState.value, context.value)
    if (!reason) return null
    switch (reason.kind) {
      case 'not-removable':
        return "Can't come off the car."
      case 'blocked-by':
        return `Take off ${reason.blockedBy.map((id) => carPartLabel(id)).join(', ')} first`
      case 'machine-line':
        return machineLineGateCopy(reason.group)
    }
  }

  /**
   * The reason an INSTALL/REPLACE of `carPartId` is gated right now, or
   * `null` when it isn't - a buried engine/drivetrain slot or a
   * suspension/body/interior signature slot whose line is neither owned nor
   * hired for today (`machineLineGroupFor` + `hasMachineLineFor`). Drives
   * the install/replace affordance's disabled state and caption.
   */
  function installGateReasonFor(carId: string, carPartId: CarPartId): string | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    const group = machineLineGroupFor(carPartId, context.value)
    if (!group || hasMachineLineFor(group, gameState.value)) return null
    return machineLineGateCopy(group)
  }

  /**
   * The reason an on-car per-part REPAIR of `carPartId` is gated right now,
   * or `null` when it isn't. Per-part repair is bench-only for any
   * non-`surface` slot (the sim refuses it before this ever matters), so
   * this only ever gates a surface signature slot (seats, dashGauges - not
   * `panels`/`underbody` any more, both derived body value carriers now
   * with no on-car repair affordance at all, `bodyPipeline.ts`) - a bolt-on
   * signature slot (dampers, springs) is repaired via the group or the
   * bench, never this per-part affordance. Engine/drivetrain repair is
   * never gated, so this is `null` for them too.
   */
  function repairGateReasonFor(carId: string, carPartId: CarPartId): string | null {
    const car = findWorkableCar(carId)
    if (!car) return null
    if (car.zoneState && isBodyDerivedPart(carPartId)) return null
    if (context.value.partsTaxonomyById[carPartId]?.depthClass !== 'surface') return null
    return installGateReasonFor(carId, carPartId)
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
   * `serviceBayCarIds` is real, index-addressable state (one entry per
   * physical bay), so this is a direct map, not a compact-list-plus-padding
   * reconstruction.
   */
  const serviceBaysView = computed<(ShopCarView | null)[]>(() =>
    gameState.value.serviceBayCarIds.map((id) => (id ? (shopCarView(id) ?? null) : null)),
  )

  /** The parking counterpart to `serviceBaysView` above - same shape, same
   * reasoning (`parkingCarIds` is real indexed state, not
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
   * The one double-parked car (grace/overflow slot), if any -
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

  /** Reputation tier still needed for the next bay of this kind,
   * or null if that's already met, ungated, or the ladder is maxed. */
  function nextBayReputationGate(kind: BayKind): ReputationTier | null {
    return nextBayMinReputationTier(gameState.value, kind, context.value.facilities)
  }

  /**
   * Move a car between parking and a service bay - instant, no limit on how
   * many times a day (a pure sim core the store calls directly). Labour is
   * the `moveCar` action figure, free at the shipped default of 0. Returns
   * whether the move actually happened (false if the car isn't in the shop,
   * is already there, or the destination has no room - see `swapCars` for
   * that last case).
   */
  function moveCar(carId: string, to: BayKind): boolean {
    if (isCarInTransit(carId)) return false
    const result = applyMoves(
      gameState.value,
      [{ carInstanceId: carId, to }],
      context.value.economy,
      laborSlotsRemainingToday.value,
    )
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('moveCar', { carId, to })
    return true
  }

  /**
   * Swap a service-bay car and a parking car's positions atomically - the
   * fix for a shop that's exactly full
   * (services + parking cars == total capacity, zero slack): neither
   * direction of `moveCar` has anywhere to go, but a swap's net occupancy
   * change in each location is zero, so it always succeeds.
   */
  function swapCars(serviceCarId: string, parkingCarId: string): boolean {
    if (isCarInTransit(serviceCarId) || isCarInTransit(parkingCarId)) return false
    const result = swapCarsCore(
      gameState.value,
      serviceCarId,
      parkingCarId,
      context.value.economy,
      laborSlotsRemainingToday.value,
    )
    if (!result.changed) return false
    gameState.value = result.state
    dayLog.value.push({ type: 'cars-swapped', serviceCarId, parkingCarId })
    logSessionEvent('swapCars', { serviceCarId, parkingCarId })
    return true
  }

  /**
   * Move (or swap) a car into a SPECIFIC slot - the real positional path
   * behind drag-and-drop: dropping a car onto an
   * empty slot places it exactly there; dropping onto a slot occupied by a
   * different car exchanges their positions (same section or across
   * service/parking alike); dropping onto its own slot is a no-op. Unlike
   * `moveCar`/`swapCars` above (still used by the plain, non-positional
   * "→ parking"/"→ service bay" buttons and the click-fallback), this is
   * the only path that actually chooses which bay a car lands in.
   */
  function moveCarToSlot(carId: string, to: BayKind, slotIndex: number): boolean {
    if (isCarInTransit(carId)) return false
    const result = moveCarToSlotCore(
      gameState.value,
      carId,
      to,
      slotIndex,
      context.value.economy,
      laborSlotsRemainingToday.value,
    )
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

  // --- tool lines ---

  /** The six tool-line ladders with their current/next tier and reputation gate,
   * for the Upgrades screen. */
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
   * The current classifieds listing for the Upgrades
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
   * What reaching `tier` of `componentId`'s
   * line unlocks, derived live from the real catalog (job templates whose
   * task list needs exactly this tier in this group, the engine tier-3
   * NA-to-turbo ceiling, and the tier's own speed effect).
   */
  function toolTierInfo(componentId: ComponentId, tier: ToolTier): ToolTierInfo {
    const unlocksJobTemplateNames = SERVICE_JOB_TYPES.filter((template) =>
      template.tasks.some(
        (task) =>
          context.value.partsTaxonomyById[task.requirement.carPartId]?.group === componentId &&
          task.minToolTier === tier,
      ),
    ).map((template) => humanizeTemplateId(template.id))
    // The tier-2 rung shows its daily hire price until the machine is owned -
    // the same machine the Machine hire panel charges to hire by the day.
    const rentalFeeText =
      tier === 2 && gameState.value.toolTiers[componentId] < 2
        ? `Until you own this, its heavy jobs need the ${
            context.value.toolLines[componentId].tiers[1]!.displayName
          } hired for the day at ${formatYen(
            context.value.economy.machineShopAssist.feeYenByGroup[componentId],
          )}.`
        : null
    return {
      unlocksJobTemplateNames,
      unlocksNaToTurboConversion:
        componentId === 'engine' &&
        tier === context.value.economy.toolCeilings.naToTurboConversionEngineTier,
      // A repair costs a flat energy per band step by tier
      // (`energyPerBandStepByToolTier`), and the player reads the integer
      // point value directly.
      laborSlotsPerGradeText: `Repair work costs ${context.value.economy.energy.energyPerBandStepByToolTier[tier]} labour per grade at this tier`,
      rentalFeeText,
    }
  }

  // --- specialty ---

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
   * The shop's derived title copy ("the engine house"), or null
   * below `titleThresholdPoints` - plain text alongside reputation
   * (`GarageScreen.vue`), never a meter. Pure function of `specialty`; can
   * shift the moment another line overtakes, no ceremony, no lock-in.
   */
  const shopTitleName = computed<string | null>(() => {
    const group = shopTitle(gameState.value, context.value)
    return group ? context.value.specialtyCopy[group].titleName : null
  })

  /** The techniques the shop has unlocked right now - dev-
   * console-only, same "one sanctioned debug exception" as `specialtyView`. */
  const unlockedTechniqueViews = computed<{ id: string; displayName: string }[]>(() =>
    unlockedTechniques(gameState.value, context.value).map((t) => ({
      id: t.id,
      displayName: t.displayName,
    })),
  )

  /**
   * The Standing screen's whole payload - granular
   * reputation (points + the named next tier), all six specialty disciplines
   * (points + their named technique), and the shop title. Progression bible
   * law 4 permits these exact numbers on this ONE
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
   * reputation gate. Returns false if maxed or unaffordable.
   */
  function upgradeToolLine(componentId: ComponentId): boolean {
    const result = applyToolUpgrade(gameState.value, componentId, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('upgradeToolLine', { componentId })
    return true
  }

  // --- instant actions ---

  /**
   * Repair a group (or one specific part within it when
   * `carPartId` is given - the drill-down's own per-part Repair row) -
   * instant, targeting `targetBand` (mint by default, the plain "Repair"
   * button's behavior; staging lets the player choose a lower target).
   * Finds the car's already-open repair job for this exact
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
      context.value.economy.energy.energyPerBandStepByToolTier,
      carPartId,
      // The instant repair job is sized with the benched crew's speed discount;
      // `repairJobGate` charges the matching (perfectionist-adjusted) cost, so
      // the job and its charge stay consistent.
      crewCtx(),
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
   * continuation rule as `repair`. `carPartId`, when given,
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
    // Labour sizes off the TARGET slot's own depth class - the picked part's
    // own catalog address when `carPartId` (the per-part drawer) is unset,
    // exactly how `applyJobToCar` resolves the real target slot at completion.
    // Free when it matches the slot's own vacated baseline (putting the car back
    // the way it was found).
    const car = findWorkableCar(carId)
    const partInstance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    const catalogPart = partInstance ? context.value.partsById[partInstance.partId] : undefined
    const targetPartId = carPartId ?? catalogPart?.carPartId
    const laborSlotsRequired = !targetPartId
      ? 1
      : car && partInstance
        ? refitLaborSlotsFor(car, targetPartId, partInstance, context.value)
        : installLaborSlotsFor(targetPartId, context.value)
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'install-part',
      componentId,
      partInstanceId,
      carPartId,
      laborSlotsRequired,
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

  // --- staged repair/install work ---

  /**
   * True if this exact part instance is staged as an install anywhere in the
   * shop - on this car or a different one, any component. A staged part is
   * unavailable to stage again until its stage resolves (Confirm) or is
   * explicitly unstaged: the inventory panel uses this to omit
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
   * entry - the pick list for staging an install, shared by the
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
   * Stage a repair or install on a car's component - or on one
   * specific part within it when `action.carPartId` is set (the drill-down's
   * per-part Repair/Replace rows) - free, instant, and fully reversible
   * until Confirm. Refuses (returns false, no state change) for an unknown
   * car, an address that already has an open `Job` (staging
   * never applies to work already in progress - that keeps its existing
   * single-click "Continue repair" flow, generalized to per-part via
   * `addressesOverlap` - a group-level job blocks staging anything on any of
   * its parts, and vice versa), or an install whose part is already staged
   * elsewhere. Staging over an address that already has a
   * *different, overlapping* staged action there replaces it -
   * the displaced entry (and its part, for a displaced install) simply stops
   * being staged, freeing it up again. A group-level stage displaces every
   * per-part stage inside that group (and vice versa); two per-part stages
   * on different parts of the same group coexist freely.
   */
  function stageAction(carId: string, action: StagedAction): boolean {
    const car = findWorkableCar(carId)
    if (!car) return false
    if (isCarInTransit(carId)) return false
    // An assembly action carries no per-part address, so it never matches a
    // job's address here - member busyness is the assembly resolvers' own gate
    // at Confirm (`resolveRemoveAssembly`).
    const perPart = hasWorkAddress(action) ? action : null
    const busy =
      perPart !== null &&
      gameState.value.jobs.some((j) => j.carInstanceId === carId && addressesOverlap(j, perPart))
    if (busy) return false
    if (action.kind === 'install') {
      if (isPartStagedAnywhere(action.partInstanceId)) return false
      // Refuse a part/component/model mismatch here too - not just at Confirm's
      // job-creation time - so a caller that bypasses the UI's own filtered
      // drawer can't stage an install that would only fail silently later. When
      // `action.carPartId` is set, also refuse a part whose own catalog address
      // doesn't match that exact slot, or whose exact slot is already occupied.
      // `slotEmpty` always resolves from the picked part's own catalog address
      // (`part.carPartId`) - most slots start filled with a stock part now, so
      // a group-level stage needs the same real occupied-slot check a per-part
      // one always had, not just when `action.carPartId` happens to be set.
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
        // The one own-car capability ceiling (NA-to-turbo conversion) - mirrors
        // `installFitGate`'s own check, same reason a stage-then-silently-fail-
        // at-Confirm bug can't happen here either.
        naToTurboConversionBlocked(part.carPartId, model, gameState.value, context.value)
      ) {
        return false
      }
      // A free refit - zero labour, zero new cash - resolves right now
      // through the same job machinery Confirm would use, exactly as
      // `removePart` already resolves instantly, rather than sitting on the
      // staged list waiting for a click that would spend nothing anyway. A
      // costed install (real labour, or any machine-shop fee) still stages.
      if (isFreeInstallRefit(gameState.value, carId, action, context.value)) {
        install(carId, action.componentId, action.partInstanceId, action.carPartId)
        logSessionEvent('stageAction', { carId, action })
        return true
      }
    }

    // Staged-action collision is kind-aware - per-part actions displace by
    // address overlap exactly as before; an assembly action displaces only the
    // same op on the same assembly (`stagedActionsCollide`).
    const existing = stagedActionsFor(carId).filter((a) => !stagedActionsCollide(a, action))
    gameState.value = {
      ...gameState.value,
      stagedCarWork: { ...gameState.value.stagedCarWork, [carId]: [...existing, action] },
    }
    logSessionEvent('stageAction', { carId, action })
    return true
  }

  /**
   * Un-stage whatever's staged at this exact address, if anything - free,
   * no-op if nothing was staged there. When `carPartId` is given, un-stages
   * only that specific part's own entry, leaving a sibling part's stage (or the
   * group's own) in the same group untouched - an exact address match
   * (`sameAddress` semantics inlined below), not the broader `addressesOverlap`
   * `stageAction` uses to decide what a NEW stage displaces.
   */
  function unstageAction(carId: string, componentId: ComponentId, carPartId?: CarPartId): void {
    // An assembly action has no per-part address, so a per-part unstage never
    // matches (and never sweeps) one - it has its own `unstageAssemblyAction`
    // below.
    const remaining = stagedActionsFor(carId).filter(
      (a) => !hasWorkAddress(a) || !(a.componentId === componentId && a.carPartId === carPartId),
    )
    const stagedCarWork = { ...gameState.value.stagedCarWork }
    if (remaining.length === 0) delete stagedCarWork[carId]
    else stagedCarWork[carId] = remaining
    gameState.value = { ...gameState.value, stagedCarWork }
    logSessionEvent('unstageAction', { carId, componentId })
  }

  /** Un-stage one staged assembly op - the assembly twin of
   * `unstageAction`, keyed on kind + assemblyId since an assembly action
   * carries no per-part address. Free, no-op if nothing matches. */
  function unstageAssemblyAction(
    carId: string,
    kind: 'remove-assembly' | 'refit-assembly',
    assemblyId: AssemblyId,
  ): void {
    const remaining = stagedActionsFor(carId).filter(
      (a) => hasWorkAddress(a) || a.kind !== kind || a.assemblyId !== assemblyId,
    )
    const stagedCarWork = { ...gameState.value.stagedCarWork }
    if (remaining.length === 0) delete stagedCarWork[carId]
    else stagedCarWork[carId] = remaining
    gameState.value = { ...gameState.value, stagedCarWork }
    logSessionEvent('unstageAssemblyAction', { carId, kind, assemblyId })
  }

  /** Un-stage one staged body-pipeline action - the pipeline twin of
   * `unstageAction`, matching exactly (kind + zone, and `pipeline-stage`
   * additionally its own stage) since these carry no group/part address.
   * Free, no-op if nothing matches. */
  function unstagePipelineAction(
    carId: string,
    action: Extract<
      StagedAction,
      { kind: 'pipeline-stage' | 'pipeline-swap-panel' | 'pipeline-paint' }
    >,
  ): void {
    const remaining = stagedActionsFor(carId).filter((a) => !stagedActionsCollide(a, action))
    const stagedCarWork = { ...gameState.value.stagedCarWork }
    if (remaining.length === 0) delete stagedCarWork[carId]
    else stagedCarWork[carId] = remaining
    gameState.value = { ...gameState.value, stagedCarWork }
    logSessionEvent('unstagePipelineAction', { carId, action })
  }

  /**
   * Confirm - locks in every staged action on this car at once: creates or
   * continues the real jobs and spends today's remaining labor and cash for
   * real, through the exact same resolvers the old instant-click flow
   * always used. The staged list is cleared whether or not
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
   * Pull whatever occupies `carPartId`'s slot into inventory - no staging
   * step, resolves instantly against today's remaining labor. Removal always
   * leaves the slot empty, whatever grade the removed part was;
   * the removed part lands in inventory. A no-op (returns false) if the slot
   * is already empty, a job is currently open on this address, the part isn't
   * removable at all, a `blockedBy` slot is still occupied, or today's labor
   * doesn't cover it (see `removeBlockReason` for the UI's
   * proactive "why not"). A buried engine/drivetrain slot needs that line's
   * tier-2 machine OR the machine-shop assist fee.
   */
  function removePart(carId: string, carPartId: CarPartId): boolean {
    // An assembly member never comes off the car individually; it is worked
    // only via its assembly. This is the player-facing enforcement; the sim
    // primitive stays unchanged.
    if (isAssemblyMember(carPartId)) return false
    const result = resolveRemovePart(
      gameState.value,
      carId,
      carPartId,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('removePart', { carId, carPartId })
    return true
  }

  // --- assemblies ---

  /** Whether a car part is a member of one of the three sub-assemblies - a
   * member is worked only via its assembly, never pulled off the car on its
   * own (`removePart` above refuses it, and the per-part controls hide). */
  function isAssemblyMember(carPartId: CarPartId): boolean {
    return context.value.assemblies.some((a) => a.members.includes(carPartId))
  }

  /**
   * Remove a whole assembly to the bench - 0 labour, gated on the
   * engine/gearbox assembly's own line owned or hired for the day. Mirrors
   * `removePart`'s apply pattern; a no-op (returns false) on any refusal
   * (`resolveRemoveAssembly.ok === false`), including the machine gate.
   */
  function removeAssembly(carId: string, assemblyId: AssemblyId): boolean {
    const result = resolveRemoveAssembly(
      gameState.value,
      carId,
      assemblyId,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (!result.ok) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('removeAssembly', { carId, assemblyId })
    return true
  }

  /**
   * Refit a benched assembly back onto its source car -
   * free per member equal to its vacated baseline, charged install labour for a
   * changed member, gated on the same machine line removal needed. A no-op if
   * the car has no such container on the bench, or the refit itself refuses.
   */
  function refitAssembly(carId: string, assemblyId: AssemblyId): boolean {
    const container = assemblyContainerFor(gameState.value, carId, assemblyId)
    if (!container) return false
    const result = resolveRefitAssembly(
      gameState.value,
      container.id,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (!result.ok) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('refitAssembly', { carId, assemblyId })
    return true
  }

  /**
   * Move a bin part into a member slot of an open bench container -
   * the displaced member returns to the bin. A tyre swap is gated on the
   * wheels line owned or hired for the day. A no-op on any refusal.
   */
  function swapAssemblyMember(
    containerId: string,
    memberSlot: CarPartId,
    partInstanceId: string,
  ): boolean {
    const result = resolveSwapAssemblyMember(
      gameState.value,
      containerId,
      memberSlot,
      partInstanceId,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (!result.ok) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('swapAssemblyMember', { containerId, memberSlot, partInstanceId })
    return true
  }

  /** Pull a mounted member out of a benched assembly into the parts bin (old
   * tyres come off before new ones go on) - labour is the `benchRemoveMember`
   * action figure, free at the shipped default of 0. A no-op on any refusal. */
  function removeAssemblyMember(containerId: string, memberSlot: CarPartId): boolean {
    const result = resolveRemoveAssemblyMember(
      gameState.value,
      containerId,
      memberSlot,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (!result.ok) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('removeAssemblyMember', { containerId, memberSlot })
    return true
  }

  /** An assembly's player-facing display name ("Wheels & tyres"), from
   * content - the assembly twin of `carPartLabel`/`componentLabel`. */
  function assemblyLabel(assemblyId: AssemblyId): string {
    return context.value.assembliesById[assemblyId]?.displayName ?? assemblyId
  }

  /**
   * Every assembly's car-level row for one workable car - whether it is on
   * the bench, whether it can be removed or refitted right now, and a plain
   * "why not" when an external blocker or the assembly's own machine line is
   * in the way. Empty for an unknown car.
   */
  function assemblyRowsFor(carId: string): AssemblyRowView[] {
    const car = findWorkableCar(carId)
    if (!car) return []
    return context.value.assemblies.map((def) => {
      const onBench = !!assemblyContainerFor(gameState.value, carId, def.id)
      const occupiedBlockers = externalBlockersFor(def, context.value).filter(
        (b) => car.parts[b].installed !== null,
      )
      const structurallyBlocked = occupiedBlockers.length > 0
      const gateGroup = assemblyMachineGateGroup(def, context.value)
      const blockingGateGroup =
        gateGroup && !hasMachineLineFor(gateGroup, gameState.value) ? gateGroup : null
      return {
        assemblyId: def.id,
        displayName: def.displayName,
        group: def.group,
        onBench,
        canRefit: onBench && !structurallyBlocked && !blockingGateGroup,
        canRemove:
          !onBench &&
          def.members.some((m) => car.parts[m].installed !== null) &&
          !structurallyBlocked &&
          !blockingGateGroup,
        blockedReason: structurallyBlocked
          ? `Take off ${occupiedBlockers.map((b) => carPartLabel(b)).join(', ')} first`
          : blockingGateGroup
            ? machineLineGateCopy(blockingGateGroup)
            : null,
      }
    })
  }

  /** The next single-rung recondition step for a benched member - reads the
   * band off the instance directly (a container member is not in
   * `partInventory`, so `nextReconditionStep` can't find it) and prices it
   * through the same `reconditionQuote`, which does find container members. */
  function benchMemberReconditionStep(instance: PartInstance): NextRepairStepView | null {
    if (instance.band === 'mint') return null
    const nextRung = climbBand(instance.band, 1)
    const quote = reconditionQuoteFor(instance.id, nextRung)
    if (!quote) return null
    return {
      targetBand: nextRung,
      costYen: quote.costYen,
      laborSlotsRequired: quote.laborSlotsRequired,
    }
  }

  /**
   * The gate reason fitting a part into `carPartId`'s bench slot needs right
   * now (only ever the wheels line, for the `tyres` member), or null when
   * nothing gates it. Shared by `benchContainersFor`'s own caption and
   * `ReplaceDrawer`'s bench-mode picker, so both read the same gate.
   */
  function benchSwapGateReasonFor(carPartId: CarPartId): string | null {
    const group = benchSwapGateGroup(carPartId)
    return group && !hasMachineLineFor(group, gameState.value) ? machineLineGateCopy(group) : null
  }

  /** Every assembly container currently on the bench for one car, each with its
   * member slots resolved for display and bench work (recondition/swap). */
  function benchContainersFor(carId: string): BenchContainerView[] {
    return (gameState.value.assemblyInventory ?? [])
      .filter((c) => c.sourceCarId === carId)
      .map((container) => {
        const def = context.value.assembliesById[container.assemblyId]
        const memberSlots = def ? def.members : (Object.keys(container.members) as CarPartId[])
        return {
          id: container.id,
          assemblyId: container.assemblyId,
          displayName: def?.displayName ?? container.assemblyId,
          members: memberSlots.map((carPartId) => {
            const instance = container.members[carPartId] ?? null
            const taxonomyEntry = context.value.partsTaxonomyById[carPartId]
            return {
              carPartId,
              displayName: taxonomyEntry?.displayName ?? carPartId,
              instance,
              band: instance ? instance.band : null,
              partName: instance ? partName(instance.partId) : null,
              repairable:
                instance !== null &&
                instance.band !== 'scrap' &&
                (taxonomyEntry?.repairable ?? true),
              reconditionStep: instance ? benchMemberReconditionStep(instance) : null,
              swapGateReason: benchSwapGateReasonFor(carPartId),
            }
          }),
        }
      })
  }

  /**
   * The yen a scrap `PartInstance` would fetch if sold right now
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
   * Sell a scrap `PartInstance` for scrap value - the
   * only action available on it, since it can never be reinstalled anywhere.
   * A customer-owned part (`customerJobId` set) is refused by the
   * resolver, so this returns false; the UI disables the control with a reason
   * rather than relying on the silent refusal alone.
   */
  function scrapPart(partInstanceId: string): boolean {
    const result = resolveScrapPart(
      gameState.value,
      partInstanceId,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('scrapPart', { partInstanceId })
    return true
  }

  /**
   * The yen a
   * non-scrap `PartInstance` would fetch sold used right now - the "Sell"
   * button's own price tag, mirroring `resolveSellPart`'s (sim/parts.ts)
   * internal formula so the UI shows the real number before the player
   * commits. Returns 0 for an unknown instance or a scrap one (that's
   * `scrapValueForPart`'s route instead).
   */
  function sellValueForPart(partInstanceId: string): number {
    const instance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    if (!instance || instance.band === 'scrap') return 0
    const part = context.value.partsById[instance.partId]
    if (!part) return 0
    return Math.round(
      part.priceYen *
        bandFactor(instance.band, context.value.economy) *
        context.value.economy.teardown.usedPartSaleFraction,
    )
  }

  /**
   * Sell a used, non-scrap `PartInstance` at the donor-economy haircut -
   * instant, no labour, the counterpart to
   * `scrapPart` for a part still worth more than scrap. Refused (returns
   * false) for a customer-owned part while its job is active - same
   * ownership lock `scrapPart` enforces.
   */
  function sellPart(partInstanceId: string): boolean {
    const result = resolveSellPart(gameState.value, partInstanceId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('sellPart', { partInstanceId })
    return true
  }

  /**
   * A read-only recondition quote for a loose inventory part to `targetBand`
   * - the yen cost, labor slots, and whether the covering
   * equipment is owned, for the inventory card's recondition control. Routes
   * through the sim's `reconditionQuote`, which prices/sizes off the exact
   * same repair economy as an on-car repair. Null when there is nothing to do
   * (already at/above the target, or scrap - never reconditionable).
   */
  function reconditionQuoteFor(partInstanceId: string, targetBand: ConditionBand = 'mint') {
    return reconditionQuote(gameState.value, partInstanceId, targetBand, context.value)
  }

  /**
   * Recondition a loose inventory part to `targetBand` (mint by
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
   * The room-entry seam: charges `tier`'s admission the first time a room
   * seats there today (a zero fee, or a tier already paid today, is a
   * silent no-op success). Returns false only on a genuine refusal
   * (short cash) - the caller must not seat the player when this is false.
   */
  function attendAuction(tier: AuctionTier): boolean {
    const result = resolveAttendAuctionCore(gameState.value, tier, context.value)
    if (result.outcome !== 'attended') return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * The daily-unlock seam: charges `group`'s hire fee the first time that
   * line is needed today (a zero fee, ownership, or a line already hired
   * today is a silent no-op success), unlocking every operation on it until
   * End Day. Returns false only on a genuine refusal (short cash) - the
   * caller must not treat the line as available when this is false.
   */
  function hireMachineLine(group: ComponentId): boolean {
    const result = resolveHireMachineLine(gameState.value, group, context.value)
    if (result.outcome !== 'hired') return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * Settles the live auction room's hammer win: the sim's own purchase path
   * at whatever price the room actually closed at - cash out, car in, the
   * same day. The room (`screens/auctionRoom.ts`) negotiates entirely off
   * the sim; this is the one call that makes a win real.
   */
  function settleAuctionHammer(lotId: string, priceYen: number): boolean {
    const result = settleAuctionHammerCore(gameState.value, lotId, priceYen, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('settleAuctionHammer', { lotId, priceYen })
    return true
  }

  /** The live room's hammer to a rival dealer: the lot leaves the board, no
   * cash or car movement on the player's side. */
  function loseAuctionLot(lotId: string): void {
    gameState.value = settleAuctionLotLostCore(gameState.value, lotId)
    logSessionEvent('loseAuctionLot', { lotId })
  }

  /**
   * Buy a single catalog part directly, bypassing the cart - the primitive
   * `checkoutCart` calls per item below. Not wired to any "Buy" button on
   * `PartsMarketScreen.vue` (cart + checkout replaced the old instant
   * per-row buy, specifically to stop a misclick from spending real
   * cash) but kept as a real store action for tests/dev use. Defaults to
   * 'express' - the old instant behaviour.
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
   * Decline a radial offer - clears it from the board
   * with zero side effects. No reputation change and no day-log entry, so the
   * resolver signals success by returning a new state reference (there is no
   * log to check); a no-op returns the same state unchanged.
   */
  function rejectServiceJobOffer(offerId: string): boolean {
    const result = resolveRejectServiceJobOffer(gameState.value, offerId)
    if (result.state === gameState.value) return false
    gameState.value = result.state
    logSessionEvent('rejectServiceJobOffer', { offerId })
    return true
  }

  /** Accept the currently offered story mission - instant, offered -> active. */
  function acceptMission(missionId: string): boolean {
    const result = resolveAcceptMission(gameState.value, missionId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('acceptMission', { missionId })
    return true
  }

  /** The active mission's own progress record, or `null` outside one - every
   * grade/deliver/board action below reads the mission through this, never a
   * caller-supplied missionId (there is only ever one active mission). */
  function activeMissionRecord() {
    return gameState.value.storyMissions.find((r) => r.status === 'active') ?? null
  }

  /**
   * "Show them the car" - free, repeatable, no state
   * change. A no-op shape (`{ pass: false, lines: [] }`) when there is no
   * active mission at all, matching `gradeMissionCar`'s own contract for an
   * unresolvable mission/car.
   */
  function gradeMission(carInstanceId: string): MissionGradeReport {
    const record = activeMissionRecord()
    if (!record) return { pass: false, lines: [] }
    return gradeMissionCar(gameState.value, record.missionId, carInstanceId, context.value)
  }

  /**
   * "Hand it over" - requires `gradeMission` to already
   * pass (the screen gates the button on it; `resolveDeliverMission` itself
   * re-grades and refuses regardless). Populates `lastMissionResult` for the
   * completion modal with whichever copy the tip actually earned.
   */
  function deliverMission(carInstanceId: string): boolean {
    const record = activeMissionRecord()
    if (!record) return false
    const mission = context.value.storyMissionsById[record.missionId]
    // Read the ledger BEFORE resolving - delivery removes the car and its
    // ledger (the same reason `acceptOffer` reads it first for the sale
    // receipt), so afterwards there is nothing left to compute profit from.
    const ledger = carLedgerFor(gameState.value, carInstanceId)
    const result = resolveDeliverMission(
      gameState.value,
      record.missionId,
      carInstanceId,
      context.value,
    )
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)

    const entry = result.log.find((e) => e.type === 'mission-delivered')
    if (entry?.type === 'mission-delivered' && mission) {
      const persona = context.value.personasById[mission.personaId]
      const totalSpentYen = (ledger.purchaseYen ?? 0) + ledger.repairYen + ledger.partsYen
      lastMissionResult.value = {
        personaName: persona?.name ?? mission.personaId,
        copy: entry.tipYen > 0 ? mission.overdeliveredCopy : mission.deliveredCopy,
        payoutYen: entry.payoutYen,
        tipYen: entry.tipYen,
        reputationGained: entry.reputationGained,
        specialtyGained: entry.specialtyGained,
        profitYen: entry.payoutYen - totalSpentYen,
      }
    }
    logSessionEvent('deliverMission', { missionId: record.missionId, carInstanceId })
    return true
  }

  function dismissMissionResult(): void {
    lastMissionResult.value = null
  }

  // --- staff ---
  // The persisted staff data stays in `GameState`; the staff store reads and
  // writes it through this store's exposed `gameState`, `dayLog`, `context`,
  // and `logSessionEvent`.

  /**
   * The reference-lap board for the active mission's `lapTimeCeiling` requirement
   * (empty when it has none). Null carInstanceId or a car with no measurable time
   * (no tyres/scrap) falls back to the "no candidate" selection (nearest to the
   * requirement's own target, no grade filtering); the player's own predicted time
   * is never part of the returned rows either way.
   */
  function lapBoardRowsFor(carInstanceId: string | null): LapBoardRow[] {
    const record = activeMissionRecord()
    if (!record) return []
    const mission = context.value.storyMissionsById[record.missionId]
    const lapRequirement = mission?.requirements.find(
      (r): r is Extract<RequirementSpec, { kind: 'lapTimeCeiling' }> => r.kind === 'lapTimeCeiling',
    )
    if (!lapRequirement) return []

    let candidate: { timeSeconds: number; tyreGrade: Grade } | null = null
    if (carInstanceId) {
      const car = gameState.value.ownedCars.find((c) => c.id === carInstanceId)
      const model = car ? context.value.modelsById[car.modelId] : undefined
      const installed = car?.parts.tyres.installed
      const tyrePart = installed ? context.value.partsById[installed.partId] : undefined
      if (car && model && tyrePart) {
        const timeSeconds = lapTimeSecondsFor(car, model, context.value)
        if (timeSeconds !== null) candidate = { timeSeconds, tyreGrade: tyrePart.grade }
      }
    }
    return selectBoardRows(
      context.value.lapReferencePool,
      context.value.lapReferenceAnchor,
      candidate,
      lapRequirement.maxSeconds,
      context.value.economy,
    )
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
    // The resolver itself already refused (no state change) - a graceful no-op
    // here too, never reachable through the normal UI (the car-page "Complete Job"
    // button only renders once the car has arrived) but kept honest in case a
    // caller bypasses that.
    if (resolution.outcome === 'in-transit') return 'in-transit'
    gameState.value = resolution.state
    dayLog.value.push(...resolution.log)

    const entry = resolution.log[0]
    // The returned-parts receipt line is appended after the completed/failed
    // entry, not always at index 0.
    const returnedParts =
      resolution.log.find((e) => e.type === 'service-parts-returned')?.parts ?? []
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
        returnedParts,
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
        returnedParts,
      }
    }
    logSessionEvent('completeServiceJob', { jobId, outcome: resolution.outcome })
    return resolution.outcome
  }

  function dismissJobResult(): void {
    lastJobResult.value = null
  }

  /**
   * Accept today's live offer on an owned car - instant. Resolves
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

    // The receipt draws from existing data structures: the ledger and
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
        matchedSale: sold.matchedSale ?? false,
      }
    }
    logSessionEvent('acceptOffer', { carId })
    return true
  }

  /** Turn today's offer down. The car stays
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
   * time before it sells. Replaces both the old
   * instant walk-in sell and list-publicly buttons: the car itself does
   * nothing until a real offer arrives (the daily draw, End Day) and the
   * player accepts it via `acceptOffer` above.
   *
   * `channelId` (default `shopFront`) is which listing channel to list on
   * while turning offers on - ignored when `forSale` is false. Re-listing an
   * already-listed car on a different channel pays that channel's fee again
   * (`resolveSetForSale`'s own re-listing rule).
   */
  function setForSale(
    carId: string,
    forSale: boolean,
    channelId: SellingChannelId = 'shopFront',
  ): boolean {
    const before = gameState.value
    const result = resolveSetForSale(before, carId, forSale, context.value, channelId)
    if (result.state === before) return false
    gameState.value = result.state
    logSessionEvent('setForSale', { carId, forSale, channelId })
    return true
  }

  /**
   * The yen scrapping this car's
   * whole shell would pay right now - the "Scrap the shell" control's own
   * price tag, mirroring `resolveScrapShell`'s (sim/selling.ts) formula so
   * the two-step confirm shows the real number before the player commits.
   * Returns 0 for an unknown car.
   */
  function scrapShellValueYen(carId: string): number {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!model) return 0
    return Math.round(model.bookValueYen * context.value.economy.bands.scrapValueFraction)
  }

  /**
   * Scrap the whole car at once, shell and all -
   * removes the car and every part still on it, frees its bay/grace slot,
   * and pays the flat scrap-value fraction of book value. Irreversible; the
   * screen gates this behind a two-step confirm (mirrors `AuctionScreen.vue`'s
   * `onBuyoutClick`).
   */
  function scrapShell(carId: string): boolean {
    const result = resolveScrapShell(
      gameState.value,
      carId,
      context.value,
      laborSlotsRemainingToday.value,
    )
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('scrapShell', { carId })
    return true
  }

  // --- day advance ------------------------------------------------------

  /**
   * End Day - purely a day-boundary tick now: labor resets,
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
    // Machine hire is an instant action (the attendAuction pattern), so it
    // never reaches `result.log` here - synthesise today's hire lines from
    // `machineHirePaidDayByGroup`'s own record of what was hired today, the
    // same running-cost treatment rent gets on the report.
    const hiresToday: DayLogEntry[] = ComponentIdSchema.options
      .filter((group) => state.machineHirePaidDayByGroup?.[group] === endedDay)
      .map((group) => ({
        type: 'machine-hired' as const,
        componentId: group,
        priceYen: context.value.economy.machineShopAssist.feeYenByGroup[group],
      }))
    lastDayReport.value = {
      day: endedDay,
      entries: [...hiresToday, ...result.log],
      cashDeltaYen: result.state.cashYen - cashBefore,
    }
    reportVisible.value = true
  }

  function dismissReport(): void {
    reportVisible.value = false
  }

  /** Start a fresh career. Defaults to a random seed so players don't all get the same run.
   * Every new career is a tutorial career - `installTutorial` marks
   * it active, offers Yuki's mission on day 1, and seeds the scripted Local Yard
   * lot (a bot/probe career built straight from `createInitialGameState` never
   * does, so those stay tutorial-free). The tutorial intent is
   * passed to `createInitialGameState` itself, because the day-1 board is
   * generated inside it - the Yuki-only job board and the tutorial-model
   * auction exclusion are generation gates, and the flag has to exist before
   * that generation runs, not after (`installTutorial` runs too late for it). */
  function newGame(seed: number = randomSeed()): void {
    gameState.value = installTutorial(
      createInitialGameState(context.value, seed, { tutorial: true }),
      context.value,
    )
    dayLog.value = []
    lastDayReport.value = null
    reportVisible.value = false
  }

  // --- persistence ---

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
    // Parking is a real indexed array - a granted car needs an actual slot,
    // not just membership in `ownedCars` (`assignToParking` grows the array if
    // parking happens to be nominally full, since this bypasses the normal
    // `hasParkingSpace` gate on purpose).
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

  // --- guided tutorial ---

  /** Whether the guided tutorial overlay is live for this career. Read-only:
   * the overlay derives its current step from game state, never from a stored
   * step index. */
  const tutorialActive = computed<boolean>(() => gameState.value.tutorialStatus === 'active')

  /** Permanently dismiss the walkthrough for this career: the
   * story mission stays, the guidance never returns. `'skipped'` also stops the
   * scripted-lot injection (`ensureTutorialLot`, sim). */
  function skipTutorial(): void {
    if (gameState.value.tutorialStatus !== 'active') return
    gameState.value = { ...gameState.value, tutorialStatus: 'skipped' }
  }

  /** Retire the overlay for good once the sign-off has been read after delivery
   * - distinct from a skip only in intent; both suppress the
   * overlay and the scripted lot forever. */
  function finishTutorial(): void {
    if (gameState.value.tutorialStatus !== 'active') return
    gameState.value = { ...gameState.value, tutorialStatus: 'done' }
  }

  /** Record a "Got it" press on an `acknowledged`-completion walkthrough step:
   * appends the step id to `tutorialAcknowledgedSteps` (created on
   * first use, never duplicated). The overlay's state-derived step machine
   * reads the array to advance past the step; the sim never reads it. */
  function acknowledgeTutorialStep(stepId: string): void {
    const acknowledged = gameState.value.tutorialAcknowledgedSteps ?? []
    if (acknowledged.includes(stepId)) return
    gameState.value = {
      ...gameState.value,
      tutorialAcknowledgedSteps: [...acknowledged, stepId],
    }
    logSessionEvent('acknowledgeTutorialStep', { stepId })
  }

  /** The parts catalog, for the dev grant picker. */
  const partsCatalog = computed<readonly Part[]>(() => context.value.parts)
  const modelsCatalog = computed<readonly CarModel[]>(() => context.value.models)

  return {
    tutorialActive,
    skipTutorial,
    finishTutorial,
    acknowledgeTutorialStep,
    gameState,
    dayLog,
    // Exposed so the staff store can read the sim context and log session
    // events. The persisted staff data still lives in `gameState` here.
    context,
    logSessionEvent,
    day,
    cashYen,
    reputationTier,
    reputationPoints,
    ownedCarCount,
    laborSlotsPerDay,
    laborSlotsRemainingToday,
    pointsPerLabour,
    actionPoints,
    serviceJobOffers,
    activeServiceJobs,
    serviceJobOfferViews,
    activeServiceJobViews,
    storyMissionOfferView,
    activeStoryMissionView,
    missionCarOptions,
    partsFitVehicleOptions,
    carsDetailed,
    ownedCarNames,
    partsCatalog,
    modelsCatalog,
    auctionLotsByTier,
    unlockedAuctionTiers,
    resolveModelName,
    partName,
    componentLabel,
    fitmentClassLabel,
    buyerName,
    carDetail,
    groupBandsForCar,
    groupIncompleteForCar,
    groupRepairFloorBand,
    nextRepairStep,
    nextPartStepRange,
    repairCeilingCaption,
    plannedStepFor,
    plannedActionAttribution,
    isPartRepairable,
    isCustomerOwnedPart,
    describePartOrigin,
    partsInGroup,
    carPartLabel,
    groupForCarPart,
    lotDetail,
    symptomChecklistForCar,
    isForSale,
    listingChannelId,
    offerFor,
    pendingOffersView,
    estimatedSaleValue,
    inspectionVisit,
    inspectionVisitGateReason,
    travelFeeYenFor,
    attendAuctionGateReason,
    attendanceFeeYenFor,
    fusePreset,
    setFusePreset,
    autoBidEnabled,
    setAutoBidEnabled,
    beginInspectionVisit,
    runDiagnosticTest,
    resolveOwnedWorkup,
    masterInspectorName,
    sendInspectorGateReason,
    resolveSendInspector,
    installablePartsFor,
    installablePartsForPart,
    installBlockedReason,
    removeBlockedReason,
    installGateReasonFor,
    repairGateReasonFor,
    machineLineOwned,
    machineLineHiredToday,
    machineLineAvailable,
    machineLineFeeYen,
    hireMachineLineGateReason,
    hireMachineLine,
    stagedActionGateReasonFor,
    stagedWorkGated,
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
    isAssemblyMember,
    removeAssembly,
    refitAssembly,
    swapAssemblyMember,
    removeAssemblyMember,
    assemblyLabel,
    assemblyRowsFor,
    benchContainersFor,
    benchSwapGateReasonFor,
    unstageAssemblyAction,
    unstagePipelineAction,
    pipelineActionPlan,
    buyout,
    attendAuction,
    settleAuctionHammer,
    loseAuctionLot,
    buyPart,
    scrapPart,
    scrapValueForPart,
    sellPart,
    sellValueForPart,
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
    scrapShellValueYen,
    scrapShell,
    acceptServiceJob,
    rejectServiceJobOffer,
    completeServiceJob,
    acceptMission,
    gradeMission,
    deliverMission,
    lapBoardRowsFor,
    lastJobResult,
    dismissJobResult,
    lastSaleResult,
    dismissSaleResult,
    lastMissionResult,
    dismissMissionResult,
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
