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

// Per-lot raise input; empty defaults to the minimum next raise.
const bidInputs = reactive<Record<string, number | undefined>>({})

/** Sprint 74 decision 7: the yard visit panel and per-tier "Inspect here"
 * button. */
const GATE_REASON_LABEL: Record<string, string> = {
  // Sprint 94: labour is a continuous bar now, not integer slots.
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

/**
 * Sprint 74 decision 7: starting a visit at a DIFFERENT tier while one is
 * still active with minutes left forfeits the remainder - a real cost (a
 * spent labour slot and fee, gone for nothing) that needs the same two-step
 * arm-then-confirm the buyout button already uses, not a silent replace.
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

/**
 * Sprint 64 (item 3): Buy Now is a two-step commit - the first click arms
 * this per-lot confirm state, the second actually buys. A car is expensive
 * and irreversible, so it must never fire on a single stray click; the same
 * two-step pattern the End Day cart-confirm and New Game confirm use.
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

/**
 * Sprint 45: the shop's real capacity (parking + every service bay) is full,
 * but the one grace/"double parking" overflow slot is not - a won lot still
 * has somewhere to go, it just double-parks and starts costing a daily fine
 * rather than being genuinely lost.
 */
const willDoubleParkOnWin = computed(() => game.shopAtCapacity && !game.graceSlotOccupied)

/**
 * Sprint 45: real capacity AND the grace slot are both full - only now does
 * a won lot have genuinely nowhere to go and get forfeited to a rival.
 */
const willBeLostOnWin = computed(() => game.shopAtCapacity && game.graceSlotOccupied)

/**
 * Board filters. The auction cadence got a lot busier (Sprint 66 roughly
 * doubled arrivals), so the board needs a way to cut itself down to what a
 * player can actually act on.
 *
 * Both filters read ONE number - `nextRaiseYen`, what it costs to get INTO
 * this lot right now (the reserve on an unbid lot, the next ladder step on a
 * contested one). Deliberately not the buyout price: filtering on buyout would
 * hide lots you could win cheaply by bidding, which is most of them, and
 * bidding is the point of an auction. Deliberately not guide value either -
 * that is what the car is worth, not what it costs you today.
 */
const affordableOnly = ref(false)
/** Replaces the old "My Active Bids" table (Sprint 20/50). That section listed
 * every lot you had bid on a second time, in a different shape, above the same
 * cards - two places to read one lot, and the raise control existed twice. A
 * filter says the same thing without the duplicate. */
const myLotsOnly = ref(false)
/** `null` means "unset", which is what keeps the filter honest as the board
 * changes: an unset bound re-reads the CURRENT board rather than pinning to
 * whatever the range happened to be when the player last touched it. */
const minPriceYen = ref<number | null>(null)
const maxPriceYen = ref<number | null>(null)

const SLIDER_STEP_YEN = 10_000

/** The slider's ceiling: the dearest lot actually on the board, rounded up to
 * a whole step. Derived, so the range always spans real lots instead of an
 * authored guess that goes stale the moment the roster or the economy moves. */
const boardMaxYen = computed(() => {
  const prices = allGroups.value.flatMap((g) => g.lots.map((d) => d.nextRaiseYen))
  if (prices.length === 0) return SLIDER_STEP_YEN
  return Math.ceil(Math.max(...prices) / SLIDER_STEP_YEN) * SLIDER_STEP_YEN
})

/**
 * The two handles. A handle parked at its own end of the track means "no
 * bound", which is why these map to `null` there - otherwise a full-width
 * range would still count as an active filter and the board would quietly
 * re-filter itself every time a dearer lot arrived.
 *
 * Each setter clamps against the other, so the handles cannot cross.
 *
 * `v-model` is NOT used on these (see `onMinInput`/`onMaxInput`): a rejected
 * drag leaves the model unchanged, so Vue re-renders nothing and the thumb
 * stays where the pointer dropped it - showing one range while the board
 * filters by another.
 */
const minSlider = computed({
  get: () => minPriceYen.value ?? 0,
  set: (value: number) => {
    const clamped = Math.min(value, maxSlider.value)
    minPriceYen.value = clamped <= 0 ? null : clamped
  },
})

const maxSlider = computed({
  get: () => maxPriceYen.value ?? boardMaxYen.value,
  set: (value: number) => {
    const clamped = Math.max(value, minSlider.value)
    maxPriceYen.value = clamped >= boardMaxYen.value ? null : clamped
  },
})

/**
 * Drive the handles by hand rather than with `v-model`, and force the element
 * back onto the value the clamp actually accepted.
 *
 * Why this is not `v-model`: drag max below min and the setter clamps it back
 * to min - which is frequently the value the ref ALREADY held, so nothing
 * reactive changed, so Vue patches nothing, so the thumb sits wherever the
 * pointer left it while the board filters by something else. The control would
 * lie about its own state. Re-asserting the accepted value onto the element
 * makes the clamp visible: the handle springs back, which is what a real
 * physical stop does.
 */
function onMinInput(event: Event): void {
  const el = event.target as HTMLInputElement
  minSlider.value = Number(el.value)
  el.value = String(minSlider.value)
}

function onMaxInput(event: Event): void {
  const el = event.target as HTMLInputElement
  maxSlider.value = Number(el.value)
  el.value = String(maxSlider.value)
}

function matchesFilters(d: LotDetail): boolean {
  const entryYen = d.nextRaiseYen
  // Winning or losing - "my lots" is about having skin in it, not leading.
  if (myLotsOnly.value && !d.playerHasBid) return false
  if (affordableOnly.value && entryYen > game.cashYen) return false
  if (minPriceYen.value !== null && entryYen < minPriceYen.value) return false
  if (maxPriceYen.value !== null && entryYen > maxPriceYen.value) return false
  return true
}

function clearFilters(): void {
  affordableOnly.value = false
  myLotsOnly.value = false
  minPriceYen.value = null
  maxPriceYen.value = null
}

const filtersActive = computed(
  () =>
    affordableOnly.value ||
    myLotsOnly.value ||
    minPriceYen.value !== null ||
    maxPriceYen.value !== null,
)

/** Lots the player has money riding on right now - the count that made the old
 * table feel necessary, kept as a number on the filter itself. */
const myLotCount = computed(
  () => allGroups.value.flatMap((g) => g.lots).filter((d) => d.playerHasBid).length,
)

// Resolve each lot's detail once per render (avoids repeated lookups + template `!`).
const allGroups = computed(() =>
  game.auctionLotsByTier.map((g) => ({
    tier: g.tier,
    lots: g.lots.map((l) => game.lotDetail(l.id)).filter((d): d is LotDetail => d !== undefined),
  })),
)

/** A tier with nothing left after filtering drops out entirely - an empty
 * heading is just noise. */
const detailedGroups = computed(() =>
  allGroups.value
    .map((g) => ({ tier: g.tier, lots: g.lots.filter(matchesFilters) }))
    .filter((g) => g.lots.length > 0),
)

const totalLots = computed(() => allGroups.value.reduce((n, g) => n + g.lots.length, 0))
const shownLots = computed(() => detailedGroups.value.reduce((n, g) => n + g.lots.length, 0))

/** Distinguishes "the board is empty" from "your filters hid everything" -
 * two very different things to tell a player. */
const hasLots = computed(() => totalLots.value > 0)
const hasVisibleLots = computed(() => shownLots.value > 0)

/**
 * Sprint 56 decision 3: the stepper's per-click delta. Once a lot has a real
 * bid on the board, this is the exact ladder increment (`nextRaiseYen` is
 * already `currentBid + one increment`); before a lot has opened,
 * `nextRaiseYen` is a lump-sum reserve, not a step, so the stepper falls
 * back to the sim's own bid-increment floor (`AUCTION_BID_INCREMENT_FRACTION`'s
 * `max(Y10,000, ...)`, `bidding.ts`) as a sensible rounded step. Typing a
 * value directly into the field stays possible either way.
 */
const STEPPER_FALLBACK_STEP_YEN = 10_000

function stepYenFor(d: LotDetail): number {
  const ladderStep = d.nextRaiseYen - d.lot.currentBidYen
  return ladderStep > 0 ? ladderStep : STEPPER_FALLBACK_STEP_YEN
}

function currentBidInput(d: LotDetail): number {
  return bidInputs[d.lot.id] ?? d.nextRaiseYen
}

function incrementBid(d: LotDetail): void {
  bidInputs[d.lot.id] = currentBidInput(d) + stepYenFor(d)
}

/** Never steps below the real minimum valid raise - a physical stepper
 * wouldn't let you dial past its own floor. */
function decrementBid(d: LotDetail): void {
  bidInputs[d.lot.id] = Math.max(d.nextRaiseYen, currentBidInput(d) - stepYenFor(d))
}

/** "current bid + who holds it" (Sprint 20) - the board's headline number,
 * always the real figure, never obfuscated. Sprint 46: "dealer" implied a
 * real, named rival that doesn't exist (`leadingBidder` is just
 * `'player' | 'rival'`) - "leading bid" makes no false claim about who. */
function bidStateLabel(currentBidYen: number, leadingBidder: 'player' | 'rival' | null): string {
  if (currentBidYen <= 0) return 'no bids yet'
  return leadingBidder === 'player'
    ? `you lead at ${formatYen(currentBidYen)}`
    : `leading bid ${formatYen(currentBidYen)}`
}
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

    <!-- Sprint 74 decision 7: the active yard visit's own fixed panel - dies
         at day end (`advanceDay`) or the moment a different tier's visit
         starts, never lingers past either. -->
    <p v-if="game.inspectionVisit" class="visit-panel" data-test="visit-panel">
      At the yard ({{ AUCTION_TIER_LABELS[game.inspectionVisit.tier] }}):
      {{ game.inspectionVisit.minutesLeft }}m left
    </p>

    <p v-if="!hasLots" class="empty">
      No lots listed right now. New cars roll in most days; press End Day and check back.
    </p>

    <div v-if="hasLots" class="filters" data-test="auction-filters">
      <label class="filter-check">
        <input v-model="affordableOnly" type="checkbox" data-test="filter-affordable" />
        Affordable
      </label>
      <label class="filter-check">
        <input v-model="myLotsOnly" type="checkbox" data-test="filter-my-lots" />
        My active lots<span v-if="myLotCount > 0" class="filter-badge">{{ myLotCount }}</span>
      </label>
      <div class="filter-range">
        <span class="filter-legend">Price</span>
        <!-- Two overlapping range inputs: native `type=range` has one handle,
             so a real min/max needs a pair. The track below sits behind them
             and only the thumbs take pointer events, so both stay grabbable
             even where they overlap. -->
        <div class="price-slider">
          <div class="slider-track" aria-hidden="true"></div>
          <div
            class="slider-fill"
            aria-hidden="true"
            :style="{
              left: `${(minSlider / boardMaxYen) * 100}%`,
              right: `${100 - (maxSlider / boardMaxYen) * 100}%`,
            }"
          ></div>
          <input
            type="range"
            :value="minSlider"
            :min="0"
            :max="boardMaxYen"
            :step="SLIDER_STEP_YEN"
            aria-label="Lowest price"
            data-test="filter-min-price"
            @input="onMinInput"
          />
          <input
            type="range"
            :value="maxSlider"
            :min="0"
            :max="boardMaxYen"
            :step="SLIDER_STEP_YEN"
            aria-label="Highest price"
            data-test="filter-max-price"
            @input="onMaxInput"
          />
        </div>
        <span class="filter-readout" data-test="filter-price-readout">
          {{ formatYen(minSlider) }} - {{ formatYen(maxSlider) }}
        </span>
      </div>
      <span class="filter-count" data-test="filter-count"
        >{{ shownLots }}/{{ totalLots }} lots</span
      >
      <button v-if="filtersActive" data-test="filter-clear" @click="clearFilters">Clear</button>
    </div>

    <p v-if="hasLots && !hasVisibleLots" class="empty" data-test="all-filtered">
      {{ totalLots }} lots on the board, none matching your filters. Widen the price range or untick
      Affordable.
    </p>

    <p v-if="willBeLostOnWin" class="parking-warning" data-test="lost-warning">
      The shop is full AND the double-parking overflow spot is already taken - a won lot has nowhere
      to go and will be lost to a rival. Free up a bay, sell a car, or buy more capacity first.
    </p>
    <p v-else-if="willDoubleParkOnWin" class="double-park-warning" data-test="double-park-warning">
      The shop is full - a won lot will double-park in the one unowned overflow spot and cost a
      daily fine until real space opens up. Free up a bay or buy more capacity to avoid it.
    </p>

    <div v-for="group in detailedGroups" :key="group.tier" class="tier">
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
               bid stack drops into its slots so all bidding logic stays here. -->
          <AuctionLotCard
            :d="d"
            :disabled-reason-for="(t) => testDisabledReason(d.lot.tier, t)"
            @run-test="({ lotId, symptomIndex, testId }) => onRunTest(lotId, symptomIndex, testId)"
          >
            <template #headline>
              <p
                class="current-price"
                :class="{ 'current-price-mine': d.leadingBidder === 'player' }"
              >
                {{ bidStateLabel(d.currentBidYen, d.leadingBidder) }}
              </p>
            </template>

            <template #info>
              <div class="lot-secondary">
                <span>reserve {{ formatYen(d.reserveYen) }}</span>
              </div>
              <!-- The player's own number, once any test has run or any
                   symptom has resolved - hidden while it could only equal
                   the room's number, so the moment it appears is the
                   moment of divergence. -->
              <p v-if="d.playerEstimateYen !== null" class="player-estimate" data-test="you-say">
                you say {{ formatYen(d.playerEstimateYen) }}
              </p>

              <div class="close-timer">
                <template v-if="d.closeNightsLeft !== null">
                  <span class="close-count">{{ d.closeNightsLeft }}</span>
                  <span class="close-caption">days left unless bid on</span>
                </template>
                <span v-else class="close-caption">{{ d.closeLabel }}</span>
              </div>
            </template>

            <template #actions>
              <div class="lot-actions">
                <div class="bid-field">
                  <span class="stepper-group">
                    <button
                      type="button"
                      class="stepper stepper-down"
                      :data-test="'bid-down-' + d.lot.id"
                      aria-label="Lower bid amount"
                      @click="decrementBid(d)"
                    >
                      -
                    </button>
                    <input
                      v-model.number="bidInputs[d.lot.id]"
                      type="number"
                      :step="stepYenFor(d)"
                      :placeholder="String(d.nextRaiseYen)"
                      aria-label="raise bid to"
                    />
                    <button
                      type="button"
                      class="stepper stepper-up"
                      :data-test="'bid-up-' + d.lot.id"
                      aria-label="Raise bid amount"
                      @click="incrementBid(d)"
                    >
                      +
                    </button>
                  </span>
                </div>
                <div class="lot-action-buttons">
                  <button
                    class="primary"
                    :data-test="(d.playerHasBid ? 'raise-' : 'bid-') + d.lot.id"
                    @click="game.placeBid(d.lot.id, bidInputs[d.lot.id] ?? d.nextRaiseYen)"
                  >
                    {{ d.playerHasBid ? 'Raise bid' : 'Place bid' }}
                  </button>
                </div>
              </div>

              <!-- Buy Now is a small, separated ghost control below the bid
                   stack, and takes two clicks - it can never fire on a stray
                   press against the Raise button. -->
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

