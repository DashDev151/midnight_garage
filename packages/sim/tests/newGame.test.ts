import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  GameStateSchema,
  PARTS,
  PARTS_TAXONOMY,
  VENUE_NAMES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

describe('createInitialGameState', () => {
  it('returns a day-1, schema-valid state with the content-derived starting cash', () => {
    const state = createInitialGameState(CONTEXT, 42)
    expect(() => GameStateSchema.parse(state)).not.toThrow()
    expect(state.day).toBe(1)
    expect(state.seed).toBe(42)
    expect(state.cashYen).toBe(ECONOMY.STARTING_CASH_YEN)
    // Derived from real roster medians, not asserted - see
    // STARTING_CASH_YEN's own schema doc comment.
    expect(ECONOMY.STARTING_CASH_YEN).toBe(300_000)
    expect(state.reputationTier).toBe('unknown')
    expect(state.ownedCars).toEqual([])
  })

  it('seeds bay counts from the content facilities config, with one real empty slot per bay', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.serviceBayCount).toBe(FACILITIES.service.startCount)
    expect(state.parkingBayCount).toBe(FACILITIES.parking.startCount)
    // Bay arrays are real, index-addressable state - a fresh game starts
    // with one null (empty) slot per bay, not an empty array.
    expect(state.serviceBayCarIds).toEqual(new Array(FACILITIES.service.startCount).fill(null))
    expect(state.parkingCarIds).toEqual(new Array(FACILITIES.parking.startCount).fill(null))
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

  describe('venueNameByTier (Sprint 114)', () => {
    it('rolls one real name per tier, from that tier’s own pool', () => {
      const state = createInitialGameState(CONTEXT, 123)
      const byTier = state.venueNameByTier
      if (!byTier) throw new Error('expected venueNameByTier on a fresh career')
      for (const tier of ['local-yard', 'regional', 'premium', 'collector-network'] as const) {
        expect(VENUE_NAMES[tier]).toContain(byTier[tier])
      }
    })

    it('is deterministic per seed', () => {
      const a = createInitialGameState(CONTEXT, 55).venueNameByTier
      const b = createInitialGameState(CONTEXT, 55).venueNameByTier
      expect(a).toEqual(b)
    })

    it('rides its own independent rng stream, untouched by the day-1 catalog roll (tutorial mode injects an extra scripted lot, consuming different catalog rng, yet names the same venues)', () => {
      const plain = createInitialGameState(CONTEXT, 55).venueNameByTier
      const tutorial = createInitialGameState(CONTEXT, 55, { tutorial: true }).venueNameByTier
      expect(tutorial).toEqual(plain)
    })
  })
})
