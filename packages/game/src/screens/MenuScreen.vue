<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import SaveMenu from '../components/SaveMenu.vue'
import { useGameStore } from '../stores/gameStore'

/**
 * Sprint 40 item 1: the temporary main menu every session now boots to
 * (`main.ts` replaces the route to here right after `hydrate()` resolves) -
 * closes the New Game data-loss footgun (it used to sit on the garage
 * screen with no confirmation, one misclick from overwriting a career) and
 * gives the game a real front door: Continue, New Game, Load, Settings.
 * Deliberately plain, same design tokens as every other screen - no art
 * pass, this is a placeholder until a real title screen exists.
 */
const game = useGameStore()
const router = useRouter()

const confirmingNewGame = ref(false)

function goToGarage(): void {
  void router.push({ name: 'garage' })
}

function onNewGameClick(): void {
  if (game.hasExistingSave && !confirmingNewGame.value) {
    confirmingNewGame.value = true
    return
  }
  game.newGame()
  confirmingNewGame.value = false
  goToGarage()
}

function cancelNewGame(): void {
  confirmingNewGame.value = false
}
</script>

<template>
  <section class="menu">
    <div class="actions">
      <button
        v-if="game.hasExistingSave"
        class="primary"
        data-test="menu-continue"
        @click="goToGarage"
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

      <button disabled data-test="menu-settings" title="coming soon">Settings</button>
    </div>

    <section class="save-section">
      <h2>Save</h2>
      <SaveMenu />
    </section>
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

.save-section {
  border-top: var(--mg-border);
  padding-top: var(--mg-space-3);
}

.save-section h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
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
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-pink);
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
