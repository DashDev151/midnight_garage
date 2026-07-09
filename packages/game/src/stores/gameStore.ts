import {
  BUYERS,
  CARS,
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
  GameState,
  Job,
  Part,
  PartInstance,
  PublicListing,
  ServiceJob,
  StatBlock,
} from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  applyBayPurchase,
  applyMoves,
  AUCTION_BUYOUT_PREMIUM,
  AUCTION_RESERVE_PRICE_FRACTION,
  AUCTION_TRAVEL_FEE_YEN,
  availableLaborSlots,
  advanceDay,
  bestFitBuyer,
  buildSimContext,
  computeDerivedStats,
  computeLotInterest,
  createInitialGameState,
  createRng,
  emptyDayActions,
  generateAuctionCarInstance,
  hasParkingSpace,
  isServiceWorkDone,
  listPubliclyAskingPrice,
  nextBayPriceYen,
  parkingOccupancy,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveBidInstant,
  resolveBuyoutInstant,
  resolveBuyPart,
  resolveInspectLot,
  resolveJobLabor,
  resolveListForSale,
  resolveSellViaWalkIn,
  resolveServiceJob,
  swapCars as swapCarsCore,
  valuateCarForBuyer,
  type LotInterest,
  type NewJobSpec,
  type ServiceJobOutcome,
  type SimContext,
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

/** Everything the car-detail screen needs for one car. */
export interface CarDetail extends DetailedCar {
  /** Jobs currently in progress on this car — created and labored on instantly (Sprint 11). */
  jobs: Job[]
  /** Set when this car belongs to a service job the player is working. */
  serviceJob?: ServiceJobView
  /** Whether this car is currently in a service bay (labor only reaches it if so). */
  inServiceBay: boolean
}

