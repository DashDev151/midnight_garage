<script setup lang="ts">
import type { ComponentId, StagedAction } from '@midnight-garage/content'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EndDayButton from '../components/EndDayButton.vue'
import ReplaceDrawer from '../components/ReplaceDrawer.vue'
import StatRadar from '../components/StatRadar.vue'
import {
  clearDragSession,
  useDragSession,
  useDropZone,
  type DropZoneHandle,
} from '../composables/useDragAndDrop'
import { useGameStore, type CarIssueView } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const carId = computed(() => String(route.params.id))
const detail = computed(() => game.carDetail(carId.value))

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
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'wheels',
  'body',
  'interior',
]

/** The open job against this component, if any (either kind). */
function jobFor(componentId: ComponentId) {
  return detail.value?.jobs.find((j) => j.componentId === componentId)
}

/** True while a repair or install job is open against this component (either kind, either busy). */
function componentBusy(componentId: ComponentId): boolean {
  return jobFor(componentId) !== undefined
}

/**
 * Continue whichever kind of job is actually open on this component — Sprint
 * 18 exposes a case the old always-instant install flow never could: an
 * install job (usually a single-slot job that completes the moment Confirm
 * reaches it) can now be left open if Confirm ran out of labor before
 * reaching it in the staged list. Calling `game.repair(...)` unconditionally
 * here would silently create an unrelated *second* job instead of continuing
 * this one (job ids are derived from kind, so a repair-zone spec never
 * matches an existing install-part job) — dormant before this sprint (an
 * install always finished in the same click it was created), real now that
 * Confirm can leave one open.
 */
function continueJob(componentId: ComponentId): void {
  const d = detail.value
  const job = jobFor(componentId)
  if (!d || !job) return
  if (job.kind === 'repair-zone') game.repair(d.car.id, componentId)
  else if (job.partInstanceId) game.install(d.car.id, componentId, job.partInstanceId)
}

/** The equipment item covering this component, if the catalog has one (Sprint 13). */
function equipmentFor(componentId: ComponentId) {
  return game.equipmentCatalog.find((e) => e.componentIds.includes(componentId))
}

/**
 * Resolve a customer job immediately (paid if the work's done, forfeited with a
 * reputation hit if not). The car then leaves the shop, so the detail computed
 * goes undefined and the watcher above returns us to the garage.
 */
function onCompleteJob(jobId: string): void {
  game.completeServiceJob(jobId)
}

/** Move this car between parking and the service bay — instant, free. */
function toggleBay(): void {
  const d = detail.value
  if (!d) return
  game.moveCar(d.car.id, d.inServiceBay ? 'parking' : 'service')
}

const walkIn = computed(() => game.walkInEstimate(carId.value))
const listPrice = computed(() => game.listingEstimate(carId.value))

// --- Sprint 18 (round 2 — real playtest fix): Repair/Replace ------------
// Every non-busy component shows exactly two controls: Repair (a toggle,
// unchanged mechanically) and Replace. Replace opens a scoped side drawer
// (ReplaceDrawer) right here on this screen — not a separate route — so a
// part is always dragged from somewhere visibly on the same page as its
// target, or just clicked directly in the drawer to stage it instantly.
// Continuing an already-open job (componentBusy above) is untouched: that
// keeps the existing single-click flow, never routed through staging
// (decision 4).

function stagedFor(componentId: ComponentId): StagedAction | undefined {
  return detail.value?.stagedActions.find((a) => a.componentId === componentId)
}

function isStagedRepair(componentId: ComponentId): boolean {
  return stagedFor(componentId)?.kind === 'repair'
}

function partInstanceDisplayName(partInstanceId: string): string {
  const pi = game.gameState.partInventory.find((p) => p.id === partInstanceId)
  return pi ? game.partName(pi.partId) : partInstanceId
}

/** Display name of the part staged for install on this component, if any. */
function stagedInstallName(componentId: ComponentId): string | undefined {
  const staged = stagedFor(componentId)
  return staged?.kind === 'install' ? partInstanceDisplayName(staged.partInstanceId) : undefined
}

function toggleRepairStage(componentId: ComponentId): void {
  const d = detail.value
  if (!d) return
  if (isStagedRepair(componentId)) game.unstageAction(d.car.id, componentId)
  else game.stageAction(d.car.id, { kind: 'repair', componentId })
}

/** Which component's Replace drawer is open right now, if any — only one at a time. */
const activeReplaceComponent = ref<ComponentId | null>(null)

const dragSession = useDragSession()

