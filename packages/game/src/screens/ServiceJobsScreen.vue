<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import ServiceTaskList from '../components/ServiceTaskList.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const hasOffers = computed(() => game.serviceJobOfferViews.length > 0)

/**
 * Sprint 77 decision 5 (the deliver flow): grading is free and repeatable,
 * but never LIVE - `hasGraded` gates the checklist from "labels only" to
 * "full [ ]/[x] lines with actual-vs-required" only once "Show them the
 * car" is actually clicked, and resets whenever the picked car (or the
 * active mission itself) changes, so a stale grade can never read as
 * current.
 */
const pickedCarId = ref<string | null>(null)
const hasGraded = ref(false)
const deliverConfirming = ref(false)

watch(pickedCarId, () => {
  hasGraded.value = false
  deliverConfirming.value = false
})
watch(
  () => game.activeStoryMissionView?.id,
  () => {
    pickedCarId.value = null
    hasGraded.value = false
    deliverConfirming.value = false
  },
)

const missionGrade = computed(() =>
  pickedCarId.value ? game.gradeMission(pickedCarId.value) : null,
)
const missionBoardRows = computed(() => game.lapBoardRowsFor(pickedCarId.value))

/** The checklist the panel actually renders - label-only lines before
 * grading, `gradeMissionCar`'s own full lines (actual-vs-required, pass)
 * once graded. `pass: undefined` is the "not graded yet" state the template
 * reads as an empty `[ ]` with no actual/required shown. */
const checklistLines = computed(() => {
  if (hasGraded.value && missionGrade.value) {
    return missionGrade.value.lines.map((line) => ({
      ...line,
      pass: line.pass as boolean | undefined,
    }))
  }
  return (game.activeStoryMissionView?.requirementLines ?? []).map((line) => ({
    ...line,
    actual: '',
    pass: undefined as boolean | undefined,
  }))
})

function onShowCar(): void {
  hasGraded.value = true
}

