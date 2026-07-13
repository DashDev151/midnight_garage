<script setup lang="ts">
import type { CarPartId, ComponentId, ConditionBand, StagedAction } from '@midnight-garage/content'
import { ALL_CAR_PART_IDS } from '@midnight-garage/content'
import { bandIndex } from '@midnight-garage/sim'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import BandPicker from '../components/BandPicker.vue'
import EndDayButton from '../components/EndDayButton.vue'
import HelpHint from '../components/HelpHint.vue'
import ReplaceDrawer from '../components/ReplaceDrawer.vue'
import StatRadar from '../components/StatRadar.vue'
import {
  clearDragSession,
  useDragSession,
  useDropZone,
  type DropZoneHandle,
} from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { addressesOverlap } from '../utils/partAddress'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const carId = computed(() => String(route.params.id))
const detail = computed(() => game.carDetail(carId.value))

/**
 * True while this car is an accepted service job's customer car that hasn't
 * arrived yet (Sprint 25 task 2) - nothing to inspect, stage, or sell until
 * it shows up, so the whole interactive body below is replaced by a single
 * "arriving tomorrow" banner. Reads the store's own `inTransit` view field
 * (Sprint 40, `isServiceJobInTransit` under the hood) rather than a local
 * `arrivesOnDay != null` re-derivation - the same check the sim's own
 * completion guard and the job board use, not a second copy of it.
 */
const inTransit = computed(() => detail.value?.serviceJob?.inTransit ?? false)

// A sold or unknown car has no detail - send the player back to the garage.
watch(
  detail,
  (d) => {
    if (!d) void router.replace({ name: 'garage' })
  },
  { immediate: true },
)

const COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/**
 * Sprint 41 decision 4 (condition-panel readability): the 6 groups,
 * worst-band-first - `Array.prototype.sort` is stable, so groups tied on
 * worst band keep `COMPONENTS`' own order as a secondary sort. Falls back to
 * the plain declared order before a car is loaded.
 */
const orderedComponents = computed<readonly ComponentId[]>(() => {
  const d = detail.value
  if (!d) return COMPONENTS
  return [...COMPONENTS].sort((a, b) => bandIndex(d.groupBands[a]) - bandIndex(d.groupBands[b]))
})

// --- Sprint 28: drill-down (group rows expand to their real part rows) --

const expandedGroups = reactive(new Set<ComponentId>())

function toggleExpanded(componentId: ComponentId): void {
  if (expandedGroups.has(componentId)) expandedGroups.delete(componentId)
  else expandedGroups.add(componentId)
}

/** Every real part row within a group, for the drill-down. */
function rowsFor(componentId: ComponentId) {
  return detail.value ? game.partsInGroup(detail.value.car.id, componentId) : []
}

// --- Sprint 41 decision 4: fine/mint parts collapse behind a "+N parts in
// good order" toggle per group, so the drill-down leads with what actually
// needs attention. -----------------------------------------------------

const expandedGoodOrder = reactive(new Set<ComponentId>())

function toggleGoodOrder(componentId: ComponentId): void {
  if (expandedGoodOrder.has(componentId)) expandedGoodOrder.delete(componentId)
  else expandedGoodOrder.add(componentId)
}

/** A row that needs no attention right now - present and already fine/mint.
 * Missing, legitimately-absent, scrap, poor, and worn rows all stay always
 * visible (there's a real decision or defect to see there); only "this part
 * is basically fine" collapses. */
function isGoodOrderRow(row: ReturnType<typeof rowsFor>[number]): boolean {
  return row.band === 'fine' || row.band === 'mint'
}

/** Every row in `componentId` currently worth collapsing behind the toggle. */
function goodOrderRowsFor(componentId: ComponentId) {
  return rowsFor(componentId).filter(isGoodOrderRow)
}

/** The rows actually rendered for `componentId`'s drill-down right now:
 * every attention-needed row always, plus the good-order rows too once the
 * group's own toggle has been opened. */
function visibleRowsFor(componentId: ComponentId) {
  if (expandedGoodOrder.has(componentId)) return rowsFor(componentId)
  return rowsFor(componentId).filter((row) => !isGoodOrderRow(row))
}

/**
 * The group's own "Repair all to…" convenience (decision 1) DEFAULTS to
 * `fine`, not `mint` - a cheap, blanket "get it decent" pass; a specific
 * part worth pushing all the way to mint is what the per-part row below is
 * for. Sprint 40: the player can now pick any valid band via the group's
 * own `BandPicker` - this is only the picker's starting selection, not a
 * hard target anymore. Shown only when something in the group is actually
 * below `fine` (scrap is structurally excluded - decision 1's "skipping any
 * scrap part it can't touch" - and an unfitted slot has nothing to repair,
 * only fit).
 */
