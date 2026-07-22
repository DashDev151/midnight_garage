import type { AuctionLot, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { computeBuyoutPriceYen, privateValuationYen } from '../bidding'
import type { SimContext } from '../context'

/**
 * Cash already committed to auction acquisitions this same decision pass -
 * mirrors `ToolUpgradeBudget`/`ServiceBayBudget`'s mutable-counter-threaded-
 * through-a-tick shape. A buyout resolves instantly, the same day it's
 * queued (`resolveBuyoutInstant`, called from `advanceDay`), so nothing
 * persists across days for this budget to seed from state - it starts empty
 * every tick and each successful `acquireLot` call below adds its own spend,
 * so a later candidate in the same loop is weighed against what's already
 * committed, not just the snapshot's starting cash.
 */
export interface AuctionAcquisitionBudget {
  cashCommitted: number
}

export function auctionAcquisitionBudget(): AuctionAcquisitionBudget {
  return { cashCommitted: 0 }
}

/**
 * The shared "buy this lot outright, under a walk-away target" decision
 * every auction-acquiring bot calls once per candidate lot: queues a buyout
 * (`resolveBuyoutInstant` resolves it the same day, in `advanceDay`) when the
 * lot's buyout price is within `walkAwayTargetYen` and there's cash for it
 * (with `cashBufferMultiplier` headroom over everything already committed
 * this tick). Bots have no other acquisition channel - the live auction room
 * is a player-only interaction (`packages/game/src/screens/auctionRoom.ts`);
 * bots buy at the flat instant-buyout premium instead. Returns whether a
 * buyout was actually queued, so the caller can track how many of its
 * per-day acquisition slots were spent.
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
  const priceYen = computeBuyoutPriceYen(lot, state, context)
  if (priceYen > walkAwayTargetYen) return false // costs more than the car is worth to this bot
  if (state.cashYen < (budget.cashCommitted + priceYen) * cashBufferMultiplier) return false
  actions.buyoutLots.push({ lotId: lot.id })
  budget.cashCommitted += priceYen
  return true
}

/**
 * A bot's walk-away target for a lot: the value anchor (`instanceValue`,
 * via `anchorValueYen`) times its own strategy multiplier, with a small
 * private spread layered on top. Thin wrapper over `bidding.ts`'s
 * `privateValuationYen`, reusing the identical formula rather than
 * standing up a second one (directive 16).
 */
export function walkAwayTargetYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  strategyMultiplier: number,
): number {
  return privateValuationYen(lot, state, context, strategyMultiplier)
}
