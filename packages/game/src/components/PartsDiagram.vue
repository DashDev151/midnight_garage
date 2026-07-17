<script setup lang="ts">
import type { CarPartId, ComponentId } from '@midnight-garage/content'
import { PARTS_TAXONOMY } from '@midnight-garage/content'
import { computed, ref, watch } from 'vue'
import { useGameStore, type CarPartRowView } from '../stores/gameStore'
import BandChip from './BandChip.vue'
import {
  DIAGRAM_VIEW_H,
  DIAGRAM_VIEW_W,
  GROUP_TILE_LAYOUT,
  PARTS_DIAGRAM_LAYOUT,
  type DiagramSlot,
  type TileRect,
} from './partsDiagramLayout'

/**
 * Sprint 84: the parts diagram - a view, never a control surface (decision 5).
 *
 * Amendment (maintainer, 2026-07-17): two levels, replacing the original
 * all-29-rectangles single canvas (right idea, too cluttered). Level 1 shows
 * six group tiles positioned as car regions (`GROUP_TILE_LAYOUT`); clicking a
 * tile opens level 2, that group's member slots from the unchanged layout map
 * scaled up to the canvas, plus any OUTSIDE blocker of a member drawn as a
 * visiting rectangle at its true overlap position (rims must still sit over
 * the brakes in the suspension view, or the split re-hides the mechanic).
 * Clicking a PART emits `select` (the list row); clicking a TILE only
 * navigates.
 */
const props = defineProps<{ carId: string }>()
const emit = defineEmits<{ (e: 'select', partId: CarPartId): void }>()

const game = useGameStore()

// Copy swept and approved (Sprint 84 string sweep, both rounds).
const PANEL_TITLE = 'The service diagram'
const INSPECT_PROMPT = 'Point at a part to see what it is and what sits on top of it.'
const EMPTY_LABEL = 'empty'
const TILE_PROMPT = 'Point at a section of the car to see what is inside.'
const BACK_LABEL = '< All groups'
const SITS_UNDER_PREFIX = 'Parts here sit under: '

const COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/** Each part's blockers, straight from the live taxonomy - the diagram reads
 * the hierarchy, it never re-encodes it (directive 16). A hovered part's
 * blockers are exactly the rectangles drawn on top of it. */
const BLOCKED_BY: Record<string, readonly CarPartId[]> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.blockedBy]),
)

/** Member part ids per group, from the taxonomy - level-2 membership and the
 * level-1 part counts both read this, never a second encoding. */
const MEMBERS_BY_GROUP: Record<string, readonly CarPartId[]> = Object.fromEntries(
  COMPONENTS.map((componentId) => [
    componentId,
    PARTS_TAXONOMY.filter((entry) => entry.group === componentId).map((entry) => entry.id),
  ]),
)

// --- View state ---------------------------------------------------------

/** null = level 1 (the six tiles); a group id = level 2 (that group's slots). */
const activeGroup = ref<ComponentId | null>(null)
const hoveredGroup = ref<ComponentId | null>(null)
const hoveredId = ref<CarPartId | null>(null)

// A different car starts back at level 1 (amendment requirement).
watch(
  () => props.carId,
  () => {
    activeGroup.value = null
    hoveredGroup.value = null
    hoveredId.value = null
  },
)

function openGroup(componentId: ComponentId): void {
  activeGroup.value = componentId
  hoveredGroup.value = null
  hoveredId.value = null
}

function backToTiles(): void {
  activeGroup.value = null
  hoveredId.value = null
}

function onSlotLeave(partId: CarPartId): void {
  if (hoveredId.value === partId) hoveredId.value = null
}

function onTileLeave(componentId: ComponentId): void {
  if (hoveredGroup.value === componentId) hoveredGroup.value = null
}

// --- Live per-part rows -------------------------------------------------

/** The live per-part row (band, grade, fitted/empty, uncertain) for every slot,
 * reusing the store's own `partsInGroup` rather than re-deriving condition. */
