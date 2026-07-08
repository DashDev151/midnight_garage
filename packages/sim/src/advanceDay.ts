import type {
  AuctionLot,
  AuctionTier,
  DayLog,
  DayLogEntry,
  GameState,
  Job,
  PartInstance,
  PublicListing,
} from '@midnight-garage/content'
import type { DayActions } from './actions'
import { generateAuctionCatalog, inspectLot, resolveHandoverCondition } from './auctions'
import { type AuctionBidder, resolveAuction } from './bidding'
import {
  AUCTION_BUYOUT_PREMIUM,
  AUCTION_LOT_EXPIRY_DAYS,
  AUCTION_LOTS_PER_TIER,
  AUCTION_TRAVEL_FEE_YEN,
  COLLECTOR_NETWORK_MIN_REPUTATION,
  PUBLIC_LISTING_WAIT_DAYS,
} from './constants'
import type { SimContext } from './context'
import { applyWeeklyRentAndWages } from './finances'
import { applyLaborToJob, completeJob, createJob, isJobComplete } from './jobs'
import { availableLaborSlots } from './laborSlots'
import { driftMarketHeat } from './marketHeat'
import { createRng } from './rng'
import { computeServiceBayIncomeYen } from './serviceBay'
import { listPubliclyAskingPrice, sellViaWalkIn } from './selling'

export interface AdvanceDayResult {
  state: GameState
  log: DayLog
}

const AUCTION_TIERS: readonly AuctionTier[] = [
  'local-yard',
  'regional',
  'premium',
  'collector-network',
]

const REPUTATION_ORDER = ['unknown', 'local', 'known', 'respected', 'legend'] as const

function reputationAtLeast(
  current: GameState['reputationTier'],
  min: GameState['reputationTier'],
): boolean {
  return REPUTATION_ORDER.indexOf(current) >= REPUTATION_ORDER.indexOf(min)
}

/**
 * Sim contract: advanceDay(state, queuedActions, seed, context) -> newState + eventLog.
 * `seed` is caller-derived per day (e.g. state.seed + state.day), not read
 * from state.seed directly, so every day gets a distinct but fully
 * reproducible RNG stream from one career seed. `context` (Sprint 03
 * addition) carries the static content catalogs — models, parts, buyers,
 * hidden issues — that auction generation and valuation need; sim has no
 * data loader of its own, so the caller builds it once and passes it in.
 */
