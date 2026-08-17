<script setup lang="ts">
import type {
  CarPartId,
  Grade,
  PaintFinish,
  PipelineStageId,
  ZoneId,
} from '@midnight-garage/content'
import {
  CONSUMABLE_TINS,
  PAINT_COLOURS,
  paintStockKey,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import {
  bodyLineCapability,
  factoryColourSet,
  firstShortfall,
  hasMachineLineFor,
  machineLaborMultiplier,
  planPaintStage,
  planPipelineStage,
  stageConsumables,
  zoneConditionBand,
  zoneNextStep,
  type PipelineStageRefusal,
} from '@midnight-garage/sim'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import WorkshopViews, { type WorkshopSelection } from '../components/WorkshopViews.vue'
import { useCarPartDropZones } from '../composables/useCarPartDropZones'
import { useDragSession } from '../composables/useDragAndDrop'
import { useZoneDropZones } from '../composables/useZoneDropZones'
import { useGameStore, type MachineLaborDisclosure } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'
import { formatYen } from '../utils/formatYen'
import { colourTokenDisplayName } from '../utils/paintFamilies'
import { repairStepText } from '../utils/repairStepLabels'
import {
  ZONE_FINISH_LABELS,
  zoneBothDone,
  zoneFinishPosition,
  zoneRemainingSteps,
  zoneWhyChips,
} from '../utils/zoneSeverity'

/**
 * The body shop room (sprint208.md): the zone diagram and the one zone
 * action panel, moved here from `CarDetailScreen.vue` wholesale. There is no
 * route param - the room always works the car currently in the body bay
 * (`GameState.bodyBayCarId`), the same car the garage's bay slot shows, so
 * there is never a mismatch between what the bay holds and what this screen
 * acts on.
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
 * targets what it displays, so a click can never act on a stale target: the
 * root cause this screen used to carry was a part click being a silent
 * no-op that left a zone selection standing.
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

/** The docked zone, with everything its panel needs: the live zone state,
 * its display name, its own condition band, its why chips, its single next
 * pipeline stage, its finish position, and its remaining-steps checklist
 * (sprint211.md task B - structure and finish are different facts, so both
 * show, and the checklist unrolls the whole ladder rather than just the
 * next verb). */
const selectedZone = computed(() => {
  const zones = zoneState.value
  const zoneId = selectedZoneId.value
  if (!zoneId || !zones) return null
  const zone = zones[zoneId]
  const band = zoneConditionBand(zone)
  const finishPosition = zone.panelMissing ? null : zoneFinishPosition(zone)
  return {
    zoneId,
    zone,
    name: titleCaseFromSlug(zoneId),
    band,
    whyChips: zoneWhyChips(zone, detail.value?.model.uid),
    nextStep: zoneNextStep(zone),
    // `null` once structure and finish are both done - the band chip alone
    // is then the whole story, and a second "polished" tag beside a "mint"
    // chip would say nothing new.
    finishLabel:
      finishPosition && !zoneBothDone(band, finishPosition)
        ? ZONE_FINISH_LABELS[finishPosition]
        : null,
    remainingSteps: zone.panelMissing ? [] : zoneRemainingSteps(zone),
  }
})

const noLabourLeft = computed(() => game.laborSlotsRemainingToday <= 0)

/** The material name a stage's own shortfall names, straight off the
 * catalogue that prices it - `firstShortfall` (sim) already tells us which
 * `consumableStock` key is short, this just makes the key readable. */
const MATERIAL_NAME_BY_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  CONSUMABLE_TINS.map((tin) => [tin.id, tin.name]),
)

/** A structural pipeline refusal (sim's own `PipelineStageRefusal.reason`),
 * in plain words - the vocabulary every caption below shares. */
const PIPELINE_REFUSAL_CAPTIONS: Readonly<Partial<Record<PipelineStageRefusal['reason'], string>>> =
  {
    'needs-panel': 'Fit a panel here first.',
    prereq: 'Needs priming first.',
    'wrong-colour': "Not this car's factory colour.",
    'metal-only': 'This zone has no metal to work.',
  }

/** The disabled-control caption every plan-gated action in this room shares
 * once its own structural reason is ruled out (sprint211.md task C, caption
 * idiom - visible on the surface, never title-only): off the body bay's own
 * car, then no labour left today. */
function basicCaption(
  plan: { costYen: number; laborSlots: number } | null,
  carIdForCaption: string,
): string | null {
  if (plan) return null
  const bay = game.pipelineBodyBayCaption(carIdForCaption)
  if (bay) return bay
  return noLabourLeft.value ? 'No labour left today' : null
}

