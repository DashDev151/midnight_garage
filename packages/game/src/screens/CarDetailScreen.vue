<script setup lang="ts">
import type { Slot, Zone } from '@midnight-garage/content'
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

const ZONES: readonly Zone[] = ['engine', 'drivetrain', 'suspension', 'body', 'interior']
const SLOTS: readonly Slot[] = [
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'bodyAero',
  'wheelsInterior',
]

function zoneBusy(zone: Zone): boolean {
  const d = detail.value
  if (!d) return false
  const inProgress = d.jobs.some((j) => j.kind === 'repair-zone' && j.zone === zone)
  const queued = d.pendingJobs.some((j) => j.kind === 'repair-zone' && j.zone === zone)
  return inProgress || queued
}

function installFor(slot: Slot) {
  return detail.value ? game.installablePartsFor(detail.value.car.id, slot) : []
}

/**
 * Resolve a customer job immediately (paid if the work's done, forfeited with a
 * reputation hit if not). The car then leaves the shop, so the detail computed
 * goes undefined and the watcher above returns us to the garage.
 */
function onCompleteJob(jobId: string): void {
  game.completeServiceJob(jobId)
}

const walkIn = computed(() => game.walkInEstimate(carId.value))
const listPrice = computed(() => game.listingEstimate(carId.value))
const sellQueued = computed(() => {
  const id = carId.value
  const walkInQueued = game.pending.sellViaWalkIn.some((a) => a.carInstanceId === id)
  const listQueued = game.pending.listForSale.some((a) => a.carInstanceId === id)
  return { walkIn: walkInQueued, list: listQueued, any: walkInQueued || listQueued }
})
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

      <div class="zones-col">
        <h3>Condition</h3>
        <ul class="zones">
          <li v-for="zone in ZONES" :key="zone">
            <span class="zone-name">{{ zone }}</span>
            <span class="bar"
              ><span class="fill" :style="{ width: detail.car.condition[zone] + '%' }"
            /></span>
            <span class="zone-val">{{ detail.car.condition[zone] }}</span>
            <button
              :disabled="zoneBusy(zone) || detail.car.condition[zone] >= 100"
              :data-test="'repair-' + zone"
              @click="game.queueRepair(detail.car.id, zone)"
            >
              Repair
            </button>
          </li>
        </ul>
      </div>
    </div>

    <section class="build">
      <h3>Build sheet</h3>
      <ul class="slots">
        <li v-for="slot in SLOTS" :key="slot">
          <span class="slot-name">{{ slot }}</span>
          <template v-if="detail.car.buildSheet[slot]">
            <span class="installed">{{ game.partName(detail.car.buildSheet[slot]!.partId) }}</span>
          </template>
          <template v-else>
            <span v-if="installFor(slot).length === 0" class="slot-empty">empty</span>
            <span v-else class="slot-install">
              <button
                v-for="pi in installFor(slot)"
                :key="pi.id"
                :data-test="'install-' + slot"
                @click="game.queueInstall(detail.car.id, slot, pi.id)"
              >
                install {{ game.partName(pi.partId) }}
              </button>
            </span>
          </template>
        </li>
      </ul>
    </section>

    <section v-if="!detail.serviceJob" class="sell">
      <h3>Sell</h3>
      <div class="sell-options">
        <div class="sell-option">
          <span class="sell-label">Walk-in (today)</span>
          <span class="sell-est">
            ~{{ formatYen(walkIn.offerYen)
            }}<span v-if="walkIn.buyerId"> · {{ walkIn.buyerId }}</span>
          </span>
          <button
            :disabled="sellQueued.any"
            data-test="sell-walkin"
            @click="game.queueSellWalkIn(detail.car.id)"
          >
            {{ sellQueued.walkIn ? 'queued' : 'Sell now' }}
          </button>
        </div>
        <div class="sell-option">
          <span class="sell-label">List publicly</span>
          <span class="sell-est">asking {{ formatYen(listPrice) }}</span>
          <button
            :disabled="sellQueued.any"
            data-test="sell-list"
            @click="game.queueListForSale(detail.car.id)"
          >
            {{ sellQueued.list ? 'queued' : 'List' }}
          </button>
        </div>
      </div>
    </section>

    <section class="jobs">
      <h3>Work</h3>
      <p class="labor">Labor: {{ game.laborSlotsPerDay }} slots/day</p>

      <div v-if="detail.pendingJobs.length" class="job-group">
        <h4>Queued for today</h4>
        <ul>
          <li v-for="(job, i) in detail.pendingJobs" :key="i">
            {{ job.kind === 'repair-zone' ? 'repair ' + job.zone : 'install part' }} ·
            {{ job.laborSlotsRequired }} slots
          </li>
        </ul>
      </div>

      <div v-if="detail.jobs.length" class="job-group">
        <h4>In progress</h4>
        <ul>
          <li v-for="job in detail.jobs" :key="job.id">
            {{ job.kind === 'repair-zone' ? 'repair ' + job.zone : 'install part' }} ·
            {{ job.laborSlotsSpent }}/{{ job.laborSlotsRequired }} slots
          </li>
        </ul>
      </div>

      <p v-if="!detail.pendingJobs.length && !detail.jobs.length" class="empty">
        No work queued. Queue a repair or install, then End Day.
      </p>

      <button class="primary" data-test="end-day" @click="game.commitDay()">
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

.zones {
  list-style: none;
  padding: 0;
  margin: 0;
}

.zones li {
  display: grid;
  grid-template-columns: 90px 1fr 32px auto;
  align-items: center;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
}

.zone-name {
  text-transform: capitalize;
  font-size: var(--mg-fs-sm);
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

.zone-val {
  font-size: var(--mg-fs-sm);
  text-align: right;
}

.slots {
  list-style: none;
  padding: 0;
  margin: 0;
}

.slots li {
  display: flex;
  gap: var(--mg-space-3);
  align-items: center;
  padding: var(--mg-space-1) 0;
  border-bottom: var(--mg-border);
  font-size: var(--mg-fs-sm);
}

.slot-name {
  width: 130px;
  color: var(--mg-text-dim);
  text-transform: capitalize;
}

.slot-empty {
  color: var(--mg-text-dim);
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
