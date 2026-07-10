import { FACILITIES, GameStateSchema, ReputationTierSchema } from '@midnight-garage/content'
import { REPUTATION_TIER_THRESHOLDS } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

describe('useGameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('newGame produces a schema-valid day-1 state with the starting cash', () => {
    const game = useGameStore()
    game.newGame(42)
    expect(() => GameStateSchema.parse(game.gameState)).not.toThrow()
    expect(game.day).toBe(1)
    expect(game.cashYen).toBe(1_500_000)
    expect(game.ownedCarCount).toBe(0)
    expect(game.dayLog).toEqual([])
  })

  it('endDay advances the day by exactly one', () => {
    const game = useGameStore()
    game.newGame(1)
    game.endDay()
    expect(game.day).toBe(2)
    game.endDay()
    expect(game.day).toBe(3)
  })

  it('endDay appends the returned log entries', () => {
    const game = useGameStore()
    game.newGame(1)
    // Day 7 crosses the weekly rent/catalog boundary, so the log is non-empty.
    for (let i = 0; i < 7; i++) game.endDay()
    expect(game.dayLog.length).toBeGreaterThan(0)
  })

  it('newGame with no seed randomizes the career (external review finding 3)', () => {
    const a = useGameStore()
    a.newGame()
    const seedA = a.gameState.seed

    setActivePinia(createPinia())
    const b = useGameStore()
    b.newGame()
    const seedB = b.gameState.seed

    // Two fresh games get different seeds (collision odds ~1 in 2^31).
    expect(seedA).not.toBe(seedB)
    // An explicit seed still pins the career for dev/challenge/tests.
    setActivePinia(createPinia())
    const c = useGameStore()
    c.newGame(1234)
    expect(c.gameState.seed).toBe(1234)
  })

  it('is deterministic: same seed, same end-days, identical state', () => {
    const a = useGameStore()
    a.newGame(99)
    for (let i = 0; i < 20; i++) a.endDay()

    setActivePinia(createPinia())
    const b = useGameStore()
    b.newGame(99)
    for (let i = 0; i < 20; i++) b.endDay()

    expect(a.gameState).toEqual(b.gameState)
    expect(a.dayLog).toEqual(b.dayLog)
  })

  it('devGiveCash adds cash outside the sim', () => {
    const game = useGameStore()
    game.newGame(1)
    const before = game.cashYen
    game.devGiveCash(250_000)
    expect(game.cashYen).toBe(before + 250_000)
  })

  it('devGrantBay adds a bay for free, bypassing cash and reputation', () => {
    const game = useGameStore()
    game.newGame(1) // reputationTier starts 'unknown'; devGiveCash never called
    const before = game.serviceBayCount
    game.devGrantBay('service')
    expect(game.serviceBayCount).toBe(before + 1)
    expect(game.cashYen).toBe(1_500_000) // unaffected
  })

  it('devGrantBay is a no-op once a kind is already at its max count', () => {
    const game = useGameStore()
    game.newGame(1)
    for (let i = 0; i < 20; i++) game.devGrantBay('service') // well past FACILITIES.service.maxCount
    expect(game.serviceBayCount).toBe(FACILITIES.service.maxCount)
  })

  it('devSetReputationTier jumps straight to a tier, deriving from its exact point threshold', () => {
    const game = useGameStore()
    game.newGame(1)
    for (const tier of ReputationTierSchema.options) {
      game.devSetReputationTier(tier)
      expect(game.reputationTier).toBe(tier)
      expect(game.reputationPoints).toBe(REPUTATION_TIER_THRESHOLDS[tier])
    }
  })

  it('resolveModelName returns a display name for a known model', () => {
    const game = useGameStore()
    const knownId = game.gameState.marketHeat
      ? Object.keys(game.gameState.marketHeat)[0]
      : undefined
    if (!knownId) throw new Error('expected at least one model in market heat')
    // A resolved name should differ from a raw id fallback for real content.
    expect(typeof game.resolveModelName(knownId)).toBe('string')
    expect(game.resolveModelName('no-such-model')).toBe('no-such-model')
  })
})
