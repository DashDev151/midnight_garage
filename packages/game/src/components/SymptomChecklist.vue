<script setup lang="ts">
import type { LotDetail } from '../stores/gameStore'
import { formatYenDelta } from '../utils/formatYen'

/**
 * The free, public symptom disclosure for a listed car: the symptom line, its
 * still-open cause checklist (each cause priced by what the deal moves "if
 * true"), the routed diagnostic tree as a trail of run tests above a fork of
 * the currently offered ones, and the run-test buttons.
 * Purely presentational - the parent owns every decision: `disabledReasonFor`
 * says why a given fork test cannot run right now (`null` when it can), and a
 * click emits `run-test` for the parent to act on. The store has already
 * split run from offered and derived every trail entry's result line, so
 * this component caches nothing of its own. Keeps the exact `data-test`
 * anchors both the auction board and the room demo rely on.
 *
 * The send-inspector control is one per-lot addition, not per-symptom -
 * `showSendInspector` is the parent's own already-evaluated
 * `sendInspectorGateReason(lotId) === null` read, so a locked control is
 * simply absent here too, matching the fork's own "invisible, not disabled"
 * idiom. `showInspectorDone` renders the byte-verbatim done line once a
 * send has actually run; it never clears itself back off.
 */
withDefaults(
  defineProps<{
    symptoms: LotDetail['symptoms']
    lotId: string
    disabledReasonFor: (test: { minutes: number; alreadyRun: boolean }) => string | null
    /** Whether to show each cause's "if true" value delta. The auction board
     * shows it; the room demo hides it to keep one adjusting value on screen. */
    showDeltas?: boolean
    /** Whether the benched master inspector's send control shows for this
     * lot right now - the parent's own `sendInspectorGateReason` read. */
    showSendInspector?: boolean
    /** The benched master inspector's real display name - the send
     * control's own label and the done line both read it. Only meaningful
     * while `showSendInspector` or `showInspectorDone` is true. */
    inspectorName?: string
    /** Whether the done line shows for this lot - true once a send has
     * actually run this session, independent of whether the control itself
     * is still showing. */
    showInspectorDone?: boolean
  }>(),
  { showDeltas: true, showSendInspector: false, inspectorName: '', showInspectorDone: false },
)

const emit = defineEmits<{
  (e: 'run-test', payload: { lotId: string; symptomIndex: number; testId: string }): void
  (e: 'send-inspector', payload: { lotId: string }): void
}>()
</script>

