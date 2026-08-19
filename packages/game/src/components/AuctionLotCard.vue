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
  | 'workBillYen'
>
</script>

<script setup lang="ts">
import { PAINT_COLOURS, partFitmentClassLabel, type PaintColour } from '@midnight-garage/content'
import type { ValueLedgerLineId } from '@midnight-garage/sim'
import { computed } from 'vue'
import { formatYen } from '../utils/formatYen'
import {
  LEDGER_LINE_LABELS,
  formatLedgerLineYen,
  ledgerBreakdownLines,
  workRowFor,
} from '../utils/ledgerLabels'
import { colourTokenDisplayName } from '../utils/paintFamilies'
import { seedChance, seedPick, seedRange } from '../utils/paperSeed'
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
    /** The send-inspector control's own visibility - the parent's own
     * `sendInspectorGateReason(lotId) === null` read. Default false, so a
     * parent that never wires the inspector (the demo cards) never shows it. */
    showSendInspector?: boolean
    /** The benched master inspector's real display name - passed straight
     * through to `SymptomChecklist`. */
    inspectorName?: string
    /** Whether the send-inspector done line shows for this lot. */
    showInspectorDone?: boolean
  }>(),
  {
    showDeltas: true,
    inspectionOnRight: false,
    playerEstimateYen: null,
    showSendInspector: false,
    inspectorName: '',
    showInspectorDone: false,
  },
)

