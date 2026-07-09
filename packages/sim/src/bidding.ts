import type { AuctionLot, Buyer, CarModel, Part } from '@midnight-garage/content'
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
 * buyer wants every car" bug).
 */
function interestedBuyers(
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

  const level: LotInterest['level'] =
    contenders === 0 ? 'quiet' : contenders <= 2 ? 'warm' : contenders <= 5 ? 'hot' : 'frenzy'

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
