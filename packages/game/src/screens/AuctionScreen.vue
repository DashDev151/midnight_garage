<script setup lang="ts">
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore, type LotDetail } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

// Per-lot max-bid input; empty defaults to book value.
const bidInputs = reactive<Record<string, number | undefined>>({})

// Resolve each lot's detail once per render (avoids repeated lookups + template `!`).
const detailedGroups = computed(() =>
  game.auctionLotsByTier.map((g) => ({
    tier: g.tier,
    lots: g.lots.map((l) => game.lotDetail(l.id)).filter((d): d is LotDetail => d !== undefined),
  })),
)

const hasLots = computed(() => detailedGroups.value.length > 0)
const daysUntilCatalog = computed(() => {
  const d = 7 - (game.day % 7)
  return d === 0 ? 7 : d
})

const INTEREST_LABEL: Record<string, string> = {
  quiet: 'Quiet',
  warm: 'Warm',
  hot: 'Hot',
  frenzy: 'Feeding frenzy',
}

const HEADROOM_LABEL: Record<string, string> = {
  none: 'no rivals',
  plenty: 'plenty',
  moderate: 'moderate',
  tight: 'tight',
  critical: 'critical',
}

function daysLabel(n: number): string {
  return `${n} day${n === 1 ? '' : 's'} left`
}

/** The real current leading bid, always shown — never a "no idea" state
 * (Sprint 19b: this number already existed in `BidHeadroom`, it just wasn't
 * wired into the screen — a real gap, now fixed on every lot, bid on or not). */
