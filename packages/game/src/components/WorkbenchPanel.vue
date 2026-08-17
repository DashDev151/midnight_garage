<script setup lang="ts">
import type { ConditionBand } from '@midnight-garage/content'
import { computed } from 'vue'
import BandChip from './BandChip.vue'
import HelpHint from './HelpHint.vue'
import WorkStationTray from './WorkStationTray.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { benchIdleReason, type BenchIdleReason } from '../screens/workshopFloor'

/**
 * The workbench, opened in place on the garage screen: one bench, one part on
 * it, and the rung of repair that part is next owed. Nothing gates the bench
 * itself - putting a part right is the basic work of the shop and the bench is
 * open from the first day; only the group's own tool tier decides how far a
 * rung climbs.
 */
const game = useGameStore()

const bench = computed(() => game.stationPart('workbench'))

/** The next single rung, priced and laboured off the real quote. */
const step = computed(() =>
  bench.value ? game.nextReconditionStep(bench.value.instance.id) : null,
)

/** Named where the shop's own tools stop short of mint, so a part that has run
 * out of rungs says which machine buys the last one. */
const ceilingCaption = computed(() =>
  bench.value ? game.benchRepairCeilingCaption(bench.value.instance.id) : null,
)

/** The bench's outright refusal for the held part - today only body work (a
 * zone panel belongs to the body shop) - stated on the fixed control rather
 * than leaving it silently dead. */
const workRefusal = computed(() =>
  bench.value ? game.benchWorkRefusal(bench.value.instance.id) : null,
)

const idleReason = computed<BenchIdleReason | null>(() => {
  const held = bench.value
  if (!held || step.value || ceilingCaption.value || workRefusal.value) return null
  return benchIdleReason({
    band: held.instance.band,
    repairable: game.isPartRepairable(held.part.carPartId),
  })
})

const IDLE_COPY: Readonly<Record<BenchIdleReason, string>> = {
  scrap: 'Scrap. Past putting right; sell it for what the metal is worth.',
  'replace-only': 'Nothing to rebuild on one of these. Take it off and fit a new one.',
  mint: 'Mint. Nothing left to put right.',
}

const noLabourLeft = computed(() => game.laborSlotsRemainingToday <= 0)

/**
 * The repair control's own band chip: the next rung's target while one is
 * on offer, the part's own band once there is nowhere left to climb - so the
 * chip is always showing something true and the control never goes blank.
 */
const targetBand = computed<ConditionBand | null>(
  () => step.value?.targetBand ?? bench.value?.instance.band ?? null,
)

/**
 * Why the fixed control is disabled, when it is. The control itself never
 * swaps for a different element over this - it stays put and states the
 * reason, the same way a refused control does everywhere else in the shop.
 */
const disabledReason = computed<string | null>(() => {
  if (!bench.value) return null
  if (workRefusal.value) return workRefusal.value
  if (step.value) return noLabourLeft.value ? 'No labour left today' : null
  if (ceilingCaption.value) return ceilingCaption.value
  if (idleReason.value) return IDLE_COPY[idleReason.value]
  return null
})

const repairDisabled = computed(() => !step.value || noLabourLeft.value)

function onRepairClick(): void {
  const held = bench.value
  const rung = step.value
  if (held && rung) game.reconditionPart(held.instance.id, rung.targetBand)
}
</script>

<template>
  <section class="workbench-panel" data-test="workbench-panel">
    <header class="head">
      <h4>
        Workbench
        <HelpHint label="Workbench">
          Put one part right at a time. Comes from the warehouse, goes back when done.
        </HelpHint>
      </h4>
    </header>

    <WorkStationTray station="workbench" />

    <section v-if="bench" class="panel" data-test="workshop-floor-part">
      <h5>{{ game.carPartLabel(bench.part.carPartId) }}</h5>
      <p class="figure" data-test="workshop-floor-fitted">
        {{ bench.part.brand }} {{ bench.part.name }}, {{ bench.part.grade }} grade,
        {{ bench.instance.band }}.
      </p>

      <div class="repair-row">
        <button
          type="button"
          class="repair-btn"
          :disabled="repairDisabled"
          :title="disabledReason ?? undefined"
          data-test="workshop-floor-repair"
          @click="onRepairClick"
        >
          Repair
        </button>
        <BandChip v-if="targetBand" :band="targetBand" data-test="workshop-floor-target-band" />
        <span v-if="step" class="repair-figures" data-test="workshop-floor-figures">
          {{ formatYen(step.costYen) }} &middot; {{ step.laborSlotsRequired }} labour
        </span>
      </div>

      <p v-if="workRefusal" class="note" data-test="workshop-floor-body-work">
        {{ workRefusal }}
      </p>

      <p v-if="ceilingCaption" class="note" data-test="workshop-floor-ceiling">
        {{ ceilingCaption }}
      </p>

      <p v-if="idleReason" class="note" data-test="workshop-floor-idle">
        {{ IDLE_COPY[idleReason] }}
      </p>
    </section>
  </section>
</template>

<style scoped>
.workbench-panel {
  max-width: 640px;
}

.head {
  margin: 0 0 var(--mg-space-3);
}

h4 {
  display: flex;
  align-items: center;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0;
}

h5 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-2);
  text-transform: capitalize;
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.figure,
.note {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The fixed repair control: same slot, same "Repair" label, whatever the
   part on the bench is doing - only the disabled state and the band chip
   beside it vary. */
.repair-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-1);
}

.repair-btn {
  flex: none;
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
  cursor: pointer;
}

.repair-btn:disabled {
  color: var(--mg-text-dim);
  cursor: not-allowed;
}

.repair-figures {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
