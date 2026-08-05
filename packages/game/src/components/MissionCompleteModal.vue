<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'

/**
 * The deliver flow's own receipt - the same shape and
 * lifecycle as `SaleCompleteModal`/`JobCompleteModal` (a store ref set on the
 * action, cleared on dismiss, mounted once globally in App.vue, dismissible
 * with Escape via App.vue's existing modal priority order). `result.copy` is
 * already the RIGHT template picked in the store (`overdeliveredCopy` when
 * the tip triggered, `deliveredCopy` otherwise) - this component never
 * branches on `tipYen` for that. Story missions are unfailable, so there is
 * no lapse surface at all.
 */
const game = useGameStore()

const result = computed(() => game.lastMissionResult)

/** Dismiss on the way out to the Costs tab - otherwise this modal is still
 * sitting open, on top of that screen, when the router lands there. */
function goToCostSheet(): void {
  game.dismissMissionResult()
}
</script>

<template>
  <div v-if="result" class="overlay" data-test="mission-complete-modal">
    <div class="modal">
      <h3>Delivered</h3>
      <p class="flavor">{{ result.personaName }}: "{{ result.copy }}"</p>

      <dl class="numbers">
        <div>
          <dt>Payout</dt>
          <dd class="up" data-test="mission-result-payout">{{ formatYen(result.payoutYen) }}</dd>
        </div>
        <div v-if="result.tipYen > 0" data-test="mission-result-tip">
          <dt>Tip</dt>
          <dd class="up">{{ formatYen(result.tipYen) }}</dd>
        </div>
        <div>
          <dt>Your profit</dt>
          <dd :class="result.profitYen >= 0 ? 'up' : 'down'" data-test="mission-result-profit">
            {{ formatYenDelta(result.profitYen) }}
          </dd>
        </div>
        <div>
          <dt>Reputation</dt>
          <dd class="up">+{{ result.reputationGained }}</dd>
        </div>
      </dl>

      <p class="cost-note">
        That profit is the car's own number: buy price and repairs, nothing else. Rent, machine hire
        and delivery surcharges are billed to the shop, not the car, so they still come out of the
        till somewhere.
        <RouterLink
          :to="{ name: 'costs' }"
          data-test="mission-result-costs-link"
          @click="goToCostSheet"
          >See what the week cost.</RouterLink
        >
      </p>

      <button
        class="primary"
        data-test="mission-result-continue"
        @click="game.dismissMissionResult()"
      >
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
  z-index: 210;
  padding: var(--mg-space-3);
}

.modal {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-4);
  width: 100%;
  max-width: 360px;
}

h3 {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
}

.flavor {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.numbers {
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-1);
}

.numbers div {
  display: flex;
  justify-content: space-between;
  gap: var(--mg-space-3);
}

.numbers dt {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.numbers dd {
  margin: 0;
  color: var(--mg-text);
}

.cost-note {
  margin: 0 0 var(--mg-space-4);
  padding-top: var(--mg-space-3);
  border-top: var(--mg-border);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cost-note a {
  color: var(--mg-neon-cyan);
}

.up {
  color: var(--mg-success);
}

.down {
  color: var(--mg-danger);
}

button.primary {
  width: 100%;
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  color: var(--mg-neon-violet);
  padding: var(--mg-space-2);
  cursor: pointer;
}

button.primary:hover {
  background: color-mix(in srgb, var(--mg-neon-violet) 15%, transparent);
}
</style>
