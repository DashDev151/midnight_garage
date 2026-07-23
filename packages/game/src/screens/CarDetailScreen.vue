<script setup lang="ts">
import type {
  AssemblyId,
  CarPartId,
  ComponentId,
  ConditionBand,
  PartInstance,
  SellingChannelId,
  StagedAction,
} from '@midnight-garage/content'
import {
  ALL_CAR_PART_IDS,
  ASSEMBLIES,
  ComponentIdSchema,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import HelpHint from '../components/HelpHint.vue'
import PartsDiagram from '../components/PartsDiagram.vue'
import { partSpriteDataUrl } from '../components/partSprites'
import ReplaceDrawer from '../components/ReplaceDrawer.vue'
import ServiceTaskList from '../components/ServiceTaskList.vue'
import StatRadar from '../components/StatRadar.vue'
import {
  clearDragSession,
  useDragSession,
  useDropZone,
  type DropZoneHandle,
} from '../composables/useDragAndDrop'
import {
  useGameStore,
  type AssemblyRowView,
  type BenchMemberView,
  type CarPartRowView,
  type NextRepairStepView,
} from '../stores/gameStore'
import { MACHINE_LINE_NAMES } from '../utils/dayLogFormat'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import { LEDGER_LINE_LABELS, formatLedgerLineYen } from '../utils/ledgerLabels'
import { addressesOverlap, hasWorkAddress } from '../utils/partAddress'
import {
  SELLING_CHANNEL_LABELS,
  SELLING_CHANNEL_ORDER,
  sellingChannelCadenceLabel,
  sellingChannelFeeLabel,
} from '../utils/sellingChannelLabels'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const carId = computed(() => String(route.params.id))
const detail = computed(() => game.carDetail(carId.value))

/** The radar rides top-right of the hero header at a
 * smaller size than the default. */
const RADAR_SIZE = 150

/** Each part's blockers, from the live taxonomy - the panel's "Sits under" line
 * reads the hierarchy, never re-encodes it (directive 16). */
const BLOCKED_BY: Record<string, readonly CarPartId[]> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.blockedBy]),
)

/** The Machine hire panel's six rows, in the catalog's own declared order. */
const MACHINE_LINE_GROUPS = ComponentIdSchema.options

/** The hire button's own disabled reason (short cash only - ownership and
 * an already-hired line never reach a button at all, see the template). */
function hireGateReasonFor(group: ComponentId): string | null {
  const reason = game.hireMachineLineGateReason(group)
  return reason === 'no-cash' ? 'Not enough cash' : null
}

function onHireMachineLineClick(group: ComponentId): void {
  game.hireMachineLine(group)
}

/** The gate reason a staged row shows, or null - `StagedAction`'s own
 * flavour of `removeBlockedReasonFor`/`installGateReasonFor` above. */
function stagedActionGateReasonFor(action: StagedAction): string | null {
  const d = detail.value
  return d ? game.stagedActionGateReasonFor(d.car.id, action) : null
}

/** Whether Confirm should stay disabled because some staged action needs a
 * machine line neither owned nor hired today - explains itself via the
 * per-row gate reason rather than failing silently. */
const stagedWorkGated = computed(() => {
  const d = detail.value
  return d ? game.stagedWorkGated(d.car.id) : false
})

/** Whether the planned work needs more labour than is left today. */
const plannedLaborOverToday = computed(
  () => (detail.value?.plannedEstimate?.plannedLaborSlots ?? 0) > game.laborSlotsRemainingToday,
)

const inTransit = computed(() => detail.value?.serviceJob?.inTransit ?? false)

// A sold or unknown car has no detail - send the player back to the garage.
watch(
  detail,
  (d) => {
    if (!d) void router.replace({ name: 'garage' })
  },
  { immediate: true },
)

/** "Scrap the shell" is a two-step commit. Reset on
 * navigating to a different car. */
const scrapConfirming = ref(false)
watch(carId, () => {
  scrapConfirming.value = false
})

function onScrapShellClick(): void {
  const d = detail.value
  if (!d) return
  if (scrapConfirming.value) {
    scrapConfirming.value = false
    game.scrapShell(d.car.id)
  } else {
    scrapConfirming.value = true
  }
}

/** The "Full workup" button's own disabled reason. */
const WORKUP_GATE_LABEL: Record<string, string> = {
  // Labour is a continuous bar, not integer slots.
  'no-labor-slot': 'No labour left today',
  'not-found': 'Car not found',
  'no-symptoms': 'Nothing to diagnose',
}

const workupButtonTitle = computed(() => {
  const reason = detail.value?.workupGateReason
  if (reason) return WORKUP_GATE_LABEL[reason] ?? reason
  return `Collapse every symptom straight to its true cause - ${game.actionPoints.workup} labour, no fee, no clock`
})

/** A "· N labour" suffix for an action's control - empty while the action's
 * own `actionPoints` figure is 0, so free actions stay visually quiet. */
function labourSuffix(points: number): string {
  return points > 0 ? ` · ${points} labour` : ''
}

function onWorkupClick(): void {
  const d = detail.value
  if (!d) return
  game.resolveOwnedWorkup(d.car.id)
}

/** Every real part row within a group, for the panel's lookups. */
function rowsFor(componentId: ComponentId) {
  return detail.value ? game.partsInGroup(detail.value.car.id, componentId) : []
}

// --- The diagram is the page. The docked info/action panel replaces
// the old components list; a diagram block or a bench-strip member is its
// target. -----------------------------------------------------------------

type PanelTarget =
  { kind: 'part'; partId: CarPartId } | { kind: 'bench'; containerId: string; carPartId: CarPartId }

const panelTarget = ref<PanelTarget | null>(null)
watch(carId, () => {
  panelTarget.value = null
})

/** The diagram emits the selected part id (or null when it navigates). */
function onDiagramSelect(partId: CarPartId | null): void {
  panelTarget.value = partId ? { kind: 'part', partId } : null
}

function selectBenchMember(containerId: string, carPartId: CarPartId): void {
  panelTarget.value = { kind: 'bench', containerId, carPartId }
}

const selectedPartId = computed<CarPartId | null>(() =>
  panelTarget.value?.kind === 'part' ? panelTarget.value.partId : null,
)

const selectedGroup = computed<ComponentId | null>(() => {
  const id = selectedPartId.value
  return id ? (game.groupForCarPart(id) ?? null) : null
})

const selectedRow = computed<CarPartRowView | null>(() => {
  const id = selectedPartId.value
  const g = selectedGroup.value
  if (!id || !g) return null
  return rowsFor(g).find((r) => r.partId === id) ?? null
})

/** The selected benched container + member, when the panel target is a bench
 * member. */
const selectedBench = computed<{ containerId: string; member: BenchMemberView } | null>(() => {
  const t = panelTarget.value
  if (t?.kind !== 'bench' || !detail.value) return null
  const container = game.benchContainersFor(detail.value.car.id).find((c) => c.id === t.containerId)
  const member = container?.members.find((m) => m.carPartId === t.carPartId) ?? null
  return container && member ? { containerId: container.id, member } : null
})

/** The parts that sit on top of the selected part (its taxonomy blockers), for
 * the panel's "Sits under: {names}" line. */
const selectedBlockers = computed<string[]>(() => {
  const id = selectedPartId.value
  if (!id) return []
  return (BLOCKED_BY[id] ?? []).map((b) => game.carPartLabel(b))
})

/** The assembly whose context this panel target belongs to (a member part on
 * the car, or a benched member), or null. Drives the shared Remove/Refit
 * action. */
