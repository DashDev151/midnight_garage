import {
  TOOL_LINES,
  type ComponentId,
  type GameState,
  type ToolTier,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import {
  applyToolUpgrade,
  applyToolUpgrades,
  freshToolTiers,
  isToolTierListed,
  nextToolTierRepGate,
  rollMachineListings,
  toolTierForGroup,
} from '../src/toolLines'
import { createRng } from '../src/rng'

/**
 * Tool lines replace binary equipment ownership. Upgrades are
 * sequential; every line is owned at tier 1 from day one. A reputation
 * floor gates tiers 2/3 (mirrors the bay gate) - every fixture below
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

/** A live classifieds listing fixture - every test exercising a real
 * purchase needs one, since reputation/cash alone don't make a tier
 * purchasable. */
function listedFor(componentId: ComponentId, tier: ToolTier) {
  return {
    componentId,
    tier,
    priceYen: TOOL_LINES[componentId].tiers[tier - 1]!.upgradePriceYen,
    postedOnDay: 1,
    expiresOnDay: 10,
  }
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
    const state = baseState({
      cashYen: WHEELS_T2_PRICE,
      reputationTier: WHEELS_T2_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.log).toEqual([
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: WHEELS_T2_PRICE },
    ])
  })

  it('leaves every other line untouched', () => {
    const state = baseState({
      cashYen: WHEELS_T2_PRICE,
      reputationTier: WHEELS_T2_REP,
      machineListing: listedFor('wheels', 2),
    })
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

  it("refuses (reputation gate) below the next tier's rep floor even with unlimited cash, with no state change", () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('succeeds once reputation clears the gate, with cash still checked', () => {
    const state = baseState({
      cashYen: WHEELS_T2_PRICE,
      reputationTier: WHEELS_T2_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.toolTiers.wheels).toBe(2)
  })

  describe('the classifieds listing gate (Sprint 52 decision 2)', () => {
    it('refuses an otherwise-eligible upgrade (reputation and cash both clear) when nothing is listed, with no state change', () => {
      const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
      const result = applyToolUpgrade(state, 'wheels', CONTEXT)
      expect(result.applied).toBe(false)
      expect(result.state).toBe(state)
      expect(result.log).toEqual([])
    })

    it('refuses when a listing is live for a different line or a different tier', () => {
      const forDifferentLine = baseState({
        cashYen: WHEELS_T2_PRICE,
        reputationTier: WHEELS_T2_REP,
        machineListing: listedFor('engine', 2),
      })
      expect(applyToolUpgrade(forDifferentLine, 'wheels', CONTEXT).applied).toBe(false)

      const forDifferentTier = baseState({
        cashYen: WHEELS_T2_PRICE,
        reputationTier: WHEELS_T3_REP,
        toolTiers: { ...freshToolTiers(), wheels: 2 },
        machineListing: listedFor('wheels', 2),
      })
      expect(applyToolUpgrade(forDifferentTier, 'wheels', CONTEXT).applied).toBe(false)
    })

    it('consumes the listing on purchase - a second attempt against the same stale listing is refused', () => {
      const state = baseState({
        cashYen: WHEELS_T2_PRICE,
        reputationTier: WHEELS_T2_REP,
        machineListing: listedFor('wheels', 2),
      })
      const first = applyToolUpgrade(state, 'wheels', CONTEXT)
      expect(first.applied).toBe(true)
      expect(first.state.machineListing).toBeNull()

      // Same line, now needing tier 3 - the tier-2 listing that was just
      // spent doesn't carry over to authorize the next tier too.
      const second = applyToolUpgrade(
        { ...first.state, cashYen: WHEELS_T3_PRICE, reputationTier: WHEELS_T3_REP },
        'wheels',
        CONTEXT,
      )
      expect(second.applied).toBe(false)
    })
  })
})

describe('isToolTierListed', () => {
  it('matches only the exact componentId+tier of the live listing', () => {
    const state = baseState({ machineListing: listedFor('wheels', 2) })
    expect(isToolTierListed(state, 'wheels', 2)).toBe(true)
    expect(isToolTierListed(state, 'wheels', 3)).toBe(false)
    expect(isToolTierListed(state, 'engine', 2)).toBe(false)
  })

  it('is false when nothing is listed', () => {
    const state = baseState()
    expect(isToolTierListed(state, 'wheels', 2)).toBe(false)
  })
})

describe('rollMachineListings (Sprint 52 decision 2)', () => {
  it('does nothing while no line is reputation-eligible yet (a fresh, unranked game)', () => {
    const state = baseState({ reputationTier: 'unknown' })
    const result = rollMachineListings(state, CONTEXT, 2, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.state.nextMachineListingDay).toBeNull()
    expect(result.log).toEqual([])
  })

  it('starts the gap timer the first day something becomes eligible, without posting a listing that same day', () => {
    const state = baseState({ reputationTier: WHEELS_T2_REP })
    const result = rollMachineListings(state, CONTEXT, 5, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.state.nextMachineListingDay).not.toBeNull()
    expect(result.state.nextMachineListingDay!).toBeGreaterThan(5)
    expect(result.log).toEqual([])
  })

  it('posts a listing once the gap day is reached, drawn from an eligible not-yet-owned tier, and logs machine-listed', () => {
    const state = baseState({ reputationTier: WHEELS_T2_REP, nextMachineListingDay: 10 })
    const result = rollMachineListings(state, CONTEXT, 10, createRng(1))
    expect(result.state.machineListing).not.toBeNull()
    expect(result.state.machineListing!.postedOnDay).toBe(10)
    expect(result.state.nextMachineListingDay).toBeNull()
    expect(result.log).toEqual([
      {
        type: 'machine-listed',
        componentId: result.state.machineListing!.componentId,
        tier: result.state.machineListing!.tier,
        priceYen: result.state.machineListing!.priceYen,
      },
    ])
  })

  it('does not post early - before the gap day, stays waiting', () => {
    const state = baseState({ reputationTier: WHEELS_T2_REP, nextMachineListingDay: 10 })
    const result = rollMachineListings(state, CONTEXT, 9, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.state.nextMachineListingDay).toBe(10)
  })

  it('lapses an expired live listing and schedules the next gap, never carrying the old listing past its window', () => {
    const state = baseState({
      reputationTier: WHEELS_T3_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = rollMachineListings(state, CONTEXT, 10, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.state.nextMachineListingDay).not.toBeNull()
    expect(result.state.nextMachineListingDay!).toBeGreaterThan(10)
  })

  it('leaves a still-live (unexpired) listing untouched', () => {
    const state = baseState({
      reputationTier: WHEELS_T3_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = rollMachineListings(state, CONTEXT, 5, createRng(1))
    expect(result.state.machineListing).toEqual(listedFor('wheels', 2))
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
  it('two same-line upgrades the same day apply once when there is cash for one (reputation and a matching listing both already cleared)', () => {
    const state = baseState({
      cashYen: WHEELS_T2_PRICE,
      reputationTier: WHEELS_T3_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = applyToolUpgrades(
      state,
      [{ componentId: 'wheels' }, { componentId: 'wheels' }],
      CONTEXT,
    )
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.state.cashYen).toBe(0)
    expect(result.log).toHaveLength(1)
  })

  /**
   * A same-day 1 -> 3 double climb is structurally impossible: buying
   * tier 2 consumes the ONE live listing, and no new listing appears
   * mid-day (only the day-boundary `rollMachineListings` step posts one,
   * once) - see `applyToolUpgrade`'s own doc comment.
   */
  it('a same-day 1 -> 3 double climb no longer happens even with cash AND reputation covering both - only the currently-listed tier applies', () => {
    const state = baseState({
      cashYen: WHEELS_T2_PRICE + WHEELS_T3_PRICE,
      reputationTier: WHEELS_T3_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = applyToolUpgrades(
      state,
      [{ componentId: 'wheels' }, { componentId: 'wheels' }],
      CONTEXT,
    )
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.state.cashYen).toBe(WHEELS_T3_PRICE)
    expect(result.state.machineListing).toBeNull()
    expect(result.log).toEqual([
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: WHEELS_T2_PRICE },
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