const rowsById = computed(() => {
  const map = {} as Record<CarPartId, CarPartRowView>
  for (const componentId of COMPONENTS) {
    for (const row of game.partsInGroup(props.carId, componentId)) map[row.partId] = row
  }
  return map
})

/** The same worst-present-band per group the list's headline chips show -
 * one source (`carDetail`'s own `groupBands`), never a second derivation. */
const groupBands = computed(() => game.carDetail(props.carId)?.groupBands ?? null)

/** A slot is fitted when something occupies it; empty (missing at purchase,
 * pulled to the bench, or the one legitimately-absent turbo slot) otherwise. */
function isFitted(partId: CarPartId): boolean {
  return rowsById.value[partId]?.installedPartName != null
}

// --- Level 1: the six group tiles ----------------------------------------

interface TileView {
  componentId: ComponentId
  rect: TileRect
  name: string
  band: ReturnType<typeof bandOf>
  partCount: number
  uncertain: boolean
  /** Display names of OTHER groups whose parts sit on top of parts in this
   * one (the taxonomy's cross-group `blockedBy` edges), for the inspector's
   * "sit under" hint. Empty when no outside dependency exists. */
  sitsUnderGroups: string[]
}

function bandOf(componentId: ComponentId) {
  return groupBands.value?.[componentId] ?? null
}

const tiles = computed<TileView[]>(() =>
  COMPONENTS.map((componentId) => {
    const members = MEMBERS_BY_GROUP[componentId] ?? []
    const outsideGroups = new Set<ComponentId>()
    for (const partId of members) {
      for (const blocker of BLOCKED_BY[partId] ?? []) {
        const blockerGroup = game.groupForCarPart(blocker)
        if (blockerGroup && blockerGroup !== componentId) outsideGroups.add(blockerGroup)
      }
    }
    return {
      componentId,
      rect: GROUP_TILE_LAYOUT[componentId],
      name: game.componentLabel(componentId),
      band: bandOf(componentId),
      partCount: members.length,
      uncertain: members.some((partId) => rowsById.value[partId]?.uncertain ?? false),
      sitsUnderGroups: [...outsideGroups].map((g) => game.componentLabel(g)),
    }
  }),
)

function tileStyle(rect: TileRect): Record<string, string> {
  return {
    left: `${(rect.x / DIAGRAM_VIEW_W) * 100}%`,
    top: `${(rect.y / DIAGRAM_VIEW_H) * 100}%`,
    width: `${(rect.w / DIAGRAM_VIEW_W) * 100}%`,
    height: `${(rect.h / DIAGRAM_VIEW_H) * 100}%`,
  }
}

function tileTitle(tile: TileView): string {
  const band = tile.band ?? EMPTY_LABEL
  return `${tile.name}: ${band}, ${tile.partCount} parts`
}

const hoveredTile = computed<TileView | null>(
  () => tiles.value.find((t) => t.componentId === hoveredGroup.value) ?? null,
)

// --- Level 2: one group's slots, plus visiting outside blockers ----------

interface ActiveSlotView {
  partId: CarPartId
  slot: DiagramSlot
  /** True for an outside blocker rendered in this group's view (e.g. rims in
   * the suspension view) - drawn hatched and tagged with its home group. */
  visitor: boolean
}

const activeSlots = computed<ActiveSlotView[]>(() => {
  const componentId = activeGroup.value
  if (!componentId) return []
  const members = MEMBERS_BY_GROUP[componentId] ?? []
  const visitors = new Set<CarPartId>()
  for (const partId of members) {
    for (const blocker of BLOCKED_BY[partId] ?? []) {
      if (!members.includes(blocker)) visitors.add(blocker)
    }
  }
  return [
    ...members.map((partId) => ({ partId, slot: PARTS_DIAGRAM_LAYOUT[partId], visitor: false })),
    ...[...visitors].map((partId) => ({
      partId,
      slot: PARTS_DIAGRAM_LAYOUT[partId],
      visitor: true,
    })),
  ].sort((a, b) => a.slot.z - b.slot.z)
})