/** A generic (non-paint) stage control's own caption: the shared bay/labour
 * checks above, plus the pure sim planner's own structural refusal (read
 * straight off `planPipelineStage`, the exact function the click resolves
 * through, so the caption can never claim a reason the resolver disagrees
 * with) and a shelf shortfall for whatever material the stage draws. */
function stageCaption(
  plan: { costYen: number; laborSlots: number } | null,
  zoneId: ZoneId,
  stage: Exclude<PipelineStageId, 'paint'>,
): string | null {
  if (plan) return null
  const car = detail.value?.car
  if (!car) return null
  const bay = game.pipelineBodyBayCaption(car.id)
  if (bay) return bay
  const zone = zoneState.value?.[zoneId]
  if (zone) {
    const result = planPipelineStage(stage, zone, bodyLineCapability(game.gameState, game.context))
    if (!result.ok) return PIPELINE_REFUSAL_CAPTIONS[result.reason] ?? 'Not ready yet.'
  }
  const shortfall = firstShortfall(game.consumableStock, stageConsumables(stage))
  if (shortfall) {
    return `Out of ${MATERIAL_NAME_BY_KEY[shortfall.key] ?? shortfall.key} - buy more from the parts shop.`
  }
  return noLabourLeft.value ? 'No labour left today' : null
}

/** A paint tin's own caption - the same bay/labour checks, plus
 * `planPaintStage`'s own structural refusal (not primed, or a stock-grade
 * tin in the wrong colour). Never a stock caption: every tin rendered here
 * is already known to be on the shelf (`ownedPaintTins` below only lists
 * what `consumableStock` actually holds). */
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
    if (!result.ok) return PIPELINE_REFUSAL_CAPTIONS[result.reason] ?? 'Not ready yet.'
  }
  return noLabourLeft.value ? 'No labour left today' : null
}

// --- The next-action ladder (beat/weld/fill and sand/prime/polish) --------

/** The next-action ladder's own fixed verb labels - the direct, single-click
 * stages `zoneNextStep` can name. `paint` and `replace-panel` are not here:
 * both need a further pick (which tin, which panel) and read through their
 * own dedicated controls below instead of this fixed button. */
const NEXT_ACTION_LABELS: Partial<Record<PipelineStageId | 'replace-panel', string>> = {
  beat: 'Beat',
  weld: 'Weld',
  fillAndSand: 'Fill and sand',
  prime: 'Prime',
  polish: 'Polish',
}

const nextActionLabel = computed(() => {
  const step = selectedZone.value?.nextStep
  return step ? (NEXT_ACTION_LABELS[step] ?? null) : null
})

/** One pipeline stage's live preview for the docked zone - straight from
 * `pipelineActionPlan`, the exact function the click below resolves with,
 * never a re-derived client-side gate. */
function stagePreview(
  zoneId: ZoneId,
  stage: Exclude<PipelineStageId, 'paint'>,
): { costYen: number; laborSlots: number } | null {
  const car = detail.value?.car
  if (!car) return null
  return game.pipelineActionPlan(car, { kind: 'pipeline-stage', stage, zoneId })
}

const nextActionPlan = computed(() => {
  const zone = selectedZone.value
  if (!zone || !nextActionLabel.value) return null
  return stagePreview(zone.zoneId, zone.nextStep as Exclude<PipelineStageId, 'paint'>)
})

/** The next-action button's own caption when it has no plan - read here
 * rather than inline in the template, since the cast to the stage's own
 * narrower type belongs in script. */
const nextActionCaption = computed(() => {
  const zone = selectedZone.value
  if (!zone || !nextActionLabel.value) return null
  return stageCaption(
    nextActionPlan.value,
    zone.zoneId,
    zone.nextStep as Exclude<PipelineStageId, 'paint'>,
  )
})

function onStageClick(zoneId: ZoneId, stage: Exclude<PipelineStageId, 'paint'>): void {
  const car = detail.value?.car
  if (!car) return
  game.pipelineStage(car.id, zoneId, stage)
}

function onNextActionClick(): void {
  const zone = selectedZone.value
  if (!zone || !nextActionLabel.value) return
  onStageClick(zone.zoneId, zone.nextStep as Exclude<PipelineStageId, 'paint'>)
}

/**
 * The weld stage's own by-hand/with-the-line disclosure - the same shape
 * every other machine-gated control on the car page already carries
 * (`gameStore.ts`'s `machineLaborDisclosureFor`), built here directly off
 * the sim's own rate primitives since the pipeline's weld stage sits outside
 * that helper's part-address callers. `null` once the body line is owned or
 * hired for the day - the plain labour figure on the button is then already
 * the whole story.
 */
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

