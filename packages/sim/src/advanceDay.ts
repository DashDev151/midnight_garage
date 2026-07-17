import type { DayLog, DayLogEntry, GameState, Job } from '@midnight-garage/content'
import type { DayActions } from './actions'
import { resolveBuyoutInstant, resolveLotForDay, resolvePlaceBid } from './bidding'
import { currentGameYear } from './calendar'
import { generateDailyAuctionArrivals } from './catalogs'
import { SERVICE_JOB_EXPIRY_DAYS } from './constants'
import type { SimContext } from './context'
import { applyToolUpgrades, rollMachineListings } from './toolLines'
import { applyWeeklyRentAndWages } from './finances'
import { applyBayPurchases, applyMoves, resolveGraceParking } from './facilities'
import {
  applyAvailableLaborToJob,
  completeJob,
  createJob,
  installFitGate,
  isJobComplete,
  repairJobGate,
  resolveRemovePart,
} from './jobs'
import { availableLaborSlots } from './laborSlots'
import { bumpLotSupply, updateMarketHeat } from './marketHeat'
import { advanceStoryMissions } from './missions'
import { resolveBuyPart, resolvePartDeliveries, resolveScrapPart } from './parts'
import { createRng } from './rng'
import { computeContractIncomeYen } from './serviceBay'
import { commitPendingStaffAssignments, refreshStaffAds } from './staff'
import {
  generateDailyServiceJobOffers,
  resolveAcceptServiceJob,
  resolveServiceJob,
  resolveServiceJobArrivals,
} from './serviceJobs'
import { drawDailyOffers, resolveSellViaWalkIn, resolveSetForSale } from './selling'

export interface AdvanceDayResult {
  state: GameState
  log: DayLog
}

