import type {
  AuctionLot,
  CarInstance,
  CarModel,
  CarPartId,
  ConditionBand,
  GameState,
} from '@midnight-garage/content'
import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  resolveCarDisplayName,
} from '@midnight-garage/content'
import {
  carOriginLabel,
  hasForcedInduction,
  makeCarOrigin,
  playerEstimateYen,
  sheetGuideValueYen,
  stockInstanceFor,
  type SimContext,
} from '@midnight-garage/sim'
import {
  incrementYenFor,
  roomConfigFrom,
  type Learned,
  type RoomVerdict,
  type TurnoutKey,
} from './auctionRoom'

/**
 * The dev-only tuning bench for the live auction room (AuctionRoomDemoScreen.vue):
 * dresses two hand-picked demo lots (a thin-room steal and a packed-room
 * trap) as lobby cards, then seats the shared room machine (`./auctionRoom.ts`)
 * from the demo's own tuning config and seed convention. Nothing here reads
 * or writes saves, the auction board, or any live sim state.
 *
 * The two lots are NAMED, not discovered: a fixed car, symptom and true
 * cause each (`buildStealLot`/`buildTrapLot` below), built by the same real
 * generation primitives a rolled auction car uses (`stockInstanceFor`,
 * `carOriginLabel`/`makeCarOrigin`) off the live content catalogue. Earlier
 * versions of this module instead SEARCHED a fixed-seed generated catalogue
 * of thousands of lots for a pair clearing a "clear steal"/"genuine trap"
 * bar - car generation consumes the seeded PRNG a variable number of times
 * per lot (`spendDamageBudget`, sim/auctions.ts, loops once per band step of
 * the lot's rolled damage budget), so ANY part-price change anywhere reshuffled
 * the whole catalogue and a different car won the search. That search broke
 * this module's own tests three sprints running (140, 141, 142) - twice on a
 * pinned yen figure moving, once on the selected car's SYMPTOMS changing
 * under it, failing every diagnostic-button test that clicked a symptom the
 * new car didn't have. Naming the two lots outright removes the search
 * entirely: which car, which symptom and which true cause are fixed in code
 * below; every yen for them is still computed by the real valuation code
 * (`sheetGuideValueYen`, `playerEstimateYen`) off the live content catalogue,
 * so a repricing moves this module's numbers exactly as it would move a real
 * lot's, without ever picking a different car or a different symptom.
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

/** A lot whose true worth falls below this fraction of the read reads as a
 * genuine trap the packed room can overpay for - the bar the demo trap lot's
 * own fixture test (`auctionRoomDemo.test.ts`) checks it clears, rather than
 * hardcoding a second copy of this number. */
export const TRAP_VALUE_FRACTION = 0.9
/** How far the truth must part from the read, either way, to read as better or
 * worse than the room reckons. Also the production auction room's own
 * threshold (`AuctionRoomScreen.vue` imports `verdictFor` straight from this
 * module) - never a demo-only number. */
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

/** One part's apparent (room-visible) condition, keyed by `CarPartId` - every
 * part left unnamed reads `'fine'`, an ordinary, tidy used car. */
type ApparentBandOverrides = Partial<Record<CarPartId, ConditionBand>>

/**
 * Builds one demo lot's `CarInstance` by hand, off real content: a named
 * model, a named symptom and a named true cause (`symptoms.json`/
 * `failureModes.json`), with every part fitted from the model's own real
 * stock catalogue (`stockInstanceFor`, the SAME builder real auction
 * generation calls) at its apparent condition - `'fine'` by default,
 * `apparentOverrides` where the room's own paperwork should read worse. The
 * symptom starts fresh: every one of its causes still a live candidate
 * (`remainingCauseIds`), nothing yet tested - exactly the shape a
 * newly-rolled lot carries. No RNG runs at any point, so which car, which
 * symptom and which true cause never drift: only the yen a repricing moves.
 */
function buildDemoCarInstance(
  model: CarModel,
  context: SimContext,
  symptomId: string,
  trueCauseId: string,
  id: string,
  apparentOverrides: ApparentBandOverrides = {},
): CarInstance {
  const symptom = context.symptomsById[symptomId]
  if (!symptom) throw new Error(`auction room demo: content has no symptom "${symptomId}"`)
  const trueCause = symptom.causes.find((cause) => cause.id === trueCauseId)
  if (!trueCause) {
    throw new Error(`auction room demo: symptom "${symptomId}" has no cause "${trueCauseId}"`)
  }
  const fitmentClass = fitmentClassForTier(model.tier)
  const year = model.spec.yearFrom + 3
  const origin = makeCarOrigin(id, carOriginLabel(model, year), 1)
  const apparentBandByPartId: Partial<Record<CarPartId, ConditionBand>> = {}
  apparentBandByPartId[trueCause.carPartId] = apparentOverrides[trueCause.carPartId] ?? 'fine'
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      // A naturally-aspirated model's empty forced-induction slot is
      // legitimate, permanent absence, never a defect - `hasForcedInduction`
      // is the one platform check every generator and grade reader shares.
      if (partId === 'forcedInduction' && !hasForcedInduction(model)) {
        return [partId, { installed: null }]
      }
      const apparentBand = apparentOverrides[partId] ?? 'fine'
      const band = partId === trueCause.carPartId ? trueCause.setBand : apparentBand
      return [
        partId,
        {
          installed: stockInstanceFor(
            partId,
            band,
            `${id}-part`,
            fitmentClass,
            context.stockPartByCarPartId,
            origin,
          ),
        },
      ]
    }),
  ) as CarInstance['parts']
  return {
    id,
    modelId: model.id,
    year,
    mileageKm: 60_000,
    factoryColour: model.spec.factoryColours[0]!,
    provenanceNote: '',
    parts,
    symptoms: [
      {
        symptomId,
        trueCauseId,
        remainingCauseIds: symptom.causes.map((cause) => cause.id),
        runTestIds: [],
      },
    ],
    apparentBandByPartId,
  }
}

