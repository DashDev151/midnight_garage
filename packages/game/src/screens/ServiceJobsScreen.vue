<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import EndDayButton from '../components/EndDayButton.vue'
import HelpHint from '../components/HelpHint.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const hasOffers = computed(() => game.serviceJobOfferViews.length > 0)
</script>

<template>
  <section class="jobs">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>
        Service jobs
        <HelpHint label="Service jobs">
          Accept a job and the customer's car comes into your shop. Do the work it needs - buy
          parts, assign labour - then hand it back from the car's page to get paid.
        </HelpHint>
      </h2>
      <p class="rep">
        {{ game.reputationPoints }} rep · {{ formatYen(game.cashYen) }} · labour
        {{ game.laborSlotsRemainingToday }}/{{ game.laborSlotsPerDay }}
      </p>
    </header>

    <p v-if="game.parkingFull" class="parking-warning">
      Parking is full ({{ game.parkingOccupancyCount }}/{{ game.parkingCapacity }}) - accepting a
      job won't bring the car in until a bay frees up.
    </p>

    <section class="board">
      <h3>Job board</h3>
      <p v-if="!hasOffers" class="empty">
        No jobs on the board. Fresh ones land most days - End Day (or warp).
      </p>
      <ul v-else class="offers">
        <li v-for="offer in game.serviceJobOfferViews" :key="offer.id" class="offer">
          <div class="offer-main">
            <span class="customer">{{ offer.customerName }}</span>
            <span class="desc">{{ offer.description }}</span>
            <ul class="tasks">
              <li v-for="(task, i) in offer.tasks" :key="i">{{ task.label }}</li>
            </ul>
            <span class="terms">
              {{ offer.carName }} · pays {{ formatYen(offer.payoutYen) }} · +{{
                offer.baseReputation
              }}
              rep base · offer expires day {{ offer.expiresOnDay }}
            </span>
          </div>
          <div class="offer-foot">
            <button
              :disabled="!offer.canAccept"
              :class="{ 'needs-equipment': !offer.canAccept }"
              :title="
                !offer.canAccept
                  ? 'Needs ' + (offer.missingEquipmentName ?? 'equipment')
                  : undefined
              "
              :data-test="'accept-' + offer.id"
              @click="game.acceptServiceJob(offer.id)"
            >
              Accept
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="game.activeServiceJobViews.length" class="active">
      <h3>In the shop</h3>
      <ul>
        <li v-for="job in game.activeServiceJobViews" :key="job.id" class="active-row">
          <div class="active-main">
            <span class="customer">{{ job.customerName }}</span>
            <span class="terms">{{ job.carName }}</span>
            <ul class="tasks">
              <li v-for="(task, i) in job.tasks" :key="i" :class="{ done: task.done }">
                {{ task.label }}
              </li>
            </ul>
          </div>
          <span class="status" :class="{ done: job.workDone }">
            {{ job.workDone ? 'work done - hand back' : 'work outstanding' }}
          </span>
          <span v-if="job.daysLeft !== null" class="days" :class="{ urgent: job.daysLeft <= 2 }">
            {{ job.daysLeft <= 0 ? 'due today' : job.daysLeft + 'd left' }}
          </span>
          <RouterLink :to="{ name: 'car', params: { id: job.carId } }" class="work-link">
            work on car →
          </RouterLink>
        </li>
      </ul>
    </section>

    <EndDayButton />
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
  flex-wrap: wrap;
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h2,
h3 {
  display: flex;
  align-items: center;
}

h2 {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.rep {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
  margin: var(--mg-space-2) 0 0;
}

.parking-warning {
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-3);
}

.offers {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-3);
}

.offer {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.customer {
  color: var(--mg-neon-cyan);
}

.desc {
  display: block;
}

/* One line per service-job task (Sprint 29 - a job's work is a themed list
   now, not a single work label). */
.tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
  font-size: var(--mg-fs-sm);
}

.tasks li.done {
  color: var(--mg-success);
}

.terms {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.offer-foot {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
}

/* Compact disabled state for a missing-equipment lock (Sprint 25 task 9):
   a colored border reads as "blocked, not just busy" at a glance, and the
   full reason lives in the title tooltip instead of a separate text line. */
button.needs-equipment {
  border-color: var(--mg-neon-pink);
  opacity: 0.6;
}

.active ul {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-2);
}

.active-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.active-main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}

.status {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.status.done {
  color: var(--mg-success);
}

.days {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.days.urgent {
  color: var(--mg-neon-pink);
}

.work-link {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  text-decoration: none;
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
  margin-top: var(--mg-space-3);
}
</style>