const emit = defineEmits<{
  (e: 'run-test', payload: { lotId: string; symptomIndex: number; testId: string }): void
  (e: 'send-inspector', payload: { lotId: string }): void
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

/** True once ANY symptom has a finding (not every one, unlike
 * `doubtsResolved` above) - the bid-guidance lines' own gate: a single
 * narrowed cause is already knowledge the room doesn't have, so the
 * guidance earns its place the moment the first one lands. A clean lot
 * (no symptoms at all) never shows either line. */
const hasResolvedFinding = computed(() => props.d.symptoms.some((s) => s.resolved))

function ledgerLabelFor(lineId: ValueLedgerLineId): string {
  if (lineId === 'fear' && doubtsResolved.value) return 'Doubt, resolved'
  return LEDGER_LINE_LABELS[lineId]
}

/** The ledger's forward-looking work row: what fixing this car up adds,
 * priced against the bill to mint (`workRowFor`, both figures the sim's
 * own). */
const workRow = computed(() => workRowFor(props.d.ledger, props.d.workBillYen))

/** The room's receipt, minus 'wear' - the work row above already reads
 * that line forward. */
const ledgerBreakdown = computed(() => ledgerBreakdownLines(props.d.ledger))

/** The car's factory colour, named plainly - no iconic-alias lookup here (the
 * meta line has no model uid to match against), just the palette name(s). */
const factoryColourLabel = computed(() => colourTokenDisplayName(props.d.lot.car.factoryColour))

/** Turnout badge text: one word of texture, never a numeric gauge. */
const TURNOUT_LABEL: Record<string, string> = {
  thin: 'Thin turnout',
  steady: 'Steady turnout',
  packed: 'Packed turnout',
}

/**
 * Paper look (sprint223.md, CSS-only proof of concept): every tilt, jitter,
 * ring, fold and attachment below is a pure function of the lot's own
 * instance id via `paperSeed` - a car keeps its folder for life, and two
 * identical models on the board read as two different folders. No
 * `Math.random`, no `Date.now`.
 */
const seedId = computed(() => props.d.lot.id)

const folderRotationDeg = computed(() => seedRange(seedId.value, 'folder', -1.2, 1.2))
const sheetRotationDeg = computed(() => seedRange(seedId.value, 'sheet', -0.5, 0.5))
const photoRotationDeg = computed(() => seedRange(seedId.value, 'photo', -2.5, 2.5))

const ATTACHMENTS = ['staple', 'paperclip'] as const
const attachment = computed(() => seedPick(seedId.value, 'attachment', ATTACHMENTS))

const showCoffeeRing = computed(() => seedChance(seedId.value, 'coffee', 0.35))
const showSecondCoffeeRing = computed(
  () => showCoffeeRing.value && seedChance(seedId.value, 'coffee-second', 0.25),
)
const COFFEE_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
const coffeeCorner = computed(() => seedPick(seedId.value, 'coffee-corner', COFFEE_CORNERS))

const showFoldedCorner = computed(() => seedChance(seedId.value, 'fold', 0.3))
const FOLD_CORNERS = ['top-right', 'bottom-left'] as const
const foldedCorner = computed(() => seedPick(seedId.value, 'fold-corner', FOLD_CORNERS))

/** A believable factory tone for the Polaroid silhouette when the lot's own
 * paint token doesn't resolve to a real swatch - six muted period colours,
 * picked (not rolled) so the same lot always shows the same fallback. */
const MUTED_PERIOD_COLOURS = [
  '#5b6b7a',
  '#7a4f3a',
  '#8f8f7a',
  '#3a4f5b',
  '#6b4f5b',
  '#7a6b4f',
] as const

/** The photo's own paint swatch: the car's real first-tone hex when the
 * palette resolves it, else a seeded muted stand-in. Two-tone factory
 * colours ("white+black") read off their first tone only, since the
 * silhouette is a single fill. */
const photoCarColourHex = computed(() => {
  const firstToken = props.d.lot.car.factoryColour.split('+')[0]
  const resolved = PAINT_COLOURS.find((c: PaintColour) => c.id === firstToken)
  return resolved?.hex ?? seedPick(seedId.value, 'photo-colour', MUTED_PERIOD_COLOURS)
})

/** A seeded per-line tilt plus a tiny left-margin jitter for one handwritten
 * annotation - never the same two numbers for two different lines, and
 * never zero, so the ink never sits dead-level on the printed rules. */
function inkLineStyle(salt: string): { transform: string; marginLeft: string } {
  return {
    transform: `rotate(${seedRange(seedId.value, `ink-rot-${salt}`, -1.5, 1.5)}deg)`,
    marginLeft: `${seedRange(seedId.value, `ink-margin-${salt}`, 0, 6)}px`,
  }
}
</script>

<template>
  <!-- A display:contents wrapper keeps this a single-root component while
       letting the parent's `.lot` list item size to the folder below, the
       card's own single grid item now. -->
  <div class="lot-card">
    <!-- The paper look (sprint223.md, proof of concept): a manila folder
         holding an aged form, seeded per lot instance so no two folders read
         cloned. Everything below is a wrap around the unchanged content. -->
    <div
      class="paper-folder"
      :data-lot-number="d.lot.id"
      :style="{ transform: `rotate(${folderRotationDeg}deg)` }"
    >
      <div class="paper-sheet" :style="{ transform: `rotate(${sheetRotationDeg}deg)` }">
        <span
          v-if="showCoffeeRing"
          class="coffee-ring"
          :class="'corner-' + coffeeCorner"
          aria-hidden="true"
        ></span>
        <span
          v-if="showSecondCoffeeRing"
          class="coffee-ring coffee-ring-second"
          :class="'corner-' + coffeeCorner"
          aria-hidden="true"
        ></span>
        <span
          v-if="showFoldedCorner"
          class="folded-corner"
          :class="'fold-' + foldedCorner"
          aria-hidden="true"
        ></span>
        <span class="pencil-smudge smudge-a" aria-hidden="true"></span>
        <span class="pencil-smudge smudge-b" aria-hidden="true"></span>

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
              {{ factoryColourLabel }}
            </span>
          </div>

          <div class="lot-turnout">
            <span class="turnout-badge" :class="'turnout-' + d.turnout">
              {{ TURNOUT_LABEL[d.turnout] }}
            </span>
          </div>

          <!-- The car photo, stapled or paperclipped to the sheet like a
               real inspection Polaroid - the original placeholder element
               keeps its own identity untouched inside it. -->
          <div
            class="polaroid"
            :style="{
              transform: `rotate(${photoRotationDeg}deg)`,
              '--photo-car-colour': photoCarColourHex,
            }"
          >
            <div class="lot-art" aria-hidden="true"></div>
            <span
              class="polaroid-attachment"
              :class="'attachment-' + attachment"
              aria-hidden="true"
            ></span>
            <div class="polaroid-lip" aria-hidden="true">{{ d.displayName }}</div>
          </div>

          <div class="grade-stamps">
            <GradeStamp
              label="Overall"
              :grade="d.auctionGrade.overall"
              :seed-id="seedId"
              :data-test="'grade-stamp-overall-' + d.lot.id"
            />
            <GradeStamp
              label="Mech"
              :grade="d.auctionGrade.mechanical"
              :seed-id="seedId"
              :data-test="'grade-stamp-mech-' + d.lot.id"
            />
            <GradeStamp
              label="Ext"
              :grade="d.auctionGrade.exterior"
              :seed-id="seedId"
              :data-test="'grade-stamp-ext-' + d.lot.id"
            />
            <GradeStamp
              label="Int"
              :grade="d.auctionGrade.interior"
              :seed-id="seedId"
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
            :show-send-inspector="showSendInspector"
            :inspector-name="inspectorName"
            :show-inspector-done="showInspectorDone"
            @run-test="(payload) => emit('run-test', payload)"
            @send-inspector="(payload) => emit('send-inspector', payload)"
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
            <p class="room-says" data-test="room-says" :style="inkLineStyle('room-says')">
              the room says
              <template v-if="!estimateMoved"
                ><span class="ink-ring">{{ formatYen(d.guideValueYen) }}</span></template
              >
              <template v-else>
                <span class="was">{{ formatYen(d.guideValueYen) }}</span>
                <span :class="estimateAbove ? 'up' : 'down'">{{
                  formatYen(displayedEstimateYen)
                }}</span>
              </template>
              <HelpHint label="The ledger">
                Book price, minus what's broken, plus real upgrades. Doubts price at the odds, till
                proven.
              </HelpHint>
            </p>

            <!-- The spread line: only once a finding exists, right under the
                 room-versus-yours figures it explains. -->
            <p
              v-if="hasResolvedFinding"
              class="spread-line"
              data-test="spread-line"
              :style="inkLineStyle('spread-line')"
            >
              Your number prices what you found. The room's doesn't.
            </p>

            <p class="work-row" :data-test="'work-row-' + workRow.state">
              <span class="work-label">{{ workRow.label }}</span>
              <span v-if="workRow.figure" class="work-figure" data-test="work-row-figure">{{
                workRow.figure
              }}</span>
              <span
                v-if="workRow.subText"
                class="work-subtext"
                data-test="work-row-subtext"
                :style="inkLineStyle('work-subtext')"
                >{{ workRow.subText }}</span
              >
            </p>

            <ul class="ledger">
              <li
                v-for="line in ledgerBreakdown"
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
              :show-send-inspector="showSendInspector"
              :inspector-name="inspectorName"
              :show-inspector-done="showInspectorDone"
              @run-test="(payload) => emit('run-test', payload)"
              @send-inspector="(payload) => emit('send-inspector', payload)"
            />

            <slot name="info" />

            <!-- The bid guidance: only once a finding exists, sitting right
                 above the bid stack (`actions` slot) it advises. -->
            <p
              v-if="hasResolvedFinding"
              class="bid-guidance"
              data-test="bid-guidance"
              :style="inkLineStyle('bid-guidance')"
            >
              Your number already carries what you found. Bid to it; past it, the room is paying for
              a car you know better than they do.
            </p>
          </div>

          <!-- The buy stack, stapled on like a carbon-copy action slip. -->
          <div class="carbon-slip">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The wrapper generates no box of its own, so the folder below becomes the
   direct grid item of the parent's `.lot` container. */
