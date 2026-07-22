import type { AuctionRoomConfig } from '@midnight-garage/content'
import { createRng, hashStringToSeed } from '@midnight-garage/sim'
import { formatYen } from '../utils/formatYen'

/**
 * The live auction room's own state machine: a config-driven, seeded bidding
 * floor shared by every screen that seats a room (the tuning demo and the
 * production auction room alike). Nothing here reads or writes saves or any
 * live sim state. A caller supplies the tuning (a `RoomConfig`, normally
 * `economy.auctionRoom` off `SimContext`), a seed string of its own choosing
 * (so two callers can pick their own seeding convention), and what the
 * bidder has learned about the lot (`Learned`), and gets back a `Room` it
 * advances purely by calling `tick`/`playerBid`/`letGo` with an injected
 * clock; time is a number handed to `tick()`, never read from a wall clock,
 * and every draw comes from the one seeded stream the room was entered with.
 *
 * The room reads a lot at its fair-odds value (the caller's own
 * `roomReadYen`, typically `sheetGuideValueYen`, exactly what the live
 * auction sheet prints). Each room draws a single clearing price up front,
 * the most the floor will pay, as a seeded fraction of that read from the
 * supplied config; the floor then climbs dealer against dealer up to that
 * price and no further. The dealers are pure flavour: named silhouettes
 * that thin out as the board climbs. Every yen on screen comes from whatever
 * the caller priced the lot at; this module prices nothing itself.
 *
 * A room also carries an optional armed reaction (`armReaction`), which
 * guarantees one of the six bidding reactions at its next natural trigger
 * point, useful for exercising a reaction deterministically without waiting
 * on its own chance draw. An armed reaction replaces its chance draw
 * entirely: it fires deterministically and consumes no draw from the stream
 * for the decision of whether it happens, then clears itself. Any
 * eligibility relaxation an arm grants (bypassing an inspected-only gate, a
 * once-per-room latch, a snipe count, or a gap requirement) is part of the
 * arming, spelled out per reaction where it fires; every other draw on the
 * unarmed path is untouched; an unarmed room draws exactly as before.
 */

export type RoomConfig = AuctionRoomConfig
export type TurnoutKey = keyof RoomConfig['turnout']

export type RoomStatus = 'open' | 'won' | 'lost' | 'no-sale'

export type RoomVerdict = 'better' | 'fair' | 'worse'

/** The minimal shape of a lot as it enters the room: whatever seats it (a
 * lobby card, a production auction lot) supplies these four fields;
 * everything else the room needs rides `learned` and `config`. */
export interface RoomEntry {
  key: TurnoutKey
  displayName: string
  roomReadYen: number
  incrementYen: number
}

/**
 * What the bidder brings into the room from looking closely: their own
 * number (the value they settled on, which need not be the full truth if
 * they looked less deeply) and the verdict off it, plus the car's actual
 * worth for the win epilogue's true flip. `trueValueYen` is demo-only
 * omniscience: absent in production, where nobody actually knows the car's
 * exact true worth ahead of the sale - a room seated without it never shows
 * a flip epilogue (`epilogueFor`), only the outcome and its own log.
 */
export interface Learned {
  playerNumberYen: number
  verdict: RoomVerdict
  trueValueYen?: number
  /** Whether any diagnostic test ran on this lot before the seat; the
   * room's only signal for the goad reaction. Undefined reads as false. */
  inspected?: boolean
}

export interface Dealer {
  name: string
  /** False once dropped for the cosmetic thinning; a dropped dealer stays out. */
  active: boolean
}

