import type { AuctionLot, CarInstance, GameState } from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  createRng,
  generateAuctionCatalog,
  hashStringToSeed,
  playerEstimateYen,
  sheetGuideValueYen,
  type SimContext,
} from '@midnight-garage/sim'
import { formatYen } from '../utils/formatYen'

/**
 * View-local live-clock machine for the dev-only auction room demo
 * (AuctionRoomDemoScreen.vue). Everything here is derived from the live
 * catalogue/value seams and held as plain component state; nothing reads or
 * writes saves, the auction board, or any sim state. Time is an injected
 * number handed to tick(), never read from a wall clock, and every draw comes
 * from one seeded stream per run, so a whole room replays identically from
 * (entry, runIndex) and synthetic times.
 *
 * The room reads a doubt at its fair-odds value (sheetGuideValueYen, exactly
 * what the live auction sheet prints). Each room draws a single clearing price
 * up front, the most the floor will pay, as a seeded fraction of that read from
 * one central tuning block (ROOM_TUNING); the floor then climbs dealer against
 * dealer up to that price and no further. Inspection resolves the doubt to its
 * rolled true cause and reveals the true worth, which can sit above the read (a
 * steal the floor tends to clear below) or below it (a trap the floor can clear
 * over). The dealers are pure flavour: named silhouettes that thin out as the
 * board climbs. Every yen on screen comes from the real estimator through a
 * choice of which causes it prices.
 *
 * A room also carries an optional armed reaction (`armReaction`), a dev
 * control that guarantees one of the five bidding reactions at its next
 * natural trigger point for testing. An armed reaction replaces its chance
 * draw entirely: it fires deterministically and consumes no draw from the
 * stream for the decision of whether it happens, then clears itself. Any
 * eligibility relaxation an arm grants (bypassing an inspected-only gate, a
 * once-per-room latch, a snipe count, or a gap requirement) is part of the
 * arming, spelled out per reaction where it fires; every other draw on the
 * unarmed path is untouched; an unarmed room draws exactly as before.
 */

export type DemoRoomStatus = 'open' | 'won' | 'lost' | 'no-sale'

export type DemoVerdict = 'better' | 'fair' | 'worse'

/**
 * The single source of truth for the room's bidding. The maintainer tunes only
 * here: the per-bid fuse, the opening reserve, the delay before each room raise,
 * the cold-room bargain chance, and per turnout the crowd size and the band the
 * room clears in as a fraction of the read.
 */
export const ROOM_TUNING = {
  clockMs: 5000, // per-bid fuse (5s)
  reserveFraction: 0.55, // opening bid, as a fraction of the value
  bidDelayMs: { min: 800, max: 4600 }, // delay before each room raise (always < clockMs)
  bargainChance: 0.05, // chance the room is cold and clears below clearMin
  stepThresholdYen: 500_000, // read at or above this bids on the coarse step, below it the fine one
  stepBelowYen: 5_000, // bid step for a read under the threshold
  stepAboveYen: 10_000, // bid step for a read at or above the threshold
  bankrollYen: 250_000, // demo-local cash the yard visit is paid from (the real fee, labour, and minutes come from economy.json)
  turnout: {
    thin: { dealers: 2, clearMin: 0.7, clearMax: 0.85 },
    packed: { dealers: 6, clearMin: 0.75, clearMax: 0.95 },
  },
  playerRaiseOptionsRungs: [1, 4, 8], // the player's raise choices, in rungs
  reactions: {
    jumpRungs: 4, // a raise this many rungs up reads as a jump
    scareChance: 0.15, // jump: the room loses its stomach
    scareLeftRungs: 2, // ...and has at most this many rungs left in it
    callChance: 0.12, // jump: a rival answers with a jump of their own
    callRungs: 3, // ...this many rungs on top
    goadChance: 0.03, // RARE: an inspected player's jump convinces the room it is missing something
    goadMaxLift: 1.06, // ...the goaded ceiling, as a fraction of the room read; once per room
    snipeWindowMs: 800, // a player bid this late in the fuse reads as a snipe
    snipesBeforeTax: 2, // snipes tolerated before the room gets irritated
    snipeTaxChance: 0.15, // each later room response may then take snipeTaxRungs at once
    snipeTaxRungs: 2, // ...rungs taken at once, still capped by the clearing price
    feudChance: 0.08, // a wide board-to-clearing gap may play out as a dealer feud
    feudMinGapRungs: 6, // ...at least this many rungs between board and clearing
    feudRungs: 4, // raises exchanged in the burst
    feudDelayMs: { min: 400, max: 1100 }, // the short, urgent delay band the feud paces on
  },
} as const

