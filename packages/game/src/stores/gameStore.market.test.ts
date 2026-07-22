import {
  CARS,
  fitmentClassForTier,
  PARTS,
  type CarPartId,
  type ComponentId,
} from '@midnight-garage/content'
import { channelBuyerTaste } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

const cheapestPart = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!

/** End days until an auction catalog exists (first weekly refresh), bounded. */
function warpToCatalog(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
}

describe('market: auctions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the scripted tutorial lot sorts to the top of its tier', () => {
    const game = useGameStore()
    game.newGame(1)
    const local = game.auctionLotsByTier.find((g) => g.tier === 'local-yard')
    expect(local, 'day 1 always stocks the local yard').toBeDefined()
    // The scripted lot is injected AFTER the day-1 random batch, so raw state
    // order has it last - the view must put the walkthrough's subject first.
    expect(local!.lots[0]!.id).toBe('tutorial-lot')
    expect(local!.lots.length).toBeGreaterThan(1)
  })

  it('lotDetail always carries the real group bands - lots are transparent now', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const detail = game.lotDetail(lot.id)!
    expect(Object.keys(detail.groupBands)).toEqual([
      'engine',
      'drivetrain',
      'suspension',
      'wheels',
      'body',
      'interior',
    ])
    for (const band of Object.values(detail.groupBands)) {
      expect(['scrap', 'poor', 'worn', 'fine', 'mint']).toContain(band)
    }
  })

  it('lotDetail carries a turnout read and a positive buyout price', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const detail = game.lotDetail(lot.id)!
    expect(['thin', 'steady', 'packed']).toContain(detail.turnout)
    expect(detail.buyoutPriceYen).toBeGreaterThan(0)
  })

  it('a buyout is guaranteed and instant: the lot becomes an owned car immediately', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')!
    const carsBefore = game.ownedCarCount
    // The 25-model pool can put a lot at the local yard whose buyout price
    // exceeds starting cash; affordability is not what this test exercises, so
    // grant the buyout price outright.
    game.devGiveCash(game.lotDetail(lot.id)!.buyoutPriceYen)
    game.buyout(lot.id)
    expect(game.ownedCarCount).toBe(carsBefore + 1)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })
})

