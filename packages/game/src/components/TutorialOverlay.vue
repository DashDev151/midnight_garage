<script setup lang="ts">
/**
 * Sprint 89 (Yuki teaches you the game): the guided-tutorial coach overlay.
 *
 * A strict VIEW. It reads game/store state and static tutorial content only,
 * derives the current step from live state (never a stored step index, never a
 * timer), and highlights the real controls the player operates. It NEVER
 * mutates the sim - the only state it writes is the tutorial's own
 * skip/finish/acknowledge bits, through the store's `skipTutorial`/
 * `finishTutorial`/`acknowledgeTutorialStep` actions, and its own session-only
 * drag position in the ui store (Sprint 95).
 */
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import {
  ALL_CAR_PART_IDS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  STORY_MISSIONS,
  SYMPTOMS,
  TUTORIAL_LOT,
  TUTORIAL_STEPS,
  fitmentClassForTier,
  resolveCarDisplayName,
  type CarInstance,
  type TutorialBaseCondition,
  type TutorialCondition,
  type TutorialStep,
} from '@midnight-garage/content'
import { bandIndex, isPartMissing } from '@midnight-garage/sim'
import { useGameStore } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const ui = useUiStore()
const route = useRoute()

const recipe = TUTORIAL_LOT
const mission = STORY_MISSIONS.find((m) => m.id === recipe.missionId)
const model = CARS.find((c) => c.id === recipe.modelId)
const symptom = SYMPTOMS.find((s) => s.id === recipe.symptom.symptomId)
const truePartId = symptom?.causes.find((c) => c.id === recipe.symptom.trueCauseId)?.carPartId
const truePartName = truePartId
  ? (PARTS_TAXONOMY.find((p) => p.id === truePartId)?.displayName ?? truePartId)
  : ''

/** Catalogue part id -> the slot it addresses, for the `partInInventory`
 * condition (a `PartInstance` carries only its catalogue `partId`). */
const carPartIdByPartId = new Map(PARTS.map((p) => [p.id, p.carPartId]))

const partById = new Map(PARTS.map((p) => [p.id, p]))

/** The class half of `partFitsCar` against the scripted car - enough here
 * because the caller has already matched the slot address. */
function fitsScriptedCar(partId: string): boolean {
  if (!model) return false
  return partById.get(partId)?.fitmentClass === fitmentClassForTier(model.tier)
}

/** Token substitutions for the swept copy. Resolved once from static content -
 * the swept sheet's `{budgetCap}`/`{payout}`/`{model}`/`{part}` placeholders. */
const tokens = computed<Record<string, string>>(() => ({
  budgetCap: mission ? formatYen(mission.budgetCapYen) : '',
  payout: mission ? formatYen(mission.payoutYen) : '',
  model: model ? resolveCarDisplayName(model) : recipe.modelId,
  part: truePartName,
}))

function interpolate(text: string): string {
  const map = tokens.value
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => map[key] ?? whole)
}

/** The tutorial mission's live record, if any. */
const missionRecord = computed(() =>
  game.gameState.storyMissions.find((r) => r.missionId === recipe.missionId),
)

/** The scripted car wherever it currently lives - on the board or owned. */
const scriptedCar = computed<CarInstance | undefined>(() => {
  const owned = game.gameState.ownedCars.find((c) => c.id === recipe.carId)
  if (owned) return owned
  return game.gameState.activeAuctionLots.find((l) => l.car.id === recipe.carId)?.car
})

/**
 * One base predicate against live state. `stepId` is the OWNING step's id -
 * the `acknowledged` kind reads whether that step itself has been
 * "Got it"-pressed (`gameState.tutorialAcknowledgedSteps`).
 */
