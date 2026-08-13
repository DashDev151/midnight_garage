<script setup lang="ts">
import type { Part, PartInstance } from '@midnight-garage/content'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDraggable } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { WORK_STATION_WHERE } from '../utils/workStationLabels'
import BandChip from './BandChip.vue'
import RotaryMarker from './RotaryMarker.vue'

const game = useGameStore()

/**
 * One owned part instance, draggable onto a compatible component's drop zone.
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
     * Overrides the generic "doesn't fit here" hint when `fits`
     * is false for a specific, actionable reason (e.g. the one own-car
     * capability ceiling - NA-to-turbo conversion needs a higher engine tool
     * tier). Ignored when `fits` is true.
     */
    noFitReason?: string | null
  }>(),
  { fits: true, noFitReason: null },
)

const emit = defineEmits<{
  /** A plain click (not the drag gesture, not the "move…" pick toggle) - the
   * fast path: select this part for whatever the parent's current context is. */
  select: [partInstanceId: string]
}>()

const draggable = useDraggable(() => props.instance.id)

/**
 * A scrap instance can never be
 * reinstalled anywhere (the fit-check rejects it universally), so it never
 * offers the pick/drag-to-install affordance - only "Scrap it". Checked
 * here, once, rather than in every screen that renders a `PartCard`.
 */
const isScrap = computed(() => props.instance.band === 'scrap')
const scrapValueYen = computed(() => game.scrapValueForPart(props.instance.id))

/** A "· N labour" suffix on the scrap control - empty while scrapping a part
 * is free (its `actionPoints` figure is 0). */
const scrapLabourSuffix = computed(() =>
  game.actionPoints.scrapPart > 0 ? ` · ${game.actionPoints.scrapPart} labour` : '',
)

/** The used-part
 * sale price for a non-scrap instance - "Sell" beside "Scrap it", the other
 * way to cash out a part still worth more than scrap value. */
const sellValueYen = computed(() => game.sellValueForPart(props.instance.id))

/**
 * A part pulled off a customer's car is tracked here but locked
 * from sale/scrap (only reconditioning and refitting are allowed) until the
 * job closes out. The badge and the disabled-scrap reason both key off this.
 * Ownership is read from the instance's own `origin` against every
 * active service job, not a mutable tag (`game.isCustomerOwnedPart`).
 */
const isCustomerOwned = computed(() => game.isCustomerOwnedPart(props.instance))

/** The dim "where did this come from" caption line beneath the
 * part name. */
const originCaption = computed(() => game.describePartOrigin(props.instance))

/**
 * Where this part is when it is not sitting in the warehouse: out on the
 * workshop floor's bench, or on the machine in the machine shop. It is still
 * owned and still listed here, it simply is not worked on from a storage
 * list - the room it is in does that.
 */
const stationWhere = computed(() => {
  const station = game.stationForPart(props.instance.id)
  return station ? WORK_STATION_WHERE[station] : null
})

/**
 * Two-step guard on the cash-out buttons. Selling pays about 30% of
 * catalogue, so a single misclick would cost 70% of a just-bought part;
 * the first click arms the button (its label becomes a priced
 * question), and only a second click while armed executes. The arm stands
 * down when the pointer leaves the card, on any other card action (select,
 * pick, drag), or after a short timeout.
 */
const ARM_TIMEOUT_MS = 4000
const armedAction = ref<'sell' | 'scrap' | null>(null)
let disarmTimer: ReturnType<typeof setTimeout> | null = null

function disarm(): void {
  armedAction.value = null
  if (disarmTimer !== null) {
    clearTimeout(disarmTimer)
    disarmTimer = null
  }
}
onBeforeUnmount(disarm)
watch(draggable.isDragging, (dragging) => {
  if (dragging) disarm()
})

function armOrRun(action: 'sell' | 'scrap', run: () => void): void {
  if (armedAction.value === action) {
    disarm()
    run()
    return
  }
  disarm()
  armedAction.value = action
  disarmTimer = setTimeout(disarm, ARM_TIMEOUT_MS)
}

