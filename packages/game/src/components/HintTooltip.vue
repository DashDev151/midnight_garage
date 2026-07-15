<script setup lang="ts">
/**
 * Sprint 65 decision 3: a small shared tooltip for gate/lock explanations -
 * the reason a control is unavailable lives here (revealed on hover or
 * keyboard focus) instead of a permanent sentence inflating the card. A
 * "locked" trigger stays visible so the card still reads as gated at a
 * glance; the WHY is the tooltip. Keyboard-reachable (`tabindex="0"`), and
 * the reason is a real DOM node (a `role="tooltip"` span), never native
 * `title` - `title` stays reserved for secondary detail elsewhere.
 */
defineProps<{ text: string }>()
</script>

<template>
  <span class="hint-tip" tabindex="0" :aria-label="text">
    <span class="hint-trigger" aria-hidden="true">locked</span>
    <span class="hint-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.hint-tip {
  position: relative;
  display: inline-flex;
  cursor: help;
  outline-offset: 2px;
}

.hint-trigger {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid var(--mg-panel-edge);
  border-radius: 4px;
  padding: 0 6px;
}

.hint-bubble {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 220px;
  background: var(--mg-night-deep);
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
  text-align: left;
  z-index: 160;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.12s ease;
  pointer-events: none;
}

.hint-tip:hover .hint-bubble,
.hint-tip:focus .hint-bubble,
.hint-tip:focus-visible .hint-bubble {
  opacity: 1;
  visibility: visible;
}
</style>
