<script setup lang="ts">
import type { ComponentId, ToolTier } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import HintTooltip from '../components/HintTooltip.vue'
import { mapBackTarget } from './mapBack'
import { useGameStore, type ToolShopView } from '../stores/gameStore'
import { DYNO_NAME } from '../utils/dynoLabels'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const route = useRoute()

/** The tab bar reaches this screen too, with no `from` flag - the back
 * control then falls back to the garage exactly as it always has
 * (`mapBack.ts`). */
const backTarget = computed(() => mapBackTarget(route.query.from, { name: 'garage' }))

/** The reputation the rolling road still needs, or null once it is met (or
 * already owned) - the hint-only-when-unmet shape the tool lines' own
 * `nextTierRepGate` uses. */
const dynoRepGate = computed(() =>
  game.dynoPurchaseGateReason === 'reputation' ? game.dynoMinReputationTier : null,
)

const nextServiceBayPriceYen = computed(() => game.nextBayPrice('service'))
const nextParkingBayPriceYen = computed(() => game.nextBayPrice('parking'))
const nextForecourtBayPriceYen = computed(() => game.nextBayPrice('forecourt'))
const nextServiceBayRepGate = computed(() => game.nextBayReputationGate('service'))
const nextParkingBayRepGate = computed(() => game.nextBayReputationGate('parking'))
const nextForecourtBayRepGate = computed(() => game.nextBayReputationGate('forecourt'))

/**
 * Whatever the info box is currently open on - null until the player picks
 * something. The ladder has two kinds of thing to pick: a rung of one line, or
 * a shop covering several. Any of either can be selected (owned, next, or
 * locked); only the ones actually purchasable today also carry a live buy
 * button.
 */
type LadderSelection =
  { kind: 'rung'; componentId: ComponentId; tier: ToolTier } | { kind: 'shop'; shopId: string }

const selected = ref<LadderSelection | null>(null)

function isRungSelected(componentId: ComponentId, tier: ToolTier): boolean {
  return (
    selected.value?.kind === 'rung' &&
    selected.value.componentId === componentId &&
    selected.value.tier === tier
  )
}

function isShopSelected(shopId: string): boolean {
  return selected.value?.kind === 'shop' && selected.value.shopId === shopId
}

function selectRung(componentId: ComponentId, tier: ToolTier): void {
  selected.value = isRungSelected(componentId, tier) ? null : { kind: 'rung', componentId, tier }
}

function selectShop(shopId: string): void {
  selected.value = isShopSelected(shopId) ? null : { kind: 'shop', shopId }
}

/** The shop covering each line, so a column can name what sits above its two
 * rungs and a player never has to work out the coverage from the cards alone. */
const shopByLine = computed(() => {
  const byLine = {} as Record<ComponentId, ToolShopView>
  for (const shop of game.toolShopViews) {
    for (const componentId of shop.covers) byLine[componentId] = shop
  }
  return byLine
})

/** The info box's heading: a rung is one line at one tier, a shop is its own
 * name and every line it covers. */
const selectedTitle = computed(() => {
  const choice = selected.value
  if (!choice) return null
  if (choice.kind === 'shop') {
    const shop = game.toolShopViews.find((view) => view.id === choice.shopId)
    return shop ? `${shop.displayName} - covers ${shop.coversLabels.join(', ')}` : null
  }
  const line = game.toolLineViews.find((view) => view.componentId === choice.componentId)
  return line ? `${line.componentLabel} - tier ${choice.tier}` : null
})

const selectedInfo = computed(() => {
  const choice = selected.value
  if (!choice) return null
  return choice.kind === 'shop'
    ? game.toolShopInfo(choice.shopId)
    : game.toolTierInfo(choice.componentId, choice.tier)
})
</script>

