<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

/**
 * Dev-only playtest instrumentation: a fixed chip showing how much wall-clock
 * time this browser session has spent RUNNING (as opposed to paused for
 * note-taking), so an exported session log can be read against real play
 * cadence rather than however long the tab happened to stay open. Session
 * instrumentation only - never persisted to `GameState` or the save, and it
 * carries no gameplay effect of its own; the pause/resume toggle exists
 * purely so the maintainer can stop the clock while writing notes.
 *
 * `Date.now()` (rather than `performance.now()`) is deliberate: this is
 * game-package UI instrumentation, not sim - the no-`Date.now()` law
 * (CLAUDE.md engineering law 1) binds `packages/sim` only - and it keeps the
 * clock's ticking mockable through Vitest's default fake-timer `Date` fake,
 * the same one every other timed component in this package already relies
 * on.
 */
const game = useGameStore()

const running = ref(true)
/** Active milliseconds banked from every completed running segment - frozen
 * the instant a pause begins. */
const accumulatedMs = ref(0)
/** When the current running segment began, or `null` while paused. */
const segmentStartMs = ref<number | null>(Date.now())
/** Bumped once a second while running purely to give `activeMs` a reactive
 * dependency - `Date.now()` itself is not reactive. */
const tick = ref(0)
let intervalId: ReturnType<typeof setInterval> | null = null

/** Total active play time this session, in milliseconds - the accumulated
 * banked total plus whatever the current running segment has added so far. */
const activeMs = computed(() => {
  void tick.value
  if (running.value && segmentStartMs.value !== null) {
    return accumulatedMs.value + (Date.now() - segmentStartMs.value)
  }
  return accumulatedMs.value
})

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const clockText = computed(() => formatClock(activeMs.value))
const ariaLabel = computed(
  () => `Playtest clock: ${clockText.value}${running.value ? '' : ', paused'}`,
)

function startTicking(): void {
  if (intervalId !== null) return
  intervalId = setInterval(() => {
    tick.value += 1
  }, 1000)
}

function stopTicking(): void {
  if (intervalId === null) return
  clearInterval(intervalId)
  intervalId = null
}

onMounted(startTicking)
onUnmounted(stopTicking)

/**
 * Pauses or resumes the clock, banking the elapsed segment on pause and
 * opening a fresh one on resume - and logs the toggle either way so an
 * exported session carries the real gameplay cadence rather than raw
 * wall-clock time. `activeMs` in both logged payloads is the same banked
 * total at the moment of the toggle (a resume never advances it on its own),
 * so the pair reads as one instant rather than two different figures.
 */
function toggle(): void {
  if (running.value) {
    accumulatedMs.value = activeMs.value
    segmentStartMs.value = null
    running.value = false
    stopTicking()
    game.logSessionEvent({
      type: 'playClockPaused',
      payload: { activeMs: Math.round(accumulatedMs.value) },
    })
  } else {
    segmentStartMs.value = Date.now()
    running.value = true
    startTicking()
    game.logSessionEvent({
      type: 'playClockResumed',
      payload: { activeMs: Math.round(accumulatedMs.value) },
    })
  }
}
</script>

<template>
  <div class="playtest-clock" :class="{ paused: !running }" :aria-label="ariaLabel">
    <span class="clock-value" data-test="playtest-clock-value">{{ clockText }}</span>
    <span v-if="!running" class="paused-label" data-test="playtest-clock-paused-label">
      Paused
    </span>
    <button class="toggle-button" data-test="playtest-clock-toggle" @click="toggle">
      {{ running ? 'Pause' : 'Resume' }}
    </button>
  </div>
</template>

<style scoped>
.playtest-clock {
  position: fixed;
  top: var(--mg-space-4);
  left: var(--mg-space-4);
  /* Same layer as the top-right day/cash box and the bottom-right floating
     HUD - above screen content, below the tutorial overlay (z-index 120). */
  z-index: 110;
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  padding: var(--mg-space-2) var(--mg-space-3);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.playtest-clock.paused {
  color: var(--mg-text-dim);
}

.clock-value {
  font-variant-numeric: tabular-nums;
}

.paused-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--mg-neon-pink);
}

.toggle-button {
  background: transparent;
  color: inherit;
  border: 1px solid var(--mg-panel-edge);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

.toggle-button:hover {
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}
</style>
