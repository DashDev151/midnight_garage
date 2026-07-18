<script setup lang="ts">
/**
 * Sprint 89 (Yuki teaches you the game): the guided-tutorial coach overlay.
 *
 * A strict VIEW. It reads game/store state and static tutorial content only,
 * derives the current step from live state (never a stored step index, never a
 * timer), and highlights the real controls the player operates. It NEVER
 * mutates the sim - the only state it writes is the tutorial's own skip/finish
 * bit, through the store's `skipTutorial`/`finishTutorial` actions.
 */
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import {
  CARS,
  PARTS_TAXONOMY,
  STORY_MISSIONS,
  SYMPTOMS,
  TUTORIAL_LOT,
  TUTORIAL_STEPS,
  resolveCarDisplayName,
  type CarInstance,
  type TutorialCondition,
  type TutorialStep,
} from '@midnight-garage/content'
import { bandIndex } from '@midnight-garage/sim'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const route = useRoute()

const recipe = TUTORIAL_LOT
const mission = STORY_MISSIONS.find((m) => m.id === recipe.missionId)
const model = CARS.find((c) => c.id === recipe.modelId)
const symptom = SYMPTOMS.find((s) => s.id === recipe.symptom.symptomId)
const truePartId = symptom?.causes.find((c) => c.id === recipe.symptom.trueCauseId)?.carPartId
const truePartName = truePartId
  ? (PARTS_TAXONOMY.find((p) => p.id === truePartId)?.displayName ?? truePartId)
  : ''

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

function conditionMet(cond: TutorialCondition): boolean {
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
    case 'never':
      return false
  }
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
    if (!conditionMet(step.completion)) return step
  }
  return doneStep.value
})

const isTerminal = computed(() => currentStep.value?.completion.kind === 'never')

const visibleLines = computed(() =>
  (currentStep.value?.lines ?? []).filter((line) => !line.showWhen || conditionMet(line.showWhen)),
)

const stepNumber = computed(() => {
  const id = currentStep.value?.id
  const idx = TUTORIAL_STEPS.findIndex((s) => s.id === id)
  return idx >= 0 ? idx + 1 : 0
})
const stepTotal = TUTORIAL_STEPS.length

// --- best-effort spotlight of the current step's real control ---------------
const anchorSelector = computed(() => {
  const step = currentStep.value
  if (!step || isTerminal.value) return null
  const testId = step.anchorTestId.replace('{lotId}', recipe.lotId)
  return `[data-test="${testId}"]`
})

let spotlit: Element | null = null
watchEffect((onCleanup) => {
  // Re-run when the step, route, or a state tick changes.
  void currentStep.value
  void route.name
  if (spotlit) {
    spotlit.classList.remove('tutorial-spotlight')
    spotlit = null
  }
  const selector = anchorSelector.value
  const onAnchorScreen = route.name === currentStep.value?.anchorScreen
  if (selector && onAnchorScreen && typeof document !== 'undefined') {
    const el = document.querySelector(selector)
    if (el) {
      el.classList.add('tutorial-spotlight')
      spotlit = el
    }
  }
  onCleanup(() => {
    if (spotlit) {
      spotlit.classList.remove('tutorial-spotlight')
      spotlit = null
    }
  })
})

const confirmingSkip = ref(false)
</script>

<template>
  <aside
    v-if="game.tutorialActive && currentStep"
    class="tutorial-overlay"
    data-test="tutorial-overlay"
    role="complementary"
    aria-label="Walkthrough"
  >
    <header class="tutorial-head">
      <span class="tutorial-label">Walkthrough</span>
      <span v-if="!isTerminal" class="tutorial-progress" data-test="tutorial-progress"
        >Step {{ stepNumber }} of {{ stepTotal }}</span
      >
    </header>

    <ol class="tutorial-lines">
      <li
        v-for="(line, i) in visibleLines"
        :key="i"
        :class="['tutorial-line', line.speaker === 'yuki' ? 'is-yuki' : 'is-instruction']"
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
        <button
          v-if="!confirmingSkip"
          type="button"
          class="tutorial-skip"
          data-test="tutorial-skip"
          @click="confirmingSkip = true"
        >
          Skip the walkthrough
        </button>
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
.tutorial-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
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
