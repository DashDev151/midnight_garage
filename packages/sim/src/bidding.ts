import type {
  AuctionLot,
  Buyer,
  CarModel,
  DayLogEntry,
  EconomyConfig,
  GameState,
} from '@midnight-garage/content'
import type { SimContext } from './context'
import { assignToParking, hasParkingSpace } from './facilities'
import { marketValueYen } from './marketValue'
import { bellNormal, createRng, hashStringToSeed } from './rng'

/**
 * Buyer archetypes with a genuinely stated interest in a model's tier - the
 * gate (Sprint 10). No entry for a tier means that archetype never bids on
 * it; there is no default fallback (that fallback was the original "every
 * buyer wants every car" bug). Exported (Sprint 11) so `selling.ts` can
 * apply the identical gate to walk-in/listing buyers - the same rule was
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
 * The single value anchor (Sprint 20, auction rework II; body swapped
 * Sprint 21). Every other money number in this file (`demandCeilingYen`,
 * `computeBuyoutPriceYen`, `turnoutBand`) calls this ONE function, never
 * `marketValueYen` directly - that isolation is what let Sprint 21 re-anchor
 * every auction-money number at once by swapping one function's body.
 *
 * Sprint 21 decision 7: dealers buy at wholesale off the taste-free market
 * value (`marketValueYen`, the rolled lot car's condition/parts/heat, no
 * buyer stat-fit) - taste belongs to end customers, not the trade. The
 * `interestedBuyers` tier gate stays (reuse table: "still gates ... auction
 * participation") as a precondition, not a value input: it still answers
 * "does ANY dealer archetype care about this tier at all", returning 0 when
 * nobody does (the demand ceiling then sits below any reserve, so the lot
 * simply never opens on its own) - but no longer selects *which* buyer's
 * valuation to use, since `marketValueYen` doesn't take a buyer.
 *
 * Sprint 26 decision 4: drops the deleted `(1 - modelRiskDiscount)` term -
 * the hidden-issue system it discounted for is paused and removed; the
 * anchor is `marketValueYen` alone now, unadjusted.
 */
export function anchorValueYen(lot: AuctionLot, state: GameState, context: SimContext): number {
  const model = context.modelsById[lot.modelId]
  if (!model) return 0
  const interested = interestedBuyers(model, context.buyers)
  if (interested.length === 0) return 0
  const heatPercent = state.marketHeat[lot.modelId] ?? 100
  return marketValueYen(
    model,
    lot.car,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
}

/** Seller's floor under a deal (GDD 6.5): a fraction of book value. Bidding
 * opens here; a lot whose demand ceiling never clears it simply never opens
 * on its own (nobody came for it) - it can still be bought out, or bid on
 * directly by the player. */
function reserveYen(lot: AuctionLot, economy: EconomyConfig): number {
  return Math.round(lot.bookValueYen * economy.AUCTION_RESERVE_PRICE_FRACTION)
}

/**
 * The demand ceiling (Sprint 20; re-seeded daily as a Sprint 25 task 4
 * interim fix) - what the assembled dealers will pay today, anchored at
 * wholesale (`AUCTION_WHOLESALE_FRACTION` of `anchorValueYen`) with a bell
 * spread (`AUCTION_DEMAND_SPREAD_SD`) and a flat chance of a thin-turnout
 * day (`AUCTION_THIN_TURNOUT_CHANCE`, multiplying the ceiling by
 * `AUCTION_THIN_TURNOUT_FACTOR`) - the weak-day tail where real steals live.
 * Replaces the old per-rival ceiling array entirely: this is the load-
 * bearing economics fix (Sprint 19's rivals bid 0.95x *retail*, so a
 * contested lot cleared near book; wholesale-anchoring here is what makes
 * patient bidding actually beat buyout most of the time).
 *
 * Sprint 20 originally seeded this on `lot.id` alone so it never moved once
 * a lot existed. Verified defect (2026-07-11 playtest, note 14): a lot whose
 * one-time ceiling happened to land below reserve then NEVER received a
 * single rival bid for its entire life, no matter how many days passed -
 * "sat bidless for 4 days" wasn't a rare edge case, it was permanent for
 * that lot. Seeding on `` `${lot.id}:${day}` `` instead (same pattern as
 * `advanceLotOvernight`'s own per-day seed) means a lot near reserve gets a
 * fresh roll every day and can open organically on a later, luckier one.
 * The full pacing redesign (real bidder-count simulation, not a single
 * rolled number) is Sprint 30 scope - this is the interim fix.
 */
export function demandCeilingYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  day: number,
): number {
  const anchor = anchorValueYen(lot, state, context)
  if (anchor <= 0) return 0
  const economy = context.economy
  const center = anchor * economy.AUCTION_WHOLESALE_FRACTION
  const rng = createRng(hashStringToSeed(`${lot.id}:${day}`))
  const spreadMultiplier = bellNormal(1, economy.AUCTION_DEMAND_SPREAD_SD, rng)
  const isThinTurnout = rng.next() < economy.AUCTION_THIN_TURNOUT_CHANCE
  const turnoutMultiplier = isThinTurnout
    ? spreadMultiplier * economy.AUCTION_THIN_TURNOUT_FACTOR
    : spreadMultiplier
  return Math.max(0, Math.round(center * turnoutMultiplier))
}

