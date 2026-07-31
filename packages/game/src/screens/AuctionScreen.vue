<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { AUCTION_TIER_COPY, type AuctionTier } from '@midnight-garage/content'
import { dayOfWeekName } from '@midnight-garage/sim'
import AuctionLotCard from '../components/AuctionLotCard.vue'
import { useGameStore, type LotDetail } from '../stores/gameStore'
import { AUCTION_TIER_LABELS, venueLabelFor } from '../utils/auctionTierLabels'
import { formatYen } from '../utils/formatYen'

/** Every tier in display order - `AUCTION_TIER_LABELS`' own key order
 * (local-yard, regional, premium, collector-network), reused rather than a
 * second hand-written literal list. */
const TIER_ORDER = Object.keys(AUCTION_TIER_LABELS) as AuctionTier[]

/** The locked-tier guarantor line - `local-yard` is never locked, so this
 * is only ever called behind a `!group.unlocked` guard. */
function lockedTierCopyFor(tier: AuctionTier): string {
  if (tier === 'local-yard') return ''
  return AUCTION_TIER_COPY[tier]
}

const game = useGameStore()
const router = useRouter()

const GATE_REASON_LABEL: Record<string, string> = {
  // Labour is a continuous bar now, not integer slots.
  'no-labor-slot': 'No labour left today',
  'no-cash': 'Not enough cash for the travel fee',
  'no-lots': 'No lots at this tier to inspect',
}

/** True for the one tier (if any) the active visit is already at - that
 * tier's own button is redundant with the fixed visit panel, so it hides
 * rather than offering a pointless same-tier restart. */
function isActiveVisitTier(tier: AuctionTier): boolean {
  return game.inspectionVisit?.tier === tier
}

function inspectButtonTitle(tier: AuctionTier): string {
  const reason = game.inspectionVisitGateReason(tier)
  if (reason) return GATE_REASON_LABEL[reason] ?? reason
  return `Spend ${game.actionPoints.inspectionVisit} labour + ${formatYen(game.travelFeeYenFor(tier))} to inspect lots here`
}

/** Starting a visit at a DIFFERENT tier while one is still active with
 * minutes left forfeits the remainder - a real cost (a spent labour slot and
 * fee, gone for nothing) that needs the same two-step arm-then-confirm the
 * buyout button already uses, not a silent replace.
 */
const visitConfirmingTier = ref<AuctionTier | null>(null)

function onInspectClick(tier: AuctionTier): void {
  const active = game.inspectionVisit
  const wouldForfeit = active !== null && active.minutesLeft > 0 && active.tier !== tier
  if (wouldForfeit && visitConfirmingTier.value !== tier) {
    visitConfirmingTier.value = tier
    return
  }
  visitConfirmingTier.value = null
  game.beginInspectionVisit(tier)
}

function inspectButtonLabel(tier: AuctionTier): string {
  if (visitConfirmingTier.value === tier) return 'Forfeit remaining visit - start here?'
  return `Inspect here (${game.actionPoints.inspectionVisit} labour + ${formatYen(game.travelFeeYenFor(tier))})`
}

/** Runs a diagnostic test against the visit clock - the store derives the
 * trail's own result line, so nothing here needs to remember what it returns. */
function onRunTest(lotId: string, symptomIndex: number, testId: string): void {
  game.runDiagnosticTest(lotId, symptomIndex, testId)
}

/** Which lots have actually had a send-inspector pass run this session - a
 * quiet screen-local record (mirrors `buyoutConfirming`'s own per-lot
 * reactive idiom), so the done line stays visible even once the button
 * itself hides again (the gate closing on `already-resolved` or
 * `not-enough-minutes`). Never cleared; a fresh visit to Auctions starts
 * clean. */
const inspectorDoneLotIds = reactive<Record<string, boolean>>({})

function onSendInspector(lotId: string): void {
  if (game.resolveSendInspector(lotId)) inspectorDoneLotIds[lotId] = true
}

/** Why a specific test button is disabled right now, `null` when it isn't -
 * the yard visit's own proactive "why not" for a single test. */
function testDisabledReason(
  lotTier: AuctionTier,
  test: { minutes: number; alreadyRun: boolean },
): string | null {
  const visit = game.inspectionVisit
  if (!visit) return 'Start a visit at this tier first'
  if (visit.tier !== lotTier) return 'Your active visit is at a different tier'
  if (test.alreadyRun) return 'Already run on this symptom'
  if (visit.minutesLeft < test.minutes)
    return `Needs ${test.minutes}m - only ${visit.minutesLeft}m left`
  return null
}

