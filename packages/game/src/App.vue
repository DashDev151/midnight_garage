<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import DayReport from './components/DayReport.vue'
import JobCompleteModal from './components/JobCompleteModal.vue'
import SaveMenu from './components/SaveMenu.vue'
import { useUiStore } from './stores/uiStore'

const isDev = import.meta.env.DEV
const ui = useUiStore()

// Conditional dynamic import so the dev console is tree-shaken out of the
// production bundle entirely - `import.meta.env.DEV` folds to a literal
// `false` at build time, making the import() unreachable and droppable. A
// static import would ship the component even behind a v-if.
const DevConsole = isDev ? defineAsyncComponent(() => import('./components/DevConsole.vue')) : null
</script>

<template>
  <header class="chrome">
    <h1>MIDNIGHT GARAGE</h1>
    <nav>
      <RouterLink :to="{ name: 'garage' }">Garage</RouterLink>
      <RouterLink :to="{ name: 'jobs' }">Jobs</RouterLink>
      <RouterLink :to="{ name: 'auctions' }">Auctions</RouterLink>
      <RouterLink :to="{ name: 'parts' }">Parts</RouterLink>
      <RouterLink :to="{ name: 'spike' }">Spike</RouterLink>
      <SaveMenu />
      <button v-if="isDev" class="dev-toggle" @click="ui.toggleDevConsole()">dev</button>
    </nav>
  </header>

  <main>
    <RouterView />
  </main>

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
</style>