const selectedAssemblyId = computed<AssemblyId | null>(() => {
  const t = panelTarget.value
  if (t?.kind === 'part') return ASSEMBLIES.find((a) => a.members.includes(t.partId))?.id ?? null
  return selectedBench.value ? findBenchAssemblyId(selectedBench.value.containerId) : null
})

function findBenchAssemblyId(containerId: string): AssemblyId | null {
  if (!detail.value) return null
  return (
    game.benchContainersFor(detail.value.car.id).find((c) => c.id === containerId)?.assemblyId ??
    null
  )
}

const panelAssemblyRow = computed<AssemblyRowView | null>(() => {
  const id = selectedAssemblyId.value
  if (!id || !detail.value) return null
  return game.assemblyRowsFor(detail.value.car.id).find((r) => r.assemblyId === id) ?? null
})

/** A unified header for either a car part or a benched member. */
const panelHead = computed(() => {
  const row = selectedRow.value
  if (row) {
    return {
      spriteId: row.partId,
      name: row.displayName,
      band: row.band,
      grade: row.grade,
      uncertain: row.uncertain,
      installedPartName: row.installedPartName,
      missing: row.missing,
      absent: row.legitimatelyAbsent,
    }
  }
  const b = selectedBench.value
  if (b) {
    return {
      spriteId: b.member.carPartId,
      name: b.member.displayName,
      band: b.member.band,
      grade: null,
      uncertain: false,
      installedPartName: b.member.partName,
      missing: false,
      absent: false,
    }
  }
  return null
})

// --- Repair steps (labour made prominent) -

function nextPartStep(componentId: ComponentId, carPartId: CarPartId) {
  return detail.value ? game.nextRepairStep(detail.value.car.id, componentId, carPartId) : null
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

/** The action button's full inline text - the labour figure is an integer
 * point value, shown as `Repair to fine · ¥9,600 · 20 labour`. The price and
 * labour are loud, never hover-only. */
function repairStepText(step: NextRepairStepView): string {
  return `Repair to ${step.targetBand} · ${formatYen(step.costYen)} · ${step.laborSlotsRequired} labour`
}

/**
 * An uncertain part's repair-step preview is a range, so
 * the tooltip never leaks the true band. Ordinary rows get the same loud text
 * the button already shows.
 */
function uncertainStepLabel(range: {
  best: NextRepairStepView | null
  worst: NextRepairStepView | null
}): string {
  const describe = (step: NextRepairStepView | null): string =>
    step
      ? `to ${step.targetBand} - ${formatYen(step.costYen)} · ${step.laborSlotsRequired} labour`
      : 'nothing needed'
  return `Uncertain - if it's as shown: ${describe(range.best)}; if the hidden cause is real: ${describe(range.worst)}`
}

function partStepTitle(componentId: ComponentId, row: CarPartRowView): string {
  const id = detail.value?.car.id
  if (id && row.uncertain) {
    const range = game.nextPartStepRange(id, componentId, row.partId)
    if (range) return uncertainStepLabel(range)
  }
  return repairStepText(nextPartStepOrFallback(componentId, row.partId))
}

/** The currently planned target band, for the planned `BandChip`. */
function stagedTargetBand(componentId: ComponentId, carPartId?: CarPartId): ConditionBand | null {
  const staged = stagedFor(componentId, carPartId)
  return staged?.kind === 'repair' ? staged.targetBand : null
}

/** The open job at this exact address. */
function jobFor(componentId: ComponentId, carPartId?: CarPartId) {
  return detail.value?.jobs.find((j) => j.componentId === componentId && j.carPartId === carPartId)
}

function addressBusy(componentId: ComponentId, carPartId?: CarPartId): boolean {
  return detail.value?.jobs.some((j) => addressesOverlap(j, { componentId, carPartId })) ?? false
}

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

// --- The for-sale channel picker + live offer card ---

const forSale = computed(() => game.isForSale(carId.value))
const offer = computed(() => game.offerFor(carId.value))
const activeChannelId = computed(() => game.listingChannelId(carId.value))

/** The channel armed in the picker - defaults to shopFront, follows the
 * active listing's own channel once the car is actually listed, so
 * re-opening the screen shows where the car really sits. */
const selectedChannelId = ref<SellingChannelId>('shopFront')
watch(
  activeChannelId,
  (id) => {
    if (id) selectedChannelId.value = id
  },
  { immediate: true },
)

/** Why `id` can't be armed right now, `null` when it can - the existing
 * disabled-reason idiom (`AuctionScreen.vue`'s buyout button: disabled +
 * title share the same check). */
function channelDisabledReason(id: SellingChannelId): string | null {
  const feeYen = game.context.economy.sellingChannels[id].feeYen
  if (game.cashYen < feeYen) return `Not enough cash - listing here costs ${formatYen(feeYen)}`
  return null
}

/** List (or re-list) the car on the armed channel - re-listing on a
 * different channel pays that channel's fee again (the sim's own rule);
 * `weekendMeet` re-charges even on the SAME channel, since its one
 * guaranteed draw is spent the moment it resolves. */
function listOnSelectedChannel(): void {
  const d = detail.value
  if (!d) return
  game.setForSale(d.car.id, true, selectedChannelId.value)
}

function stopTakingOffers(): void {
  const d = detail.value
  if (!d) return
  game.setForSale(d.car.id, false)
}

// --- The flip ledger's financial panel ---

const totalSpentYen = computed(() => {
  const d = detail.value
  if (!d) return 0
  return (d.ledger.purchaseYen ?? 0) + d.ledger.repairYen + d.ledger.partsYen
})

// --- Staging, replace, remove ---

function stagedFor(componentId: ComponentId, carPartId?: CarPartId): StagedAction | undefined {
  return detail.value?.stagedActions.find(
    (a) => hasWorkAddress(a) && a.componentId === componentId && a.carPartId === carPartId,
  )
}

function isStagedRepair(componentId: ComponentId, carPartId?: CarPartId): boolean {
  return stagedFor(componentId, carPartId)?.kind === 'repair'
}

function partInstanceDisplayName(partInstanceId: string): string {
  const pi = game.gameState.partInventory.find((p) => p.id === partInstanceId)
  return pi ? game.partName(pi.partId) : partInstanceId
}

function stagedInstallName(componentId: ComponentId, carPartId?: CarPartId): string | undefined {
  const staged = stagedFor(componentId, carPartId)
  return staged?.kind === 'install' ? partInstanceDisplayName(staged.partInstanceId) : undefined
}

/** The yen/slots attribution for the install staged at this address, or '' -
 * a template-safe wrapper (`vue-eslint-parser` rejects a `!` assertion inside a
 * template expression). */
function stagedInstallAttribution(componentId: ComponentId, carPartId?: CarPartId): string {
  const staged = stagedFor(componentId, carPartId)
  return staged ? attributionText(staged) : ''
}

/** The per-part click-per-rung repair - each click plans one more
 * band, re-staging at the new target. */
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

/** Which part's Replace drawer is open right now, if any. */
const activeReplacePart = ref<CarPartId | null>(null)

/** When the open drawer picks for a benched assembly member, the container it
 * fits into; null while the drawer targets an on-car slot. */
const activeBenchReplaceContainerId = ref<string | null>(null)

/** Open the inventory drawer scoped to a benched member's slot - the same
 * pick-from-your-parts flow an on-car Replace uses; selection fits straight
 * into the container. */
function openBenchReplace(containerId: string, carPartId: CarPartId): void {
  activeBenchReplaceContainerId.value = containerId
  activeReplacePart.value = carPartId
}

function closeReplaceDrawer(): void {
  activeReplacePart.value = null
  activeBenchReplaceContainerId.value = null
}

const dragSession = useDragSession()

function acceptsInstall(carPartId: CarPartId, partInstanceId: string): boolean {
  const d = detail.value
  if (!d) return false
  if (activeReplacePart.value !== carPartId) return false
  const componentId = game.groupForCarPart(carPartId)
  if (!componentId || addressBusy(componentId, carPartId)) return false
  if (game.isPartStagedAnywhere(partInstanceId)) return false
  return game.installablePartsForPart(d.car.id, carPartId).some((p) => p.id === partInstanceId)
}

/** One drop zone per real part, built once so each keeps its own persistent
 * pointer-tracking state. */
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

function onReplaceClick(carPartId: CarPartId): void {
  const picked = dragSession.value
  const payload = picked?.mode === 'pick' ? picked.payload : null
  if (typeof payload === 'string' && acceptsInstall(carPartId, payload)) {
    dropZones[carPartId].onClick()
    return
  }
  activeBenchReplaceContainerId.value = null
  activeReplacePart.value = activeReplacePart.value === carPartId ? null : carPartId
}

/** Pull whatever's occupying this slot into inventory - free and instant. */
function onRemoveClick(carPartId: CarPartId): void {
  const d = detail.value
  if (!d) return
  game.removePart(d.car.id, carPartId)
}

/**
 * The remove affordance's own gate reason (structural refusals - not
 * removable, blocked-by - plus the buried engine/drivetrain machine-line
 * gate) - `null` when nothing blocks it.
 */
function removeBlockedReasonFor(carPartId: CarPartId): string | null {
  const d = detail.value
  return d ? game.removeBlockedReason(d.car.id, carPartId) : null
}

/**
 * The install/replace affordance's own gate reason - `null` when owned,
 * hired for today, or ungated. Covers a buried engine/drivetrain slot and a
 * suspension/body/interior signature slot alike.
 */
function installGateReasonFor(carPartId: CarPartId): string | null {
  const d = detail.value
  return d ? game.installGateReasonFor(d.car.id, carPartId) : null
}

/**
 * The per-part on-car repair affordance's own gate reason - `null` when
 * owned, hired for today, or ungated. Per-part repair is bench-only for any
 * non-`surface` slot, so this only ever gates a surface signature slot
 * (panels, underbody, seats, dashGauges).
 */
function repairGateReasonFor(carPartId: CarPartId): string | null {
  const d = detail.value
  return d ? game.repairGateReasonFor(d.car.id, carPartId) : null
}
/** The tier-1 repair-ceiling caption for this part's group, or null. */
function repairCeilingCaptionFor(componentId: ComponentId, carPartId: CarPartId): string | null {
  const d = detail.value
  return d ? game.repairCeilingCaption(d.car.id, componentId, carPartId) : null
}

// --- Bench work ---

function benchSwapCandidates(carPartId: CarPartId) {
  return game.stageableParts.filter(
    (sp) => sp.part.carPartId === carPartId && sp.instance.band !== 'scrap',
  )
}

function onBenchRecondition(member: BenchMemberView): void {
  if (member.instance && member.reconditionStep) {
    game.reconditionPart(member.instance.id, member.reconditionStep.targetBand)
  }
}

/** Whether the bench recondition button renders for this member - mirrors the
 * button's own inline `v-if` (kept literal there so the template narrows
 * `reconditionStep` to non-null); the dead-end branch inverts this. */
function benchOffersRecondition(member: BenchMemberView): boolean {
  return member.repairable && member.reconditionStep !== null
}

/** Whether a benched member is below serviceable (worn or worse, or the slot
 * is empty) - the bench empty-state renders only then, never beside fresh
 * rubber (a mint member needs nothing). */
function benchMemberBelowFine(member: BenchMemberView): boolean {
  return (
    member.band === null ||
    member.band === 'scrap' ||
    member.band === 'poor' ||
    member.band === 'worn'
  )
}

/** The slot label sentence-cased for inline copy ("Tyres" reads as "tyres" in
 * "Shop for tyres"), leaving all-caps acronyms ("ECU") intact. */
function benchShopLabel(carPartId: CarPartId): string {
  return game
    .carPartLabel(carPartId)
    .split(' ')
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ')
}

// --- Confirm + the per-action attribution ---

function onConfirm(): void {
  const d = detail.value
  if (d) game.confirmCarWork(d.car.id)
}

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  stripPrep: 'Strip & prep',
  beat: 'Beat',
  weld: 'Weld',
  fillAndSand: 'Fill & sand',
  prime: 'Prime',
  polish: 'Polish',
}