export interface Room {
  key: TurnoutKey
  displayName: string
  roomReadYen: number
  /** The car's actual worth, carried in from `learned.trueValueYen` - null
   * when the caller never supplied it (production), in which case
   * `epilogueFor` never renders a flip line. */
  trueValueYen: number | null
  /** The bidder's own number: their estimated value of the lot, carried in
   * from `learned`. */
  playerNumberYen: number
  verdict: RoomVerdict
  reserveYen: number
  incrementYen: number
  /** The most the room will pay: one seeded fraction of the read, drawn once. */
  clearingYen: number
  /** The price on the table; opens at the reserve with nobody leading. */
  boardYen: number
  /** Who leads: the player, the room (a dealer), or nobody yet. */
  leader: 'player' | 'room' | null
  /** The dealer name on the leader chip while the room leads, else null. */
  leaderName: string | null
  status: RoomStatus
  dealers: Dealer[]
  /** Total drops so far; indexes the rotating drop-line copy. */
  dropCount: number
  /** Cycles through the dealers to attribute each room raise to a name. */
  bidderCursor: number
  /** Append-only room log. */
  log: string[]
  /** The closing line set at resolution, or null before the hammer. */
  epilogue: string | null
  /** Clock instant the current fuse burns out. */
  clockEndsAtMs: number
  /** The one scheduled room raise, if the floor still has a rung to climb. */
  pendingRoomBid: { atMs: number } | null
  /** Who landed the most recent bid, and when; drives the seat flash. */
  lastBid: { by: string; atMs: number } | null
  /** The room's single seeded stream; every event draw comes from here. */
  rng: () => number
  /** Whether the player visibly inspected this lot before taking the seat; the
   * only signal the goad reaction reads (never the player's own number). */
  inspected: boolean
  /** Whether the goad has fired in this room; it fires at most once. */
  goadFired: boolean
  /** Non-opening player bids landed inside the snipe window; once the
   * tolerance is spent, later room responses may draw the tax. */
  snipeCount: number
  /** A call answer queued for the next room response, consumed (and cleared)
   * the moment it lands. */
  pendingCallRungs: number | null
  /** The dealer feud in progress, if any: the two named dealers taking turns
   * and the raises left in the burst. */
  feud: { names: [string, string]; remaining: number } | null
  /** Whether the spite counter has fired in this room; it fires at most once. */
  spiteFired: boolean
  /** The one scheduled spite counter's own rungs, if the player's raise has
   * just swept the board and drawn a hit; consumed (and cleared) the moment
   * it lands. */
  pendingSpiteRungs: number | null
  /** A reaction forced, if any; see `armReaction`. Null on an unarmed room. */
  armedReaction: 'scare' | 'call' | 'goad' | 'tax' | 'feud' | 'spite' | null
  /** The tuning this room was seated with; every raise, reaction, and log
   * line reads only this, never a module-level constant. */
  config: RoomConfig
}

/** Named silhouettes filling the room, pure flavour with no bearing on the
 * numbers; the crowd thins from the back of this list as the board climbs. */
const DEALER_NAMES: readonly string[] = [
  'Endo',
  'Mrs. Sakaki',
  'Ogata',
  'Toyoshima',
  'Ubukata',
  'a quiet man in a good coat',
]

/** Drop-out copy, cycled in this order as the room thins. */
const DROP_LINES: readonly ((name: string) => string)[] = [
  (name) => `${name} closes the folder.`,
  (name) => `${name} sets the paddle down.`,
  (name) => `${name} steps out for a smoke.`,
  (name) => `${name} checks the time and is done.`,
]

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * The one clearing fraction the room draws up front: two draws off the stream,
 * u then t. A cold room (u under the bargain chance) clears somewhere between
 * the reserve fraction and the turnout floor; a normal room clears within the
 * turnout band. Exported so a test can pin the draw with a stubbed stream.
 */
export function clearingFractionFor(
  stream: { next: () => number },
  key: TurnoutKey,
  config: RoomConfig,
): number {
  const turnout = config.turnout[key]
  const u = stream.next()
  const t = stream.next()
  return u < config.bargainChance
    ? config.reserveFraction + t * (turnout.clearMin - config.reserveFraction)
    : turnout.clearMin + t * (turnout.clearMax - turnout.clearMin)
}

