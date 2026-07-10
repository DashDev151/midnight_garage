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
  AUCTION_BIDDER_NOISE_RANGE,
  AUCTION_BUYOUT_PREMIUM,
  AUCTION_ESCALATION_DAILY_CHANCE,
  AUCTION_ESCALATION_STEP_FRACTION,
  AUCTION_FIELD_BASE,
  AUCTION_FIELD_PER_INTEREST,
  AUCTION_FIELD_SIZE_SD,
  AUCTION_HEADROOM_MODERATE_MIN_FRACTION,
  AUCTION_HEADROOM_PLENTY_MIN_FRACTION,
  AUCTION_HEADROOM_TIGHT_MIN_FRACTION,
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

/** The static floor — book value times the fixed premium, ignoring any live
 * bidding. Not what buyout actually charges (see `computeBuyoutPriceYen`
 * below) — this is the number a quiet, uncontested lot's buyout settles at. */
function baseBuyoutPriceYen(lot: AuctionLot): number {
  return Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
}

/** The real current leading bid — player's committed max vs. the highest
 * rival escalated position so far. Shared by `computeBidHeadroom` (the
 * player-facing read, where it's exposed as `BidHeadroom.currentTopBidYen`)
 * and `computeBuyoutPriceYen` (Sprint 19c) below, so both agree on exactly
 * the same number. */
function leadingBidYen(lot: AuctionLot): number {
  return Math.max(lot.playerMaxBidYen ?? 0, 0, ...lot.rivalEscalatedBidsYen)
}

/**
 * The real, chargeable instant-buyout price (Sprint 19c) — the base floor
 * (`baseBuyoutPriceYen`), or the current leading bid, whichever is higher.
 * Rival ceilings are no longer capped at buyout (see `buildRivalField`'s own
 * comment), so a hot lot can genuinely out-bid the old fixed premium; rather
 * than let a live auction undercut the "guaranteed win" promise, buyout
 * itself rises to match — "when a bid goes above buyout price, the buyout
 * price increases to the max bid," the maintainer's own framing. Only reacts
 * to *revealed* bids (the player's own, or a rival's actual escalated
 * position) — never a hidden ceiling nobody has bid yet, so this never
 * leaks information escalation itself hasn't already surfaced.
 */
export function computeBuyoutPriceYen(lot: AuctionLot): number {
  return Math.max(baseBuyoutPriceYen(lot), leadingBidYen(lot))
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
 * resale value, noised per-bidder). Seeded entirely on the lot's id, so
 * `computeLotInterest` and `resolveAuction` always construct the identical
 * field — the shown read and the real resolution never disagree.
 *
 * **Uncapped since Sprint 19c** — a rival's bid used to be clamped at the
 * lot's (fixed) buyout price, "so no rival can ever outbid instant
 * certainty." That's still true, but the fix moved to the other side:
 * buyout itself now rises to match a bid that clears it
 * (`computeBuyoutPriceYen`), instead of silently capping rivals below a
 * static number — the maintainer's explicit call, needed to let real bids
 * exceed book value at all (previously `AUCTION_BIDDER_DISCIPLINE` alone
 * already kept most bids well under the old cap, but the cap still existed
 * as an invisible ceiling nothing could ever test).
 */
