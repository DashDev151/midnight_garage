<script setup lang="ts">
import { titleCaseFromSlug } from '@midnight-garage/content'
import {
  apparentViewOf,
  playerEstimateYen,
  runDiagnosticTest,
  sheetGuideValueYen,
} from '@midnight-garage/sim'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SymptomChecklist from '../components/SymptomChecklist.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { DEMO_LOT_ID, buildDemoState, isRoutedSymptom, orderedSymptoms } from './inspectionDemo'

const game = useGameStore()

// Picker: every symptom in content, routed trees first - see
// orderedSymptoms/isRoutedSymptom in inspectionDemo.ts.
const symptomList = computed(() => orderedSymptoms(game.context.symptoms))

const selectedSymptomId = ref<string | null>(null)
const seed = ref(1)
const demoState = ref<ReturnType<typeof buildDemoState> | null>(null)
const revealAnswer = ref(false)

// Rebuilds the demo-local state from the current symptom + seed - the real
// weighted cause roll plus a fresh, fully-open car (buildDemoState in
// inspectionDemo.ts). Nothing here narrows anything itself.
function rebuild(): void {
  const id = selectedSymptomId.value
  if (!id) return
  const symptom = game.context.symptomsById[id]
  if (!symptom) return
  demoState.value = buildDemoState(game.gameState, symptom, seed.value, game.context)
}

// Picking a symptom always starts a fresh roll at seed 1, so the same
// symptom picked twice in a row reproduces identically.
function pickSymptom(id: string): void {
  selectedSymptomId.value = id
  seed.value = 1
  rebuild()
}

// Same symptom, same seed: rebuilds a fully-open car with the identical
// rolled true cause, clearing any tests already run.
function resetRoll(): void {
  rebuild()
}

// A fresh seed, same symptom: the weighted draw may land on a different true
// cause this time.
function reroll(): void {
  seed.value += 1
  rebuild()
}

const currentLot = computed(() =>
  demoState.value?.activeAuctionLots.find((lot) => lot.id === DEMO_LOT_ID),
)

const currentModel = computed(() => {
  const lot = currentLot.value
  return lot ? game.context.modelsById[lot.modelId] : undefined
})

// The real routed checklist over the current (narrowing) demo lot - the same
// getter the auction board and its own dev demo both read.
const checklist = computed(() => {
  const lot = currentLot.value
  const model = currentModel.value
  if (!lot || !model) return []
  return game.symptomChecklistForCar(lot.car, apparentViewOf(lot.car), model)
})

// The fixed sheet number the estimate line starts from - unaffected by
// narrowing (it averages every authored cause), so it reads the same whether
// taken before or after a test runs.
const sheetValueYen = computed(() => {
  const lot = currentLot.value
  const model = currentModel.value
  if (!lot || !model || !demoState.value) return 0
  return Math.round(sheetGuideValueYen(lot.car, model, demoState.value, game.context))
})

// The player's own number: moves off the sheet value the moment a test
// narrows the doubt, through the real estimator.
const estimateYen = computed(() => {
  const lot = currentLot.value
  const model = currentModel.value
  if (!lot || !model || !demoState.value) return 0
  return Math.round(playerEstimateYen(lot.car, model, demoState.value, game.context))
})

const moved = computed(() => estimateYen.value !== sheetValueYen.value)
const up = computed(() => estimateYen.value > sheetValueYen.value)

const trueCauseLabel = computed(() => {
  const trueCauseId = currentLot.value?.car.symptoms[0]?.trueCauseId
  return trueCauseId ? titleCaseFromSlug(trueCauseId) : ''
})

// Why a specific fork test is disabled right now, `null` when it isn't -
// mirrors the auction room demo's own proactive "why not" for one test.
function testDisabledReason(test: { minutes: number; alreadyRun: boolean }): string | null {
  const visit = demoState.value?.inspectionVisit
  if (!visit) return 'Pick a symptom to begin'
  if (visit.minutesLeft < test.minutes) {
    return `Needs ${test.minutes}m, only ${visit.minutesLeft}m left`
  }
  if (test.alreadyRun) return 'Already run'
  return null
}

// A run test narrows the doubt through the real function; the checklist and
// the estimate both re-derive from the narrowed lot, so nothing here
// remembers or reconstructs any result copy of its own.
function onRunTest(payload: { lotId: string; symptomIndex: number; testId: string }): void {
  if (!demoState.value) return
  const r = runDiagnosticTest(
    demoState.value,
    payload.lotId,
    payload.symptomIndex,
    payload.testId,
    game.context,
  )
  demoState.value = r.state
}
</script>

<template>
  <section class="inspect-demo">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Back</RouterLink>
    <p class="demo-banner" data-test="demo-banner">Dev demo: nothing here is saved.</p>

    <div class="picker">
      <button
        v-for="symptom in symptomList"
        :key="symptom.id"
        type="button"
        class="picker-btn"
        :class="{ active: symptom.id === selectedSymptomId, routed: isRoutedSymptom(symptom) }"
        :data-test="'symptom-pick-' + symptom.id"
        @click="pickSymptom(symptom.id)"
      >
        {{ symptom.cardLine }}
      </button>
    </div>

    <div v-if="demoState && currentLot" class="panel">
      <div class="controls">
        <button type="button" data-test="reset-roll" @click="resetRoll">Reset (same roll)</button>
        <button type="button" data-test="reroll" @click="reroll">Reroll</button>
        <span class="seed" data-test="seed">Seed #{{ seed }}</span>
        <span class="minutes" data-test="minutes-left">
          {{ demoState.inspectionVisit?.minutesLeft ?? 0 }}m left
        </span>
        <label class="reveal-label">
          <input v-model="revealAnswer" type="checkbox" data-test="reveal-toggle" />
          Reveal the answer
        </label>
      </div>

      <p v-if="revealAnswer" class="reveal-answer" data-test="reveal-answer">
        True cause: {{ trueCauseLabel }}
      </p>

      <SymptomChecklist
        :symptoms="checklist"
        :lot-id="currentLot.id"
        :disabled-reason-for="testDisabledReason"
        :show-deltas="false"
        @run-test="onRunTest"
      />

      <p class="est-value" data-test="est-value">
        Estimated market value:
        <template v-if="!moved">{{ formatYen(sheetValueYen) }}</template>
        <template v-else>
          <span class="was">{{ formatYen(sheetValueYen) }}</span>
          <span :class="up ? 'up' : 'down'">{{ formatYen(estimateYen) }}</span>
        </template>
      </p>
    </div>

    <p v-else class="prompt" data-test="prompt">Pick a symptom above to begin.</p>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.demo-banner {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-3);
  width: fit-content;
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-3);
}

.picker-btn {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-xs, 0.7rem);
  text-align: left;
  max-width: 220px;
}

.picker-btn.routed {
  border-color: var(--mg-neon-cyan);
}

.picker-btn.active {
  color: var(--mg-night-deep);
  background: var(--mg-neon-violet);
  border-color: var(--mg-neon-violet);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-2);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.controls button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.seed,
.minutes {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.reveal-label {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.reveal-answer {
  margin: 0;
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
}

.prompt {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The estimated market value line: struck original, green up or red down -
   the same idiom the auction room demo's own est-value line uses. */
.est-value {
  margin: 0;
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.est-value .was {
  color: var(--mg-text-dim);
  text-decoration: line-through;
  margin-left: 0.35em;
}

.est-value .up {
  color: var(--mg-success);
  margin-left: 0.35em;
}

.est-value .down {
  color: var(--mg-danger);
  margin-left: 0.35em;
}
</style>