/** The weld control's own disclosure line, shown whenever weld is the
 * docked zone's next action and the body line isn't already owned or hired
 * today - "By hand with the stick welder" names the tool doing the work,
 * same disclosure idiom the machine-hire notes use for every other gated
 * control in the shop. */
const weldDisclosureText = computed(() => {
  if (selectedZone.value?.nextStep !== 'weld') return ''
  const disclosure = weldDisclosure.value
  if (!disclosure) return ''
  return `By hand with the stick welder - slower. ${game.machineLaborDisclosureText(disclosure)}`
})

// --- The discretionary Prep control (strip a coat before a new one) -------

const canStripPrep = computed(() => {
  const zone = selectedZone.value?.zone
  return zone ? zone.colour != null || zone.primed : false
})

const stripPrepPlan = computed(() =>
  selectedZone.value ? stagePreview(selectedZone.value.zoneId, 'stripPrep') : null,
)

function onStripPrepClick(): void {
  const zone = selectedZone.value
  if (!zone) return
  onStageClick(zone.zoneId, 'stripPrep')
}

// --- The panel: take it off, or fit one from the shelf ---------------------

const REMOVE_PANEL_LABEL = 'Take it off'

/** Why the panel comes off at all - shown every time the control is on
 * screen, not only when it is disabled (sprint211.md task E: no repair ever
 * requires removal, so the reason has to be stated, not just implied by
 * context). */
const REMOVE_PANEL_PURPOSE =
  'Comes off for a replacement panel, or to keep the old one safe on the shelf.'

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

/**
 * Opens (or, if already scoped to this exact zone, closes) the Warehouse for
 * a fresh panel - the standard "Fit" idiom every other slot in the game
 * uses (sprint211.md task D: the old per-SKU button block picked straight
 * off the inventory itself, a second fit flow living beside the real one).
 * A zone only ever offers this while its own panel is missing - fitting over
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

// --- The finish coat: strip/prime already run through the ladder above, ---
// paint is its own picker over the tins actually on the shelf. ------------

/** This car's factory colour, named in full - the iconic name where one
 * applies, the plain palette name(s) otherwise. */
const factoryColourCaption = computed<string>(() =>
  detail.value
    ? colourTokenDisplayName(detail.value.car.factoryColour, detail.value.model.uid)
    : '',
)

const factoryColourIds = computed<ReadonlySet<string>>(() =>
  detail.value ? factoryColourSet(detail.value.car.factoryColour) : new Set<string>(),
)

function isFactoryColour(colourId: string): boolean {
  return factoryColourIds.value.has(colourId)
}

/**
 * One tin's own derived grade: metallic and pearl finishes map straight to
 * `sport`/`race`; a solid finish maps to `stock` when the colour is (one
 * half of) this car's own factory scheme, and to `street` otherwise - the
 * one rule `planPaintStage`'s own stock-grade gate already enforces, read
 * forward instead of offered as a choice that could land on a refusal.
 */
function gradeForTin(finish: PaintFinish, colourId: string): Grade {
  if (finish === 'metallic') return 'sport'
  if (finish === 'pearl') return 'race'
  return isFactoryColour(colourId) ? 'stock' : 'street'
}

const PAINT_FINISHES: readonly PaintFinish[] = ['solid', 'metallic', 'pearl']

interface OwnedPaintTin {
  finish: PaintFinish
  colourId: string
  hex: string
  name: string
  plan: { costYen: number; laborSlots: number } | null
  caption: string | null
}

/** Every paint tin actually on the shelf, as the docked zone's own picker:
 * each owned tin already carries both halves of colour AND finish/grade, so
 * choosing one tin is the whole decision. */
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

function onPaintTinClick(colourId: string, finish: PaintFinish): void {
  const zone = selectedZone.value
  const car = detail.value?.car
  if (!zone || !car) return
  game.paintZone(car.id, zone.zoneId, colourId, gradeForTin(finish, colourId))
}

const PAINT_FINISH_LABELS: Record<PaintFinish, string> = {
  solid: 'Solid',
  metallic: 'Metallic',
  pearl: 'Pearl',
}

