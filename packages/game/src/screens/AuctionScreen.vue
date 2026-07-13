<script setup lang="ts">
import type { ComponentId, ConditionBand } from '@midnight-garage/content'
import type { AuctionGrade } from '@midnight-garage/sim'
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import BandChip from '../components/BandChip.vue'
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

/**
 * Sprint 50 decision 2: the always-visible replacement for the old
 * expandable 29-part condition report - a real-world auction-style grade
 * line computed by `computeAuctionGrade` (sim/auctionGrade.ts), read once
 * per lot as `LotDetail.auctionGrade`.
 */
function auctionGradeLabel(grade: AuctionGrade): string {
  return `Grade ${grade.overall} · Ext ${grade.exterior} · Int ${grade.interior}`
}

// Resolve each lot's detail once per render (avoids repeated lookups + template `!`).
const detailedGroups = computed(() =>
  game.auctionLotsByTier.map((g) => ({
    tier: g.tier,
    lots: g.lots.map((l) => game.lotDetail(l.id)).filter((d): d is LotDetail => d !== undefined),
  })),
)

const hasLots = computed(() => detailedGroups.value.length > 0)

/** Group bands as `[ComponentId, ConditionBand][]`, for a stable v-for key. */
function groupBandEntries(
  bands: Record<ComponentId, ConditionBand>,
): [ComponentId, ConditionBand][] {
  return Object.entries(bands) as [ComponentId, ConditionBand][]
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
          <div class="lot-art" aria-hidden="true"></div>

          <div class="lot-body">
            <div class="lot-head">
              <span class="lot-name">{{ d.displayName }}</span>
              <span class="lot-meta">
                {{ d.lot.car.year }} · {{ d.lot.car.mileageKm.toLocaleString() }} km ·
                {{ d.lot.car.color }}
              </span>
            </div>

            <!-- The card is honest (Sprint 30 decision 2): guide value is the
                 headline, the same transparent instanceValue everyone prices
                 from - book value is never shown. -->
            <p class="guide-value">Guide value {{ formatYen(d.guideValueYen) }}</p>
            <p class="grade-line" :data-test="'auction-grade-' + d.lot.id">
              {{ auctionGradeLabel(d.auctionGrade) }} · restoration bill
              {{ formatYen(d.restorationBillYen) }}
            </p>

            <div class="lot-status-row">
              <span>reserve {{ formatYen(d.reserveYen) }}</span>
              <span
                class="current-bid"
                :class="{ 'current-bid-mine': d.leadingBidder === 'player' }"
              >
                {{ bidStateLabel(d.currentBidYen, d.leadingBidder) }}
              </span>
              <span class="backstop">{{ d.closeLabel }}</span>
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

            <div class="lot-bands">
              <span
                v-for="[groupId, band] in groupBandEntries(d.groupBands)"
                :key="groupId"
                class="lot-band-entry"
              >
                {{ game.componentLabel(groupId) }}: <BandChip :band="band" />
              </span>
            </div>

            <div class="lot-bid">
              <label>
                raise to
                <input
                  v-model.number="bidInputs[d.lot.id]"
                  type="number"
                  step="10000"
                  :placeholder="String(d.nextRaiseYen)"
                />
              </label>
              <button
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

/* Sprint 50 decision 1: a fixed grid - the art placeholder on the left,
   every info row strictly stacked on the right. Nothing wraps or competes
   for width at normal desktop sizes. */
.lot {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--mg-space-3);
}

/* The 2:1 (96x48-proportioned) art placeholder (Sprint 50 decision 1) -
   empty and bordered until real sprites exist; sized so they'll drop in
   edge to edge later. */
.lot-art {
  width: 100%;
  aspect-ratio: 2 / 1;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
}

.lot-body {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
  min-width: 0;
}

.lot-name {
  color: var(--mg-neon-cyan);
}

.lot-meta,
.lot-status-row,
.lot-bands,
.lot-turnout {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The card's headline number (Sprint 30 decision 2) - reserve/buyout below
   read as fractions of this, not competing top-line figures. */
.guide-value {
  margin: 0;
  color: var(--mg-yen);
  font-size: var(--mg-fs-md);
  font-weight: bold;
}

/* Sprint 50 decision 2: the always-visible replacement for the old
   expandable condition report - one short line, no toggle. */
.grade-line {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.lot-bands {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
}

/* The band value itself is a shared BandChip (Sprint 28) - this only lays
   out the "<group>: " label beside it. */
.lot-band-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
}

.lot-status-row {
  display: flex;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.backstop {
  color: var(--mg-text-dim);
}

.lot-bid {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

.lot-bid input {
  width: 120px;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
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

.current-bid-mine {
  color: var(--mg-success);
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
  margin-top: var(--mg-space-3);
}
</style>