.lot-card {
  display: contents;
}

/*
 * The manila folder: the card's own root box now (sprint223.md paper look).
 * Fibre grain is two crossed low-alpha diagonal gradients under the manila
 * fill; the tab is a pseudo-element reading the lot's own id straight off
 * `data-lot-number` so no extra text node is needed. The shadow is what
 * seats a warm folder against the app's near-black surfaces around it.
 */
.paper-folder {
  position: relative;
  width: 100%;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035) 0 2px, transparent 2px 7px),
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.04) 0 2px, transparent 2px 7px),
    var(--mg-paper-manila);
  border-radius: 8px;
  padding: 20px 10px 10px;
  box-shadow:
    0 16px 30px rgba(0, 0, 0, 0.55),
    0 4px 10px rgba(0, 0, 0, 0.4);
}

.paper-folder::before {
  content: attr(data-lot-number);
  position: absolute;
  top: -13px;
  left: 18px;
  padding: 3px 12px 5px;
  background: var(--mg-paper-manila-dark);
  color: var(--mg-paper-ink);
  font-family: 'Courier New', monospace;
  font-variant: small-caps;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  border-radius: 4px 4px 0 0;
  box-shadow: inset 0 -2px 3px rgba(0, 0, 0, 0.2);
}

/* The aged-white form, inset from the folder edges, carrying the card's
   real content. Fibre grain again, lighter than the folder's. */
