<script setup lang="ts">
import {
  ConditionBandSchema,
  fitmentClassForTier,
  titleCaseFromSlug,
  type ConditionBand,
} from '@midnight-garage/content'
import { bandIndex } from '@midnight-garage/sim'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useDragSession, useDropZone } from '../composables/useDragAndDrop'
import { useGameStore, type StageablePartView } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'
import HelpHint from './HelpHint.vue'
import PartCard from './PartCard.vue'

/**
 * The Warehouse - the game's ONE inventory surface. A floating element in the
 * same family as the End Day button and the day/cash box: mounted once at the
 * app root, present on every gameplay screen as a tab on the right edge that
 * opens this drawer. Everything the shop owns and hasn't fitted is listed
 * here and nowhere else; parts drag (or pick-and-place) from this list onto
 * whatever accepts them - a work station, a station's tray, a car slot.
 *
 * Two modes, one list. Browse mode is the whole holding with search, section
 * filter and sort. Fit mode ("Fit" on a car slot or a benched member opened
 * it, `ui.warehouseFit`) scopes the same list to that one slot and makes
 * selection fit the part - the flow the old ReplaceDrawer carried, now living
 * in the one drawer instead of a second implementation.
 *
 * While a drag or pick is live the drawer tucks itself off-screen so the drop
 * targets under it are reachable, and slides back when the gesture resolves.
 * The board stays mounted throughout - the drag originates on a card inside
 * it, and unmounting mid-gesture would kill the gesture.
 */
const game = useGameStore()
const ui = useUiStore()
const dragSession = useDragSession()

const fit = computed(() => ui.warehouseFit)

/**
 * Pinned open (sprint211.md task G): the player's own standing choice to
 * keep the drawer visible through a drag rather than have it tuck away.
 * Session state only, like the drag session itself - a reload settles back
 * to the default (unpinned), which is fine.
 */
const pinned = ref(false)

/** Tucked while any drag/pick gesture is live, wherever it started - the
 * drawer is never the thing being aimed at mid-gesture - UNLESS pinned,
 * which is the whole point of pinning: the drop targets under it stay
 * reachable through its own drop rail instead. */
const tucked = computed(() => dragSession.value !== null && !pinned.value)

/**
 * The drop-back rail: a station-held part carried straight back to the
 * Warehouse, the drag mirror of the tray's own "Back to the warehouse"
 * button. Rendered in the tab's place while the drawer is tucked, since the
 * tab itself slides off-screen with it - `stationForPart` names which
 * station to pull from, so the rail never needs to know which one is live.
 * While pinned the drawer never tucks, so the board's own header binds the
 * same accept logic instead (below) - the rail's job without the rail.
 */
const stationDropZone = useDropZone<string>(
  (partInstanceId) => game.stationForPart(partInstanceId) !== null,
  (partInstanceId) => {
    const station = game.stationForPart(partInstanceId)
    if (station) game.takeFromStation(station)
  },
)

const title = computed(() => {
  const context = fit.value
  if (!context) return 'Warehouse'
  return context.kind === 'zone'
    ? `Fit a panel - ${titleCaseFromSlug(context.zoneId)}`
    : `Fit ${game.carPartLabel(context.carPartId)}`
})

// --- Browse mode: search, section filter, sort ---

const query = ref('')
const sectionFilter = ref('all')
const sortKey = ref<'newest' | 'slot' | 'condition' | 'name'>('newest')

/** The "fits this vehicle" slicer, mirroring the parts market's own control:
 * the same owned-plus-inbound-customer-car options, narrowing to parts of
 * that car's fitment class. */
const vehicleFilter = ref('')
const vehicleOptions = computed(() => game.partsFitVehicleOptions)

/** Whose parts to show: everything, only the shop's own, or only parts pulled
 * off a customer's car (locked from sale until their job closes). */
const ownershipFilter = ref<'all' | 'mine' | 'customer'>('all')

/** The condition slicer (sprint211.md task G) - scrap through mint, in the
 * content-canonical order, so a stale-band read never has to guess the
 * ladder. */
const CONDITION_OPTIONS: readonly ConditionBand[] = ConditionBandSchema.options
const conditionFilter = ref<ConditionBand | 'all'>('all')

/** The sections actually represented on the shelves right now - the filter
 * never offers an empty aisle. */
const sectionOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const entry of game.pickableParts) {
    const componentId = game.groupForCarPart(entry.part.carPartId)
    if (componentId && !seen.has(componentId)) {
      seen.set(componentId, game.componentLabel(componentId))
    }
  }
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
})

/** The stale-filter guard (sprint211.md task G): the last part of a section
 * can leave the shelf while that section is still armed, which used to
 * filter everything out behind a select that kept showing the vanished
 * option. Resets to "all sections" the moment the armed value is no longer
 * offered. */
