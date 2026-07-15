<script setup lang="ts">
import type { CarPartId, ComponentId, ConditionBand, StagedAction } from '@midnight-garage/content'
import { ALL_CAR_PART_IDS } from '@midnight-garage/content'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import HelpHint from '../components/HelpHint.vue'
import ReplaceDrawer from '../components/ReplaceDrawer.vue'
import ServiceTaskList from '../components/ServiceTaskList.vue'
import StatRadar from '../components/StatRadar.vue'
import {
  clearDragSession,
  useDragSession,
  useDropZone,
  type DropZoneHandle,
} from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import { addressesOverlap } from '../utils/partAddress'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const carId = computed(() => String(route.params.id))
const detail = computed(() => game.carDetail(carId.value))

/** Sprint 63: whether the planned work needs more labour than is left today -
 * a caption warning, never a block (queued work already spans days). */
const plannedLaborOverToday = computed(
  () => (detail.value?.plannedEstimate?.plannedLaborSlots ?? 0) > game.laborSlotsRemainingToday,
)

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
 * Sprint 67 decision 4 (playtest item 16): ONE constant order - engine,
 * drivetrain, suspension, wheels, body, interior - the same on every car,
 * forever.
 *
 * This explicitly RETIRES Sprint 41 decision 4, which sorted worst-band-first
 * for "condition-panel readability". That rationale was real but loses to
 * muscle memory: a panel that reorders itself as you repair it is a panel you
 * have to re-read every time. The maintainer's instruction is the decision;
 * the reversal is recorded in `sprint67.md`.
 */
const orderedComponents: readonly ComponentId[] = COMPONENTS

// --- Sprint 28: drill-down (group rows expand to their real part rows) --

const expandedGroups = reactive(new Set<ComponentId>())

function toggleExpanded(componentId: ComponentId): void {
  if (expandedGroups.has(componentId)) expandedGroups.delete(componentId)
  else expandedGroups.add(componentId)
}

/** Sprint 67 decision 3 (playtest item 9): bulk drill-down controls. */
function expandAllGroups(): void {
  for (const componentId of COMPONENTS) expandedGroups.add(componentId)
}

function collapseAllGroups(): void {
  expandedGroups.clear()
}

/** Every real part row within a group, for the drill-down. */
function rowsFor(componentId: ComponentId) {
  return detail.value ? game.partsInGroup(detail.value.car.id, componentId) : []
}

// --- Sprint 48 decision 1: one global condition filter replaces the old
// per-group "+N parts in good order" toggle - a single dropdown governs
// every group's drill-down at once. -------------------------------------

/**
 * Sprint 67 decision 2 (playtest items 18 + 10): `absent` is a real category,
 * not a null. It has no checkbox of its own - it is simply not in the default
 * `visibleConditions`, so a legitimately-absent slot (forced induction on an
 * NA car) hides by default and `Show all` reveals it.
 */
const CONDITION_FILTER_OPTIONS = ['mint', 'fine', 'worn', 'poor', 'scrap', 'missing'] as const
type ConditionFilterOption = (typeof CONDITION_FILTER_OPTIONS)[number] | 'absent'
/** Every category the filter can hold, including the checkbox-less `absent`. */
const ALL_FILTER_CATEGORIES: readonly ConditionFilterOption[] = [
  ...CONDITION_FILTER_OPTIONS,
  'absent',
]

/** Default preserves the old de-noised view: worn/poor/scrap/missing shown,
 * fine/mint hidden. */
const visibleConditions = reactive(
  new Set<ConditionFilterOption>(['worn', 'poor', 'scrap', 'missing']),
)

function toggleConditionFilter(option: ConditionFilterOption): void {
  if (visibleConditions.has(option)) visibleConditions.delete(option)
  else visibleConditions.add(option)
}

/**
 * A row's filter category. Sprint 67 decision 2 (playtest items 18 + 10):
 * a legitimately-absent slot is `'absent'`, never `null`.
 *
 * The `null` it used to return made the row unfilterable and permanently
 * visible, which was BOTH bugs the maintainer reported: item 18 ("it shows
 * missing slots even if only poor is selected") and item 10 ("an empty FI slot
 * shouldn't appear under Missing"). One category closes both, and the filter's
 * contract becomes total: a row shows if and only if its category is ticked.
 */
