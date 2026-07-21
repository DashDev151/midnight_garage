import { createRng, hashStringToSeed, playerEstimateYen } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import {
  ROOM_TUNING,
  buildDemoLobby,
  clearingFractionFor,
  dealersInRoom,
  enterRoom,
  letGo,
  nextRungYen,
  playerBid,
  tick,
  verdictFor,
  type DemoDealer,
  type DemoLobbyEntry,
  type DemoRoom,
} from './auctionRoomDemo'

function buildLobby(): DemoLobbyEntry[] {
  const game = useGameStore()
  return buildDemoLobby(game.gameState, game.context)
}

/** A hand-built room for targeted bid, fuse, and epilogue assertions. */
function bareRoom(
  dealers: DemoDealer[],
  reserve: number,
  increment: number,
  clearing: number,
): DemoRoom {
  return {
    key: 'thin',
    displayName: 'test lot',
    roomReadYen: reserve,
    trueValueYen: reserve,
    playerNumberYen: reserve,
    verdict: 'fair',
    reserveYen: reserve,
    incrementYen: increment,
    clearingYen: clearing,
    boardYen: reserve,
    leader: null,
    leaderName: null,
    status: 'open',
    dealers,
    dropCount: 0,
    bidderCursor: dealers.length - 1,
    log: [],
    epilogue: null,
    clockEndsAtMs: ROOM_TUNING.clockMs,
    pendingRoomBid: null,
    lastBid: null,
    rng: () => 0.5,
  }
}

/** A stub stream that hands out queued values in order, for the clearing draw. */
function queueStream(values: number[]): { next: () => number } {
  let i = 0
  return { next: () => values[i++]! }
}