interface PaintTinGroup {
  finish: PaintFinish
  label: string
  /** The finish's own loud price, read off any one tin in the group - fixed
   * by finish alone, never by colour. */
  plan: { costYen: number; laborSlots: number } | null
  /** The group's own refusal caption (sprint211.md task C) - read off the
   * first disabled tin, since every tin in a finish group refuses for the
   * same structural reason (not primed, or the panel missing) bar the rare
   * per-colour stock-grade mismatch, which each swatch's own `title` still
   * carries individually. `null` once every tin in the group has a plan. */
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
      plan: tins.find((tin) => tin.plan)?.plan ?? null,
      caption: tins.find((tin) => tin.caption)?.caption ?? null,
      tins,
    }
  })
})

// --- A part selection, hosted here rather than dropped silently ------------
// (sprint211.md task A). Only repair, take-off and fit - the same store
// getters `CarDetailScreen.vue` reads for a selected part, never a
// parallel gate of this screen's own. Interior/aero parts have no real body-
// bay pipeline of their own yet (sprint212.md), so any refusal these read
// today comes straight off the sim's existing gate and updates on its own
// once that lands. -------------------------------------------------------

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
            <BandChip
              v-if="!selectedZone.zone.panelMissing"
              :band="selectedZone.band"
              :data-test="'zone-band-' + selectedZone.zoneId"
            />
            <span
              v-if="selectedZone.finishLabel"
              class="finish-tag"
              :data-test="'zone-finish-' + selectedZone.zoneId"
              >{{ selectedZone.finishLabel }}</span
            >
            <span
              v-if="selectedZone.zone.panelMissing"
              class="missing-tag"
              data-test="zone-panel-off"
              >Missing</span
            >
          </div>

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

          <!-- The remaining-steps checklist: the whole ladder still ahead of
               this zone, not just the single next verb (sprint211.md task
               B). The first entry is always what the button below actually
               does next. -->
          <ul
            v-if="selectedZone.remainingSteps.length > 0"
            class="remaining-steps"
            :data-test="'zone-remaining-' + selectedZone.zoneId"
          >
            <li
              v-for="(step, index) in selectedZone.remainingSteps"
              :key="index"
              :data-test="'zone-remaining-step-' + selectedZone.zoneId + '-' + index"
            >
              {{ step }}
            </li>
          </ul>

          <!-- The single next action: one fixed verb button, its figures
               beside it - never a priced sentence inside the button. -->
          <div v-if="nextActionLabel" class="action-row">
            <button
              type="button"
              class="verb-btn"
              :disabled="!nextActionPlan"
              :data-test="'zone-next-action-' + selectedZone.zoneId"
              @click="onNextActionClick"
            >
              {{ nextActionLabel }}
            </button>
            <span
              v-if="nextActionPlan"
              class="figures"
              :data-test="'zone-next-action-figures-' + selectedZone.zoneId"
            >
              {{ formatYen(nextActionPlan.costYen) }} &middot; {{ nextActionPlan.laborSlots }}
              labour
            </span>
            <span
              v-else
              class="refusal-caption"
              :data-test="'zone-next-action-caption-' + selectedZone.zoneId"
            >
              {{ nextActionCaption }}
            </span>
          </div>
          <p
            v-if="weldDisclosureText"
            class="disclosure"
            :data-test="'weld-disclosure-' + selectedZone.zoneId"
          >
            {{ weldDisclosureText }}
          </p>

          <!-- The panel itself: on, or off. Never a swap verb - it comes off,
               then a fresh one goes on, two separate acts. -->
          <div class="action-row">
            <template v-if="!selectedZone.zone.panelMissing">
              <button
                type="button"
                class="verb-btn"
                :disabled="!zoneRemovePanelPlan"
                :data-test="'pipeline-remove-panel-' + selectedZone.zoneId"
                @click="onRemovePanelClick(selectedZone.zoneId)"
              >
                {{ REMOVE_PANEL_LABEL }}
              </button>
              <span
                v-if="zoneRemovePanelPlan"
                class="figures"
                :data-test="'pipeline-remove-panel-figures-' + selectedZone.zoneId"
              >
                {{ formatYen(zoneRemovePanelPlan.costYen) }} &middot;
                {{ zoneRemovePanelPlan.laborSlots }} labour
              </span>
              <span
                v-else
                class="refusal-caption"
                :data-test="'pipeline-remove-panel-caption-' + selectedZone.zoneId"
              >
                {{ basicCaption(zoneRemovePanelPlan, detail.car.id) }}
              </span>
              <span class="purpose-caption" data-test="pipeline-remove-panel-purpose">{{
                REMOVE_PANEL_PURPOSE
              }}</span>
            </template>
            <button
              v-else
              type="button"
              class="verb-btn"
              :data-test="'zone-fit-' + selectedZone.zoneId"
              @click="onZoneFitClick(selectedZone.zoneId)"
            >
              Fit
            </button>
          </div>

          <!-- The finish coat: Prep strips what's there when there's a coat
               to strip, then a tin off the shelf lays the new one down. -->
          <div class="action-row">
            <span class="factory-colour" :data-test="'factory-colour-' + selectedZone.zoneId">
              Factory colour: {{ factoryColourCaption }}
            </span>
            <template v-if="canStripPrep">
              <button
                type="button"
                class="verb-btn"
                :disabled="!stripPrepPlan"
                :data-test="'pipeline-stripPrep-' + selectedZone.zoneId"
                @click="onStripPrepClick"
              >
                Prep
              </button>
              <span
                v-if="stripPrepPlan"
                class="figures"
                :data-test="'pipeline-stripPrep-figures-' + selectedZone.zoneId"
              >
                {{ formatYen(stripPrepPlan.costYen) }} &middot; {{ stripPrepPlan.laborSlots }}
                labour
              </span>
              <span
                v-else
                class="refusal-caption"
                :data-test="'pipeline-stripPrep-caption-' + selectedZone.zoneId"
              >
                {{ stageCaption(stripPrepPlan, selectedZone.zoneId, 'stripPrep') }}
              </span>
            </template>
          </div>

          <div v-for="group in ownedPaintTinGroups" :key="group.finish" class="paint-tin-group">
            <span class="verb-btn label-only">Paint</span>
            <span class="tin-group-label">{{ group.label }}</span>
            <span
              v-if="group.plan"
              class="figures"
              :data-test="'pipeline-paint-figures-' + selectedZone.zoneId + '-' + group.finish"
            >
              {{ formatYen(group.plan.costYen) }} &middot; {{ group.plan.laborSlots }} labour
            </span>
            <span
              v-else-if="group.caption"
              class="refusal-caption"
              :data-test="'pipeline-paint-caption-' + selectedZone.zoneId + '-' + group.finish"
            >
              {{ group.caption }}
            </span>
            <div class="paint-tin-row">
              <button
                v-for="tin in group.tins"
                :key="tin.colourId"
                type="button"
                class="paint-tin"
                :disabled="!tin.plan"
                :title="tin.caption ?? undefined"
                :style="{ backgroundColor: tin.hex }"
                :aria-label="tin.caption ? `${tin.name} - ${tin.caption}` : tin.name"
                :data-test="
                  'pipeline-paint-' + selectedZone.zoneId + '-' + tin.finish + '-' + tin.colourId
                "
                @click="onPaintTinClick(tin.colourId, tin.finish)"
              ></button>
            </div>
          </div>
          <span v-if="ownedPaintTinGroups.length === 0" class="hint" data-test="no-paint-tins">
            No paint in stock - <RouterLink :to="{ name: 'parts' }">buy some</RouterLink>.
          </span>
        </template>

        <!-- A part selection: repair, take off, fit - the same three per-part
             controls `CarDetailScreen.vue` offers, hosted here so a click on
             an interior/aero part never falls through to nothing
             (sprint211.md task A). -->
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
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text);
  font-size: var(--mg-fs-md);
}

