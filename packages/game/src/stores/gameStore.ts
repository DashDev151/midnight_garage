import {
  BUYERS,
  CARS,
  ECONOMY,
  EQUIPMENT,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
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
  ComponentId,
  DayLogEntry,
  Equipment,
  GameState,
  Job,
  Part,
  PartInstance,
  PublicListing,
  ReputationTier,
  ServiceJob,
  StagedAction,
  StatBlock,
} from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  applyBayPurchase,
  applyEquipmentPurchase,
  applyMoves,
  assignToParking,
  availableLaborSlots,
  advanceDay,
  bestFitBuyer,
  buildSimContext,
  computeBuyoutPriceYen,
  computeDerivedStats,
  confirmStagedWork,
  createInitialGameState,
  createRng,
  deriveReputationTier,
  emptyDayActions,
  generateAuctionCarInstance,
  effectiveComponentCondition,
  hasEquipmentFor,
  hasParkingSpace,
  isServiceWorkDone,
  issueRepairCostYen,
  issueSeverityBand,
  listPubliclyAskingPrice,
  moveCarToSlot as moveCarToSlotCore,
  nextBayMinReputationTier,
  nextBayPriceYen,
  nextRaiseYen,
  parkingOccupancy,
  reputationAtLeast,
  REPUTATION_TIER_THRESHOLDS,
  PARTS_EXPRESS_SURCHARGE_FRACTION,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveBuyoutInstant,
  resolveBuyPart,
  resolveInspectLot,
  resolveJobLabor,
  resolveListForSale,
  resolvePlaceBid,
  resolveSellViaWalkIn,
  resolveServiceJob,
  swapCars as swapCarsCore,
  turnoutBand,
  valuateCarForBuyer,
  type DeliverySpeed,
  type IssueSeverityBand,
  type NewJobSpec,
  type ServiceJobOutcome,
  type SimContext,
  type TurnoutBand,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { INSTALL_LABOR_SLOTS, repairLaborSlotsFor } from '../constants'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { loadSave, writeSave } from '../save/saveDb'

/**
 * Placeholder seed for the eager store init (immediately replaced by
 * `hydrate()` — either a loaded save or a fresh random career). Kept fixed
 * so store-level tests that read the pre-hydrate state stay deterministic.
 */
const DEFAULT_SEED = 1

/**
 * A fresh random career seed. Game-layer only (Math.random is fine here —
 * the sim stays fully deterministic *given* a seed). External review 2026-07
 * finding 3: a fixed default meant every player got the identical career.
 * Explicit seeds (dev console, tests, the balance harness) still bypass this.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}

/** A car paired with its resolved model, display name, and derived stats. */
export interface DetailedCar {
  car: CarInstance
  model: CarModel
  displayName: string
  stats: StatBlock
}

/**
 * One hidden issue on an owned car (Sprint 22) — a named, persistent,
 * individually priced defect until actually fixed. Issues are always
 * revealed post-purchase (decision 7), so this list needs no "revealed"
 * filter the way `LotDetail.revealedIssues` does.
 */
export interface CarIssueView {
  issueId: string
  componentId: ComponentId
  hintText: string
  severityBand: IssueSeverityBand
  costYen: number
  repaired: boolean
  /** True if a `fix-issue` staged action already exists for this issue on this car. */
  staged: boolean
}

/** Everything the car-detail screen needs for one car. */
export interface CarDetail extends DetailedCar {
  /** Jobs currently in progress on this car — created and labored on instantly (Sprint 11). */
  jobs: Job[]
  /** Set when this car belongs to a service job the player is working. */
  serviceJob?: ServiceJobView
  /** Whether this car is currently in a service bay (labor only reaches it if so). */
  inServiceBay: boolean
  /** Repair/install work staged on this car but not yet confirmed (Sprint 18). */
  stagedActions: StagedAction[]
  /** Hidden issues on this car, unrepaired and repaired alike (Sprint 22). */
  issues: CarIssueView[]
}

