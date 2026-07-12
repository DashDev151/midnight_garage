<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()

const nextServiceBayPriceYen = computed(() => game.nextBayPrice('service'))
const nextParkingBayPriceYen = computed(() => game.nextBayPrice('parking'))
const nextServiceBayRepGate = computed(() => game.nextBayReputationGate('service'))
const nextParkingBayRepGate = computed(() => game.nextBayReputationGate('parking'))
</script>

<template>
  <section class="upgrades">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <header class="head">
      <h2>
        Upgrades
        <HelpHint label="Upgrades">
          Tool upgrades take cash only - better tools finish the same work faster. Bays take cash
          and, past a certain rung, reputation.
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
          You own every line of tools from day one - upgrades make the same work faster. Nothing
          here is ever locked behind reputation.
        </HelpHint>
      </h3>
      <ul class="tool-list">
        <li v-for="line in game.toolLineViews" :key="line.componentId" class="tool-row">
          <span class="tool-line-name">{{ line.componentLabel }}</span>
          <span class="tool-tier-name"
            >{{ line.currentTierName }} (tier {{ line.currentTier }})</span
          >
          <template v-if="!line.maxed">
            <button
              :disabled="game.cashYen < (line.nextTierPriceYen ?? 0)"
              :data-test="'upgrade-tool-' + line.componentId"
              @click="game.upgradeToolLine(line.componentId)"
            >
              Upgrade: {{ line.nextTierName }} ({{ formatYen(line.nextTierPriceYen ?? 0) }})
            </button>
          </template>
          <span v-else class="maxed">Fully equipped</span>
        </li>
      </ul>
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

.tool-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-2);
}

.tool-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.tool-line-name {
  width: 110px;
  flex-shrink: 0;
}

.tool-tier-name {
  flex: 1 1 auto;
  color: var(--mg-text-dim);
}

.tool-row button {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
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
