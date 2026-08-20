import { TOOL_LINES, TOOL_SHOPS, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { hireMachineLineGateReason, resolveHireToolLine } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { buyLiftGateReason, resolveBuyLift } from '../src/repairJobs'
import {
  applyToolShopPurchase,
  applyToolUpgrade,
  applyToolUpgrades,
  freshToolTiers,
  nextToolTierRepGate,
  ownsToolShopForGroup,
  toolLevelsFor,
  toolShopForGroup,
  toolShopRepGate,
  toolTierForGroup,
} from '../src/toolLines'

/**
 * Tool lines replace binary equipment ownership. Every line is owned at tier 1
 * from day one and climbs one rung; above that rung there are no more rungs,
 * only the shop covering that line. A reputation floor gates tier 2 and every
 * shop (mirroring the bay gate) - every fixture below that buys anything reads
 * the real content requirement rather than a guessed value, so a future JSON
 * retune cannot silently desync these tests from the actual gate.
 */
const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], TOOL_LINES)

const WHEELS_T2 = TOOL_LINES.wheels.tiers[1]!
const WHEELS_T2_PRICE = WHEELS_T2.upgradePriceYen
const WHEELS_T2_REP = WHEELS_T2.minReputationTier!

/** The shop covering the wheels line - the rung above tier 2 for that line,
 * and the one thing that takes it to level 3. */
const WHEELS_SHOP = TOOL_SHOPS.find((shop) => shop.covers.includes('wheels'))!
const WHEELS_SHOP_PRICE = WHEELS_SHOP.upgradePriceYen
const WHEELS_SHOP_REP = WHEELS_SHOP.minReputationTier

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

describe('a new game starts every tool line at tier 1 and owns no shop', () => {
  it('freshToolTiers and createInitialGameState agree: all six lines at 1', () => {
    const state = baseState()
    expect(state.toolTiers).toEqual(freshToolTiers())
    expect(Object.values(state.toolTiers)).toEqual([1, 1, 1, 1, 1, 1])
    expect(state.toolShopsOwned).toEqual([])
  })

  it('toolTierForGroup reads the persisted map', () => {
    const state = baseState({ toolTiers: { ...freshToolTiers(), body: 2 } })
    expect(toolTierForGroup(state, 'body')).toBe(2)
    expect(toolTierForGroup(state, 'engine')).toBe(1)
  })
})

describe('the shop is the top of the ladder', () => {
  it('covers every line exactly once, so each line has one shop and no line has two', () => {
    const covered = TOOL_SHOPS.flatMap((shop) => shop.covers)
    expect(new Set(covered).size).toBe(covered.length)
    expect(covered).toHaveLength(6)
    for (const componentId of covered) {
      expect(toolShopForGroup(componentId, CONTEXT).covers).toContain(componentId)
    }
  })

  it('toolLevelsFor reads the rung until the covering shop is owned, then 3 for every line it covers', () => {
    const rungsOnly = baseState({ toolTiers: { ...freshToolTiers(), wheels: 2 } })
    expect(toolLevelsFor(rungsOnly, CONTEXT).wheels).toBe(2)
    expect(ownsToolShopForGroup(rungsOnly, 'wheels', CONTEXT)).toBe(false)

    const withShop = baseState({ toolShopsOwned: [WHEELS_SHOP.id] })
    const levels = toolLevelsFor(withShop, CONTEXT)
    for (const componentId of WHEELS_SHOP.covers) {
      expect(levels[componentId], componentId).toBe(3)
      expect(ownsToolShopForGroup(withShop, componentId, CONTEXT)).toBe(true)
    }
    for (const componentId of [
      'engine',
      'drivetrain',
      'suspension',
      'wheels',
      'body',
      'interior',
    ] as const) {
      if (WHEELS_SHOP.covers.includes(componentId)) continue
      expect(levels[componentId], componentId).toBe(1)
    }
  })

  it('a shop never moves a line rung - the two purchases are separate records', () => {
    const withShop = baseState({ toolShopsOwned: [WHEELS_SHOP.id] })
    expect(withShop.toolTiers).toEqual(freshToolTiers())
  })
})