export type TurnoutKey = keyof typeof ROOM_TUNING.turnout

export interface DemoDealer {
  name: string
  /** False once dropped for the cosmetic thinning; a dropped dealer stays out. */
  active: boolean
}

export interface DemoLobbyEntry {
  key: TurnoutKey
  displayName: string
  /** The fair-odds read (the live auction sheet's value); the whole room bids
   * off this number. */
  roomReadYen: number
  /** The true worth, revealed on inspection; may sit above or below the read. */
  trueValueYen: number
  verdict: DemoVerdict
  incrementYen: number
  dealerCount: number
  lot: AuctionLot
}

export interface DemoRoom {
  key: TurnoutKey
  displayName: string
  roomReadYen: number
  trueValueYen: number
  /** The player's own number: their estimated value of the lot, carried in from
   * looking closely (the room read if they never ran a test). */
  playerNumberYen: number
  verdict: DemoVerdict
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
  status: DemoRoomStatus
  dealers: DemoDealer[]
  /** Total drops so far; indexes the rotating drop-line copy. */
  dropCount: number
  /** Cycles through the dealers to attribute each room raise to a name. */
  bidderCursor: number
  /** Append-only room log. */
  log: string[]
  /** The closing line set at resolution, or null before the hammer. */
  epilogue: string | null
  /** Demo-clock instant the current fuse burns out. */
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
  /** A reaction force-armed by a dev control, if any. An armed reaction fires
   * deterministically at its next natural trigger point and then clears
   * itself; see `armReaction`. Null on an unarmed room. */
  armedReaction: 'scare' | 'call' | 'goad' | 'tax' | 'feud' | null
}

/** Fixed catalogue seed and day so the two demo lots are identical every run. */
const DEMO_CATALOG_SEED = 1995
const DEMO_CATALOG_DAY = 1
/** Catalogue sizes tried in turn: the search widens until a genuine trap (a lot
 * worth less than the read by the trap band) turns up among the symptomatic
 * lots. A trap is rare at the fair-odds read, so the widest step runs deep. */
const DEMO_CATALOG_N_STEPS: readonly number[] = [400, 800, 1200, 1600]

/** A lot whose true worth falls below this fraction of the read reads as a trap
 * the packed room can overpay for; it selects the demo trap lot. */
const TRAP_VALUE_FRACTION = 0.9
/** How far the truth must part from the read, either way, to read as better or
 * worse than the room reckons. */
const VERDICT_BAND_FRACTION = 0.08

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

/** The steal takes the thin room, the trap the packed one: a crowd visibly
 * tempts the player to chase the car that is worth less than it looks. */
const ROOM_ORDER: readonly TurnoutKey[] = ['thin', 'packed']

interface ScoredLot {
  lot: AuctionLot
  roomReadYen: number
  trueValueYen: number
  ratio: number
}

/** The room read: the fair-odds value the live auction sheet prints. The whole
 * room bids off this number; inspection reveals the truth either side of it. */
function roomReadYenFor(lot: AuctionLot, state: GameState, context: SimContext): number {
  const model = context.modelsById[lot.modelId]
  if (!model) return 0
  return Math.round(sheetGuideValueYen(lot.car, model, state, context))
}

/** The true worth: the estimator with every symptom resolved to its actual
 * rolled cause. It can sit above or below the room read. */
function trueValueYenFor(lot: AuctionLot, state: GameState, context: SimContext): number {
  const model = context.modelsById[lot.modelId]
  if (!model) return 0
  const carTrue: CarInstance = {
    ...lot.car,
    symptoms: lot.car.symptoms.map((s) => ({ ...s, remainingCauseIds: [s.trueCauseId] })),
  }
  return Math.round(playerEstimateYen(carTrue, model, state, context))
}

