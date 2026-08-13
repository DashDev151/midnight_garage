<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import MachineShopPanel from '../components/MachineShopPanel.vue'
import ShopSlot from '../components/ShopSlot.vue'
import WorkbenchPanel from '../components/WorkbenchPanel.vue'
import { useDragSession } from '../composables/useDragAndDrop'
import { useGameStore, type ShopCarView } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { bodyPaintShopOpen } from './garageCapability'
import { machineShopHasMachinery } from './machineShopEquipment'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

/**
 * The work stations live on this screen: the garage is one building, and the
 * bench, the machine and the spray booth are things standing in it, not rooms
 * behind a second screen. Clicking a station opens its panel in place; the
 * workbench and machine panels are the full station views
 * (`WorkbenchPanel.vue` / `MachineShopPanel.vue`), and body and paint is a
 * door to the car in the bay, since that work is done on the whole car.
 */
type StationId = 'workbench' | 'machine' | 'body-paint'

/** The station another screen asked to land on (`open=workbench|machine`), so
 * a door elsewhere in the app can open the right panel here directly. */
function stationFromQuery(): StationId | null {
  const open = route.query.open
  return open === 'workbench' || open === 'machine' ? open : null
}

const openStation = ref<StationId | null>(stationFromQuery())

watch(
  () => route.query.open,
  () => {
    const wanted = stationFromQuery()
    if (wanted) openStation.value = wanted
  },
)

function toggleStation(station: StationId): void {
  openStation.value = openStation.value === station ? null : station
}

/** Whether any machining bench actually stands in the machine shop - absent
 * machinery reads as derelict, never as a shut door. */
const machineShopEquipped = computed(() => machineShopHasMachinery(game.gameState, game.context))
const bodyPaintIsOpen = computed(() => bodyPaintShopOpen(game.gameState, game.context))

const benchHeld = computed(() => game.stationPart('workbench'))
const machineHeld = computed(() => game.stationPart('machine'))

const workbenchStatus = computed(() =>
  benchHeld.value
    ? `${game.carPartLabel(benchHeld.value.part.carPartId)}, ${benchHeld.value.instance.band}`
    : 'empty',
)

const machineStatus = computed(() => {
  if (!machineShopEquipped.value) return 'derelict'
  const held = machineHeld.value
  return held ? `${game.carPartLabel(held.part.carPartId)}, ${held.instance.band}` : 'empty'
})

const bodyPaintStatus = computed(() => (bodyPaintIsOpen.value ? 'open' : 'derelict'))

/** The one car the body and paint entry can point at without an id of its own
 * to route with: exactly one car in a service bay. */
const soloServiceBayCarId = computed<string | null>(() => {
  const ids = game.gameState.serviceBayCarIds.filter((id): id is string => id !== null)
  return ids.length === 1 ? ids[0]! : null
})

function goToBodyPaintCar(): void {
  const id = soloServiceBayCarId.value
  if (id) void router.push({ name: 'car', params: { id } })
}

const occupiedServiceCars = computed(() =>
  game.serviceBaysView.filter((s): s is ShopCarView => s !== null),
)
const occupiedParkingCars = computed(() =>
  game.parkingView.filter((s): s is ShopCarView => s !== null),
)
const parkingCarIds = computed(() => new Set(occupiedParkingCars.value.map((c) => c.carId)))
const serviceCarIds = computed(() => new Set(occupiedServiceCars.value.map((c) => c.carId)))

/** Every shop slot accepts any car currently in the shop - a car is always
 * exactly one of "in parking" or "in service", so this is really "any real car",
 * not a filter. Dropping a car back into its own section (occupied or empty) is a
 * real, accepted gesture, not a rejection - same-section drops resolve as a real
 * reposition/swap rather than a no-op, so the target highlighting and the
 * completed gesture both reflect something that actually happened.
 */
function acceptsIntoService(carId: string): boolean {
  return parkingCarIds.value.has(carId) || serviceCarIds.value.has(carId)
}
function acceptsIntoParking(carId: string): boolean {
  return serviceCarIds.value.has(carId) || parkingCarIds.value.has(carId)
}

/** Drop a car onto service-bay slot `index` - moves it there if empty, swaps
 * positions with whoever's there if occupied, same section or across. The `moveCarToSlot`
 * call targets the exact slot dropped on, so there's one call for every case,
 * including same-section reposition/swap. */
