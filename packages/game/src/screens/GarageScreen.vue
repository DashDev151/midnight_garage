<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { describeLogEntry } from '../utils/dayLogFormat'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const recentLog = computed(() =>
  game.dayLog
    .slice(-40)
    .reverse()
    .map((entry, i) => ({
      id: game.dayLog.length - i,
      text: describeLogEntry(entry, game.resolveModelName),
    })),
)

/** Worst zone condition, as a quick garage-card health read. */
function worstZone(condition: Record<string, number>): number {
  return Math.min(...Object.values(condition))
}
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
      <button class="primary" data-test="end-day" @click="game.commitDay()">End Day</button>
      <button data-test="new-game" @click="game.newGame()">New Game</button>
    </div>

    <section class="bays">
      <h3>Bays</h3>
      <p v-if="game.carsDetailed.length === 0" class="empty">
        No cars yet. Grant one from the dev console (auctions arrive in Sprint 06).
      </p>
      <ul v-else class="car-grid">
        <li v-for="detailed in game.carsDetailed" :key="detailed.car.id" class="car-card">
          <RouterLink :to="{ name: 'car', params: { id: detailed.car.id } }">
            <span class="car-name">{{ detailed.displayName }}</span>
            <span class="car-meta">{{ detailed.model.tier }} · {{ detailed.car.year }}</span>
            <span class="car-health">worst zone {{ worstZone(detailed.car.condition) }}/100</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="game.activeListings.length" class="listings">
      <h3>Listings ({{ game.activeListings.length }})</h3>
      <ul>
        <li v-for="listing in game.activeListings" :key="listing.id">
          {{ game.resolveModelName(listing.modelId) }} — asking
          {{ formatYen(listing.askingPriceYen) }}, resolves day {{ listing.resolvesOnDay }}
        </li>
      </ul>
    </section>

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

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
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

.empty {
  color: var(--mg-text-dim);
}

.car-grid {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--mg-space-3);
}

.car-card a {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  text-decoration: none;
  color: var(--mg-text);
}

.car-name {
  color: var(--mg-neon-cyan);
}

.car-meta,
.car-health {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.listings ul {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
}

.listings li {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) 0;
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