/** Where the truth lands against the read: better than feared when it beats the
 * read by the verdict band, worse than it looks when it falls short of the read
 * by the band, fair when it lands within the band either way. */
export function verdictFor(roomReadYen: number, trueValueYen: number): DemoVerdict {
  const gap = trueValueYen - roomReadYen
  if (gap >= roomReadYen * VERDICT_BAND_FRACTION) return 'better'
  if (gap <= -roomReadYen * VERDICT_BAND_FRACTION) return 'worse'
  return 'fair'
}

/**
 * Scores every symptomatic local-yard lot in a fixed-seed catalogue of `n` by
 * the ratio of its true worth to the room read. Lots carrying anything other
 * than a single unresolved doubt are skipped, as is any the estimator prices at
 * nothing: that collapses the read to zero and leaves an unplayable room (no
 * reserve, no coherent clearing price).
 */
function scoreDemoLots(n: number, state: GameState, context: SimContext): ScoredLot[] {
  const lots = generateAuctionCatalog(
    context.models,
    'local-yard',
    DEMO_CATALOG_DAY,
    n,
    createRng(DEMO_CATALOG_SEED),
    context,
  )
  return lots
    .filter(
      (lot) => lot.car.symptoms.length === 1 && lot.car.symptoms[0]!.remainingCauseIds.length > 1,
    )
    .map((lot) => {
      const roomReadYen = roomReadYenFor(lot, state, context)
      const trueValueYen = trueValueYenFor(lot, state, context)
      return { lot, roomReadYen, trueValueYen, ratio: trueValueYen / roomReadYen }
    })
    .filter((scored) => scored.roomReadYen > 0)
}

/**
 * Picks the two demo lots deterministically from a fixed-seed local-yard
 * catalogue: over the lots carrying exactly one unresolved doubt, the steal is
 * the one whose true worth most beats the room read (highest ratio), and the
 * trap the lowest-ratio lot whose true worth falls below the trap band of the
 * read (TRAP_VALUE_FRACTION), so the room genuinely overpays. The catalogue
 * widens until such a trap exists; one with none throws rather than ship a fake
 * trap. Ties break on lot id, ascending, so the pick is reproducible.
 */
function selectDemoLots(
  state: GameState,
  context: SimContext,
): { steal: ScoredLot; trap: ScoredLot } {
  for (const n of DEMO_CATALOG_N_STEPS) {
    const scored = scoreDemoLots(n, state, context)
    const traps = scored.filter(
      (candidate) => candidate.trueValueYen < candidate.roomReadYen * TRAP_VALUE_FRACTION,
    )
    if (traps.length === 0) continue
    const steal = scored.reduce((best, cur) =>
      cur.ratio > best.ratio || (cur.ratio === best.ratio && cur.lot.id < best.lot.id) ? cur : best,
    )
    const trap = traps.reduce((worst, cur) =>
      cur.ratio < worst.ratio || (cur.ratio === worst.ratio && cur.lot.id < worst.lot.id)
        ? cur
        : worst,
    )
    return { steal, trap }
  }
  const widest = DEMO_CATALOG_N_STEPS[DEMO_CATALOG_N_STEPS.length - 1]
  throw new Error(
    `auction room demo found no trap (a symptomatic lot worth under ${TRAP_VALUE_FRACTION} of the room read) in catalogues up to ${widest} lots`,
  )
}

/**
 * Rolls the two demo lots purely (no store writes) and dresses them as lobby
 * cards: the steal in a thin room, the trap in a packed one. Every yen rides
 * the real estimator; the crowd size comes from the room tuning, so a given
 * game state always produces the same two cards.
 */
