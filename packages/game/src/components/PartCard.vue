<script setup lang="ts">
import type { ConditionBand, Part, PartInstance } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { useDraggable } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import BandChip from './BandChip.vue'
import BandPicker from './BandPicker.vue'
import RotaryMarker from './RotaryMarker.vue'

const game = useGameStore()

/**
 * One owned part instance, draggable onto a compatible component's drop zone
 * (Sprint 18 - the second consumer of Sprint 17's drag-and-drop composable).
 * Purely presentational: the parent decides what a drop actually does
 * (stage an install) and which components currently accept this part.
 */
const props = withDefaults(
  defineProps<{
    instance: PartInstance
    part: Part
    /**
     * Whether this part fits the current pick context (e.g. the component a
     * `ReplaceDrawer` is scoped to). A non-fitting card still renders - the
     * player sees their whole inventory, not a mysteriously shorter list -
     * but is dimmed and inert to the click-to-select fast path; dragging it
     * onto an incompatible drop zone still simply fails to land, same as
     * before. Defaults to true: the standalone browse screen has no "fits
     * what" context, so every card is always eligible there.
     */
    fits?: boolean
    /**
     * Whether to offer the in-inventory recondition control (Sprint 35).
     * Defaults to true - the browse inventory is the place to recondition a
     * part. The `ReplaceDrawer` passes false: it's a focused install picker,
     * not the place to also kick off bench work.
     */
    showRecondition?: boolean
    /**
     * Sprint 37: overrides the generic "doesn't fit here" hint when `fits`
     * is false for a specific, actionable reason (e.g. the one own-car
     * capability ceiling - NA-to-turbo conversion needs a higher engine tool
     * tier). Ignored when `fits` is true.
     */
    noFitReason?: string | null
  }>(),
  { fits: true, showRecondition: true, noFitReason: null },
)

const emit = defineEmits<{
  /** A plain click (not the drag gesture, not the "move…" pick toggle) - the
   * fast path: select this part for whatever the parent's current context is. */
  select: [partInstanceId: string]
}>()

const draggable = useDraggable(() => props.instance.id)

/**
 * Sprint 26 decision 6, Sprint 28 task: a scrap instance can never be
 * reinstalled anywhere (the fit-check rejects it universally), so it never
 * offers the pick/drag-to-install affordance - only "Scrap it". Checked
 * here, once, rather than in every screen that renders a `PartCard`.
 */
const isScrap = computed(() => props.instance.band === 'scrap')
const scrapValueYen = computed(() => game.scrapValueForPart(props.instance.id))

/**
 * Sprint 35: a part pulled off a customer's car is tracked here but locked
 * from sale/scrap (only reconditioning and refitting are allowed) until the
 * job closes out. The badge and the disabled-scrap reason both key off this.
 */
const isCustomerOwned = computed(() => props.instance.customerJobId !== undefined)

/**
 * Sprint 40: the recondition target band the player has picked (defaults to
 * `mint`, unchanged from before the picker existed - Sprint 35's original
 * "climb to mint" behavior).
 */
const reconditionTargetBand = ref<ConditionBand>('mint')

/**
 * Sprint 41 decision 2: tyres/brakePadsDiscs/clutch are replace-only - a
 * non-repairable part can't be bench-reconditioned any more than it can be
 * repaired on a car (`isPartRepairable` reads the same taxonomy flag
 * `canRepair` does, bands.ts).
 */
const isRepairable = computed(() => game.isPartRepairable(props.part.carPartId))

/**
 * Sprint 35: the recondition quote (cost + labor) for the selected band, or
 * null when there is nothing to do (already at/above target, scrap, or -
 * Sprint 41 - non-repairable). Reconditioning routes through the exact same
 * repair economy as an on-car repair. Sprint 36: no tooling gate anymore -
 * only today's labor gates the control. Sprint 40: prices whatever band the
 * player picked, not always mint.
 */
const reconditionQuote = computed(() =>
  props.showRecondition && !isScrap.value && isRepairable.value
    ? game.reconditionQuoteFor(props.instance.id, reconditionTargetBand.value)
    : null,
)
const reconditionDisabled = computed(
  () => !reconditionQuote.value || game.laborSlotsRemainingToday <= 0,
)

function onCardClick(): void {
  if (isScrap.value || !props.fits) return
  emit('select', props.instance.id)
}

function onScrapClick(): void {
  if (isCustomerOwned.value) return
  game.scrapPart(props.instance.id)
}

