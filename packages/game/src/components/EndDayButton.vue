<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

/**
 * The shared "End Day" control (Sprint 24 fix 4) — five screen templates
 * (Garage, CarDetail, ServiceJobs, Auction, PartsMarket) used to call
 * `game.endDay()` inline, each its own copy of the same button; the cart
 * warning (playtest 2026-07-10 #1) needed one place to land, not five.
 * `DevConsole.vue`'s direct call stays ungated (dev tool, not a player flow).
 */
withDefaults(defineProps<{ showCash?: boolean }>(), { showCash: false })

const game = useGameStore()
const confirming = ref(false)

function onClick(): void {
  if (game.gameState.cartPartIds.length > 0) {
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
</script>

<template>
  <button class="primary" data-test="end-day" @click="onClick">
    End Day<template v-if="showCash"> ({{ formatYen(game.cashYen) }})</template>
  </button>

  <div v-if="confirming" class="overlay" data-test="end-day-cart-warning">
    <div class="modal">
      <h3>Items still in your cart</h3>
      <p class="flavor">
        {{ game.gameState.cartPartIds.length }} part(s) in the cart haven't been ordered — end the
        day anyway?
      </p>
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
  background: rgba(11, 8, 32, 0.8);
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
  color: var(--mg-neon-cyan);
  margin-top: 0;
}

.flavor {
  color: var(--mg-text-dim);
  margin: 0 0 var(--mg-space-4);
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
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border: 1px solid var(--mg-neon-pink);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-family: inherit;
  font-size: var(--mg-fs-md);
}
</style>