/**
 * The level-2 viewport: the bounding box of every rendered rect (members AND
 * visitors - a visitor must stay at its true overlap position), padded, then
 * expanded on its shorter axis to the canvas's own 16:9 so slots keep their
 * proportions when scaled up. The layout map itself is untouched.
 */
const activeView = computed(() => {
  const slots = activeSlots.value
  if (slots.length === 0) return { x: 0, y: 0, w: DIAGRAM_VIEW_W, h: DIAGRAM_VIEW_H }
  const pad = 8
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { slot } of slots) {
    minX = Math.min(minX, slot.x)
    minY = Math.min(minY, slot.y)
    maxX = Math.max(maxX, slot.x + slot.w)
    maxY = Math.max(maxY, slot.y + slot.h)
  }
  let x = minX - pad
  let y = minY - pad
  let w = maxX - minX + pad * 2
  let h = maxY - minY + pad * 2
  const ratio = DIAGRAM_VIEW_W / DIAGRAM_VIEW_H
  if (w / h < ratio) {
    const targetW = h * ratio
    x -= (targetW - w) / 2
    w = targetW
  } else {
    const targetH = w / ratio
    y -= (targetH - h) / 2
    h = targetH
  }
  return { x, y, w, h }
})

function slotStyle(slot: DiagramSlot): Record<string, string> {
  const view = activeView.value
  return {
    left: `${((slot.x - view.x) / view.w) * 100}%`,
    top: `${((slot.y - view.y) / view.h) * 100}%`,
    width: `${(slot.w / view.w) * 100}%`,
    height: `${(slot.h / view.h) * 100}%`,
    // Shell parts carry z = -2; offset keeps every z-index positive.
    zIndex: String(slot.z + 3),
  }
}

function slotClasses(partId: CarPartId, visitor: boolean): Record<string, boolean> {
  const row = rowsById.value[partId]
  const fitted = isFitted(partId)
  const band = row?.band ?? null
  const hovered = hoveredId.value
  const isBlockerOfHovered = hovered != null && BLOCKED_BY[hovered]?.includes(partId)
  return {
    fitted,
    ghost: !fitted,
    visitor,
    [`fill-${band ?? 'empty'}`]: true,
    hovered: hovered === partId,
    // A part on top of the hovered one: red if still in the way, dim if already off.
    'blocker-fitted': !!isBlockerOfHovered && fitted,
    'blocker-clear': !!isBlockerOfHovered && !fitted,
  }
}

/** The accessible label/tooltip for a slot - name plus its condition (or the
 * empty state), so the diagram is legible without the inspector line too. */
function slotTitle(partId: CarPartId): string {
  const row = rowsById.value[partId]
  const name = game.carPartLabel(partId)
  if (!isFitted(partId)) return `${name}: ${EMPTY_LABEL}`
  return row?.band ? `${name}: ${row.band}` : name
}

/** A visitor's home-group tag (e.g. rims in the suspension view reads
 * "Wheels" under its name) - existing display-name content, no new copy. */
function visitorHomeLabel(partId: CarPartId): string {
  const componentId = game.groupForCarPart(partId)
  return componentId ? game.componentLabel(componentId) : ''
}

const hoveredRow = computed<CarPartRowView | null>(() =>
  hoveredId.value ? (rowsById.value[hoveredId.value] ?? null) : null,
)
</script>