describe('auctionRoomDemo machine', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('selects the highest-ratio lot (thin) and the single genuine trap (packed) from the fixed catalogue', () => {
    const [thin, packed] = buildLobby()

    expect(thin!.key).toBe('thin')
    expect(thin!.displayName).toBe('Honda CR-X SiR (EF8)')
    expect(thin!.roomReadYen).toBe(366_988)
    expect(thin!.trueValueYen).toBe(385_126)
    expect(thin!.incrementYen).toBe(5_000)
    expect(thin!.dealerCount).toBe(2)
    expect(thin!.verdict).toBe('fair')
    expect(thin!.trueValueYen / thin!.roomReadYen).toBeCloseTo(1.0494, 4)

    expect(packed!.key).toBe('packed')
    expect(packed!.displayName).toBe('Honda CR-X SiR (EF8)')
    expect(packed!.roomReadYen).toBe(252_041)
    expect(packed!.trueValueYen).toBe(224_415)
    expect(packed!.incrementYen).toBe(5_000)
    expect(packed!.dealerCount).toBe(6)
    expect(packed!.verdict).toBe('worse')
    expect(packed!.trueValueYen / packed!.roomReadYen).toBeCloseTo(0.8904, 4)

    // The thin lot edges just above the read (a slim, fair margin); the trap
    // sits below the trap band of the read.
    expect(thin!.trueValueYen).toBeGreaterThan(thin!.roomReadYen)
    expect(packed!.trueValueYen).toBeLessThan(packed!.roomReadYen * 0.9)
    expect(thin!.lot.id).not.toBe(packed!.lot.id)
  })

  it('carries the player number at the true worth for a fully-looked room', () => {
    const [thin, packed] = buildLobby()
    // A full look knows the true worth, so the player's number is the value
    // itself, with no margin taken off it.
    expect(enterRoom(thin!, 0, 0).playerNumberYen).toBe(thin!.trueValueYen)
    expect(enterRoom(packed!, 0, 0).playerNumberYen).toBe(packed!.trueValueYen)
  })

  it('reads verdicts from the gap across all three bands', () => {
    // Better than feared once the truth beats the read by the band (>= +8%).
    expect(verdictFor(100_000, 120_000)).toBe('better')
    expect(verdictFor(100_000, 108_000)).toBe('better')
    expect(verdictFor(100_000, 107_999)).toBe('fair')
    // Worse than it looks once the truth trails the read by the band (<= -8%).
    expect(verdictFor(100_000, 80_000)).toBe('worse')
    expect(verdictFor(100_000, 92_000)).toBe('worse')
    expect(verdictFor(100_000, 92_001)).toBe('fair')
    // Fair within the band either way.
    expect(verdictFor(100_000, 100_000)).toBe('fair')
  })

  it('draws one clearing price per room inside the turnout band at the fixed seed', () => {
    const [thin, packed] = buildLobby()

    const thinRoom = enterRoom(thin!, 0, 0)
    expect(thinRoom.reserveYen).toBe(201_843)
    expect(thinRoom.clearingYen).toBe(282_876)
    // The clearing price is one seeded fraction of the read; recompute it off a
    // fresh stream at the same seed to pin the draw exactly.
    const thinFraction = clearingFractionFor(
      createRng(hashStringToSeed('auction-room-demo:thin:run0')),
      'thin',
    )
    expect(thinRoom.clearingYen).toBe(
      Math.max(thinRoom.reserveYen, Math.round(thin!.roomReadYen * thinFraction)),
    )
    const thinRatio = thinRoom.clearingYen / thin!.roomReadYen
    expect(thinRatio).toBeGreaterThanOrEqual(ROOM_TUNING.turnout.thin.clearMin)
    expect(thinRatio).toBeLessThanOrEqual(ROOM_TUNING.turnout.thin.clearMax)

    const packedRoom = enterRoom(packed!, 0, 0)
    expect(packedRoom.reserveYen).toBe(138_623)
    expect(packedRoom.clearingYen).toBe(225_152)
    const packedFraction = clearingFractionFor(
      createRng(hashStringToSeed('auction-room-demo:packed:run0')),
      'packed',
    )
    expect(packedRoom.clearingYen).toBe(
      Math.max(packedRoom.reserveYen, Math.round(packed!.roomReadYen * packedFraction)),
    )
    const packedRatio = packedRoom.clearingYen / packed!.roomReadYen
    expect(packedRatio).toBeGreaterThanOrEqual(ROOM_TUNING.turnout.packed.clearMin)
    expect(packedRatio).toBeLessThanOrEqual(ROOM_TUNING.turnout.packed.clearMax)
  })

  it('draws a cold-room bargain below the turnout floor when the room is cold', () => {
    // u under the bargain chance, then t: the fraction lands between the reserve
    // fraction and the turnout floor.
    const cold = clearingFractionFor(queueStream([0.04, 0.9]), 'thin')
    expect(cold).toBeGreaterThanOrEqual(ROOM_TUNING.reserveFraction)
    expect(cold).toBeLessThanOrEqual(ROOM_TUNING.turnout.thin.clearMin)
    // u at or above the chance: a normal room clears inside the turnout band.
    const warm = clearingFractionFor(queueStream([0.5, 0.9]), 'thin')
    expect(warm).toBeGreaterThanOrEqual(ROOM_TUNING.turnout.thin.clearMin)
    expect(warm).toBeLessThanOrEqual(ROOM_TUNING.turnout.thin.clearMax)
  })

  it('seats the run-0 thin room from the clearing draw with the reveal fields', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)

    expect(room.dealers).toEqual([
      { name: 'Endo', active: true },
      { name: 'Mrs. Sakaki', active: true },
    ])
    expect(room.reserveYen).toBe(201_843)
    expect(room.boardYen).toBe(201_843)
    expect(room.clearingYen).toBe(282_876)
    expect(room.leader).toBeNull()
    expect(room.leaderName).toBeNull()
    expect(room.status).toBe('open')
    expect(room.clockEndsAtMs).toBe(ROOM_TUNING.clockMs)
    expect(room.log).toEqual(['The clerk looks over the room. Reserve is ¥201,843.'])
    expect(room.pendingRoomBid).toEqual({ atMs: 2265 })
    expect(nextRungYen(room)).toBe(201_843)

    expect(room.roomReadYen).toBe(366_988)
    expect(room.trueValueYen).toBe(385_126)
    expect(room.playerNumberYen).toBe(385_126)
    expect(room.verdict).toBe('fair')
    expect(room.epilogue).toBeNull()
  })

  it('seats the run-0 packed room with six flavour dealers and its own clearing draw', () => {
    const room = enterRoom(buildLobby()[1]!, 0, 0)
    expect(room.dealers.map((dealer) => dealer.name)).toEqual([
      'Endo',
      'Mrs. Sakaki',
      'Ogata',
      'Toyoshima',
      'Ubukata',
      'a quiet man in a good coat',
    ])
    expect(room.dealers.every((dealer) => dealer.active)).toBe(true)
    expect(room.reserveYen).toBe(138_623)
    expect(room.boardYen).toBe(138_623)
    expect(room.clearingYen).toBe(225_152)
    expect(room.pendingRoomBid).toEqual({ atMs: 2645 })
    expect(room.playerNumberYen).toBe(224_415)
  })

  it('lands the opener at its scheduled instant and resets the fuse from it', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    tick(room, 3000)

    expect(room.leader).toBe('room')
    expect(room.leaderName).toBe('Endo')
    expect(room.boardYen).toBe(201_843)
    expect(room.lastBid).toEqual({ by: 'Endo', atMs: 2265 })
    expect(room.log).toContain('Endo opens: ¥201,843.')
    expect(room.clockEndsAtMs).toBe(2265 + ROOM_TUNING.clockMs)
    expect(room.pendingRoomBid).toEqual({ atMs: 4522 })
    expect(nextRungYen(room)).toBe(206_843)
  })

  it('climbs the thin room dealer against dealer to the clearing price and hammers there', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    tick(room, 3_600_000)

    expect(room.status).toBe('lost')
    expect(room.boardYen).toBe(281_843)
    // The board settles on the last rung at or under the clearing price.
    expect(room.boardYen).toBeLessThanOrEqual(room.clearingYen)
    expect(room.boardYen + room.incrementYen).toBeGreaterThan(room.clearingYen)
    expect(room.leaderName).toBe('Endo')
    expect(room.log.at(-1)).toBe('Hammer. Endo takes it at ¥281,843.')
    expect(dealersInRoom(room)).toBe(1)
    expect(room.epilogue).toBe('You let it go. Someone got a bargain there.')
  })

  it('plays the packed war to its clearing price, thinning the room as it climbs', () => {
    const room = enterRoom(buildLobby()[1]!, 0, 0)
    tick(room, 3_600_000)

    expect(room.status).toBe('lost')
    expect(room.boardYen).toBe(223_623)
    expect(room.boardYen).toBeLessThanOrEqual(room.clearingYen)
    expect(room.boardYen + room.incrementYen).toBeGreaterThan(room.clearingYen)
    expect(room.leaderName).toBe('Endo')
    expect(room.log.at(-1)).toBe('Hammer. Endo takes it at ¥223,623.')
    expect(dealersInRoom(room)).toBe(1)
    expect(room.epilogue).toBe('You let it go. The room can overpay for that one.')

    const joined = room.log.join('\n')
    const drops = [
      'a quiet man in a good coat closes the folder.',
      'Ubukata sets the paddle down.',
      'Toyoshima steps out for a smoke.',
      'Mrs. Sakaki checks the time and is done.',
      'Ogata closes the folder.',
    ]
    let lastIndex = -1
    for (const drop of drops) {
      const index = joined.indexOf(drop)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('lets the player win by topping the clearing price', () => {
    const room = bareRoom(
      [
        { name: 'Endo', active: true },
        { name: 'Mrs. Sakaki', active: true },
      ],
      200_000,
      15_000,
      205_000,
    )
    room.trueValueYen = 300_000
    room.verdict = 'better'
    room.playerNumberYen = 300_000

    // The room opens on the reserve.
    room.pendingRoomBid = { atMs: 100 }
    tick(room, 100)
    expect(room.leader).toBe('room')
    expect(room.leaderName).toBe('Endo')
    expect(room.boardYen).toBe(200_000)

    // The player tops it past the clearing price; the beaten room cannot counter.
    playerBid(room, 200)
    expect(room.leader).toBe('player')
    expect(room.leaderName).toBeNull()
    expect(room.boardYen).toBe(215_000)
    expect(room.boardYen).toBeGreaterThan(room.clearingYen)
    expect(room.pendingRoomBid).toBeNull()

    tick(room, 200 + ROOM_TUNING.clockMs)
    expect(room.status).toBe('won')
    expect(room.log.at(-1)).toBe('Hammer. Yours at ¥215,000. The room moves on.')
    expect(room.epilogue).toBe('You flip it for ¥300,000. ¥85,000 clear.')
  })

  it('reads the next rung against the player number for the past-your-number marker', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 15_000, 500_000)
    room.playerNumberYen = 130_000
    room.leader = 'room'
    room.leaderName = 'Endo'

    room.boardYen = 110_000
    expect(nextRungYen(room)).toBe(125_000)
    expect(nextRungYen(room) > room.playerNumberYen).toBe(false)

    room.boardYen = 120_000
    expect(nextRungYen(room)).toBe(135_000)
    expect(nextRungYen(room) > room.playerNumberYen).toBe(true)
  })

  it('never hammers before the fuse burns out', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100, 10, 100)
    room.leader = 'player'
    room.boardYen = 100
    room.clockEndsAtMs = ROOM_TUNING.clockMs

    tick(room, ROOM_TUNING.clockMs - 1)
    expect(room.status).toBe('open')

    tick(room, ROOM_TUNING.clockMs)
    expect(room.status).toBe('won')
    expect(room.log.at(-1)).toBe('Hammer. Yours at ¥100. The room moves on.')
  })

  it('resolving the trap to its true cause prices the player estimate at the true worth, verdict worse', () => {
    const game = useGameStore()
    const packed = buildLobby()[1]!
    const lot = packed.lot
    const model = game.context.modelsById[lot.modelId]!
    // Narrowing the doubt all the way to its rolled true cause is exactly what
    // the true worth prices, so the player's own estimate lands on it.
    const resolvedCar = {
      ...lot.car,
      symptoms: lot.car.symptoms.map((s) => ({ ...s, remainingCauseIds: [s.trueCauseId] })),
    }
    const estimate = Math.round(playerEstimateYen(resolvedCar, model, game.gameState, game.context))
    expect(estimate).toBe(packed.trueValueYen)
    expect(verdictFor(packed.roomReadYen, estimate)).toBe('worse')
  })

  it('epilogue: winning under the true worth flips for a clear profit', () => {
    const room = bareRoom([{ name: 'A', active: true }], 100, 10, 100)
    room.trueValueYen = 300_000
    room.verdict = 'better'
    room.leader = 'player'
    room.boardYen = 240_000
    tick(room, ROOM_TUNING.clockMs)

    expect(room.status).toBe('won')
    expect(room.epilogue).toBe('You flip it for ¥300,000. ¥60,000 clear.')
  })

  it('epilogue: chasing past the true worth flips at a loss', () => {
    const room = bareRoom([{ name: 'A', active: true }], 100, 10, 100)
    room.trueValueYen = 300_000
    room.verdict = 'better'
    room.leader = 'player'
    room.boardYen = 340_000
    tick(room, ROOM_TUNING.clockMs)

    expect(room.status).toBe('won')
    expect(room.epilogue).toBe('You flip it for ¥300,000. ¥40,000 down, one to learn from.')
  })

  it('epilogue: letting a trap go reassures, letting a steal go stings', () => {
    const trap = bareRoom([{ name: 'A', active: true }], 50, 10, 200)
    trap.leader = 'room'
    trap.leaderName = 'A'
    trap.boardYen = 60
    trap.verdict = 'worse'
    letGo(trap)
    expect(trap.status).toBe('lost')
    expect(trap.epilogue).toBe('You let it go. The room can overpay for that one.')

    const steal = bareRoom([{ name: 'A', active: true }], 50, 10, 200)
    steal.leader = 'room'
    steal.leaderName = 'A'
    steal.boardYen = 60
    steal.verdict = 'better'
    letGo(steal)
    expect(steal.status).toBe('lost')
    expect(steal.epilogue).toBe('You let it go. Someone got a bargain there.')
  })

  it('epilogue: a no-sale before any bid carries no closing line', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    letGo(room)
    expect(room.status).toBe('no-sale')
    expect(room.log.at(-1)).toBe('Nobody moves. The lot rolls back.')
    expect(room.epilogue).toBeNull()
  })

  it('reschedules the pending room raise when the player opens', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    expect(room.pendingRoomBid).toEqual({ atMs: 2265 })

    playerBid(room, 100)
    expect(room.leader).toBe('player')
    expect(room.leaderName).toBeNull()
    expect(room.boardYen).toBe(201_843)
    expect(room.lastBid).toEqual({ by: 'player', atMs: 100 })
    expect(room.log).toContain('You open: ¥201,843.')
    expect(room.clockEndsAtMs).toBe(100 + ROOM_TUNING.clockMs)
    // The next rung is still under the clearing price, so the room counters:
    // the pending raise is rescheduled off the player's bid, not cleared.
    expect(room.pendingRoomBid).toEqual({ atMs: 2357 })
  })

  it('no-ops a player bid while the player already leads', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    playerBid(room, 100)
    const logLength = room.log.length

    playerBid(room, 200)
    expect(room.boardYen).toBe(201_843)
    expect(room.lastBid).toEqual({ by: 'player', atMs: 100 })
    expect(room.log).toHaveLength(logLength)
  })

  it('lets a watched lot go to the leading dealer when the player passes', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    tick(room, 2265)
    expect(room.leaderName).toBe('Endo')
    letGo(room)
    expect(room.status).toBe('lost')
    expect(room.log.at(-1)).toBe('You let it go. Endo takes it at ¥201,843.')
    expect(room.epilogue).toBe('You let it go. Someone got a bargain there.')
  })

  it('reseeds every run: run 0 and run 1 draw different clearing prices', () => {
    const thin = buildLobby()[0]!
    const run0 = enterRoom(thin, 0, 0)
    const run1 = enterRoom(thin, 1, 0)

    expect(run1.clearingYen).toBe(264_670)
    expect(run1.clearingYen).not.toBe(run0.clearingYen)
  })
})
