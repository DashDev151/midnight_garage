<script setup lang="ts">
import { ref } from 'vue'

/**
 * Sprint 33 decision 1 (UI declutter): the shared help affordance that
 * replaces every permanent `<p class="how">...</p>` explainer paragraph
 * that used to sit unconditionally on a main gameplay screen (the
 * playtest-flagged "drag a car onto another slot..." move hint, the
 * "Owning a component's equipment is what unlocks Repair..." equipment
 * explainer, and half a dozen others just like them). The explainer text
 * itself is unchanged - only WHEN it renders changes: collapsed by default,
 * shown on click, never permanent chrome. One small reusable component
 * instead of nine ad hoc `v-if` toggles (directive 3, DRY).
 *
 * Keyboard-and-pointer by construction: a real `<button>` toggles `open`,
 * so Tab/Enter/Space work with no extra wiring.
 */
defineProps<{ label?: string }>()

const open = ref(false)
</script>

<template>
  <span class="help-hint">
    <button
      type="button"
      class="help-hint-toggle"
      :aria-expanded="open"
      :aria-label="
        open ? `Hide help${label ? ': ' + label : ''}` : `Show help${label ? ': ' + label : ''}`
      "
      @click="open = !open"
    >
      ?
    </button>
    <span v-if="open" class="help-hint-popover" role="note">
      <slot />
    </span>
  </span>
</template>

<style scoped>
.help-hint {
  position: relative;
  display: inline-block;
  margin-left: var(--mg-space-2);
  vertical-align: middle;
}

.help-hint-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.3em;
  height: 1.3em;
  padding: 0;
  border-radius: 999px;
  border: var(--mg-border);
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  line-height: 1;
  cursor: pointer;
}

.help-hint-toggle:hover,
.help-hint-toggle[aria-expanded='true'] {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

.help-hint-popover {
  position: absolute;
  z-index: 20;
  top: 130%;
  left: 0;
  width: max-content;
  max-width: 320px;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}
</style>
