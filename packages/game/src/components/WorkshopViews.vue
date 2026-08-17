<script lang="ts">
import type { CarPartId, ZoneId } from '@midnight-garage/content'

/**
 * What a click on a workshop view region means.
 *
 * Discriminated on purpose. `chassis` is a legal value of BOTH id types (it is
 * one of the six body zones and, separately, a drivetrain part), so a bare id
 * would leave the consumer guessing which lookup to dispatch it into.
 */
export type WorkshopSelection =
  { kind: 'part'; partId: CarPartId } | { kind: 'zone'; zoneId: ZoneId }
</script>

<script setup lang="ts">
import type { ComponentId, ConditionBand } from '@midnight-garage/content'
import { ComponentIdSchema, titleCaseFromSlug } from '@midnight-garage/content'
import {
  bodyworkBindingZoneIds,
  paintBindingZoneIds,
  zoneConditionBand,
} from '@midnight-garage/sim'
import { computed, ref } from 'vue'
import type { DropZoneHandle } from '../composables/useDragAndDrop'
import { useGameStore, type CarPartRowView } from '../stores/gameStore'
import {
  ZONE_FINISH_LABELS,
  zoneBothDone,
  zoneFinishPosition,
  zoneNeedsPanelTag,
} from '../utils/zoneSeverity'
import BandChip from './BandChip.vue'
import {
  WORKSHOP_VIEW_H,
  WORKSHOP_VIEW_W,
  WORKSHOP_VIEWS,
  type ViewRect,
  type WorkshopRegion,
  type WorkshopViewId,
} from './workshopViewLayout'
import { workshopViewDataUrl } from './workshopViewSprites'

/**
 * The workshop's three views - the body schematic, the engine bay from above,
 * and the underside on the lift - as one component rather than three. The
 * views differ ONLY in their region set, which `workshopViewLayout.ts` already
 * parameterises, so three components would be three copies of this markup.
 *
 * The component is a selection surface first: a click reports which zone or
 * part the player pointed at, and the screen's docked action panel does the
 * acting. Every rule about what may be worked on stays in the sim; this
 * renders live store state and never re-derives it. It is ALSO a drop
 * surface for a part region: the parent builds one `DropZoneHandle` per
 * `CarPartId` (the same set the sidebar's own Fit button binds to) and hands
 * the map in, so a drag lands on the diagram tile exactly as it would on the
 * Fit button - this component still owns none of the accept logic itself.
 * `dropZones` is a `Partial` and defaults empty: a caller with nothing to
 * drop (every current test) mounts exactly as before, and a missing entry
 * simply renders that region non-interactive as a drop target. `zoneDropZones`
 * is the same idea for the body zones (sprint211.md task D): a panel is a
 * part like any other, so a zone region doubles as a drop target exactly the
 * way a part region already did, once a host builds one via
 * `useZoneDropZones` and hands it in.
 *
 * `selected` names whatever the host's own docked panel is currently
 * showing, so the region it came from carries a real selected outline - the
 * one thing this surface never had before (sprint211.md task A): a click
 * used to dock a panel with no visible trace of which region it targeted,
 * which is how a stale target went unnoticed. `null`/omitted renders every
 * region unselected, exactly as before.
 */

const props = withDefaults(
  defineProps<{
    carId: string
    dropZones?: Partial<Record<CarPartId, DropZoneHandle>>
    zoneDropZones?: Partial<Record<ZoneId, DropZoneHandle>>
    selected?: WorkshopSelection | null
  }>(),
  { dropZones: () => ({}), zoneDropZones: () => ({}), selected: null },
)
const emit = defineEmits<{ (e: 'select', selection: WorkshopSelection): void }>()

const game = useGameStore()

const MISSING_LABEL = 'missing'
/** The one legitimately-empty slot in the game, worded as the car-detail
 * screen already words it rather than as a second phrasing of the same fact. */
