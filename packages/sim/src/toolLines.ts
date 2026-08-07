import type {
  ComponentId,
  DayLogEntry,
  GameState,
  ReputationTier,
  ToolLevel,
  ToolLevels,
  ToolShop,
  ToolTier,
  ToolTiers,
} from '@midnight-garage/content'
import { reputationAtLeast } from './reputation'
import type { SimContext } from './context'
import { bookCashMovements } from './financeLedger'
import type { UpgradeToolLineAction } from './actions'
import type { Rng } from './rng'

/**
 * Tool lines replace binary equipment ownership. Every line is always
 * owned at tier 1 or above (progression bible law 1: nothing basic is
 * ever locked); upgrading buys labor efficiency (the level IS the
 * `repairLevel` the banded repair formula climbs at) and capability
 * ceilings (`minToolTier` on service-job tasks). There is no ownership
 * gate anywhere - the old owns-the-machine refusal class is structurally
 * unrepresentable.
 *
 * The ladder has two rungs per line and one shop above them. A rung is bought
 * for one line; a shop is bought once and lifts every line it covers to level
 * 3 together. Both are bought the same way: reputation makes them eligible, a
 * live classifieds listing makes them purchasable, and cash buys them.
 */

/** The top rung a tool line carries. Above it there are no rungs, only the
 * shop covering that line. */
const TOP_TOOL_TIER = 2

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

/** A fresh shop's tool levels: every line at 1, no shop owned. */
export function freshToolLevels(): ToolLevels {
  return freshToolTiers()
}

/** The shop's current rung for `componentId`'s tool line. Nothing gates on a
 * rung directly - `toolLevelsFor` below is what capability reads - but the
 * ladder UI and the next-purchase helpers need the rung itself. */
export function toolTierForGroup(state: GameState, componentId: ComponentId): ToolTier {
  return state.toolTiers[componentId]
}

/** The shop covering `componentId`'s line - exactly one always does
 * (`ToolShopsSchema` refuses content where a line is covered twice or not at
 * all). */
export function toolShopForGroup(componentId: ComponentId, context: SimContext): ToolShop {
  return context.toolShopByGroup[componentId]
}

/** Whether the shop covering `componentId`'s line has been bought. */
export function ownsToolShopForGroup(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): boolean {
  return state.toolShopsOwned.includes(toolShopForGroup(componentId, context).id)
}

/**
 * What every line actually works at right now: its own rung, or 3 once the
 * shop covering it is owned. The one derivation everything capability-shaped
 * reads - repair speed and repair ceiling (`repairLevelForGroup`, bands.ts),
 * an operation's gate (`craftOperationCapabilityGateReason`), a service task's
 * `minToolTier` (`taskToolDeficit`) and the NA-to-turbo conversion - so a rung
 * and a shop are one ladder at every call site rather than two parallel
 * checks.
 */
export function toolLevelsFor(state: GameState, context: SimContext): ToolLevels {
  const levels = {} as Record<ComponentId, ToolLevel>
  for (const componentId of ALL_COMPONENT_IDS) {
    levels[componentId] = ownsToolShopForGroup(state, componentId, context)
      ? 3
      : state.toolTiers[componentId]
  }
  return levels
}

export interface ToolUpgradeResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * The reputation tier still required for `componentId`'s NEXT rung,
 * or null if it's already met (or there's no gate - tier 1 has none - or
 * the line is at its top rung). Mirrors `nextBayMinReputationTier`
 * (facilities.ts) exactly, one gate vocabulary for both purchasable things.
 */
export function nextToolTierRepGate(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): ReputationTier | null {
  const currentTier = state.toolTiers[componentId]
  if (currentTier >= TOP_TOOL_TIER) return null
  const required = context.toolLines[componentId].tiers[currentTier]!.minReputationTier
  if (!required || reputationAtLeast(state.reputationTier, required)) return null
  return required
}

/** The reputation tier `shop` still needs, or null once it is met. The shop's
 * twin of `nextToolTierRepGate` above, on the same one gate vocabulary. */
