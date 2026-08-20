import { ECONOMY } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

describe('the two-post lift in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new shop has no lift, and nothing hired', () => {
    const game = useGameStore()
    expect(game.liftOwned).toBe(false)
    expect(game.liftAvailableToday).toBe(false)
    expect(game.liftHireFeeYen).toBe(ECONOMY.lift.hireFeeYen)
    expect(game.liftPurchasePriceYen).toBe(ECONOMY.lift.purchasePriceYen)
    expect(game.liftMinReputationTier).toBe(ECONOMY.lift.minReputationTier)
  })

  it('gates the purchase on reputation, then on cash, then succeeds and owns it outright', () => {
    const game = useGameStore()
    game.devSetReputationTier('unknown')
    expect(game.liftPurchaseGateReason).toBe('reputation')
    expect(game.buyLift()).toBe(false)
    expect(game.liftOwned).toBe(false)

    game.devSetReputationTier(ECONOMY.lift.minReputationTier)
    expect(game.liftPurchaseGateReason).toBe('no-cash')
    expect(game.buyLift()).toBe(false)

    game.devGiveCash(ECONOMY.lift.purchasePriceYen)
    expect(game.liftPurchaseGateReason).toBeNull()
    const cashBefore = game.cashYen
    expect(game.buyLift()).toBe(true)
    expect(game.liftOwned).toBe(true)
    expect(game.liftAvailableToday).toBe(true)
    expect(game.cashYen).toBe(cashBefore - ECONOMY.lift.purchasePriceYen)
    expect(game.dayLog).toContainEqual({
      type: 'equipment-purchased',
      equipmentId: 'lift',
      priceYen: ECONOMY.lift.purchasePriceYen,
    })
  })

  it('buying again once owned refuses (already-owned) rather than charging a second time', () => {
    const game = useGameStore()
    game.devSetReputationTier(ECONOMY.lift.minReputationTier)
    game.devGiveCash(ECONOMY.lift.purchasePriceYen)
    expect(game.buyLift()).toBe(true)

    const cashBefore = game.cashYen
    expect(game.liftPurchaseGateReason).toBe('already-owned')
    expect(game.buyLift()).toBe(false)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('hiring for the day charges the fee and makes it available; hiring again the same day is free', () => {
    const game = useGameStore()
    game.devGiveCash(ECONOMY.lift.hireFeeYen)
    const cashBefore = game.cashYen
    expect(game.hireLift()).toBe(true)
    expect(game.liftAvailableToday).toBe(true)
    expect(game.liftOwned).toBe(false)
    expect(game.cashYen).toBe(cashBefore - ECONOMY.lift.hireFeeYen)

    const cashAfterFirstHire = game.cashYen
    expect(game.hireLift()).toBe(true)
    expect(game.cashYen).toBe(cashAfterFirstHire)
  })

  it('refuses the hire on short cash, and charges nothing for the refusal', () => {
    const game = useGameStore()
    game.devGiveCash(-game.cashYen) // drain to zero
    expect(game.hireLift()).toBe(false)
    expect(game.liftAvailableToday).toBe(false)
  })

  it('owning it ends the hire fee for good: buying after hiring stops the charge from ever repeating', () => {
    const game = useGameStore()
    game.devGiveCash(ECONOMY.lift.hireFeeYen)
    expect(game.hireLift()).toBe(true)
    expect(game.liftAvailableToday).toBe(true)

    game.devSetReputationTier(ECONOMY.lift.minReputationTier)
    game.devGiveCash(ECONOMY.lift.purchasePriceYen)
    expect(game.buyLift()).toBe(true)
    expect(game.liftOwned).toBe(true)

    // A fresh day: ownership carries the availability across the boundary,
    // and hiring again is a free no-op rather than a second charge.
    game.gameState = { ...game.gameState, day: game.gameState.day + 1 }
    const cashBefore = game.cashYen
    expect(game.liftAvailableToday).toBe(true)
    expect(game.hireLift()).toBe(true)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('never counts against the tool-line hire cap - it is bay equipment, not a line on the board', () => {
    const game = useGameStore()
    game.devGiveCash(ECONOMY.lift.hireFeeYen)
    expect(game.hireCapReachedToday).toBe(false)
    expect(game.hireLift()).toBe(true)
    expect(game.hireCapReachedToday).toBe(false)
    // A tool line still hires today - the lift spent none of the day's
    // one-line allowance.
    expect(game.hireMachineLine('body')).toBe(true)
  })
})
