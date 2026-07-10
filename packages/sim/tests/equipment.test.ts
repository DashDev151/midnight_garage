import { EQUIPMENT, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { applyEquipmentPurchase, applyEquipmentPurchases, hasEquipmentFor } from '../src/equipment'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], EQUIPMENT)

/** Ungated per the Sprint 16 ladder (day-1 accessible) — the plain purchase
 * flow's fixture, kept separate from the reputation-gate tests below. */
const UPHOLSTERY_BENCH = EQUIPMENT.find((e) => e.componentIds.includes('interior'))!
/**
 * Reputation-gated per the Sprint 16 ladder (requires 'known'). Sprint 13
 * originally tested this mechanism against a synthetic fixture, since no real
 * equipment carried `minReputationTier` at the time (reputationTier was never
 * derived from anything). Sprint 15 made the derivation real and Sprint 16
 * set real thresholds, so the gate is exercised through real content now.
 */
const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

describe('hasEquipmentFor', () => {
  it('is false when nothing is owned', () => {
    expect(hasEquipmentFor(baseState(), 'interior', CONTEXT)).toBe(false)
  })

  it('is true once the covering equipment is owned', () => {
    const state = baseState({ ownedEquipmentIds: [UPHOLSTERY_BENCH.id] })
    expect(hasEquipmentFor(state, 'interior', CONTEXT)).toBe(true)
  })

  it('does not cover an unrelated component', () => {
    const state = baseState({ ownedEquipmentIds: [UPHOLSTERY_BENCH.id] })
    expect(hasEquipmentFor(state, 'engine', CONTEXT)).toBe(false)
  })
})

describe('applyEquipmentPurchase', () => {
  it('buys the item, deducts cash, and logs it', () => {
    const state = baseState({ cashYen: UPHOLSTERY_BENCH.priceYen })
    const result = applyEquipmentPurchase(state, UPHOLSTERY_BENCH.id, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.ownedEquipmentIds).toEqual([UPHOLSTERY_BENCH.id])
    expect(result.log).toEqual([
      {
        type: 'equipment-purchased',
        equipmentId: UPHOLSTERY_BENCH.id,
        priceYen: UPHOLSTERY_BENCH.priceYen,
      },
    ])
  })

  it('refuses an unknown equipment id, with no state change', () => {
    const state = baseState({ cashYen: 999_999_999 })
    const result = applyEquipmentPurchase(state, 'not-a-real-id', CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('refuses when already owned, with no state change', () => {
    const state = baseState({ cashYen: 999_999_999, ownedEquipmentIds: [UPHOLSTERY_BENCH.id] })
    const result = applyEquipmentPurchase(state, UPHOLSTERY_BENCH.id, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses when unaffordable, with no state change', () => {
    const state = baseState({ cashYen: UPHOLSTERY_BENCH.priceYen - 1 })
    const result = applyEquipmentPurchase(state, UPHOLSTERY_BENCH.id, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses when the reputation tier has not been reached yet', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    const result = applyEquipmentPurchase(state, WELDER.id, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('succeeds once the required reputation tier is reached', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'known' })
    const result = applyEquipmentPurchase(state, WELDER.id, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.ownedEquipmentIds).toEqual([WELDER.id])
  })
})

describe('applyEquipmentPurchases (bots’ batch path)', () => {
  it('buys every affordable item in order, skipping ones that fail', () => {
    const state = baseState({ cashYen: UPHOLSTERY_BENCH.priceYen })
    const result = applyEquipmentPurchases(
      state,
      [{ equipmentId: UPHOLSTERY_BENCH.id }, { equipmentId: 'not-a-real-id' }],
      CONTEXT,
    )
    expect(result.state.ownedEquipmentIds).toEqual([UPHOLSTERY_BENCH.id])
    expect(result.log).toHaveLength(1)
  })

  it('an empty batch is a no-op', () => {
    const state = baseState()
    const result = applyEquipmentPurchases(state, [], CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})
