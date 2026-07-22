<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'

/**
 * A sale closes with a receipt.
 *
 * Everything shown here already existed and was simply never rendered: the
 * car ledger (purchase, repairs, parts) and `car-sold`'s own price and
 * realised `profitYen`.
 *
 * Deliberately the same shape and lifecycle as `JobCompleteModal` - a store
 * ref set on the action, cleared on dismiss, mounted once globally in App.vue,
 * and dismissible with Escape via App.vue's existing modal priority order.
 */
const game = useGameStore()

const result = computed(() => game.lastSaleResult)
</script>

<template>
  <div v-if="result" class="overlay" data-test="sale-complete-modal">
    <div class="modal">
      <h3>Sold</h3>
      <p class="flavor">{{ result.displayName }} is off the books.</p>

      <dl class="numbers">
        <div>
          <dt>Buyer paid</dt>
          <dd class="up" data-test="sale-price">{{ formatYen(result.priceYen) }}</dd>
        </div>
        <div v-if="result.purchaseYen > 0">
          <dt>You paid</dt>
          <dd>{{ formatYen(result.purchaseYen) }}</dd>
        </div>
        <div v-if="result.repairYen > 0">
          <dt>Repairs</dt>
          <dd>{{ formatYen(result.repairYen) }}</dd>
        </div>
        <div v-if="result.partsYen > 0">
          <dt>Parts</dt>
          <dd>{{ formatYen(result.partsYen) }}</dd>
        </div>
        <div v-if="result.totalSpentYen > 0">
          <dt>Total spent</dt>
          <dd>{{ formatYen(result.totalSpentYen) }}</dd>
        </div>
        <div>
          <dt>Profit</dt>
          <!-- Null when the purchase price was never known (a dev-granted
               car). A dash, never a fabricated number - the same honesty
               `car-sold`'s optional profitYen already encodes. -->
          <dd
            v-if="result.profitYen === null"
            class="unknown"
            data-test="sale-profit"
            title="This car's purchase price isn't on the books, so there's no profit to work out."
          >
            -
          </dd>
          <dd v-else :class="result.profitYen >= 0 ? 'up' : 'down'" data-test="sale-profit">
            {{ formatYenDelta(result.profitYen) }}
          </dd>
        </div>
      </dl>

      <button class="primary" data-test="sale-result-continue" @click="game.dismissSaleResult()">
        Continue
      </button>
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
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
}

.flavor {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.numbers {
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-1);
}

.numbers div {
  display: flex;
  justify-content: space-between;
  gap: var(--mg-space-3);
}

.numbers dt {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.numbers dd {
  margin: 0;
  color: var(--mg-text);
}

.up {
  color: var(--mg-success);
}

.down {
  color: var(--mg-danger);
}

.unknown {
  color: var(--mg-text-dim);
}

button.primary {
  width: 100%;
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  color: var(--mg-neon-violet);
  padding: var(--mg-space-2);
  cursor: pointer;
}

button.primary:hover {
  background: color-mix(in srgb, var(--mg-neon-violet) 15%, transparent);
}
</style>
