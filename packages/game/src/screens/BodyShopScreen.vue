<script setup lang="ts">
import type {
  CarPartId,
  Grade,
  PaintFinish,
  PaintTinSize,
  PipelineStageId,
  ZoneId,
  ZoneState,
} from '@midnight-garage/content'
import {
  CONSUMABLE_TINS,
  PAINT_COLOURS,
  PAINT_TINS,
  paintStockKey,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import {
  bodyLineCapability,
  bodyworkBindingZoneIds,
  factoryColourSet,
  factoryReferenceColours,
  hasMachineLineFor,
  machineLaborMultiplier,
  METAL_ZONE_IDS,
  PANEL_ZONE_IDS,
  paintBindingZoneIds,
  planPaintStage,
  planPipelineStage,
  stageConsumables,
  type PipelineStageRefusal,
} from '@midnight-garage/sim'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import WorkshopViews, { type WorkshopSelection } from '../components/WorkshopViews.vue'
import BandChip from '../components/BandChip.vue'
import { useCarPartDropZones } from '../composables/useCarPartDropZones'
import { useDragSession } from '../composables/useDragAndDrop'
import { useZoneDropZones } from '../composables/useZoneDropZones'
import { useGameStore, type MachineLaborDisclosure } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'
import { formatYen } from '../utils/formatYen'
import { colourTokenDisplayName } from '../utils/paintFamilies'
import { repairStepText } from '../utils/repairStepLabels'
import {
  zonePipelineSteps,
  zoneStatusRows,
  type PipelineStepId,
  type ZonePipelineSteps,
  type ZoneStatusRows,
} from '../utils/zoneSeverity'

/**
 * The body shop room (sprint208.md): the zone diagram and the one zone
 * action panel, moved here from `CarDetailScreen.vue` wholesale. There is no
 * route param - the room always works the car currently in the body bay
 * (`GameState.bodyBayCarId`), the same car the garage's bay slot shows, so
 * there is never a mismatch between what the bay holds and what this screen
 * acts on.
 *
 * The zone action panel (sprint220.md) is a rigid surface: a status strip, a
 * guidance line, five pipeline buttons in fixed positions, a panel row and a
 * paint swatch row. Nothing is ever added or removed from the layout as a
 * zone's state changes - only a control's own text and enabled state do -
 * which is what stops buttons moving or disappearing between clicks.
 */

const game = useGameStore()

const ui = useUiStore()
const carId = computed(() => game.gameState.bodyBayCarId)
const detail = computed(() => (carId.value ? game.carDetail(carId.value) : undefined))

const { dropZones, acceptsInstall } = useCarPartDropZones(detail, () => ui.closeWarehouse())
const { dropZones: zoneDropZones } = useZoneDropZones(detail)
const dragSession = useDragSession()

/**
 * What the docked panel is showing - a zone or a part, told apart by `kind`
 * exactly as `WorkshopViews` emits it (sprint211.md task A). Selecting
 * anything replaces the dock outright and the dock's own action always
 * targets what it displays, so a click can never act on a stale target.
 */
const panelTarget = ref<WorkshopSelection | null>(null)
watch(carId, () => {
  panelTarget.value = null
})

function onWorkshopSelect(selection: WorkshopSelection): void {
  panelTarget.value = selection
}

const selectedZoneId = computed<ZoneId | null>(() =>
  panelTarget.value?.kind === 'zone' ? panelTarget.value.zoneId : null,
)
const selectedPartId = computed<CarPartId | null>(() =>
  panelTarget.value?.kind === 'part' ? panelTarget.value.partId : null,
)

const zoneState = computed(() => detail.value?.car.zoneState ?? null)

function isMetalZoneId(zoneId: ZoneId): boolean {
  return (METAL_ZONE_IDS as readonly string[]).includes(zoneId)
}

/** The docked zone - just its id, its live state and its display name. Every
 * derived reading (status rows, pipeline steps) comes off these three,
 * straight through `zoneSeverity.ts`, never re-derived here. */
const selectedZone = computed<{ zoneId: ZoneId; zone: ZoneState; name: string } | null>(() => {
  const zones = zoneState.value
  const zoneId = selectedZoneId.value
  if (!zoneId || !zones) return null
  return { zoneId, zone: zones[zoneId], name: titleCaseFromSlug(zoneId) }
})

const selectedIsMetal = computed(() =>
  selectedZone.value ? isMetalZoneId(selectedZone.value.zoneId) : false,
)

const selectedPipeline = computed<ZonePipelineSteps | null>(() =>
  selectedZone.value ? zonePipelineSteps(selectedZone.value.zone, selectedIsMetal.value) : null,
)

const selectedStatusRows = computed<ZoneStatusRows | null>(() => {
  const zone = selectedZone.value
  const car = detail.value?.car
  if (!zone || !car) return null
  return zoneStatusRows(zone.zone, selectedIsMetal.value, car.factoryColour)
})

/** The colour swatch beside the paint status row - only once a colour is
 * actually on the panel, whatever state it is in. */
const selectedZoneColourHex = computed<string | null>(() => {
  const colourId = selectedZone.value?.zone.colour
  if (!colourId) return null
  return PAINT_COLOURS.find((c) => c.id === colourId)?.hex ?? null
})

const noLabourLeft = computed(() => game.laborSlotsRemainingToday <= 0)

const CONSUMABLE_TIN_BY_ID: Readonly<Record<string, (typeof CONSUMABLE_TINS)[number]>> =
  Object.fromEntries(CONSUMABLE_TINS.map((tin) => [tin.id, tin]))

/** A structural pipeline refusal (sim's own `PipelineStageRefusal.reason`),
 * in plain words - the vocabulary every caption below shares. `tool-tier`
 * only fires here for polish (the one generic stage the body line gates -
 * weld is priced by rate, never a wall), so its one entry names the body
 * line by that stage's own vocabulary; the respray control's own tool-tier
 * caption (its gate is the higher `fullCapability` rung) is worded
 * separately rather than sharing this entry. A computed rather than a plain
 * constant because the hire fee it quotes is a live economy value, not a
 * hardcoded number. */
const PIPELINE_REFUSAL_CAPTIONS = computed<Partial<Record<PipelineStageRefusal['reason'], string>>>(
  () => ({
    'needs-panel': 'Fit a panel here first.',
    prereq: 'Needs priming first.',
    'wrong-colour': "Not this car's factory colour.",
    'metal-only': 'This zone has no metal to work.',
    'tool-tier': `Needs the body line: tier 2 tools or a day's hire (${formatYen(game.context.economy.machineShopAssist.feeYenByGroup.body)})`,
  }),
)

/** The disabled-control caption every plan-gated action in this room shares
 * once its own structural reason is ruled out: off the body bay's own car,
 * then no labour left today. */
function basicCaption(
  plan: { costYen: number; laborSlots: number } | null,
  carIdForCaption: string,
): string | null {
  if (plan) return null
  const bay = game.pipelineBodyBayCaption(carIdForCaption)
  if (bay) return bay
  return noLabourLeft.value ? 'No labour left today' : null
}

/** A generic (non-paint) stage's own bay/structural caption - `null` once
 * neither blocks it. Never checks stock: that is a live shelf fact, not a
 * plan-time one, and is read separately so a shortfall can offer its own buy
 * control instead of folding into this text. */
function stageStructuralCaption(
  zoneId: ZoneId,
  stage: Exclude<PipelineStageId, 'paint'>,
): string | null {
  const car = detail.value?.car
  if (!car) return null
  const bay = game.pipelineBodyBayCaption(car.id)
  if (bay) return bay
  const zone = zoneState.value?.[zoneId]
  if (!zone) return null
  const result = planPipelineStage(stage, zone, bodyLineCapability(game.gameState, game.context))
  if (!result.ok) return PIPELINE_REFUSAL_CAPTIONS.value[result.reason] ?? 'Not ready yet.'
  return null
}

/** A paint tin's own bay/structural caption, mirroring `stageStructuralCaption`
 * for the one stage with an extra argument (the colour). */
function paintCaption(
  plan: { costYen: number; laborSlots: number } | null,
  zoneId: ZoneId,
  colour: string,
  grade: Grade,
): string | null {
  if (plan) return null
  const car = detail.value?.car
  if (!car) return null
  const bay = game.pipelineBodyBayCaption(car.id)
  if (bay) return bay
  const zone = zoneState.value?.[zoneId]
  if (zone) {
    const result = planPaintStage(
      zone,
      colour,
      bodyLineCapability(game.gameState, game.context),
      grade,
      car.factoryColour,
    )
    if (!result.ok) return PIPELINE_REFUSAL_CAPTIONS.value[result.reason] ?? 'Not ready yet.'
  }
  return noLabourLeft.value ? 'No labour left today' : null
}

/** One pipeline stage's live preview for the docked zone - straight from
 * `pipelineActionPlan`, the exact function the click below resolves with. */
function stagePreview(
  zoneId: ZoneId,
  stage: Exclude<PipelineStageId, 'paint'>,
): { costYen: number; laborSlots: number } | null {
  const car = detail.value?.car
  if (!car) return null
  return game.pipelineActionPlan(car, { kind: 'pipeline-stage', stage, zoneId })
}

function onStageClick(zoneId: ZoneId, stage: Exclude<PipelineStageId, 'paint'>): void {
  const car = detail.value?.car
  if (!car) return
  game.pipelineStage(car.id, zoneId, stage)
}

function noop(): void {
  /* the disabled placeholder every non-clickable button carries */
}

// --- The pipeline row: five fixed buttons, fixed order, fixed slots -------

interface BuyControl {
  /** The DOM `data-test` the button renders under - fixed by the caller so a
   * step with a single requirement keeps its old, unsuffixed id (nothing
   * else on the page needs to change) while a step short of more than one
   * tin (fill-and-sand: filler and paper both) gets one distinct id per
   * tin. */
  testId: string
  label: string
  disabled: boolean
  onClick: () => void
}

interface PipelineButtonView {
  id: PipelineStepId
  buttonLabel: string
  disabled: boolean
  figuresText: string
  captionText: string
  buys: BuyControl[]
  onClick: () => void
}

/** Every requirement the shelf cannot cover, read as buy controls - the same
 * idiom the parts market's own tin row uses for its price and its Buy
 * button, offered inline instead of sending the player off-screen. A stage
 * with one requirement (every stage but fill-and-sand) reads exactly as
 * before; fill-and-sand can be short of filler, paper, or both, and each
 * missing tin gets its own line and its own button rather than only the
 * first one found. */
function stageShortfalls(
  stepId: PipelineStepId,
  stage: Exclude<PipelineStageId, 'paint'>,
): { captionText: string; buys: BuyControl[] } | null {
  const requirements = stageConsumables(stage)
  const shortfalls = requirements.filter((r) => (game.consumableStock[r.key] ?? 0) < r.uses)
  if (shortfalls.length === 0) return null
  const tins = shortfalls
    .map((r) => CONSUMABLE_TIN_BY_ID[r.key])
    .filter((tin): tin is (typeof CONSUMABLE_TINS)[number] => !!tin)
  const captionText = tins.map((tin) => `Out of ${tin.name}`).join('. ')
  const buys: BuyControl[] = tins.map((tin) => ({
    testId: tins.length > 1 ? `pipeline-buy-${stepId}-${tin.id}` : `pipeline-buy-${stepId}`,
    label: `Buy a tin (${formatYen(tin.priceYen)})`,
    disabled: game.cashYen < tin.priceYen,
    onClick: () => game.buyConsumableTin(tin.id),
  }))
  return { captionText, buys }
}

/** A step whose state is not `next` - done, locked or not-needed all read
 * straight off the step model, and the button itself is disabled with no
 * click to wire. */
function staticStepView(step: ZonePipelineSteps['steps'][number]): PipelineButtonView {
  const captionText =
    step.state === 'locked' ? (step.lockedCaption ?? '') : (step.doneLabel ?? 'Done')
  return {
    id: step.id,
    buttonLabel: step.label,
    disabled: true,
    figuresText: '',
    captionText,
    buys: [],
    onClick: noop,
  }
}

function genericNextView(step: ZonePipelineSteps['steps'][number]): PipelineButtonView {
  const zoneId = selectedZone.value!.zoneId
  const stage = step.stage as Exclude<PipelineStageId, 'paint'>
  const plan = stagePreview(zoneId, stage)
  const onClick = () => onStageClick(zoneId, stage)
  if (!plan) {
    return {
      id: step.id,
      buttonLabel: step.label,
      disabled: true,
      figuresText: '',
      captionText: stageStructuralCaption(zoneId, stage) ?? '',
      buys: [],
      onClick,
    }
  }
  const figuresText = `${formatYen(plan.costYen)} · ${plan.laborSlots} labour`
  const shortfall = stageShortfalls(step.id, stage)
  if (shortfall) {
    return {
      id: step.id,
      buttonLabel: step.label,
      disabled: true,
      figuresText,
      captionText: shortfall.captionText,
      buys: shortfall.buys,
      onClick,
    }
  }
  if (noLabourLeft.value) {
    return {
      id: step.id,
      buttonLabel: step.label,
      disabled: true,
      figuresText,
      captionText: 'No labour left today',
      buys: [],
      onClick,
    }
  }
  return {
    id: step.id,
    buttonLabel: step.label,
    disabled: false,
    figuresText,
    captionText: '',
    buys: [],
    onClick,
  }
}

// --- Paint: the one pipeline step resolved through the swatch row below ---

interface PaintSwatchSelection {
  finish: PaintFinish
  colourId: string
}

const manualSwatch = ref<PaintSwatchSelection | null>(null)
watch(selectedZoneId, () => {
  manualSwatch.value = null
})

/**
 * One tin's own derived grade: metallic and pearl finishes map straight to
 * `sport`/`race`; a solid finish maps to `stock` when the colour is (one
 * half of) this car's own factory scheme, and to `street` otherwise - the
 * one rule `planPaintStage`'s own stock-grade gate already enforces, read
 * forward instead of offered as a choice that could land on a refusal.
 */
function isFactoryColour(colourId: string): boolean {
  const car = detail.value?.car
  return car ? factoryColourSet(car.factoryColour).has(colourId) : false
}

function gradeForTin(finish: PaintFinish, colourId: string): Grade {
  if (finish === 'metallic') return 'sport'
  if (finish === 'pearl') return 'race'
  return isFactoryColour(colourId) ? 'stock' : 'street'
}

const PAINT_FINISHES: readonly PaintFinish[] = ['solid', 'metallic', 'pearl']
const DEFAULT_PAINT_TIN_SIZE: PaintTinSize = 'small'

function paintTinFor(finish: PaintFinish): { priceYen: number } | undefined {
  return PAINT_TINS.find((t) => t.finish === finish && t.size === DEFAULT_PAINT_TIN_SIZE)
}

/** This zone's own factory colour, resolved off the car's factory scheme -
 * the two-tone split (`factoryReferenceColours`, sim) already decides which
 * half a given zone wears, so this is always exactly one concrete colour. */
const factoryColourIdForZone = computed<string | null>(() => {
  const car = detail.value?.car
  const zoneId = selectedZone.value?.zoneId
  if (!car || !zoneId) return null
  return factoryReferenceColours(car.factoryColour)[zoneId] ?? null
})

interface OwnedPaintTin {
  finish: PaintFinish
  colourId: string
  hex: string
  name: string
  plan: { costYen: number; laborSlots: number } | null
  caption: string | null
}

/** Every paint tin actually on the shelf, as the swatch row's own picker -
 * each owned tin already carries both halves of colour AND finish/grade, so
 * picking one tin is the whole decision. */
const ownedPaintTins = computed<OwnedPaintTin[]>(() => {
  const zone = selectedZone.value
  const car = detail.value?.car
  if (!zone || !car) return []
  const tins: OwnedPaintTin[] = []
  for (const finish of PAINT_FINISHES) {
    for (const colour of PAINT_COLOURS) {
      if ((game.consumableStock[paintStockKey(finish, colour.id)] ?? 0) <= 0) continue
      const grade = gradeForTin(finish, colour.id)
      const plan = game.pipelineActionPlan(car, {
        kind: 'pipeline-paint',
        zoneId: zone.zoneId,
        colour: colour.id,
        grade,
      })
      tins.push({
        finish,
        colourId: colour.id,
        hex: colour.hex,
        name: colourTokenDisplayName(colour.id, detail.value?.model.uid),
        plan,
        caption: paintCaption(plan, zone.zoneId, colour.id, grade),
      })
    }
  }
  return tins
})

const PAINT_FINISH_LABELS: Record<PaintFinish, string> = {
  solid: 'Solid',
  metallic: 'Metallic',
  pearl: 'Pearl',
}

interface PaintTinGroup {
  finish: PaintFinish
  label: string
  caption: string | null
  tins: OwnedPaintTin[]
}

const ownedPaintTinGroups = computed<PaintTinGroup[]>(() => {
  const byFinish = new Map<PaintFinish, OwnedPaintTin[]>()
  for (const tin of ownedPaintTins.value) {
    const group = byFinish.get(tin.finish)
    if (group) group.push(tin)
    else byFinish.set(tin.finish, [tin])
  }
  return PAINT_FINISHES.filter((finish) => byFinish.has(finish)).map((finish) => {
    const tins = byFinish.get(finish)!
    return {
      finish,
      label: PAINT_FINISH_LABELS[finish],
      caption: tins.find((tin) => tin.caption)?.caption ?? null,
      tins,
    }
  })
})

interface FactorySwatchView {
  colourId: string
  name: string
  hex: string
  owned: boolean
  priceYen: number
}

/** The factory colour, always the first swatch offered - buyable straight
 * off the shelf when owned, or a greyed tile naming its price when not. */
const factorySwatch = computed<FactorySwatchView | null>(() => {
  const colourId = factoryColourIdForZone.value
  if (!colourId) return null
  const colour = PAINT_COLOURS.find((c) => c.id === colourId)
  if (!colour) return null
  return {
    colourId,
    name: colourTokenDisplayName(colourId, detail.value?.model.uid),
    hex: colour.hex,
    owned: (game.consumableStock[paintStockKey('solid', colourId)] ?? 0) > 0,
    priceYen: paintTinFor('solid')?.priceYen ?? 0,
  }
})

function onBuyFactoryTin(): void {
  const swatch = factorySwatch.value
  if (!swatch) return
  game.buyPaintTin('solid', DEFAULT_PAINT_TIN_SIZE, swatch.colourId)
}

/** The swatch row's current pick - the factory colour by default (buyable or
 * owned, it is always offered first), falling back to the first owned tin
 * once the factory colour is not in the palette at all. A player pick
 * (`onSwatchSelect`) always wins until the zone changes. */
const defaultSwatch = computed<PaintSwatchSelection | null>(() => {
  const factory = factorySwatch.value
  if (factory) return { finish: 'solid', colourId: factory.colourId }
  const first = ownedPaintTins.value[0]
  return first ? { finish: first.finish, colourId: first.colourId } : null
})

const selectedSwatch = computed<PaintSwatchSelection | null>(
  () => manualSwatch.value ?? defaultSwatch.value,
)

function onSwatchSelect(finish: PaintFinish, colourId: string): void {
  manualSwatch.value = { finish, colourId }
}

function isSwatchSelected(finish: PaintFinish, colourId: string): boolean {
  const swatch = selectedSwatch.value
  return swatch?.finish === finish && swatch?.colourId === colourId
}

const selectedSwatchName = computed<string | null>(() => {
  const swatch = selectedSwatch.value
  if (!swatch) return null
  return colourTokenDisplayName(swatch.colourId, detail.value?.model.uid)
})

const selectedPaintGrade = computed<Grade | null>(() => {
  const swatch = selectedSwatch.value
  return swatch ? gradeForTin(swatch.finish, swatch.colourId) : null
})

/** The selected swatch's own live plan - `null` until a swatch is picked, or
 * whenever the paint stage itself refuses (unprimed, wrong colour at stock
 * grade, off the body bay's own car). Never gated on shelf stock: that is a
 * live shelf fact read separately (`selectedSwatchOwned` below), the same
 * split the generic pipeline steps keep between a structural refusal and a
 * bare shelf. */
const selectedPaintPlan = computed(() => {
  const swatch = selectedSwatch.value
  const zone = selectedZone.value
  const car = detail.value?.car
  const grade = selectedPaintGrade.value
  if (!swatch || !zone || !car || !grade) return null
  return game.pipelineActionPlan(car, {
    kind: 'pipeline-paint',
    zoneId: zone.zoneId,
    colour: swatch.colourId,
    grade,
  })
})

const selectedSwatchOwned = computed(() => {
  const swatch = selectedSwatch.value
  if (!swatch) return false
  return (game.consumableStock[paintStockKey(swatch.finish, swatch.colourId)] ?? 0) > 0
})

function onPaintButtonClick(): void {
  const swatch = selectedSwatch.value
  const zone = selectedZone.value
  const car = detail.value?.car
  const grade = selectedPaintGrade.value
  if (!swatch || !zone || !car || !grade) return
  game.paintZone(car.id, zone.zoneId, swatch.colourId, grade)
}

function paintButtonView(step: ZonePipelineSteps['steps'][number]): PipelineButtonView {
  const swatch = selectedSwatch.value
  const buttonLabel = selectedSwatchName.value ? `Paint ${selectedSwatchName.value}` : step.label
  const onClick = () => onPaintButtonClick()
  if (!swatch) {
    return {
      id: 'paint',
      buttonLabel,
      disabled: true,
      figuresText: '',
      captionText: 'No paint in stock',
      buys: [],
      onClick: noop,
    }
  }
  const plan = selectedPaintPlan.value
  if (!plan) {
    const grade = selectedPaintGrade.value ?? 'street'
    return {
      id: 'paint',
      buttonLabel,
      disabled: true,
      figuresText: '',
      captionText: paintCaption(plan, selectedZone.value!.zoneId, swatch.colourId, grade) ?? '',
      buys: [],
      onClick: noop,
    }
  }
  const figuresText = `${formatYen(plan.costYen)} · ${plan.laborSlots} labour`
  if (!selectedSwatchOwned.value) {
    const tin = paintTinFor(swatch.finish)
    const priceYen = tin?.priceYen ?? 0
    return {
      id: 'paint',
      buttonLabel,
      disabled: true,
      figuresText,
      captionText: `Out of ${selectedSwatchName.value ?? 'that'} paint`,
      buys: [
        {
          testId: 'pipeline-buy-paint',
          label: `Buy a tin (${formatYen(priceYen)})`,
          disabled: game.cashYen < priceYen,
          onClick: () => game.buyPaintTin(swatch.finish, DEFAULT_PAINT_TIN_SIZE, swatch.colourId),
        },
      ],
      onClick: noop,
    }
  }
  if (noLabourLeft.value) {
    return {
      id: 'paint',
      buttonLabel,
      disabled: true,
      figuresText,
      captionText: 'No labour left today',
      buys: [],
      onClick: noop,
    }
  }
  return {
    id: 'paint',
    buttonLabel,
    disabled: false,
    figuresText,
    captionText: '',
    buys: [],
    onClick,
  }
}

const pipelineButtons = computed<PipelineButtonView[]>(() => {
  const pipeline = selectedPipeline.value
  if (!pipeline) return []
  return pipeline.steps.map((step) => {
    if (step.state !== 'next') return staticStepView(step)
    return step.id === 'paint' ? paintButtonView(step) : genericNextView(step)
  })
})

/** Whether the paint swatch row has anything useful to say - once priming is
 * either done or the very next step, painting is imminent enough that the
 * player needs the picker in view; the row itself always reserves its space
 * either way. */
const showSwatchRow = computed(() => {
  const nextId = selectedPipeline.value?.steps.find((s) => s.state === 'next')?.id
  return nextId === 'paint' || nextId === 'prime'
})

// --- The guidance line: one line, always the honest next step -------------

const guidanceText = computed(() => {
  const pipeline = selectedPipeline.value
  const zone = selectedZone.value
  if (!pipeline || !zone) return ''
  if (pipeline.panelBlocked) return pipeline.steps[0]!.lockedCaption ?? ''
  const next = pipeline.steps.find((s) => s.state === 'next')
  if (!next) return 'This panel is done.'
  if (next.id === 'paint') {
    const label = selectedSwatchName.value ? `Paint ${selectedSwatchName.value}` : next.label
    const plan = selectedPaintPlan.value
    return plan
      ? `Next: ${label} (${formatYen(plan.costYen)}, ${plan.laborSlots} labour)`
      : `Next: ${label}`
  }
  const stage = next.stage as Exclude<PipelineStageId, 'paint'>
  const plan = stagePreview(zone.zoneId, stage)
  return plan
    ? `Next: ${next.label} (${formatYen(plan.costYen)}, ${plan.laborSlots} labour)`
    : `Next: ${next.label}`
})

// --- The weld stage's own by-hand/with-the-line disclosure -----------------

const BODY_GROUP = 'body' as const

const weldDisclosure = computed<MachineLaborDisclosure | null>(() => {
  if (hasMachineLineFor(BODY_GROUP, game.gameState, game.context)) return null
  const machineLaborSlots = game.context.economy.energy.bodyStagePoints.weld
  return {
    group: BODY_GROUP,
    handLaborSlots: Math.round(
      machineLaborSlots * machineLaborMultiplier(BODY_GROUP, game.gameState, game.context),
    ),
    machineLaborSlots,
    hireFeeYen: game.context.economy.machineShopAssist.feeYenByGroup[BODY_GROUP],
  }
})

/** The weld control's own disclosure line - "By hand with the stick welder"
 * names the tool doing the work whenever weld is the docked zone's next
 * step and the body line isn't already owned or hired today. Always
 * rendered, in a fixed slot under the pipeline row; empty otherwise. */
const weldDisclosureText = computed(() => {
  const next = selectedPipeline.value?.steps.find((s) => s.state === 'next')
  if (next?.stage !== 'weld') return ''
  const disclosure = weldDisclosure.value
  if (!disclosure) return ''
  return `By hand with the stick welder - slower. ${game.machineLaborDisclosureText(disclosure)}`
})

// --- The panel row: take it off, fit one, or strip back for a respray -----

const REMOVE_PANEL_LABEL = 'Take it off'
const REMOVE_PANEL_PURPOSE =
  'Comes off for a replacement panel, or to keep the old one safe on the shelf.'
const STRIP_BACK_CAPTION = 'Strips to bare metal for a respray or colour change'

function removePanelPreview(zoneId: ZoneId): { costYen: number; laborSlots: number } | null {
  const car = detail.value?.car
  if (!car) return null
  return game.pipelineActionPlan(car, { kind: 'pipeline-remove-panel', zoneId })
}

function onRemovePanelClick(zoneId: ZoneId): void {
  const car = detail.value?.car
  if (!car) return
  game.removePanel(car.id, zoneId)
}

const zoneRemovePanelPlan = computed(() =>
  selectedZone.value ? removePanelPreview(selectedZone.value.zoneId) : null,
)

const removePanelDisabled = computed(
  () => !selectedZone.value || selectedZone.value.zone.panelMissing || !zoneRemovePanelPlan.value,
)

const removePanelCaption = computed(() => {
  if (!selectedZone.value || selectedZone.value.zone.panelMissing) return ''
  return basicCaption(zoneRemovePanelPlan.value, detail.value!.car.id) ?? ''
})

/**
 * Opens (or, if already scoped to this exact zone, closes) the Warehouse for
 * a fresh panel - the standard "Fit" idiom every other slot in the game
 * uses. A zone only ever fits while its own panel is missing - fitting over
 * an occupied zone is not a thing (no Replace verb): the panel comes off
 * first, through the control above, then a fresh one goes on through this
 * one.
 */
function onZoneFitClick(zoneId: ZoneId): void {
  const d = detail.value
  if (!d) return
  const active = ui.warehouseFit
  if (active?.kind === 'zone' && active.carId === d.car.id && active.zoneId === zoneId) {
    ui.closeWarehouse()
  } else {
    ui.openWarehouse({ kind: 'zone', carId: d.car.id, zoneId })
  }
}

const stripBackPlan = computed(() =>
  selectedZone.value ? stagePreview(selectedZone.value.zoneId, 'stripPrep') : null,
)

const stripBackDisabled = computed(() => {
  const pipeline = selectedPipeline.value
  if (!pipeline || !pipeline.stripBack.enabled) return true
  return !stripBackPlan.value || noLabourLeft.value
})

function onStripBackClick(): void {
  const zone = selectedZone.value
  if (!zone) return
  onStageClick(zone.zoneId, 'stripPrep')
}

// --- The whole-body header: two carrier bands, panels finished, next up ---

interface ZonePanelSummary {
  zoneId: ZoneId
  finished: boolean
}

const zonePanelSummaries = computed<ZonePanelSummary[]>(() => {
  const zones = zoneState.value
  if (!zones) return []
  return PANEL_ZONE_IDS.map((zoneId) => {
    const pipeline = zonePipelineSteps(zones[zoneId], isMetalZoneId(zoneId))
    const finished = !pipeline.panelBlocked && pipeline.steps.every((s) => s.state !== 'next')
    return { zoneId, finished }
  })
})

const panelsFinishedCount = computed(
  () => zonePanelSummaries.value.filter((z) => z.finished).length,
)

const bodyworkBand = computed(() => detail.value?.car.parts.bodywork.installed?.band ?? null)
const paintBand = computed(() => detail.value?.car.parts.paint.installed?.band ?? null)

/** The next panel worth the player's attention: whichever zone is (one of)
 * the reason `bodywork`/`paint` read as bad as they do, so long as it still
 * has work left - a car with every zone tied for "mint" would otherwise name
 * an already-finished zone, which is not useful guidance. Falls back to the
 * first zone with anything left, then to "All panels done". */
const nextPanelName = computed<string>(() => {
  const zones = zoneState.value
  if (!zones) return 'All panels done'
  const finishedIds = new Set(
    zonePanelSummaries.value.filter((z) => z.finished).map((z) => z.zoneId),
  )
  const bindingZoneId = [...bodyworkBindingZoneIds(zones), ...paintBindingZoneIds(zones)].find(
    (zoneId) => !finishedIds.has(zoneId),
  )
  if (bindingZoneId) return titleCaseFromSlug(bindingZoneId)
  const nextUnfinished = zonePanelSummaries.value.find((z) => !z.finished)
  return nextUnfinished ? titleCaseFromSlug(nextUnfinished.zoneId) : 'All panels done'
})

// --- The respray row: a fixed control under the whole-body header ---------
// (sprint222.md, "The respray") - tier 3's whole-car pass, distinct from
// the per-panel Paint button above. Reuses the same swatch selection state
// paint reads (`selectedSwatch`/`selectedSwatchName`/`selectedPaintGrade`),
// so picking a colour once serves both controls.

interface ResprayView {
  buttonLabel: string
  disabled: boolean
  figuresText: string
  captionText: string
  buy: BuyControl | null
  onClick: () => void
}

const RESPRAY_LABEL = 'Respray'

function onResprayClick(): void {
  const car = detail.value?.car
  const swatch = selectedSwatch.value
  const grade = selectedPaintGrade.value
  if (!car || !swatch || !grade) return
  game.resprayCar(car.id, swatch.colourId, grade)
}

/** The plan for the currently selected swatch - `null` while unset, or
 * whenever `planRespray` itself refuses (below full capability, fewer than
 * two zones primed, or the stock-grade colour gate). `laborSlots` is
 * exactly the covered-zone count (sprint222.md: "labour is 1 per primed
 * panel"), which is also what the tin draw below sizes off. */
const resprayPlan = computed(() => {
  const car = detail.value?.car
  const swatch = selectedSwatch.value
  const grade = selectedPaintGrade.value
  if (!car || !swatch || !grade) return null
  return game.pipelineActionPlan(car, { kind: 'pipeline-respray', colour: swatch.colourId, grade })
})

type ResprayStructural =
  | { ok: true }
  | { ok: false; reason: 'tool-tier' }
  | { ok: false; reason: 'prereq'; primedCount: number }

/** The two structural gates `planRespray` checks before it ever looks at a
 * colour - full capability, then at least two zones primed - read directly
 * off the car so the row can name which one is short even before the
 * player has picked a swatch (mirrors `planRespray`'s own check order,
 * bodyPipeline.ts). A plain function, not a computed: Vue's `UnwrapRef`
 * does not preserve a discriminated union cleanly through `computed<T>`,
 * and this is cheap enough to just call from inside `resprayView` (still
 * reactive - dependency tracking follows the call stack, not the
 * computed's own declaration). */
function resprayStructural(): ResprayStructural {
  const zones = detail.value?.car.zoneState
  if (!zones) return { ok: false, reason: 'prereq', primedCount: 0 }
  const capability = bodyLineCapability(game.gameState, game.context)
  if (!capability.fullCapability) return { ok: false, reason: 'tool-tier' }
  const primedCount = PANEL_ZONE_IDS.filter((zoneId) => zones[zoneId].primed).length
  if (primedCount < 2) return { ok: false, reason: 'prereq', primedCount }
  return { ok: true }
}

const resprayView = computed<ResprayView>(() => {
  const buttonLabel = selectedSwatchName.value
    ? `Respray ${selectedSwatchName.value}`
    : RESPRAY_LABEL
  const disabledView = (captionText: string, figuresText = ''): ResprayView => ({
    buttonLabel,
    disabled: true,
    figuresText,
    captionText,
    buy: null,
    onClick: noop,
  })
  const car = detail.value?.car
  if (!car) return disabledView('')
  const bay = game.pipelineBodyBayCaption(car.id)
  if (bay) return disabledView(bay)

  const structural = resprayStructural()
  if (!structural.ok) {
    if (structural.reason === 'tool-tier') {
      const fee = formatYen(game.context.economy.machineShopAssist.feeYenByGroup.body)
      return disabledView(`Needs the booth: the body-and-trim shop, or a day's hire (${fee})`)
    }
    const n = structural.primedCount
    return disabledView(
      `Prime at least two panels first: covers ${n} primed panel${n === 1 ? '' : 's'}`,
    )
  }

  const swatch = selectedSwatch.value
  if (!swatch) return disabledView('Pick a paint colour first')

  const plan = resprayPlan.value
  if (!plan) {
    // Structurally ready (capability and primed count both clear) - the
    // only refusal left is the stock-grade colour gate.
    return disabledView(
      PIPELINE_REFUSAL_CAPTIONS.value['wrong-colour'] ?? "Not this car's factory colour.",
    )
  }

  const figuresText = `${formatYen(plan.costYen)} · ${plan.laborSlots} labour`
  // Six tins where panel-by-panel burns nine on a full car (sprint222.md) -
  // `laborSlots` is exactly the covered-zone count, so this mirrors the
  // resolver's own `ceil(covered x 2/3)` without a second sim call.
  const tinUses = Math.ceil((plan.laborSlots * 2) / 3)
  const have = game.consumableStock[paintStockKey(swatch.finish, swatch.colourId)] ?? 0
  if (have < tinUses) {
    const tin = paintTinFor(swatch.finish)
    const priceYen = tin?.priceYen ?? 0
    return {
      buttonLabel,
      disabled: true,
      figuresText,
      captionText: `Needs ${tinUses} uses of ${selectedSwatchName.value ?? 'that'} paint (${have} on the shelf)`,
      buy: {
        testId: 'respray-buy',
        label: `Buy a tin (${formatYen(priceYen)})`,
        disabled: game.cashYen < priceYen,
        onClick: () => game.buyPaintTin(swatch.finish, DEFAULT_PAINT_TIN_SIZE, swatch.colourId),
      },
      onClick: noop,
    }
  }

  if (noLabourLeft.value) return disabledView('No labour left today', figuresText)
  return {
    buttonLabel,
    disabled: false,
    figuresText,
    captionText: '',
    buy: null,
    onClick: onResprayClick,
  }
})

// --- Karagawa Express: the brand strapline beside every inline buy control -
// (sprint222.md, "Karagawa Express") - three lines, rotating by in-game day,
// never changing which controls exist or their layout.

const KARAGAWA_LINES: readonly string[] = [
  'Karagawa Express: on your shelf before the kettle boils.',
  "Karagawa Express: don't ask how. K.",
  'Karagawa Express: same-day is for amateurs.',
]

const karagawaLine = computed(() => KARAGAWA_LINES[game.gameState.day % KARAGAWA_LINES.length]!)

// --- A part selection, hosted here rather than dropped silently ------------
// Only repair, take-off and fit - the same store getters `CarDetailScreen.vue`
// reads for a selected part, never a parallel gate of this screen's own.

const selectedGroup = computed(() =>
  selectedPartId.value ? (game.groupForCarPart(selectedPartId.value) ?? null) : null,
)

const selectedPartRow = computed(() => {
  const id = selectedPartId.value
  const componentId = selectedGroup.value
  const d = detail.value
  if (!id || !componentId || !d) return null
  return game.partsInGroup(d.car.id, componentId).find((row) => row.partId === id) ?? null
})

const selectedPartRepairStep = computed(() => {
  const id = selectedPartId.value
  const componentId = selectedGroup.value
  const d = detail.value
  return id && componentId && d ? game.nextRepairStep(d.car.id, componentId, id) : null
})

const selectedPartRepairLabel = computed(() =>
  selectedPartRepairStep.value ? repairStepText(selectedPartRepairStep.value) : '',
)

function onPartRepairClick(): void {
  const id = selectedPartId.value
  const componentId = selectedGroup.value
  const d = detail.value
  const step = selectedPartRepairStep.value
  if (!id || !componentId || !d || !step) return
  game.repair(d.car.id, componentId, step.targetBand, id)
}

/** The Take-off control's own refusal - straight off the same
 * `removeBlockedReason` gate `CarDetailScreen.vue` reads, never a second
 * one. */
const selectedPartRemoveReason = computed(() => {
  const id = selectedPartId.value
  const d = detail.value
  return id && d ? game.removeBlockedReason(d.car.id, id) : null
})

function onPartRemoveClick(): void {
  const id = selectedPartId.value
  const d = detail.value
  if (id && d) game.removePart(d.car.id, id)
}

/** Opens (or closes, if already scoped to this exact part) the Warehouse for
 * a replacement - the same pick-or-drag "Fit" idiom every other slot uses
 * (`CarDetailScreen.vue`'s own `onFitClick`), including the picked-card
 * fallback so a part picked from the Warehouse before this screen even had
 * a panel to dock still lands correctly. */
function onPartFitClick(): void {
  const id = selectedPartId.value
  const d = detail.value
  if (!id || !d) return
  const picked = dragSession.value
  const payload = picked?.mode === 'pick' ? picked.payload : null
  if (typeof payload === 'string' && acceptsInstall(id, payload)) {
    dropZones[id].onClick()
    return
  }
  const active = ui.warehouseFit
  if (active?.kind === 'part' && active.carId === d.car.id && active.carPartId === id) {
    ui.closeWarehouse()
  } else {
    ui.openWarehouse({ kind: 'part', carId: d.car.id, carPartId: id })
  }
}
</script>

<template>
  <section class="body-shop">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Back to the garage</RouterLink>

    <h2>Body shop</h2>

    <p v-if="!detail" class="empty-bay" data-test="body-shop-empty">
      No car in the bay. <RouterLink :to="{ name: 'garage' }">Back to the garage</RouterLink> to
      bring one in.
    </p>

    <template v-else>
      <p class="car-name">{{ detail.displayName }}</p>

      <header class="body-header" data-test="body-header">
        <span class="body-header-chip">
          Bodywork <BandChip :band="bodyworkBand" data-test="body-header-bodywork" />
        </span>
        <span class="body-header-chip">
          Paint <BandChip :band="paintBand" data-test="body-header-paint" />
        </span>
        <span class="body-header-count" data-test="body-header-count"
          >{{ panelsFinishedCount }} of {{ PANEL_ZONE_IDS.length }} panels finished</span
        >
        <span class="body-header-next" data-test="body-header-next"
          >Next panel: {{ nextPanelName }}</span
        >
      </header>

      <div class="respray-row" data-test="respray-row">
        <button
          type="button"
          class="verb-btn"
          :disabled="resprayView.disabled"
          data-test="respray-button"
          @click="resprayView.onClick"
        >
          {{ resprayView.buttonLabel }}
        </button>
        <span class="respray-figures" data-test="respray-figures">{{
          resprayView.figuresText
        }}</span>
        <span class="respray-caption" data-test="respray-caption">
          {{ resprayView.captionText }}
          <button
            v-if="resprayView.buy"
            type="button"
            class="buy-btn"
            :disabled="resprayView.buy.disabled"
            data-test="respray-buy"
            @click="resprayView.buy.onClick"
          >
            {{ resprayView.buy.label }}
          </button>
          <span v-if="resprayView.buy" class="karagawa-strap" data-test="respray-karagawa">{{
            karagawaLine
          }}</span>
        </span>
      </div>

      <WorkshopViews
        :car-id="detail.car.id"
        :drop-zones="dropZones"
        :zone-drop-zones="zoneDropZones"
        :selected="panelTarget"
        @select="onWorkshopSelect"
      />

      <section class="action-panel" data-test="zone-action-panel">
        <p v-if="!selectedZone && !selectedPartRow" class="panel-empty" data-test="panel-empty">
          Pick anything on the diagram above and what you can do to it turns up here.
        </p>

        <template v-else-if="selectedZone">
          <div class="panel-head">
            <span class="panel-name" data-test="panel-name">{{ selectedZone.name }}</span>
          </div>

          <div class="status-strip" data-test="zone-status-strip">
            <div class="status-row" data-test="zone-status-metal">
              <span class="status-label">Metal</span>
              <span class="status-value">{{ selectedStatusRows?.metal }}</span>
            </div>
            <div class="status-row" data-test="zone-status-prep">
              <span class="status-label">Prep</span>
              <span class="status-value">{{ selectedStatusRows?.prep }}</span>
            </div>
            <div class="status-row" data-test="zone-status-paint">
              <span class="status-label">Paint</span>
              <span
                v-if="selectedZoneColourHex"
                class="status-swatch"
                :style="{ backgroundColor: selectedZoneColourHex }"
                aria-hidden="true"
              ></span>
              <span class="status-value">{{ selectedStatusRows?.paint }}</span>
            </div>
          </div>

          <p class="guidance-line" data-test="zone-guidance">{{ guidanceText }}</p>

          <div class="pipeline-row" data-test="pipeline-row">
            <button
              v-for="btn in pipelineButtons"
              :key="btn.id + '-button'"
              type="button"
              class="verb-btn pipeline-btn"
              :disabled="btn.disabled"
              :data-test="'pipeline-btn-' + btn.id"
              @click="btn.onClick"
            >
              {{ btn.buttonLabel }}
            </button>
            <span
              v-for="btn in pipelineButtons"
              :key="btn.id + '-figures'"
              class="pipeline-figures"
              :data-test="'pipeline-figures-' + btn.id"
              >{{ btn.figuresText }}</span
            >
            <span
              v-for="btn in pipelineButtons"
              :key="btn.id + '-caption'"
              class="pipeline-caption"
              :data-test="'pipeline-caption-' + btn.id"
            >
              {{ btn.captionText }}
              <button
                v-for="buy in btn.buys"
                :key="buy.testId"
                type="button"
                class="buy-btn"
                :disabled="buy.disabled"
                :data-test="buy.testId"
                @click="buy.onClick"
              >
                {{ buy.label }}
              </button>
              <span
                v-if="btn.buys.length > 0"
                class="karagawa-strap"
                :data-test="'pipeline-karagawa-' + btn.id"
                >{{ karagawaLine }}</span
              >
            </span>
          </div>

          <p class="disclosure" data-test="weld-disclosure">{{ weldDisclosureText }}</p>

          <div class="swatch-row" data-test="paint-swatch-row">
            <template v-if="showSwatchRow">
              <div class="paint-swatch-factory">
                <button
                  type="button"
                  class="paint-swatch"
                  :class="{
                    'paint-swatch-selected':
                      factorySwatch && isSwatchSelected('solid', factorySwatch.colourId),
                    'paint-swatch-unowned': factorySwatch && !factorySwatch.owned,
                  }"
                  :style="factorySwatch ? { backgroundColor: factorySwatch.hex } : undefined"
                  :aria-label="factorySwatch ? factorySwatch.name + ' - factory colour' : ''"
                  data-test="paint-swatch-factory"
                  @click="factorySwatch && onSwatchSelect('solid', factorySwatch.colourId)"
                ></button>
                <span class="swatch-label" data-test="paint-swatch-factory-label">
                  <template v-if="factorySwatch">
                    {{ factorySwatch.name }} (factory)
                    <template v-if="!factorySwatch.owned">
                      - {{ formatYen(factorySwatch.priceYen) }} at the parts shop
                      <button
                        type="button"
                        class="buy-btn"
                        :disabled="game.cashYen < factorySwatch.priceYen"
                        data-test="paint-buy-factory"
                        @click="onBuyFactoryTin"
                      >
                        Buy a tin ({{ formatYen(factorySwatch.priceYen) }})
                      </button>
                      <span class="karagawa-strap" data-test="paint-karagawa-factory">{{
                        karagawaLine
                      }}</span>
                    </template>
                  </template>
                </span>
              </div>

              <div v-for="group in ownedPaintTinGroups" :key="group.finish" class="paint-tin-group">
                <span class="tin-group-label">{{ group.label }}</span>
                <span
                  v-if="group.caption"
                  class="refusal-caption"
                  :data-test="'paint-group-caption-' + group.finish"
                >
                  {{ group.caption }}
                </span>
                <div class="paint-tin-row">
                  <button
                    v-for="tin in group.tins"
                    :key="tin.colourId"
                    type="button"
                    class="paint-tin"
                    :class="{ 'paint-swatch-selected': isSwatchSelected(tin.finish, tin.colourId) }"
                    :title="tin.caption ?? undefined"
                    :style="{ backgroundColor: tin.hex }"
                    :aria-label="tin.caption ? `${tin.name} - ${tin.caption}` : tin.name"
                    :data-test="'paint-tin-' + tin.finish + '-' + tin.colourId"
                    @click="onSwatchSelect(tin.finish, tin.colourId)"
                  ></button>
                </div>
              </div>
              <span v-if="ownedPaintTinGroups.length === 0" class="hint" data-test="no-paint-tins">
                No paint in stock - <RouterLink :to="{ name: 'parts' }">buy some</RouterLink>.
              </span>
            </template>
          </div>

          <div class="panel-row" data-test="panel-row">
            <button
              type="button"
              class="verb-btn"
              :disabled="removePanelDisabled"
              data-test="panel-take-off"
              @click="onRemovePanelClick(selectedZone.zoneId)"
            >
              {{ REMOVE_PANEL_LABEL }}
            </button>
            <button
              type="button"
              class="verb-btn"
              :disabled="!selectedZone.zone.panelMissing"
              data-test="panel-fit"
              @click="onZoneFitClick(selectedZone.zoneId)"
            >
              Fit a panel
            </button>
            <button
              type="button"
              class="verb-btn"
              :disabled="stripBackDisabled"
              data-test="panel-strip-back"
              @click="onStripBackClick"
            >
              Strip back
            </button>

            <span class="panel-figures" data-test="panel-take-off-figures">{{
              zoneRemovePanelPlan
                ? `${formatYen(zoneRemovePanelPlan.costYen)} · ${zoneRemovePanelPlan.laborSlots} labour`
                : ''
            }}</span>
            <span class="panel-figures" data-test="panel-fit-figures"></span>
            <span class="panel-figures" data-test="panel-strip-back-figures">{{
              stripBackPlan
                ? `${formatYen(stripBackPlan.costYen)} · ${stripBackPlan.laborSlots} labour`
                : ''
            }}</span>

            <span class="panel-caption" data-test="panel-take-off-caption">
              {{ removePanelCaption }} {{ REMOVE_PANEL_PURPOSE }}
            </span>
            <span class="panel-caption" data-test="panel-fit-caption">{{
              selectedZone.zone.panelMissing ? '' : 'Fit only after the old panel comes off.'
            }}</span>
            <span class="panel-caption" data-test="panel-strip-back-caption">{{
              STRIP_BACK_CAPTION
            }}</span>
          </div>
        </template>

        <!-- A part selection: repair, take off, fit - the same three per-part
             controls `CarDetailScreen.vue` offers, hosted here so a click on
             an interior/aero part never falls through to nothing. -->
        <template v-else-if="selectedPartRow">
          <div class="panel-head">
            <span class="panel-name" data-test="panel-name">{{ selectedPartRow.displayName }}</span>
            <BandChip :band="selectedPartRow.band" />
          </div>

          <div v-if="selectedPartRepairStep" class="action-row">
            <button
              type="button"
              class="verb-btn"
              data-test="part-repair"
              @click="onPartRepairClick"
            >
              {{ selectedPartRepairLabel }}
            </button>
          </div>

          <div class="action-row">
            <button
              type="button"
              class="verb-btn"
              :disabled="!!selectedPartRemoveReason"
              data-test="part-remove"
              @click="onPartRemoveClick"
            >
              Take it off
            </button>
            <span
              v-if="selectedPartRemoveReason"
              class="refusal-caption"
              data-test="part-remove-caption"
            >
              {{ selectedPartRemoveReason }}
            </span>
          </div>

          <div class="action-row">
            <button type="button" class="verb-btn" data-test="part-fit" @click="onPartFitClick">
              Fit
            </button>
          </div>
        </template>
      </section>
    </template>
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
  margin: var(--mg-space-2) 0;
}