/**
 * Seats a live room from an entry and the numbers the bidder learned by
 * looking closely. One seeded stream (from `seed`) drives everything; the
 * draw order is law: the clearing fraction first (u then t); then, for every
 * scheduled room raise (the room's own continuation included - a feud is
 * rival-versus-rival and needs no player involvement to ignite, not even the
 * opening climb before the player ever bids), the feud-eligibility chance
 * where eligible (no feud already active, a leader on the board, at least
 * two dealers still in, and the board-to-clearing gap at least
 * feudMinGapRungs rungs), then one delay draw (the feud band while a feud is
 * active, the ordinary band otherwise). A player jump itself separately
 * draws at most one reaction in fixed order: the goad where eligible (the
 * room was entered inspected and has not goaded yet), else the scare, else
 * the call. A room response landed while the snipe tolerance is spent and no
 * call is pending draws the tax chance. A plain rung-one raise with no jump
 * still spends the feud-eligibility and delay draws above like any other
 * scheduled raise; the only draws it skips are the jump reactions. The
 * reserve and clearing price ride the config and the read, not what the
 * bidder learned. The bidder's number, verdict, and true worth ride
 * `learned`, so a half-blind bidder brings a number off the room read. The
 * opening room raise is scheduled from nowMs like any raise, but the
 * feud-eligibility draw does not fire for it: nobody has bid yet, so there
 * is no leader to be feuding over.
 *
 * Last in the order, every player raise (jump or not, once any jump
 * reactions above have resolved) is checked for the spite trigger: the
 * moment it is the first raise ever to push the next room rung past the
 * clearing price - the sweep-in that would otherwise leave the room with
 * nothing left to bid - with a dealer still active and the room not yet
 * spited, this draws the spite chance right there, before the room's own
 * scheduling draws below. A miss (or an ineligible raise) leaves the room to
 * schedule, or fall silent, exactly as an unarmed raise would - the
 * feud-eligibility and delay draws described above run as normal. A hit
 * schedules one room counter instead, spiteMaxRungs rungs past the player's
 * own board, exempt from the clearing cap but discarded outright (no
 * schedule, no delay draw, the latch left unset) if that landing would sit
 * at or above the room's read; a landing counter spends its own delay draw
 * in place of, not alongside, the feud-eligibility and ordinary scheduling
 * draws. It fires at most once a room: once it has landed, the room
 * schedules nothing further off it, so a player re-raise afterwards wins
 * unanswered.
 *
 * This whole order describes the unarmed room. `armReaction` forces one of
 * the six reactions above: at its trigger point in this order, the forced
 * reaction fires in place of its chance draw (no draw spent deciding whether
 * it happens) and any eligibility gate the design calls out as relaxed is
 * skipped too; every other draw in the order above is unaffected.
 */
export function enterRoom(
  entry: RoomEntry,
  seed: string,
  nowMs: number,
  learned: Learned,
  config: RoomConfig,
): Room {
  const stream = createRng(hashStringToSeed(seed))
  const turnout = config.turnout[entry.key]
  const value = entry.roomReadYen
  const reserveYen = Math.round(value * config.reserveFraction)
  const fraction = clearingFractionFor(stream, entry.key, config)
  const clearingYen = Math.max(reserveYen, Math.round(value * fraction))
  const dealers = DEALER_NAMES.slice(0, turnout.dealers).map((name) => ({ name, active: true }))
  const room: Room = {
    key: entry.key,
    displayName: entry.displayName,
    roomReadYen: value,
    trueValueYen: learned.trueValueYen ?? null,
    playerNumberYen: learned.playerNumberYen,
    verdict: learned.verdict,
    reserveYen,
    incrementYen: entry.incrementYen,
    clearingYen,
    boardYen: reserveYen,
    leader: null,
    leaderName: null,
    status: 'open',
    dealers,
    dropCount: 0,
    bidderCursor: dealers.length - 1,
    log: [`The clerk looks over the room. Reserve is ${formatYen(reserveYen)}.`],
    epilogue: null,
    clockEndsAtMs: nowMs + config.clockMs,
    pendingRoomBid: null,
    lastBid: null,
    rng: stream.next,
    inspected: learned.inspected ?? false,
    goadFired: false,
    snipeCount: 0,
    pendingCallRungs: null,
    feud: null,
    spiteFired: false,
    pendingSpiteRungs: null,
    armedReaction: null,
    config,
  }
  scheduleRoomBid(room, nowMs)
  return room
}

