import {
  BUYERS,
  CARS,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
  SERVICE_JOB_TEMPLATES,
} from '@midnight-garage/content'
import type {
  AuctionLot,
  AuctionTier,
  BayKind,
  Buyer,
  CarInstance,
  CarModel,
  DayLogEntry,
  GameState,
  Job,
  Part,
  PartInstance,
  PublicListing,
  ServiceJob,
  Slot,
  StatBlock,
  Zone,
} from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  advanceDay,
  applyBayPurchase,
  applyMoves,
  AUCTION_BUYOUT_PREMIUM,
  AUCTION_RESERVE_PRICE_FRACTION,
  AUCTION_TRAVEL_FEE_YEN,
  availableLaborSlots,
  bestFitBuyer,
  buildSimContext,
  computeDerivedStats,
  computeLotInterest,
  createInitialGameState,
  createRng,
  DayActionsSchema,
  generateAuctionCarInstance,
  hasParkingSpace,
  isServiceWorkDone,
  listPubliclyAskingPrice,
  nextBayPriceYen,
  parkingOccupancy,
  reputationForFailure,
  resolveServiceJob,
  valuateCarForBuyer,
  type AuctionBidder,
  type DayActions,
  type LaborAssignment,
  type LotInterest,
  type NewJobSpec,
  type SimContext,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { INSTALL_LABOR_SLOTS, repairLaborSlotsFor } from '../constants'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { loadSave, writeSave } from '../save/saveDb'

/** A fully-defaulted, typed empty action set - End Day with nothing queued. */
export function emptyActions(): DayActions {
  return DayActionsSchema.parse({})
}

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
  jobs: Job[]
  pendingJobs: NewJobSpec[]
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
  return job.work.kind === 'repair' ? `Repair ${job.work.zone}` : `Install ${job.work.slot} part`
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
  accepted: boolean
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
  revealedIssues: { zone: Zone; hintText: string }[]
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
 * The state bridge between the pure sim and Vue. Holds the one object
 * Dexie will persist in Sprint 7 (`gameState`), the static content
 * `context` (rebuilt each session, never saved), the running day log, and
 * the player's not-yet-committed job plan (`pendingJobs`) for the current
 * day. The interactive per-day seed uses the same `seed + day` derivation
 * as the balance harness, so a played game is as reproducible as a bot
 * career.
 */
