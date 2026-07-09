<script setup lang="ts">
import type { ComponentId } from '@midnight-garage/content'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatRadar from '../components/StatRadar.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const carId = computed(() => String(route.params.id))
const detail = computed(() => game.carDetail(carId.value))

// A sold or unknown car has no detail - send the player back to the garage.
watch(
  detail,
  (d) => {
    if (!d) void router.replace({ name: 'garage' })
  },
  { immediate: true },
)

const COMPONENTS: readonly ComponentId[] = [
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'wheels',
  'body',
  'interior',
]

/** True while a repair or install job is open against this component (either kind, either busy). */
function componentBusy(componentId: ComponentId): boolean {
  const d = detail.value
  if (!d) return false
  return d.jobs.some((j) => j.componentId === componentId)
}

function installFor(componentId: ComponentId) {
  return detail.value ? game.installablePartsFor(detail.value.car.id, componentId) : []
}

/** The equipment item covering this component, if the catalog has one (Sprint 13). */
function equipmentFor(componentId: ComponentId) {
  return game.equipmentCatalog.find((e) => e.componentIds.includes(componentId))
}

/**
 * Resolve a customer job immediately (paid if the work's done, forfeited with a
 * reputation hit if not). The car then leaves the shop, so the detail computed
 * goes undefined and the watcher above returns us to the garage.
 */
function onCompleteJob(jobId: string): void {
  game.completeServiceJob(jobId)
}

/** Move this car between parking and the service bay — instant, free. */
function toggleBay(): void {
  const d = detail.value
  if (!d) return
  game.moveCar(d.car.id, d.inServiceBay ? 'parking' : 'service')
}

const walkIn = computed(() => game.walkInEstimate(carId.value))
const listPrice = computed(() => game.listingEstimate(carId.value))
</script>

<template>
  <section v-if="detail" class="detail">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>

    <header class="head">
      <h2>{{ detail.displayName }}</h2>
      <p class="sub">
        {{ detail.model.tier }} · {{ detail.car.year }} ·
        {{ detail.car.mileageKm.toLocaleString() }} km ·
        {{ detail.car.color }}
      </p>
      <p v-if="detail.car.provenanceNote" class="prov">"{{ detail.car.provenanceNote }}"</p>
    </header>

    <div class="bay-status">
      <span class="bay-loc" :class="{ inBay: detail.inServiceBay }">
        {{ detail.inServiceBay ? 'In the service bay' : 'Parked' }}
      </span>
      <span v-if="!detail.inServiceBay" class="bay-hint">no work progresses until moved in</span>
      <button
        :disabled="!detail.inServiceBay && game.serviceBayFreeCount <= 0"
        data-test="toggle-bay"
        @click="toggleBay"
      >
        {{ detail.inServiceBay ? 'Move to parking' : 'Move to service bay' }}
      </button>
    </div>

    <section v-if="detail.serviceJob" class="service-banner">
      <h3>Customer job — {{ detail.serviceJob.customerName }}</h3>
      <p class="svc-desc">"{{ detail.serviceJob.description }}"</p>
      <p class="svc-req">
        Required: {{ detail.serviceJob.workLabel }} · pays
        {{ formatYen(detail.serviceJob.payoutYen) }} · +{{ detail.serviceJob.baseReputation }} rep
        base
      </p>
      <p
        v-if="detail.serviceJob.daysLeft !== null"
        class="svc-deadline"
        :class="{ urgent: detail.serviceJob.daysLeft <= 2 }"
      >
        {{
          detail.serviceJob.daysLeft <= 0
            ? 'Due today — hand it back or it fails on End Day.'
            : detail.serviceJob.daysLeft + ' day(s) left to finish and hand back.'
        }}
      </p>
      <div class="complete-row">
        <span class="svc-status" :class="{ done: detail.serviceJob.workDone }">
          {{
            detail.serviceJob.workDone
              ? 'Work done — hand it back to get paid now.'
              : 'Work unfinished — completing now forfeits the job (−' +
                detail.serviceJob.failureReputationPenalty +
                ' rep).'
          }}
        </span>
        <button
          class="primary"
          :class="{ danger: !detail.serviceJob.workDone }"
          data-test="complete-service-job"
          @click="onCompleteJob(detail.serviceJob.id)"
        >
          {{ detail.serviceJob.workDone ? 'Complete Job' : 'Give Up Job' }}
        </button>
      </div>
    </section>

    <div class="cols">
      <div class="radar-col">
        <StatRadar :stats="detail.stats" />
      </div>

      <div class="components-col">
        <h3>Components</h3>
        <ul class="components">
          <li v-for="componentId in COMPONENTS" :key="componentId" class="component-row">
            <span class="component-name">{{ componentId }}</span>
            <span class="bar"
              ><span
                class="fill"
                :style="{ width: detail.car.components[componentId].condition + '%' }"
            /></span>
            <span class="component-val">{{ detail.car.components[componentId].condition }}</span>
            <button
              :disabled="
                detail.car.components[componentId].condition >= 100 ||
                game.laborSlotsRemainingToday <= 0 ||
                !game.hasEquipmentForComponent(componentId)
              "
              :data-test="'repair-' + componentId"
              @click="game.repair(detail.car.id, componentId)"
            >
              {{ componentBusy(componentId) ? 'Continue repair' : 'Repair' }}
            </button>
            <span
              v-if="
                detail.car.components[componentId].condition < 100 &&
                !game.hasEquipmentForComponent(componentId)
              "
              class="equip-hint"
            >
              needs {{ equipmentFor(componentId)?.displayName ?? 'equipment' }}
            </span>
            <template v-if="detail.car.components[componentId].installed">
              <span class="installed">{{
                game.partName(detail.car.components[componentId].installed?.partId ?? '')
              }}</span>
            </template>
            <template v-else-if="componentBusy(componentId)">
              <span class="slot-empty">installing…</span>
            </template>
            <template v-else>
              <span v-if="installFor(componentId).length === 0" class="slot-empty">empty</span>
              <span v-else class="slot-install">
                <button
                  v-for="pi in installFor(componentId)"
                  :key="pi.id"
                  :disabled="game.laborSlotsRemainingToday <= 0"
                  :data-test="'install-' + componentId"
                  @click="game.install(detail.car.id, componentId, pi.id)"
                >
                  install {{ game.partName(pi.partId) }}
                </button>
              </span>
            </template>
          </li>
        </ul>
      </div>
    </div>

    <section v-if="!detail.serviceJob" class="sell">
      <h3>Sell</h3>
      <div class="sell-options">
        <div class="sell-option">
          <span class="sell-label">Walk-in (today)</span>
          <span class="sell-est">
            ~{{ formatYen(walkIn.offerYen)
            }}<span v-if="walkIn.buyerId"> · {{ walkIn.buyerId }}</span>
          </span>
          <button data-test="sell-walkin" @click="game.sellWalkIn(detail.car.id)">Sell now</button>
        </div>
        <div class="sell-option">
          <span class="sell-label">List publicly</span>
          <span class="sell-est">asking {{ formatYen(listPrice) }}</span>
          <button data-test="sell-list" @click="game.listForSale(detail.car.id)">List</button>
        </div>
      </div>
    </section>

    <section class="jobs">
      <h3>Work</h3>
      <p class="labor">
        Labor: {{ game.laborSlotsRemainingToday }}/{{ game.laborSlotsPerDay }} slots left today
      </p>

      <div v-if="detail.jobs.length" class="job-group">
        <h4>In progress</h4>
        <ul>
          <li v-for="job in detail.jobs" :key="job.id">
            {{ job.kind === 'repair-zone' ? 'repair ' + job.componentId : 'install part' }} ·
            {{ job.laborSlotsSpent }}/{{ job.laborSlotsRequired }} slots
          </li>
        </ul>
      </div>

      <p v-else class="empty">No work in progress. Repair a zone or install a part to start.</p>

      <button class="primary" data-test="end-day" @click="game.endDay()">
        End Day ({{ formatYen(game.cashYen) }})
      </button>
    </section>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-cyan);
  margin: var(--mg-space-2) 0 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
}