watch(sectionOptions, (options) => {
  if (sectionFilter.value !== 'all' && !options.some(([id]) => id === sectionFilter.value)) {
    sectionFilter.value = 'all'
  }
})

function matchesQuery(entry: StageablePartView, needle: string): boolean {
  const haystack =
    `${entry.part.brand} ${entry.part.name} ${game.carPartLabel(entry.part.carPartId)}`.toLowerCase()
  return haystack.includes(needle)
}

const browseEntries = computed(() => {
  const needle = query.value.trim().toLowerCase()
  // Newest first is the resting order: partInventory appends, so the part
  // just bought or just pulled off a car surfaces at the top of the sheet.
  let entries = [...game.pickableParts].reverse()
  if (sectionFilter.value !== 'all') {
    entries = entries.filter(
      (entry) => game.groupForCarPart(entry.part.carPartId) === sectionFilter.value,
    )
  }
  const vehicle = vehicleOptions.value.find((v) => v.id === vehicleFilter.value)
  if (vehicle) {
    entries = entries.filter((entry) => entry.part.fitmentClass === vehicle.fitmentClass)
  }
  if (ownershipFilter.value !== 'all') {
    const wantCustomer = ownershipFilter.value === 'customer'
    entries = entries.filter((entry) => game.isCustomerOwnedPart(entry.instance) === wantCustomer)
  }
  if (conditionFilter.value !== 'all') {
    entries = entries.filter((entry) => entry.instance.band === conditionFilter.value)
  }
  if (needle) entries = entries.filter((entry) => matchesQuery(entry, needle))
  switch (sortKey.value) {
    case 'slot':
      entries.sort((a, b) =>
        game.carPartLabel(a.part.carPartId).localeCompare(game.carPartLabel(b.part.carPartId)),
      )
      break
    case 'condition':
      entries.sort((a, b) => bandIndex(b.instance.band) - bandIndex(a.instance.band))
      break
    case 'name':
      entries.sort((a, b) =>
        `${a.part.brand} ${a.part.name}`.localeCompare(`${b.part.brand} ${b.part.name}`),
      )
      break
    case 'newest':
      break
  }
  return entries.map((entry) => ({ ...entry, fits: true, noFitReason: null as string | null }))
})

// --- Fit mode: the one-slot pick list the old ReplaceDrawer carried ---

/**
 * Every pickable part addressed to the fit slot, each flagged with whether it
 * can go on right now and, when it cannot, why. Excludes scrap (never
 * installable anywhere). Sorted installable first, then tool-gated (the
 * reason names the missing tool), then never-fits - what you can do, what you
 * could do, and what you cannot. Part-slot mode only - `zoneFitEntries` below
 * is the panel counterpart.
 */
const fitEntries = computed(() => {
  const context = fit.value
  if (!context || context.kind !== 'part') return []
  const fitting = new Set(
    game.installablePartsForPart(context.carId, context.carPartId).map((p) => p.id),
  )
  const rank = (fits: boolean, reason: string | null): number => (fits ? 0 : reason ? 1 : 2)
  return game.pickableParts
    .filter(
      (entry) => entry.part.carPartId === context.carPartId && entry.instance.band !== 'scrap',
    )
    .map((entry) => {
      const noFitReason = game.installToolGateReasonFor(context.carId, entry.part.id)
      const fits = fitting.has(entry.instance.id) && !noFitReason
      return { ...entry, fits, noFitReason, rank: rank(fits, noFitReason) }
    })
    .sort((a, b) => a.rank - b.rank)
})

/**
 * A zone's own pick list (sprint211.md task D): every owned panel addressed
 * to this exact zone at the car's own fitment class, minus scrap. A panel is
 * hand work bolted straight on - there is no tool gate to flag, unlike a
 * part slot, so every entry here always fits.
 */
const zoneFitEntries = computed(() => {
  const context = fit.value
  if (!context || context.kind !== 'zone') return []
  const detail = game.carDetail(context.carId)
  if (!detail) return []
  const fitClass = fitmentClassForTier(detail.model.tier)
  return game.pickableParts
    .filter(
      (entry) =>
        entry.part.zoneId === context.zoneId &&
        entry.part.fitmentClass === fitClass &&
        entry.instance.band !== 'scrap',
    )
    .map((entry) => ({ ...entry, fits: true, noFitReason: null as string | null }))
})

/** The bench-fit machine-labour disclosure - only in bench mode, never
 * blocking: a bench fit always works, just slower by hand. Stated once at
 * the header rather than per row, since it's the same figure for every part
 * in the slot. */
const benchMachineNote = computed(() => {
  const context = fit.value
  return context?.kind === 'part' && context.benchContainerId
    ? game.benchFitMachineNoteFor(context.carPartId)
    : ''
})

