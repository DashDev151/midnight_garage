<script setup lang="ts">
import {
  CARS,
  PARTS_TAXONOMY,
  type CarPartId,
  type MachiningOperation,
} from '@midnight-garage/content'
import type { MachiningGateReason } from '@midnight-garage/sim'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import { useGameStore } from '../stores/gameStore'
import { SUBSYSTEM_LABELS, SUBSYSTEM_MEANINGS } from '../utils/dynoLabels'

const game = useGameStore()

const sheet = computed(() => game.machineShopSheet)

/** The car on the ramp, by the name the player knows it as. */
const carName = computed(() => {
  const carId = sheet.value?.carId
  if (!carId) return null
  const car = game.gameState.ownedCars.find((owned) => owned.id === carId)
  return CARS.find((model) => model.id === car?.modelId)?.displayName ?? null
})

/** The taxonomy's own name for each slot, so the shop calls a block a block
 * and the internal id never reaches the bench. */
const SLOT_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.displayName]),
)

function slotLabel(carPartId: CarPartId): string {
  return SLOT_LABELS[carPartId] ?? carPartId
}

/** How each engine takes to the file. Machining is worth several times more on
 * a boosted engine than on a naturally aspirated one, and the player should
 * meet that as a fact about the engine rather than as a surprise. */
const CHARACTER_NOTE: Readonly<Record<string, string>> = {
  'high-strung-na':
    'Naturally aspirated and already wound up tight. The factory took most of what is in it, so what is left for the file is thin.',
  'lazy-na':
    'Naturally aspirated and lazy with it. There is more on the table here than a high-strung engine leaves, and it comes out of the castings.',
  forced:
    'Boosted. Machining is mostly what lets a boosted engine take more, which is why the same work is worth several times what it is worth on an aspirated one.',
}

const REFUSALS: Readonly<Record<MachiningGateReason, string>> = {
  'not-found': 'No car on the ramp.',
  'not-in-service-bay': 'It has to be in the service bay.',
  'tool-tier': 'Needs the machine-shop tooling on the engine line.',
  'unknown-operation': 'Not a job this shop does.',
  'slot-empty': 'Nothing fitted to work on.',
  'not-mint': 'Rebuild it to mint first. Nobody bores a worn block.',
  'already-applied': 'Already done, and it does not un-do.',
}

function refusal(reason: MachiningGateReason | null): string | null {
  return reason ? REFUSALS[reason] : null
}

/** One ratio to two places, matching the rolling road's own readout so the two
 * sheets never show the same number differently. */
function formatRatio(value: number): string {
  return value.toFixed(2)
}

/** PS to one place. Several operations are worth under a whole horsepower on
 * an aspirated engine, and rounding those to zero would hide the lesson. */
