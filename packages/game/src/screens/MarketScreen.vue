<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import type { MarketMoverInvolvement } from '../utils/marketMovers'

/**
 * The stand's weekly sheet (sprint205.md): what moved since the most recent
 * heat update, backward-looking only. It never prints the underlying heat
 * figure and never a forecast or a trend label - "up 4 this week" is a fact
 * a trade paper prints; telling the player a model is "cold" or "warming"
 * would be the game coaching them toward a deterministic cycle instead of
 * reporting on one. Reached only from the stand on the overworld
 * (`overworldNav.ts`); there is no tab-bar entry and no other route in.
 */

const game = useGameStore()

const movers = computed(() => game.marketMovers)

const INVOLVEMENT_LABEL: Record<Exclude<MarketMoverInvolvement, null>, string> = {
  owned: 'yours',
  sold: "you've been selling these",
}
</script>

<template>
  <section class="market">
    <RouterLink :to="{ name: 'overworld' }" class="back" data-test="market-back">
      &lt; Back to the street
    </RouterLink>
    <h2 data-test="market-masthead">The trade sheet</h2>
    <p class="dek">What moved this week.</p>

    <div class="columns">
      <div class="column">
        <h3 class="column-heading up">Risers</h3>
        <ul v-if="movers.risers.length" class="movers" data-test="market-risers">
          <li v-for="mover in movers.risers" :key="mover.modelId" class="mover-row">
            <span class="mover-label">{{ mover.label }}</span>
            <span class="mover-delta up">Up {{ mover.deltaPercent }} this week</span>
            <span v-if="mover.involvement" class="mover-tag" data-test="market-mover-tag">
              {{ INVOLVEMENT_LABEL[mover.involvement] }}
            </span>
          </li>
        </ul>
        <p v-else class="empty" data-test="market-risers-empty">Nothing rising worth a line.</p>
      </div>

      <div class="column">
        <h3 class="column-heading down">Fallers</h3>
        <ul v-if="movers.fallers.length" class="movers" data-test="market-fallers">
          <li v-for="mover in movers.fallers" :key="mover.modelId" class="mover-row">
            <span class="mover-label">{{ mover.label }}</span>
            <span class="mover-delta down">Down {{ Math.abs(mover.deltaPercent) }} this week</span>
            <span v-if="mover.involvement" class="mover-tag" data-test="market-mover-tag">
              {{ INVOLVEMENT_LABEL[mover.involvement] }}
            </span>
          </li>
        </ul>
        <p v-else class="empty" data-test="market-fallers-empty">Nothing falling worth a line.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.market {
  max-width: 640px;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 0;
}

.dek {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-3);
}

.columns {
  display: flex;
  gap: var(--mg-space-4);
  flex-wrap: wrap;
}

.column {
  flex: 1 1 240px;
  min-width: 220px;
}

.column-heading {
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.column-heading.up {
  color: var(--mg-success);
}

.column-heading.down {
  color: var(--mg-danger);
}

.movers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.mover-row {
  display: flex;
  flex-direction: column;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
}

.mover-label {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.mover-delta {
  font-size: var(--mg-fs-sm);
}

.mover-delta.up {
  color: var(--mg-success);
}

.mover-delta.down {
  color: var(--mg-danger);
}

.mover-tag {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
