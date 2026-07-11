import type { AuctionLot, AuctionTier, GameState, ServiceJob } from '@midnight-garage/content'
import { generateAuctionCatalog } from './auctions'
import { currentGameYear, reputationAtLeast } from './calendar'
import {
  AUCTION_TIER_MIN_REPUTATION,
  SERVICE_JOB_EXPIRY_DAYS,
  SERVICE_JOB_OFFERS_PER_REFRESH,
} from './constants'
import type { SimContext } from './context'
import type { Rng } from './rng'
import { generateServiceJobOffers } from './serviceJobs'

const AUCTION_TIERS: readonly AuctionTier[] = [
  'local-yard',
  'regional',
  'premium',
  'collector-network',
]

export interface CatalogRefresh {
  freshLots: AuctionLot[]
  freshOffers: ServiceJob[]
  /** One entry per tier that actually produced lots, for the day's event log. */
  lotsByTier: { tier: AuctionTier; lotCount: number }[]
}

/**
 * Generates one fresh batch of auction lots (per eligible tier) and service-
 * job offers for `day`, gated by the in-game calendar and (for Collector
 * Network) reputation. The single generation path both `createInitialGameState`
 * (day 1 - Sprint 10, so a new career isn't empty for a week) and
 * `advanceDay`'s weekly boundary call, so "which tiers, how many, how long"
 * exists in exactly one place.
 */
export function refreshCatalogs(
  state: GameState,
  context: SimContext,
  day: number,
  rng: Rng,
): CatalogRefresh {
  const year = currentGameYear(state.reputationTier)

  const freshLots: AuctionLot[] = []
  const lotsByTier: { tier: AuctionTier; lotCount: number }[] = []
  for (const tier of AUCTION_TIERS) {
    if (!reputationAtLeast(state.reputationTier, AUCTION_TIER_MIN_REPUTATION[tier])) {
      continue
    }
    const lots = generateAuctionCatalog(
      context.models,
      tier,
      day,
      context.economy.AUCTION_LOTS_PER_TIER[tier],
      rng,
      context.economy,
      year,
    )
    if (lots.length === 0) continue
    freshLots.push(...lots)
    lotsByTier.push({ tier, lotCount: lots.length })
  }

  const freshOffers = generateServiceJobOffers(
    context.serviceJobTypes,
    context.serviceJobCustomerNames,
    context.models,
    context.economy,
    day,
    SERVICE_JOB_OFFERS_PER_REFRESH,
    SERVICE_JOB_EXPIRY_DAYS,
    rng,
    year,
    state.ownedEquipmentIds,
    context.equipmentById,
    state.reputationTier,
  )

  return { freshLots, freshOffers, lotsByTier }
}
