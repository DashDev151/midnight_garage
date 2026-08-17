<script setup lang="ts">
import type {
  AssemblyId,
  CarPartId,
  ComponentId,
  ConditionBand,
  Job,
  SellingChannelId,
  ZoneId,
} from '@midnight-garage/content'
import {
  ASSEMBLIES,
  ComponentIdSchema,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import {
  carInBodyBay,
  zoneConditionBand,
  type DynoSessionGateReason,
  type FittedMachiningGateReason,
  type FittedMachiningOfferRow,
} from '@midnight-garage/sim'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import HelpHint from '../components/HelpHint.vue'
import { partSpriteDataUrl } from '../components/partSprites'
import ServiceTaskList from '../components/ServiceTaskList.vue'
import StatRadar from '../components/StatRadar.vue'
import WorkshopViews, { type WorkshopSelection } from '../components/WorkshopViews.vue'
import { useCarPartDropZones } from '../composables/useCarPartDropZones'
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
import { useUiStore } from '../stores/uiStore'
import { MACHINE_LINE_NAMES } from '../utils/dayLogFormat'
import { DYNO_NAME } from '../utils/dynoLabels'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import {
  LEDGER_LINE_LABELS,
  formatLedgerLineYen,
  ledgerBreakdownLines,
  workRowFor,
} from '../utils/ledgerLabels'
import { formatAuthenticityCost, formatReliabilityCost } from '../utils/machiningFigures'
import { SETUP_REFUSALS } from '../utils/machiningRefusals'
import { colourTokenDisplayName } from '../utils/paintFamilies'
import { addressesOverlap } from '../utils/partAddress'
import { repairStepText } from '../utils/repairStepLabels'
import {
  SELLING_CHANNEL_LABELS,
  sellingChannelAudienceLabel,
  sellingChannelCadenceLabel,
  sellingChannelFeeLabel,
} from '../utils/sellingChannelLabels'
import { zoneWhyChips } from '../utils/zoneSeverity'
import { mapBackTarget } from './mapBack'

const game = useGameStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const carId = computed(() => String(route.params.id))
const detail = computed(() => game.carDetail(carId.value))

/** The ledger's forward-looking work row: what fixing this car up adds,
 * priced against the bill (`workRowFor`, both figures the sim's own). */
const workRow = computed(() =>
  detail.value ? workRowFor(detail.value.valueLedger, detail.value.workBillYen) : null,
)

/** The value ledger's lines, minus 'wear' - the work row above already
 * reads that line forward. */
const ledgerBreakdown = computed(() =>
  detail.value ? ledgerBreakdownLines(detail.value.valueLedger) : [],
)

/** This screen has many entry points (a bay slot, a service-job link, the
 * dyno's own "back to the car" link...) and all of them fall back to the
 * garage exactly as this always has (`mapBack.ts`). */
const backTarget = computed(() => mapBackTarget(route.query.from, { name: 'garage' }))

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

/** Each dyno refusal in the same plain words the hire rows use for theirs.
 * `not-found` carries none: a car that cannot be resolved never renders a
 * row to explain itself on. */
const DYNO_GATE_LABELS: Record<NonNullable<DynoSessionGateReason>, string | null> = {
  'not-in-service-bay': 'Needs to be in a service bay',
  'no-labour': 'No labour left today',
  'no-cash': 'Not enough cash',
  'not-found': null,
}

/** Why this car cannot go on the rollers right now - null when nothing
 * refuses it. */
const dynoGateReason = computed<string | null>(() => {
  const d = detail.value
  if (!d) return null
  const reason = game.dynoSessionGateReason(d.car.id)
  return reason ? DYNO_GATE_LABELS[reason] : null
})

/** True while this exact car is the one on the rollers - the row then offers
 * the sheet rather than another session. */
const onTheRollers = computed(() => game.dynoSessionCarId === detail.value?.car.id)

/**
 * Runs the session and stays put - the row itself turns into the link to the
 * sheet. Nothing is yanked away from a player mid-job, and the reading keeps
 * until another car takes the rollers or the day ends.
 */
function onDynoSessionClick(): void {
  const d = detail.value
  if (!d) return
  game.runDynoSession(d.car.id)
}

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

/**
 * A workup collapses every symptom to its true cause in one click - once it
 * has, dock the panel on the first resolved verdict's own part, so the
 * diagram shows exactly what the checklist just named. Only when nothing is
 * already docked: it never yanks the panel off a part the player is
 * actively looking at.
 */
function onWorkupClick(): void {
  const d = detail.value
  if (!d) return
  game.resolveOwnedWorkup(d.car.id)
  if (panelTarget.value) return
  const verdictPartId = detail.value?.symptoms.find((s) => s.verdict)?.verdict?.partId
  if (verdictPartId) panelTarget.value = { kind: 'part', partId: verdictPartId }
}

/** Every real part row within a group, for the panel's lookups. */
function rowsFor(componentId: ComponentId) {
  return detail.value ? game.partsInGroup(detail.value.car.id, componentId) : []
}

// --- The workshop views are the page. The docked info/action panel replaces
// the old components list; a view region or a bench-strip member is its
// target. -----------------------------------------------------------------

/**
 * What the docked panel is currently showing: a part, a body zone, or a
 * benched assembly member - a part and a zone are told apart by `kind` rather
 * than by their id, matching the discriminated shape the views themselves
 * emit.
 */
type PanelTarget =
  | { kind: 'part'; partId: CarPartId }
  | { kind: 'zone'; zoneId: ZoneId }
  | { kind: 'bench'; containerId: string; carPartId: CarPartId }

const panelTarget = ref<PanelTarget | null>(null)
watch(carId, () => {
  panelTarget.value = null
})

/** A click on a view region docks the panel on whatever was pointed at - the
 * selection payload is already the panel's own target shape. */
function onWorkshopSelect(selection: WorkshopSelection): void {
  panelTarget.value = selection
}

/**
 * A click on a bench member row: while a pick carrying a part that fits this
 * EMPTY slot is live, the click resolves the fit (the same "tap a picked
 * card's destination" idiom every other drop zone uses); otherwise it just
 * docks the panel on the member, as before.
 */
function selectBenchMember(containerId: string, carPartId: CarPartId): void {
  const picked = dragSession.value
  const payload = picked?.mode === 'pick' ? picked.payload : null
  if (typeof payload === 'string' && acceptsBenchFit(carPartId, payload)) {
    benchDropZones[carPartId].onClick()
    return
  }
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
  else if (job.kind === 'machine-part' && job.machiningOperationId) {
    game.machineFittedPart(d.car.id, job.machiningOperationId)
  } else if (job.partInstanceId) game.install(d.car.id, componentId, job.partInstanceId, carPartId)
}

/** What the Continue control names, so a half-finished setup is never offered
 * as an install. Empty when nothing is open at this address. */
function continueLabelAt(componentId: ComponentId, carPartId?: CarPartId): string {
  const job = jobFor(componentId, carPartId)
  if (!job) return ''
  if (job.kind === 'repair-zone') return 'Continue repair'
  return job.kind === 'machine-part' ? 'Continue setup' : 'Continue install'
}

/** One open job as the Work list reads it: what is being done, where, and how
 * far in. */
function jobLine(job: Job): string {
  const target = job.carPartId
    ? game.carPartLabel(job.carPartId)
    : game.componentLabel(job.componentId)
  const what =
    job.kind === 'repair-zone'
      ? `repair ${target}`
      : job.kind === 'machine-part'
        ? `set up ${target}`
        : 'install part'
  return `${what} · ${job.laborSlotsSpent}/${job.laborSlotsRequired} labour`
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

/** Who this channel reaches, from its own authored buyer pool - `null` for a
 * channel with no persona behind it at all (the trade network). */
function audienceLabelFor(id: SellingChannelId): string | null {
  return sellingChannelAudienceLabel(game.context.economy.sellingChannels[id], game.context.buyers)
}

/** Why `id` can't be armed right now, `null` when it can - the existing
 * disabled-reason idiom (`AuctionScreen.vue`'s buyout button: disabled +
 * title share the same check). The cash gate comes first, then (sprint148.md)
 * the forecourt-space gate a `requiresForecourt` channel needs. A channel the
 * shop has not earned is absent from the picker entirely (sprint209.md task
 * D) rather than shown here as a locked, disabled row. */
function channelDisabledReason(id: SellingChannelId): string | null {
  const feeYen = game.context.economy.sellingChannels[id].feeYen
  if (game.cashYen < feeYen) return `Not enough cash - listing here costs ${formatYen(feeYen)}`
  const d = detail.value
  if (d) {
    const forecourtReason = game.forecourtBlockedReason(d.car.id, id)
    if (forecourtReason) return forecourtReason
  }
  return null
}

/** List (or re-list) the car on the armed channel - re-listing on a
 * different channel pays that channel's fee again (the sim's own rule); a
 * one-draw channel (`weekendMeet`, `collectorNetwork`) re-charges even on the
 * SAME channel, since its one guaranteed draw is spent the moment it
 * resolves. */
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
  return (
    (d.ledger.purchaseYen ?? 0) + d.ledger.repairYen + d.ledger.partsYen + d.ledger.listingFeesYen
  )
})

