import {
  TOOL_LINES,
  TOOL_SHOPS,
  type ComponentId,
  type GameState,
  type ToolTier,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import {
  applyToolShopPurchase,
  applyToolUpgrade,
  applyToolUpgrades,
  freshToolTiers,
  isToolShopListed,
  isToolTierListed,
  nextToolTierRepGate,
  ownsToolShopForGroup,
  rollMachineListings,
  toolLevelsFor,
  toolShopForGroup,
  toolShopRepGate,
  toolTierForGroup,
} from '../src/toolLines'
import { createRng } from '../src/rng'

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

/** A live classifieds listing fixture for one line's rung - every test
 * exercising a real purchase needs one, since reputation and cash alone do not
 * make a rung purchasable. */
function listedFor(componentId: ComponentId, tier: ToolTier) {
  return {
    kind: 'tool-tier' as const,
    componentId,
    tier,
    priceYen: TOOL_LINES[componentId].tiers[tier - 1]!.upgradePriceYen,
    postedOnDay: 1,
    expiresOnDay: 10,
  }
}

/** The same fixture for a shop - the classifieds advertise both. */
function listedShop(shopId: string) {
  return {
    kind: 'tool-shop' as const,
    shopId,
    priceYen: TOOL_SHOPS.find((shop) => shop.id === shopId)!.upgradePriceYen,
    postedOnDay: 1,
    expiresOnDay: 10,
  }
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

  describe('the classifieds listing gate', () => {
    it('refuses an otherwise-eligible upgrade (reputation and cash both clear) when nothing is listed, with no state change', () => {
      const state = baseState({ cashYen: WHEELS_T2_PRICE, reputationTier: WHEELS_T2_REP })
      const result = applyToolUpgrade(state, 'wheels', CONTEXT)
      expect(result.applied).toBe(false)
      expect(result.state).toBe(state)
      expect(result.log).toEqual([])
    })

    it('refuses when a listing is live for a different line, or for a shop rather than a rung', () => {
      const forDifferentLine = baseState({
        cashYen: WHEELS_T2_PRICE,
        reputationTier: WHEELS_T2_REP,
        machineListing: listedFor('engine', 2),
      })
      expect(applyToolUpgrade(forDifferentLine, 'wheels', CONTEXT).applied).toBe(false)

      const forTheShop = baseState({
        cashYen: WHEELS_T2_PRICE,
        reputationTier: WHEELS_SHOP_REP,
        machineListing: listedShop(WHEELS_SHOP.id),
      })
      expect(applyToolUpgrade(forTheShop, 'wheels', CONTEXT).applied).toBe(false)
    })

    it('consumes the listing on purchase - a second attempt against the same stale listing is refused', () => {
      const state = baseState({
        cashYen: WHEELS_T2_PRICE + WHEELS_SHOP_PRICE,
        reputationTier: WHEELS_SHOP_REP,
        machineListing: listedFor('wheels', 2),
      })
      const first = applyToolUpgrade(state, 'wheels', CONTEXT)
      expect(first.applied).toBe(true)
      expect(first.state.machineListing).toBeNull()

      // The spent rung listing does not carry over to authorise the shop above it.
      expect(applyToolShopPurchase(first.state, WHEELS_SHOP.id, CONTEXT).applied).toBe(false)
    })
  })
})