function baseConditionMet(cond: TutorialBaseCondition, stepId: string): boolean {
  switch (cond.kind) {
    case 'missionActive':
      return missionRecord.value?.status === 'active'
    case 'missionDelivered':
      return missionRecord.value?.status === 'delivered'
    case 'scriptedCarOwned':
      return game.gameState.ownedCars.some((c) => c.id === recipe.carId)
    case 'lotInspected': {
      const s = scriptedCar.value?.symptoms[0]
      return !!s && s.remainingCauseIds.length <= 1
    }
    case 'partBandAtLeast': {
      const owned = game.gameState.ownedCars.find((c) => c.id === recipe.carId)
      const installed = owned?.parts[cond.carPartId]?.installed
      return !!installed && bandIndex(installed.band) >= bandIndex(cond.band)
    }
    case 'acknowledged':
      return (game.gameState.tutorialAcknowledgedSteps ?? []).includes(stepId)
    case 'scriptedCarInServiceBay':
      return game.gameState.serviceBayCarIds.includes(recipe.carId)
    case 'inspectionVisitActive':
      return game.gameState.inspectionVisit?.tier === recipe.tier
    case 'assemblyOnBench':
      return (game.gameState.assemblyInventory ?? []).some(
        (a) => a.assemblyId === cond.assemblyId && a.sourceCarId === recipe.carId,
      )
    case 'partInInventory':
      // Non-scrap, addressed to this slot, AND actually fitting the scripted
      // car's class - "your tyres are in" must never fire on tyres that
      // cannot go on her.
      return game.gameState.partInventory.some(
        (pi) =>
          pi.band !== 'scrap' &&
          carPartIdByPartId.get(pi.partId) === cond.carPartId &&
          fitsScriptedCar(pi.partId),
      )
    case 'partOnOrder':
      // A standard-delivery order in transit addressed to this slot (and
      // fitting the scripted car) - the "your tyres are coming, End Day"
      // waiting moment.
      return game.gameState.pendingPartOrders.some(
        (order) =>
          carPartIdByPartId.get(order.partId) === cond.carPartId && fitsScriptedCar(order.partId),
      )
    case 'scriptedCarWhole': {
      // No slot missing (installed, or legitimately absent like the NA turbo
      // slot) - the reassembly gate, so the machine can never march a
      // part-missing car to delivery.
      const owned = game.gameState.ownedCars.find((c) => c.id === recipe.carId)
      if (!owned || !model) return false
      return ALL_CAR_PART_IDS.every((partId) => !isPartMissing(owned, model, partId))
    }
    case 'benchMemberBandAtLeast':
      // The scripted car's benched member holds an instance at band or better
      // - the "fresh rubber is on the bench, refit it" beat.
      return (game.gameState.assemblyInventory ?? []).some((container) => {
        if (container.sourceCarId !== recipe.carId) return false
        const member = container.members[cond.carPartId]
        return !!member && bandIndex(member.band) >= bandIndex(cond.band)
      })
    case 'testRun': {
      // Mirrors `lotInspected`: the scripted car's first symptom, read live.
      const s = scriptedCar.value?.symptoms[0]
      return !!s && s.runTestIds.includes(cond.testId)
    }
    case 'never':
      return false
  }
}

/** `anyOf` is one level deep by schema (the completion monotonicity law):
 * met when any member is. */
function conditionMet(cond: TutorialCondition, stepId: string): boolean {
  if (cond.kind === 'anyOf') return cond.of.some((member) => baseConditionMet(member, stepId))
  return baseConditionMet(cond, stepId)
}

const isDelivered = computed(() => missionRecord.value?.status === 'delivered')

const doneStep = computed<TutorialStep | undefined>(() =>
  TUTORIAL_STEPS.find((s) => s.completion.kind === 'never'),
)

/** The current beat: the terminal sign-off once the mission is delivered
 * (the scripted car has left `ownedCars`, so its earlier predicates no longer
 * evaluate), otherwise the first non-terminal step whose completion is unmet. */
const currentStep = computed<TutorialStep | undefined>(() => {
  if (!game.tutorialActive) return undefined
  if (isDelivered.value) return doneStep.value
  for (const step of TUTORIAL_STEPS) {
    if (step.completion.kind === 'never') continue
    if (!conditionMet(step.completion, step.id)) return step
  }
  return doneStep.value
})

const isTerminal = computed(() => currentStep.value?.completion.kind === 'never')

/** The "Got it" button renders only on a step whose completion IS the
 * acknowledgement (Sprint 95 decision 3). */
const isAcknowledgedStep = computed(() => currentStep.value?.completion.kind === 'acknowledged')

function acknowledgeCurrentStep(): void {
  const step = currentStep.value
  if (step) game.acknowledgeTutorialStep(step.id)
}

/** Each visible line with its stable index in the step's own line array -
 * the index keys the render AND the seen-text bookkeeping below. A line
 * renders when shown and not yet retired (`hideWhen`, playtest item 19): the
 * box must never end on an errand the player has already run. */
const visibleEntries = computed(() => {
  const step = currentStep.value
  if (!step) return []
  return step.lines
    .map((line, idx) => ({ line, idx }))
    .filter(
      ({ line }) =>
        (!line.showWhen || conditionMet(line.showWhen, step.id)) &&
        (!line.hideWhen || !conditionMet(line.hideWhen, step.id)),
    )
})

