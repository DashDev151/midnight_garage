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

  /**
   * Sprint 65 decision 1: the gameplay route the player was last on before
   * opening the menu (Escape or the header control). The menu's Continue, and
   * Escape while on the menu, both return here - pause-menu semantics - so the
   * menu never dumps the player back on the garage from, say, the auction
   * house. Defaults to `garage` (the boot fallback: opening the menu straight
   * off a fresh boot has no prior gameplay screen to return to).
   */
  const lastGameplayRoute = ref('garage')

  function rememberGameplayRoute(routeName: string): void {
    lastGameplayRoute.value = routeName
  }

  return { devConsoleOpen, toggleDevConsole, lastGameplayRoute, rememberGameplayRoute }
})
