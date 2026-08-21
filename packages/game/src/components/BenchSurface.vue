<script setup lang="ts">
import type { BenchSurfacePartView } from '../stores/gameStore'
import BandChip from './BandChip.vue'

/**
 * What is laid out on the bench: one row per part, with the grade it is at
 * and the way back to the warehouse. Clicking a row picks the part the job
 * tabs and the step strip below then work on.
 *
 * The band chip reads the store's own live band, so a job finishing updates
 * the row where it stands, with nothing remembered here.
 */

defineProps<{
  parts: BenchSurfacePartView[]
  selectedInstanceId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', partInstanceId: string): void
  (e: 'return-part', partInstanceId: string): void
}>()

const EMPTY_COPY = 'Nothing on the bench. Bring a part over from the warehouse.'
const RETURN_LABEL = 'Back to the warehouse'
</script>

<template>
  <section class="bench-surface" data-test="bench-surface">
    <ul v-if="parts.length > 0" class="surface-list">
      <li
        v-for="part in parts"
        :key="part.instanceId"
        class="surface-row"
        :class="{ 'surface-row-selected': part.instanceId === selectedInstanceId }"
      >
        <button
          type="button"
          class="part-button"
          :data-test="'bench-part-' + part.instanceId"
          @click="emit('select', part.instanceId)"
        >
          <span class="part-label">{{ part.label }}</span>
          <BandChip :band="part.band" />
        </button>
        <button
          type="button"
          class="return-button"
          :data-test="'bench-return-' + part.instanceId"
          @click="emit('return-part', part.instanceId)"
        >
          {{ RETURN_LABEL }}
        </button>
      </li>
    </ul>
    <p v-else class="surface-empty" data-test="bench-empty">{{ EMPTY_COPY }}</p>
  </section>
</template>

<style scoped>
.bench-surface {
  margin-top: var(--mg-space-3);
  border: var(--mg-border);
  background: var(--mg-panel);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.surface-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.surface-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  padding: var(--mg-space-1) 0;
  border-bottom: var(--mg-border);
}

.surface-row:last-child {
  border-bottom: none;
}

.part-button {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  min-width: 0;
  padding: var(--mg-space-1) var(--mg-space-2);
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--mg-text);
  font: inherit;
  font-size: var(--mg-fs-sm);
  text-align: left;
  cursor: pointer;
}

.surface-row-selected .part-button {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
}

.part-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.return-button {
  flex: none;
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
  cursor: pointer;
}

.part-button:focus-visible,
.return-button:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

.surface-empty {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
