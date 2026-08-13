<script setup lang="ts">
import { computed } from 'vue'
import HelpHint from './HelpHint.vue'
import WorkStationTray from './WorkStationTray.vue'
import { useGameStore } from '../stores/gameStore'
import { repairStepText } from '../utils/repairStepLabels'
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

const idleReason = computed<BenchIdleReason | null>(() => {
  const held = bench.value
  if (!held || step.value || ceilingCaption.value) return null
  return benchIdleReason({
    band: held.instance.band,
    repairable: game.isPartRepairable(held.part.carPartId),
  })
})

const IDLE_COPY: Readonly<Record<BenchIdleReason, string>> = {
  scrap: 'Scrap. Past putting right; sell it for what the metal is worth.',
  'replace-only': 'Nothing to rebuild on one of these. It gets replaced, not repaired.',
  mint: 'Mint. Nothing left to put right.',
}

const noLabourLeft = computed(() => game.laborSlotsRemainingToday <= 0)

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
          The bench is where a part is put right. Take it off the car, fetch it out of the
          warehouse, and work it here. One part at a time, and it goes back into the warehouse when
          you are done with it.
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

      <button
        v-if="step"
        type="button"
        class="repair-btn"
        :disabled="noLabourLeft"
        :title="noLabourLeft ? 'No labour left today' : repairStepText(step)"
        data-test="workshop-floor-repair"
        @click="onRepairClick"
      >
        {{ repairStepText(step) }}
      </button>

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

.repair-btn {
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
</style>