const sellLabel = computed(() =>
  armedAction.value === 'sell'
    ? `Sell for ${formatYen(sellValueYen.value)}?`
    : `Sell (${formatYen(sellValueYen.value)})`,
)
const scrapLabel = computed(() =>
  armedAction.value === 'scrap'
    ? `Scrap for ${formatYen(scrapValueYen.value)}?${scrapLabourSuffix.value}`
    : `Scrap it (${formatYen(scrapValueYen.value)})${scrapLabourSuffix.value}`,
)

function onCardClick(): void {
  disarm()
  if (isScrap.value || !props.fits) return
  emit('select', props.instance.id)
}

function onPickClick(): void {
  disarm()
  draggable.togglePick()
}

function onScrapClick(): void {
  if (isCustomerOwned.value) return
  armOrRun('scrap', () => game.scrapPart(props.instance.id))
}

function onSellClick(): void {
  if (isCustomerOwned.value) return
  armOrRun('sell', () => game.sellPart(props.instance.id))
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
    :data-test="'part-card-' + instance.id"
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
    @pointerleave="disarm"
    @click="onCardClick"
  >
    <div class="part-info">
      <span class="part-name"
        >{{ part.brand }} {{ part.name }}<RotaryMarker v-if="part.requiredTags.includes('Rotary')"
      /></span>
      <span class="origin-caption">{{ originCaption }}</span>
      <span class="part-meta">
        {{ game.carPartLabel(part.carPartId) }} &middot; {{ part.grade }} &middot;
        {{ game.fitmentClassLabel(part.fitmentClass) }}
        <BandChip :band="instance.band" />
        <span v-if="isCustomerOwned" class="owner-chip" :data-test="'customer-owned-' + instance.id"
          >customer's part</span
        >
        <span v-if="stationWhere" class="station-chip" :data-test="'part-station-' + instance.id">{{
          stationWhere
        }}</span>
      </span>
      <span v-if="isScrap" class="scrap-hint">scrap - can't be installed anywhere</span>
      <span v-else-if="!fits" class="no-fit-hint">{{ noFitReason ?? "doesn't fit here" }}</span>
    </div>
    <div class="part-actions">
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
          :class="{ armed: armedAction === 'scrap' }"
          :data-test="'scrap-part-' + instance.id"
          @click.stop="onScrapClick"
        >
          {{ scrapLabel }}
        </button>
      </template>
      <template v-else>
        <span v-if="isCustomerOwned" class="locked-reason" :data-test="'sell-locked-' + instance.id"
          >customer's part</span
        >
        <button
          v-else
          type="button"
          class="sell-handle"
          :class="{ armed: armedAction === 'sell' }"
          :data-test="'sell-part-' + instance.id"
          @click.stop="onSellClick"
        >
          {{ sellLabel }}
        </button>
        <button
          type="button"
          class="grab-handle"
          :aria-pressed="draggable.isPicked.value"
          :data-test="'pick-part-' + instance.id"
          @click.stop="onPickClick"
        >
          {{ draggable.isPicked.value ? 'cancel' : 'move…' }}
        </button>
      </template>
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
  /* Pointer-drag (mousedown + move without releasing) was
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

.origin-caption {
  color: var(--mg-text-dim);
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

/* The customer-owned tag, using BandChip's chip vocabulary (chip
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

/* The whereabouts tag for a part out of storage, in the same chip vocabulary
   as the customer-owned tag beside it, cyan to read as "in hand" rather than
   as someone else's. */
.station-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--mg-radius);
  border: var(--mg-border);
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
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
.sell-handle {
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

/* The donor-economy sibling to "Scrap it" - same yen
   colour (it earns cash too), cyan border to read as the "keeps value"
   option rather than scrap's pink write-off tone. */
.sell-handle {
  color: var(--mg-yen);
  border-color: var(--mg-neon-cyan);
}

/* The armed (click-again-to-confirm) state: the button fills with its own
   accent so the state change is unmistakable before the second click. */
.scrap-handle.armed {
  background: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
  color: var(--mg-panel);
}

.sell-handle.armed {
  background: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  color: var(--mg-panel);
}

.locked-reason {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}
</style>
