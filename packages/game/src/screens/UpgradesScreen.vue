<script setup lang="ts">
import type { ComponentId, ToolTier } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import HintTooltip from '../components/HintTooltip.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const nextServiceBayPriceYen = computed(() => game.nextBayPrice('service'))
const nextParkingBayPriceYen = computed(() => game.nextBayPrice('parking'))
const nextServiceBayRepGate = computed(() => game.nextBayReputationGate('service'))
const nextParkingBayRepGate = computed(() => game.nextBayReputationGate('parking'))

/**
 * Sprint 43 tool wall: the selected/hovered ladder rung whose info box is
 * showing - null until the player picks one. Any rung (owned, next, or
 * locked) can be selected; only the actual next-purchasable rung also gets
 * a live Upgrade button.
 */
const selectedNode = ref<{ componentId: ComponentId; tier: ToolTier } | null>(null)

function selectNode(componentId: ComponentId, tier: ToolTier): void {
  if (selectedNode.value?.componentId === componentId && selectedNode.value.tier === tier) {
    selectedNode.value = null
    return
  }
  selectedNode.value = { componentId, tier }
}

const selectedLine = computed(() =>
  selectedNode.value
    ? (game.toolLineViews.find((l) => l.componentId === selectedNode.value!.componentId) ?? null)
    : null,
)
const selectedInfo = computed(() =>
  selectedNode.value
    ? game.toolTierInfo(selectedNode.value.componentId, selectedNode.value.tier)
    : null,
)
</script>

