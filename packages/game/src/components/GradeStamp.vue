<script setup lang="ts">
import type { LetterAuctionGrade, OverallAuctionGrade } from '@midnight-garage/sim'
import { computed } from 'vue'
import { seedRange } from '../utils/paperSeed'

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
 * bucket. This tone mapping carries real information (a player reads it as
 * the grade itself), so the paper-look rubber-stamp restyle (sprint223.md)
 * keeps it exactly as is rather than trading it for a decorative red/blue
 * ink pick - only the stamp's shape and texture change.
 */
const props = withDefaults(
  defineProps<{
    label: string
    grade: OverallAuctionGrade | LetterAuctionGrade
    /** The car/lot instance id this stamp belongs to - every seeded tilt and
     * offset below derives from it (`paperSeed`), so a stamp keeps its own
     * crooked angle for the life of the lot rather than reshuffling on every
     * render. Optional and empty by default, which still seeds a stable
     * (if uniform) look rather than falling back to randomness. */
    seedId?: string
  }>(),
  { seedId: '' },
)

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

/** A stamp never lands square or lines up with its neighbours - rotation and
 * a small offset, both keyed off this exact stamp (lot id + label), so the
 * four stamps on one card each carry their own crooked press. */
const rotationDeg = computed(() => seedRange(props.seedId, `stamp-rot-${props.label}`, -6, 6))
const offsetXPx = computed(() => seedRange(props.seedId, `stamp-x-${props.label}`, -3, 3))
const offsetYPx = computed(() => seedRange(props.seedId, `stamp-y-${props.label}`, -3, 3))
</script>

<template>
  <span
    class="grade-stamp"
    :class="'stamp-' + tone"
    :style="{
      transform: `rotate(${rotationDeg}deg) translate(${offsetXPx}px, ${offsetYPx}px)`,
    }"
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
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: var(--mg-space-1) var(--mg-space-3);
  border: 2.5px solid currentColor;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  filter: saturate(0.5) brightness(0.85);
  transition: filter 0.15s ease;
  /* The worn-rubber vignette: the strike fades toward its own edges rather
     than cutting off flat, same mask shape the reference stamp uses. */
  -webkit-mask-image: radial-gradient(
    130% 105% at 38% 30%,
    #000 52%,
    rgba(0, 0, 0, 0.55) 71%,
    #000 88%
  );
  mask-image: radial-gradient(130% 105% at 38% 30%, #000 52%, rgba(0, 0, 0, 0.55) 71%, #000 88%);
  /* Forces its own compositor layer so the rotated text stays crisp. */
  backface-visibility: hidden;
}

/* The letterpress unevenness of a real rubber stamp: a diagonal fleck
   pattern in the ink's own colour, multiplied over the border and text so
   the strike never reads perfectly flat. */
.grade-stamp::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    128deg,
    transparent 0 2px,
    currentColor 2px 3px,
    transparent 3px 6px
  );
  opacity: 0.12;
  mix-blend-mode: multiply;
  pointer-events: none;
}

.stamp-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.stamp-value {
  font-size: 15px;
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
