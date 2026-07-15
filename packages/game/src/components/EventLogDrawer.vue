<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { describeLogEntry } from '../utils/dayLogFormat'

/**
 * Sprint 69 (playtest item 20): the event log, off the main garage view.
 *
 * It lived as a permanent 40-line wall at the bottom of `GarageScreen`, under
 * the bays and the shop - the two things the garage is actually for. It is
 * reference material a player consults, not something they read every day, so
 * it moves behind a small control in the app chrome and opens on demand.
 *
 * The derivation is the same one the garage ran (`describeLogEntry` over the
 * last 40 entries, newest first) - moved, not rewritten, so the lines a player
 * knows are the lines they still get.
 */
const game = useGameStore()
const open = ref(false)

const recentLog = computed(() =>
  game.dayLog
    .slice(-40)
    .reverse()
    .map((entry, i) => ({
      id: game.dayLog.length - i,
      text: describeLogEntry(entry, game.resolveModelName, game.buyerName),
    })),
)

function toggle(): void {
  open.value = !open.value
}

/** App.vue's global Escape handler closes this the same way it closes every
 * other overlay, rather than navigating to the menu underneath it. */
defineExpose({ open, close: () => (open.value = false) })
</script>

<template>
  <button class="log-toggle" data-test="log-toggle" :aria-expanded="open" @click="toggle">
    Log
  </button>

  <div v-if="open" class="drawer" data-test="log-drawer">
    <div class="drawer-head">
      <h3>Event log</h3>
      <button class="close" data-test="log-close" aria-label="Close the event log" @click="toggle">
        &times;
      </button>
    </div>
    <p v-if="recentLog.length === 0" class="empty">No events yet. End a day to advance the sim.</p>
    <ul v-else>
      <li v-for="line in recentLog" :key="line.id">{{ line.text }}</li>
    </ul>
  </div>
</template>

<style scoped>
.log-toggle {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

.log-toggle:hover {
  color: var(--mg-neon-cyan);
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw);
  background: var(--mg-panel);
  border-left: 1px solid var(--mg-panel-edge);
  padding: var(--mg-space-3);
  overflow-y: auto;
  z-index: 200;
}

.drawer-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

h3 {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
}

.close {
  background: none;
  border: none;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-md);
  cursor: pointer;
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--mg-space-1);
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}
</style>