export type TurnoutBand = 'thin' | 'steady' | 'packed'

/**
 * A subtle pre-bid flavor read (maintainer decision 3: flavor yes, no
 * numeric "room" gauge) - how many dealers came to look today, as a coarse
 * band over today's rolled spread multiplier (`demandCeilingYen /
 * (anchorValueYen * AUCTION_WHOLESALE_FRACTION)`), thresholded by
 * `AUCTION_TURNOUT_BANDS`. Price is king; this is one word of texture.
 *
 * Sprint 25 task 4 (badge honesty): a lot whose ceiling can't even clear
 * reserve is always `thin`, regardless of what the ratio-based band would
 * say - the pre-fix bug let a lot that could never open on its own display
 * "PACKED TURNOUT" (the ratio is relative to that lot's own depressed
 * center, so a favorable spread roll on an absolutely weak lot still scored
 * high). The badge must never claim more interest than the lot can act on.
 */
export function turnoutBand(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  day: number,
): TurnoutBand {
  const ceiling = demandCeilingYen(lot, state, context, day)
  if (ceiling < reserveYen(lot, context.economy)) return 'thin'
  const anchor = anchorValueYen(lot, state, context)
  const center = anchor * context.economy.AUCTION_WHOLESALE_FRACTION
  if (center <= 0) return 'thin'
  const ratio = ceiling / center
  const [thinBelow, packedAbove] = context.economy.AUCTION_TURNOUT_BANDS
  if (ratio < thinBelow) return 'thin'
  if (ratio > packedAbove) return 'packed'
  return 'steady'
}

/**
 * The bid ladder (Sprint 20): `max(Y10,000, 5% of book rounded to the
 * nearest Y10,000)` - one increment size for the player, the dealers, and
 * every bidding bot alike. Fixed off the lot's own book value, not the
 * current bid, so the ladder doesn't compress as a lot's price climbs.
 */
export function bidIncrementYen(lot: AuctionLot, economy: EconomyConfig): number {
  const raw = lot.bookValueYen * economy.AUCTION_BID_INCREMENT_FRACTION
  const roundedTo10k = Math.round(raw / 10_000) * 10_000
  return Math.max(10_000, roundedTo10k)
}

/**
 * The smallest valid raise right now: the reserve price if bidding hasn't
 * opened yet, otherwise one increment above the current board price.
 * Exported so bots (the war helper, `bots/buyoutHelpers.ts`) and the game
 * UI (the raise control, pre-filled to this) share the exact same ladder
 * math `resolvePlaceBid` itself validates against, rather than each
 * re-deriving reserve-or-increment logic independently.
 */
export function nextRaiseYen(lot: AuctionLot, economy: EconomyConfig): number {
  if (lot.currentBidYen === 0) return reserveYen(lot, economy)
  return lot.currentBidYen + bidIncrementYen(lot, economy)
}

/**
 * The real, chargeable instant-buyout price (Sprint 20): `max(anchorValueYen
 * * AUCTION_BUYOUT_PREMIUM, currentBidYen + one increment)` - the same
 * exported anchor the demand ceiling uses, floored above whatever's
 * currently on the board so a buyout always ends the auction outright,
 * never undercuts it (maintainer decision 2: buyout is available on every
 * lot, priced rather than forbidden - with wholesale clearing around
 * 0.6-0.8x value and buyout at ~1.25x value, it's always available and
 * almost never rational).
 */