const entries = computed(() => {
  const context = fit.value
  if (!context) return browseEntries.value
  return context.kind === 'zone' ? zoneFitEntries.value : fitEntries.value
})

function onSelect(partInstanceId: string): void {
  const context = fit.value
  if (!context) return
  if (context.kind === 'zone') {
    game.installPanel(context.carId, context.zoneId, partInstanceId)
    ui.closeWarehouse()
    return
  }
  if (context.benchContainerId) {
    game.fitAssemblyMember(context.benchContainerId, context.carPartId, partInstanceId)
    ui.closeWarehouse()
    return
  }
  const componentId = game.groupForCarPart(context.carPartId)
  if (!componentId) return
  game.install(context.carId, componentId, partInstanceId, context.carPartId)
  ui.closeWarehouse()
}

/**
 * The one count both the tab badge and the on-screen line read (sprint211.md
 * task G: a badge and a count that could ever disagree is worse than either
 * alone) - filtered over total, so "12/12" in browse mode with nothing armed
 * reads as plainly as "3/12" does with a filter on. Fit mode has no
 * independent filters of its own, so its list is already the total and the
 * two numbers simply agree.
 */
const countLabel = computed(() => `${entries.value.length}/${game.pickableParts.length}`)
</script>

<template>
  <div class="warehouse" :class="{ closed: !ui.warehouseOpen, tucked }">
    <button
      type="button"
      class="tab"
      data-test="warehouse-tab"
      :aria-expanded="ui.warehouseOpen"
      @click="ui.toggleWarehouse()"
    >
      <span class="tab-label">Warehouse</span>
      <span class="tab-count" data-test="warehouse-count">{{ countLabel }}</span>
    </button>

    <aside
      v-if="ui.warehouseOpen"
      class="board"
      :class="{ 'active-target': pinned && stationDropZone.isActiveTarget.value }"
      data-test="warehouse-drawer"
      @pointerup="pinned ? stationDropZone.onPointerUp() : undefined"
      @pointerenter="pinned ? stationDropZone.onPointerEnter() : undefined"
      @pointerleave="pinned ? stationDropZone.onPointerLeave() : undefined"
      @click="pinned ? stationDropZone.onClick() : undefined"
    >
      <header class="board-head">
        <h3>
          {{ title }}
          <HelpHint v-if="!fit" label="Warehouse">
            Everything you own that isn't fitted to a car. Drag a part out to a station or a car, or
            tap "move&hellip;" and then "Place here".
          </HelpHint>
        </h3>
        <button
          type="button"
          class="pin"
          :class="{ on: pinned }"
          :aria-pressed="pinned"
          aria-label="Pin the drawer open"
          data-test="warehouse-pin"
          @click="pinned = !pinned"
        >
          PIN
        </button>
        <button
          type="button"
          class="close"
          aria-label="Close"
          data-test="warehouse-close"
          @click="ui.closeWarehouse()"
        >
          &times;
        </button>
      </header>

      <p class="count" data-test="warehouse-visible-count">{{ countLabel }} on hand</p>

      <p v-if="benchMachineNote" class="bench-machine-note" data-test="bench-machine-note">
        {{ benchMachineNote }}
      </p>

      <div v-if="!fit" class="controls">
        <input
          v-model="query"
          type="search"
          class="search"
          placeholder="Search the list"
          data-test="warehouse-search"
        />
        <div class="control-row">
          <select v-model="sectionFilter" class="picker" data-test="warehouse-section">
            <option value="all">All sections</option>
            <option v-for="[id, label] in sectionOptions" :key="id" :value="id">
              {{ label }}
            </option>
          </select>
          <select v-model="sortKey" class="picker" data-test="warehouse-sort">
            <option value="newest">Newest first</option>
            <option value="slot">By slot</option>
            <option value="condition">By condition</option>
            <option value="name">By name</option>
          </select>
        </div>
        <div class="control-row">
          <select v-model="vehicleFilter" class="picker" data-test="warehouse-vehicle">
            <option value="">fits this vehicle...</option>
            <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
          <select v-model="ownershipFilter" class="picker" data-test="warehouse-ownership">
            <option value="all">All parts</option>
            <option value="mine">My parts</option>
            <option value="customer">Customer parts</option>
          </select>
        </div>
        <div class="control-row">
          <select v-model="conditionFilter" class="picker" data-test="warehouse-condition">
            <option value="all">Any condition</option>
            <option v-for="band in CONDITION_OPTIONS" :key="band" :value="band">
              {{ band }}
            </option>
          </select>
        </div>
      </div>

      <p v-if="entries.length === 0" class="empty" data-test="warehouse-empty">
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
          @select="onSelect"
        />
      </ul>
    </aside>
  </div>

  <!-- Stands in for the tucked-away tab while a drag/pick session is live -
       the one moment the tab itself is off-screen and unreachable. Only ever
       highlights (and only ever does anything on drop) for a station-held
       part; a warehouse-origin drag simply finds it inert. -->
  <div
    v-if="tucked"
    class="drop-rail"
    :class="{ 'active-target': stationDropZone.isActiveTarget.value }"
    data-test="warehouse-drop-rail"
    @pointerup="stationDropZone.onPointerUp"
    @pointerenter="stationDropZone.onPointerEnter"
    @pointerleave="stationDropZone.onPointerLeave"
    @click="stationDropZone.onClick"
  >
    <span class="drop-rail-label">Warehouse</span>
  </div>
