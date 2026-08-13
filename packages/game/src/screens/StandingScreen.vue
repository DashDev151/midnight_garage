<script setup lang="ts">
import { CARS, type BuyerArchetype } from '@midnight-garage/content'
import type { MissionGradeReport } from '@midnight-garage/sim'
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import ProgressBar from '../components/ProgressBar.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { photoCountForReputationTier } from './officeDisplay'

/**
 * The one place the shop's granular
 * standing lives - exact reputation points with the named next tier, and
 * every scene's ledger. Progression bible law 4 permits exact numbers and a
 * progress bar for reputation on THIS view only; the scenes panel is a
 * different law again - a scene's stage is stated in words, never a bar, and
 * its car list is a receipt (the price a real delivery sold for), not a
 * progress readout. Everywhere else stays meter-free - nothing follows the
 * player around, nothing pops up mid-job. Pure renderer over
 * `game.standingView` - no local logic, no new state.
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

/** The office wall's three diegetic readouts: the photo wall stands in for
 * reputation (`officeDisplay.ts` scales the snapshot count off the tier the
 * game already carries), the corkboard note counts the live listings, and
 * the certificates are the craft operations the shop actually possesses.
 * All three read state computed elsewhere - no second source for any of
 * these numbers. */
const listingCount = computed(() => game.gameState.carsForSale.length)
const photoCount = computed(() => photoCountForReputationTier(game.reputationTier))
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
</script>

<template>
  <section class="standing">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <h2>Your standing</h2>

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
      </dl>
    </section>
  </section>
</template>

<style scoped>
.standing {
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

.lead {
  margin: 0 0 var(--mg-space-1);
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

.hint {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
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
</style>