/** The "Take a seat" control's disabled-reason title - the room-entry
 * admission is 0 for every tier at current tuning, so this only ever reads
 * as a real refusal once a tier's fee is tuned above 0. */
function seatButtonTitle(tier: AuctionTier): string {
  if (game.attendAuctionGateReason(tier)) {
    return `Not enough cash - admission is ${formatYen(game.attendanceFeeYenFor(tier))}`
  }
  return 'Take a seat at this room'
}

function onTakeSeat(lotId: string): void {
  void router.push({ name: 'auction-room', params: { lotId } })
}

/** Buy Now is a two-step commit - the first click arms this per-lot confirm
 * state, the second actually buys. A car is expensive and irreversible, so it
 * must never fire on a single stray click; the same two-step pattern the End
 * Day cart-confirm and New Game confirm use.
 */
const buyoutConfirming = reactive<Record<string, boolean>>({})

function onBuyoutClick(lotId: string): void {
  if (buyoutConfirming[lotId]) {
    buyoutConfirming[lotId] = false
    game.buyout(lotId)
  } else {
    // Only one lot is ever armed at a time - arming this one disarms any
    // other, so a stale confirm on a different card can't linger.
    for (const id of Object.keys(buyoutConfirming)) buyoutConfirming[id] = false
    buyoutConfirming[lotId] = true
  }
}

/** The shop's real capacity (parking + every service bay) is full, but the
 * one grace/"double parking" overflow slot is not - a won lot still has
 * somewhere to go, it just double-parks and starts costing a daily fine
 * rather than being genuinely lost.
 */
const willDoubleParkOnWin = computed(() => game.shopAtCapacity && !game.graceSlotOccupied)

/** Real capacity AND the grace slot are both full - only now does a won lot
 * have genuinely nowhere to go and get forfeited to a rival.
 */
const willBeLostOnWin = computed(() => game.shopAtCapacity && game.graceSlotOccupied)

interface TierGroup {
  tier: AuctionTier
  unlocked: boolean
  /** Whether this room is sitting today (`auction.cadenceByTier`). Always
   * false for a locked tier, which has no hours worth naming yet. */
  open: boolean
  lots: LotDetail[]
}

/** Every tier, in display order. An unlocked room that is sitting today
 * carries its resolved lot details (avoids repeated lookups + template `!`);
 * an unlocked room that is shut renders its own closed line instead of a
 * board; an unlocked, open room with nothing currently on the board renders
 * nothing; a locked tier always renders, with its guarantor copy standing in
 * for a board it doesn't have yet. */
const allGroups = computed<TierGroup[]>(() => {
  const lotsByTier = new Map(game.auctionLotsByTier.map((g) => [g.tier, g.lots]))
  return TIER_ORDER.flatMap((tier): TierGroup[] => {
    if (!game.unlockedAuctionTiers.includes(tier)) {
      return [{ tier, unlocked: false, open: false, lots: [] }]
    }
    if (!game.openAuctionTiers.includes(tier)) {
      return [{ tier, unlocked: true, open: false, lots: [] }]
    }
    const lots = lotsByTier.get(tier)
    if (!lots) return []
    return [
      {
        tier,
        unlocked: true,
        open: true,
        lots: lots.map((l) => game.lotDetail(l.id)).filter((d): d is LotDetail => d !== undefined),
      },
    ]
  })
})

const totalLots = computed(() => allGroups.value.reduce((n, g) => n + g.lots.length, 0))

const hasLots = computed(() => totalLots.value > 0)

/** Every room whose doors are open today, named - the line at the top of the
 * screen. Each room keeps its own hours (sprint150.md), and two rooms open
 * on the same day is normal, so this is a list rather than a single day. */
const openRoomNames = computed(() =>
  game.openAuctionTiers.map((tier) => venueLabelFor(tier, game.gameState.venueNameByTier)),
)

/** When a shut room next opens, in the words someone would actually use:
 * "tomorrow" for the next day, the weekday for anything inside this coming
 * week, and "a week on Saturday" for the collector network's fortnightly
 * sitting. Empty when the cadence somehow names no future sitting at all,
 * which the schema's `openDaysOfWeek` minimum makes unreachable. */
function nextOpenPhraseFor(tier: AuctionTier): string {
  const nextDay = game.nextOpenDayFor(tier)
  if (nextDay === null) return ''
  const daysAhead = nextDay - game.day
  if (daysAhead === 1) return 'tomorrow'
  const weekday = dayOfWeekName(nextDay, game.context.economy)
  if (daysAhead <= game.context.economy.calendar.daysPerWeek) return `on ${weekday}`
  return `a week on ${weekday}`
}
</script>