const DEFAULT_GROUP_REPAIR_TARGET_BAND: ConditionBand = 'fine'
/** Sprint 40: the per-part repair picker's own default - unlike the group
 * convenience above, a single part's repair has always defaulted to mint. */
const DEFAULT_PART_REPAIR_TARGET_BAND: ConditionBand = 'mint'

/** Sprint 40: the band pickers' own selections, one map per granularity -
 * unset until the player actually picks something, in which case the
 * default above still applies (mirrors `expandedGroups`' reactive-Set
 * pattern just above: read/written directly from the template). */
const groupTargetBand = reactive(new Map<ComponentId, ConditionBand>())
const partTargetBand = reactive(new Map<CarPartId, ConditionBand>())

function groupTargetBandFor(componentId: ComponentId): ConditionBand {
  return groupTargetBand.get(componentId) ?? DEFAULT_GROUP_REPAIR_TARGET_BAND
}

function partTargetBandFor(carPartId: CarPartId): ConditionBand {
  return partTargetBand.get(carPartId) ?? DEFAULT_PART_REPAIR_TARGET_BAND
}

function selectGroupTargetBand(componentId: ComponentId, band: ConditionBand): void {
  groupTargetBand.set(componentId, band)
}

function selectPartTargetBand(carPartId: CarPartId, band: ConditionBand): void {
  partTargetBand.set(carPartId, band)
}

/**
 * Sprint 41 coordinator fix: the group repair control's OWN floor - the
 * worst REPAIRABLE band in the group, never scrap or a non-repairable
 * consumable (`worstRepairableBandInGroup`, bands.ts). Distinct from
 * `detail.groupBands[componentId]` (the display chip, which correctly
 * includes scrap/non-repairable parts in the group's worst reported
 * condition) - feeding THAT into the BandPicker let a group with a scrap
 * part next to a merely-worn one offer `poor` as a dead repair target.
 */
function groupRepairFloorBandFor(componentId: ComponentId): ConditionBand | null {
  return detail.value ? game.groupRepairFloorBand(detail.value.car.id, componentId) : null
}

/** Template-safe non-null variant - only ever bound where `groupNeedsRepair`
 * has already guaranteed a real floor exists ('poor' or 'worn'); the 'mint'
 * fallback is unreachable there, just a type-safe default instead of a
 * template-side non-null assertion (`vue-eslint-parser` doesn't parse `!`
 * inside a template expression). */
function groupRepairFloorBandOrMint(componentId: ComponentId): ConditionBand {
  return groupRepairFloorBandFor(componentId) ?? 'mint'
}

/** Whether the group's own "Repair all…" convenience should show at all -
 * only when the worst REPAIRABLE part is poor or worn (unchanged threshold
 * from before Sprint 41; `fine` stays a per-part-only repair, same as ever -
 * the per-part row below still offers it). */
function groupNeedsRepair(componentId: ComponentId): boolean {
  const floor = groupRepairFloorBandFor(componentId)
  return floor === 'poor' || floor === 'worn'
}

/** The open job at this exact address - group-level when `carPartId` is
 * omitted, per-part otherwise (Sprint 28). Either kind, either busy. */
function jobFor(componentId: ComponentId, carPartId?: CarPartId) {
  return detail.value?.jobs.find((j) => j.componentId === componentId && j.carPartId === carPartId)
}

/** True while a job overlapping this address is open - a group-level job
 * counts as busy for every part inside it, and vice versa (mirrors
 * `stageAction`'s own busy gate, gameStore.ts). */
function addressBusy(componentId: ComponentId, carPartId?: CarPartId): boolean {
  return detail.value?.jobs.some((j) => addressesOverlap(j, { componentId, carPartId })) ?? false
}

function componentBusy(componentId: ComponentId): boolean {
  return jobFor(componentId) !== undefined
}

/**
 * Continue whichever kind of job is actually open on this address (either
 * kind, either busy) - Sprint 18 exposes a case the old always-instant
 * install flow never could: an install job (usually a single-slot job that
 * completes the moment Confirm reaches it) can now be left open if Confirm
 * ran out of labor before reaching it in the staged list. Calling
 * `game.repair(...)`/`game.install(...)` unconditionally here would silently
 * create an unrelated *second* job instead of continuing this one; the
 * `targetBand`/`carPartId` arguments passed through are only ever consulted
 * if no job already exists, so they're inert here - this always continues
 * whatever `jobFor` already found.
 */
function continueJob(componentId: ComponentId, carPartId?: CarPartId): void {
  const d = detail.value
  const job = jobFor(componentId, carPartId)
  if (!d || !job) return
  if (job.kind === 'repair-zone') game.repair(d.car.id, componentId, 'mint', carPartId)
  else if (job.partInstanceId) game.install(d.car.id, componentId, job.partInstanceId, carPartId)
}

