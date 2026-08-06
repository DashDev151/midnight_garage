<script setup lang="ts">
import type { WorkStation } from '@midnight-garage/sim'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { WORK_STATION_WHERE } from '../utils/workStationLabels'
import BandChip from './BandChip.vue'

/**
 * How a part gets to a work station and back off it: the warehouse picker
 * while the station is clear, the carry-it-back control while it holds
 * something. What the room then DOES to the part is the room's own business
 * and never appears here, so the workshop floor and the machine shop share one
 * fetch-and-return control instead of growing two.
 *
 * Carrying is free and instant either way - the cost is the walk.
 */
const props = defineProps<{ station: WorkStation }>()

const game = useGameStore()

const where = computed(() => WORK_STATION_WHERE[props.station])

const held = computed(() => game.stationPart(props.station))

/** Every warehouse part that can be carried over right now, read from the
 * store's own gate rather than a second eligibility rule here. */
const candidates = computed(() => game.partsForStation(props.station))
</script>

<template>
  <section class="tray" :data-test="'station-tray-' + station">
    <template v-if="held">
      <button
        type="button"
        class="tray-btn"
        :data-test="'station-take-' + station"
        @click="game.takeFromStation(station)"
      >
        Back to the warehouse
      </button>
    </template>

    <template v-else>
      <p class="empty" :data-test="'station-empty-' + station">
        Nothing {{ where }}. Anything in the warehouse can be carried over.
      </p>
      <ul v-if="candidates.length > 0" class="candidates">
        <li
          v-for="entry in candidates"
          :key="entry.instance.id"
          class="candidate"
          :data-test="'station-candidate-' + station + '-' + entry.instance.id"
        >
          <span class="candidate-name">
            {{ game.carPartLabel(entry.part.carPartId) }}: {{ entry.part.brand }}
            {{ entry.part.name }}
            <BandChip :band="entry.instance.band" />
          </span>
          <button
            type="button"
            class="tray-btn"
            :data-test="'station-place-' + station + '-' + entry.instance.id"
            @click="game.placeOnStation(station, entry.instance.id)"
          >
            Put it {{ where }}
          </button>
        </li>
      </ul>
      <p v-else class="empty" :data-test="'station-warehouse-empty-' + station">
        Nothing in the warehouse to carry over - the
        <RouterLink :to="{ name: 'parts' }">parts market</RouterLink> sells them.
      </p>
    </template>
  </section>
</template>

<style scoped>
.tray {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.empty {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.candidates {
  list-style: none;
  margin: var(--mg-space-2) 0 0;
  padding: 0;
  display: grid;
  gap: var(--mg-space-1);
}

.candidate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-2);
  border-top: var(--mg-border);
  padding-top: var(--mg-space-1);
}

.candidate-name {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
}

.tray-btn {
  flex: none;
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  color: var(--mg-neon-cyan);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
  cursor: pointer;
}
</style>