// --- seen-text dimming (playtest item 20, corrected same day) ---------------
// Dim ONLY text that was already on screen when NEWER text arrived. A freshly
// opened step shows every line at full strength; when a reveal lands at the
// bottom, everything the player has already read drops to lower contrast.
// The machine itself is stateless, so this is deliberately view-local memory:
// which line indices have rendered for the current step, and which arrived in
// the newest batch.
let dimStepId = ''
const seenLineIdx = new Set<number>()
const latestBatch = ref<ReadonlySet<number>>(new Set())

watch(
  () => [currentStep.value?.id ?? '', visibleEntries.value.map((e) => e.idx).join('.')] as const,
  ([stepId]) => {
    const visibleIdx = visibleEntries.value.map((e) => e.idx)
    if (stepId !== dimStepId) {
      // A new step: everything on it is fresh, nothing dims.
      dimStepId = stepId
      seenLineIdx.clear()
      for (const idx of visibleIdx) seenLineIdx.add(idx)
      latestBatch.value = new Set(visibleIdx)
      return
    }
    const added = visibleIdx.filter((idx) => !seenLineIdx.has(idx))
    if (added.length > 0) {
      latestBatch.value = new Set(added)
      for (const idx of added) seenLineIdx.add(idx)
    }
  },
  { immediate: true },
)

/** Dim a line only when a newer batch is actually on screen - if the newest
 * lines have themselves retired (nothing "newer" visible), everything returns
 * to full strength rather than the whole box reading as an afterthought. */
function isDimmed(idx: number): boolean {
  if (latestBatch.value.has(idx)) return false
  return visibleEntries.value.some((e) => latestBatch.value.has(e.idx))
}

const stepNumber = computed(() => {
  const id = currentStep.value?.id
  const idx = TUTORIAL_STEPS.findIndex((s) => s.id === id)
  return idx >= 0 ? idx + 1 : 0
})
const stepTotal = TUTORIAL_STEPS.length

// --- best-effort spotlight of the current step's real control ---------------

/** The spotlight's chosen `data-test` chain: the LAST visible line carrying
 * its own `anchorTestId` wins (Sprint 95 decision 9 - the spotlight follows
 * the sub-state through a step), else the step's own anchor. A line anchor
 * may be a chain tried in DOM order (a multi-screen errand spotlights the
 * deepest control that exists right now). A `{lotId}` token resolves to the
 * scripted lot either way. */
const anchorTestIds = computed<string[]>(() => {
  const step = currentStep.value
  if (!step || isTerminal.value) return []
  let anchor: string | readonly string[] = step.anchorTestId
  for (const { line } of visibleEntries.value) {
    if (line.anchorTestId) anchor = line.anchorTestId
  }
  const chain = Array.isArray(anchor) ? anchor : [anchor as string]
  return chain.map((testId) => testId.replace('{lotId}', recipe.lotId))
})

/** Fallback anchors for when the chosen control is not in the DOM (usually the
 * wrong screen): the nav tab that leads to the step's `anchorScreen`, so the
 * walkthrough always spotlights something clickable. The car screen has no nav
 * tab of its own - fall back to the first service bay slot, then the Garage
 * tab. */
function fallbackTestIds(anchorScreen: string): string[] {
  if (anchorScreen === 'car') return ['service-slot-0', 'nav-garage']
  return [`nav-${anchorScreen}`]
}

let spotlit: Element | null = null
watchEffect(
  (onCleanup) => {
    // Re-run when the step, its visible lines (via anchorTestId), or the
    // route changes - the route swap is what mounts/unmounts the real
    // controls.
    void route.name
    if (spotlit) {
      spotlit.classList.remove('tutorial-spotlight')
      spotlit = null
    }
    const step = currentStep.value
    const primary = anchorTestIds.value
    if (step && primary.length > 0 && typeof document !== 'undefined') {
      for (const testId of [...primary, ...fallbackTestIds(step.anchorScreen)]) {
        const el = document.querySelector(`[data-test="${testId}"]`)
        if (el) {
          el.classList.add('tutorial-spotlight')
          spotlit = el
          break
        }
      }
    }
    onCleanup(() => {
      if (spotlit) {
        spotlit.classList.remove('tutorial-spotlight')
        spotlit = null
      }
    })
  },
  // The target control (e.g. a newly unlocked diagnostic-test button) can
  // mount in the very same reactive flush that shifts the chosen anchor -
  // the default 'pre' timing would query the DOM before that mount lands,
  // so this must run 'post', after every component's own update.
  { flush: 'post' },
)