.empty-bay {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
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

.missing-tag {
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
}

/* The finish-position tag beside the structure band chip (sprint211.md task
   B) - dim, same register as a why-chip, never the plain "Mint" reading on
   its own unless structure and finish are both actually done. */
.finish-tag {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: lowercase;
}

.remaining-steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin: 0 0 var(--mg-space-2);
  padding: 0;
  list-style: none;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.remaining-steps li {
  padding: 0 var(--mg-space-2) 0 0;
  border-right: 1px solid var(--mg-panel-edge);
}

.remaining-steps li:last-child {
  padding-right: 0;
  border-right: none;
}

/* A disabled control's own reason, on the surface rather than in a title
   tooltip (sprint211.md task C, the caption idiom) - same register as
   `.hint`. */
.refusal-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

/* The Take-off control's standing purpose line - shown every time the
   control is on screen, not only while it happens to be disabled
   (sprint211.md task E). */
.purpose-caption {
  flex-basis: 100%;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

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

/* The fixed verb-plus-figures row every action on this panel shares - the
   workbench's own "Repair" + chip + figures pattern (sprint208.md task D):
   the button carries the verb alone, the figures sit beside it, and a
   priced sentence never lands inside a button. */
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

.verb-btn.label-only {
  border: none;
  padding: 0;
  cursor: default;
  color: var(--mg-text);
}

.figures {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.disclosure {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

.hint {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.factory-colour {
  flex-basis: 100%;
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

.paint-tin:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}
</style>
