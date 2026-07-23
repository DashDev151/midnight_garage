import type { AuctionLot, AuctionTier, GameState } from '@midnight-garage/content'
import { generateAuctionCatalog } from './auctions'
import { currentGameYear } from './calendar'
import type { SimContext } from './context'
import type { Rng } from './rng'
import { excludedAuctionModelIds } from './tutorial'

const AUCTION_TIERS: readonly AuctionTier[] = [
  'local-yard',
  'regional',
  'premium',
  'collector-network',
]

export interface CatalogRefresh {
  freshLots: AuctionLot[]
  /** One entry per tier that actually produced lots, for the day's event log. */
  lotsByTier: { tier: AuctionTier; lotCount: number }[]
}

/**
 * Whether `tier` is open for `state` right now - derived, never stored.
 * `local-yard` is always open (the lease's own guarantor); every other tier
 * opens the moment some story-mission record reaches `delivered` for a
 * mission whose content names it via `unlocksAuctionTier`. The mission
 * record IS the fact, so there is nothing else to check - a tier with no
 * authored unlocking mission simply never opens.
 */
export function isAuctionTierUnlocked(
  state: GameState,
  context: SimContext,
  tier: AuctionTier,
): boolean {
  if (tier === 'local-yard') return true
  return state.storyMissions.some(
    (record) =>
      record.status === 'delivered' &&
      context.storyMissionsById[record.missionId]?.unlocksAuctionTier === tier,
  )
}

/** Every auction tier open for `state` right now, in tier order. */
export function unlockedAuctionTiers(state: GameState, context: SimContext): AuctionTier[] {
  return AUCTION_TIERS.filter((tier) => isAuctionTierUnlocked(state, context, tier))
}

/**
 * Shared generation loop: for each unlocked tier (`isAuctionTierUnlocked`),
 * asks `countForTier` how many lots to roll today and generates exactly
 * that many via `generateAuctionCatalog` - the one place "which tiers,
 * stocked how" lives, whether the caller wants a fixed day-1 batch
 * (`refreshCatalogs`) or a small daily trickle (`generateDailyAuctionArrivals`).
 */
function generateForEligibleTiers(
  state: GameState,
  context: SimContext,
  day: number,
  rng: Rng,
  countForTier: (tier: AuctionTier) => number,
): CatalogRefresh {
  const year = currentGameYear(state.reputationTier)
  // While the tutorial is active, the tutorial model is excluded from every
  // random roll. Computed here because both callers (the day-1 batch and the
  // daily arrivals) flow through this loop, so the scripted lot can never
  // gain an un-scripted twin on any day.
  const excludedModelIds = excludedAuctionModelIds(state)

  const freshLots: AuctionLot[] = []
  const lotsByTier: { tier: AuctionTier; lotCount: number }[] = []
  for (const tier of AUCTION_TIERS) {
    if (!isAuctionTierUnlocked(state, context, tier)) {
      continue
    }
    const count = countForTier(tier)
    if (count <= 0) continue
    const lots = generateAuctionCatalog(
      context.models,
      tier,
      day,
      count,
      rng,
      context,
      year,
      state.reputationTier,
      excludedModelIds,
    )
    if (lots.length === 0) continue
    freshLots.push(...lots)
    lotsByTier.push({ tier, lotCount: lots.length })
  }

  return { freshLots, lotsByTier }
}

/**
 * Generates day 1's full opening auction board - the fixed
 * `AUCTION_LOTS_PER_TIER` batch per eligible tier, so a new career isn't
 * empty on its first day. Called once, by `createInitialGameState` only;
 * every day after day 1 uses `generateDailyAuctionArrivals` below instead.
 */
export function refreshCatalogs(
  state: GameState,
  context: SimContext,
  day: number,
  rng: Rng,
): CatalogRefresh {
  return generateForEligibleTiers(
    state,
    context,
    day,
    rng,
    (tier) => context.economy.AUCTION_LOTS_PER_TIER[tier],
  )
}

/**
 * A newly-unlocked tier's opening batch - the SAME day-1 seeding path
 * `refreshCatalogs` uses (`AUCTION_LOTS_PER_TIER[tier]` lots via
 * `generateAuctionCatalog`), scoped to just this one tier. Called the
 * instant a guarantor mission delivers, so a tier that opens today is
 * stocked today, never an empty room. `day` is the CURRENT day (unlike the
 * daily-arrivals seam, this isn't posted for tomorrow - the guarantor's
 * introduction lands the same tick the mission resolves).
 */
export function stockNewlyUnlockedTier(
  state: GameState,
  context: SimContext,
  day: number,
  tier: AuctionTier,
  rng: Rng,
): AuctionLot[] {
  const year = currentGameYear(state.reputationTier)
  const excludedModelIds = excludedAuctionModelIds(state)
  return generateAuctionCatalog(
    context.models,
    tier,
    day,
    context.economy.AUCTION_LOTS_PER_TIER[tier],
    rng,
    context,
    year,
    state.reputationTier,
    excludedModelIds,
  )
}

/**
 * Every day's real arrival process - per-tier daily spawn RATE
 * (`economy.json`'s `AUCTION_DAILY_SPAWN_RATE`, tuned for more lots than
 * a player can chase), turned into an actual integer lot count via
 * `rollDailySpawnCount`. Called every day from `advanceDay`'s day-boundary
 * step.
 */
export function generateDailyAuctionArrivals(
  state: GameState,
  context: SimContext,
  day: number,
  rng: Rng,
): CatalogRefresh {
  return generateForEligibleTiers(state, context, day, rng, (tier) =>
    rollDailySpawnCount(context.economy.AUCTION_DAILY_SPAWN_RATE[tier], rng),
  )
}

/**
 * Turns a real-valued expected-lots-per-day rate into an actual integer
 * count for today: the integer part always spawns, plus one more with
 * probability equal to the fractional remainder - so the long-run average
 * across many days is exactly `rate`, with low day-to-day variance (never
 * more than one lot away from `floor(rate)`).
 */
function rollDailySpawnCount(rate: number, rng: Rng): number {
  const whole = Math.floor(rate)
  const fraction = rate - whole
  return whole + (rng.next() < fraction ? 1 : 0)
}