function currentBidLabel(currentTopBidYen: number): string {
  return currentTopBidYen > 0 ? `current bid ${formatYen(currentTopBidYen)}` : 'no bids yet'
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
      No lots listed. The next weekly catalog arrives in ~{{ daysUntilCatalog }} day(s) — End Day
      (or use the dev console to warp).
    </p>

    <p v-if="game.parkingFull" class="parking-warning">
      Parking is full ({{ game.parkingOccupancyCount }}/{{ game.parkingCapacity }}) — a won lot has
      nowhere to go and will be lost to a rival. Free up a bay or buy more parking first.
    </p>

    <section v-if="game.myActiveBids.length > 0" class="my-bids">
      <h3>My Active Bids</h3>
      <ul>
        <li v-for="b in game.myActiveBids" :key="b.lot.id" class="my-bid-row">
          <span class="lot-name">{{ b.displayName }}</span>
          <span class="my-bid-amount">your bid {{ formatYen(b.myMaxBidYen) }}</span>
          <span class="current-bid">{{ currentBidLabel(b.headroom.currentTopBidYen) }}</span>
          <span class="winning-state" :class="b.headroom.playerIsWinning ? 'winning' : 'outbid'">
            {{ b.headroom.playerIsWinning ? 'winning' : 'outbid' }}
          </span>
          <span class="headroom" :class="'headroom-' + b.headroom.level">
            headroom: {{ HEADROOM_LABEL[b.headroom.level] }}
          </span>
          <span class="days-left">{{ daysLabel(b.daysLeft) }}</span>
        </li>
      </ul>
    </section>

    <div v-for="group in detailedGroups" :key="group.tier" class="tier">
      <h3>{{ group.tier }}</h3>
      <ul class="lots">
        <li v-for="d in group.lots" :key="d.lot.id" class="lot">
          <div class="lot-head">
            <span class="lot-name">{{ d.displayName }}</span>
            <span class="lot-meta">
              {{ d.lot.car.year }} · {{ d.lot.car.mileageKm.toLocaleString() }} km ·
              {{ d.lot.car.color }}
            </span>
          </div>
          <div class="lot-nums">
            <span>book {{ formatYen(d.bookValueYen) }}</span>
            <span>reserve {{ formatYen(d.reserveYen) }}</span>
            <span class="current-bid">{{ currentBidLabel(d.headroom.currentTopBidYen) }}</span>
            <span>{{ daysLabel(d.daysLeft) }}</span>
          </div>

          <div class="lot-interest">
            <span class="interest-badge" :class="'interest-' + d.interest.level">
              {{ INTEREST_LABEL[d.interest.level] }}
            </span>
            <span v-if="d.interest.estimateHighYen > 0" class="estimate">
              bid {{ formatYen(d.interest.estimateLowYen) }}–{{
                formatYen(d.interest.estimateHighYen)
              }}
              to win · {{ d.interest.contenders }} rival{{ d.interest.contenders === 1 ? '' : 's' }}
            </span>
            <span v-else class="estimate">no rival interest expected</span>
          </div>

          <div class="lot-inspect">
            <template v-if="d.lot.inspected">
              <span class="inspected">Inspected:</span>
              <span v-if="d.revealedIssues.length === 0" class="clean">no hidden issues</span>
              <span v-else class="issues">
                <span v-for="(iss, i) in d.revealedIssues" :key="i">
                  {{ iss.componentId }}: {{ iss.hintText }}
                </span>
              </span>
            </template>
            <template v-else>
              <button
                :disabled="game.cashYen < d.inspectionFeeYen"
                :data-test="'inspect-' + d.lot.id"
                @click="game.inspectLot(d.lot.id)"
              >
                Inspect ({{ formatYen(d.inspectionFeeYen) }})
              </button>
            </template>
          </div>

          <div class="lot-bid">
            <template v-if="d.myMaxBidYen !== null">
              <span class="my-bid-amount">your bid {{ formatYen(d.myMaxBidYen) }}</span>
              <span
                class="winning-state"
                :class="d.headroom.playerIsWinning ? 'winning' : 'outbid'"
              >
                {{ d.headroom.playerIsWinning ? 'winning' : 'outbid' }}
              </span>
              <span class="headroom" :class="'headroom-' + d.headroom.level">
                headroom: {{ HEADROOM_LABEL[d.headroom.level] }}
              </span>
              <label>
                raise to
                <input
                  v-model.number="bidInputs[d.lot.id]"
                  type="number"
                  step="10000"
                  :placeholder="String(d.myMaxBidYen)"
                />
              </label>
              <button
                :data-test="'raise-' + d.lot.id"
                @click="game.placeBid(d.lot.id, bidInputs[d.lot.id] ?? d.myMaxBidYen)"
              >
                Raise bid
              </button>
            </template>
            <template v-else>
              <label>
                max bid
                <input
                  v-model.number="bidInputs[d.lot.id]"
                  type="number"
                  step="10000"
                  :placeholder="String(d.bookValueYen)"
                />
              </label>
              <button
                :data-test="'bid-' + d.lot.id"
                @click="game.placeBid(d.lot.id, bidInputs[d.lot.id] ?? d.bookValueYen)"
              >
                Place bid
              </button>
            </template>
            <button
              class="buyout"
              :disabled="game.cashYen < d.buyoutPriceYen"
              :data-test="'buyout-' + d.lot.id"
              @click="game.buyout(d.lot.id)"
            >
              Buy now ({{ formatYen(d.buyoutPriceYen) }})
            </button>
          </div>
        </li>
      </ul>
    </div>

    <button class="primary" data-test="end-day" @click="game.endDay()">End Day</button>
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
}

h2 {
  color: var(--mg-neon-cyan);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  text-transform: capitalize;
}

.cash {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
}

.parking-warning {
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-3);
}

.lots {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-3);
}

.lot {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.lot-name {
  color: var(--mg-neon-cyan);
}

.lot-meta,
.lot-nums,
.lot-inspect,
.lot-interest {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.lot-interest {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

.interest-badge {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.interest-quiet {
  color: var(--mg-text-dim);
}

.interest-warm {
  color: var(--mg-neon-cyan);
}

.interest-hot {
  color: var(--mg-yen);
}

.interest-frenzy {
  color: var(--mg-danger);
}

.estimate {
  color: var(--mg-text-dim);
}

.buyout {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
}

.lot-nums {
  display: flex;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.issues {
  display: flex;
  flex-direction: column;
  color: var(--mg-danger);
}

.clean {
  color: var(--mg-success);
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

.my-bids h3 {
  margin-top: 0;
}

.my-bids ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.my-bid-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.my-bid-amount,
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

.headroom {
  font-size: var(--mg-fs-sm);
}

.headroom-plenty {
  color: var(--mg-success);
}

.headroom-moderate {
  color: var(--mg-neon-cyan);
}

.headroom-tight {
  color: var(--mg-yen);
}

.headroom-critical,
.headroom-none {
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
