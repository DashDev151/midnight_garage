import type { DayLog, DayLogEntry, GameState, Job, PublicListing } from '@midnight-garage/content'
import type { DayActions } from './actions'
import { resolveBidInstant, resolveBuyoutInstant } from './bidding'
import { resolveInspectLot } from './auctions'
import { refreshCatalogs } from './catalogs'
import type { SimContext } from './context'
import { applyEquipmentPurchases } from './equipment'
import { applyWeeklyRentAndWages } from './finances'
import { applyBayPurchases, applyMoves } from './facilities'
import {
  applyAvailableLaborToJob,
  completeJob,
  createJob,
  isJobComplete,
  repairJobGate,
} from './jobs'
import { availableLaborSlots } from './laborSlots'
import { driftMarketHeat } from './marketHeat'
import { resolveBuyPart } from './parts'
import { createRng } from './rng'
import { computeServiceBayIncomeYen } from './serviceBay'
import { resolveAcceptServiceJob, resolveServiceJob } from './serviceJobs'
import { resolveListForSale, resolveSellViaWalkIn } from './selling'

export interface AdvanceDayResult {
  state: GameState
  log: DayLog
}

/**
 * Sim contract: advanceDay(state, queuedActions, seed, context) -> newState + eventLog.
 * `seed` is caller-derived per day (e.g. state.seed + state.day), not read
 * from state.seed directly, so every day gets a distinct but fully
 * reproducible RNG stream from one career seed. `context` (Sprint 03
 * addition) carries the static content catalogs — models, parts, buyers,
 * hidden issues — that auction generation and valuation need; sim has no
 * data loader of its own, so the caller builds it once and passes it in.
 *
 * Sprint 11: this function shrank from resolving every player action to a
 * pure day-boundary tick. Every action that used to resolve here now has its
 * own instant resolver (bidding.ts, auctions.ts, selling.ts, serviceJobs.ts,
 * parts.ts, jobs.ts) that the store calls directly the moment the player
 * clicks. `queuedActions` still exists because bots decide a whole day at
 * once (they're headless — they can't click); advanceDay resolves their
 * batch by calling the exact same instant resolvers in a loop, one call per
 * queued action, so there is one resolution path, not two. What's left
 * inline below is genuinely day-boundary-only: labor reset, weekly rent and
 * market-heat drift, catalog refresh and expiry, and the service-job
 * deadline backstop.
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

  // 0. Bots' equipment and bay purchases, then moves (the player does all
  // three instantly via a direct store call — the same pure cores either
  // way). Equipment/bays bought today gate/enable the job creation and
  // labor below, same day. Equipment first since job creation (step 1) reads
  // ownership.
  const equipmentPurchases = applyEquipmentPurchases(next, queuedActions.buyEquipment, context)
  next = equipmentPurchases.state
  log.push(...equipmentPurchases.log)

  const bayPurchases = applyBayPurchases(next, queuedActions.buyBays, context.facilities)
  next = bayPurchases.state
  log.push(...bayPurchases.log)

  const moves = applyMoves(next, queuedActions.moveCars)
  next = moves.state
  log.push(...moves.log)

  // 1. Bots' queued job creation. The player never populates this — an
  // instant repair/install click finds-or-creates its own job
  // (jobs.ts's resolveJobLabor/findOrCreateJob) using a different,
  // car+componentId-derived id scheme. Bots predict `job-${day}-${i}` ids in
  // the same tick to reference in laborAssignments below, so this id scheme
  // stays exactly as it was — the two schemes never need to agree, because a
  // given GameState is only ever a bot's or only ever a player's. Sprint 13:
  // a repair-zone spec passes through the same `repairJobGate` the player's
  // instant path uses (equipment owned + consumables affordable) before
  // it's created — a gate refusal just skips that one queued spec, logging
  // why, rather than creating a job that could never receive labor.
  const jobs: Job[] = [...next.jobs]
  queuedActions.createJobs.forEach((spec, i) => {
    const gate = repairJobGate(next, spec, context)
    if (!gate.ok) {
      log.push(...gate.log)
      return
    }
    next = gate.state
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

  // 1b. Bots' queued part purchases — the player buys instantly via
  // resolveBuyPart directly from the store.
  for (const { partId } of queuedActions.buyParts) {
    const result = resolveBuyPart(next, partId, context)
    next = result.state
    log.push(...result.log)
  }

  // 1c. Bots' queued service-job accepts — the player accepts instantly via
  // resolveAcceptServiceJob directly from the store.
  for (const { offerId } of queuedActions.acceptServiceJobs) {
    const result = resolveAcceptServiceJob(next, offerId, context)
    next = result.state
    log.push(...result.log)
  }

  // 1d. Bots' queued lot inspections — the player inspects instantly via
  // resolveInspectLot directly from the store. No longer costs labor
  // (Sprint 11 decision 4) — just the cash travel fee resolveInspectLot
  // already applies internally.
  for (const { lotId } of queuedActions.inspectLots) {
    const result = resolveInspectLot(next, lotId)
    next = result.state
    log.push(...result.log)
  }

  // 2. Apply labor assignments to jobs, clamped to what's left of the day's
  // budget. `applyAvailableLaborToJob` is the same single-job core the
  // player's instant repair/install click uses — bots just call it once per
  // queued assignment instead of once per click, and it books the spend into
  // `laborSlotsSpentToday` exactly the same way either path does.
  let remainingLabor = availableLaborSlots(next) - next.laborSlotsSpentToday
  const requestedJobLabor = queuedActions.laborAssignments.reduce((sum, a) => sum + a.laborSlots, 0)
  if (requestedJobLabor > remainingLabor) {
    log.push({
      type: 'labor-overbooked',
      requestedSlots: requestedJobLabor,
      availableSlots: remainingLabor,
    })
  }

  for (const assignment of queuedActions.laborAssignments) {
    if (remainingLabor <= 0) break
    const offered = Math.min(assignment.laborSlots, remainingLabor)
    const result = applyAvailableLaborToJob(next, assignment.jobId, offered)
    next = result.state
    log.push(...result.log)
    remainingLabor -= result.laborSlotsUsed
  }

  // 2b. Retry any job that's already fully-labored but was blocked from
  // completing on a prior day (its target slot was occupied) — checked every
  // day regardless of whether new labor was assigned today, same as before
  // this function was split apart. A job `applyAvailableLaborToJob` just
  // completed above is already gone from `next.jobs`, so this never
  // double-processes it.
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

  // 3. Service-job completion is NOT resolved here — the player resolves it
  // the instant they click "Complete Job" (a store call to
  // resolveServiceJob). The only day-boundary involvement is the deadline
  // backstop below.

  // 4. Bots' queued auction actions — buyouts first (guaranteed, no
  // contest), then competitive bids on what's left. The player resolves
  // both instantly via resolveBuyoutInstant/resolveBidInstant directly from
  // the store; these are the exact same functions, called in a loop.
  for (const { lotId } of queuedActions.buyoutLots) {
    const result = resolveBuyoutInstant(next, lotId, context)
    next = result.state
    log.push(...result.log)
  }

  for (const bid of queuedActions.bidsOnLots) {
    const result = resolveBidInstant(next, bid.lotId, bid.maxBidYen, context)
    next = result.state
    log.push(...result.log)
  }

  // 5. Bots' queued walk-in sells — the player sells instantly via
  // resolveSellViaWalkIn directly from the store.
  for (const { carInstanceId } of queuedActions.sellViaWalkIn) {
    const result = resolveSellViaWalkIn(next, carInstanceId, context)
    next = result.state
    log.push(...result.log)
  }

  // 6. Bots' queued public listings — the player creates a listing instantly
  // via resolveListForSale directly from the store. The listing's own
  // resolvesOnDay wait is the intentional multi-day mechanic; only its
  // *creation* is instant now.
  for (const action of queuedActions.listForSale) {
    const result = resolveListForSale(next, action.carInstanceId, context, action.waitDays)
    next = result.state
    log.push(...result.log)
  }

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

  // 8. Expire unsold auction lots and stale service-job offers, then refresh
  // both weekly catalogs (day 7 boundary) via the same generator day-1
  // seeding uses (catalogs.ts's refreshCatalogs) — one generation path, not two.
  const unexpiredLots = next.activeAuctionLots.filter((lot) => lot.expiresOnDay > next.day)
  const unexpiredOffers = next.serviceJobOffers.filter((offer) => offer.expiresOnDay > next.day)
  next = { ...next, activeAuctionLots: unexpiredLots, serviceJobOffers: unexpiredOffers }

  if (next.day % 7 === 0) {
    const refresh = refreshCatalogs(next, context, next.day, rng)
    for (const { tier, lotCount } of refresh.lotsByTier) {
      log.push({ type: 'auction-catalog-refreshed', tier, lotCount })
    }
    next = {
      ...next,
      activeAuctionLots: [...next.activeAuctionLots, ...refresh.freshLots],
      serviceJobOffers: [...next.serviceJobOffers, ...refresh.freshOffers],
    }
  }

  // 8b. Deadline backstop: any accepted job now at/past its due day is handed
  // back automatically via the same resolver the player's click uses — paid if
  // the work got done in time, failed (reputation penalty, no pay) if not.
  const overdueJobIds = next.activeServiceJobs
    .filter((sj) => sj.dueOnDay !== null && sj.dueOnDay <= next.day)
    .map((sj) => sj.id)
  for (const jobId of overdueJobIds) {
    const resolution = resolveServiceJob(next, jobId, context)
    next = resolution.state
    log.push(...resolution.log)
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

  // 11. The day itself passes, and today's labor budget replenishes for the next one.
  next = { ...next, day: next.day + 1, laborSlotsSpentToday: 0 }

  return { state: next, log }
}
