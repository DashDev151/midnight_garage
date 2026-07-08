<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const game = useGameStore()

const open = ref(false)
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
</script>

<template>
  <div class="save-menu">
    <button class="toggle" data-test="save-toggle" @click="open = !open">Save</button>
    <div v-if="open" class="panel">
      <p class="nudge">Your save code is your backup — some browsers can forget the game.</p>
      <button data-test="copy-save" @click="copyCode">Copy save code</button>
      <textarea
        v-model="importText"
        data-test="save-code-field"
        rows="3"
        placeholder="paste a save code to load it"
      />
      <button :disabled="!importText.trim()" data-test="import-save" @click="importCode">
        Load pasted code
      </button>
      <p v-if="status" class="status">{{ status }}</p>
    </div>
  </div>
</template>

<style scoped>
.save-menu {
  position: relative;
}

.toggle {
  background: transparent;
  color: var(--mg-text-dim);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  cursor: pointer;
}

.panel {
  position: absolute;
  right: 0;
  top: 120%;
  width: 280px;
  background: var(--mg-night);
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  z-index: 150;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-2);
}

.nudge {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0;
}

.panel button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  cursor: pointer;
}

.panel button:disabled {
  opacity: 0.4;
  cursor: default;
}

textarea {
  width: 100%;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1);
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
