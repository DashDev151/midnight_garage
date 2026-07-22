import type { AuctionLot, AuctionTier, GameState } from '@midnight-garage/content'
import { generateAuctionCatalog } from './auctions'
import { currentGameYear, reputationAtLeast } from './calendar'
import { AUCTION_TIER_MIN_REPUTATION } from './constants'
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
 * Shared generation loop: for each eligible tier (calendar + reputation
 * gated), asks `countForTier` how many lots to roll today and generates
 * exactly that many via `generateAuctionCatalog` - the one place "which
 * tiers, gated how" lives, whether the caller wants a fixed day-1 batch
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
    if (!reputationAtLeast(state.reputationTier, AUCTION_TIER_MIN_REPUTATION[tier])) {
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
