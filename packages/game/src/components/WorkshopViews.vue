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
import type { ComponentId, ConditionBand, ZoneState } from '@midnight-garage/content'
import { ComponentIdSchema, titleCaseFromSlug } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { useGameStore, type CarPartRowView } from '../stores/gameStore'
import { zoneLayerReadings, zoneNeedsPanelTag, zoneSeverityText } from '../utils/zoneSeverity'
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
 * The component is a selection surface and nothing else: a click reports which
 * zone or part the player pointed at, and the screen's docked action panel does
 * the acting. Every rule about what may be worked on stays in the sim; this
 * renders live store state and never re-derives it.
 */

const props = defineProps<{ carId: string }>()
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

// --- Zone severity ------------------------------------------------------

interface LayerView {
  id: string
  tag: string
  severity: number
  /** One entry per step the layer can take, true where the damage reaches -
   * severity is read as a COUNT of filled pips, never as colour alone. */
  pips: boolean[]
}

function layersFor(zone: ZoneState): LayerView[] {
  return zoneLayerReadings(zone).map((layer) => ({
    id: layer.id,
    tag: layer.tag,
    severity: layer.severity,
    pips: Array.from({ length: layer.max }, (_, index) => index < layer.severity),
  }))
}

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
  /** Parts only; a zone carries layer severities instead of a band. */
  band: ConditionBand | null
  showBand: boolean
  missing: boolean
  absent: boolean
  uncertain: boolean
  clickable: boolean
  /** Zones only; empty for a part or a car with no zone state. */
  layers: LayerView[]
  /** Zones only; the chip naming a panel that is gone or past saving, `null`
   * when the zone's own pipeline can still do the work. */
  needsPanelTag: string | null
  inert: boolean
  ariaLabel: string
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
    absent,
    uncertain: row?.uncertain ?? false,
    // A part with nothing in its slot is still a work target - fitting one is
    // the work. An empty or removed slot must therefore stay clickable, and
    // nothing here may un-click it; the disjoint region map keeps its
    // rectangle reachable, since no other region can cover it.
    clickable: true,
    layers: [],
    needsPanelTag: null,
    inert: false,
    ariaLabel: `${name}: ${band ?? 'empty'}${notes.length > 0 ? `, ${notes.join(', ')}` : ''}`,
  }
}

function zoneRegion(region: Extract<WorkshopRegion, { kind: 'zone' }>): RegionView {
  const zone = zoneStates.value?.[region.zoneId] ?? null
  const name = titleCaseFromSlug(region.zoneId)
  const needsPanelTag = zone ? zoneNeedsPanelTag(zone) : null
  const notes = [needsPanelTag].filter((note): note is string => note !== null)
  return {
    kind: 'zone',
    slug: region.zoneId,
    selection: { kind: 'zone', zoneId: region.zoneId },
    testBase: `workshop-region-zone-${region.zoneId}`,
    rects: region.rects,
    name,
    band: null,
    showBand: false,
    missing: false,
    absent: false,
    uncertain: false,
    clickable: zone !== null,
    layers: zone ? layersFor(zone) : [],
    needsPanelTag,
    inert: zone === null,
    ariaLabel: zone
      ? `${name}: ${zoneSeverityText(zone)}${notes.length > 0 ? `, ${notes.join(', ')}` : ''}`
      : `${name}: ${NO_ZONE_DATA_LABEL}`,
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
  }
}

function onSelect(region: RegionView): void {
  if (!region.clickable) return
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
      >
        <span class="wv-name">{{ region.name }}</span>

        <template v-if="region.showBand">
          <BandChip :band="region.band" />
          <span v-if="region.uncertain" class="wv-uncertain">?</span>
          <span v-if="region.missing" class="wv-tag wv-tag-alert">{{ MISSING_LABEL }}</span>
          <span v-else-if="region.absent" class="wv-tag">{{ ABSENT_LABEL }}</span>
        </template>

        <template v-else>
          <span v-if="region.inert" class="wv-tag">{{ NO_ZONE_DATA_LABEL }}</span>
          <span v-else class="wv-layers" :data-test="'workshop-zone-layers-' + region.slug">
            <!-- Severity reads as a COUNT of filled pips first (0 = none
                 filled = nothing wrong) with colour as a second channel, so
                 it survives being read without colour. -->
            <span
              v-for="layer in region.layers"
              :key="layer.id"
              class="wv-layer"
              :class="'wv-sev-' + layer.severity"
            >
              <span class="wv-layer-tag">{{ layer.tag }}</span>
              <span
                v-for="(filled, pipIndex) in layer.pips"
                :key="pipIndex"
                class="wv-pip"
                :class="{ 'wv-pip-on': filled }"
              ></span>
            </span>
          </span>
          <span v-if="region.needsPanelTag" class="wv-tag wv-tag-alert">{{
            region.needsPanelTag
          }}</span>
        </template>
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

/* Zone severity: one track per layer, each a letter and a row of pips. */
.wv-layers {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  pointer-events: none;
}

.wv-layer {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  color: var(--mg-sev, var(--mg-text-dim));
}

.wv-layer-tag {
  font-size: 0.5rem;
}

/* A pip is a square: outlined while clear, solid once the damage reaches it.
   Fill count carries the reading; the colour below only reinforces it. */
.wv-pip {
  display: inline-block;
  width: 4px;
  height: 4px;
  border: 1px solid currentcolor;
}

.wv-pip-on {
  background: currentcolor;
}

.wv-sev-0 {
  --mg-sev: var(--mg-success);
}

.wv-sev-1 {
  --mg-sev: var(--mg-neon-cyan);
}

.wv-sev-2 {
  --mg-sev: var(--mg-yen);
}

.wv-sev-3 {
  --mg-sev: var(--mg-neon-pink);
}
</style>
