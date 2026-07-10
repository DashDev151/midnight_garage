<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PartCard from './PartCard.vue'
import { useGameStore } from '../stores/gameStore'

/**
 * The owned-parts pick list (Sprint 18) — every part not currently staged
 * anywhere (decision 3), draggable onto a car's component drop zones.
 * Shared, unmodified, between the standalone inventory screen and the panel
 * embedded on `CarDetailScreen.vue`: picking a part here (the click-fallback
 * "move…" toggle) persists across navigation via the shared drag session, so
 * starting a pick on the standalone screen and placing it on a car page away
 * works for free — no extra wiring needed for that to work.
 */
const game = useGameStore()
</script>

<template>
  <div class="inventory-panel">
    <p v-if="game.stageableParts.length === 0" class="empty">
      No unstaged parts on hand — visit the
      <RouterLink :to="{ name: 'parts' }">parts market</RouterLink>.
    </p>
    <ul v-else class="parts-list">
      <PartCard
        v-for="entry in game.stageableParts"
        :key="entry.instance.id"
        :instance="entry.instance"
        :part="entry.part"
      />
    </ul>
  </div>
</template>

<style scoped>
.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.parts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}
</style>