function onDropOnBaySlot(index: number, carId: string): void {
  game.moveCarToSlot(carId, 'service', index)
}
function onDropOnParkingSlot(index: number, carId: string): void {
  game.moveCarToSlot(carId, 'parking', index)
}

// The ghost preview that follows the pointer during a live drag - generic
// session data (payload is just a car id) resolved back to a display name using
// the same data the slots already render from.
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
        <dt>Reputation</dt>
        <dd data-test="reputation-value">
          <RouterLink :to="{ name: 'standing' }" class="standing-link" data-test="standing-link">
            {{ game.reputationTier }}</RouterLink
          >
        </dd>
      </div>
      <div>
        <dt>Cars owned</dt>
        <dd>{{ game.ownedCarCount }}</dd>
      </div>
    </dl>

    <section class="bays">
      <h3>
        Service bays ({{ game.serviceBayCount - game.serviceBayFreeCount }}/{{
          game.serviceBayCount
        }})
        <HelpHint label="Service bays">
          Labour only reaches a car sitting in a service bay. Moves are free and instant.
        </HelpHint>
      </h3>
      <ul class="bay-slots">
        <!-- data-test falls through to ShopSlot's root <li> - the tutorial
             walkthrough spotlights the first bay. -->
        <ShopSlot
          v-for="(slot, i) in game.serviceBaysView"
          :key="slot?.carId ?? 'empty-' + i"
          :car="slot"
          :accepts="acceptsIntoService"
          move-label="&rarr; parking"
          :move-disabled="game.parkingFull"
          test-id-prefix="move-parking-"
          :empty-slot-id="'empty-' + i"
          :data-test="'service-slot-' + i"
          @move="game.moveCar($event, 'parking')"
          @drop="onDropOnBaySlot(i, $event)"
        />
      </ul>
    </section>

    <section class="stations" data-test="stations">
      <h3>
        Work stations
        <HelpHint label="Work stations">
          Where a part gets worked on. The bench puts a part right, the machine shop cuts metal off
          a healthy one, and the body and paint shop works on the whole car. Click a station to open
          it.
        </HelpHint>
      </h3>
      <ul class="station-list">
        <li>
          <button
            type="button"
            class="station"
            :class="{ active: openStation === 'workbench' }"
            data-test="station-open-workbench"
            @click="toggleStation('workbench')"
          >
            <span class="station-name">Workbench</span>
            <span class="station-status" data-test="station-status-workbench">{{
              workbenchStatus
            }}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            class="station"
            :class="{ active: openStation === 'machine', derelict: !machineShopEquipped }"
            data-test="station-open-machine"
            @click="toggleStation('machine')"
          >
            <span class="station-name">Machine shop</span>
            <span class="station-status" data-test="station-status-machine">{{
              machineStatus
            }}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            class="station"
            :class="{ active: openStation === 'body-paint', derelict: !bodyPaintIsOpen }"
            data-test="station-open-body-paint"
            @click="toggleStation('body-paint')"
          >
            <span class="station-name">Body and paint</span>
            <span class="station-status" data-test="station-status-body-paint">{{
              bodyPaintStatus
            }}</span>
          </button>
        </li>
      </ul>

      <div v-if="openStation" class="station-panel" data-test="station-panel">
        <WorkbenchPanel v-if="openStation === 'workbench'" />
        <MachineShopPanel v-else-if="openStation === 'machine'" />
        <div v-else class="body-paint-entry" data-test="body-paint-entry">
          <template v-if="bodyPaintIsOpen">
            <button
              v-if="soloServiceBayCarId"
              type="button"
              data-test="body-paint-enter"
              @click="goToBodyPaintCar"
            >
              Work the body and paint
            </button>
            <p v-else class="hint" data-test="body-paint-hint">
              Bring a car into a service bay first.
            </p>
          </template>
          <p v-else class="refusal" data-test="body-paint-refusal">
            A dead spray booth and someone else's panels. Needs the body line before any of it is
            yours to use.
          </p>
        </div>
      </div>
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

    <section class="forecourt">
      <h3>
        Forecourt ({{ game.forecourtOccupancyCount }}/{{ game.forecourtCapacity }})
        <HelpHint label="Forecourt">
          Where listed cars go on show. Listing a car on a channel where a buyer comes to look at it
          moves the car here from parking or a service bay; delisting moves it back. You can't drag
          a car onto the forecourt by hand - it only ever holds cars you've put up for sale.
        </HelpHint>
      </h3>
      <ul class="forecourt-list" data-test="forecourt-list">
        <li
          v-for="(slot, i) in game.forecourtView"
          :key="slot?.carId ?? 'empty-forecourt-' + i"
          class="forecourt-slot"
          :data-test="'forecourt-slot-' + i"
        >
          <RouterLink
            v-if="slot"
            :to="{ name: 'car', params: { id: slot.carId } }"
            class="forecourt-car"
          >
            {{ slot.displayName }}
            <span v-if="slot.hasOffer" class="badge offer">offer today</span>
          </RouterLink>
          <span v-else class="empty">empty forecourt slot</span>
        </li>
      </ul>
    </section>

    <section v-if="game.graceParkedCarView" class="grace-parking" data-test="grace-parking">
      <h3>
        Double parked
        <HelpHint label="Double parking">
          No real bay was free when this car arrived, so it's sitting in the one unowned overflow
          space above your bays. It migrates into a real bay automatically the moment one opens up -
          buy a bay, sell a car, or free up any slot. Until then, a fine is charged every day it
          stays here.
        </HelpHint>
      </h3>
      <div class="grace-slot">
        <RouterLink
          :to="{ name: 'car', params: { id: game.graceParkedCarView.carId } }"
          class="grace-car"
        >
          {{ game.graceParkedCarView.displayName }}
        </RouterLink>
        <span class="grace-warning"
          >DOUBLE PARKED - {{ formatYen(game.doubleParkingFineYen) }}/day fine</span
        >
      </div>
    </section>

    <section v-if="game.pendingOffersView.length" class="offers">
      <h3>Offers ({{ game.pendingOffersView.length }})</h3>
      <ul>
        <li v-for="offer in game.pendingOffersView" :key="offer.carInstanceId">
          <span>{{ offer.copy }}</span>
          <span v-if="offer.wantLine" class="offer-want" data-test="offer-want-garage">{{
            offer.wantLine
          }}</span>
          <button data-test="accept-offer-garage" @click="game.acceptOffer(offer.carInstanceId)">
            Accept
          </button>
        </li>
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
  color: var(--mg-neon-violet);
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

