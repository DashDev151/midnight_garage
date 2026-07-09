<script setup lang="ts">
import type { Part } from '@midnight-garage/content'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

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
</script>

<template>
  <section class="parts">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>Parts market</h2>
      <p class="cash">{{ formatYen(game.cashYen) }}</p>
    </header>

    <ul class="catalog">
      <li v-for="part in game.partsCatalog" :key="part.id" class="part">
        <div class="part-main">
          <span class="part-name">{{ part.brand }} {{ part.name }}</span>
          <span class="part-meta"
            >{{ part.slot }} · {{ part.grade }} · {{ statSummary(part) || 'no stat change' }}</span
          >
          <span v-if="part.requiredTags.length" class="part-tags">
            needs {{ part.requiredTags.join(', ') }}
            <span v-if="fitsAnyOwnedCar(part)" class="fit">fits a car you own</span>
          </span>
        </div>
        <div class="part-buy">
          <span class="price">{{ formatYen(part.priceYen) }}</span>
          <button
            :disabled="game.cashYen < part.priceYen"
            :data-test="'buy-' + part.id"
            @click="game.buyPart(part.id)"
          >
            Buy
          </button>
        </div>
      </li>
    </ul>

    <button class="primary" data-test="end-day" @click="game.endDay()">End Day</button>
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

.cash {
  color: var(--mg-yen);
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
