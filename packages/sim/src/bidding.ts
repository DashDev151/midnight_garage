import type {
  AuctionLot,
  Buyer,
  CarModel,
  DayLogEntry,
  GameState,
  Part,
} from '@midnight-garage/content'
import { resolveHandoverCondition } from './auctions'
import {
  AUCTION_BID_INCREMENT_YEN,
  AUCTION_BIDDER_NOISE_RANGE,
  AUCTION_BUYOUT_PREMIUM,
  AUCTION_FIELD_BASE,
  AUCTION_FIELD_PER_INTEREST,
  AUCTION_FIELD_SIZE_SD,
  AUCTION_INTEREST_BASE_BAND,
  AUCTION_RESERVE_PRICE_FRACTION,
} from './constants'
import type { SimContext } from './context'
import { assignToParking, hasParkingSpace } from './facilities'
import { bellNormal, createRng, hashStringToSeed } from './rng'
import { auctionBidValueFor } from './valuation'

export interface AuctionResult {
  winner: 'player' | 'ai' | 'no-sale'
  finalPriceYen: number
}

/** A fuzzy read on rival demand for a lot, so the player can calibrate a bid. */
export interface LotInterest {
  level: 'quiet' | 'warm' | 'hot' | 'frenzy'
  /** Rival bidders willing to meet the reserve. */
  contenders: number
  /** Fuzzy "bid within this range to win" read (0 when nobody's expected to bid). */
  estimateLowYen: number
  estimateHighYen: number
}

function buyoutPriceYen(lot: AuctionLot): number {
  return Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
}

/**
 * Buyer archetypes with a genuinely stated interest in a model's tier — the
 * gate (Sprint 10). No entry for a tier means that archetype never bids on
 * it; there is no default fallback (that fallback was the original "every
 * buyer wants every car" bug). Exported (Sprint 11) so `selling.ts` can
 * apply the identical gate to walk-in/listing buyers — the same rule was
 * missing on the sell side, not a different rule.
 */
export function interestedBuyers(
  model: CarModel,
  buyers: readonly Buyer[],
): { buyer: Buyer; weight: number }[] {
  return buyers.flatMap((buyer) => {
    const preference = buyer.tierPreferences.find((p) => p.tier === model.tier)
    return preference && preference.weight > 0 ? [{ buyer, weight: preference.weight }] : []
  })
}

/**
 * The variable, bell-distributed rival field for one lot (Sprint 10): how
 * many anonymous bidders show up (a bell roll around a mean that scales with
 * how many archetypes want the car) and what each of them bids (drawn from
 * an interested archetype weighted by preference strength, disciplined below
 * resale value, noised per-bidder, and capped at the lot's buyout price so no
 * rival can ever outbid instant certainty). Seeded entirely on the lot's id,
 * so `computeLotInterest` and `resolveAuction` always construct the
 * identical field — the shown read and the real resolution never disagree.
 */
function buildRivalField(
  lot: AuctionLot,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
): number[] {
  const interested = interestedBuyers(model, buyers)
  if (interested.length === 0) return []

  const rng = createRng(hashStringToSeed(lot.id))
  const interestBreadth = interested.reduce((sum, i) => sum + i.weight, 0)
  const fieldMean = AUCTION_FIELD_BASE + AUCTION_FIELD_PER_INTEREST * interestBreadth
  const fieldSize = Math.max(0, Math.round(bellNormal(fieldMean, AUCTION_FIELD_SIZE_SD, rng)))

  const cap = buyoutPriceYen(lot)
  const [noiseMin, noiseMax] = AUCTION_BIDDER_NOISE_RANGE
  const bids: number[] = []
  for (let i = 0; i < fieldSize; i++) {
    let roll = rng.next() * interestBreadth
    let archetype = interested[interested.length - 1]!.buyer
    for (const candidate of interested) {
      if (roll < candidate.weight) {
        archetype = candidate.buyer
        break
      }
      roll -= candidate.weight
    }
    const noise = noiseMin + rng.next() * (noiseMax - noiseMin)
    const rawBid = auctionBidValueFor(archetype, model, lot.car, partsById) * noise
    bids.push(Math.round(Math.min(rawBid, cap)))
  }
  return bids
}

/**
 * How much competition a lot is likely to draw, and roughly what it takes to
 * WIN it — the "Interest" read the auction screen shows so bidding is a
 * judgment call, not a blind guess. Built from the exact same rival field
 * `resolveAuction` resolves against, then fuzzed into a range. `precision`
 * (0..1, default 0) narrows the band — the hook a future auction-scout staff
 * trait plugs into for a sharper read.
 */
export function computeLotInterest(
  lot: AuctionLot,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  precision = 0,
): LotInterest {
  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
  const bids = buildRivalField(lot, model, buyers, partsById)
    .filter((bid) => bid >= reserveYen)
    .sort((a, b) => b - a)
  const contenders = bids.length

  // Recalibrated (Sprint 11, round-2 playtest #1): the Sprint 10 thresholds
  // (frenzy above 5) never accounted for the new field's own average size
  // (~6.2, confirmed by the real balance harness) — "frenzy" was firing on
  // roughly a quarter to half of every auction depending on tier. Empirically
  // measured against the contenders distribution (2,000-sample probe on a
  // broadly-wanted "rare" tier): `contenders > 11` lands at ~7% of lots,
  // squarely in the 5-10% economic frenzy target instead of eyeballed.
  const level: LotInterest['level'] =
    contenders === 0 ? 'quiet' : contenders <= 3 ? 'warm' : contenders <= 11 ? 'hot' : 'frenzy'

  // The number that actually wins is the TOP bid, not the second-price
  // clearing number — bidding above a "clearing price" estimate could still
  // lose to a single aggressive top bidder, which is the exact bug this
  // re-centering fixes.
  const center = bids[0] ?? 0
  const band = AUCTION_INTEREST_BASE_BAND * (1 - Math.max(0, Math.min(1, precision)))
  const roundTo10k = (n: number) => Math.round(n / 10_000) * 10_000

  return {
    level,
    contenders,
    estimateLowYen: center > 0 ? roundTo10k(center * (1 - band)) : 0,
    estimateHighYen: center > 0 ? roundTo10k(center * (1 + band)) : 0,
  }
}

