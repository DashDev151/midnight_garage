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
  turnout: {
    thin: { dealers: 2, clearMin: 0.7, clearMax: 0.85 },
    packed: { dealers: 6, clearMin: 0.75, clearMax: 0.95 },
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
 * is law: the clearing fraction first (u then t), then one delay per scheduled
 * room raise. The reserve and clearing price ride the tuning and the read, not
 * what the player learned. The player's number, verdict, and true worth ride
 * `learned`, so a half-blind player brings a number off the room read. The
 * opening room raise is scheduled from nowMs like any raise.
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
  }
  scheduleRoomBid(room, nowMs)
  return room
}

/**
 * Schedules the next room raise from `fromMs`, unless the next rung would top
 * the clearing price, in which case the floor has maxed out and nothing more is
 * scheduled: the fuse then hammers to whoever leads. The delay is a seeded
 * uniform draw inside the tuning band, always shorter than the fuse.
 */
function scheduleRoomBid(room: DemoRoom, fromMs: number): void {
  const rung = room.leader === null ? room.reserveYen : room.boardYen + room.incrementYen
  if (rung > room.clearingYen) {
    room.pendingRoomBid = null
    return
  }
  const delay = Math.round(
    ROOM_TUNING.bidDelayMs.min +
      room.rng() * (ROOM_TUNING.bidDelayMs.max - ROOM_TUNING.bidDelayMs.min),
  )
  room.pendingRoomBid = { atMs: fromMs + delay }
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
 * The player's bid: the reserve if nobody has bid yet, one increment above the
 * board otherwise. The raise interrupts and reschedules any pending room raise,
 * or clears it when the next rung tops the clearing price (the room is beaten
 * and will not counter). A leading bid cannot be withdrawn, so this no-ops while
 * the player already leads.
 */
export function playerBid(room: DemoRoom, nowMs: number): void {
  if (room.status !== 'open' || room.leader === 'player') return
  const opening = room.leader === null
  room.boardYen = opening ? room.reserveYen : room.boardYen + room.incrementYen
  room.leader = 'player'
  room.leaderName = null
  room.lastBid = { by: 'player', atMs: nowMs }
  room.log.push(
    opening ? `You open: ${formatYen(room.boardYen)}.` : `You raise: ${formatYen(room.boardYen)}.`,
  )
  runDrops(room)
  room.clockEndsAtMs = nowMs + ROOM_TUNING.clockMs
  scheduleRoomBid(room, nowMs)
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

/** A scheduled room raise lands at its instant: the next dealer name takes the
 * board, the fuse resets, the room thins, and the next raise is scheduled. */
function landRoomBid(room: DemoRoom, atMs: number): void {
  const opening = room.leader === null
  const name = room.dealers[advanceToNextActiveDealer(room)]!.name
  room.boardYen = opening ? room.reserveYen : room.boardYen + room.incrementYen
  room.leader = 'room'
  room.leaderName = name
  room.lastBid = { by: name, atMs }
  room.log.push(
    opening
      ? `${name} opens: ${formatYen(room.boardYen)}.`
      : `${name} raises: ${formatYen(room.boardYen)}.`,
  )
  runDrops(room)
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