<template>
  <details class="parts-diagram" open>
    <summary class="pd-title">{{ PANEL_TITLE }}</summary>

    <button
      v-if="activeGroup"
      type="button"
      class="pd-back"
      data-test="diagram-back"
      @click="backToTiles"
    >
      {{ BACK_LABEL }}
    </button>

    <div
      class="pd-stage"
      :style="{ aspectRatio: `${DIAGRAM_VIEW_W} / ${DIAGRAM_VIEW_H}` }"
      data-test="parts-diagram-stage"
    >
      <!-- Level 1: the six group tiles, positioned as car regions. Clicking a
           tile only navigates - it never touches the list (amendment). -->
      <template v-if="!activeGroup">
        <button
          v-for="tile in tiles"
          :key="tile.componentId"
          type="button"
          class="pd-tile"
          :class="[`fill-${tile.band ?? 'empty'}`]"
          :style="tileStyle(tile.rect)"
          :title="tileTitle(tile)"
          :aria-label="tileTitle(tile)"
          :data-test="'diagram-tile-' + tile.componentId"
          @pointerenter="hoveredGroup = tile.componentId"
          @pointerleave="onTileLeave(tile.componentId)"
          @focus="hoveredGroup = tile.componentId"
          @blur="onTileLeave(tile.componentId)"
          @click="openGroup(tile.componentId)"
        >
          <span class="pd-tile-name">{{ tile.name }}</span>
          <span class="pd-tile-count">{{ tile.partCount }} parts</span>
          <span
            v-if="tile.uncertain"
            class="pd-uncertain"
            :data-test="'diagram-tile-uncertain-' + tile.componentId"
            >?</span
          >
        </button>
      </template>

      <!-- Level 2: the group's member slots (unchanged layout-map geometry,
           scaled up) plus outside blockers as visiting rectangles at their
           true overlap positions - rims still sits over the brakes here. -->
      <template v-else>
        <button
          v-for="{ partId, slot, visitor } in activeSlots"
          :key="partId"
          type="button"
          class="pd-slot"
          :class="slotClasses(partId, visitor)"
          :style="slotStyle(slot)"
          :title="slotTitle(partId)"
          :aria-label="slotTitle(partId)"
          :data-part="partId"
          :data-test="'diagram-slot-' + partId"
          @pointerenter="hoveredId = partId"
          @pointerleave="onSlotLeave(partId)"
          @focus="hoveredId = partId"
          @blur="onSlotLeave(partId)"
          @click="emit('select', partId)"
        >
          <span class="pd-label">{{ game.carPartLabel(partId) }}</span>
          <span v-if="visitor" class="pd-visitor-tag">{{ visitorHomeLabel(partId) }}</span>
        </button>
      </template>
    </div>

    <p class="pd-inspector" data-test="diagram-inspector">
      <template v-if="activeGroup">
        <template v-if="hoveredId">
          <span class="pd-insp-name">{{ game.carPartLabel(hoveredId) }}</span>
          <BandChip :band="hoveredRow?.band ?? null" />
          <span v-if="hoveredRow?.grade" class="pd-insp-grade">{{ hoveredRow.grade }}</span>
          <span
            v-if="hoveredRow?.uncertain"
            class="pd-uncertain"
            title="An unresolved symptom may have damaged this part"
            >?</span
          >
        </template>
        <span v-else class="pd-insp-prompt">{{ INSPECT_PROMPT }}</span>
      </template>
      <template v-else>
        <template v-if="hoveredTile">
          <span class="pd-insp-name">{{ hoveredTile.name }}</span>
          <BandChip :band="hoveredTile.band" />
          <span class="pd-insp-grade">{{ hoveredTile.partCount }} parts</span>
          <span
            v-if="hoveredTile.uncertain"
            class="pd-uncertain"
            title="An unresolved symptom may have damaged a part in this group"
            >?</span
          >
          <span
            v-if="hoveredTile.sitsUnderGroups.length > 0"
            class="pd-insp-hint"
            data-test="diagram-sits-under"
            >{{ SITS_UNDER_PREFIX + hoveredTile.sitsUnderGroups.join(', ') }}</span
          >
        </template>
        <span v-else class="pd-insp-prompt">{{ TILE_PROMPT }}</span>
      </template>
    </p>
  </details>
</template>

