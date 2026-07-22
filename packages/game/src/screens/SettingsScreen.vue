<script setup lang="ts">
import type { FusePreset } from '@midnight-garage/content'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'

/**
 * A small settings surface reached
 * from the pause menu's own "Settings" entry, chrome-free like the menu
 * itself (a sub-page of the same pause flow, not a gameplay nav tab). Hosts
 * the accessibility fuse-length presets and the auction room's auto-bid
 * enable toggle, both of which used to live on the live room screen itself -
 * moved here so the room keeps only play controls, and both are persisted
 * settings (`uiSettings`) rather than per-room state.
 */

const game = useGameStore()

const FUSE_LABEL: Record<FusePreset, string> = {
  standard: 'Standard',
  relaxed: 'Relaxed',
  unhurried: 'Unhurried',
}
const FUSE_PRESETS: readonly FusePreset[] = ['standard', 'relaxed', 'unhurried']

function selectFusePreset(preset: FusePreset): void {
  game.setFusePreset(preset)
}

function onAutoBidToggle(event: Event): void {
  game.setAutoBidEnabled((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="settings">
    <RouterLink :to="{ name: 'menu' }" class="back">&lt; Menu</RouterLink>
    <h2>Settings</h2>

    <div class="panel">
      <h3>Fuse</h3>
      <p class="explainer">How long each bid stays open before the hammer.</p>
      <div class="fuse-presets" data-test="fuse-presets">
        <button
          v-for="preset in FUSE_PRESETS"
          :key="preset"
          type="button"
          class="fuse-preset-btn"
          :class="{ active: game.fusePreset === preset }"
          :data-test="'fuse-preset-' + preset"
          @click="selectFusePreset(preset)"
        >
          {{ FUSE_LABEL[preset] }}
        </button>
      </div>
    </div>

    <div class="panel">
      <h3>Auction room</h3>
      <label class="autobid-toggle-row">
        <input
          type="checkbox"
          data-test="autobid-enable-toggle"
          :checked="game.autoBidEnabled"
          @change="onAutoBidToggle"
        />
        Auto-bid
      </label>
    </div>
  </section>
</template>

<style scoped>
.settings {
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-3);
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-2);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0;
}

.explainer {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.fuse-presets {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

.fuse-preset-btn {
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  background: transparent;
}

.fuse-preset-btn.active {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

.autobid-toggle-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-2) var(--mg-space-3);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}
</style>
