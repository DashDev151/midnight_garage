import type { AuctionTier, GameState, ReputationTier } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { advanceDay } from '../advanceDay'
import { computeLotInterest } from '../bidding'
import { AUCTION_BUYOUT_PREMIUM, AUCTION_RESERVE_PRICE_FRACTION } from '../constants'
import type { SimContext } from '../context'
import { createInitialGameState } from '../newGame'
import { createRng, type Rng } from '../rng'

export type BotStrategy = (state: GameState, context: SimContext, rng: Rng) => DayActions

export interface CareerSnapshot {
  day: number
  cashYen: number
  carsOwned: number
  /** Cash plus owned cars valued at book price — a simple, transparent proxy, not a real buyer valuation. */
  netWorthEstimateYen: number
  reputationTier: ReputationTier
}

/**
 * One lot the bot actually bid on and lost, or won — the harness's real-play
 * check on the Sprint 10 auction rework's bell-curve calibration (decision
 * 4f): where the clearing price landed within [reserve, buyout].
 */
export interface AuctionWinSample {
  day: number
  tier: AuctionTier
  fraction: number
  bucket: 'steal' | 'mid' | 'frenzy'
}

const bucketFor = (fraction: number): AuctionWinSample['bucket'] =>
  fraction < 0.2 ? 'steal' : fraction > 0.8 ? 'frenzy' : 'mid'

/**
 * Plays one bot strategy for `days`. Returns one cash/car snapshot per day
 * plus, separately, every auction the bot actually bid on and lost, or won
 * — the underlying harness data for the Sprint 10 win-price bucket metric
 * (`pnpm balance:run` → `python -m balance.cli report`). The bot's own
 * decision-making draws from a separate seeded RNG stream than advanceDay's
 * internal resolution (auction generation, the lemon rule, market-heat
 * drift) — both fully deterministic from the one career `seed`, but never
 * sharing draws with each other.
 */
export function runCareer(
  strategy: BotStrategy,
  seed: number,
  days: number,
  context: SimContext,
): { snapshots: CareerSnapshot[]; auctionWins: AuctionWinSample[] } {
  let state = createInitialGameState(context, seed)
  const snapshots: CareerSnapshot[] = []
  const auctionWins: AuctionWinSample[] = []

  for (let day = 1; day <= days; day++) {
    const lotsBeforeById = new Map(state.activeAuctionLots.map((lot) => [lot.id, lot]))
    const decisionRng = createRng(seed * 7919 + day)
    const actions = strategy(state, context, decisionRng)
    const result = advanceDay(state, actions, seed + state.day, context)
    state = result.state

    for (const entry of result.log) {
      if (entry.type !== 'auction-bid-won' && entry.type !== 'auction-bid-lost') continue
      const priceYen =
        entry.type === 'auction-bid-won' ? entry.finalPriceYen : entry.winningPriceYen
      const lot = lotsBeforeById.get(entry.lotId)
      if (!lot) continue
      const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
      const buyoutYen = Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
      const fraction = Math.max(0, Math.min(1, (priceYen - reserveYen) / (buyoutYen - reserveYen)))
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
    })
  }

  return { snapshots, auctionWins }
}

/**
 * Rival-field size the auction screen would have shown for every lot on the
 * day it first appeared — the population-level companion to `auctionWins`
 * above (target: average 3-9 contenders, decision 4f). Runs a second,
 * read-only pass so bidding on the field never influences the sample.
 */
export function sampleFieldSizes(seed: number, days: number, context: SimContext): number[] {
  let state = createInitialGameState(context, seed)
  const samples: number[] = []
  const seenLotIds = new Set<string>()

  for (let day = 1; day <= days; day++) {
    for (const lot of state.activeAuctionLots) {
      if (seenLotIds.has(lot.id)) continue
      seenLotIds.add(lot.id)
      const model = context.modelsById[lot.modelId]
      if (!model) continue
      samples.push(computeLotInterest(lot, model, context.buyers, context.partsById).contenders)
    }
    state = advanceDay(state, emptyDayActions(), seed + state.day, context).state
  }

  return samples
}
