<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { pluralise } from '../utils/dayLogFormat'

/**
 * The shared "End Day" control. Five screen templates (Garage, CarDetail,
 * ServiceJobs, Auction, PartsMarket) used to call `game.endDay()` inline,
 * each its own copy of the same button; centralised here, not five.
 * `DevConsole.vue`'s direct call stays ungated (dev tool, not a player flow).
 */
const game = useGameStore()
const confirming = ref(false)

/**
 * Everything you're about to leave undone, as one stacked list rather than a
 * modal per condition.
 *
 * All three WARN, never block. A player is allowed to end the day with a full
 * cart and a finished job on the ramp; they just shouldn't do it by accident,
 * which is what happened when the day ended silently.
 */
const warnings = computed<string[]>(() => {
  const list: string[] = []

  const cartCount = game.gameState.cartPartIds.length
  if (cartCount > 0) {
    list.push(`${pluralise(cartCount, 'part')} in your cart hasn't been ordered.`)
  }

  for (const job of game.finishedJobsAwaitingHandback) {
    list.push(`The ${job.customerName} job is finished - hand the car back before you close up?`)
  }

  const unconfirmed = game.carsWithUnconfirmedWork.length
  if (unconfirmed > 0) {
    list.push(
      `You've planned work on ${pluralise(unconfirmed, 'car')} but haven't confirmed it - it won't start.`,
    )
  }

  return list
})

function onClick(): void {
  if (warnings.value.length > 0) {
    confirming.value = true
    return
  }
  game.endDay()
}

function confirmEndDay(): void {
  confirming.value = false
  game.endDay()
}

function cancel(): void {
  confirming.value = false
}

/**
 * This component has exactly one, app-wide mount point (`App.vue`) - its
 * cart-confirm modal is the one App.vue's global Escape handler needs to close
 * instead of navigating to the menu.
 */
defineExpose({ confirming, cancel })
</script>

<template>
  <button class="primary" data-test="end-day" @click="onClick">End Day</button>

  <!-- The same modal, now carrying every warning rather than only the
       cart's, and App.vue's Escape handler still closes it. -->
  <div v-if="confirming" class="overlay" data-test="end-day-cart-warning">
    <div class="modal">
      <h3>Before you close up</h3>
      <ul class="warnings" data-test="end-day-warnings">
        <li v-for="(warning, i) in warnings" :key="i">{{ warning }}</li>
      </ul>
      <div class="actions">
        <button data-test="end-day-cart-cancel" @click="cancel">Cancel</button>
        <button class="primary" data-test="end-day-cart-confirm" @click="confirmEndDay">
          End day anyway
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 17, 19, 0.8); /* --mg-night-deep at 0.8 */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210;
  padding: var(--mg-space-3);
}

.modal {
  background: var(--mg-panel);
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-4);
  width: 100%;
  max-width: 360px;
}

h3 {
  color: var(--mg-neon-violet);
  margin-top: 0;
}

.warnings {
  list-style: none;
  margin: 0 0 var(--mg-space-4);
  padding: 0;
  display: grid;
  gap: var(--mg-space-2);
  color: var(--mg-text-dim);
}

.warnings li::before {
  content: '! ';
  color: var(--mg-neon-violet);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--mg-space-2);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

.primary {
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-family: inherit;
  font-size: var(--mg-fs-md);
  /* The shadow IS the height the button falls through, so the two must
     always move together. */
  box-shadow: 0 2px 0 var(--mg-panel-edge);
}

.primary:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 var(--mg-panel-edge);
}
</style>