/** A car sitting somewhere in the shop (a service bay or parking), for the bay layout. */
export interface ShopCarView {
  carId: string
  displayName: string
  /** True for a customer's car in for a service job — never owned. */
  isCustomerCar: boolean
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

/** A short human label for a service job's required work. */
function serviceWorkLabel(job: ServiceJob): string {
  return job.work.kind === 'repair'
    ? `Repair ${job.work.componentId}`
    : `Install ${job.work.componentId} part`
}

/** A service-job offer on the board (accept to bring the car into the shop). */
export interface ServiceJobOfferView {
  id: string
  customerName: string
  description: string
  workLabel: string
  carName: string
  payoutYen: number
  baseReputation: number
  expiresOnDay: number
  /**
   * False for a repair-kind offer whose equipment isn't owned yet (Sprint
   * 13) — `resolveAcceptServiceJob` refuses it, so the UI shows why upfront
   * rather than letting the click silently fail. Install-kind offers are
   * always `true` (replace never needs equipment). The offer itself still
   * stays on the board either way — filtering it out entirely at generation
   * time is a deliberately deferred refinement (see TODO.md).
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
  workLabel: string
  carId: string
  carName: string
  payoutYen: number
  baseReputation: number
  /** True once the required work has actually been done on the car. */
  workDone: boolean
  /** Reputation lost if this job is failed (handed back unfinished / overdue). */
  failureReputationPenalty: number
  /** Days remaining before the deadline auto-resolves it (null if somehow unset). */
  daysLeft: number | null
}

/** Immediate feedback for a resolved service job (Sprint 10), for a completion modal. */
export interface ServiceJobResultView {
  outcome: 'paid' | 'failed'
  customerName: string
  workLabel: string
  payoutYen: number
  /** Positive for a paid job, negative (or zero) for a failed one. */
  reputationDelta: number
  /** Set for a paid install job: the installed part's cost and the resulting profit. */
  partCostYen?: number
  profitYen?: number
  /** Days between acceptance and this resolution. */
  daysSpent?: number
}

/**
 * An auction lot with the derived numbers the auction screen shows (Sprint
 * 20: the open-bidding board replaces the old sealed-bid headroom/interest
 * gauges — the state itself is now visible, so there's nothing left to
 * fuzz).
 */
export interface LotDetail {
  lot: AuctionLot
  model: CarModel
  displayName: string
  bookValueYen: number
  reserveYen: number
  inspectionFeeYen: number
  /** Always visible, on every lot (maintainer decision 2). */
  buyoutPriceYen: number
  /** The literal price on the board — 0 before bidding opens. */
  currentBidYen: number
  /** Who holds `currentBidYen` — null only while it's still 0. */
  leadingBidder: 'player' | 'rival' | null
  /** Consecutive quiet overnight steps with no raise; hammers at `hammerThreshold`. */
  quietDays: number
  /** `AUCTION_QUIET_DAYS_TO_HAMMER` — lets the UI say "hammer at 2". */
  hammerThreshold: number
  /** Subtle pre-bid turnout flavor (thin/steady/packed) — price is king, no numeric gauge. */
  turnout: TurnoutBand
  /** The smallest valid raise right now — pre-fills the raise input. */
  nextRaiseYen: number
  /** Set true on the player's first raise on this lot, never reset. */
  playerHasBid: boolean
  /**
   * Revealed hidden issues (only populated once the lot is inspected) — a
   * severity band + fix-cost estimate now that severity is rolled at
   * generation time (Sprint 22), not just which component is affected.
   */
  revealedIssues: {
    issueId: string
    componentId: ComponentId
    hintText: string
    severityBand: IssueSeverityBand
    costYen: number
  }[]
  /**
   * Components this MODEL is known to carry issue risk on (public knowledge,
   * from `hiddenIssueWeights` — "these are known for rust") — always
   * visible, independent of whether THIS lot has been inspected (decision 5:
   * the trade prices the average, inspection reveals the actual instance).
   */
  modelRiskComponents: ComponentId[]
  /** This lot's backstop close day (the Sprint 19 duration roll) — activity-
   * based closing (quiet-day hammer) usually resolves it sooner than this. */
  expiresOnDay: number
  /** Days remaining until the backstop, for the countdown label. */
  daysLeft: number
}

/**
 * One of the player's still-unresolved active bids, for the "My Active
 * Bids" section. Sprint 20: deliberately keeps showing a lot the player is
 * currently LOSING (`leadingBidder !== 'player'`) — "you're being outbid,
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
}

/** The estimated same-day walk-in offer for an owned car. */
export interface WalkInEstimate {
  buyerId: string | undefined
  offerYen: number
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
 * sim instant resolver) — there is no queued plan anymore. `endDay()` is
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
      HIDDEN_ISSUES,
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
        offer.work.kind !== 'repair' ||
        hasEquipmentFor(gameState.value, offer.work.componentId, context.value)
      const missingEquipmentName = canAccept
        ? undefined
        : context.value.equipment.find(
            (e) => offer.work.kind === 'repair' && e.componentIds.includes(offer.work.componentId),
          )?.displayName
      return {
        id: offer.id,
        customerName: offer.customerName,
        description: offer.description,
        workLabel: serviceWorkLabel(offer),
        carName: model ? resolveCarDisplayName(model) : offer.car.modelId,
        payoutYen: offer.payoutYen,
        baseReputation: offer.baseReputation,
        expiresOnDay: offer.expiresOnDay,
        canAccept,
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
        context.value.hiddenIssuesById,
        context.value.economy,
      ),
    }
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
   * A car the player can work on — either an owned car or a customer's car
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
   * A component's effective condition (Sprint 22 decision 2) — cosmetically
   * repaired (raw `condition` 100) but still hiding an unfixed issue reads
   * lower here. Reuses the exact sim formula rather than re-deriving it in
   * the template — `CarIssueView.severityBand` is a display word, not the
   * numeric severity this needs.
   */
  function effectiveConditionFor(carId: string, componentId: ComponentId): number {
    const car = findWorkableCar(carId)
    if (!car) return 0
    return effectiveComponentCondition(car, componentId, context.value.hiddenIssuesById)
  }

  /**
   * A car's hidden issues (Sprint 22) — always revealed once owned (decision
   * 7: no concealment mechanic post-purchase), so no "revealed" filter here.
   */
  function issuesFor(car: CarInstance, carId: string): CarIssueView[] {
    const staged = stagedActionsFor(carId)
    return car.hiddenIssues.flatMap((revealedIssue) => {
      const catalogEntry = context.value.hiddenIssuesById[revealedIssue.issueId]
      if (!catalogEntry) return []
      return [
        {
          issueId: revealedIssue.issueId,
          componentId: catalogEntry.componentId,
          hintText: catalogEntry.hintText,
          severityBand: issueSeverityBand(revealedIssue.severityPercent, context.value.economy),
          costYen: issueRepairCostYen(
            catalogEntry,
            revealedIssue.severityPercent,
            context.value.economy,
          ),
          repaired: revealedIssue.repaired,
          staged: staged.some((a) => a.kind === 'fix-issue' && a.issueId === revealedIssue.issueId),
        },
      ]
    })
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
      issues: issuesFor(car, carId),
    }
  }

  /** Present one active service job with its resolved car name and work state. */
  function serviceJobViewFor(job: ServiceJob): ServiceJobView {
    const model = context.value.modelsById[job.car.modelId]
    return {
      id: job.id,
      customerName: job.customerName,
      description: job.description,
      workLabel: serviceWorkLabel(job),
      carId: job.car.id,
      carName: model ? resolveCarDisplayName(model) : job.car.modelId,
      payoutYen: job.payoutYen,
      baseReputation: job.baseReputation,
      workDone: isServiceWorkDone(job),
      failureReputationPenalty: reputationForFailure(job.baseReputation),
      daysLeft: job.dueOnDay === null ? null : job.dueOnDay - gameState.value.day,
    }
  }

  // --- auction & market selectors --------------------------------------

  const activeListings = computed<PublicListing[]>(() => gameState.value.activeListings)

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

  /** Derived numbers + (if inspected) revealed issues for one lot. */
  function lotDetail(lotId: string): LotDetail | undefined {
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) return undefined
    const model = context.value.modelsById[lot.modelId]
    if (!model) return undefined
    const revealedIssues = lot.inspected
      ? lot.car.hiddenIssues
          .filter((i) => i.revealed)
          .flatMap((i) => {
            const issue = context.value.hiddenIssuesById[i.issueId]
            return issue
              ? [
                  {
                    issueId: i.issueId,
                    componentId: issue.componentId,
                    hintText: issue.hintText,
                    severityBand: issueSeverityBand(i.severityPercent, context.value.economy),
                    costYen: issueRepairCostYen(issue, i.severityPercent, context.value.economy),
                  },
                ]
              : []
          })
      : []
    const modelRiskComponents = model.hiddenIssueWeights
      .filter((w) => w.weight > 0)
      .map((w) => w.componentId)
    return {
      lot,
      model,
      displayName: resolveCarDisplayName(model),
      bookValueYen: lot.bookValueYen,
      reserveYen: Math.round(
        lot.bookValueYen * context.value.economy.AUCTION_RESERVE_PRICE_FRACTION,
      ),
      inspectionFeeYen: context.value.economy.AUCTION_TRAVEL_FEE_YEN[lot.tier],
      buyoutPriceYen: computeBuyoutPriceYen(lot, gameState.value, context.value),
      currentBidYen: lot.currentBidYen,
      leadingBidder: lot.leadingBidder,
      quietDays: lot.quietDays,
      hammerThreshold: context.value.economy.AUCTION_QUIET_DAYS_TO_HAMMER,
      turnout: turnoutBand(lot, gameState.value, context.value),
      nextRaiseYen: nextRaiseYen(lot, context.value.economy),
      playerHasBid: lot.playerHasBid,
      revealedIssues,
      modelRiskComponents,
      expiresOnDay: lot.expiresOnDay,
      daysLeft: lot.expiresOnDay - gameState.value.day,
    }
  }

  /**
   * Every lot the player has ever raised on (Sprint 20: `playerHasBid`,
   * never reset) — a pure filter over `activeAuctionLots`, not a separate
   * tracked list (a lot with a bid is already fully addressable through the
   * existing catalog, so a parallel "active bids" array would just be the
   * same data twice). `activeAuctionLots` only ever holds still-active lots,
   * so "lot still active" needs no separate check here. Deliberately
   * INCLUDES lots the player is currently losing — "you're being outbid, go
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
          nextRaiseYen: nextRaiseYen(lot, context.value.economy),
          quietDays: lot.quietDays,
          hammerThreshold: context.value.economy.AUCTION_QUIET_DAYS_TO_HAMMER,
          turnout: turnoutBand(lot, gameState.value, context.value),
          expiresOnDay: lot.expiresOnDay,
          daysLeft: lot.expiresOnDay - gameState.value.day,
        },
      ]
    }),
  )

  /** Estimated same-day walk-in offer for an owned car (best-fit buyer's valuation). */
  function walkInEstimate(carId: string): WalkInEstimate {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return { buyerId: undefined, offerYen: 0 }
    const heat = gameState.value.marketHeat[car.modelId] ?? 100
    const buyer: Buyer | undefined = bestFitBuyer(
      car,
      model,
      context.value.buyers,
      context.value.partsById,
      heat,
      context.value.hiddenIssuesById,
      context.value.economy,
    )
    const offerYen = buyer
      ? valuateCarForBuyer(
          buyer,
          model,
          car,
          context.value.partsById,
          heat,
          context.value.hiddenIssuesById,
          context.value.economy,
        )
      : 0
    return { buyerId: buyer?.id, offerYen: Math.round(offerYen) }
  }

  /** Estimated public-listing asking price for an owned car (market-heat scaled). */
  function listingEstimate(carId: string): number {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return 0
    const heat = gameState.value.marketHeat[car.modelId] ?? 100
    return listPubliclyAskingPrice(
      car,
      model,
      context.value.buyers,
      context.value.partsById,
      heat,
      context.value.hiddenIssuesById,
      context.value.economy,
    )
  }

  /** Parts in inventory that fit an empty component on the given car (component + required tags). */
  function installablePartsFor(carId: string, componentId: ComponentId): PartInstance[] {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model || car.components[componentId].installed) return []
    return gameState.value.partInventory.filter((pi) => {
      const part = context.value.partsById[pi.partId]
      if (!part || part.componentId !== componentId) return false
      return part.requiredTags.every((tag) => model.tags.includes(tag))
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
      }
    }
    const serviceCar = gameState.value.activeServiceJobs.find((sj) => sj.car.id === carId)
    if (serviceCar) {
      const model = context.value.modelsById[serviceCar.car.modelId]
      return {
        carId,
        displayName: model ? resolveCarDisplayName(model) : serviceCar.car.modelId,
        isCustomerCar: true,
      }
    }
    return undefined
  }

  /**
   * One entry per service bay slot — the car in it, or null if empty.
   * Sprint 17: `serviceBayCarIds` is real, index-addressable state now (one
   * entry per physical bay), so this is a direct map, not a compact-list-
   * plus-padding reconstruction.
   */
  const serviceBaysView = computed<(ShopCarView | null)[]>(() =>
    gameState.value.serviceBayCarIds.map((id) => (id ? (shopCarView(id) ?? null) : null)),
  )

  /** The parking counterpart to `serviceBaysView` above — same shape, same
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
  /** True when neither side has a free slot — a direct move can never succeed, only a swap can. */
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
   * Move a car between parking and a service bay — instant and free, no
   * limit on how many times a day (a pure sim core the store calls
   * directly). Returns whether the move actually happened (false if the car
   * isn't in the shop, is already there, or the destination has no room —
   * see `swapCars` for that last case).
   */
  function moveCar(carId: string, to: BayKind): boolean {
    const result = applyMoves(gameState.value, [{ carInstanceId: carId, to }])
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * Swap a service-bay car and a parking car's positions atomically (Sprint
   * 11, round-2 playtest #3) — the fix for a shop that's exactly full
   * (services + parking cars == total capacity, zero slack): neither
   * direction of `moveCar` has anywhere to go, but a swap's net occupancy
   * change in each location is zero, so it always succeeds.
   */
  function swapCars(serviceCarId: string, parkingCarId: string): boolean {
    const result = swapCarsCore(gameState.value, serviceCarId, parkingCarId)
    if (!result.changed) return false
    gameState.value = result.state
    dayLog.value.push({ type: 'cars-swapped', serviceCarId, parkingCarId })
    return true
  }

  /**
   * Move (or swap) a car into a SPECIFIC slot — the real positional path
   * behind drag-and-drop (Sprint 17 playtest fix): dropping a car onto an
   * empty slot places it exactly there; dropping onto a slot occupied by a
   * different car exchanges their positions (same section or across
   * service/parking alike); dropping onto its own slot is a no-op. Unlike
   * `moveCar`/`swapCars` above (still used by the plain, non-positional
   * "→ parking"/"→ service bay" buttons and the click-fallback), this is
   * the only path that actually chooses which bay a car lands in.
   */
  function moveCarToSlot(carId: string, to: BayKind, slotIndex: number): boolean {
    const result = moveCarToSlotCore(gameState.value, carId, to, slotIndex)
    if (!result.changed) return false
    gameState.value = result.state
    dayLog.value.push({ type: 'car-moved', carInstanceId: carId, to })
    return true
  }

  /**
   * Buy the next bay of this kind — instant, usable the same day. Returns
   * false if already at the max count or unaffordable.
   */
  function buyBay(kind: BayKind): boolean {
    const result = applyBayPurchase(gameState.value, kind, context.value.facilities)
    if (!result.applied) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
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
   * Buy a piece of equipment — instant, usable the same day (unlocks REPAIR
   * on its component(s) immediately). Returns false if already owned,
   * reputation-gated, or unaffordable.
   */
  function buyEquipment(equipmentId: string): boolean {
    const result = applyEquipmentPurchase(gameState.value, equipmentId, context.value)
    if (!result.applied) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  // --- instant actions (Sprint 11) ---------------------------------------

  /**
   * Repair a component — instant. Finds the car's already-open repair job
   * for this component (if the player already started it on an earlier day)
   * or starts a new one, then immediately spends up to today's remaining
   * labor on it. A repeat click just continues the same job; no separate
   * "add labor" control needed.
   */
  function repair(carId: string, componentId: ComponentId): void {
    const car = findWorkableCar(carId)
    if (!car) return
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'repair-zone',
      componentId,
      laborSlotsRequired: repairLaborSlotsFor(car.components[componentId].condition),
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

  /** Install an owned part into an empty component — instant, same continuation rule as `repair`. */
  function install(carId: string, componentId: ComponentId, partInstanceId: string): void {
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'install-part',
      componentId,
      partInstanceId,
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
   * Whether the shop currently owns equipment covering `componentId` — what
   * REPAIR is gated on (Sprint 13). Replace never needs this; it's always
   * available.
   */
  function hasEquipmentForComponent(componentId: ComponentId): boolean {
    return hasEquipmentFor(gameState.value, componentId, context.value)
  }

  // --- staged repair/install work (Sprint 18) -----------------------------

  /**
   * True if this exact part instance is staged as an install anywhere in the
   * shop — on this car or a different one, any component. A staged part is
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

  /** Everything currently staged on one car — empty if nothing is. */
  function stagedActionsFor(carId: string): StagedAction[] {
    return gameState.value.stagedCarWork[carId] ?? []
  }

  /**
   * Every owned part not currently staged anywhere, paired with its catalog
   * entry — the pick list for staging an install (decision 3), shared by the
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
   * Stage a repair or install on a car's component — free, instant, and
   * fully reversible until Confirm. Refuses (returns false, no state change)
   * for an unknown car, a component that already has an open `Job` (decision
   * 4: staging never applies to work already in progress — that keeps its
   * existing single-click "Continue repair" flow), or an install whose part
   * is already staged elsewhere (decision 3). Staging over a component that
   * already has a *different* staged action there replaces it (decision 8) —
   * the displaced entry (and its part, for a displaced install) simply stops
   * being staged, freeing it up again.
   */
  function stageAction(carId: string, action: StagedAction): boolean {
    if (!findWorkableCar(carId)) return false
    const busy = gameState.value.jobs.some(
      (j) => j.carInstanceId === carId && j.componentId === action.componentId,
    )
    if (busy) return false
    if (action.kind === 'install' && isPartStagedAnywhere(action.partInstanceId)) return false

    const existing = stagedActionsFor(carId).filter((a) => a.componentId !== action.componentId)
    gameState.value = {
      ...gameState.value,
      stagedCarWork: { ...gameState.value.stagedCarWork, [carId]: [...existing, action] },
    }
    return true
  }

  /** Un-stage whatever's staged on this car's component, if anything — free, no-op if nothing was staged. */
  function unstageAction(carId: string, componentId: ComponentId): void {
    const remaining = stagedActionsFor(carId).filter((a) => a.componentId !== componentId)
    const stagedCarWork = { ...gameState.value.stagedCarWork }
    if (remaining.length === 0) delete stagedCarWork[carId]
    else stagedCarWork[carId] = remaining
    gameState.value = { ...gameState.value, stagedCarWork }
  }

  /**
   * Confirm — locks in every staged action on this car at once: creates or
   * continues the real jobs and spends today's remaining labor (and any
   * repair consumables) for real, through the exact same resolvers the old
   * instant-click flow always used (Sprint 18). The staged list is cleared
   * whether or not every action could be fully labored today — a
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
  }

  /** Inspect an auction lot — instant, reveals hidden issues for the cash travel fee only. */
  function inspectLot(lotId: string): boolean {
    const result = resolveInspectLot(gameState.value, lotId, context.value.economy)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * Place or raise a bid on an auction lot (Sprint 20: open-raise semantics
   * — the amount is the literal number that lands on the board, not a
   * hidden max). The lot resolves via the overnight/hammer step in
   * `endDay`; the win/loss outcome shows up in that day's report like any
   * other day-boundary event, not as inline per-lot feedback. Validates the
   * increment ladder at the store level (`bidYen >= nextRaiseYen`) before
   * ever calling the resolver — mirrors, rather than replaces, the sim's own
   * identical check in `resolvePlaceBid`, so a UI misclick is refused here
   * without a round trip through the resolver's no-op path. Returns false if
   * the lot doesn't exist or the amount doesn't clear the ladder.
   */
  function placeBid(lotId: string, bidYen: number): boolean {
    if (bidYen <= 0) return false
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) return false
    if (bidYen < nextRaiseYen(lot, context.value.economy)) return false
    const result = resolvePlaceBid(gameState.value, lotId, bidYen, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /** Buy out a lot instantly — guaranteed purchase at a premium, no rival contest. */
  function buyout(lotId: string): boolean {
    const result = resolveBuyoutInstant(gameState.value, lotId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * Buy a single catalog part directly, bypassing the cart — the primitive
   * `checkoutCart` calls per item below. Not wired to any "Buy" button on
   * `PartsMarketScreen.vue` (Sprint 14 replaced the instant per-row buy with
   * cart + checkout, specifically to stop a misclick from spending real
   * cash) but kept as a real store action for tests/dev use. Defaults to
   * 'express' — today's pre-Sprint-14 instant behavior.
   */
  function buyPart(partId: string, deliverySpeed: DeliverySpeed = 'express'): boolean {
    const result = resolveBuyPart(gameState.value, partId, context.value, deliverySpeed)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /** Add one unit of a catalog part to the cart — no cash spent yet. */
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

  /** Base-price cart total (standard delivery — no surcharge). */
  const cartStandardTotalYen = computed<number>(() =>
    cartItems.value.reduce((sum, item) => sum + item.subtotalYen, 0),
  )

  /** Cart total including the express surcharge, for the checkout screen's two-option display. */
  const cartExpressTotalYen = computed<number>(() =>
    Math.round(cartStandardTotalYen.value * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION)),
  )

  /**
   * Checkout — buys every item currently in the cart at the chosen delivery
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
    return { boughtCount, remainingCount: remaining.length }
  }

  /** Standard-delivery orders still in transit, for a "pending orders" display. */
  const pendingPartOrders = computed(() => gameState.value.pendingPartOrders)

  /**
   * Accept a service-job offer — instant. The customer's car arrives in the
   * shop (parking) the moment this is called, not "next day" — needs a free
   * parking space to take delivery.
   */
  function acceptServiceJob(offerId: string): boolean {
    const result = resolveAcceptServiceJob(gameState.value, offerId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * "Complete Job" — resolves the service job **immediately** (not on End Day):
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
        workLabel: serviceWorkLabel(job),
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
        workLabel: serviceWorkLabel(job),
        payoutYen: 0,
        reputationDelta: -entry.reputationLost,
      }
    }
    return resolution.outcome
  }

  function dismissJobResult(): void {
    lastJobResult.value = null
  }

  /** Sell an owned car via a same-day walk-in offer — instant. */
  function sellWalkIn(carId: string): boolean {
    const result = resolveSellViaWalkIn(gameState.value, carId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * List an owned car publicly — instant creation, at the asking price
   * locked in right now; the sale itself still resolves after the wait
   * (GDD 6.3's intentional "slow, market price" mechanic).
   */
  function listForSale(carId: string, waitDays?: number): boolean {
    const result = resolveListForSale(gameState.value, carId, context.value, waitDays)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  // --- day advance ------------------------------------------------------

  /**
   * End Day — purely a day-boundary tick now (Sprint 11): labor resets,
   * weekly rent/wages and market-heat drift fire on the 7-day boundary,
   * catalogs refresh and expire, and the service-job deadline backstop
   * runs. Nothing here *decides* a player action anymore — that already
   * happened, instantly, at the moment of each click.
   */
  function endDay(): void {
    const state = gameState.value
    const endedDay = state.day
    const cashBefore = state.cashYen
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
    const car = generateAuctionCarInstance(
      model,
      context.value.hiddenIssuesByComponent,
      id,
      createRng(grantCounter.value),
    )
    // Sprint 17: parking is a real indexed array now — a granted car needs an
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
      conditionPercent: 100,
      genuinePeriod: false,
    }
    gameState.value = {
      ...gameState.value,
      partInventory: [...gameState.value.partInventory, instance],
    }
  }

  /** Grant equipment for free, bypassing price/reputation — dev/test only. */
  function devGrantEquipment(equipmentId: string): void {
    if (gameState.value.ownedEquipmentIds.includes(equipmentId)) return
    gameState.value = {
      ...gameState.value,
      ownedEquipmentIds: [...gameState.value.ownedEquipmentIds, equipmentId],
    }
  }

  /** Add one more bay of this kind for free, bypassing price/reputation — dev/test only.
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
   * normally take to earn — dev/test only. Sets `reputationPoints` to that
   * tier's exact threshold (`REPUTATION_TIER_THRESHOLDS`) and re-derives
   * `reputationTier` from it in the same step, the same way every real
   * reputation change does (`applyReputationDelta`) — `reputationTier` is
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
    activeListings,
    auctionLotsByTier,
    myActiveBids,
    resolveModelName,
    partName,
    carDetail,
    effectiveConditionFor,
    lotDetail,
    walkInEstimate,
    listingEstimate,
    installablePartsFor,
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
    inspectLot,
    placeBid,
    buyout,
    buyPart,
    cartItems,
    cartStandardTotalYen,
    cartExpressTotalYen,
    addToCart,
    removeFromCart,
    checkoutCart,
    pendingPartOrders,
    sellWalkIn,
    listForSale,
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
