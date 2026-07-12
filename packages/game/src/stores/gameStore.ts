import {
  BUYERS,
  CARS,
  COMPONENT_DISPLAY_NAMES,
  ECONOMY,
  EQUIPMENT,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
} from '@midnight-garage/content'
import type {
  AuctionLot,
  AuctionTier,
  BayKind,
  Buyer,
  CarInstance,
  CarModel,
  CarPartId,
  ComponentId,
  ConditionBand,
  DayLogEntry,
  Equipment,
  GameState,
  Grade,
  Job,
  Part,
  PartInstance,
  ReputationTier,
  ServiceJob,
  ServiceJobTask,
  StagedAction,
  StatBlock,
} from '@midnight-garage/content'
import { componentDisplayName, resolveCarDisplayName } from '@midnight-garage/content'
import {
  anchorValueYen,
  applyBayPurchase,
  applyEquipmentPurchase,
  applyMoves,
  assignToParking,
  availableLaborSlots,
  advanceDay,
  bandIndex,
  bestFitBuyer,
  buildSimContext,
  carCostToMintYen,
  computeBuyoutPriceYen,
  computeDerivedStats,
  confirmStagedWork,
  createInitialGameState,
  createRng,
  deriveReputationTier,
  emptyDayActions,
  generateAuctionCarInstance,
  hasEquipmentFor,
  hasParkingSpace,
  isPartMissing,
  isServiceJobInTransit,
  isServiceTaskDone,
  isServiceWorkDone,
  moveCarToSlot as moveCarToSlotCore,
  nextBayMinReputationTier,
  nextBayPriceYen,
  nextRaiseYen,
  parkingOccupancy,
  partFitsCar,
  planGroupRepair,
  presentPartIdsInGroup,
  reconditionQuote,
  reputationAtLeast,
  REPUTATION_TIER_THRESHOLDS,
  PARTS_EXPRESS_SURCHARGE_FRACTION,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveBuyoutInstant,
  resolveBuyPart,
  reserveYen,
  resolveJobLabor,
  resolvePlaceBid,
  resolveReconditionLabor,
  resolveRemovePart,
  resolveScrapPart,
  resolveSellViaWalkIn,
  resolveServiceJob,
  resolveSetForSale,
  scrapValueYen,
  swapCars as swapCarsCore,
  valuateCarForBuyer,
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
}

/** One catalog equipment item plus whether it's owned, for the purchase UI (Sprint 13).
 * `reputationOk` (Sprint 16) is true when the item has no reputation gate or it's already met. */
