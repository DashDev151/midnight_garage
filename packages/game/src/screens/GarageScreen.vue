<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { describeLogEntry } from '../utils/dayLogFormat'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const recentLog = computed(() =>
  game.dayLog
    .slice(-40)
    .reverse()
    .map((entry, i) => ({
      id: game.dayLog.length - i,
      text: describeLogEntry(entry, game.resolveModelName),
    })),
)

const nextServiceBayPriceYen = computed(() => game.nextBayPrice('service'))
const nextParkingBayPriceYen = computed(() => game.nextBayPrice('parking'))
</script>

<template>
  <section class="garage">
    <h2>Garage</h2>

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
        <dd>{{ game.reputationTier }}</dd>
      </div>
      <div>
        <dt>Cars owned</dt>
        <dd>{{ game.ownedCarCount }}</dd>
      </div>
    </dl>

    <div class="controls">
      <button class="primary" data-test="end-day" @click="game.commitDay()">End Day</button>
      <button data-test="new-game" @click="game.newGame()">New Game</button>
    </div>

    <section class="bays">
      <h3>Service bays ({{ game.serviceBayFreeCount }}/{{ game.serviceBayCount }} free)</h3>
      <p class="how">
        Labor only reaches a car sitting in a service bay. Moves are free and instant.
      </p>
      <ul class="bay-slots">
        <li v-for="(slot, i) in game.serviceBaysView" :key="i" class="bay-slot">
          <template v-if="slot">
            <RouterLink :to="{ name: 'car', params: { id: slot.carId } }" class="slot-car">
              {{ slot.displayName }}
              <span v-if="slot.isCustomerCar" class="badge">customer job</span>
            </RouterLink>
            <button
              :data-test="'move-parking-' + slot.carId"
              @click="game.moveCar(slot.carId, 'parking')"
            >
              &rarr; parking
            </button>
          </template>
          <span v-else class="slot-empty">empty bay</span>
        </li>
      </ul>
    </section>

    <section class="parking">
      <h3>Parking ({{ game.parkingOccupancyCount }}/{{ game.parkingCapacity }})</h3>
      <p v-if="game.parkingView.length === 0" class="empty">Nothing parked.</p>
      <ul v-else class="parking-list">
        <li v-for="car in game.parkingView" :key="car.carId" class="parking-row">
          <RouterLink :to="{ name: 'car', params: { id: car.carId } }" class="slot-car">
            {{ car.displayName }}
            <span v-if="car.isCustomerCar" class="badge">customer job</span>
          </RouterLink>
          <button
            :disabled="game.serviceBayFreeCount <= 0"
            :data-test="'move-service-' + car.carId"
            @click="game.moveCar(car.carId, 'service')"
          >
            &rarr; service bay
          </button>
        </li>
      </ul>
    </section>

    <section class="facilities">
      <h3>Facilities</h3>
      <div class="facility-row">
        <span>Service bays: {{ game.serviceBayCount }}</span>
        <button
          v-if="nextServiceBayPriceYen !== null"
          :disabled="game.cashYen < nextServiceBayPriceYen"
          data-test="buy-service-bay"
          @click="game.buyBay('service')"
        >
          Buy next bay ({{ formatYen(nextServiceBayPriceYen) }})
        </button>
        <span v-else class="maxed">maxed out</span>
      </div>
      <div class="facility-row">
        <span>Parking bays: {{ game.parkingCapacity }}</span>
        <button
          v-if="nextParkingBayPriceYen !== null"
          :disabled="game.cashYen < nextParkingBayPriceYen"
          data-test="buy-parking-bay"
          @click="game.buyBay('parking')"
        >
          Buy next bay ({{ formatYen(nextParkingBayPriceYen) }})
        </button>
        <span v-else class="maxed">maxed out</span>
      </div>
    </section>

    <section v-if="game.activeListings.length" class="listings">
      <h3>Listings ({{ game.activeListings.length }})</h3>
      <ul>
        <li v-for="listing in game.activeListings" :key="listing.id">
          {{ game.resolveModelName(listing.modelId) }} — asking
          {{ formatYen(listing.askingPriceYen) }}, resolves day {{ listing.resolvesOnDay }}
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
  </section>
</template>

<style scoped>
h2 {
  color: var(--mg-neon-cyan);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
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

.how {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-3);
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

.bay-slot,
.parking-row {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.slot-empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.slot-car {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  color: var(--mg-neon-cyan);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.badge {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bay-slot button,
.parking-row button {
  align-self: flex-start;
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
}

.facilities {
  display: grid;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-4);
}

.facility-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.facility-row button {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
}

.maxed {
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
}

.listings ul {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
}

.listings li {
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
</style>