<template>
  <!-- A display:contents wrapper keeps this a single template root (the
       symptom list plus the one per-lot inspector row below it) while
       leaving the parent's own layout untouched - the same trick
       AuctionLotCard.vue's own `.lot-card` wrapper uses. -->
  <div class="symptom-checklist">
    <div
      v-for="symptom in symptoms"
      :key="symptom.symptomIndex"
      class="symptom"
      :class="{ resolved: symptom.resolved }"
      :data-test="'symptom-' + lotId"
    >
      <p class="symptom-line">{{ symptom.line }}</p>
      <ul class="symptom-causes">
        <li
          v-for="cause in symptom.causes"
          :key="cause.causeId"
          :class="{ eliminated: cause.eliminated }"
        >
          <span class="mark" aria-hidden="true">{{ cause.eliminated ? '[x]' : '[ ]' }}</span>
          <span class="label">{{ cause.label }}</span>
          <span v-if="showDeltas" class="delta"
            >{{ formatYenDelta(cause.dealDeltaYen) }} if true</span
          >
        </li>
      </ul>

      <!-- The trail: every run test's own earned result line, in run order -
           the player's growing case file, sitting above the fork it opened up. -->
      <ul v-if="symptom.trail.length > 0" class="symptom-trail">
        <li
          v-for="entry in symptom.trail"
          :key="entry.testId"
          :data-test="'breadcrumb-' + entry.testId"
        >
          <span class="trail-label">{{ entry.label }}:</span>
          <span class="trail-result">{{ entry.resultLine }}</span>
        </li>
      </ul>

      <!-- The fork: only tests the routed tree currently offers and that
           haven't run yet - a locked test is simply absent, never a disabled
           button (the store has already filtered `symptom.tests` down to it). -->
      <div v-if="symptom.tests.length > 0" class="symptom-tests">
        <button
          v-for="test in symptom.tests"
          :key="test.testId"
          type="button"
          class="run-test"
          :disabled="!!disabledReasonFor(test)"
          :title="disabledReasonFor(test) ?? 'Run this test against the visit clock'"
          :data-test="'run-test-' + lotId + '-' + symptom.symptomIndex + '-' + test.testId"
          @click="
            emit('run-test', { lotId, symptomIndex: symptom.symptomIndex, testId: test.testId })
          "
        >
          {{ test.label }} ({{ test.minutes }}m)
        </button>
      </div>

      <!-- Closed: the tree has nothing further to offer, but the trail holds
           at least one run test - a quiet closing line, not a banner. -->
      <p
        v-else-if="!symptom.resolved && symptom.trail.length > 0"
        class="checklist-closed"
        :data-test="'checklist-closed-' + symptom.symptomIndex"
      >
        That's everything the yard will tell you.
      </p>
    </div>

    <!-- The send-inspector control: one per lot, not per symptom - visible
         only while the sim's own gate passes, exactly like every other verb
         here. The done line is a quiet record of the last pass, not a
         banner, matching the closed-checklist line's own tone. -->
    <div
      v-if="showSendInspector || showInspectorDone"
      class="inspector-row"
      :data-test="'inspector-row-' + lotId"
    >
      <button
        v-if="showSendInspector"
        type="button"
        class="send-inspector"
        :data-test="'send-inspector-' + lotId"
        @click="emit('send-inspector', { lotId })"
      >
        Send {{ inspectorName }} to listen
      </button>
      <p v-if="showInspectorDone" class="inspector-done" :data-test="'inspector-done-' + lotId">
        {{ inspectorName }} hands the sheet back without a word.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* The wrapper generates no box of its own - a single template root without
   affecting the parent's own flex/grid layout of the symptom list and the
   inspector row beneath it (mirrors AuctionLotCard.vue's own `.lot-card`). */
.symptom-checklist {
  display: contents;
}

/* A real checklist idiom (ASCII `[ ]` marks; decorative icons are banned),
   matching ServiceTaskList.vue's own look, extended with a per-cause value
   delta this list also needs to show. */
.symptom {
  margin-top: var(--mg-space-1);
  text-align: left;
}

.symptom-line {
  margin: 0;
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

.symptom-causes {
  list-style: none;
  margin: var(--mg-space-1) 0 0;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-text-dim);
}

.symptom-causes li {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.symptom-causes .mark {
  color: var(--mg-neon-cyan);
  flex-shrink: 0;
}

.symptom-causes .delta {
  color: var(--mg-text-dim);
}

/* A ruled-out cause strikes through - ServiceTaskList's own done-styling idiom
   (dim + line-through the label, mark goes success-coloured), reused rather
   than a second convention for the same idea. */
.symptom-causes li.eliminated .mark {
  color: var(--mg-success);
}

.symptom-causes li.eliminated .label {
  text-decoration: line-through;
}

.symptom-causes li.eliminated .delta {
  opacity: 0.6;
}

/* The trail: a quiet case file, not a banner - the label dim, the earned
   result line in normal text, one per run test. */
.symptom-trail {
  list-style: none;
  margin: var(--mg-space-1) 0 0;
  padding: 0;
  display: grid;
  gap: 2px;
  font-size: var(--mg-fs-xs, 0.7rem);
}

.trail-label {
  color: var(--mg-text-dim);
  margin-right: var(--mg-space-1);
}

.trail-result {
  color: var(--mg-text);
}

.symptom-tests {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-1);
  margin-top: var(--mg-space-1);
}

.run-test {
  font-size: var(--mg-fs-xs, 0.7rem);
  padding: 1px var(--mg-space-2);
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  background: transparent;
}

/* The closed state: the tree has nothing further to offer - a quiet,
   dim closing line, matching the trail's own subdued tone. */
.checklist-closed {
  margin: var(--mg-space-1) 0 0;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-text-dim);
  font-style: italic;
}

/* The send-inspector row: one small control below the last symptom, the
   same ghost-button weight as `.run-test`. */
.inspector-row {
  margin-top: var(--mg-space-2);
}

.send-inspector {
  font-size: var(--mg-fs-xs, 0.7rem);
  padding: 1px var(--mg-space-2);
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  background: transparent;
}

/* The done line: a quiet record of the last pass, matching the trail's own
   subdued tone rather than a banner. */
.inspector-done {
  margin: var(--mg-space-1) 0 0;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-text-dim);
  font-style: italic;
}
</style>
