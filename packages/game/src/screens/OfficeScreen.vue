<script setup lang="ts">
import { CARS, type BuyerArchetype } from '@midnight-garage/content'
import { dayOfSeason, eraOf, seasonOf, type MissionGradeReport } from '@midnight-garage/sim'
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import ProgressBar from '../components/ProgressBar.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import { eraLabel, seasonLabel, WEEKS_PER_SEASON } from '../utils/calendarLabels'
import { SELLING_CHANNEL_LABELS } from '../utils/sellingChannelLabels'
import { photoCountForReputationTier } from './officeDisplay'

/**
 * The office: a room off the garage floor (station idiom, sprint209.md)
 * holding six plain blocks - the phone (a door to the jobs board), standing
 * and rep (the corkboard fiction, moved from the old Standing screen intact),
 * the office wall's diegetic readouts (photo wall, corkboard, certificates,
 * wall calendar - also moved from Standing), the listing channels the shop
 * can currently sell through, and the cash register (the weekly cost sheet,
 * moved from the old Costs screen intact). Every block is a pure renderer
 * over `gameStore` - no new state anywhere in this screen.
 */
const game = useGameStore()

const standing = computed(() => game.standingView)

/** Every owned car, by the name the player knows it as - the commission
 * delivery picker's own option list. */
const ownedCars = computed(() =>
  game.gameState.ownedCars.map((car) => ({
    id: car.id,
    label: CARS.find((model) => model.id === car.modelId)?.displayName ?? car.modelId,
  })),
)

/** The car picked for each scene's commission delivery, and the last "check
 * fit" result against it - both local UI state, reset once a delivery lands. */
const selectedCarByScene = reactive<Record<string, string>>({})
const gradeResultByScene = reactive<Record<string, MissionGradeReport | null>>({})

function checkCommissionFit(scene: BuyerArchetype): void {
  const carId = selectedCarByScene[scene]
  if (!carId) return
  gradeResultByScene[scene] = game.gradeSceneCommission(scene, carId)
}

function deliverCommission(scene: BuyerArchetype): void {
  const carId = selectedCarByScene[scene]
  if (!carId) return
  if (game.deliverSceneCommission(scene, carId)) {
    gradeResultByScene[scene] = null
    selectedCarByScene[scene] = ''
  }
}

/** The last "check fit" result's lines for one scene, or an empty list
 * before any check has run - keeps the template free of a non-null
 * assertion the Vue template compiler here does not parse. */
function commissionLines(scene: BuyerArchetype) {
  return gradeResultByScene[scene]?.lines ?? []
}

/** The office wall's diegetic readouts: the photo wall stands in for
 * reputation (`officeDisplay.ts` scales the snapshot count off the tier the
 * game already carries), the corkboard note counts the live listings, the
 * certificates are the craft operations the shop actually possesses, and
 * the wall calendar reads the current season and day (below). All read
 * state computed elsewhere - no second source for any of these numbers. */
const listingCount = computed(() => game.gameState.carsForSale.length)
const photoCount = computed(() => photoCountForReputationTier(game.reputationTier))

/** The wall calendar's own three readouts - the current season and era
 * words, and today's position within the season - plus the season laid out
 * as four week-rows of five days for the grid. No year anywhere (design
 * law: `campaign-clock-and-events.md` section 2a). */
const currentSeasonDay = computed(() => dayOfSeason(game.day, game.context.economy))
const currentSeasonLabel = computed(() => seasonLabel(seasonOf(game.day, game.context.economy)))
const currentEraLabel = computed(() => eraLabel(eraOf(game.day, game.context.economy)))
const seasonWeeks = computed(() => {
  const weeks: number[][] = []
  for (let week = 0; week < WEEKS_PER_SEASON; week++) {
    weeks.push(Array.from({ length: 5 }, (_, i) => week * 5 + i + 1))
  }
  return weeks
})

const unlockedOperations = computed(() =>
  standing.value.scenes
    .map((scene) => scene.operation)
    .filter(
      (operation): operation is NonNullable<typeof operation> => operation?.gateReason === null,
    ),
)

const OPERATION_GATE_COPY: Readonly<Record<'tool-tier' | 'scene-standing', string>> = {
  'tool-tier': 'Needs tier 3 of the tool line this operation uses.',
  'scene-standing': 'Needs this scene at the Shop stage.',
}

/** The listing channels currently open to this career, in the picker's own
 * display order - a plain summary block, never interactive here (the real
 * picker lives on each car's own page). */
const openChannelIds = computed(() => game.availableSellingChannelIds)

/** The shop's own weekly cost sheets, one carbon copy per week, newest
 * clipped on top - the cash register block, moved from the old Costs
 * screen. Pure renderer over `game.costSheetView`, itself a pure derivation
 * over the sim's own accumulator; nothing here totals anything. */
