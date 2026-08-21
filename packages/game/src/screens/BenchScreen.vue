<script setup lang="ts">
import {
  BenchIdSchema,
  TOOL_SHOPS,
  WORKBENCH,
  type BenchId,
  type ConditionBand,
  type RepairJobKind,
} from '@midnight-garage/content'
import { energyPlanFor, type RepairJobCard, type RepairStepRefusal } from '@midnight-garage/sim'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import BenchSurface from '../components/BenchSurface.vue'
import ShadowBoard from '../components/ShadowBoard.vue'
import StepStrip from '../components/StepStrip.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

/**
 * One bench: the shadow board of its tools across the top, the parts laid out
 * on it below, and the job the selected part is having done to it.
 *
 * Every rule lives behind `benchView` and the sim's job cards - what a tool
 * chip reads, which jobs a part is offered, what a step costs and whether it
 * runs. This screen picks which part and which job are in front of the player,
 * words the store's answers, and forwards the click that works a step.
 */

const game = useGameStore()
const route = useRoute()
const router = useRouter()

/** The route's bench, or null for anything that is not one of the three. */
const benchId = computed<BenchId | null>(() => {
  const raw = String(route.params.benchId)
  return (BenchIdSchema.options as readonly string[]).includes(raw) ? (raw as BenchId) : null
})

const view = computed(() => (benchId.value ? game.benchView(benchId.value) : null))

// A bench that does not exist has nothing to show - back to the garage.
watch(
  view,
  (current) => {
    if (!current) void router.replace({ name: 'garage' })
  },
  { immediate: true },
)

/** The shop that opens the room behind a bench, by name. All of a bench's
 * lines are covered by the same shop, so one name answers for the bench. */
function shopNameForBench(id: BenchId): string {
  return (
    TOOL_SHOPS.find((shop) => shop.covers.some((group) => WORKBENCH.benchByGroup[group] === id))
      ?.displayName ?? ''
  )
}

const shopName = computed(() => (benchId.value ? shopNameForBench(benchId.value) : ''))

// --- the part in hand -----------------------------------------------------

const selectedInstanceId = ref<string | null>(null)

/** The selected part, or null - including once whatever was selected has left
 * the bench. */
const selectedPart = computed(
  () => view.value?.surface.find((part) => part.instanceId === selectedInstanceId.value) ?? null,
)

function onSelectPart(partInstanceId: string): void {
  selectedInstanceId.value = partInstanceId
}

function onReturnPart(partInstanceId: string): void {
  game.takeOffBench(partInstanceId)
  if (selectedInstanceId.value === partInstanceId) selectedInstanceId.value = null
}

// --- the job in front of the player ---------------------------------------

const JOB_LABELS: Readonly<Record<RepairJobKind, string>> = {
  service: 'Service',
  rebuild: 'Rebuild',
  restore: 'Restore',
}

const cards = computed<RepairJobCard[]>(() => selectedPart.value?.cards ?? [])

/** The job the bench is already part-way through, else the first one on
 * offer, in ladder order. */
const defaultKind = computed<RepairJobKind | null>(() => {
  const started = cards.value.find((card) => card.stepsDone > 0)
  if (started) return started.kind
  return cards.value.find((card) => card.offered)?.kind ?? null
})

/** The player's own pick, which holds until that job stops being on offer -
 * finishing a Service drops back to whatever is next. */
const manualKind = ref<RepairJobKind | null>(null)

const selectedKind = computed<RepairJobKind | null>(() => {
  const manual = cards.value.find((card) => card.kind === manualKind.value)
  return manual?.offered ? manual.kind : defaultKind.value
})

const selectedCard = computed<RepairJobCard | null>(
  () => cards.value.find((card) => card.kind === selectedKind.value) ?? null,
)

/** The machine a card is short of, named by the step that wants it. */
function machineLabelFor(card: RepairJobCard): string {
  return card.steps[0]?.toolLabel ?? ''
}

function tabTooltip(card: RepairJobCard): string {
  if (!card.offered) {
    if (card.refusal === 'needs-shop') return `needs the ${shopName.value}`
    if (card.refusal === 'at-or-above-target') return 'already there'
    return ''
  }
  if (card.route === 'locked') {
    if (card.lockedReason === 'needs-shop') return `needs the ${shopName.value}`
    if (card.lockedReason === 'needs-machine') return `needs the ${machineLabelFor(card)}`
  }
  return ''
}

interface JobTabView {
  kind: RepairJobKind
  label: string
  targetBand: ConditionBand
  disabled: boolean
  tooltip: string
  selected: boolean
}