/* Sprint 95 decision 7 (playtest item 8): a visible secondary control, not a
   ghost chip - amber text and border on the panel colour, kept small so it
   never competes with the violet bid CTA. */
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

.filters {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  margin: 0 0 var(--mg-space-3);
  padding: var(--mg-space-2);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  font-size: var(--mg-fs-sm);
}

.filter-check,
.filter-range {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  color: var(--mg-text-dim);
}

.filter-legend,
.filter-readout {
  color: var(--mg-text-dim);
  white-space: nowrap;
}

.filter-readout {
  min-width: 12em;
}

.price-slider {
  position: relative;
  width: 180px;
  height: 20px;
}

.slider-track,
.slider-fill {
  position: absolute;
  top: 50%;
  height: 3px;
  transform: translateY(-50%);
  border-radius: 2px;
  pointer-events: none;
}

.slider-track {
  left: 0;
  right: 0;
  background: var(--mg-panel-edge);
}

.slider-fill {
  background: var(--mg-neon-violet);
}

/* Both inputs stack on the same track. The input itself ignores the pointer
   so the one underneath is still reachable; only the thumbs are grabbable. */
.price-slider input {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  background: none;
  pointer-events: none;
  appearance: none;
  -webkit-appearance: none;
}

.price-slider input::-webkit-slider-thumb {
  pointer-events: auto;
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--mg-night-deep);
  background: var(--mg-neon-cyan);
  cursor: pointer;
}

