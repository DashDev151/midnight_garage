import { TOOL_LINES, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import {
  applyToolUpgrade,
  applyToolUpgrades,
  freshToolTiers,
  nextToolTierRepGate,
  toolTierForGroup,
} from '../src/toolLines'

/**
 * Sprint 36: tool lines replace binary equipment ownership. Upgrades are
 * sequential; every line is owned at tier 1 from day one. Sprint 43 added a
 * reputation floor on tiers 2/3 (mirrors the bay gate) - every fixture below
 * that upgrades past tier 1 sets `reputationTier` to the real content
 * requirement rather than a guessed value, so a future JSON retune can't
 * silently desync these tests from the actual gate.
 */
const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], TOOL_LINES)

const WHEELS_T2 = TOOL_LINES.wheels.tiers[1]!
const WHEELS_T3 = TOOL_LINES.wheels.tiers[2]!
const WHEELS_T2_PRICE = WHEELS_T2.upgradePriceYen
const WHEELS_T3_PRICE = WHEELS_T3.upgradePriceYen
const WHEELS_T2_REP = WHEELS_T2.minReputationTier!
const WHEELS_T3_REP = WHEELS_T3.minReputationTier!

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
  it('climbs one tier, deducts the next tier price, and logs tool-upgraded, once reputation clears the gate', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.log).toEqual([
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: WHEELS_T2_PRICE },
    ])
  })

  it('leaves every other line untouched', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.state.toolTiers).toEqual({ ...freshToolTiers(), wheels: 2 })
  })

  it('refuses when unaffordable (reputation already cleared), with no state change', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE - 1, reputationTier: WHEELS_T2_REP })
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

  /**
   * Sprint 43 (maintainer decision, 2026-07-13): tools now gate on cash AND
   * reputation for tiers 2/3 - inverts the old "has NO reputation gate"
   * assertion this describe block used to make.
   */
  it("refuses (reputation gate) below the next tier's rep floor even with unlimited cash, with no state change", () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('succeeds once reputation clears the gate, with cash still checked', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.toolTiers.wheels).toBe(2)
  })
})

describe('nextToolTierRepGate (Sprint 43)', () => {
  it("reports the next tier's own requirement at a fresh, unranked game", () => {
    const state = baseState({ reputationTier: 'unknown' })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBe(WHEELS_T2_REP)
  })

  it('is null once the tier is already met', () => {
    const state = baseState({ reputationTier: WHEELS_T2_REP })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBeNull()
  })

  it('is null once maxCount (tier 3) is reached - nothing left to gate', () => {
    const state = baseState({
      reputationTier: 'unknown',
      toolTiers: { ...freshToolTiers(), wheels: 3 },
    })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBeNull()
  })

  it("reports tier 3's own (higher) requirement once tier 2 is already owned", () => {
    const state = baseState({
      reputationTier: WHEELS_T2_REP,
      toolTiers: { ...freshToolTiers(), wheels: 2 },
    })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBe(WHEELS_T3_REP)
  })
})

describe('applyToolUpgrades (bots batch path) - sequential, re-checked per call', () => {
  it('two same-line upgrades the same day apply once when there is cash for one (reputation already cleared)', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T3_REP })
    const result = applyToolUpgrades(
      state,
      [{ componentId: 'wheels' }, { componentId: 'wheels' }],
      CONTEXT,
    )
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.state.cashYen).toBe(0)
    expect(result.log).toHaveLength(1)
  })

  it('two same-line upgrades the same day both apply when cash AND reputation cover both (a genuine 1 -> 3 climb)', () => {
    const state = baseState({
      cashYen: WHEELS_T2_PRICE + WHEELS_T3_PRICE,
      reputationTier: WHEELS_T3_REP,
    })
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

  it('a same-line upgrade is refused (no state change) while reputation is below the gate, even with cash for it', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: 'unknown' })
    const result = applyToolUpgrades(state, [{ componentId: 'wheels' }], CONTEXT)
    expect(result.state.toolTiers.wheels).toBe(1)
    expect(result.state.cashYen).toBe(WHEELS_T2_PRICE)
    expect(result.log).toEqual([])
  })

  it('an empty batch is a no-op', () => {
    const state = baseState()
    const result = applyToolUpgrades(state, [], CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})