/**
 * Forces a reaction: the next natural trigger point for that reaction fires
 * it deterministically, consuming no chance draw (see the draw-order law
 * above), then clears the arm. Overwrites any previous arm. No-ops once the
 * room is no longer open, since nothing left in it can fire.
 */
export function armReaction(room: Room, kind: Room['armedReaction'] & string): void {
  if (room.status !== 'open') return
  room.armedReaction = kind
}

/**
 * Schedules the next room raise from `fromMs`, unless the next rung would top
 * the clearing price, in which case the floor has maxed out and nothing more is
 * scheduled: the fuse then hammers to whoever leads. Every scheduled raise
 * first draws the feud-eligibility chance where eligible (see
 * `maybeStartFeud`) - this is rival-versus-rival drama, not a reaction to the
 * player, so it fires on the room's own continuation of a climb exactly as it
 * fires after a player bid. The delay is then a seeded uniform draw inside the
 * config's band (the feud band while a feud is active, the ordinary band
 * otherwise), always shorter than the fuse.
 */
function scheduleRoomBid(room: Room, fromMs: number): void {
  // A dealerless room (the tutorial's quiet morning) has nobody left to
  // raise: no opener, no counter, ever. The fuse alone decides it.
  if (room.dealers.length === 0) {
    room.pendingRoomBid = null
    room.feud = null
    return
  }
  const rung = room.leader === null ? room.reserveYen : room.boardYen + room.incrementYen
  if (rung > room.clearingYen) {
    room.pendingRoomBid = null
    room.feud = null
    return
  }
  maybeStartFeud(room)
  const band = room.feud ? room.config.reactions.feudDelayMs : room.config.bidDelayMs
  const delay = Math.round(band.min + room.rng() * (band.max - band.min))
  room.pendingRoomBid = { atMs: fromMs + delay }
}

/**
 * Considered on every scheduled room raise once a leader is on the board -
 * the player's own bids, a plain rung-one raise, and the room's unprompted
 * continuation of an existing climb all draw this the same way, since a feud
 * is dealer against dealer and needs no player action to ignite. No-ops
 * before anyone has bid (nothing to feud over yet). Starts a feud, at most
 * one at a time, once the board-to-clearing gap is wide enough and at least
 * two dealers can still carry it: picks the first two still-active dealer
 * names, in dealer order, and opens the burst.
 *
 * A room armed with 'feud' skips the gap check and the chance draw on the
 * first scheduled raise where no feud is already running: the
 * at-least-two-active-dealers and leader-on-the-board gates above still
 * apply, so an arm set too early (before any leader) or too late (too few
 * dealers left) simply waits, armed, for a raise where they hold.
 */
function maybeStartFeud(room: Room): void {
  if (room.feud || room.leader === null) return
  const activeDealers = room.dealers.filter((dealer) => dealer.active)
  if (activeDealers.length < 2) return
  const forced = room.armedReaction === 'feud'
  if (!forced) {
    const gapRungs = (room.clearingYen - room.boardYen) / room.incrementYen
    if (gapRungs < room.config.reactions.feudMinGapRungs) return
    const u = room.rng()
    if (u >= room.config.reactions.feudChance) return
  }
  const [a, b] = activeDealers
  room.feud = { names: [a!.name, b!.name], remaining: room.config.reactions.feudRungs }
  room.log.push(`${a!.name} and ${b!.name} have history. The rest of the room settles in to watch.`)
  if (forced) room.armedReaction = null
}

/**
 * Advances the room to nowMs. Lands any due room raise at its scheduled instant
 * (the fuse resets from that instant, not from the tick that observed it), then
 * falls the hammer once the fuse burns out; a single large time step therefore
 * fast-forwards a whole dealer-versus-dealer climb correctly.
 */