const weeks = computed(() => game.costSheetView.weeks)
</script>

<template>
  <section class="office" data-test="office">
    <RouterLink :to="{ name: 'garage' }" class="back" data-test="office-back"
      >&lt; Garage</RouterLink
    >
    <h2>The office</h2>

    <section class="panel" data-test="phone-panel">
      <h3>Phone</h3>
      <p class="hint">Calls come in through the day - the jobs board is where they land.</p>
      <RouterLink :to="{ name: 'jobs' }" class="phone-link" data-test="phone-link"
        >Check the phone</RouterLink
      >
    </section>

    <section class="panel" data-test="reputation-panel">
      <h3>Reputation</h3>
      <p class="lead">
        You're
        <strong data-test="rep-tier">{{ standing.reputation.tier }}</strong>
        at
        <strong data-test="rep-points">{{ standing.reputation.points }}</strong>
        rep.
      </p>
      <ProgressBar
        :value="standing.reputation.points"
        :max="standing.reputation.nextTier?.threshold ?? null"
        :caption="
          standing.reputation.nextTier
            ? `to ${standing.reputation.nextTier.tier}`
            : 'top of the ladder'
        "
        data-test="rep-bar"
      />
      <p v-if="standing.reputation.nextTier" class="next" data-test="rep-next">
        Next: <strong>{{ standing.reputation.nextTier.tier }}</strong> at
        {{ standing.reputation.nextTier.threshold }} rep.
      </p>
      <p v-else class="next" data-test="rep-next">
        You've reached the top of the ladder. Nowhere higher to climb.
      </p>
    </section>

    <section class="panel" data-test="scenes-panel">
      <h3>Scenes</h3>
      <p class="hint">
        A scene remembers the cars you built for it. No score, no bar - just the work.
      </p>
      <ul class="scenes">
        <li
          v-for="scene in standing.scenes"
          :key="scene.scene"
          class="scene"
          :data-test="'scene-' + scene.scene"
        >
          <div class="scene-head">
            <span class="scene-name">{{ scene.label }}</span>
            <span class="scene-stage" :data-test="'scene-stage-' + scene.scene">{{
              scene.stageCopy
            }}</span>
          </div>
          <p v-if="scene.cars.length === 0" class="scene-empty">Nothing delivered here yet.</p>
          <ul v-else class="scene-cars" :data-test="'scene-cars-' + scene.scene">
            <li v-for="car in scene.cars" :key="car.carInstanceId" class="scene-car">
              <span class="scene-car-name">{{ car.carLabel }}</span>
              <span class="scene-car-price">{{ formatYen(car.priceYen) }}</span>
            </li>
          </ul>

          <div
            v-if="scene.commission"
            class="commission"
            :data-test="'scene-commission-' + scene.scene"
          >
            <p class="commission-brief">
              <strong>{{ scene.commission.customerName }}</strong
              >: "{{ scene.commission.requestCopy }}"
            </p>
            <button
              v-if="scene.commission.status === 'offered'"
              type="button"
              class="commission-btn"
              :data-test="'scene-commission-accept-' + scene.scene"
              @click="game.acceptSceneCommission(scene.scene)"
            >
              Accept
            </button>
            <template v-else>
              <div class="commission-delivery">
                <select
                  v-model="selectedCarByScene[scene.scene]"
                  class="commission-select"
                  :data-test="'scene-commission-car-' + scene.scene"
                >
                  <option value="" disabled>Pick a car</option>
                  <option v-for="car in ownedCars" :key="car.id" :value="car.id">
                    {{ car.label }}
                  </option>
                </select>
                <button
                  type="button"
                  class="commission-btn"
                  :disabled="!selectedCarByScene[scene.scene]"
                  @click="checkCommissionFit(scene.scene)"
                >
                  Check fit
                </button>
                <button
                  type="button"
                  class="commission-btn"
                  :disabled="!gradeResultByScene[scene.scene]?.pass"
                  :data-test="'scene-commission-deliver-' + scene.scene"
                  @click="deliverCommission(scene.scene)"
                >
                  Deliver
                </button>
              </div>
              <ul
                v-if="gradeResultByScene[scene.scene]"
                class="commission-lines"
                :data-test="'scene-commission-lines-' + scene.scene"
              >
                <li
                  v-for="(line, i) in commissionLines(scene.scene)"
                  :key="i"
                  :class="{ pass: line.pass }"
                >
                  {{ line.label }}: {{ line.actual }} (needs {{ line.required }})
                </li>
              </ul>
            </template>
          </div>

          <div
            v-if="scene.operation"
            class="operation"
            :data-test="'scene-operation-' + scene.scene"
          >
            <p class="operation-name">{{ scene.operation.displayName }}</p>
            <p class="operation-note">{{ scene.operation.description }}</p>
            <p v-if="scene.operation.gateReason" class="operation-locked">
              {{ OPERATION_GATE_COPY[scene.operation.gateReason] }}
            </p>
            <p
              v-else
              class="operation-unlocked"
              :data-test="'scene-operation-unlocked-' + scene.scene"
            >
              Unlocked. Put the car in the service bay and open the Machine Shop to do it.
            </p>
          </div>
        </li>
      </ul>
    </section>

    <section class="panel" data-test="office-wall-panel">
      <h3>Office wall</h3>
      <dl class="office-readouts">
        <div>
          <dt>Photo wall</dt>
          <dd data-test="office-photo-count">
            {{ photoCount }} photographs pinned up, {{ game.reputationTier }} reputation
          </dd>
        </div>
        <div>
          <dt>Corkboard</dt>
          <dd data-test="office-card-count">
            {{ listingCount }} car{{ listingCount === 1 ? '' : 's' }} listed
          </dd>
        </div>
        <div>
          <dt>Certificates</dt>
          <dd data-test="office-certificate-count">
            <span v-if="unlockedOperations.length === 0">none earned yet</span>
            <span v-else>{{ unlockedOperations.map((op) => op.displayName).join(', ') }}</span>
          </dd>
        </div>
        <div>
          <dt>Wall calendar</dt>
          <dd data-test="office-wall-calendar">
            <p class="wall-calendar-head">
              <span data-test="wall-calendar-season">{{ currentSeasonLabel }}</span>
              <span class="wall-calendar-era" data-test="wall-calendar-era">{{
                currentEraLabel
              }}</span>
            </p>
            <div class="wall-calendar-grid" data-test="wall-calendar-grid">
              <div
                v-for="(week, weekIndex) in seasonWeeks"
                :key="weekIndex"
                class="wall-calendar-week"
                :data-test="'wall-calendar-week-' + weekIndex"
              >
                <span
                  v-for="d in week"
                  :key="d"
                  class="wall-calendar-cell"
                  :class="{ today: d === currentSeasonDay }"
                  :data-test="d === currentSeasonDay ? 'wall-calendar-today' : null"
                  >{{ String(d).padStart(2, '0') }}</span
                >
              </div>
            </div>
          </dd>
        </div>
      </dl>
    </section>

    <section class="panel" data-test="channels-panel">
      <h3>Listing channels</h3>
      <p v-if="openChannelIds.length === 0" class="empty" data-test="channels-empty">
        Nowhere to list a car yet.
      </p>
      <ul v-else class="channels-list" data-test="channels-list">
        <li v-for="id in openChannelIds" :key="id" class="channels-item">
          {{ SELLING_CHANNEL_LABELS[id] }}
        </li>
      </ul>
    </section>

    <section class="panel cash-register" data-test="cash-register">
      <h3>Cash register</h3>
      <p class="lead">
        The shop's own sheets, a week to a page. Rent, wages and machine hire keep the doors open;
        they belong to no car, so they are written here and nowhere else.
      </p>

      <p v-if="weeks.length === 0" class="empty" data-test="cost-sheet-empty">
        Nothing has been through the till yet. There will be a sheet here the first week money
        moves.
      </p>

      <ol v-else class="sheets">
        <li
          v-for="week in weeks"
          :key="week.weekNumber"
          class="sheet"
          :data-test="'cost-sheet-week-' + week.weekNumber"
        >
          <div class="clip" aria-hidden="true"></div>
          <header class="sheet-head">
            <h4>Week {{ week.weekNumber }}</h4>
            <p class="days">
              Days {{ week.firstDay }} to {{ week.lastDay }}
              <span v-if="week.open" class="open" data-test="week-open">- still running</span>
            </p>
          </header>

          <dl class="rows">
            <div class="row">
              <dt>Money in</dt>
              <dd data-test="row-income">{{ formatYen(week.incomeYen) }}</dd>
            </div>
            <div class="row">
              <dt>On cars</dt>
              <dd data-test="row-on-cars">{{ formatYen(week.onCarsYen) }}</dd>
            </div>
            <div class="row">
              <dt>Parts on the shelf</dt>
              <dd data-test="row-stock">{{ formatYen(week.stockYen) }}</dd>
            </div>
            <div class="row">
              <dt>Running the shop</dt>
              <dd data-test="row-running">{{ formatYen(week.runningYen) }}</dd>
            </div>
            <div class="row">
              <dt>Into the shop</dt>
              <dd data-test="row-investment">{{ formatYen(week.investmentYen) }}</dd>
            </div>
            <div class="row net">
              <dt>{{ week.open ? 'So far' : 'Left over' }}</dt>
              <dd :class="{ down: week.netYen < 0 }" data-test="row-net">
                {{ formatYenDelta(week.netYen) }}
              </dd>
            </div>
          </dl>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.office {
  max-width: 640px;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.lead,
.hint,
.empty {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.lead strong,
.next strong {
  color: var(--mg-neon-cyan);
}

.next {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.phone-link {
  color: var(--mg-neon-cyan);
  text-decoration: underline;
  text-underline-offset: 3px;
  font-size: var(--mg-fs-sm);
}

.channels-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 2px;
}

.channels-item {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.scenes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.scene {
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.scene-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.scene-name {
  color: var(--mg-text);
}

.scene-stage {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  text-align: right;
}

.scene-empty {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.scene-cars {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-1) 0 0;
  display: grid;
  gap: 2px;
}

.scene-car {
  display: flex;
  justify-content: space-between;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.scene-car-price {
  color: var(--mg-yen);
}

.commission,
.operation {
  margin-top: var(--mg-space-2);
  padding-top: var(--mg-space-2);
  border-top: var(--mg-border);
}

.commission-brief {
  margin: 0 0 var(--mg-space-1);
  font-size: var(--mg-fs-sm);
}

.commission-delivery {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-1);
}

.commission-select {
  background: var(--mg-bg);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  color: var(--mg-text);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1);
}

.commission-btn {
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  color: var(--mg-neon-cyan);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
  cursor: pointer;
}

.commission-btn:disabled {
  color: var(--mg-text-dim);
  cursor: not-allowed;
}

.commission-lines {
  list-style: none;
  margin: var(--mg-space-1) 0 0;
  padding: 0;
  font-size: var(--mg-fs-sm);
  color: var(--mg-yen);
}

.commission-lines .pass {
  color: var(--mg-success);
}

.operation-name {
  margin: 0;
  color: var(--mg-neon-cyan);
}

.operation-note,
.operation-locked,
.operation-unlocked {
  margin: var(--mg-space-1) 0 0;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.operation-unlocked {
  color: var(--mg-success);
}

.office-readouts {
  display: grid;
  gap: var(--mg-space-1);
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.office-readouts dt {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.office-readouts dd {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text);
}

.wall-calendar-head {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-1);
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text);
}

.wall-calendar-era {
  color: var(--mg-text-dim);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wall-calendar-grid {
  display: grid;
  gap: 2px;
  max-width: 170px;
}

.wall-calendar-week {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px;
}

.wall-calendar-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: var(--mg-border);
  border-radius: 2px;
  font-size: 0.6rem;
  color: var(--mg-text-dim);
}

.wall-calendar-cell.today {
  background: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  color: var(--mg-bg);
  font-weight: bold;
}

/* The cash register's own sheets, a carbon copy on a clipboard: ruled lines
   under the figures, older copies showing as edges behind the top sheet. */
.cash-register .sheets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-4);
}

.cash-register .sheet {
  position: relative;
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(var(--mg-space-4) - 1px),
      var(--mg-panel-edge) calc(var(--mg-space-4) - 1px),
      var(--mg-panel-edge) var(--mg-space-4)
    ),
    var(--mg-panel);
  border: var(--mg-border);
  border-radius: 2px;
  padding: var(--mg-space-4) var(--mg-space-3) var(--mg-space-3);
  box-shadow:
    3px 3px 0 -1px var(--mg-night),
    4px 4px 0 -1px var(--mg-panel-edge),
    7px 7px 0 -2px var(--mg-night);
}

.cash-register .clip {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 72px;
  height: 12px;
  background: var(--mg-panel-edge);
  border: var(--mg-border);
  border-radius: 2px;
}

.cash-register .sheet-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  border-bottom: 2px solid var(--mg-panel-edge);
  padding-bottom: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
}

.cash-register .sheet-head h4 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cash-register .days {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cash-register .open {
  color: var(--mg-neon-cyan);
}

.cash-register .rows {
  margin: 0;
}

.cash-register .row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-3);
  height: var(--mg-space-4);
}

.cash-register .row dt {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.cash-register .row dd {
  margin: 0;
  color: var(--mg-yen);
  font-variant-numeric: tabular-nums;
}

.cash-register .row.net {
  border-top: 2px solid var(--mg-panel-edge);
  margin-top: var(--mg-space-2);
  padding-top: var(--mg-space-2);
  height: auto;
}

.cash-register .row.net dt {
  color: var(--mg-neon-violet);
}

.cash-register .row.net dd.down {
  color: var(--mg-danger);
}
</style>
