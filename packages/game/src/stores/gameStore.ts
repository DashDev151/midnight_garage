import {
  BUYERS,
  BuyerArchetypeSchema,
  CARS,
  COMPONENT_DISPLAY_NAMES,
  ComponentIdSchema,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  SubsystemSchema,
  TOOL_LINES,
} from '@midnight-garage/content'
import type {
  AssemblyId,
  AuctionLot,
  AuctionTier,
  BayKind,
  Buyer,
  BuyerArchetype,
  CarInstance,
  CarLedger,
  CarModel,
  CarPartId,
  ComponentId,
  ConditionBand,
  DayLogEntry,
  EngineCharacter,
  FusePreset,
  GameState,
  Grade,
  Job,
  MachineListing,
  Part,
  PaintFinish,
  PaintTinSize,
  PartFitmentClass,
  PartInstance,
  PipelineStageId,
  ReputationTier,
  RequirementSpec,
  SceneStandingStage,
  SellingChannelId,
  ServiceJob,
  ServiceJobTask,
  SessionEventInput,
  SimpleConsumableId,
  StagedAction,
  StatBlock,
  Subsystem,
  ToolTier,
  ZoneId,
} from '@midnight-garage/content'
import {
  cashMovementFor,
  componentDisplayName,
  fitmentClassForTier,
  netCashYen,
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
  bandIndex,
  benchedMemberWithTrait,
  beginInspectionVisit as beginInspectionVisitCore,
  canRepair,
  climbBand,
  bestFitBuyer,
  bodyLineCapability,
  buildSimContext,
  carCostToBandYen,
  carCostToMintYen,
  carGuideValueYen,
  carLedgerFor,
  computeAuctionGrade,
  computeBuyoutPriceYen,
  computeDerivedStats,
  createInitialGameState,
  createRng,
  dayOfWeekName,
  weekIndex,
  describeOrigin,
  deriveReputationTier,
  displayedBandFor,
  buyDynoGateReason,
  dynoHiredToday as dynoHiredTodayCore,
  dynoOwned as dynoOwnedCore,
  dynoReadingFor,
  dynoSessionCarId as dynoSessionCarIdCore,
  dynoSessionGateReason as dynoSessionGateReasonCore,
  displayedReliabilitySplit,
  resolveBuyDyno,
  resolveDynoSession,
  emptyDayActions,
  engineCharacterOf,
  expectationForCar,
  craftOperationCapabilityGateReason,
  externalBlockersFor,
  forecourtOccupancy,
  foundationWithheldYen,
  generateAuctionCarInstance,
  gradeMissionCar,
  groupCostToMintYen,
  hasMachineLineFor,
  installLaborSlotsFor,
  isSellingChannelUnlocked,
  refitAssemblyLaborSlotsFor,
  refitLaborSlotsFor,
  bayCountsByKind,
  hasForecourtSpace as hasForecourtSpaceCore,
  hasParkingSpace,
  buyCoffeeGateReason as buyCoffeeGateReasonCore,
  coffeePriceYen as coffeePriceYenCore,
  hireMachineLineGateReason as hireMachineLineGateReasonCore,
  inspectionVisitGateReason as inspectionVisitGateReasonCore,
  isAuctionTierOpen as isAuctionTierOpenCore,
  nextOpenDayForTier as nextOpenDayForTierCore,
  isBodyDerivedPart,
  isCustomerOriginPart,
  isPartMissing,
  lapTimeSecondsFor,
  ownedWorkupGateReason as ownedWorkupGateReasonCore,
  fittedMachiningGateReason as fittedMachiningGateReasonCore,
  fittedMachiningOffersFor,
  machineGateGroupFor,
  machineHiredToday,
  machineLaborMultiplier,
  machiningGateReason as machiningGateReasonCore,
  machinedPartPriceYen,
  machiningReadingFor,
  makeMarketOrigin,
  isServiceJobInTransit,
  applyToolShopPurchase,
  isToolShopListed,
  isToolTierListed,
  isServiceTaskDone,
  isServiceWorkDone,
  marketValueYen,
  moveCarToSlot as moveCarToSlotCore,
  ownsMachineForGroup,
  removeAssemblyLaborSlotsFor,
  removeBlockReason,
  replacesOccupiedSlot,
  resolveBuyCoffee,
  resolveHireMachineLine,
  nextBayMinReputationTier,
  nextBayPriceYen,
  nextToolTierRepGate,
  parkingOccupancy,
  partCapabilityRequirement,
  partFitsCar,
  partIdOnStation,
  placeOnStationGateReason,
  planGroupRepair,
  planPaintStage,
  planPipelineStage,
  playerEstimateYen,
  presentPartIdsInGroup,
  reconditionQuote,
  repairCeilingForLevel,
  expressPriceYen,
  requirementLabel,
  resolveAcceptMission,
  resolveAcceptSceneCommission,
  resolveAcceptServiceJob,
  resolveDeliverSceneCommission,
  gradeSceneCommissionCar,
  resolveRejectServiceJobOffer,
  resolveAttendAuction as resolveAttendAuctionCore,
  resolveBuyoutInstant,
  resolveBuyConsumableTin,
  resolveBuyPaintTin,
  resolveBuyPart,
  resolveDeliverMission,
  reserveYen,
  resolveFittedMachiningLabor,
  resolveJobLabor,
  resolveMachiningLabor,
  resolvePipelineInstallPanelAction,
  resolvePipelinePaintAction,
  resolvePipelineRemovePanelAction,
  resolvePipelineStageAction,
  resolvePlaceOnStation,
  resolveTakeFromStation,
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
  sceneCommissionsFor,
  sceneLedgerFor,
  scrapShellPriceYen,
  scrapValueYen,
  selectBoardRows,
  sendInspectorGateReason as sendInspectorGateReasonCore,
  settleAuctionHammer as settleAuctionHammerCore,
  settleAuctionLotLost as settleAuctionLotLostCore,
  stationHoldingPart,
  supportVerdict,
  symptomResolved,
  symptomTested,
  swapCars as swapCarsCore,
  toolDeficitSummary,
  toolLevelsFor,
  toolShopForGroup,
  toolShopRepGate,
  unlockedAuctionTiers as unlockedAuctionTiersCore,
  upgradeHintFor,
  usedPartSaleValueYen,
  valuateCarForBuyer,
  valueLedgerFor,
  worstRemainingBandFor,
  worstRepairableBandInGroup,
  type AttendAuctionGateReason,
  type AuctionGrade,
  type BuyDynoGateReason,
  type CrewSkillContext,
  type DeliverySpeed,
  type DynoSessionGateReason,
  type FittedMachiningGateReason,
  type FittedMachiningOfferRow,
  type HireMachineLineGateReason,
  type InspectionVisitGateReason,
  type LapBoardRow,
  type MachiningGateReason,
  type MachiningReading,
  type MissionGradeReport,
  type NewJobSpec,
  type OwnedWorkupGateReason,
  type SendInspectorGateReason,
  type ServiceJobOutcome,
  type SimContext,
  type ToolRequirement,
  type TurnoutBand,
  type ValueLedger,
  type WorkStation,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { decodeSave, encodeSave } from '../save/saveCodec'
import {
  appendLedgerEvent,
  appendSessionEvent,
  clearLedgerEvents,
  clearSessionEvents,
  loadSave,
  stampNewCareerId,
  writeSave,
} from '../save/saveDb'
import { MACHINE_LINE_NAMES } from '../utils/dayLogFormat'
import {
  ENGINE_CHARACTER_LABELS,
  ENGINE_CHARACTER_NOTES,
  SUBSYSTEM_LABELS,
  SUBSYSTEM_MEANINGS,
  SUPPORT_BAND_LABELS,
} from '../utils/dynoLabels'
import { formatYen } from '../utils/formatYen'
import { offerCopy } from '../utils/offerCopy'
import { SCENE_STANDING_STAGE_COPY } from '../utils/sceneStandingLabels'
import { SELLING_CHANNEL_ORDER } from '../utils/sellingChannelLabels'
import { unpaintedPanelsText } from '../utils/zoneSeverity'

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
  /** False only for chassis/bodywork/paint -
   * the shell itself, repaired in place and never pulled. The car-detail
   * screen's "Take it off" control only ever renders when this is true. */
  removable: boolean
  /** True for the three shell carriers (`chassis`/`bodywork`/`paint`), whose
   * slot is never empty and whose fitted part is swapped in place rather
   * than pulled first (`replacesOccupiedSlot`, sim/jobs.ts). The car-detail
   * screen offers Replace on them while they are occupied; every other slot
   * has to be emptied first. */
  replaceInPlace: boolean
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
  /**
   * Each of the 6 real groups' worst present-part band - the
   * group-level display; a real per-part breakdown also exists.
   */
  groupBands: Record<ComponentId, ConditionBand>
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
   * The bill to bring this car to mint (`carCostToMintYen`) - the ledger's
   * forward-looking work row prices its gain against this, never a second
   * bill computation.
   */
  workBillYen: number
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
  /**
   * The build's own support-ratio warning (design 7c) - null at `adequate`,
   * since competence is the baseline and earns no readout at all. Non-null
   * names the shortfall in the game's own voice, never a number (the dyno is
   * where numbers belong); it explains a reliability figure that has ALREADY
   * moved, so the number is right whether or not the player reads this line.
   * See `supportReadoutFor`.
   */
  supportReadout: { band: 'strained' | 'dangerous'; copy: string } | null
  /**
   * The line a car sitting in unpainted panels carries, null when every panel
   * is in colour (and on a car with no zone state at all). Fitting a body kit
   * strips every panel it covers back to bare, which drops the `paint` band
   * and takes style and authenticity with it, so this explains a fall the
   * player would otherwise watch happen for no stated reason. It reports what
   * has ALREADY moved and changes no figure. See `unpaintedPanelsText`.
   */
  unpaintedPanelsNote: string | null
}

/**
 * The rate-conversion disclosure for one machine-gated operation worked
 * without its group's machine (see `gameStore.ts`'s
 * `machineLaborDisclosureFor`) - the two figures a button shows instead of a
 * hard refusal: what it costs by hand right now, and what hiring the line
 * would bring it down to plus today's fee.
 */