export function tick(room: Room, nowMs: number): void {
  while (room.status === 'open') {
    if (room.pendingRoomBid && room.pendingRoomBid.atMs <= nowMs) {
      const { atMs } = room.pendingRoomBid
      landRoomBid(room, atMs)
      continue
    }
    if (room.clockEndsAtMs <= nowMs) {
      hammer(room)
    }
    return
  }
}

/**
 * The player's bid: the reserve if nobody has bid yet, `rungs` increments
 * above the board otherwise (the opening ignores `rungs`, landing on the
 * reserve regardless). The raise interrupts and reschedules any pending room
 * raise, or clears it when the next rung tops the clearing price - the room
 * is beaten and will not counter, unless the spite chance below has other
 * ideas. A leading bid cannot be withdrawn, so this no-ops while the player
 * already leads.
 *
 * A non-opening bid landed inside the last `snipeWindowMs` of the fuse counts
 * as a snipe. A non-opening raise of `jumpRungs` rungs or more reads as a
 * jump and draws the jump reactions (see the draw-order law on `enterRoom`);
 * a plain rung-one raise with no jump draws none of those. Every raise, jump
 * or not, is then checked for the spite trigger (`maybeFireSpite`); only when
 * that does not schedule a counter does the raise fall through to the room's
 * ordinary response through `scheduleRoomBid`, which spends its own
 * feud-eligibility draw regardless.
 */
export function playerBid(room: Room, nowMs: number, rungs = 1): void {
  if (room.status !== 'open' || room.leader === 'player') return
  const opening = room.leader === null
  if (!opening && room.clockEndsAtMs - nowMs < room.config.reactions.snipeWindowMs) {
    room.snipeCount++
  }
  const isJump = !opening && rungs >= room.config.reactions.jumpRungs
  room.boardYen = opening ? room.reserveYen : room.boardYen + rungs * room.incrementYen
  room.leader = 'player'
  room.leaderName = null
  room.lastBid = { by: 'player', atMs: nowMs }
  room.log.push(
    opening ? `You open: ${formatYen(room.boardYen)}.` : `You raise: ${formatYen(room.boardYen)}.`,
  )
  if (isJump) applyJumpReactions(room)
  runDrops(room)
  room.clockEndsAtMs = nowMs + room.config.clockMs
  if (!maybeFireSpite(room, nowMs)) scheduleRoomBid(room, nowMs)
}

/**
 * Fires the scare: the clearing price collapses to the board plus
 * scareLeftRungs increments, a fixed formula with no magnitude draw of its
 * own.
 */
function fireScare(room: Room): void {
  const r = room.config.reactions
  room.clearingYen = Math.min(
    room.clearingYen,
    room.boardYen + r.scareLeftRungs * room.incrementYen,
  )
  room.log.push('The jump lands. Paddles settle into laps down the row.')
}

/**
 * Fires the goad: the clearing price lifts above the read by a magnitude draw
 * bounded by goadMaxLift. `latch` sets the once-per-room goadFired flag on a
 * natural fire; a forced fire leaves it untouched, so the latch is never
 * consumed by a forced goad and a natural goad remains free to fire later (or
 * the arm can be reused to force another).
 */
function fireGoad(room: Room, latch: boolean): void {
  const r = room.config.reactions
  if (latch) room.goadFired = true
  const lift = 1 + room.rng() * (r.goadMaxLift - 1)
  room.clearingYen = Math.max(room.clearingYen, Math.round(room.roomReadYen * lift))
  room.log.push('Somebody saw you under that car earlier. The room sits up.')
}

/**
 * The reactions to a player jump, drawn off the room's stream in fixed order:
 * the goad, then the scare, then the call. At most one fires. The goad is the
 * sanctioned exception to the room never bidding past its own read: it draws
 * only when the room was entered inspected and has not already goaded this
 * room, reacting to the bidder's behaviour (inspected and jumped), never to
 * the bidder's own number, which is never read here.
 *
 * A jump forced with 'goad', 'scare', or 'call' (see `armReaction`) preempts
 * this whole draw sequence: the forced reaction fires without a chance draw
 * and the arm clears, except a forced call still checks the fits-under-
 * clearing condition and, when it cannot fit, leaves the arm armed and does
 * nothing else this jump (scare and goad stay skipped either way). An arm of
 * 'tax', 'feud', or 'spite' does not apply here and falls through to the
 * normal draws below - spite is not a jump reaction at all: it is checked
 * separately, against every player raise, jump or not, once this function
 * returns (see `maybeFireSpite`).
 */
