<script setup lang="ts">
import type { ConditionBand } from '@midnight-garage/content'
import { bandsAbove } from '@midnight-garage/sim'
import { computed } from 'vue'

/**
 * Sprint 40, the shared target-band control (playtest item 5): segmented
 * buttons offering every band strictly above `currentBand`, up to mint -
 * never the current band itself, never scrap. Shared by the three sites the
 * player picks a repair/recondition target (the car-detail per-part repair
 * row, its group "repair all" convenience, and the inventory recondition
 * control) so "what bands can I pick" lives in exactly one place instead of
 * three hardcoded mint/fine literals.
 *
 * Purely presentational: the parent owns the selected value and what
 * picking one actually does (stage a repair, kick off a recondition). Click
 * handlers stop propagation themselves, since every real call site nests
 * this inside a larger clickable row/card.
 */
const props = defineProps<{
  currentBand: ConditionBand
  selected: ConditionBand
  /** Stable per-site data-test prefix (e.g. `band-part-dampers`) - each
   * button's own hook is `${testIdPrefix}-${band}`. */
  testIdPrefix: string
}>()

const emit = defineEmits<{
  select: [band: ConditionBand]
}>()

const options = computed(() => bandsAbove(props.currentBand))
</script>

<template>
  <div v-if="options.length > 0" class="band-picker" role="group" :data-test="testIdPrefix">
    <button
      v-for="band in options"
      :key="band"
      type="button"
      class="band-option"
      :class="{ active: band === selected }"
      :data-test="`${testIdPrefix}-${band}`"
      @click.stop="emit('select', band)"
    >
      {{ band }}
    </button>
  </div>
</template>

<style scoped>
.band-picker {
  display: inline-flex;
  gap: 2px;
}

.band-option {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
  cursor: pointer;
}

.band-option.active {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}
</style>