<style scoped>
.parts-diagram {
  margin: 0 0 var(--mg-space-3);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.pd-title {
  cursor: pointer;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
}

/* The level-2 back control - the same quiet back-link idiom as the screen's
   own "< Garage" link, as a button since it navigates the diagram, not a
   route. */
.pd-back {
  display: inline-block;
  margin-top: var(--mg-space-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

/* The fixed-aspect stage - relative units only, so the page never scrolls
   sideways. Absolutely positioned tiles/slots read as percentages of this
   box. */
.pd-stage {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: var(--mg-space-2) 0;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  overflow: hidden;
}

/* Level-1 group tiles and level-2 part slots share the chrome: a hard 1px
   edge, no bevels, no rounded corners, no shadows (art bible 3.4). */
.pd-tile,
.pd-slot {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0 2px;
  margin: 0;
  border: 1px solid var(--mg-panel-edge);
  border-radius: 0;
  background: transparent;
  color: var(--mg-text);
  overflow: hidden;
  cursor: pointer;
}

.pd-tile-name {
  font-size: var(--mg-fs-sm);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.pd-tile-count {
  font-size: 0.6rem;
  line-height: 1;
  color: var(--mg-text-dim);
  pointer-events: none;
}

.pd-label {
  font-size: 0.55rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  pointer-events: none;
}

/* A visitor's home-group tag (e.g. "Wheels" under Rims in the suspension
   view) - dim, factual, existing display-name content. */
.pd-visitor-tag {
  font-size: 0.5rem;
  line-height: 1;
  color: var(--mg-text-dim);
  pointer-events: none;
}

/* Condition-band fills - the SAME palette tokens BandChip authors, so "what
   colour is a poor part" keeps one answer across the screen. Translucent so a
   blocker painted on top still reveals the part beneath it. */
.fill-mint {
  border-color: var(--mg-success);
  background: color-mix(in srgb, var(--mg-success) 24%, transparent);
}

.fill-fine {
  border-color: var(--mg-neon-cyan);
  background: color-mix(in srgb, var(--mg-neon-cyan) 24%, transparent);
}

.fill-worn {
  border-color: var(--mg-text-dim);
  background: color-mix(in srgb, var(--mg-text-dim) 26%, transparent);
}

.fill-poor,
.fill-scrap {
  border-color: var(--mg-neon-pink);
  background: color-mix(in srgb, var(--mg-neon-pink) 26%, transparent);
}

/* Ghost placeholder for an empty slot (maintainer amendment to decision 4):
   every slot always renders in its place - a dashed edge, faint fill and
   dimmed name say "something belongs here" without reading as a fitted
   part. */
.pd-slot.ghost,
.fill-empty {
  border-style: dashed;
  border-color: var(--mg-panel-edge);
  background: color-mix(in srgb, var(--mg-text-dim) 8%, transparent);
}

.pd-slot.ghost .pd-label {
  color: var(--mg-text-dim);
  opacity: 0.7;
}

/* An outside blocker visiting another group's view - hatched over its band
   fill so it reads as "not from here" at a glance (the tag names its home).
   Defined after the fills: the hatch image layers over whichever fill
   colour applies. */
.pd-slot.visitor {
  background-image: repeating-linear-gradient(
    45deg,
    color-mix(in srgb, var(--mg-text-dim) 35%, transparent) 0 2px,
    transparent 2px 6px
  );
}

.pd-tile:hover,
.pd-tile:focus-visible,
.pd-slot.hovered {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
}

/* A part stacked over the hovered one and still in the way - it must come off
   first. Pink is this screen's "blocked" colour everywhere else. Applies to
   visitors exactly as to native blockers. */
.pd-slot.blocker-fitted {
  border-color: var(--mg-neon-pink);
  border-style: solid;
  box-shadow: inset 0 0 0 1px var(--mg-neon-pink);
}

/* A blocker that is already off - no longer in the way, so dimmed, not
   alarmed. */
.pd-slot.blocker-clear {
  opacity: 0.4;
}

.pd-inspector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  min-height: 1.4rem;
  margin: 0;
  font-size: var(--mg-fs-sm);
}

.pd-insp-name {
  color: var(--mg-text);
}

.pd-insp-grade {
  color: var(--mg-text-dim);
  text-transform: capitalize;
}

.pd-insp-hint {
  color: var(--mg-text-dim);
}

.pd-uncertain {
  color: var(--mg-yen);
  font-weight: bold;
  cursor: help;
}

.pd-insp-prompt {
  color: var(--mg-text-dim);
}
</style>
