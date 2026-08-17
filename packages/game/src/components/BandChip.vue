<script setup lang="ts">
import type { ConditionBand } from '@midnight-garage/content'

/**
 * The shared band chip - the five named condition bands, coloured
 * consistently everywhere a band renders: the car-detail screen's group and
 * per-part rows, and the auction lot-detail's group and per-part rows.
 * Built once, reused on both screens, so "what colour is a 'poor' chip"
 * has exactly one answer instead of two screens each authoring their own.
 *
 * `band: null` renders the one state a real part slot can be in with no
 * condition to show (an empty slot, whether a genuine defect or the one
 * legitimately-empty forced-induction-on-NA case) as "empty" rather than
 * making every caller branch between this component and its own ad hoc
 * markup. Callers that need to distinguish a defect from legitimate absence
 * layer their own tag alongside this one (`CarPartRowView`'s
 * `missing`/`legitimatelyAbsent`) rather than this component guessing at
 * which.
 *
 * `estimated` renders a hollow chip with an "est." suffix instead of the
 * plain band name - an OWNED car's slot the player has not yet verified
 * (`CarPartRowView.estimated`, knowledge-and-diagnosis.md section 1). `band`
 * is still the real prop driving colour/text; `estimated` only changes how
 * it is framed, never what it says - the guess itself is computed once,
 * upstream (`priorBand`, sim/knowledge.ts), never here.
 */
withDefaults(defineProps<{ band: ConditionBand | null; estimated?: boolean }>(), {
  estimated: false,
})
</script>

<template>
  <span v-if="band" class="band-chip" :class="['band-' + band, { 'band-estimated': estimated }]"
    >{{ band }}<span v-if="estimated" class="est-suffix"> est.</span></span
  >
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

/* Estimated: hollow rather than solid-coloured - a guess reads differently
   from a confirmed fact at a glance, whatever band colour it carries. */
.band-estimated {
  background: transparent;
  border-style: dashed;
  opacity: 0.85;
}

.est-suffix {
  font-style: italic;
  opacity: 0.8;
}
</style>