// --- Replace, remove ---

/** The per-part click-per-rung repair - each click repairs one more band,
 * instantly, through the same `repair` resolver the plain group button
 * uses. A rung that outruns today's labour leaves an ordinary continuable
 * `Job`, picked up by the `addressBusy`/`continueJob` branch above the next
 * time this row renders. */
function onRepairStepClick(componentId: ComponentId, carPartId: CarPartId): void {
  const d = detail.value
  const step = nextPartStep(componentId, carPartId)
  if (!d || !step) return
  game.repair(d.car.id, componentId, step.targetBand, carPartId)
}

/**
 * The Warehouse's fit scope, when it points at a slot on THIS car - the
 * drawer itself is mounted once at the app root (`WarehouseDrawer.vue`);
 * this screen only commands it open with a scope and reads the shared
 * context back for its drop zones and highlight state.
 */
const fitContext = computed(() => {
  const fit = ui.warehouseFit
  const d = detail.value
  return fit && d && fit.carId === d.car.id ? fit : null
})

/** Which part slot the Warehouse is fitting for right now, if any. */
const activeFitPart = computed<CarPartId | null>(() => fitContext.value?.carPartId ?? null)

/** Open the Warehouse scoped to a benched member's EMPTY slot - the same
 * pick-from-your-parts flow an on-car fit uses; selection fits straight
 * into the container. */
function openBenchFit(containerId: string, carPartId: CarPartId): void {
  const d = detail.value
  if (d) ui.openWarehouse({ carId: d.car.id, carPartId, benchContainerId: containerId })
}