<template>
  <section class="auctions">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>Auctions</h2>
    </header>

    <!-- Every room keeps its own hours (`auction.cadenceByTier`,
         sprint150.md), so the screen names who is sitting today rather than
         showing one shutter over the whole house. Two rooms open at once is
         normal, and sitting at one costs no part of the day. -->
    <p v-if="openRoomNames.length > 0" class="open-today" data-test="auction-open-today">
      Open today: {{ openRoomNames.join(', ') }}.
    </p>
    <p v-else class="closed" data-test="auction-closed">
      Every room is shut today. Check the doors below for when the next one sits.
    </p>

    <!-- The active yard visit's own fixed panel - dies at day end (`advanceDay`)
         or the moment a different tier's visit starts, never lingers past
         either. -->
    <p v-if="game.inspectionVisit" class="visit-panel" data-test="visit-panel">
      At the yard ({{ venueLabelFor(game.inspectionVisit.tier, game.gameState.venueNameByTier) }}):
      {{ game.inspectionVisit.minutesLeft }}m left
    </p>

    <p v-if="openRoomNames.length > 0 && !hasLots" class="empty">
      No lots listed right now. New cars roll in most days; press End Day and check back.
    </p>

    <p v-if="willBeLostOnWin" class="parking-warning" data-test="lost-warning">
      The shop is full AND the double-parking overflow spot is already taken - a won lot has nowhere
      to go and will be lost to a rival. Free up a bay, sell a car, or buy more capacity first.
    </p>
    <p v-else-if="willDoubleParkOnWin" class="double-park-warning" data-test="double-park-warning">
      The shop is full - a won lot will double-park in the one unowned overflow spot and cost a
      daily fine until real space opens up. Free up a bay or buy more capacity to avoid it.
    </p>

    <div v-for="group in allGroups" :key="group.tier" class="tier">
      <div class="tier-head">
        <h3>
          {{
            group.unlocked
              ? venueLabelFor(group.tier, game.gameState.venueNameByTier)
              : AUCTION_TIER_LABELS[group.tier]
          }}
        </h3>
        <button
          v-if="group.open && !isActiveVisitTier(group.tier)"
          type="button"
          class="inspect-visit"
          :class="{ confirming: visitConfirmingTier === group.tier }"
          :disabled="!!game.inspectionVisitGateReason(group.tier)"
          :title="inspectButtonTitle(group.tier)"
          :data-test="'inspect-visit-' + group.tier"
          @click="onInspectClick(group.tier)"
        >
          {{ inspectButtonLabel(group.tier) }}
        </button>
      </div>
      <p v-if="!group.unlocked" class="locked-tier" :data-test="'locked-tier-' + group.tier">
        {{ lockedTierCopyFor(group.tier) }}
      </p>
      <!-- A shut room says when it sits next, in plain words - waiting for a
           room to open is the shape of the week, not a problem to fix. -->
      <p v-else-if="!group.open" class="closed-tier" :data-test="'closed-tier-' + group.tier">
        Shutters down. This one sits again {{ nextOpenPhraseFor(group.tier) }}.
      </p>
      <ul v-else class="lots">
        <li v-for="d in group.lots" :key="d.lot.id" class="lot">
          <!-- The shared production card draws the identity panel, grades, the
               public symptom checklist, and the room's number and ledger. The
               buy stack drops into its slots. -->
          <AuctionLotCard
            :d="d"
            :disabled-reason-for="(t) => testDisabledReason(d.lot.tier, t)"
            :player-estimate-yen="d.playerEstimateYen"
            :show-send-inspector="game.sendInspectorGateReason(d.lot.id) === null"
            :inspector-name="game.masterInspectorName ?? ''"
            :show-inspector-done="!!inspectorDoneLotIds[d.lot.id]"
            @run-test="({ lotId, symptomIndex, testId }) => onRunTest(lotId, symptomIndex, testId)"
            @send-inspector="({ lotId }) => onSendInspector(lotId)"
          >
            <template #info>
              <div class="lot-secondary">
                <span>reserve {{ formatYen(d.reserveYen) }}</span>
              </div>
            </template>

            <template #actions>
              <div class="seat-row">
                <button
                  type="button"
                  class="seat-link"
                  :disabled="!!game.attendAuctionGateReason(d.lot.tier)"
                  :title="seatButtonTitle(d.lot.tier)"
                  :data-test="'take-seat-' + d.lot.id"
                  @click="onTakeSeat(d.lot.id)"
                >
                  Take a seat
                </button>
              </div>
              <!-- Buy Now takes two clicks - it can never fire on a stray press. -->
              <div class="buyout-row">
                <button
                  class="buyout"
                  :class="{ confirming: buyoutConfirming[d.lot.id] }"
                  :disabled="game.cashYen < d.buyoutPriceYen"
                  :title="
                    game.cashYen < d.buyoutPriceYen
                      ? 'Not enough cash - Buy Now costs ' + formatYen(d.buyoutPriceYen)
                      : 'Skip the bidding and buy this lot outright'
                  "
                  :data-test="'buyout-' + d.lot.id"
                  @click="onBuyoutClick(d.lot.id)"
                >
                  {{
                    buyoutConfirming[d.lot.id]
                      ? 'Confirm buyout (' + formatYen(d.buyoutPriceYen) + ')'
                      : 'Buy now (' + formatYen(d.buyoutPriceYen) + ')'
                  }}
                </button>
              </div>
            </template>
          </AuctionLotCard>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.tier-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.tier-head h3 {
  margin: 0 0 var(--mg-space-2);
}

