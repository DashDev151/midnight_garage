import type { AuctionLot, Buyer, CarModel, Part } from '@midnight-garage/content'
import {
  AUCTION_BID_INCREMENT_YEN,
  AUCTION_BIDDER_NOISE_RANGE,
  AUCTION_INTEREST_BASE_BAND,
  AUCTION_RESERVE_PRICE_FRACTION,
} from './constants'
import { createRng, hashStringToSeed } from './rng'
import { valuateCarForBuyer } from './valuation'

export interface AuctionBidder {
  id: string
  buyer: Buyer
}

export interface AuctionResult {
  winner: 'player' | 'ai' | 'no-sale'
  finalPriceYen: number
  winningBidderId?: string
}

/** A fuzzy read on rival demand for a lot, so the player can calibrate a bid. */
export interface LotInterest {
  level: 'quiet' | 'warm' | 'hot' | 'frenzy'
  /** Rival bidders willing to meet the reserve. */
  contenders: number
  /** Fuzzy expected clearing range (0 when nobody's expected to bid). */
  estimateLowYen: number
  estimateHighYen: number
}

/**
 * How much competition a lot is likely to draw, and roughly where it'll
 * clear — the "Interest" read the auction screen shows so bidding is a
 * judgment call, not a blind guess. Derived from the same deterministic
 * AI valuations + per-bidder noise that `resolveAuction` uses, then
 * deliberately fuzzed into a range. `precision` (0..1, default 0) narrows
 * the band — the hook a future auction-scout staff trait plugs into for a
 * sharper read.
 */
export function computeLotInterest(
  lot: AuctionLot,
  model: CarModel,
  aiBidders: readonly AuctionBidder[],
  partsById: Readonly<Record<string, Part>>,
  precision = 0,
): LotInterest {
  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
  const bids = aiBidders
    .map((b) =>
      Math.round(valuateCarForBuyer(b.buyer, model, lot.car, partsById) * biddingNoiseFactor(b.id)),
    )
    .filter((bid) => bid >= reserveYen)
    .sort((a, b) => b - a)
  const contenders = bids.length

  const level: LotInterest['level'] =
    contenders === 0 ? 'quiet' : contenders === 1 ? 'warm' : contenders <= 3 ? 'hot' : 'frenzy'

  // Expected clearing ~ the second-highest eligible bid (second-price), or
  // the reserve when only one rival is interested.
  const center = contenders >= 2 ? bids[1]! : contenders === 1 ? reserveYen : 0
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
 * A persistent per-bidder aggression multiplier, deterministically
 * derived from the bidder's id (not re-rolled per lot) — the same
 * bidder is consistently a bit more or less aggressive across a session,
 * which is both GDD 6.5's "visible personalities" flavor and the source
 * of the variance that makes sniping possible (Sprint 03 decision 4a).
 */
export function biddingNoiseFactor(bidderId: string): number {
  const rng = createRng(hashStringToSeed(bidderId))
  const [min, max] = AUCTION_BIDDER_NOISE_RANGE
  return min + rng.next() * (max - min)
}

/**
 * Second-price sealed-bid resolution (Sprint 03 decision 4): each AI
 * bidder's true value comes from the shared, pure valuateCarForBuyer;
 * noise is layered on here, outside valuation, so valuation itself stays
 * deterministic. The winner pays the second-highest bid plus a small
 * increment — never their own max — so the player can occasionally win
 * well under what they were willing to pay (decision 4b).
 */
export function resolveAuction(
  lot: AuctionLot,
  model: CarModel,
  playerMaxBidYen: number | null,
  aiBidders: readonly AuctionBidder[],
  partsById: Readonly<Record<string, Part>>,
): AuctionResult {
  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)

  const bids = aiBidders.map((bidder) => ({
    bidderId: bidder.id,
    maxBidYen: Math.round(
      valuateCarForBuyer(bidder.buyer, model, lot.car, partsById) * biddingNoiseFactor(bidder.id),
    ),
  }))
  if (playerMaxBidYen !== null && playerMaxBidYen > 0) {
    bids.push({ bidderId: 'player', maxBidYen: playerMaxBidYen })
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
    winner: top.bidderId === 'player' ? 'player' : 'ai',
    finalPriceYen,
    winningBidderId: top.bidderId,
  }
}
