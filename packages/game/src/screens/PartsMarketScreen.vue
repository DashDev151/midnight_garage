<script setup lang="ts">
import type { ComponentId, Grade, Part } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EndDayButton from '../components/EndDayButton.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const COMPONENT_OPTIONS: readonly ComponentId[] = [
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'wheels',
  'body',
  'interior',
]
const GRADE_OPTIONS: readonly Grade[] = ['stock', 'street', 'sport', 'race']
const SORT_OPTIONS = [
  { value: 'price-asc', label: 'price: low to high' },
  { value: 'price-desc', label: 'price: high to low' },
] as const

const componentFilter = ref<ComponentId | ''>('')
const gradeFilter = ref<Grade | ''>('')
const sortBy = ref<(typeof SORT_OPTIONS)[number]['value']>('price-asc')
const deliverySpeed = ref<'standard' | 'express'>('standard')

// The set of platform tags across owned cars, to hint part compatibility.
const ownedTags = computed(() => {
  const tags = new Set<string>()
  for (const d of game.carsDetailed) for (const t of d.model.tags) tags.add(t)
  return tags
})

function fitsAnyOwnedCar(part: Part): boolean {
  if (game.carsDetailed.length === 0) return false
  return part.requiredTags.every((t) => ownedTags.value.has(t))
}

function statSummary(part: Part): string {
  return (['power', 'handling', 'style', 'reliability', 'authenticity'] as const)
    .map((k) => ({ k, v: part.statModifiers[k] }))
    .filter((s) => s.v !== 0)
    .map((s) => `${s.k[0]!.toUpperCase()}${s.v > 0 ? '+' : ''}${s.v}`)
    .join(' ')
}

const visibleParts = computed(() => {
  let parts = game.partsCatalog.slice()
  if (componentFilter.value) parts = parts.filter((p) => p.componentId === componentFilter.value)
  if (gradeFilter.value) parts = parts.filter((p) => p.grade === gradeFilter.value)
  return parts.sort((a, b) =>
    sortBy.value === 'price-asc' ? a.priceYen - b.priceYen : b.priceYen - a.priceYen,
  )
})

const checkoutTotal = computed(() =>
  deliverySpeed.value === 'express' ? game.cartExpressTotalYen : game.cartStandardTotalYen,
)

const lastCheckoutResult = ref<{ boughtCount: number; remainingCount: number } | null>(null)

function onCheckout(): void {
  lastCheckoutResult.value = game.checkoutCart(deliverySpeed.value)
}
</script>

<template>
  <section class="parts">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>Parts market</h2>
      <p class="cash">{{ formatYen(game.cashYen) }}</p>
    </header>

    <div class="filters">
      <select v-model="componentFilter" data-test="filter-component">
        <option value="">all components</option>
        <option v-for="c in COMPONENT_OPTIONS" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="gradeFilter" data-test="filter-grade">
        <option value="">all grades</option>
        <option v-for="g in GRADE_OPTIONS" :key="g" :value="g">{{ g }}</option>
      </select>
      <select v-model="sortBy" data-test="sort-by">
        <option v-for="s in SORT_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>

    <ul class="catalog">
      <li v-for="part in visibleParts" :key="part.id" class="part">
        <div class="part-main">
          <span class="part-name">{{ part.brand }} {{ part.name }}</span>
          <span class="part-meta"
            >{{ part.componentId }} · {{ part.grade }} ·
            {{ statSummary(part) || 'no stat change' }}</span
          >
          <span v-if="part.requiredTags.length" class="part-tags">
            needs {{ part.requiredTags.join(', ') }}
            <span v-if="fitsAnyOwnedCar(part)" class="fit">fits a car you own</span>
          </span>
        </div>
        <div class="part-buy">
          <span class="price">{{ formatYen(part.priceYen) }}</span>
          <button :data-test="'add-to-cart-' + part.id" @click="game.addToCart(part.id)">
            Add to cart
          </button>
        </div>
      </li>
    </ul>

    <section v-if="game.pendingPartOrders.length" class="orders">
      <h3>On order</h3>
      <ul>
        <li v-for="order in game.pendingPartOrders" :key="order.id">
          {{ game.partName(order.partId) }} — arrives day {{ order.arrivesOnDay }}
        </li>
      </ul>
    </section>

    <section class="cart" data-test="cart-panel">
      <h3>Cart</h3>
      <p v-if="game.cartItems.length === 0" class="empty">Cart is empty.</p>
      <ul v-else class="cart-items">
        <li v-for="item in game.cartItems" :key="item.part.id" class="cart-item">
          <span class="cart-item-name">{{ item.part.brand }} {{ item.part.name }}</span>
          <span class="cart-item-qty">x{{ item.quantity }}</span>
          <span class="cart-item-subtotal">{{ formatYen(item.subtotalYen) }}</span>
          <button
            :data-test="'remove-from-cart-' + item.part.id"
            @click="game.removeFromCart(item.part.id)"
          >
            Remove
          </button>
        </li>
      </ul>

      <div v-if="game.cartItems.length > 0" class="checkout">
        <div class="delivery-choice">
          <label>
            <input
              v-model="deliverySpeed"
              type="radio"
              value="standard"
              data-test="delivery-standard"
            />
            Standard — {{ formatYen(game.cartStandardTotalYen) }} (arrives next day)
          </label>
          <label>
            <input
              v-model="deliverySpeed"
              type="radio"
              value="express"
              data-test="delivery-express"
            />
            Express — {{ formatYen(game.cartExpressTotalYen) }} (arrives today)
          </label>
        </div>
        <button
          class="primary"
          data-test="checkout"
          :disabled="game.cashYen < checkoutTotal"
          @click="onCheckout"
        >
          Checkout ({{ formatYen(checkoutTotal) }})
        </button>
        <p
          v-if="lastCheckoutResult && lastCheckoutResult.remainingCount > 0"
          class="checkout-warning"
        >
          Bought {{ lastCheckoutResult.boughtCount }} — couldn't afford the rest, still in cart.
        </p>
      </div>
    </section>

    <EndDayButton />
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

h2 {
  color: var(--mg-neon-cyan);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
}

.cash {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.filters {
  display: flex;
  gap: var(--mg-space-2);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
  flex-wrap: wrap;
}

.filters select {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.catalog {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-2);
}

.part {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.part-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.part-name {
  color: var(--mg-neon-cyan);
}

.part-meta,
.part-tags {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.fit {
  color: var(--mg-success);
  margin-left: var(--mg-space-2);
}

.part-buy {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.price {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.orders {
  margin-bottom: var(--mg-space-4);
}

.orders ul {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cart {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

.cart .empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cart-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.cart-item {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.cart-item-name {
  flex: 1;
}

.cart-item-qty,
.cart-item-subtotal {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cart-item-subtotal {
  color: var(--mg-yen);
}

.checkout {
  margin-top: var(--mg-space-3);
  padding-top: var(--mg-space-3);
  border-top: var(--mg-border);
}

.delivery-choice {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  margin-bottom: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.checkout-warning {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
  margin-top: var(--mg-space-2);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

button.primary {
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-pink);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}
</style>
