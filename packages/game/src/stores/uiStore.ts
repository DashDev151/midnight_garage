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

  /**
   * Sprint 95 decision 8: where the player has dragged the walkthrough overlay
   * this session, in viewport pixels (top-left corner). `null` means the
   * overlay keeps its current step's default placement (the stylesheet's
   * bottom-left corner, or that step's own `panelPosition` hint). Session
   * state only, never persisted to the save: a reload snaps the overlay back
   * to the default, which is fine. The overlay itself clears this back to
   * `null` whenever the active step changes, so a drag never survives past
   * the beat it happened on.
   */
  const tutorialOverlayPos = ref<{ x: number; y: number } | null>(null)

  function setTutorialOverlayPos(pos: { x: number; y: number } | null): void {
    tutorialOverlayPos.value = pos
  }

  return {
    devConsoleOpen,
    toggleDevConsole,
    lastGameplayRoute,
    rememberGameplayRoute,
    tutorialOverlayPos,
    setTutorialOverlayPos,
  }
})