<template>
  <section class="upgrades">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>
        Upgrades
        <HelpHint label="Upgrades">
          Better tools finish the same work faster. Tools and bays both cost cash, and once your
          standing in town grows, both cost a little reputation too.
        </HelpHint>
      </h2>
      <p class="rep">{{ game.reputationTier }} · {{ formatYen(game.cashYen) }}</p>
    </header>

    <section class="classifieds">
      <h3>
        Classifieds
        <HelpHint label="Classifieds">
          Used machinery doesn't show up on demand - the trade paper lists one used machine at a
          time, every few days, drawn from whatever your standing already qualifies you for. Miss
          one and it isn't gone for good; a later issue can list it again.
        </HelpHint>
      </h3>
      <div v-if="game.machineListingView" class="listing-card" data-test="machine-listing">
        <span class="listing-line"
          >Tier {{ game.machineListingView.tier }} - {{ game.machineListingView.displayName }}</span
        >
        <span class="listing-line">{{ game.machineListingView.componentLabel }}</span>
        <span class="listing-price">{{ formatYen(game.machineListingView.priceYen) }}</span>
        <span class="listing-days">{{ game.machineListingView.daysLeft }} day(s) left</span>
      </div>
      <p v-else class="empty" data-test="no-listing">Nothing in the classifieds this week.</p>
    </section>

    <section class="facilities">
      <h3>Facilities</h3>
      <div class="purchase-grid">
        <div class="purchase-card" :class="{ gated: nextServiceBayRepGate !== null }">
          <h4>Service bays</h4>
          <p class="owned-count">{{ game.serviceBayCount }} owned</p>
          <template v-if="nextServiceBayPriceYen !== null">
            <button
              :disabled="game.cashYen < nextServiceBayPriceYen || nextServiceBayRepGate !== null"
              data-test="buy-service-bay"
              @click="game.buyBay('service')"
            >
              Next bay - {{ formatYen(nextServiceBayPriceYen) }}
            </button>
            <HintTooltip
              v-if="nextServiceBayRepGate"
              data-test="gate-tip-service-bay"
              :text="`Your standing isn't there yet - needs ${nextServiceBayRepGate} reputation`"
            />
          </template>
          <span v-else class="maxed">Fully equipped</span>
        </div>
        <div class="purchase-card" :class="{ gated: nextParkingBayRepGate !== null }">
          <h4>Parking bays</h4>
          <p class="owned-count">{{ game.parkingCapacity }} owned</p>
          <template v-if="nextParkingBayPriceYen !== null">
            <button
              :disabled="game.cashYen < nextParkingBayPriceYen || nextParkingBayRepGate !== null"
              data-test="buy-parking-bay"
              @click="game.buyBay('parking')"
            >
              Next bay - {{ formatYen(nextParkingBayPriceYen) }}
            </button>
            <HintTooltip
              v-if="nextParkingBayRepGate"
              data-test="gate-tip-parking-bay"
              :text="`Your standing isn't there yet - needs ${nextParkingBayRepGate} reputation`"
            />
          </template>
          <span v-else class="maxed">Fully equipped</span>
        </div>
      </div>
    </section>

    <section class="tools">
      <h3>
        Tools
        <HelpHint label="Tools">
          Tier 1 of every line is free from day one - nothing basic is ever locked. Reaching tier 2
          or 3 takes cash, reputation, and a live classifieds listing for that exact machine. Click
          any tier to see what it unlocks.
        </HelpHint>
      </h3>
      <div class="tool-wall">
        <div v-for="line in game.toolLineViews" :key="line.componentId" class="tool-column">
          <h4>{{ line.componentLabel }}</h4>
          <p class="maxed" :class="{ shown: line.maxed }">Fully equipped</p>
          <ul class="tier-ladder">
            <li
              v-for="rung in [...line.tiers].reverse()"
              :key="rung.tier"
              class="tier-node"
              :class="{
                owned: rung.owned,
                next: !rung.owned && rung.tier === line.currentTier + 1,
                locked: !rung.owned && rung.tier !== line.currentTier + 1,
                gated:
                  !rung.owned &&
                  rung.tier === line.currentTier + 1 &&
                  (line.nextTierRepGate !== null || !rung.isListed),
                selected:
                  selectedNode?.componentId === line.componentId &&
                  selectedNode?.tier === rung.tier,
              }"
              :data-test="'tier-node-' + line.componentId + '-' + rung.tier"
              @click="selectNode(line.componentId, rung.tier)"
            >
              <span class="tier-label">Tier {{ rung.tier }}</span>
              <span class="tier-name">{{ rung.displayName }}</span>
              <template v-if="!rung.owned && rung.tier === line.currentTier + 1">
                <button
                  :disabled="
                    game.cashYen < (rung.upgradePriceYen ?? 0) ||
                    line.nextTierRepGate !== null ||
                    !rung.isListed
                  "
                  :data-test="'upgrade-tool-' + line.componentId"
                  @click.stop="game.upgradeToolLine(line.componentId)"
                >
                  {{ formatYen(rung.upgradePriceYen ?? 0) }}
                </button>
                <HintTooltip
                  v-if="line.nextTierRepGate"
                  :data-test="'gate-tip-rep-' + line.componentId"
                  :text="`Your standing isn't there yet - needs ${line.nextTierRepGate} reputation`"
                />
                <HintTooltip
                  v-else-if="!rung.isListed"
                  :data-test="'needs-listing-' + line.componentId"
                  text="Watch the classifieds - this machine isn't on offer this week"
                />
              </template>
              <HintTooltip
                v-else-if="rung.minReputationTier"
                :data-test="'gate-tip-tier-' + line.componentId + '-' + rung.tier"
                :text="`Needs ${rung.minReputationTier} reputation`"
              />
            </li>
          </ul>
        </div>
      </div>

      <div v-if="selectedLine && selectedInfo" class="tool-info-box" data-test="tool-info-box">
        <h4>{{ selectedLine.componentLabel }} - tier {{ selectedNode?.tier }}</h4>
        <p v-if="selectedInfo.unlocksJobTemplateNames.length">
          Unlocks: {{ selectedInfo.unlocksJobTemplateNames.join(', ') }}
        </p>
        <p v-if="selectedInfo.unlocksNaToTurboConversion">
          Unlocks the NA-to-turbo conversion on your own cars.
        </p>
        <p>{{ selectedInfo.laborSlotsPerGradeText }}</p>
        <p v-if="selectedInfo.rentalFeeText" data-test="rental-fee-line">
          {{ selectedInfo.rentalFeeText }}
        </p>
      </div>
    </section>
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
  margin: var(--mg-space-3) 0 var(--mg-space-2);
}

h2,
h3 {
  display: flex;
  align-items: center;
}

