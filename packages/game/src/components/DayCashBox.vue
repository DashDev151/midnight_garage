<script setup lang="ts">
import { computed } from 'vue'
import { dayOfSeason, eraOf, seasonOf } from '@midnight-garage/sim'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { eraLabel, seasonDayLabel, seasonLabel } from '../utils/calendarLabels'

/**
 * The app-wide floating stamp/cash readout: the calendar stamp (day within
 * season, season, era - never a year) over the player's cash, fixed to the
 * top-right corner of the viewport. Mounted once at the app root
 * (`App.vue`), the same pattern `FloatingHud.vue` uses for its bottom-right
 * cluster - identical spot on every gameplay screen, a real overlay above
 * the game rather than a per-screen widget.
 *
 * The day element carries the tutorial's final-step spotlight anchor
 * (`data-test="day-value"`) - it exists nowhere else, and this box's
 * every-screen mount means the walkthrough always finds it.
 */
const game = useGameStore()

const seasonDay = computed(() => seasonDayLabel(dayOfSeason(game.day, game.context.economy)))
const season = computed(() => seasonLabel(seasonOf(game.day, game.context.economy)))
const era = computed(() => eraLabel(eraOf(game.day, game.context.economy)))

const ariaLabel = computed(
  () => `Day ${seasonDay.value}, ${season.value}, ${era.value}; cash ${formatYen(game.cashYen)}`,
)
</script>

<template>
  <div class="day-cash-box" :aria-label="ariaLabel">
    <span class="day" data-test="day-value">Day {{ seasonDay }} - {{ season }}</span>
    <span class="era" data-test="era-value">{{ era }}</span>
    <span class="cash">{{ formatYen(game.cashYen) }}</span>
  </div>
</template>

<style scoped>
.day-cash-box {
  position: fixed;
  top: var(--mg-space-4);
  right: var(--mg-space-4);
  /* Above screen content, below the tutorial overlay (z-index 120) - same
     layer as the bottom-right floating HUD cluster. */
  z-index: 110;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: var(--mg-space-2) var(--mg-space-3);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  color: var(--mg-text);
}

.day {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.cash {
  color: var(--mg-yen);
  font-size: var(--mg-fs-md);
}
</style>