export function advanceDay(
  state: GameState,
  queuedActions: DayActions,
  seed: number,
  context: SimContext,
): AdvanceDayResult {
  const log: DayLogEntry[] = []
  const rng = createRng(seed)
  let next: GameState = state

  // 1. Create today's queued jobs.
  const jobs: Job[] = [...next.jobs]
  queuedActions.createJobs.forEach((spec, i) => {
    const job = createJob(spec, `job-${next.day}-${i}`)
    jobs.push(job)
    log.push({
      type: 'job-created',
      jobId: job.id,
      carInstanceId: job.carInstanceId,
      kind: job.kind,
    })
  })
  next = { ...next, jobs }

  // 1b. Buy parts from the market (GDD 3.1 "buy parts"). Turn-based: a bought
  // part lands in inventory this tick and is installable from the next day
  // (an install job can't reference a part-instance id that doesn't exist yet).
  queuedActions.buyParts.forEach((action, i) => {
    const part = context.partsById[action.partId]
    if (!part || next.cashYen < part.priceYen) return
    const partInstance: PartInstance = {
      id: `part-${next.day}-${i}`,
      partId: part.id,
      conditionPercent: 100,
      genuinePeriod: false,
    }
    next = {
      ...next,
      cashYen: next.cashYen - part.priceYen,
      partInventory: [...next.partInventory, partInstance],
    }
    log.push({
      type: 'part-bought',
      partId: part.id,
      partInstanceId: partInstance.id,
      priceYen: part.priceYen,
    })
  })

  // 2. Labor budget for the day, shared by lot inspections and job assignments.
  const available = availableLaborSlots(next)
  let remainingLabor = available

  // 2a. Inspect lots (GDD 6.5: 1 labor slot + a travel fee, reveals hidden issues).
  const lotsById = new Map(next.activeAuctionLots.map((lot) => [lot.id, lot]))
  for (const { lotId } of queuedActions.inspectLots) {
    const lot = lotsById.get(lotId)
    if (!lot || lot.inspected || remainingLabor <= 0) continue
    const fee = AUCTION_TRAVEL_FEE_YEN[lot.tier]
    if (next.cashYen < fee) continue
    lotsById.set(lotId, inspectLot(lot))
    remainingLabor -= 1
    next = { ...next, cashYen: next.cashYen - fee }
    log.push({ type: 'lot-inspected', lotId })
  }
  next = { ...next, activeAuctionLots: Array.from(lotsById.values()) }

  // 2b. Apply labor assignments to jobs, clamped to what's left of the budget.
  const requestedJobLabor = queuedActions.laborAssignments.reduce((sum, a) => sum + a.laborSlots, 0)
  if (requestedJobLabor > remainingLabor) {
    log.push({
      type: 'labor-overbooked',
      requestedSlots: requestedJobLabor,
      availableSlots: remainingLabor,
    })
  }

  const jobsById = new Map(next.jobs.map((job) => [job.id, job]))
  for (const assignment of queuedActions.laborAssignments) {
    if (remainingLabor <= 0) break
    const job = jobsById.get(assignment.jobId)
    if (!job || isJobComplete(job)) continue
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    const slotsToApply = Math.min(assignment.laborSlots, remainingLabor, need)
    if (slotsToApply <= 0) continue
    jobsById.set(job.id, applyLaborToJob(job, slotsToApply))
    remainingLabor -= slotsToApply
    log.push({ type: 'job-progress', jobId: job.id, laborSlotsSpent: slotsToApply })
  }
  next = { ...next, jobs: Array.from(jobsById.values()) }

  // 3. Complete any jobs that hit their labor requirement today.
  const stillOpen: Job[] = []
  for (const job of next.jobs) {
    if (!isJobComplete(job)) {
      stillOpen.push(job)
      continue
    }
    const result = completeJob(next, job)
    next = result.state
    if (result.blockedByOccupiedSlot) {
      log.push({ type: 'job-blocked', jobId: job.id, reason: 'slot-occupied' })
      stillOpen.push(job)
      continue
    }
    log.push({
      type: 'job-completed',
      jobId: job.id,
      carInstanceId: job.carInstanceId,
      kind: job.kind,
    })
  }
  next = { ...next, jobs: stillOpen }

  // 4. Resolve queued auction actions. Buyouts first (guaranteed purchase at
  // a premium, no contest), then competitive bids on what's left.
  const remainingLots = new Map(next.activeAuctionLots.map((lot) => [lot.id, lot]))
  const aiBidders: AuctionBidder[] = context.buyers.map((buyer) => ({ id: buyer.id, buyer }))

  for (const { lotId } of queuedActions.buyoutLots) {
    const lot = remainingLots.get(lotId)
    if (!lot) continue
    const priceYen = Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
    if (next.cashYen < priceYen) continue
    remainingLots.delete(lotId)
    const car = resolveHandoverCondition(lot, priceYen, context.hiddenIssuesById, rng)
    next = { ...next, cashYen: next.cashYen - priceYen, ownedCars: [...next.ownedCars, car] }
    log.push({ type: 'lot-bought-out', lotId, priceYen })
  }

  for (const bid of queuedActions.bidsOnLots) {
    const lot = remainingLots.get(bid.lotId)
    if (!lot) continue
    const model = context.modelsById[lot.modelId]
    if (!model) continue

    const result = resolveAuction(lot, model, bid.maxBidYen, aiBidders, context.partsById)
    if (result.winner === 'no-sale') continue

    remainingLots.delete(bid.lotId)
    if (result.winner === 'player') {
      const finalCar = resolveHandoverCondition(
        lot,
        result.finalPriceYen,
        context.hiddenIssuesById,
        rng,
      )
      next = {
        ...next,
        cashYen: next.cashYen - result.finalPriceYen,
        ownedCars: [...next.ownedCars, finalCar],
      }
      log.push({ type: 'auction-bid-won', lotId: lot.id, finalPriceYen: result.finalPriceYen })
    } else {
      log.push({ type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: result.finalPriceYen })
    }
  }
  next = { ...next, activeAuctionLots: Array.from(remainingLots.values()) }

  // 5. Sell via walk-in offer (same-day resolution).
  for (const { carInstanceId } of queuedActions.sellViaWalkIn) {
    const carIndex = next.ownedCars.findIndex((c) => c.id === carInstanceId)
    const car = carIndex === -1 ? undefined : next.ownedCars[carIndex]
    if (!car) continue
    const model = context.modelsById[car.modelId]
    if (!model || context.buyers.length === 0) continue

    const offer = sellViaWalkIn(car, model, context.buyers, context.partsById, rng)
    next = {
      ...next,
      cashYen: next.cashYen + offer.priceYen,
      ownedCars: next.ownedCars.filter((c) => c.id !== carInstanceId),
    }
    log.push({
      type: 'car-sold',
      carInstanceId,
      channel: 'walk-in-offer',
      priceYen: offer.priceYen,
    })
  }

  // 6. List for sale (multi-day, GDD 6.3: "slow, market price").
  const newListings: PublicListing[] = []
  queuedActions.listForSale.forEach((action, i) => {
    const carIndex = next.ownedCars.findIndex((c) => c.id === action.carInstanceId)
    const car = carIndex === -1 ? undefined : next.ownedCars[carIndex]
    if (!car) return
    const model = context.modelsById[car.modelId]
    if (!model || context.buyers.length === 0) return

    const marketHeatPercent = next.marketHeat[car.modelId] ?? 100
    const askingPriceYen = listPubliclyAskingPrice(
      car,
      model,
      context.buyers,
      context.partsById,
      marketHeatPercent,
    )
    const waitDays = action.waitDays ?? PUBLIC_LISTING_WAIT_DAYS
    const listing: PublicListing = {
      id: `listing-${next.day}-${i}`,
      carInstanceId: action.carInstanceId,
      modelId: car.modelId,
      askingPriceYen,
      resolvesOnDay: next.day + waitDays,
    }
    newListings.push(listing)
    next = { ...next, ownedCars: next.ownedCars.filter((c) => c.id !== action.carInstanceId) }
    log.push({
      type: 'listing-created',
      listingId: listing.id,
      carInstanceId: action.carInstanceId,
      askingPriceYen,
      resolvesOnDay: listing.resolvesOnDay,
    })
  })
  next = { ...next, activeListings: [...next.activeListings, ...newListings] }

  // 7. Resolve public listings due today — a guaranteed sale at the locked asking price.
  const stillListed: PublicListing[] = []
  for (const listing of next.activeListings) {
    if (listing.resolvesOnDay > next.day) {
      stillListed.push(listing)
      continue
    }
    next = { ...next, cashYen: next.cashYen + listing.askingPriceYen }
    log.push({
      type: 'car-sold',
      carInstanceId: listing.carInstanceId,
      channel: 'list-publicly',
      priceYen: listing.askingPriceYen,
    })
  }
  next = { ...next, activeListings: stillListed }

  // 8. Expire unsold auction lots, then refresh weekly catalogs (day 7 boundary).
  const unexpiredLots = next.activeAuctionLots.filter((lot) => lot.expiresOnDay > next.day)
  next = { ...next, activeAuctionLots: unexpiredLots }

  if (next.day % 7 === 0) {
    const freshLots: AuctionLot[] = []
    for (const tier of AUCTION_TIERS) {
      if (
        tier === 'collector-network' &&
        !reputationAtLeast(next.reputationTier, COLLECTOR_NETWORK_MIN_REPUTATION)
      ) {
        continue
      }
      const lots = generateAuctionCatalog(
        context.models,
        tier,
        context.hiddenIssuesByZone,
        next.day,
        AUCTION_LOTS_PER_TIER[tier],
        AUCTION_LOT_EXPIRY_DAYS,
        rng,
      )
      if (lots.length === 0) continue
      freshLots.push(...lots)
      log.push({ type: 'auction-catalog-refreshed', tier, lotCount: lots.length })
    }
    next = { ...next, activeAuctionLots: [...next.activeAuctionLots, ...freshLots] }
  }

  // 9. Daily service-bay income.
  const serviceIncome = computeServiceBayIncomeYen(next.staff, next.reputationTier)
  if (serviceIncome > 0) {
    next = { ...next, cashYen: next.cashYen + serviceIncome }
    log.push({ type: 'service-bay-income', amountYen: serviceIncome })
  }

  // 10. Weekly rent/wages + market-heat drift (both fire on 7-day boundaries).
  const finances = applyWeeklyRentAndWages(next)
  next = finances.state
  log.push(...finances.log)

  const heat = driftMarketHeat(next, rng)
  next = heat.state
  log.push(...heat.log)

  // 11. The day itself passes.
  next = { ...next, day: next.day + 1 }

  return { state: next, log }
}
