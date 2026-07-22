<script setup lang="ts">
import { ref } from 'vue'
import { loadSessionEvents } from '../save/saveDb'
import { useGameStore } from '../stores/gameStore'

const game = useGameStore()

const loadOpen = ref(false)
const importText = ref('')
const status = ref('')

async function copyCode(): Promise<void> {
  const code = game.exportSaveCode()
  try {
    await navigator.clipboard?.writeText(code)
    status.value = 'Save code copied to clipboard.'
  } catch {
    // Clipboard blocked (or unavailable) - show the code so it can be copied by hand.
    importText.value = code
    status.value = 'Copy the code above and keep it somewhere safe.'
  }
}

function importCode(): void {
  const result = game.importSaveCode(importText.value)
  status.value = result.ok ? 'Save loaded.' : result.error
  if (result.ok) importText.value = ''
}

/** Session log v0 - capture only. No download pattern exists elsewhere to reuse
 * (the save export above copies to the clipboard); this is the small standard
 * Blob + object-URL + anchor-click helper, kept local here until a second
 * consumer needs it.
 */
async function exportSessionLog(): Promise<void> {
  const events = await loadSessionEvents()
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `midnight-garage-session-day${game.day}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  status.value = `Exported ${events.length} session event(s).`
}
</script>

<template>
  <!-- The save controls render inline as the menu's own full-width buttons (no
       toggle-and-popover, no redundant "Save" title) - one honest save surface.
       The Load textarea reveals on demand so the menu isn't cluttered by an
       input the player rarely uses. -->
  <div class="save-menu">
    <p class="nudge">Your save code is your backup - some browsers can forget the game.</p>
    <button class="menu-btn" data-test="copy-save" @click="copyCode">Copy save code</button>
    <button class="menu-btn" data-test="reveal-load" @click="loadOpen = !loadOpen">
      Load from a code
    </button>
    <div v-if="loadOpen" class="load-row">
      <textarea
        v-model="importText"
        data-test="save-code-field"
        rows="3"
        placeholder="paste a save code to load it"
      />
      <button
        class="menu-btn"
        :disabled="!importText.trim()"
        data-test="import-save"
        @click="importCode"
      >
        Load pasted code
      </button>
    </div>
    <button class="menu-btn" data-test="export-session-log" @click="exportSessionLog">
      Export session log
    </button>
    <p v-if="status" class="status" data-test="save-status">{{ status }}</p>
  </div>
</template>

<style scoped>
.save-menu {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.nudge {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0;
}

.menu-btn {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-family: inherit;
  font-size: var(--mg-fs-md);
  cursor: pointer;
}

.menu-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.load-row {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

textarea {
  width: 100%;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  resize: vertical;
}

.status {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  margin: 0;
}
</style>