<template>
  <section class="upgrades">
    <RouterLink :to="backTarget" class="back">&lt; Back</RouterLink>
    <header class="head">
      <h2>
        Upgrades
        <HelpHint label="Upgrades">
          Better tools finish the same work faster. Tools and bays both cost cash, and once your
          standing in town grows, both cost a little reputation too.
        </HelpHint>
      </h2>
      <p class="rep">{{ game.reputationTier }}</p>
    </header>

    <section class="classifieds">
      <h3>
        Classifieds
        <HelpHint label="Classifieds">
          Used machinery doesn't show up on demand - the trade paper lists one thing at a time,
          every few days, sometimes a single machine and sometimes a whole shop being sold off,
          drawn from whatever your standing already qualifies you for. Miss one and it isn't gone
          for good; a later issue can list it again.
        </HelpHint>
      </h3>
      <div v-if="game.machineListingView" class="listing-card" data-test="machine-listing">
        <span v-if="game.machineListingView.tier !== null" class="listing-line"
          >Tier {{ game.machineListingView.tier }} - {{ game.machineListingView.displayName }}</span
        >
        <span v-else class="listing-line">{{ game.machineListingView.displayName }}</span>
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
        <div class="purchase-card" :class="{ gated: nextForecourtBayRepGate !== null }">
          <h4>Forecourt bays</h4>
          <p class="owned-count">{{ game.forecourtCapacity }} owned</p>
          <template v-if="nextForecourtBayPriceYen !== null">
            <button
              :disabled="
                game.cashYen < nextForecourtBayPriceYen || nextForecourtBayRepGate !== null
              "
              data-test="buy-forecourt-bay"
              @click="game.buyBay('forecourt')"
            >
              Next bay - {{ formatYen(nextForecourtBayPriceYen) }}
            </button>
            <HintTooltip
              v-if="nextForecourtBayRepGate"
              data-test="gate-tip-forecourt-bay"
              :text="`Your standing isn't there yet - needs ${nextForecourtBayRepGate} reputation`"
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
          Tier 1 of every line is free from day one - nothing basic is ever locked. Tier 2 takes
          cash, reputation, and a live classifieds listing for that exact machine. Above the rungs
          sit the shops, which are bought whole rather than a line at a time. Click anything to see
          what it does.
        </HelpHint>
      </h3>
      <div class="tool-wall">
        <div v-for="line in game.toolLineViews" :key="line.componentId" class="tool-column">
          <h4>{{ line.componentLabel }}</h4>
          <p class="maxed" :class="{ shown: line.maxed }">Both rungs owned</p>
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
                selected: isRungSelected(line.componentId, rung.tier),
              }"
              :data-test="'tier-node-' + line.componentId + '-' + rung.tier"
              @click="selectRung(line.componentId, rung.tier)"
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
          <!-- Which shop tops this line out, so the wall reads both ways: a
               card names its lines, and a line names its card. -->
          <p
            class="line-shop"
            :class="{ fitted: shopByLine[line.componentId]?.owned }"
            :data-test="'line-shop-' + line.componentId"
          >
            {{
              shopByLine[line.componentId]?.owned
                ? `${shopByLine[line.componentId]?.displayName}, in-house`
                : `Topped by the ${shopByLine[line.componentId]?.displayName}`
            }}
          </p>
        </div>

        <!--
          The rolling road stands in the wall alongside the six lines and is
          bought the same way. It is not one of them (a dyno belongs to no part
          group and repairs nothing), so it carries a single rung rather than a
          ladder, and no shop tops it out.
        -->
        <div class="tool-column" data-test="dyno-column">
          <h4>{{ DYNO_NAME }}</h4>
          <p class="maxed" :class="{ shown: game.dynoOwned }">Fully equipped</p>
          <ul class="tier-ladder">
            <li
              class="tier-node dyno-node"
              :class="{
                owned: game.dynoOwned,
                next: !game.dynoOwned && dynoRepGate === null,
                gated: !game.dynoOwned && dynoRepGate !== null,
              }"
              data-test="dyno-node"
            >
              <span class="tier-label">Rollers</span>
              <span class="tier-name">Chassis dyno &amp; printer</span>
              <button
                v-if="!game.dynoOwned"
                :disabled="game.dynoPurchaseGateReason !== null"
                data-test="buy-dyno"
                @click="game.buyDyno()"
              >
                {{ formatYen(game.dynoPurchasePriceYen) }}
              </button>
              <HintTooltip
                v-if="dynoRepGate"
                data-test="gate-tip-dyno"
                :text="`Your standing isn't there yet - needs ${dynoRepGate} reputation`"
              />
            </li>
          </ul>
          <p class="line-shop"></p>
        </div>
      </div>

      <p v-if="!game.dynoOwned" class="dyno-hire-line" data-test="dyno-hire-line">
        Until you own one, a session on the rollers needs a portable dyno hired in for the day at
        {{ formatYen(game.dynoHireFeeYen) }}.
      </p>

      <!--
        The shops, kept deliberately apart from the wall above. A shop is not a
        third rung on a line: it is one purchase that fits out a room, and every
        line it covers goes to the top together. Each card names those lines, and
        each column up in the wall names its card back.
      -->
      <h3 class="shops-head">
        Shops
        <HelpHint label="Shops">
          A shop is not another rung on a line. It is one purchase covering several lines at once,
          and every one of them reaches its top the day it lands. Each card says which lines it
          takes. They come up in the classifieds whole, the same as any single machine.
        </HelpHint>
      </h3>
      <div class="purchase-grid shops-grid">
        <div
          v-for="shop in game.toolShopViews"
          :key="shop.id"
          class="purchase-card shop-card"
          :class="{
            owned: shop.owned,
            gated: !shop.owned && (shop.repGate !== null || !shop.isListed),
            selected: isShopSelected(shop.id),
          }"
          :data-test="'tool-shop-' + shop.id"
          @click="selectShop(shop.id)"
        >
          <h4>{{ shop.displayName }}</h4>
          <p class="shop-covers" :data-test="'tool-shop-covers-' + shop.id">
            Covers {{ shop.coversLabels.join(', ') }}
          </p>
          <span v-if="shop.owned" class="shop-fitted" :data-test="'tool-shop-owned-' + shop.id"
            >Fitted out</span
          >
          <template v-else>
            <button
              :disabled="game.cashYen < shop.priceYen || shop.repGate !== null || !shop.isListed"
              :data-test="'buy-tool-shop-' + shop.id"
              @click.stop="game.buyToolShop(shop.id)"
            >
              {{ formatYen(shop.priceYen) }}
            </button>
            <HintTooltip
              v-if="shop.repGate"
              :data-test="'gate-tip-shop-' + shop.id"
              :text="`Your standing isn't there yet - needs ${shop.repGate} reputation`"
            />
            <HintTooltip
              v-else-if="!shop.isListed"
              :data-test="'needs-listing-shop-' + shop.id"
              text="Watch the classifieds - nobody is selling up this week"
            />
            <span v-else class="shop-listed" :data-test="'shop-listed-' + shop.id"
              >In this week's paper</span
            >
          </template>
        </div>
      </div>

      <div v-if="selectedTitle && selectedInfo" class="tool-info-box" data-test="tool-info-box">
        <h4>{{ selectedTitle }}</h4>
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
  color: var(--mg-neon-violet);
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