h4 {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-2) 0 var(--mg-space-1);
}

.sub,
.prov {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0;
}

.bay-status {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  margin: var(--mg-space-2) 0;
}

.bay-loc {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.bay-loc.inBay {
  color: var(--mg-success);
}

.bay-hint {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.bay-status button {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
}

.service-banner {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin: var(--mg-space-3) 0;
}

.svc-desc {
  margin: var(--mg-space-1) 0;
}

.svc-req {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0 var(--mg-space-2);
}

.complete-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.svc-status {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.svc-status.done {
  color: var(--mg-success);
}

.svc-deadline {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0 var(--mg-space-2);
}

.svc-deadline.urgent {
  color: var(--mg-neon-pink);
}

button.primary.danger {
  background: var(--mg-panel);
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}

.cols {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 2fr;
  gap: var(--mg-space-4);
  margin: var(--mg-space-4) 0;
}

.components {
  list-style: none;
  padding: 0;
  margin: 0;
}

.component-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
  padding-bottom: var(--mg-space-2);
  border-bottom: var(--mg-border);
}

.component-name {
  width: 110px;
  flex-shrink: 0;
  text-transform: capitalize;
  font-size: var(--mg-fs-sm);
}

.component-row .bar {
  flex: 1 1 80px;
  min-width: 60px;
}

.sell-options {
  display: flex;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.sell-option {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.sell-label {
  font-size: var(--mg-fs-sm);
}

.sell-est {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.bar {
  height: 10px;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  background: var(--mg-neon-cyan);
}

.component-val {
  font-size: var(--mg-fs-sm);
  text-align: right;
  width: 28px;
  flex-shrink: 0;
}

.slot-install {
  display: flex;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

.slot-empty {
  color: var(--mg-text-dim);
}

.equip-hint {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.installed {
  color: var(--mg-neon-cyan);
}

.labor {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
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
