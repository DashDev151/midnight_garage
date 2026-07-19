<script setup lang="ts">
import type { AssemblyId, CarPartId, ComponentId } from '@midnight-garage/content'
import { ASSEMBLIES, PARTS_TAXONOMY } from '@midnight-garage/content'
import { computed, ref, watch } from 'vue'
import { useGameStore, type CarPartRowView } from '../stores/gameStore'
import BandChip from './BandChip.vue'
import { groupSpriteId, partSpriteDataUrl } from './partSprites'
import {
  DIAGRAM_VIEW_H,
  DIAGRAM_VIEW_W,
  GROUP_TILE_LAYOUT,
  PARTS_DIAGRAM_LAYOUT,
  type DiagramSlot,
  type TileRect,
} from './partsDiagramLayout'

/**
 * Sprint 88 (the diagram is the page): the parts diagram stops being a
 * hyperlink index into a list and becomes the repair surface itself. Level 1
 * still shows the six group tiles positioned as car regions; opening a tile
 * drops to level 2, that group's member slots drawn with placeholder pixel-art
 * sprites (`partSprites.ts`), plus any OUTSIDE blocker of a member as a visiting
 * sprite at its true overlap position. Clicking a level-2 block selects it
 * (`select`), which the screen turns into the docked info/action panel below;
 * clicking a tile only navigates. Assembly members render inside a bordered
 * cluster (decision 5); clicking any member selects the assembly's context in
 * the panel just the same, since the panel derives the assembly from the part.
 */
const props = defineProps<{ carId: string; selectedPartId?: CarPartId | null }>()
const emit = defineEmits<{ (e: 'select', partId: CarPartId | null): void }>()

const game = useGameStore()

// Copy swept and approved (Sprint 84 string sweep). Reused as-is (Sprint 88 C).
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
 * the hierarchy, it never re-encodes it (directive 16). */
const BLOCKED_BY: Record<string, readonly CarPartId[]> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.blockedBy]),
)

/** Member part ids per group, from the taxonomy. */
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

