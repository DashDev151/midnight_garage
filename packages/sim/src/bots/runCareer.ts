import type {
  AuctionLot,
  AuctionTier,
  GameState,
  RarityTier,
  ReputationTier,
} from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { advanceDay } from '../advanceDay'
import { anchorValueYen, bidIncrementYen } from '../bidding'
import type { SimContext } from '../context'
import { createInitialGameState } from '../newGame'
import { createRng, type Rng } from '../rng'
import { valuateCarForBuyer } from '../valuation'

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
  /**
   * Sprint 30 decision 3 telemetry: how many bid increments landed on this
   * lot across its whole life (opening the reserve counts as one, each
   * subsequent overnight/player raise approximated by dividing the yen
   * delta by the lot's own fixed `bidIncrementYen` - the ladder is constant
   * per lot, so this is exact except for the rare rounding case where a
   * night's raise doesn't land on an exact multiple). Calibrates the daily
   * bidder-interest process against real bot play: a market with too little
   * activity would show most lots at 1-2.
   */
  bidEvents: number
  /** Days between this lot's catalog appearance and its hammer (inclusive
   * both ends) - the daily-arrivals-era companion to `bidEvents`, showing
   * how long a real lot actually stays on the board before resolving. */
  daysOpen: number
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
 * One offer a for-sale car drew, by the time its outcome is known (Sprint 31
 * decision 3's designer-facing math: the offers.csv the balance report reads
 * "distribution of best-offer-in-n-days vs first offer" from). `carEpisodeId`
 * is a synthetic per-career counter, not the real game car id (never needed
 * outside this one process) - it's what lets the Python side reconstruct one
 * car's full day-by-day offer history without a real identifier leaking
 * anywhere. `day` is the day the offer was actually live (matches the day
 * the resulting `car-sold`, if any, would land on). `accepted` is true only
 * when this exact offer was the one taken - a later, different offer on the
 * same car is its own separate row.
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
 * every auction the bot actually bid on and lost, or won (the Sprint 10
 * win-price bucket metric, now also carrying Sprint 30's `bidEvents`/
 * `daysOpen` bidder-process telemetry), and every successful acquisition by
 * channel (finding 2's buyout-vs-bid telemetry) - all three `pnpm balance:run`
 * → `python -m balance.cli report`. The bot's own decision-making draws from a
 * separate seeded RNG stream than advanceDay's internal resolution (auction
 * generation, the lemon rule, market-heat drift) - both fully deterministic
 * from the one career `seed`, but never sharing draws with each other.
 */
/** Sprint 30 decision 3 telemetry (`AuctionWinSample.bidEvents`/`daysOpen`):
 * one lot's running tally, tracked across days since a lot's whole life
 * usually spans several `runCareer` iterations. `lastBidYen` is the last
 * `currentBidYen` this function observed for the lot (0 until its first
 * raise), so a jump between observations can be turned into an increment
 * count via the lot's own fixed `bidIncrementYen` ladder. */
interface LotTelemetryMeta {
  createdDay: number
  lastBidYen: number
  bidEvents: number
}

/** Adds however many `bidIncrementYen`-sized steps `newBidYen` represents
 * over `meta.lastBidYen` (at least 1 if it moved at all - the raw yen delta
 * for the very first raise, reserve, isn't itself a clean multiple of the
 * ladder), then updates `lastBidYen` to match. */
function recordBidDelta(
  meta: LotTelemetryMeta,
  lot: AuctionLot,
  newBidYen: number,
  economy: SimContext['economy'],
): void {
  if (newBidYen <= meta.lastBidYen) return
  const increment = bidIncrementYen(lot, economy)
  const stepsSinceLast =
    meta.lastBidYen === 0 ? 1 : Math.max(1, Math.round((newBidYen - meta.lastBidYen) / increment))
  meta.bidEvents += stepsSinceLast
  meta.lastBidYen = newBidYen
}

