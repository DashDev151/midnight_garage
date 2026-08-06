<script setup lang="ts">
import {
  EngineCharacterSchema,
  PARTS_TAXONOMY,
  type CarPartId,
  type EngineCharacter,
  type MachiningOperation,
} from '@midnight-garage/content'
import type { MachiningGateReason, MachiningOfferRow } from '@midnight-garage/sim'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import WorkStationTray from '../components/WorkStationTray.vue'
import { MACHINE_SHOP_REFUSALS } from '../utils/machiningRefusals'
import { mapBackTarget } from './mapBack'
import { useGameStore } from '../stores/gameStore'

/**
 * The machine shop opens on a PART, not on a car: whatever is on the machine,
 * and every operation the shop would quote for it. No car is needed and none
 * is consulted - a block is carried here out of the warehouse and carried back
 * when the cutting is done.
 */
const game = useGameStore()
const route = useRoute()

const sheet = computed(() => game.machineShopSheet)

const backTarget = computed(() => mapBackTarget(route.query.from, { name: 'garage' }))

/** The taxonomy's own name for each slot, so the shop calls a block a block
 * and the internal id never reaches the bench. */
const SLOT_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.displayName]),
)

function slotLabel(carPartId: CarPartId): string {
  return SLOT_LABELS[carPartId] ?? carPartId
}

/** How each engine takes to the file. Machining is worth several times more on
 * a boosted engine than on a naturally aspirated one, and a part off the car
 * has no engine of its own yet, so the shop quotes all three. */
const CHARACTER_LABELS: Readonly<Record<EngineCharacter, string>> = {
  'high-strung-na': 'high-strung NA',
  'lazy-na': 'lazy NA',
  forced: 'boosted',
}

function refusal(reason: MachiningGateReason | null): string | null {
  return reason ? MACHINE_SHOP_REFUSALS[reason] : null
}

/** What an operation is worth on each engine character, as a share of that
 * engine's standard power. Several operations are worth a fraction of a per
 * cent on an aspirated engine, so this keeps two places rather than rounding
 * the lesson away. */
function powerLine(offer: MachiningOfferRow): string {
  return EngineCharacterSchema.options
    .map(
      (character) =>
        `${CHARACTER_LABELS[character]} +${(offer.powerFractionByCharacter[character] * 100).toFixed(2)} per cent`,
    )
    .join(', ')
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

function appliedNames(
  applied: readonly string[],
  offers: readonly { operation: MachiningOperation }[],
): string {
  return applied
    .map((id) => offers.find((offer) => offer.operation.id === id)?.operation.displayName ?? id)
    .join(', ')
}

function onMachineClick(operationId: string): void {
  const partInstanceId = sheet.value?.partInstanceId
  if (partInstanceId) game.machinePart(partInstanceId, operationId)
}
</script>

<template>
  <section class="machine-shop">
    <RouterLink :to="backTarget" class="back" data-test="machine-shop-back">&lt; Back</RouterLink>

    <header class="head">
      <h2>
        Machine shop
        <HelpHint label="Machine shop">
          Repairing a part puts it back the way it was. Buying one replaces it with something else.
          This takes metal off the part you already have, and the part stays the car's own. It costs
          no money once the tooling is bought, it costs labour, and every cut is permanent.
        </HelpHint>
      </h2>
    </header>

    <WorkStationTray station="machine" />

    <section v-if="sheet" class="panel" data-test="machine-shop-part">
      <h3>{{ slotLabel(sheet.carPartId) }}</h3>
      <p class="figure" data-test="machine-shop-fitted">
        {{ sheet.part.brand }} {{ sheet.part.name }}, {{ sheet.part.grade }} grade,
        {{ sheet.band }}.
      </p>
      <p v-if="sheet.applied.length" class="note" data-test="machine-shop-applied">
        Already done: {{ appliedNames(sheet.applied, sheet.offers) }}.
      </p>
      <p v-if="sheet.offers.length === 0" class="note" data-test="machine-shop-no-offers">
        Nothing this shop does to one of these.
      </p>

      <ul class="offers">
        <li
          v-for="offer in sheet.offers"
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
              {{ offer.applied ? 'Done' : 'Set it up' }}
            </button>
          </div>
          <p class="offer-note">{{ offer.operation.description }}</p>
          <ul class="figures">
            <li :data-test="'machine-shop-power-' + offer.operation.id">
              Power {{ powerLine(offer) }}
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

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.figure,
.note {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.offers,
.figures {
  list-style: none;
  margin: 0;
  padding: 0;
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
