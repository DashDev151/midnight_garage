import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { isGroupAtLeast, queueGroupRepair, worstGroup } from './bandHelpers'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { considerToolUpgrade, toolUpgradeBudget } from './toolUpgradeHelpers'
import { energyMax } from '../laborSlots'
import { createRng, hashStringToSeed, type Rng } from '../rng'
import { decideSale } from './sellingHelpers'

const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]
const MAX_CONCURRENT_CARS = 3
const CASH_BUFFER_MULTIPLIER = 1.2
/** Sprint 36: tool upgrades only at double cover, same as the other generalists. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 2.0

type Archetype = 'flip' | 'restore' | 'mid'
const ARCHETYPES: readonly Archetype[] = ['flip', 'restore', 'mid']

/**
 * Bid size deliberately does NOT vary by archetype. Cautious Restorer's
 * real 1.1x premium is earned - it always inspects before it bids, so it's
 * paying for genuine information an uninspected AI bidder doesn't have.
 * Random's archetype is assigned to a car independently of whether that
 * specific lot was ever inspected (see step 4/5 below - inspection and
 * bidding target different, unrelated random picks), so a "restore"-typed
 * bid has no informational edge to justify paying more. Bidding higher
 * with no edge doesn't express a preference, it just wins more auctions
 * it should be losing - a real, earlier version of this bot did exactly
 * that (see sprint03.md finding 8's follow-up) and the resulting 78%
 * restore-trade share was pure winner's-curse, not a playstyle mix.
 */
const BID_MULTIPLIER = 1.0

interface ArchetypeProfile {
  /** How many zones get repaired before the car is considered sellable. */
  repairZonesBeforeSale: number
  /** Sprint 31 decision 4: this archetype's own accept-threshold - mirrors
   * Flipper's/Balanced Player's/Cautious Restorer's own constants (see each
   * bot's own `sellingHelpers.ts` call site). */
  acceptFraction: number
  maxHoldingDays: number
}

/** Mirrors Flipper / Balanced Player / Cautious Restorer's own repair depth and accept-threshold. */
const PROFILES: Record<Archetype, ArchetypeProfile> = {
  flip: { repairZonesBeforeSale: 1, acceptFraction: 0, maxHoldingDays: 0 },
  mid: { repairZonesBeforeSale: 2, acceptFraction: 0.85, maxHoldingDays: 12 },
  restore: {
    repairZonesBeforeSale: REPAIRABLE_COMPONENTS.length,
    acceptFraction: 0.95,
    maxHoldingDays: 20,
  },
}

/**
 * A car's playstyle is derived deterministically from its own instance id
 * (same hash-a-stable-id-to-seed-a-roll pattern as bidding.ts's per-lot
 * rival field) rather than re-rolled per day - so a given car is played
 * consistently from purchase to sale (a quick flip stays a quick flip),
 * while different cars still land on genuinely different approaches. This
 * is what makes the bot read as "an inconsistent player," not "an
 * incoherent one": no per-day mashing, no buying a car and instantly
 * reselling it at a nonsensical loss.
 */
function archetypeForCar(carInstanceId: string): Archetype {
  const rng = createRng(hashStringToSeed(carInstanceId))
  return ARCHETYPES[rng.int(0, ARCHETYPES.length - 1)] as Archetype
}

/**
 * "Someone with no consistent judgment about which strategy fits which
 * car" - the control this harness was missing alongside Passive Grinder's
 * do-nothing baseline. Every car it touches is played out coherently as a
 * quick flip, a careful restoration, or a mid-of-the-road approach (the
 * same three playstyles as the other bots), but *which* playstyle applies
 * to *which* car is arbitrary, not a judgment call about that car's actual
 * condition or price. Answers "does the economy reward or punish having
 * no consistent strategy at all?" without also simulating someone who
 * can't operate the controls.
 */
export function randomStrategy(state: GameState, context: SimContext, rng: Rng): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  const upgradeBudget = toolUpgradeBudget()

  // 1. Continue any in-progress repair job from a prior day - only if its
  // car is in the service bay (moved in first, if there's room today).
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

  // 2. Repair each job-free owned car to its own archetype's thoroughness,
  // bay space permitting.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const profile = PROFILES[archetypeForCar(car.id)]
    const repairedCount = REPAIRABLE_COMPONENTS.filter((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    ).length
    if (repairedCount >= profile.repairZonesBeforeSale) continue

    const worstComponent = worstGroup(car, REPAIRABLE_COMPONENTS, context.partIdsByGroup)
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue
    // Sprint 36: consider upgrading the line for speed, but repair proceeds
    // either way - work is always possible at the current tier.
    considerToolUpgrade(
      state,
      worstComponent,
      actions,
      context,
      upgradeBudget,
      TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER,
    )
    const slots = queueGroupRepair(
      state,
      car.id,
      worstComponent,
      car,
      actions,
      context,
      laborBudget,
    )
    laborBudget -= slots
    jobbedCarIds.add(car.id)
  }

  // 3. Sell each job-free, sufficiently-repaired car through its own
  // archetype's accept-threshold (Sprint 31 decision 4): flip takes the
  // first offer regardless of price, restore holds out near full value,
  // mid takes the first offer that clears a reasonable floor.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    const profile = PROFILES[archetypeForCar(car.id)]
    const repairedCount = REPAIRABLE_COMPONENTS.filter((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    ).length
    if (repairedCount < profile.repairZonesBeforeSale) continue

    decideSale(state, car, context, actions, {
      acceptFraction: profile.acceptFraction,
      maxHoldingDays: profile.maxHoldingDays,
    })
  }

  // 4. Join or continue a war on one affordable lot if there's room for
  // another car - the same target multiplier regardless of which archetype
  // the car will turn out to be played as (see BID_MULTIPLIER's comment: no
  // archetype has an informational edge at this stage, so none should pay a
  // premium). Sprint 20: open bidding - `leadingBidder !== 'player'` covers
  // both a fresh lot and one this bot was outbid on but is still willing to
  // chase under its walk-away target.
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length - activeBidCount(state)
  if (roomForMoreCars > 0) {
    const affordable = state.activeAuctionLots.filter(
      (lot) =>
        lot.leadingBidder !== 'player' &&
        state.cashYen >= lot.bookValueYen * CASH_BUFFER_MULTIPLIER,
    )
    if (affordable.length > 0) {
      const lot = rng.pick(affordable)
      const targetYen = walkAwayTargetYen(lot, state, context, BID_MULTIPLIER)
      acquireLot(
        state,
        lot,
        targetYen,
        actions,
        context,
        auctionAcquisitionBudget(state),
        CASH_BUFFER_MULTIPLIER,
      )
    }
  }

  return actions
}