/* Facilities are cards in the same grid/card
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
  /* A fixed floor so a gated card (with its tooltip
     trigger) never renders taller than its sibling, staggering the grid. */
  min-height: 132px;
  justify-content: flex-start;
}

/* A gated card dims but keeps its price legible; the
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
  /* `minmax(0, 1fr)` lets the columns actually shrink - a fixed floor across
     seven columns would overflow any container narrower than seven times that
     floor, so `overflow-x` alone cannot fix a grid that does not fit by
     construction. */
  grid-template-columns: repeat(7, minmax(0, 1fr));
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
  /* Reserve two lines so a wrapping label ("Suspension
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
 * happens to be the same length: two equal `1fr` rows, in a ladder
 * stretched to the column's full height. The wall's grid already stretches
 * every column to the tallest, so each column divides the SAME height into
 * the same two rows - tier 1 is level with tier 1 everywhere, whatever any
 * label does.
 */
.tier-ladder {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-rows: repeat(2, 1fr);
  gap: var(--mg-space-2);
  flex: 1;
}

/* The shop that tops a line out, at the foot of its column. The rolling road
   renders an empty one so its single node stays level with the ladders beside
   it. */
.line-shop {
  margin: var(--mg-space-1) 0 0;
  min-height: 2.6em;
  color: var(--mg-text-dim);
  font-size: 0.75em;
  text-align: center;
}

.line-shop.fitted {
  color: var(--mg-success);
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
  /* A fixed floor so a node carrying a gate tooltip is
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
   its HintTooltip. */
.tier-node.locked,
.tier-node.gated {
  opacity: 0.55;
}

.tier-node.selected {
  outline: 2px solid var(--mg-neon-violet);
  outline-offset: 2px;
}

/* One rung, filling the height the six ladders divide in two, so the
   rolling road's column squares off against them instead of floating at the
   top of the wall. */
.dyno-node {
  grid-row: 1 / -1;
  cursor: default;
}

.dyno-hire-line {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.shops-head {
  margin-top: var(--mg-space-3);
}

.shops-grid {
  margin-bottom: var(--mg-space-3);
}

/* A shop card is a facility card that can also be selected for the info box,
   so it takes the same grid and the same gated dimming, plus the ladder's own
   selected outline. */
.shop-card {
  cursor: pointer;
}

.shop-card.owned {
  border-color: var(--mg-success);
}

.shop-card.selected {
  outline: 2px solid var(--mg-neon-violet);
  outline-offset: 2px;
}

.shop-covers {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.shop-listed {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
}

/* Deliberately not `.maxed`: that class is the tool wall's reserved,
   visibility-toggled slot, and a shop's owned state is always shown. */
.shop-fitted {
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
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