function rowCategory(row: ReturnType<typeof rowsFor>[number]): ConditionFilterOption {
  if (row.legitimatelyAbsent) return 'absent'
  if (row.missing) return 'missing'
  // A slot with no band is an empty one; `absent` is the honest bucket for it.
  // The two guards above should already cover every real empty slot, but the
  // filter's contract is that EVERY row has a category - never a null that
  // slips past the filter, which was the whole bug.
  return row.band ?? 'absent'
}

/** The rows actually rendered for `componentId`'s drill-down right now,
 * governed by the one global filter above. */
function visibleRowsFor(componentId: ComponentId) {
  return rowsFor(componentId).filter((row) => visibleConditions.has(rowCategory(row)))
}

/** Sprint 67 decision 3 (playtest items 18 + 9): bulk filter controls.
 * `Show all` includes `absent`, which has no checkbox of its own. */
function showAllConditions(): void {
  for (const option of ALL_FILTER_CATEGORIES) visibleConditions.add(option)
}

function hideAllConditions(): void {
  visibleConditions.clear()
}

/**
 * Sprint 48 decision 2 (maintainer, 2026-07-13, superseding the BandPicker):
 * one control per repairable row/group, climbing exactly ONE band per click.
 * Sprint 63 made that control a compact `+` button with the cost as a
 * caption, priced/laboured off the real repair plan (`game.nextRepairStep`),
 * never a hardcoded one-click-one-slot assumption.
 */
function nextGroupStep(componentId: ComponentId) {
  return detail.value ? game.nextRepairStep(detail.value.car.id, componentId) : null
}

function nextPartStep(componentId: ComponentId, carPartId: CarPartId) {
  return detail.value ? game.nextRepairStep(detail.value.car.id, componentId, carPartId) : null
}

/** Template-safe non-null variants of the two functions above - only ever
 * rendered where `v-if="nextGroupStep(...)"`/`nextPartStep(...)` already
 * guards them; the fallback is unreachable, just a type-safe default
 * (`vue-eslint-parser` doesn't parse `!` inside a template expression). */
function nextGroupStepOrFallback(componentId: ComponentId) {
  return (
    nextGroupStep(componentId) ?? { targetBand: 'mint' as const, costYen: 0, laborSlotsRequired: 0 }
  )
}
function nextPartStepOrFallback(componentId: ComponentId, carPartId: CarPartId) {
  return (
    nextPartStep(componentId, carPartId) ?? {
      targetBand: 'mint' as const,
      costYen: 0,
      laborSlotsRequired: 0,
    }
  )
}

/**
 * Sprint 63: the climb-one-band control is now a compact `+` button, not a
 * sentence - this builds the accessible `title` tooltip (the full "Repair to
 * X" phrase), sourced entirely from the real plan, never a hand-derived
 * guess. British "labour" per directive 18.
 */
function repairStepLabel(
  step: { targetBand: ConditionBand; costYen: number; laborSlotsRequired: number },
  alreadyPlanned: boolean,
): string {
  const sign = alreadyPlanned ? '+' : ''
  const prefix = alreadyPlanned ? 'Repair further, to ' : 'Repair to '
  return `${prefix}${step.targetBand} - ${sign}${formatYen(step.costYen)} · ${sign}${step.laborSlotsRequired} labour`
}

/**
 * Sprint 67 decision 1 (playtest item 7): the quiet caption beside the `+`
 * button is the ROW'S OWN PLANNED TOTAL - what Confirm will actually charge
 * for this row - and null when nothing is planned here.
 *
 * It used to show the NEXT rung's increment (Sprint 63's `stepCost`), so a
 * `poor -> fine` plan read "+Y4,800 · +1 labour" while Confirm charged
 * "Y9,600 · 2 labour". Both were individually right; the row was answering a
 * question the player wasn't asking. The increment now lives ONLY in the `+`
 * button's tooltip (`repairStepLabel`), where it answers "what does one more
 * click cost" without competing with the total. Every number on screen
 * answers exactly one question.
 */
function plannedRowCost(componentId: ComponentId, carPartId?: CarPartId): string | null {
  const carId = detail.value?.car.id
  if (!carId) return null
  const step = game.plannedStepFor(carId, componentId, carPartId)
  if (!step) return null
  return `${formatYen(step.costYen)} · ${step.laborSlots} labour`
}

/** Sprint 63: the currently planned target band (a real `ConditionBand`, for
 * the planned `BandChip`), or null when nothing's planned at this address. */
