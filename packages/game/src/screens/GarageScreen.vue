<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { describeLogEntry } from '../utils/dayLogFormat'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

// Newest entries first, capped - the full log can grow unbounded over a career.
const recentLog = computed(() =>
  game.dayLog
    .slice(-40)
    .reverse()
    .map((entry, i) => ({
      id: game.dayLog.length - i,
      text: describeLogEntry(entry, game.resolveModelName),
    })),
)
</script>

<template>
  <section class="garage">
    <h2>Garage</h2>

    <dl class="stats">
      <div>
        <dt>Day</dt>
        <dd data-test="day-value">{{ game.day }}</dd>
      </div>
      <div>
        <dt>Cash</dt>
        <dd class="cash">{{ formatYen(game.cashYen) }}</dd>
      </div>
      <div>
        <dt>Reputation</dt>
        <dd>{{ game.reputationTier }}</dd>
      </div>
      <div>
        <dt>Cars owned</dt>
        <dd>{{ game.ownedCarCount }}</dd>
      </div>
    </dl>

    <div class="controls">
      <button class="primary" data-test="end-day" @click="game.endDay()">End Day</button>
      <button data-test="new-game" @click="game.newGame()">New Game</button>
    </div>

    <section class="log">
      <h3>Event log</h3>
      <p v-if="recentLog.length === 0" class="empty">
        No events yet. End a day to advance the sim.
      </p>
      <ul v-else>
        <li v-for="line in recentLog" :key="line.id">{{ line.text }}</li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
h2 {
  color: var(--mg-neon-cyan);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--mg-space-3);
  margin: var(--mg-space-4) 0;
}

.stats div {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.stats dt {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.stats dd {
  margin: var(--mg-space-1) 0 0;
  font-size: var(--mg-fs-lg);
}

.cash {
  color: var(--mg-yen);
}

.controls {
  display: flex;
  gap: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}

button.primary {
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-pink);
}

.log h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
}

.log .empty {
  color: var(--mg-text-dim);
}

.log ul {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 320px;
  overflow-y: auto;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
}

.log li {
  padding: var(--mg-space-2) var(--mg-space-3);
  border-bottom: var(--mg-border);
  font-size: var(--mg-fs-sm);
}

.log li:last-child {
  border-bottom: none;
}
</style>
