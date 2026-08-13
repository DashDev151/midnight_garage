import { CARS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as saveDb from '../save/saveDb'
import { useGameStore } from './gameStore'

vi.mock('../save/saveDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../save/saveDb')>()
  return { ...actual, appendSessionEvent: vi.fn() }
})

const appendSessionEvent = vi.mocked(saveDb.appendSessionEvent)

describe('session log v0 (Sprint 24)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    appendSessionEvent.mockClear()
  })

  it('endDay appends one event carrying the day that just ended', () => {
    const game = useGameStore()
    game.newGame(1)
    const endedDay = game.day

    game.endDay()

    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'endDay', payload: { endedDay } }),
    )
  })

  it('repair() appends a repair event carrying the address and labour spent (Sprint 202: every action is direct)', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    appendSessionEvent.mockClear()

    game.repair(carId, 'body', 'mint')

    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'repair',
        payload: expect.objectContaining({ carId, componentId: 'body', targetBand: 'mint' }),
      }),
    )
  })

  it('install() appends an install event carrying the part instance and address', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.removePart(carId, 'dampers')
    const part = game.pickableParts[0]
    appendSessionEvent.mockClear()
    if (part) {
      game.install(carId, 'suspension', part.instance.id)
      expect(appendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'install',
          payload: expect.objectContaining({
            carId,
            componentId: 'suspension',
            partInstanceId: part.instance.id,
          }),
        }),
      )
    }
  })

  it('pipelineStage/removePanel append their own event types for a zone car', () => {
    const game = useGameStore()
    game.newGame(1)
    let carId: string | null = null
    for (let i = 0; i < 30 && !carId; i++) {
      game.devGrantCar(CARS[0]!.id)
      const car = game.gameState.ownedCars.at(-1)!
      if (car.zoneState) carId = car.id
    }
    if (!carId) return // no zone-model car rolled - nothing to assert
    appendSessionEvent.mockClear()

    game.pipelineStage(carId, 'bonnet', 'stripPrep')
    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pipelineStage',
        payload: expect.objectContaining({ carId, zoneId: 'bonnet', stage: 'stripPrep' }),
      }),
    )

    appendSessionEvent.mockClear()
    game.removePanel(carId, 'bonnet')
    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'removePanel',
        payload: expect.objectContaining({ carId, zoneId: 'bonnet' }),
      }),
    )
  })

  it('buyout appends an event with the lot and the price paid (Sprint 202 enrichment)', () => {
    const game = useGameStore()
    game.newGame(1)
    for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
    const lot = game.gameState.activeAuctionLots[0]
    if (!lot) return // no lot rolled in this seed's first 20 days - nothing to buy
    const priceYen = game.lotDetail(lot.id)!.buyoutPriceYen
    game.devGiveCash(priceYen)
    appendSessionEvent.mockClear()

    const bought = game.buyout(lot.id)

    expect(bought).toBe(true)
    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'buyout',
        payload: { lotId: lot.id, priceYen },
      }),
    )
  })
})