// --- draggable overlay (Sprint 95 decision 8) --------------------------------

const overlayEl = ref<HTMLElement | null>(null)

/** While a drag is live: the pointer's offset from the overlay's top-left
 * corner, so the box tracks the grab point rather than snapping. */
let dragOffset: { dx: number; dy: number } | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function onDragMove(event: PointerEvent): void {
  const el = overlayEl.value
  if (!dragOffset || !el) return
  // Clamp so the box stays fully inside the viewport.
  const x = clamp(event.clientX - dragOffset.dx, 0, Math.max(0, window.innerWidth - el.offsetWidth))
  const y = clamp(
    event.clientY - dragOffset.dy,
    0,
    Math.max(0, window.innerHeight - el.offsetHeight),
  )
  ui.setTutorialOverlayPos({ x, y })
}

function onDragEnd(): void {
  dragOffset = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
}

function onHeaderPointerDown(event: PointerEvent): void {
  const el = overlayEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  dragOffset = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  event.preventDefault()
}

onUnmounted(onDragEnd)

/** Dragged position (session-only, ui store) overrides the default
 * bottom-left CSS; unset means the stylesheet position (plain or hinted via
 * `panelPositionClass` below) applies untouched. `transform: none` cancels
 * the `right` hint's vertical-centering transform, which otherwise fights
 * an explicit top pixel value. */
const overlayStyle = computed(() => {
  const pos = ui.tutorialOverlayPos
  if (!pos) return undefined
  return { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto', transform: 'none' }
})

// --- per-step default placement ----------------------------------------------

/** The class carrying the current step's `panelPosition` hint, if any -
 * `undefined`/`'default'` adds nothing and the plain bottom-left CSS applies. */
const panelPositionClass = computed(() => {
  switch (currentStep.value?.panelPosition) {
    case 'right':
      return 'tutorial-pos-right'
    case 'bottom-right':
      return 'tutorial-pos-bottom-right'
    default:
      return ''
  }
})

/** A step change re-applies that step's default placement: dropping any
 * drag from the step just left rather than carrying it forward. Dragging
 * within a step is untouched - only the step boundary (or mounting onto a
 * step, which clears any position remembered from before the mount)
 * resets it. */
watch(
  () => currentStep.value?.id,
  () => ui.setTutorialOverlayPos(null),
  { immediate: true },
)

const confirmingSkip = ref(false)
</script>

<template>
  <aside
    v-if="game.tutorialActive && currentStep"
    ref="overlayEl"
    :class="['tutorial-overlay', panelPositionClass]"
    data-test="tutorial-overlay"
    role="complementary"
    aria-label="Walkthrough"
    :style="overlayStyle"
  >
    <header class="tutorial-head" @pointerdown="onHeaderPointerDown">
      <span class="tutorial-label">Walkthrough</span>
      <span v-if="!isTerminal" class="tutorial-progress" data-test="tutorial-progress"
        >Step {{ stepNumber }} of {{ stepTotal }}</span
      >
    </header>

    <ol class="tutorial-lines">
      <li
        v-for="{ line, idx } in visibleEntries"
        :key="idx"
        :class="[
          'tutorial-line',
          line.speaker === 'yuki' ? 'is-yuki' : 'is-instruction',
          { 'is-dim': isDimmed(idx) },
        ]"
        :data-test="line.speaker === 'yuki' ? 'tutorial-yuki' : 'tutorial-instruction'"
      >
        <span v-if="line.speaker === 'yuki'" class="tutorial-speaker">Yuki</span>
        <span class="tutorial-text">{{ interpolate(line.text) }}</span>
      </li>
    </ol>

    <footer class="tutorial-foot">
      <button
        v-if="isTerminal"
        type="button"
        class="tutorial-finish"
        data-test="tutorial-finish"
        @click="game.finishTutorial()"
      >
        Finish
      </button>

      <template v-else>
        <template v-if="!confirmingSkip">
          <button
            type="button"
            class="tutorial-skip"
            data-test="tutorial-skip"
            @click="confirmingSkip = true"
          >
            Skip the walkthrough
          </button>
          <button
            v-if="isAcknowledgedStep"
            type="button"
            class="tutorial-got-it"
            data-test="tutorial-got-it"
            @click="acknowledgeCurrentStep()"
          >
            Got it
          </button>
        </template>
        <div v-else class="tutorial-skip-confirm" data-test="tutorial-skip-confirm">
          <p class="tutorial-skip-copy">
            Skip for good? Yuki's job stays; the guidance does not come back.
          </p>
          <div class="tutorial-skip-actions">
            <button
              type="button"
              class="tutorial-skip-yes"
              data-test="tutorial-skip-confirm-yes"
              @click="game.skipTutorial()"
            >
              Skip
            </button>
            <button
              type="button"
              class="tutorial-skip-no"
              data-test="tutorial-skip-confirm-no"
              @click="confirmingSkip = false"
            >
              Keep it
            </button>
          </div>
        </div>
      </template>
    </footer>
  </aside>
