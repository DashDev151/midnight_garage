<script setup lang="ts">
import type { LetterAuctionGrade, OverallAuctionGrade } from '@midnight-garage/sim'
import { computed } from 'vue'

/**
 * One real-world auction-style grade rendered as a
 * chunky ink-stamp box (`AuctionScreen.vue`). Pure presentation over
 * `computeAuctionGrade`'s own output (sim/auctionGrade.ts); this component
 * adds no new grading logic, only an ink-color mapping and stamp styling.
 *
 * Ink ramp: green for a strong grade (S/6/5 overall, A/B
 * letter), sodium amber for a middling one (4.5/4/3.5 overall, C letter),
 * red for a weak one (3/2/1 overall, D/E letter), and `R` (the structural-
 * defect flag `computeAuctionGrade` returns when a mechanical part is
 * scrap or genuinely missing) gets its own deepest-red tone, visually
 * distinct from an ordinary weak grade rather than folded into the same
 * bucket.
 */
const props = defineProps<{
  label: string
  grade: OverallAuctionGrade | LetterAuctionGrade
}>()

type StampTone = 'green' | 'amber' | 'red' | 'defect'

const GREEN_GRADES = new Set<string>(['S', '6', '5', 'A', 'B'])
const AMBER_GRADES = new Set<string>(['4.5', '4', '3.5', 'C'])

function toneFor(grade: string): StampTone {
  if (grade === 'R') return 'defect'
  if (GREEN_GRADES.has(grade)) return 'green'
  if (AMBER_GRADES.has(grade)) return 'amber'
  return 'red' // 3/2/1 (overall), D/E (letter) - every remaining real grade
}

const tone = computed(() => toneFor(props.grade))
const rotationDeg = (Math.random() * 3 - 1.5).toFixed(2)
</script>

<template>
  <span
    class="grade-stamp"
    :class="'stamp-' + tone"
    :style="{ transform: `rotate(${rotationDeg}deg)` }"
  >
    <span class="stamp-label">{{ label }}</span>
    <span class="stamp-value">{{ grade }}</span>
  </span>
</template>

<style scoped>
/*
 * Rule-of-glow compliance (art-direction.md 2): several lots on the board
 * at once, three stamps each, would blow the "2-3 saturated elements per
 * screen" budget at full ink strength - stamps sit muted by default and
 * only reach full saturation on the hovered/focused card (the parent
 * `.lot` in AuctionScreen.vue reaches in via `:deep()` to flip this).
 */
.grade-stamp {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: var(--mg-space-1) var(--mg-space-3);
  border: 3px solid currentColor;
  border-radius: 3px;
  font-family: inherit;
  filter: saturate(0.5) brightness(0.85);
  transition: filter 0.15s ease;
  /* Forces its own compositor layer so the rotated text stays crisp. */
  backface-visibility: hidden;
}

.stamp-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.stamp-value {
  font-size: var(--mg-fs-lg);
  font-weight: bold;
  line-height: 1.15;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

.stamp-green {
  color: var(--mg-success);
}

.stamp-amber {
  color: var(--mg-neon-violet);
}

.stamp-red {
  color: var(--mg-danger);
}

/* The structural-defect flag: the deepest, most saturated red of the four -
   unmistakably worse than an ordinary weak grade, never at rest with the
   others even when the card isn't hovered. */
.stamp-defect {
  color: var(--mg-danger);
  filter: saturate(0.85) brightness(0.75);
}
</style>
