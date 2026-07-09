import {
  BUYERS,
  CARS,
  FACILITIES,
  GameStateSchema,
  HIDDEN_ISSUES,
  PARTS,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState, STARTING_CASH_YEN } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES, [], FACILITIES)

describe('createInitialGameState', () => {
  it('returns a day-1, schema-valid state with the Sprint 03 starting cash', () => {
    const state = createInitialGameState(CONTEXT, 42)
    expect(() => GameStateSchema.parse(state)).not.toThrow()
    expect(state.day).toBe(1)
    expect(state.seed).toBe(42)
    expect(state.cashYen).toBe(STARTING_CASH_YEN)
    expect(STARTING_CASH_YEN).toBe(1_500_000)
    expect(state.reputationTier).toBe('unknown')
    expect(state.ownedCars).toEqual([])
  })

  it('seeds bay counts from the content facilities config', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.serviceBayCount).toBe(FACILITIES.service.startCount)
    expect(state.parkingBayCount).toBe(FACILITIES.parking.startCount)
    expect(state.serviceBayCarIds).toEqual([])
  })

  it('seeds market heat at base 100 for every model in the context', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(Object.keys(state.marketHeat)).toHaveLength(CONTEXT.models.length)
    for (const heat of Object.values(state.marketHeat)) {
      expect(heat).toBe(100)
    }
  })

  it('is a pure function of context and seed', () => {
    expect(createInitialGameState(CONTEXT, 7)).toEqual(createInitialGameState(CONTEXT, 7))
  })
})
