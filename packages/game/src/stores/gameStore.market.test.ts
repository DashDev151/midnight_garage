import { CARS, ECONOMY, PARTS, type ComponentId } from '@midnight-garage/content'
import { bidIncrementYen } from '@midnight-garage/sim'
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
    // elapses - bidding no longer resolves instantly.
    expect(game.placeBid(lot.id, lot.bookValueYen * 3)).toBe(true)
    let guard = 0
    while (game.gameState.activeAuctionLots.some((l) => l.id === lot.id) && guard++ < 20) {
      game.endDay()
    }

    expect(game.ownedCarCount).toBe(carsBefore + 1)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })

  it('placeBid opens the board and lotDetail/myActiveBids reflect the new leader (Sprint 20: open bidding)', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const before = game.lotDetail(lot.id)!
    expect(before.currentBidYen).toBe(0)
    expect(before.leadingBidder).toBeNull()
    expect(before.playerHasBid).toBe(false)
    expect(game.myActiveBids).toHaveLength(0)

    const openingBidYen = before.nextRaiseYen // reserve, since bidding hasn't opened
    expect(game.placeBid(lot.id, openingBidYen)).toBe(true)

    const after = game.lotDetail(lot.id)!
    expect(after.currentBidYen).toBe(openingBidYen)
    expect(after.leadingBidder).toBe('player')
    expect(after.playerHasBid).toBe(true)
    expect(game.myActiveBids.map((b) => b.lot.id)).toContain(lot.id)
  })

  it('placeBid refuses any raise below the minimum next-raise ladder (Sprint 20, mirrors the sim rule)', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const openingBidYen = game.lotDetail(lot.id)!.nextRaiseYen
    expect(game.placeBid(lot.id, openingBidYen)).toBe(true)

    const afterOpening = game.lotDetail(lot.id)!
    expect(game.placeBid(lot.id, 1)).toBe(false) // far below the ladder -> refused
    expect(game.placeBid(lot.id, afterOpening.currentBidYen)).toBe(false) // a tie is not a raise
    expect(game.lotDetail(lot.id)?.currentBidYen).toBe(afterOpening.currentBidYen)

    const minRaiseYen = afterOpening.nextRaiseYen
    expect(game.placeBid(lot.id, minRaiseYen)).toBe(true)
    expect(game.lotDetail(lot.id)?.currentBidYen).toBe(minRaiseYen)
  })

  it("myActiveBids keeps showing a lot after the player is outbid - that view is the panel's whole point (Sprint 20)", () => {
    const game = useGameStore()
    warpToCatalog(game)

    // Open the minimum bid on every lot on today's board, then run the
    // overnight counter step for a while: with dealers answering most
    // overnight steps, at least one lot should come back over the player.
    for (const lot of game.gameState.activeAuctionLots) {
      game.placeBid(lot.id, game.lotDetail(lot.id)!.nextRaiseYen)
    }

    let outbidLotId: string | undefined
    for (let i = 0; i < 15 && !outbidLotId; i++) {
      game.endDay()
      outbidLotId = game.myActiveBids.find((b) => b.leadingBidder === 'rival')?.lot.id
    }

    expect(outbidLotId).toBeDefined()
    const outbidEntry = game.myActiveBids.find((b) => b.lot.id === outbidLotId)!
    expect(outbidEntry.isWinning).toBe(false)
    expect(outbidEntry.leadingBidder).toBe('rival')
    // The lot is still fully addressable - the player can raise again.
    expect(game.lotDetail(outbidLotId!)?.playerHasBid).toBe(true)
  })

  it('lotDetail always carries the real group bands - lots are transparent now (Sprint 26 decision 10)', () => {
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

  it('lotDetail carries a turnout read and a buyout price floored above the current bid by at least an increment (Sprint 20)', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const detail = game.lotDetail(lot.id)!
    expect(['thin', 'steady', 'packed']).toContain(detail.turnout)
    const increment = bidIncrementYen(lot, ECONOMY)
    expect(detail.buyoutPriceYen).toBeGreaterThanOrEqual(detail.currentBidYen + increment)

    // Still true once the lot is actually contested, not just pre-bid.
    game.placeBid(lot.id, detail.nextRaiseYen)
    const afterBid = game.lotDetail(lot.id)!
    expect(afterBid.buyoutPriceYen).toBeGreaterThanOrEqual(
      afterBid.currentBidYen + bidIncrementYen(lot, ECONOMY),
    )
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
    // End days until the listing resolves (bounded) - the wait itself is
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
    let pair: { partId: string; componentId: ComponentId; modelId: string } | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find((c) => part.requiredTags.every((t) => c.tags.includes(t)))
      const componentId = game.groupForCarPart(part.carPartId)
      if (model && componentId) {
        pair = { partId: part.id, componentId, modelId: model.id }
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
