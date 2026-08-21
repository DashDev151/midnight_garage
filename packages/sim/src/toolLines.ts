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

/**
 * Tool lines replace binary equipment ownership. Every line is always
 * owned at tier 1 or above (progression bible law 1: nothing basic is
 * ever locked); upgrading buys labor efficiency (the level IS the
 * `repairLevel` the banded repair formula climbs at) and capability
 * ceilings (a Restore, and the service jobs that ask for one). There is no ownership
 * gate anywhere - the old owns-the-machine refusal class is structurally
 * unrepresentable.
 *
 * The ladder has two rungs per line and one shop above them. A rung is bought
 * for one line; a shop is bought once and lifts every line it covers to level
 * 3 together. Both are bought the same way: reputation makes them eligible,
 * and cash buys them.
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
 * own gate (`taskToolBlocked`) and the NA-to-turbo conversion - so a rung
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
 * The pure "upgrade one tool line one rung" core - same
 * instant-for-the-player / DayAction-for-bots pattern as `applyBayPurchase`.
 * Sequential only: one call climbs exactly one rung, and gates in order:
 * already at the top rung -> no-op not-applied; below the rung's reputation
 * floor (tier 2 gates on reputation same as bays, tier 1 never does) -> no-op
 * not-applied; can't afford the rung's `upgradePriceYen` -> no-op
 * not-applied; otherwise deduct, set tier + 1, and log `tool-upgraded`.
 * Reputation and cash are the whole gate - no classifieds listing stands
 * between them and the purchase. A same-day duplicate in a bot's batch
 * re-checks reputation/cash/tier per call, so it is either a genuine second
 * sequential step (a different, now-eligible rung) or a no-op - never a
 * double charge for the same rung.
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
 * every respect except what it covers: already owned, unmet reputation, or
 * unaffordable each refuse as a no-op, and a purchase deducts the cash,
 * records the shop, and books the spend as shop investment. Every line the
 * shop covers reaches level 3 the same day (`toolLevelsFor`); no line's own
 * rung moves, because a shop is not a rung.
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
  const log: DayLogEntry[] = [
    { type: 'tool-shop-purchased', shopId, priceYen: shop.upgradePriceYen },
  ]
  return {
    state: bookCashMovements(
      {
        ...state,
        cashYen: state.cashYen - shop.upgradePriceYen,
        toolShopsOwned: [...state.toolShopsOwned, shopId],
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