export function buildDemoLobby(state: GameState, context: SimContext): DemoLobbyEntry[] {
  const { steal, trap } = selectDemoLots(state, context)
  const scoredByKey: Record<TurnoutKey, ScoredLot> = { thin: steal, packed: trap }
  return ROOM_ORDER.map((key) => {
    const scored = scoredByKey[key]
    const model = context.modelsById[scored.lot.modelId]
    return {
      key,
      displayName: model ? resolveCarDisplayName(model) : scored.lot.modelId,
      roomReadYen: scored.roomReadYen,
      trueValueYen: scored.trueValueYen,
      verdict: verdictFor(scored.roomReadYen, scored.trueValueYen),
      incrementYen:
        scored.roomReadYen < ROOM_TUNING.stepThresholdYen
          ? ROOM_TUNING.stepBelowYen
          : ROOM_TUNING.stepAboveYen,
      dealerCount: ROOM_TUNING.turnout[key].dealers,
      lot: scored.lot,
    }
  })
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * What the player brings into the room from looking closely: their own number
 * (the value they settled on, which need not be the full truth if they looked
 * less deeply) and the verdict off it, plus the car's actual worth for the win
 * epilogue's true flip. A player who never looks carries the room read as their
 * number.
 */
export interface DemoLearned {
  playerNumberYen: number
  verdict: DemoVerdict
  trueValueYen: number
  /** Whether any diagnostic test ran on this lot before the seat; the room's
   * only signal for the goad reaction. Undefined reads as false. */
  inspected?: boolean
}

/**
 * The learned numbers of a player who looked all the way to the true cause:
 * the entry's own fully-resolved reveal, with no margin taken off it. The
 * default when a room is seated without an explicit inspection result.
 */
function fullyLookedLearned(entry: DemoLobbyEntry): DemoLearned {
  return {
    playerNumberYen: entry.trueValueYen,
    verdict: entry.verdict,
    trueValueYen: entry.trueValueYen,
    inspected: true,
  }
}

/**
 * The one clearing fraction the room draws up front: two draws off the stream,
 * u then t. A cold room (u under the bargain chance) clears somewhere between
 * the reserve fraction and the turnout floor; a normal room clears within the
 * turnout band. Exported so a test can pin the draw with a stubbed stream.
 */
export function clearingFractionFor(stream: { next: () => number }, key: TurnoutKey): number {
  const turnout = ROOM_TUNING.turnout[key]
  const u = stream.next()
  const t = stream.next()
  return u < ROOM_TUNING.bargainChance
    ? ROOM_TUNING.reserveFraction + t * (turnout.clearMin - ROOM_TUNING.reserveFraction)
    : turnout.clearMin + t * (turnout.clearMax - turnout.clearMin)
}

/**
 * Seats a live room from a lobby card and the numbers the player learned by
 * looking closely. One seeded stream per run drives everything; the draw order
 * is law: the clearing fraction first (u then t); then, for every scheduled
 * room raise (the room's own continuation included - a feud is rival-versus-
 * rival and needs no player involvement to ignite, not even the opening climb
 * before the player ever bids), the feud-eligibility chance where eligible (no
 * feud already active, a leader on the board, at least two dealers still in,
 * and the board-to-clearing gap at least feudMinGapRungs rungs), then one
 * delay draw (the feud band while a feud is active, the ordinary band
 * otherwise). A player jump itself separately draws at most one reaction in
 * fixed order: the goad where eligible (the room was entered inspected and
 * has not goaded yet), else the scare, else the call. A room response landed
 * while the snipe tolerance is spent and no call is pending draws the tax
 * chance. A plain rung-one raise with no jump still spends the feud-
 * eligibility and delay draws above like any other scheduled raise; the only
 * draws it skips are the jump reactions. The reserve and clearing price ride
 * the tuning and the read, not what the player learned. The player's number,
 * verdict, and true worth ride `learned`, so a half-blind player brings a
 * number off the room read. The opening room raise is scheduled from nowMs
 * like any raise, but the feud-eligibility draw does not fire for it: nobody
 * has bid yet, so there is no leader to be feuding over.
 *
 * This whole order describes the unarmed room. `armReaction` lets a dev
 * control force one of the five reactions above: at its trigger point in this
 * order, the forced reaction fires in place of its chance draw (no draw
 * spent deciding whether it happens) and any eligibility gate the design
 * calls out as relaxed is skipped too; every other draw in the order above is
 * unaffected.
 */
export function enterRoom(
  entry: DemoLobbyEntry,
  runIndex: number,
  nowMs: number,
  learned: DemoLearned = fullyLookedLearned(entry),
): DemoRoom {
  const stream = createRng(hashStringToSeed(`auction-room-demo:${entry.key}:run${runIndex}`))
  const turnout = ROOM_TUNING.turnout[entry.key]
  const value = entry.roomReadYen
  const reserveYen = Math.round(value * ROOM_TUNING.reserveFraction)
  const fraction = clearingFractionFor(stream, entry.key)
  const clearingYen = Math.max(reserveYen, Math.round(value * fraction))
  const dealers = DEALER_NAMES.slice(0, turnout.dealers).map((name) => ({ name, active: true }))
  const room: DemoRoom = {
    key: entry.key,
    displayName: entry.displayName,
    roomReadYen: value,
    trueValueYen: learned.trueValueYen,
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
    clockEndsAtMs: nowMs + ROOM_TUNING.clockMs,
    pendingRoomBid: null,
    lastBid: null,
    rng: stream.next,
    inspected: learned.inspected ?? false,
    goadFired: false,
    snipeCount: 0,
    pendingCallRungs: null,
    feud: null,
    armedReaction: null,
  }
  scheduleRoomBid(room, nowMs)
  return room
}

/**
 * Force-arms a reaction for a dev control: the next natural trigger point for
 * that reaction fires it deterministically, consuming no chance draw (see the
 * draw-order law above), then clears the arm. Overwrites any previous arm.
 * No-ops once the room is no longer open, since nothing left in it can fire.
 */
export function armReaction(room: DemoRoom, kind: DemoRoom['armedReaction'] & string): void {
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
 * tuning band (the feud band while a feud is active, the ordinary band
 * otherwise), always shorter than the fuse.
 */
function scheduleRoomBid(room: DemoRoom, fromMs: number): void {
  const rung = room.leader === null ? room.reserveYen : room.boardYen + room.incrementYen
  if (rung > room.clearingYen) {
    room.pendingRoomBid = null
    room.feud = null
    return
  }
  maybeStartFeud(room)
  const band = room.feud ? ROOM_TUNING.reactions.feudDelayMs : ROOM_TUNING.bidDelayMs
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
function maybeStartFeud(room: DemoRoom): void {
  if (room.feud || room.leader === null) return
  const activeDealers = room.dealers.filter((dealer) => dealer.active)
  if (activeDealers.length < 2) return
  const forced = room.armedReaction === 'feud'
  if (!forced) {
    const gapRungs = (room.clearingYen - room.boardYen) / room.incrementYen
    if (gapRungs < ROOM_TUNING.reactions.feudMinGapRungs) return
    const u = room.rng()
    if (u >= ROOM_TUNING.reactions.feudChance) return
  }
  const [a, b] = activeDealers
  room.feud = { names: [a!.name, b!.name], remaining: ROOM_TUNING.reactions.feudRungs }
  room.log.push(`${a!.name} and ${b!.name} have history. This just became personal.`)
  if (forced) room.armedReaction = null
}

/**
 * Advances the room to nowMs. Lands any due room raise at its scheduled instant
 * (the fuse resets from that instant, not from the tick that observed it), then
 * falls the hammer once the fuse burns out; a single large time step therefore
 * fast-forwards a whole dealer-versus-dealer climb correctly.
 */
export function tick(room: DemoRoom, nowMs: number): void {
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
 * raise, or clears it when the next rung tops the clearing price (the room is
 * beaten and will not counter). A leading bid cannot be withdrawn, so this
 * no-ops while the player already leads.
 *
 * A non-opening bid landed inside the last `snipeWindowMs` of the fuse counts
 * as a snipe. A non-opening raise of `jumpRungs` rungs or more reads as a
 * jump and draws the jump reactions (see the draw-order law on `enterRoom`);
 * a plain rung-one raise with no jump draws none of those, but every raise,
 * jump or not, still schedules the room's response through `scheduleRoomBid`,
 * which spends its own feud-eligibility draw regardless.
 */
export function playerBid(room: DemoRoom, nowMs: number, rungs = 1): void {
  if (room.status !== 'open' || room.leader === 'player') return
  const opening = room.leader === null
  if (!opening && room.clockEndsAtMs - nowMs < ROOM_TUNING.reactions.snipeWindowMs) {
    room.snipeCount++
  }
  const isJump = !opening && rungs >= ROOM_TUNING.reactions.jumpRungs
  room.boardYen = opening ? room.reserveYen : room.boardYen + rungs * room.incrementYen
  room.leader = 'player'
  room.leaderName = null
  room.lastBid = { by: 'player', atMs: nowMs }
  room.log.push(
    opening ? `You open: ${formatYen(room.boardYen)}.` : `You raise: ${formatYen(room.boardYen)}.`,
  )
  if (isJump) applyJumpReactions(room)
  runDrops(room)
  room.clockEndsAtMs = nowMs + ROOM_TUNING.clockMs
  scheduleRoomBid(room, nowMs)
}

/**
 * Fires the scare: the clearing price collapses to the board plus
 * scareLeftRungs increments, a fixed formula with no magnitude draw of its
 * own.
 */
function fireScare(room: DemoRoom): void {
  const r = ROOM_TUNING.reactions
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
function fireGoad(room: DemoRoom, latch: boolean): void {
  const r = ROOM_TUNING.reactions
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
 * room, reacting to the player's behaviour (inspected and jumped), never to
 * the player's own number, which is never read here.
 *
 * A jump armed with 'goad', 'scare', or 'call' (see `armReaction`) preempts
 * this whole draw sequence: the forced reaction fires without a chance draw
 * and the arm clears, except a forced call still checks the fits-under-
 * clearing condition and, when it cannot fit, leaves the arm armed and does
 * nothing else this jump (scare and goad stay skipped either way). An arm of
 * 'tax' or 'feud' does not apply to a jump and falls through to the normal
 * draws below.
 */
function applyJumpReactions(room: DemoRoom): void {
  const r = ROOM_TUNING.reactions
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
 * The player passes. Before any bid the lot rolls back unsold; with the room
 * leading it hammers to the leading dealer at the board. No-op while the player
 * leads.
 */
export function letGo(room: DemoRoom): void {
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
 */
function landRoomBid(room: DemoRoom, atMs: number): void {
  const r = ROOM_TUNING.reactions
  const opening = room.leader === null
  let rungs = 1
  let kind: 'normal' | 'called' | 'taxed' = 'normal'
  let name: string

  if (!opening && room.feud) {
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
          ? `${name} is done waiting on the clock: straight to ${formatYen(room.boardYen)}.`
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
  room.clockEndsAtMs = atMs + ROOM_TUNING.clockMs
  scheduleRoomBid(room, atMs)
}

/** The next dealer to be credited with a room raise: the cursor walks on to the
 * next still-active dealer, so a raise is never attributed to a dropped one. */
function advanceToNextActiveDealer(room: DemoRoom): number {
  const n = room.dealers.length
  for (let step = 0; step < n; step++) {
    room.bidderCursor = (room.bidderCursor + 1) % n
    if (room.dealers[room.bidderCursor]!.active) return room.bidderCursor
  }
  return room.bidderCursor
}

/** How many dealers should still be lit at the current board: the crowd thins
 * evenly from full at the reserve to a single holdout at the clearing price. */
function targetActive(room: DemoRoom): number {
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
function runDrops(room: DemoRoom): void {
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
function hammer(room: DemoRoom): void {
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
 * profit, or a loss if the player chased past that worth. A dealer taking a
 * trap reassures (let the room overpay); a dealer taking a steal or a fair lot
 * stings a little. A no-sale before any bid keeps only the roll-back line.
 */
function epilogueFor(room: DemoRoom): string | null {
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
export function dealersInRoom(room: DemoRoom): number {
  return room.dealers.filter((dealer) => dealer.active).length
}

/** The rung the player's next bid lands on: the reserve unopened, else one up. */
export function nextRungYen(room: DemoRoom): number {
  return room.leader === null ? room.reserveYen : room.boardYen + room.incrementYen
}