const jobTabs = computed<JobTabView[]>(() =>
  cards.value.map((card) => ({
    kind: card.kind,
    label: JOB_LABELS[card.kind],
    targetBand: card.targetBand,
    disabled: !card.offered || card.route === 'locked',
    tooltip: tabTooltip(card),
    selected: card.kind === selectedKind.value,
  })),
)

function onSelectKind(kind: RepairJobKind): void {
  manualKind.value = kind
}

// --- the step the bench is on ---------------------------------------------

/** The step being worked right now: the first of the card's remaining steps. */
const currentStep = computed(() => selectedCard.value?.steps[0] ?? null)

const currentToolId = computed<string | null>(() => currentStep.value?.tool ?? null)
const currentSlogged = computed(() => currentStep.value?.slogged ?? false)

const SLOG_SUFFIX = 'x3, no proper tool'

/** What each step of the selected job costs right now - the sim's own plan,
 * which already carries the slog multiplier, the crew and the lift. */
const energyPlan = computed<number[]>(() => {
  const part = selectedPart.value
  const kind = selectedKind.value
  if (!part || !kind) return []
  return energyPlanFor(
    game.gameState,
    game.context,
    { kind: 'loose', partInstanceId: part.instanceId },
    kind,
  )
})

const energyText = computed<string>(() => {
  const card = selectedCard.value
  const step = currentStep.value
  if (!card || !step) return ''
  const points = energyPlan.value[card.stepsDone]
  if (points === undefined) return ''
  return step.slogged ? `${points} energy ${SLOG_SUFFIX}` : `${points} energy`
})

// --- working it -----------------------------------------------------------

const refusal = ref<RepairStepRefusal | null>(null)

// A different part is a different job list: the pick and any note about it
// start again.
watch(selectedInstanceId, () => {
  manualKind.value = null
  refusal.value = null
})

watch(selectedKind, () => {
  refusal.value = null
})

const refusalNote = computed<string>(() => {
  const reason = refusal.value
  const card = selectedCard.value
  if (!reason || !card) return ''
  if (reason === 'no-energy') return 'Not enough left in the day.'
  if (reason === 'no-cash')
    return `The parts bill wants ${formatYen(card.partsYen)} you don't have.`
  if (reason === 'needs-machine') {
    return `Needs the ${machineLabelFor(card)}. No way round a weld.`
  }
  if (reason === 'needs-shop') return `That grade of work needs the ${shopName.value}.`
  return ''
})

function onRunStep(): void {
  const part = selectedPart.value
  const kind = selectedKind.value
  if (!part || !kind) return
  const outcome = game.runRepairStep({ kind: 'loose', partInstanceId: part.instanceId }, kind)
  refusal.value = typeof outcome === 'object' ? outcome.refused : null
}
</script>

<template>
  <section v-if="view" class="bench-screen">
    <h2>{{ view.displayName }}</h2>

    <ShadowBoard
      :zones="view.zones"
      :room-open="view.roomOpen"
      :current-tool-id="currentToolId"
      :current-slogged="currentSlogged"
      @run-step="onRunStep"
    />

    <BenchSurface
      :parts="view.surface"
      :selected-instance-id="selectedInstanceId"
      @select="onSelectPart"
      @return-part="onReturnPart"
    />

    <section v-if="selectedPart" class="job-panel">
      <div class="job-tabs">
        <button
          v-for="tab in jobTabs"
          :key="tab.kind"
          type="button"
          class="job-tab"
          :class="{ 'job-tab-on': tab.selected }"
          :disabled="tab.disabled"
          :title="tab.tooltip || undefined"
          :data-test="'bench-job-' + tab.kind"
          @click="onSelectKind(tab.kind)"
        >
          <span class="job-tab-label">{{ tab.label }}</span>
          <BandChip :band="tab.targetBand" />
        </button>
      </div>

      <StepStrip
        v-if="selectedCard"
        :steps="selectedCard.steps"
        :steps-done="selectedCard.stepsDone"
        :energy-text="energyText"
      />

      <p class="bench-refusal" data-test="bench-refusal">{{ refusalNote }}</p>
    </section>
  </section>
</template>

<style scoped>
h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0 0 var(--mg-space-3);
}

.job-panel {
  margin-top: var(--mg-space-3);
  border: var(--mg-border);
  background: var(--mg-panel);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.job-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-1);
}

.job-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-2);
  padding: var(--mg-space-1) var(--mg-space-3);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 0;
  background: var(--mg-night);
  color: var(--mg-text-dim);
  font: inherit;
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

.job-tab-on {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
}

.job-tab:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.job-tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

.bench-refusal {
  margin: var(--mg-space-1) 0 0;
  min-height: 1.2em;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}
</style>