describe('market: selling', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('taking offers on a car eventually draws a live offer', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const est = game.estimatedSaleValue(carId)
    expect(est.offerYen).toBeGreaterThan(0)

    expect(game.isForSale(carId)).toBe(false)
    expect(game.setForSale(carId, true)).toBe(true)
    expect(game.isForSale(carId)).toBe(true)

    let guard = 0
    while (!game.offerFor(carId) && guard++ < 60) game.endDay()
    const offer = game.offerFor(carId)
    expect(offer).toBeDefined()
    expect(offer!.priceYen).toBeGreaterThan(0)
    expect(offer!.copy).toContain('Today only')
  })

  /** `setForSale` threads its `channelId` parameter down to
   * `resolveSetForSale`, defaulting to `shopFront` when omitted. */
  it('setForSale defaults to shopFront and threads a chosen channelId through to the listing', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    expect(game.setForSale(carId, true)).toBe(true)
    expect(game.listingChannelId(carId)).toBe('shopFront')

    expect(game.setForSale(carId, false)).toBe(true)
    expect(game.listingChannelId(carId)).toBeUndefined()

    expect(game.setForSale(carId, true, 'freeAdsPaper')).toBe(true)
    expect(game.listingChannelId(carId)).toBe('freeAdsPaper')
  })

  /** Re-listing an already-listed car on a DIFFERENT channel pays that
   * channel's own fee again (the sim's own re-listing rule). */
  it("re-listing on a different channel re-charges that channel's fee", () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    expect(game.setForSale(carId, true, 'shopFront')).toBe(true) // free

    const cashBefore = game.cashYen
    const feeYen = game.context.economy.sellingChannels.freeAdsPaper.feeYen
    expect(game.setForSale(carId, true, 'freeAdsPaper')).toBe(true)

    expect(game.listingChannelId(carId)).toBe('freeAdsPaper')
    expect(game.cashYen).toBe(cashBefore - feeYen)
  })

  /** Rejecting an offer drops it but leaves the car listed. */
  it('rejecting an offer drops it but leaves the car listed, so tomorrow can bring a better one', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen
    game.gameState = {
      ...game.gameState,
      carsForSale: [
        {
          carInstanceId: carId,
          sinceDay: game.gameState.day,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 500_000 }],
    }

    expect(game.rejectOffer(carId)).toBe(true)

    expect(game.offerFor(carId)).toBeUndefined()
    expect(game.isForSale(carId)).toBe(true) // still on the market
    expect(game.ownedCarCount).toBe(1)
    expect(game.cashYen).toBe(cashBefore)
    // No modal: a rejection is not a sale.
    expect(game.lastSaleResult).toBeNull()
  })

  it('rejecting with no live offer is a no-op', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    expect(game.rejectOffer(carId)).toBe(false)
  })

  it('accepting an offer produces a real sale receipt off the Sprint 42 ledger', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const displayName = game.carDetail(carId)!.displayName
    game.gameState = {
      ...game.gameState,
      carsForSale: [
        {
          carInstanceId: carId,
          sinceDay: game.gameState.day,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 500_000 }],
      carLedgers: { [carId]: { purchaseYen: 300_000, repairYen: 40_000, partsYen: 20_000 } },
    }

    expect(game.acceptOffer(carId)).toBe(true)

    const receipt = game.lastSaleResult
    expect(receipt).not.toBeNull()
    expect(receipt!.displayName).toBe(displayName)
    expect(receipt!.priceYen).toBe(500_000)
    expect(receipt!.purchaseYen).toBe(300_000)
    expect(receipt!.repairYen).toBe(40_000)
    expect(receipt!.partsYen).toBe(20_000)
    expect(receipt!.totalSpentYen).toBe(360_000)
    expect(receipt!.profitYen).toBe(140_000) // 500,000 - 360,000
    // The receipt threads `car-sold`'s own `matchedSale` flag - this pairing
    // (a generated shitbox, the reliability-led first-timer archetype) is
    // not the buyer's visible want, so unmatched.
    expect(receipt!.matchedSale).toBe(false)

    game.dismissSaleResult()
    expect(game.lastSaleResult).toBeNull()
  })

  /**
   * A MATCHED sale (the buyer's taste for the car clears the listing
   * channel's own tasteCeiling) surfaces `matchedSale: true` on the receipt.
   * Finds a genuinely matched real buyer/generated-car pairing via
   * `channelBuyerTaste` (the same public sim function `resolveSellViaWalkIn`
   * itself uses) rather than hand-rolling a synthetic fixture, so the test
   * proves the store's own passthrough against a real sim computation.
   */
  it('accepting a matched sale surfaces matchedSale: true on the receipt', () => {
    const game = useGameStore()
    let match: { carId: string; buyerId: string } | undefined
    for (let i = 0; i < CARS.length && !match; i++) {
      game.devGrantCar(CARS[i]!.id)
      const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
      const model = game.context.modelsById[car.modelId]!
      for (const buyer of game.context.buyers) {
        const taste = channelBuyerTaste(
          buyer,
          model,
          car,
          game.context.partsById,
          game.context.partsTaxonomy,
          game.context.economy,
          game.context.economy.sellingChannels.weekendMeet.tasteCeiling!,
        )
        if (taste >= 1) {
          match = { carId: car.id, buyerId: buyer.id }
          break
        }
      }
    }
    expect(
      match,
      'expected at least one real buyer/generated-car pairing to clear a taste ceiling',
    ).toBeDefined()

    game.gameState = {
      ...game.gameState,
      carsForSale: [
        {
          carInstanceId: match!.carId,
          sinceDay: game.gameState.day,
          channelId: 'weekendMeet',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: match!.carId, buyerId: match!.buyerId, priceYen: 500_000 }],
    }

    expect(game.acceptOffer(match!.carId)).toBe(true)
    expect(game.lastSaleResult!.matchedSale).toBe(true)
  })

  it('reports an unknown purchase price as no profit at all, rather than inventing one', () => {
    // A dev-granted car has no purchaseYen on its ledger, so `car-sold` omits
    // profitYen. The receipt passes that gap through as null - the modal shows
    // a dash. Fabricating a number here would be the lie the sim already
    // refuses to tell.
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.gameState = {
      ...game.gameState,
      carsForSale: [
        {
          carInstanceId: carId,
          sinceDay: game.gameState.day,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 500_000 }],
      carLedgers: {},
    }

    expect(game.acceptOffer(carId)).toBe(true)
    expect(game.lastSaleResult!.profitYen).toBeNull()
    expect(game.lastSaleResult!.priceYen).toBe(500_000)
  })

  it('accepting a pending offer removes the car and adds cash through the walk-in resolution path', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen
    game.gameState = {
      ...game.gameState,
      carsForSale: [
        {
          carInstanceId: carId,
          sinceDay: game.gameState.day,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 500_000 }],
    }

    expect(game.acceptOffer(carId)).toBe(true)

    expect(game.ownedCarCount).toBe(0)
    expect(game.isForSale(carId)).toBe(false)
    expect(game.cashYen).toBe(cashBefore + 500_000)
  })

  it('an offer not accepted by End Day is gone the next day (no-reflex rule: it never carries over)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.gameState = {
      ...game.gameState,
      carsForSale: [
        {
          carInstanceId: carId,
          sinceDay: game.gameState.day,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 500_000 }],
    }
    expect(game.offerFor(carId)?.priceYen).toBe(500_000)

    game.endDay() // never accepted

    // The stale offer never survives past End Day - a fresh day may or may
    // not roll a new one, but never this exact injected one.
    expect(game.offerFor(carId)?.priceYen).not.toBe(500_000)
  })
})

