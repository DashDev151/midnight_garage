<script setup lang="ts">
import type { ConditionBand, RepairJobKind } from '@midnight-garage/content'
import type { RepairJobCard, RepairJobRoute } from '@midnight-garage/sim'
import { computed } from 'vue'
import { formatYen } from '../utils/formatYen'
import BandChip from './BandChip.vue'

/**
 * The job card: what each of the three jobs would leave the part at, what it
 * costs all in, and how its tools would be come by.
 *
 * It is a PRICE LIST. Nothing on it is clickable and it renders no buttons:
 * the player reads it, then decides on the tabs beside it. Every figure is the
 * sim's own - the panel sums the two halves of a total the card already
 * carries (the work plus the removal and refit around it; the parts bill plus
 * the day's hire) and words the route, and decides nothing.
 */

const props = defineProps<{
  /** The three cards for one target, in ladder order. */
  cards: RepairJobCard[]
  /** The display name of the shop covering the part's line, for the one route
   * that names it. */
  shopName: string
}>()

const JOB_LABELS: Readonly<Record<RepairJobKind, string>> = {
  service: 'Service',
  rebuild: 'Rebuild',
  restore: 'Restore',
}

const OWN_LABEL = 'own'
const HIRED_TODAY_LABEL = 'hired today'
const SLOG_LABEL = 'slog x3'

interface JobCardRow {
  kind: RepairJobKind
  label: string
  targetBand: ConditionBand
  costText: string
  route: RepairJobRoute
  routeText: string
}

/** The all-in figures: the remaining work plus the removal and refit around
 * it, and the parts bill plus whatever day-hire the route names. */
function costTextFor(card: RepairJobCard): string {
  const energy = card.energyPoints + card.removalEnergyPoints
  const yen = card.partsYen + (card.hireFeeYen ?? 0)
  return `${energy} energy · ${formatYen(yen)}`
}

/** The machine a locked card is short of, named by the step that wants it. */
function machineLabelFor(card: RepairJobCard): string {
  return card.steps[0]?.toolLabel ?? ''
}

function routeTextFor(card: RepairJobCard): string {
  if (card.route === 'own') return OWN_LABEL
  if (card.route === 'hired-today') return HIRED_TODAY_LABEL
  if (card.route === 'hire') return `hire ${formatYen(card.hireFeeYen ?? 0)}`
  if (card.route === 'slog') return SLOG_LABEL
  if (card.lockedReason === 'needs-machine') return `needs the ${machineLabelFor(card)}`
  return `needs the ${props.shopName}`
}

const rows = computed<JobCardRow[]>(() =>
  props.cards.map((card) => ({
    kind: card.kind,
    label: JOB_LABELS[card.kind],
    targetBand: card.targetBand,
    costText: costTextFor(card),
    route: card.route,
    routeText: routeTextFor(card),
  })),
)
</script>

<template>
  <ul class="job-cards">
    <li v-for="row in rows" :key="row.kind" class="job-card" :data-test="'job-card-' + row.kind">
      <span class="job-name">{{ row.label }}</span>
      <BandChip :band="row.targetBand" />
      <span class="job-cost" :data-test="'job-card-cost-' + row.kind">{{ row.costText }}</span>
      <span
        class="job-route"
        :class="'job-route-' + row.route"
        :data-test="'job-card-route-' + row.kind"
        >{{ row.routeText }}</span
      >
    </li>
  </ul>
</template>

<style scoped>
.job-cards {
  list-style: none;
  margin: 0;
  padding: 0;
}

.job-card {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
  padding: 1px 0;
  font-size: var(--mg-fs-sm);
}

.job-name {
  flex: none;
  width: 6em;
}

.job-cost {
  flex: 1 1 auto;
  color: var(--mg-text);
}

.job-route {
  flex: none;
}

/* The four routes that get the job done, and the one that does not. */
.job-route-own,
.job-route-hired-today {
  color: var(--mg-success);
}

.job-route-hire {
  color: var(--mg-yen);
}

.job-route-slog {
  color: var(--mg-neon-violet);
}

.job-route-locked {
  color: var(--mg-text-dim);
}
</style>