function isPipelineStagedAction(
  action: StagedAction,
): action is Extract<
  StagedAction,
  { kind: 'pipeline-stage' | 'pipeline-swap-panel' | 'pipeline-paint' }
> {
  return (
    action.kind === 'pipeline-stage' ||
    action.kind === 'pipeline-swap-panel' ||
    action.kind === 'pipeline-paint'
  )
}

/** A stable per-action key for `v-for`/`data-test`. */
function stagedKeyFor(action: StagedAction): string {
  if (isPipelineStagedAction(action)) {
    return action.kind === 'pipeline-stage'
      ? `${action.kind}:${action.zoneId}:${action.stage}`
      : `${action.kind}:${action.zoneId}`
  }
  if (!hasWorkAddress(action)) return `${action.kind}:${action.assemblyId}`
  return action.carPartId ? `${action.componentId}:${action.carPartId}` : action.componentId
}

function stagedActionLabel(action: StagedAction): string {
  if (isPipelineStagedAction(action)) {
    const zoneName = titleCaseFromSlug(action.zoneId)
    if (action.kind === 'pipeline-swap-panel') return `Swap panel: ${zoneName}`
    if (action.kind === 'pipeline-paint') return `Paint (${action.colour}): ${zoneName}`
    return `${PIPELINE_STAGE_LABELS[action.stage] ?? action.stage}: ${zoneName}`
  }
  if (!hasWorkAddress(action)) {
    const name = game.assemblyLabel(action.assemblyId)
    return action.kind === 'remove-assembly'
      ? `Remove assembly: ${name}`
      : `Refit assembly: ${name}`
  }
  const targetLabel = action.carPartId
    ? game.carPartLabel(action.carPartId)
    : game.componentLabel(action.componentId)
  return action.kind === 'repair'
    ? `Repair ${targetLabel} to ${action.targetBand}`
    : `Install ${partInstanceDisplayName(action.partInstanceId)} → ${targetLabel}`
}

/** This staged item's own yen and labour (an
 * integer point value). `Refit · free` for an equivalence install (0
 * labour); a repair its price and labour. */
function attributionText(action: StagedAction): string {
  const a = game.plannedActionAttribution(carId.value, action)
  if (action.kind === 'repair') return `${formatYen(a.costYen)} · ${a.laborSlots} labour`
  if (action.kind === 'install')
    return a.laborSlots === 0 ? 'Refit · free' : `Fit · ${a.laborSlots} labour`
  if (isPipelineStagedAction(action)) return `${formatYen(a.costYen)} · ${a.laborSlots} labour`
  return 'free'
}

function onUnstageSummary(action: StagedAction): void {
  const d = detail.value
  if (!d) return
  if (isPipelineStagedAction(action)) game.unstagePipelineAction(d.car.id, action)
  else if (hasWorkAddress(action))
    game.unstageAction(d.car.id, action.componentId, action.carPartId)
  else game.unstageAssemblyAction(d.car.id, action.kind, action.assemblyId)
}