export interface MachineLaborDisclosure {
  group: ComponentId
  handLaborSlots: number
  machineLaborSlots: number
  hireFeeYen: number
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

/** One rung of a tool line's ladder (the tool wall). */
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
 * week ("nothing in the classifieds this week" empty state). The paper
 * advertises either one line's rung or a whole shop, so `tier` is null for a
 * shop and `componentLabel` then names every line it covers. */
export interface MachineListingView {
  kind: 'tool-tier' | 'tool-shop'
  componentLabel: string
  tier: ToolTier | null
  displayName: string
  priceYen: number
  daysLeft: number
}

/** One shop at the top of the tool ladder, for the Upgrades screen - the
 * same shape a rung offers, for one purchase covering several lines. */
export interface ToolShopView {
  id: string
  displayName: string
  /** The lines it covers, in display words. */
  coversLabels: string[]
  covers: ComponentId[]
  owned: boolean
  priceYen: number
  /** The reputation still needed, or null once met (or once owned). */
  repGate: ReputationTier | null
  /** True only while a live classifieds listing advertises this exact shop. */
  isListed: boolean
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
 * it) can't run right now - an external blocker still in the way, the
 * assembly's machinery neither owned nor hired today, or today's labour
 * falling short of what the op actually costs - phrased the same way
 * `removeBlockedReason` phrases a single-part blocker. Null when nothing
 * blocks it.
 */
export interface AssemblyRowView {
  assemblyId: AssemblyId
  displayName: string
  group: ComponentId
  onBench: boolean
  canRemove: boolean
  canRefit: boolean
  /** Labour the remove would actually cost right now - the operation's own
   * overhead plus every member still installed, so the button quotes the
   * real figure rather than a flat one (`removeAssemblyLaborSlotsFor`). */
  removeLabourPoints: number
  /** Labour the refit would actually cost right now - the operation's own
   * overhead plus every benched member, each at its own equivalence-or-install
   * charge, so the button quotes the real figure rather than the flat op
   * overhead alone (`refitAssemblyLaborSlotsFor`). Zero while off the bench. */
  refitLabourPoints: number
  blockedReason: string | null
  /** The machine-labour disclosure for this assembly's own gate group, or
   * `''` when nothing gates it (or the machine is already owned/hired) -
   * `removeLabourPoints`/`refitLabourPoints` above already carry the real
   * by-hand rate when gated; this names what hiring the line would buy back
   * (an assembly op is never refused for want of the machine). */
  machineNote: string
}

/** One member slot of a benched assembly container - a stand holds an
 * assembly for its members to be swapped, never for repair: a member is
 * repaired by pulling it into the warehouse and carrying it to the workshop
 * floor's bench, like any other loose part. */
export interface BenchMemberView {
  carPartId: CarPartId
  displayName: string
  /** The part currently in this member slot, or null for an empty slot. */
  instance: PartInstance | null
  band: ConditionBand | null
  partName: string | null
  /** The machine-labour disclosure fitting a part into this member slot
   * carries right now (only ever set for the `tyres` member, without the
   * wheels line owned or hired today), or `''` when nothing gates it. Never
   * blocking: a bench swap always works, just slower by hand. */
  swapGateReason: string
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
  /** The line's own rungs, for the tool-wall grid. */
  tiers: ToolTierRungView[]
}

/** One subsystem's row on the dyno sheet - the ratio the sim measured, and
 * whether it is the weakest link the headline reads. */
export interface DynoSubsystemRowView {
  subsystem: Subsystem
  label: string
  meaning: string
  ratio: number
  weakest: boolean
}

/**
 * The whole dyno sheet for the car currently on the rollers. Every figure is
 * `dynoReadingFor`'s (sim/dyno.ts) unchanged - the store labels and orders
 * them and computes nothing, so what the screen shows and what the model
 * returns cannot drift apart.
 */
export interface DynoSheetView {
  carId: string
  displayName: string
  /** The engine's response character, and what it means for tuning it. */
  engineCharacterLabel: string
  engineCharacterNote: string
  /** PS per litre of effective displacement, `null` for a model carrying no
   * displacement figure. */
  specificOutputPsPerLitre: number | null
  displacementCc: number | null
  effectiveDisplacementCc: number | null
  /** True when the two above differ - a rotary, whose equivalent capacity is
   * what makes its specific output comparable to a piston engine's. Shown
   * rather than applied silently. */
  rotaryEquivalent: boolean
  stockPowerPs: number
  powerPs: number
  /** `powerPs - stockPowerPs`, signed. */
  powerDeltaPs: number
  rows: DynoSubsystemRowView[]
  headlineRatio: number
  headlineBandLabel: string
  band: 'adequate' | 'strained' | 'dangerous'
  /** The named shortfall, in the same words the car's own always-on warning
   * uses - `null` at `adequate`, where there is no shortfall to name. */
  shortfallCopy: string | null
  /** The reliability the build is carrying (the stat itself), the car's own
   * ceiling, and how the gap between them splits. The three costs and the
   * reliability sum to the base. */
  reliability: number
  reliabilityBase: number
  conditionCostPoints: number
  coherenceCostPoints: number
  powerCostPoints: number
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
  /** True only for the engine line at the level that owns the one real
   * own-car capability ceiling (`toolCeilings.naToTurboConversionEngineTier`). */
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
  /** The car's engine response character, which is what decides how much
   * power any engine SKU is worth on it (`statModifiers.powerFraction` is
   * authored per character). The parts catalogue reads this to show a power
   * figure once a vehicle is picked; `null` when the car's model cannot be
   * resolved, and the catalogue then shows no power figure at all. */
  engineCharacter: EngineCharacter | null
}

/** The reputation half of the Standing screen. */
export interface StandingReputationView {
  tier: ReputationTier
  points: number
  /** The next tier by name and its threshold, or null once at the top
   * (legend) - so the screen can say "X at N, you're at M". */
  nextTier: { tier: ReputationTier; threshold: number } | null
}

/** One car on a scene's ledger row - the deed itself, not a running count. */
export interface StandingSceneCarView {
  carInstanceId: string
  carLabel: string
  priceYen: number
  day: number
}

/** A scene's live commission, offered or accepted - the customer's own want
 * line verbatim, never a second summary of it. */
export interface StandingSceneCommissionView {
  customerName: string
  requestCopy: string
  status: 'offered' | 'active'
}

/** A scene's craft operation, once it exists in the catalogue at all - shown
 * whether or not it is unlocked yet, so a scene short of Shop names what it
 * is working toward. `gateReason` is `null` once both the scene's standing
 * and the tool tier its `carPartId` needs are met; performing it still needs
 * the car in the service bay, which stays the Machine Shop's own affordance. */
export interface StandingSceneOperationView {
  id: string
  displayName: string
  description: string
  gateReason: 'tool-tier' | 'scene-standing' | null
}

/**
 * One scene's row on the Standing screen - its stage stated in words and the
 * real cars delivered there, newest first. Deed counts and price bars decide
 * the stage underneath (`creditSceneDelivery`, sim/sceneStanding.ts); this
 * view never carries either number, only the stage word and the list itself
 * - the ledger is a history, not a bar.
 */
export interface StandingSceneRowView {
  scene: BuyerArchetype
  label: string
  stage: SceneStandingStage
  stageCopy: string
  cars: StandingSceneCarView[]
  commission: StandingSceneCommissionView | null
  operation: StandingSceneOperationView | null
}

/** Everything the Standing screen renders - granular
 * reputation and every scene's ledger row. Pure function of existing state
 * (no new persisted field). */
export interface StandingView {
  reputation: StandingReputationView
  scenes: StandingSceneRowView[]
}

/**
 * One week's row on the cost sheet: the five lines as the shop's own ledger
 * records them, the days they cover, and the net. `open` marks the week still
 * being played - a running total, never presented as a result.
 */
export interface CostSheetWeekView {
  weekNumber: number
  firstDay: number
  lastDay: number
  open: boolean
  incomeYen: number
  onCarsYen: number
  stockYen: number
  runningYen: number
  investmentYen: number
  netYen: number
}

/** Everything the cost sheet renders: every week the shop has traded, newest
 * first. Pure derivation over `financeLedger` - no state of its own. */
export interface CostSheetView {
  weeks: CostSheetWeekView[]
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
 * repairs, parts and listing fees; `car-sold` already carries the price and
 * a real `profitYen`.
 */
export interface SaleResultView {
  displayName: string
  priceYen: number
  purchaseYen: number
  repairYen: number
  partsYen: number
  listingFeesYen: number
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
  /** Positive for a paid job, always 0 for a failed one - a failure costs the
   * payout and the sunk bills, never reputation. */
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
   * The bill to bring the APPARENT car to mint (`carCostToMintYen` on the
   * same apparent view `ledger` prices) - the ledger's forward-looking work
   * row prices its gain against this, never a second bill computation.
   */
  workBillYen: number
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
   * the symptom is fully resolved (`symptomResolved` - nothing left to
   * narrow). `symptomIndex` is what `runDiagnosticTest`
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
   * The player's own honest estimate, once they have run a test on this lot
   * (`symptomTested`) - null beforehand, so the UI only shows "your estimate"
   * once there is genuinely a player-side estimate to show, never a number
   * identical to the guide before any knowledge exists. A test is the only
   * thing that ever narrows a LOT's causes; the workup and reveal-on-removal
   * are owned-car routes and cannot reach one.
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
  /** What each line actually works at right now: its own rung, or 3 once the
   * shop covering it is owned. Every capability read in this store goes through
   * this rather than `toolTiers`, so a rung and a shop are one ladder here
   * exactly as they are in the sim. */
  const toolLevels = computed(() => toolLevelsFor(gameState.value, context.value))
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
   * Session log v0: appends one typed event per player action - `event`'s
   * `type`/`payload` pair is `SessionEventInput` (content/sessionEvent.ts),
   * the same union the career-script replay interpreter
   * (`packages/sim/src/careerReplay.ts`) switches over exhaustively, so a
   * call site logging an event that union doesn't know is a compile error
   * here rather than a silent replay gap. Fire-and-forget by design - never
   * awaited in an action path, since a lost telemetry write must never break
   * play (matches `writeSave`'s own best-effort shape, `saveDb.ts`).
   */
  function logSessionEvent(event: SessionEventInput): void {
    void appendSessionEvent({ day: gameState.value.day, timestamp: Date.now(), ...event })
  }

  /**
   * The one day-log write point: pushes the entries, and mirrors every cash
   * movement among them onto the persisted `ledgerEvents` stream, classified
   * by `cashMovementFor` - the same law `bookCashMovements` posts the weekly
   * sheet by, so the export and the cost sheet can never disagree. Zero-yen
   * movements are skipped exactly as the sheet skips them. Fire-and-forget,
   * matching `logSessionEvent`. `day` defaults to today; `endDay` passes the
   * day that just ended, because `advanceDay`'s entries (rent, wages) belong
   * to the day the sim booked them on, not the morning after.
   */
  function pushDayLog(entries: readonly DayLogEntry[], day: number = gameState.value.day): void {
    dayLog.value.push(...entries)
    for (const entry of entries) {
      const movement = cashMovementFor(entry)
      if (!movement || movement.amountYen === 0) continue
      void appendLedgerEvent({
        day,
        bucket: movement.bucket,
        amountYen: movement.amountYen,
        entryType: entry.type,
        timestamp: Date.now(),
      })
    }
  }

  /** The first `type` entry's yen magnitude, read through the same
   * classification law the ledger stream uses - the session-log payload
   * enrichment's one way of quoting an amount, so no payload ever carries a
   * second opinion on what an entry's money was. */
  function loggedYen(log: readonly DayLogEntry[], type: DayLogEntry['type']): number | undefined {
    const entry = log.find((e) => e.type === type)
    return entry ? cashMovementFor(entry)?.amountYen : undefined
  }

  const day = computed(() => gameState.value.day)
  /** The current day's weekday name (`calendar.ts`'s `dayOfWeekName`) - the
   * one-word texture sprint149.md adds to every day-facing screen: "Day 12"
   * alone reads as a resource counter, "Day 12 - Friday" reads as a place
   * in a rhythm the player can plan payday and the auction around. */
  const dayOfWeekLabel = computed(() => dayOfWeekName(gameState.value.day, context.value.economy))
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
        toolDeficitSummary(offer.tasks, toolLevels.value, context.value).maxDeficit === 0
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
          : (upgradeHintFor(offer.tasks, toolLevels.value, context.value) ?? undefined),
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
        engineCharacter: model ? engineCharacterOf(model, context.value.economy) : null,
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
        engineCharacter: model ? engineCharacterOf(model, context.value.economy) : null,
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
   * present, so it says nothing about whether the group is complete.
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
      const resolved = symptomResolved(carSymptom)
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
   * One repairable row's or one whole group's NEXT single rung of repair -
   * "click to repair one more band", executing instantly on click
   * (`repair(carId, componentId, nextRung, carPartId)`). Priced/labored off
   * the REAL repair plan (never a hardcoded one-click-one-labor assumption):
   * the plan through one rung above the car's own true current band. Null
   * when there is nothing left to plan (unrepairable, scrap, missing, or
   * already at mint).
   */
  /**
   * The shared computation behind `nextRepairStep` below - factored out so
   * `nextPartStepRange` can price the SAME next-rung
   * step against a band-overridden copy of `car` rather than always reading
   * `car`'s own true band.
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
    const realFloor = carPartId
      ? (car.parts[carPartId].installed?.band ?? null)
      : groupRepairFloorBand(carId, componentId)
    if (!realFloor || realFloor === 'mint') return null
    const nextRung = climbBand(realFloor, 1)
    // A REPAIR climbs only to the group's own tool-tier ceiling (tier-1 caps at
    // fine; mint needs the tier-2 machine OWNED). Once the next rung would cross
    // that ceiling, there is no further "+" to offer - the sim's `repairJobGate`
    // would refuse the same target, so the affordance must not offer a rung the
    // click cannot honour. Mint stays reachable by BUYING and fitting a mint
    // part (Replace), never gated here; `repairCeilingCaption` names the machine
    // that lifts the ceiling.
    const repairCeiling = repairCeilingForLevel(
      toolLevels.value[componentId],
      context.value.economy,
    )
    if (bandIndex(nextRung) > bandIndex(repairCeiling)) return null

    const plan = planGroupRepair(
      car,
      componentId,
      nextRung,
      toolLevels.value,
      context.value.partIdsByGroup,
      context.value.partsById,
      context.value.partsTaxonomyById,
      context.value.economy.restoration.repairStepFraction,
      context.value.economy.energy.energyPerBandStepByToolTier,
      carPartId,
    )
    if (plan.laborSlotsRequired <= 0) return null // nothing repairable left to climb (scrap/non-repairable)
    return {
      targetBand: nextRung,
      costYen: plan.costYen,
      laborSlotsRequired: plan.laborSlotsRequired,
    }
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
    // Fixed carriers only: this caption rides the on-car per-part repair "+"
    // affordance, which exists solely for a part that never comes off (every
    // removable part is bench-only and never grows an on-car repair button).
    // The bench recondition caps at fine too but is a separate control, out of
    // this caption's placement.
    if (!entry || entry.removable) return null
    const { band } = displayedBandFor(car, carPartId, context.value)
    if (!band || !canRepair(band, entry) || bandIndex(band) >= bandIndex('mint')) return null
    return repairCeilingSentence(componentId)
  }

  /**
   * The one sentence naming the tier-2 machine that lifts a group's repair
   * ceiling from fine to mint, or null once that group already reaches mint.
   * Shared by the on-car caption above and the bench's own
   * (`benchRepairCeilingCaption`), so the two rooms never word it differently.
   */
  function repairCeilingSentence(componentId: ComponentId): string | null {
    const ceiling = repairCeilingForLevel(toolLevels.value[componentId], context.value.economy)
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
        replaceInPlace: replacesOccupiedSlot(partId, context.value),
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
   * (`entry`/`everyday`/...). Every template renders a SKU's class through
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
   * premium to withhold. The yen figure is sim's own `foundationWithheldYen`,
   * which is the value formula's own premium term read at a sound foundation
   * and at this car's, so what the panel says and what the price does can
   * never disagree.
   */
  function foundationWarningFor(
    car: CarInstance,
    model: CarModel,
  ): { failingParts: string[]; withheldYen: number } | null {
    const economy = context.value.economy
    const withheldYen = foundationWithheldYen(model, car, context.value.partsById, economy)
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

  /**
   * The support-ratio warning for one car (design 7c) - null at `adequate`,
   * since the readout is silent whenever the build costs the player nothing.
   * Reads the same `supportVerdict` the reliability derivation itself scores
   * against, so what the panel names and what the stat did can never
   * disagree; the copy substitutes the named subsystem's shortfall into the
   * band's framing template (`economy.supportReadout`), never a number.
   */
  function supportReadoutFor(
    car: CarInstance,
    model: CarModel,
  ): { band: 'strained' | 'dangerous'; copy: string } | null {
    const verdict = supportVerdict(car, model, context.value.partsById, context.value.economy)
    if (verdict.band === 'adequate') return null
    const { shortfallCopy, framingByBand } = context.value.economy.supportReadout
    const copy = framingByBand[verdict.band].replace(
      '{shortfall}',
      shortfallCopy[verdict.subsystem],
    )
    return { band: verdict.band, copy }
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
      groupBands: groupBandsForCar(car),
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
      workBillYen: carCostToMintYen(
        car,
        model,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy,
      ),
      saleRangeYen: {
        lowYen: Math.round(trueValueYen * (1 - tasteSpread)),
        highYen: Math.round(trueValueYen * (1 + tasteSpread)),
      },
      foundationWarning: foundationWarningFor(car, model),
      passionSpendNotice: passionSpendNoticeFor(car, model),
      symptoms: symptomChecklistForCar(car, apparentViewOf(car), model),
      workupGateReason: ownedWorkupGateReasonCore(gameState.value, carId, context.value),
      supportReadout: supportReadoutFor(car, model),
      unpaintedPanelsNote: car.zoneState ? unpaintedPanelsText(car.zoneState) : null,
    }
  }

  /** The benched crew a repair plan should be priced/sized against -
   * the same context the sim's own repair resolvers use,
   * so the store preview and the committed job agree. */
  function crewCtx(): CrewSkillContext {
    return { staff: gameState.value.staff, economy: context.value.economy }
  }

  /**
   * One body-pipeline action's own cost/labour, read straight before the
   * click - the same `planPipelineStage`/`planPaintStage`/`planInstallPanel`/
   * `planRemovePanel` calls the matching immediate resolver in
   * sim/pipelineActions.ts resolves with, so this preview and the real charge
   * can never drift apart. `null` when the car has no zone state, the zone's
   * own prerequisite isn't met yet, the zone already carries (or still lacks)
   * a panel the action assumes the opposite of, or the picked inventory part
   * no longer fits - the button then shows no total rather than a wrong one.
   *
   * Deliberately NOT gated on shelf stock: the button always shows what the
   * work would cost if the shelf can cover it - only the click itself checks
   * that (`resolvePipelineStageAction`/`resolvePipelinePaintAction`,
   * sim/pipelineActions.ts), refusing and logging a `job-blocked` entry if
   * not.
   *
   * `costYen` is always the cash the click will actually charge, which for a
   * materials-consuming stage is 0: the tin was paid for when it was bought,
   * not when it is drawn down. `laborSlots` for `pipeline-install-panel` is
   * already the REAL rate the click will spend - the machine-less multiplier
   * folded in when the body line is neither owned nor hired today
   * (`machineLaborDisclosureFor` below shows the by-hand/with-hire split for
   * the button's secondary line).
   */
  function pipelineActionPlan(
    car: CarInstance,
    action: Extract<
      StagedAction,
      {
        kind:
          'pipeline-stage' | 'pipeline-remove-panel' | 'pipeline-install-panel' | 'pipeline-paint'
      }
    >,
  ): { costYen: number; laborSlots: number } | null {
    if (!car.zoneState) return null
    const zone = car.zoneState[action.zoneId]
    const capability = bodyLineCapability(gameState.value, context.value)
    if (action.kind === 'pipeline-stage') {
      const plan = planPipelineStage(action.stage, zone, capability)
      if (!plan.ok) return null
      return { costYen: 0, laborSlots: context.value.economy.energy.bodyStagePoints[action.stage] }
    }
    if (action.kind === 'pipeline-paint') {
      const plan = planPaintStage(zone, action.colour, capability, action.grade, car.factoryColour)
      if (!plan.ok) return null
      return { costYen: 0, laborSlots: context.value.economy.energy.bodyStagePoints.paint }
    }
    if (action.kind === 'pipeline-remove-panel') {
      if (zone.panelMissing) return null
      return { costYen: 0, laborSlots: context.value.economy.energy.actionPoints.removePart }
    }
    // pipeline-install-panel: needs the zone missing first, and the picked
    // inventory part to still fit this exact zone and fitment class.
    if (!zone.panelMissing) return null
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
    const baseLaborSlots = context.value.economy.energy.energyByClass['bolt-on']
    const group = machineGateGroupFor('bodywork', 'install', context.value)
    return {
      costYen: 0,
      laborSlots: Math.round(
        baseLaborSlots * machineLaborMultiplier(group, gameState.value, context.value),
      ),
    }
  }

  /**
   * The rate-conversion disclosure for a machine-gated
   * operation whose group is neither owned nor hired today - what the click
   * costs by hand, and what hiring the line would bring it down to plus
   * today's fee. `null` when the operation needs no machine at all, or its
   * machine is already owned or hired (the plain labour figure already IS
   * the machine rate - nothing further to say). `baseLaborSlots` is the
   * WITH-MACHINE figure (what `installLaborSlotsFor`/`refitLaborSlotsFor`
   * return); this multiplies it up to the real by-hand cost, the same
   * `machineLaborMultiplier` every gated resolver charges by - never a
   * second formula.
   */
  function machineLaborDisclosureFor(
    group: ComponentId | null,
    baseLaborSlots: number,
  ): MachineLaborDisclosure | null {
    if (!group || hasMachineLineFor(group, gameState.value, context.value)) return null
    return {
      group,
      handLaborSlots: Math.round(
        baseLaborSlots * machineLaborMultiplier(group, gameState.value, context.value),
      ),
      machineLaborSlots: baseLaborSlots,
      hireFeeYen: context.value.economy.machineShopAssist.feeYenByGroup[group],
    }
  }

  /** The disclosure's own two-line copy: "N labour by hand" is the figure the
   * button's cost line reads while the group is machine-less; "M labour with
   * the <line>, ¥F today" is what hiring it would buy back, read underneath.
   * `''` for `null` (nothing gated - the caller falls back to the plain
   * labour figure). */
  function machineLaborDisclosureText(disclosure: MachineLaborDisclosure | null): string {
    if (!disclosure) return ''
    const line = MACHINE_LINE_NAMES[disclosure.group]
    return `${disclosure.handLaborSlots} labour by hand · ${disclosure.machineLaborSlots} with the ${line} line, ${formatYen(disclosure.hireFeeYen)} today`
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

  /** Every auction tier this player may walk into - derived from delivered
   * guarantor missions (`local-yard` always included). `AuctionScreen` reads
   * this to decide which tiers render at all versus the locked-tier copy. */
  const unlockedAuctionTiers = computed<AuctionTier[]>(() =>
    unlockedAuctionTiersCore(gameState.value, context.value),
  )

  /** Every auction room whose doors are open TODAY: unlocked (the guarantor
   * gate) and sitting today (its own hours, `auction.cadenceByTier`,
   * sprint150.md). Two questions kept apart on purpose - cadence says WHEN a
   * room opens, the guarantor gate says WHETHER this player may walk in.
   * More than one room here is normal and wanted, and taking a seat costs no
   * part of the day, so the player may sit at every one of them. */
  const openAuctionTiers = computed<AuctionTier[]>(() =>
    unlockedAuctionTiers.value.filter((tier) =>
      isAuctionTierOpenCore(gameState.value.day, tier, context.value.economy),
    ),
  )

  /** The next day `tier`'s room sits, counting from tomorrow - what the
   * auction screen tells the player about a room that is shut today. */
  function nextOpenDayFor(tier: AuctionTier): number | null {
    return nextOpenDayForTierCore(gameState.value.day + 1, tier, context.value.economy)
  }

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
      workBillYen: carCostToMintYen(
        apparentCar,
        model,
        context.value.partsById,
        context.value.partsTaxonomyById,
        context.value.economy,
      ),
      reserveYen: reserveYen(lot, gameState.value, context.value),
      buyoutPriceYen: computeBuyoutPriceYen(lot, gameState.value, context.value),
      turnout: lot.turnout,
      groupBands: groupBandsForCar(apparentCar),
      auctionGrade: computeAuctionGrade(apparentCar, model, context.value),
      expiresOnDay: lot.expiresOnDay,
      daysLeft: lot.expiresOnDay - gameState.value.day,
      symptoms: symptomChecklistForCar(lot.car, apparentCar, model),
      playerEstimateYen: lot.car.symptoms.some(symptomTested)
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
    return ownsMachineForGroup(group, gameState.value, context.value)
  }

  /** Whether `group`'s daily hire has already been paid today - the "Hired
   * today" chip's own condition. */
  function machineLineHiredToday(group: ComponentId): boolean {
    return machineHiredToday(group, gameState.value)
  }

  /** Whether `group`'s line is usable right now for every operation - owned
   * outright, or hired for today. */
  function machineLineAvailable(group: ComponentId): boolean {
    return hasMachineLineFor(group, gameState.value, context.value)
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

  // --- the rolling road ----------------------------------------------------

  /** Whether the shop owns a dyno outright - the "In-house" chip's own
   * condition, exactly as `machineLineOwned` is for a tool line. */
  const dynoOwned = computed(() => dynoOwnedCore(gameState.value))

  /** Whether a dyno has already been hired in today. */
  const dynoHiredToday = computed(() => dynoHiredTodayCore(gameState.value))

  /** The day's hire fee, and what buying one outright costs. */
  const dynoHireFeeYen = computed(() => context.value.economy.dyno.hireFeeYen)
  const dynoPurchasePriceYen = computed(() => context.value.economy.dyno.purchasePriceYen)

  /** The reputation a purchase needs, shown on the tool wall whether or not
   * it is met - progression bible law 5: every gate is a named real thing. */
  const dynoMinReputationTier = computed(() => context.value.economy.dyno.minReputationTier)

  /** Why buying a dyno is refused right now, `null` when nothing refuses it. */
  const dynoPurchaseGateReason = computed<BuyDynoGateReason | null>(() =>
    buyDynoGateReason(gameState.value, context.value),
  )

  /** Buys the shop its own dyno - shop investment, and the end of the hire
   * fee. Returns false on any refusal (the gate already said why). */
  function buyDyno(): boolean {
    const result = resolveBuyDyno(gameState.value, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'buyDyno',
      payload: { priceYen: loggedYen(result.log, 'dyno-bought') },
    })
    return true
  }

  /** Why putting `carInstanceId` on the rollers is refused right now, `null`
   * when nothing refuses it - the button's proactive "why not" read. */
  function dynoSessionGateReason(carInstanceId: string): DynoSessionGateReason | null {
    return dynoSessionGateReasonCore(
      gameState.value,
      carInstanceId,
      laborSlotsRemainingToday.value,
      context.value,
    )
  }

  /**
   * Runs a dyno session on `carInstanceId` - the day's hire if one is not
   * already owned or paid for, then one labour slot through the same job
   * system every other piece of work spends its labour through. The car
   * itself is untouched; what the session buys is the sheet below.
   */
  function runDynoSession(carInstanceId: string): boolean {
    const result = resolveDynoSession(
      gameState.value,
      carInstanceId,
      laborSlotsRemainingToday.value,
      context.value,
    )
    if (result.laborSlotsUsed === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'runDynoSession', payload: { carInstanceId } })
    return true
  }

  /** The car currently on the rollers, or `null` when the dyno is empty. */
  const dynoSessionCarId = computed(() => dynoSessionCarIdCore(gameState.value))

  /**
   * The dyno sheet for the car on the rollers, or `null` when nothing is on
   * them. Every number is `dynoReadingFor`'s, labelled and ordered here and
   * never recomputed: the support ratios are the sim's, the power is
   * `computeDerivedStats`'s, and the reliability split is the one the stat
   * itself is derived from.
   */
  const dynoSheet = computed<DynoSheetView | null>(() => {
    const carId = dynoSessionCarId.value
    if (!carId) return null
    const car = findWorkableCar(carId)
    if (!car) return null
    const model = context.value.modelsById[car.modelId]
    if (!model) return null
    const reading = dynoReadingFor(
      car,
      model,
      context.value.partsById,
      context.value.partsTaxonomy,
      context.value.economy,
    )
    const readout = supportReadoutFor(car, model)
    return {
      carId,
      displayName: resolveCarDisplayName(model),
      engineCharacterLabel: ENGINE_CHARACTER_LABELS[reading.engineCharacter],
      engineCharacterNote: ENGINE_CHARACTER_NOTES[reading.engineCharacter],
      specificOutputPsPerLitre: reading.specificOutputPsPerLitre,
      displacementCc: reading.displacementCc,
      effectiveDisplacementCc: reading.effectiveDisplacementCc,
      rotaryEquivalent: reading.rotaryEquivalent,
      stockPowerPs: reading.stockPowerPs,
      powerPs: reading.powerPs,
      powerDeltaPs: reading.powerPs - reading.stockPowerPs,
      rows: SubsystemSchema.options.map((subsystem) => ({
        subsystem,
        label: SUBSYSTEM_LABELS[subsystem],
        meaning: SUBSYSTEM_MEANINGS[subsystem],
        ratio: reading.ratios[subsystem],
        weakest: subsystem === reading.verdict.subsystem,
      })),
      headlineRatio: reading.verdict.headline,
      headlineBandLabel: SUPPORT_BAND_LABELS[reading.verdict.band],
      band: reading.verdict.band,
      shortfallCopy: readout?.copy ?? null,
      // The stat itself, straight off `computeDerivedStats`, so the sheet and
      // the radar chart can never show two different numbers.
      reliability: reading.reliabilityStat,
      reliabilityBase: reading.reliability.base,
      // Rounded together rather than one at a time, so the three losses and
      // the stat always account for the whole base.
      ...displayedReliabilitySplit(reading),
    }
  })

  // --- the machine shop ----------------------------------------------------

  /**
   * Why machining `operationId` onto the loose part `partInstanceId` is
   * refused right now, `null` when nothing refuses it - the button's proactive
   * "why not" read, and the same predicate the resolver enforces after the
   * click.
   */
  function machiningGateReason(
    partInstanceId: string,
    operationId: string,
  ): MachiningGateReason | null {
    return machiningGateReasonCore(gameState.value, partInstanceId, operationId, context.value)
  }

  /**
   * Machines `operationId` onto the loose part `partInstanceId` - as much of
   * today's remaining labour as the operation takes, through the same job
   * system every other piece of work spends its labour through, so an
   * operation that outruns today's pool carries over to tomorrow. The
   * operation lands on the part only once the job finishes, and travels with
   * it onto whatever car it is fitted to.
   */
  function machinePart(partInstanceId: string, operationId: string): boolean {
    const result = resolveMachiningLabor(
      gameState.value,
      partInstanceId,
      operationId,
      laborSlotsRemainingToday.value,
      context.value,
    )
    if (result.laborSlotsUsed === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'machinePart', payload: { partInstanceId, operationId } })
    return true
  }