/**
 * Sim contract: advanceDay(state, queuedActions, seed, context) -> newState + eventLog.
 * `seed` is caller-derived per day (e.g. state.seed + state.day), not read
 * from state.seed directly, so every day gets a distinct but fully
 * reproducible RNG stream from one career seed. `context` (Sprint 03
 * addition) carries the static content catalogs - models, parts, buyers,
 * hidden issues - that auction generation and valuation need; sim has no
 * data loader of its own, so the caller builds it once and passes it in.
 *
 * Sprint 11: this function shrank from resolving every player action to a
 * pure day-boundary tick. Every action that used to resolve here now has its
 * own instant resolver (bidding.ts, auctions.ts, selling.ts, serviceJobs.ts,
 * parts.ts, jobs.ts) that the store calls directly the moment the player
 * clicks. `queuedActions` still exists because bots decide a whole day at
 * once (they're headless - they can't click); advanceDay resolves their
 * batch by calling the exact same instant resolvers in a loop, one call per
 * queued action, so there is one resolution path, not two. What's left
 * inline below is genuinely day-boundary-only: labor reset, weekly rent and
 * market-heat update, catalog refresh and expiry, and the service-job
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

  // 0. Bots' tool-line upgrades and bay purchases, then moves (the player
  // does all three instantly via a direct store call - the same pure cores
  // either way). Upgrades/bays bought today speed up/enable the job creation
  // and labor below, same day. Upgrades first since job creation (step 1)
  // sizes repair work off the current tier, and the service-job accepts
  // (step 1c) re-check tool-tier deficits against it.
  const toolUpgrades = applyToolUpgrades(next, queuedActions.upgradeToolLines, context)
  next = toolUpgrades.state
  log.push(...toolUpgrades.log)

  const bayPurchases = applyBayPurchases(next, queuedActions.buyBays, context.facilities)
  next = bayPurchases.state
  log.push(...bayPurchases.log)

  const moves = applyMoves(next, queuedActions.moveCars)
  next = moves.state
  log.push(...moves.log)

  // 0b. Bots' queued part removals - the player removes instantly via
  // resolveRemovePart directly from the store (the Remove button that gates
  // Replace behind an empty slot). Runs before job creation so a slot
  // freed today can be targeted by a createJobs spec the very same tick,
  // same "resolve the precondition before what depends on it" ordering
  // step 0's equipment-before-jobs comment already establishes.
  for (const { carInstanceId, carPartId } of queuedActions.removeParts) {
    const result = resolveRemovePart(next, carInstanceId, carPartId, context)
    next = result.state
    log.push(...result.log)
  }

  // 1. Bots' queued job creation. The player never populates this - an
  // instant repair/install click finds-or-creates its own job
  // (jobs.ts's resolveJobLabor/findOrCreateJob) using a different,
  // car+componentId-derived id scheme. Bots predict `job-${day}-${i}` ids in
  // the same tick to reference in laborAssignments below, so this id scheme
  // stays exactly as it was - the two schemes never need to agree, because a
  // given GameState is only ever a bot's or only ever a player's. A
  // repair-zone spec passes through the same `repairJobGate` the player's
  // instant path uses (consumables + repair cost affordable) before it's
  // created - a gate refusal just skips that one queued spec rather than
  // creating a job that could never receive labor. Sprint
  // 24 fix 2: an install-part spec likewise passes `installFitGate` - this
  // loop calls `findOrCreateJob`'s two gates directly rather than
  // `findOrCreateJob` itself (see that function's own doc comment on the
  // differing id schemes), so both gates need calling here explicitly.
  const jobs: Job[] = [...next.jobs]
  queuedActions.createJobs.forEach((spec, i) => {
    const fitGate = installFitGate(next, spec, context)
    if (!fitGate.ok) {
      log.push(...fitGate.log)
      return
    }
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

  // 1b. Bots' queued part purchases - the player buys instantly via
  // resolveBuyPart directly from the store (via the cart/checkout flow,
  // Sprint 14). Bots choose deliverySpeed themselves (partDeliveryHelpers.ts)
  // before queuing the action; this loop just calls the same resolver.
  for (const { partId, deliverySpeed } of queuedActions.buyParts) {
    const result = resolveBuyPart(next, partId, context, deliverySpeed)
    next = result.state
    log.push(...result.log)
  }

  // 1c. Bots' queued service-job accepts - the player accepts instantly via
  // resolveAcceptServiceJob directly from the store.
  for (const { offerId } of queuedActions.acceptServiceJobs) {
    const result = resolveAcceptServiceJob(next, offerId, context)
    next = result.state
    log.push(...result.log)
  }

  // 1d. Bots' queued scrap-part sells (Sprint 26 decision 6) - the player
  // sells instantly via resolveScrapPart directly from the store.
  for (const { partInstanceId } of queuedActions.scrapParts) {
    const result = resolveScrapPart(next, partInstanceId, context)
    next = result.state
    log.push(...result.log)
  }

  // 2. Apply labor assignments to jobs, clamped to what's left of the day's
  // budget. `applyAvailableLaborToJob` is the same single-job core the
  // player's instant repair/install click uses - bots just call it once per
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
    const result = applyAvailableLaborToJob(next, assignment.jobId, offered, context)
    next = result.state
    log.push(...result.log)
    remainingLabor -= result.laborSlotsUsed
  }

  // 2b. Retry any job that's already fully-labored but was blocked from
  // completing on a prior day (its target slot was occupied) - checked every
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
    const result = completeJob(next, job, context)
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

  // 3. Service-job completion is NOT resolved here - the player resolves it
  // the instant they click "Complete Job" (a store call to
  // resolveServiceJob). The only day-boundary involvement is the deadline
  // backstop below.

  // 4. Bots' queued auction actions - buyouts first (guaranteed, no
  // contest), then bids on what's left. The player resolves both instantly
  // via resolveBuyoutInstant/resolvePlaceBid directly from the store; these
  // are the exact same functions, called in a loop. Sprint 19: a bid no
  // longer resolves anything by itself - it just places/raises the bot's
  // own committed max, same as the player's click. Real resolution happens
  // in step 7 below, on whichever day each lot's duration elapses.
  for (const { lotId } of queuedActions.buyoutLots) {
    const result = resolveBuyoutInstant(next, lotId, context)
    next = result.state
    log.push(...result.log)
  }

  for (const bid of queuedActions.bidsOnLots) {
    const result = resolvePlaceBid(next, bid.lotId, bid.maxBidYen, context)
    next = result.state
    log.push(...result.log)
  }

  // 5. Bots' queued for-sale toggles - the player toggles instantly via
  // resolveSetForSale directly from the store. Sprint 31: replaces the old
  // instant walk-in-sell/list-publicly channels outright - a car simply
  // becomes eligible (or ineligible) for the daily offer draw below the
  // moment this fires. Runs before offer acceptance so a bot that both
  // drops one car and accepts an offer on another the same day sees a
  // consistent `carsForSale` either way (the two never target the same car
  // in practice, but there's no ordering hazard if they did).
  for (const { carInstanceId, forSale } of queuedActions.setForSale) {
    const result = resolveSetForSale(next, carInstanceId, forSale)
    next = result.state
    log.push(...result.log)
  }

  // 5b. Bots' queued offer accepts - the player accepts instantly via
  // resolveSellViaWalkIn directly from the store. Resolves TODAY's live
  // offer (rolled at the end of the PREVIOUS day's advanceDay tick, step 8a2
  // below) through the walk-in resolution path - reputation/heat/event-log
  // plumbing unchanged since Sprint 11, only the price source moved (see
  // that function's own doc comment, selling.ts).
  for (const { carInstanceId } of queuedActions.acceptOffers) {
    const result = resolveSellViaWalkIn(next, carInstanceId, context)
    next = result.state
    log.push(...result.log)
  }

  // 6. Resolve standard-delivery part orders due today (Sprint 14) - the
  // same "due today resolves, the rest stays pending" shape every
  // day-boundary resolution loop in this function uses.
  const deliveries = resolvePartDeliveries(next)
  next = deliveries.state
  log.push(...deliveries.log)

  // 6b. Clear arrivesOnDay on any accepted service job whose customer car
  // reaches the shop today (Sprint 25 task 2) - same "due today resolves"
  // shape as 6, immediately above.
  const arrivals = resolveServiceJobArrivals(next)
  next = arrivals.state
  log.push(...arrivals.log)

  // 7. Resolve every active auction lot for today (Sprint 20: activity-based
  // closing replaces the old fixed-due-day filter + separate escalation
  // pass) - one call per lot runs its overnight step (dealers may raise,
  // stay silent, or open a not-yet-bid lot) and then hammers it if either
  // `quietDays` has reached the threshold or today is its `expiresOnDay`
  // backstop; otherwise the lot simply carries its updated board state into
  // tomorrow. Processes lots sequentially against the accumulating state so
  // two lots hammering the same day see each other's cash/parking effects,
  // exactly like every other per-item loop in this function. Stale
  // service-job offers expire the same way they always have. Then roll
  // today's staggered arrivals (Sprint 30 decision 4: `catalogs.ts`'s
  // `generateDailyAuctionArrivals`, EVERY day, not just a day-7 boundary -
  // day 1's own full opening board still comes from `createInitialGameState`
  // via `refreshCatalogs`, a separate, fixed-batch generation path).
  const lotsToday = next.activeAuctionLots
  for (const lot of lotsToday) {
    const resolution = resolveLotForDay(next, lot, context, next.day)
    next = resolution.state
    log.push(...resolution.log)
  }
  const unexpiredOffers = next.serviceJobOffers.filter((offer) => offer.expiresOnDay > next.day)
  next = { ...next, serviceJobOffers: unexpiredOffers }

  // `next.day + 1` (not `next.day`), same pre-increment-day convention as
  // `generateDailyServiceJobOffers` just below - these lots are posted for
  // the day about to begin, and generation's own `lot-${day}-${tier}-${i}`
  // id scheme would otherwise collide with `createInitialGameState`'s day-1
  // seed batch (both would generate `lot-1-*` ids on the very first
  // advanceDay call, silently merging two DIFFERENT lots under one id - every
  // id-keyed operation in bidding.ts then treats them as the same lot, so a
  // single bid mirrors onto both and one lot's hammer resolution removes
  // both from the board; whichever of the two resolves second, if parking or
  // cash no longer allows it, then logs a bogus "lost" for a lot the player
  // already genuinely won and paid for on the first resolution. This is the
  // exact hazard `generateDailyServiceJobOffers`'s own `next.day + 1` was
  // already guarding against in this same file - Sprint 30 introduced the
  // unconditional daily call without carrying that offset over. Found via a
  // real playtest report, 2026-07-13.
  const arrivalsToday = generateDailyAuctionArrivals(next, context, next.day + 1, rng)
  for (const { tier, lotCount } of arrivalsToday.lotsByTier) {
    log.push({ type: 'auction-catalog-refreshed', tier, lotCount })
  }
  next = bumpLotSupply(
    { ...next, activeAuctionLots: [...next.activeAuctionLots, ...arrivalsToday.freshLots] },
    arrivalsToday.freshLots.map((lot) => lot.modelId),
  )

  // 7a. Sprint 29: daily service-job offer generation - a bell-curve draw
  // (0-4, economy.json's `serviceJobs.dailyOfferCountWeights`) EVERY day,
  // replacing the old weekly fixed-count dump `refreshCatalogs` used to also
  // produce (see that function's own doc comment). Uses the same `rng`
  // stream as everything else this day, drawn from sequentially like every
  // other per-day concern in this function. `next.day + 1` (not `next.day`),
  // same pre-increment-day convention as `resolvePartDeliveries`/
  // `resolveServiceJobArrivals` elsewhere in this file: these offers are
  // posted for the day about to begin, and generation's own `svc-${day}-${i}`
  // id scheme would otherwise collide with `createInitialGameState`'s day-1
  // seed batch (both would generate `svc-1-*` ids on the very first
  // advanceDay call, silently duplicating offer ids with different content).
  const freshServiceJobOffers = generateDailyServiceJobOffers(
    context,
    next.day + 1,
    SERVICE_JOB_EXPIRY_DAYS,
    rng,
    currentGameYear(next.reputationTier),
    next.toolTiers,
    next.reputationTier,
    next.specialty,
  )
  if (freshServiceJobOffers.length > 0) {
    next = {
      ...next,
      serviceJobOffers: [...next.serviceJobOffers, ...freshServiceJobOffers],
    }
  }

  // 7a2. Sprint 31: the daily for-sale offer draw for the day about to
  // begin - same day-boundary-generation position as 7a immediately above,
  // and the same reason: today's report shows "a tuner is offering..." for
  // the day that's about to start, exactly like an auction catalog refresh
  // reads as "news for tomorrow" logged tonight. `drawDailyOffers` REPLACES
  // `pendingOffers` wholesale rather than accumulating - the no-reflex rule
  // (CLAUDE.md hard design rule: nothing resolves on a timer or mid-screen)
  // means an offer is valid the day it's drawn for only, so whatever was
  // live today and went unaccepted (step 5b above already had its chance)
  // is simply gone, not carried into tomorrow.
  const offerDraw = drawDailyOffers(next, context, rng)
  next = offerDraw.state
  log.push(...offerDraw.log)

  // 7a3. Sprint 52 decision 2: the used-machinery classifieds' day-boundary
  // step - same "posted for the day about to begin" `next.day + 1` position
  // as 7a/7a2 immediately above.
  const listingRoll = rollMachineListings(next, context, next.day + 1, rng)
  next = listingRoll.state
  log.push(...listingRoll.log)

  // 7b. Deadline backstop: any accepted job now at/past its due day is handed
  // back automatically via the same resolver the player's click uses - paid if
  // the work got done in time, failed (reputation penalty, no pay) if not.
  // Same pre-increment next.day pattern as resolvePartDeliveries (parts.ts) -
  // deliberately left as `<= next.day`, not `<= next.day + 1`, here: it gives
  // the player a one-day grace window before a deadline actually bites (the
  // job stays workable through its nominal due day and only fails on the day
  // after), which is a kindness worth keeping, not a bug to close.
  const overdueJobIds = next.activeServiceJobs
    .filter((sj) => sj.dueOnDay !== null && sj.dueOnDay <= next.day)
    .map((sj) => sj.id)
  for (const jobId of overdueJobIds) {
    const resolution = resolveServiceJob(next, jobId, context)
    next = resolution.state
    log.push(...resolution.log)
  }

  // 7c. Sprint 76 (story missions I): the campaign's own day-boundary tick -
  // lapse an overdue active mission, reoffer a lapsed one whose wait
  // elapsed, then offer the next locked mission if reputation clears its
  // gate. Same `next.day` (not `next.day + 1`) as 7b immediately above: this
  // reads the day that's ending, not the one about to begin, mirroring the
  // service-job deadline backstop's own one-day grace window.
  const missions = advanceStoryMissions(next, context)
  next = missions.state
  log.push(...missions.log)

  // 7d. Sprint 80 (staff I): the weekly job-ad refresh - expired ads drop,
  // then seeded rolls top the board back up to `economy.staff.maxOpenAds`.
  // Same 7-day boundary as wages (step 9), read off `next.day` before the
  // increment, exactly like the mission hook above. Placed AFTER every other
  // rng consumer this tick so adding candidate rolls leaves the auction /
  // service-job / offer / machine-listing draws byte-identical - the golden
  // re-pin is purely the new `staffAds` field and its rolls, nothing else.
  if (next.day % 7 === 0) {
    const staffAds = refreshStaffAds(next, context, rng)
    next = staffAds.state
    log.push(...staffAds.log)
  }

  // 8. Sprint 80 crew model (R3): the daily fleet-contract retainer from any
  // contract-assigned staff (bench-assigned members earn nothing here - their
  // hands are on the shop's own work). Reads the day's effective assignment;
  // any reassignment made today is still pending and commits below in step 10,
  // so tonight's retainer never pays a member the player parked this morning.
  const contractIncome = computeContractIncomeYen(next.staff, context.economy)
  if (contractIncome > 0) {
    next = { ...next, cashYen: next.cashYen + contractIncome }
    log.push({ type: 'contract-income', amountYen: contractIncome })
  }

  // 8a. Sprint 45: the grace/"double parking" overflow slot's own day-
  // boundary resolution - migrates the double-parked car into real capacity
  // FIRST if any opened up today (a sale, a bought bay, a released car), so
  // it's never fined the same day it frees itself; only charges the daily
  // fine if the slot is still occupied after that check. A no-op when
  // nothing is double-parked.
  const graceParking = resolveGraceParking(next, context.economy)
  next = graceParking.state
  log.push(...graceParking.log)

  // 9. Weekly rent/wages + market-heat update (both fire on 7-day boundaries).
  const finances = applyWeeklyRentAndWages(next, context.economy)
  next = finances.state
  log.push(...finances.log)

  const heat = updateMarketHeat(next, context)
  next = heat.state
  log.push(...heat.log)

  // 10. The day itself passes, and today's labor budget replenishes for the
  // next one. Sprint 74 decision 1: any inspection visit dies with the day
  // too, unconditionally - minutes spent chasing a lot that sells to
  // someone else overnight are simply spent, no carry-over negotiation.
  // Sprint 80 crew model (R3): scheduled staff reassignments commit here, after
  // tonight's contract income (step 8), so a switch made today takes effect
  // tomorrow.
  next = {
    ...next,
    day: next.day + 1,
    laborSlotsSpentToday: 0,
    inspectionVisit: null,
    staff: commitPendingStaffAssignments(next.staff),
  }

  return { state: next, log }
}