/* A visible secondary control, not a ghost chip - amber text and border on
   the panel colour, kept small so it never competes with the tier heading. */
.inspect-visit {
  font-size: var(--mg-fs-sm);
  color: var(--mg-neon-violet);
  border-color: var(--mg-neon-violet);
  background: var(--mg-panel);
}

.inspect-visit.confirming {
  border-color: var(--mg-neon-pink);
  color: var(--mg-neon-pink);
}

/* The guarantor line stands in for a board that doesn't exist yet - muted,
   like `.empty`, never styled as an error or a warning. */
.locked-tier {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-4);
}

.empty {
  color: var(--mg-text-dim);
  margin: var(--mg-space-3) 0;
}

/* Which rooms are sitting today - the first thing the screen answers, so it
   gets ordinary text weight rather than the dim treatment the shut notices
   below take. */
.open-today {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

/* The whole-house closed sign - unreachable under the shipped cadence, since
   the local yard sits four days a week and every other day belongs to some
   room, but a tuned cadence could leave a gap. Muted, like
   `.empty`/`.locked-tier`, never styled as an error. */
.closed {
  color: var(--mg-text-dim);
  margin: var(--mg-space-3) 0;
}

/* One room's own shutters, and when they go up again - same muted treatment
   as the guarantor line it sits alongside: waiting for a room to open is the
   shape of the week, not a problem to fix. */
.closed-tier {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-4);
}

/* A real clock the player is spending, so it gets the same weight as the
   parking/double-park warnings below rather than blending into `.cash`. */
.visit-panel {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-2) 0;
  padding: var(--mg-space-1) var(--mg-space-3);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  width: fit-content;
}

.parking-warning {
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-3) 0;
}

.double-park-warning {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-3) 0;
}

.lots {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-3);
}

/* The two-panel card - a fixed-width left identity panel (art + grades) and
   a flexible right panel (money + buy stack). */
.lot {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--mg-space-3);
}

/* Rule-of-glow compliance (art-direction.md 2): stamps stay muted at rest
   (GradeStamp's own default), reaching full ink saturation only while this
   specific card is hovered or has focus inside it (tabbing into the buyout
   button counts) - reaching into the child component's scoped class via
   `:deep()`, the standard Vue mechanism for this. */
.lot:hover :deep(.grade-stamp),
.lot:focus-within :deep(.grade-stamp) {
  filter: saturate(1) brightness(1);
}

.lot-secondary {
  display: flex;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  justify-content: center;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The room seat CTA: the primary next action on a lot, above the ghost
   buyout control below it. */
.seat-row {
  display: flex;
  justify-content: center;
}

.seat-link {
  display: inline-block;
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border: 1px solid var(--mg-neon-violet);
  border-radius: 4px;
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
  text-decoration: none;
}

/* Buy Now is a small ghost control below the reserve/estimate lines. */
.buyout-row {
  margin-top: var(--mg-space-2);
  padding-top: var(--mg-space-2);
  border-top: var(--mg-border);
  display: flex;
  justify-content: center;
}

.buyout {
  background: transparent;
  border-color: var(--mg-panel-edge);
  color: var(--mg-text-dim);
  padding: 2px var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.buyout:disabled {
  opacity: 0.5;
  cursor: default;
}

/* The armed second-click state - now it reads as a real commitment. */
.buyout.confirming {
  border-color: var(--mg-neon-pink);
  color: var(--mg-neon-pink);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
