import { CARS, TOOL_LINES } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/** The cheapest tier-2 upgrade in the shipped content (Y150,000) - a fresh
 * game's starting cash comfortably affords it, so these tests aren't
 * entangled with the economy tuning. */
const WHEELS_T2 = TOOL_LINES.wheels.tiers[1]!

describe('tool lines in the store (Sprint 36)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new game owns every line at tier 1; the views name all six ladders', () => {
    const game = useGameStore()
    expect(game.toolLineViews).toHaveLength(6)
    for (const view of game.toolLineViews) {
      expect(view.currentTier).toBe(1)
      expect(view.currentTierName).toBe(TOOL_LINES[view.componentId].tiers[0]!.displayName)
      expect(view.maxed).toBe(false)
      expect(view.nextTierName).toBe(TOOL_LINES[view.componentId].tiers[1]!.displayName)
      expect(view.nextTierPriceYen).toBe(TOOL_LINES[view.componentId].tiers[1]!.upgradePriceYen)
      // A real display label, never a raw component id.
      expect(view.componentLabel).not.toBe(view.componentId)
    }
  })

  it('upgradeToolLine deducts cash, takes effect immediately, and logs tool-upgraded, once reputation clears the gate', () => {
    const game = useGameStore()
    game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
    const cashBefore = game.cashYen
    expect(game.upgradeToolLine('wheels')).toBe(true)
    expect(game.cashYen).toBe(cashBefore - WHEELS_T2.upgradePriceYen)
    expect(game.gameState.toolTiers.wheels).toBe(2)
    const view = game.toolLineViews.find((v) => v.componentId === 'wheels')!
    expect(view.currentTier).toBe(2)
    expect(view.currentTierName).toBe(WHEELS_T2.displayName)
    expect(game.dayLog).toContainEqual({
      type: 'tool-upgraded',
      componentId: 'wheels',
      toTier: 2,
      priceYen: WHEELS_T2.upgradePriceYen,
    })
  })

  it('refuses when unaffordable (reputation already cleared), with no state change', () => {
    const game = useGameStore()
    game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
    game.devGiveCash(-game.cashYen) // drain to zero
    expect(game.upgradeToolLine('wheels')).toBe(false)
    expect(game.gameState.toolTiers.wheels).toBe(1)
  })

  /**
   * Sprint 43 (maintainer decision, 2026-07-13): tools now gate on cash AND
   * reputation for tiers 2/3.
   */
  it("refuses (reputation gate) below wheels tier 2's rep floor even with unlimited cash", () => {
    const game = useGameStore()
    game.devGiveCash(999_999_999)
    expect(game.upgradeToolLine('wheels')).toBe(false)
    expect(game.gameState.toolTiers.wheels).toBe(1)
  })

  it('refuses once the line is maxed at tier 3', () => {
    const game = useGameStore()
    game.devSetToolTier('wheels', 3)
    const cashBefore = game.cashYen
    expect(game.upgradeToolLine('wheels')).toBe(false)
    expect(game.cashYen).toBe(cashBefore)
    const view = game.toolLineViews.find((v) => v.componentId === 'wheels')!
    expect(view.maxed).toBe(true)
    expect(view.nextTierName).toBeNull()
    expect(view.nextTierPriceYen).toBeNull()
  })

  it('devSetToolTier sets a tier directly, bypassing price', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    game.devSetToolTier('engine', 3)
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.toolTiers.engine).toBe(3)
  })

  it('repair() proceeds at tier 1 with nothing upgraded - no ownership gate exists', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')

    game.repair(car.id, 'wheels')
    // A single day's labor may be enough to finish the job outright (in
    // which case it's already gone from the in-progress list) - either an
    // open job or a completed repair proves no gate refused it.
    const detail = game.carDetail(car.id)
    const jobOpened = detail?.jobs.some((j) => j.componentId === 'wheels') ?? false
    const jobFinished = detail?.groupBands.wheels === 'mint'
    expect(jobOpened || jobFinished).toBe(true)
  })
})