/**
 * Whether `partInstanceId` can land on this component right now. Gated on
 * the drawer actually being open *for this component* — a live drag can only
 * ever originate from a part card rendered inside that open drawer, so no
 * other row is ever a real drop target regardless of fit.
 */
function acceptsInstall(componentId: ComponentId, partInstanceId: string): boolean {
  const d = detail.value
  if (!d) return false
  if (activeReplaceComponent.value !== componentId) return false
  if (d.car.components[componentId].installed) return false
  if (componentBusy(componentId)) return false
  if (game.isPartStagedAnywhere(partInstanceId)) return false
  return game.installablePartsFor(d.car.id, componentId).some((p) => p.id === partInstanceId)
}

/** One drop zone per component, built once (COMPONENTS is fixed) so each keeps its own
 * persistent pointer-tracking state — the same reasoning Sprint 17's ShopSlot.vue was built for. */
const dropZones = Object.fromEntries(
  COMPONENTS.map((componentId) => [
    componentId,
    useDropZone<string>(
      (partInstanceId) => acceptsInstall(componentId, partInstanceId),
      (partInstanceId) => {
        const d = detail.value
        if (d) game.stageAction(d.car.id, { kind: 'install', componentId, partInstanceId })
        activeReplaceComponent.value = null
      },
    ),
  ]),
) as Record<ComponentId, DropZoneHandle>

/**
 * Clicking "Replace": if a part is currently *picked* (the click-based
 * accessibility fallback — possibly picked from a different component's
 * drawer, or even before this one was ever opened) AND it actually fits
 * this component, complete that placement immediately, matching the same
 * `accepts`/`onDrop` a live drag uses. Otherwise, open (or close, on a
 * repeat click of the same row) this component's drawer — including when a
 * pick is active but doesn't fit here (Sprint 24 fix 1): the pick stays
 * alive, since the user may have meant a different row, rather than
 * silently doing nothing.
 */
function onReplaceClick(componentId: ComponentId): void {
  const picked = dragSession.value
  const payload = picked?.mode === 'pick' ? picked.payload : null
  if (typeof payload === 'string' && acceptsInstall(componentId, payload)) {
    dropZones[componentId].onClick()
    return
  }
  activeReplaceComponent.value = activeReplaceComponent.value === componentId ? null : componentId
}

/** Confirm — locks in every staged action on this car at once (Sprint 18). */
function onConfirm(): void {
  const d = detail.value
  if (d) game.confirmCarWork(d.car.id)
}

/** Stage (or unstage) fixing one hidden issue (Sprint 22) — same
 * stage-then-Confirm flow as repair/install, through the shared store call. */