function applyJumpReactions(room: Room): void {
  const r = room.config.reactions
  if (room.armedReaction === 'goad') {
    room.armedReaction = null
    fireGoad(room, false)
    return
  }
  if (room.armedReaction === 'scare') {
    room.armedReaction = null
    fireScare(room)
    return
  }
  if (room.armedReaction === 'call') {
    if (room.boardYen + r.callRungs * room.incrementYen <= room.clearingYen) {
      room.armedReaction = null
      room.pendingCallRungs = r.callRungs
    }
    return
  }
  if (room.inspected && !room.goadFired) {
    const u = room.rng()
    if (u < r.goadChance) {
      fireGoad(room, true)
      return
    }
  }
  const scareU = room.rng()
  if (scareU < r.scareChance) {
    fireScare(room)
    return
  }
  const callU = room.rng()
  if (callU < r.callChance && room.boardYen + r.callRungs * room.incrementYen <= room.clearingYen) {
    room.pendingCallRungs = r.callRungs
  }
}

/**
 * The spite counter: checked against every player raise, jump or not, once
 * any jump reactions above have resolved. Eligible only at the sweep-in
 * moment - the first raise ever to push the next room rung past the
 * clearing price, with a dealer still active and the room not yet spited -
 * so an ordinary raise that still leaves the room a rung to counter with
 * never reaches this at all. An unarmed room draws the spite chance right
 * there; armed with 'spite', it fires without that draw instead. Either way, a
 * landing target at or above the room's read is discarded outright: no
 * schedule, no delay draw, the latch (and a forced arm) left untouched, so
 * the room stays silent exactly as an unarmed sweep-in would and a later
 * qualifying raise can try again. A fitting target schedules one room
 * counter, `spiteMaxRungs` rungs past the player's own board and exempt from
 * the clearing cap, off its own delay draw - in place of, not alongside, the
 * caller's own `scheduleRoomBid` - and latches the room so it never spites
 * twice. Returns whether it scheduled the counter, so the caller knows
 * whether to fall back to its own ordinary scheduling.
 */
function maybeFireSpite(room: Room, fromMs: number): boolean {
  if (room.spiteFired) return false
  if (room.boardYen + room.incrementYen <= room.clearingYen) return false
  if (!room.dealers.some((dealer) => dealer.active)) return false
  const r = room.config.reactions
  const forced = room.armedReaction === 'spite'
  if (!forced) {
    const u = room.rng()
    if (u >= r.spiteChance) return false
  }
  const targetYen = room.boardYen + r.spiteMaxRungs * room.incrementYen
  if (targetYen >= room.roomReadYen) return false
  if (forced) room.armedReaction = null
  room.spiteFired = true
  room.pendingSpiteRungs = r.spiteMaxRungs
  const band = room.config.bidDelayMs
  const delay = Math.round(band.min + room.rng() * (band.max - band.min))
  room.pendingRoomBid = { atMs: fromMs + delay }
  return true
}

/**
 * The player passes. Before any bid the lot rolls back unsold; with the room
 * leading it hammers to the leading dealer at the board. No-op while the player
 * leads.
 */
export function letGo(room: Room): void {
  if (room.status !== 'open' || room.leader === 'player') return
  room.pendingRoomBid = null
  if (room.leader === null) {
    room.status = 'no-sale'
    room.log.push('Nobody moves. The lot rolls back.')
  } else {
    room.status = 'lost'
    room.log.push(`You let it go. ${room.leaderName} takes it at ${formatYen(room.boardYen)}.`)
  }
  room.epilogue = epilogueFor(room)
}

