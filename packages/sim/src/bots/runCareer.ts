import type { AuctionTier, GameState, ReputationTier } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { advanceDay } from '../advanceDay'
import { anchorValueYen } from '../bidding'
import type { SimContext } from '../context'
import { createInitialGameState } from '../newGame'
import { createRng, type Rng } from '../rng'

export type BotStrategy = (state: GameState, context: SimContext, rng: Rng) => DayActions

export interface CareerSnapshot {
  day: number
  cashYen: number
  carsOwned: number
  /** Cash plus owned cars valued at book price - a simple, transparent proxy, not a real buyer valuation. */
  netWorthEstimateYen: number
  reputationTier: ReputationTier
  /** Sprint 15: raw reputation points, alongside the derived tier - lets
   * Sprint 16's gating ladder be tuned against real trajectories instead of
   * guesses about how fast a bot climbs. */
  reputationPoints: number
  /** Sprint 13: how many equipment items are owned - the harness's payback-curve signal. */
  equipmentOwnedCount: number
}

/**
 * One lot the bot actually bid on and lost, or won - the harness's real-play
 * check on the Sprint 20 auction rework's wholesale-anchored clearing
 * calibration. `fraction` is the hammer price as a fraction of the lot's
 * own `anchorValueYen` (Sprint 20's basis change from the old
 * [reserve, buyout]-fraction basis, which stopped meaning anything once
 * buyout re-pointed at the value anchor and reserve stopped bounding real
 * outcomes): steal < 0.65 (won for meaningfully less than it's worth - a
 * genuine steal, typically a thin-turnout lot), mid 0.65-0.9 (patient
 * bidding paid a fair wholesale-ish price), frenzy > 0.9 (bid the price up
 * toward or past what the car is actually worth).
 */
export interface AuctionWinSample {
  day: number
  tier: AuctionTier
  fraction: number
  bucket: 'steal' | 'mid' | 'frenzy'
}

const bucketFor = (fraction: number): AuctionWinSample['bucket'] =>
  fraction < 0.65 ? 'steal' : fraction > 0.9 ? 'frenzy' : 'mid'

/**
 * One successful auction acquisition, by channel - the harness's telemetry
 * for external review 2026-07 finding 2 ("is the buyout premium too cheap"):
 * if bots converge on buyout, the competitive-bidding screen is effectively
 * dead and `AUCTION_BUYOUT_PREMIUM` needs to hurt more.
 */
export interface AcquisitionSample {
  day: number
  tier: AuctionTier
  channel: 'bid' | 'buyout'
}

/**
 * Plays one bot strategy for `days`. Returns one cash/car snapshot per day,
 * every auction the bot actually bid on and lost, or won (the Sprint 10
 * win-price bucket metric), and every successful acquisition by channel
 * (finding 2's buyout-vs-bid telemetry) - all three `pnpm balance:run` →
 * `python -m balance.cli report`. The bot's own decision-making draws from a
 * separate seeded RNG stream than advanceDay's internal resolution (auction
 * generation, the lemon rule, market-heat drift) - both fully deterministic
 * from the one career `seed`, but never sharing draws with each other.
 */
export function runCareer(
  strategy: BotStrategy,
  seed: number,
  days: number,
  context: SimContext,
): {
  snapshots: CareerSnapshot[]
  auctionWins: AuctionWinSample[]
  acquisitions: AcquisitionSample[]
} {
  let state = createInitialGameState(context, seed)
  const snapshots: CareerSnapshot[] = []
  const auctionWins: AuctionWinSample[] = []
  const acquisitions: AcquisitionSample[] = []

  for (let day = 1; day <= days; day++) {
    const stateBeforeToday = state
    const lotsBeforeById = new Map(state.activeAuctionLots.map((lot) => [lot.id, lot]))
    const decisionRng = createRng(seed * 7919 + day)
    const actions = strategy(state, context, decisionRng)
    const result = advanceDay(state, actions, seed + state.day, context)
    state = result.state

    for (const entry of result.log) {
      if (entry.type === 'auction-bid-won' || entry.type === 'lot-bought-out') {
        const lot = lotsBeforeById.get(entry.lotId)
        if (lot) {
          acquisitions.push({
            day,
            tier: lot.tier,
            channel: entry.type === 'auction-bid-won' ? 'bid' : 'buyout',
          })
        }
      }

      if (entry.type !== 'auction-bid-won' && entry.type !== 'auction-bid-lost') continue
      const priceYen =
        entry.type === 'auction-bid-won' ? entry.finalPriceYen : entry.winningPriceYen
      const lot = lotsBeforeById.get(entry.lotId)
      if (!lot) continue
      const anchorYen = anchorValueYen(lot, stateBeforeToday, context)
      if (anchorYen <= 0) continue // no interested buyer archetype - nothing to compare against
      const fraction = priceYen / anchorYen
      auctionWins.push({ day, tier: lot.tier, fraction, bucket: bucketFor(fraction) })
    }

    const carsBookValue = state.ownedCars.reduce((sum, car) => {
      const model = context.modelsById[car.modelId]
      return sum + (model?.bookValueYen ?? 0)
    }, 0)

    snapshots.push({
      day,
      cashYen: state.cashYen,
      carsOwned: state.ownedCars.length,
      netWorthEstimateYen: state.cashYen + carsBookValue,
      reputationTier: state.reputationTier,
      reputationPoints: state.reputationPoints,
      equipmentOwnedCount: state.ownedEquipmentIds.length,
    })
  }

  return { snapshots, auctionWins, acquisitions }
}
