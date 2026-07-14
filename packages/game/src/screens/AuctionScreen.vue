<script setup lang="ts">
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import GradeStamp from '../components/GradeStamp.vue'
import { useGameStore, type LotDetail } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

// Per-lot raise input; empty defaults to the minimum next raise.
const bidInputs = reactive<Record<string, number | undefined>>({})

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

// Resolve each lot's detail once per render (avoids repeated lookups + template `!`).
const detailedGroups = computed(() =>
  game.auctionLotsByTier.map((g) => ({
    tier: g.tier,
    lots: g.lots.map((l) => game.lotDetail(l.id)).filter((d): d is LotDetail => d !== undefined),
  })),
)

const hasLots = computed(() => detailedGroups.value.length > 0)

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

/** Turnout badge text (Sprint 30 decision 3: a real bidder-count band now,
 * rolled once per lot at creation) - still one word of texture, never a
 * numeric gauge. Price is king. */
const TURNOUT_LABEL: Record<string, string> = {
  thin: 'Thin turnout',
  steady: 'Steady turnout',
  packed: 'Packed turnout',
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
        {{ formatYen(game.cashYen) }} · labor {{ game.laborSlotsRemainingToday }}/{{
          game.laborSlotsPerDay
        }}
      </p>
    </header>

    <p v-if="!hasLots" class="empty">
      No lots listed right now. New lots can arrive any day - End Day (or use the dev console to
      warp) and check back.
    </p>

    <p v-if="willBeLostOnWin" class="parking-warning" data-test="lost-warning">
      The shop is full AND the double-parking overflow spot is already taken - a won lot has nowhere
      to go and will be lost to a rival. Free up a bay, sell a car, or buy more capacity first.
    </p>
    <p v-else-if="willDoubleParkOnWin" class="double-park-warning" data-test="double-park-warning">
      The shop is full - a won lot will double-park in the one unowned overflow spot and cost a
      daily fine until real space opens up. Free up a bay or buy more capacity to avoid it.
    </p>

    <section v-if="game.myActiveBids.length > 0" class="my-bids">
      <h3>My Active Bids</h3>
      <table class="bids-table">
        <thead>
          <tr>
            <th>Car</th>
            <th>Your bid</th>
            <th>State</th>
            <th>Close</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in game.myActiveBids" :key="b.lot.id" class="my-bid-row">
            <td class="lot-name">{{ b.displayName }}</td>
            <td class="current-bid">{{ bidStateLabel(b.currentBidYen, b.leadingBidder) }}</td>
            <td>
              <span class="winning-state" :class="b.isWinning ? 'winning' : 'outbid'">
                {{ b.isWinning ? 'winning' : 'outbid' }}
              </span>
            </td>
            <td class="days-left">{{ b.closeLabel }}</td>
            <td>
              <!-- Outbid is the call to action: raise straight from this panel. -->
              <button
                v-if="!b.isWinning"
                class="quick-raise"
                :data-test="'quick-raise-' + b.lot.id"
                @click="game.placeBid(b.lot.id, b.nextRaiseYen)"
              >
                Raise to {{ formatYen(b.nextRaiseYen) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-for="group in detailedGroups" :key="group.tier" class="tier">
      <h3>{{ group.tier }}</h3>
      <ul class="lots">
        <li v-for="d in group.lots" :key="d.lot.id" class="lot">
          <!-- Sprint 56 decision 3: left panel - identity, art, grade stamps. -->
          <div class="lot-left">
            <div class="lot-head">
              <span class="lot-name"
                >{{ d.displayName
                }}<span class="class-chip" :data-test="'lot-class-' + d.lot.id">{{
                  game.fitmentClassLabel(d.fitmentClass)
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
              <span
                v-if="d.playerHasBid"
                class="winning-state"
                :class="d.leadingBidder === 'player' ? 'winning' : 'outbid'"
              >
                {{ d.leadingBidder === 'player' ? 'you lead' : 'outbid' }}
              </span>
            </div>

            <div class="lot-art" aria-hidden="true"></div>

            <!-- Sprint 56 decision 2: the grade stamps replace the old
                 per-group BandChip row entirely - full per-part truth stays
                 on the car detail screen after acquisition. -->
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
          </div>

          <!-- Right panel: current price is the headline, guide/reserve/bill
               are secondary, then the bid stack. -->
          <div class="lot-right">
            <div class="lot-info">
              <p
                class="current-price"
                :class="{ 'current-price-mine': d.leadingBidder === 'player' }"
              >
                {{ bidStateLabel(d.currentBidYen, d.leadingBidder) }}
              </p>

              <!-- The card is still honest (Sprint 30 decision 2): guide
                   value is the same transparent instanceValue everyone
                   prices from - book value is never shown - just no longer
                   the headline. -->
              <div class="lot-secondary">
                <span>guide {{ formatYen(d.guideValueYen) }}</span>
                <span>reserve {{ formatYen(d.reserveYen) }}</span>
                <span>bill {{ formatYen(d.restorationBillYen) }}</span>
              </div>

              <div class="close-timer">
                <template v-if="d.closeNightsLeft !== null">
                  <span class="close-count">{{ d.closeNightsLeft }}</span>
                  <span class="close-caption">days left unless bid on</span>
                </template>
                <span v-else class="close-caption">{{ d.closeLabel }}</span>
              </div>
            </div>

            <div class="lot-actions">
              <div class="bid-field">
                <label :for="'bid-input-' + d.lot.id">raise to</label>
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
                    :id="'bid-input-' + d.lot.id"
                    v-model.number="bidInputs[d.lot.id]"
                    type="number"
                    :step="stepYenFor(d)"
                    :placeholder="String(d.nextRaiseYen)"
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
                <button
                  class="buyout"
                  :disabled="game.cashYen < d.buyoutPriceYen"
                  :data-test="'buyout-' + d.lot.id"
                  @click="game.buyout(d.lot.id)"
                >
                  Buy now ({{ formatYen(d.buyoutPriceYen) }})
                </button>
              </div>
            </div>
          </div>
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
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  text-transform: capitalize;
  margin: 0 0 var(--mg-space-2);
}

.cash {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
  margin: var(--mg-space-3) 0;
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

.lot-info,
.lot-actions {
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

/* The 2:1 (96x48-proportioned) art placeholder, doubled to a 320x160 box
   (Sprint 56 decision 3, was 160x80) - empty and bordered until real
   sprites exist; a future 96x48 master renders inside at integer 3x
   (288x144) with padding, preserving integer-only scaling. */
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

/* Rule-of-glow compliance (art-direction.md 2): stamps stay muted at rest
   (GradeStamp's own default), reaching full ink saturation only while this
   specific card is hovered or has focus inside it (tabbing into the bid
   controls counts) - reaching into the child component's scoped class via
   `:deep()`, the standard Vue mechanism for this. */
.lot:hover :deep(.grade-stamp),
.lot:focus-within :deep(.grade-stamp) {
  filter: saturate(1) brightness(1);
}

.lot-name {
  color: var(--mg-neon-cyan);
}

/* Sprint 61 (item 15): a small muted class chip so a bidder knows which
   class of parts this car takes (Kei & Compact / Sports / ...). */
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

.lot-turnout {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

/* Flavor only (maintainer decision 3) - no urgency coloring, just a subtle
   shift so "packed" reads warmer than "thin" without shouting. */
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

.quiet-state {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.buyout {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
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

.my-bids {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin: 0 0 var(--mg-space-4);
}

/* Sprint 50 decision 3: a proper table (car / your bid / state / action)
   instead of a wrapping flex row per bid. */
.bids-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.bids-table th {
  text-align: left;
  font-weight: normal;
  color: var(--mg-text-dim);
  padding: 0 var(--mg-space-2) var(--mg-space-1) 0;
  border-bottom: var(--mg-border);
}

.bids-table td {
  padding: var(--mg-space-1) var(--mg-space-2) var(--mg-space-1) 0;
  vertical-align: middle;
}

.my-bid-row + .my-bid-row td {
  border-top: var(--mg-border);
}

.current-bid {
  color: var(--mg-yen);
}

.days-left {
  color: var(--mg-text-dim);
}

.winning-state {
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.winning-state.winning {
  color: var(--mg-success);
}

.winning-state.outbid {
  color: var(--mg-danger);
}

.quick-raise {
  border-color: var(--mg-danger);
  color: var(--mg-danger);
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
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-pink);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}
</style>