export function runCareer(
  strategy: BotStrategy,
  seed: number,
  days: number,
  context: SimContext,
): {
  snapshots: CareerSnapshot[]
  auctionWins: AuctionWinSample[]
  acquisitions: AcquisitionSample[]
  offers: OfferSample[]
} {
  let state = createInitialGameState(context, seed)
  const snapshots: CareerSnapshot[] = []
  const auctionWins: AuctionWinSample[] = []
  const acquisitions: AcquisitionSample[] = []
  const offers: OfferSample[] = []
  const lotMeta = new Map<string, LotTelemetryMeta>()

  // Sprint 31 offers.csv telemetry: a synthetic per-career counter (never
  // the real game car id) so the Python side can group one car's day-by-day
  // offer history together, and a one-row-per-car buffer for whichever offer
  // is currently live and not yet known to be accepted or not.
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
    const stateBeforeToday = state
    const lotsBeforeById = new Map(state.activeAuctionLots.map((lot) => [lot.id, lot]))
    const decisionRng = createRng(seed * 7919 + day)
    const actions = strategy(state, context, decisionRng)
    const result = advanceDay(state, actions, seed + state.day, context)
    state = result.state

    // Register any lot that's new today, then record today's bid movement
    // for every lot still on the board (a lot that hammers TODAY is already
    // gone from `state.activeAuctionLots` - its final movement, if any, is
    // recorded from the log entry itself below instead).
    for (const lot of state.activeAuctionLots) {
      if (!lotMeta.has(lot.id)) {
        lotMeta.set(lot.id, { createdDay: day, lastBidYen: 0, bidEvents: 0 })
      }
      const meta = lotMeta.get(lot.id)!
      recordBidDelta(meta, lot, lot.currentBidYen, context.economy)
    }

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

      // Sprint 31 offers.csv telemetry: a sold car's accepted offer finalizes
      // whatever was pending on it; a fresh offer means yesterday's (if any)
      // went unaccepted - finalize that one as declined before buffering the
      // new one. `state` here is `result.state` (today's post-advance state),
      // so the car (if still owned) and today's real market heat are both
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

      if (entry.type !== 'auction-bid-won' && entry.type !== 'auction-bid-lost') continue
      const priceYen =
        entry.type === 'auction-bid-won' ? entry.finalPriceYen : entry.winningPriceYen
      const lot = lotsBeforeById.get(entry.lotId)
      if (!lot) continue
      // The hammer's own price may include tonight's final raise, which the
      // per-lot loop above never saw (the lot was already gone from
      // `state.activeAuctionLots` by the time it ran) - record it now,
      // before reading `bidEvents`/`createdDay` back out.
      const meta = lotMeta.get(entry.lotId)
      if (meta) recordBidDelta(meta, lot, priceYen, context.economy)

      const anchorYen = anchorValueYen(lot, stateBeforeToday, context)
      if (anchorYen <= 0) continue // no interested buyer archetype - nothing to compare against
      const fraction = priceYen / anchorYen
      auctionWins.push({
        day,
        tier: lot.tier,
        fraction,
        bucket: bucketFor(fraction),
        bidEvents: meta?.bidEvents ?? 0,
        daysOpen: meta ? day - meta.createdDay + 1 : 0,
      })
    }

    // A lot no longer on the board (hammered, bought out, or expired
    // unsold) has nothing left to track - drop it so this map stays bounded
    // across a 100-day career rather than accumulating every lot ever seen.
    const stillActiveIds = new Set(state.activeAuctionLots.map((lot) => lot.id))
    for (const lotId of lotMeta.keys()) {
      if (!stillActiveIds.has(lotId)) lotMeta.delete(lotId)
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

  // Any offer still pending when the career ends never got a chance to be
  // accepted or not within the measurement window - counts as declined,
  // same as any other unaccepted offer.
  for (const carInstanceId of pendingOfferByCar.keys()) {
    finalizePendingOffer(carInstanceId, false)
  }

  return { snapshots, auctionWins, acquisitions, offers }
}
