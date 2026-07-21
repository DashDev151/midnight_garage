import type { AuctionLot, CarInstance, GameState } from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  createRng,
  generateAuctionCatalog,
  playerEstimateYen,
  sheetGuideValueYen,
  type SimContext,
} from '@midnight-garage/sim'
import { incrementYenFor, type Learned, type RoomVerdict, type TurnoutKey } from './auctionRoom'

/**
 * The dev-only tuning bench for the live auction room (AuctionRoomDemoScreen.vue):
 * picks two fixed demo lots off the real generated catalogue (a thin-room
 * steal and a packed-room trap) and dresses them as lobby cards, then seats
 * the shared room machine (`./auctionRoom.ts`) from the demo's own tuning
 * config and seed convention. Nothing here reads or writes saves, the
 * auction board, or any live sim state; the two lots are rolled once per
 * screen mount off a fixed catalogue seed, so a given game state always
 * produces the same pair.
 *
 * The room read is the fair-odds value the live auction sheet prints
 * (`sheetGuideValueYen`); the true worth is the estimator with every symptom
 * resolved to its actual rolled cause (`playerEstimateYen` over a fully
 * narrowed copy of the car), which can sit above or below the read. Every
 * yen the demo shows comes from the real estimator through a choice of
 * which causes it prices, never a parallel calculation.
 */

export type DemoVerdict = RoomVerdict
export type DemoLearned = Learned

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

/** Demo-local cash the yard visit is paid from; the real fee, labour, and
 * minutes come from economy.json. The shared room machine carries no
 * bankroll of its own. */
export const DEMO_BANKROLL_YEN = 250_000

/** The steal takes the thin room, the trap the packed one: a crowd visibly
 * tempts the player to chase the car that is worth less than it looks. */
const ROOM_ORDER: readonly ('thin' | 'packed')[] = ['thin', 'packed']

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
 * the real estimator; the crowd size and bid step come from the live
 * `economy.auctionRoom` content block, so a given game state always produces
 * the same two cards.
 */
export function buildDemoLobby(state: GameState, context: SimContext): DemoLobbyEntry[] {
  const { steal, trap } = selectDemoLots(state, context)
  const scoredByKey: Record<'thin' | 'packed', ScoredLot> = { thin: steal, packed: trap }
  const roomConfig = context.economy.auctionRoom
  return ROOM_ORDER.map((key) => {
    const scored = scoredByKey[key]
    const model = context.modelsById[scored.lot.modelId]
    return {
      key,
      displayName: model ? resolveCarDisplayName(model) : scored.lot.modelId,
      roomReadYen: scored.roomReadYen,
      trueValueYen: scored.trueValueYen,
      verdict: verdictFor(scored.roomReadYen, scored.trueValueYen),
      incrementYen: incrementYenFor(scored.roomReadYen, roomConfig),
      dealerCount: roomConfig.turnout[key].dealers,
      lot: scored.lot,
    }
  })
}

/**
 * The learned numbers of a bidder who looked all the way to the true cause:
 * the entry's own fully-resolved reveal, with no margin taken off it. Used
 * when a room is seated with nothing more specific to learn from.
 */
export function fullyLookedLearned(entry: DemoLobbyEntry): DemoLearned {
  return {
    playerNumberYen: entry.trueValueYen,
    verdict: entry.verdict,
    trueValueYen: entry.trueValueYen,
    inspected: true,
  }
}

/** The demo's own seed convention: one seeded stream per (turnout key, run
 * index) pair, so "run it back" reseeds deterministically per attempt. */
export function demoRoomSeed(key: TurnoutKey, runIndex: number): string {
  return `auction-room-demo:${key}:run${runIndex}`
}
