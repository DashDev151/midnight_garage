import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Ephemeral session/view state that is never persisted (contrast the
 * game store, whose `gameState` is the Sprint 7 save payload). Screen
 * location lives in the router, not here - this store is for transient
 * view flags like whether the dev console is open.
 */
export const useUiStore = defineStore('ui', () => {
  const devConsoleOpen = ref(false)

  function toggleDevConsole(): void {
    devConsoleOpen.value = !devConsoleOpen.value
  }

  return { devConsoleOpen, toggleDevConsole }
})