.price-slider input::-moz-range-thumb {
  pointer-events: auto;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--mg-night-deep);
  background: var(--mg-neon-cyan);
  cursor: pointer;
}

.filter-badge {
  margin-left: var(--mg-space-1);
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mg-neon-cyan);
  color: var(--mg-night-deep);
  font-size: var(--mg-fs-xs, 0.7rem);
}

.filter-count {
  color: var(--mg-text-dim);
  margin-left: auto;
}

.empty {
  color: var(--mg-text-dim);
  margin: var(--mg-space-3) 0;
}

/* Sprint 74 decision 7: the active yard visit's own fixed banner - a real
   clock the player is spending, so it gets the same weight as the
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

/* Sprint 56 decision 3: the two-panel card - a fixed-width left identity
   panel (art + grades) and a flexible right panel (money + bid stack),
   replacing Sprint 50's single 160px art column + one info stack. */
.lot {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--mg-space-3);
}

.lot-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-2);
}

/* Rule-of-glow compliance (art-direction.md 2): stamps stay muted at rest
   (GradeStamp's own default), reaching full ink saturation only while this
   specific card is hovered or has focus inside it (tabbing into the bid
   controls counts) - reaching into the child component's scoped class via
   `:deep()`, the standard Vue mechanism for this. */
.lot:hover :deep(.grade-stamp),
.lot:focus-within :deep(.grade-stamp) {
  filter: saturate(1) brightness(1);
}

