import { EQUIPMENT, type Equipment, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { applyEquipmentPurchase, applyEquipmentPurchases, hasEquipmentFor } from '../src/equipment'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], EQUIPMENT)

const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!

/**
 * A synthetic reputation-gated item, never shipped in real content (Sprint
 * 13 decision 7 removed `minReputationTier` from every real equipment entry,
 * since `reputationTier` is never mutated anywhere in the sim). The schema
 * field and the gate in `applyEquipmentPurchase` both still exist for future
 * use, so this proves the mechanism works even though nothing exercises it
 * through real content today.
 */
const GATED_EQUIPMENT: Equipment = {
  id: 'test-gated-tool',
  displayName: 'Test Gated Tool',
  componentIds: ['engine'],
  priceYen: 10_000,
  consumablesCostYen: 0,
  minReputationTier: 'local',
}
const GATED_CONTEXT = buildSimContext(
  [],
  [],
  [],
  [],
  [],
  undefined,
  [],
  [...EQUIPMENT, GATED_EQUIPMENT],
)

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

describe('hasEquipmentFor', () => {
  it('is false when nothing is owned', () => {
    expect(hasEquipmentFor(baseState(), 'body', CONTEXT)).toBe(false)
  })

  it('is true once the covering equipment is owned', () => {
    const state = baseState({ ownedEquipmentIds: [WELDER.id] })
    expect(hasEquipmentFor(state, 'body', CONTEXT)).toBe(true)
  })

  it('does not cover an unrelated component', () => {
    const state = baseState({ ownedEquipmentIds: [WELDER.id] })
    expect(hasEquipmentFor(state, 'engine', CONTEXT)).toBe(false)
  })
})

describe('applyEquipmentPurchase', () => {
  it('buys the item, deducts cash, and logs it', () => {
    const state = baseState({ cashYen: WELDER.priceYen })
    const result = applyEquipmentPurchase(state, WELDER.id, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.ownedEquipmentIds).toEqual([WELDER.id])
    expect(result.log).toEqual([
      { type: 'equipment-purchased', equipmentId: WELDER.id, priceYen: WELDER.priceYen },
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
    const state = baseState({ cashYen: 999_999_999, ownedEquipmentIds: [WELDER.id] })
    const result = applyEquipmentPurchase(state, WELDER.id, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses when unaffordable, with no state change', () => {
    const state = baseState({ cashYen: WELDER.priceYen - 1 })
    const result = applyEquipmentPurchase(state, WELDER.id, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses when the reputation tier has not been reached yet', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    const result = applyEquipmentPurchase(state, GATED_EQUIPMENT.id, GATED_CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('succeeds once the required reputation tier is reached', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'local' })
    const result = applyEquipmentPurchase(state, GATED_EQUIPMENT.id, GATED_CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.ownedEquipmentIds).toEqual([GATED_EQUIPMENT.id])
  })
})

describe('applyEquipmentPurchases (bots’ batch path)', () => {
  it('buys every affordable item in order, skipping ones that fail', () => {
    const state = baseState({ cashYen: WELDER.priceYen })
    const result = applyEquipmentPurchases(
      state,
      [{ equipmentId: WELDER.id }, { equipmentId: 'not-a-real-id' }],
      CONTEXT,
    )
    expect(result.state.ownedEquipmentIds).toEqual([WELDER.id])
    expect(result.log).toHaveLength(1)
  })

  it('an empty batch is a no-op', () => {
    const state = baseState()
    const result = applyEquipmentPurchases(state, [], CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})
