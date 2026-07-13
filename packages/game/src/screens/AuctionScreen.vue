<script setup lang="ts">
import type { ComponentId, ConditionBand } from '@midnight-garage/content'
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import EndDayButton from '../components/EndDayButton.vue'
import { useGameStore, type LotDetail } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

// Per-lot raise input; empty defaults to the minimum next raise.
const bidInputs = reactive<Record<string, number | undefined>>({})

// Which lots currently have their full 29-part condition report open
// (Sprint 27 decision 3: read-only, always available, never gated).
const expandedLotIds = reactive(new Set<string>())

function isLotExpanded(lotId: string): boolean {
  return expandedLotIds.has(lotId)
}

function toggleLotDetail(lotId: string): void {
  if (expandedLotIds.has(lotId)) expandedLotIds.delete(lotId)
  else expandedLotIds.add(lotId)
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
 * Sprint 33 decision 4: the flat 29-row condition report was unreadable (a
 * single wrapping grid with no structure). `CONDITION_GROUPS` is the same
 * 6-group stable order every other drill-down in this app uses
 * (`CarDetailScreen.vue`'s `COMPONENTS`, `PartsMarketScreen.vue`'s
 * `COMPONENT_GROUPS`) - each screen keeps its own local copy rather than a
 * shared cross-file constant, matching that existing pattern.
 */
const CONDITION_GROUPS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/** Buckets one lot's flat part-row list by component group, in stable order
 * - the same "group -> real parts" shape `CarDetailScreen.vue`'s owned-car
 * drill-down already renders, reused here instead of a second ad hoc report
 * layout (directive 16). Groups with nothing in this lot's row list (should
 * not happen for a real 29-part taxonomy, but keeps this robust) are simply
 * omitted rather than rendered empty. */
function groupedPartRows(partRows: LotDetail['partRows']) {
  return CONDITION_GROUPS.map((groupId) => ({
    groupId,
    label: game.componentLabel(groupId),
    rows: partRows.filter((row) => game.groupForCarPart(row.partId) === groupId),
  })).filter((group) => group.rows.length > 0)
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
      <ul>
        <li v-for="b in game.myActiveBids" :key="b.lot.id" class="my-bid-row">
          <span class="lot-name">{{ b.displayName }}</span>
          <span class="current-bid">{{ bidStateLabel(b.currentBidYen, b.leadingBidder) }}</span>
          <span class="winning-state" :class="b.isWinning ? 'winning' : 'outbid'">
            {{ b.isWinning ? 'winning' : 'outbid' }}
          </span>
          <span class="days-left">{{ b.closeLabel }}</span>
          <!-- Outbid is the call to action: raise straight from this panel. -->
          <button
            v-if="!b.isWinning"
            class="quick-raise"
            :data-test="'quick-raise-' + b.lot.id"
            @click="game.placeBid(b.lot.id, b.nextRaiseYen)"
          >
            Raise to {{ formatYen(b.nextRaiseYen) }}
          </button>
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
          <!-- The card is honest (Sprint 30 decision 2): guide value is the
               headline, the same transparent instanceValue everyone prices
               from - book value is never shown. -->
          <p class="guide-value">Guide value {{ formatYen(d.guideValueYen) }}</p>
          <div class="lot-nums">
            <span>reserve {{ formatYen(d.reserveYen) }}</span>
            <span class="current-bid" :class="{ 'current-bid-mine': d.leadingBidder === 'player' }">
              {{ bidStateLabel(d.currentBidYen, d.leadingBidder) }}
            </span>
            <span class="backstop">{{ d.closeLabel }}</span>
          </div>

          <div class="lot-turnout">
            <span class="turnout-badge" :class="'turnout-' + d.turnout">
              {{ TURNOUT_LABEL[d.turnout] }}
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

          <div class="lot-condition-report">
            <button
              class="details-toggle"
              :data-test="'toggle-detail-' + d.lot.id"
              @click="toggleLotDetail(d.lot.id)"
            >
              {{
                isLotExpanded(d.lot.id)
                  ? 'Hide full condition report'
                  : 'Show full condition report'
              }}
            </button>
            <div v-if="isLotExpanded(d.lot.id)" class="lot-parts">
              <p class="restoration-bill">
                Restoration bill (every part to mint): {{ formatYen(d.restorationBillYen) }}
              </p>
              <div class="condition-groups">
                <div
                  v-for="conditionGroup in groupedPartRows(d.partRows)"
                  :key="conditionGroup.groupId"
                  class="condition-group"
                >
                  <h4 class="condition-group-name">
                    {{ conditionGroup.label }}
                    <BandChip :band="d.groupBands[conditionGroup.groupId]" />
                  </h4>
                  <ul class="part-rows">
                    <li v-for="row in conditionGroup.rows" :key="row.partId" class="part-row">
                      <span class="part-name" :title="row.displayName">{{ row.displayName }}</span>
                      <BandChip :band="row.band" />
                      <span v-if="row.missing" class="missing-tag">MISSING</span>
                      <span v-else-if="row.legitimatelyAbsent" class="absent-tag"
                        >no turbo (NA)</span
                      >
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div class="lot-bid">
            <span
              v-if="d.playerHasBid"
              class="winning-state"
              :class="d.leadingBidder === 'player' ? 'winning' : 'outbid'"
            >
              {{ d.leadingBidder === 'player' ? 'you lead' : 'outbid' }}
            </span>
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
        </li>
      </ul>
    </div>

    <EndDayButton />
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

.lot-condition-report {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.details-toggle {
  align-self: flex-start;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.lot-parts {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-3);
  padding: var(--mg-space-3);
  background: var(--mg-night-deep);
  border-radius: var(--mg-radius);
}

.restoration-bill {
  margin: 0;
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

/* Sprint 33 decision 4: the report reads as one card per component group
   (the same grouping the owned-car drill-down uses), not one 29-row grid -
   each group's own rows align in their own tight column set. */
.condition-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--mg-space-2);
}

.condition-group {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.condition-group-name {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
}

/* Every row's name/band/tag lands in the same 3 columns (`.part-row` is
   `display: contents` so its children join this grid directly), so a
   group's bands line up in a scannable column instead of wrapping loosely. */
.part-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  column-gap: var(--mg-space-2);
  row-gap: 4px;
  font-size: var(--mg-fs-sm);
}

.part-row {
  display: contents;
}

.part-row .part-name {
  color: var(--mg-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A genuinely missing slot (Sprint 32 decision 3) vs. the one
   legitimately-empty case (forced induction on an NA car) - same
   alarm/dim color split as the car-detail screen's own tags. */
.missing-tag {
  color: var(--mg-neon-pink);
  font-weight: bold;
}

.absent-tag {
  color: var(--mg-text-dim);
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

.lot-nums {
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
