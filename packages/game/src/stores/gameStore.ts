import { BUYERS, CARS, HIDDEN_ISSUES, PARTS } from '@midnight-garage/content'
import type { DayLogEntry, GameState } from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  advanceDay,
  buildSimContext,
  createInitialGameState,
  DayActionsSchema,
  type DayActions,
  type SimContext,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

/** A fully-defaulted, typed empty action set - End Day with nothing queued. */
export function emptyActions(): DayActions {
  return DayActionsSchema.parse({})
}

/** Fixed default seed for a new game until seed selection is a real feature. */
const DEFAULT_SEED = 1

/**
 * The state bridge between the pure sim and Vue. Holds the one object
 * Dexie will persist in Sprint 7 (`gameState`), the static content
 * `context` (rebuilt each session, never saved), and the running day log.
 * The interactive per-day seed uses the same `seed + day` derivation as
 * the balance harness, so a played game is as reproducible as a bot career.
 */
export const useGameStore = defineStore('game', () => {
  // Content catalogs are static and heavy; shallowRef avoids deep reactivity we never mutate.
  const context = shallowRef<SimContext>(buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES))
  const gameState = ref<GameState>(createInitialGameState(context.value, DEFAULT_SEED))
  const dayLog = ref<DayLogEntry[]>([])

  const day = computed(() => gameState.value.day)
  const cashYen = computed(() => gameState.value.cashYen)
  const reputationTier = computed(() => gameState.value.reputationTier)
  const ownedCarCount = computed(() => gameState.value.ownedCars.length)

  const ownedCarNames = computed(() =>
    gameState.value.ownedCars.map((car) => {
      const model = context.value.modelsById[car.modelId]
      return model ? resolveCarDisplayName(model) : car.modelId
    }),
  )

  function resolveModelName(modelId: string): string {
    const model = context.value.modelsById[modelId]
    return model ? resolveCarDisplayName(model) : modelId
  }

  function newGame(seed: number = DEFAULT_SEED): void {
    gameState.value = createInitialGameState(context.value, seed)
    dayLog.value = []
  }

  /** Advance one day through the real sim, appending the returned log. */
  function endDay(actions: DayActions = emptyActions()): void {
    const state = gameState.value
    const result = advanceDay(state, actions, state.seed + state.day, context.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)
  }

  /** Dev-console only: add cash without going through the sim. */
  function devGiveCash(amountYen: number): void {
    gameState.value = { ...gameState.value, cashYen: gameState.value.cashYen + amountYen }
  }

  return {
    gameState,
    dayLog,
    day,
    cashYen,
    reputationTier,
    ownedCarCount,
    ownedCarNames,
    resolveModelName,
    newGame,
    endDay,
    devGiveCash,
  }
})