/**
 * Resolve a customer job immediately (paid if the work's done, forfeited with a
 * reputation hit if not). The car then leaves the shop, so the detail computed
 * goes undefined and the watcher above returns us to the garage.
 */
function onCompleteJob(jobId: string): void {
  game.completeServiceJob(jobId)
}

/** Move this car between parking and the service bay - instant, free. */
function toggleBay(): void {
  const d = detail.value
  if (!d) return
  game.moveCar(d.car.id, d.inServiceBay ? 'parking' : 'service')
}

// --- Sprint 31: the for-sale toggle + live offer card, replacing the old
// walk-in/list-publicly buttons -----------------------------------------

const estimate = computed(() => game.estimatedSaleValue(carId.value))
const forSale = computed(() => game.isForSale(carId.value))
const offer = computed(() => game.offerFor(carId.value))

function toggleForSale(): void {
  const d = detail.value
  if (!d) return
  game.setForSale(d.car.id, !forSale.value)
}

// --- Sprint 18 (round 2 - real playtest fix); retargeted to per-part rows
// in Sprint 28 --------------------------------------------------------
// Every non-busy part row shows up to two controls: Repair (a toggle) and
// Replace. Replace opens a scoped side drawer (ReplaceDrawer) right here on
// this screen - not a separate route - so a part is always dragged from
// somewhere visibly on the same page as its target, or just clicked
// directly in the drawer to stage it instantly. Continuing an already-open
// job (componentBusy/addressBusy above) is untouched: that keeps the
// existing single-click flow, never routed through staging (decision 4).

function stagedFor(componentId: ComponentId, carPartId?: CarPartId): StagedAction | undefined {
  return detail.value?.stagedActions.find(
    (a) => a.componentId === componentId && a.carPartId === carPartId,
  )
}

function isStagedRepair(componentId: ComponentId, carPartId?: CarPartId): boolean {
  return stagedFor(componentId, carPartId)?.kind === 'repair'
}

function partInstanceDisplayName(partInstanceId: string): string {
  const pi = game.gameState.partInventory.find((p) => p.id === partInstanceId)
  return pi ? game.partName(pi.partId) : partInstanceId
}

/** Display name of the part staged for install at this address, if any. */
function stagedInstallName(componentId: ComponentId, carPartId?: CarPartId): string | undefined {
  const staged = stagedFor(componentId, carPartId)
  return staged?.kind === 'install' ? partInstanceDisplayName(staged.partInstanceId) : undefined
}

/** The group's own "Repair all to…" convenience toggle - targets whatever
 * band its own `BandPicker` currently has selected (Sprint 40; defaults to
 * `fine`, unchanged from before the picker existed). */
function toggleGroupRepairStage(componentId: ComponentId): void {
  const d = detail.value
  if (!d) return
  if (isStagedRepair(componentId)) game.unstageAction(d.car.id, componentId)
  else {
    game.stageAction(d.car.id, {
      kind: 'repair',
      componentId,
      targetBand: groupTargetBandFor(componentId),
    })
  }
}

/** One part row's own "Repair to…" toggle - targets whatever band its own
 * `BandPicker` currently has selected (Sprint 40; defaults to `mint`,
 * unchanged from before the picker existed). */
function togglePartRepairStage(componentId: ComponentId, carPartId: CarPartId): void {
  const d = detail.value
  if (!d) return
  if (isStagedRepair(componentId, carPartId)) game.unstageAction(d.car.id, componentId, carPartId)
  else {
    game.stageAction(d.car.id, {
      kind: 'repair',
      componentId,
      targetBand: partTargetBandFor(carPartId),
      carPartId,
    })
  }
}

/** Which part's Replace drawer is open right now, if any - only one at a time. */
const activeReplacePart = ref<CarPartId | null>(null)

const dragSession = useDragSession()

/**
 * Whether `partInstanceId` can land on this exact part slot right now.
 * Gated on the drawer actually being open *for this part* - a live drag can
 * only ever originate from a part card rendered inside that open drawer, so
 * no other row is ever a real drop target regardless of fit.
 */
function acceptsInstall(carPartId: CarPartId, partInstanceId: string): boolean {
  const d = detail.value
  if (!d) return false
  if (activeReplacePart.value !== carPartId) return false
  const componentId = game.groupForCarPart(carPartId)
  if (!componentId || addressBusy(componentId, carPartId)) return false
  if (game.isPartStagedAnywhere(partInstanceId)) return false
  return game.installablePartsForPart(d.car.id, carPartId).some((p) => p.id === partInstanceId)
}

