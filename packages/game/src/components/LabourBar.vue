<script setup lang="ts">
import { computed } from 'vue'

/**
 * The shared labour bar. The day's remaining
 * labour is a glanceable BAR - the primary display - with the exact integer
 * point readout on hover only (the bar's `title`), never crowding the fill.
 *
 * Built as one component so every labour readout is the same bar: the garage
 * dashboard, the car-detail Work section, and anywhere else the day's labour is
 * shown.
 *
 * `caption` is optional: callers whose surrounding label already names the
 * readout (the dashboard's `<dt>Labour left today</dt>`) omit it.
 */
const props = defineProps<{
  /** Labour points left today. */
  remaining: number
  /** Labour points available in a full day. */
  max: number
  /** Optional inline label rendered before the track. */
  caption?: string
  /**
   * The small inline variant: no card chrome, a short fixed-width track that
   * sits on the baseline of a dotted multi-stat header line. Used by the
   * auction and service-jobs header readouts.
   */
  compact?: boolean
}>()

const fillPercent = computed(() => {
  if (props.max <= 0) return 0
  return Math.max(0, Math.min(100, (props.remaining / props.max) * 100))
})
</script>

<template>
  <div
    class="labour-bar"
    :class="{ compact }"
    data-test="labour-bar"
    :title="`${remaining} / ${max} labour`"
  >
    <span v-if="caption" class="labour-bar-caption">{{ caption }}</span>
    <span class="labour-bar-track">
      <span
        class="labour-bar-fill"
        :class="{ empty: remaining <= 0 }"
        :style="{ width: fillPercent + '%' }"
        data-test="labour-bar-fill"
      ></span>
    </span>
  </div>
</template>

<style scoped>
/* The day's labour as a glanceable bar. The exact integer point readout is on
   hover (the container's title). */
.labour-bar {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
  padding: var(--mg-space-2);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.labour-bar-caption {
  flex: 0 0 auto;
  color: var(--mg-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.labour-bar-track {
  flex: 1 1 auto;
  height: 0.7rem;
  border-radius: var(--mg-radius);
  background: var(--mg-bg);
  overflow: hidden;
}

.labour-bar-fill {
  display: block;
  height: 100%;
  background: var(--mg-neon-violet);
  transition: width 120ms ease;
}

.labour-bar-fill.empty {
  background: var(--mg-text-dim);
}

/* The inline variant: strips the card chrome and sits on the baseline of a
   dotted multi-stat header line, its track a short fixed width rather than a
   full-width fill. The integer readout stays on hover (the title). */
.labour-bar.compact {
  display: inline-flex;
  vertical-align: middle;
  gap: var(--mg-space-1);
  margin: 0;
  padding: 0;
  border: none;
  background: none;
}

.labour-bar.compact .labour-bar-caption {
  text-transform: none;
  letter-spacing: normal;
}

.labour-bar.compact .labour-bar-track {
  flex: 0 0 auto;
  width: 3.5rem;
}
</style>
