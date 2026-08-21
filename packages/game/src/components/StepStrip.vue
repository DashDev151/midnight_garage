<script setup lang="ts">
import type { RepairJobStepCard } from '@midnight-garage/sim'
import { computed } from 'vue'

/**
 * The selected job's recipe, step by step: the tool each one wants and the
 * line of copy that says what happens at it.
 *
 * A job card carries the steps STILL TO WORK, counted forward from
 * `stepsDone`, so the first row is the step the bench is on and the rest wait
 * behind it. Row numbering is the recipe's own, not the strip's: the third
 * step of a seven-step job reads `step-2` whether or not the two before it
 * are still on show.
 */

const props = defineProps<{
  /** The steps left to work, in recipe order. */
  steps: RepairJobStepCard[]
  /** How many steps of this job are already ticked. */
  stepsDone: number
  /** The current step's energy figure, worded by the screen. */
  energyText: string
}>()

interface StepRow {
  index: number
  toolLabel: string
  copy: string
  current: boolean
}

const rows = computed<StepRow[]>(() =>
  props.steps.map((step, offset) => ({
    index: props.stepsDone + offset,
    toolLabel: step.toolLabel,
    copy: step.copy,
    current: offset === 0,
  })),
)
</script>

<template>
  <div class="step-strip" data-test="step-strip">
    <ol class="steps">
      <li
        v-for="row in rows"
        :key="row.index"
        class="step"
        :class="row.current ? 'step-current' : 'step-waiting'"
        :data-test="'step-' + row.index"
      >
        <span class="step-tool">{{ row.toolLabel }}</span>
        <span class="step-copy">{{ row.copy }}</span>
      </li>
    </ol>
    <p class="step-energy" data-test="step-energy">{{ energyText }}</p>
  </div>
</template>

<style scoped>
.step-strip {
  margin-top: var(--mg-space-2);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
}

.step {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
  padding: 1px 0;
  font-size: var(--mg-fs-sm);
}

.step-tool {
  flex: none;
  width: 10em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-current {
  color: var(--mg-neon-cyan);
}

.step-waiting {
  color: var(--mg-text-dim);
}

.step-energy {
  margin: var(--mg-space-1) 0 0;
  min-height: 1.2em;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
