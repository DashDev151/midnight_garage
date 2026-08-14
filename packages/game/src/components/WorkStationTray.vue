<script setup lang="ts">
import type { WorkStation } from '@midnight-garage/sim'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useDropZone } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { WORK_STATION_WHERE } from '../utils/workStationLabels'

/**
 * How a part gets to a work station and back off it: drag it here from the
 * parts inventory tab (or pick it there and click "Place here"), and the
 * carry-it-back control while the station holds something. What the room
 * then DOES to the part is the room's own business and never appears here,
 * so the workshop floor and the machine shop share one drop zone instead of
 * growing two. The inventory tab is the one list of owned parts in the
 * game - this tray never repeats it.
 *
 * Carrying is free and instant either way - the cost is the walk.
 */
const props = defineProps<{ station: WorkStation }>()

const game = useGameStore()

const where = computed(() => WORK_STATION_WHERE[props.station])

const held = computed(() => game.stationPart(props.station))

/** Accepts whatever the station's own gate already accepts (`partsForStation`
 * reads the sim's `placeOnStationGateReason`), so the drop zone and the gate
 * can never disagree. */
const dropZone = useDropZone<string>(
  (partInstanceId) =>
    game.partsForStation(props.station).some((entry) => entry.instance.id === partInstanceId),
  (partInstanceId) => game.placeOnStation(props.station, partInstanceId),
)
</script>

<template>
  <section
    class="tray"
    :class="{ 'active-target': dropZone.isActiveTarget.value }"
    :data-test="'station-tray-' + station"
    @pointerup="dropZone.onPointerUp"
    @pointerenter="dropZone.onPointerEnter"
    @pointerleave="dropZone.onPointerLeave"
  >
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
        Nothing {{ where }}. Drag a part here, or pick one from the
        <RouterLink :to="{ name: 'parts' }">parts inventory</RouterLink>.
      </p>
      <button
        v-if="dropZone.isActiveTarget.value"
        type="button"
        class="tray-btn place-here"
        :data-test="'station-place-' + station"
        @click="dropZone.onClick"
      >
        Place here
      </button>
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
  transition:
    border-color 0.12s ease,
    background-color 0.12s ease;
  touch-action: none;
}

/* Live-drag hover or a valid pick target - the same cyan-tint highlight
   ShopSlot uses for a car drop, so "this accepts what I'm carrying" reads
   the same vocabulary everywhere in the garage. */
.tray.active-target {
  border-color: var(--mg-neon-cyan);
  background: rgba(47, 214, 191, 0.12);
}

.empty {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.empty a {
  color: var(--mg-neon-violet);
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

.place-here {
  margin-top: var(--mg-space-2);
  border-color: var(--mg-neon-cyan);
}
</style>