// --- Body zones (minimal, docs/design/workshop-rework.md phase 1 - the
// representative-schematic views land in phase 2; this is a plain list). ---

const ZONE_IDS = ['bonnet', 'boot', 'left', 'right', 'roof', 'chassis'] as const
type ZoneId = (typeof ZONE_IDS)[number]
const PANEL_ZONE_IDS = ['bonnet', 'boot', 'left', 'right', 'roof'] as const
const GENERIC_STAGES = ['stripPrep', 'beat', 'weld', 'fillAndSand', 'prime', 'polish'] as const

const zoneState = computed(() => detail.value?.car.zoneState ?? null)

/** One generic stage's live preview for one zone - `null` when its
 * prerequisite isn't met yet (the button shows disabled with no total),
 * straight from `pipelineActionPlan` (the exact function Confirm resolves
 * with), never a re-derived client-side gate. */
function genericStagePreview(
  zoneId: ZoneId,
  stage: (typeof GENERIC_STAGES)[number],
): { costYen: number; laborSlots: number } | null {
  const d = detail.value
  if (!d) return null
  return game.pipelineActionPlan(d.car, { kind: 'pipeline-stage', stage, zoneId })
}

function onStageGeneric(zoneId: ZoneId, stage: (typeof GENERIC_STAGES)[number]): void {
  const d = detail.value
  if (!d) return
  game.stageAction(d.car.id, { kind: 'pipeline-stage', stage, zoneId })
}

const paintColourByZone = ref<Record<string, string>>({})

function paintPreview(zoneId: ZoneId): { costYen: number; laborSlots: number } | null {
  const d = detail.value
  const colour = paintColourByZone.value[zoneId]
  if (!d || !colour) return null
  return game.pipelineActionPlan(d.car, { kind: 'pipeline-paint', zoneId, colour })
}

function onStagePaint(zoneId: ZoneId): void {
  const d = detail.value
  const colour = paintColourByZone.value[zoneId]
  if (!d || !colour) return
  game.stageAction(d.car.id, { kind: 'pipeline-paint', zoneId, colour })
}

/** Zone panels sitting in inventory that fit THIS car's own fitment class,
 * for one panel zone - the swap-panel control's own picker. */
function matchingPanelsFor(zoneId: (typeof PANEL_ZONE_IDS)[number]): PartInstance[] {
  const d = detail.value
  if (!d) return []
  const model = game.context.modelsById[d.car.modelId]
  if (!model) return []
  const fitmentClass = fitmentClassForTier(model.tier)
  return game.gameState.partInventory.filter((p: PartInstance) => {
    const part = game.context.partsById[p.partId]
    return part?.zoneId === zoneId && part.fitmentClass === fitmentClass
  })
}

function onStageSwapPanel(zoneId: (typeof PANEL_ZONE_IDS)[number], partInstanceId: string): void {
  const d = detail.value
  if (!d || !partInstanceId) return
  game.stageAction(d.car.id, { kind: 'pipeline-swap-panel', zoneId, partInstanceId })
}

const draggedPartName = computed(() => {
  const payload = dragSession.value?.payload
  if (typeof payload !== 'string' || !payload) return null
  const pi = game.gameState.partInventory.find((p) => p.id === payload)
  return pi ? game.partName(pi.partId) : null
})

const pickedPartName = computed(() => {
  const s = dragSession.value
  if (s?.mode !== 'pick' || typeof s.payload !== 'string') return null
  const pi = game.gameState.partInventory.find((p) => p.id === s.payload)
  return pi ? game.partName(pi.partId) : null
})

