import { CARS, ECONOMY, TOOL_LINES } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatYen } from '../utils/formatYen'
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

  it('upgradeToolLine deducts cash, takes effect immediately, and logs tool-upgraded, once reputation clears the gate and a listing exists', () => {
    const game = useGameStore()
    game.gameState = {
      ...game.gameState,
      reputationTier: WHEELS_T2.minReputationTier!,
      machineListing: {
        kind: 'tool-tier',
        componentId: 'wheels',
        tier: 2,
        priceYen: WHEELS_T2.upgradePriceYen,
        postedOnDay: game.gameState.day,
        expiresOnDay: game.gameState.day + 3,
      },
    }
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

  /** Tools gate on cash AND reputation from tier 2 upward. */
  it("refuses (reputation gate) below wheels tier 2's rep floor even with unlimited cash", () => {
    const game = useGameStore()
    game.devGiveCash(999_999_999)
    expect(game.upgradeToolLine('wheels')).toBe(false)
    expect(game.gameState.toolTiers.wheels).toBe(1)
  })

  it('refuses once the line is on its top rung', () => {
    const game = useGameStore()
    game.devSetToolTier('wheels', 2)
    const cashBefore = game.cashYen
    expect(game.upgradeToolLine('wheels')).toBe(false)
    expect(game.cashYen).toBe(cashBefore)
    const view = game.toolLineViews.find((v) => v.componentId === 'wheels')!
    expect(view.maxed).toBe(true)
    expect(view.nextTierName).toBeNull()
    expect(view.nextTierPriceYen).toBeNull()
  })

  it('devSetToolTier sets a rung directly, bypassing price', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    game.devSetToolTier('engine', 2)
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.toolTiers.engine).toBe(2)
  })

  it('buying a shop puts every line it covers at level 3, and the views say so', () => {
    const game = useGameStore()
    const shop = game.toolShopViews.find((s) => s.covers.includes('engine'))!
    expect(shop.owned).toBe(false)
    game.gameState = {
      ...game.gameState,
      cashYen: shop.priceYen,
      reputationTier: shop.repGate!,
      machineListing: {
        kind: 'tool-shop',
        shopId: shop.id,
        priceYen: shop.priceYen,
        postedOnDay: game.gameState.day,
        expiresOnDay: game.gameState.day + 3,
      },
    }
    expect(game.buyToolShop(shop.id)).toBe(true)
    expect(game.cashYen).toBe(0)
    expect(game.gameState.toolShopsOwned).toEqual([shop.id])
    expect(game.toolShopViews.find((s) => s.id === shop.id)!.owned).toBe(true)
    expect(game.dayLog).toContainEqual({
      type: 'tool-shop-purchased',
      shopId: shop.id,
      priceYen: shop.priceYen,
    })
    // The rungs are a separate record and none of them moved.
    expect(game.gameState.toolTiers.engine).toBe(1)
  })

  it('toolShopInfo names what the machine shop unlocks, including the NA-to-turbo conversion', () => {
    const game = useGameStore()
    const shop = game.toolShopViews.find((s) => s.covers.includes('engine'))!
    const info = game.toolShopInfo(shop.id)
    expect(info.unlocksNaToTurboConversion).toBe(true)
    expect(info.laborSlotsPerGradeText).toContain(
      String(ECONOMY.energy.energyPerBandStepByToolTier[3]),
    )
    const bodyShop = game.toolShopViews.find((s) => s.covers.includes('body'))!
    expect(game.toolShopInfo(bodyShop.id).unlocksNaToTurboConversion).toBe(false)
  })

  /**
   * The tier-2 rung of every group carries a
   * one-line rental notice with the group's per-job fee while the machine is
   * unowned, and the line drops once it is owned. Tier 1 never carries it.
   */
  it('toolTierInfo surfaces the tier-2 rental fee until owned, then drops the line', () => {
    const game = useGameStore()
    // A fresh game owns every line at tier 1, so tier 2 is unowned everywhere.
    for (const componentId of ['suspension', 'body', 'interior', 'engine'] as const) {
      const info = game.toolTierInfo(componentId, 2)
      expect(info.rentalFeeText).toContain(
        formatYen(ECONOMY.machineShopAssist.feeYenByGroup[componentId]),
      )
    }
    // Owning the machine drops the line; tier 1 never shows it.
    game.devSetToolTier('suspension', 2)
    expect(game.toolTierInfo('suspension', 2).rentalFeeText).toBeNull()
    expect(game.toolTierInfo('body', 1).rentalFeeText).toBeNull()
  })

  it('repair() proceeds at tier 1 with nothing upgraded - no ownership gate exists', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')

    // Every REMOVABLE part is bench work now, so most groups are refused
    // on-car whatever the tool tier and can no longer prove an ABSENCE of a
    // tier gate. `bodywork`/`paint` cannot prove it either: both are derived
    // body value carriers (`bodyPipeline.ts`) a direct repair-zone job never
    // touches. That leaves the chassis, addressed per part, which exercises
    // the exact same claim. A tier-1 repair finishes at fine, so target
    // fine - the reachable ceiling. The claim under test is unchanged: no
    // OWNERSHIP gate exists, a fine repair just proceeds at tier 1. The
    // chassis is a body signature slot, which needs the line hired for today
    // - a separate, intentional machine-line gate, not the ownership gate
    // this test is about.
    game.hireMachineLine('body')
    game.repair(car.id, 'body', 'fine', 'chassis')
    // A single day's labor may be enough to finish the job outright (in
    // which case it's already gone from the in-progress list) - either an
    // open job or a completed repair proves no gate refused it.
    const detail = game.carDetail(car.id)
    const jobOpened = detail?.jobs.some((j) => j.componentId === 'body') ?? false
    const chassisBand = game.gameState.ownedCars[0]!.parts.chassis.installed?.band
    const jobFinished = chassisBand === 'fine' || chassisBand === 'mint'
    expect(jobOpened || jobFinished).toBe(true)
  })
})