</template>

<style scoped>
/* The whole element slides as one: drawer open at the right edge, closed
   with only the tab showing, or tucked fully away while a drag is live so
   the drop targets underneath are reachable. It sits BETWEEN the other
   floating elements, never over them: the top bound clears the day/cash box
   (top-right), the bottom bound clears the labour gauge and End Day cluster
   (bottom-right, the same 13rem `main.with-end-day` reserves). */
.warehouse {
  position: fixed;
  top: 120px;
  right: 0;
  bottom: 13rem;
  width: min(560px, 92vw);
  z-index: 105;
  pointer-events: none;
  transition: transform 0.18s ease;
}

.warehouse.closed {
  transform: translateX(100%);
}

.warehouse.tucked {
  transform: translateX(calc(100% + 56px));
}

/* The tab riding the drawer's left edge - the one place on the UI the
   warehouse is reached from. Horizontal container, vertical label: mixing
   writing modes on the button itself clipped the word. */
.tab {
  pointer-events: auto;
  position: absolute;
  left: -44px;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  color: var(--mg-neon-cyan);
  border: var(--mg-border);
  border-right: none;
  border-radius: var(--mg-radius) 0 0 var(--mg-radius);
  padding: var(--mg-space-3) 0;
  font: inherit;
  font-size: var(--mg-fs-sm);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.tab-label {
  writing-mode: vertical-rl;
  white-space: nowrap;
}

.tab-count {
  background: var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  color: var(--mg-text);
  padding: 1px 6px;
  letter-spacing: 0;
}

/* Stands where the tab sits, since the tab itself is off-screen with the
   rest of `.warehouse` for the whole time this is up - same geometry, own
   fixed position rather than living inside the transformed element. Cyan
   tint on a valid target mirrors every other drop zone in the garage. */
.drop-rail {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 106;
  transform: translateY(-50%);
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mg-panel);
  color: var(--mg-neon-cyan);
  border: var(--mg-border);
  border-right: none;
  border-radius: var(--mg-radius) 0 0 var(--mg-radius);
  padding: var(--mg-space-3) 0;
  font-size: var(--mg-fs-sm);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition:
    border-color 0.12s ease,
    background-color 0.12s ease;
}

.drop-rail.active-target {
  border-color: var(--mg-neon-cyan);
  background: rgba(47, 214, 191, 0.12);
}

.drop-rail-label {
  writing-mode: vertical-rl;
  white-space: nowrap;
}

/* Plain functional panel for now - the clipboard dressing waits for the art
   pass. */
.board {
  pointer-events: auto;
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-left: 2px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius) 0 0 var(--mg-radius);
  padding: var(--mg-space-4);
  overflow-y: auto;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
}

/* Pinned open during a drag, the board itself stands in for the tucked-away
   drop rail - same cyan-tint highlight every other drop target uses. */
.board.active-target {
  border-color: var(--mg-neon-cyan);
}

.board-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-3);
  padding: var(--mg-space-2) 0 var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
  border-bottom: 2px solid var(--mg-panel-edge);
}

.board-head h3 {
  display: flex;
  align-items: center;
  margin: 0;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  text-transform: capitalize;
}

.pin,
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
  line-height: 1;
  cursor: pointer;
}

.close {
  font-size: var(--mg-fs-lg);
}

.pin {
  font-size: 0.55rem;
  letter-spacing: 0.04em;
}

.close:hover {
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}

.pin:hover {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

/* Pinned: the drawer stays open through a drag rather than tucking away -
   the same cyan "on" treatment every other toggle in the shop uses. */
.pin.on {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  background: rgba(47, 214, 191, 0.12);
}

.count {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 var(--mg-space-3);
}

.bench-machine-note {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-3);
}

.controls {
  display: grid;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-3);
}

.control-row {
  display: flex;
  gap: var(--mg-space-2);
}

.search,
.picker {
  width: 100%;
  background: var(--mg-night);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  font: inherit;
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0;
}

.empty a {
  color: var(--mg-neon-violet);
}

.parts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
  align-content: start;
}
</style>