const dragSession = useDragSession()

/** One drop zone per real part, bound both to the sidebar's own Fit button
 * and to the workshop diagram's part regions (`WorkshopViews`), so a drag
 * lands the same way from either surface - the shared build every diagram
 * host uses (`useCarPartDropZones`), closing the Warehouse drawer on a
 * successful drop since this screen is the one that owns it. */
const { dropZones, acceptsInstall } = useCarPartDropZones(detail, () => ui.closeWarehouse())

function onFitClick(carPartId: CarPartId): void {
  const picked = dragSession.value
  const payload = picked?.mode === 'pick' ? picked.payload : null
  if (typeof payload === 'string' && acceptsInstall(carPartId, payload)) {
    dropZones[carPartId].onClick()
    return
  }
  const d = detail.value
  if (!d) return
  if (activeFitPart.value === carPartId && !fitContext.value?.benchContainerId) {
    ui.closeWarehouse()
  } else {
    ui.openWarehouse({ carId: d.car.id, carPartId })
  }
}

/** Pull whatever's occupying this slot into inventory - free and instant. */
function onRemoveClick(carPartId: CarPartId): void {
  const d = detail.value
  if (!d) return
  game.removePart(d.car.id, carPartId)
}

/**
 * The remove affordance's own gate reason (structural refusals - not
 * removable, blocked-by - plus the buried engine/drivetrain machine-shop
 * gate) - `null` when nothing blocks it.
 */
function removeBlockedReasonFor(carPartId: CarPartId): string | null {
  const d = detail.value
  return d ? game.removeBlockedReason(d.car.id, carPartId) : null
}

/** The Remove affordance's own machine-labour disclosure - `''` when
 * ungated or the machine is already owned/hired. Never blocking:
 * a machine-gated slot always comes off, just slower by hand. */
function removeMachineNoteFor(carPartId: CarPartId): string {
  const d = detail.value
  return d ? game.removeMachineNoteFor(d.car.id, carPartId) : ''
}

/**
 * The install/replace affordance's own machine-labour disclosure - `''`
 * when owned, hired for today, or ungated. Covers a buried engine/drivetrain
 * slot and a suspension/body/interior signature slot alike. Never blocking:
 * the affordance always works, this just names what it
 * costs by hand and what hiring the line would buy back.
 */
function installMachineNoteFor(carPartId: CarPartId): string {
  const d = detail.value
  return d ? game.installMachineNoteFor(d.car.id, carPartId) : ''
}

/**
 * The per-part on-car repair affordance's own machine-labour disclosure -
 * `''` when owned, hired for today, or ungated. Per-part repair is
 * bench-only for any non-`surface` slot, so this only ever fires for a
 * surface signature slot (bodywork, seats, dashGauges).
 */
function repairMachineNoteFor(carPartId: CarPartId): string {
  const d = detail.value
  return d ? game.repairMachineNoteFor(d.car.id, carPartId) : ''
}
/** The tier-1 repair-ceiling caption for this part's group, or null. */
function repairCeilingCaptionFor(componentId: ComponentId, carPartId: CarPartId): string | null {
  const d = detail.value
  return d ? game.repairCeilingCaption(d.car.id, componentId, carPartId) : null
}

// --- Setup work (docs/design/systems/the-workbench.md, "The exceptions") ---

/**
 * The setup operations the selected slot offers: corner weighting on the
 * springs, show fitment on the rims. Neither can be judged with the part off
 * the car, so they are done here rather than in the machine shop, and each
 * answers to its own tool line rather than to the engine's. Empty on every
 * other slot, so the block only appears where there is something to do.
 */
const setupOffers = computed<readonly FittedMachiningOfferRow[]>(() => {
  const d = detail.value
  const partId = selectedPartId.value
  return d && partId ? game.fittedMachiningOffers(d.car.id, partId) : []
})

function setupRefusal(reason: FittedMachiningGateReason | null): string | null {
  return reason ? SETUP_REFUSALS[reason] : null
}

/** One setup operation's whole trade on a line, in the same loud-figure idiom
 * every other control on this panel uses. Originality and reliability read
 * through the machine shop's own wording (`machiningFigures.ts`), so the same
 * cost is never stated two ways. */
function setupFigures(offer: FittedMachiningOfferRow): string {
  const figures: string[] = []
  if (offer.handlingFraction > 0) {
    figures.push(`Handling +${(offer.handlingFraction * 100).toFixed(1)} per cent`)
  }
  if (offer.stylePoints > 0) figures.push(`Style +${offer.stylePoints}`)
  figures.push(`Originality ${formatAuthenticityCost(offer.authenticityCost)}`)
  figures.push(`Reliability ${formatReliabilityCost(offer.reliabilityCost)}`)
  figures.push(`${offer.labourPoints} labour`)
  return figures.join(' · ')
}

function onSetupClick(operationId: string): void {
  const d = detail.value
  if (d) game.machineFittedPart(d.car.id, operationId)
}

// --- Bench work ---

function benchFitCandidates(carPartId: CarPartId) {
  return game.pickableParts.filter(
    (sp) => sp.part.carPartId === carPartId && sp.instance.band !== 'scrap',
  )
}

/** Every `CarPartId` that is some assembly's member slot - straight off
 * content (`ASSEMBLIES`), never re-enumerated, so a fourth assembly picks up
 * a drop zone on its own members for free. */
