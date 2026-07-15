import {
  CARS,
  ECONOMY,
  fitmentClassForTier,
  PARTS,
  type CarPartId,
  type ComponentId,
} from '@midnight-garage/content'
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
    // Sprint 59 retuned STARTING_CASH_YEN down (1,500,000 -> 300,000) - the
    // scripted "well over market" bid below exists to guarantee a win
    // regardless of rival bidding, not to exercise real cash affordability,
    // so it needs headroom the new lower starting cash no longer gives it.
    game.devGiveCash(lot.bookValueYen * 3)
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
    // Sprint 27: unlocks premium tier before the catalog rolls. Under the
    // restoration-bill value model a fixed per-part repair cost is a much
    // smaller fraction of a premium car's own book value, so premium lots
    // reliably clear reserve and draw real dealer interest (measured:
    // 600/600 rolled premium lots vs local-yard's ~2%) - this is a test-
    // fixture choice to reach a tier where the rival counter-raise this test
    // actually exercises fires reliably; the mechanic itself is identical at
    // every tier.
    game.devSetReputationTier('known')
    // `createInitialGameState` already rolls day-1's catalog before this
    // test ever runs (so a new career isn't empty for a week), at
    // reputation 'unknown' - `warpToCatalog` sees that stale, local-yard-
    // only board immediately and returns without advancing. Keep ending
    // days until a premium lot actually appears (the next weekly refresh,
    // now unlocked) rather than trusting the pre-existing board.
    for (
      let i = 0;
      i < 20 && !game.gameState.activeAuctionLots.some((l) => l.tier === 'premium');
      i++
    ) {
      game.endDay()
    }

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

  it('taking offers on a car eventually draws a live offer (Sprint 31)', () => {
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

  /** Sprint 68 decision 3 (playtest item 21). */
  it('rejecting an offer drops it but leaves the car listed, so tomorrow can bring a better one', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen
    game.gameState = {
      ...game.gameState,
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
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

  /** Sprint 68 decision 5 (playtest item 23): the receipt. */
  it('accepting an offer produces a real sale receipt off the Sprint 42 ledger', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const displayName = game.carDetail(carId)!.displayName
    game.gameState = {
      ...game.gameState,
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
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

    game.dismissSaleResult()
    expect(game.lastSaleResult).toBeNull()
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
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
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
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
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
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
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
    // Sprint 32: every slot starts filled with a stock part - empty this
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