export function toolShopRepGate(state: GameState, shop: ToolShop): ReputationTier | null {
  return reputationAtLeast(state.reputationTier, shop.minReputationTier)
    ? null
    : shop.minReputationTier
}

/**
 * True while a live classifieds listing exists for exactly this line+tier
 * - the one thing (besides reputation and cash) `applyToolUpgrade` gates a
 * rung purchase on.
 */
export function isToolTierListed(
  state: GameState,
  componentId: ComponentId,
  tier: ToolTier,
): boolean {
  return (
    state.machineListing?.kind === 'tool-tier' &&
    state.machineListing.componentId === componentId &&
    state.machineListing.tier === tier
  )
}

/** True while a live classifieds listing exists for exactly this shop - the
 * listing half of `applyToolShopPurchase`'s gate, mirroring
 * `isToolTierListed` above. */
export function isToolShopListed(state: GameState, shopId: string): boolean {
  return state.machineListing?.kind === 'tool-shop' && state.machineListing.shopId === shopId
}

/** One thing the classifieds could advertise, before the posting/expiry days
 * are stamped onto it. */
type MachineListingCandidate =
  | { kind: 'tool-tier'; componentId: ComponentId; tier: ToolTier; priceYen: number }
  | { kind: 'tool-shop'; shopId: string; priceYen: number }

/** Every rung and every shop the garage is reputation-eligible for but
 * hasn't bought yet - the pool a fresh classifieds listing draws from. */
function eligibleMachineListingCandidates(
  state: GameState,
  context: SimContext,
): MachineListingCandidate[] {
  const candidates: MachineListingCandidate[] = []
  for (const componentId of ALL_COMPONENT_IDS) {
    const currentTier = state.toolTiers[componentId]
    if (currentTier >= TOP_TOOL_TIER) continue
    if (nextToolTierRepGate(state, componentId, context) !== null) continue
    candidates.push({
      kind: 'tool-tier',
      componentId,
      tier: (currentTier + 1) as ToolTier,
      priceYen: context.toolLines[componentId].tiers[currentTier]!.upgradePriceYen,
    })
  }
  for (const shop of context.toolShops) {
    if (state.toolShopsOwned.includes(shop.id)) continue
    if (toolShopRepGate(state, shop) !== null) continue
    candidates.push({ kind: 'tool-shop', shopId: shop.id, priceYen: shop.upgradePriceYen })
  }
  return candidates
}

/** The day-log line a fresh listing posts, in whichever of the two shapes it
 * advertises. */
function machineListedLogEntry(candidate: MachineListingCandidate): DayLogEntry {
  return candidate.kind === 'tool-shop'
    ? { type: 'tool-shop-listed', shopId: candidate.shopId, priceYen: candidate.priceYen }
    : {
        type: 'machine-listed',
        componentId: candidate.componentId,
        tier: candidate.tier,
        priceYen: candidate.priceYen,
      }
}

/**
 * The "used-machinery classifieds" day-boundary step - lapses an expired
 * live listing (scheduling the next gap from today), then, once nothing is
 * live, either starts that gap timer (the first time anything becomes
 * reputation-eligible) or posts a fresh listing once the gap elapses,
 * drawn uniformly from every eligible-but-not-yet-owned rung and shop. At
 * most one listing live at a time by construction -
 * `GameState.machineListing` is a single nullable field, never a list. A
 * lapsed machine is never permanently lost: it simply stays in the
 * eligible pool for a later issue to draw again.
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
          machineListing: { ...chosen, postedOnDay: day, expiresOnDay: day + windowDays },
          nextMachineListingDay: null,
        }
        log.push(machineListedLogEntry(chosen))
      }
    }
  }

  return { state: next, log }
}

/**
 * The pure "upgrade one tool line one rung" core - same
 * instant-for-the-player / DayAction-for-bots pattern as `applyBayPurchase`.
 * Sequential only: one call climbs exactly one rung, and gates in order:
 * already at the top rung -> no-op not-applied; below the rung's reputation
 * floor (tier 2 gates on reputation same as bays, tier 1 never does) -> no-op
 * not-applied; can't afford the rung's `upgradePriceYen` -> no-op
 * not-applied; no live classifieds listing for this exact line+tier ->
 * no-op not-applied; otherwise deduct, set tier + 1, consume the listing,
 * and log `tool-upgraded`. A same-day duplicate in a bot's batch re-checks
 * reputation/cash/tier/listing per call, so it is either a genuine second
 * sequential step or a no-op - never a double charge for the same rung,
 * and - since one purchase consumes the ONE live listing - a same-day
 * double-rung climb requires two separate listing cycles, not two
 * cash/reputation checks; this is deliberate, one machine at a time.
 */