describe('applyToolShopPurchase', () => {
  function readyForTheShop(overrides: Partial<GameState> = {}): GameState {
    return baseState({
      cashYen: WHEELS_SHOP_PRICE,
      reputationTier: WHEELS_SHOP_REP,
      machineListing: listedShop(WHEELS_SHOP.id),
      ...overrides,
    })
  }

  it('records the shop, deducts its price, consumes the listing, and logs tool-shop-purchased', () => {
    const state = readyForTheShop()
    const result = applyToolShopPurchase(state, WHEELS_SHOP.id, CONTEXT)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.toolShopsOwned).toEqual([WHEELS_SHOP.id])
    expect(result.state.machineListing).toBeNull()
    expect(result.log).toEqual([
      { type: 'tool-shop-purchased', shopId: WHEELS_SHOP.id, priceYen: WHEELS_SHOP_PRICE },
    ])
  })

  it('lifts every line it covers to level 3 the same day, and no other line', () => {
    const result = applyToolShopPurchase(readyForTheShop(), WHEELS_SHOP.id, CONTEXT)
    const levels = toolLevelsFor(result.state, CONTEXT)
    for (const componentId of WHEELS_SHOP.covers) {
      expect(levels[componentId], componentId).toBe(3)
    }
    expect(levels.engine).toBe(1)
  })

  it('refuses an unknown shop, an already-owned one, an unaffordable one, an unlisted one, and one below its rep floor', () => {
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
      applyToolShopPurchase(readyForTheShop({ machineListing: null }), WHEELS_SHOP.id, CONTEXT)
        .applied,
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

describe('isToolTierListed / isToolShopListed', () => {
  it('matches only the exact componentId+tier of the live rung listing', () => {
    const state = baseState({ machineListing: listedFor('wheels', 2) })
    expect(isToolTierListed(state, 'wheels', 2)).toBe(true)
    expect(isToolTierListed(state, 'wheels', 1)).toBe(false)
    expect(isToolTierListed(state, 'engine', 2)).toBe(false)
    expect(isToolShopListed(state, WHEELS_SHOP.id)).toBe(false)
  })

  it('matches only the exact shop of the live shop listing', () => {
    const state = baseState({ machineListing: listedShop(WHEELS_SHOP.id) })
    expect(isToolShopListed(state, WHEELS_SHOP.id)).toBe(true)
    expect(isToolShopListed(state, 'no-such-shop')).toBe(false)
    expect(isToolTierListed(state, 'wheels', 2)).toBe(false)
  })

  it('both are false when nothing is listed', () => {
    const state = baseState()
    expect(isToolTierListed(state, 'wheels', 2)).toBe(false)
    expect(isToolShopListed(state, WHEELS_SHOP.id)).toBe(false)
  })
})

describe('rollMachineListings', () => {
  it('does nothing while nothing is reputation-eligible yet (a fresh, unranked game)', () => {
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

  it('posts a listing once the gap day is reached, drawn from an eligible not-yet-owned rung, and logs machine-listed', () => {
    // At the rung's own reputation floor no shop is eligible yet, so the draw
    // can only produce a rung.
    const state = baseState({ reputationTier: WHEELS_T2_REP, nextMachineListingDay: 10 })
    const result = rollMachineListings(state, CONTEXT, 10, createRng(1))
    const listing = result.state.machineListing!
    expect(listing).not.toBeNull()
    expect(listing.kind).toBe('tool-tier')
    expect(listing.postedOnDay).toBe(10)
    expect(result.state.nextMachineListingDay).toBeNull()
    expect(result.log).toEqual([
      {
        type: 'machine-listed',
        componentId: listing.kind === 'tool-tier' ? listing.componentId : undefined,
        tier: listing.kind === 'tool-tier' ? listing.tier : undefined,
        priceYen: listing.priceYen,
      },
    ])
  })

  it('draws shops into the same pool once their reputation floor is met, and logs tool-shop-listed for one', () => {
    // Every rung already owned, so the pool is shops alone.
    const state = baseState({
      reputationTier: WHEELS_SHOP_REP,
      toolTiers: {
        engine: 2,
        drivetrain: 2,
        suspension: 2,
        wheels: 2,
        body: 2,
        interior: 2,
      },
      nextMachineListingDay: 10,
    })
    const result = rollMachineListings(state, CONTEXT, 10, createRng(1))
    const listing = result.state.machineListing!
    expect(listing.kind).toBe('tool-shop')
    expect(result.log).toEqual([
      {
        type: 'tool-shop-listed',
        shopId: listing.kind === 'tool-shop' ? listing.shopId : undefined,
        priceYen: listing.priceYen,
      },
    ])
  })

  it('never lists a shop already owned', () => {
    const owned = TOOL_SHOPS.map((shop) => shop.id)
    const state = baseState({
      reputationTier: WHEELS_SHOP_REP,
      toolTiers: {
        engine: 2,
        drivetrain: 2,
        suspension: 2,
        wheels: 2,
        body: 2,
        interior: 2,
      },
      toolShopsOwned: owned,
      nextMachineListingDay: 10,
    })
    const result = rollMachineListings(state, CONTEXT, 10, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.log).toEqual([])
  })

  it('does not post early - before the gap day, stays waiting', () => {
    const state = baseState({ reputationTier: WHEELS_T2_REP, nextMachineListingDay: 10 })
    const result = rollMachineListings(state, CONTEXT, 9, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.state.nextMachineListingDay).toBe(10)
  })

  it('lapses an expired live listing and schedules the next gap, never carrying the old listing past its window', () => {
    const state = baseState({
      reputationTier: WHEELS_SHOP_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = rollMachineListings(state, CONTEXT, 10, createRng(1))
    expect(result.state.machineListing).toBeNull()
    expect(result.state.nextMachineListingDay).not.toBeNull()
    expect(result.state.nextMachineListingDay!).toBeGreaterThan(10)
  })

  it('leaves a still-live (unexpired) listing untouched', () => {
    const state = baseState({
      reputationTier: WHEELS_SHOP_REP,
      machineListing: listedFor('wheels', 2),
    })
    const result = rollMachineListings(state, CONTEXT, 5, createRng(1))
    expect(result.state.machineListing).toEqual(listedFor('wheels', 2))
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
  it('two same-line upgrades the same day apply once when there is cash for one (reputation and a matching listing both already cleared)', () => {
    const state = baseState({
      cashYen: WHEELS_T2_PRICE,
      reputationTier: WHEELS_SHOP_REP,
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