describe('applyToolUpgrade', () => {
  it('climbs one tier, deducts the next tier price, and logs tool-upgraded, on reputation and cash alone, once reputation clears the gate', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
    const result = applyToolUpgrade(state, 'wheels', CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.log).toEqual([
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: WHEELS_T2_PRICE },
    ])
  })

  it('D-A2: reputation and cash are the whole gate - this schema carries no listing state for a purchase to check', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
    expect('machineListing' in state).toBe(false)
    expect(applyToolUpgrade(state, 'wheels', CONTEXT).applied).toBe(true)
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

  it('refuses when the line is already on its top rung, with no state change', () => {
    const state = baseState({
      cashYen: 999_999_999,
      reputationTier: WHEELS_SHOP_REP,
      toolTiers: { ...freshToolTiers(), wheels: 2 },
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
})

describe('applyToolShopPurchase', () => {
  function readyForTheShop(overrides: Partial<GameState> = {}): GameState {
    return baseState({
      cashYen: WHEELS_SHOP_PRICE,
      reputationTier: WHEELS_SHOP_REP,
      ...overrides,
    })
  }

  it('records the shop, deducts its price, and logs tool-shop-purchased', () => {
    const state = readyForTheShop()
    const result = applyToolShopPurchase(state, WHEELS_SHOP.id, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.toolShopsOwned).toEqual([WHEELS_SHOP.id])
    expect(result.log).toEqual([
      { type: 'tool-shop-purchased', shopId: WHEELS_SHOP.id, priceYen: WHEELS_SHOP_PRICE },
    ])
  })

  it('D-A2: reputation and cash are the whole gate on the shop too - no listing state to check', () => {
    const state = readyForTheShop()
    expect('machineListing' in state).toBe(false)
    expect(applyToolShopPurchase(state, WHEELS_SHOP.id, CONTEXT).applied).toBe(true)
  })

  it('lifts every line it covers to level 3 the same day, and no other line', () => {
    const result = applyToolShopPurchase(readyForTheShop(), WHEELS_SHOP.id, CONTEXT)
    const levels = toolLevelsFor(result.state, CONTEXT)
    for (const componentId of WHEELS_SHOP.covers) {
      expect(levels[componentId], componentId).toBe(3)
    }
    expect(levels.engine).toBe(1)
  })

  it('refuses an unknown shop, an already-owned one, an unaffordable one, and one below its rep floor', () => {
    expect(applyToolShopPurchase(readyForTheShop(), 'no-such-shop', CONTEXT).applied).toBe(false)
    expect(
      applyToolShopPurchase(
        readyForTheShop({ toolShopsOwned: [WHEELS_SHOP.id] }),
        WHEELS_SHOP.id,
        CONTEXT,
      ).applied,
    ).toBe(false)
    expect(
      applyToolShopPurchase(
        readyForTheShop({ cashYen: WHEELS_SHOP_PRICE - 1 }),
        WHEELS_SHOP.id,
        CONTEXT,
      ).applied,
    ).toBe(false)
    expect(
      applyToolShopPurchase(readyForTheShop({ reputationTier: 'unknown' }), WHEELS_SHOP.id, CONTEXT)
        .applied,
    ).toBe(false)
  })

  it('needs no rung below it - a line still at tier 1 reaches level 3 on the shop alone', () => {
    const state = readyForTheShop()
    expect(state.toolTiers.wheels).toBe(1)
    const result = applyToolShopPurchase(state, WHEELS_SHOP.id, CONTEXT)
    expect(toolLevelsFor(result.state, CONTEXT).wheels).toBe(3)
  })
})

describe('the reputation gates', () => {
  it("reports the next rung's own requirement at a fresh, unranked game", () => {
    const state = baseState({ reputationTier: 'unknown' })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBe(WHEELS_T2_REP)
  })

  it('is null once the rung requirement is already met', () => {
    const state = baseState({ reputationTier: WHEELS_T2_REP })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBeNull()
  })

  it('is null once the top rung is reached - the shop above it carries its own gate instead', () => {
    const state = baseState({
      reputationTier: 'unknown',
      toolTiers: { ...freshToolTiers(), wheels: 2 },
    })
    expect(nextToolTierRepGate(state, 'wheels', CONTEXT)).toBeNull()
    expect(toolShopRepGate(state, WHEELS_SHOP)).toBe(WHEELS_SHOP_REP)
  })

  it("reports the shop's own requirement until it is met, then nothing", () => {
    expect(toolShopRepGate(baseState({ reputationTier: 'unknown' }), WHEELS_SHOP)).toBe(
      WHEELS_SHOP_REP,
    )
    expect(toolShopRepGate(baseState({ reputationTier: WHEELS_SHOP_REP }), WHEELS_SHOP)).toBeNull()
  })
})

describe('applyToolUpgrades (bots batch path) - sequential, re-checked per call', () => {
  it('two same-line upgrades the same day apply once when there is cash for one (reputation already cleared)', () => {
    const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_SHOP_REP })
    const result = applyToolUpgrades(
      state,
      [{ componentId: 'wheels' }, { componentId: 'wheels' }],
      CONTEXT,
    )
    expect(result.state.toolTiers.wheels).toBe(2)
    expect(result.state.cashYen).toBe(0)
    expect(result.log).toHaveLength(1)
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

describe("the day's hire cap (economy.toolHire.maxHiredLinesPerDay)", () => {
  const ENGINE_FEE = CONTEXT.economy.toolHire.feeYenByGroup.engine
  const DRIVETRAIN_FEE = CONTEXT.economy.toolHire.feeYenByGroup.drivetrain

  it('hires the first line of the day on cash alone - nothing else hired yet, so the cap is not in play', () => {
    const state = baseState({ cashYen: ENGINE_FEE })
    expect(hireMachineLineGateReason(state, 'engine', CONTEXT)).toBeNull()
    const result = resolveHireToolLine(state, 'engine', CONTEXT)
    expect(result.outcome).toBe('hired')
    expect(result.state.cashYen).toBe(0)
    expect(result.state.machineHirePaidDayByGroup?.engine).toBe(state.day)
  })

  it("refuses a second, DIFFERENT line the same day once the day's one hire is spent, reason 'hire-cap' - cash cannot fix it", () => {
    const state = baseState({ cashYen: ENGINE_FEE + DRIVETRAIN_FEE })
    const afterEngine = resolveHireToolLine(state, 'engine', CONTEXT)
    expect(afterEngine.outcome).toBe('hired')
    expect(hireMachineLineGateReason(afterEngine.state, 'drivetrain', CONTEXT)).toBe('hire-cap')
    const second = resolveHireToolLine(afterEngine.state, 'drivetrain', CONTEXT)
    expect(second.outcome).toBe('hire-cap')
    expect(second.state).toBe(afterEngine.state) // refused: no charge, no state change
  })

  it('re-hiring the SAME line the same day stays a silent success - it never counts against its own cap', () => {
    const state = baseState({ cashYen: ENGINE_FEE })
    const first = resolveHireToolLine(state, 'engine', CONTEXT)
    expect(first.outcome).toBe('hired')
    expect(hireMachineLineGateReason(first.state, 'engine', CONTEXT)).toBeNull()
    const second = resolveHireToolLine(first.state, 'engine', CONTEXT)
    expect(second.outcome).toBe('hired')
    expect(second.state.cashYen).toBe(first.state.cashYen) // no second charge
    expect(second.log).toEqual([])
  })
})

describe('the lift purchase gates on reputation then cash, the same order and shape as a dyno', () => {
  const LIFT_PRICE = CONTEXT.economy.lift.purchasePriceYen
  const LIFT_REP = CONTEXT.economy.lift.minReputationTier

  it('refuses below the reputation floor even with unlimited cash, with no state change', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    expect(buyLiftGateReason(state, CONTEXT)).toBe('reputation')
    const result = resolveBuyLift(state, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses when unaffordable, reputation already cleared, with no state change', () => {
    const state = baseState({ cashYen: LIFT_PRICE - 1, reputationTier: LIFT_REP })
    expect(buyLiftGateReason(state, CONTEXT)).toBe('no-cash')
    const result = resolveBuyLift(state, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('buys the lift on reputation and cash alone, deducting the price and marking it owned', () => {
    const state = baseState({ cashYen: LIFT_PRICE, reputationTier: LIFT_REP })
    expect(buyLiftGateReason(state, CONTEXT)).toBeNull()
    const result = resolveBuyLift(state, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.lift.owned).toBe(true)
  })

  it('is a silent no-op once already owned, whatever cash or reputation says', () => {
    const state = baseState({
      cashYen: 999_999_999,
      reputationTier: LIFT_REP,
      lift: { owned: true, hirePaidDay: null },
    })
    expect(buyLiftGateReason(state, CONTEXT)).toBe('already-owned')
    const result = resolveBuyLift(state, CONTEXT)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })
})