const spriteFor = (id: CarPartId): string => partSpriteDataUrl(id)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && dragSession.value?.mode === 'pick') clearDragSession()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section v-if="detail" class="detail">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>

    <div class="detail-hero">
      <div class="hero-info">
        <h2>{{ detail.displayName }}</h2>
        <p class="sub">
          {{ game.fitmentClassLabel(fitmentClassForTier(detail.model.tier)) }} ·
          {{ detail.car.year }} · {{ detail.car.mileageKm.toLocaleString() }} km ·
          {{ detail.car.color }}
        </p>
        <p v-if="detail.car.provenanceNote" class="prov">"{{ detail.car.provenanceNote }}"</p>
        <div v-if="!inTransit && !detail.serviceJob" class="scrap-shell-row">
          <button
            type="button"
            class="scrap-shell-btn"
            :class="{ confirming: scrapConfirming }"
            data-test="scrap-shell"
            @click="onScrapShellClick"
          >
            {{
              (scrapConfirming ? 'Confirm - scrap the shell (' : 'Scrap the shell (') +
              formatYen(game.scrapShellValueYen(detail.car.id)) +
              ')' +
              labourSuffix(game.actionPoints.scrapShell)
            }}
          </button>
        </div>
      </div>
      <StatRadar v-if="!inTransit" class="hero-radar" :stats="detail.stats" :size="RADAR_SIZE" />
    </div>

    <section v-if="inTransit" class="arriving-banner" data-test="arriving-banner">
      <h3>Customer job - {{ detail.serviceJob?.customerName }}</h3>
      <p class="svc-desc">"{{ detail.serviceJob?.description }}"</p>
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
          {{
            (detail.inServiceBay ? 'Move to parking' : 'Move to service bay') +
            labourSuffix(game.actionPoints.moveCar)
          }}
        </button>
      </div>

      <section v-if="detail.symptoms.length > 0" class="symptom-panel" data-test="car-symptoms">
        <h3>Diagnosis</h3>
        <div
          v-for="symptom in detail.symptoms"
          :key="symptom.symptomIndex"
          class="symptom"
          :class="{ resolved: symptom.resolved }"
          :data-test="'car-symptom-' + symptom.symptomIndex"
        >
          <p class="symptom-line">{{ symptom.line }}</p>
          <ul class="symptom-causes">
            <li
              v-for="cause in symptom.causes"
              :key="cause.causeId"
              :class="{ eliminated: cause.eliminated }"
            >
              <span class="mark" aria-hidden="true">{{ cause.eliminated ? '[x]' : '[ ]' }}</span>
              <span class="label">{{ cause.label }}</span>
              <span class="delta">{{ formatYenDelta(cause.dealDeltaYen) }} if true</span>
            </li>
          </ul>
        </div>
        <button
          v-if="detail.workupGateReason !== 'already-resolved'"
          type="button"
          class="workup-btn"
          :disabled="!!detail.workupGateReason"
          :title="workupButtonTitle"
          data-test="car-workup"
          @click="onWorkupClick"
        >
          Full workup ({{ game.actionPoints.workup }} labour)
        </button>
      </section>

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
                ? 'Work done - hand it back from the Phone tab to get paid.'
                : 'Work unfinished - completing now forfeits the job (−' +
                  detail.serviceJob.failureReputationPenalty +
                  ' rep). Complete or Give Up from the Phone tab.'
            }}
          </span>
        </div>
      </section>

      <!-- The diagram is the page. Full-width diagram, then the bench strip
           (if any), then the docked info/action panel. -->
      <PartsDiagram
        :car-id="detail.car.id"
        :selected-part-id="selectedPartId"
        @select="onDiagramSelect"
      />

      <section
        v-if="game.benchContainersFor(detail.car.id).length > 0"
        class="bench-strip"
        data-test="bench-panel"
      >
        <h4>On the bench</h4>
        <div
          v-for="container in game.benchContainersFor(detail.car.id)"
          :key="container.id"
          class="bench-container"
          :data-test="'bench-container-' + container.assemblyId"
        >
          <span class="bench-name">{{ container.displayName }}</span>
          <button
            v-for="member in container.members"
            :key="member.carPartId"
            type="button"
            class="bench-block"
            :class="{
              selected:
                selectedBench?.containerId === container.id &&
                selectedBench?.member.carPartId === member.carPartId,
            }"
            :data-test="'bench-member-' + member.carPartId"
            @click="selectBenchMember(container.id, member.carPartId)"
          >
            <img
              class="bench-sprite"
              :src="spriteFor(member.carPartId)"
              alt=""
              aria-hidden="true"
            />
            <span class="bench-block-name">{{ member.displayName }}</span>
            <BandChip :band="member.band" />
          </button>
        </div>
      </section>

      <section class="action-panel" data-test="part-action-panel">
        <p v-if="!panelHead" class="panel-empty" data-test="panel-empty">
          Pick a part in the diagram to work on it.
        </p>

        <template v-if="panelHead">
          <div class="panel-head">
            <img
              class="panel-sprite"
              :src="spriteFor(panelHead.spriteId)"
              alt=""
              aria-hidden="true"
            />
            <span class="panel-name" data-test="panel-name">{{ panelHead.name }}</span>
            <BandChip :band="panelHead.band" />
            <span v-if="panelHead.grade" class="panel-grade">{{ panelHead.grade }}</span>
            <span
              v-if="panelHead.uncertain"
              class="uncertain-tag"
              data-test="panel-uncertain"
              title="An unresolved symptom may have damaged this part - the band shown is its pre-damage condition"
              >?</span
            >
            <span v-if="panelHead.missing" class="missing-tag" data-test="panel-missing"
              >MISSING</span
            >
            <span v-else-if="panelHead.absent" class="absent-tag">no turbo (NA)</span>
            <span v-if="panelHead.installedPartName" class="installed">{{
              panelHead.installedPartName
            }}</span>
          </div>

          <p v-if="selectedBlockers.length > 0" class="panel-blockers" data-test="panel-sits-under">
            Sits under: {{ selectedBlockers.join(', ') }}
          </p>

          <!-- A car part's own actions (repair / replace / remove). -->
          <div v-if="selectedRow && selectedGroup" class="panel-actions">
            <template v-if="game.isAssemblyMember(selectedRow.partId)">
              <span class="slot-empty" data-test="panel-assembly-note"
                >comes off with the assembly</span
              >
            </template>

            <template v-else-if="addressBusy(selectedGroup, selectedRow.partId)">
              <template v-if="jobFor(selectedGroup, selectedRow.partId)">
                <button
                  :disabled="game.laborSlotsRemainingToday <= 0"
                  :data-test="'repair-part-' + selectedRow.partId"
                  @click="continueJob(selectedGroup, selectedRow.partId)"
                >
                  {{
                    jobFor(selectedGroup, selectedRow.partId)?.kind === 'repair-zone'
                      ? 'Continue repair'
                      : 'Continue install'
                  }}
                </button>
                <span class="slot-empty">working…</span>
              </template>
              <span v-else class="slot-empty">working (group job)…</span>
            </template>

            <template v-else>
              <!-- The plan preview and clear control persist whenever a repair
                   is staged, even once the plan has reached the mint ceiling
                   and no further rung remains to stage. -->
              <template
                v-if="
                  nextPartStep(selectedGroup, selectedRow.partId) ||
                  isStagedRepair(selectedGroup, selectedRow.partId)
                "
              >
                <span
                  v-if="isStagedRepair(selectedGroup, selectedRow.partId)"
                  class="plan-preview"
                  data-test="panel-plan-preview"
                >
                  <BandChip :band="selectedRow.band" />
                  <span class="plan-arrow" aria-hidden="true">&rarr;</span>
                  <BandChip :band="stagedTargetBand(selectedGroup, selectedRow.partId)" />
                </span>
                <button
                  v-if="nextPartStep(selectedGroup, selectedRow.partId)"
                  type="button"
                  class="step-up loud"
                  :data-test="'stage-repair-part-' + selectedRow.partId"
                  :title="partStepTitle(selectedGroup, selectedRow)"
                  @click="advancePartRepair(selectedGroup, selectedRow.partId)"
                >
                  {{ repairStepText(nextPartStepOrFallback(selectedGroup, selectedRow.partId)) }}
                </button>
                <button
                  v-if="isStagedRepair(selectedGroup, selectedRow.partId)"
                  type="button"
                  class="clear-plan"
                  :data-test="'unstage-repair-part-' + selectedRow.partId"
                  aria-label="Clear planned repair"
                  title="Clear planned repair"
                  @click="game.unstageAction(detail.car.id, selectedGroup, selectedRow.partId)"
                >
                  &times;
                </button>
                <span
                  v-if="repairGateReasonFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'assist-fee-repair-' + selectedRow.partId"
                  >{{ repairGateReasonFor(selectedRow.partId) }}</span
                >
              </template>

              <!-- At tier 1 a repair finishes at fine; this names the tier-2
                   machine that reaches mint. Sits outside the "+" block above so
                   it still shows once the part is at fine and no further "+"
                   rung remains. -->
              <span
                v-if="repairCeilingCaptionFor(selectedGroup, selectedRow.partId)"
                class="ceiling-caption"
                :data-test="'repair-ceiling-' + selectedRow.partId"
                >{{ repairCeilingCaptionFor(selectedGroup, selectedRow.partId) }}</span
              >

              <template v-if="!selectedRow.installedPartName">
                <button
                  type="button"
                  class="replace-btn"
                  :class="{ 'active-target': dropZones[selectedRow.partId].isActiveTarget.value }"
                  :data-test="'replace-part-' + selectedRow.partId"
                  @pointerup="dropZones[selectedRow.partId].onPointerUp"
                  @pointerenter="dropZones[selectedRow.partId].onPointerEnter"
                  @pointerleave="dropZones[selectedRow.partId].onPointerLeave"
                  @click="onReplaceClick(selectedRow.partId)"
                >
                  {{ dropZones[selectedRow.partId].isActiveTarget.value ? 'Drop here' : 'Replace' }}
                </button>
                <template v-if="stagedInstallName(selectedGroup, selectedRow.partId)">
                  <span class="planned-install" data-test="panel-planned-install"
                    >planned: {{ stagedInstallName(selectedGroup, selectedRow.partId) }} ·
                    {{ stagedInstallAttribution(selectedGroup, selectedRow.partId) }}</span
                  >
                  <button
                    type="button"
                    class="clear-plan"
                    :data-test="'unstage-part-' + selectedRow.partId"
                    aria-label="Clear planned install"
                    title="Clear planned install"
                    @click="game.unstageAction(detail.car.id, selectedGroup, selectedRow.partId)"
                  >
                    &times;
                  </button>
                </template>
                <span
                  v-if="installGateReasonFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'assist-fee-' + selectedRow.partId"
                  >{{ installGateReasonFor(selectedRow.partId) }}</span
                >
              </template>

              <template v-if="selectedRow.installedPartName && selectedRow.removable">
                <button
                  type="button"
                  class="remove-btn"
                  :disabled="!!removeBlockedReasonFor(selectedRow.partId)"
                  :title="
                    removeBlockedReasonFor(selectedRow.partId) ?? 'Pull this part into inventory'
                  "
                  :data-test="'remove-part-' + selectedRow.partId"
                  @click="onRemoveClick(selectedRow.partId)"
                >
                  Take it off{{ labourSuffix(game.actionPoints.removePart) }}
                </button>
                <span
                  v-if="removeBlockedReasonFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'remove-blocked-' + selectedRow.partId"
                  >{{ removeBlockedReasonFor(selectedRow.partId) }}</span
                >
              </template>
            </template>
          </div>

          <!-- A benched member's own actions (recondition / swap). -->
          <div v-else-if="selectedBench" class="panel-actions">
            <template
              v-if="selectedBench.member.repairable && selectedBench.member.reconditionStep"
            >
              <button
                type="button"
                class="step-up loud"
                :disabled="game.laborSlotsRemainingToday <= 0"
                :data-test="'bench-recondition-' + selectedBench.member.carPartId"
                :title="repairStepText(selectedBench.member.reconditionStep)"
                @click="onBenchRecondition(selectedBench.member)"
              >
                {{ repairStepText(selectedBench.member.reconditionStep) }}
              </button>
            </template>
            <!-- Fitting goes through the same pick-from-your-parts drawer an
                 on-car Replace uses; selection lands in this member slot. -->
            <button
              type="button"
              class="replace-btn"
              :data-test="'bench-replace-' + selectedBench.member.carPartId"
              @click="openBenchReplace(selectedBench.containerId, selectedBench.member.carPartId)"
            >
              Replace{{ labourSuffix(game.actionPoints.benchFitMember) }}
            </button>
            <!-- A mounted member comes OFF the assembly before its successor
                 goes on - dead rubber never stays waiting. Free, into the bin. -->
            <button
              v-if="selectedBench.member.instance"
              type="button"
              class="remove-btn"
              :data-test="'bench-remove-' + selectedBench.member.carPartId"
              title="Pull this part off the assembly into your inventory - free"
              @click="
                game.removeAssemblyMember(selectedBench.containerId, selectedBench.member.carPartId)
              "
            >
              Take it off{{ labourSuffix(game.actionPoints.benchRemoveMember) }}
            </button>
            <!-- Never a silent dead end - when nothing to recondition and
                 nothing on hand to fit, state the situation; the player
                 navigates the parts market themselves. -->
            <span
              v-if="
                !benchOffersRecondition(selectedBench.member) &&
                benchSwapCandidates(selectedBench.member.carPartId).length === 0 &&
                benchMemberBelowFine(selectedBench.member)
              "
              class="slot-empty"
              :data-test="'bench-empty-' + selectedBench.member.carPartId"
              >No replacement {{ benchShopLabel(selectedBench.member.carPartId) }} on hand - the
              parts shop sells them.</span
            >
            <!-- Names the line the Replace flow needs before a fit can land. -->
            <span
              v-if="selectedBench.member.swapGateReason"
              class="blocked-reason"
              :data-test="'bench-swap-gate-' + selectedBench.member.carPartId"
              >{{ selectedBench.member.swapGateReason }}</span
            >
          </div>

          <!-- The shared assembly Remove/Refit action, when the target belongs
               to an assembly (a member on the car, or a benched member).
               Which button shows is `onBench` alone - `canRefit`/`canRemove`
               only ever disable the button that's actually showing, so a
               gated refit never falls through to a stray Remove button. -->
          <div v-if="panelAssemblyRow" class="panel-actions assembly-action">
            <button
              v-if="panelAssemblyRow.onBench"
              type="button"
              :disabled="!panelAssemblyRow.canRefit"
              :data-test="'refit-assembly-' + panelAssemblyRow.assemblyId"
              @click="game.refitAssembly(detail.car.id, panelAssemblyRow.assemblyId)"
            >
              Refit assembly{{ labourSuffix(game.actionPoints.refitAssembly) }}
            </button>
            <button
              v-else
              type="button"
              :disabled="!panelAssemblyRow.canRemove"
              :data-test="'remove-assembly-' + panelAssemblyRow.assemblyId"
              @click="game.removeAssembly(detail.car.id, panelAssemblyRow.assemblyId)"
            >
              Remove assembly{{ labourSuffix(game.actionPoints.removeAssembly) }}
            </button>
            <span
              v-if="panelAssemblyRow.blockedReason"
              class="blocked-reason"
              :data-test="'assembly-blocked-' + panelAssemblyRow.assemblyId"
              >{{ panelAssemblyRow.blockedReason }}</span
            >
          </div>
        </template>
      </section>

      <section v-if="zoneState" class="body-zones-panel" data-test="body-zones-panel">
        <h4>
          Body zones
          <HelpHint label="Body zones">
            Panels, paint, and underbody all read from the six zones below - work a zone's own
            pipeline to move it. Metal is beaten or welded free of charge (it costs labour, never
            yen); surface and finish need real materials.
          </HelpHint>
        </h4>
        <ul class="body-zone-list">
          <li
            v-for="zid in ZONE_IDS"
            :key="zid"
            class="body-zone-row"
            :data-test="'body-zone-row-' + zid"
          >
            <div class="body-zone-head">
              <span class="body-zone-name">{{ titleCaseFromSlug(zid) }}</span>
              <span class="body-zone-severity" :data-test="'body-zone-severity-' + zid"
                >metal {{ zoneState![zid].metal }} · surface {{ zoneState![zid].surface }} · finish
                {{ zoneState![zid].finish
                }}{{ zoneState![zid].panelMissing ? ' · panel missing' : '' }}</span
              >
            </div>
            <div class="body-zone-stages">
              <button
                v-for="stage in GENERIC_STAGES"
                :key="stage"
                type="button"
                :disabled="!genericStagePreview(zid, stage)"
                :data-test="'pipeline-' + stage + '-' + zid"
                :title="
                  genericStagePreview(zid, stage)
                    ? formatYen(genericStagePreview(zid, stage)!.costYen) +
                      ' · ' +
                      genericStagePreview(zid, stage)!.laborSlots +
                      ' labour'
                    : 'Not ready yet'
                "
                @click="onStageGeneric(zid, stage)"
              >
                {{ PIPELINE_STAGE_LABELS[stage] }}
              </button>
              <template v-if="(PANEL_ZONE_IDS as readonly string[]).includes(zid)">
                <select
                  :data-test="'pipeline-swap-panel-select-' + zid"
                  @change="
                    onStageSwapPanel(
                      zid as (typeof PANEL_ZONE_IDS)[number],
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option value="">Swap panel…</option>
                  <option
                    v-for="pi in matchingPanelsFor(zid as (typeof PANEL_ZONE_IDS)[number])"
                    :key="pi.id"
                    :value="pi.id"
                  >
                    {{ game.partName(pi.partId) }} ({{ pi.band }})
                  </option>
                </select>
              </template>
              <input
                v-model="paintColourByZone[zid]"
                type="text"
                placeholder="colour"
                :data-test="'pipeline-paint-colour-' + zid"
              />
              <button
                type="button"
                :disabled="!paintPreview(zid)"
                :data-test="'pipeline-paint-' + zid"
                :title="
                  paintPreview(zid)
                    ? formatYen(paintPreview(zid)!.costYen) +
                      ' · ' +
                      paintPreview(zid)!.laborSlots +
                      ' labour'
                    : 'Not ready yet'
                "
                @click="onStagePaint(zid)"
              >
                Paint
              </button>
            </div>
          </li>
        </ul>
      </section>

      <ReplaceDrawer
        v-if="activeReplacePart"
        :car-id="detail.car.id"
        :car-part-id="activeReplacePart"
        :bench-container-id="activeBenchReplaceContainerId ?? undefined"
        @close="closeReplaceDrawer"
      />

      <section class="machine-hire-panel" data-test="machine-hire-panel">
        <h4>
          Machine hire
          <HelpHint label="Machine hire">
            Pay a machine's fee once and it's yours without limit until End Day - every car, every
            operation. It never shows up on a car's own bill; it's a running cost, same as rent.
          </HelpHint>
        </h4>
        <ul class="machine-hire-list">
          <li
            v-for="group in MACHINE_LINE_GROUPS"
            :key="group"
            class="machine-hire-row"
            :data-test="'machine-hire-row-' + group"
          >
            <span class="machine-hire-name">{{ MACHINE_LINE_NAMES[group] }}</span>
            <span
              v-if="game.machineLineOwned(group)"
              class="chip owned"
              :data-test="'machine-hire-chip-' + group"
              >In-house</span
            >
            <span
              v-else-if="game.machineLineHiredToday(group)"
              class="chip hired"
              :data-test="'machine-hire-chip-' + group"
              >Hired today</span
            >
            <button
              v-else
              type="button"
              class="hire-btn"
              :disabled="!!hireGateReasonFor(group)"
              :title="hireGateReasonFor(group) ?? undefined"
              :data-test="'hire-machine-' + group"
              @click="onHireMachineLineClick(group)"
            >
              Hire for the day ({{ formatYen(game.machineLineFeeYen(group)) }})
            </button>
          </li>
        </ul>
      </section>

      <section class="staged-panel">
        <h4>
          Planned work ({{ detail.stagedActions.length }})
          <HelpHint label="Planned work">
            Everything you stage from the diagram lands here, free to add and remove, until you
            Confirm. Each line shows its own price and labour; the bar totals them.
          </HelpHint>
        </h4>
        <p v-if="detail.stagedActions.length === 0" class="empty">
          Nothing planned yet - free to add and remove until you Confirm.
        </p>
        <ul v-else class="staged-list">
          <li
            v-for="action in detail.stagedActions"
            :key="stagedKeyFor(action)"
            class="staged-row"
            :data-test="'staged-row-' + stagedKeyFor(action)"
          >
            <span class="staged-label">{{ stagedActionLabel(action) }}</span>
            <span class="staged-attr" :data-test="'staged-attr-' + stagedKeyFor(action)">{{
              attributionText(action)
            }}</span>
            <span
              v-if="stagedActionGateReasonFor(action)"
              class="blocked-reason"
              :data-test="'staged-gate-' + stagedKeyFor(action)"
              >{{ stagedActionGateReasonFor(action) }}</span
            >
            <button
              type="button"
              :data-test="'unstage-summary-' + stagedKeyFor(action)"
              @click="onUnstageSummary(action)"
            >
              remove
            </button>
          </li>
        </ul>
        <div class="confirm-block">
          <button
            class="primary confirm-lever"
            data-test="confirm-work"
            :disabled="detail.stagedActions.length === 0 || stagedWorkGated"
            :title="stagedWorkGated ? 'Some planned work needs a machine hired first' : undefined"
            @click="onConfirm"
          >
            Confirm
            <span v-if="detail.plannedEstimate" class="confirm-cost" data-test="confirm-cost"
              >{{ formatYen(detail.plannedEstimate.plannedRepairCostYen) }} ·
              {{ detail.plannedEstimate.plannedLaborSlots }} labour</span
            >
          </button>
          <p
            v-if="detail.plannedEstimate && plannedLaborOverToday"
            class="confirm-caption warn"
            data-test="confirm-labour-caption"
          >
            Today's labour runs out first - the rest carries to tomorrow.
          </p>
          <p
            v-if="
              detail.plannedEstimate &&
              (detail.plannedEstimate.crewLaborSaved > 0 ||
                detail.plannedEstimate.perfectionistCostSavedYen > 0)
            "
            class="crew-saving"
            data-test="confirm-crew-saving"
          >
            <!-- crewLaborSaved is an integer labour point value. -->
            <span v-if="detail.plannedEstimate.crewLaborSaved > 0" data-test="crew-labour-saved"
              >The crew save {{ detail.plannedEstimate.crewLaborSaved }} labour.</span
            >
            <span
              v-if="detail.plannedEstimate.perfectionistCostSavedYen > 0"
              data-test="crew-cost-saved"
            >
              A perfectionist saves
              {{ formatYen(detail.plannedEstimate.perfectionistCostSavedYen) }}.</span
            >
          </p>
        </div>
      </section>

      <details v-if="!detail.serviceJob" class="finances" data-test="finance-panel">
        <summary class="finances-summary" data-test="finance-summary">Finances</summary>
        <p class="finances-intro">
          What you paid, what you've sunk into it since, and what it's worth right now. Repairing or
          installing a part updates this immediately.
        </p>
        <h4 class="ledger-head">
          The ledger
          <HelpHint label="The ledger">
            Every price is the same short receipt: the book price, minus the work still outstanding
            (buyers knock off one and a half times that bill, which is exactly the margin you earn
            by doing the work yourself), minus polish it is missing, plus any upgrades that count.
            On a listed car, the last line prices its doubts at the odds; prove the cause and your
            own number replaces the doubt.
          </HelpHint>
        </h4>
        <dl class="finance-grid ledger-grid">
          <div
            v-for="line in detail.valueLedger.lines"
            :key="line.id"
            class="finance-row"
            :data-test="'ledger-line-' + line.id"
          >
            <dt>{{ LEDGER_LINE_LABELS[line.id] }}</dt>
            <dd>{{ formatLedgerLineYen(line) }}</dd>
          </div>
        </dl>
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
            <dt>You say</dt>
            <dd data-test="you-say">{{ formatYen(detail.yourNumberYen) }}</dd>
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
          </dl>
        </template>
      </details>

      <section v-if="!detail.serviceJob" class="sell">
        <h3>Sell</h3>
        <p class="sell-est" data-test="sale-range">
          Expect {{ formatYen(detail.saleRangeYen.lowYen) }} to
          {{ formatYen(detail.saleRangeYen.highYen) }}, depending who bites.
        </p>

        <div v-if="offer" class="offer-card" data-test="pending-offer">
          <div class="offer-info">
            <p class="offer-copy">{{ offer.copy }}</p>
            <p class="offer-want" data-test="offer-want-line">
              {{ offer.buyerName }} - {{ offer.wantLine }}
            </p>
          </div>
          <div class="offer-actions">
            <button
              class="primary"
              data-test="accept-offer"
              @click="game.acceptOffer(detail.car.id)"
            >
              Accept
            </button>
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

        <div class="channel-picker" data-test="channel-picker">
          <p v-if="forSale && activeChannelId" class="active-channel" data-test="active-channel">
            Listed on {{ SELLING_CHANNEL_LABELS[activeChannelId] }}
          </p>
          <ul class="channel-options">
            <li v-for="id in SELLING_CHANNEL_ORDER" :key="id">
              <button
                type="button"
                class="channel-option"
                :class="{ selected: selectedChannelId === id }"
                :disabled="!!channelDisabledReason(id)"
                :title="channelDisabledReason(id) ?? undefined"
                :data-test="'channel-option-' + id"
                @click="selectedChannelId = id"
              >
                <span class="channel-name">{{ SELLING_CHANNEL_LABELS[id] }}</span>
                <span class="channel-fee">{{
                  sellingChannelFeeLabel(game.context.economy.sellingChannels[id])
                }}</span>
                <span class="channel-cadence">{{
                  sellingChannelCadenceLabel(game.context.economy.sellingChannels[id])
                }}</span>
              </button>
            </li>
          </ul>
          <div class="for-sale-toggle">
            <button data-test="list-on-channel" @click="listOnSelectedChannel">
              {{ forSale ? 'Re-list here' : 'List here' }}
            </button>
            <button v-if="forSale" data-test="stop-for-sale" @click="stopTakingOffers">
              Stop taking offers
            </button>
          </div>
          <span v-if="forSale && !offer" class="for-sale-hint">
            Taking offers - a buyer may show up tomorrow.
          </span>
        </div>
      </section>

      <section class="jobs">
        <h3>Work</h3>

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
              {{ job.laborSlotsSpent }}/{{ job.laborSlotsRequired }} labour
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
  color: var(--mg-neon-violet);
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
  display: flex;
  align-items: center;
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

/* The hero header - title/info on the left, the radar
   pinned top-right at a smaller size. The diagram, panel, and the rest of the
   page stack full-width below (the old two-column .cols grid is dissolved). */
.detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--mg-space-4);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

