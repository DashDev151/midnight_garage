import type { CarPartId } from '@midnight-garage/content'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * What the Warehouse drawer is currently picking FOR, when it was opened by a
 * "Fit" control rather than by its own tab: the exact car slot (or benched
 * assembly member) a selection should land in. `null` means the drawer is in
 * plain browse mode. Lives here rather than on the car screen because the
 * drawer is mounted once at the app root and the car screen's drop zones read
 * the same context - one source of truth for "what are we fitting".
 */
export interface WarehouseFitContext {
  carId: string
  carPartId: CarPartId
  /** Set when picking for a benched assembly member instead of an on-car
   * slot - selection swaps into this container rather than staging an
   * install. */
  benchContainerId?: string
}

/**
 * Ephemeral session/view state that is never persisted (contrast the
 * game store, whose `gameState` is the save payload). Screen
 * location lives in the router, not here - this store is for transient
 * view flags like whether the dev console is open.
 */
export const useUiStore = defineStore('ui', () => {
  const devConsoleOpen = ref(false)

  function toggleDevConsole(): void {
    devConsoleOpen.value = !devConsoleOpen.value
  }

  /**
   * The gameplay route the player was last on before
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
   * Where the player has dragged the walkthrough overlay
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

  /**
   * The Warehouse drawer - the game's ONE inventory surface, a floating
   * element mounted at the app root (`WarehouseDrawer.vue`). Open/closed is
   * app-level view state exactly like the dev console; `warehouseFit` scopes
   * the drawer to one slot when a "Fit" control opened it.
   */
  const warehouseOpen = ref(false)
  const warehouseFit = ref<WarehouseFitContext | null>(null)

  function openWarehouse(fit?: WarehouseFitContext): void {
    warehouseFit.value = fit ?? null
    warehouseOpen.value = true
  }

  function closeWarehouse(): void {
    warehouseOpen.value = false
    warehouseFit.value = null
  }

  /** The tab's own toggle - opening this way is always plain browse mode. */
  function toggleWarehouse(): void {
    if (warehouseOpen.value) {
      closeWarehouse()
    } else {
      openWarehouse()
    }
  }

  /** A navigation drops the fit scope (it pointed at a slot on the screen
   * being left) but leaves the drawer itself as the player had it - it is a
   * floating element, not part of any one screen. */
  function clearWarehouseFit(): void {
    warehouseFit.value = null
  }

  return {
    devConsoleOpen,
    toggleDevConsole,
    warehouseOpen,
    warehouseFit,
    openWarehouse,
    closeWarehouse,
    toggleWarehouse,
    clearWarehouseFit,
    lastGameplayRoute,
    rememberGameplayRoute,
    tutorialOverlayPos,
    setTutorialOverlayPos,
  }
})