/** One drop zone per real part (all 29, built once so each keeps its own
 * persistent pointer-tracking state - the same reasoning Sprint 17's
 * ShopSlot.vue was built for, and Sprint 18's original 6-per-group version
 * of this screen used). */
const dropZones = Object.fromEntries(
  ALL_CAR_PART_IDS.map((carPartId) => [
    carPartId,
    useDropZone<string>(
      (partInstanceId) => acceptsInstall(carPartId, partInstanceId),
      (partInstanceId) => {
        const d = detail.value
        const componentId = game.groupForCarPart(carPartId)
        if (d && componentId) {
          game.stageAction(d.car.id, { kind: 'install', componentId, carPartId, partInstanceId })
        }
        activeReplacePart.value = null
      },
    ),
  ]),
) as Record<CarPartId, DropZoneHandle>

/**
 * Clicking "Replace": if a part is currently *picked* (the click-based
 * accessibility fallback - possibly picked from a different row's drawer,
 * or even before this one was ever opened) AND it actually fits this part
 * slot, complete that placement immediately, matching the same
 * `accepts`/`onDrop` a live drag uses. Otherwise, open (or close, on a
 * repeat click of the same row) this part's drawer - including when a pick
 * is active but doesn't fit here (Sprint 24 fix 1): the pick stays alive,
 * since the user may have meant a different row, rather than silently doing
 * nothing.
 */
function onReplaceClick(carPartId: CarPartId): void {
  const picked = dragSession.value
  const payload = picked?.mode === 'pick' ? picked.payload : null
  if (typeof payload === 'string' && acceptsInstall(carPartId, payload)) {
    dropZones[carPartId].onClick()
    return
  }
  activeReplacePart.value = activeReplacePart.value === carPartId ? null : carPartId
}

/**
 * Pull whatever's occupying this slot into inventory (Sprint 32 decision
 * 7) - free and instant, no staging step. Removing an aftermarket part
 * reverts the slot to a fresh stock part; removing a stock part leaves the
 * slot genuinely empty (missing).
 */
function onRemoveClick(carPartId: CarPartId): void {
  const d = detail.value
  if (!d) return
  game.removePart(d.car.id, carPartId)
}

/** Confirm - locks in every staged action on this car at once (Sprint 18). */
function onConfirm(): void {
  const d = detail.value
  if (d) game.confirmCarWork(d.car.id)
}

/** A stable per-address key for `v-for`/`data-test`, since more than one
 * staged action can now share a `componentId` (Sprint 28 per-part). */
function addressKeyFor(action: { componentId: ComponentId; carPartId?: CarPartId }): string {
  return action.carPartId ? `${action.componentId}:${action.carPartId}` : action.componentId
}

/** Human-readable summary line for one staged action, group- or part-addressed alike. */
function stagedActionLabel(action: StagedAction): string {
  const targetLabel = action.carPartId
    ? game.carPartLabel(action.carPartId)
    : game.componentLabel(action.componentId)
  return action.kind === 'repair'
    ? `Repair ${targetLabel} to ${action.targetBand}`
    : `Install ${partInstanceDisplayName(action.partInstanceId)} → ${targetLabel}`
}

// The ghost preview that follows the pointer while dragging a part.
const draggedPartName = computed(() => {
  const payload = dragSession.value?.payload
  if (typeof payload !== 'string' || !payload) return null
  const pi = game.gameState.partInventory.find((p) => p.id === payload)
  return pi ? game.partName(pi.partId) : null
})

/**
 * Sprint 24 fix 1: the accessibility-fallback counterpart to the drag ghost
 * above - a picked part (via `togglePick`, no pointer drag involved) is
 * otherwise invisible outside the drawer it was picked from, so a player who
 * navigates within the screen or just forgets what they picked has no way
 * to tell a pick is still live. Shown whenever a pick is active, anywhere on
 * this screen - not gated to the currently-open drawer, since the whole
 * point of "pick, then click a different Replace slot" is picking from one
 * row and completing on another.
 */