export function applyToolUpgrade(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): ToolUpgradeResult {
  const currentTier = state.toolTiers[componentId]
  if (currentTier >= TOP_TOOL_TIER) return { state, log: [], applied: false }
  if (nextToolTierRepGate(state, componentId, context) !== null) {
    return { state, log: [], applied: false }
  }
  const nextTier = context.toolLines[componentId].tiers[currentTier]!
  if (state.cashYen < nextTier.upgradePriceYen) return { state, log: [], applied: false }
  const toTier = (currentTier + 1) as ToolTier
  // Reputation/cash only make a rung ELIGIBLE - a live classifieds listing
  // for this exact line+tier is what makes it actually purchasable. Bots
  // keep firing this every day regardless (the fire-and-let-the-resolver-
  // refuse contract, `considerToolUpgrade` - this is simply one more
  // refusal reason, same shape as the reputation gate above); the
  // player's own Upgrade button is disabled the same way.
  if (!isToolTierListed(state, componentId, toTier)) return { state, log: [], applied: false }
  // A machine bought outright is shop investment, not a running cost - unlike
  // the daily hire of the same line, which is.
  const log: DayLogEntry[] = [
    { type: 'tool-upgraded', componentId, toTier, priceYen: nextTier.upgradePriceYen },
  ]
  return {
    state: bookCashMovements(
      {
        ...state,
        cashYen: state.cashYen - nextTier.upgradePriceYen,
        toolTiers: { ...state.toolTiers, [componentId]: toTier },
        // The listing is consumed the moment its machine sells - left live,
        // it would keep advertising a rung the garage already owns until its
        // window happened to lapse naturally.
        machineListing: null,
      },
      log,
      context.economy,
    ),
    log,
    applied: true,
  }
}

/**
 * Buying a whole shop - the top of the ladder, and the rung purchase's twin in
 * every respect except what it covers: already owned, unmet reputation,
 * unaffordable, or unlisted each refuse as a no-op, and a purchase deducts the
 * cash, records the shop, consumes the listing and books the spend as shop
 * investment. Every line the shop covers reaches level 3 the same day
 * (`toolLevelsFor`); no line's own rung moves, because a shop is not a rung.
 */
export function applyToolShopPurchase(
  state: GameState,
  shopId: string,
  context: SimContext,
): ToolUpgradeResult {
  const shop = context.toolShopsById[shopId]
  if (!shop || state.toolShopsOwned.includes(shopId)) return { state, log: [], applied: false }
  if (toolShopRepGate(state, shop) !== null) return { state, log: [], applied: false }
  if (state.cashYen < shop.upgradePriceYen) return { state, log: [], applied: false }
  if (!isToolShopListed(state, shopId)) return { state, log: [], applied: false }
  const log: DayLogEntry[] = [
    { type: 'tool-shop-purchased', shopId, priceYen: shop.upgradePriceYen },
  ]
  return {
    state: bookCashMovements(
      {
        ...state,
        cashYen: state.cashYen - shop.upgradePriceYen,
        toolShopsOwned: [...state.toolShopsOwned, shopId],
        machineListing: null,
      },
      log,
      context.economy,
    ),
    log,
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
