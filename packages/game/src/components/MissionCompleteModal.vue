<script setup lang="ts">
import type { ComponentId } from '@midnight-garage/content'
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

/**
 * Sprint 77 decision 6: the deliver flow's own receipt - the same shape and
 * lifecycle as `SaleCompleteModal`/`JobCompleteModal` (a store ref set on the
 * action, cleared on dismiss, mounted once globally in App.vue, dismissible
 * with Escape via App.vue's existing modal priority order). `result.copy` is
 * already the RIGHT template picked in the store (`overdeliveredCopy` when
 * the tip triggered, `deliveredCopy` otherwise) - this component never
 * branches on `tipYen` for that. Story missions are unfailable (Sprint 85
 * decision 2), so there is no lapse surface at all.
 */
const game = useGameStore()

const result = computed(() => game.lastMissionResult)

/** One line per group `reputationReward` actually split across - the
 * untouched groups (0) stay silent, same convention as `JobCompleteModal`'s
 * own `specialtyLines`. */
const specialtyLines = computed(() => {
  const r = result.value
  if (!r) return []
  return (Object.entries(r.specialtyGained) as [ComponentId, number][])
    .filter(([, delta]) => delta !== 0)
    .map(([group, delta]) => `${game.componentLabel(group)} +${delta}`)
})
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
          <dt>Reputation</dt>
          <dd class="up">+{{ result.reputationGained }}</dd>
        </div>
        <div v-if="specialtyLines.length">
          <dt>Specialty</dt>
          <dd>{{ specialtyLines.join(', ') }}</dd>
        </div>
      </dl>

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

.up {
  color: var(--mg-success);
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
