import { playerEstimateYen } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { enterRoom } from './auctionRoom'
import {
  buildDemoLobby,
  demoRoomSeed,
  fullyLookedLearned,
  verdictFor,
  type DemoLobbyEntry,
} from './auctionRoomDemo'

function buildLobby(): DemoLobbyEntry[] {
  const game = useGameStore()
  return buildDemoLobby(game.gameState, game.context)
}

describe('auctionRoomDemo lobby', () => {
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
    const game = useGameStore()
    const config = game.context.economy.auctionRoom
    const [thin, packed] = buildLobby()
    // A full look knows the true worth, so the player's number is the value
    // itself, with no margin taken off it.
    expect(
      enterRoom(thin!, demoRoomSeed(thin!.key, 0), 0, fullyLookedLearned(thin!), config)
        .playerNumberYen,
    ).toBe(thin!.trueValueYen)
    expect(
      enterRoom(packed!, demoRoomSeed(packed!.key, 0), 0, fullyLookedLearned(packed!), config)
        .playerNumberYen,
    ).toBe(packed!.trueValueYen)
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
})