function onHandItOver(): void {
  if (!pickedCarId.value) return
  if (deliverConfirming.value) {
    deliverConfirming.value = false
    game.deliverMission(pickedCarId.value)
    pickedCarId.value = null
    hasGraded.value = false
  } else {
    deliverConfirming.value = true
  }
}
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
        <RouterLink :to="{ name: 'standing' }" class="standing-link" data-test="standing-link"
          >{{ game.reputationPoints }} rep</RouterLink
        >
        · {{ formatYen(game.cashYen) }} · labour {{ game.laborSlotsRemainingToday }}/{{
          game.laborSlotsPerDay
        }}
      </p>
    </header>

    <p v-if="game.parkingFull" class="parking-warning">
      Parking is full ({{ game.parkingOccupancyCount }}/{{ game.parkingCapacity }}) - accepting a
      job won't bring the car in until a bay frees up.
    </p>

    <section v-if="game.storyMissionOfferView" class="mission-card">
      <div class="mission-head">
        <span class="story-chip">STORY</span>
        <span class="customer">{{ game.storyMissionOfferView.personaName }}</span>
        <span class="mission-title">{{ game.storyMissionOfferView.title }}</span>
      </div>
      <p class="desc">{{ game.storyMissionOfferView.requestCopy }}</p>
      <p class="terms">
        pays {{ formatYen(game.storyMissionOfferView.payoutYen) }} · budget
        {{ formatYen(game.storyMissionOfferView.budgetCapYen) }} ·
        {{ game.storyMissionOfferView.deadlineDays }}
        days once accepted
      </p>
      <button
        class="primary"
        data-test="mission-accept"
        @click="game.acceptMission(game.storyMissionOfferView.id)"
      >
        Accept
      </button>
    </section>

    <section v-if="game.activeStoryMissionView" class="mission-active">
      <div class="mission-head">
        <span class="story-chip">STORY</span>
        <span class="customer">{{ game.activeStoryMissionView.personaName }}</span>
        <span class="mission-title">{{ game.activeStoryMissionView.title }}</span>
        <span v-if="game.activeStoryMissionView.daysLeft !== null" class="days">
          {{
            game.activeStoryMissionView.daysLeft <= 0
              ? 'due today'
              : game.activeStoryMissionView.daysLeft + 'd left'
          }}
        </span>
      </div>

      <ul class="requirement-checklist" data-test="mission-requirements">
        <li
          v-for="(line, i) in checklistLines"
          :key="i"
          :class="{ pass: line.pass === true, fail: line.pass === false }"
        >
          <span class="check">{{ line.pass ? '[x]' : '[ ]' }}</span>
          <span class="req-label">{{ line.label }}</span>
          <span v-if="line.pass !== undefined" class="req-actual">
            {{ line.actual }} (need {{ line.required }})
          </span>
          <span v-else class="req-required">need {{ line.required }}</span>
        </li>
      </ul>

      <div class="car-picker">
        <select v-model="pickedCarId" data-test="mission-pick-car">
          <option :value="null" disabled>Pick a car</option>
          <option v-for="c in game.missionCarOptions" :key="c.id" :value="c.id">
            {{ c.displayName }}
          </option>
        </select>
        <button :disabled="!pickedCarId" data-test="mission-grade" @click="onShowCar">
          Show them the car
        </button>
        <button
          v-if="hasGraded && missionGrade?.pass"
          class="primary"
          :class="{ confirming: deliverConfirming }"
          data-test="mission-deliver"
          @click="onHandItOver"
        >
          {{ deliverConfirming ? 'Confirm - hand it over' : 'Hand it over' }}
        </button>
      </div>

      <table
        v-if="game.activeStoryMissionView.lapTimeCeiling"
        class="lap-board"
        data-test="mission-lap-board"
      >
        <caption>
          Reference laps -
          {{
            game.activeStoryMissionView.lapTimeCeiling.courseId
          }}
        </caption>
        <thead>
          <tr>
            <th>Car</th>
            <th>Power</th>
            <th>Weight</th>
            <th>Tyres</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in missionBoardRows" :key="row.id" :class="{ anchor: row.isAnchor }">
            <td>{{ row.name }}</td>
            <td>{{ row.powerPs }} PS</td>
            <td>{{ row.weightKg }} kg</td>
            <td>{{ row.tyreGrade }}</td>
            <td>{{ row.timeSeconds }}s</td>
          </tr>
        </tbody>
      </table>
    </section>

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
            <ServiceTaskList :tasks="offer.tasks" />
            <span class="terms">
              {{ offer.carName
              }}<span
                v-if="offer.fitmentClass"
                class="class-chip"
                :data-test="'class-' + offer.id"
                >{{ game.fitmentClassLabel(offer.fitmentClass) }}</span
              >
              · pays {{ formatYen(offer.payoutYen) }} · +{{ offer.baseReputation }} rep base · offer
              expires day {{ offer.expiresOnDay }}
            </span>
          </div>
          <div class="offer-foot">
            <button
              :disabled="!offer.canAccept"
              :class="{ 'needs-upgrade': !offer.canAccept }"
              :title="!offer.canAccept ? (offer.upgradeHint ?? 'needs a tool upgrade') : undefined"
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
            <span class="terms"
              >{{ job.carName
              }}<span v-if="job.fitmentClass" class="class-chip">{{
                game.fitmentClassLabel(job.fitmentClass)
              }}</span></span
            >
            <!-- Sprint 67 decision 7 (item 12): no `!job.inTransit` guard.
                 An in-transit job's tasks are exactly what a player needs in
                 order to go and buy parts before the car lands. -->
            <ServiceTaskList :tasks="job.tasks" />
          </div>
          <template v-if="job.inTransit">
            <span class="status arriving" :data-test="'arriving-' + job.id">
              car arriving tomorrow
            </span>
          </template>
          <template v-else>
            <span class="status" :class="{ done: job.workDone }">
              {{ job.workDone ? 'work done - hand back' : 'work outstanding' }}
            </span>
            <span v-if="job.daysLeft !== null" class="days" :class="{ urgent: job.daysLeft <= 2 }">
              {{ job.daysLeft <= 0 ? 'due today' : job.daysLeft + 'd left' }}
            </span>
            <button
              class="primary"
              :class="{ danger: !job.workDone }"
              data-test="complete-service-job"
              @click="game.completeServiceJob(job.id)"
            >
              {{ job.workDone ? 'Complete Job' : 'Give Up Job' }}
            </button>
          </template>
          <RouterLink :to="{ name: 'car', params: { id: job.carId } }" class="work-link">
            work on car →
          </RouterLink>
        </li>
      </ul>
    </section>
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

