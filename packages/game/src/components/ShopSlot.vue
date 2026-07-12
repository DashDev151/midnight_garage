<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { ShopCarView } from '../stores/gameStore'
import { useDraggable, useDropZone } from '../composables/useDragAndDrop'

/**
 * One shop slot - a service bay or a parking row - draggable if occupied,
 * and always its own drop zone (Sprint 17). Purely presentational: the
 * parent decides what "accepts" means and what a drop actually does (move
 * vs. swap), since that depends on which list this slot belongs to and the
 * full game state this component deliberately doesn't know about.
 */
const props = defineProps<{
  car: ShopCarView | null
  accepts: (carInstanceId: string) => boolean
  moveLabel: string
  moveDisabled: boolean
  testIdPrefix: string
  /** A stable id for this slot when `car` is null, e.g. `empty-parking-2` - several empty
   * slots can render at once (Sprint 17 playtest fix), so a single hardcoded "empty" would
   * collide across all of them in the "Place here" button's `data-test`. */
  emptySlotId: string
}>()

const emit = defineEmits<{
  move: [carId: string]
  drop: [carId: string]
}>()

const draggable = useDraggable(() => props.car?.carId ?? '')
const dropZone = useDropZone<string>(
  (carId) => props.accepts(carId),
  (carId) => emit('drop', carId),
)

/**
 * Sprint 25 task 2: a customer's car still in transit occupies its slot
 * (the parking spot was claimed at accept time) but hasn't actually arrived
 * - there's nothing there yet to pick up or move, so the drag/pick gesture
 * is a no-op while `arrivingTomorrow` is true, same as the grab-handle
 * button being hidden entirely below.
 */
function onCardPointerDown(event: PointerEvent): void {
  if (props.car?.arrivingTomorrow) return
  draggable.onPointerDown(event)
}
function onCardPointerMove(event: PointerEvent): void {
  if (props.car?.arrivingTomorrow) return
  draggable.onPointerMove(event)
}
function onCardPointerUp(event: PointerEvent): void {
  if (props.car?.arrivingTomorrow) return
  draggable.onPointerUp(event)
}
</script>

<template>
  <li
    class="shop-slot"
    :class="{ 'active-target': dropZone.isActiveTarget.value }"
    @pointerup="dropZone.onPointerUp"
    @pointerenter="dropZone.onPointerEnter"
    @pointerleave="dropZone.onPointerLeave"
  >
    <template v-if="car">
      <div
        class="car-card"
        :class="{
          dragging: draggable.isDragging.value,
          picked: draggable.isPicked.value,
          'in-transit': car.arrivingTomorrow,
        }"
        @pointerdown="onCardPointerDown"
        @pointermove="onCardPointerMove"
        @pointerup="onCardPointerUp"
      >
        <RouterLink
          :to="{ name: 'car', params: { id: car.carId } }"
          class="slot-car"
          draggable="false"
        >
          {{ car.displayName }}
          <span v-if="car.arrivingTomorrow" class="badge arriving">arriving tomorrow</span>
          <span v-else-if="car.isCustomerCar" class="badge">customer job</span>
        </RouterLink>
        <button
          v-if="!car.arrivingTomorrow"
          type="button"
          class="grab-handle"
          :aria-pressed="draggable.isPicked.value"
          :data-test="testIdPrefix + 'pick-' + car.carId"
          @click.stop="draggable.togglePick"
        >
          {{ draggable.isPicked.value ? 'cancel' : 'move…' }}
        </button>
      </div>
      <button
        type="button"
        :disabled="moveDisabled || car.arrivingTomorrow"
        :data-test="testIdPrefix + car.carId"
        @click="emit('move', car.carId)"
      >
        {{ moveLabel }}
      </button>
    </template>
    <div v-else class="slot-empty" :class="{ 'active-target': dropZone.isActiveTarget.value }">
      {{ dropZone.isActiveTarget.value ? 'drop here' : 'empty bay' }}
    </div>
    <!-- Accessibility fallback (decision 2): a distinct button, never the
         RouterLink/car area, so placing a picked car never fights with
         navigating to a car whose slot happens to be the drop target. -->
    <button
      v-if="dropZone.isActiveTarget.value"
      type="button"
      class="place-here"
      :data-test="testIdPrefix + 'place-' + (car?.carId ?? emptySlotId)"
      @click="dropZone.onClick"
    >
      Place here
    </button>
  </li>
</template>

<style scoped>
.shop-slot {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
  /* Every slot - occupied or empty - gets the same minimum footprint, so an
     empty slot is exactly as easy to aim a drop at as an occupied one; a
     bare "empty bay" label with no min-height left almost nothing to hit. */
  min-height: 84px;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  transition:
    border-color 0.12s ease,
    background-color 0.12s ease;
  touch-action: none;
}

.shop-slot.active-target {
  border-color: var(--mg-neon-cyan);
  background: rgba(47, 214, 191, 0.12); /* --mg-neon-cyan (teal) at low opacity, over --mg-panel */
}

.slot-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-align: center;
  border: 1px dashed var(--mg-panel-edge);
  border-radius: var(--mg-radius);
}

.slot-empty.active-target {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  border-style: solid;
}

.car-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-2);
  touch-action: none;
  cursor: grab;
}

.car-card.dragging {
  opacity: 0.35;
  outline: 1px dashed var(--mg-neon-cyan);
  outline-offset: 4px;
  cursor: grabbing;
}

.car-card.picked {
  outline: 2px dashed var(--mg-neon-violet);
  outline-offset: 4px;
}

/* Sprint 25 task 2: nothing to pick up yet - dimmed, no grab cursor. */
.car-card.in-transit {
  opacity: 0.5;
  cursor: default;
}

.slot-car {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  color: var(--mg-neon-cyan);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
  /* Belt-and-suspenders alongside the `draggable="false"` attribute - some
     WebKit browsers still need this to fully suppress native link dragging. */
  -webkit-user-drag: none;
  user-select: none;
}

.badge {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge.arriving {
  color: var(--mg-text-dim);
}

.grab-handle {
  flex: none;
  padding: 2px 8px;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.place-here {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}

.shop-slot button {
  align-self: flex-start;
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
