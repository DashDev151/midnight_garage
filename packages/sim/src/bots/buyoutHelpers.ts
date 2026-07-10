import type { AuctionLot, CarModel, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { computeBuyoutPriceYen, computeLotInterest } from '../bidding'
import { AUCTION_BUYOUT_TOLERANCE_FRACTION } from '../constants'
import type { SimContext } from '../context'

/**
 * The shared "should I buy this lot outright instead of bidding" decision
 * (external review 2026-07 finding 2) — compares the guaranteed buyout price
 * against the lot's own shown "bid this high to win" estimate, not the
 * calling bot's personal bid ceiling, so the decision reads the same
 * regardless of which strategy is asking. The same information a player
 * sees on the auction screen. Uses the real, possibly-risen buyout price
 * (Sprint 19c) — a rival can already be leading a lot the bot hasn't bid on
 * yet, which pushes the real buyout price above the static book-value floor.
 */
export function shouldBuyout(lot: AuctionLot, model: CarModel, context: SimContext): boolean {
  const buyoutPriceYen = computeBuyoutPriceYen(lot)
  const interest = computeLotInterest(lot, model, context.buyers, context.partsById)
  return buyoutPriceYen <= interest.estimateHighYen * (1 + AUCTION_BUYOUT_TOLERANCE_FRACTION)
}

/** Cash already committed to an auction acquisition — mirrors
 * `EquipmentBudget`/`ServiceBayBudget`'s mutable-counter-threaded-through-a-
 * tick shape, but (Sprint 19) seeded from every already-active bid too, not
 * just what this same tick queues: multi-day bidding means a bot can have
 * several bids out simultaneously, still unresolved from earlier days, and
 * a fresh budget that only tracked *this tick's* spending would let a bot
 * queue more than it could actually cover once those earlier bids come due. */
export interface AuctionAcquisitionBudget {
  cashCommitted: number
}

export function auctionAcquisitionBudget(state: GameState): AuctionAcquisitionBudget {
  const cashCommitted = state.activeAuctionLots.reduce(
    (sum, lot) => sum + (lot.playerMaxBidYen ?? 0),
    0,
  )
  return { cashCommitted }
}

/**
 * Cars already committed to via a still-unresolved active bid — counts
 * toward a bot's own "how many cars am I already chasing" budget the same
 * way an owned car does (Sprint 19), so a bot doesn't queue more
 * acquisitions than it actually wants once multiple bids are pending across
 * several days at once.
 */
export function activeBidCount(state: GameState): number {
  return state.activeAuctionLots.filter((lot) => lot.playerMaxBidYen !== null).length
}

/**
 * The shared "bid or buy out" decision-and-act helper every auction-bidding
 * bot calls once per candidate lot, instead of each duplicating the
 * buyout-or-bid branching and cash bookkeeping. Queues a buyout when
 * `shouldBuyout` says the lot is already expected to clear near buyout
 * price; otherwise queues the caller's intended bid — refusing a lot the bot
 * already has an active bid on (Sprint 19: nothing new to queue — every bot
 * here just bids a fixed heuristic multiple of book value once per lot, never
 * doing real per-rival value discovery, so there's nothing for it to learn
 * day-to-day that would change that number; see sprint19.md's Exit. Note:
 * under Sprint 19b's first-price rework this is a simplifying choice, not a
 * game-theoretic optimum the way it was under the original second-price
 * design — first-price auctions don't have a "bid true value once" dominant
 * strategy the way second-price does, but these bots were never doing
 * genuine strategic value discovery in the first place, so the simple
 * heuristic stays exactly as good — or bad — as it always was).
 * Returns whether an action was actually queued (false if unaffordable
 * either way, or already committed), so the caller can track how many of
 * its per-day action slots were spent.
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
  if (lot.playerMaxBidYen !== null) return false
  if (model && shouldBuyout(lot, model, context)) {
    const buyoutPriceYen = computeBuyoutPriceYen(lot)
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