export const useGameStore = defineStore('game', () => {
  // Content catalogs are static and heavy; shallowRef avoids deep reactivity we never mutate.
  const context = shallowRef<SimContext>(
    buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES, SERVICE_JOB_TEMPLATES, FACILITIES),
  )
  const gameState = ref<GameState>(createInitialGameState(context.value, DEFAULT_SEED))
  const dayLog = ref<DayLogEntry[]>([])
  // The player's not-yet-committed plan for the current day - the full set of
  // actions (jobs, bids, inspections, sells, listings, part buys) assembled
  // over the day and applied on End Day. laborAssignments are auto-planned at
  // commit, so this holds everything except that.
  const pending = ref<DayActions>(emptyActions())
  // Monotonic counter for dev-granted content ids (dev-only, so non-deterministic is fine).
  const grantCounter = ref(0)
  // End-of-day report shown after a player-committed day.
  const lastDayReport = ref<DayReport | null>(null)
  const reportVisible = ref(false)

  const day = computed(() => gameState.value.day)
  const cashYen = computed(() => gameState.value.cashYen)
  const reputationTier = computed(() => gameState.value.reputationTier)
  const reputationPoints = computed(() => gameState.value.reputationPoints)
  const ownedCarCount = computed(() => gameState.value.ownedCars.length)
  const laborSlotsPerDay = computed(() => availableLaborSlots(gameState.value))
  const serviceJobOffers = computed(() => gameState.value.serviceJobOffers)
  const activeServiceJobs = computed(() => gameState.value.activeServiceJobs)
  const pendingJobs = computed(() => pending.value.createJobs)

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
        accepted: pending.value.acceptServiceJobs.some((a) => a.offerId === offer.id),
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
      pendingJobs: pendingJobs.value.filter((j) => j.carInstanceId === carId),
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

  // The rival bidder field is the same for every lot; build it once.
  const aiBidders = computed<AuctionBidder[]>(() =>
    context.value.buyers.map((buyer) => ({ id: buyer.id, buyer })),
  )

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
            return issue ? [{ zone: issue.zone, hintText: issue.hintText }] : []
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
      interest: computeLotInterest(lot, model, aiBidders.value, context.value.partsById, 0),
      revealedIssues,
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

  /** Parts in inventory that fit an empty slot on the given car (slot + required tags). */
  function installablePartsFor(carId: string, slot: Slot): PartInstance[] {
    const car = findWorkableCar(carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model || car.buildSheet[slot]) return []
    return gameState.value.partInventory.filter((pi) => {
      const part = context.value.partsById[pi.partId]
      if (!part || part.slot !== slot) return false
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

  /** Price of the next bay of this kind, or null once it's maxed out. */
  function nextBayPrice(kind: BayKind): number | null {
    return nextBayPriceYen(gameState.value, kind, context.value.facilities)
  }

  /**
   * Move a car between parking and a service bay — instant and free, no
   * limit on how many times a day (mirrors resolveServiceJob's pattern: a
   * pure sim core the store calls directly, rather than a queued DayAction).
   * Returns whether the move actually happened (false if the car isn't in
   * the shop, is already there, or the destination has no room).
   */
  function moveCar(carId: string, to: BayKind): boolean {
    const result = applyMoves(gameState.value, [{ carInstanceId: carId, to }])
    if (result.log.length === 0) return false
    gameState.value = result.state
    dayLog.value.push(...result.log)
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

  // --- day planning -----------------------------------------------------

  function isZoneBusy(carId: string, zone: Zone): boolean {
    const inProgress = gameState.value.jobs.some(
      (j) => j.carInstanceId === carId && j.kind === 'repair-zone' && j.zone === zone,
    )
    const queued = pending.value.createJobs.some(
      (j) => j.carInstanceId === carId && j.kind === 'repair-zone' && j.zone === zone,
    )
    return inProgress || queued
  }

  /** Queue a zone repair for the current day (committed on End Day). */
  function queueRepair(carId: string, zone: Zone): void {
    const car = findWorkableCar(carId)
    if (!car || isZoneBusy(carId, zone)) return
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'repair-zone',
      zone,
      laborSlotsRequired: repairLaborSlotsFor(car.condition[zone]),
    }
    pending.value = { ...pending.value, createJobs: [...pending.value.createJobs, spec] }
  }

  /** Queue installing an owned part into an empty slot (committed on End Day). */
  function queueInstall(carId: string, slot: Slot, partInstanceId: string): void {
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'install-part',
      slot,
      partInstanceId,
      laborSlotsRequired: INSTALL_LABOR_SLOTS,
    }
    pending.value = { ...pending.value, createJobs: [...pending.value.createJobs, spec] }
  }

  /** Queue inspecting an auction lot (costs a labor slot + travel fee on End Day). */
  function queueInspect(lotId: string): void {
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot || lot.inspected) return
    if (pending.value.inspectLots.some((a) => a.lotId === lotId)) return
    pending.value = { ...pending.value, inspectLots: [...pending.value.inspectLots, { lotId }] }
  }

  /** Queue a max bid on an auction lot (resolved second-price on End Day). */
  function queueBid(lotId: string, maxBidYen: number): void {
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot || maxBidYen <= 0) return
    const rest = pending.value.bidsOnLots.filter((b) => b.lotId !== lotId)
    pending.value = { ...pending.value, bidsOnLots: [...rest, { lotId, maxBidYen }] }
  }

  /** Queue an instant buyout of a lot (guaranteed win at a premium on End Day). */
  function queueBuyout(lotId: string): void {
    const lot = gameState.value.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) return
    if (pending.value.buyoutLots.some((a) => a.lotId === lotId)) return
    pending.value = { ...pending.value, buyoutLots: [...pending.value.buyoutLots, { lotId }] }
  }

  /** Queue buying a catalog part into inventory (paid on End Day). */
  function queueBuyPart(partId: string): void {
    const part = context.value.partsById[partId]
    if (!part) return
    pending.value = { ...pending.value, buyParts: [...pending.value.buyParts, { partId }] }
  }

  /**
   * Queue accepting a service job — the customer's car enters the shop on End
   * Day, where the player then does the real work (buy parts, assign labor).
   */
  function queueAcceptServiceJob(offerId: string): void {
    const offer = gameState.value.serviceJobOffers.find((o) => o.id === offerId)
    if (!offer) return
    if (pending.value.acceptServiceJobs.some((a) => a.offerId === offerId)) return
    pending.value = {
      ...pending.value,
      acceptServiceJobs: [...pending.value.acceptServiceJobs, { offerId }],
    }
  }

  /**
   * "Complete Job" — resolves the service job **immediately** (not on End Day):
   * if the work is done the payout lands and reputation is granted; if not, the
   * job is failed (reputation penalty, no pay). Either way the car leaves now.
   * Returns the outcome so the UI can show instant feedback.
   */
  function completeServiceJob(jobId: string): 'paid' | 'failed' | 'not-found' {
    const resolution = resolveServiceJob(gameState.value, jobId, context.value)
    if (resolution.outcome === 'not-found') return 'not-found'
    gameState.value = resolution.state
    dayLog.value.push(...resolution.log)
    return resolution.outcome
  }

  /** Queue selling an owned car via a same-day walk-in offer. */
  function queueSellWalkIn(carId: string): void {
    if (!gameState.value.ownedCars.some((c) => c.id === carId)) return
    if (pending.value.sellViaWalkIn.some((a) => a.carInstanceId === carId)) return
    pending.value = {
      ...pending.value,
      sellViaWalkIn: [...pending.value.sellViaWalkIn, { carInstanceId: carId }],
    }
  }

  /** Queue listing an owned car publicly (resolves after the wait). */
  function queueListForSale(carId: string, waitDays?: number): void {
    if (!gameState.value.ownedCars.some((c) => c.id === carId)) return
    if (pending.value.listForSale.some((a) => a.carInstanceId === carId)) return
    pending.value = {
      ...pending.value,
      listForSale: [...pending.value.listForSale, { carInstanceId: carId, waitDays }],
    }
  }

  function clearPending(): void {
    pending.value = emptyActions()
  }

  /**
   * Auto-allocates the day's labor slots (inspections eat a slot each first,
   * matching advanceDay's order, then in-progress jobs, then newly-queued
   * jobs) and returns the full DayActions to commit. Predicted ids for new
   * jobs match advanceDay's `job-${day}-${index}` scheme. Only jobs whose car
   * is CURRENTLY in a service bay get labor — moves are instant, so any move
   * the player made is already reflected in gameState by the time this runs;
   * a job on a parked car is left queued but makes no progress (advanceDay
   * would skip it anyway — this just avoids spending the labor budget on it).
   */
  function planActions(): DayActions {
    let remaining = Math.max(0, laborSlotsPerDay.value - pending.value.inspectLots.length)
    const laborAssignments: LaborAssignment[] = []
    const inServiceBay = (carId: string) => gameState.value.serviceBayCarIds.includes(carId)

    for (const job of gameState.value.jobs) {
      if (remaining <= 0) break
      if (!inServiceBay(job.carInstanceId)) continue
      const need = job.laborSlotsRequired - job.laborSlotsSpent
      if (need <= 0) continue
      const slots = Math.min(need, remaining)
      laborAssignments.push({ jobId: job.id, laborSlots: slots })
      remaining -= slots
    }

    pending.value.createJobs.forEach((spec, i) => {
      if (remaining <= 0) return
      if (!inServiceBay(spec.carInstanceId)) return
      const slots = Math.min(spec.laborSlotsRequired, remaining)
      laborAssignments.push({ jobId: `job-${gameState.value.day}-${i}`, laborSlots: slots })
      remaining -= slots
    })

    return DayActionsSchema.parse({ ...pending.value, laborAssignments })
  }

  // --- day advance ------------------------------------------------------

  function advance(actions: DayActions): void {
    const state = gameState.value
    const endedDay = state.day
    const cashBefore = state.cashYen
    const result = advanceDay(state, actions, state.seed + state.day, context.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)
    lastDayReport.value = {
      day: endedDay,
      entries: result.log,
      cashDeltaYen: result.state.cashYen - cashBefore,
    }
  }

  /** Low-level advance (dev warp, tests). Does not touch the pending plan or pop the report. */
  function endDay(actions: DayActions = emptyActions()): void {
    advance(actions)
  }

  /** Player-facing End Day: commit the queued plan, then show the day's report. */
  function commitDay(): void {
    advance(planActions())
    clearPending()
    reportVisible.value = true
  }

  function dismissReport(): void {
    reportVisible.value = false
  }

  /** Start a fresh career. Defaults to a random seed so players don't all get the same run. */
  function newGame(seed: number = randomSeed()): void {
    gameState.value = createInitialGameState(context.value, seed)
    dayLog.value = []
    clearPending()
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
      clearPending()
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
      clearPending()
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
      context.value.hiddenIssuesByZone,
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
    pending,
    pendingJobs,
    day,
    cashYen,
    reputationTier,
    reputationPoints,
    ownedCarCount,
    laborSlotsPerDay,
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
    nextBayPrice,
    moveCar,
    buyBay,
    queueRepair,
    queueInstall,
    queueInspect,
    queueBid,
    queueBuyout,
    queueBuyPart,
    queueSellWalkIn,
    queueListForSale,
    queueAcceptServiceJob,
    completeServiceJob,
    clearPending,
    endDay,
    commitDay,
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