function stagedTargetBand(componentId: ComponentId, carPartId?: CarPartId): ConditionBand | null {
  const staged = stagedFor(componentId, carPartId)
  return staged?.kind === 'repair' ? staged.targetBand : null
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
 * ran out of labour before reaching it in the staged list. Calling
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

// --- Sprint 42: the flip ledger's financial panel - purchase, repairs,
// parts, guide value, and a live projected profit, so the buy-repair-
// upgrade-sell loop is visible with every action, not just at sale time. ---

/** Purchase (0 when unknown) + repairs + parts - what's actually sunk into
 * this car so far. */
const totalSpentYen = computed(() => {
  const d = detail.value
  if (!d) return 0
  return (d.ledger.purchaseYen ?? 0) + d.ledger.repairYen + d.ledger.partsYen
})

/** Guide value minus total spent - the panel's headline number, colored by
 * sign (`.finance-profit` classes below). */
const projectedProfitYen = computed(() => {
  const d = detail.value
  if (!d) return 0
  return d.guideValueYen - totalSpentYen.value
})

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

/**
 * Sprint 48: the group's "Repair to…" click-per-rung control - each click
 * plans exactly one more band, re-staging at the new target (`stageAction`
 * already replaces whatever was staged at this address, so a repeat click
 * is just calling it again with the next rung).
 */
function advanceGroupRepair(componentId: ComponentId): void {
  const d = detail.value
  const step = nextGroupStep(componentId)
  if (!d || !step) return
  game.stageAction(d.car.id, { kind: 'repair', componentId, targetBand: step.targetBand })
}

/** Sprint 48: the per-part counterpart to `advanceGroupRepair` above. */
function advancePartRepair(componentId: ComponentId, carPartId: CarPartId): void {
  const d = detail.value
  const step = nextPartStep(componentId, carPartId)
  if (!d || !step) return
  game.stageAction(d.car.id, {
    kind: 'repair',
    componentId,
    targetBand: step.targetBand,
    carPartId,
  })
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
      <!-- Sprint 67 decision 7 (item 12): the task list shows here too. The
           work cannot start until the car arrives, but knowing what the
           customer asked for is exactly what lets a player go and buy the
           parts today (Sprint 61 already put inbound cars in the parts-market
           fit filter - this is the half that was missing). -->
      <ServiceTaskList v-if="detail.serviceJob" :tasks="detail.serviceJob.tasks" />
      <p class="arriving-note">Arriving tomorrow - nothing to do until it's dropped off.</p>
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
        <ServiceTaskList :tasks="detail.serviceJob.tasks" />
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
                ? 'Work done - hand it back from the job board to get paid.'
                : 'Work unfinished - completing now forfeits the job (−' +
                  detail.serviceJob.failureReputationPenalty +
                  ' rep). Complete or Give Up from the job board.'
            }}
          </span>
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
              Expand a group to repair or replace its real parts one at a time, or use the group's
              own button - each click plans one more band, priced and laboured for real. Use the
              filter to choose which conditions show. Nothing happens until you Confirm.
            </HelpHint>
          </h3>

          <div class="panel-controls">
            <details class="condition-filter" data-test="condition-filter">
              <summary>
                Show: {{ visibleConditions.size }}/{{ ALL_FILTER_CATEGORIES.length }} conditions
              </summary>
              <label v-for="option in CONDITION_FILTER_OPTIONS" :key="option" class="filter-option">
                <input
                  type="checkbox"
                  :data-test="'filter-' + option"
                  :checked="visibleConditions.has(option)"
                  @change="toggleConditionFilter(option)"
                />
                {{ option }}
              </label>
            </details>

            <button type="button" data-test="filter-show-all" @click="showAllConditions()">
              Show all
            </button>
            <button type="button" data-test="filter-hide-all" @click="hideAllConditions()">
              Hide all
            </button>
            <button type="button" data-test="expand-all" @click="expandAllGroups()">
              Expand all
            </button>
            <button type="button" data-test="collapse-all" @click="collapseAllGroups()">
              Collapse all
            </button>
          </div>

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
                  <span
                    v-if="isStagedRepair(componentId)"
                    class="plan-preview"
                    :data-test="'plan-preview-' + componentId"
                  >
                    <BandChip :band="detail.groupBands[componentId]" />
                    <span class="plan-arrow" aria-hidden="true">&rarr;</span>
                    <BandChip :band="stagedTargetBand(componentId)" />
                  </span>

                  <template v-if="nextGroupStep(componentId)">
                    <button
                      type="button"
                      class="step-up"
                      :data-test="'stage-repair-' + componentId"
                      :aria-label="
                        repairStepLabel(
                          nextGroupStepOrFallback(componentId),
                          isStagedRepair(componentId),
                        )
                      "
                      :title="
                        repairStepLabel(
                          nextGroupStepOrFallback(componentId),
                          isStagedRepair(componentId),
                        )
                      "
                      @click="advanceGroupRepair(componentId)"
                    >
                      +
                    </button>
                  </template>

                  <!-- Outside the `+` guard on purpose: a row planned all the
                       way to mint has no next step but still has a total to
                       show. -->
                  <span
                    v-if="plannedRowCost(componentId)"
                    class="step-cost"
                    :data-test="'planned-cost-' + componentId"
                    >{{ plannedRowCost(componentId) }}</span
                  >

                  <button
                    v-if="isStagedRepair(componentId)"
                    type="button"
                    class="clear-plan"
                    :data-test="'unstage-repair-' + componentId"
                    aria-label="Clear planned repair"
                    title="Clear planned repair"
                    @click="game.unstageAction(detail.car.id, componentId)"
                  >
                    &times;
                  </button>

                  <template v-if="stagedInstallName(componentId)">
                    <span class="planned-install"
                      >planned: {{ stagedInstallName(componentId) }}</span
                    >
                    <button
                      type="button"
                      class="clear-plan"
                      :data-test="'unstage-' + componentId"
                      aria-label="Clear planned install"
                      title="Clear planned install"
                      @click="game.unstageAction(detail.car.id, componentId)"
                    >
                      &times;
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
                      <span
                        v-if="isStagedRepair(componentId, row.partId)"
                        class="plan-preview"
                        :data-test="'plan-preview-part-' + row.partId"
                      >
                        <BandChip :band="row.band" />
                        <span class="plan-arrow" aria-hidden="true">&rarr;</span>
                        <BandChip :band="stagedTargetBand(componentId, row.partId)" />
                      </span>

                      <template v-if="nextPartStep(componentId, row.partId)">
                        <button
                          type="button"
                          class="step-up"
                          :data-test="'stage-repair-part-' + row.partId"
                          :aria-label="
                            repairStepLabel(
                              nextPartStepOrFallback(componentId, row.partId),
                              isStagedRepair(componentId, row.partId),
                            )
                          "
                          :title="
                            repairStepLabel(
                              nextPartStepOrFallback(componentId, row.partId),
                              isStagedRepair(componentId, row.partId),
                            )
                          "
                          @click="advancePartRepair(componentId, row.partId)"
                        >
                          +
                        </button>
                      </template>

                      <span
                        v-if="plannedRowCost(componentId, row.partId)"
                        class="step-cost"
                        :data-test="'planned-cost-part-' + row.partId"
                        >{{ plannedRowCost(componentId, row.partId) }}</span
                      >

                      <button
                        v-if="isStagedRepair(componentId, row.partId)"
                        type="button"
                        class="clear-plan"
                        :data-test="'unstage-repair-part-' + row.partId"
                        aria-label="Clear planned repair"
                        title="Clear planned repair"
                        @click="game.unstageAction(detail.car.id, componentId, row.partId)"
                      >
                        &times;
                      </button>

                      <template v-if="stagedInstallName(componentId, row.partId)">
                        <span class="planned-install"
                          >planned: {{ stagedInstallName(componentId, row.partId) }}</span
                        >
                        <button
                          type="button"
                          class="clear-plan"
                          :data-test="'unstage-part-' + row.partId"
                          aria-label="Clear planned install"
                          title="Clear planned install"
                          @click="game.unstageAction(detail.car.id, componentId, row.partId)"
                        >
                          &times;
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
            <h4>Planned work ({{ detail.stagedActions.length }})</h4>
            <p v-if="detail.stagedActions.length === 0" class="empty">
              Nothing planned yet - free to add and remove until you Confirm.
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
            <div class="confirm-block">
              <button
                class="primary confirm-lever"
                data-test="confirm-work"
                :disabled="detail.stagedActions.length === 0"
                @click="onConfirm"
              >
                Confirm
                <span v-if="detail.plannedEstimate" class="confirm-cost" data-test="confirm-cost"
                  >{{ formatYen(detail.plannedEstimate.plannedRepairCostYen) }} ·
                  {{ detail.plannedEstimate.plannedLaborSlots }} labour</span
                >
              </button>
              <p
                v-if="detail.plannedEstimate"
                class="confirm-caption"
                :class="{ warn: plannedLaborOverToday }"
                data-test="confirm-labour-caption"
              >
                {{ game.laborSlotsRemainingToday }} labour left today<span
                  v-if="plannedLaborOverToday"
                >
                  - the rest carries to tomorrow</span
                >.
              </p>
            </div>
          </section>
        </div>
      </div>

      <section v-if="!detail.serviceJob" class="finances" data-test="finance-panel">
        <h3>
          Finances
          <HelpHint label="Finances">
            What you paid, what you've sunk into it since, and what it's worth right now. Repairing
            or installing a part updates this immediately.
          </HelpHint>
        </h3>
        <dl class="finance-grid">
          <div class="finance-row">
            <dt>Purchase</dt>
            <dd data-test="finance-purchase">
              {{ detail.ledger.purchaseYen === null ? '-' : formatYen(detail.ledger.purchaseYen) }}
            </dd>
          </div>
          <div class="finance-row">
            <dt>Repairs</dt>
            <dd data-test="finance-repairs">{{ formatYen(detail.ledger.repairYen) }}</dd>
          </div>
          <div class="finance-row">
            <dt>Parts</dt>
            <dd data-test="finance-parts">{{ formatYen(detail.ledger.partsYen) }}</dd>
          </div>
          <div class="finance-row total">
            <dt>Total spent</dt>
            <dd data-test="finance-total-spent">{{ formatYen(totalSpentYen) }}</dd>
          </div>
          <div class="finance-row">
            <dt>Guide value</dt>
            <dd data-test="finance-guide-value">{{ formatYen(detail.guideValueYen) }}</dd>
          </div>
          <div class="finance-row">
            <dt>Restoration bill remaining</dt>
            <dd data-test="finance-bill-remaining">{{ formatYen(detail.totalBillYen) }}</dd>
          </div>
          <div
            class="finance-row profit"
            :class="projectedProfitYen >= 0 ? 'positive' : 'negative'"
          >
            <dt>Projected profit</dt>
            <dd data-test="finance-profit">{{ formatYenDelta(projectedProfitYen) }}</dd>
          </div>
        </dl>

        <p
          v-if="detail.foundationWarning"
          class="foundation-warning"
          data-test="foundation-warning"
        >
          No buyer pays for the extras while the basics are shot - sort the
          {{ detail.foundationWarning.failingParts.join(', ') }} first. That's holding back about
          {{ formatYen(detail.foundationWarning.withheldYen) }} of the parts you've fitted.
        </p>

        <p v-if="detail.passionSpendNotice" class="passion-notice" data-test="passion-notice">
          Nobody round here pays extra for a car like this past
          <BandChip :band="detail.passionSpendNotice.band" /> - work beyond that earns back about
          {{ formatYen(Math.round(detail.passionSpendNotice.returnRate * 100)) }} of every
          {{ formatYen(100) }} you put in. Take it further because you want to, not for the money.
        </p>

        <template v-if="detail.plannedEstimate">
          <p class="estimate-label">Estimate - not yet confirmed</p>
          <dl class="finance-grid estimate-grid" data-test="finance-estimate">
            <div class="finance-row">
              <dt>Planned repair cost</dt>
              <dd data-test="finance-estimate-repair-cost">
                {{ formatYen(detail.plannedEstimate.plannedRepairCostYen) }}
              </dd>
            </div>
            <div class="finance-row">
              <dt>Total spent after</dt>
              <dd data-test="finance-estimate-total-spent">
                {{ formatYen(detail.plannedEstimate.totalSpentYenAfter) }}
              </dd>
            </div>
            <div class="finance-row">
              <dt>Guide value after</dt>
              <dd data-test="finance-estimate-guide-value">
                {{ formatYen(detail.plannedEstimate.guideValueYenAfter) }}
              </dd>
            </div>
            <div class="finance-row">
              <dt>Restoration bill after</dt>
              <dd data-test="finance-estimate-bill">
                {{ formatYen(detail.plannedEstimate.billYenAfter) }}
              </dd>
            </div>
            <div
              class="finance-row profit"
              :class="detail.plannedEstimate.projectedProfitYenAfter >= 0 ? 'positive' : 'negative'"
            >
              <dt>Projected profit after</dt>
              <dd data-test="finance-estimate-profit">
                {{ formatYenDelta(detail.plannedEstimate.projectedProfitYenAfter) }}
              </dd>
            </div>
          </dl>
        </template>
      </section>

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
            <!-- Sprint 68 decision 3 (item 21): turning a lowball down is a
                 real move, not "do nothing and hope". The car stays listed,
                 so tomorrow's draw can bring a better one. -->
            <button
              data-test="reject-offer"
              title="Turn this offer down. The car stays up for sale."
              @click="game.rejectOffer(detail.car.id)"
            >
              Reject
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
        <p class="labor" data-test="labour-card">
          Labour left today:
          <strong>{{ game.laborSlotsRemainingToday }}/{{ game.laborSlotsPerDay }}</strong> slots
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

