import { createRng, hashStringToSeed, playerEstimateYen } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import {
  ROOM_TUNING,
  armReaction,
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
    inspected: false,
    goadFired: false,
    snipeCount: 0,
    pendingCallRungs: null,
    feud: null,
    armedReaction: null,
  }
}

/** A stub stream that hands out queued values in order, for the clearing draw. */
function queueStream(values: number[]): { next: () => number } {
  let i = 0
  return { next: () => values[i++]! }
}

/** A stub `room.rng` that hands out queued values in order, for reaction and
 * scheduling draws. Pad with a few extra values past what a test expects to
 * consume: reading past the end throws rather than silently returning
 * `undefined` as a number. */
function sequence(values: number[]): () => number {
  let i = 0
  return () => {
    if (i >= values.length) throw new Error('sequence exhausted: stub ran out of rng values')
    return values[i++]!
  }
}

describe('auctionRoomDemo machine', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('selects the highest-ratio lot (thin) and the single genuine trap (packed) from the fixed catalogue', () => {
    const [thin, packed] = buildLobby()

    expect(thin!.key).toBe('thin')
    expect(thin!.displayName).toBe('Honda CR-X SiR (EF8)')
    expect(thin!.roomReadYen).toBe(196_877)
    expect(thin!.trueValueYen).toBe(221_938)
    expect(thin!.incrementYen).toBe(5_000)
    expect(thin!.dealerCount).toBe(2)
    expect(thin!.verdict).toBe('better')
    expect(thin!.trueValueYen / thin!.roomReadYen).toBeCloseTo(1.12729, 4)

    expect(packed!.key).toBe('packed')
    expect(packed!.displayName).toBe('Honda Prelude Si VTEC (BB4)')
    expect(packed!.roomReadYen).toBe(444_437)
    expect(packed!.trueValueYen).toBe(308_951)
    expect(packed!.incrementYen).toBe(5_000)
    expect(packed!.dealerCount).toBe(6)
    expect(packed!.verdict).toBe('worse')
    expect(packed!.trueValueYen / packed!.roomReadYen).toBeCloseTo(0.69515, 4)

    // The thin lot beats the read (a clear steal); the trap sits below the trap
    // band of the read.
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
    expect(thinRoom.reserveYen).toBe(108_282)
    expect(thinRoom.clearingYen).toBe(151_754)
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
    expect(packedRoom.reserveYen).toBe(244_440)
    expect(packedRoom.clearingYen).toBe(397_022)
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
    expect(room.reserveYen).toBe(108_282)
    expect(room.boardYen).toBe(108_282)
    expect(room.clearingYen).toBe(151_754)
    expect(room.leader).toBeNull()
    expect(room.leaderName).toBeNull()
    expect(room.status).toBe('open')
    expect(room.clockEndsAtMs).toBe(ROOM_TUNING.clockMs)
    expect(room.log).toEqual(['The clerk looks over the room. Reserve is ¥108,282.'])
    expect(room.pendingRoomBid).toEqual({ atMs: 2265 })
    expect(nextRungYen(room)).toBe(108_282)

    expect(room.roomReadYen).toBe(196_877)
    expect(room.trueValueYen).toBe(221_938)
    expect(room.playerNumberYen).toBe(221_938)
    expect(room.verdict).toBe('better')
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
    expect(room.reserveYen).toBe(244_440)
    expect(room.boardYen).toBe(244_440)
    expect(room.clearingYen).toBe(397_022)
    expect(room.pendingRoomBid).toEqual({ atMs: 2645 })
    expect(room.playerNumberYen).toBe(308_951)
  })

  it('lands the opener at its scheduled instant and resets the fuse from it', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    tick(room, 3000)

    expect(room.leader).toBe('room')
    expect(room.leaderName).toBe('Endo')
    expect(room.boardYen).toBe(108_282)
    expect(room.lastBid).toEqual({ by: 'Endo', atMs: 2265 })
    expect(room.log).toContain('Endo opens: ¥108,282.')
    expect(room.clockEndsAtMs).toBe(2265 + ROOM_TUNING.clockMs)
    // The wide gap on the thin room draws feud eligibility before the delay
    // draw on this scheduled raise; it fails at this seed, so the delay draw
    // lands on the ordinary band.
    expect(room.pendingRoomBid).toEqual({ atMs: 5665 })
    expect(nextRungYen(room)).toBe(113_282)
  })

  it('climbs the thin room dealer against dealer to the clearing price and hammers there', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    tick(room, 3_600_000)

    expect(room.status).toBe('lost')
    expect(room.boardYen).toBe(148_282)
    // The board settles on the last rung at or under the clearing price.
    expect(room.boardYen).toBeLessThanOrEqual(room.clearingYen)
    expect(room.boardYen + room.incrementYen).toBeGreaterThan(room.clearingYen)
    expect(room.leaderName).toBe('Endo')
    expect(room.log.at(-1)).toBe('Hammer. Endo takes it at ¥148,282.')
    expect(dealersInRoom(room)).toBe(1)
    expect(room.epilogue).toBe('You let it go. Someone got a bargain there.')
  })

  it('plays the packed war to its clearing price, thinning the room as it climbs, with a feud breaking out along the way', () => {
    const room = enterRoom(buildLobby()[1]!, 0, 0)
    tick(room, 3_600_000)

    expect(room.status).toBe('lost')
    expect(room.boardYen).toBe(394_440)
    expect(room.boardYen).toBeLessThanOrEqual(room.clearingYen)
    expect(room.boardYen + room.incrementYen).toBeGreaterThan(room.clearingYen)
    // The wide board-to-clearing gap on the packed room's own unprompted climb
    // draws feud eligibility on every scheduled raise, no player bid needed;
    // this seeded run ignites two between Endo and Mrs. Sakaki (the pair stays
    // eligible again once the first burst ends), and Endo is the final leader
    // at the hammer.
    expect(room.log).toContain(
      'Endo and Mrs. Sakaki have history. The rest of the room settles in to watch.',
    )
    expect(room.leaderName).toBe('Endo')
    expect(room.log.at(-1)).toBe('Hammer. Endo takes it at ¥394,440.')
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
    expect(room.boardYen).toBe(108_282)
    expect(room.lastBid).toEqual({ by: 'player', atMs: 100 })
    expect(room.log).toContain('You open: ¥108,282.')
    expect(room.clockEndsAtMs).toBe(100 + ROOM_TUNING.clockMs)
    // The next rung is still under the clearing price, so the room counters:
    // the pending raise is rescheduled off the player's bid, not cleared. The
    // wide gap draws feud eligibility ahead of the delay draw; it fails at
    // this seed.
    expect(room.pendingRoomBid).toEqual({ atMs: 3500 })
  })

  it('no-ops a player bid while the player already leads', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    playerBid(room, 100)
    const logLength = room.log.length

    playerBid(room, 200)
    expect(room.boardYen).toBe(108_282)
    expect(room.lastBid).toEqual({ by: 'player', atMs: 100 })
    expect(room.log).toHaveLength(logLength)
  })

  it('lets a watched lot go to the leading dealer when the player passes', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    tick(room, 2265)
    expect(room.leaderName).toBe('Endo')
    letGo(room)
    expect(room.status).toBe('lost')
    expect(room.log.at(-1)).toBe('You let it go. Endo takes it at ¥108,282.')
    expect(room.epilogue).toBe('You let it go. Someone got a bargain there.')
  })

  it('reseeds every run: run 0 and run 1 draw different clearing prices', () => {
    const thin = buildLobby()[0]!
    const run0 = enterRoom(thin, 0, 0)
    const run1 = enterRoom(thin, 1, 0)

    expect(run1.clearingYen).toBe(141_987)
    expect(run1.clearingYen).not.toBe(run0.clearingYen)
  })

  it('exposes the reaction tuning and the player raise options at the conservative starting values', () => {
    expect(ROOM_TUNING.playerRaiseOptionsRungs).toEqual([1, 4, 8])
    expect(ROOM_TUNING.reactions).toEqual({
      jumpRungs: 4,
      scareChance: 0.15,
      scareLeftRungs: 2,
      callChance: 0.12,
      callRungs: 3,
      goadChance: 0.03,
      goadMaxLift: 1.06,
      snipeWindowMs: 800,
      snipesBeforeTax: 2,
      snipeTaxChance: 0.15,
      snipeTaxRungs: 2,
      feudChance: 0.08,
      feudMinGapRungs: 6,
      feudRungs: 4,
      feudDelayMs: { min: 400, max: 1100 },
    })
  })

  it('lands a non-opening raise at rungs increments above the board; the opening ignores rungs', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)

    // The opening lands on the reserve no matter what rungs asks for.
    playerBid(room, 0, 4)
    expect(room.boardYen).toBe(100_000)
    expect(room.leader).toBe('player')

    room.leader = 'room'
    room.leaderName = 'Endo'
    playerBid(room, 1_000, 4)
    expect(room.boardYen).toBe(100_000 + 4 * 10_000)
  })

  it('fires the scare on a jump, collapsing the clearing price to board + scareLeftRungs increments', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    // Not inspected, so the first draw is the scare's; well under scareChance.
    room.rng = sequence([0.01, 0.5, 0.5, 0.5])

    playerBid(room, 0, 4)

    expect(room.boardYen).toBe(140_000)
    expect(room.clearingYen).toBe(
      room.boardYen + ROOM_TUNING.reactions.scareLeftRungs * room.incrementYen,
    )
    expect(room.log).toContain('The jump lands. Paddles settle into laps down the row.')
  })

  it('answers a jump with a call: the next room response lands callRungs up with the call line', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    // Scare fails (>= scareChance), call succeeds (< callChance), then the
    // delay draw for the call response and the delay draw for the raise
    // scheduled after it lands.
    room.rng = sequence([0.9, 0.01, 0.5, 0.5])

    playerBid(room, 0, 4)
    expect(room.pendingCallRungs).toBe(ROOM_TUNING.reactions.callRungs)
    const boardAfterJump = room.boardYen

    tick(room, room.pendingRoomBid!.atMs)

    expect(room.pendingCallRungs).toBeNull()
    expect(room.boardYen).toBe(boardAfterJump + ROOM_TUNING.reactions.callRungs * room.incrementYen)
    expect(room.log.at(-1)).toBe(`Endo doesn't blink: ¥170,000.`)
  })

  it('fires the goad only for a room entered inspected, lifting the clearing price above the read but never past goadMaxLift x the read, and only once', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 150_000)
    room.roomReadYen = 200_000
    room.inspected = true
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    // Goad succeeds (< goadChance), lift draws mid-band, then the delay draw
    // for the raise scheduled after it.
    room.rng = sequence([0.0, 0.5, 0.5])

    playerBid(room, 0, 4)

    expect(room.goadFired).toBe(true)
    expect(room.clearingYen).toBeGreaterThan(room.roomReadYen)
    expect(room.clearingYen).toBeLessThanOrEqual(
      Math.round(room.roomReadYen * ROOM_TUNING.reactions.goadMaxLift),
    )
    const goadLine = 'Somebody saw you under that car earlier. The room sits up.'
    expect(room.log.at(-1)).toBe(goadLine)

    // A second jump, with a stub that would satisfy the goad chance again if
    // the goad were still eligible: the latch means it never fires twice.
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.rng = sequence([0.0, 0.9])
    playerBid(room, 1_000, 4)
    expect(room.log.filter((line) => line === goadLine)).toHaveLength(1)
  })

  it('never fires the goad for a room entered uninspected, even with a stub that would satisfy it as a goad draw', () => {
    const room = bareRoom(
      [
        { name: 'Endo', active: true },
        { name: 'Mrs. Sakaki', active: true },
      ],
      100_000,
      10_000,
      150_000,
    )
    room.roomReadYen = 200_000
    room.inspected = false
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    room.rng = sequence([0.0, 0.5])

    playerBid(room, 0, 4)

    expect(room.goadFired).toBe(false)
    expect(room.clearingYen).toBeLessThanOrEqual(room.roomReadYen)
    expect(room.log).not.toContain('Somebody saw you under that car earlier. The room sits up.')
  })

  it('CAP LAW: without the goad, no room-attributed bid ever lands above the room read, across many seeded rooms and assorted player jumps', () => {
    const entries = buildLobby()
    for (const entry of entries) {
      for (let run = 0; run < 25; run++) {
        const learned = {
          playerNumberYen: entry.trueValueYen,
          verdict: entry.verdict,
          trueValueYen: entry.trueValueYen,
          inspected: false,
        }
        const room = enterRoom(entry, run, 0, learned)
        let nowMs = 0
        let guard = 0
        while (room.status === 'open' && guard < 100) {
          guard++
          if (room.leader === 'player') {
            nowMs = room.pendingRoomBid ? room.pendingRoomBid.atMs : room.clockEndsAtMs
            tick(room, nowMs)
          } else {
            nowMs += 50
            playerBid(room, nowMs, 8)
          }
          if (room.leader === 'room') {
            expect(room.boardYen).toBeLessThanOrEqual(room.roomReadYen)
          }
        }
      }
    }
  })

  it('taxes a room response once the snipe tolerance is spent, without touching the delay band', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    room.clockEndsAtMs = 5_000
    // Two scheduling delays (one per snipe), the tax draw, then the delay for
    // the raise scheduled once the tax lands.
    room.rng = sequence([0.5, 0.5, 0.05, 0.5])

    playerBid(room, 4_900, 1) // inside the 800ms snipe window
    expect(room.snipeCount).toBe(1)
    room.leader = 'room'
    room.leaderName = 'Endo'

    playerBid(room, 9_800, 1) // second snipe: tolerance now spent
    expect(room.snipeCount).toBe(2)

    const pending = room.pendingRoomBid!
    const delayUsed = pending.atMs - 9_800
    expect(delayUsed).toBeGreaterThanOrEqual(ROOM_TUNING.bidDelayMs.min)
    expect(delayUsed).toBeLessThanOrEqual(ROOM_TUNING.bidDelayMs.max)

    const boardBeforeTax = room.boardYen
    tick(room, pending.atMs)

    expect(room.boardYen).toBe(
      boardBeforeTax + ROOM_TUNING.reactions.snipeTaxRungs * room.incrementYen,
    )
    expect(room.log.at(-1)).toBe(`Endo has had enough of the clock: straight to ¥140,000.`)
  })

  it('starts a feud on a jump, alternating single-rung raises between the two named dealers on the feud delay band, ending when the burst is spent', () => {
    const dealers: DemoDealer[] = [
      { name: 'Endo', active: true },
      { name: 'Mrs. Sakaki', active: true },
    ]
    const room = bareRoom(dealers, 100_000, 10_000, 200_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    // Scare fails, call fails, feud succeeds, then five delay draws (four
    // feud raises plus the ordinary raise scheduled once the burst ends).
    room.rng = sequence([0.9, 0.9, 0.01, 0.5, 0.5, 0.5, 0.5, 0.5])

    playerBid(room, 0, 4)

    expect(room.feud).toEqual({ names: ['Endo', 'Mrs. Sakaki'], remaining: 4 })
    expect(room.log.at(-1)).toBe(
      'Endo and Mrs. Sakaki have history. The rest of the room settles in to watch.',
    )

    const seenNames: string[] = []
    let fromMs = 0
    for (let i = 0; i < 4; i++) {
      const pending = room.pendingRoomBid!
      const delay = pending.atMs - fromMs
      expect(delay).toBeGreaterThanOrEqual(ROOM_TUNING.reactions.feudDelayMs.min)
      expect(delay).toBeLessThanOrEqual(ROOM_TUNING.reactions.feudDelayMs.max)
      const boardBefore = room.boardYen
      tick(room, pending.atMs)
      expect(room.boardYen).toBe(boardBefore + room.incrementYen)
      seenNames.push(room.leaderName!)
      fromMs = pending.atMs
    }

    expect(seenNames).toEqual(['Endo', 'Mrs. Sakaki', 'Endo', 'Mrs. Sakaki'])
    expect(room.feud).toBeNull()
  })

  it('armReaction sets the arm and overwrites any previous arm, but no-ops once the room is resolved', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    expect(room.armedReaction).toBeNull()

    armReaction(room, 'scare')
    expect(room.armedReaction).toBe('scare')

    armReaction(room, 'feud')
    expect(room.armedReaction).toBe('feud')

    room.status = 'won'
    armReaction(room, 'tax')
    expect(room.armedReaction).toBe('feud')
  })

  it('force-arms the scare: the next jump fires it with no chance draw, and a second jump does not re-fire it', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    armReaction(room, 'scare')
    // No chance draw for the forced scare; just the delay draw for the raise
    // scheduled after it.
    room.rng = sequence([0.5])

    playerBid(room, 0, 4)

    expect(room.armedReaction).toBeNull()
    expect(room.clearingYen).toBe(
      room.boardYen + ROOM_TUNING.reactions.scareLeftRungs * room.incrementYen,
    )
    const scareLine = 'The jump lands. Paddles settle into laps down the row.'
    expect(room.log.at(-1)).toBe(scareLine)

    // A second jump, with armedReaction cleared: the ordinary draws run and
    // this seed fails both, so the scare does not fire again.
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.rng = sequence([0.99, 0.99, 0.5])
    playerBid(room, 1_000, 4)
    expect(room.log.filter((line) => line === scareLine)).toHaveLength(1)
  })

  it('force-arms the call: the next jump sets the pending call, which lands with its log line, and a second jump does not re-arm it', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    armReaction(room, 'call')
    // No chance draw for the forced call; the delay draw scheduling the
    // room's response, then the delay draw for the raise scheduled once it
    // lands.
    room.rng = sequence([0.5, 0.5])

    playerBid(room, 0, 4)
    expect(room.pendingCallRungs).toBe(ROOM_TUNING.reactions.callRungs)
    expect(room.armedReaction).toBeNull()
    const boardAfterJump = room.boardYen

    tick(room, room.pendingRoomBid!.atMs)

    expect(room.pendingCallRungs).toBeNull()
    expect(room.boardYen).toBe(boardAfterJump + ROOM_TUNING.reactions.callRungs * room.incrementYen)
    expect(room.log.at(-1)).toBe(`Endo doesn't blink: ¥170,000.`)

    // A second jump, with armedReaction cleared: the ordinary draws run and
    // this seed fails both, so no call is queued.
    room.rng = sequence([0.99, 0.99, 0.5])
    playerBid(room, 1_000, 4)
    expect(room.pendingCallRungs).toBeNull()
  })

  it('force-arms the goad on an uninspected room: it lifts the clearing above the read (bounded by goadMaxLift), and firing it twice in a row fires twice since the latch never consumes', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 150_000)
    room.roomReadYen = 200_000
    room.inspected = false
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    armReaction(room, 'goad')
    // No chance draw for the forced goad; only the lift magnitude draw, then
    // the delay draw for the raise scheduled after it.
    room.rng = sequence([0.5, 0.5])

    playerBid(room, 0, 4)

    expect(room.armedReaction).toBeNull()
    expect(room.goadFired).toBe(false) // a forced goad never sets the latch
    expect(room.clearingYen).toBeGreaterThan(room.roomReadYen)
    expect(room.clearingYen).toBeLessThanOrEqual(
      Math.round(room.roomReadYen * ROOM_TUNING.reactions.goadMaxLift),
    )
    const goadLine = 'Somebody saw you under that car earlier. The room sits up.'
    expect(room.log.at(-1)).toBe(goadLine)

    // Forced again: fires a second time even on an uninspected room, since
    // the latch was never consumed by the first forced fire.
    room.leader = 'room'
    room.leaderName = 'Endo'
    armReaction(room, 'goad')
    room.rng = sequence([0.5, 0.5])
    playerBid(room, 1_000, 4)

    expect(room.goadFired).toBe(false)
    expect(room.log.filter((line) => line === goadLine)).toHaveLength(2)
  })

  it('force-arms the tax: the next room response lands taxed regardless of snipeCount, and a second response does not retax', () => {
    const room = bareRoom([{ name: 'Endo', active: true }], 100_000, 10_000, 500_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    room.snipeCount = 0
    armReaction(room, 'tax')
    room.pendingRoomBid = { atMs: 100 }
    // No chance draw for the forced tax; the delay draw for the raise
    // scheduled after it lands, then the delay draw for the raise after that.
    room.rng = sequence([0.5, 0.5])

    tick(room, room.pendingRoomBid.atMs)

    expect(room.armedReaction).toBeNull()
    expect(room.boardYen).toBe(100_000 + ROOM_TUNING.reactions.snipeTaxRungs * room.incrementYen)
    expect(room.log.at(-1)).toBe(`Endo has had enough of the clock: straight to ¥120,000.`)

    // A second room response with the arm already spent: an ordinary
    // rung-one raise, not a tax.
    const boardBeforeSecond = room.boardYen
    tick(room, room.pendingRoomBid!.atMs)
    expect(room.boardYen).toBe(boardBeforeSecond + room.incrementYen)
    expect(room.log.at(-1)).toBe('Endo raises: ¥130,000.')
  })

  it('force-arms the feud: the next scheduled raise starts it even though the board-to-clearing gap sits far under feudMinGapRungs, and a further scheduled raise does not restart it once the arm is spent', () => {
    const dealers: DemoDealer[] = [
      { name: 'Endo', active: true },
      { name: 'Mrs. Sakaki', active: true },
    ]
    const room = bareRoom(dealers, 100_000, 10_000, 130_000)
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.boardYen = 100_000
    armReaction(room, 'feud')
    // No gap check and no chance draw for the forced feud; just the feud-band
    // delay draw for the raise it schedules.
    room.rng = sequence([0.5])

    playerBid(room, 0, 1) // a plain rung-one raise still schedules a raise

    expect(room.armedReaction).toBeNull()
    expect(room.feud).toEqual({
      names: ['Endo', 'Mrs. Sakaki'],
      remaining: ROOM_TUNING.reactions.feudRungs,
    })
    const feudLine = 'Endo and Mrs. Sakaki have history. The rest of the room settles in to watch.'
    expect(room.log).toContain(feudLine)

    // The burst is over (simulated directly) and the arm is spent: a further
    // scheduled raise, with the gap still far under feudMinGapRungs, does not
    // start a second feud.
    room.feud = null
    room.leader = 'room'
    room.leaderName = 'Endo'
    room.pendingRoomBid = null
    room.rng = sequence([0.5])
    playerBid(room, 1_000, 1)

    expect(room.feud).toBeNull()
    expect(room.log.filter((line) => line === feudLine)).toHaveLength(1)
  })

  it('determinism guard: the full unarmed thin-room replay is bit-identical to the existing pinned flow, proving the arm machinery costs no draws when unarmed', () => {
    const room = enterRoom(buildLobby()[0]!, 0, 0)
    expect(room.armedReaction).toBeNull()

    tick(room, 3_600_000)

    expect(room.status).toBe('lost')
    expect(room.boardYen).toBe(148_282)
    expect(room.boardYen).toBeLessThanOrEqual(room.clearingYen)
    expect(room.boardYen + room.incrementYen).toBeGreaterThan(room.clearingYen)
    expect(room.leaderName).toBe('Endo')
    expect(room.log.at(-1)).toBe('Hammer. Endo takes it at ¥148,282.')
    expect(dealersInRoom(room)).toBe(1)
    expect(room.epilogue).toBe('You let it go. Someone got a bargain there.')
    expect(room.armedReaction).toBeNull()
  })
})