/* The rep figure links to the Standing screen. It must LOOK like a link - the
   Sprint 62 styling rendered it invisible on a dark panel (see GarageScreen's
   matching comment). */
.standing-link {
  color: var(--mg-neon-cyan);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.standing-link:hover {
  color: var(--mg-neon-pink);
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

.terms {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* Sprint 61 (item 15): a small muted class chip so the player knows which
   class of parts fits this customer's car (Kei & Compact / Sports / ...). */
.class-chip {
  display: inline-block;
  margin-left: var(--mg-space-1);
  padding: 0 var(--mg-space-1);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 4px;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-xs, 0.7rem);
}

.offer-foot {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
}

/* Sprint 76 (story missions I): the pinned campaign card - a distinct
   neon-violet border marks it as the one non-generic card on this board. */
.mission-card {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-4);
}

.mission-head {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.mission-title {
  color: var(--mg-text);
}

.story-chip {
  display: inline-block;
  padding: 0 var(--mg-space-1);
  border: 1px solid var(--mg-neon-violet);
  border-radius: 4px;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-xs, 0.7rem);
  letter-spacing: 0.05em;
}

.mission-active {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

.mission-active .mission-head {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

/* Sprint 77 (story missions II, the deliver flow): the requirement checklist
   - a plain [ ]/[x] list, never colour-only (accessibility), the label
   always visible, actual-vs-required appended only once graded. */
.requirement-checklist {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-1);
  font-size: var(--mg-fs-sm);
}

.requirement-checklist li {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
  color: var(--mg-text-dim);
}

.requirement-checklist li.pass {
  color: var(--mg-success);
}

.requirement-checklist li.fail {
  color: var(--mg-neon-pink);
}

.check {
  font-family: monospace;
}

.req-label {
  color: var(--mg-text);
}

.car-picker {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

.car-picker select {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

/* The reference-lap board (decision 4) - the anchor rows are visually
   grouped by a top divider, since they always come last in the returned
   rows. */
.lap-board {
  border-collapse: collapse;
  font-size: var(--mg-fs-sm);
  width: 100%;
}

.lap-board caption {
  text-align: left;
  color: var(--mg-text-dim);
  margin-bottom: var(--mg-space-1);
}

.lap-board th,
.lap-board td {
  text-align: left;
  padding: 2px var(--mg-space-2);
}

.lap-board tr.anchor:first-of-type td {
  border-top: 1px solid var(--mg-panel-edge);
}

.lap-board tr.anchor {
  color: var(--mg-text-dim);
}

/* The armed second-click state (Sprint 71's scrap-shell idiom) - a real
   commitment reads as a border/colour change, never a relabel alone. */
button.confirming {
  border-color: var(--mg-neon-pink);
  color: var(--mg-neon-pink);
}

/* Compact disabled state for a tool-tier lock (Sprint 36): a colored border
   reads as "blocked, not just busy" at a glance, and the upgrade hint lives
   in the title tooltip instead of a separate text line. */
button.needs-upgrade {
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

.active-row button.primary {
  margin-top: 0;
}

button.primary.danger {
  background: var(--mg-panel);
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}
</style>
