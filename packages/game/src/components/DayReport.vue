<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { describeLogEntry } from '../utils/dayLogFormat'
import { formatYenDelta } from '../utils/formatYen'

const game = useGameStore()

const report = computed(() => game.lastDayReport)
const lines = computed(() =>
  (report.value?.entries ?? []).map((entry, i) => ({
    id: i,
    text: describeLogEntry(entry, game.resolveModelName),
  })),
)
</script>

<template>
  <div v-if="game.reportVisible && report" class="overlay" data-test="day-report">
    <div class="report">
      <h3>Day {{ report.day }} complete</h3>
      <p class="delta" :class="report.cashDeltaYen < 0 ? 'down' : 'up'">
        {{ formatYenDelta(report.cashDeltaYen) }}
      </p>

      <p v-if="lines.length === 0" class="quiet">A quiet day — nothing to report.</p>
      <ul v-else>
        <li v-for="line in lines" :key="line.id">{{ line.text }}</li>
      </ul>

      <button class="primary" data-test="report-continue" @click="game.dismissReport()">
        Continue
      </button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 8, 32, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: var(--mg-space-3);
}

.report {
  background: var(--mg-panel);
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-4);
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
}

h3 {
  color: var(--mg-neon-cyan);
  margin-top: 0;
}

.delta {
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

.delta.up {
  color: var(--mg-success);
}

.delta.down {
  color: var(--mg-danger);
}

.quiet {
  color: var(--mg-text-dim);
}

ul {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
}

li {
  padding: var(--mg-space-1) 0;
  border-bottom: var(--mg-border);
  font-size: var(--mg-fs-sm);
}

li:last-child {
  border-bottom: none;
}

.primary {
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border: 1px solid var(--mg-neon-pink);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-family: inherit;
  font-size: var(--mg-fs-md);
  cursor: pointer;
}
</style>