  /**
   * The machine shop's sheet for the part on the machine, or `null` when the
   * machine is empty. Every figure is `machiningReadingFor`'s and none is
   * recomputed here.
   */
  const machineShopSheet = computed<MachiningReading | null>(() =>
    machiningReadingFor(gameState.value, context.value),
  )

  // --- setup work, done on the car -----------------------------------------

  /**
   * Every setup operation one of the car's own slots offers - the two jobs
   * that can only be judged with the car assembled, so they never appear in
   * the machine shop. Empty for every other slot.
   */
  function fittedMachiningOffers(
    carId: string,
    carPartId: CarPartId,
  ): readonly FittedMachiningOfferRow[] {
    return fittedMachiningOffersFor(gameState.value, carId, carPartId, context.value)
  }

  /**
   * Why setting `operationId` up on this car is refused right now, `null` when
   * nothing refuses it - the button's proactive "why not" read, and the same
   * predicate the resolver enforces after the click.
   */
  function fittedMachiningGateReason(
    carId: string,
    operationId: string,
  ): FittedMachiningGateReason | null {
    return fittedMachiningGateReasonCore(gameState.value, carId, operationId, context.value)
  }

  /**
   * Sets `operationId` up on the car, spending as much of today's remaining
   * labour as it takes through the same job system every other piece of work
   * uses. The operation lands on the part fitted in its own slot once the job
   * finishes, and stays with that part if it later comes off.
   */
  function machineFittedPart(carId: string, operationId: string): boolean {
    const result = resolveFittedMachiningLabor(
      gameState.value,
      carId,
      operationId,
      laborSlotsRemainingToday.value,
      context.value,
    )
    if (result.laborSlotsUsed === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'machineFittedPart', payload: { carId, operationId } })
    return true
  }