const ASSEMBLY_MEMBER_PART_IDS: readonly CarPartId[] = ASSEMBLIES.flatMap((a) => a.members)

/** The benched container and member view holding `carPartId` on this car, or
 * `null` when it isn't currently benched at all (on the car, or not an
 * assembly member here) - the one lookup both the accept predicate and the
 * drop resolver below key off. */
function benchMemberFor(
  carPartId: CarPartId,
): { containerId: string; member: BenchMemberView } | null {
  const d = detail.value
  if (!d) return null
  for (const container of game.benchContainersFor(d.car.id)) {
    const member = container.members.find((m) => m.carPartId === carPartId)
    if (member) return { containerId: container.id, member }
  }
  return null
}

/** Whether `partInstanceId` legally fits the benched EMPTY member slot for
 * `carPartId` - the same "right slot, not scrap" set `benchFitCandidates`
 * renders the picker from, gated first on the slot actually being both
 * benched and empty (a mounted member has no slot to drop into). */
function acceptsBenchFit(carPartId: CarPartId, partInstanceId: string): boolean {
  const found = benchMemberFor(carPartId)
  if (!found || found.member.instance) return false
  return benchFitCandidates(carPartId).some((sp) => sp.instance.id === partInstanceId)
}

/** One drop zone per assembly member slot, built once like `dropZones`
 * above. Drop resolves through `fitAssemblyMember`, the exact resolver the
 * Warehouse's own bench-fit pick uses, so drag and click land the same way. */
const benchDropZones = Object.fromEntries(
  ASSEMBLY_MEMBER_PART_IDS.map((carPartId) => [
    carPartId,
    useDropZone<string>(
      (partInstanceId) => acceptsBenchFit(carPartId, partInstanceId),
      (partInstanceId) => {
        const found = benchMemberFor(carPartId)
        if (found) game.fitAssemblyMember(found.containerId, carPartId, partInstanceId)
      },
    ),
  ]),
) as Record<CarPartId, DropZoneHandle>

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

// --- Body zones: read-only condition (docs/design/systems/workshop-rework.md
// for the underlying model; sprint208.md moved the working panel to the body
// shop room - this screen keeps only the band, the why, and the door there) ---

const zoneState = computed(() => detail.value?.car.zoneState ?? null)

/** The car's own two derived body bands (A1) - read straight off the
 * always-present carrier slots `applyDerivedBodyBands` writes at generation
 * and after every zone mutation, never re-derived here. */
const bodyworkBand = computed<ConditionBand | null>(
  () => detail.value?.car.parts.bodywork.installed?.band ?? null,
)
const paintBand = computed<ConditionBand | null>(
  () => detail.value?.car.parts.paint.installed?.band ?? null,
)

/**
 * The zone the panel is docked on: the live zone state, its display name,
 * its own condition band, and its why chips - the read-only half of what the
 * zone-mode panel used to show (A1-A3). The next action (A4) and every
 * working control now live in the body shop room instead.
 */
const selectedZone = computed(() => {
  const target = panelTarget.value
  const zones = zoneState.value
  if (target?.kind !== 'zone' || !zones) return null
  const zone = zones[target.zoneId]
  return {
    zoneId: target.zoneId,
    zone,
    name: titleCaseFromSlug(target.zoneId),
    band: zoneConditionBand(zone),
    whyChips: zoneWhyChips(zone, detail.value?.model.uid),
  }
})

/** The display name for a colour token on THIS car - `colourTokenDisplayName`
 * (shared with the auction lot card) prefers this car's own iconic
 * manufacturer name where one applies. */
function carColourTokenDisplayName(token: string): string {
  return colourTokenDisplayName(token, detail.value?.model.uid)
}

/** What this car left the factory wearing, named in full - the iconic name
 * where one applies, the plain palette name(s) otherwise. */
const factoryColourCaption = computed<string>(() =>
  detail.value ? carColourTokenDisplayName(detail.value.car.factoryColour) : '',
)

/** Whether the door to the body shop opens for real, or just states what to
 * do first - the one gate every zone/pipeline action reads (sprint208.md),
 * asked here of THIS car rather than of whichever car actually sits in the
 * bay right now. */
