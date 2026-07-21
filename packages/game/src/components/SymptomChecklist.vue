<script setup lang="ts">
import type { LotDetail } from '../stores/gameStore'
import { formatYenDelta } from '../utils/formatYen'

/**
 * The free, public symptom disclosure for a listed car: the symptom line, its
 * still-open cause checklist (each cause priced by what the deal moves "if
 * true"), the inline result copy from a run test, and the run-test buttons.
 * Purely presentational - the parent owns every decision: `disabledReasonFor`
 * says why a given test cannot run right now (`null` when it can),
 * `resultCopyFor` returns the copy already earned for a symptom, and a click
 * emits `run-test` for the parent to act on. Keeps the exact `data-test`
 * anchors both the auction board and the room demo rely on.
 */
withDefaults(
  defineProps<{
    symptoms: LotDetail['symptoms']
    lotId: string
    disabledReasonFor: (test: { minutes: number; alreadyRun: boolean }) => string | null
    resultCopyFor: (symptomIndex: number) => string | undefined
    /** Whether to show each cause's "if true" value delta. The auction board
     * shows it; the room demo hides it to keep one adjusting value on screen. */
    showDeltas?: boolean
  }>(),
  { showDeltas: true },
)

const emit = defineEmits<{
  (e: 'run-test', payload: { lotId: string; symptomIndex: number; testId: string }): void
}>()
</script>

<template>
  <div
    v-for="symptom in symptoms"
    :key="symptom.symptomIndex"
    class="symptom"
    :class="{ resolved: symptom.resolved }"
    :data-test="'symptom-' + lotId"
  >
    <p class="symptom-line">{{ symptom.line }}</p>
    <ul class="symptom-causes">
      <li
        v-for="cause in symptom.causes"
        :key="cause.causeId"
        :class="{ eliminated: cause.eliminated }"
      >
        <span class="mark" aria-hidden="true">{{ cause.eliminated ? '[x]' : '[ ]' }}</span>
        <span class="label">{{ cause.label }}</span>
        <span v-if="showDeltas" class="delta"
          >{{ formatYenDelta(cause.dealDeltaYen) }} if true</span
        >
      </li>
    </ul>

    <p
      v-if="resultCopyFor(symptom.symptomIndex)"
      class="test-result"
      :data-test="'test-result-' + lotId + '-' + symptom.symptomIndex"
    >
      {{ resultCopyFor(symptom.symptomIndex) }}
    </p>

    <div v-if="symptom.tests.length > 0" class="symptom-tests">
      <button
        v-for="test in symptom.tests"
        :key="test.testId"
        type="button"
        class="run-test"
        :disabled="!!disabledReasonFor(test)"
        :title="disabledReasonFor(test) ?? 'Run this test against the visit clock'"
        :data-test="'run-test-' + lotId + '-' + symptom.symptomIndex + '-' + test.testId"
        @click="
          emit('run-test', { lotId, symptomIndex: symptom.symptomIndex, testId: test.testId })
        "
      >
        {{ test.label }} ({{ test.minutes }}m)
      </button>
    </div>
  </div>
</template>

<style scoped>
/* A real checklist idiom (ASCII `[ ]` marks; decorative icons are banned),
   matching ServiceTaskList.vue's own look, extended with a per-cause value
   delta this list also needs to show. */
.symptom {
  margin-top: var(--mg-space-1);
  text-align: left;
}

.symptom-line {
  margin: 0;
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

.symptom-causes {
  list-style: none;
  margin: var(--mg-space-1) 0 0;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-text-dim);
}

.symptom-causes li {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.symptom-causes .mark {
  color: var(--mg-neon-cyan);
  flex-shrink: 0;
}

.symptom-causes .delta {
  color: var(--mg-text-dim);
}

/* A ruled-out cause strikes through - ServiceTaskList's own done-styling idiom
   (dim + line-through the label, mark goes success-coloured), reused rather
   than a second convention for the same idea. */
.symptom-causes li.eliminated .mark {
  color: var(--mg-success);
}

.symptom-causes li.eliminated .label {
  text-decoration: line-through;
}

.symptom-causes li.eliminated .delta {
  opacity: 0.6;
}

.symptom-tests {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-1);
  margin-top: var(--mg-space-1);
}

.run-test {
  font-size: var(--mg-fs-xs, 0.7rem);
  padding: 1px var(--mg-space-2);
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  background: transparent;
}

.test-result {
  margin: var(--mg-space-1) 0 0;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-neon-cyan);
}
</style>