export function computeBuyoutPriceYen(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
): number {
  const anchor = anchorValueYen(lot, state, context)
  const anchoredFloor = Math.round(anchor * context.economy.AUCTION_BUYOUT_PREMIUM)
  const bidFloor = lot.currentBidYen + bidIncrementYen(lot, context.economy)
  return Math.max(anchoredFloor, bidFloor)
}

export interface OvernightStepResult {
  lot: AuctionLot
  log: DayLogEntry[]
}

/**
 * One lot's overnight step (Sprint 20 - the core new daily mechanic),
 * seeded on `lot.id:day` so each day's roll is independent but fully
 * reproducible:
 *
 * - Not yet open (`currentBidYen === 0`): if the demand ceiling clears
 *   reserve, the dealers open the bidding there (`leadingBidder: 'rival'`).
 *   Otherwise the lot stays bidless - still buyable, still biddable by the
 *   player at or above reserve, just nobody's shown up on their own yet.
 * - Open, below the ceiling: with probability `AUCTION_COUNTER_CHANCE` the
 *   dealers raise one increment (capped at the ceiling) and take the lead -
 *   deliberately UNCONDITIONAL on who currently leads, since the dealers
 *   bid among themselves too; an untouched lot climbs toward its own
 *   ceiling like any other. The "you were outbid overnight" beat
 *   (`auction-outbid`) fires only when this raise displaces the player.
 *   Otherwise: silence.
 * - Open, at or above the ceiling: silence (the dealers have nothing left
 *   to offer). Visible-price ties go to the player, matching what the
 *   board shows: a player raise to exactly the ceiling stops the dealers
 *   cold, since `currentBidYen >= ceiling` is already true.
 *
 * Silence always increments `quietDays`; any real raise resets it to 0 -
 * `AUCTION_QUIET_DAYS_TO_HAMMER` consecutive silent steps is what "going
 * once, going twice" means mechanically.
 */
export function advanceLotOvernight(
  lot: AuctionLot,
  state: GameState,
  context: SimContext,
  day: number,
): OvernightStepResult {
  const economy = context.economy

  if (lot.currentBidYen === 0) {
    const ceiling = demandCeilingYen(lot, state, context, day)
    if (ceiling < reserveYen(lot, economy)) {
      return { lot, log: [] } // nobody's come for it (yet) - stays bidless
    }
    return {
      lot: {
        ...lot,
        currentBidYen: reserveYen(lot, economy),
        leadingBidder: 'rival',
        quietDays: 0,
      },
      log: [],
    }
  }

  const ceiling = demandCeilingYen(lot, state, context, day)
  if (lot.currentBidYen >= ceiling) {
    return { lot: { ...lot, quietDays: lot.quietDays + 1 }, log: [] }
  }

  const rng = createRng(hashStringToSeed(`${lot.id}:${day}`))
  if (rng.next() >= economy.AUCTION_COUNTER_CHANCE) {
    return { lot: { ...lot, quietDays: lot.quietDays + 1 }, log: [] }
  }

  const newBidYen = Math.min(ceiling, lot.currentBidYen + bidIncrementYen(lot, economy))
  const displacedPlayer = lot.leadingBidder === 'player'
  return {
    lot: { ...lot, currentBidYen: newBidYen, leadingBidder: 'rival', quietDays: 0 },
    log: displacedPlayer ? [{ type: 'auction-outbid', lotId: lot.id, newBidYen }] : [],
  }
}

export interface AcquisitionResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Places or raises a bid (Sprint 20 - open-raise semantics replace sealed
 * proxy bidding): the amount passed is the literal number that lands on the
 * board, not a hidden max. Must clear `minRaiseYen` (reserve to open an
 * unopened lot, one increment above the current board price otherwise) -
 * anything less is a no-op, same as before. Sets `leadingBidder: 'player'`,
 * `playerHasBid: true` (never reset once true), and resets `quietDays` to 0
 * - a player raise is exactly as much a "real raise" as a dealer's for
 * activity-based closing purposes. Shared by the player's instant click and
 * advanceDay's bot batch loop.
 */
export function resolvePlaceBid(
  state: GameState,
  lotId: string,
  bidYen: number,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot || bidYen <= 0) return { state, log: [] }
  if (bidYen < nextRaiseYen(lot, context.economy)) return { state, log: [] }

  const updatedLot: AuctionLot = {
    ...lot,
    currentBidYen: bidYen,
    leadingBidder: 'player',
    quietDays: 0,
    playerHasBid: true,
  }
  return {
    state: {
      ...state,
      activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lotId ? updatedLot : l)),
    },
    log: [{ type: 'auction-bid-placed', lotId, maxBidYen: bidYen }],
  }
}

