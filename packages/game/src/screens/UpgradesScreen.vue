<script setup lang="ts">
/**
 * The garage purchase page, laid out as the garage itself: three places, in
 * the order the shop floor has them. Membership rule: work AT it, bench; car
 * goes ON it, bay; walk INTO it, room.
 */
import type { ComponentId, ToolTier } from '@midnight-garage/content'
import { WORKBENCH } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import HintTooltip from '../components/HintTooltip.vue'
import { mapBackTarget } from './mapBack'
import { useGameStore, type ToolLineView, type ToolShopView } from '../stores/gameStore'
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

/** The two-post lift's own reputation gate, in the same shape. */
const liftRepGate = computed(() =>
  game.liftPurchaseGateReason === 'reputation' ? game.liftMinReputationTier : null,
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

/** The six tool lines under the bench each one is worked at, in the content's
 * own bench order (`workbench.json`: `benches` and `benchByGroup`). */
const benchGroups = computed(() =>
  WORKBENCH.benches.map((bench) => ({
    id: bench.id,
    displayName: bench.displayName,
    lines: game.toolLineViews.filter(
      (line) => WORKBENCH.benchByGroup[line.componentId] === bench.id,
    ),
  })),
)

/** The shop covering each line, so a row can tell whether its rung 2 has
 * already been overtaken by the room above it. */
const shopByLine = computed(() => {
  const byLine = {} as Record<ComponentId, ToolShopView>
  for (const shop of game.toolShopViews) {
    for (const componentId of shop.covers) byLine[componentId] = shop
  }
  return byLine
})

/** Whether the room covering this line is already fitted out - owning it
 * grants the whole tier 2 kit, so the rung's price gives way to a chip. */
function coveringShopOwned(componentId: ComponentId): boolean {
  return shopByLine.value[componentId]?.owned === true
}

/** Whether rung 2 is still on offer on this line: unbought, and not already
 * overtaken by the covering room. */
function rungTwoOffered(line: ToolLineView): boolean {
  return !line.maxed && !coveringShopOwned(line.componentId)
}

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

    <!-- Work AT it: the six tool lines, each under the bench it is worked at. -->
    <section class="benches" data-test="garage-benches">
      <h3>
        Benches
        <HelpHint label="Benches">
          Tier 1 of every line is free from day one - nothing basic is ever locked. Tier 2 takes
          cash and reputation. Above the rungs sit the shops, which are bought whole rather than a
          line at a time. Click anything to see what it does.
        </HelpHint>
      </h3>
      <div
        v-for="bench in benchGroups"
        :key="bench.id"
        class="bench-group"
        :data-test="'bench-group-' + bench.id"
      >
        <h4>{{ bench.displayName }}</h4>
        <ul class="tool-lines">
          <li
            v-for="line in bench.lines"
            :key="line.componentId"
            class="tool-line"
            :data-test="'tool-line-' + line.componentId"
          >
            <div class="line-head">
              <span class="line-name">{{ line.componentLabel }}</span>
              <span v-if="line.maxed" class="maxed">Both rungs owned</span>
            </div>
            <ul class="tier-ladder">
              <li
                v-for="rung in line.tiers"
                :key="rung.tier"
                class="tier-node"
                :class="{
                  owned: rung.owned,
                  next: !rung.owned && rung.tier === line.currentTier + 1,
                  locked: !rung.owned && rung.tier !== line.currentTier + 1,
                  gated:
                    !rung.owned &&
                    rung.tier === line.currentTier + 1 &&
                    line.nextTierRepGate !== null &&
                    !coveringShopOwned(line.componentId),
                  selected: isRungSelected(line.componentId, rung.tier),
                }"
                :data-test="'tier-node-' + line.componentId + '-' + rung.tier"
                @click="selectRung(line.componentId, rung.tier)"
              >
                <span class="tier-label">Tier {{ rung.tier }}</span>
                <span class="tier-name">{{ rung.displayName }}</span>
                <template v-if="!rung.owned && rung.tier === line.currentTier + 1">
                  <!-- The room above the bench already grants this kit, so the
                       rung states that rather than selling it twice. -->
                  <span
                    v-if="coveringShopOwned(line.componentId)"
                    class="chip owned"
                    :data-test="'line-shop-chip-' + line.componentId"
                    >Shop</span
                  >
                  <template v-else>
                    <button
                      :disabled="
                        game.cashYen < (rung.upgradePriceYen ?? 0) || line.nextTierRepGate !== null
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
                  </template>
                </template>
                <HintTooltip
                  v-else-if="rung.minReputationTier"
                  :data-test="'gate-tip-tier-' + line.componentId + '-' + rung.tier"
                  :text="`Needs ${rung.minReputationTier} reputation`"
                />
              </li>
            </ul>
            <p
              v-if="rungTwoOffered(line)"
              class="line-note"
              :data-test="'tool-line-note-' + line.componentId"
            >
              Fills the {{ bench.displayName }} board and brings its rig.
            </p>
          </li>
        </ul>
      </div>
    </section>

    <!-- Car goes ON it: the kit the car itself is put on for the day's work. -->
    <section class="bay" data-test="garage-bay">
      <h3>The bay</h3>
      <ul class="bay-list">
        <li
          class="bay-row"
          :class="{ owned: game.liftOwned, gated: !game.liftOwned && liftRepGate !== null }"
          data-test="lift-row"
        >
          <span class="bay-name">Two-post lift</span>
          <p class="bay-note">Under-car work runs lighter on the lift.</p>
          <div class="bay-controls">
            <span v-if="game.liftOwned" class="chip owned" data-test="lift-chip">In-house</span>
            <template v-else>
              <span v-if="game.liftAvailableToday" class="chip hired" data-test="lift-chip"
                >Hired today</span
              >
              <button
                v-else
                type="button"
                :disabled="game.cashYen < game.liftHireFeeYen"
                data-test="hire-lift-upgrades"
                @click="game.hireLift()"
              >
                Hire for the day ({{ formatYen(game.liftHireFeeYen) }})
              </button>
              <button
                type="button"
                :disabled="game.liftPurchaseGateReason !== null"
                data-test="buy-lift"
                @click="game.buyLift()"
              >
                {{ formatYen(game.liftPurchasePriceYen) }}
              </button>
              <HintTooltip
                v-if="liftRepGate"
                data-test="gate-tip-lift"
                :text="`Your standing isn't there yet - needs ${liftRepGate} reputation`"
              />
            </template>
          </div>
        </li>
        <li
          class="bay-row"
          :class="{ owned: game.dynoOwned, gated: !game.dynoOwned && dynoRepGate !== null }"
          data-test="dyno-row"
        >
          <span class="bay-name">{{ DYNO_NAME }}</span>
          <p class="bay-note">Chassis dyno &amp; printer</p>
          <div class="bay-controls">
            <span v-if="game.dynoOwned" class="maxed">Fully equipped</span>
            <template v-else>
              <button
                type="button"
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
            </template>
          </div>
        </li>
      </ul>
      <p v-if="!game.dynoOwned" class="dyno-hire-line" data-test="dyno-hire-line">
        Until you own one, a session on the rollers needs a portable dyno hired in for the day at
        {{ formatYen(game.dynoHireFeeYen) }}.
      </p>
    </section>

    <!-- Walk INTO it: a room is one purchase that tops out every line it
         covers, never a third rung on any of them. -->
    <section class="rooms" data-test="garage-rooms">
      <h3>
        Rooms
        <HelpHint label="Rooms">
          A shop is not another rung on a line. It is one purchase covering several lines at once,
          and every one of them reaches its top the day it lands. Each card says which lines it
          takes.
        </HelpHint>
      </h3>
      <div class="purchase-grid shops-grid">
        <div
          v-for="shop in game.toolShopViews"
          :key="shop.id"
          class="purchase-card shop-card"
          :class="{
            owned: shop.owned,
            gated: !shop.owned && shop.repGate !== null,
            selected: isShopSelected(shop.id),
          }"
          :data-test="'tool-shop-' + shop.id"
          @click="selectShop(shop.id)"
        >
          <h4>{{ shop.displayName }}</h4>
          <p class="shop-covers" :data-test="'tool-shop-covers-' + shop.id">
            Covers {{ shop.coversLabels.join(', ') }}
          </p>
          <p class="shop-covers" :data-test="'tool-shop-restore-' + shop.id">
            Restore work for {{ shop.coversLabels.join(', ') }} happens in here.
          </p>
          <span v-if="shop.owned" class="shop-fitted" :data-test="'tool-shop-owned-' + shop.id"
            >Fitted out</span
          >
          <template v-else>
            <button
              :disabled="game.cashYen < shop.priceYen || shop.repGate !== null"
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
          </template>
        </div>
      </div>
    </section>

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