const ABSENT_LABEL = 'no turbo (NA)'
const NO_ZONE_DATA_LABEL = 'no readings'

const VIEWS = Object.values(WORKSHOP_VIEWS)
const COMPONENTS: readonly ComponentId[] = ComponentIdSchema.options

/** One authored art pixel per four of the layout's 320x180 coordinate space,
 * so a backdrop rasterises at exactly the stage's own resolution. */
const ART_SCALE = 4

const activeViewId = ref<WorkshopViewId>('body')

/** The active view's backdrop. Purely decorative: it is painted on the art
 * layer, which sits under every region and outside the pointer path. */
const artStyle = computed(() => ({
  backgroundImage: `url(${workshopViewDataUrl(activeViewId.value, ART_SCALE)})`,
}))

// --- Live car state -----------------------------------------------------

const detail = computed(() => game.carDetail(props.carId) ?? null)

/** Every part's row, keyed by part id - the same `partsInGroup` rows the
 * car-detail screen reads, not a parallel derivation. */
const rowsById = computed(() => {
  const map = {} as Record<CarPartId, CarPartRowView>
  for (const componentId of COMPONENTS) {
    for (const row of game.partsInGroup(props.carId, componentId)) map[row.partId] = row
  }
  return map
})

/**
 * The car's zone state, or null. `zoneState` is optional in the schema, so a
 * car that is not on the zone model has none - its zone regions read as inert
 * rather than throwing on a lookup into nothing.
 */
const zoneStates = computed(() => detail.value?.car.zoneState ?? null)

/**
 * Which zones are why `bodywork` and/or `paint` read as bad as they do
 * The worst-governs rule those two carriers already
 * apply, just surfaced onto the zone(s) that actually set it. A set, since
 * ties are real: two corners dented equally hard both bind the band.
 */
const bindingZoneIds = computed<ReadonlySet<ZoneId>>(() => {
  const zones = zoneStates.value
  if (!zones) return new Set()
  return new Set([...bodyworkBindingZoneIds(zones), ...paintBindingZoneIds(zones)])
})

// --- The regions of the active view -------------------------------------

interface RegionView {
  kind: 'part' | 'zone'
  /** The region's own id - a part id or a zone id, told apart by `kind`. */
  slug: string
  /** The payload a click on this region emits. */
  selection: WorkshopSelection
  /** The `data-test` stem; a multi-rect region suffixes the rect index. */
  testBase: string
  rects: readonly ViewRect[]
  name: string
  /** `null` only for a zone on a car with no zone state at all - every real
   * part and every real zone reads a band, in the same shared vocabulary. */
  band: ConditionBand | null
  showBand: boolean
  missing: boolean
  /** The short alert-tag text for `missing`, or `null` when it's false - a
   * part reads the shared "missing" word, a zone its own "Missing" (never
   * "scrap": there is no condition to grade on an absent panel). Kept apart
   * from the boolean so the CSS-class use of `missing` (the red outline) and
   * the tag's own wording can vary independently. */
  missingLabel: string | null
  absent: boolean
  uncertain: boolean
  clickable: boolean
  /** Zones only; whether this zone is (one of) the reason `bodywork` or
   * `paint` reads as bad as it does. */
  binding: boolean
  /** Zones only; the chip naming a panel that is gone or past saving, `null`
   * when the zone's own pipeline can still do the work (also `null` while
   * `missingLabel` already covers it - the two tags never double up). */
  needsPanelTag: string | null
  inert: boolean
  ariaLabel: string
  /** Parts only; the drop zone this region doubles as, or `null` for a zone
   * region (a body zone has no part slot to drop onto). */
  dropZone: DropZoneHandle | null
  /** Whether the host's docked panel is currently showing this exact region -
   * the one visible trace a selection ever leaves on the diagram. */
  isSelected: boolean
  /** Zones only; the finish-position word (bare metal / prepped / primed /
   * painted / polished), or `null` when there is no band to pair it with
   * (no zone data, or the panel is missing) or when structure and finish are
   * both done and the band chip alone already says the whole story. */
  finishTag: string | null
}