function toggleIssueStage(issue: CarIssueView): void {
  const d = detail.value
  if (!d) return
  if (issue.staged) {
    game.unstageAction(d.car.id, issue.componentId)
  } else {
    game.stageAction(d.car.id, {
      kind: 'fix-issue',
      componentId: issue.componentId,
      issueId: issue.issueId,
    })
  }
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
 * above — a picked part (via `togglePick`, no pointer drag involved) is
 * otherwise invisible outside the drawer it was picked from, so a player who
 * navigates within the screen or just forgets what they picked has no way
 * to tell a pick is still live. Shown whenever a pick is active, anywhere on
 * this screen — not gated to the currently-open drawer, since the whole
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
      <h3>Customer job — {{ detail.serviceJob.customerName }}</h3>
      <p class="svc-desc">"{{ detail.serviceJob.description }}"</p>
      <p class="svc-req">
        Required: {{ detail.serviceJob.workLabel }} · pays
        {{ formatYen(detail.serviceJob.payoutYen) }} · +{{ detail.serviceJob.baseReputation }} rep
        base
      </p>
      <p
        v-if="detail.serviceJob.daysLeft !== null"
        class="svc-deadline"
        :class="{ urgent: detail.serviceJob.daysLeft <= 2 }"
      >
        {{
          detail.serviceJob.daysLeft <= 0
            ? 'Due today — hand it back or it fails on End Day.'
            : detail.serviceJob.daysLeft + ' day(s) left to finish and hand back.'
        }}
      </p>
      <div class="complete-row">
        <span class="svc-status" :class="{ done: detail.serviceJob.workDone }">
          {{
            detail.serviceJob.workDone
              ? 'Work done — hand it back to get paid now.'
              : 'Work unfinished — completing now forfeits the job (−' +
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
        <h3>Components</h3>
        <p class="how">
          Repair or Replace each component — Replace opens a drawer to pick a part. Nothing happens
          until you Confirm.
        </p>
        <ul class="components">
          <li v-for="componentId in COMPONENTS" :key="componentId" class="component-row">
            <div class="meter-line">
              <span class="component-name">{{ componentId }}</span>
              <span class="bar"
                ><span
                  class="fill"
                  :style="{ width: game.effectiveConditionFor(detail.car.id, componentId) + '%' }"
              /></span>
              <span class="component-val">
                {{ game.effectiveConditionFor(detail.car.id, componentId) }}%
              </span>
            </div>

            <div class="action-line">
              <span
                v-if="
                  game.effectiveConditionFor(detail.car.id, componentId) !==
                  detail.car.components[componentId].condition
                "
                class="cosmetic-val"
                :title="'Cosmetic condition: ' + detail.car.components[componentId].condition"
              >
                cosmetic {{ detail.car.components[componentId].condition }}
              </span>

              <template v-if="componentBusy(componentId)">
                <button
                  :disabled="
                    game.laborSlotsRemainingToday <= 0 ||
                    (jobFor(componentId)?.kind === 'repair-zone' &&
                      (detail.car.components[componentId].condition >= 100 ||
                        !game.hasEquipmentForComponent(componentId)))
                  "
                  :data-test="'repair-' + componentId"
                  @click="continueJob(componentId)"
                >
                  {{
                    jobFor(componentId)?.kind === 'repair-zone'
                      ? 'Continue repair'
                      : 'Continue install'
                  }}
                </button>
                <span v-if="detail.car.components[componentId].installed" class="installed">
                  {{ game.partName(detail.car.components[componentId].installed?.partId ?? '') }}
                </span>
                <span v-else class="slot-empty">installing…</span>
              </template>

              <template v-else>
                <button
                  v-if="detail.car.components[componentId].condition < 100"
                  :disabled="!game.hasEquipmentForComponent(componentId)"
                  :data-test="'stage-repair-' + componentId"
                  @click="toggleRepairStage(componentId)"
                >
                  {{ isStagedRepair(componentId) ? 'Unstage repair' : 'Repair' }}
                </button>
                <span
                  v-if="
                    detail.car.components[componentId].condition < 100 &&
                    !game.hasEquipmentForComponent(componentId)
                  "
                  class="equip-hint"
                >
                  needs {{ equipmentFor(componentId)?.displayName ?? 'equipment' }}
                </span>

                <template v-if="detail.car.components[componentId].installed">
                  <span class="installed">
                    {{ game.partName(detail.car.components[componentId].installed?.partId ?? '') }}
                  </span>
                </template>
                <template v-else>
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
                  <button
                    type="button"
                    class="replace-btn"
                    :class="{ 'active-target': dropZones[componentId].isActiveTarget.value }"
                    :data-test="'replace-' + componentId"
                    @pointerup="dropZones[componentId].onPointerUp"
                    @pointerenter="dropZones[componentId].onPointerEnter"
                    @pointerleave="dropZones[componentId].onPointerLeave"
                    @click="onReplaceClick(componentId)"
                  >
                    {{ dropZones[componentId].isActiveTarget.value ? 'Drop here' : 'Replace' }}
                  </button>
                </template>
              </template>
            </div>
          </li>
        </ul>

        <ReplaceDrawer
          v-if="activeReplaceComponent"
          :car-id="detail.car.id"
          :component-id="activeReplaceComponent"
          @close="activeReplaceComponent = null"
        />

        <section class="staged-panel">
          <h4>Staged work ({{ detail.stagedActions.length }})</h4>
          <p v-if="detail.stagedActions.length === 0" class="empty">
            Nothing staged yet — free to add and remove until you Confirm.
          </p>
          <ul v-else class="staged-list">
            <li v-for="action in detail.stagedActions" :key="action.componentId" class="staged-row">
              <span>
                {{
                  action.kind === 'repair'
                    ? 'Repair ' + action.componentId
                    : action.kind === 'install'
                      ? 'Install ' +
                        partInstanceDisplayName(action.partInstanceId) +
                        ' → ' +
                        action.componentId
                      : 'Fix issue on ' + action.componentId
                }}
              </span>
              <button
                type="button"
                :data-test="'unstage-summary-' + action.componentId"
                @click="game.unstageAction(detail.car.id, action.componentId)"
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

    <section class="issues">
      <h3>Issues</h3>
      <p v-if="detail.issues.length === 0" class="empty">No hidden issues found on this car.</p>
      <ul v-else class="issue-list">
        <li
          v-for="issue in detail.issues"
          :key="issue.issueId"
          class="issue-row"
          :class="{ fixed: issue.repaired }"
        >
          <span class="issue-text">
            <strong>{{ issue.componentId }}</strong> — {{ issue.hintText }}
            <span class="issue-band">({{ issue.severityBand }})</span>
          </span>
          <span v-if="issue.repaired" class="issue-fixed-label">fixed</span>
          <template v-else>
            <span class="issue-cost">{{ formatYen(issue.costYen) }}</span>
            <button
              type="button"
              :disabled="!game.hasEquipmentForComponent(issue.componentId)"
              :data-test="'stage-fix-issue-' + issue.issueId"
              @click="toggleIssueStage(issue)"
            >
              {{ issue.staged ? 'Unstage fix' : 'Fix' }}
            </button>
          </template>
        </li>
      </ul>
    </section>

    <section v-if="!detail.serviceJob" class="sell">
      <h3>Sell</h3>
      <div class="sell-options">
        <div class="sell-option">
          <span class="sell-label">Walk-in (today)</span>
          <span class="sell-est">
            ~{{ formatYen(walkIn.offerYen)
            }}<span v-if="walkIn.buyerId"> · {{ walkIn.buyerId }}</span>
          </span>
          <button data-test="sell-walkin" @click="game.sellWalkIn(detail.car.id)">Sell now</button>
        </div>
        <div class="sell-option">
          <span class="sell-label">List publicly</span>
          <span class="sell-est">asking {{ formatYen(listPrice) }}</span>
          <button data-test="sell-list" @click="game.listForSale(detail.car.id)">List</button>
        </div>
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
            {{ job.kind === 'repair-zone' ? 'repair ' + job.componentId : 'install part' }} ·
            {{ job.laborSlotsSpent }}/{{ job.laborSlotsRequired }} slots
          </li>
        </ul>
      </div>

      <p v-else class="empty">
        No work in progress. Stage a repair or install and Confirm to start.
      </p>

      <EndDayButton show-cash />
    </section>

    <div
      v-if="dragSession?.mode === 'drag' && draggedPartName"
      class="drag-ghost"
      :style="{ left: dragSession.x + 'px', top: dragSession.y + 'px' }"
    >
      {{ draggedPartName }}
    </div>

    <div v-if="pickedPartName" class="pick-chip" data-test="pick-chip">
      placing: {{ pickedPartName }} — click a Replace slot, or Esc to cancel
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

.service-banner {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin: var(--mg-space-4) 0;
}

.svc-desc {
  margin: var(--mg-space-1) 0;
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

.how {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-2);
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

/* Name, bar, and percent always stay on one crisp line — nothing here ever
   wraps, so this line reads the same for every component regardless of how
   much status text or how many buttons the row below it needs. */
.meter-line {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.component-name {
  width: 96px;
  flex-shrink: 0;
  text-transform: capitalize;
  font-size: var(--mg-fs-sm);
}

.meter-line .bar {
  flex: 1 1 auto;
  min-width: 60px;
}

.component-val {
  font-size: var(--mg-fs-sm);
  text-align: right;
  width: 36px;
  flex-shrink: 0;
}

/* Buttons, hints, and installed/staged status — free to wrap onto as many
   lines as they need without ever disturbing the meter line above. Indented
   to sit under the bar rather than the name, so it reads as detail on the
   meter, not a second, unrelated row. */
.action-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  padding-left: calc(96px + var(--mg-space-2));
  font-size: var(--mg-fs-sm);
}

.replace-btn.active-target {
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
}

.staged-install {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
}

.cosmetic-val {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.issues {
  margin: var(--mg-space-4) 0;
}

.issue-list {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-2) 0 0;
  display: grid;
  gap: var(--mg-space-2);
}

.issue-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.issue-row.fixed {
  opacity: 0.6;
}

.issue-row.fixed .issue-text {
  text-decoration: line-through;
}

.issue-band {
  color: var(--mg-text-dim);
  text-transform: capitalize;
}

.issue-cost {
  color: var(--mg-yen);
}

.issue-fixed-label {
  color: var(--mg-success);
}

.sell {
  margin: var(--mg-space-4) 0;
}

.sell-options {
  display: flex;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

.sell-option {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.sell-label {
  font-size: var(--mg-fs-sm);
}

.sell-est {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.bar {
  height: 10px;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  background: var(--mg-neon-cyan);
}

.slot-empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.equip-hint {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.installed {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
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
