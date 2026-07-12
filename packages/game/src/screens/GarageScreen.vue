<script setup lang="ts">
import { computed } from 'vue'
import EndDayButton from '../components/EndDayButton.vue'
import HelpHint from '../components/HelpHint.vue'
import ShopSlot from '../components/ShopSlot.vue'
import { useDragSession } from '../composables/useDragAndDrop'
import { useGameStore, type ShopCarView } from '../stores/gameStore'
import { describeLogEntry } from '../utils/dayLogFormat'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const recentLog = computed(() =>
  game.dayLog
    .slice(-40)
    .reverse()
    .map((entry, i) => ({
      id: game.dayLog.length - i,
      text: describeLogEntry(entry, game.resolveModelName, game.buyerName),
    })),
)

const occupiedServiceCars = computed(() =>
  game.serviceBaysView.filter((s): s is ShopCarView => s !== null),
)
const occupiedParkingCars = computed(() =>
  game.parkingView.filter((s): s is ShopCarView => s !== null),
)
const parkingCarIds = computed(() => new Set(occupiedParkingCars.value.map((c) => c.carId)))
const serviceCarIds = computed(() => new Set(occupiedServiceCars.value.map((c) => c.carId)))

/**
 * Every shop slot accepts any car currently in the shop - a car is always
 * exactly one of "in parking" or "in service", so this is really "any real
 * car", not a filter. Dropping a car back into its own section (occupied or
 * empty) is a real, accepted gesture, not a rejection - `moveCarToSlot`
 * (Sprint 17 positional fix) resolves same-section drops as a real
 * reposition/swap rather than a no-op, so the target highlighting and the
 * completed gesture both reflect something that actually happened.
 * Rejecting it outright (the original design) made every same-section drag
 * look broken: the drop target never highlighted and the gesture visibly
 * "failed" instead of completing cleanly (found via real dragging, not
 * something a unit test would have caught - same-section drags were never
 * exercised on purpose).
 */
function acceptsIntoService(carId: string): boolean {
  return parkingCarIds.value.has(carId) || serviceCarIds.value.has(carId)
}
function acceptsIntoParking(carId: string): boolean {
  return serviceCarIds.value.has(carId) || parkingCarIds.value.has(carId)
}

/** Drop a car onto service-bay slot `index` - moves it there if empty, swaps positions with
 * whoever's there if occupied, same section or across (Sprint 17 positional fix: `moveCarToSlot`
 * targets the exact slot dropped on, so there's one call for every case, including same-section
 * reposition/swap, which used to need its own no-op guard here). */
function onDropOnBaySlot(index: number, carId: string): void {
  game.moveCarToSlot(carId, 'service', index)
}
function onDropOnParkingSlot(index: number, carId: string): void {
  game.moveCarToSlot(carId, 'parking', index)
}

// Sprint 17: the ghost preview that follows the pointer during a live drag -
// generic session data (payload is just a car id) resolved back to a
// display name using the same data the slots already render from.
const dragSession = useDragSession()
const allShopCars = computed<ShopCarView[]>(() => [
  ...occupiedServiceCars.value,
  ...occupiedParkingCars.value,
])
const draggedCarName = computed(() => {
  const payload = dragSession.value?.payload
  if (typeof payload !== 'string' || !payload) return null
  return allShopCars.value.find((c) => c.carId === payload)?.displayName ?? null
})
</script>

