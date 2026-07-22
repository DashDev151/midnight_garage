<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { AuctionTier } from '@midnight-garage/content'
import AuctionLotCard from '../components/AuctionLotCard.vue'
import LabourBar from '../components/LabourBar.vue'
import { useGameStore, type LotDetail } from '../stores/gameStore'
import { AUCTION_TIER_LABELS } from '../utils/auctionTierLabels'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

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

// Resolve each lot's detail once per render (avoids repeated lookups + template `!`).
const allGroups = computed(() =>
  game.auctionLotsByTier.map((g) => ({
    tier: g.tier,
    lots: g.lots.map((l) => game.lotDetail(l.id)).filter((d): d is LotDetail => d !== undefined),
  })),
)

const totalLots = computed(() => allGroups.value.reduce((n, g) => n + g.lots.length, 0))

const hasLots = computed(() => totalLots.value > 0)
</script>

<template>
  <section class="auctions">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>Auctions</h2>
      <p class="cash">
        {{ formatYen(game.cashYen) }} ·
        <LabourBar
          compact
          caption="labour"
          :remaining="game.laborSlotsRemainingToday"
          :max="game.laborSlotsPerDay"
        />
      </p>
    </header>

    <!-- The active yard visit's own fixed panel - dies at day end (`advanceDay`)
         or the moment a different tier's visit starts, never lingers past
         either. -->
    <p v-if="game.inspectionVisit" class="visit-panel" data-test="visit-panel">
      At the yard ({{ AUCTION_TIER_LABELS[game.inspectionVisit.tier] }}):
      {{ game.inspectionVisit.minutesLeft }}m left
    </p>

    <p v-if="!hasLots" class="empty">
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
        <h3>{{ AUCTION_TIER_LABELS[group.tier] }}</h3>
        <button
          v-if="!isActiveVisitTier(group.tier)"
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
      <ul class="lots">
        <li v-for="d in group.lots" :key="d.lot.id" class="lot">
          <!-- The shared production card draws the identity panel, grades, the
               public symptom checklist, and the room's number and ledger. The
               buy stack drops into its slots. -->
          <AuctionLotCard
            :d="d"
            :disabled-reason-for="(t) => testDisabledReason(d.lot.tier, t)"
            :player-estimate-yen="d.playerEstimateYen"
            @run-test="({ lotId, symptomIndex, testId }) => onRunTest(lotId, symptomIndex, testId)"
          >
            <template #info>
              <div class="lot-secondary">
                <span>reserve {{ formatYen(d.reserveYen) }}</span>
              </div>
            </template>

            <template #actions>
              <div class="seat-row">
                <RouterLink
                  class="seat-link"
                  :data-test="'take-seat-' + d.lot.id"
                  :to="{ name: 'auction-room', params: { lotId: d.lot.id } }"
                >
                  Take a seat
                </RouterLink>
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

.cash {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
  margin: var(--mg-space-3) 0;
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
