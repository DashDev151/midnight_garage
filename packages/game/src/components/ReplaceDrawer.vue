<script setup lang="ts">
import type { CarPartId } from '@midnight-garage/content'
import { computed } from 'vue'
import HelpHint from './HelpHint.vue'
import PartCard from './PartCard.vue'
import { useGameStore } from '../stores/gameStore'

/** Clicking a part row's "Replace" button opens this as an in-page side panel,
 * scoped to that one part slot. It never lives on a separate route - the panel
 * ensures the player can see both source and drop target at once.
 *
 * The drawer shows ONLY catalog parts addressed to this exact `carPartId` (not
 * across the whole inventory) - a car has no use for seeing a suspension part
 * while replacing an intake. Within that narrowed set, a part that doesn't fit
 * this specific car (wrong platform tag) still renders, dimmed, to show the
 * whole relevant set rather than a mysteriously filtered subset.
 */
const props = defineProps<{
  carId: string
  carPartId: CarPartId
  /** When set, the drawer picks for a benched assembly member instead of an
   * on-car slot: selecting fits the part straight into this container's
   * member (displacing whatever was mounted back to the bin) rather than
   * staging an on-car install. The fit-check is identical either way - the
   * member's car slot is vacant while its assembly is on the bench. */
  benchContainerId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const game = useGameStore()

const componentId = computed(() => game.groupForCarPart(props.carPartId))

/**
 * When set, every candidate in this drawer is dimmed with this specific
 * reason instead of the generic "doesn't fit here" hint, since the block
 * isn't about any one part's fit, it's the slot itself not being buildable
 * yet. A bench-mode drawer (fitting a benched assembly member) reads the
 * member's own machine-line gate (only ever the wheels line, for tyres);
 * an on-car drawer reads the NA-to-turbo capability ceiling instead - the
 * two gates never overlap, since an assembly member never has an on-car
 * Replace affordance of its own.
 */
const blockedReason = computed(() =>
  props.benchContainerId
    ? game.benchSwapGateReasonFor(props.carPartId)
    : game.installBlockedReason(props.carId, props.carPartId),
)

/** Every stageable part addressed to this exact slot, each flagged with
 * whether it actually fits this specific car (platform tags) and excluding
 * scrap (never installable anywhere). */
const entries = computed(() => {
  const fitting = new Set(
    game.installablePartsForPart(props.carId, props.carPartId).map((p) => p.id),
  )
  return game.stageableParts
    .filter((entry) => entry.part.carPartId === props.carPartId && entry.instance.band !== 'scrap')
    .map((entry) => ({
      ...entry,
      fits: fitting.has(entry.instance.id) && !blockedReason.value,
      noFitReason: blockedReason.value,
    }))
})

function onSelect(partInstanceId: string): void {
  if (props.benchContainerId) {
    game.swapAssemblyMember(props.benchContainerId, props.carPartId, partInstanceId)
    emit('close')
    return
  }
  if (!componentId.value) return
  game.stageAction(props.carId, {
    kind: 'install',
    componentId: componentId.value,
    carPartId: props.carPartId,
    partInstanceId,
  })
  emit('close')
}
</script>

<template>
  <aside class="drawer" data-test="replace-drawer">
    <header class="drawer-head">
      <h3>
        Replace {{ game.carPartLabel(carPartId) }}
        <HelpHint label="Replace">
          Click a fitting part to install it here, or drag it onto the part instead.
        </HelpHint>
      </h3>
      <button
        type="button"
        class="close"
        aria-label="Close"
        data-test="close-drawer"
        @click="emit('close')"
      >
        &times;
      </button>
    </header>
    <p class="count">{{ entries.length }} part{{ entries.length === 1 ? '' : 's' }} on hand</p>
    <!-- The link lands on the market already filtered to this exact slot
         (the ?slot deep link), not the market root. -->
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
        :no-fit-reason="entry.noFitReason"
        :show-recondition="false"
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
  width: min(380px, 90vw);
  display: flex;
  flex-direction: column;
  background: var(--mg-panel);
  border-left: 2px solid var(--mg-neon-violet);
  padding: var(--mg-space-4);
  overflow-y: auto;
  z-index: 900;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-3);
  padding-bottom: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
  border-bottom: var(--mg-border);
}

.drawer-head h3 {
  display: flex;
  align-items: center;
  margin: 0;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  text-transform: capitalize;
}

.close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8em;
  height: 1.8em;
  background: none;
  border: var(--mg-border);
  border-radius: 999px;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-lg);
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}

.count {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 var(--mg-space-3);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0;
}

.parts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}
</style>