  // --- the two work stations -----------------------------------------------

  /**
   * The part on `station` paired with its catalogue entry, or `null` when the
   * station is clear (or holds a part the catalogue cannot resolve) - what the
   * workshop floor and the machine shop each open on.
   */
  function stationPart(station: WorkStation): StageablePartView | null {
    const partInstanceId = partIdOnStation(gameState.value, station)
    if (!partInstanceId) return null
    const instance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    const part = instance ? context.value.partsById[instance.partId] : undefined
    return instance && part ? { instance, part } : null
  }

  /**
   * Every warehouse part that can be carried to `station` right now - the
   * room's own fetch-it-out-of-the-warehouse picker, reading the sim's gate
   * (`placeOnStationGateReason`) rather than a second eligibility rule. A part
   * on the OTHER station is not on this list: it has to be taken back first.
   */
  function partsForStation(station: WorkStation): StageablePartView[] {
    const entries: StageablePartView[] = []
    for (const instance of gameState.value.partInventory) {
      if (placeOnStationGateReason(gameState.value, station, instance.id) !== null) continue
      const part = context.value.partsById[instance.partId]
      if (part) entries.push({ instance, part })
    }
    return entries
  }

  /**
   * Carry one warehouse part to `station`. Free and instant - no labour, no
   * cash, no day passes - because the cost is the walk rather than a number.
   * Returns false on a refusal, which changes nothing.
   */
  function placeOnStation(station: WorkStation, partInstanceId: string): boolean {
    if (placeOnStationGateReason(gameState.value, station, partInstanceId) !== null) return false
    gameState.value = resolvePlaceOnStation(gameState.value, station, partInstanceId)
    logSessionEvent({ type: 'placeOnStation', payload: { station, partInstanceId } })
    return true
  }

  /** Carry whatever is on `station` back to the warehouse - the mirror of
   * `placeOnStation`, and free in the same way. False when the station is
   * already clear. */
  function takeFromStation(station: WorkStation): boolean {
    if (partIdOnStation(gameState.value, station) === null) return false
    gameState.value = resolveTakeFromStation(gameState.value, station)
    logSessionEvent({ type: 'takeFromStation', payload: { station } })
    return true
  }

  /** Which station `partInstanceId` is out on, or `null` when it is sitting in
   * the warehouse - the whereabouts marker the inventory list shows, so a part
   * that is being worked on can still be found. */
  function stationForPart(partInstanceId: string): WorkStation | null {
    return stationHoldingPart(gameState.value, partInstanceId)
  }

