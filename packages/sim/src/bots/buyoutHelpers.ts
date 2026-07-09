import type { AuctionLot, CarModel, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { computeLotInterest } from '../bidding'
import { AUCTION_BUYOUT_PREMIUM, AUCTION_BUYOUT_TOLERANCE_FRACTION } from '../constants'
import type { SimContext } from '../context'

/**
 * The shared "should I buy this lot outright instead of bidding" decision
 * (external review 2026-07 finding 2) — compares the guaranteed buyout price
 * against the lot's own shown "bid this high to win" estimate, not the
 * calling bot's personal bid ceiling, so the decision reads the same
 * regardless of which strategy is asking. The same information a player
 * sees on the auction screen.
 */
export function shouldBuyout(lot: AuctionLot, model: CarModel, context: SimContext): boolean {
  const buyoutPriceYen = Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
  const interest = computeLotInterest(lot, model, context.buyers, context.partsById)
  return buyoutPriceYen <= interest.estimateHighYen * (1 + AUCTION_BUYOUT_TOLERANCE_FRACTION)
}

/** Cash already committed to an auction acquisition earlier in the same
 * day's decision tick — mirrors `EquipmentBudget`/`ServiceBayBudget`'s
 * mutable-counter-threaded-through-a-tick shape. */
export interface AuctionAcquisitionBudget {
  cashCommitted: number
}

export function auctionAcquisitionBudget(): AuctionAcquisitionBudget {
  return { cashCommitted: 0 }
}

/**
 * The shared "bid or buy out" decision-and-act helper every auction-bidding
 * bot calls once per candidate lot, instead of each duplicating the
 * buyout-or-bid branching and cash bookkeeping. Queues a buyout when
 * `shouldBuyout` says the lot is already expected to clear near buyout
 * price; otherwise queues the caller's intended bid. Returns whether an
 * action was actually queued (false if unaffordable either way), so the
 * caller can track how many of its per-day action slots were spent.
 */
export function acquireLot(
  state: GameState,
  lot: AuctionLot,
  model: CarModel | undefined,
  maxBidYen: number,
  actions: DayActions,
  context: SimContext,
  budget: AuctionAcquisitionBudget,
  cashBufferMultiplier: number,
): boolean {
  if (model && shouldBuyout(lot, model, context)) {
    const buyoutPriceYen = Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
    if (state.cashYen < (budget.cashCommitted + buyoutPriceYen) * cashBufferMultiplier) return false
    actions.buyoutLots.push({ lotId: lot.id })
    budget.cashCommitted += buyoutPriceYen
    return true
  }
  if (state.cashYen < (budget.cashCommitted + maxBidYen) * cashBufferMultiplier) return false
  actions.bidsOnLots.push({ lotId: lot.id, maxBidYen })
  budget.cashCommitted += maxBidYen
  return true
}