/** Whether `selection` is the one the host's docked panel is currently
 * showing - compared on both `kind` and id, since `chassis` is a legal value
 * of either id type and a bare string match would conflate them. */
function isSelected(selection: WorkshopSelection): boolean {
  const sel = props.selected
  if (!sel || sel.kind !== selection.kind) return false
  return sel.kind === 'part' && selection.kind === 'part'
    ? sel.partId === selection.partId
    : sel.kind === 'zone' && selection.kind === 'zone' && sel.zoneId === selection.zoneId
}

function partRegion(region: Extract<WorkshopRegion, { kind: 'part' }>): RegionView {
  const row = rowsById.value[region.partId]
  const name = game.carPartLabel(region.partId)
  const band = row?.band ?? null
  const missing = row?.missing ?? false
  const absent = row?.legitimatelyAbsent ?? false
  const notes = [missing ? MISSING_LABEL : null, absent ? ABSENT_LABEL : null].filter(
    (note): note is string => note !== null,
  )
  return {
    kind: 'part',
    slug: region.partId,
    selection: { kind: 'part', partId: region.partId },
    testBase: `workshop-region-part-${region.partId}`,
    rects: region.rects,
    name,
    band,
    showBand: true,
    missing,
    missingLabel: missing ? MISSING_LABEL : null,
    absent,
    uncertain: row?.uncertain ?? false,
    // A part with nothing in its slot is still a work target - fitting one is
    // the work. An empty or removed slot must therefore stay clickable, and
    // nothing here may un-click it; the disjoint region map keeps its
    // rectangle reachable, since no other region can cover it.
    clickable: true,
    binding: false,
    needsPanelTag: null,
    inert: false,
    ariaLabel: `${name}: ${band ?? 'empty'}${notes.length > 0 ? `, ${notes.join(', ')}` : ''}`,
    dropZone: props.dropZones[region.partId] ?? null,
    isSelected: isSelected({ kind: 'part', partId: region.partId }),
    finishTag: null,
  }
}

function zoneRegion(region: Extract<WorkshopRegion, { kind: 'zone' }>): RegionView {
  const zone = zoneStates.value?.[region.zoneId] ?? null
  const name = titleCaseFromSlug(region.zoneId)
  // An absent panel is forced to the `scrap` band internally (there is no
  // sixth band value to spell "missing"), which is exactly the word this
  // region must never show the player - so a missing zone shows no band
  // chip at all rather than the sim's own scrap floor, and the panel-off
  // tag folds into the shared `missingLabel` field instead of stacking
  // alongside it.
  const missing = zone?.panelMissing ?? false
  const band = zone && !missing ? zoneConditionBand(zone) : null
  const needsPanelTag = zone && !missing ? zoneNeedsPanelTag(zone) : null
  const binding = zone !== null && bindingZoneIds.value.has(region.zoneId)
  // Structure and finish are different facts (sprint211.md task B): the band
  // above reads structure alone, so a beaten-straight bare panel still shows
  // it honestly - the finish tag beside it is what stops that band reading
  // as a plain "Mint" when the coat is not actually done. Collapses to
  // nothing only once both are true, the one case a bare band chip is the
  // whole story.
  const finishPosition = zone && !missing ? zoneFinishPosition(zone) : null
  const finishTag =
    finishPosition && band && !zoneBothDone(band, finishPosition)
      ? ZONE_FINISH_LABELS[finishPosition]
      : null
  const notes = [needsPanelTag, finishTag, binding ? 'binding' : null].filter(
    (note): note is string => note !== null,
  )
  return {
    kind: 'zone',
    slug: region.zoneId,
    selection: { kind: 'zone', zoneId: region.zoneId },
    testBase: `workshop-region-zone-${region.zoneId}`,
    rects: region.rects,
    name,
    band,
    showBand: zone !== null && !missing,
    missing,
    missingLabel: missing ? 'Missing' : null,
    absent: false,
    uncertain: false,
    clickable: zone !== null,
    binding,
    needsPanelTag,
    inert: zone === null,
    ariaLabel: zone
      ? `${name}: ${missing ? 'missing' : band}${notes.length > 0 ? `, ${notes.join(', ')}` : ''}`
      : `${name}: ${NO_ZONE_DATA_LABEL}`,
    dropZone: props.zoneDropZones[region.zoneId] ?? null,
    isSelected: isSelected({ kind: 'zone', zoneId: region.zoneId }),
    finishTag,
  }
}

