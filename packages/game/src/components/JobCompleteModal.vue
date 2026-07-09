<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'

const game = useGameStore()

const result = computed(() => game.lastJobResult)

/** One flavor line, varying by outcome — no garage-name templating (no such field exists yet). */
const flavorLine = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.outcome === 'paid'
    ? `Thanks — ${r.workLabel.toLowerCase()} looks great!`
    : `${r.customerName} isn't happy — that wasn't what they asked for.`
})
</script>

<template>
  <div v-if="result" class="overlay" data-test="job-complete-modal">
    <div class="modal" :class="result.outcome">
      <h3>{{ result.outcome === 'paid' ? 'Job complete' : 'Job failed' }}</h3>
      <p class="flavor">{{ flavorLine }}</p>

      <dl class="numbers">
        <div v-if="result.outcome === 'paid'">
          <dt>Payout</dt>
          <dd class="up">{{ formatYen(result.payoutYen) }}</dd>
        </div>
        <div v-if="result.partCostYen !== undefined">
          <dt>Part cost</dt>
          <dd>{{ formatYen(result.partCostYen) }}</dd>
        </div>
        <div v-if="result.profitYen !== undefined">
          <dt>Profit</dt>
          <dd :class="result.profitYen >= 0 ? 'up' : 'down'">
            {{ formatYenDelta(result.profitYen) }}
          </dd>
        </div>
        <div>
          <dt>Reputation</dt>
          <dd :class="result.reputationDelta >= 0 ? 'up' : 'down'">
            {{ formatYenDelta(result.reputationDelta).replace('¥', '') }}
          </dd>
        </div>
        <div v-if="result.daysSpent !== undefined">
          <dt>Days on the job</dt>
          <dd>{{ result.daysSpent }}</dd>
        </div>
      </dl>

      <button class="primary" data-test="job-result-continue" @click="game.dismissJobResult()">
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
  z-index: 210;
  padding: var(--mg-space-3);
}

.modal {
  background: var(--mg-panel);
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-4);
  width: 100%;
  max-width: 360px;
}

.modal.paid {
  border-color: var(--mg-success);
}

.modal.failed {
  border-color: var(--mg-danger);
}

h3 {
  color: var(--mg-neon-cyan);
  margin-top: 0;
}

.flavor {
  color: var(--mg-text-dim);
  margin: 0 0 var(--mg-space-3);
}

.numbers {
  display: grid;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-4);
}

.numbers div {
  display: flex;
  justify-content: space-between;
  gap: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.numbers dt {
  color: var(--mg-text-dim);
}

.numbers dd {
  margin: 0;
}

.up {
  color: var(--mg-success);
}

.down {
  color: var(--mg-danger);
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
