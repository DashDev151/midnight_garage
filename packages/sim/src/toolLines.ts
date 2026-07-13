import type {
  ComponentId,
  DayLogEntry,
  GameState,
  ReputationTier,
  ToolTier,
  ToolTiers,
} from '@midnight-garage/content'
import { reputationAtLeast } from './calendar'
import type { SimContext } from './context'
import type { UpgradeToolLineAction } from './actions'
import type { Rng } from './rng'

/**
 * Sprint 36: tool lines replace binary equipment ownership. Every line is
 * always owned at tier 1 or above (progression bible law 1: nothing basic
 * is ever locked); upgrading buys labor efficiency (tier IS the
 * `repairLevel` the banded repair formula climbs at) and, from Sprint 37's
 * content onward, capability ceilings (`minToolTier` on service-job tasks).
 * There is no ownership gate anywhere - the old owns-the-machine refusal
 * class is structurally unrepresentable.
 */

/** A fresh shop's tool tiers: every line at 1 (owned from day one). */
export function freshToolTiers(): ToolTiers {
  return {
    engine: 1,
    drivetrain: 1,
    suspension: 1,
    wheels: 1,
    body: 1,
    interior: 1,
  }
}

/** The shop's current tier for `componentId`'s tool line - the repair level
 * every repair path climbs at (`bands.ts`'s `repairLevelForGroup` reads the
 * same map; this is the state-first spelling for callers holding a GameState). */
export function toolTierForGroup(state: GameState, componentId: ComponentId): ToolTier {
  return state.toolTiers[componentId]
}

export interface ToolUpgradeResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * The reputation tier still required for `componentId`'s NEXT tool tier
 * (Sprint 43), or null if it's already met (or there's no gate - tier 1 has
 * none - or the line is maxed). Mirrors `nextBayMinReputationTier`
 * (facilities.ts) exactly, one gate vocabulary for both purchasable things.
 */
export function nextToolTierRepGate(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): ReputationTier | null {
  const currentTier = state.toolTiers[componentId]
  if (currentTier >= 3) return null
  const required = context.toolLines[componentId].tiers[currentTier]!.minReputationTier
  if (!required || reputationAtLeast(state.reputationTier, required)) return null
  return required
}

/** The six tool lines, in the same stable order every other tool-line
 * iteration in this codebase uses. */
const ALL_COMPONENT_IDS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/**
 * Sprint 52 decision 2: true while a live classifieds listing exists for
 * exactly this line+tier - the one thing (besides reputation and cash)
 * `applyToolUpgrade` gates a tier-2/3 purchase on.
 */
export function isToolTierListed(
  state: GameState,
  componentId: ComponentId,
  tier: ToolTier,
): boolean {
  return state.machineListing?.componentId === componentId && state.machineListing.tier === tier
}

interface MachineListingCandidate {
  componentId: ComponentId
  tier: ToolTier
  priceYen: number
}

/** Every (line, next tier) pair the shop is reputation-eligible for but
 * hasn't bought yet - the pool a fresh classifieds listing draws from. */
function eligibleMachineListingCandidates(
  state: GameState,
  context: SimContext,
): MachineListingCandidate[] {
  const candidates: MachineListingCandidate[] = []
  for (const componentId of ALL_COMPONENT_IDS) {
    const currentTier = state.toolTiers[componentId]
    if (currentTier >= 3) continue
    if (nextToolTierRepGate(state, componentId, context) !== null) continue
    candidates.push({
      componentId,
      tier: (currentTier + 1) as ToolTier,
      priceYen: context.toolLines[componentId].tiers[currentTier]!.upgradePriceYen,
    })
  }
  return candidates
}

/**
 * Sprint 52 decision 2 (maintainer-approved, "used-machinery classifieds"):
 * the day-boundary step - lapses an expired live listing (scheduling the
 * next gap from today), then, once nothing is live, either starts that gap
 * timer (the first time any line becomes reputation-eligible) or posts a
 * fresh listing once the gap elapses, drawn uniformly from every eligible-
 * but-not-yet-owned (line, tier) pair. At most one listing live at a time
 * by construction - `GameState.machineListing` is a single nullable field,
 * never a list. A lapsed machine is never permanently lost: it simply stays
 * in the eligible pool for a later issue to draw again.
 *
 * `day` is the day this result is posted FOR - callers pass their own
 * `+1`-offset day, matching every other daily-generation step in
 * `advanceDay.ts` (the value is stamped directly onto `postedOnDay`, so
 * getting this right is what makes "today's classifieds" actually read as
 * today's).
 */
