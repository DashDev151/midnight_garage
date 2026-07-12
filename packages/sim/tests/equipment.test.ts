import { EQUIPMENT, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { applyEquipmentPurchase, applyEquipmentPurchases, hasEquipmentFor } from '../src/equipment'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], EQUIPMENT)

/**
 * Ungated per Sprint 33 decision 9 - the ONE machine purchasable from
 * `unknown` reputation (a fresh game's first week has just this tool). The
 * plain purchase flow's fixture, kept separate from the reputation-gate
 * tests below.
 */
const TIRE_MACHINE = EQUIPMENT.find((e) => e.componentIds.includes('wheels'))!
/** Gated behind `local` per Sprint 33 decision 9 - every machine except the
 * tire machine now requires at least `local` reputation. */
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
    expect(hasEquipmentFor(baseState(), 'wheels', CONTEXT)).toBe(false)
  })

  it('is true once the covering equipment is owned', () => {
    const state = baseState({ ownedEquipmentIds: [TIRE_MACHINE.id] })
    expect(hasEquipmentFor(state, 'wheels', CONTEXT)).toBe(true)
  })

  it('does not cover an unrelated component', () => {
    const state = baseState({ ownedEquipmentIds: [TIRE_MACHINE.id] })
    expect(hasEquipmentFor(state, 'engine', CONTEXT)).toBe(false)
  })
})

describe('applyEquipmentPurchase', () => {
  it('buys the item, deducts cash, and logs it', () => {
    const state = baseState({ cashYen: TIRE_MACHINE.priceYen })
    const result = applyEquipmentPurchase(state, TIRE_MACHINE.id, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.ownedEquipmentIds).toEqual([TIRE_MACHINE.id])
    expect(result.log).toEqual([
      {
        type: 'equipment-purchased',
        equipmentId: TIRE_MACHINE.id,
        priceYen: TIRE_MACHINE.priceYen,
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
    const state = baseState({ cashYen: 999_999_999, ownedEquipmentIds: [TIRE_MACHINE.id] })
    const result = applyEquipmentPurchase(state, TIRE_MACHINE.id, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses when unaffordable, with no state change', () => {
    const state = baseState({ cashYen: TIRE_MACHINE.priceYen - 1 })
    const result = applyEquipmentPurchase(state, TIRE_MACHINE.id, CONTEXT)
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

describe('Sprint 33 decision 9: equipment gate ladder (tutorial-phase tiering)', () => {
  const SUSPENSION_PRESS = EQUIPMENT.find((e) => e.componentIds.includes('suspension'))!
  const TRANSMISSION_BENCH = EQUIPMENT.find((e) => e.componentIds.includes('drivetrain'))!
  const ENGINE_CRANE = EQUIPMENT.find((e) => e.componentIds.includes('engine'))!

  it('the tire machine is the only equipment ungated at unknown reputation', () => {
    expect(TIRE_MACHINE.minReputationTier).toBeUndefined()
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    const result = applyEquipmentPurchase(state, TIRE_MACHINE.id, CONTEXT)
    expect(result.applied).toBe(true)
  })

  it('every other machine (suspension-press included) now requires local, not unknown', () => {
    expect(SUSPENSION_PRESS.minReputationTier).toBe('local')
    expect(UPHOLSTERY_BENCH.minReputationTier).toBe('local')
    const unknownState = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    expect(applyEquipmentPurchase(unknownState, SUSPENSION_PRESS.id, CONTEXT).applied).toBe(false)
    expect(applyEquipmentPurchase(unknownState, UPHOLSTERY_BENCH.id, CONTEXT).applied).toBe(false)
  })

  it('a local player can buy suspension-press and upholstery-bench', () => {
    const localState = baseState({ cashYen: 999_999_999, reputationTier: 'local' })
    expect(applyEquipmentPurchase(localState, SUSPENSION_PRESS.id, CONTEXT).applied).toBe(true)
    expect(applyEquipmentPurchase(localState, UPHOLSTERY_BENCH.id, CONTEXT).applied).toBe(true)
  })

  it('welder and transmission-bench require local, not known - an unknown player cannot buy either', () => {
    expect(WELDER.minReputationTier).toBe('local')
    expect(TRANSMISSION_BENCH.minReputationTier).toBe('local')
    const unknownState = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    expect(applyEquipmentPurchase(unknownState, WELDER.id, CONTEXT).applied).toBe(false)
    expect(applyEquipmentPurchase(unknownState, TRANSMISSION_BENCH.id, CONTEXT).applied).toBe(false)
  })

  it('a local player can buy the welder and transmission-bench', () => {
    const localState = baseState({ cashYen: 999_999_999, reputationTier: 'local' })
    expect(applyEquipmentPurchase(localState, WELDER.id, CONTEXT).applied).toBe(true)
    expect(applyEquipmentPurchase(localState, TRANSMISSION_BENCH.id, CONTEXT).applied).toBe(true)
  })

  it('engine-crane requires known, not respected - a local player cannot buy it, a known player can', () => {
    expect(ENGINE_CRANE.minReputationTier).toBe('known')
    const localState = baseState({ cashYen: 999_999_999, reputationTier: 'local' })
    expect(applyEquipmentPurchase(localState, ENGINE_CRANE.id, CONTEXT).applied).toBe(false)
    const knownState = baseState({ cashYen: 999_999_999, reputationTier: 'known' })
    expect(applyEquipmentPurchase(knownState, ENGINE_CRANE.id, CONTEXT).applied).toBe(true)
  })
})

describe('applyEquipmentPurchases (bots’ batch path)', () => {
  it('buys every affordable item in order, skipping ones that fail', () => {
    const state = baseState({ cashYen: TIRE_MACHINE.priceYen })
    const result = applyEquipmentPurchases(
      state,
      [{ equipmentId: TIRE_MACHINE.id }, { equipmentId: 'not-a-real-id' }],
      CONTEXT,
    )
    expect(result.state.ownedEquipmentIds).toEqual([TIRE_MACHINE.id])
    expect(result.log).toHaveLength(1)
  })

  it('an empty batch is a no-op', () => {
    const state = baseState()
    const result = applyEquipmentPurchases(state, [], CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})