/**
 * The steal: a Honda City E (AA) with a damp passenger footwell. Five causes
 * share that one symptom (`damp-passenger-footwell`), from a cheap perished
 * grommet up to a rotten bulkhead seam - so the room, pricing the odds
 * across all five, reads it cautiously. The chassis slot's apparent
 * condition is pinned to `'scrap'`: the room's own paperwork flags this car
 * a likely write-off (the auction grade's own 'R' mark), same as an
 * independently rotten chassis would read on any car, symptom or not. The
 * true cause is pinned to `perished-grommet`, the cheapest of the five and
 * nowhere near that fear - so once the visit narrows the doubt all the way
 * down, the chassis turns out merely `'poor'`, not scrap, and the estimate
 * jumps well clear of the room's number. Against the live content the true
 * value clears the room's read by roughly 17% (ratio 1.166), more than double
 * `VERDICT_BAND_FRACTION`'s 8% bar, so an ordinary repricing cannot flip the
 * verdict.
 */
const STEAL_MODEL_ID = 'honda-city-e-aa'
const STEAL_SYMPTOM_ID = 'damp-passenger-footwell'
const STEAL_TRUE_CAUSE_ID = 'perished-grommet'

function buildStealLot(context: SimContext): AuctionLot {
  const model = context.modelsById[STEAL_MODEL_ID]
  if (!model) throw new Error(`auction room demo: content has no car "${STEAL_MODEL_ID}"`)
  const id = 'demo-steal-lot'
  const car = buildDemoCarInstance(
    model,
    context,
    STEAL_SYMPTOM_ID,
    STEAL_TRUE_CAUSE_ID,
    `${id}-car`,
    { chassis: 'scrap' },
  )
  return {
    id,
    tier: 'local-yard',
    modelId: model.id,
    car,
    bookValueYen: model.bookValueYen,
    expiresOnDay: 9_999,
    turnout: 'thin',
  }
}

/**
 * The trap: a Nissan Sunny (B12) that runs hot in traffic
 * (`overheats-in-traffic`). Its cheapest three causes (a lazy fan switch, a
 * tired radiator, an early head-gasket weep) carry most of the symptom's
 * weight, so the room's odds-priced read comes in comfortably high; the true
 * cause is pinned to `cracked-block`, the one cause in ten the room still has
 * to price in, and by far the dearest - a full block, not a service item.
 * Every part apart from the block reads at its ordinary, undamaged
 * condition, so the room never suspects anything before the visit; only
 * once the doubt narrows all the way down does the estimate crash to the
 * true, dear cause. Against the live content the true value undercuts the
 * room's read by roughly 18% (ratio 0.822), comfortably past both
 * `TRAP_VALUE_FRACTION`'s 90% floor and `VERDICT_BAND_FRACTION`'s 8% bar.
 */
const TRAP_MODEL_ID = 'nissan-sunny-b12'
const TRAP_SYMPTOM_ID = 'overheats-in-traffic'
const TRAP_TRUE_CAUSE_ID = 'cracked-block'

function buildTrapLot(context: SimContext): AuctionLot {
  const model = context.modelsById[TRAP_MODEL_ID]
  if (!model) throw new Error(`auction room demo: content has no car "${TRAP_MODEL_ID}"`)
  const id = 'demo-trap-lot'
  const car = buildDemoCarInstance(model, context, TRAP_SYMPTOM_ID, TRAP_TRUE_CAUSE_ID, `${id}-car`)
  return {
    id,
    tier: 'local-yard',
    modelId: model.id,
    car,
    bookValueYen: model.bookValueYen,
    expiresOnDay: 9_999,
    turnout: 'packed',
  }
}

/**
 * Rolls the two demo lots purely (no store writes) and dresses them as lobby
 * cards: the steal in a thin room, the trap in a packed one. Every yen rides
 * the real estimator; the crowd size and bid step come from the live
 * `economy.auctionRoom` content block, so a given game state always produces
 * the same two cards.
 */
export function buildDemoLobby(state: GameState, context: SimContext): DemoLobbyEntry[] {
  const lotByKey: Record<'thin' | 'packed', AuctionLot> = {
    thin: buildStealLot(context),
    packed: buildTrapLot(context),
  }
  const roomConfig = roomConfigFrom(context.economy)
  return ROOM_ORDER.map((key) => {
    const lot = lotByKey[key]
    const model = context.modelsById[lot.modelId]
    const roomReadYen = roomReadYenFor(lot, state, context)
    const trueValueYen = trueValueYenFor(lot, state, context)
    return {
      key,
      displayName: model ? resolveCarDisplayName(model) : lot.modelId,
      roomReadYen,
      trueValueYen,
      verdict: verdictFor(roomReadYen, trueValueYen),
      incrementYen: incrementYenFor(roomReadYen, roomConfig),
      dealerCount: roomConfig.turnout[key].dealers,
      lot,
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
