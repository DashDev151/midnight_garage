import { CARS, PARTS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

const cheapestPart = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!

/** End days until an auction catalog exists (first weekly refresh), bounded. */
function warpToCatalog(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
}

describe('market: bidding', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a high max bid on a local-yard lot wins it into the garage', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot after the first catalog')

    const carsBefore = game.ownedCarCount
    game.queueBid(lot.id, lot.bookValueYen * 3) // well over market -> should win (second-price)
    game.commitDay()

    expect(game.ownedCarCount).toBe(carsBefore + 1)
    // The won lot is gone from the catalog.
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })

  it('queueInspect marks a lot for inspection in the pending plan', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    game.queueInspect(lot.id)
    expect(game.pending.inspectLots).toContainEqual({ lotId: lot.id })
    // Committing spends a labor slot + fee and reveals the lot.
    game.commitDay()
    expect(game.gameState.activeAuctionLots.find((l) => l.id === lot.id)?.inspected).toBe(true)
  })

  it('lotDetail carries an interest read and a buyout price', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const detail = game.lotDetail(lot.id)!
    expect(['quiet', 'warm', 'hot', 'frenzy']).toContain(detail.interest.level)
    expect(detail.buyoutPriceYen).toBeGreaterThan(detail.bookValueYen) // a premium
  })

  it('a buyout is guaranteed: the lot becomes an owned car on End Day', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')!
    const carsBefore = game.ownedCarCount
    game.queueBuyout(lot.id)
    expect(game.pending.buyoutLots).toContainEqual({ lotId: lot.id })
    game.commitDay()
    expect(game.ownedCarCount).toBe(carsBefore + 1)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })
})

describe('market: selling', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a walk-in sell removes the car and adds cash', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const cashBefore = game.cashYen
    const est = game.walkInEstimate(game.gameState.ownedCars[0]!.id)
    expect(est.offerYen).toBeGreaterThan(0)

    game.queueSellWalkIn(game.gameState.ownedCars[0]!.id)
    game.commitDay()

    expect(game.ownedCarCount).toBe(0)
    expect(game.cashYen).toBeGreaterThan(cashBefore)
  })

  it('listing publicly removes the car and creates a listing that resolves later', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    expect(game.listingEstimate(id)).toBeGreaterThan(0)

    game.queueListForSale(id)
    game.commitDay()

    expect(game.ownedCarCount).toBe(0)
    expect(game.activeListings).toHaveLength(1)
    // The listing carries the model so the garage panel can name it.
    expect(game.activeListings[0]!.modelId).toBe(CARS[0]!.id)
    const cashBefore = game.cashYen
    // End days until the listing resolves (bounded).
    for (let i = 0; i < 10 && game.activeListings.length > 0; i++) game.endDay()
    expect(game.activeListings).toHaveLength(0)
    expect(game.cashYen).toBeGreaterThan(cashBefore) // sale proceeds landed
  })
})

describe('market: buying parts', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a queued part buy lands in inventory and is then installable', () => {
    const game = useGameStore()
    // A power part + a compatible car, so the bought part is actually installable.
    let pair: { partId: string; slot: (typeof PARTS)[number]['slot']; modelId: string } | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find((c) => part.requiredTags.every((t) => c.tags.includes(t)))
      if (model) {
        pair = { partId: part.id, slot: part.slot, modelId: model.id }
        break
      }
    }
    if (!pair) throw new Error('no compatible power part/model pair in seed content')

    game.devGrantCar(pair.modelId)
    const car = game.gameState.ownedCars[0]!
    const cashBefore = game.cashYen

    game.queueBuyPart(pair.partId)
    game.commitDay()

    expect(game.gameState.partInventory).toHaveLength(1)
    expect(game.cashYen).toBeLessThan(cashBefore)
    const bought = game.gameState.partInventory[0]!
    expect(game.installablePartsFor(car.id, pair.slot).some((pi) => pi.id === bought.id)).toBe(true)
  })

  it('queueBuyPart ignores an unknown part id', () => {
    const game = useGameStore()
    game.queueBuyPart('no-such-part')
    expect(game.pending.buyParts).toHaveLength(0)
  })

  it('the cheapest part is affordable from the starting balance', () => {
    const game = useGameStore()
    expect(game.cashYen).toBeGreaterThan(cheapestPart.priceYen)
  })
})