.car-name {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text);
  font-size: var(--mg-fs-md);
}

.empty-bay {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The whole-body header: a fixed strip between the car name and the
   diagram, never moving whatever the selected zone is. */
.body-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-3);
  margin: 0 0 var(--mg-space-3);
  padding: var(--mg-space-2) var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  font-size: var(--mg-fs-sm);
}

.body-header-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
}

.body-header-count,
.body-header-next {
  color: var(--mg-text-dim);
}

/* The respray row: tier 3's whole-car control, fixed directly under the
   header - the same button/figures/caption idiom as the pipeline and panel
   rows below, just one control wide since there is only ever one respray
   in flight. */
.respray-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--mg-space-1) var(--mg-space-2);
  margin: 0 0 var(--mg-space-3);
}

.respray-figures,
.respray-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  min-height: 1.2em;
}

.respray-caption {
  font-style: italic;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--mg-space-1);
}

/* Karagawa Express: the brand strapline beside every inline buy control -
   dim, italic, and reserving its own height so a control appearing or
   disappearing never shifts the row around it. */
.karagawa-strap {
  display: block;
  min-height: 1.1em;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

.action-panel {
  margin-top: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
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
  margin: 0 0 var(--mg-space-2);
}

.panel-name {
  color: var(--mg-text);
  font-size: var(--mg-fs-md);
}

/* The status strip: three fixed rows, metal/prep/paint, never a single
   structure-only band standing in for all three. */
.status-strip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 var(--mg-space-2);
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
}