const regionViews = computed<RegionView[]>(() =>
  WORKSHOP_VIEWS[activeViewId.value].regions.map((region) =>
    region.kind === 'part' ? partRegion(region) : zoneRegion(region),
  ),
)

/** A single-rect region owns its stem outright; a multi-rect one suffixes the
 * index, since every rect is a real, separately-addressable click target. */
function testIdFor(region: RegionView, index: number): string {
  return region.rects.length === 1 ? region.testBase : `${region.testBase}-${index}`
}

interface RectView {
  /** The rect's `data-test` id, which is unique across the whole view and so
   * serves as its list key too. */
  id: string
  region: RegionView
  rect: ViewRect
}

/**
 * One entry per drawn rectangle - the flat list the template renders. A region
 * owns a SET of rects and each one is its own button, so flattening the pair
 * here keeps the markup to a single keyed element instead of a keyed
 * `<template v-for>` wrapping a second loop.
 */
const rectViews = computed<RectView[]>(() =>
  regionViews.value.flatMap((region) =>
    region.rects.map((rect, index) => ({ id: testIdFor(region, index), region, rect })),
  ),
)

/** A rect as percentages of the 320x180 space the layout module authors in.
 *
 * There is deliberately NO z-index here, and there must never be one. The
 * rects in a view are pairwise disjoint (`workshopViewLayout.test.ts` proves
 * it), so no two can ever contend for a point and stacking order has nothing
 * to decide. A z-index would reintroduce exactly the class of bug this layout
 * rules out: overlapping hit areas, where a removed part's empty rectangle
 * keeps its footprint and swallows clicks meant for what sits under it.
 */
function rectStyle(rect: ViewRect): Record<string, string> {
  return {
    left: `${(rect.x / WORKSHOP_VIEW_W) * 100}%`,
    top: `${(rect.y / WORKSHOP_VIEW_H) * 100}%`,
    width: `${(rect.w / WORKSHOP_VIEW_W) * 100}%`,
    height: `${(rect.h / WORKSHOP_VIEW_H) * 100}%`,
  }
}

function regionClasses(region: RegionView): Record<string, boolean> {
  return {
    'wv-part': region.kind === 'part',
    'wv-zone': region.kind === 'zone',
    'wv-missing': region.missing,
    'wv-absent': region.absent,
    'wv-binding': region.binding,
    'wv-active-target': region.dropZone?.isActiveTarget.value ?? false,
    'wv-selected': region.isSelected,
  }
}

/** A click on a region: while it's a live drop target (a drag hovering it, or
 * any accepting zone during a pick), the click completes the drop instead of
 * selecting - the same "tap a picked card's destination" idiom the sidebar's
 * own Fit button uses. Otherwise it docks the panel on this part or zone, as
 * before. */
function onSelect(region: RegionView): void {
  if (!region.clickable) return
  if (region.dropZone?.isActiveTarget.value) {
    region.dropZone.onClick()
    return
  }
  emit('select', region.selection)
}
</script>

