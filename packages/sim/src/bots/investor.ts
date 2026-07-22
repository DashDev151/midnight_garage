import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { worstGroup } from './bandHelpers'
import { acquireLot, auctionAcquisitionBudget, walkAwayTargetYen } from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { installLaborSlotsFor } from '../jobs'
import { energyMax } from '../laborSlots'
import { partFitsCar } from '../parts'
import type { Rng } from '../rng'
import { decideSale } from './sellingHelpers'

const MAX_CONCURRENT_CARS = 2
const MIN_TARGET_BOOK_VALUE_YEN = 150_000
const MAX_TARGET_BOOK_VALUE_YEN = 1_500_000
/** The walk-away ceiling for a buyout, as a multiple of the lot's value
 * anchor - set above the instant buyout's own flat premium
 * (`AUCTION_BUYOUT_PREMIUM`), the only acquisition channel left, so this
 * bot can actually clear a real buyout rather than walking away from every
 * lot on principle. */
const FAIR_BID_MULTIPLIER = 1.3
const CASH_BUFFER_MULTIPLIER = 1.2
/** Accept an offer once it clears this fraction of the car's best-fit
 * valuation, or once it's been for-sale this many days. */
const ACCEPT_FRACTION = 0.85
const MAX_HOLDING_DAYS = 12

/** The 6 real component groups (`forcedInduction` folded into `engine`,
 * `brakes` folded into `suspension`). */
const ALL_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/**
 * Never upgrades a tool line and restores cars entirely through Replace
 * (buy a catalog part, install it) instead of Repair; every component is
 * fair game, since Replace is always available everywhere.
 *
 * Buying a part and installing it are split across two ticks, never
 * queued the same day: `advanceDay` resolves `createJobs` before
 * `buyParts`, so an install job referencing a same-tick purchase would
 * fail `installFitGate` (the part isn't in `state.partInventory` yet).
 * This checks inventory first for an already-owned, still-uninstalled
 * fitting part before creating an install job - if nothing fits yet, this
 * tick only buys; the install job queues once a later tick's snapshot
 * shows the purchase landed. Mirrors the identical logic in
 * `bots/serviceJobHelpers.ts::queueServiceJobTasks`.
 */
