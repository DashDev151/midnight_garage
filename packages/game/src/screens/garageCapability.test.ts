import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { bodyPaintShopOpen, machineShopOpen } from './garageCapability'

/**
 * A garage room renders derelict until the tool its work needs is actually
 * owned - read off the same state the real work already gates on, not a
 * second room-ownership flag. A fresh shop owns every tool line at 1
 * (`freshToolTiers`), so both rooms start closed.
 */
describe('garage room capability gates', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the machine shop stays derelict until the engine line reaches the machining tool tier', () => {
    const game = useGameStore()
    game.newGame(1)
    const minTier = game.context.economy.machining.minEngineToolTier
    expect(game.gameState.toolTiers.engine).toBeLessThan(minTier)
    expect(machineShopOpen(game.gameState, game.context.economy)).toBe(false)

    game.gameState = {
      ...game.gameState,
      toolTiers: { ...game.gameState.toolTiers, engine: minTier },
    }
    expect(machineShopOpen(game.gameState, game.context.economy)).toBe(true)
  })

  it('a hired-for-the-day engine line does not open the machine shop (ownership only, per the real gate)', () => {
    const game = useGameStore()
    game.newGame(1)
    game.gameState = {
      ...game.gameState,
      machineHirePaidDayByGroup: { engine: game.gameState.day },
    }
    expect(machineShopOpen(game.gameState, game.context.economy)).toBe(false)
  })

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