h2 {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.rep {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.classifieds {
  margin-bottom: var(--mg-space-4);
}

.listing-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-cyan);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.listing-line {
  color: var(--mg-text);
}

.listing-price {
  color: var(--mg-yen);
  font-weight: bold;
}

.listing-days {
  color: var(--mg-text-dim);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.facilities {
  margin-bottom: var(--mg-space-4);
}

/* Sprint 52 decision 3: facilities become cards in the same grid/card
   language the tool wall already uses - symmetrical columns, consistent
   padding, no separate visual dialect. */
.purchase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--mg-space-3);
}

.purchase-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-1);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  text-align: center;
  /* Sprint 65 decision 4: a fixed floor so a gated card (with its tooltip
     trigger) never renders taller than its sibling, staggering the grid. */
  min-height: 132px;
  justify-content: flex-start;
}

/* Sprint 65 decision 3: a gated card dims but keeps its price legible; the
   reason lives in the HintTooltip, not a permanent sentence. */
.purchase-card.gated {
  opacity: 0.7;
}

.purchase-card h4 {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0;
}

.owned-count {
  margin: 0;
  font-size: var(--mg-fs-md);
}

.maxed {
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
}

.tool-wall {
  display: grid;
  /* Sprint 69 item 4: `minmax(0, 1fr)` lets the columns actually shrink. The
     scrollbar was a symptom of the 120px floor - six columns that cannot go
     below 120px overflow any container narrower than ~750px, so `overflow-x`
     was papering over a grid that could not fit by construction. */
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--mg-space-3);
  margin: 0 0 var(--mg-space-3);
}

.tool-column {
  /* The ladder must fill the column so its rows can divide a height every
     column shares (see `.tier-ladder`). */
  display: flex;
  flex-direction: column;
}

.tool-column h4 {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-align: center;
  margin: 0 0 var(--mg-space-2);
  /* Sprint 65 decision 4: reserve two lines so a wrapping label ("Suspension
     and Brakes", "Wheels and Tyres") doesn't push its column's ladder down
     out of line with the single-line columns. */
  min-height: 2.4em;
}

.maxed {
  /* Always occupies its line, hidden when the column isn't maxed - otherwise
     a maxed column's ladder starts lower than its neighbours' and the whole
     wall re-staggers. Same reserve-the-space instinct as the h4 above. */
  min-height: 1.4em;
  margin: 0 0 var(--mg-space-1);
  visibility: hidden;
}

.maxed.shown {
  visibility: visible;
}

/*
 * Rows align across the wall BY CONSTRUCTION, not by hoping every rung's name
 * happens to be the same length.
 *
 * This was a flex column, so each node was only as tall as its own text:
 * "Engine crane & stand" wraps to two lines, "Two-post lift" doesn't, so the
 * tier-2 cards had different heights and every rung below them staggered
 * (Suspension's tier 1 sat ~50px above Engine's). Sprint 65's `min-height` on
 * the h4 fixed the header and left this untouched one level down.
 *
 * Three equal `1fr` rows, in a ladder stretched to the column's full height.
 * The wall's grid already stretches every column to the tallest, so each
 * column divides the SAME height into the same three rows - tier 1 is level
 * with tier 1 everywhere, whatever any label does.
 */
.tier-ladder {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  gap: var(--mg-space-2);
  flex: 1;
}

.tier-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  text-align: center;
  cursor: pointer;
  /* Sprint 65 decision 4: a fixed floor so a node carrying a gate tooltip is
     the same height as one that doesn't - the whole ladder stays aligned. */
  min-height: 76px;
  justify-content: center;
}

.tier-node.owned {
  border-color: var(--mg-success);
}

.tier-node.next {
  border-color: var(--mg-neon-cyan);
}

/* A gated next-rung (rep or classifieds) dims like a locked one; the WHY is
   its HintTooltip (Sprint 65 decision 3). */
.tier-node.locked,
.tier-node.gated {
  opacity: 0.55;
}

.tier-node.selected {
  outline: 2px solid var(--mg-neon-violet);
  outline-offset: 2px;
}

.tier-label {
  color: var(--mg-text-dim);
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tier-name {
  font-size: 0.9em;
}

.tier-node button {
  padding: 2px 8px;
  font-size: 0.8em;
}

.tool-info-box {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.tool-info-box h4 {
  color: var(--mg-neon-violet);
  margin: 0 0 var(--mg-space-2);
}

.tool-info-box p {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