.status-label {
  color: var(--mg-text-dim);
  width: 3.5em;
  flex: none;
}

.status-value {
  color: var(--mg-text);
}

.status-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid var(--mg-panel-edge);
}

.guidance-line {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  min-height: 1.2em;
}

/* The pipeline row: five equal-width buttons, laid out as fifteen grid
   items in row-major order so the button row, the figures row and the
   caption row line up across every column without any nested markup. */
.pipeline-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--mg-space-1) var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
}

.pipeline-btn {
  width: 100%;
}

.pipeline-figures,
.pipeline-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  min-height: 1.2em;
}

.pipeline-caption {
  font-style: italic;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mg-space-1);
}

.buy-btn {
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  border-color: var(--mg-yen);
  color: var(--mg-yen);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: 1px var(--mg-space-2);
  cursor: pointer;
}

.buy-btn:disabled {
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  cursor: not-allowed;
}

.disclosure {
  margin: 0 0 var(--mg-space-2);
  min-height: 1.2em;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

/* The paint swatch row: always reserves its space, filled in only while
   paint is the coming step. */
.swatch-row {
  min-height: 1.6em;
  margin: 0 0 var(--mg-space-2);
}

.paint-swatch-factory {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
}

.swatch-label {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.paint-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--mg-panel-edge);
  border-radius: 0;
  cursor: pointer;
}

.paint-swatch-unowned {
  opacity: 0.4;
}

.paint-swatch-selected,
.paint-tin.paint-swatch-selected {
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

.hint {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.paint-tin-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
}

.tin-group-label {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.paint-tin-row {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.paint-tin {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--mg-panel-edge);
  border-radius: 0;
  cursor: pointer;
}

.paint-tin:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.paint-tin:focus-visible,
.paint-swatch:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

/* The panel row: take it off, fit one, strip back - three fixed slots, the
   same button/figures/caption grid idiom as the pipeline row above. */
.panel-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mg-space-1) var(--mg-space-2);
}

.panel-figures,
.panel-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  min-height: 1.2em;
}

.panel-caption {
  font-style: italic;
}

.action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
}

.verb-btn {
  flex: none;
  background: transparent;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
  font: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
  cursor: pointer;
}

.verb-btn:disabled {
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  cursor: not-allowed;
}

.refusal-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}
</style>
