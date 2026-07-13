<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import DayReport from './components/DayReport.vue'
import EndDayButton from './components/EndDayButton.vue'
import JobCompleteModal from './components/JobCompleteModal.vue'
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
 * Sprint 51 decision 3: the one app-wide End Day mount point - shown on
 * every gameplay route (not the menu, not the dev-only spike sandbox).
 */
const endDayButton = ref<InstanceType<typeof EndDayButton> | null>(null)
const showEndDay = computed(() => route.name !== 'menu' && route.name !== 'spike')

/**
 * Sprint 51 decision 1: Escape reaches the menu from anywhere in gameplay,
 * with three things taking priority over that navigation, checked in order:
 * (1) typing in a field - Escape is left to the field itself; (2) a live
 * pick/drag session - CarDetailScreen's own handler already clears that
 * (existing Sprint 24 behavior), so the global handler defers by doing
 * nothing; (3) any open modal (DayReport, JobComplete, End Day's cart
 * confirm) - Escape closes it instead of navigating away underneath it.
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
  if (endDayButton.value?.confirming) {
    endDayButton.value.cancel()
    return
  }
  if (route.name !== 'menu') void router.push({ name: 'menu' })
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <header class="chrome">
    <h1>MIDNIGHT GARAGE</h1>
    <nav>
      <RouterLink :to="{ name: 'garage' }">Garage</RouterLink>
      <RouterLink :to="{ name: 'jobs' }">Jobs</RouterLink>
      <RouterLink :to="{ name: 'auctions' }">Auctions</RouterLink>
      <RouterLink :to="{ name: 'parts' }">Parts</RouterLink>
      <RouterLink :to="{ name: 'inventory' }">Inventory</RouterLink>
      <RouterLink :to="{ name: 'upgrades' }">Upgrades</RouterLink>
      <RouterLink :to="{ name: 'menu' }" data-test="nav-menu">Menu</RouterLink>
      <button v-if="isDev" class="dev-toggle" @click="ui.toggleDevConsole()">dev</button>
    </nav>
  </header>

  <main class="with-end-day">
    <RouterView />
  </main>

  <div v-if="showEndDay" class="floating-end-day">
    <EndDayButton ref="endDayButton" show-cash />
  </div>

  <DayReport />
  <JobCompleteModal />
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