const carInBodyBayNow = computed(() =>
  detail.value ? carInBodyBay(game.gameState, detail.value.car.id) : false,
)

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
    <RouterLink :to="backTarget" class="back">&lt; Back</RouterLink>

    <div class="detail-hero">
      <div class="hero-info">
        <h2>{{ detail.displayName }}</h2>
        <p class="sub">
          {{ game.fitmentClassLabel(fitmentClassForTier(detail.model.tier)) }} ·
          {{ detail.car.year }} · {{ detail.car.mileageKm.toLocaleString() }} km ·
          {{ factoryColourCaption }}
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

    <p
      v-if="!inTransit && detail.supportReadout"
      class="support-readout"
      :class="detail.supportReadout.band"
      data-test="support-readout"
    >
      {{ detail.supportReadout.copy }}
    </p>

    <p
      v-if="!inTransit && detail.unpaintedPanelsNote"
      class="unpainted-note"
      data-test="unpainted-panels-note"
    >
      {{ detail.unpaintedPanelsNote }}
    </p>

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

          <!-- The verdict: elimination down to one candidate names the fault,
               the part it lives in, and what fixing it costs - the store's
               own `serviceJobCostBreakdown` read, never a second sum. -->
          <p
            v-if="symptom.verdict"
            class="symptom-verdict"
            :data-test="'verdict-' + symptom.symptomIndex"
          >
            Must be the {{ symptom.verdict.causeLabel }}, then.
            <span class="verdict-fix"
              >{{ symptom.verdict.partLabel }} - about {{ formatYen(symptom.verdict.costYen) }} and
              {{ symptom.verdict.laborSlots }} labour to put right.</span
            >
          </p>
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
                ? "Work's done - hand it back from the phone to get paid."
                : 'Not finished - handing it back now forfeits the payout.'
            }}
          </span>
        </div>
      </section>

      <!-- A1: the whole-body verdict, at a glance beside the diagram - the
           two derived bands and nothing else. The zones behind them carry
           the detail (A2-A4). -->
      <section v-if="bodyworkBand || paintBand" class="body-verdict" data-test="body-verdict">
        <span class="body-verdict-item" data-test="body-verdict-bodywork">
          Bodywork <BandChip :band="bodyworkBand" />
        </span>
        <span class="body-verdict-item" data-test="body-verdict-paint">
          Paint <BandChip :band="paintBand" />
        </span>
      </section>

      <!-- The workshop is the page. Full-width views, then the bench strip
           (if any), then the docked info/action panel every region feeds. -->
      <WorkshopViews :car-id="detail.car.id" :drop-zones="dropZones" @select="onWorkshopSelect" />

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
              'active-target': benchDropZones[member.carPartId].isActiveTarget.value,
            }"
            :data-test="'bench-member-' + member.carPartId"
            @click="selectBenchMember(container.id, member.carPartId)"
            @pointerup="benchDropZones[member.carPartId].onPointerUp"
            @pointerenter="benchDropZones[member.carPartId].onPointerEnter"
            @pointerleave="benchDropZones[member.carPartId].onPointerLeave"
          >
            <img
              class="bench-sprite"
              :src="spriteFor(member.carPartId)"
              alt=""
              aria-hidden="true"
            />
            <span class="bench-block-name">{{ member.displayName }}</span>
            <BandChip :band="member.band" />
            <span
              v-if="benchDropZones[member.carPartId].isActiveTarget.value"
              class="bench-block-drop-hint"
              :data-test="'bench-drop-here-' + member.carPartId"
              >Place here</span
            >
          </button>
        </div>
      </section>

      <section class="action-panel" data-test="part-action-panel">
        <p v-if="!panelHead && !selectedZone" class="panel-empty" data-test="panel-empty">
          Pick anything in the views above and what you can do to it turns up here.
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
              title="Could be worse than shown - an unresolved symptom may be hiding damage"
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
                  {{ continueLabelAt(selectedGroup, selectedRow.partId) }}
                </button>
                <span class="slot-empty">working…</span>
              </template>
              <span v-else class="slot-empty">working (group job)…</span>
            </template>

            <template v-else>
              <!-- Repairs one band the moment it's clicked; a rung that
                   outruns today's labour leaves an ordinary continuable job,
                   picked up by the "working…" branch above the next time this
                   row renders. -->
              <template v-if="nextPartStep(selectedGroup, selectedRow.partId)">
                <button
                  type="button"
                  class="step-up loud"
                  :data-test="'repair-part-' + selectedRow.partId"
                  :title="partStepTitle(selectedGroup, selectedRow)"
                  @click="onRepairStepClick(selectedGroup, selectedRow.partId)"
                >
                  {{ repairStepText(nextPartStepOrFallback(selectedGroup, selectedRow.partId)) }}
                </button>
                <span
                  v-if="repairMachineNoteFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'assist-fee-repair-' + selectedRow.partId"
                  >{{ repairMachineNoteFor(selectedRow.partId) }}</span
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

              <!-- Replace needs an empty slot, except on a shell carrier
                   (chassis, bodywork, paint), whose slot is never empty and
                   whose part is swapped in place. A scrap one is past repair,
                   so this is the only way out of it. Fitting happens the
                   instant a part is picked, dropped, or clicked. -->
              <template v-if="!selectedRow.installedPartName || selectedRow.replaceInPlace">
                <button
                  type="button"
                  class="fit-btn"
                  :class="{ 'active-target': dropZones[selectedRow.partId].isActiveTarget.value }"
                  :data-test="'fit-part-' + selectedRow.partId"
                  @pointerup="dropZones[selectedRow.partId].onPointerUp"
                  @pointerenter="dropZones[selectedRow.partId].onPointerEnter"
                  @pointerleave="dropZones[selectedRow.partId].onPointerLeave"
                  @click="onFitClick(selectedRow.partId)"
                >
                  {{ dropZones[selectedRow.partId].isActiveTarget.value ? 'Drop here' : 'Fit' }}
                </button>
                <span
                  v-if="installMachineNoteFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'assist-fee-' + selectedRow.partId"
                  >{{ installMachineNoteFor(selectedRow.partId) }}</span
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
                  v-if="removeMachineNoteFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'remove-machine-note-' + selectedRow.partId"
                  >{{ removeMachineNoteFor(selectedRow.partId) }}</span
                >
                <span
                  v-if="removeBlockedReasonFor(selectedRow.partId)"
                  class="blocked-reason"
                  :data-test="'remove-blocked-' + selectedRow.partId"
                  >{{ removeBlockedReasonFor(selectedRow.partId) }}</span
                >
              </template>
            </template>
          </div>

          <!-- A benched member's own actions: it comes off before its
               successor goes on, the same remove-then-fit ruling the
               car-level slots follow - never in one action. Putting a
               member right is bench work, which means pulling it into the
               warehouse and carrying it to the workshop floor. -->
          <div v-else-if="selectedBench" class="panel-actions">
            <!-- A mounted member comes OFF the assembly before its successor
                 goes on - dead rubber never stays waiting. Free, into the bin. -->
            <button
              v-if="selectedBench.member.instance"
              type="button"
              class="remove-btn"
              :data-test="'bench-remove-' + selectedBench.member.carPartId"
              title="Off the assembly and into inventory, free"
              @click="
                game.removeAssemblyMember(selectedBench.containerId, selectedBench.member.carPartId)
              "
            >
              Take it off{{ labourSuffix(game.actionPoints.benchRemoveMember) }}
            </button>
            <!-- Fitting goes through the same pick-from-your-parts drawer an
                 on-car Fit uses; selection lands in this EMPTY member slot. -->
            <button
              v-else
              type="button"
              class="fit-btn"
              :data-test="'bench-fit-' + selectedBench.member.carPartId"
              @click="openBenchFit(selectedBench.containerId, selectedBench.member.carPartId)"
            >
              Fit{{ labourSuffix(game.actionPoints.benchFitMember) }}
            </button>
            <!-- Never a silent dead end - when the slot is empty and there is
                 nothing on hand to fit into it, state the situation; the
                 player navigates the parts market themselves. -->
            <span
              v-if="
                benchFitCandidates(selectedBench.member.carPartId).length === 0 &&
                benchMemberBelowFine(selectedBench.member)
              "
              class="slot-empty"
              :data-test="'bench-empty-' + selectedBench.member.carPartId"
              >No spare {{ benchShopLabel(selectedBench.member.carPartId) }} on hand - the parts
              shop sells them.</span
            >
            <!-- Names the line the Fit flow needs before a fit can land. -->
            <span
              v-if="selectedBench.member.fitGateReason"
              class="blocked-reason"
              :data-test="'bench-fit-gate-' + selectedBench.member.carPartId"
              >{{ selectedBench.member.fitGateReason }}</span
            >
          </div>

          <!-- Setup work: the operations that can only be judged with the car
               assembled, so they live on the car's own screen rather than in
               the machine shop, and answer to their own tool line. -->
          <div v-if="setupOffers.length > 0" class="panel-actions setup-actions">
            <span class="zone-sub">Setup</span>
            <div
              v-for="setup in setupOffers"
              :key="setup.operation.id"
              class="setup-offer"
              :data-test="'setup-offer-' + setup.operation.id"
            >
              <div class="setup-head">
                <span class="setup-name">{{ setup.operation.displayName }}</span>
                <button
                  type="button"
                  class="step-up loud"
                  :disabled="!!setup.gateReason"
                  :title="setupRefusal(setup.gateReason) ?? undefined"
                  :data-test="'setup-do-' + setup.operation.id"
                  @click="onSetupClick(setup.operation.id)"
                >
                  {{ setup.applied ? 'Done' : 'Set it up' }}
                </button>
              </div>
              <p class="setup-note">{{ setup.operation.description }}</p>
              <p class="setup-figures" :data-test="'setup-figures-' + setup.operation.id">
                {{ setupFigures(setup) }}
              </p>
              <p
                v-if="setupRefusal(setup.gateReason)"
                class="blocked-reason"
                :data-test="'setup-refusal-' + setup.operation.id"
              >
                {{ setupRefusal(setup.gateReason) }}
              </p>
            </div>
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
              Refit assembly{{ labourSuffix(panelAssemblyRow.refitLabourPoints) }}
            </button>
            <button
              v-else
              type="button"
              :disabled="!panelAssemblyRow.canRemove"
              :data-test="'remove-assembly-' + panelAssemblyRow.assemblyId"
              @click="game.removeAssembly(detail.car.id, panelAssemblyRow.assemblyId)"
            >
              Remove assembly{{ labourSuffix(panelAssemblyRow.removeLabourPoints) }}
            </button>
            <span
              v-if="panelAssemblyRow.blockedReason"
              class="blocked-reason"
              :data-test="'assembly-blocked-' + panelAssemblyRow.assemblyId"
              >{{ panelAssemblyRow.blockedReason }}</span
            >
            <span
              v-if="panelAssemblyRow.machineNote"
              class="blocked-reason"
              :data-test="'assembly-machine-note-' + panelAssemblyRow.assemblyId"
              >{{ panelAssemblyRow.machineNote }}</span
            >
          </div>
        </template>

        <!-- The same docked panel, in its zone mode: read-only condition
             (sprint208.md moved the working controls to the body shop room)
             - the band, the why, and a door there. -->
        <template v-else-if="selectedZone">
          <div class="panel-head">
            <span class="panel-name" data-test="panel-name">{{ selectedZone.name }}</span>
            <!-- An absent panel is forced to the `scrap` band internally (no
                 sixth band value spells "missing") - there is no condition to
                 grade on nothing, so the chip is skipped outright rather than
                 showing the player a lie. -->
            <BandChip
              v-if="!selectedZone.zone.panelMissing"
              :band="selectedZone.band"
              :data-test="'zone-band-' + selectedZone.zoneId"
            />
            <span
              v-if="selectedZone.zone.panelMissing"
              class="missing-tag"
              data-test="zone-panel-off"
              >Missing</span
            >
          </div>

          <!-- A3: the why, as icons - at most two words each, never a sentence. -->
          <ul
            v-if="selectedZone.whyChips.length > 0"
            class="zone-why"
            :data-test="'zone-why-' + selectedZone.zoneId"
          >
            <li
              v-for="(chip, index) in selectedZone.whyChips"
              :key="index"
              class="zone-why-chip"
              :data-test="'zone-why-chip-' + selectedZone.zoneId + '-' + index"
            >
              <span
                class="zone-why-icon"
                :style="chip.hex ? { backgroundColor: chip.hex } : undefined"
                aria-hidden="true"
                >{{ chip.hex ? '' : chip.icon }}</span
              >
              {{ chip.label }}
            </li>
          </ul>

          <p class="factory-colour" :data-test="'factory-colour-' + selectedZone.zoneId">
            Factory colour: {{ factoryColourCaption }}
          </p>

          <!-- The one door: body work happens in the body shop room now, not
               here - a real link when this car is in its bay, a plain
               caption naming what to do first otherwise. Never a dead
               button. -->
          <div class="panel-actions">
            <RouterLink
              v-if="carInBodyBayNow"
              :to="{ name: 'body-shop' }"
              class="step-up loud body-shop-door"
              data-test="to-body-shop"
            >
              To the body shop
            </RouterLink>
            <span v-else class="slot-empty" data-test="body-shop-door-hint">
              Move her into the body bay first.
            </span>
          </div>
        </template>
      </section>

      <section class="machine-hire-panel" data-test="machine-hire-panel">
        <h4>
          Machine hire
          <HelpHint label="Machine hire">
            Pay once, use it free till End Day - it never lands on one car's bill.
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
          <li class="machine-hire-row" data-test="machine-hire-row-dyno">
            <span class="machine-hire-name">{{ DYNO_NAME }}</span>
            <span v-if="game.dynoOwned" class="chip owned" data-test="machine-hire-chip-dyno"
              >In-house</span
            >
            <span
              v-else-if="game.dynoHiredToday"
              class="chip hired"
              data-test="machine-hire-chip-dyno"
              >Hired today</span
            >
            <RouterLink
              v-if="onTheRollers"
              :to="{ name: 'dyno' }"
              class="hire-btn"
              data-test="dyno-read-sheet"
              >Read the sheet</RouterLink
            >
            <button
              v-else
              type="button"
              class="hire-btn"
              :disabled="!!dynoGateReason"
              :title="dynoGateReason ?? undefined"
              data-test="run-dyno-session"
              @click="onDynoSessionClick"
            >
              Put it on the rollers ({{ game.dynoOwned ? 'no fee' : formatYen(game.dynoHireFeeYen)
              }}{{ labourSuffix(game.pointsPerLabour) }})
            </button>
          </li>
          <!-- The machine shop is a station in the garage, not a machine:
               there is nothing here to hire and nothing to own, so this row
               is the door and carries no ownership chip. What machinery the
               station holds is listed in its own panel, which this link
               opens directly. -->
          <li class="machine-hire-row" data-test="machine-hire-row-machine-shop">
            <span class="machine-hire-name">Machine shop</span>
            <RouterLink
              :to="{ name: 'garage', query: { open: 'machine' } }"
              class="hire-btn"
              data-test="machine-shop-open"
              >Take a look at the bench</RouterLink
            >
          </li>
        </ul>
      </section>

      <details v-if="!detail.serviceJob" class="finances" data-test="finance-panel">
        <summary class="finances-summary" data-test="finance-summary">Finances</summary>
        <p class="finances-intro">What you paid, what you've spent since, what it's worth now.</p>

        <h4 class="ledger-head">Worth now</h4>
        <p class="worth-now-figure" data-test="worth-now">
          {{ formatYen(detail.valueLedger.totalYen) }}
        </p>

        <dl v-if="workRow" class="finance-grid work-grid">
          <div class="finance-row work-row" :data-test="'work-row-' + workRow.state">
            <dt>{{ workRow.label }}</dt>
            <dd>
              <span v-if="workRow.figure" data-test="work-row-figure">{{ workRow.figure }}</span>
              <span v-if="workRow.subText" class="work-subtext" data-test="work-row-subtext">{{
                workRow.subText
              }}</span>
            </dd>
          </div>
        </dl>

        <h5 class="ledger-head">
          The ledger
          <HelpHint label="The ledger">
            Book price, minus what's broken, plus real upgrades. Doubts price at the odds, till
            proven.
          </HelpHint>
        </h5>
        <dl class="finance-grid ledger-grid">
          <div
            v-for="line in ledgerBreakdown"
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
          <!-- Advertising this car is a cost of this car; rent, bays, staff
               and machine-shop hire are the shop's running costs and
               deliberately never appear here. -->
          <div v-if="detail.ledger.listingFeesYen > 0" class="finance-row">
            <dt>Listing fees</dt>
            <dd data-test="finance-listing-fees">
              {{ formatYen(detail.ledger.listingFeesYen) }}
            </dd>
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
      </details>

      <section v-if="!detail.serviceJob" class="sell">
        <h3>Sell</h3>
        <p class="sell-est" data-test="sale-range">
          Expect {{ formatYen(detail.saleRangeYen.lowYen) }} to
          {{ formatYen(detail.saleRangeYen.highYen) }}, depending who bites.
        </p>

        <p
          v-if="detail.supportReadout"
          class="support-readout listing"
          :class="detail.supportReadout.band"
          data-test="support-readout-listing"
        >
          {{ detail.supportReadout.copy }}
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
              title="Declines it. Stays listed."
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
            <li v-for="id in game.availableSellingChannelIds" :key="id">
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
                <span
                  v-if="audienceLabelFor(id)"
                  class="channel-audience"
                  data-test="channel-audience"
                  >{{ audienceLabelFor(id) }}</span
                >
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
            <li v-for="job in detail.jobs" :key="job.id">{{ jobLine(job) }}</li>
          </ul>
        </div>

        <p v-else class="empty">Nothing in progress.</p>
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
      placing: {{ pickedPartName }} - click the slot to fit it, or Esc to cancel
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
   pinned top-right at a smaller size. The workshop views, panel, and the rest
   of the page stack full-width below, in one column. */
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