/* The reputation line is a door to the Standing screen. It must LOOK like one:
   interactive text is cyan and underlined, like every other link in the app. */
.standing-link {
  color: var(--mg-neon-violet);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.standing-link:hover {
  color: var(--mg-neon-pink);
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
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-violet);
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
  /* Narrower column minimum than the old 220px so a bay sits closer to square
     against its fixed height, rather than reading as a wide letterbox. */
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--mg-space-3);
}

.station-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--mg-space-3);
}

/* A station is a door: the whole card is the click target, styled like the
   slots around it rather than like a form control. */
.station {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mg-space-1);
  min-height: 56px;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
  text-align: left;
  cursor: pointer;
}

.station .station-name {
  color: var(--mg-neon-cyan);
}

.station.active {
  border-color: var(--mg-neon-violet);
}

.station.active .station-name {
  color: var(--mg-neon-violet);
}

.station-status {
  color: var(--mg-text-dim);
  text-transform: none;
}

.station.derelict .station-status {
  color: var(--mg-danger);
}

.station-panel {
  margin: 0 0 var(--mg-space-4);
}

.body-paint-entry .hint,
.body-paint-entry .refusal {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.forecourt-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--mg-space-3);
}

.forecourt-slot {
  display: flex;
  align-items: center;
  min-height: 56px;
  background: var(--mg-panel);
  border: 1px dashed var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.forecourt-car {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  color: var(--mg-neon-violet);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.forecourt-slot .badge {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.forecourt-slot .badge.offer {
  color: var(--mg-yen);
}

.grace-parking h3 {
  color: var(--mg-danger);
}

.grace-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-3);
  max-width: 420px;
  margin: 0 0 var(--mg-space-4);
  background: var(--mg-panel);
  border: 2px solid var(--mg-danger);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.grace-car {
  color: var(--mg-neon-violet);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.grace-warning {
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
  font-weight: bold;
  text-align: right;
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

.offer-want {
  flex: 1;
  font-style: italic;
  opacity: 0.85;
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
