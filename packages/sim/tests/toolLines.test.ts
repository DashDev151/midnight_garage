import { TOOL_LINES, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import {
  applyToolUpgrade,
  applyToolUpgrades,
  freshToolTiers,
  toolTierForGroup,
} from '../src/toolLines'

/**
 * Sprint 36: tool lines replace binary equipment ownership. Upgrades are
 * sequential, cash-gated only (no reputation gate), and every line is owned
 * at tier 1 from day one.
 */
const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], TOOL_LINES)

const WHEELS_T2_PRICE = TOOL_LINES.wheels.tiers[1]!.upgradePriceYen
const WHEELS_T3_PRICE = TOOL_LINES.wheels.tiers[2]!.upgradePriceYen

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

describe('a new game starts every tool line at tier 1', () => {
  it('freshToolTiers and createInitialGameState agree: all six lines at 1', () => {
    const state = baseState()
    expect(state.toolTiers).toEqual(freshToolTiers())
    expect(Object.values(state.toolTiers)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('toolTierForGroup reads the persisted map', () => {
    const state = baseState({ toolTiers: { ...freshToolTiers(), body: 3 } })
    expect(toolTierForGroup(state, 'body')).toBe(3)
    expect(toolTierForGroup(state, 'engine')).toBe(1)
  })
})

describe('applyToolUpgrade', () => {
  it('climbs one tier, deducts the next tier price, and logs tool-upgraded', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.log).toEqual([
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: WHEELS_T2_PRICE },
    ])
  })

  it('leaves every other line untouched', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.state.toolTiers).toEqual({ ...freshToolTiers(), wheels: 2 })
  })

  it('refuses when unaffordable, with no state change', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE - 1 })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('refuses when the line is already maxed at tier 3, with no state change', () => {
    const state = baseState({
      cashYen: 999_999_999,
      toolTiers: { ...freshToolTiers(), wheels: 3 },
    })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('has NO reputation gate: an unknown-reputation shop can buy the priciest upgrade', () => {
    const engineT2Price = TOOL_LINES.engine.tiers[1]!.upgradePriceYen
    const state = baseState({ cashYen: engineT2Price, reputationTier: 'unknown' })
    const result = applyToolUpgrade(state, 'engine', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.toolTiers.engine).toBe(2)
  })
})

describe('applyToolUpgrades (bots batch path) - sequential, re-checked per call', () => {
  it('two same-line upgrades the same day apply once when there is cash for one', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE })
    const result = applyToolUpgrades(
      state,
      [{ componentId: 'wheels' }, { componentId: 'wheels' }],
      CONTEXT,
    )
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.state.cashYen).toBe(0)
    expect(result.log).toHaveLength(1)
  })

  it('two same-line upgrades the same day both apply when cash covers both (a genuine 1 -> 3 climb)', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE + WHEELS_T3_PRICE })
    const result = applyToolUpgrades(
      state,
      [{ componentId: 'wheels' }, { componentId: 'wheels' }],
      CONTEXT,
    )
    expect(result.state.toolTiers.wheels).toBe(3)
    expect(result.state.cashYen).toBe(0)
    expect(result.log).toEqual([
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: WHEELS_T2_PRICE },
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 3, priceYen: WHEELS_T3_PRICE },
    ])
  })

  it('an empty batch is a no-op', () => {
    const state = baseState()
    const result = applyToolUpgrades(state, [], CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})
