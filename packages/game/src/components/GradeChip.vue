<script setup lang="ts">
import type { Grade } from '@midnight-garage/content'

/**
 * Sprint 69 (playtest item 14): a part's grade as a colour-coded chip, not a
 * bare word buried in a meta line.
 *
 * Deliberately `BandChip`'s exact shape - same box, same sizing, same
 * capitalisation - so the two chips a player sees side by side on a part row
 * read as one family rather than two designers. The ramp climbs
 * stock -> street -> sport -> race, which is the same ordering the catalog
 * and the price sheet already use.
 */
defineProps<{ grade: Grade }>()
</script>

<template>
  <span class="grade-chip" :class="'grade-' + grade">{{ grade }}</span>
</template>

<style scoped>
.grade-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--mg-radius);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
  border: var(--mg-border);
}

.grade-stock {
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
}

.grade-street {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

.grade-sport {
  color: var(--mg-neon-violet);
  border-color: var(--mg-neon-violet);
}

.grade-race {
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}
</style>