.hero-info {
  flex: 1 1 auto;
  min-width: 0;
}

.hero-radar {
  flex: 0 0 auto;
}

.scrap-shell-row {
  margin: var(--mg-space-2) 0 0;
}

.scrap-shell-btn {
  background: transparent;
  border-color: var(--mg-panel-edge);
  color: var(--mg-text-dim);
  padding: 2px var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.scrap-shell-btn.confirming {
  border-color: var(--mg-neon-pink);
  color: var(--mg-neon-pink);
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

.symptom-panel {
  background: var(--mg-panel);
  border: 1px solid var(--mg-danger);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin: var(--mg-space-4) 0;
}

.symptom-panel h3 {
  margin: 0 0 var(--mg-space-2);
}

.symptom-panel .symptom {
  margin-top: var(--mg-space-2);
}

.symptom-panel .symptom-line {
  margin: 0;
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

.symptom-panel .symptom-causes {
  list-style: none;
  margin: var(--mg-space-1) 0 0;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: var(--mg-fs-xs, 0.7rem);
  color: var(--mg-text-dim);
}

.symptom-panel .symptom-causes li {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.symptom-panel .symptom-causes .mark {
  color: var(--mg-neon-cyan);
  flex-shrink: 0;
}

.symptom-panel .symptom-causes li.eliminated .mark {
  color: var(--mg-success);
}

.symptom-panel .symptom-causes li.eliminated .label {
  text-decoration: line-through;
}

.symptom-panel .symptom-causes .delta {
  color: var(--mg-text-dim);
}

.workup-btn {
  margin-top: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.arriving-note {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-1) 0 var(--mg-space-3);
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

/* The bench strip under the diagram - benched assembly members as
   the same sprite block components, each selecting the docked panel. */
.bench-strip {
  margin: var(--mg-space-2) 0 0;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.bench-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin-top: var(--mg-space-1);
}

.bench-name {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin-right: var(--mg-space-2);
}

.bench-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 70px;
  padding: var(--mg-space-1);
  background: var(--mg-night-deep);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 3px;
  cursor: pointer;
}

.bench-block.selected {
  border-color: var(--mg-neon-cyan);
}

.bench-sprite {
  width: 100%;
  height: 34px;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
}

.bench-block-name {
  font-size: 0.55rem;
  line-height: 1;
  color: var(--mg-text-dim);
  text-align: center;
  pointer-events: none;
}

/* The docked info/action panel - the diagram's single
   companion, showing the selected block's identity and every action the old
   list row offered. */
.action-panel {
  margin: var(--mg-space-2) 0 0;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  padding: var(--mg-space-3);
  min-height: 4.5rem;
}

.panel-empty {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.panel-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
}

.panel-sprite {
  width: 40px;
  height: 28px;
  object-fit: contain;
  image-rendering: pixelated;
}

.panel-name {
  color: var(--mg-text);
  font-size: var(--mg-fs-md);
}

.panel-grade {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: capitalize;
}

.panel-blockers {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.panel-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin-top: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
}

.panel-actions.assembly-action {
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.replace-btn.active-target {
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
}

.planned-install {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
}

.plan-preview {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
}

.plan-arrow {
  color: var(--mg-text-dim);
}

/* The repair-step button carries its full price inline,
   never on hover. */
.step-up.loud {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
  line-height: 1.2;
}

.clear-plan {
  min-width: 28px;
  padding: 2px 8px;
  font-size: var(--mg-fs-md);
  line-height: 1;
  color: var(--mg-neon-pink);
  border-color: var(--mg-panel-edge);
}

.finances {
  margin: var(--mg-space-4) 0;
}

.finances-summary {
  display: list-item;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  cursor: pointer;
}

.finances-intro {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: var(--mg-space-2) 0;
}

.ledger-head {
  margin: 0 0 var(--mg-space-1);
}

/* The value ledger sits above the money-in rows, ruled off so the receipt
   reads as one block and the spend history as another. */
.ledger-grid {
  margin-bottom: var(--mg-space-2);
  padding-bottom: var(--mg-space-2);
  border-bottom: var(--mg-border);
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

.foundation-warning {
  margin: var(--mg-space-2) 0 0;
  padding: var(--mg-space-2);
  border: 1px solid var(--mg-danger);
  border-radius: var(--mg-radius);
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

.passion-notice {
  margin: var(--mg-space-2) 0 0;
  padding: var(--mg-space-2);
  border: 1px dashed var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

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

.offer-info {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
}

.offer-copy {
  margin: 0;
  font-size: var(--mg-fs-sm);
}

.offer-want {
  margin: 0;
  color: var(--mg-text-dim);
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

.channel-picker {
  margin-top: var(--mg-space-2);
}

.active-channel {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.channel-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
  padding: 0;
  list-style: none;
}

.channel-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  background: var(--mg-panel);
  border: 1px solid var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
  cursor: pointer;
}

.channel-option.selected {
  border-color: var(--mg-neon-cyan);
}

.channel-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.channel-name {
  font-size: var(--mg-fs-sm);
  color: var(--mg-text);
}

.channel-fee {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.channel-cadence {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.for-sale-toggle {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  margin-top: var(--mg-space-2);
}

.for-sale-hint {
  display: block;
  margin-top: var(--mg-space-2);
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

.missing-tag {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
  font-weight: bold;
}

.absent-tag {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.uncertain-tag {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
  font-weight: bold;
  cursor: help;
}

.remove-btn {
  color: var(--mg-neon-pink);
}

.blocked-reason {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

/* The "your tools finish at fine" hint pointing at
   the tier-2 machine - a buy-the-machine prompt, so it reads as guidance, not a
   fee. */
.ceiling-caption {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

.machine-hire-panel {
  margin-top: var(--mg-space-3);
  padding-top: var(--mg-space-3);
  border-top: var(--mg-border);
}

.machine-hire-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-1);
}

.machine-hire-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
}

.machine-hire-name {
  flex: 1 1 auto;
  min-width: 0;
}

.chip {
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: 0 var(--mg-space-1);
  font-size: var(--mg-fs-sm);
  white-space: nowrap;
}

.chip.owned {
  color: var(--mg-success);
}

.chip.hired {
  color: var(--mg-yen);
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
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
}

.staged-label {
  flex: 1 1 auto;
  min-width: 0;
}

/* Each staged item lists its own yen and slots. */
.staged-attr {
  color: var(--mg-yen);
  white-space: nowrap;
}

.confirm-lever {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--mg-space-2);
}

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

.crew-saving {
  margin: var(--mg-space-1) 0 0;
  text-align: center;
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.jobs {
  margin: var(--mg-space-4) 0;
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
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-violet);
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
