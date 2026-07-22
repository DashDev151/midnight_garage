<script lang="ts">
import type { LotDetail } from '../stores/gameStore'

/** The slice of a lot's detail this card draws. */
export type AuctionLotCardView = Pick<
  LotDetail,
  | 'lot'
  | 'displayName'
  | 'fitmentClass'
  | 'turnout'
  | 'auctionGrade'
  | 'symptoms'
  | 'guideValueYen'
  | 'ledger'
>
</script>

<script setup lang="ts">
import { partFitmentClassLabel } from '@midnight-garage/content'
import type { ValueLedgerLineId } from '@midnight-garage/sim'
import { computed } from 'vue'
import { formatYen } from '../utils/formatYen'
import { LEDGER_LINE_LABELS, formatLedgerLineYen } from '../utils/ledgerLabels'
import GradeStamp from './GradeStamp.vue'
import HelpHint from './HelpHint.vue'
import SymptomChecklist from './SymptomChecklist.vue'

/**
 * The production presentation of one auction lot, shared by the auction board
 * and the dev auction-room demo: the left identity panel (display name and
 * class chip, the year/km/colour line, the turnout badge, the art
 * placeholder, the three condition grades, and the public symptom checklist)
 * plus the right-hand value block (the room's number and its ledger). Purely
 * presentational: the parent owns every decision. The buy stack (buyout,
 * reserve, close line) lives in each parent and drops into the `headline`,
 * `info`, and `actions` slots, so this card never touches acquisition and the
 * demo can swap that region for the live room. The SymptomChecklist callbacks
 * (`disabledReasonFor`, the `run-test` emit) pass straight through, keeping
 * the test logic in the parent.
 */

const props = withDefaults(
  defineProps<{
    d: AuctionLotCardView
    disabledReasonFor: (test: { minutes: number; alreadyRun: boolean }) => string | null
    /** Whether the checklist shows each cause's "if true" value delta. The
     * auction board shows it; the room demo hides it to keep one adjusting
     * value on screen. */
    showDeltas?: boolean
    /** Where the public symptom checklist sits. Default false: inside the left
     * identity panel, as the auction board draws it. True: in the right value
     * block, under the ledger, so the room demo can pair the narrowing
     * checklist with the estimate it moves. */
    inspectionOnRight?: boolean
    /** The player's own honest number for this lot, once anything has
     * narrowed the doubt - `null` beforehand. Drives the "room says" headline:
     * the instant it diverges from `d.guideValueYen`, the room figure strikes
     * through with this number beside it (the demo's own est-value idiom).
     * Left at its default `null` on the demo card, which draws its own
     * separate estimate line and never diverges this shared headline. */
    playerEstimateYen?: number | null
  }>(),
  { showDeltas: true, inspectionOnRight: false, playerEstimateYen: null },
)

const emit = defineEmits<{
  (e: 'run-test', payload: { lotId: string; symptomIndex: number; testId: string }): void
}>()

/** True once the player's own number has actually moved off the room's read -
 * untested or tied, the headline stays the single plain figure it always was. */
const estimateMoved = computed(
  () => props.playerEstimateYen !== null && props.playerEstimateYen !== props.d.guideValueYen,
)
const estimateAbove = computed(
  () => props.playerEstimateYen !== null && props.playerEstimateYen > props.d.guideValueYen,
)
/** Never read while `estimateMoved` is false - a plain fallback keeps the
 * type a real number rather than threading a null-assertion into the template. */
const displayedEstimateYen = computed(() => props.playerEstimateYen ?? props.d.guideValueYen)

/** True once every symptom on the lot is narrowed to its one remaining cause
 * - the doubt is known, even though only a repair cures it. The ledger's
 * fear line relabels to say so; its yen is untouched, since knowing the
 * cause is not the same as having fixed it. */
const doubtsResolved = computed(
  () => props.d.symptoms.length > 0 && props.d.symptoms.every((s) => s.resolved),
)

function ledgerLabelFor(lineId: ValueLedgerLineId): string {
  if (lineId === 'fear' && doubtsResolved.value) return 'Doubt, resolved'
  return LEDGER_LINE_LABELS[lineId]
}

/** Turnout badge text: one word of texture, never a numeric gauge. */
const TURNOUT_LABEL: Record<string, string> = {
  thin: 'Thin turnout',
  steady: 'Steady turnout',
  packed: 'Packed turnout',
}
</script>