.symptom-panel .symptom-verdict {
  margin: var(--mg-space-2) 0 0;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text);
}

.symptom-panel .verdict-fix {
  display: block;
  margin-top: 2px;
  color: var(--mg-yen);
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

/* The bench strip under the workshop views - benched assembly members as
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

/* A valid drop target for the part currently being dragged or picked - the
   same cyan-tint highlight every other drop zone in the garage uses. */
.bench-block.active-target {
  border-color: var(--mg-neon-cyan);
  background: rgba(47, 214, 191, 0.12);
}

.bench-sprite {
  width: 100%;
  height: 34px;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
}

.bench-block-drop-hint {
  font-size: 0.55rem;
  line-height: 1;
  color: var(--mg-neon-cyan);
  text-align: center;
  pointer-events: none;
}

.bench-block-name {
  font-size: 0.55rem;
  line-height: 1;
  color: var(--mg-text-dim);
  text-align: center;
  pointer-events: none;
}

/* The docked info/action panel - the views' single companion, showing the
   selected part's or zone's identity and every action available on it. */
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

/* Setup work reads as a short list of jobs rather than a row of controls, so
   it stacks: each offer carries its own name, description and figures. */
.panel-actions.setup-actions {
  flex-direction: column;
  align-items: stretch;
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.setup-offer {
  display: grid;
  gap: 2px;
}

.setup-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-2);
}