/**
 * Second-price sealed-bid resolution (Sprint 03 decision 4; reworked Sprint
 * 10 around the variable rival field). The winner pays the second-highest
 * bid plus a small increment — never their own max — so the player can
 * occasionally win well under what they were willing to pay (decision 4b).
 */
export function resolveAuction(
  lot: AuctionLot,
  model: CarModel,
  playerMaxBidYen: number | null,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
): AuctionResult {
  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)

  const bids: { isPlayer: boolean; maxBidYen: number }[] = buildRivalField(
    lot,
    model,
    buyers,
    partsById,
  ).map((maxBidYen) => ({ isPlayer: false, maxBidYen }))
  if (playerMaxBidYen !== null && playerMaxBidYen > 0) {
    bids.push({ isPlayer: true, maxBidYen: playerMaxBidYen })
  }

  const eligible = bids
    .filter((bid) => bid.maxBidYen >= reserveYen)
    .sort((a, b) => b.maxBidYen - a.maxBidYen)

  const top = eligible[0]
  if (!top) {
    return { winner: 'no-sale', finalPriceYen: 0 }
  }

  const second = eligible[1]
  const finalPriceYen = second
    ? Math.min(top.maxBidYen, second.maxBidYen + AUCTION_BID_INCREMENT_YEN)
    : Math.min(top.maxBidYen, reserveYen + AUCTION_BID_INCREMENT_YEN)

  return {
    winner: top.isPlayer ? 'player' : 'ai',
    finalPriceYen,
  }
}

export interface AcquisitionResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The car-condition roll on a won lot (the sliding-scale lemon rule) needs
 * an RNG, but there's no meaningful "day" for an instant, single-click
 * acquisition to derive one from — seeded on the lot's own id instead
 * (distinct from the rival-field seed, `hashStringToSeed(lot.id)`, via a
 * suffix) so the outcome is reproducible regardless of when the click
 * happens, matching the rest of Sprint 10's per-lot-id-seeded philosophy.
 */
function handoverRng(lotId: string) {
  return createRng(hashStringToSeed(`${lotId}:handover`))
}

/**
 * The instant bid resolver (Sprint 11): resolves the moment it's placed.
 * `buildRivalField` is seeded purely on the lot's id, never the day or a
 * bid's timing, so resolving instantly produces an identical outcome to
 * resolving at End Day — nothing about the auction math needs a day
 * boundary. Shared by the player's instant click and advanceDay's bot batch
 * loop (one queued bid per call, same as every other Sprint 11 resolver).
 */
export function resolveBidInstant(
  state: GameState,
  lotId: string,
  maxBidYen: number,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  const model = context.modelsById[lot.modelId]
  if (!model) return { state, log: [] }

  const result = resolveAuction(lot, model, maxBidYen, context.buyers, context.partsById)
  if (result.winner === 'no-sale') return { state, log: [] }

  const remainingLots = state.activeAuctionLots.filter((l) => l.id !== lotId)

  if (result.winner === 'ai') {
    return {
      state: { ...state, activeAuctionLots: remainingLots },
      log: [{ type: 'auction-bid-lost', lotId, winningPriceYen: result.finalPriceYen }],
    }
  }

  // The player won — but unlike a buyout, rivals already contested this
  // lot, so a full garage doesn't put the auction on hold, it forfeits the
  // win to them (the lot is already gone either way).
  if (!hasParkingSpace(state)) {
    return {
      state: { ...state, activeAuctionLots: remainingLots },
      log: [
        { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-parking' },
        { type: 'auction-bid-lost', lotId, winningPriceYen: result.finalPriceYen },
      ],
    }
  }

  const finalCar = resolveHandoverCondition(
    lot,
    result.finalPriceYen,
    context.hiddenIssuesById,
    handoverRng(lotId),
  )
  const withCar = assignToParking(
    {
      ...state,
      cashYen: state.cashYen - result.finalPriceYen,
      ownedCars: [...state.ownedCars, finalCar],
      activeAuctionLots: remainingLots,
    },
    finalCar.id,
  )
  return {
    state: withCar,
    log: [{ type: 'auction-bid-won', lotId, finalPriceYen: result.finalPriceYen }],
  }
}

/**
 * The instant buyout resolver (Sprint 11): a guaranteed purchase at a
 * premium, no rival contest — a full garage just means the purchase doesn't
 * happen right now (no money spent), the lot stays on the board for a retry
 * once space frees up. Shared by the player's instant click and advanceDay's
 * bot batch loop.
 */
export function resolveBuyoutInstant(
  state: GameState,
  lotId: string,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  const priceYen = buyoutPriceYen(lot)
  if (state.cashYen < priceYen) return { state, log: [] }
  if (!hasParkingSpace(state)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' }],
    }
  }

  const car = resolveHandoverCondition(lot, priceYen, context.hiddenIssuesById, handoverRng(lotId))
  const withCar = assignToParking(
    {
      ...state,
      cashYen: state.cashYen - priceYen,
      ownedCars: [...state.ownedCars, car],
      activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== lotId),
    },
    car.id,
  )
  return {
    state: withCar,
    log: [{ type: 'lot-bought-out', lotId, priceYen }],
  }
}
