import type { GameState, Zone } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { availableLaborSlots } from '../laborSlots'
import { createRng, hashStringToSeed, type Rng } from '../rng'
import { bestFitBuyer } from '../selling'
import { valuateCarForBuyer } from '../valuation'

const ZONES: readonly Zone[] = ['engine', 'drivetrain', 'suspension', 'body', 'interior']
const REPAIR_THRESHOLD = 90
const REPAIR_LABOR_SLOTS = 2
const MAX_CONCURRENT_CARS = 3
const CASH_BUFFER_MULTIPLIER = 1.2
const ACCEPTABLE_WALKIN_FRACTION = 0.85

type Archetype = 'flip' | 'restore' | 'mid'
const ARCHETYPES: readonly Archetype[] = ['flip', 'restore', 'mid']

/**
 * Bid size deliberately does NOT vary by archetype. Cautious Restorer's
 * real 1.1x premium is earned — it always inspects before it bids, so it's
 * paying for genuine information an uninspected AI bidder doesn't have.
 * Random's archetype is assigned to a car independently of whether that
 * specific lot was ever inspected (see step 4/5 below — inspection and
 * bidding target different, unrelated random picks), so a "restore"-typed
 * bid has no informational edge to justify paying more. Bidding higher
 * with no edge doesn't express a preference, it just wins more auctions
 * it should be losing — a real, earlier version of this bot did exactly
 * that (see sprint03.md finding 8's follow-up) and the resulting 78%
 * restore-trade share was pure winner's-curse, not a playstyle mix.
 */
const BID_MULTIPLIER = 1.0

interface ArchetypeProfile {
  /** How many zones get repaired before the car is considered sellable. */
  repairZonesBeforeSale: number
  sellChannel: 'walk-in' | 'list' | 'threshold'
}

/** Mirrors Flipper / Cautious Restorer / Balanced Player's own repair depth and sell channel. */
const PROFILES: Record<Archetype, ArchetypeProfile> = {
  flip: { repairZonesBeforeSale: 1, sellChannel: 'walk-in' },
  mid: { repairZonesBeforeSale: 2, sellChannel: 'threshold' },
  restore: { repairZonesBeforeSale: ZONES.length, sellChannel: 'list' },
}

/**
 * A car's playstyle is derived deterministically from its own instance id
 * (same hashing pattern as biddingNoiseFactor in bidding.ts) rather than
 * re-rolled per day — so a given car is played consistently from purchase
 * to sale (a quick flip stays a quick flip), while different cars still
 * land on genuinely different approaches. This is what makes the bot read
 * as "an inconsistent player," not "an incoherent one": no per-day mashing,
 * no buying a car and instantly reselling it at a nonsensical loss.
 */
function archetypeForCar(carInstanceId: string): Archetype {
  const rng = createRng(hashStringToSeed(carInstanceId))
  return ARCHETYPES[rng.int(0, ARCHETYPES.length - 1)] as Archetype
}

/**
 * "Someone with no consistent judgment about which strategy fits which
 * car" — the control this harness was missing alongside Passive Grinder's
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

  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)

  // 1. Continue any in-progress repair job from a prior day — only if its
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
    const repairedCount = ZONES.filter((z) => car.condition[z] >= REPAIR_THRESHOLD).length
    if (repairedCount >= profile.repairZonesBeforeSale) continue

    const worstZone = ZONES.reduce((worst, zone) =>
      car.condition[zone] < car.condition[worst] ? zone : worst,
    )
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue
    const jobIndex = actions.createJobs.length
    actions.createJobs.push({
      carInstanceId: car.id,
      kind: 'repair-zone',
      zone: worstZone,
      laborSlotsRequired: REPAIR_LABOR_SLOTS,
    })
    const slots = Math.min(REPAIR_LABOR_SLOTS, laborBudget)
    actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
    laborBudget -= slots
    jobbedCarIds.add(car.id)
  }

  // 3. Sell each job-free, sufficiently-repaired car through its own
  // archetype's channel: flip takes the walk-in as soon as it's ready,
  // restore waits for a public listing, mid takes the first walk-in offer
  // that clears a reasonable floor and otherwise lists it.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    const profile = PROFILES[archetypeForCar(car.id)]
    const repairedCount = ZONES.filter((z) => car.condition[z] >= REPAIR_THRESHOLD).length
    if (repairedCount < profile.repairZonesBeforeSale) continue

    if (profile.sellChannel === 'list') {
      actions.listForSale.push({ carInstanceId: car.id })
      continue
    }
    if (profile.sellChannel === 'walk-in') {
      actions.sellViaWalkIn.push({ carInstanceId: car.id })
      continue
    }
    const model = context.modelsById[car.modelId]
    const buyer = model ? bestFitBuyer(car, model, context.buyers, context.partsById) : undefined
    const estimatedOfferYen =
      model && buyer ? valuateCarForBuyer(buyer, model, car, context.partsById) : 0
    if (model && estimatedOfferYen >= model.bookValueYen * ACCEPTABLE_WALKIN_FRACTION) {
      actions.sellViaWalkIn.push({ carInstanceId: car.id })
    } else {
      actions.listForSale.push({ carInstanceId: car.id })
    }
  }

  // 4. Inspect one uninspected lot at random, if labor allows — every
  // archetype benefits from information, so this isn't gated by playstyle.
  const uninspected = state.activeAuctionLots.filter((lot) => !lot.inspected)
  if (uninspected.length > 0 && laborBudget > 0) {
    actions.inspectLots.push({ lotId: rng.pick(uninspected).id })
  }

  // 5. Bid on one affordable lot if there's room for another car — the
  // same bid size regardless of which archetype the car will turn out to
  // be played as (see BID_MULTIPLIER's comment: no archetype has an
  // informational edge at this stage, so none should pay a premium).
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length
  if (roomForMoreCars > 0) {
    const affordable = state.activeAuctionLots.filter(
      (lot) => state.cashYen >= lot.bookValueYen * CASH_BUFFER_MULTIPLIER,
    )
    if (affordable.length > 0) {
      const lot = rng.pick(affordable)
      actions.bidsOnLots.push({
        lotId: lot.id,
        maxBidYen: Math.round(lot.bookValueYen * BID_MULTIPLIER),
      })
    }
  }

  return actions
}