export function buildRivalField(
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
    bids.push(Math.round(rawBid))
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

  // The number that actually wins IS the number you'd pay (Sprint 19b:
  // first-price) — centering on the top bid was already correct before this
  // change (Sprint 11 re-centered it away from a second-price clearing
  // number to fix bidding-above-the-estimate-still-losing), it's just also
  // now literally the price a winning bid pays, not merely the bar to clear.
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
 * The pure top-bid-wins, pay-your-own-bid math (Sprint 03 decision 4 through
 * Sprint 10's variable rival field; extracted Sprint 19 so both "resolve
 * against full rival ceilings" (`resolveAuction` below) and "resolve against
 * wherever multi-day escalation currently stands" (`resolveDueAuctionLot`)
 * share one implementation instead of two). **Reworked Sprint 19b: first-price,
 * not second-price** — the winner pays exactly what they bid, never a
 * discounted "second-highest + increment" number. The maintainer's own
 * framing: "you should pay what you bid" — second-price is a real, studied
 * auction mechanism (this is what a Vickrey auction / eBay proxy bidding
 * actually does), but its one real advantage — freeing a bidder from having
 * to guess the minimum winning number — doesn't pay for itself here, since
 * the game already shows a "bid X-Y to win" estimate (`computeLotInterest`).
 * Paying what you bid is simpler to reason about and was the explicit ask.
 */
function resolveTopBidAuction(
  rivalBidsYen: readonly number[],
  playerMaxBidYen: number | null,
  reserveYen: number,
): AuctionResult {
  const bids: { isPlayer: boolean; maxBidYen: number }[] = rivalBidsYen.map((maxBidYen) => ({
    isPlayer: false,
    maxBidYen,
  }))
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

  return {
    winner: top.isPlayer ? 'player' : 'ai',
    finalPriceYen: top.maxBidYen,
  }
}

/**
 * Resolves an auction against rivals' full, unescalated ceilings — "what
 * would happen if this lot resolved right now with complete information."
 * No longer called by the day-boundary resolution path (Sprint 19: that
 * uses whatever rivals have actually escalated to by the lot's due day, via
 * `resolveDueAuctionLot`) — kept as the calibration/testing surface for the
 * underlying rival-field statistics (`buildRivalField`'s bell curve, bidder
 * discipline, tier gating).
 */
export function resolveAuction(
  lot: AuctionLot,
  model: CarModel,
  playerMaxBidYen: number | null,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
): AuctionResult {
  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
  const rivalBidsYen = buildRivalField(lot, model, buyers, partsById)
  return resolveTopBidAuction(rivalBidsYen, playerMaxBidYen, reserveYen)
}

/**
 * Advances one lot's rival escalation by exactly one day (Sprint 19 decision
 * 2 — the core new mechanic): every rival whose fixed ceiling
 * (`buildRivalField`'s unchanged output) still exceeds the current top bid,
 * and hasn't yet reached that ceiling, has a flat per-day chance to raise
 * partway toward it. Rivals already beaten (their ceiling can't win anyway)
 * or already at their ceiling never move. Seeded on the lot id *and* the
 * day, so each day's roll is independent but still fully reproducible.
 * `rivalEscalatedBidsYen` is read defensively by index rather than assumed
 * pre-sized — the same robustness Sprint 17 established for indexed arrays
 * whose real size isn't known where they're created. A stored `0` always
 * means "hasn't made a real move yet" (never a valid *escalated* position,
 * since every real raise is at least 1 yen and a rival's first raise jumps
 * straight past the reserve floor — see below), so it doubles safely as the
 * "untouched" sentinel with no separate tracking needed.
 *
 * (Sprint 19b) A rival's *first successful* raise lands at the reserve
 * price plus a step from there, not a step up from ¥0: a real bidder was
 * never going to show up below the seller's own floor, so climbing from 0
 * just wasted early escalation days walking through territory that could
 * never have won anyway, worsening the "auctions barely move within their
 * own duration" tuning problem. A rival who's dominated (their ceiling
 * already can't beat the current top bid) still never moves at all, exactly
 * as before — untouched stays untouched, not silently promoted to the
 * reserve floor for a fight they were never going to enter.
 */
export function applyDailyEscalation(
  lot: AuctionLot,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  day: number,
): AuctionLot {
  const ceilings = buildRivalField(lot, model, buyers, partsById)
  if (ceilings.length === 0) return lot

  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
  const rng = createRng(hashStringToSeed(`${lot.id}:escalate:${day}`))
  const currentTopYen = leadingBidYen(lot)

  const rivalEscalatedBidsYen = ceilings.map((ceiling, i) => {
    const stored = lot.rivalEscalatedBidsYen[i] ?? 0
    const current = stored === 0 ? Math.min(ceiling, reserveYen) : stored
    if (ceiling <= currentTopYen) return stored // never a real threat; frozen
    if (current >= ceiling) return stored // already maxed (or never clears reserve); nothing to add
    if (rng.next() >= AUCTION_ESCALATION_DAILY_CHANCE) return stored // no move today
    const raise = Math.max(1, Math.round((ceiling - current) * AUCTION_ESCALATION_STEP_FRACTION))
    return Math.min(ceiling, current + raise)
  })

  return { ...lot, rivalEscalatedBidsYen }
}

/** The live standings and headroom read for a lot with an active bid (Sprint 19 decision 3) —
 * distinct from `computeLotInterest`'s pre-bid estimate: this answers "given where the bidding
 * stands right now, how much room is left for it to move against me," which only makes sense
 * once bidding is already live over multiple days. Obfuscated the same way (a qualitative
 * bucket, not a yen figure for what a rival would actually pay). */
export interface BidHeadroom {
  level: 'none' | 'plenty' | 'moderate' | 'tight' | 'critical'
  /** The real current top bid — unlike the headroom level, this is not obfuscated: it's already
   * happened, not a forecast. */
  currentTopBidYen: number
  /** True when the player's own committed max bid is currently the top bid. */
  playerIsWinning: boolean
}

export function computeBidHeadroom(
  lot: AuctionLot,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
): BidHeadroom {
  const ceilings = buildRivalField(lot, model, buyers, partsById)
  const maxCeilingYen = Math.max(0, ...ceilings)
  const topRivalBidYen = Math.max(0, ...lot.rivalEscalatedBidsYen)
  const currentTopBidYen = leadingBidYen(lot)
  const playerIsWinning = lot.playerMaxBidYen !== null && lot.playerMaxBidYen >= topRivalBidYen

  if (maxCeilingYen === 0) {
    return { level: 'none', currentTopBidYen, playerIsWinning }
  }
  const headroomFraction = Math.max(0, (maxCeilingYen - currentTopBidYen) / maxCeilingYen)
  const level: BidHeadroom['level'] =
    headroomFraction >= AUCTION_HEADROOM_PLENTY_MIN_FRACTION
      ? 'plenty'
      : headroomFraction >= AUCTION_HEADROOM_MODERATE_MIN_FRACTION
        ? 'moderate'
        : headroomFraction >= AUCTION_HEADROOM_TIGHT_MIN_FRACTION
          ? 'tight'
          : 'critical'

  return { level, currentTopBidYen, playerIsWinning }
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
 * Places or raises a bid (Sprint 19 — replaces the old instant resolver:
 * multi-day bidding means a bid no longer resolves anything by itself, it
 * just records/raises the player's own committed max on the lot). Never
 * lowers an existing bid — the same "you can always raise, never retract"
 * rule a real proxy-bidding auction uses. Shared by the player's instant
 * click and advanceDay's bot batch loop (one queued bid per call, same as
 * every other resolver in this codebase).
 */
export function resolvePlaceBid(
  state: GameState,
  lotId: string,
  maxBidYen: number,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot || maxBidYen <= 0) return { state, log: [] }
  const model = context.modelsById[lot.modelId]
  if (!model) return { state, log: [] }

  const nextMaxBidYen = Math.max(lot.playerMaxBidYen ?? 0, maxBidYen)
  if (nextMaxBidYen === lot.playerMaxBidYen) return { state, log: [] } // not actually a raise

  const updatedLot: AuctionLot = { ...lot, playerMaxBidYen: nextMaxBidYen }
  return {
    state: {
      ...state,
      activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lotId ? updatedLot : l)),
    },
    log: [{ type: 'auction-bid-placed', lotId, maxBidYen: nextMaxBidYen }],
  }
}

