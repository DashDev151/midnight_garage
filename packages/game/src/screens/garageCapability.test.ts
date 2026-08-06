import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { bodyPaintShopOpen } from './garageCapability'

/**
 * The body and paint shop renders derelict until the tool its work needs is
 * actually owned - read off the same state the real work already gates on,
 * not a second room-ownership flag. A fresh shop owns every tool line at 1
 * (`freshToolTiers`), so it starts closed.
 *
 * It is the only room with a gate of its own. The machine shop's equipment is
 * per tool line and its presence answers to sim's own per-operation gate
 * (`machineShopEquipment.test.ts`).
 */
describe('garage room capability gates', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the body and paint shop stays derelict until the body line is owned', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(bodyPaintShopOpen(game.gameState)).toBe(false)

    game.gameState = {
      ...game.gameState,
      toolTiers: { ...game.gameState.toolTiers, body: 2 },
    }
    expect(bodyPaintShopOpen(game.gameState)).toBe(true)
  })

  it('hiring the body line for the day opens the body and paint shop too (owned OR hired, per the real gate)', () => {
    const game = useGameStore()
    game.newGame(1)
    game.gameState = {
      ...game.gameState,
      machineHirePaidDayByGroup: { body: game.gameState.day },
    }
    expect(bodyPaintShopOpen(game.gameState)).toBe(true)
  })
})
