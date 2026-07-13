<script setup lang="ts">
import type { ComponentId, ToolTier } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
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
          Better tools finish the same work faster. Tools and bays both cost cash, and past a
          certain rung, both need reputation too.
        </HelpHint>
      </h2>
      <p class="rep">{{ game.reputationTier }} · {{ formatYen(game.cashYen) }}</p>
    </header>

    <section class="facilities">
      <h3>Facilities</h3>
      <div class="facility-row">
        <span>Service bays: {{ game.serviceBayCount }}</span>
        <template v-if="nextServiceBayPriceYen !== null">
          <button
            :disabled="game.cashYen < nextServiceBayPriceYen || nextServiceBayRepGate !== null"
            data-test="buy-service-bay"
            @click="game.buyBay('service')"
          >
            Buy next bay ({{ formatYen(nextServiceBayPriceYen) }})
          </button>
          <span v-if="nextServiceBayRepGate" class="rep-hint">
            needs {{ nextServiceBayRepGate }} reputation
          </span>
        </template>
        <span v-else class="maxed">maxed out</span>
      </div>
      <div class="facility-row">
        <span>Parking bays: {{ game.parkingCapacity }}</span>
        <template v-if="nextParkingBayPriceYen !== null">
          <button
            :disabled="game.cashYen < nextParkingBayPriceYen || nextParkingBayRepGate !== null"
            data-test="buy-parking-bay"
            @click="game.buyBay('parking')"
          >
            Buy next bay ({{ formatYen(nextParkingBayPriceYen) }})
          </button>
          <span v-if="nextParkingBayRepGate" class="rep-hint">
            needs {{ nextParkingBayRepGate }} reputation
          </span>
        </template>
        <span v-else class="maxed">maxed out</span>
      </div>
    </section>

    <section class="tools">
      <h3>
        Tools
        <HelpHint label="Tools">
          Tier 1 of every line is free from day one - nothing basic is ever locked. Tiers 2 and 3
          cost cash AND reputation, the same gate bays use. Click a rung to see what it unlocks.
        </HelpHint>
      </h3>
      <div class="tool-wall">
        <div v-for="line in game.toolLineViews" :key="line.componentId" class="tool-column">
          <h4>{{ line.componentLabel }}</h4>
          <p v-if="line.maxed" class="maxed">Fully equipped</p>
          <ul class="tier-ladder">
            <li
              v-for="rung in [...line.tiers].reverse()"
              :key="rung.tier"
              class="tier-node"
              :class="{
                owned: rung.owned,
                next: !rung.owned && rung.tier === line.currentTier + 1,
                locked: !rung.owned && rung.tier !== line.currentTier + 1,
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
                    game.cashYen < (rung.upgradePriceYen ?? 0) || line.nextTierRepGate !== null
                  "
                  :data-test="'upgrade-tool-' + line.componentId"
                  @click.stop="game.upgradeToolLine(line.componentId)"
                >
                  {{ formatYen(rung.upgradePriceYen ?? 0) }}
                </button>
                <span v-if="line.nextTierRepGate" class="rep-hint">
                  needs {{ line.nextTierRepGate }} reputation
                </span>
              </template>
              <span v-else-if="rung.minReputationTier" class="tier-rep-req">
                needs {{ rung.minReputationTier }}
              </span>
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

.facilities {
  display: grid;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-4);
}

.facility-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.facility-row button {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
}

.maxed {
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
}

.rep-hint {
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

.tool-wall {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: var(--mg-space-3);
  margin: 0 0 var(--mg-space-3);
  overflow-x: auto;
}

.tool-column h4 {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-align: center;
  margin: 0 0 var(--mg-space-2);
}

.tier-ladder {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.tier-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  text-align: center;
  cursor: pointer;
}

.tier-node.owned {
  border-color: var(--mg-success);
}

.tier-node.next {
  border-color: var(--mg-neon-cyan);
}

.tier-node.locked {
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

.tier-rep-req {
  color: var(--mg-text-dim);
  font-size: 0.75em;
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