</template>

<style scoped>
.tutorial-overlay {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 120;
  width: min(24rem, calc(100vw - 2rem));
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(120, 200, 255, 0.35);
  background: rgba(16, 18, 34, 0.94);
  box-shadow: 0 0.5rem 1.6rem rgba(0, 0, 0, 0.45);
  color: #e7ecff;
  font-size: 0.86rem;
  line-height: 1.4;
}
/* Per-step default placement (`panelPosition`): the class wins over the base
 * rule above on specificity alone, and a drag's inline style wins over both. */
.tutorial-overlay.tutorial-pos-bottom-right {
  left: auto;
  right: 1rem;
  bottom: 1rem;
}
.tutorial-overlay.tutorial-pos-right {
  left: auto;
  right: 1rem;
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
}
.tutorial-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  /* The drag handle: grab-drag the header to reposition the whole box. */
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.tutorial-head:active {
  cursor: grabbing;
}
.tutorial-label {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  color: #7fd0ff;
}
.tutorial-progress {
  font-size: 0.68rem;
  color: #9aa4c8;
}
.tutorial-lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.tutorial-line {
  display: block;
}
/* Playtest item 20 (corrected): only text the player has ALREADY seen dims,
 * and only once newer guidance has actually landed below it - a freshly
 * opened step renders every line at full strength. The class is driven by
 * the seen-line bookkeeping in the script, never by position alone. */
.tutorial-line.is-dim {
  opacity: 0.62;
}
.tutorial-line.is-yuki {
  padding: 0.45rem 0.6rem;
  border-left: 2px solid #ff8ad4;
  background: rgba(255, 138, 212, 0.1);
  border-radius: 0.3rem;
  font-style: italic;
  color: #ffd7f0;
}
.tutorial-speaker {
  display: block;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #ff8ad4;
  font-style: normal;
  margin-bottom: 0.15rem;
}
.tutorial-line.is-instruction .tutorial-text {
  color: #dfe6ff;
}
.tutorial-foot {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
}
.tutorial-skip,
.tutorial-skip-no {
  background: none;
  border: none;
  color: #9aa4c8;
  font-size: 0.74rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0.2rem 0.3rem;
}
.tutorial-skip:hover,
.tutorial-skip-no:hover {
  color: #dfe6ff;
}
/* The acknowledged-step primary: amber, so it never competes with the violet
 * screen CTAs the spotlight points at. */
.tutorial-got-it {
  background: rgba(255, 187, 92, 0.14);
  border: 1px solid rgba(255, 187, 92, 0.6);
  color: #ffd9a0;
  font-size: 0.78rem;
  border-radius: 0.35rem;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.tutorial-got-it:hover {
  background: rgba(255, 187, 92, 0.24);
}
.tutorial-skip-confirm {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.tutorial-skip-copy {
  margin: 0;
  font-size: 0.78rem;
  color: #c9d1f0;
}
.tutorial-skip-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.tutorial-skip-yes,
.tutorial-finish {
  background: #2b3a6b;
  border: 1px solid rgba(120, 200, 255, 0.4);
  color: #eaf1ff;
  font-size: 0.78rem;
  border-radius: 0.35rem;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.tutorial-skip-yes:hover,
.tutorial-finish:hover {
  background: #35478a;
}
</style>

<style>
/* Global (unscoped): the spotlight class the overlay toggles on the real
 * control for the current step. Applied to elements outside this component's
 * tree, so it cannot be scoped. */
.tutorial-spotlight {
  outline: 2px solid #7fd0ff !important;
  outline-offset: 2px;
  border-radius: 0.3rem;
  box-shadow: 0 0 0 4px rgba(127, 208, 255, 0.25) !important;
  animation: tutorial-spotlight-pulse 1.8s ease-in-out infinite;
}
@keyframes tutorial-spotlight-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(127, 208, 255, 0.22);
  }
  50% {
    box-shadow: 0 0 0 7px rgba(127, 208, 255, 0.12);
  }
}
</style>
