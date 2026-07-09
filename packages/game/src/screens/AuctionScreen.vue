<script setup lang="ts">
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore, type LotDetail } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

// Per-lot max-bid input; empty defaults to book value at queue time.
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

function pendingBid(lotId: string): number | undefined {
  return game.pending.bidsOnLots.find((b) => b.lotId === lotId)?.maxBidYen
}
function isInspectQueued(lotId: string): boolean {
  return game.pending.inspectLots.some((a) => a.lotId === lotId)
}
function isBuyoutQueued(lotId: string): boolean {
  return game.pending.buyoutLots.some((a) => a.lotId === lotId)
}

const INTEREST_LABEL: Record<string, string> = {
  quiet: 'Quiet',
  warm: 'Warm',
  hot: 'Hot',
  frenzy: 'Feeding frenzy',
}
</script>

<template>
  <section class="auctions">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>Auctions</h2>
      <p class="cash">{{ formatYen(game.cashYen) }} · labor {{ game.laborSlotsPerDay }}/day</p>
    </header>

    <p v-if="!hasLots" class="empty">
      No lots listed. The next weekly catalog arrives in ~{{ daysUntilCatalog }} day(s) — End Day
      (or use the dev console to warp).
    </p>

    <p v-if="game.parkingFull" class="parking-warning">
      Parking is full ({{ game.parkingOccupancyCount }}/{{ game.parkingCapacity }}) — a won lot has
      nowhere to go and will be lost to a rival. Free up a bay or buy more parking first.
    </p>

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
            <span>expires day {{ d.lot.expiresOnDay }}</span>
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
                  {{ iss.zone }}: {{ iss.hintText }}
                </span>
              </span>
            </template>
            <template v-else>
              <button
                :disabled="isInspectQueued(d.lot.id) || game.cashYen < d.inspectionFeeYen"
                :data-test="'inspect-' + d.lot.id"
                @click="game.queueInspect(d.lot.id)"
              >
                Inspect ({{ formatYen(d.inspectionFeeYen) }} + 1 labor)
              </button>
              <span v-if="isInspectQueued(d.lot.id)" class="queued">queued</span>
            </template>
          </div>

          <div class="lot-bid">
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
              @click="game.queueBid(d.lot.id, bidInputs[d.lot.id] ?? d.bookValueYen)"
            >
              Place bid
            </button>
            <span v-if="pendingBid(d.lot.id) !== undefined" class="queued">
              bid {{ formatYen(pendingBid(d.lot.id) ?? 0) }} queued
            </span>
            <button
              class="buyout"
              :disabled="isBuyoutQueued(d.lot.id) || game.cashYen < d.buyoutPriceYen"
              :data-test="'buyout-' + d.lot.id"
              @click="game.queueBuyout(d.lot.id)"
            >
              Buy now ({{ formatYen(d.buyoutPriceYen) }})
            </button>
            <span v-if="isBuyoutQueued(d.lot.id)" class="queued">buyout queued</span>
          </div>
        </li>
      </ul>
    </div>

    <button class="primary" data-test="end-day" @click="game.commitDay()">End Day</button>
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

.queued {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
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