/** A car sitting somewhere in the shop (a service bay or parking), for the bay layout. */
export interface ShopCarView {
  carId: string
  displayName: string
  /** True for a customer's car in for a service job — never owned. */
  isCustomerCar: boolean
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

/** Immediate feedback for a resolved bid (Sprint 11) — shown inline on the lot's card. */
export interface BidResultView {
  outcome: 'won' | 'lost' | 'no-sale'
  priceYen: number
}

/** An auction lot with the derived numbers the auction screen shows. */
export interface LotDetail {
  lot: AuctionLot
  model: CarModel
  displayName: string
  bookValueYen: number
  reserveYen: number
  inspectionFeeYen: number
  buyoutPriceYen: number
  /** Fuzzy rival-demand read for bid calibration. */
  interest: LotInterest
  /** Revealed hidden issues (only populated once the lot is inspected). */
  revealedIssues: { componentId: ComponentId; hintText: string }[]
  /** The last bid this session resolved against this lot, if any. */
  lastBidResult?: BidResultView
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
  // Immediate feedback per lot, shown inline on the auction screen (Sprint 11 decision 3).
  const bidResults = ref<Record<string, BidResultView>>({})

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
      return {
        id: offer.id,
        customerName: offer.customerName,
        description: offer.description,
        workLabel: serviceWorkLabel(offer),
        carName: model ? resolveCarDisplayName(model) : offer.car.modelId,
        payoutYen: offer.payoutYen,
        baseReputation: offer.baseReputation,
        expiresOnDay: offer.expiresOnDay,
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
      stats: computeDerivedStats(model, car, context.value.partsById),
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
            return issue ? [{ componentId: issue.componentId, hintText: issue.hintText }] : []
          })
      : []
    return {
      lot,
      model,
      displayName: resolveCarDisplayName(model),
      bookValueYen: lot.bookValueYen,
      reserveYen: Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION),
      inspectionFeeYen: AUCTION_TRAVEL_FEE_YEN[lot.tier],
      buyoutPriceYen: Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM),
      // precision 0 for now; a future auction-scout staff trait raises it.
      interest: computeLotInterest(lot, model, context.value.buyers, context.value.partsById, 0),
      revealedIssues,
      lastBidResult: bidResults.value[lotId],
    }
  }

  /** Estimated same-day walk-in offer for an owned car (best-fit buyer's valuation). */
  function walkInEstimate(carId: string): WalkInEstimate {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return { buyerId: undefined, offerYen: 0 }
    const buyer: Buyer | undefined = bestFitBuyer(
      car,
      model,
      context.value.buyers,
      context.value.partsById,
    )
    const offerYen = buyer ? valuateCarForBuyer(buyer, model, car, context.value.partsById) : 0
    return { buyerId: buyer?.id, offerYen: Math.round(offerYen) }
  }

  /** Estimated public-listing asking price for an owned car (market-heat scaled). */
  function listingEstimate(carId: string): number {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model) return 0
    const heat = gameState.value.marketHeat[car.modelId] ?? 100
    return listPubliclyAskingPrice(car, model, context.value.buyers, context.value.partsById, heat)
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

  /** One entry per service bay slot — the car in it, or null if empty. */
  const serviceBaysView = computed<(ShopCarView | null)[]>(() => {
    const slots: (ShopCarView | null)[] = gameState.value.serviceBayCarIds
      .map(shopCarView)
      .filter((v): v is ShopCarView => v !== undefined)
    while (slots.length < gameState.value.serviceBayCount) slots.push(null)
    return slots
  })

  /** Every shop car not currently in a service bay (owned + customer cars alike). */
  const parkingView = computed<ShopCarView[]>(() => {
    const inBay = new Set(gameState.value.serviceBayCarIds)
    const ownedParked = gameState.value.ownedCars
      .filter((c) => !inBay.has(c.id))
      .map((c) => shopCarView(c.id)!)
    const customerParked = gameState.value.activeServiceJobs
      .filter((sj) => !inBay.has(sj.car.id))
      .map((sj) => shopCarView(sj.car.id)!)
    return [...ownedParked, ...customerParked]
  })

  const parkingCapacity = computed(() => gameState.value.parkingBayCount)
  const parkingOccupancyCount = computed(() => parkingOccupancy(gameState.value))
  const parkingFull = computed(() => !hasParkingSpace(gameState.value))
  const serviceBayCount = computed(() => gameState.value.serviceBayCount)
  const serviceBayFreeCount = computed(
    () => gameState.value.serviceBayCount - gameState.value.serviceBayCarIds.length,
  )
  /** True when neither side has a free slot — a direct move can never succeed, only a swap can. */
  const shopAtCapacity = computed(() => parkingFull.value && serviceBayFreeCount.value <= 0)

  /** Price of the next bay of this kind, or null once it's maxed out. */
  function nextBayPrice(kind: BayKind): number | null {
    return nextBayPriceYen(gameState.value, kind, context.value.facilities)
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
    const result = resolveJobLabor(gameState.value, spec, laborSlotsRemainingToday.value)
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
    const result = resolveJobLabor(gameState.value, spec, laborSlotsRemainingToday.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)
  }

  /** Inspect an auction lot — instant, reveals hidden issues for the cash travel fee only. */
  function inspectLot(lotId: string): boolean {
    const result = resolveInspectLot(gameState.value, lotId)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * Place a max bid on an auction lot — resolves instantly (second-price,
   * against the lot's already-seeded rival field). Populates the per-lot
   * `lastBidResult` so `AuctionScreen` can show "won at ¥X" / "lost to ¥X"
   * inline on the lot's own card, replacing the old "bid queued" text.
   */
  function placeBid(lotId: string, maxBidYen: number): void {
    if (maxBidYen <= 0) return
    const result = resolveBidInstant(gameState.value, lotId, maxBidYen, context.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)

    const won = result.log.find((e) => e.type === 'auction-bid-won')
    const lost = result.log.find((e) => e.type === 'auction-bid-lost')
    const view: BidResultView =
      won?.type === 'auction-bid-won'
        ? { outcome: 'won', priceYen: won.finalPriceYen }
        : lost?.type === 'auction-bid-lost'
          ? { outcome: 'lost', priceYen: lost.winningPriceYen }
          : { outcome: 'no-sale', priceYen: 0 }
    bidResults.value = { ...bidResults.value, [lotId]: view }
  }

  /** Buy out a lot instantly — guaranteed purchase at a premium, no rival contest. */
  function buyout(lotId: string): boolean {
    const result = resolveBuyoutInstant(gameState.value, lotId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /** Buy a catalog part into inventory — instant, installable immediately. */
  function buyPart(partId: string): boolean {
    const result = resolveBuyPart(gameState.value, partId, context.value)
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
    return true
  }

  /**
   * Accept a service-job offer — instant. The customer's car arrives in the
   * shop (parking) the moment this is called, not "next day" — needs a free
   * parking space to take delivery.
   */
  function acceptServiceJob(offerId: string): boolean {
    const result = resolveAcceptServiceJob(gameState.value, offerId)
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
    bidResults.value = {}
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
      bidResults.value = {}
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
      bidResults.value = {}
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
    gameState.value = { ...gameState.value, ownedCars: [...gameState.value.ownedCars, car] }
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
    resolveModelName,
    partName,
    carDetail,
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
    moveCar,
    swapCars,
    buyBay,
    repair,
    install,
    inspectLot,
    placeBid,
    buyout,
    buyPart,
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
  }
})