function onReconditionClick(): void {
  game.reconditionPart(props.instance.id, reconditionTargetBand.value)
}

function selectReconditionBand(band: ConditionBand): void {
  reconditionTargetBand.value = band
}

// A scrap card never drags (it can never be installed anywhere) - these
// three wrap `draggable`'s own handlers rather than binding `draggable.onX`
// directly in the template, since a ternary there (`isScrap ? undefined :
// draggable.onPointerDown`) would only ever return the function reference
// without calling it, silently breaking drag start for every non-scrap card.
function onPointerDown(event: PointerEvent): void {
  if (!isScrap.value) draggable.onPointerDown(event)
}
function onPointerMove(event: PointerEvent): void {
  if (!isScrap.value) draggable.onPointerMove(event)
}
function onPointerUp(event: PointerEvent): void {
  if (!isScrap.value) draggable.onPointerUp(event)
}
</script>

<template>
  <li
    class="part-card"
    :class="{
      dragging: draggable.isDragging.value,
      picked: draggable.isPicked.value,
      'no-fit': !fits && !isScrap,
      scrap: isScrap,
    }"
    draggable="false"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @click="onCardClick"
  >
    <div class="part-info">
      <span class="part-name"
        >{{ part.brand }} {{ part.name }}<RotaryMarker v-if="part.requiredTags.includes('Rotary')"
      /></span>
      <span class="part-meta">
        {{ game.carPartLabel(part.carPartId) }} &middot; {{ part.grade }}
        <BandChip :band="instance.band" />
        <span v-if="isCustomerOwned" class="owner-chip" :data-test="'customer-owned-' + instance.id"
          >customer's part</span
        >
      </span>
      <span v-if="isScrap" class="scrap-hint">scrap - can't be installed anywhere</span>
      <span v-else-if="!fits" class="no-fit-hint">{{ noFitReason ?? "doesn't fit here" }}</span>
    </div>
    <div class="part-actions">
      <template v-if="reconditionQuote">
        <BandPicker
          :current-band="instance.band"
          :selected="reconditionTargetBand"
          :test-id-prefix="'band-recondition-' + instance.id"
          @select="selectReconditionBand"
        />
        <button
          type="button"
          class="recondition-handle"
          :disabled="reconditionDisabled"
          :data-test="'recondition-part-' + instance.id"
          @click.stop="onReconditionClick"
        >
          Recondition to {{ reconditionTargetBand }} ({{ formatYen(reconditionQuote.costYen) }}
          &middot;
          {{ reconditionQuote.laborSlotsRequired }} slot{{
            reconditionQuote.laborSlotsRequired === 1 ? '' : 's'
          }})
        </button>
      </template>
      <template v-if="isScrap">
        <span
          v-if="isCustomerOwned"
          class="locked-reason"
          :data-test="'scrap-locked-' + instance.id"
          >customer's part</span
        >
        <button
          v-else
          type="button"
          class="scrap-handle"
          :data-test="'scrap-part-' + instance.id"
          @click.stop="onScrapClick"
        >
          Scrap it ({{ formatYen(scrapValueYen) }})
        </button>
      </template>
      <button
        v-else
        type="button"
        class="grab-handle"
        :aria-pressed="draggable.isPicked.value"
        :data-test="'pick-part-' + instance.id"
        @click.stop="draggable.togglePick"
      >
        {{ draggable.isPicked.value ? 'cancel' : 'move…' }}
      </button>
    </div>
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
  /* Sprint 25 task 7: pointer-drag (mousedown + move without releasing) was
     selecting the card's text like a text drag, since nothing suppressed
     native selection here - ShopSlot.vue already carried this pair for the
     same reason. */
  -webkit-user-drag: none;
  user-select: none;
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

.part-card.scrap {
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
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
}

.no-fit-hint,
.scrap-hint {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

/* Sprint 35: the customer-owned tag, using BandChip's chip vocabulary (chip
   padding/border/radius, an --mg-* accent) rather than any new color literal. */
.owner-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--mg-radius);
  border: var(--mg-border);
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  text-transform: none;
}

.part-actions {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--mg-space-1);
}

.grab-handle,
.scrap-handle,
.recondition-handle {
  flex: none;
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.scrap-handle {
  color: var(--mg-yen);
  border-color: var(--mg-neon-pink);
}

.recondition-handle {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  cursor: pointer;
}

.recondition-handle:disabled {
  opacity: 0.45;
  cursor: default;
}

.locked-reason {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}
</style>
