import { BUYERS, CARS, HIDDEN_ISSUES, PARTS } from '@midnight-garage/content'
import type {
  AuctionLot,
  AuctionTier,
  Buyer,
  CarInstance,
  CarModel,
  DayLogEntry,
  GameState,
  Job,
  Part,
  PartInstance,
  PublicListing,
  Slot,
  StatBlock,
  Zone,
} from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  advanceDay,
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
  listPubliclyAskingPrice,
  valuateCarForBuyer,
  type AuctionBidder,
  type DayActions,
  type LaborAssignment,
  type LotInterest,
  type NewJobSpec,
  type SimContext,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { INSTALL_LABOR_SLOTS, repairLaborSlotsFor } from '../constants'

/** A fully-defaulted, typed empty action set - End Day with nothing queued. */
export function emptyActions(): DayActions {
  return DayActionsSchema.parse({})
}

/** Fixed default seed for a new game until seed selection is a real feature. */
const DEFAULT_SEED = 1

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
  const context = shallowRef<SimContext>(buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES))
  const gameState = ref<GameState>(createInitialGameState(context.value, DEFAULT_SEED))
  const dayLog = ref<DayLogEntry[]>([])
  // The player's not-yet-committed plan for the current day - the full set of
  // actions (jobs, bids, inspections, sells, listings, part buys) assembled
  // over the day and applied on End Day. laborAssignments are auto-planned at
  // commit, so this holds everything except that.
  const pending = ref<DayActions>(emptyActions())
  // Monotonic counter for dev-granted content ids (dev-only, so non-deterministic is fine).
  const grantCounter = ref(0)

  const day = computed(() => gameState.value.day)
  const cashYen = computed(() => gameState.value.cashYen)
  const reputationTier = computed(() => gameState.value.reputationTier)
  const ownedCarCount = computed(() => gameState.value.ownedCars.length)
  const laborSlotsPerDay = computed(() => availableLaborSlots(gameState.value))
  const pendingJobs = computed(() => pending.value.createJobs)

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

  /** Full detail bundle for one owned car, or undefined if not owned. */
  function carDetail(carId: string): CarDetail | undefined {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    if (!car) return undefined
    return {
      ...detailFor(car),
      jobs: gameState.value.jobs.filter((j) => j.carInstanceId === carId),
      pendingJobs: pendingJobs.value.filter((j) => j.carInstanceId === carId),
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
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model || car.buildSheet[slot]) return []
    return gameState.value.partInventory.filter((pi) => {
      const part = context.value.partsById[pi.partId]
      if (!part || part.slot !== slot) return false
      return part.requiredTags.every((tag) => model.tags.includes(tag))
    })
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
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
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
   * jobs match advanceDay's `job-${day}-${index}` scheme.
   */
  function planActions(): DayActions {
    let remaining = Math.max(0, laborSlotsPerDay.value - pending.value.inspectLots.length)
    const laborAssignments: LaborAssignment[] = []

    for (const job of gameState.value.jobs) {
      if (remaining <= 0) break
      const need = job.laborSlotsRequired - job.laborSlotsSpent
      if (need <= 0) continue
      const slots = Math.min(need, remaining)
      laborAssignments.push({ jobId: job.id, laborSlots: slots })
      remaining -= slots
    }

    pending.value.createJobs.forEach((spec, i) => {
      if (remaining <= 0) return
      const slots = Math.min(spec.laborSlotsRequired, remaining)
      laborAssignments.push({ jobId: `job-${gameState.value.day}-${i}`, laborSlots: slots })
      remaining -= slots
    })

    return DayActionsSchema.parse({ ...pending.value, laborAssignments })
  }

  // --- day advance ------------------------------------------------------

  function advance(actions: DayActions): void {
    const state = gameState.value
    const result = advanceDay(state, actions, state.seed + state.day, context.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)
  }

  /** Low-level advance (dev warp, tests). Does not touch the pending plan. */
  function endDay(actions: DayActions = emptyActions()): void {
    advance(actions)
  }

  /** Player-facing End Day: commit the queued plan with auto-planned labor. */
  function commitDay(): void {
    advance(planActions())
    clearPending()
  }

  function newGame(seed: number = DEFAULT_SEED): void {
    gameState.value = createInitialGameState(context.value, seed)
    dayLog.value = []
    clearPending()
  }

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
    ownedCarCount,
    laborSlotsPerDay,
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
    queueRepair,
    queueInstall,
    queueInspect,
    queueBid,
    queueBuyout,
    queueBuyPart,
    queueSellWalkIn,
    queueListForSale,
    clearPending,
    endDay,
    commitDay,
    newGame,
    devGiveCash,
    devGrantCar,
    devGrantPart,
  }
})