.paper-sheet {
  position: relative;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--mg-space-3);
  margin: 10px;
  padding: var(--mg-space-3);
  border-radius: 4px;
  background:
    repeating-linear-gradient(80deg, rgba(0, 0, 0, 0.015) 0 2px, transparent 2px 8px),
    var(--mg-paper-sheet);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  color: var(--mg-paper-ink);
  font-family: 'Courier New', monospace;
}

/* Human wear (sprint223.md): coffee rings, a folded corner, pencil-grey
   edge smudges - all seeded per lot instance, all decorative. */
.coffee-ring {
  position: absolute;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(
    circle at center,
    transparent 0 58%,
    var(--mg-paper-coffee) 61% 71%,
    transparent 74%
  );
  pointer-events: none;
}

.coffee-ring-second {
  transform: translate(9px, 7px) scale(0.82);
  opacity: 0.7;
}

.coffee-ring.corner-top-left {
  top: 8px;
  left: 8px;
}

.coffee-ring.corner-top-right {
  top: 8px;
  right: 8px;
}

.coffee-ring.corner-bottom-left {
  bottom: 8px;
  left: 8px;
}

.coffee-ring.corner-bottom-right {
  bottom: 8px;
  right: 8px;
}

.folded-corner {
  position: absolute;
  width: 26px;
  height: 26px;
  pointer-events: none;
}

.folded-corner.fold-top-right {
  top: 0;
  right: 0;
  background: linear-gradient(135deg, var(--mg-paper-sheet-dark), var(--mg-paper-manila-dark));
  clip-path: polygon(100% 0, 0 0, 100% 100%);
  box-shadow: -2px 2px 5px rgba(0, 0, 0, 0.35);
}

.folded-corner.fold-bottom-left {
  bottom: 0;
  left: 0;
  background: linear-gradient(315deg, var(--mg-paper-sheet-dark), var(--mg-paper-manila-dark));
  clip-path: polygon(0 100%, 0 0, 100% 100%);
  box-shadow: 2px -2px 5px rgba(0, 0, 0, 0.35);
}

.pencil-smudge {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(ellipse, var(--mg-paper-pencil) 0%, transparent 72%);
  pointer-events: none;
}

.smudge-a {
  width: 60px;
  height: 16px;
  top: 42%;
  left: -8px;
  opacity: 0.16;
  transform: rotate(-8deg);
}

.smudge-b {
  width: 50px;
  height: 14px;
  bottom: 10%;
  right: -6px;
  opacity: 0.13;
  transform: rotate(18deg);
}

/* The fixed-width left identity panel (art + grades) and the flexible right
   panel (money + bid stack), now laid out by the sheet's own grid rather
   than the parent screen's. */
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

/* Ruled lines sit behind the ledger/info section only, not the whole sheet -
   this is the value block a real inspection form would rule for figures. */
.lot-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-2);
  padding: var(--mg-space-2);
  border-radius: 3px;
  background: repeating-linear-gradient(
    var(--mg-paper-ruled) 0,
    var(--mg-paper-ruled) 1px,
    transparent 1px,
    transparent 22px
  );
}

.lot-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* The Polaroid: a white-framed photo of the car, stapled or paperclipped to
   the sheet, holding the untouched `.lot-art` placeholder as its photo
   well. */
.polaroid {
  position: relative;
  width: 92%;
  margin: 6px auto 16px;
  padding: 8px 8px 26px;
  background: #f5f3ee;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.45),
    0 2px 4px rgba(0, 0, 0, 0.3);
}

/* The 2:1 art placeholder is now the Polaroid's photo well: a muted
   sky-to-tarmac backdrop behind a clip-path car silhouette (::before) and
   layered wheels/grain/vignette (::after), all seeded/derived, no assets. */
