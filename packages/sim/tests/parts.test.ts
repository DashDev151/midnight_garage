import { BUYERS, CARS, HIDDEN_ISSUES, PARTS, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { PARTS_EXPRESS_SURCHARGE_FRACTION, PARTS_STANDARD_DELIVERY_DAYS } from '../src/constants'
import { resolveBuyPart, resolvePartDeliveries } from '../src/parts'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
const CHEAPEST = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!
const CHEAPEST_EXPRESS_PRICE_YEN = Math.round(
  CHEAPEST.priceYen * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION),
)

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 10_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    activeListings: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    ...overrides,
  }
}

describe('resolveBuyPart — express (Sprint 11 instant resolver, surcharge added Sprint 14)', () => {
  it('deducts the surcharged price and adds an immediately-installable part instance', () => {
    const state = baseState()
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'express')
    expect(result.state.cashYen).toBe(state.cashYen - CHEAPEST_EXPRESS_PRICE_YEN)
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.state.partInventory[0]).toMatchObject({
      partId: CHEAPEST.id,
      conditionPercent: 100,
    })
    expect(result.log).toEqual([
      {
        type: 'part-bought',
        partId: CHEAPEST.id,
        partInstanceId: result.state.partInventory[0]!.id,
        priceYen: CHEAPEST_EXPRESS_PRICE_YEN,
      },
    ])
  })

  it('defaults to express when deliverySpeed is omitted', () => {
    const state = baseState()
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT)
    expect(result.state.cashYen).toBe(state.cashYen - CHEAPEST_EXPRESS_PRICE_YEN)
    expect(result.state.partInventory).toHaveLength(1)
  })

  it('is a no-op when unaffordable', () => {
    const state = baseState({ cashYen: 0 })
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'express')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a no-op for an unknown part id', () => {
    const state = baseState()
    const result = resolveBuyPart(state, 'no-such-part', CONTEXT, 'express')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('two purchases in a row produce two distinct instance ids', () => {
    const state = baseState()
    const first = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'express')
    const second = resolveBuyPart(first.state, CHEAPEST.id, CONTEXT, 'express')
    expect(second.state.partInventory).toHaveLength(2)
    const ids = second.state.partInventory.map((p) => p.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('resolveBuyPart — standard delivery (Sprint 14)', () => {
  it('deducts sticker price (no surcharge) and creates a pending order instead of an instant part', () => {
    const state = baseState()
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'standard')
    expect(result.state.cashYen).toBe(state.cashYen - CHEAPEST.priceYen)
    expect(result.state.partInventory).toHaveLength(0)
    expect(result.state.pendingPartOrders).toHaveLength(1)
    const order = result.state.pendingPartOrders[0]!
    expect(order).toMatchObject({
      partId: CHEAPEST.id,
      priceYen: CHEAPEST.priceYen,
      purchasedOnDay: state.day,
      arrivesOnDay: state.day + PARTS_STANDARD_DELIVERY_DAYS,
    })
    expect(result.log).toEqual([
      {
        type: 'part-ordered',
        orderId: order.id,
        partId: CHEAPEST.id,
        priceYen: CHEAPEST.priceYen,
        arrivesOnDay: order.arrivesOnDay,
      },
    ])
  })

  it('is a no-op when unaffordable, even at the lower (unsurcharged) sticker price', () => {
    const state = baseState({ cashYen: CHEAPEST.priceYen - 1 })
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'standard')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('resolvePartDeliveries (Sprint 14)', () => {
  it('is a no-op when nothing is pending', () => {
    const state = baseState()
    const result = resolvePartDeliveries(state)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('leaves an order pending before its arrivesOnDay', () => {
    const ordered = resolveBuyPart(baseState(), CHEAPEST.id, CONTEXT, 'standard').state
    const stillToday = { ...ordered, day: ordered.pendingPartOrders[0]!.arrivesOnDay - 1 }
    const result = resolvePartDeliveries(stillToday)
    expect(result.state).toBe(stillToday)
    expect(result.state.pendingPartOrders).toHaveLength(1)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('delivers an order once arrivesOnDay is reached, logging part-delivered', () => {
    const ordered = resolveBuyPart(baseState(), CHEAPEST.id, CONTEXT, 'standard').state
    const order = ordered.pendingPartOrders[0]!
    const dueToday = { ...ordered, day: order.arrivesOnDay }
    const result = resolvePartDeliveries(dueToday)
    expect(result.state.pendingPartOrders).toHaveLength(0)
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.state.partInventory[0]).toMatchObject({
      partId: CHEAPEST.id,
      conditionPercent: 100,
    })
    expect(result.log).toEqual([
      {
        type: 'part-delivered',
        orderId: order.id,
        partId: CHEAPEST.id,
        partInstanceId: result.state.partInventory[0]!.id,
      },
    ])
  })

  it('delivers only the orders due today, leaving later ones pending', () => {
    let state = baseState()
    state = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'standard').state // day 1 -> day 2
    const soon = state.pendingPartOrders[0]!
    state = { ...state, day: soon.arrivesOnDay } // jump to day 2
    state = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'standard').state // ordered day 2 -> arrives day 3
    const result = resolvePartDeliveries(state)
    expect(result.state.partInventory).toHaveLength(1) // only the first order resolves
    expect(result.state.pendingPartOrders).toHaveLength(1)
    expect(result.state.pendingPartOrders[0]!.arrivesOnDay).toBeGreaterThan(state.day)
  })
})