/* Sprint 48 decision 1: one global filter replaces the old per-group
   "+N parts in good order" toggle. */
.condition-filter {
  margin: var(--mg-space-1) 0 var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.condition-filter summary {
  cursor: pointer;
}

.filter-option {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
  margin: var(--mg-space-1) var(--mg-space-2) 0 0;
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

.planned-install {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
}

/* Sprint 63 (item 7): the repair row's own anatomy - a current -> planned
   band preview, a compact `+` climb-one-band button with the cost as a quiet
   caption beside it, and an `x` to clear the plan. No sentence in any button. */
.plan-preview {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
}

.plan-arrow {
  color: var(--mg-text-dim);
}

.step-up,
.clear-plan {
  min-width: 28px;
  padding: 2px 8px;
  font-size: var(--mg-fs-md);
  line-height: 1;
}

.clear-plan {
  color: var(--mg-neon-pink);
  border-color: var(--mg-panel-edge);
}

.step-cost {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* Sprint 42: the flip ledger's financial panel - a compact label/value grid,
   the same shape a receipt reads in, with the profit line singled out by
   weight + sign color rather than a separate box. */
.finances {
  margin: var(--mg-space-4) 0;
}

.finance-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--mg-space-1) var(--mg-space-3);
  margin: 0;
}

.finance-row {
  display: contents;
}

.finance-row dt {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.finance-row dd {
  margin: 0;
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  text-align: right;
}

.finance-row.total dt,
.finance-row.total dd {
  font-weight: bold;
  border-top: var(--mg-border);
  padding-top: var(--mg-space-1);
}

.finance-row.profit dt,
.finance-row.profit dd {
  font-size: var(--mg-fs-md);
  font-weight: bold;
}

.finance-row.profit.positive dd {
  color: var(--mg-success);
}

.finance-row.profit.negative dd {
  color: var(--mg-danger);
}

/* Sprint 60 (law 5): the foundation-law notice - the aftermarket premium is
   being withheld until the basics are sound. Warning-toned, not an error. */
.foundation-warning {
  margin: var(--mg-space-2) 0 0;
  padding: var(--mg-space-2);
  border: 1px solid var(--mg-danger);
  border-radius: var(--mg-radius);
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

/* Deliberately NOT the danger styling above: a bad foundation is a fault, but
 * taking a car past what its market pays for is a legitimate choice the player
 * is entitled to make with their eyes open (economy-bible law 1's legibility
 * clause). Muted and factual, never an alarm. */
.passion-notice {
  margin: var(--mg-space-2) 0 0;
  padding: var(--mg-space-2);
  border: 1px dashed var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* Sprint 48: the pre-Confirm estimate - visually distinct (dimmed/italic)
   from the confirmed figures above it, since it's a projection, not fact. */
.estimate-grid {
  margin-top: var(--mg-space-1);
  opacity: 0.75;
  font-style: italic;
}

.estimate-label {
  margin: var(--mg-space-2) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
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
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--mg-space-2);
}

/* Sprint 63 (item 8): the planned cost/labour rides on the Confirm button
   itself; the remaining-today figure is a quiet caption below, warning (not
   blocking) when the plan overruns today's labour. */
.confirm-cost {
  font-size: var(--mg-fs-sm);
  opacity: 0.85;
}

.confirm-caption {
  margin: var(--mg-space-1) 0 0;
  text-align: center;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.confirm-caption.warn {
  color: var(--mg-neon-violet);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.jobs {
  margin: var(--mg-space-4) 0;
}

/* Sprint 67 decision 6 (playtest item 13): promoted from a dim caption to the
 * same weight as the garage's own Labour tile - it is the resource the day is
 * budgeted against, not an afterthought. One number, two places, one source. */
.labor {
  margin: 0 0 var(--mg-space-2);
  padding: var(--mg-space-2);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
  text-align: center;
}

.labor strong {
  color: var(--mg-neon-cyan);
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
