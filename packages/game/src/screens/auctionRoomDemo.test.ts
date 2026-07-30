import { playerEstimateYen } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { enterRoom, incrementYenFor } from './auctionRoom'
import {
  buildDemoLobby,
  demoRoomSeed,
  fullyLookedLearned,
  TRAP_VALUE_FRACTION,
  verdictFor,
  type DemoLobbyEntry,
} from './auctionRoomDemo'

// This file's own seeded room simulations are real work, not a slow test in
// the ordinary sense, and have exceeded Vitest's default 5s per-test timeout
// under `--project game`'s whole-project resource contention while passing
// every time run in isolation - a flake, not a regression. An explicit,
// generous per-test timeout makes the file reliable under contention without
// masking a genuine hang.
vi.setConfig({ testTimeout: 30_000 })

function buildLobby(): DemoLobbyEntry[] {
  const game = useGameStore()
  return buildDemoLobby(game.gameState, game.context)
}

describe('auctionRoomDemo lobby', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('names the thin lot a Honda City E steal, its symptom fresh and its true cause the cheap one, reading comfortably better than the room fears', () => {
    // The car, the symptom and the true cause are pinned identity
    // (auctionRoomDemo.ts's own `STEAL_MODEL_ID`/`STEAL_SYMPTOM_ID`/
    // `STEAL_TRUE_CAUSE_ID`) - never rediscovered by a catalogue search, so a
    // repricing can only move the yen figures below, never swap in a
    // different car or a different symptom.
    const game = useGameStore()
    const roomConfig = game.context.economy.auctionRoom
    const [thin] = buildLobby()

    expect(thin!.key).toBe('thin')
    expect(thin!.displayName).toBe('Honda City E (AA)')
    expect(thin!.lot.modelId).toBe('honda-city-e-aa')
    expect(thin!.lot.car.symptoms).toHaveLength(1)
    const symptom = thin!.lot.car.symptoms[0]!
    expect(symptom.symptomId).toBe('damp-passenger-footwell')
    expect(symptom.trueCauseId).toBe('perished-grommet')
    // Fresh and unresolved: every one of the symptom's own causes is still a
    // live candidate, nothing yet tested - a diagnostic still has real doubt
    // to narrow.
    expect(symptom.remainingCauseIds.length).toBeGreaterThan(1)

    expect(thin!.incrementYen).toBe(incrementYenFor(thin!.roomReadYen, roomConfig))
    expect(thin!.dealerCount).toBe(roomConfig.turnout.thin.dealers)

    // The steal's whole point is not the exact yen the room happens to read
    // today; it's that the truth clears the room's read comfortably, not
    // marginally - well past the real `verdictFor` 'better' bar the
    // production auction room shares (`AuctionRoomScreen.vue` imports
    // `verdictFor` straight from this module), so an ordinary repricing
    // cannot flip it.
    expect(thin!.trueValueYen).toBeGreaterThan(thin!.roomReadYen * 1.1)
    expect(thin!.verdict).toBe('better')
    expect(verdictFor(thin!.roomReadYen, thin!.trueValueYen)).toBe('better')
  })

  it('names the packed lot a Nissan Sunny trap, its symptom fresh and its true cause the dear one, reading comfortably worse than the room read', () => {
    const game = useGameStore()
    const roomConfig = game.context.economy.auctionRoom
    const [, packed] = buildLobby()

    expect(packed!.key).toBe('packed')
    expect(packed!.displayName).toBe('Nissan Sunny (B12)')
    expect(packed!.lot.modelId).toBe('nissan-sunny-b12')
    expect(packed!.lot.car.symptoms).toHaveLength(1)
    const symptom = packed!.lot.car.symptoms[0]!
    expect(symptom.symptomId).toBe('overheats-in-traffic')
    expect(symptom.trueCauseId).toBe('cracked-block')
    expect(symptom.remainingCauseIds.length).toBeGreaterThan(1)

    expect(packed!.incrementYen).toBe(incrementYenFor(packed!.roomReadYen, roomConfig))
    expect(packed!.dealerCount).toBe(roomConfig.turnout.packed.dealers)

    // The trap's whole point: the truth undercuts the read comfortably,
    // clearing both the trap-selection floor (`TRAP_VALUE_FRACTION`) and the
    // real 'worse' verdict bar with margin to spare, not by a hair.
    expect(packed!.trueValueYen).toBeLessThan(packed!.roomReadYen * 0.85)
    expect(packed!.trueValueYen).toBeLessThan(packed!.roomReadYen * TRAP_VALUE_FRACTION)
    expect(packed!.verdict).toBe('worse')
    expect(verdictFor(packed!.roomReadYen, packed!.trueValueYen)).toBe('worse')
  })

  it('never reuses a lot id between the steal and the trap', () => {
    const [thin, packed] = buildLobby()
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
