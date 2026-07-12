<script setup lang="ts">
import {
  ReputationTierSchema,
  type BayKind,
  type ComponentId,
  type ReputationTier,
  type ToolTier,
} from '@midnight-garage/content'
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const ui = useUiStore()

const giveAmount = ref(100_000)
const warpDays = ref(7)
const grantModelId = ref('')
const grantPartId = ref('')
const setToolComponentId = ref<ComponentId>('engine')
const setToolTier = ref<ToolTier>(1)
const toolTierOptions: readonly ToolTier[] = [1, 2, 3]
const grantBayKind = ref<BayKind>('service')
const setReputationTier = ref<ReputationTier>('unknown')
const reputationTiers = ReputationTierSchema.options

function warp(): void {
  for (let i = 0; i < warpDays.value; i++) {
    game.endDay()
  }
}
</script>

<template>
  <aside v-if="ui.devConsoleOpen" class="dev">
    <header>
      <strong>dev console</strong>
      <button @click="ui.toggleDevConsole()">close</button>
    </header>

    <div class="readout">
      day {{ game.day }} · {{ formatYen(game.cashYen) }} · {{ game.ownedCarCount }} cars ·
      {{ game.reputationTier }}
    </div>

    <!-- Sprint 38: specialty is a dev-only readout (progression bible law 4 -
         no player-facing meter; real players only ever see the offer mix
         and copy this drives). -->
    <div class="readout" data-test="specialty-readout">
      specialty:
      <span v-for="line in game.specialtyView" :key="line.componentId">
        {{ line.componentLabel }} {{ line.points }}
      </span>
    </div>

    <!-- Sprint 39: techniques + the derived title, same dev-only exception. -->
    <div class="readout" data-test="techniques-readout">
      title: {{ game.shopTitleName ?? 'none' }} · techniques:
      <span v-if="game.unlockedTechniqueViews.length === 0">none</span>
      <span v-for="t in game.unlockedTechniqueViews" :key="t.id">{{ t.displayName }}</span>
    </div>

    <div class="row">
      <label>give <input v-model.number="giveAmount" type="number" step="50000" /></label>
      <button @click="game.devGiveCash(giveAmount)">add cash</button>
    </div>

    <div class="row">
      <label>warp <input v-model.number="warpDays" type="number" min="1" /> days</label>
      <button @click="warp">warp</button>
    </div>

    <div class="row">
      <select v-model="grantModelId">
        <option value="">random model</option>
        <option v-for="m in game.modelsCatalog" :key="m.id" :value="m.id">
          {{ m.displayName }}
        </option>
      </select>
      <button @click="game.devGrantCar(grantModelId || undefined)">grant car</button>
    </div>

    <div class="row">
      <select v-model="grantPartId">
        <option value="">pick part</option>
        <option v-for="p in game.partsCatalog" :key="p.id" :value="p.id">
          {{ p.brand }} {{ p.name }}
        </option>
      </select>
      <button :disabled="!grantPartId" @click="game.devGrantPart(grantPartId)">grant part</button>
    </div>

    <div class="row">
      <select v-model="setToolComponentId">
        <option
          v-for="line in game.toolLineViews"
          :key="line.componentId"
          :value="line.componentId"
        >
          {{ line.componentLabel }} (tier {{ line.currentTier }})
        </option>
      </select>
      <select v-model.number="setToolTier">
        <option v-for="t in toolTierOptions" :key="t" :value="t">tier {{ t }}</option>
      </select>
      <button @click="game.devSetToolTier(setToolComponentId, setToolTier)">set tool tier</button>
    </div>

    <div class="row">
      <select v-model="grantBayKind">
        <option value="service">service bay</option>
        <option value="parking">parking bay</option>
      </select>
      <button @click="game.devGrantBay(grantBayKind)">grant bay</button>
    </div>

    <div class="row">
      <select v-model="setReputationTier">
        <option v-for="t in reputationTiers" :key="t" :value="t">{{ t }}</option>
      </select>
      <button @click="game.devSetReputationTier(setReputationTier)">set reputation</button>
    </div>
  </aside>
</template>

<style scoped>
.dev {
  position: fixed;
  right: var(--mg-space-3);
  bottom: var(--mg-space-3);
  width: 260px;
  background: var(--mg-night);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
  z-index: 100;
}

.dev header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--mg-neon-violet);
  margin-bottom: var(--mg-space-2);
}

.readout {
  color: var(--mg-text-dim);
  margin-bottom: var(--mg-space-3);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
}

.row input {
  width: 90px;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 4px;
  font-family: inherit;
}

.row select {
  flex: 1;
  min-width: 0;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 4px;
  font-family: inherit;
}

.dev button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
}
</style>