  /**
   * The legibility caption for the part on the bench when the group's own
   * tools cannot finish it past fine, naming the tier-2 machine that reaches
   * mint - the loose-part twin of `repairCeilingCaption`'s on-car caption, and
   * sharing its one sentence. Null from tier 2 up, for a part already at mint,
   * and for one no repair can touch (scrap, or a replace-only consumable).
   */
  function benchRepairCeilingCaption(partInstanceId: string): string | null {
    const instance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    const part = instance ? context.value.partsById[instance.partId] : undefined
    const entry = part ? context.value.partsTaxonomyById[part.carPartId] : undefined
    if (!instance || !entry) return null
    if (!canRepair(instance.band, entry) || bandIndex(instance.band) >= bandIndex('mint'))
      return null
    return repairCeilingSentence(entry.group)
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'beginInspectionVisit', payload: { tier } })
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
    logSessionEvent({ type: 'runDiagnosticTest', payload: { lotId, symptomIndex, testId } })
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'resolveOwnedWorkup', payload: { carInstanceId } })
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
    logSessionEvent({ type: 'resolveSendInspector', payload: { lotId } })
    return true
  }

  /**
   * Parts in inventory that fit an EMPTY slot within the given group AND that
   * the shop's tool lines can actually fit today
   * (`partCapabilityRequirement`) - a group-level install still resolves
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
      if (!part) return false
      if (!partFitsCar(part, model, componentId, context.value.partsTaxonomyById)) return false
      return partCapabilityRequirement(part, car, gameState.value, context.value) === null
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
   *
   * A part the shop's tool lines cannot fit today
   * (`partCapabilityRequirement`) is excluded here too, so the click path and
   * the drag path refuse the same set the sim would; the picker still SHOWS
   * such a part, named with the tool it wants
   * (`installToolGateReasonFor` below).
   */
  function installablePartsForPart(carId: string, carPartId: CarPartId): PartInstance[] {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    const componentId = groupForCarPart(carPartId)
    if (!car || !model || !componentId) return []
    // A shell carrier's slot is never empty and its identity changes by
    // replacement (`replacesOccupiedSlot`, sim/jobs.ts), so it keeps offering
    // candidates while it is occupied; every other slot must be empty first.
    if (car.parts[carPartId].installed && !replacesOccupiedSlot(carPartId, context.value)) return []
    return gameState.value.partInventory.filter((pi) => {
      if (pi.band === 'scrap') return false
      if (!isPartAvailableFor(pi, carId)) return false
      const part = context.value.partsById[pi.partId]
      if (!part) return false
      if (!partFitsCar(part, model, componentId, context.value.partsTaxonomyById, carPartId)) {
        return false
      }
      return partCapabilityRequirement(part, car, gameState.value, context.value) === null
    })
  }

  /**
   * What a tool requirement is called on the shop floor: the line's own rung
   * at that level, or the shop covering the line when the rungs do not reach
   * that high. A line carries two rungs and the shop sits above them, so a
   * requirement for level 3 always names a shop and never a tier number.
   */
  function toolRequirementName(requirement: ToolRequirement): string {
    const rung = context.value.toolLines[requirement.group].tiers[requirement.level - 1]
    return rung ? rung.displayName : toolShopForGroup(requirement.group, context.value).displayName
  }

  /**
   * The tool this catalogue part wants before it could go onto this car,
   * named, or `null` when the shop can already fit it. Reads the sim's own
   * install gate (`partCapabilityRequirement`), so the picker, the parts
   * market and the sim can never disagree about which parts are reachable.
   *
   * A part that will never fit this car (wrong slot, wrong platform, wrong
   * class) returns `null` too: no tool changes that, and naming one would
   * advertise a shop that would not help.
   */
  function installToolGateReasonFor(carId: string, partId: string): string | null {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    const part = context.value.partsById[partId]
    const componentId = part ? groupForCarPart(part.carPartId) : undefined
    if (!car || !model || !part || !componentId) return null
    const fits = partFitsCar(
      part,
      model,
      componentId,
      context.value.partsTaxonomyById,
      part.carPartId,
    )
    if (!fits) return null
    const requirement = partCapabilityRequirement(part, car, gameState.value, context.value)
    return requirement ? `Needs ${toolRequirementName(requirement)}` : null
  }

  /**
   * The human-readable reason `removePart`
   * would refuse this slot right now, or `null` when nothing structural
   * blocks it (it may still refuse for insufficient labor - the labor bar
   * already shows that separately, and `removeMachineNoteFor` below shows a
   * machine-gated slot's by-hand labour). Mirrors `installBlockedReason`'s
   * own reuse shape, over the sim's `removeBlockReason` predicate. A machine
   * gate is no longer a structural block at all: every
   * removal stays possible at tier 1, just slower by hand.
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
    }
  }

  /** The Remove button's own machine-labour disclosure, or `''` when the
   * slot isn't machine-gated (or the machine is already owned/hired) - the
   * flat remove-part figure, by hand vs with the line, in the same words
   * `installMachineNoteFor` uses. */
  function removeMachineNoteFor(carId: string, carPartId: CarPartId): string {
    const group = machineGateGroupFor(carPartId, 'remove', context.value)
    return machineLaborDisclosureText(
      machineLaborDisclosureFor(group, context.value.economy.energy.actionPoints.removePart),
    )
  }

  /**
   * The INSTALL/REPLACE affordance's own machine-labour disclosure for
   * `carPartId`, or `''` when it isn't machine-gated (or the machine is
   * already owned/hired). Every install/replace gate is a rate rather than a
   * refusal: this names the by-hand cost and what
   * hiring the line would buy back instead of disabling anything.
   */
  function installMachineNoteFor(carId: string, carPartId: CarPartId): string {
    const car = findWorkableCar(carId)
    if (!car) return ''
    const group = machineGateGroupFor(carPartId, 'install', context.value)
    return machineLaborDisclosureText(
      machineLaborDisclosureFor(group, installLaborSlotsFor(carPartId, context.value)),
    )
  }

  /**
   * The on-car per-part REPAIR affordance's own machine-labour disclosure for
   * `carPartId`, or `''` when nothing gates it. Per-part repair is bench-only
   * for every removable slot (the sim refuses it before this ever matters),
   * so this only ever fires for a fixed body carrier - and `bodywork`/`paint`
   * are derived value carriers with no on-car repair affordance at all
   * (`bodyPipeline.ts`), which leaves the chassis. A removable signature slot
   * (seats, dashGauges, dampers, springs) is repaired at the bench, and its
   * own machine line shows its note when the repaired part goes back on
   * (`installMachineNoteFor`). Engine/drivetrain repair is never gated, so
   * this is `''` for them too.
   */
  function repairMachineNoteFor(carId: string, carPartId: CarPartId): string {
    const car = findWorkableCar(carId)
    if (!car) return ''
    if (car.zoneState && isBodyDerivedPart(carPartId)) return ''
    if (context.value.partsTaxonomyById[carPartId]?.removable !== false) return ''
    return installMachineNoteFor(carId, carPartId)
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

  /**
   * The forecourt counterpart to `serviceBaysView`/`parkingView` above - same
   * shape, but every occupant is, by construction, a car currently listed on
   * a `requiresForecourt` channel (`resolveSetForSale`, sprint148.md). Read
   * only: `GarageScreen.vue` renders it without any drag/drop affordance,
   * since a car reaches the forecourt exclusively by being listed.
   */
  const forecourtView = computed<(ShopCarView | null)[]>(() =>
    gameState.value.forecourtCarIds.map((id) => (id ? (shopCarView(id) ?? null) : null)),
  )

  const parkingCapacity = computed(() => gameState.value.parkingBayCount)
  const parkingOccupancyCount = computed(() => parkingOccupancy(gameState.value))
  const parkingFull = computed(() => !hasParkingSpace(gameState.value))
  const serviceBayCount = computed(() => gameState.value.serviceBayCount)
  const serviceBayFreeCount = computed(
    () => gameState.value.serviceBayCarIds.filter((id) => id === null).length,
  )
  const forecourtCapacity = computed(() => gameState.value.forecourtBayCount)
  const forecourtOccupancyCount = computed(() => forecourtOccupancy(gameState.value))
  const hasForecourtSpace = computed(() => hasForecourtSpaceCore(gameState.value))
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
   * Why listing `carId` on `channelId` would be refused right now for want
   * of forecourt space, or `null` when it wouldn't - the forecourt half of
   * `CarDetailScreen.vue`'s existing disabled-reason idiom
   * (`channelDisabledReason`, which covers the cash half itself). A channel
   * that doesn't need a forecourt (the trade network), or a car already
   * sitting on one (switching between two forecourt channels keeps the same
   * slot), is never blocked here.
   */
  /**
   * The listing channels open to this career right now, in the picker's own
   * display order. A channel a story mission has yet to open simply is not in
   * the list: the picker growing a new row when someone puts your name
   * forward is the whole of how the player learns it happened (progression
   * bible Law 4 - the shop changes, nothing announces it).
   */
  const availableSellingChannelIds = computed<SellingChannelId[]>(() =>
    SELLING_CHANNEL_ORDER.filter((id) =>
      isSellingChannelUnlocked(gameState.value, context.value, id),
    ),
  )

  function forecourtBlockedReason(carId: string, channelId: SellingChannelId): string | null {
    if (!context.value.economy.sellingChannels[channelId].requiresForecourt) return null
    if (gameState.value.forecourtCarIds.includes(carId)) return null
    if (hasForecourtSpace.value) return null
    return 'No forecourt space free - every slot already has a car on show'
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'moveCar', payload: { carId, to } })
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
    pushDayLog([{ type: 'cars-swapped', serviceCarId, parkingCarId }])
    logSessionEvent({ type: 'swapCars', payload: { serviceCarId, parkingCarId } })
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
    pushDayLog([{ type: 'car-moved', carInstanceId: carId, to }])
    logSessionEvent({ type: 'moveCarToSlot', payload: { carId, to, slotIndex } })
    return true
  }

  /**
   * Buy the next bay of this kind - instant, usable the same day. Returns
   * false if already at the max count or unaffordable.
   */
  function buyBay(kind: BayKind): boolean {
    const result = applyBayPurchase(
      gameState.value,
      kind,
      context.value.facilities,
      context.value.economy,
    )
    if (!result.applied) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'buyBay',
      payload: { kind, priceYen: loggedYen(result.log, 'bay-purchased') },
    })
    return true
  }

  // --- tool lines ---

  /** The six tool-line ladders with their current/next tier and reputation gate,
   * for the Upgrades screen. */
  const toolLineViews = computed<ToolLineView[]>(() =>
    REAL_COMPONENT_GROUPS.map((componentId) => {
      const line = context.value.toolLines[componentId]
      const currentTier = gameState.value.toolTiers[componentId]
      const nextTier = line.tiers[currentTier]
      return {
        componentId,
        componentLabel: componentLabel(componentId),
        currentTier,
        currentTierName: line.tiers[currentTier - 1]!.displayName,
        nextTierName: nextTier?.displayName ?? null,
        nextTierPriceYen: nextTier?.upgradePriceYen ?? null,
        nextTierRepGate: nextToolTierRepGate(gameState.value, componentId, context.value),
        maxed: currentTier >= line.tiers.length,
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
    const daysLeft = Math.max(0, listing.expiresOnDay - gameState.value.day)
    if (listing.kind === 'tool-shop') {
      const shop = context.value.toolShopsById[listing.shopId]
      return {
        kind: 'tool-shop',
        componentLabel: (shop?.covers ?? []).map(componentLabel).join(', '),
        tier: null,
        displayName: shop?.displayName ?? listing.shopId,
        priceYen: listing.priceYen,
        daysLeft,
      }
    }
    return {
      kind: 'tool-tier',
      componentLabel: componentLabel(listing.componentId),
      tier: listing.tier,
      displayName:
        context.value.toolLines[listing.componentId].tiers[listing.tier - 1]!.displayName,
      priceYen: listing.priceYen,
      daysLeft,
    }
  })

  /** The three shops at the top of the ladder, with what each covers and
   * whether it can be bought right now - the shop twin of `toolLineViews`. */
  const toolShopViews = computed<ToolShopView[]>(() =>
    context.value.toolShops.map((shop) => ({
      id: shop.id,
      displayName: shop.displayName,
      coversLabels: shop.covers.map(componentLabel),
      covers: [...shop.covers],
      owned: gameState.value.toolShopsOwned.includes(shop.id),
      priceYen: shop.upgradePriceYen,
      repGate: toolShopRepGate(gameState.value, shop),
      isListed: isToolShopListed(gameState.value, shop.id),
    })),
  )

  /**
   * What owning `shopId` unlocks, derived live from the real catalogue: the
   * job templates every line it covers would reach at level 3, the NA-to-turbo
   * ceiling when it covers the engine line, and the repair speed level 3 buys.
   */
  function toolShopInfo(shopId: string): ToolTierInfo {
    const shop = context.value.toolShopsById[shopId]
    const covers = shop?.covers ?? []
    const unlocksJobTemplateNames = SERVICE_JOB_TYPES.filter((template) =>
      template.tasks.some((task) => {
        const group = context.value.partsTaxonomyById[task.requirement.carPartId]?.group
        return group !== undefined && covers.includes(group) && task.minToolTier === 3
      }),
    ).map((template) => humanizeTemplateId(template.id))
    return {
      unlocksJobTemplateNames,
      unlocksNaToTurboConversion:
        covers.includes('engine') &&
        context.value.economy.toolCeilings.naToTurboConversionEngineTier === 3,
      laborSlotsPerGradeText: `Repair work costs ${context.value.economy.energy.energyPerBandStepByToolTier[3]} labour per grade on the lines it covers`,
      rentalFeeText: null,
    }
  }

  /**
   * Buy one shop outright - instant, usable the same day, and refused (false,
   * nothing spent) when reputation, cash or the classifieds do not allow it.
   * The rung purchase's twin (`upgradeToolLine`).
   */
  function buyToolShop(shopId: string): boolean {
    const result = applyToolShopPurchase(gameState.value, shopId, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'buyToolShop',
      payload: { shopId, priceYen: loggedYen(result.log, 'tool-shop-purchased') },
    })
    return true
  }

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

  /**
   * The shop's standing in every buyer scene - the dev console's own quick
   * readout, and what `standingView.scenes` below builds its player-facing
   * rows from. `label` reads a representative buyer's own `displayName` for
   * that archetype rather than the raw scene id.
   */
  const sceneStandingView = computed<
    { scene: BuyerArchetype; label: string; stage: SceneStandingStage }[]
  >(() =>
    BuyerArchetypeSchema.options.map((scene) => ({
      scene,
      label: BUYERS.find((b) => b.archetype === scene)?.displayName ?? scene,
      stage: gameState.value.sceneStanding[scene],
    })),
  )

  /**
   * The Standing screen's whole payload - granular reputation (points + the
   * named next tier) and every scene's ledger row. Pure derivation, no new
   * state.
   */
  const standingView = computed<StandingView>(() => {
    const points = gameState.value.reputationPoints
    const orderedTiers = (
      Object.entries(context.value.economy.reputation.tierThresholds) as [ReputationTier, number][]
    ).sort((a, b) => a[1] - b[1])
    const nextEntry = orderedTiers.find(([, threshold]) => threshold > points)
    const ledger = sceneLedgerFor(gameState.value)
    const commissionBoard = sceneCommissionsFor(gameState.value)
    const scenes: StandingSceneRowView[] = sceneStandingView.value.map((row) => {
      const commission = commissionBoard[row.scene]
      const operation = context.value.economy.machining.operations.find(
        (o) => o.scene === row.scene,
      )
      return {
        scene: row.scene,
        label: row.label,
        stage: row.stage,
        stageCopy: SCENE_STANDING_STAGE_COPY[row.stage],
        cars: [...ledger[row.scene]]
          .sort((a, b) => b.day - a.day)
          .map((entry) => ({
            carInstanceId: entry.carInstanceId,
            carLabel: (() => {
              const model = context.value.modelsById[entry.modelId]
              return model ? resolveCarDisplayName(model) : entry.modelId
            })(),
            priceYen: entry.priceYen,
            day: entry.day,
          })),
        commission: commission
          ? {
              customerName: commission.customerName,
              requestCopy: commission.requestCopy,
              status: commission.status,
            }
          : null,
        operation: operation
          ? {
              id: operation.id,
              displayName: operation.displayName,
              description: operation.description,
              gateReason: craftOperationCapabilityGateReason(
                operation,
                toolLevels.value,
                context.value,
              ),
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
      scenes,
    }
  })

  /**
   * The cost sheet's whole payload: every week the shop has moved money in,
   * newest first, straight off `financeLedger`. A pure derivation with no
   * state of its own - the sheet screen renders this and nothing else, and
   * opening it changes nothing. Weeks are read back through `weekIndex`, the
   * only week arithmetic there is; the current week is marked open so its
   * running total is never read as a closed result.
   */
  const costSheetView = computed<CostSheetView>(() => {
    const ledger = gameState.value.financeLedger ?? {}
    const daysPerWeek = context.value.economy.calendar.daysPerWeek
    const currentWeek = weekIndex(gameState.value.day, context.value.economy)
    return {
      weeks: Object.entries(ledger)
        .map(([key, week]) => {
          const weekNumber = Number(key)
          return {
            weekNumber,
            firstDay: (weekNumber - 1) * daysPerWeek + 1,
            lastDay: weekNumber * daysPerWeek,
            open: weekNumber >= currentWeek,
            ...week,
            netYen: netCashYen(week),
          }
        })
        .sort((a, b) => b.weekNumber - a.weekNumber),
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'upgradeToolLine',
      payload: { componentId, priceYen: loggedYen(result.log, 'tool-upgraded') },
    })
    return true
  }

  // --- instant actions ---

  /**
   * Repair a group (or one specific part within it when
   * `carPartId` is given - the drill-down's own per-part Repair row) -
   * instant, targeting `targetBand` (mint by default, the plain "Repair"
   * button's behavior). Finds the car's already-open repair job for this exact
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
      toolLevels.value,
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
    // An empty plan is not short-circuited here: `repairJobGate` is the one
    // authority on whether there is anything to repair, and it answers with a
    // reason the screen can show rather than a silent no-op.
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'repair',
      payload: {
        carId,
        componentId,
        targetBand,
        carPartId,
        costYen: loggedYen(result.log, 'job-created'),
        laborSlotsUsed: result.laborSlotsUsed,
      },
    })
  }

  /**
   * Install an owned part into an empty component - instant, same
   * continuation rule as `repair`. `carPartId`, when given,
   * addresses one specific slot (the drill-down's own per-part Replace row)
   * rather than "whichever slot in the group the part's own address
   * resolves to." Free when it matches the slot's own vacated baseline
   * (putting the car back the way it was found) - see `isFreeInstallRefit`.
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'install',
      payload: {
        carId,
        componentId,
        partInstanceId,
        carPartId,
        laborSlotsUsed: result.laborSlotsUsed,
      },
    })
  }

  /** Every owned part, paired with its catalog entry - the pick list for an
   * install, shared by the standalone inventory screen and the panel
   * embedded on a car's detail screen (both show the exact same set: every
   * click resolves instantly, so there is nothing to reserve against a
   * different pick elsewhere). */
  const pickableParts = computed<StageablePartView[]>(() => {
    const entries: StageablePartView[] = []
    for (const instance of gameState.value.partInventory) {
      const part = context.value.partsById[instance.partId]
      if (part) entries.push({ instance, part })
    }
    return entries
  })

  /**
   * One body-pipeline generic stage (strip/prep, beat, weld, fill-and-sand,
   * prime, or polish) on one zone - instant, resolving against today's
   * remaining labour through `resolvePipelineStageAction`
   * (sim/pipelineActions.ts). A refused stage (a prerequisite unmet, weld
   * without the body line, an empty shelf) is a no-op beyond whatever
   * `job-blocked` entry it logs.
   */
  function pipelineStage(
    carId: string,
    zoneId: ZoneId,
    stage: Exclude<PipelineStageId, 'paint'>,
  ): void {
    const result = resolvePipelineStageAction(
      gameState.value,
      carId,
      { kind: 'pipeline-stage', stage, zoneId },
      context.value,
      laborSlotsRemainingToday.value,
    )
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'pipelineStage',
      payload: { carId, zoneId, stage, laborSlotsUsed: result.laborSlotsUsed },
    })
  }

  /**
   * The paint stage on one zone - instant, resolving through
   * `resolvePipelinePaintAction`. Needs the zone primed first; refuses
   * silently (or logs `job-blocked` on a short shelf) otherwise.
   */
  function paintZone(carId: string, zoneId: ZoneId, colour: string, grade: Grade): void {
    const result = resolvePipelinePaintAction(
      gameState.value,
      carId,
      { kind: 'pipeline-paint', zoneId, colour, grade },
      context.value,
      laborSlotsRemainingToday.value,
    )
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'pipelinePaint',
      payload: { carId, zoneId, colour, grade, laborSlotsUsed: result.laborSlotsUsed },
    })
  }

  /**
   * Pulls one zone's panel onto the shelf - instant, resolving through
   * `resolvePipelineRemovePanelAction`. A no-op on an already-missing zone.
   */
  function removePanel(carId: string, zoneId: ZoneId): void {
    const result = resolvePipelineRemovePanelAction(
      gameState.value,
      carId,
      { kind: 'pipeline-remove-panel', zoneId },
      context.value,
      laborSlotsRemainingToday.value,
    )
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'removePanel',
      payload: { carId, zoneId, laborSlotsUsed: result.laborSlotsUsed },
    })
  }

  /**
   * Fits an inventory panel `PartInstance` onto one zone - instant, resolving
   * through `resolvePipelineInstallPanelAction`. Needs the zone missing
   * first; refuses silently (or logs `job-blocked` on a capability gate)
   * otherwise.
   */
  function installPanel(carId: string, zoneId: ZoneId, partInstanceId: string): void {
    const result = resolvePipelineInstallPanelAction(
      gameState.value,
      carId,
      { kind: 'pipeline-install-panel', zoneId, partInstanceId },
      context.value,
      laborSlotsRemainingToday.value,
    )
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'installPanel',
      payload: { carId, zoneId, partInstanceId, laborSlotsUsed: result.laborSlotsUsed },
    })
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'removePart', payload: { carId, carPartId } })
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
   * Remove a whole assembly to the bench - labour is every installed member's
   * own removal charge (`removeAssemblyLaborSlotsFor`), gated on the
   * engine/gearbox assembly's own line owned or hired for the day. Mirrors
   * `removePart`'s apply pattern; a no-op (returns false) on any refusal
   * (`resolveRemoveAssembly.ok === false`), including the machine gate and
   * insufficient labour left today.
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'removeAssembly', payload: { carId, assemblyId } })
    return true
  }

  /**
   * Refit a benched assembly back onto its source car -
   * free per member equal to its vacated baseline, charged install labour for a
   * changed member, gated on the same machinery removal needed. A no-op if
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
    // A refusal that names its reason still reports it - the capability gate
    // is the one that does, and a silently dropped log would leave the player
    // with a button that does nothing.
    pushDayLog(result.log)
    if (!result.ok) return false
    gameState.value = result.state
    logSessionEvent({ type: 'refitAssembly', payload: { carId, assemblyId } })
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
    // As in `refitAssembly` above: a refusal carrying a reason reports it.
    pushDayLog(result.log)
    if (!result.ok) return false
    gameState.value = result.state
    logSessionEvent({
      type: 'swapAssemblyMember',
      payload: { containerId, memberSlot, partInstanceId },
    })
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'removeAssemblyMember', payload: { containerId, memberSlot } })
    return true
  }

  /** An assembly's player-facing display name ("Wheels & tyres"), from
   * content - the assembly twin of `carPartLabel`/`componentLabel`. */
  function assemblyLabel(assemblyId: AssemblyId): string {
    return context.value.assembliesById[assemblyId]?.displayName ?? assemblyId
  }

  /** The reason a row's own action is short of today's labour - the same
   * "needs X, only Y left" voice the auction/inspection screens already use
   * for their own time-budget refusals. */
  function assemblyLabourShortfallCopy(pointsNeeded: number, laborRemaining: number): string {
    return `Needs ${pointsNeeded} labour, only ${laborRemaining} left today`
  }

  /**
   * Every assembly's car-level row for one workable car - whether it is on
   * the bench, whether it can be removed or refitted right now, and a plain
   * "why not" when an external blocker, the assembly's own machinery, or
   * today's labour is in the way. Empty for an unknown car.
   *
   * `canRefit`/`canRemove` gate on labour as well as structure: both ops are
   * atomic (`resolveRefitAssembly`/`resolveRemoveAssembly` refuse outright
   * over budget rather than partially completing), so a button that ignored
   * labour would enable, refuse silently on click, and look broken - exactly
   * the bug this reads the sim's own `laborSlotsRequired` to close.
   */
  function assemblyRowsFor(carId: string): AssemblyRowView[] {
    const car = findWorkableCar(carId)
    if (!car) return []
    return context.value.assemblies.map((def) => {
      const container = assemblyContainerFor(gameState.value, carId, def.id)
      const onBench = !!container
      const occupiedBlockers = externalBlockersFor(def, context.value).filter(
        (b) => car.parts[b].installed !== null,
      )
      const structurallyBlocked = occupiedBlockers.length > 0
      const gateGroup = assemblyMachineGateGroup(def, context.value)
      const machineMultiplier = machineLaborMultiplier(gateGroup, gameState.value, context.value)
      const hasSomethingToRemove = def.members.some((m) => car.parts[m].installed !== null)
      // The real rate this op will charge - the base figure at the
      // machine-less multiplier when the group is neither owned nor hired
      // today, matching `resolveRemoveAssembly`/`resolveRefitAssembly` exactly
      // (a gate is a rate, never a wall).
      const removeLabourPoints = Math.round(
        removeAssemblyLaborSlotsFor(car, def, context.value) * machineMultiplier,
      )
      const refitLabourPoints = container
        ? Math.round(
            refitAssemblyLaborSlotsFor(car, def, container, context.value) * machineMultiplier,
          )
        : 0
      // Whichever action this row would actually run - refit on the bench,
      // remove otherwise - is the one whose labour figure matters here.
      const relevantLabourPoints = onBench ? refitLabourPoints : removeLabourPoints
      const laborShort = relevantLabourPoints > laborSlotsRemainingToday.value
      return {
        assemblyId: def.id,
        displayName: def.displayName,
        group: def.group,
        onBench,
        canRefit: onBench && !structurallyBlocked && !laborShort,
        canRemove: !onBench && hasSomethingToRemove && !structurallyBlocked && !laborShort,
        removeLabourPoints,
        refitLabourPoints,
        blockedReason: structurallyBlocked
          ? `Take off ${occupiedBlockers.map((b) => carPartLabel(b)).join(', ')} first`
          : laborShort && (onBench || hasSomethingToRemove)
            ? assemblyLabourShortfallCopy(relevantLabourPoints, laborSlotsRemainingToday.value)
            : null,
        machineNote: machineLaborDisclosureText(
          machineLaborDisclosureFor(
            gateGroup,
            onBench
              ? container
                ? refitAssemblyLaborSlotsFor(car, def, container, context.value)
                : 0
              : removeAssemblyLaborSlotsFor(car, def, context.value),
          ),
        ),
      }
    })
  }

  /**
   * The machine-labour disclosure fitting a part into `carPartId`'s bench
   * slot carries right now (only ever the wheels line, for the `tyres`
   * member), or `''` when nothing gates it (or the machine is already
   * owned/hired). Shared by `benchContainersFor`'s own caption and
   * `ReplaceDrawer`'s bench-mode picker, so both read the same figure.
   * A bench swap is never refused for want of the machine, only
   * slower by hand.
   */
  function benchSwapMachineNoteFor(carPartId: CarPartId): string {
    const group = machineGateGroupFor(carPartId, 'bench-fit', context.value)
    return machineLaborDisclosureText(
      machineLaborDisclosureFor(group, context.value.economy.energy.actionPoints.benchFitMember),
    )
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
              swapGateReason: benchSwapMachineNoteFor(carPartId),
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'scrapPart',
      payload: { partInstanceId, priceYen: loggedYen(result.log, 'part-scrapped') },
    })
    return true
  }

  /**
   * The yen a
   * non-scrap `PartInstance` would fetch sold used right now - the "Sell"
   * button's own price tag, reading the same `machinedPartPriceYen` basis
   * `resolveSellPart` (sim/parts.ts) pays out on, so a machined part is quoted
   * at a machined part's money rather than a plain one's. Returns 0 for an
   * unknown instance or a scrap one (that's `scrapValueForPart`'s route
   * instead).
   */
  function sellValueForPart(partInstanceId: string): number {
    const instance = gameState.value.partInventory.find((p) => p.id === partInstanceId)
    if (!instance || instance.band === 'scrap') return 0
    const part = context.value.partsById[instance.partId]
    if (!part) return 0
    return usedPartSaleValueYen(
      machinedPartPriceYen(instance, part, context.value.economy),
      instance.band,
      context.value.economy,
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'sellPart',
      payload: { partInstanceId, priceYen: loggedYen(result.log, 'part-sold') },
    })
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'reconditionPart', payload: { partInstanceId, targetBand } })
  }

  /** Buy out a lot instantly - guaranteed purchase at a premium, no rival contest. */
  function buyout(lotId: string): boolean {
    const result = resolveBuyoutInstant(gameState.value, lotId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'buyout',
      payload: { lotId, priceYen: loggedYen(result.log, 'lot-bought-out') },
    })
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'attendAuction',
      payload: { tier, feeYen: loggedYen(result.log, 'auction-attended') },
    })
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'hireMachineLine',
      payload: { group, feeYen: loggedYen(result.log, 'machine-hired') },
    })
    return true
  }

  // --- the cafe across the street ------------------------------------------

  /** What a round costs today: the base price plus one more for every member
   * of the crew, because you are buying for the whole shop. */
  const coffeePriceYen = computed(() => coffeePriceYenCore(gameState.value, context.value))

  /** Why the cafe would refuse a round right now, or null when it would not -
   * the map reads this to say WHY rather than just failing silently. */
  const coffeeGateReason = computed(() => buyCoffeeGateReasonCore(gameState.value, context.value))

  /**
   * Buys the crew a round: cash out, labour back, the same day. Returns false
   * on any refusal (already bought today, nothing spent to buy back, or not
   * enough cash) and changes nothing, the same shape `hireMachineLine` uses.
   */
  function buyCoffee(): boolean {
    const result = resolveBuyCoffee(gameState.value, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'buyCoffee', payload: { priceYen: coffeePriceYen.value } })
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
    pushDayLog(result.log)
    logSessionEvent({ type: 'settleAuctionHammer', payload: { lotId, priceYen } })
    return true
  }

  /** The live room's hammer to a rival dealer: the lot leaves the board, no
   * cash or car movement on the player's side. */
  function loseAuctionLot(lotId: string): void {
    gameState.value = settleAuctionLotLostCore(gameState.value, lotId)
    logSessionEvent({ type: 'loseAuctionLot', payload: { lotId } })
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
    pushDayLog(result.log)
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

  /** Cart total including the express surcharge, for the checkout screen's
   * two-option display. Priced per part (`expressPriceYen`), the way checkout
   * itself charges it - one `resolveBuyPart` call per line-unit - so the quote
   * and the till agree to the yen rather than to the rounding. */
  const cartExpressTotalYen = computed<number>(() =>
    cartItems.value.reduce((sum, item) => sum + expressPriceYen(item.part) * item.quantity, 0),
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
    const items: { partId: string; priceYen: number }[] = []
    let boughtCount = 0
    for (const partId of gameState.value.cartPartIds) {
      if (buyPart(partId, deliverySpeed)) {
        boughtCount += 1
        const part = context.value.partsById[partId]
        // The line's charged price: per-part express surcharge or base, the
        // exact figure `resolveBuyPart` just took from the till.
        if (part) {
          items.push({
            partId,
            priceYen: deliverySpeed === 'express' ? expressPriceYen(part) : part.priceYen,
          })
        }
      } else {
        remaining.push(partId)
      }
    }
    gameState.value = { ...gameState.value, cartPartIds: remaining }
    logSessionEvent({
      type: 'checkoutCart',
      payload: {
        deliverySpeed,
        boughtCount,
        remainingCount: remaining.length,
        items,
        totalYen: items.reduce((sum, item) => sum + item.priceYen, 0),
      },
    })
    return { boughtCount, remainingCount: remaining.length }
  }

  /** Standard-delivery orders still in transit, for a "pending orders" display. */
  const pendingPartOrders = computed(() => gameState.value.pendingPartOrders)

  /**
   * The shelf: consumable tins on hand, counted in uses rather than tins, by
   * `GameState.consumableStock` key - the plain id for filler/paper/primer/
   * polish, `paintStockKey(finish, colour)` for paint. `{}` for a shop that
   * has never bought a tin (the field is genuinely optional).
   */
  const consumableStock = computed<Record<string, number>>(
    () => gameState.value.consumableStock ?? {},
  )

  /**
   * Buys one tin of a simple (non-paint) consumable - filler, paper, primer
   * or polish - crediting its whole `usesPerTin` to the shelf at once and
   * charging its flat tin price. Mirrors `buyPart`'s own instant-buy shape.
   */
  function buyConsumableTin(id: SimpleConsumableId): boolean {
    const result = resolveBuyConsumableTin(gameState.value, id, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'buyConsumableTin',
      payload: { id, priceYen: loggedYen(result.log, 'consumable-bought') },
    })
    return true
  }

  /**
   * Buys one paint tin of `finish`/`size`, mixed to `colour` - the one
   * consumable purchase that also names a colour.
   */
  function buyPaintTin(finish: PaintFinish, size: PaintTinSize, colour: string): boolean {
    const result = resolveBuyPaintTin(gameState.value, finish, size, colour, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'buyPaintTin',
      payload: { finish, size, colour, priceYen: loggedYen(result.log, 'consumable-bought') },
    })
    return true
  }

  /**
   * Accept a service-job offer - instant. The customer's car arrives in the
   * shop (parking) the moment this is called, not "next day" - needs a free
   * parking space to take delivery.
   */
  function acceptServiceJob(offerId: string): boolean {
    const result = resolveAcceptServiceJob(gameState.value, offerId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'acceptServiceJob', payload: { offerId } })
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
    logSessionEvent({ type: 'rejectServiceJobOffer', payload: { offerId } })
    return true
  }

  /** Accept the currently offered story mission - instant, offered -> active. */
  function acceptMission(missionId: string): boolean {
    const result = resolveAcceptMission(gameState.value, missionId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'acceptMission', payload: { missionId } })
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
    pushDayLog(result.log)

    const entry = result.log.find((e) => e.type === 'mission-delivered')
    if (entry?.type === 'mission-delivered' && mission) {
      const persona = context.value.personasById[mission.personaId]
      const totalSpentYen =
        (ledger.purchaseYen ?? 0) + ledger.repairYen + ledger.partsYen + ledger.listingFeesYen
      lastMissionResult.value = {
        personaName: persona?.name ?? mission.personaId,
        copy: entry.tipYen > 0 ? mission.overdeliveredCopy : mission.deliveredCopy,
        payoutYen: entry.payoutYen,
        tipYen: entry.tipYen,
        reputationGained: entry.reputationGained,
        profitYen: entry.payoutYen - totalSpentYen,
      }
    }
    logSessionEvent({
      type: 'deliverMission',
      payload: {
        missionId: record.missionId,
        carInstanceId,
        ...(entry?.type === 'mission-delivered'
          ? { payoutYen: entry.payoutYen, tipYen: entry.tipYen }
          : {}),
      },
    })
    return true
  }

  function dismissMissionResult(): void {
    lastMissionResult.value = null
  }

  /** Accept the scene's currently offered commission - instant, offered ->
   * active. A no-op (returns false) when nothing is offered for that scene. */
  function acceptSceneCommission(scene: BuyerArchetype): boolean {
    const result = resolveAcceptSceneCommission(gameState.value, scene)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'acceptSceneCommission', payload: { scene } })
    return true
  }

  /** "Does this car meet the brief" - free, repeatable, no state change.
   * Mirrors `gradeMission`'s own contract for a story mission. */
  function gradeSceneCommission(scene: BuyerArchetype, carInstanceId: string): MissionGradeReport {
    return gradeSceneCommissionCar(gameState.value, scene, carInstanceId, context.value)
  }

  /** Hand the car over against the scene's active commission - requires
   * `gradeSceneCommission` to already pass; `resolveDeliverSceneCommission`
   * itself re-grades and refuses regardless. */
  function deliverSceneCommission(scene: BuyerArchetype, carInstanceId: string): boolean {
    const result = resolveDeliverSceneCommission(
      gameState.value,
      scene,
      carInstanceId,
      context.value,
    )
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({
      type: 'deliverSceneCommission',
      payload: {
        scene,
        carInstanceId,
        payoutYen: loggedYen(result.log, 'scene-commission-delivered'),
      },
    })
    return true
  }

  // --- staff ---
  // The persisted staff data stays in `GameState`; the staff store reads and
  // writes it through this store's exposed `gameState`, `dayLog`, `context`,
  // and `logSessionEvent`.

  /**
   * The reference-lap board for the active mission's `lapTimeCeiling` requirement
   * (empty when it has none). Null carInstanceId or a car with no measurable time
   * (one that cannot be driven at all - see `lapBlockers`) falls back to the "no
   * candidate" selection (nearest to the requirement's own target, no grade
   * filtering); the player's own predicted time is never part of the returned rows
   * either way. Every row's time is a reference entry's, always a real number, so
   * the board never renders a blank.
   */
  function lapBoardRowsFor(carInstanceId: string | null): LapBoardRow[] {
    const record = activeMissionRecord()
    if (!record) return []
    const mission = context.value.storyMissionsById[record.missionId]
    const lapRequirement = mission?.requirements.find(
      (r): r is Extract<RequirementSpec, { kind: 'lapTimeCeiling' }> => r.kind === 'lapTimeCeiling',
    )
    if (!lapRequirement) return []
    const course = context.value.coursesById[lapRequirement.courseId]
    if (!course) return []

    let candidate: { timeSeconds: number; tyreGrade: Grade } | null = null
    if (carInstanceId) {
      const car = gameState.value.ownedCars.find((c) => c.id === carInstanceId)
      const model = car ? context.value.modelsById[car.modelId] : undefined
      const installed = car?.parts.tyres.installed
      const tyrePart = installed ? context.value.partsById[installed.partId] : undefined
      if (car && model && tyrePart) {
        const timeSeconds = lapTimeSecondsFor(car, model, context.value, lapRequirement.courseId)
        if (timeSeconds !== null) candidate = { timeSeconds, tyreGrade: tyrePart.grade }
      }
    }
    return selectBoardRows(
      context.value.lapReferencePool,
      context.value.lapReferenceAnchor,
      candidate,
      lapRequirement.maxSeconds,
      context.value.economy,
      course,
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
    pushDayLog(resolution.log)

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
        daysSpent: entry.daysSpent,
        returnedParts,
      }
    } else if (entry?.type === 'service-job-failed') {
      lastJobResult.value = {
        outcome: 'failed',
        customerName: job.customerName,
        taskLabels: job.tasks.map(taskLabel),
        payoutYen: 0,
        reputationDelta: 0,
        repairCostYen: entry.repairCostYen,
        partsCostYen: entry.partsCostYen,
        netProfitYen: entry.netProfitYen,
        returnedParts,
      }
    }
    logSessionEvent({
      type: 'completeServiceJob',
      payload: {
        jobId,
        outcome: resolution.outcome,
        payoutYen: entry?.type === 'service-job-completed' ? entry.payoutYen : 0,
      },
    })
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
    pushDayLog(result.log)

    // The receipt draws from existing data structures: the ledger and
    // `car-sold`'s own price/profit.
    const sold = result.log.find((e) => e.type === 'car-sold')
    if (sold?.type === 'car-sold' && detail) {
      const purchaseYen = ledger?.purchaseYen ?? 0
      const repairYen = ledger?.repairYen ?? 0
      const partsYen = ledger?.partsYen ?? 0
      const listingFeesYen = ledger?.listingFeesYen ?? 0
      lastSaleResult.value = {
        displayName: detail.displayName,
        priceYen: sold.priceYen,
        purchaseYen,
        repairYen,
        partsYen,
        listingFeesYen,
        totalSpentYen: purchaseYen + repairYen + partsYen + listingFeesYen,
        // `profitYen` is absent exactly when the purchase price was unknown.
        // Pass the gap through rather than inventing a number.
        profitYen: sold.profitYen ?? null,
        matchedSale: sold.matchedSale ?? false,
      }
    }
    logSessionEvent({
      type: 'acceptOffer',
      payload: {
        carId,
        ...(sold?.type === 'car-sold' ? { priceYen: sold.priceYen, channel: sold.channel } : {}),
      },
    })
    return true
  }

  /** Turn today's offer down. The car stays listed, so tomorrow's draw can
   * bring a better one - unless the model is in today's hot heat band, in
   * which case `resolveRejectOffer` may also roll a second offer the same
   * day (`economy.selling.hotSecondOfferChance`), folded into this same
   * result and logged the same way. */
  function rejectOffer(carId: string): boolean {
    const result = resolveRejectOffer(gameState.value, carId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    pushDayLog(result.log)
    logSessionEvent({ type: 'rejectOffer', payload: { carId } })
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
    // A refused listing (no forecourt space) leaves state untouched but
    // still logs (`acquisition-blocked`, reusing the existing no-space
    // shape) - checked separately from state identity so that log still
    // surfaces, the same "something happened" contract `buyout` uses.
    if (result.state === before && result.log.length === 0) return false
    gameState.value = result.state
    if (result.log.length > 0) pushDayLog(result.log)
    logSessionEvent({ type: 'setForSale', payload: { carId, forSale, channelId } })
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
    return scrapShellPriceYen(model, context.value.economy)
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
    pushDayLog(result.log)
    logSessionEvent({
      type: 'scrapShell',
      payload: { carId, priceYen: loggedYen(result.log, 'shell-scrapped') },
    })
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
    logSessionEvent({ type: 'endDay', payload: { endedDay } })
    const result = advanceDay(state, emptyDayActions(), state.seed + state.day, context.value)
    gameState.value = result.state
    pushDayLog(result.log, endedDay)
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
   * A new career is open play from day 1: no tutorial career is installed, and
   * every sim gate reads the absence of `tutorialStatus` as inactive, so the
   * day-1 auction board, job batch and mission offers are the normal ones. */
  function newGame(seed: number = randomSeed()): void {
    gameState.value = createInitialGameState(context.value, seed)
    dayLog.value = []
    lastDayReport.value = null
    reportVisible.value = false
    // A new career starts with empty logs and its own identifier - the
    // session and ledger streams would otherwise accumulate across careers
    // forever. Fire-and-forget, the same best-effort shape as the writes.
    void clearSessionEvents()
    void clearLedgerEvents()
    void stampNewCareerId()
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

  /** Hand the day's whole labour bar back without ending the day, so a long
   * build can be walked through in one sitting. Clears what has been spent
   * rather than raising the pool, so the bar refills to whatever this shop's
   * tools and bench actually earn it. */
  function devRefillLabour(): void {
    gameState.value = { ...gameState.value, energySpentToday: 0 }
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

  /** Own or disown one shop directly, bypassing price and the classifieds -
   * dev/test only, the shop twin of `devSetToolTier`. */
  function devSetToolShopOwned(shopId: string, owned: boolean): void {
    const already = gameState.value.toolShopsOwned.includes(shopId)
    if (already === owned) return
    gameState.value = {
      ...gameState.value,
      toolShopsOwned: owned
        ? [...gameState.value.toolShopsOwned, shopId]
        : gameState.value.toolShopsOwned.filter((id) => id !== shopId),
    }
  }

  /** Add one more bay of this kind for free, bypassing price/reputation - dev/test only.
   * A no-op once the kind's ladder is already maxed (nothing to add). */
  function devGrantBay(kind: BayKind): void {
    const cfg = context.value.facilities[kind]
    const current = bayCountsByKind(gameState.value)[kind]
    if (current >= cfg.maxCount) return
    switch (kind) {
      case 'service':
        gameState.value = {
          ...gameState.value,
          serviceBayCount: current + 1,
          serviceBayCarIds: [...gameState.value.serviceBayCarIds, null],
        }
        return
      case 'parking':
        gameState.value = {
          ...gameState.value,
          parkingBayCount: current + 1,
          parkingCarIds: [...gameState.value.parkingCarIds, null],
        }
        return
      case 'forecourt':
        gameState.value = {
          ...gameState.value,
          forecourtBayCount: current + 1,
          forecourtCarIds: [...gameState.value.forecourtCarIds, null],
        }
        return
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

  /**
   * Jump one scene straight to a standing stage, bypassing however many
   * matched deliveries it would normally take to earn - dev/test only.
   * Earning it (docs/sprints/sprint_archive/scene-standing-arc.md) has nothing to hook yet,
   * so this is the one way a career can currently reach
   * `known`/`respected`/`shop` at all.
   */
  function devSetSceneStanding(scene: BuyerArchetype, stage: SceneStandingStage): void {
    gameState.value = {
      ...gameState.value,
      sceneStanding: { ...gameState.value.sceneStanding, [scene]: stage },
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
    logSessionEvent({ type: 'skipTutorial', payload: {} })
  }

  /** Retire the overlay for good once the sign-off has been read after delivery
   * - distinct from a skip only in intent; both suppress the
   * overlay and the scripted lot forever. */
  function finishTutorial(): void {
    if (gameState.value.tutorialStatus !== 'active') return
    gameState.value = { ...gameState.value, tutorialStatus: 'done' }
    logSessionEvent({ type: 'finishTutorial', payload: {} })
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
    logSessionEvent({ type: 'acknowledgeTutorialStep', payload: { stepId } })
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
    // Exposed so the staff store can read the sim context, log session
    // events and push day-log entries through the one ledger-capturing write
    // point. The persisted staff data still lives in `gameState` here.
    context,
    logSessionEvent,
    pushDayLog,
    day,
    dayOfWeekLabel,
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
    openAuctionTiers,
    nextOpenDayFor,
    resolveModelName,
    partName,
    componentLabel,
    fitmentClassLabel,
    buyerName,
    carDetail,
    groupBandsForCar,
    groupRepairFloorBand,
    nextRepairStep,
    nextPartStepRange,
    repairCeilingCaption,
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
    availableSellingChannelIds,
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
    installToolGateReasonFor,
    removeBlockedReason,
    removeMachineNoteFor,
    installMachineNoteFor,
    repairMachineNoteFor,
    machineLineOwned,
    machineLineHiredToday,
    machineLineAvailable,
    machineLineFeeYen,
    hireMachineLineGateReason,
    hireMachineLine,
    buyCoffee,
    coffeePriceYen,
    coffeeGateReason,
    dynoOwned,
    dynoHiredToday,
    dynoHireFeeYen,
    dynoPurchasePriceYen,
    dynoMinReputationTier,
    dynoPurchaseGateReason,
    buyDyno,
    dynoSessionGateReason,
    runDynoSession,
    dynoSessionCarId,
    dynoSheet,
    machiningGateReason,
    machinePart,
    machineShopSheet,
    fittedMachiningOffers,
    fittedMachiningGateReason,
    machineFittedPart,
    stationPart,
    partsForStation,
    placeOnStation,
    takeFromStation,
    stationForPart,
    benchRepairCeilingCaption,
    serviceBaysView,
    parkingView,
    parkingCapacity,
    parkingOccupancyCount,
    parkingFull,
    serviceBayCount,
    serviceBayFreeCount,
    forecourtView,
    forecourtCapacity,
    forecourtOccupancyCount,
    hasForecourtSpace,
    forecourtBlockedReason,
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
    toolShopViews,
    toolShopInfo,
    buyToolShop,
    machineListingView,
    standingView,
    costSheetView,
    repair,
    install,
    pipelineStage,
    paintZone,
    removePanel,
    installPanel,
    pickableParts,
    removePart,
    isAssemblyMember,
    removeAssembly,
    refitAssembly,
    swapAssemblyMember,
    removeAssemblyMember,
    assemblyLabel,
    assemblyRowsFor,
    benchContainersFor,
    benchSwapMachineNoteFor,
    pipelineActionPlan,
    machineLaborDisclosureText,
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
    consumableStock,
    buyConsumableTin,
    buyPaintTin,
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
    acceptSceneCommission,
    gradeSceneCommission,
    deliverSceneCommission,
    lapBoardRowsFor,
    lastJobResult,
    dismissJobResult,
    lastSaleResult,
    dismissSaleResult,
    lastMissionResult,
    dismissMissionResult,
    finishedJobsAwaitingHandback,
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
    devRefillLabour,
    devGrantCar,
    devGrantPart,
    devSetToolTier,
    devSetToolShopOwned,
    devGrantBay,
    devSetReputationTier,
    sceneStandingView,
    devSetSceneStanding,
  }
})