/**
 * Resolves one lot for today (Sprint 20 - replaces `resolveDueAuctionLot`):
 * runs the overnight step, then hammers it - `quietDays >=
 * AUCTION_QUIET_DAYS_TO_HAMMER`, or `day >= expiresOnDay` (the duration-roll
 * backstop, preserving flash/standard/long velocity variation) - if either
 * condition is now met, otherwise the lot simply stays active with its
 * updated board state. Called once per still-active lot from `advanceDay`'s
 * day-boundary step, every day, not just on some fixed "due day" - activity-
 * based closing means there's no schedule to filter on anymore.
 *
 * At the hammer: no leader resolves silently (kept behavior, matching the
 * old "expired unsold" case); a dealer win logs the loss only when
 * `playerHasBid` (today's only-log-if-the-player-had-skin rule); a player
 * win runs the existing no-cash/no-parking forfeit checks (decision 7: no
 * escrow, cash and parking are only checked now) before the handover.
 */
export function resolveLotForDay(
  state: GameState,
  lot: AuctionLot,
  context: SimContext,
  day: number,
): AcquisitionResult {
  const step = advanceLotOvernight(lot, state, context, day)
  const updatedLot = step.lot
  const log: DayLogEntry[] = [...step.log]

  const shouldHammer =
    updatedLot.quietDays >= context.economy.AUCTION_QUIET_DAYS_TO_HAMMER ||
    day >= updatedLot.expiresOnDay

  const removeLot = (s: GameState): GameState => ({
    ...s,
    activeAuctionLots: s.activeAuctionLots.filter((l) => l.id !== lot.id),
  })

  if (!shouldHammer) {
    return {
      state: {
        ...state,
        activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lot.id ? updatedLot : l)),
      },
      log,
    }
  }

  if (updatedLot.leadingBidder === null) {
    return { state: removeLot(state), log } // nobody ever bid - silent no-sale
  }

  if (updatedLot.leadingBidder === 'rival') {
    if (updatedLot.playerHasBid) {
      log.push({
        type: 'auction-bid-lost',
        lotId: lot.id,
        winningPriceYen: updatedLot.currentBidYen,
      })
    }
    return { state: removeLot(state), log }
  }

  // The player leads - wins at currentBidYen, the literal board number
  // (first-price). No escrow: cash and parking are only checked now.
  if (!hasParkingSpace(state)) {
    log.push(
      { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-parking' },
      { type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: updatedLot.currentBidYen },
    )
    return { state: removeLot(state), log }
  }
  if (state.cashYen < updatedLot.currentBidYen) {
    log.push(
      { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-cash' },
      { type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: updatedLot.currentBidYen },
    )
    return { state: removeLot(state), log }
  }

  const withCar = assignToParking(
    {
      ...removeLot(state),
      cashYen: state.cashYen - updatedLot.currentBidYen,
      ownedCars: [...state.ownedCars, updatedLot.car],
    },
    updatedLot.car.id,
  )
  log.push({ type: 'auction-bid-won', lotId: lot.id, finalPriceYen: updatedLot.currentBidYen })
  return { state: withCar, log }
}

/**
 * The instant buyout resolver (Sprint 11; re-priced Sprint 20): a guaranteed
 * purchase at `computeBuyoutPriceYen`, no rival contest - a full garage just
 * means the purchase doesn't happen right now (no money spent), the lot
 * stays on the board for a retry once space frees up. Shared by the
 * player's instant click and advanceDay's bot batch loop.
 */
export function resolveBuyoutInstant(
  state: GameState,
  lotId: string,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  const priceYen = computeBuyoutPriceYen(lot, state, context)
  if (state.cashYen < priceYen) return { state, log: [] }
  if (!hasParkingSpace(state)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' }],
    }
  }

  const withCar = assignToParking(
    {
      ...state,
      cashYen: state.cashYen - priceYen,
      ownedCars: [...state.ownedCars, lot.car],
      activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== lotId),
    },
    lot.car.id,
  )
  return {
    state: withCar,
    log: [{ type: 'lot-bought-out', lotId, priceYen }],
  }
}
