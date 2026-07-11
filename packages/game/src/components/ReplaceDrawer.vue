<script setup lang="ts">
import type { ComponentId } from '@midnight-garage/content'
import { computed } from 'vue'
import PartCard from './PartCard.vue'
import { useGameStore } from '../stores/gameStore'

/**
 * The Replace flow (Sprint 18, round 2 - real playtest fix): clicking a
 * component's "Replace" button opens this as an in-page side panel, scoped to
 * that one component. It never lives on a separate route - the reported bug
 * was a player having no idea a part had to come from a *different tab* to
 * drag onto a component here; this renders directly alongside the components
 * list so the source and the drop target are visible at once.
 */
const props = defineProps<{
  carId: string
  componentId: ComponentId
}>()

const emit = defineEmits<{ close: [] }>()

const game = useGameStore()

/** Every stageable part, each flagged with whether it actually fits this
 * specific component (right slot + required tags) - shown either way so the
 * player sees their whole inventory, not a mysteriously filtered subset. */
const entries = computed(() => {
  const fitting = new Set(game.installablePartsFor(props.carId, props.componentId).map((p) => p.id))
  return game.stageableParts.map((entry) => ({ ...entry, fits: fitting.has(entry.instance.id) }))
})

function onSelect(partInstanceId: string): void {
  game.stageAction(props.carId, {
    kind: 'install',
    componentId: props.componentId,
    partInstanceId,
  })
  emit('close')
}
</script>

<template>
  <aside class="drawer" data-test="replace-drawer">
    <header class="drawer-head">
      <h3>Replace {{ game.componentLabel(componentId) }}</h3>
      <button type="button" class="close" data-test="close-drawer" @click="emit('close')">
        &times;
      </button>
    </header>
    <p class="how">
      Click a fitting part to install it here, or drag it onto the component instead.
    </p>
    <p v-if="entries.length === 0" class="empty">
      No parts on hand - visit the <RouterLink :to="{ name: 'parts' }">parts market</RouterLink>.
    </p>
    <ul v-else class="parts-list">
      <PartCard
        v-for="entry in entries"
        :key="entry.instance.id"
        :instance="entry.instance"
        :part="entry.part"
        :fits="entry.fits"
        @select="onSelect"
      />
    </ul>
  </aside>
</template>

<style scoped>
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(360px, 90vw);
  display: flex;
  flex-direction: column;
  background: var(--mg-panel);
  border-left: 1px solid var(--mg-neon-violet);
  padding: var(--mg-space-3);
  overflow-y: auto;
  z-index: 900;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mg-space-2);
}

.drawer-head h3 {
  margin: 0;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  text-transform: capitalize;
}

.close {
  background: none;
  border: none;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-lg);
  line-height: 1;
  padding: 0 var(--mg-space-1);
}

.how,
.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-3);
}

.parts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}
</style>
