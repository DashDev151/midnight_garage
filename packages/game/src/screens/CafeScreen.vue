<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { OVERWORLD_LOCATION_LABELS } from '../pixi/overworld/buildings'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

/**
 * The cafe's interior (sprint209.md task C): a walk-in, walk-out room across
 * the street from the garage. The buy round is the same resolver
 * (`game.buyCoffee`) the map used to fire instantly - only the presentation
 * changed, from an on-the-spot action to a real room with a door. The menu
 * is a list holding one item today so a second (sprint210.md's "usual
 * order" upgrade) can land without reshaping the screen.
 */

const game = useGameStore()

/** What the cafe says about today's coffee round, moved here byte-verbatim
 * from `OverworldScreen.vue`'s own `coffeeNote` (task C2) except for the
 * available case: standing in the room rather than about to leave it, there
 * is no "back to it" to sign off with. */
function coffeeStateLine(): string {
  const priceYen = game.coffeePriceYen
  switch (game.coffeeGateReason) {
    case 'day-limit':
      return 'You have had your round today. Any more and nobody does any work.'
    case 'pool-full':
      return 'Nothing to buy back yet. Come and see us when the day has worn you down a bit.'
    case 'no-cash':
      return `A round is ${priceYen.toLocaleString()} yen and the till says otherwise.`
    default:
      return `Coffee all round, ${priceYen.toLocaleString()} yen.`
  }
}

interface CafeMenuItem {
  id: string
  name: string
  priceYen: number
  stateLine: string
  disabled: boolean
  onOrder: () => void
}

/** Today's whole menu - one item. A list rather than a single button, so a
 * second item lands as another entry rather than a rebuild. */
const menuItems = computed<CafeMenuItem[]>(() => [
  {
    id: 'coffee',
    name: 'Coffee',
    priceYen: game.coffeePriceYen,
    stateLine: coffeeStateLine(),
    disabled: game.coffeeGateReason !== null,
    onOrder: () => game.buyCoffee(),
  },
])
</script>

<template>
  <section class="cafe" data-test="cafe-screen">
    <RouterLink :to="{ name: 'overworld' }" class="back" data-test="cafe-back"
      >&lt; Back</RouterLink
    >
    <h2>{{ OVERWORLD_LOCATION_LABELS.cafe }}</h2>

    <ul class="menu" data-test="cafe-menu">
      <li
        v-for="item in menuItems"
        :key="item.id"
        class="menu-item"
        :data-test="'menu-item-' + item.id"
      >
        <div class="menu-row">
          <span class="menu-name">{{ item.name }}</span>
          <span class="menu-price">{{ formatYen(item.priceYen) }}</span>
        </div>
        <p class="menu-state" :data-test="'menu-state-' + item.id">{{ item.stateLine }}</p>
        <button
          type="button"
          class="order"
          :disabled="item.disabled"
          :data-test="'order-' + item.id"
          @click="item.onOrder"
        >
          Order round
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

.menu {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-3);
  max-width: 420px;
}

.menu-item {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.menu-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.menu-name {
  color: var(--mg-text);
}

.menu-price {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.menu-state {
  margin: var(--mg-space-2) 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.order {
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border: 1px solid var(--mg-neon-violet);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.order:disabled {
  background: transparent;
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  opacity: 0.6;
  cursor: default;
}
</style>