.lot-art {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 1;
  overflow: hidden;
  background: linear-gradient(to bottom, #7f96ab 0%, #aab8bd 44%, #55585a 46%, #34363a 100%);
}

.lot-art::before {
  content: '';
  position: absolute;
  left: 9%;
  bottom: 18%;
  width: 82%;
  height: 40%;
  background: var(--photo-car-colour, #5b6b7a);
  filter: brightness(0.92);
  clip-path: polygon(
    2% 68%,
    0% 62%,
    0% 52%,
    5% 44%,
    11% 32%,
    15% 19%,
    27% 10%,
    47% 5%,
    59% 6%,
    70% 14%,
    76% 26%,
    85% 29%,
    97% 39%,
    100% 51%,
    100% 63%,
    96% 67%,
    90% 78%,
    86% 84%,
    78% 84%,
    74% 78%,
    70% 68%,
    30% 68%,
    26% 78%,
    22% 84%,
    14% 84%,
    10% 78%,
    6% 67%
  );
}

.lot-art::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle 7px at 24% 76%, #141516 0 58%, #303234 62% 80%, transparent 82%),
    radial-gradient(circle 7px at 77% 76%, #141516 0 58%, #303234 62% 80%, transparent 82%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.4) 100%);
}

.polaroid-attachment {
  position: absolute;
  top: 0;
  left: 50%;
  pointer-events: none;
}

.attachment-staple {
  width: 1px;
  height: 1px;
}

.attachment-staple::before,
.attachment-staple::after {
  content: '';
  position: absolute;
  top: 1px;
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, #6b6e72, #d8dbdf 45%, #6b6e72 100%);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.attachment-staple::before {
  left: -18px;
  transform: rotate(-9deg);
}

.attachment-staple::after {
  left: 6px;
  transform: rotate(9deg);
}

.attachment-paperclip {
  width: 16px;
  height: 24px;
  transform: translateX(-50%) translateY(-14px);
  border: 2px solid #cfd2d6;
  border-radius: 6px 6px 9px 9px;
  background: linear-gradient(180deg, #eef0f2, #9a9da2);
}

.attachment-paperclip::before {
  content: '';
  position: absolute;
  inset: 3px;
  border: 2px solid #b7bac0;
  border-radius: 4px 4px 7px 7px;
}

.polaroid-lip {
  margin-top: 4px;
  font-family: 'Nothing You Could Do', 'Ink Free', 'Segoe Print', cursive;
  color: var(--mg-paper-ink);
  font-size: 15px;
  text-align: center;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grade-stamps {
  display: flex;
  gap: var(--mg-space-2);
  justify-content: center;
}

.lot-name {
  color: var(--mg-paper-ink);
  font-weight: bold;
}

/* A small muted class chip so a bidder knows which class of parts this car
   takes (Kei & Compact / Sports / ...). */
.class-chip {
  display: inline-block;
  margin-left: var(--mg-space-2);
  padding: 0 var(--mg-space-1);
  border: 1px solid var(--mg-paper-ink);
  border-radius: 4px;
  color: var(--mg-paper-ink);
  font-size: var(--mg-fs-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  vertical-align: middle;
}

.lot-meta,
.lot-turnout {
  color: var(--mg-paper-ink);
  opacity: 0.75;
  font-size: var(--mg-fs-sm);
}

/*
 * Two-inks rule (sprint223.md): printed type is what the paper claims, but
 * the room's own read is what an inspector pencils in the margin as they
 * hear it called - room-says, the spread line, bid guidance and the work
 * row's subtext are all handwritten, biro blue, each with its own seeded
 * tilt and left-margin jitter so no two lines sit dead level or aligned to
 * the ruled lines behind them.
 */
.room-says {
  margin: 0;
  padding-top: 4px;
  color: var(--mg-paper-biro);
  font-family: 'Nothing You Could Do', 'Ink Free', 'Segoe Print', cursive;
  font-size: var(--mg-fs-md);
}

/* The hand-drawn ellipse a reader circles the headline figure with - only
   the plain (unmoved) case gets it, wrapping its own figure in plain ink
   colour (a red-pen ring around a black-inked number). The moved case's
   `.up`/`.down` carry no ring at all, matching the reference exactly. */
.ink-ring {
  position: relative;
  display: inline-block;
  padding: 1px 9px 2px;
  color: var(--mg-paper-ink);
}

.ink-ring::before {
  content: '';
  position: absolute;
  inset: -3px -7px;
  border: 2.5px solid rgba(168, 58, 44, 0.8);
  border-radius: 47% 53% 50% 50% / 62% 58% 42% 58%;
  transform: rotate(-1.8deg);
  pointer-events: none;
}

.ink-ring,
.room-says .was,
.room-says .up,
.room-says .down {
  font-weight: 700;
}

/* Once the player's own number diverges from the room's read, the room
 * figure gets a hand-drawn strike (not text-decoration - a rotated pseudo-
 * element in biro, the same idiom the eliminated causes use) and fades to a
 * warm grey; the player's figure sits beside it, green above / red below -
 * the same struck-original idiom the auction room demo's est-value line
 * uses. */
.room-says .was {
  position: relative;
  color: rgba(43, 38, 32, 0.55);
  margin-right: 6px;
}

.room-says .was::after {
  content: '';
  position: absolute;
  left: -3px;
  right: -3px;
  top: 52%;
  height: 2px;
  background: var(--mg-paper-biro);
  transform: rotate(-2.2deg);
  opacity: 0.85;
}

.room-says .up {
  color: var(--mg-paper-stamp-green);
}

.room-says .down {
  color: var(--mg-paper-stamp-red);
}

/* The spread line: quiet ink tier - a step down from the verdict/room-says
   in both size and colour, so those two stay the loud reading on the sheet. */
.spread-line {
  margin: 0;
  padding-top: 2px;
  color: var(--mg-paper-ink-quiet);
  font-family: 'Nothing You Could Do', 'Ink Free', 'Segoe Print', cursive;
  font-size: 13.5px;
}

/* The bid guidance: sits directly above the bid stack, quiet ink like the
   spread line - coaching, not the answer itself. */
.bid-guidance {
  margin: 0;
  padding-top: var(--mg-space-2);
  border-top: 1px dashed rgba(43, 38, 32, 0.3);
  color: var(--mg-paper-ink-quiet);
  font-family: 'Nothing You Could Do', 'Ink Free', 'Segoe Print', cursive;
  font-size: 13.5px;
  text-align: center;
}

/* The forward-looking work row, between the room's number and the
   breakdown that explains it: what fixing this car up adds. Label and
   figure are printed (typed); the subtext (the plain-language "for X in
   parts and labour") is the handwritten gloss on it. */
.work-row {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: var(--mg-fs-sm);
}

.work-label {
  color: var(--mg-paper-ink);
  text-transform: uppercase;
  font-size: var(--mg-fs-xs, 0.7rem);
  letter-spacing: 0.08em;
  border-bottom: 1px solid rgba(43, 38, 32, 0.3);
  padding-bottom: 1px;
}

.work-figure {
  color: var(--mg-paper-ink);
  font-weight: bold;
  margin-left: 0.35em;
}

.work-subtext {
  display: block;
  padding-top: 3px;
  color: var(--mg-paper-ink-quiet);
  font-family: 'Nothing You Could Do', 'Ink Free', 'Segoe Print', cursive;
  font-size: 13px;
}

/* The compact receipt under the room's number: a printed table, label left
   with a dotted leader to a right-aligned yen figure. */
.ledger {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 3px;
  width: 100%;
  max-width: 240px;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-paper-ink);
}

.ledger-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-2);
}

.ledger-label {
  flex: 1;
  border-bottom: 1px dotted rgba(43, 38, 32, 0.45);
  padding-bottom: 1px;
}

.ledger-yen {
  font-weight: 600;
  white-space: nowrap;
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
  color: var(--mg-paper-ink);
  opacity: 0.6;
}

.turnout-steady {
  color: #2f6f6b;
}

.turnout-packed {
  color: var(--mg-paper-stamp-red);
}

/* The buy stack, stapled on like a carbon-copy action slip - a pinkish,
   low-saturation tone distinct from the sheet, its own small tilt. Buttons
   keep their own affordance; only their colours re-tone (AuctionScreen.vue
   owns the actual button rules, since it defines their markup). */
.carbon-slip {
  width: 100%;
  padding: var(--mg-space-2) var(--mg-space-3);
  border: 1px dashed rgba(43, 38, 32, 0.35);
  border-radius: 4px;
  background: linear-gradient(180deg, var(--mg-paper-carbon), #cec2be);
  transform: rotate(-0.6deg);
}
</style>
