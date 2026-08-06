<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PartCard from './PartCard.vue'
import { useGameStore } from '../stores/gameStore'

/**
 * The warehouse list: every owned part not currently planned onto a car,
 * draggable onto a car's component drop zones. Storage lists, holds and hands
 * over; no work is started from here, so a part out on the workshop floor's
 * bench or on the machine is still listed and simply says where it is
 * (`PartCard.vue`).
 *
 * Picking a part here (the click-fallback "move…" toggle) persists across
 * navigation via the shared drag session, so starting a pick on the inventory
 * screen and placing it on a car page away works for free.
 */
const game = useGameStore()
</script>

<template>
  <div class="inventory-panel">
    <p v-if="game.stageableParts.length === 0" class="empty">
      No unplanned parts on hand - visit the
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