<template>
  <section class="garage">
    <h2>
      Garage
      <HelpHint label="Moving cars">
        Drag a car onto another slot to move or swap it - or tap "move…" then "Place here" if
        dragging isn't an option.
      </HelpHint>
    </h2>

    <dl class="stats">
      <div>
        <dt>Day</dt>
        <dd data-test="day-value">{{ game.day }}</dd>
      </div>
      <div>
        <dt>Cash</dt>
        <dd class="cash">{{ formatYen(game.cashYen) }}</dd>
      </div>
      <div>
        <dt>Reputation</dt>
        <dd data-test="reputation-value">
          {{ game.reputationTier
          }}<span v-if="game.shopTitleName" data-test="shop-title">
            , known as "{{ game.shopTitleName }}"</span
          >
        </dd>
      </div>
      <div>
        <dt>Cars owned</dt>
        <dd>{{ game.ownedCarCount }}</dd>
      </div>
    </dl>

    <div class="controls">
      <EndDayButton />
      <button data-test="new-game" @click="game.newGame()">New Game</button>
    </div>

    <section class="bays">
      <h3>
        Service bays ({{ game.serviceBayFreeCount }}/{{ game.serviceBayCount }} free)
        <HelpHint label="Service bays">
          Labor only reaches a car sitting in a service bay. Moves are free and instant.
        </HelpHint>
      </h3>
      <ul class="bay-slots">
        <ShopSlot
          v-for="(slot, i) in game.serviceBaysView"
          :key="slot?.carId ?? 'empty-' + i"
          :car="slot"
          :accepts="acceptsIntoService"
          move-label="&rarr; parking"
          :move-disabled="game.parkingFull"
          test-id-prefix="move-parking-"
          :empty-slot-id="'empty-' + i"
          @move="game.moveCar($event, 'parking')"
          @drop="onDropOnBaySlot(i, $event)"
        />
      </ul>
    </section>

    <section class="parking">
      <h3>Parking ({{ game.parkingOccupancyCount }}/{{ game.parkingCapacity }})</h3>
      <ul class="parking-list">
        <ShopSlot
          v-for="(slot, i) in game.parkingView"
          :key="slot?.carId ?? 'empty-parking-' + i"
          :car="slot"
          :accepts="acceptsIntoParking"
          move-label="&rarr; service bay"
          :move-disabled="game.serviceBayFreeCount <= 0"
          test-id-prefix="move-service-"
          :empty-slot-id="'empty-parking-' + i"
          @move="game.moveCar($event, 'service')"
          @drop="onDropOnParkingSlot(i, $event)"
        />
      </ul>
    </section>

    <section v-if="game.pendingOffersView.length" class="offers">
      <h3>Offers ({{ game.pendingOffersView.length }})</h3>
      <ul>
        <li v-for="offer in game.pendingOffersView" :key="offer.carInstanceId">
          <span>{{ offer.copy }}</span>
          <button data-test="accept-offer-garage" @click="game.acceptOffer(offer.carInstanceId)">
            Accept
          </button>
        </li>
      </ul>
    </section>

    <section class="log">
      <h3>Event log</h3>
      <p v-if="recentLog.length === 0" class="empty">
        No events yet. End a day to advance the sim.
      </p>
      <ul v-else>
        <li v-for="line in recentLog" :key="line.id">{{ line.text }}</li>
      </ul>
    </section>

    <div
      v-if="dragSession?.mode === 'drag' && draggedCarName"
      class="drag-ghost"
      :style="{ left: dragSession.x + 'px', top: dragSession.y + 'px' }"
    >
      {{ draggedCarName }}
    </div>
  </section>
</template>

<style scoped>
h2,
h3 {
  display: flex;
  align-items: center;
}

h2 {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
  margin: 0 0 var(--mg-space-2);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--mg-space-3);
  margin: var(--mg-space-4) 0;
}

.stats div {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.stats dt {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.stats dd {
  margin: var(--mg-space-1) 0 0;
  font-size: var(--mg-fs-lg);
}

.cash {
  color: var(--mg-yen);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}

button.primary {
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-pink);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

.empty {
  color: var(--mg-text-dim);
}

.bay-slots,
.parking-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--mg-space-3);
}

.offers ul {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
}

.offers li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) 0;
}

.log ul {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 320px;
  overflow-y: auto;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
}

.log li {
  padding: var(--mg-space-2) var(--mg-space-3);
  border-bottom: var(--mg-border);
  font-size: var(--mg-fs-sm);
}

.log li:last-child {
  border-bottom: none;
}

.drag-ghost {
  position: fixed;
  pointer-events: none;
  /* Offset up-and-right of the actual pointer position so the card itself
     never sits directly under the cursor, hiding what's beneath it. */
  transform: translate(12px, -50%) rotate(-2deg);
  z-index: 1000;
  background: var(--mg-neon-cyan);
  color: var(--mg-night-deep);
  border: 2px solid var(--mg-night-deep);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-size: var(--mg-fs-md);
  font-weight: bold;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
}
</style>
