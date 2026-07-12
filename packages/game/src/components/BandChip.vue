<script setup lang="ts">
import type { ConditionBand } from '@midnight-garage/content'

/**
 * The shared band chip (Sprint 28 decision "shared band chip/formatter
 * component") - the five named condition bands (Sprint 26), colored
 * consistently everywhere a band renders: the car-detail screen's group and
 * per-part rows, and the auction lot-detail's group and per-part rows
 * (Sprint 27). Built once, reused on both screens, so "what color is a
 * 'poor' chip" has exactly one answer instead of two screens each
 * authoring their own.
 *
 * `band: null` renders the one state a real part slot can be in with no
 * condition to show (Sprint 28; Sprint 32: an empty slot, whether a
 * genuine defect or the one legitimately-empty forced-induction-on-NA
 * case) as "empty" rather than making every caller branch between this
 * component and its own ad hoc markup. Callers that need to distinguish a
 * defect from legitimate absence layer their own tag alongside this one
 * (`CarPartRowView`'s `missing`/`legitimatelyAbsent`) rather than this
 * component guessing at which.
 */
defineProps<{ band: ConditionBand | null }>()
</script>

<template>
  <span v-if="band" class="band-chip" :class="'band-' + band">{{ band }}</span>
  <span v-else class="band-chip band-unfitted">empty</span>
</template>

<style scoped>
.band-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--mg-radius);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
  border: var(--mg-border);
}

.band-mint {
  color: var(--mg-success);
  border-color: var(--mg-success);
}

.band-fine {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

.band-worn {
  color: var(--mg-text-dim);
}

.band-poor,
.band-scrap {
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}

.band-unfitted {
  color: var(--mg-text-dim);
}
</style>
