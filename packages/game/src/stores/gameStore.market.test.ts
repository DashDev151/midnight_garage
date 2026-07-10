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

  it('a high max bid on a local-yard lot eventually wins it into the garage (Sprint 19: multi-day)', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot after the first catalog')

    const carsBefore = game.ownedCarCount
    // Well over market -> should win once the lot's own rolled duration
    // elapses — bidding no longer resolves instantly.
    expect(game.placeBid(lot.id, lot.bookValueYen * 3)).toBe(true)
    let guard = 0
    while (game.gameState.activeAuctionLots.some((l) => l.id === lot.id) && guard++ < 20) {
      game.endDay()
    }

    expect(game.ownedCarCount).toBe(carsBefore + 1)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })

  it('placeBid records the max bid on the lot and lotDetail/myActiveBids reflect it', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    expect(game.lotDetail(lot.id)?.myMaxBidYen).toBeNull()
    expect(game.myActiveBids).toHaveLength(0)

    game.placeBid(lot.id, lot.bookValueYen)

    expect(game.lotDetail(lot.id)?.myMaxBidYen).toBe(lot.bookValueYen)
    expect(game.myActiveBids.map((b) => b.lot.id)).toContain(lot.id)
  })

  it('placeBid can only raise an existing bid, never lower it', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    expect(game.placeBid(lot.id, lot.bookValueYen)).toBe(true)
    expect(game.placeBid(lot.id, 1)).toBe(false) // not a raise -> no-op
    expect(game.lotDetail(lot.id)?.myMaxBidYen).toBe(lot.bookValueYen)
    expect(game.placeBid(lot.id, lot.bookValueYen * 2)).toBe(true)
    expect(game.lotDetail(lot.id)?.myMaxBidYen).toBe(lot.bookValueYen * 2)
  })

  it('inspectLot reveals the lot instantly, for cash only', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const cashBefore = game.cashYen
    const laborBefore = game.laborSlotsRemainingToday
    game.inspectLot(lot.id)
    expect(game.gameState.activeAuctionLots.find((l) => l.id === lot.id)?.inspected).toBe(true)
    expect(game.cashYen).toBeLessThan(cashBefore)
    expect(game.laborSlotsRemainingToday).toBe(laborBefore) // no labor cost (Sprint 11 decision 4)
  })

  it('lotDetail carries an interest read and a buyout price', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const detail = game.lotDetail(lot.id)!
    expect(['quiet', 'warm', 'hot', 'frenzy']).toContain(detail.interest.level)
    expect(detail.buyoutPriceYen).toBeGreaterThan(detail.bookValueYen) // a premium
  })

  it('a buyout is guaranteed and instant: the lot becomes an owned car immediately', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')!
    const carsBefore = game.ownedCarCount
    game.buyout(lot.id)
    expect(game.ownedCarCount).toBe(carsBefore + 1)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })
})

describe('market: selling', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a walk-in sell removes the car and adds cash instantly', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const cashBefore = game.cashYen
    const est = game.walkInEstimate(game.gameState.ownedCars[0]!.id)
    expect(est.offerYen).toBeGreaterThan(0)

    game.sellWalkIn(game.gameState.ownedCars[0]!.id)

    expect(game.ownedCarCount).toBe(0)
    expect(game.cashYen).toBeGreaterThan(cashBefore)
  })

  it('listing publicly removes the car instantly and creates a listing that resolves later', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    expect(game.listingEstimate(id)).toBeGreaterThan(0)

    game.listForSale(id)

    expect(game.ownedCarCount).toBe(0)
    expect(game.activeListings).toHaveLength(1)
    // The listing carries the model so the garage panel can name it.
    expect(game.activeListings[0]!.modelId).toBe(CARS[0]!.id)
    const cashBefore = game.cashYen
    // End days until the listing resolves (bounded) — the wait itself is
    // still the intentional multi-day "slow, market price" mechanic.
    for (let i = 0; i < 10 && game.activeListings.length > 0; i++) game.endDay()
    expect(game.activeListings).toHaveLength(0)
    expect(game.cashYen).toBeGreaterThan(cashBefore) // sale proceeds landed
  })
})

describe('market: buying parts', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('buying a part lands in inventory instantly and is then installable', () => {
    const game = useGameStore()
    // A power part + a compatible car, so the bought part is actually installable.
    let pair:
      | { partId: string; componentId: (typeof PARTS)[number]['componentId']; modelId: string }
      | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find((c) => part.requiredTags.every((t) => c.tags.includes(t)))
      if (model) {
        pair = { partId: part.id, componentId: part.componentId, modelId: model.id }
        break
      }
    }
    if (!pair) throw new Error('no compatible power part/model pair in seed content')

    game.devGrantCar(pair.modelId)
    const car = game.gameState.ownedCars[0]!
    const cashBefore = game.cashYen

    game.buyPart(pair.partId)

    expect(game.gameState.partInventory).toHaveLength(1)
    expect(game.cashYen).toBeLessThan(cashBefore)
    const bought = game.gameState.partInventory[0]!
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
