<script setup lang="ts">
import { computed } from 'vue'

/**
 * Sprint 69 (playtest item 24): a labelled progress bar, "19 / 120" against a
 * named threshold.
 *
 * The maintainer asked for exactly this after using Sprint 62's prose-only
 * Standing screen: *"Make the mastery progress bars. Like 19/120 to next
 * level. Same with Rep."* It exists ONLY for that one screen - progression
 * bible law 4 still bans ambient meters everywhere else, and its second
 * amendment (this sprint) permits bars on the one screen the player opens on
 * purpose, because a shop owner can read their own ledger.
 *
 * `max: null` means there is nothing left to climb (the top of the reputation
 * ladder). The bar reads full rather than empty - an empty rail at the top of
 * a ladder reads as failure, which is the opposite of the truth.
 */
const props = defineProps<{
  value: number
  /** The threshold being climbed toward, or null when there is none. */
  max: number | null
  /** What the threshold IS, in the player's words - rendered beneath. */
  caption?: string
  /** Renders the bar in the earned/complete accent. */
  complete?: boolean
}>()

const atTop = computed(() => props.max === null)

const fraction = computed(() => {
  if (props.max === null) return 1
  if (props.max <= 0) return 1
  return Math.max(0, Math.min(1, props.value / props.max))
})

const readout = computed(() =>
  props.max === null ? String(props.value) : `${props.value} / ${props.max}`,
)
</script>

<template>
  <div class="progress">
    <div class="rail" :class="{ complete: complete || atTop }">
      <div
        class="fill"
        :style="{ width: `${fraction * 100}%` }"
        role="progressbar"
        :aria-valuenow="value"
        :aria-valuemin="0"
        :aria-valuemax="max ?? value"
        data-test="progress-fill"
      />
    </div>
    <div class="readout">
      <span data-test="progress-readout">{{ readout }}</span>
      <span v-if="caption" class="caption">{{ caption }}</span>
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: grid;
  gap: 2px;
}

.rail {
  height: 10px;
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--mg-neon-cyan);
}

.rail.complete .fill {
  background: var(--mg-success);
}

.readout {
  display: flex;
  justify-content: space-between;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  color: var(--mg-text);
}

.caption {
  color: var(--mg-text-dim);
}
</style>