const pickedPartName = computed(() => {
  const s = dragSession.value
  if (s?.mode !== 'pick' || typeof s.payload !== 'string') return null
  const pi = game.gameState.partInventory.find((p) => p.id === s.payload)
  return pi ? game.partName(pi.partId) : null
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && dragSession.value?.mode === 'pick') clearDragSession()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section v-if="detail" class="detail">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>

    <header class="head">
      <h2>{{ detail.displayName }}</h2>
      <p class="sub">
        {{ detail.model.tier }} · {{ detail.car.year }} ·
        {{ detail.car.mileageKm.toLocaleString() }} km ·
        {{ detail.car.color }}
      </p>
      <p v-if="detail.car.provenanceNote" class="prov">"{{ detail.car.provenanceNote }}"</p>
    </header>

    <section v-if="inTransit" class="arriving-banner" data-test="arriving-banner">
      <h3>Customer job - {{ detail.serviceJob?.customerName }}</h3>
      <p class="svc-desc">"{{ detail.serviceJob?.description }}"</p>
      <p class="arriving-note">Arriving tomorrow - nothing to do until it's dropped off.</p>
      <EndDayButton show-cash />
    </section>

    <template v-else>
      <div class="bay-status">
        <span class="bay-loc" :class="{ inBay: detail.inServiceBay }">
          {{ detail.inServiceBay ? 'In the service bay' : 'Parked' }}
        </span>
        <span v-if="!detail.inServiceBay" class="bay-hint">no work progresses until moved in</span>
        <button
          :disabled="!detail.inServiceBay && game.serviceBayFreeCount <= 0"
          data-test="toggle-bay"
          @click="toggleBay"
        >
          {{ detail.inServiceBay ? 'Move to parking' : 'Move to service bay' }}
        </button>
      </div>

      <section v-if="detail.serviceJob" class="service-banner">
        <h3>Customer job - {{ detail.serviceJob.customerName }}</h3>
        <p class="svc-desc">"{{ detail.serviceJob.description }}"</p>
        <ul class="svc-tasks">
          <li v-for="(task, i) in detail.serviceJob.tasks" :key="i" :class="{ done: task.done }">
            {{ task.label }}
          </li>
        </ul>
        <p class="svc-req">
          Pays {{ formatYen(detail.serviceJob.payoutYen) }} · +{{
            detail.serviceJob.baseReputation
          }}
          rep base
        </p>
        <p
          v-if="detail.serviceJob.daysLeft !== null"
          class="svc-deadline"
          :class="{ urgent: detail.serviceJob.daysLeft <= 2 }"
        >
          {{
            detail.serviceJob.daysLeft <= 0
              ? 'Due today - hand it back or it fails on End Day.'
              : detail.serviceJob.daysLeft + ' day(s) left to finish and hand back.'
          }}
        </p>
        <div class="complete-row">
          <span class="svc-status" :class="{ done: detail.serviceJob.workDone }">
            {{
              detail.serviceJob.workDone
                ? 'Work done - hand it back to get paid now.'
                : 'Work unfinished - completing now forfeits the job (−' +
                  detail.serviceJob.failureReputationPenalty +
                  ' rep).'
            }}
          </span>
          <button
            class="primary"
            :class="{ danger: !detail.serviceJob.workDone }"
            data-test="complete-service-job"
            @click="onCompleteJob(detail.serviceJob.id)"
          >
            {{ detail.serviceJob.workDone ? 'Complete Job' : 'Give Up Job' }}
          </button>
        </div>
      </section>

      <div class="cols">
        <div class="radar-col">
          <StatRadar :stats="detail.stats" />
        </div>

        <div class="components-col">
          <h3>
            Components
            <HelpHint label="Components">
              Worst-off groups lead. Expand a group to repair or replace its real parts one at a
              time, or use a group's own "Repair all" convenience - pick how far to take it with the
              band buttons. Parts already in good order collapse behind their own toggle. Nothing
              happens until you Confirm.
            </HelpHint>
          </h3>
          <ul class="components">
            <li v-for="componentId in orderedComponents" :key="componentId" class="component-row">
              <div class="meter-line">
                <span class="component-name" :title="game.componentLabel(componentId)">{{
                  game.componentLabel(componentId)
                }}</span>
                <BandChip :band="detail.groupBands[componentId]" />
                <span class="group-bill" :data-test="'group-bill-' + componentId">{{
                  formatYen(detail.groupBillYen[componentId])
                }}</span>
                <button
                  type="button"
                  class="expand-toggle"
                  :data-test="'expand-' + componentId"
                  @click="toggleExpanded(componentId)"
                >
                  {{
                    expandedGroups.has(componentId)
                      ? 'Hide parts'
                      : 'Show parts (' + rowsFor(componentId).length + ')'
                  }}
                </button>
              </div>

              <div class="action-line">
                <template v-if="componentBusy(componentId)">
                  <button
                    :disabled="game.laborSlotsRemainingToday <= 0"
                    :data-test="'repair-' + componentId"
                    @click="continueJob(componentId)"
                  >
                    {{
                      jobFor(componentId)?.kind === 'repair-zone'
                        ? 'Continue repair'
                        : 'Continue install'
                    }}
                  </button>
                  <span class="slot-empty">working…</span>
                </template>

                <template v-else>
                  <template v-if="groupNeedsRepair(componentId)">
                    <BandPicker
                      v-if="!isStagedRepair(componentId)"
                      :current-band="groupRepairFloorBandOrMint(componentId)"
                      :selected="groupTargetBandFor(componentId)"
                      :test-id-prefix="'band-group-' + componentId"
                      @select="selectGroupTargetBand(componentId, $event)"
                    />
                    <button
                      :data-test="'stage-repair-' + componentId"
                      @click="toggleGroupRepairStage(componentId)"
                    >
                      {{
                        isStagedRepair(componentId)
                          ? 'Unstage repair'
                          : 'Repair all to ' + groupTargetBandFor(componentId)
                      }}
                    </button>
                  </template>

                  <template v-if="stagedInstallName(componentId)">
                    <span class="staged-install">staged: {{ stagedInstallName(componentId) }}</span>
                    <button
                      type="button"
                      :data-test="'unstage-' + componentId"
                      @click="game.unstageAction(detail.car.id, componentId)"
                    >
                      unstage
                    </button>
                  </template>
                </template>
              </div>

              <ul v-if="expandedGroups.has(componentId)" class="part-sublist">
                <li
                  v-for="row in visibleRowsFor(componentId)"
                  :key="row.partId"
                  class="sub-part-row"
                >
                  <div class="meter-line sub">
                    <span class="part-name" :title="row.displayName">{{ row.displayName }}</span>
                    <BandChip :band="row.band" />
                    <span
                      v-if="row.missing"
                      class="missing-tag"
                      :data-test="'missing-' + row.partId"
                      >MISSING</span
                    >
                    <span v-else-if="row.legitimatelyAbsent" class="absent-tag">no turbo (NA)</span>
                    <span v-if="row.installedPartName" class="installed">{{
                      row.installedPartName
                    }}</span>
                  </div>

                  <div class="action-line sub">
                    <template v-if="addressBusy(componentId, row.partId)">
                      <template v-if="jobFor(componentId, row.partId)">
                        <button
                          :disabled="game.laborSlotsRemainingToday <= 0"
                          :data-test="'repair-part-' + row.partId"
                          @click="continueJob(componentId, row.partId)"
                        >
                          {{
                            jobFor(componentId, row.partId)?.kind === 'repair-zone'
                              ? 'Continue repair'
                              : 'Continue install'
                          }}
                        </button>
                        <span class="slot-empty">working…</span>
                      </template>
                      <span v-else class="slot-empty">working (group job)…</span>
                    </template>

                    <template v-else>
                      <template
                        v-if="
                          row.band && row.band !== 'mint' && row.band !== 'scrap' && row.repairable
                        "
                      >
                        <BandPicker
                          v-if="!isStagedRepair(componentId, row.partId)"
                          :current-band="row.band"
                          :selected="partTargetBandFor(row.partId)"
                          :test-id-prefix="'band-part-' + row.partId"
                          @select="selectPartTargetBand(row.partId, $event)"
                        />
                        <button
                          :data-test="'stage-repair-part-' + row.partId"
                          @click="togglePartRepairStage(componentId, row.partId)"
                        >
                          {{
                            isStagedRepair(componentId, row.partId)
                              ? 'Unstage repair'
                              : 'Repair to ' + partTargetBandFor(row.partId)
                          }}
                        </button>
                      </template>

                      <template v-if="stagedInstallName(componentId, row.partId)">
                        <span class="staged-install"
                          >staged: {{ stagedInstallName(componentId, row.partId) }}</span
                        >
                        <button
                          type="button"
                          :data-test="'unstage-part-' + row.partId"
                          @click="game.unstageAction(detail.car.id, componentId, row.partId)"
                        >
                          unstage
                        </button>
                      </template>

                      <button
                        v-if="!row.installedPartName"
                        type="button"
                        class="replace-btn"
                        :class="{ 'active-target': dropZones[row.partId].isActiveTarget.value }"
                        :data-test="'replace-part-' + row.partId"
                        @pointerup="dropZones[row.partId].onPointerUp"
                        @pointerenter="dropZones[row.partId].onPointerEnter"
                        @pointerleave="dropZones[row.partId].onPointerLeave"
                        @click="onReplaceClick(row.partId)"
                      >
                        {{ dropZones[row.partId].isActiveTarget.value ? 'Drop here' : 'Replace' }}
                      </button>

                      <button
                        v-if="row.installedPartName"
                        type="button"
                        class="remove-btn"
                        :data-test="'remove-part-' + row.partId"
                        @click="onRemoveClick(row.partId)"
                      >
                        Remove
                      </button>
                    </template>
                  </div>
                </li>

                <li v-if="goodOrderRowsFor(componentId).length > 0" class="good-order-row">
                  <button
                    type="button"
                    class="good-order-toggle"
                    :data-test="'good-order-' + componentId"
                    @click="toggleGoodOrder(componentId)"
                  >
                    {{
                      expandedGoodOrder.has(componentId)
                        ? 'Hide parts in good order'
                        : '+' + goodOrderRowsFor(componentId).length + ' parts in good order'
                    }}
                  </button>
                </li>
              </ul>
            </li>
          </ul>

          <p class="total-bill-line" data-test="total-bill">
            Total restoration bill: {{ formatYen(detail.totalBillYen) }}
          </p>

          <ReplaceDrawer
            v-if="activeReplacePart"
            :car-id="detail.car.id"
            :car-part-id="activeReplacePart"
            @close="activeReplacePart = null"
          />

          <section class="staged-panel">
            <h4>Staged work ({{ detail.stagedActions.length }})</h4>
            <p v-if="detail.stagedActions.length === 0" class="empty">
              Nothing staged yet - free to add and remove until you Confirm.
            </p>
            <ul v-else class="staged-list">
              <li
                v-for="action in detail.stagedActions"
                :key="addressKeyFor(action)"
                class="staged-row"
              >
                <span>{{ stagedActionLabel(action) }}</span>
                <button
                  type="button"
                  :data-test="'unstage-summary-' + addressKeyFor(action)"
                  @click="game.unstageAction(detail.car.id, action.componentId, action.carPartId)"
                >
                  remove
                </button>
              </li>
            </ul>
            <button
              class="primary confirm-lever"
              data-test="confirm-work"
              :disabled="detail.stagedActions.length === 0"
              @click="onConfirm"
            >
              Confirm ({{ game.laborSlotsRemainingToday }} labor left today)
            </button>
          </section>
        </div>
      </div>

      <section v-if="!detail.serviceJob" class="sell">
        <h3>Sell</h3>
        <p class="sell-est">Ballpark value: ~{{ formatYen(estimate.offerYen) }}</p>

        <div v-if="offer" class="offer-card" data-test="pending-offer">
          <p class="offer-copy">{{ offer.copy }}</p>
          <div class="offer-actions">
            <button
              class="primary"
              data-test="accept-offer"
              @click="game.acceptOffer(detail.car.id)"
            >
              Accept
            </button>
            <span class="offer-expiry">Today only</span>
          </div>
        </div>

        <div class="for-sale-toggle">
          <button data-test="toggle-for-sale" @click="toggleForSale">
            {{ forSale ? 'Stop taking offers' : 'Take offers' }}
          </button>
          <span v-if="forSale && !offer" class="for-sale-hint">
            Taking offers - a buyer may show up tomorrow.
          </span>
        </div>
      </section>

      <section class="jobs">
        <h3>Work</h3>
        <p class="labor">
          Labour: {{ game.laborSlotsRemainingToday }}/{{ game.laborSlotsPerDay }} slots left today
        </p>

        <div v-if="detail.jobs.length" class="job-group">
          <h4>In progress</h4>
          <ul>
            <li v-for="job in detail.jobs" :key="job.id">
              {{
                job.kind === 'repair-zone'
                  ? 'repair ' +
                    (job.carPartId
                      ? game.carPartLabel(job.carPartId)
                      : game.componentLabel(job.componentId))
                  : 'install part'
              }}
              ·
              {{ job.laborSlotsSpent }}/{{ job.laborSlotsRequired }} slots
            </li>
          </ul>
        </div>

        <p v-else class="empty">
          No work in progress. Stage a repair or install and Confirm to start.
        </p>

        <EndDayButton show-cash />
      </section>
    </template>

    <div
      v-if="dragSession?.mode === 'drag' && draggedPartName"
      class="drag-ghost"
      :style="{ left: dragSession.x + 'px', top: dragSession.y + 'px' }"
    >
      {{ draggedPartName }}
    </div>

    <div v-if="pickedPartName" class="pick-chip" data-test="pick-chip">
      placing: {{ pickedPartName }} - click a Replace slot, or Esc to cancel
    </div>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 0;
}