<template>
  <!-- A display:contents wrapper keeps this a single-root component while
       letting the parent's `.lot` grid lay both panels into its columns. -->
  <div class="lot-card">
    <!-- Left panel: identity, art, grade stamps, the public symptom checklist. -->
    <div class="lot-left">
      <div class="lot-head">
        <span class="lot-name"
          >{{ d.displayName
          }}<span class="class-chip" :data-test="'lot-class-' + d.lot.id">{{
            partFitmentClassLabel(d.fitmentClass)
          }}</span></span
        >
        <span class="lot-meta">
          {{ d.lot.car.year }} · {{ d.lot.car.mileageKm.toLocaleString() }} km ·
          {{ d.lot.car.color }}
        </span>
      </div>

      <div class="lot-turnout">
        <span class="turnout-badge" :class="'turnout-' + d.turnout">
          {{ TURNOUT_LABEL[d.turnout] }}
        </span>
      </div>

      <div class="lot-art" aria-hidden="true"></div>

      <div class="grade-stamps">
        <GradeStamp
          label="Overall"
          :grade="d.auctionGrade.overall"
          :data-test="'grade-stamp-overall-' + d.lot.id"
        />
        <GradeStamp
          label="Ext"
          :grade="d.auctionGrade.exterior"
          :data-test="'grade-stamp-ext-' + d.lot.id"
        />
        <GradeStamp
          label="Int"
          :grade="d.auctionGrade.interior"
          :data-test="'grade-stamp-int-' + d.lot.id"
        />
      </div>

      <!-- Free, public symptom disclosure: the room shows the symptom and every
           open cause, never which one is true; test buttons narrow it during an
           active visit. The parent keeps all the logic; the shared checklist only
           draws. Left by default; the demo moves it into the right block. -->
      <SymptomChecklist
        v-if="!inspectionOnRight"
        :symptoms="d.symptoms"
        :lot-id="d.lot.id"
        :disabled-reason-for="disabledReasonFor"
        :show-deltas="showDeltas"
        @run-test="(payload) => emit('run-test', payload)"
      />
    </div>

    <!-- Right panel: the parent's leading-bid headline, the room's number and
         its ledger, then the parent's secondary lines and bid stack via slots. -->
    <div class="lot-right">
      <div class="lot-info">
        <slot name="headline" />

        <!-- The room's number is the card's value headline; the ledger beneath
             it is the exact decomposition the sheet sums to, the fear line last
             on a symptomatic lot. -->
        <p class="room-says" data-test="room-says">
          the room says
          <template v-if="!estimateMoved">{{ formatYen(d.guideValueYen) }}</template>
          <template v-else>
            <span class="was">{{ formatYen(d.guideValueYen) }}</span>
            <span :class="estimateAbove ? 'up' : 'down'">{{
              formatYen(displayedEstimateYen)
            }}</span>
          </template>
          <HelpHint label="The ledger">
            Every price is the same short receipt: the book price, minus the work still outstanding
            (buyers knock off one and a half times that bill, which is exactly the margin you earn
            by doing the work yourself), minus polish it is missing, plus any upgrades that count.
            On a listed car, the last line prices its doubts at the odds; prove the cause and your
            own number replaces the doubt.
          </HelpHint>
        </p>
        <ul class="ledger">
          <li
            v-for="line in d.ledger.lines"
            :key="line.id"
            class="ledger-line"
            :data-test="'ledger-line-' + line.id"
          >
            <span class="ledger-label">{{ ledgerLabelFor(line.id) }}</span>
            <span class="ledger-yen">{{ formatLedgerLineYen(line) }}</span>
          </li>
        </ul>

        <!-- The same public symptom checklist, moved under the ledger when the
             demo asks for it, so the narrowing sits beside the estimate it
             moves. Identical props and emit to the left placement above. -->
        <SymptomChecklist
          v-if="inspectionOnRight"
          :symptoms="d.symptoms"
          :lot-id="d.lot.id"
          :disabled-reason-for="disabledReasonFor"
          :show-deltas="showDeltas"
          @run-test="(payload) => emit('run-test', payload)"
        />

        <slot name="info" />
      </div>

      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
/* The wrapper generates no box of its own, so the two panels below become the
   direct grid items of the parent's `.lot` container. */
.lot-card {
  display: contents;
}

/* The fixed-width left identity panel (art + grades) and the flexible right
   panel (money + bid stack) are laid out by the parent's `.lot` grid; this card
   supplies both panels' contents. */
.lot-left {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
  min-width: 0;
}

.lot-right {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  gap: var(--mg-space-3);
  min-width: 0;
  text-align: center;
}

.lot-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-2);
}

.lot-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* The 2:1 art placeholder, empty and bordered until real sprites exist; a
   future master renders inside at integer scale, preserving integer-only
   scaling. */
.lot-art {
  width: 100%;
  aspect-ratio: 2 / 1;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
}

.grade-stamps {
  display: flex;
  gap: var(--mg-space-2);
  justify-content: center;
}

.lot-name {
  color: var(--mg-neon-cyan);
}

/* A small muted class chip so a bidder knows which class of parts this car
   takes (Kei & Compact / Sports / ...). */
.class-chip {
  display: inline-block;
  margin-left: var(--mg-space-2);
  padding: 0 var(--mg-space-1);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 4px;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-xs, 0.7rem);
  vertical-align: middle;
}

.lot-meta,
.lot-turnout {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The room's number: the card's value headline, above its ledger. */
.room-says {
  margin: 0;
  color: var(--mg-yen);
  font-size: var(--mg-fs-md);
  font-weight: bold;
}

/* Once the player's own number diverges from the room's read, the room
 * figure strikes through (dim, normal weight) and the player's figure sits
 * beside it, green above / red below - the same struck-original idiom the
 * auction room demo's est-value line uses. */
.room-says .was {
  color: var(--mg-text-dim);
  font-weight: normal;
  text-decoration: line-through;
  margin-left: 0.35em;
}

.room-says .up {
  color: var(--mg-success);
  margin-left: 0.35em;
}

.room-says .down {
  color: var(--mg-danger);
  margin-left: 0.35em;
}

/* The compact receipt under the room's number: one small line per entry, label
   left, signed yen right. */
.ledger {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
  width: 100%;
  max-width: 240px;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-text-dim);
}

.ledger-line {
  display: flex;
  justify-content: space-between;
  gap: var(--mg-space-3);
}

.lot-turnout {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

/* Flavour only: no urgency colouring, just a subtle shift so "packed" reads
   warmer than "thin" without shouting. */
.turnout-badge {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.turnout-thin {
  color: var(--mg-text-dim);
}

.turnout-steady {
  color: var(--mg-neon-cyan);
}

.turnout-packed {
  color: var(--mg-yen);
}
</style>