describe('market: buying parts', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('buying a part lands in inventory instantly and is then installable', () => {
    const game = useGameStore()
    // A power part + a compatible car, so the bought part is actually installable.
    let pair:
      | { partId: string; componentId: ComponentId; carPartId: CarPartId; modelId: string }
      | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find(
        (c) =>
          fitmentClassForTier(c.tier) === part.fitmentClass &&
          part.requiredTags.every((t) => c.tags.includes(t)),
      )
      const componentId = game.groupForCarPart(part.carPartId)
      if (model && componentId) {
        pair = { partId: part.id, componentId, carPartId: part.carPartId, modelId: model.id }
        break
      }
    }
    if (!pair) throw new Error('no compatible power part/model pair in seed content')

    game.devGrantCar(pair.modelId)
    const car = game.gameState.ownedCars[0]!
    // Every slot starts filled with a stock part - empty this
    // one so the bought part actually has somewhere to install.
    game.removePart(car.id, pair.carPartId)
    const cashBefore = game.cashYen

    game.buyPart(pair.partId)

    const bought = game.gameState.partInventory.find((pi) => pi.partId === pair!.partId)!
    expect(bought).toBeDefined()
    expect(game.cashYen).toBeLessThan(cashBefore)
    expect(
      game.installablePartsFor(car.id, pair.componentId).some((pi) => pi.id === bought.id),
    ).toBe(true)
  })

  it('buyPart ignores an unknown part id', () => {
    const game = useGameStore()
    expect(game.buyPart('no-such-part')).toBe(false)
    expect(game.gameState.partInventory).toHaveLength(0)
  })

  it('the cheapest part is affordable from the starting balance', () => {
    const game = useGameStore()
    expect(game.cashYen).toBeGreaterThan(cheapestPart.priceYen)
  })
})
