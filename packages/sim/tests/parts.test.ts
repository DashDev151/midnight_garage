import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { PARTS_EXPRESS_SURCHARGE_FRACTION, PARTS_STANDARD_DELIVERY_DAYS } from '../src/constants'
import { resolveBuyPart, resolvePartDeliveries, resolveScrapPart } from '../src/parts'
import { testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
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
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    ...overrides,
  }
}

describe('resolveBuyPart - express (Sprint 11 instant resolver, surcharge added Sprint 14)', () => {
  it('deducts the surcharged price and adds an immediately-installable part instance', () => {
    const state = baseState()
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'express')
    expect(result.state.cashYen).toBe(state.cashYen - CHEAPEST_EXPRESS_PRICE_YEN)
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.state.partInventory[0]).toMatchObject({
      partId: CHEAPEST.id,
      band: 'mint',
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

  it('Sprint 42: sets pricePaidYen to the surcharged charge amount', () => {
    const state = baseState()
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT, 'express')
    expect(result.state.partInventory[0]?.pricePaidYen).toBe(CHEAPEST_EXPRESS_PRICE_YEN)
  })
})

describe('resolveBuyPart - standard delivery (Sprint 14)', () => {
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

describe('resolvePartDeliveries (Sprint 14, day arithmetic fixed Sprint 25 task 3)', () => {
  it('is a no-op when nothing is pending', () => {
    const state = baseState()
    const result = resolvePartDeliveries(state)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  /**
   * A synthetic order further out than the real 1-day constant, so the
   * "still pending" branch has an observable state to exercise - with the
   * real PARTS_STANDARD_DELIVERY_DAYS (1) an order is always due on the
   * very next resolvePartDeliveries call (see the regression test below),
   * so there is no reachable "still pending" state for it in real play.
   */
  it('leaves a multi-day order pending until one day before its arrivesOnDay', () => {
    const ordered = resolveBuyPart(baseState(), CHEAPEST.id, CONTEXT, 'standard').state
    const order = { ...ordered.pendingPartOrders[0]!, arrivesOnDay: ordered.day + 3 }
    const twoDaysOut = { ...ordered, pendingPartOrders: [order], day: order.arrivesOnDay - 2 }
    const result = resolvePartDeliveries(twoDaysOut)
    expect(result.state).toBe(twoDaysOut)
    expect(result.state.pendingPartOrders).toHaveLength(1)
    expect(result.state.partInventory).toHaveLength(0)
  })

  /**
   * Sprint 25 task 3: `advanceDay` never mutates `state.day` until the very
   * last line of its own body, so the one `advanceDay` call that takes day
   * N to day N + 1 calls this function with `state.day` still at N - not
   * N + 1. This is exactly that call: a standard order bought on day N must
   * already be in inventory by the time this single call returns, so it's
   * there the moment the player lands on day N + 1 (one End Day click, not
   * two).
   */
  it('regression: a standard order bought on day N delivers in the very next resolvePartDeliveries call', () => {
    const dayN = 5
    const ordered = resolveBuyPart(baseState({ day: dayN }), CHEAPEST.id, CONTEXT, 'standard').state
    const order = ordered.pendingPartOrders[0]!
    expect(order.arrivesOnDay).toBe(dayN + PARTS_STANDARD_DELIVERY_DAYS)

    const result = resolvePartDeliveries(ordered)
    expect(result.state.pendingPartOrders).toHaveLength(0)
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.state.partInventory[0]).toMatchObject({
      partId: CHEAPEST.id,
      band: 'mint',
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

  it("Sprint 42: sets pricePaidYen to the order's own locked price, not today's sticker price", () => {
    const ordered = resolveBuyPart(baseState(), CHEAPEST.id, CONTEXT, 'standard').state
    const order = ordered.pendingPartOrders[0]!
    const result = resolvePartDeliveries(ordered)
    expect(result.state.partInventory[0]?.pricePaidYen).toBe(order.priceYen)
  })

  it('delivers only the orders due today, leaving a further-out order pending', () => {
    const ordered = resolveBuyPart(baseState(), CHEAPEST.id, CONTEXT, 'standard').state
    const dueOrder = ordered.pendingPartOrders[0]!
    const laterOrder = { ...dueOrder, id: 'order-later', arrivesOnDay: dueOrder.arrivesOnDay + 5 }
    const state = { ...ordered, pendingPartOrders: [dueOrder, laterOrder] }
    const result = resolvePartDeliveries(state)
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.state.pendingPartOrders).toEqual([laterOrder])
  })
})

describe('resolveScrapPart (Sprint 26 decision 6; Sprint 35 customer-owned lock)', () => {
  const scrapInstance: PartInstance = {
    id: 'pi-scrap',
    partId: CHEAPEST.id,
    band: 'scrap',
    genuinePeriod: false,
  }

  it('scraps a player-owned scrap part for cash and removes it from inventory', () => {
    const state = baseState({ partInventory: [scrapInstance] })
    const result = resolveScrapPart(state, scrapInstance.id, CONTEXT)
    expect(result.state.partInventory).toHaveLength(0)
    expect(result.state.cashYen).toBeGreaterThan(state.cashYen)
    expect(result.log[0]).toMatchObject({ type: 'part-scrapped', partInstanceId: scrapInstance.id })
  })

  it('refuses to scrap a customer-owned part (customerJobId set) - a no-op', () => {
    const customerScrap: PartInstance = { ...scrapInstance, customerJobId: 'svc-1-0' }
    const state = baseState({ partInventory: [customerScrap] })
    const result = resolveScrapPart(state, customerScrap.id, CONTEXT)
    expect(result.state).toBe(state) // untouched: still in inventory, no cash
    expect(result.log).toEqual([])
  })
})