// A different car starts back at level 1, selection cleared.
watch(
  () => props.carId,
  () => {
    activeGroup.value = null
    hoveredGroup.value = null
    hoveredId.value = null
    emit('select', null)
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

const rowsById = computed(() => {
  const map = {} as Record<CarPartId, CarPartRowView>
  for (const componentId of COMPONENTS) {
    for (const row of game.partsInGroup(props.carId, componentId)) map[row.partId] = row
  }
  return map
})

const groupBands = computed(() => game.carDetail(props.carId)?.groupBands ?? null)

/** A slot is fitted when something occupies it; empty otherwise. */
function isFitted(partId: CarPartId): boolean {
  return rowsById.value[partId]?.installedPartName != null
}

const spriteFor = (partId: CarPartId): string => partSpriteDataUrl(partId)

/**
 * Sprint 96 decision 4: the always-on condition wash. A block's whole face
 * carries a low-alpha tint of the same band palette tokens BandChip (and the
 * retired corner dot) authors, so condition reads at a glance without hover.
 * An uncertain band keeps a neutral wash rather than asserting a condition
 * the player cannot trust yet; a block with no band gets no wash at all.
 */
const WASH_CLASS_BY_BAND: Record<string, string> = {
  mint: 'pd-wash-mint',
  fine: 'pd-wash-fine',
  worn: 'pd-wash-worn',
  poor: 'pd-wash-poor',
  scrap: 'pd-wash-scrap',
}

function washClasses(band: string | null, uncertain: boolean): string[] {
  if (uncertain) return ['pd-washed', 'pd-wash-neutral']
  if (!band) return []
  return ['pd-washed', WASH_CLASS_BY_BAND[band] ?? 'pd-wash-neutral']
}

// --- Level 1: the six group tiles ----------------------------------------

interface TileView {
  componentId: ComponentId
  rect: TileRect
  name: string
  band: ReturnType<typeof bandOf>
  partCount: number
  uncertain: boolean
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
  visitor: boolean
}

const activeMembers = computed<readonly CarPartId[]>(() =>
  activeGroup.value ? (MEMBERS_BY_GROUP[activeGroup.value] ?? []) : [],
)

const activeSlots = computed<ActiveSlotView[]>(() => {
  const componentId = activeGroup.value
  if (!componentId) return []
  const members = activeMembers.value
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

function rectPct(x: number, y: number, w: number, h: number): Record<string, string> {
  const view = activeView.value
  return {
    left: `${((x - view.x) / view.w) * 100}%`,
    top: `${((y - view.y) / view.h) * 100}%`,
    width: `${(w / view.w) * 100}%`,
    height: `${(h / view.h) * 100}%`,
  }
}

function slotStyle(slot: DiagramSlot): Record<string, string> {
  return {
    ...rectPct(slot.x, slot.y, slot.w, slot.h),
    // Shell parts carry z = -2; offset keeps every z-index positive.
    zIndex: String(slot.z + 3),
  }
}

function slotClasses(partId: CarPartId, visitor: boolean): Record<string, boolean> {
  const fitted = isFitted(partId)
  const row = rowsById.value[partId]
  const hovered = hoveredId.value
  const isBlockerOfHovered = hovered != null && BLOCKED_BY[hovered]?.includes(partId)
  const classes: Record<string, boolean> = {
    fitted,
    ghost: !fitted,
    visitor,
    hovered: hovered === partId,
    selected: props.selectedPartId === partId && !visitor,
    'blocker-fitted': !!isBlockerOfHovered && fitted,
    'blocker-clear': !!isBlockerOfHovered && !fitted,
  }
  // Only a fitted slot has a condition to show; ghosts keep the dashed
  // empty-slot idiom unwashed.
  if (fitted) {
    for (const cls of washClasses(row?.band ?? null, row?.uncertain ?? false)) classes[cls] = true
  }
  return classes
}

function slotTitle(partId: CarPartId): string {
  const row = rowsById.value[partId]
  const name = game.carPartLabel(partId)
  if (!isFitted(partId)) return `${name}: ${EMPTY_LABEL}`
  return row?.band ? `${name}: ${row.band}` : name
}

function visitorHomeLabel(partId: CarPartId): string {
  const componentId = game.groupForCarPart(partId)
  return componentId ? game.componentLabel(componentId) : ''
}

// --- Assembly clusters (decision 5) --------------------------------------
// Each assembly whose members live in the active group draws a bordered box
// around its member slots' bounding box, with a chip naming the unit. The chip
// selects a member (the panel derives the assembly from any member), so the
// assembly Remove/Refit action reaches the same panel every block opens.

interface ClusterView {
  assemblyId: AssemblyId
  name: string
  members: CarPartId[]
  rect: Record<string, string>
}

const clusters = computed<ClusterView[]>(() => {
  const componentId = activeGroup.value
  if (!componentId) return []
  const members = activeMembers.value
  const out: ClusterView[] = []
  for (const def of ASSEMBLIES) {
    const inGroup = def.members.filter((m) => members.includes(m))
    if (inGroup.length === 0) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of inGroup) {
      const slot = PARTS_DIAGRAM_LAYOUT[m]
      minX = Math.min(minX, slot.x)
      minY = Math.min(minY, slot.y)
      maxX = Math.max(maxX, slot.x + slot.w)
      maxY = Math.max(maxY, slot.y + slot.h)
    }
    const pad = 4
    out.push({
      assemblyId: def.id,
      name: def.displayName,
      members: inGroup,
      rect: rectPct(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2),
    })
  }
  return out
})

function selectCluster(cluster: ClusterView): void {
  const target = cluster.members[0]
  if (target) emit('select', target)
}

const hoveredRow = computed<CarPartRowView | null>(() =>
  hoveredId.value ? (rowsById.value[hoveredId.value] ?? null) : null,
)
</script>

<template>
  <div class="parts-diagram">
    <div class="pd-head">
      <button
        v-if="activeGroup"
        type="button"
        class="pd-back"
        data-test="diagram-back"
        @click="backToTiles"
      >
        {{ BACK_LABEL }}
      </button>
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
    </div>

    <div
      class="pd-stage"
      :style="{ aspectRatio: `${DIAGRAM_VIEW_W} / ${DIAGRAM_VIEW_H}` }"
      data-test="parts-diagram-stage"
    >
      <!-- Level 1: the six group tiles, positioned as car regions. -->
      <template v-if="!activeGroup">
        <button
          v-for="tile in tiles"
          :key="tile.componentId"
          type="button"
          class="pd-tile"
          :class="washClasses(tile.band, tile.uncertain)"
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
          <img
            class="pd-tile-sprite"
            :src="partSpriteDataUrl(groupSpriteId(tile.componentId))"
            alt=""
            aria-hidden="true"
          />
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

      <!-- Level 2: the group's member sprites (unchanged layout geometry),
           assembly clusters behind them, and outside blockers as visitors. -->
      <template v-else>
        <div
          v-for="cluster in clusters"
          :key="cluster.assemblyId"
          class="pd-cluster"
          :style="cluster.rect"
          :data-test="'diagram-cluster-' + cluster.assemblyId"
        >
          <button
            type="button"
            class="pd-cluster-chip"
            :data-test="'diagram-cluster-chip-' + cluster.assemblyId"
            @click="selectCluster(cluster)"
          >
            {{ cluster.name }}
          </button>
        </div>

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
          <img class="pd-sprite" :src="spriteFor(partId)" alt="" aria-hidden="true" />
          <span class="pd-label">{{ game.carPartLabel(partId) }}</span>
          <span v-if="visitor" class="pd-visitor-tag">{{ visitorHomeLabel(partId) }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.parts-diagram {
  margin: 0 0 var(--mg-space-3);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.pd-head {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  min-height: 1.4rem;
}

/* The level-2 back control - the same quiet back-link idiom as the screen's
   own "< Garage" link. */
.pd-back {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

/* The fixed-aspect stage - relative units only, full container width (Sprint
   88 decision 2 lifts the old 640px cap). */
.pd-stage {
  position: relative;
  width: 100%;
  margin: var(--mg-space-2) 0 0;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  overflow: hidden;
}

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
  /* The block is its sprite on the dark stage over the condition wash (the
     `.pd-washed` rules below), with a transparent border that only the
     hover/selected/blocker/ghost states paint, so the click target and layout
     rect survive without a visible box. */
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--mg-text);
  overflow: hidden;
  cursor: pointer;
}

/* The placeholder pixel-art sprite - crisp nearest-neighbour, aspect kept by
   `contain`, as the block's sole fill. Level-1 tiles show the group's assembly
   sprite, level-2 slots their part sprite; ghost slots dim the same sprite
   (decision 4; no baked transparency). */
.pd-sprite,
.pd-tile-sprite {
  flex: 1 1 auto;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
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

.pd-visitor-tag {
  font-size: 0.5rem;
  line-height: 1;
  color: var(--mg-text-dim);
  pointer-events: none;
}

/* Condition wash (Sprint 96 decision 4, replaces the corner dot): the block's
   whole face carries a low-alpha tint of its band colour - the SAME band
   palette tokens BandChip authors - always on so condition reads at a glance,
   slightly stronger while hovered. Functional colour, not neon accent: the
   alpha stays low enough that the sprite and label read first. */
.pd-wash-mint {
  --pd-wash: var(--mg-success);
}

.pd-wash-fine {
  --pd-wash: var(--mg-neon-cyan);
}

.pd-wash-worn {
  --pd-wash: var(--mg-text-dim);
}

.pd-wash-poor,
.pd-wash-scrap {
  --pd-wash: var(--mg-neon-pink);
}

.pd-wash-neutral {
  --pd-wash: var(--mg-panel-edge);
}

.pd-washed {
  background-color: color-mix(in srgb, var(--pd-wash) 18%, transparent);
}

.pd-tile.pd-washed:hover,
.pd-tile.pd-washed:focus-visible,
.pd-slot.pd-washed.hovered,
.pd-slot.pd-washed:focus-visible {
  background-color: color-mix(in srgb, var(--pd-wash) 28%, transparent);
}

/* Ghost placeholder for an empty slot: the sprite still renders (decision 4)
   but dimmed, with a dashed edge saying "something belongs here". */
.pd-slot.ghost {
  border-style: dashed;
  border-color: var(--mg-panel-edge);
}

.pd-slot.ghost .pd-sprite {
  opacity: 0.32;
}

.pd-slot.ghost .pd-label {
  color: var(--mg-text-dim);
  opacity: 0.7;
}

/* An outside blocker visiting another group's view - hatched over its fill. */
.pd-slot.visitor {
  background-image: repeating-linear-gradient(
    45deg,
    color-mix(in srgb, var(--mg-text-dim) 35%, transparent) 0 2px,
    transparent 2px 6px
  );
}

.pd-tile:hover,
.pd-tile:focus-visible,
.pd-slot.hovered,
.pd-slot:focus-visible {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
}

/* The block the docked panel is currently showing. */
.pd-slot.selected {
  border-color: var(--mg-neon-cyan);
  box-shadow: inset 0 0 0 1px var(--mg-neon-cyan);
}

/* A part stacked over the hovered one and still in the way. */
.pd-slot.blocker-fitted {
  border-color: var(--mg-neon-pink);
  border-style: solid;
  box-shadow: inset 0 0 0 1px var(--mg-neon-pink);
}

.pd-slot.blocker-clear {
  opacity: 0.4;
}

/* Assembly cluster (decision 5): a bordered box around its member sprites,
   drawn behind them, with a chip naming the unit. */
.pd-cluster {
  position: absolute;
  z-index: 1;
  border: 1px dashed var(--mg-neon-violet);
  border-radius: 3px;
  background: color-mix(in srgb, var(--mg-neon-violet) 8%, transparent);
  pointer-events: none;
}

.pd-cluster-chip {
  position: absolute;
  top: -0.9rem;
  left: -1px;
  padding: 0 4px;
  border: 1px solid var(--mg-neon-violet);
  border-radius: 3px;
  background: var(--mg-panel);
  color: var(--mg-neon-violet);
  font-size: 0.55rem;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
}

.pd-inspector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
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
