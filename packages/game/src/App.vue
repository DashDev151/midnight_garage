<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import DayReport from './components/DayReport.vue'
import EndDayButton from './components/EndDayButton.vue'
import EventLogDrawer from './components/EventLogDrawer.vue'
import JobCompleteModal from './components/JobCompleteModal.vue'
import MissionCompleteModal from './components/MissionCompleteModal.vue'
import SaleCompleteModal from './components/SaleCompleteModal.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import { useDragSession } from './composables/useDragAndDrop'
import { useGameStore } from './stores/gameStore'
import { useUiStore } from './stores/uiStore'

const isDev = import.meta.env.DEV
const ui = useUiStore()
const game = useGameStore()
const route = useRoute()
const router = useRouter()
const dragSession = useDragSession()

// Conditional dynamic import so the dev console is tree-shaken out of the
// production bundle entirely - `import.meta.env.DEV` folds to a literal
// `false` at build time, making the import() unreachable and droppable. A
// static import would ship the component even behind a v-if.
const DevConsole = isDev ? defineAsyncComponent(() => import('./components/DevConsole.vue')) : null

/**
 * Sprint 65 decision 1: the menu is a real full-screen menu, not a tab. Any
 * route flagged `meta: { chrome: false }` (the menu) hides the header/nav and
 * the End Day button; every gameplay route shows them.
 */
const showChrome = computed(() => route.meta.chrome !== false)

/**
 * Sprint 65: remember the gameplay route the player leaves when the menu
 * opens, so the menu's Continue and Escape-from-menu return there (pause-menu
 * semantics), not always to the garage. The dev-only spike sandbox is never a
 * "return here" target.
 */
watch(
  () => route.name,
  (name) => {
    if (typeof name === 'string' && name !== 'menu' && name !== 'spike') {
      ui.rememberGameplayRoute(name)
    }
  },
  { immediate: true },
)

function openMenu(): void {
  if (route.name !== 'menu') void router.push({ name: 'menu' })
}

/**
 * Sprint 51 decision 3: the one app-wide End Day mount point - shown on
 * every gameplay route (chrome routes), never on the menu.
 */
const endDayButton = ref<InstanceType<typeof EndDayButton> | null>(null)
const logDrawer = ref<InstanceType<typeof EventLogDrawer> | null>(null)
const showEndDay = computed(() => showChrome.value)

/**
 * Sprint 51 decision 1: Escape reaches the menu from anywhere in gameplay,
 * with three things taking priority over that navigation, checked in order:
 * (1) typing in a field - Escape is left to the field itself; (2) a live
 * pick/drag session - CarDetailScreen's own handler already clears that
 * (existing Sprint 24 behavior), so the global handler defers by doing
 * nothing; (3) any open modal (DayReport, JobComplete, SaleComplete,
 * MissionComplete, the event-log drawer, End Day's cart confirm) - Escape
 * closes it instead of navigating away underneath it.
 */
function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const activeTag = document.activeElement?.tagName
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return
  if (dragSession.value?.mode === 'pick') return
  if (game.reportVisible) {
    game.dismissReport()
    return
  }
  if (game.lastJobResult) {
    game.dismissJobResult()
    return
  }
  if (game.lastSaleResult) {
    game.dismissSaleResult()
    return
  }
  if (game.lastMissionResult) {
    game.dismissMissionResult()
    return
  }
  if (logDrawer.value?.open) {
    logDrawer.value.close()
    return
  }
  if (endDayButton.value?.confirming) {
    endDayButton.value.cancel()
    return
  }
  // Sprint 65: Escape is a pause-menu toggle - open the menu from gameplay,
  // and from the menu return to the gameplay route the player left.
  if (route.name === 'menu') {
    void router.push({ name: ui.lastGameplayRoute })
  } else {
    void router.push({ name: 'menu' })
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <header v-if="showChrome" class="chrome">
    <h1>Ran When Parked</h1>
    <nav>
      <RouterLink :to="{ name: 'garage' }">Garage</RouterLink>
      <RouterLink :to="{ name: 'jobs' }">Jobs</RouterLink>
      <RouterLink :to="{ name: 'auctions' }">Auctions</RouterLink>
      <RouterLink :to="{ name: 'parts' }">Parts</RouterLink>
      <RouterLink :to="{ name: 'inventory' }">Inventory</RouterLink>
      <RouterLink :to="{ name: 'upgrades' }">Upgrades</RouterLink>
      <RouterLink :to="{ name: 'staff' }" data-test="nav-staff">Staff</RouterLink>
      <RouterLink :to="{ name: 'standing' }" data-test="nav-standing">Standing</RouterLink>
      <!-- Sprint 69 item 20: the event log is reference material, not a
           permanent wall under the garage's bays. A control in the chrome,
           opened on demand. -->
      <EventLogDrawer ref="logDrawer" />
      <!-- Sprint 65 decision 1: a menu CONTROL (not a tab) - a mouse player's
           way into the full-screen menu, mirroring Escape. -->
      <button class="menu-button" data-test="open-menu" title="Menu (Esc)" @click="openMenu">
        Menu
      </button>
      <button v-if="isDev" class="dev-toggle" @click="ui.toggleDevConsole()">dev</button>
    </nav>
  </header>

  <main :class="{ 'with-end-day': showChrome }">
    <RouterView />
  </main>

  <div v-if="showEndDay" class="floating-end-day">
    <EndDayButton ref="endDayButton" />
  </div>

  <DayReport />
  <JobCompleteModal />
  <SaleCompleteModal />
  <MissionCompleteModal />
  <TutorialOverlay v-if="showChrome" />
  <component :is="DevConsole" v-if="DevConsole" />
</template>

<style scoped>
.chrome {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--mg-space-3);
  border-bottom: var(--mg-border);
  padding-bottom: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

h1 {
  color: var(--mg-neon-cyan);
  letter-spacing: 0.3em;
  font-size: var(--mg-fs-xl);
  text-transform: uppercase;
  margin: 0;
}

nav {
  display: flex;
  gap: var(--mg-space-3);
  align-items: center;
}

nav a {
  color: var(--mg-text-dim);
  text-decoration: none;
  padding: var(--mg-space-1) var(--mg-space-2);
  border-radius: 4px;
}

nav a.router-link-active {
  color: var(--mg-neon-pink);
}

/* Sprint 65 decision 1: the menu control - a button styled like the dev
   toggle (a control, not a nav tab). */
.menu-button {
  background: transparent;
  color: var(--mg-text-dim);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  cursor: pointer;
}

.menu-button:hover {
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}

.dev-toggle {
  background: transparent;
  color: var(--mg-neon-violet);
  border: 1px solid var(--mg-neon-violet);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
}

/* Sprint 51 decision 3: room for the fixed End Day button so it never
   covers the bottom of a screen's own content. */
main.with-end-day {
  padding-bottom: 80px;
}

.floating-end-day {
  position: fixed;
  right: var(--mg-space-4);
  bottom: var(--mg-space-4);
  z-index: 100;
}
</style>
