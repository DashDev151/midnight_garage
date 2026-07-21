<script lang="ts">
import type { LotDetail } from '../stores/gameStore'

/** The slice of a lot's detail this card draws. */
export type AuctionLotCardView = Pick<
  LotDetail,
  | 'lot'
  | 'displayName'
  | 'fitmentClass'
  | 'turnout'
  | 'playerHasBid'
  | 'leadingBidder'
  | 'auctionGrade'
  | 'symptoms'
  | 'guideValueYen'
  | 'ledger'
>
</script>

<script setup lang="ts">
import { partFitmentClassLabel } from '@midnight-garage/content'
import { formatYen } from '../utils/formatYen'
import { LEDGER_LINE_LABELS, formatLedgerLineYen } from '../utils/ledgerLabels'
import GradeStamp from './GradeStamp.vue'
import HelpHint from './HelpHint.vue'
import SymptomChecklist from './SymptomChecklist.vue'

/**
 * The production presentation of one auction lot, shared by the auction board
 * and the dev auction-room demo: the left identity panel (display name and
 * class chip, the year/km/colour line, the turnout badge and outbid state, the
 * art placeholder, the three condition grades, and the public symptom
 * checklist) plus the right-hand value block (the room's number and its
 * ledger). Purely presentational: the parent owns every decision. The bid stack
 * (leading bid, raise controls, buyout, reserve, close line) lives in each
 * parent and drops into the `headline`, `info`, and `actions` slots, so this
 * card never touches bidding and the demo can swap that region for the live
 * room. The SymptomChecklist callbacks (`disabledReasonFor`, the `run-test`
 * emit) pass straight through, keeping the test logic in the parent.
 */

withDefaults(
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
  }>(),
  { showDeltas: true, inspectionOnRight: false },
)

const emit = defineEmits<{
  (e: 'run-test', payload: { lotId: string; symptomIndex: number; testId: string }): void
}>()

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
        <!-- The headline reads a neutral "leading bid" when a rival is ahead, so
             this badge is the only place the card says that the player bid and is
             losing. -->
        <span v-if="d.playerHasBid && d.leadingBidder !== 'player'" class="winning-state outbid">
          outbid
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
          the room says {{ formatYen(d.guideValueYen) }}
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
            <span class="ledger-label">{{ LEDGER_LINE_LABELS[line.id] }}</span>
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

.winning-state {
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.winning-state.outbid {
  color: var(--mg-danger);
}
</style>
