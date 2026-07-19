<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import SaveMenu from '../components/SaveMenu.vue'
import { useGameStore } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'

/**
 * Sprint 40 item 1 / Sprint 65: the game's real front door - a full-screen
 * menu (no app chrome, Sprint 65 decision 1) that every session boots to and
 * that Escape/the header menu control open on demand as a pause menu.
 * Continue (and Escape while here) returns to the gameplay route the player
 * left, tracked in the ui store - pause-menu semantics, not always the garage.
 * Closes the New Game data-loss footgun (a confirm step before overwriting a
 * career). Deliberately plain, same design tokens as every other screen.
 */
const game = useGameStore()
const router = useRouter()
const ui = useUiStore()

const confirmingNewGame = ref(false)

function onContinue(): void {
  void router.push({ name: ui.lastGameplayRoute })
}

function onNewGameClick(): void {
  if (game.hasExistingSave && !confirmingNewGame.value) {
    confirmingNewGame.value = true
    return
  }
  game.newGame()
  confirmingNewGame.value = false
  void router.push({ name: 'garage' })
}

function cancelNewGame(): void {
  confirmingNewGame.value = false
}
</script>

<template>
  <section class="menu">
    <h1>Ran When Parked</h1>

    <div class="actions">
      <button
        v-if="game.hasExistingSave"
        class="primary"
        data-test="menu-continue"
        @click="onContinue"
      >
        Continue
      </button>

      <div v-if="confirmingNewGame" class="confirm">
        <p class="confirm-text">
          This overwrites your current garage. Copy a save code first if you want to keep it.
        </p>
        <div class="confirm-row">
          <button data-test="menu-new-game-confirm" @click="onNewGameClick">Confirm</button>
          <button data-test="menu-new-game-cancel" @click="cancelNewGame">Cancel</button>
        </div>
      </div>
      <button v-else data-test="menu-new-game" @click="onNewGameClick">New Game</button>

      <SaveMenu />

      <button disabled data-test="menu-settings" title="coming soon">Settings</button>
    </div>
  </section>
</template>

<style scoped>
.menu {
  max-width: 420px;
  margin: var(--mg-space-5) auto 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--mg-space-4);
}

h1 {
  color: var(--mg-neon-violet);
  letter-spacing: 0.3em;
  font-size: var(--mg-fs-xl);
  text-transform: uppercase;
  text-align: center;
  margin: 0;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-3);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-family: inherit;
  font-size: var(--mg-fs-md);
  cursor: pointer;
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

button.primary {
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-violet);
}

.confirm {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-pink);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.confirm-text {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.confirm-row {
  display: flex;
  gap: var(--mg-space-2);
}
</style>