export function investorStrategy(state: GameState, context: SimContext, rng: Rng): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  // Tracks cash already committed to a part queued earlier *this same tick*
  // - without it, two cars each independently checking the same undiminished
  // `state.cashYen` could both queue a purchase the shop can't actually
  // afford both of, leaving the second install job referencing a part that
  // never lands in inventory (a hard crash in applyJobToCar, not a graceful
  // no-op - resolveBuyPart's own affordability check happens later, at
  // resolution time, using whichever cash is left by then).
  let cashCommitted = 0

  // 1. Continue any in-progress install job from a prior day.
  for (const job of state.jobs) {
    if (laborBudget <= 0) break
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    if (need <= 0) continue
    if (!claimServiceBay(state, job.carInstanceId, actions, bayBudget)) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: job.id, laborSlots: slots })
    laborBudget -= slots
  }

  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))

  // 2. Replace one empty component per job-free owned car: buy the cheapest
  // fitting catalog part, install it. A component with nothing installed is
  // the only thing Investor can act on - an occupied-but-worn component
  // would need Repair, which this bot refuses to ever do.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const model = context.modelsById[car.modelId]
    if (!model) continue

    // `presentPartIdsInGroup` means "physically occupied", so an empty
    // slot (missing, or the legitimately-absent forcedInduction-on-NA
    // case) is never in that list - filtering it again for "not
    // installed" would always be empty. Scan every part the taxonomy
    // assigns to the group instead, the same set `installablePartsFor`
    // (gameStore.ts) filters against for the player's own Replace flow.
    const emptyComponents = ALL_COMPONENTS.filter((id) =>
      context.partIdsByGroup[id].some((partId) => !car.parts[partId].installed),
    )
    if (emptyComponents.length === 0) continue
    const worstEmpty = worstGroup(car, emptyComponents, context.partIdsByGroup)

    // The specific empty slot within the group, not just any part addressed
    // to the group as a whole - a multi-part group can have some slots
    // occupied and only one open, and a catalog part is only installable
    // into the exact `carPartId` it was cataloged for (`installFitGate`).
    const emptyCarPartId = context.partIdsByGroup[worstEmpty].find(
      (partId) => !car.parts[partId].installed,
    )
    if (!emptyCarPartId) continue

    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue

    // A part bought on a PRIOR tick is genuinely sitting in this snapshot's
    // inventory - install it now (real id, passes installFitGate cleanly).
    const ownedFitting = state.partInventory.find((instance) => {
      if (instance.band === 'scrap') return false
      const catalogPart = context.partsById[instance.partId]
      return (
        !!catalogPart &&
        partFitsCar(catalogPart, model, worstEmpty, context.partsTaxonomyById, emptyCarPartId)
      )
    })
    if (ownedFitting) {
      const jobIndex = actions.createJobs.length
      actions.createJobs.push({
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: worstEmpty,
        partInstanceId: ownedFitting.id,
        carPartId: emptyCarPartId,
        laborSlotsRequired: installLaborSlotsFor(emptyCarPartId, context),
      })
      const slots = Math.min(installLaborSlotsFor(emptyCarPartId, context), laborBudget)
      actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
      laborBudget -= slots
      jobbedCarIds.add(car.id)
      continue
    }

    // Pinned to express, not a policy choice - Investor pays full retail
    // for speed just as readily as it skips investing in equipment.
    // Nothing owned yet that fits this exact slot; buy the cheapest option
    // and stop here for this car this tick - the install job queues on a
    // later tick, once the purchase genuinely lands in inventory.
    const fitting = context.parts
      .filter((p) => partFitsCar(p, model, worstEmpty, context.partsTaxonomyById, emptyCarPartId))
      .sort((a, b) => a.priceYen - b.priceYen)
    const part = fitting[0]
    if (!part || state.cashYen < (cashCommitted + part.priceYen) * CASH_BUFFER_MULTIPLIER) continue
    actions.buyParts.push({ partId: part.id, deliverySpeed: 'express' })
    cashCommitted += part.priceYen
  }

  // 3. Sell any job-free car with nothing left worth replacing cheaply -
  // "good enough" for Investor means every component has *something*
  // installed, not that every condition is high (it never repairs). Scans
  // every part the taxonomy assigns to each group, not just the
  // already-"present" ones (mirrors `emptyComponents` above).
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    const isBuilt = ALL_COMPONENTS.every((id) =>
      context.partIdsByGroup[id].every((partId) => car.parts[partId].installed !== null),
    )
    if (!isBuilt) continue
    decideSale(state, car, context, actions, {
      acceptFraction: ACCEPT_FRACTION,
      maxHoldingDays: MAX_HOLDING_DAYS,
    })
  }

  // 4. Buy out a mid-priced lot if there's room for another car.
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length
  if (roomForMoreCars > 0) {
    const candidates = state.activeAuctionLots.filter(
      (lot) =>
        lot.bookValueYen >= MIN_TARGET_BOOK_VALUE_YEN &&
        lot.bookValueYen <= MAX_TARGET_BOOK_VALUE_YEN &&
        state.cashYen >= lot.bookValueYen * CASH_BUFFER_MULTIPLIER,
    )
    if (candidates.length > 0) {
      const chosen = rng.pick(candidates)
      const targetYen = walkAwayTargetYen(chosen, state, context, FAIR_BID_MULTIPLIER)
      acquireLot(
        state,
        chosen,
        targetYen,
        actions,
        context,
        auctionAcquisitionBudget(),
        CASH_BUFFER_MULTIPLIER,
      )
    }
  }

  return actions
}
