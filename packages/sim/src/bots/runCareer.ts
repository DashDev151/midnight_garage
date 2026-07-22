import type {
  AuctionTier,
  ComponentId,
  GameState,
  RarityTier,
  ReputationTier,
} from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { advanceDay } from '../advanceDay'
import type { SimContext } from '../context'
import { createInitialGameState } from '../newGame'
import { createRng, type Rng } from '../rng'
import { topSpecialtyGroup } from '../serviceJobs'
import { valuateCarForBuyer } from '../valuation'

export type BotStrategy = (state: GameState, context: SimContext, rng: Rng) => DayActions

export interface CareerSnapshot {
  day: number
  cashYen: number
  carsOwned: number
  /** Cash plus owned cars valued at book price - a simple, transparent proxy, not a real buyer valuation. */
  netWorthEstimateYen: number
  reputationTier: ReputationTier
  /** Raw reputation points, alongside the derived tier - lets the gating
   * ladder be tuned against real trajectories instead of guesses. */
  reputationPoints: number
  /** The harness's payback-curve signal: counts tool-tier upgrades, the
   * sum of all six lines' tiers minus 6 (0 for a fresh, never-upgraded
   * shop). */
  equipmentOwnedCount: number
  /** The group the bot is most known for right now and its point value -
   * `engine`/0 for a bot that has never earned any (the argmax default). */
  specialtyTopGroup: ComponentId
  specialtyTopPoints: number
}

/**
 * One successful auction acquisition - a bot's only channel is the instant
 * buyout (`resolveBuyoutInstant`); the live auction room is a player-only
 * interaction (`packages/game/src/screens/auctionRoom.ts`), so no bot career
 * ever produces the room's own hammer-win entry.
 */
export interface AcquisitionSample {
  day: number
  tier: AuctionTier
  channel: 'buyout'
}

/**
 * One offer a for-sale car drew, by the time its outcome is known - feeds
 * the offers.csv the balance report reads "distribution of
 * best-offer-in-n-days vs first offer" from. `carEpisodeId` is a synthetic
 * per-career counter, not the real game car id - it's what lets the
 * Python side reconstruct one car's full day-by-day offer history without
 * a real identifier leaking anywhere. `day` is the day the offer was
 * actually live. `accepted` is true only when this exact offer was the
 * one taken - a later, different offer on the same car is its own
 * separate row.
 */
export interface OfferSample {
  carEpisodeId: number
  day: number
  tier: RarityTier
  offerYen: number
  valueYen: number
  accepted: boolean
}

/**
 * Plays one bot strategy for `days`. Returns one cash/car snapshot per day,
 * every successful auction acquisition (every bot career's channel is
 * `buyout`), and every for-sale offer the career drew - all three feed
 * `pnpm balance:run` → `python -m balance.cli report`. The bot's own
 * decision-making draws from a separate seeded RNG stream than advanceDay's
 * internal resolution (auction generation, the lemon rule, market-heat
 * drift) - both fully deterministic from the one career `seed`, but never
 * sharing draws with each other.
 */
export function runCareer(
  strategy: BotStrategy,
  seed: number,
  days: number,
  context: SimContext,
): {
  snapshots: CareerSnapshot[]
  acquisitions: AcquisitionSample[]
  offers: OfferSample[]
} {
  let state = createInitialGameState(context, seed)
  const snapshots: CareerSnapshot[] = []
  const acquisitions: AcquisitionSample[] = []
  const offers: OfferSample[] = []

  // Per-car offer telemetry: `episodeIdFor` assigns the synthetic
  // carEpisodeId, and `pendingOfferByCar` buffers whichever offer is
  // currently live and not yet known to be accepted or not.
  const episodeIdByCar = new Map<string, number>()
  let nextEpisodeId = 1
  function episodeIdFor(carInstanceId: string): number {
    let id = episodeIdByCar.get(carInstanceId)
    if (id === undefined) {
      id = nextEpisodeId++
      episodeIdByCar.set(carInstanceId, id)
    }
    return id
  }
  const pendingOfferByCar = new Map<string, Omit<OfferSample, 'accepted'>>()
  function finalizePendingOffer(carInstanceId: string, accepted: boolean): void {
    const pending = pendingOfferByCar.get(carInstanceId)
    if (!pending) return
    offers.push({ ...pending, accepted })
    pendingOfferByCar.delete(carInstanceId)
  }

  for (let day = 1; day <= days; day++) {
    const lotsBeforeById = new Map(state.activeAuctionLots.map((lot) => [lot.id, lot]))
    const decisionRng = createRng(seed * 7919 + day)
    const actions = strategy(state, context, decisionRng)
    const result = advanceDay(state, actions, seed + state.day, context)
    state = result.state

    for (const entry of result.log) {
      if (entry.type === 'lot-bought-out') {
        const lot = lotsBeforeById.get(entry.lotId)
        if (lot) acquisitions.push({ day, tier: lot.tier, channel: 'buyout' })
      }

      // A sold car's accepted offer finalizes whatever was pending on it;
      // a fresh offer means yesterday's (if any) went unaccepted -
      // finalize that one as declined before buffering the new one.
      // `state` here is `result.state` (today's post-advance state), so
      // the car (if still owned) and today's real market heat are both
      // the live ones the offer was actually drawn against.
      if (entry.type === 'car-sold') {
        finalizePendingOffer(entry.carInstanceId, true)
      }
      if (entry.type === 'offer-received') {
        finalizePendingOffer(entry.carInstanceId, false)
        const car = state.ownedCars.find((c) => c.id === entry.carInstanceId)
        const model = context.modelsById[entry.modelId]
        const buyer = context.buyers.find((b) => b.id === entry.buyerId)
        if (car && model && buyer) {
          const heatPercent = state.marketHeat[entry.modelId] ?? 100
          const valueYen = Math.round(
            valuateCarForBuyer(
              buyer,
              model,
              car,
              context.partsById,
              context.partsTaxonomy,
              context.partsTaxonomyById,
              heatPercent,
              context.economy,
            ),
          )
          pendingOfferByCar.set(entry.carInstanceId, {
            carEpisodeId: episodeIdFor(entry.carInstanceId),
            day: day + 1,
            tier: model.tier,
            offerYen: entry.priceYen,
            valueYen,
          })
        }
      }
    }

    const carsBookValue = state.ownedCars.reduce((sum, car) => {
      const model = context.modelsById[car.modelId]
      return sum + (model?.bookValueYen ?? 0)
    }, 0)

    const specialtyTop = topSpecialtyGroup(state.specialty)
    snapshots.push({
      day,
      cashYen: state.cashYen,
      carsOwned: state.ownedCars.length,
      netWorthEstimateYen: state.cashYen + carsBookValue,
      reputationTier: state.reputationTier,
      reputationPoints: state.reputationPoints,
      equipmentOwnedCount: Object.values(state.toolTiers).reduce((sum, tier) => sum + tier, 0) - 6,
      specialtyTopGroup: specialtyTop,
      specialtyTopPoints: state.specialty[specialtyTop],
    })
  }

  // Any offer still pending when the career ends never got a chance to be
  // accepted or not within the measurement window - counts as declined,
  // same as any other unaccepted offer.
  for (const carInstanceId of pendingOfferByCar.keys()) {
    finalizePendingOffer(carInstanceId, false)
  }

  return { snapshots, acquisitions, offers }
}