/**
 * A scheduled room raise lands at its instant: normally the next dealer name
 * takes the board one rung up; a pending call answers with `callRungs` at
 * once; once the snipe tolerance is spent a taxed response may take
 * `snipeTaxRungs`; an active feud overrides all of that with a single rung,
 * alternating strictly between its two named dealers instead of the cursor.
 * Every non-opening rung count clamps down to the largest that still lands at
 * or under the clearing price (a floor of one rung), so neither a call nor a
 * tax ever pays past the room's cap. The fuse resets, the room thins (which
 * can end a feud early if one of its dealers drops), and the next raise is
 * scheduled.
 *
 * A room armed with 'tax' takes the taxed kind on the next non-opening
 * response with no chance draw and regardless of snipeCount, provided a feud
 * or a pending call is not already claiming the response (those keep their
 * own precedence unchanged; the tax arm simply waits for a response neither
 * covers).
 *
 * A pending spite counter (`maybeFireSpite`) takes top precedence over all of
 * that: it lands its own `spiteMaxRungs`, exempt from the clamp-to-clearing
 * loop below (the whole point of the spite is to pay past the room's own
 * cap), and its own dealer, cycled the same way an ordinary raise is.
 */
function landRoomBid(room: Room, atMs: number): void {
  const r = room.config.reactions
  const opening = room.leader === null
  let rungs = 1
  let kind: 'normal' | 'called' | 'taxed' | 'spite' = 'normal'
  let name: string

  if (!opening && room.pendingSpiteRungs !== null) {
    rungs = room.pendingSpiteRungs
    room.pendingSpiteRungs = null
    kind = 'spite'
    name = room.dealers[advanceToNextActiveDealer(room)]!.name
  } else if (!opening && room.feud) {
    const feud = room.feud
    const turnIndex = (r.feudRungs - feud.remaining) % 2
    name = turnIndex === 0 ? feud.names[0] : feud.names[1]
  } else {
    if (!opening && room.pendingCallRungs !== null) {
      rungs = room.pendingCallRungs
      room.pendingCallRungs = null
      kind = 'called'
    } else if (!opening && room.armedReaction === 'tax') {
      room.armedReaction = null
      rungs = r.snipeTaxRungs
      kind = 'taxed'
    } else if (!opening && room.snipeCount >= r.snipesBeforeTax) {
      const u = room.rng()
      if (u < r.snipeTaxChance) {
        rungs = r.snipeTaxRungs
        kind = 'taxed'
      }
    }
    if (!opening) {
      while (rungs > 1 && room.boardYen + rungs * room.incrementYen > room.clearingYen) rungs--
    }
    name = room.dealers[advanceToNextActiveDealer(room)]!.name
  }

  room.boardYen = opening ? room.reserveYen : room.boardYen + rungs * room.incrementYen
  room.leader = 'room'
  room.leaderName = name
  room.lastBid = { by: name, atMs }
  room.log.push(
    opening
      ? `${name} opens: ${formatYen(room.boardYen)}.`
      : kind === 'called'
        ? `${name} doesn't blink: ${formatYen(room.boardYen)}.`
        : kind === 'taxed'
          ? `${name} has had enough of the clock: straight to ${formatYen(room.boardYen)}.`
          : kind === 'spite'
            ? `${name} won't be swept aside: ${formatYen(room.boardYen)}.`
            : `${name} raises: ${formatYen(room.boardYen)}.`,
  )
  runDrops(room)
  if (room.feud) {
    room.feud.remaining--
    const bothStillActive = room.feud.names.every(
      (dealerName) => room.dealers.find((dealer) => dealer.name === dealerName)?.active,
    )
    if (room.feud.remaining <= 0 || !bothStillActive) room.feud = null
  }
  room.clockEndsAtMs = atMs + room.config.clockMs
  scheduleRoomBid(room, atMs)
}

/** The next dealer to be credited with a room raise: the cursor walks on to the
 * next still-active dealer, so a raise is never attributed to a dropped one. */
function advanceToNextActiveDealer(room: Room): number {
  const n = room.dealers.length
  for (let step = 0; step < n; step++) {
    room.bidderCursor = (room.bidderCursor + 1) % n
    if (room.dealers[room.bidderCursor]!.active) return room.bidderCursor
  }
  return room.bidderCursor
}

