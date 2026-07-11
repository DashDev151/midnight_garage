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

  it('a successful stageAction appends an event; a refused one does not', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    appendSessionEvent.mockClear()

    expect(game.stageAction(carId, { kind: 'repair', componentId: 'body' })).toBe(true)
    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stageAction',
        payload: { carId, action: { kind: 'repair', componentId: 'body' } },
      }),
    )

    appendSessionEvent.mockClear()
    // Unknown car - refused, no state change, no event.
    expect(game.stageAction('not-a-real-car', { kind: 'repair', componentId: 'body' })).toBe(false)
    expect(appendSessionEvent).not.toHaveBeenCalled()
  })

  it('placeBid appends an event with the lot and bid amount', () => {
    const game = useGameStore()
    game.newGame(1)
    for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
    const lot = game.gameState.activeAuctionLots[0]
    if (!lot) return // no lot rolled in this seed's first 20 days - nothing to bid on
    appendSessionEvent.mockClear()
    // Well above any realistic ladder minimum - clears the raise check reliably.
    const bidYen = lot.bookValueYen * 3

    const placed = game.placeBid(lot.id, bidYen)

    expect(placed).toBe(true)
    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'placeBid', payload: { lotId: lot.id, bidYen } }),
    )
  })
})