.facilities,
.benches,
.bay,
.rooms {
  margin-bottom: var(--mg-space-4);
}

/* Facilities are cards in the same grid/card
   language the rooms use - symmetrical columns, consistent
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

.bench-group {
  margin-bottom: var(--mg-space-3);
}

.bench-group h4 {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-2);
}

.tool-lines,
.bay-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

/*
 * One line is one row: what it is on the left, its two rungs on the right, and
 * the note about the rung still to buy under the name. The two areas share a
 * column each, so every row's rungs stand in the same place down the bench
 * whatever its label does.
 */
.tool-line,
.bay-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) auto;
  grid-template-areas:
    'name kit'
    'note kit';
  align-items: center;
  column-gap: var(--mg-space-3);
}

.line-head {
  grid-area: name;
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.line-name {
  font-size: var(--mg-fs-sm);
}

.line-note,
.bay-note {
  grid-area: note;
  margin: 0;
  color: var(--mg-text-dim);
  font-size: 0.75em;
}

.tier-ladder {
  grid-area: kit;
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: var(--mg-space-2);
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
  /* A fixed floor and width so a node carrying a gate tooltip is the same size
     as one that doesn't - the rungs stay square with each other down the
     bench. */
  min-height: 76px;
  min-width: 132px;
}

.tier-node.owned {
  border-color: var(--mg-success);
}

.tier-node.next {
  border-color: var(--mg-neon-cyan);
}

/* A rung still short of its reputation gate dims like a locked one; the WHY is
   its HintTooltip. */
.tier-node.locked,
.tier-node.gated {
  opacity: 0.55;
}

.tier-node.selected {
  outline: 2px solid var(--mg-neon-violet);
  outline-offset: 2px;
}

/* A bay row is a panel in its own right: the kit stands in the room rather
   than on a bench, so the row carries the border its rungs would. */
.bay-row {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  row-gap: 2px;
}

.bay-row.owned {
  border-color: var(--mg-success);
}

.bay-row.gated {
  opacity: 0.7;
}

.bay-name {
  grid-area: name;
  font-size: var(--mg-fs-sm);
}

.bay-controls {
  grid-area: kit;
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.chip {
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: 0 var(--mg-space-1);
  font-size: var(--mg-fs-sm);
  white-space: nowrap;
}

.chip.owned {
  color: var(--mg-success);
}

.chip.hired {
  color: var(--mg-yen);
}

.dyno-hire-line {
  margin: var(--mg-space-2) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
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

/* A shop's owned state, in the same success colour a maxed line's label
   carries. Its own class because a shop card sits outside the bench rows and
   so takes none of their row layout. */
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

.tier-node button,
.bay-controls button {
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
