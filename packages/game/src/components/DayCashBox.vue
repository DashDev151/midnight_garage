<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

/**
 * The app-wide floating day/cash readout: the day number over the player's
 * cash, fixed to the top-right corner of the viewport. Mounted once at the
 * app root (`App.vue`), the same pattern `FloatingHud.vue` uses for its
 * bottom-right cluster - identical spot on every gameplay screen, a real
 * overlay above the game rather than a per-screen widget.
 *
 * The day element carries the tutorial's final-step spotlight anchor
 * (`data-test="day-value"`) - it exists nowhere else, and this box's
 * every-screen mount means the walkthrough always finds it.
 */
const game = useGameStore()

const ariaLabel = computed(() => `Day ${game.day}; cash ${formatYen(game.cashYen)}`)
</script>

<template>
  <div class="day-cash-box" :aria-label="ariaLabel">
    <span class="day" data-test="day-value">Day {{ game.day }}</span>
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
