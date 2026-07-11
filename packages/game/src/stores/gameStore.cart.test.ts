import { PARTS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { useGameStore } from './gameStore'

const cheapest = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!
const secondCheapest = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[1]!

describe('the parts-market cart (Sprint 14)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts empty', () => {
    const game = useGameStore()
    expect(game.cartItems).toEqual([])
    expect(game.cartStandardTotalYen).toBe(0)
  })

  it('addToCart spends nothing - the core misclick safeguard', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    game.addToCart(cheapest.id)
    expect(game.cashYen).toBe(cashBefore)
    expect(game.cartItems).toEqual([
      { part: cheapest, quantity: 1, subtotalYen: cheapest.priceYen },
    ])
  })

  it('adding the same part twice aggregates into one line with quantity 2', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.addToCart(cheapest.id)
    expect(game.cartItems).toHaveLength(1)
    expect(game.cartItems[0]).toMatchObject({ quantity: 2, subtotalYen: cheapest.priceYen * 2 })
  })

  it('removeFromCart drops one unit, costs nothing, needs no confirmation', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.addToCart(cheapest.id)
    const cashBefore = game.cashYen
    game.removeFromCart(cheapest.id)
    expect(game.cashYen).toBe(cashBefore)
    expect(game.cartItems[0]).toMatchObject({ quantity: 1 })
    game.removeFromCart(cheapest.id)
    expect(game.cartItems).toEqual([])
  })

  it('removeFromCart on an empty cart is a no-op', () => {
    const game = useGameStore()
    expect(() => game.removeFromCart(cheapest.id)).not.toThrow()
    expect(game.cartItems).toEqual([])
  })

  it('addToCart ignores an unknown part id', () => {
    const game = useGameStore()
    game.addToCart('no-such-part')
    expect(game.cartItems).toEqual([])
  })

  it('cartExpressTotalYen is higher than cartStandardTotalYen by the surcharge', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.addToCart(secondCheapest.id)
    expect(game.cartExpressTotalYen).toBeGreaterThan(game.cartStandardTotalYen)
  })

  it('checkoutCart(standard) charges sticker price, orders (not buys) every item, and clears the cart', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.addToCart(secondCheapest.id)
    const cashBefore = game.cashYen
    const expectedTotal = game.cartStandardTotalYen

    const result = game.checkoutCart('standard')

    expect(result).toEqual({ boughtCount: 2, remainingCount: 0 })
    expect(game.cashYen).toBe(cashBefore - expectedTotal)
    expect(game.gameState.partInventory).toHaveLength(0) // not delivered yet
    expect(game.gameState.pendingPartOrders).toHaveLength(2)
    expect(game.cartItems).toEqual([])
  })

  it('checkoutCart(express) charges the surcharged total and buys instantly', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    const cashBefore = game.cashYen
    const expectedTotal = game.cartExpressTotalYen

    const result = game.checkoutCart('express')

    expect(result).toEqual({ boughtCount: 1, remainingCount: 0 })
    expect(game.cashYen).toBe(cashBefore - expectedTotal)
    expect(game.gameState.partInventory).toHaveLength(1)
    expect(game.gameState.pendingPartOrders).toHaveLength(0)
  })

  it('checkoutCart leaves unaffordable items in the cart rather than failing all-or-nothing', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.devGiveCash(-game.cashYen) // drain to zero - nothing is affordable now
    const result = game.checkoutCart('standard')
    expect(result).toEqual({ boughtCount: 0, remainingCount: 1 })
    expect(game.cartItems).toHaveLength(1)
  })

  it('a pending standard order is delivered once its arrival day passes', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.checkoutCart('standard')
    expect(game.pendingPartOrders).toHaveLength(1)
    for (let i = 0; i < 10 && game.gameState.pendingPartOrders.length > 0; i++) game.endDay()
    expect(game.gameState.pendingPartOrders).toHaveLength(0)
    expect(game.gameState.partInventory.some((pi) => pi.partId === cheapest.id)).toBe(true)
  })

  it('the cart survives a save round-trip (decision 3: persistent, not ephemeral)', () => {
    const game = useGameStore()
    game.addToCart(cheapest.id)
    game.addToCart(secondCheapest.id)
    const decoded = decodeSave(encodeSave(game.gameState))
    expect(decoded.cartPartIds).toEqual(game.gameState.cartPartIds)
  })
})
