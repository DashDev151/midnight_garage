import type { AuctionLot, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { anchorValueYen, nextRaiseYen } from '../bidding'
import type { SimContext } from '../context'

/**
 * Cash already committed to auction acquisitions this tick - mirrors
 * `EquipmentBudget`/`ServiceBayBudget`'s mutable-counter-threaded-through-a-
 * tick shape. Sprint 20 (open bidding): only a lot the bot is CURRENTLY
 * leading is a real cash exposure (a lot it's been outbid on costs nothing
 * unless it re-raises, which `acquireLot` below adds to this same counter
 * the moment it queues that raise) - seeding from every already-active bid
 * regardless of standing, the way the old sealed-bid model had to, would
 * over-budget a bot that's simply losing several wars at once.
 */
export interface AuctionAcquisitionBudget {
  cashCommitted: number
}

export function auctionAcquisitionBudget(state: GameState): AuctionAcquisitionBudget {
  const cashCommitted = state.activeAuctionLots.reduce(
    (sum, lot) => sum + (lot.leadingBidder === 'player' ? lot.currentBidYen : 0),
    0,
  )
  return { cashCommitted }
}

/**
 * Lots the bot is still meaningfully pursuing - `playerHasBid` (Sprint 20),
 * not just "currently leading": a bot outbid overnight on a lot still under
 * its walk-away target is still in that war and should still count toward
 * its "how many cars am I chasing" budget, exactly like the player-facing
 * "My Active Bids" panel deliberately keeps showing a lot being lost.
 */
export function activeBidCount(state: GameState): number {
  return state.activeAuctionLots.filter((lot) => lot.playerHasBid).length
}

/**
 * The shared "join or continue a bidding war, under a walk-away target"
 * decision every auction-bidding bot calls once per candidate lot (Sprint
 * 20 - replaces the old sealed-max "bid or buy out" helper). Bots read the
 * same open board the player does: if this lot isn't already led by the
 * bot, and the next valid raise (`nextRaiseYen` - reserve to open an
 * unopened lot, one increment above the board otherwise) doesn't exceed
 * `walkAwayTargetYen`, it raises exactly that amount; otherwise it holds
 * (already leading) or walks away (the next raise would cost more than the
 * car is worth to it). Bots never buy out - buyout is a player-impatience
 * valve, and a bot has no impatience to price out.
 *
 * `walkAwayTargetYen` is caller-supplied (typically `anchorValueYen(...) *
 * <the strategy's own multiplier>`, Sprint 20's basis change from the old
 * fraction-of-book multipliers) rather than computed in here, so each bot
 * keeps deciding its own aggressiveness while sharing this one piece of
 * mechanical war-joining logic. Returns whether a raise was actually
 * queued, so the caller can track how many of its per-day action slots were
 * spent.
 */
export function acquireLot(
  state: GameState,
  lot: AuctionLot,
  walkAwayTargetYen: number,
  actions: DayActions,
  context: SimContext,
  budget: AuctionAcquisitionBudget,
  cashBufferMultiplier: number,
): boolean {
  if (lot.leadingBidder === 'player') return false // already leading - nothing to do
  const raiseToYen = nextRaiseYen(lot, context.economy)
  if (raiseToYen > walkAwayTargetYen) return false // the next raise would exceed what it's worth
  if (state.cashYen < (budget.cashCommitted + raiseToYen) * cashBufferMultiplier) return false
  actions.bidsOnLots.push({ lotId: lot.id, maxBidYen: raiseToYen })
  budget.cashCommitted += raiseToYen
  return true
}

/** A bot's walk-away target for a lot: the value anchor times its own
 * strategy multiplier - the Sprint 20 basis change from the old
 * fraction-of-book bid multipliers (documented per call site). */
export function walkAwayTargetYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  strategyMultiplier: number,
): number {
  return Math.round(anchorValueYen(lot, state, context) * strategyMultiplier)
}