/**
 * Resolves one lot on its due day (Sprint 19 — the multi-day counterpart to
 * the old instant `resolveBidInstant`): runs one final escalation pass, then
 * the real top-bid-wins math against wherever standings land — rivals'
 * *current escalated* bids, not their full ceilings, so a short auction that
 * never gave rivals many chances to raise naturally produces more "won
 * cheap" outcomes (decision 2). Called once per lot from `advanceDay`'s
 * day-boundary step, for every lot whose duration has elapsed — including
 * ones the player never bid on at all, which simply resolve with no player
 * winner and no log (unchanged from today's silent "expired unsold").
 */
export function resolveDueAuctionLot(
  state: GameState,
  lot: AuctionLot,
  context: SimContext,
  day: number,
): AcquisitionResult {
  const model = context.modelsById[lot.modelId]
  const removeLot = (s: GameState): GameState => ({
    ...s,
    activeAuctionLots: s.activeAuctionLots.filter((l) => l.id !== lot.id),
  })
  if (!model) return { state: removeLot(state), log: [] }

  const escalated = applyDailyEscalation(lot, model, context.buyers, context.partsById, day)
  const reserveYen = Math.round(lot.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
  const result = resolveTopBidAuction(
    escalated.rivalEscalatedBidsYen,
    lot.playerMaxBidYen,
    reserveYen,
  )

  if (result.winner !== 'player') {
    // An AI win (or no-sale) is only worth logging if the player actually
    // had skin in this lot — one they never bid on just quietly expires,
    // exactly like today's silent unsold-lot removal.
    const log: DayLogEntry[] =
      result.winner === 'ai' && lot.playerMaxBidYen !== null
        ? [{ type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: result.finalPriceYen }]
        : []
    return { state: removeLot(state), log }
  }

  // The player won. Unlike a buyout, rivals already contested this lot, so
  // a blocked win forfeits it to them rather than holding the auction open.
  if (!hasParkingSpace(state)) {
    return {
      state: removeLot(state),
      log: [
        { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-parking' },
        { type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: result.finalPriceYen },
      ],
    }
  }
  // Decision 7: multi-day bidding has no escrow — cash is only checked now,
  // on resolution day, not back when the bid was placed. Forfeits the same
  // way a blocked win for lack of parking already does: no money spent, the
  // win is simply lost, not retried.
  if (state.cashYen < result.finalPriceYen) {
    return {
      state: removeLot(state),
      log: [
        { type: 'acquisition-blocked', kind: 'auction-win', reason: 'no-cash' },
        { type: 'auction-bid-lost', lotId: lot.id, winningPriceYen: result.finalPriceYen },
      ],
    }
  }

  const finalCar = resolveHandoverCondition(
    lot,
    result.finalPriceYen,
    context.hiddenIssuesById,
    handoverRng(lot.id),
  )
  const withCar = assignToParking(
    {
      ...removeLot(state),
      cashYen: state.cashYen - result.finalPriceYen,
      ownedCars: [...state.ownedCars, finalCar],
    },
    finalCar.id,
  )
  return {
    state: withCar,
    log: [{ type: 'auction-bid-won', lotId: lot.id, finalPriceYen: result.finalPriceYen }],
  }
}

/**
 * The instant buyout resolver (Sprint 11): a guaranteed purchase at a
 * premium, no rival contest — a full garage just means the purchase doesn't
 * happen right now (no money spent), the lot stays on the board for a retry
 * once space frees up. Shared by the player's instant click and advanceDay's
 * bot batch loop. Price is the real, possibly-risen `computeBuyoutPriceYen`
 * (Sprint 19c), not the static premium — a hot lot costs more to skip the
 * wait on than a quiet one.
 */
export function resolveBuyoutInstant(
  state: GameState,
  lotId: string,
  context: SimContext,
): AcquisitionResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [] }
  const priceYen = computeBuyoutPriceYen(lot)
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