export function rollMachineListings(
  state: GameState,
  context: SimContext,
  day: number,
  rng: Rng,
): { state: GameState; log: DayLogEntry[] } {
  const { minGapDays, maxGapDays, windowDays } = context.economy.machineListings
  let next = state
  const log: DayLogEntry[] = []

  if (next.machineListing && day >= next.machineListing.expiresOnDay) {
    next = {
      ...next,
      machineListing: null,
      nextMachineListingDay: day + rng.int(minGapDays, maxGapDays),
    }
  }

  if (!next.machineListing) {
    const candidates = eligibleMachineListingCandidates(next, context)
    if (candidates.length > 0) {
      if (next.nextMachineListingDay === null) {
        next = { ...next, nextMachineListingDay: day + rng.int(minGapDays, maxGapDays) }
      } else if (day >= next.nextMachineListingDay) {
        const chosen = rng.pick(candidates)
        next = {
          ...next,
          machineListing: {
            componentId: chosen.componentId,
            tier: chosen.tier,
            priceYen: chosen.priceYen,
            postedOnDay: day,
            expiresOnDay: day + windowDays,
          },
          nextMachineListingDay: null,
        }
        log.push({
          type: 'machine-listed',
          componentId: chosen.componentId,
          tier: chosen.tier,
          priceYen: chosen.priceYen,
        })
      }
    }
  }

  return { state: next, log }
}

/**
 * The pure "upgrade one tool line one tier" core (Sprint 36) - same
 * instant-for-the-player / DayAction-for-bots pattern as `applyBayPurchase`.
 * Sequential only: one call climbs exactly one tier, and gates in order:
 * already at 3 -> no-op not-applied; below the tier's reputation floor
 * (Sprint 43 - tiers 2/3 gate on reputation same as bays, tier 1 never
 * does) -> no-op not-applied; can't afford the next tier's `upgradePriceYen`
 * -> no-op not-applied; no live classifieds listing for this exact line+tier
 * (Sprint 52 decision 2) -> no-op not-applied; otherwise deduct, set tier +
 * 1, consume the listing, and log `tool-upgraded`. A same-day duplicate in a
 * bot's batch re-checks reputation/cash/tier/listing per call, so it is
 * either a genuine second sequential step or a no-op - never a double
 * charge for the same tier, and - since one purchase consumes the ONE live
 * listing - a same-day double-tier climb now requires two separate listing
 * cycles, not two cash/reputation checks; this is deliberate, not a
 * regression (the whole point of decision 2 is one machine at a time).
 */
export function applyToolUpgrade(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): ToolUpgradeResult {
  const currentTier = state.toolTiers[componentId]
  if (currentTier >= 3) return { state, log: [], applied: false }
  if (nextToolTierRepGate(state, componentId, context) !== null) {
    return { state, log: [], applied: false }
  }
  const nextTier = context.toolLines[componentId].tiers[currentTier]!
  if (state.cashYen < nextTier.upgradePriceYen) return { state, log: [], applied: false }
  const toTier = (currentTier + 1) as ToolTier
  // Sprint 52 decision 2: reputation/cash only make a tier ELIGIBLE - a
  // live classifieds listing for this exact line+tier is what makes it
  // actually purchasable. Bots keep firing this every day regardless (the
  // existing fire-and-let-the-resolver-refuse contract, `considerToolUpgrade`
  // - this is simply one more refusal reason, same shape as the reputation
  // gate above); the player's own Upgrade button is disabled the same way.
  if (!isToolTierListed(state, componentId, toTier)) return { state, log: [], applied: false }
  return {
    state: {
      ...state,
      cashYen: state.cashYen - nextTier.upgradePriceYen,
      toolTiers: { ...state.toolTiers, [componentId]: toTier },
      // The listing is consumed the moment its machine sells - left live,
      // it would keep advertising a tier the shop already owns until its
      // window happened to lapse naturally.
      machineListing: null,
    },
    log: [{ type: 'tool-upgraded', componentId, toTier, priceYen: nextTier.upgradePriceYen }],
    applied: true,
  }
}

/** Applies a batch of tool upgrades in order (bots' only path - the player
 * upgrades instantly). Mirrors the retired `applyEquipmentPurchases`. */
export function applyToolUpgrades(
  state: GameState,
  upgrades: readonly UpgradeToolLineAction[],
  context: SimContext,
): { state: GameState; log: DayLogEntry[] } {
  let next = state
  const log: DayLogEntry[] = []
  for (const upgrade of upgrades) {
    const result = applyToolUpgrade(next, upgrade.componentId, context)
    next = result.state
    log.push(...result.log)
  }
  return { state: next, log }
}