export interface EquipmentView extends Equipment {
  owned: boolean
  reputationOk: boolean
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

/** A service-job offer on the board (accept to bring the car into the shop). */
export interface ServiceJobOfferView {
  id: string
  customerName: string
  description: string
  tasks: ServiceJobTaskView[]
  carName: string
  payoutYen: number
  baseReputation: number
  expiresOnDay: number
  /**
   * False when at least one repair task's equipment isn't owned yet (Sprint
   * 13, extended to the whole multi-task list by Sprint 29) -
   * `resolveAcceptServiceJob` refuses it, so the UI shows why upfront rather
   * than letting the click silently fail. A template with no repair tasks
   * at all is always `true` (replace never needs equipment). The offer
   * itself still stays on the board either way - filtering it out entirely
   * at generation time is a deliberately deferred refinement (see TODO.md).
   */
  canAccept: boolean
  /** Set only when `canAccept` is false: the equipment that's missing. */
  missingEquipmentName?: string
}

/** A service job in the shop, tracked against its car's real work state. */
export interface ServiceJobView {
  id: string
  customerName: string
  description: string
  tasks: ServiceJobTaskView[]
  carId: string
  carName: string
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
}

/** Immediate feedback for a resolved service job (Sprint 10), for a completion modal. */
export interface ServiceJobResultView {
  outcome: 'paid' | 'failed'
  customerName: string
  /** Sprint 29: a job can have several tasks now - one label per task,
   * built from real part names, never the raw camelCase id. */
  taskLabels: string[]
  payoutYen: number
  /** Positive for a paid job, negative (or zero) for a failed one. */
  reputationDelta: number
  /** Set for a paid job with at least one install task: the sum of every
   * installed part's cost and the resulting profit. */
  partCostYen?: number
  profitYen?: number
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
   * The full 29-part band list (Sprint 27 decision 3), read-only - "opening"
   * a lot shows exactly this, the same per-part row shape the owned-car
   * screen already uses. Player and bots see identical information.
   */
  partRows: CarPartRowView[]
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
}

/**
 * One of the player's still-unresolved active bids, for the "My Active
 * Bids" section. Sprint 20: deliberately keeps showing a lot the player is
 * currently LOSING (`leadingBidder !== 'player'`) - "you're being outbid,
 * go raise" is the panel's whole point, not just a list of wins-so-far.
 */
export interface MyActiveBidView {
  lot: AuctionLot
  model: CarModel
  displayName: string
  currentBidYen: number
  leadingBidder: 'player' | 'rival' | null
  isWinning: boolean
  nextRaiseYen: number
  quietDays: number
  hammerThreshold: number
  turnout: TurnoutBand
  expiresOnDay: number
  daysLeft: number
  closeLabel: string
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
      EQUIPMENT,
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
      const missingTask = firstMissingEquipmentTask(offer)
      const missingEquipmentName = missingTask
        ? context.value.equipment.find((e) => {
            const group = groupForCarPart(missingTask.carPartId)
            return group ? e.componentIds.includes(group) : false
          })?.displayName
        : undefined
      return {
        id: offer.id,
        customerName: offer.customerName,
        description: offer.description,
        tasks: serviceJobTaskViews(offer),
        carName: model ? resolveCarDisplayName(model) : offer.car.modelId,
        payoutYen: offer.payoutYen,
        baseReputation: offer.baseReputation,
        expiresOnDay: offer.expiresOnDay,
        canAccept: !missingTask,
        missingEquipmentName,
      }
    }),
  )

  /** Accepted service jobs in the shop, with each car's live work state. */
  const activeServiceJobViews = computed<ServiceJobView[]>(() =>
    gameState.value.activeServiceJobs.map(serviceJobViewFor),
  )

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

  /**
   * The full 29-part band list for `car`, grouped in `REAL_COMPONENT_GROUPS`
   * order (Sprint 27 decision 3) - the auction lot-detail's "open the lot"
   * view: every real part, always visible, never gated behind an inspection
   * step. Player and bots see identical information.
   */
  function allCarPartRows(car: CarInstance, model: CarModel): CarPartRowView[] {
    return REAL_COMPONENT_GROUPS.flatMap((groupId) => carPartRowsInGroup(car, model, groupId))
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
      done: isServiceTaskDone(job.car, task, context.value.partsById),
    }))
  }

  /** Whether `job`'s task list has at least one repair task whose group
   * equipment isn't owned - the offer board's accept gate (Sprint 13,
   * extended to the whole multi-task list by Sprint 29). */
  function firstMissingEquipmentTask(job: ServiceJob): ServiceJobTask | undefined {
    return job.tasks.find((task) => {
      if (task.action !== 'repair') return false
      const group = groupForCarPart(task.carPartId)
      return !group || !hasEquipmentFor(gameState.value, group, context.value)
    })
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
  function carDetail(carId: string): CarDetail | undefined {
    const car = findWorkableCar(carId)
    if (!car) return undefined
    const serviceJob = gameState.value.activeServiceJobs.find((sj) => sj.car.id === carId)
    return {
      ...detailFor(car),
      jobs: gameState.value.jobs.filter((j) => j.carInstanceId === carId),
      serviceJob: serviceJob ? serviceJobViewFor(serviceJob) : undefined,
      inServiceBay: gameState.value.serviceBayCarIds.includes(carId),
      stagedActions: gameState.value.stagedCarWork[carId] ?? [],
      groupBands: groupBandsForCar(car),
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
      payoutYen: job.payoutYen,
      baseReputation: job.baseReputation,
      workDone: isServiceWorkDone(job, context.value),
      failureReputationPenalty: reputationForFailure(job.baseReputation),
      daysLeft: job.dueOnDay === null ? null : job.dueOnDay - gameState.value.day,
      arrivesOnDay: job.arrivesOnDay,
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
  function auctionCloseLabel(lot: AuctionLot): string {
    if (lot.currentBidYen === 0) return 'no bids yet - open to bid'
    const threshold = context.value.economy.AUCTION_QUIET_DAYS_TO_HAMMER
    const quietNightsLeft = Math.max(1, threshold - lot.quietDays)
    const backstopNightsLeft = Math.max(1, lot.expiresOnDay - gameState.value.day)
    const nightsLeft = Math.min(quietNightsLeft, backstopNightsLeft)
    if (nightsLeft <= 1) return 'final call: closes at End Day unless a new bid comes in'
    return `closes in ${nightsLeft} days unless bid on (any bid resets the clock)`
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
      partRows: allCarPartRows(lot.car, model),
      restorationBillYen: carCostToMintYen(lot.car, model, context.value.partsTaxonomyById),
      expiresOnDay: lot.expiresOnDay,
      daysLeft: lot.expiresOnDay - gameState.value.day,
      closeLabel: auctionCloseLabel(lot),
    }
  }

  /**
   * Every lot the player has ever raised on (Sprint 20: `playerHasBid`,
   * never reset) - a pure filter over `activeAuctionLots`, not a separate
   * tracked list (a lot with a bid is already fully addressable through the
   * existing catalog, so a parallel "active bids" array would just be the
   * same data twice). `activeAuctionLots` only ever holds still-active lots,
   * so "lot still active" needs no separate check here. Deliberately
   * INCLUDES lots the player is currently losing - "you're being outbid, go
   * raise" is the panel's whole point.
   */
  const myActiveBids = computed<MyActiveBidView[]>(() =>
    gameState.value.activeAuctionLots.flatMap((lot) => {
      if (!lot.playerHasBid) return []
      const model = context.value.modelsById[lot.modelId]
      if (!model) return []
      return [
        {
          lot,
          model,
          displayName: resolveCarDisplayName(model),
          currentBidYen: lot.currentBidYen,
          leadingBidder: lot.leadingBidder,
          isWinning: lot.leadingBidder === 'player',
          nextRaiseYen: nextRaiseYen(lot, gameState.value, context.value),
          quietDays: lot.quietDays,
          hammerThreshold: context.value.economy.AUCTION_QUIET_DAYS_TO_HAMMER,
          turnout: lot.turnout,
          expiresOnDay: lot.expiresOnDay,
          daysLeft: lot.expiresOnDay - gameState.value.day,
          closeLabel: auctionCloseLabel(lot),
        },
      ]
    }),
  )

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
      const part = context.value.partsById[pi.partId]
      return part
        ? partFitsCar(part, model, componentId, context.value.partsTaxonomyById, carPartId)
        : false
    })
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

  // --- equipment (Sprint 13) ----------------------------------------------

  /** The full equipment catalog with owned-status, for the purchase UI. */
  const equipmentCatalog = computed<EquipmentView[]>(() =>
    context.value.equipment.map((e) => ({
      ...e,
      owned: gameState.value.ownedEquipmentIds.includes(e.id),
      reputationOk:
        !e.minReputationTier ||
        reputationAtLeast(gameState.value.reputationTier, e.minReputationTier),
    })),
  )

  /**
   * Buy a piece of equipment - instant, usable the same day (unlocks REPAIR
   * on its component(s) immediately). Returns false if already owned,
   * reputation-gated, or unaffordable.
   */
  function buyEquipment(equipmentId: string): boolean {
    const result = applyEquipmentPurchase(gameState.value, equipmentId, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('buyEquipment', { equipmentId })
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
      gameState.value.ownedEquipmentIds,
      context.value.partIdsByGroup,
      context.value.partsTaxonomyById,
      context.value.equipmentById,
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

  /**
   * Whether the shop currently owns equipment covering `componentId` - what
   * REPAIR is gated on (Sprint 13). Replace never needs this; it's always
   * available.
   */
  function hasEquipmentForComponent(componentId: ComponentId): boolean {
    return hasEquipmentFor(gameState.value, componentId, context.value)
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
        )
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
   * continues the real jobs and spends today's remaining labor (and any
   * repair consumables) for real, through the exact same resolvers the old
   * instant-click flow always used (Sprint 18). The staged list is cleared
   * whether or not every action could be fully labored today - a
   * partial-labor action just leaves a normal continuable job behind.
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
    return taxonomyEntry ? scrapValueYen(taxonomyEntry, context.value.economy) : 0
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
    if (resolution.outcome === 'not-found' || !job) return 'not-found'
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
        partCostYen: entry.partCostYen,
        profitYen: entry.profitYen,
        daysSpent: entry.daysSpent,
      }
    } else if (entry?.type === 'service-job-failed') {
      lastJobResult.value = {
        outcome: 'failed',
        customerName: job.customerName,
        taskLabels: job.tasks.map(taskLabel),
        payoutYen: 0,
        reputationDelta: -entry.reputationLost,
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
    const result = resolveSellViaWalkIn(gameState.value, carId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    logSessionEvent('acceptOffer', { carId })
    return true
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
      newGame()
      return
    }
    try {
      gameState.value = decodeSave(code)
      dayLog.value = []
    } catch {
      // Corrupt/unreadable save - start fresh rather than crash.
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
    const car = generateAuctionCarInstance(model, id, createRng(grantCounter.value), context.value)
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
    }
    gameState.value = {
      ...gameState.value,
      partInventory: [...gameState.value.partInventory, instance],
    }
  }

  /** Grant equipment for free, bypassing price/reputation - dev/test only. */
  function devGrantEquipment(equipmentId: string): void {
    if (gameState.value.ownedEquipmentIds.includes(equipmentId)) return
    gameState.value = {
      ...gameState.value,
      ownedEquipmentIds: [...gameState.value.ownedEquipmentIds, equipmentId],
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
   * tier's exact threshold (`REPUTATION_TIER_THRESHOLDS`) and re-derives
   * `reputationTier` from it in the same step, the same way every real
   * reputation change does (`applyReputationDelta`) - `reputationTier` is
   * never set directly anywhere, including here.
   */
  function devSetReputationTier(tier: ReputationTier): void {
    const reputationPoints = REPUTATION_TIER_THRESHOLDS[tier]
    gameState.value = {
      ...gameState.value,
      reputationPoints,
      reputationTier: deriveReputationTier(reputationPoints),
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
    carsDetailed,
    ownedCarNames,
    partsCatalog,
    modelsCatalog,
    auctionLotsByTier,
    myActiveBids,
    resolveModelName,
    partName,
    componentLabel,
    buyerName,
    carDetail,
    groupBandsForCar,
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
    serviceBaysView,
    parkingView,
    parkingCapacity,
    parkingOccupancyCount,
    parkingFull,
    serviceBayCount,
    serviceBayFreeCount,
    shopAtCapacity,
    nextBayPrice,
    nextBayReputationGate,
    moveCar,
    swapCars,
    moveCarToSlot,
    buyBay,
    equipmentCatalog,
    hasEquipmentForComponent,
    buyEquipment,
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
    reconditionPart,
    cartItems,
    cartStandardTotalYen,
    cartExpressTotalYen,
    addToCart,
    removeFromCart,
    checkoutCart,
    pendingPartOrders,
    acceptOffer,
    setForSale,
    acceptServiceJob,
    completeServiceJob,
    lastJobResult,
    dismissJobResult,
    endDay,
    lastDayReport,
    reportVisible,
    dismissReport,
    hydrate,
    exportSaveCode,
    importSaveCode,
    newGame,
    devGiveCash,
    devGrantCar,
    devGrantPart,
    devGrantEquipment,
    devGrantBay,
    devSetReputationTier,
  }
})