.player-estimate {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The headline number (Sprint 30 decision 2's transparency law) - real
   current price or "no bids yet"; guide/reserve/bill below are secondary. */
.current-price {
  margin: 0;
  color: var(--mg-yen);
  font-size: 1.15rem;
  font-weight: bold;
}

.current-price-mine {
  color: var(--mg-success);
}

.lot-secondary {
  display: flex;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  justify-content: center;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* Day count as a real countdown, not a line buried in prose; falls back to
   `d.closeLabel` verbatim when there's no count to show ("no bids yet" /
   "final call"). */
.close-timer {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
  padding: var(--mg-space-1) var(--mg-space-3);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  width: fit-content;
}

.close-count {
  color: var(--mg-neon-violet);
  font-size: 1.4rem;
  font-weight: bold;
  line-height: 1;
}

.close-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.quiet-state {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* Sprint 64 (item 3): Buy Now sits below the bid stack, separated by a rule,
   as a small ghost control - deliberately not competing with Place/Raise. */
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

.bid-field {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.lot-action-buttons {
  display: flex;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

.stepper-group {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
}

.stepper-group input {
  width: 130px;
  height: 40px;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-md);
  text-align: center;
}

/* Physical push-button steppers (art-bible exception, decision 4 - flagged
   for maintainer sign-off) with a real press-travel state; foley deferred
   until the audio pipeline exists. */
.stepper {
  width: 40px;
  height: 40px;
  padding: 0;
  line-height: 1;
  font-weight: bold;
  font-size: var(--mg-fs-lg);
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  box-shadow: 0 2px 0 var(--mg-panel-edge);
  transition:
    transform 0.05s ease,
    box-shadow 0.05s ease;
}

.stepper:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 var(--mg-panel-edge);
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

button.primary {
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-violet);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}
</style>
