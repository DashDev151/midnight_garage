<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { classifyDayReport, pluralise } from '../utils/dayLogFormat'
import { formatYen, formatYenDelta } from '../utils/formatYen'

const game = useGameStore()

const report = computed(() => game.lastDayReport)

/**
 * Sprint 64: the report's structured view - wins as celebration cards, the
 * recurring money in one honest line, the meaningful shop/market lines
 * (outbid first), and the pure noise aggregated. All derived in the game
 * layer via `classifyDayReport`; the sim is untouched.
 */
const view = computed(() =>
  classifyDayReport(report.value?.entries ?? [], game.resolveModelName, game.buyerName),
)

const hasMoney = computed(() => {
  const m = view.value.money
  return m.earnedYen > 0 || m.onCarsYen > 0 || m.billsYen > 0
})

const isQuietDay = computed(
  () =>
    view.value.wins.length === 0 &&
    view.value.notable.length === 0 &&
    view.value.noise.length === 0 &&
    !hasMoney.value,
)
</script>

<template>
  <div v-if="game.reportVisible && report" class="overlay" data-test="day-report">
    <div class="report">
      <!-- Sprint 69 item 6b: the heading leads with the win. Sprint 64 put
           win cards first and they still did not land - a weight problem, not
           a missing feature - so the very first words of the report are now
           the thing that happened. -->
      <h3 data-test="report-heading">
        <template v-if="view.wins.length === 1 && view.wins[0]">
          Day {{ report.day }} - you {{ view.wins[0].kind === 'bought' ? 'bought' : 'won' }} the
          {{ view.wins[0].modelName }}
        </template>
        <template v-else-if="view.wins.length > 1">
          Day {{ report.day }} - {{ pluralise(view.wins.length, 'car') }} in the shop
        </template>
        <template v-else>Day {{ report.day }} complete</template>
      </h3>

      <!-- Wins first: a car you won reads as the win it is, never a red loss. -->
      <ul v-if="view.wins.length" class="wins" data-test="report-wins">
        <li v-for="(win, i) in view.wins" :key="i" class="win-card">
          <span class="win-banner">{{ win.kind === 'bought' ? 'Bought' : 'Won' }}</span>
          <span class="win-name">{{ win.year }} {{ win.modelName }}</span>
          <span class="win-price">for {{ formatYen(win.priceYen) }}</span>
        </li>
      </ul>

      <!-- The recurring money, honestly split - the net delta is secondary now. -->
      <div v-if="hasMoney" class="money" data-test="report-money">
        <span v-if="view.money.earnedYen > 0" class="money-in"
          >Earned {{ formatYen(view.money.earnedYen) }}</span
        >
        <span v-if="view.money.onCarsYen > 0" class="money-out"
          >Bought cars {{ formatYen(view.money.onCarsYen) }}</span
        >
        <span v-if="view.money.billsYen > 0" class="money-out"
          >Bills {{ formatYen(view.money.billsYen) }}</span
        >
      </div>
      <p class="net" :class="report.cashDeltaYen < 0 ? 'down' : 'up'" data-test="report-net">
        Net today {{ formatYenDelta(report.cashDeltaYen) }}
      </p>

      <ul v-if="view.notable.length" class="notable" data-test="report-notable">
        <li v-for="(line, i) in view.notable" :key="i">{{ line }}</li>
      </ul>

      <ul v-if="view.noise.length" class="noise" data-test="report-noise">
        <li v-for="(line, i) in view.noise" :key="i">{{ line }}</li>
      </ul>

      <p v-if="isQuietDay" class="quiet">A quiet day - nothing to report.</p>

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
  background: rgba(16, 17, 19, 0.8); /* --mg-night-deep at 0.8 */
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

/* Sprint 64: the win cards - the first thing the eye lands on, in accent
   colour, never red. */
.wins {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-2);
}

.win-card {
  /* Sprint 69 item 6b: real weight. Was a baseline-aligned row that read like
     any other line; now the banner and the car name carry the card and it is
     unmistakably the loudest thing in the report. */
  display: grid;
  gap: 2px;
  background: var(--mg-night-deep);
  border: 2px solid var(--mg-success);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  text-align: center;
}

.win-card .win-banner {
  font-size: var(--mg-fs-sm);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--mg-success);
}

.win-card .win-name {
  font-size: var(--mg-fs-lg);
  color: var(--mg-text);
}

.win-card .win-price {
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.win-banner {
  color: var(--mg-success);
  font-size: var(--mg-fs-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.win-name {
  color: var(--mg-neon-cyan);
}

.win-price {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

/* The money split: a compact, quiet line - earned in, spend out. */
.money {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-1) var(--mg-space-3);
  margin: 0 0 var(--mg-space-1);
  font-size: var(--mg-fs-sm);
}

.money-in {
  color: var(--mg-success);
}

.money-out {
  color: var(--mg-text-dim);
}

.net {
  margin: 0 0 var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.net.up {
  color: var(--mg-success);
}

.net.down {
  color: var(--mg-text-dim);
}

.quiet {
  color: var(--mg-text-dim);
}

.notable,
.noise {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
}

.notable li {
  padding: var(--mg-space-1) 0;
  border-bottom: var(--mg-border);
  font-size: var(--mg-fs-sm);
}

.notable li:last-child {
  border-bottom: none;
}

/* Aggregated noise: dimmer and lighter than the notable lines. */
.noise li {
  padding: 2px 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
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