function formatPs(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} PS`
}

function formatSpec(value: number): string {
  return value > 0 ? `+${value.toFixed(2)}` : 'none'
}

function formatAuthenticity(value: number): string {
  return value > 0 ? `-${value}` : 'nothing'
}

function formatReliability(value: number): string {
  return `-${(value * 100).toFixed(1)} per cent`
}

const ratioRows = computed(() => {
  const reading = sheet.value
  if (!reading) return []
  return Object.entries(reading.ratios).map(([subsystem, ratio]) => ({
    subsystem,
    label: SUBSYSTEM_LABELS[subsystem as keyof typeof SUBSYSTEM_LABELS],
    meaning: SUBSYSTEM_MEANINGS[subsystem as keyof typeof SUBSYSTEM_MEANINGS],
    ratio,
    weakest: reading.verdict.subsystem === subsystem,
  }))
})

function appliedNames(
  applied: readonly string[],
  offers: readonly { operation: MachiningOperation }[],
): string {
  return applied
    .map((id) => offers.find((offer) => offer.operation.id === id)?.operation.displayName ?? id)
    .join(', ')
}

function onMachineClick(operationId: string): void {
  const carId = sheet.value?.carId
  if (carId) game.machinePart(carId, operationId)
}
</script>

<template>
  <section class="machine-shop">
    <RouterLink
      v-if="sheet"
      :to="{ name: 'car', params: { id: sheet.carId } }"
      class="back"
      data-test="machine-shop-back"
      >&lt; Back to the car</RouterLink
    >
    <RouterLink v-else :to="{ name: 'garage' }" class="back" data-test="machine-shop-back"
      >&lt; Garage</RouterLink
    >

    <header class="head">
      <h2>
        Machine shop
        <HelpHint label="Machine shop">
          Repairing a part puts it back the way it was. Buying one replaces it with something else.
          This takes metal off the part the car already has, and the part stays the car's own. It
          costs no money once the tooling is bought, it costs labour, and every cut is permanent.
        </HelpHint>
      </h2>
      <p v-if="carName" class="car-name" data-test="machine-shop-car-name">{{ carName }}</p>
    </header>

    <p v-if="!sheet" class="empty" data-test="machine-shop-empty">
      Put one car in the service bay and the bench has something to work on.
    </p>

    <template v-else>
      <section class="panel" data-test="machine-shop-engine">
        <h3>What you are working on</h3>
        <p class="headline" data-test="machine-shop-power">
          {{ sheet.powerPs }} PS, from {{ sheet.stockPowerPs }} PS standard
        </p>
        <p class="note" data-test="machine-shop-character">
          {{ CHARACTER_NOTE[sheet.engineCharacter] }}
        </p>
        <p class="figure" data-test="machine-shop-standing">
          Originality {{ sheet.authenticity }} of 100, reliability {{ sheet.reliabilityStat }}.
        </p>
      </section>

      <section class="panel" data-test="machine-shop-support">
        <h3>What holds it together</h3>
        <p class="figure">
          What each part of the car can give against what the build asks of it. Work bought on
          anything but the weakest of these changes nothing you can see.
        </p>
        <ul class="ratios">
          <li
            v-for="row in ratioRows"
            :key="row.subsystem"
            class="ratio-row"
            :class="{ weakest: row.weakest }"
            :data-test="'machine-shop-ratio-' + row.subsystem"
          >
            <span class="ratio-name">{{ row.label }}</span>
            <span class="ratio-meaning">{{ row.meaning }}</span>
            <span class="ratio-value">{{ formatRatio(row.ratio) }}</span>
            <span v-if="row.weakest" class="ratio-flag" data-test="machine-shop-weakest"
              >weakest link</span
            >
          </li>
        </ul>
      </section>

      <section
        v-for="slot in sheet.slots"
        :key="slot.carPartId"
        class="panel"
        :data-test="'machine-shop-slot-' + slot.carPartId"
      >
        <h3>{{ slotLabel(slot.carPartId) }}</h3>
        <p v-if="slot.part" class="figure" data-test="machine-shop-fitted">
          {{ slot.part.brand }} {{ slot.part.name }}, {{ slot.part.grade }} grade, {{ slot.band }}.
        </p>
        <p v-else class="figure" data-test="machine-shop-fitted">Nothing fitted.</p>
        <p v-if="slot.applied.length" class="note" data-test="machine-shop-applied">
          Already done: {{ appliedNames(slot.applied, slot.offers) }}.
        </p>

        <ul class="offers">
          <li
            v-for="offer in slot.offers"
            :key="offer.operation.id"
            class="offer"
            :class="{ done: offer.applied }"
            :data-test="'machine-shop-offer-' + offer.operation.id"
          >
            <div class="offer-head">
              <span class="offer-name">{{ offer.operation.displayName }}</span>
              <button
                type="button"
                class="offer-btn"
                :disabled="!!offer.gateReason"
                :title="refusal(offer.gateReason) ?? undefined"
                :data-test="'machine-shop-do-' + offer.operation.id"
                @click="onMachineClick(offer.operation.id)"
              >
                {{ offer.applied ? 'Done' : 'Put it on the bench' }}
              </button>
            </div>
            <p class="offer-note">{{ offer.operation.description }}</p>
            <ul class="figures">
              <li :data-test="'machine-shop-power-' + offer.operation.id">
                Power {{ formatPs(offer.powerPs) }}
              </li>
              <li>Support {{ formatSpec(offer.spec) }}</li>
              <li :data-test="'machine-shop-auth-' + offer.operation.id">
                Originality {{ formatAuthenticity(offer.authenticityCost) }}
              </li>
              <li>Reliability {{ formatReliability(offer.reliabilityCost) }}</li>
              <li>Labour {{ offer.labourPoints }} points</li>
            </ul>
            <p v-if="offer.gateReason" class="offer-refusal">{{ refusal(offer.gateReason) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.machine-shop {
  max-width: 640px;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.head {
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h2 {
  display: flex;
  align-items: center;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.car-name {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.headline {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-md);
}

.figure,
.note {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.ratios,
.offers,
.figures {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ratio-row {
  display: grid;
  /* The value column is fixed so every figure lines up down the strip, the
     way a printed sheet's would. */
  grid-template-columns: 1fr auto 4.5em;
  align-items: baseline;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  border-top: var(--mg-border);
  padding-top: var(--mg-space-1);
}

.ratio-meaning {
  color: var(--mg-text-dim);
}

.ratio-row.weakest .ratio-value {
  color: var(--mg-yen);
}

.ratio-flag {
  grid-column: 1 / -1;
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.offer {
  border-top: var(--mg-border);
  padding: var(--mg-space-2) 0 0;
  margin-bottom: var(--mg-space-2);
}

.offer.done .offer-name {
  color: var(--mg-text-dim);
}

.offer-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-2);
}

.offer-name {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-md);
}

.offer-btn {
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  color: var(--mg-neon-cyan);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
  cursor: pointer;
}

.offer-btn:disabled {
  color: var(--mg-text-dim);
  cursor: not-allowed;
}

.offer-note,
.offer-refusal {
  margin: var(--mg-space-1) 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.offer-refusal {
  color: var(--mg-yen);
}

/* Every figure an operation carries, on one line, so the trade is read at a
   glance rather than assembled from four places. */
.figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}
</style>