/** How many dealers should still be lit at the current board: the crowd thins
 * evenly from full at the reserve to a single holdout at the clearing price. */
function targetActive(room: Room): number {
  const span = room.clearingYen - room.reserveYen
  if (span <= 0) return 1
  const progress = clamp01((room.boardYen - room.reserveYen) / span)
  return Math.max(1, room.dealers.length - Math.floor(progress * (room.dealers.length - 1)))
}

/**
 * Thins the room to match the climb: as the board rises toward the clearing
 * price, non-leading dealers drop from the back of the row, rotating the drop
 * copy. Once the floor has maxed out (no rung left under the clearing price)
 * only the leader stays, and the fuse hammers to them. Cosmetic only: no dealer
 * carries a ceiling that drives this.
 */
function runDrops(room: Room): void {
  const maxed = room.boardYen + room.incrementYen > room.clearingYen
  const target = maxed ? 1 : targetActive(room)
  while (dealersInRoom(room) > target) {
    let victim = -1
    for (let i = room.dealers.length - 1; i >= 0; i--) {
      const dealer = room.dealers[i]!
      if (dealer.active && dealer.name !== room.leaderName) {
        victim = i
        break
      }
    }
    if (victim < 0) break
    room.dealers[victim]!.active = false
    room.log.push(DROP_LINES[room.dropCount % DROP_LINES.length]!(room.dealers[victim]!.name))
    room.dropCount++
  }
}

/** Fuse-out: the lot goes to whoever leads, or rolls back if nobody bid. */
function hammer(room: Room): void {
  room.pendingRoomBid = null
  if (room.leader === 'player') {
    room.status = 'won'
    room.log.push(`Hammer. Yours at ${formatYen(room.boardYen)}. The room moves on.`)
  } else if (room.leader === 'room') {
    room.status = 'lost'
    room.log.push(`Hammer. ${room.leaderName} takes it at ${formatYen(room.boardYen)}.`)
  } else {
    room.status = 'no-sale'
    room.log.push('Nobody moves. The lot rolls back.')
  }
  room.epilogue = epilogueFor(room)
}

/**
 * The closing line at resolution. A win reads against the true worth: clear
 * profit, or a loss if the bidder chased past that worth. A dealer taking a
 * trap reassures (let the room overpay); a dealer taking a steal or a fair lot
 * stings a little. A no-sale before any bid keeps only the roll-back line.
 * Null outright when the room was never told the car's true worth
 * (production): no flip epilogue there, only the outcome and the room's own
 * log.
 */
function epilogueFor(room: Room): string | null {
  if (room.trueValueYen === null) return null
  if (room.status === 'won') {
    const profit = room.trueValueYen - room.boardYen
    return profit >= 0
      ? `You flip it for ${formatYen(room.trueValueYen)}. ${formatYen(profit)} clear.`
      : `You flip it for ${formatYen(room.trueValueYen)}. ${formatYen(Math.abs(profit))} down, one to learn from.`
  }
  if (room.status === 'lost') {
    return room.verdict === 'worse'
      ? 'You let it go. The room can overpay for that one.'
      : 'You let it go. Someone got a bargain there.'
  }
  return null
}

/** Dealers still lit in the room; the seat row reads this live. */
export function dealersInRoom(room: Room): number {
  return room.dealers.filter((dealer) => dealer.active).length
}

/** The rung the bidder's next bid lands on: the reserve unopened, else one up. */
export function nextRungYen(room: Room): number {
  return room.leader === null ? room.reserveYen : room.boardYen + room.incrementYen
}

/** The bid step for a room reading at `roomReadYen`: the coarse step at or
 * above `stepThresholdYen`, the fine one below it - shared by every caller
 * that seats a room off a live read, so the rung size is derived once. */
export function incrementYenFor(roomReadYen: number, config: RoomConfig): number {
  return roomReadYen < config.stepThresholdYen ? config.stepBelowYen : config.stepAboveYen
}