h3 {
  display: flex;
  align-items: center;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

h4 {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-2) 0 var(--mg-space-1);
}

.sub,
.prov {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0;
}

.bay-status {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  margin: var(--mg-space-2) 0;
}

.bay-loc {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.bay-loc.inBay {
  color: var(--mg-success);
}

.bay-hint {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.bay-status button {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
}

.service-banner,
.arriving-banner {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin: var(--mg-space-4) 0;
}

.arriving-note {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0 var(--mg-space-3);
}

.svc-desc {
  margin: var(--mg-space-1) 0;
}

/* One line per service-job task (Sprint 29 - a job's work is a themed list
   now, not a single required-work label). */
.svc-tasks {
  list-style: none;
  margin: var(--mg-space-1) 0;
  padding: 0;
  display: grid;
  gap: 2px;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.svc-tasks li.done {
  color: var(--mg-success);
}

.svc-req {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0 var(--mg-space-2);
}

.complete-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.svc-status {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.svc-status.done {
  color: var(--mg-success);
}

.svc-deadline {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0 var(--mg-space-2);
}

.svc-deadline.urgent {
  color: var(--mg-neon-pink);
}

button.primary.danger {
  background: var(--mg-panel);
  color: var(--mg-neon-pink);
  border-color: var(--mg-neon-pink);
}

.cols {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 2fr;
  gap: var(--mg-space-4);
  margin: var(--mg-space-4) 0;
}

.components {
  list-style: none;
  padding: 0;
  margin: 0;
}

.component-row {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  margin-bottom: var(--mg-space-2);
  padding-bottom: var(--mg-space-2);
  border-bottom: var(--mg-border);
}

/* Name, the group's headline band chip, and the drill-down toggle stay on
   one crisp line. */
.meter-line {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

/* Widened from the pre-Sprint-25 96px (sized for a short raw id like
   "brakes") to fit the longest real display name, "Forced Induction",
   without wrapping. Truncates with an ellipsis (title attribute carries the
   full name) rather than wrapping. */
.component-name {
  width: 140px;
  flex-shrink: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--mg-fs-sm);
}

.group-bill {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  white-space: nowrap;
}

.expand-toggle {
  margin-left: auto;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.good-order-row {
  padding: var(--mg-space-1) 0;
}

.good-order-toggle {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

.total-bill-line {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  font-weight: bold;
  margin: var(--mg-space-2) 0 0;
}

/* Buttons, hints, and installed/staged status - free to wrap onto as many
   lines as they need without ever disturbing the meter line above. Indented
   to sit under the bar rather than the name, so it reads as detail on the
   meter, not a second, unrelated row. */
.action-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  padding-left: calc(140px + var(--mg-space-2));
  font-size: var(--mg-fs-sm);
}

/* Per-part drill-down (Sprint 28) - one indent level deeper than the group's
   own meter/action lines, the same `.meter-line`/`.action-line` pattern
   just narrower (the sub-part name column is shorter than the group's). */
.part-sublist {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-1) 0 0 calc(140px + var(--mg-space-2));
  display: grid;
  gap: var(--mg-space-2);
}

.sub-part-row {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  padding: var(--mg-space-1) 0;
  border-top: var(--mg-border);
}

.meter-line.sub {
  gap: var(--mg-space-2);
}

.part-name {
  width: 120px;
  flex-shrink: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.action-line.sub {
  padding-left: calc(120px + var(--mg-space-2));
}

.replace-btn.active-target {
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
}

.staged-install {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
}

.sell {
  margin: var(--mg-space-4) 0;
}

.sell-est {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.offer-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-cyan);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  margin-top: var(--mg-space-2);
}

.offer-copy {
  margin: 0;
  font-size: var(--mg-fs-sm);
}

.offer-actions {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.offer-expiry {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.for-sale-toggle {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  margin-top: var(--mg-space-2);
}

.for-sale-hint {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.slot-empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.installed {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
}

/* A genuinely missing slot (Sprint 32 decision 3) - a real defect, styled
   with the same urgency color as the pink "blocked" states elsewhere on
   this screen. */
.missing-tag {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
  font-weight: bold;
}

/* The one legitimately-empty slot (forced induction on an NA car) - dim,
   informational, deliberately NOT the missing-tag's alarm color. */
.absent-tag {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.remove-btn {
  color: var(--mg-neon-pink);
}

.staged-panel {
  margin-top: var(--mg-space-3);
  padding-top: var(--mg-space-3);
  border-top: var(--mg-border);
}

.staged-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-1);
}

.staged-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
}

.confirm-lever {
  width: 100%;
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.jobs {
  margin: var(--mg-space-4) 0;
}

.labor {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 10px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

button.primary {
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-pink);
  padding: var(--mg-space-2) var(--mg-space-4);
  font-size: var(--mg-fs-md);
  margin-top: var(--mg-space-3);
}

.drag-ghost {
  position: fixed;
  pointer-events: none;
  transform: translate(12px, -50%) rotate(-2deg);
  z-index: 1000;
  background: var(--mg-neon-cyan);
  color: var(--mg-night-deep);
  border: 2px solid var(--mg-night-deep);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-size: var(--mg-fs-md);
  font-weight: bold;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
}

.pick-chip {
  position: fixed;
  left: 50%;
  bottom: var(--mg-space-3);
  transform: translateX(-50%);
  z-index: 1000;
  background: var(--mg-neon-cyan);
  color: var(--mg-night-deep);
  border: 2px solid var(--mg-night-deep);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-size: var(--mg-fs-sm);
  font-weight: bold;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
}
</style>
