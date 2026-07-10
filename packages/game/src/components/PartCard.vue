<script setup lang="ts">
import type { Part, PartInstance } from '@midnight-garage/content'
import { useDraggable } from '../composables/useDragAndDrop'

/**
 * One owned part instance, draggable onto a compatible component's drop zone
 * (Sprint 18 — the second consumer of Sprint 17's drag-and-drop composable).
 * Purely presentational: the parent decides what a drop actually does
 * (stage an install) and which components currently accept this part.
 */
const props = withDefaults(
  defineProps<{
    instance: PartInstance
    part: Part
    /**
     * Whether this part fits the current pick context (e.g. the component a
     * `ReplaceDrawer` is scoped to). A non-fitting card still renders — the
     * player sees their whole inventory, not a mysteriously shorter list —
     * but is dimmed and inert to the click-to-select fast path; dragging it
     * onto an incompatible drop zone still simply fails to land, same as
     * before. Defaults to true: the standalone browse screen has no "fits
     * what" context, so every card is always eligible there.
     */
    fits?: boolean
  }>(),
  { fits: true },
)

const emit = defineEmits<{
  /** A plain click (not the drag gesture, not the "move…" pick toggle) — the
   * fast path: select this part for whatever the parent's current context is. */
  select: [partInstanceId: string]
}>()

const draggable = useDraggable(() => props.instance.id)

function onCardClick(): void {
  if (!props.fits) return
  emit('select', props.instance.id)
}
</script>

<template>
  <li
    class="part-card"
    :class="{
      dragging: draggable.isDragging.value,
      picked: draggable.isPicked.value,
      'no-fit': !fits,
    }"
    @pointerdown="draggable.onPointerDown"
    @pointermove="draggable.onPointerMove"
    @pointerup="draggable.onPointerUp"
    @click="onCardClick"
  >
    <div class="part-info">
      <span class="part-name">{{ part.brand }} {{ part.name }}</span>
      <span class="part-meta">{{ part.componentId }} &middot; {{ part.grade }}</span>
      <span v-if="!fits" class="no-fit-hint">doesn't fit here</span>
    </div>
    <button
      type="button"
      class="grab-handle"
      :aria-pressed="draggable.isPicked.value"
      :data-test="'pick-part-' + instance.id"
      @click.stop="draggable.togglePick"
    >
      {{ draggable.isPicked.value ? 'cancel' : 'move…' }}
    </button>
  </li>
</template>

<style scoped>
.part-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  touch-action: none;
  cursor: pointer;
}

.part-card.dragging {
  opacity: 0.35;
  outline: 1px dashed var(--mg-neon-cyan);
  outline-offset: 4px;
  cursor: grabbing;
}

.part-card.picked {
  outline: 2px dashed var(--mg-neon-violet);
  outline-offset: 4px;
}

.part-card.no-fit {
  opacity: 0.45;
  cursor: default;
}

.part-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.part-name {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
}

.part-meta {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
}

.no-fit-hint {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.grab-handle {
  flex: none;
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}
</style>