.setup-name {
  color: var(--mg-neon-cyan);
}

.setup-note,
.setup-figures {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.fit-btn.active-target {
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
}

/* The repair-step button carries its full price inline,
   never on hover. */
.step-up.loud {
  padding: 2px 10px;
  font-size: var(--mg-fs-sm);
  line-height: 1.2;
}

/* A1: the whole-body verdict, a single quiet row beside the diagram. */
.body-verdict {
  display: flex;
  gap: var(--mg-space-4);
  margin: 0 0 var(--mg-space-2);
  font-size: var(--mg-fs-sm);
}

.body-verdict-item {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
}

/* The quiet label in front of a zone control row. */
.zone-sub {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* A statement of fact, not a control - its own line under the why chips. */
.factory-colour {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* A3: the why row - icon chips, at most two words each. */
.zone-why {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
  padding: 0;
  list-style: none;
}

.zone-why-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.zone-why-icon {
  display: inline-block;
  width: 12px;
  height: 12px;
  text-align: center;
  line-height: 12px;
  font-size: 10px;
}

/* The zone panel's own door to the body shop - a RouterLink rather than a
   `<button>`, so it carries its own full chrome instead of inheriting the
   base `button{}` rule below (an `<a>` gets none of that for free). */
.body-shop-door {
  display: inline-block;
  background: var(--mg-panel);
  color: var(--mg-neon-cyan);
  border: 1px solid var(--mg-neon-cyan);
  border-radius: 4px;
  padding: 2px 10px;
  text-decoration: none;
  cursor: pointer;
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

/* The headline figure: what the car is worth right now, read first. */
.worth-now-figure {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-yen);
  font-size: var(--mg-fs-lg);
  font-weight: bold;
}

/* The forward-looking work row, ruled off beneath the headline so it reads
   as the one thing the player can still do about the number above. */
.work-grid {
  margin-bottom: var(--mg-space-2);
  padding-bottom: var(--mg-space-2);
  border-bottom: var(--mg-border);
}

.work-row dd {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.work-row .work-subtext {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-xs, 0.7rem);
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

/* The support-ratio readout (design 7c): silent at `adequate` (the store
 * never sends a non-null value), a dashed dim-toned advisory at `strained`
 * (mirrors `.passion-notice`'s milder treatment) and the same danger
 * treatment as `.foundation-warning` at `dangerous` - no separate colour
 * invented for it, per the art bible's saturated-accent discipline. */
.support-readout {
  margin: var(--mg-space-2) 0 0;
  padding: var(--mg-space-2);
  border-radius: var(--mg-radius);
  font-size: var(--mg-fs-sm);
}

.support-readout.strained {
  border: 1px dashed var(--mg-panel-edge);
  color: var(--mg-text-dim);
}

.support-readout.dangerous {
  border: 1px solid var(--mg-danger);
  color: var(--mg-danger);
}

.support-readout.listing {
  margin-top: 0;
}

.unpainted-note {
  margin: var(--mg-space-2) 0 0;
  padding: var(--mg-space-2);
  border: 1px dashed var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  color: var(--mg-text-dim);
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

.channel-audience {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
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