<template>
  <div class="workshop-views">
    <div class="wv-tabs" role="group" aria-label="Workshop views">
      <button
        v-for="view in VIEWS"
        :key="view.id"
        type="button"
        class="wv-tab"
        :class="{ 'wv-tab-on': view.id === activeViewId }"
        :aria-pressed="view.id === activeViewId"
        :data-test="'workshop-view-tab-' + view.id"
        @click="activeViewId = view.id"
      >
        {{ view.label }}
      </button>
    </div>

    <div
      class="wv-stage"
      :style="{ aspectRatio: `${WORKSHOP_VIEW_W} / ${WORKSHOP_VIEW_H}` }"
      data-test="workshop-stage"
    >
      <!-- The art layer: the bitmap of the car as a background, behind every
           region and outside the hit map, so the art never touches the
           geometry. Swapping the placeholder for finished art changes this
           file not at all. -->
      <div class="wv-art" :style="artStyle" data-test="workshop-art-layer" aria-hidden="true"></div>

      <button
        v-for="{ id, region, rect } in rectViews"
        :key="id"
        type="button"
        class="wv-region"
        :class="regionClasses(region)"
        :style="rectStyle(rect)"
        :disabled="!region.clickable"
        :aria-label="region.ariaLabel"
        :data-test="id"
        @click="onSelect(region)"
        @pointerup="region.dropZone?.onPointerUp()"
        @pointerenter="region.dropZone?.onPointerEnter()"
        @pointerleave="region.dropZone?.onPointerLeave()"
      >
        <span class="wv-name">{{ region.name }}</span>

        <template v-if="region.showBand">
          <BandChip :band="region.band" />
          <span v-if="region.uncertain" class="wv-uncertain">?</span>
        </template>
        <span v-else-if="region.inert" class="wv-tag">{{ NO_ZONE_DATA_LABEL }}</span>

        <span v-if="region.missingLabel" class="wv-tag wv-tag-alert">{{
          region.missingLabel
        }}</span>
        <span v-else-if="region.absent" class="wv-tag">{{ ABSENT_LABEL }}</span>
        <span v-if="region.needsPanelTag" class="wv-tag wv-tag-alert">{{
          region.needsPanelTag
        }}</span>
        <span v-if="region.finishTag" class="wv-tag" :data-test="'zone-finish-' + region.slug">{{
          region.finishTag
        }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.workshop-views {
  margin: 0 0 var(--mg-space-3);
  border: var(--mg-border);
  background: var(--mg-panel);
  padding: var(--mg-space-2) var(--mg-space-3);
}

/* The view switcher: three plates that stay down while their view is up.
   Square corners and a real travel on press - no tint-only states. */
.wv-tabs {
  display: flex;
  gap: var(--mg-space-1);
}

.wv-tab {
  padding: var(--mg-space-1) var(--mg-space-3);
  border: 1px solid var(--mg-panel-edge);
  border-top-color: color-mix(in srgb, var(--mg-panel-edge) 55%, var(--mg-text));
  border-left-color: color-mix(in srgb, var(--mg-panel-edge) 55%, var(--mg-text));
  border-radius: 0;
  background: var(--mg-night);
  color: var(--mg-text-dim);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

.wv-tab-on {
  /* Pressed: the bevel inverts and the plate sits a pixel lower. */
  border-top-color: color-mix(in srgb, var(--mg-panel-edge) 70%, var(--mg-night-deep));
  border-left-color: color-mix(in srgb, var(--mg-panel-edge) 70%, var(--mg-night-deep));
  border-bottom-color: color-mix(in srgb, var(--mg-panel-edge) 55%, var(--mg-text));
  border-right-color: color-mix(in srgb, var(--mg-panel-edge) 55%, var(--mg-text));
  background: color-mix(in srgb, var(--mg-neon-violet) 20%, var(--mg-night));
  color: var(--mg-neon-violet);
  transform: translateY(1px);
}

/* The fixed-aspect stage the regions are positioned on - relative units only,
   full container width, the aspect ratio set inline from the layout module's
   own coordinate space. */
.wv-stage {
  position: relative;
  width: 100%;
  margin: var(--mg-space-2) 0 0;
  border: var(--mg-border);
  background: var(--mg-night-deep);
  overflow: hidden;
}

/* The car silhouette bitmap. Kept behind the regions and out of the pointer
   path, so the art can never intercept a click meant for a region.
   The bitmap is authored at the stage's own 16:9, so filling both axes scales
   it uniformly: it neither stretches nor crops. Nearest-neighbour, because
   every pixel in it was placed by hand. */
.wv-art {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
  image-rendering: pixelated;
  pointer-events: none;
}

.wv-region {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0 2px;
  margin: 0;
  /* Bevelled segment: lit from the top-left, in tokens only. No z-index, by
     law - see `rectStyle` for why. */
  border: 1px solid var(--mg-panel-edge);
  border-top-color: color-mix(in srgb, var(--mg-panel-edge) 55%, var(--mg-text));
  border-left-color: color-mix(in srgb, var(--mg-panel-edge) 55%, var(--mg-text));
  border-bottom-color: color-mix(in srgb, var(--mg-panel-edge) 70%, var(--mg-night-deep));
  border-right-color: color-mix(in srgb, var(--mg-panel-edge) 70%, var(--mg-night-deep));
  border-radius: 0;
  color: var(--mg-text);
  font-family: inherit;
  font-size: 0.55rem;
  line-height: 1.1;
  overflow: hidden;
  cursor: pointer;
}

/* The two region families read as different materials even before the art
   lands: a part is a component sitting in a bay, a zone is the shell itself. */
.wv-part {
  background: color-mix(in srgb, var(--mg-panel) 65%, transparent);
}

.wv-zone {
  background: color-mix(in srgb, var(--mg-night) 75%, transparent);
}

.wv-region:hover {
  border-color: var(--mg-neon-violet);
  color: var(--mg-neon-violet);
}

/* The custom focus treatment - an inset ring, never the browser's own. */
.wv-region:focus-visible,
.wv-tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

.wv-region:active {
  background: color-mix(in srgb, var(--mg-neon-violet) 18%, transparent);
}

.wv-region:disabled {
  cursor: default;
  opacity: 0.45;
}

.wv-region:disabled:hover {
  border-color: var(--mg-panel-edge);
  color: var(--mg-text);
}

.wv-missing {
  border-color: var(--mg-danger);
}

/* A valid drop target for the part currently being dragged or picked - the
   same cyan-tint highlight every other drop zone in the garage uses. */
.wv-active-target {
  border-color: var(--mg-neon-cyan);
  background: rgba(47, 214, 191, 0.12);
}

/* The zone(s) actually dragging `bodywork` or `paint` down - a visible ring,
   never a text label, so the diagram stays a picture rather than growing a
   caption. */
.wv-binding {
  box-shadow: inset 0 0 0 2px var(--mg-danger);
}

/* Whatever the docked panel is currently showing - a solid violet border and
   a lifted background, distinct from both the cyan drop-target tint and the
   red binding ring, so a click's target is never ambiguous (sprint211.md
   task A: this was the one thing missing that let "Take it off" fire at a
   stale zone). Wins visually over `wv-binding` by declaration order below. */
.wv-selected {
  border-color: var(--mg-neon-violet);
  background: color-mix(in srgb, var(--mg-neon-violet) 20%, transparent);
  box-shadow: inset 0 0 0 2px var(--mg-neon-violet);
}

/* Legitimately empty (the NA car's turbo slot): still a real click target,
   just nothing to shout about. */
.wv-absent .wv-name {
  color: var(--mg-text-dim);
}

.wv-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.wv-tag {
  color: var(--mg-text-dim);
  pointer-events: none;
}

.wv-tag-alert {
  color: var(--mg-danger);
}

.wv-uncertain {
  color: var(--mg-yen);
  font-weight: bold;
  pointer-events: none;
}
</style>
