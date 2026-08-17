<script setup lang="ts">
import type {
  Grade,
  PaintFinish,
  PartInstance,
  PipelineStageId,
  ZoneId,
} from '@midnight-garage/content'
import {
  PAINT_COLOURS,
  fitmentClassForTier,
  paintStockKey,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import {
  factoryColourSet,
  hasMachineLineFor,
  machineLaborMultiplier,
  zoneConditionBand,
  zoneNextStep,
} from '@midnight-garage/sim'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BandChip from '../components/BandChip.vue'
import WorkshopViews, { type WorkshopSelection } from '../components/WorkshopViews.vue'
import { useCarPartDropZones } from '../composables/useCarPartDropZones'
import { useGameStore, type MachineLaborDisclosure } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { colourTokenDisplayName } from '../utils/paintFamilies'
import { zoneWhyChips } from '../utils/zoneSeverity'

/**
 * The body shop room (sprint208.md): the zone diagram and the one zone
 * action panel, moved here from `CarDetailScreen.vue` wholesale. There is no
 * route param - the room always works the car currently in the body bay
 * (`GameState.bodyBayCarId`), the same car the garage's bay slot shows, so
 * there is never a mismatch between what the bay holds and what this screen
 * acts on.
 */

const game = useGameStore()

const carId = computed(() => game.gameState.bodyBayCarId)
const detail = computed(() => (carId.value ? game.carDetail(carId.value) : undefined))

const { dropZones } = useCarPartDropZones(detail)

const selectedZoneId = ref<ZoneId | null>(null)
watch(carId, () => {
  selectedZoneId.value = null
})

function onWorkshopSelect(selection: WorkshopSelection): void {
  if (selection.kind === 'zone') selectedZoneId.value = selection.zoneId
}

const zoneState = computed(() => detail.value?.car.zoneState ?? null)

/** The docked zone, with everything its panel needs: the live zone state,
 * its display name, its own condition band, its why chips, and its single
 * next pipeline stage - the same shape `CarDetailScreen.vue` used to build
 * before this panel moved here (sprint208.md). */
const selectedZone = computed(() => {
  const zones = zoneState.value
  const zoneId = selectedZoneId.value
  if (!zoneId || !zones) return null
  const zone = zones[zoneId]
  return {
    zoneId,
    zone,
    name: titleCaseFromSlug(zoneId),
    band: zoneConditionBand(zone),
    whyChips: zoneWhyChips(zone, detail.value?.model.uid),
    nextStep: zoneNextStep(zone),
  }
})

const noLabourLeft = computed(() => game.laborSlotsRemainingToday <= 0)

/** Why a plan-gated control is disabled, when it is - the same idiom every
 * other refused control in the shop states its reason with. A `null` plan
 * can mean several structural things the sim doesn't hand back a code for
 * yet; the one reason this screen can always name for itself is the shared
 * labour pool running dry. */
function planDisabledReason(plan: { costYen: number; laborSlots: number } | null): string | null {
  if (plan) return null
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

function matchingPanelsFor(zoneId: ZoneId): PartInstance[] {
  const d = detail.value
  if (!d) return []
  const model = game.context.modelsById[d.car.modelId]
  if (!model) return []
  const fitClass = fitmentClassForTier(model.tier)
  return game.gameState.partInventory.filter((p: PartInstance) => {
    const part = game.context.partsById[p.partId]
    return part?.zoneId === zoneId && part.fitmentClass === fitClass
  })
}

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

function installPanelPreview(
  zoneId: ZoneId,
  partInstanceId: string,
): { costYen: number; laborSlots: number } | null {
  const car = detail.value?.car
  if (!car) return null
  return game.pipelineActionPlan(car, { kind: 'pipeline-install-panel', zoneId, partInstanceId })
}

function onInstallPanelClick(zoneId: ZoneId, partInstanceId: string): void {
  const car = detail.value?.car
  if (!car || !partInstanceId) return
  game.installPanel(car.id, zoneId, partInstanceId)
}

const zonePanelOptions = computed(() => {
  const zone = selectedZone.value
  if (!zone || !zone.zone.panelMissing) return []
  return matchingPanelsFor(zone.zoneId).map((instance) => ({
    id: instance.id,
    label: game.partName(instance.partId) + ' (' + instance.band + ')',
    plan: installPanelPreview(zone.zoneId, instance.id),
  }))
})

const zoneRemovePanelPlan = computed(() =>
  selectedZone.value ? removePanelPreview(selectedZone.value.zoneId) : null,
)

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
      tins.push({
        finish,
        colourId: colour.id,
        hex: colour.hex,
        name: colourTokenDisplayName(colour.id, detail.value?.model.uid),
        plan: game.pipelineActionPlan(car, {
          kind: 'pipeline-paint',
          zoneId: zone.zoneId,
          colour: colour.id,
          grade,
        }),
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
      tins,
    }
  })
})
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

      <WorkshopViews :car-id="detail.car.id" :drop-zones="dropZones" @select="onWorkshopSelect" />

      <section class="action-panel" data-test="zone-action-panel">
        <p v-if="!selectedZone" class="panel-empty" data-test="panel-empty">
          Pick a zone on the diagram above and what you can do to it turns up here.
        </p>

        <template v-else>
          <div class="panel-head">
            <span class="panel-name" data-test="panel-name">{{ selectedZone.name }}</span>
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

          <!-- The single next action: one fixed verb button, its figures
               beside it - never a priced sentence inside the button. -->
          <div v-if="nextActionLabel" class="action-row">
            <button
              type="button"
              class="verb-btn"
              :disabled="!nextActionPlan"
              :title="planDisabledReason(nextActionPlan) ?? undefined"
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
                :title="planDisabledReason(zoneRemovePanelPlan) ?? undefined"
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
            </template>
            <template v-else-if="zonePanelOptions.length > 0">
              <div v-for="option in zonePanelOptions" :key="option.id" class="action-row">
                <button
                  type="button"
                  class="verb-btn"
                  :disabled="!option.plan"
                  :title="planDisabledReason(option.plan) ?? undefined"
                  :data-test="'pipeline-install-panel-' + selectedZone.zoneId + '-' + option.id"
                  @click="onInstallPanelClick(selectedZone.zoneId, option.id)"
                >
                  Fit {{ option.label }}
                </button>
                <span
                  v-if="option.plan"
                  class="figures"
                  :data-test="
                    'pipeline-install-panel-figures-' + selectedZone.zoneId + '-' + option.id
                  "
                >
                  {{ formatYen(option.plan.costYen) }} &middot; {{ option.plan.laborSlots }} labour
                </span>
              </div>
            </template>
            <span v-else class="hint" :data-test="'no-panels-' + selectedZone.zoneId"
              >No panel for this zone on hand - the parts shop sells them.</span
            >
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
                :title="planDisabledReason(stripPrepPlan) ?? undefined"
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
            <div class="paint-tin-row">
              <button
                v-for="tin in group.tins"
                :key="tin.colourId"
                type="button"
                class="paint-tin"
                :disabled="!tin.plan"
                :title="planDisabledReason(tin.plan) ?? undefined"
                :style="{ backgroundColor: tin.hex }"
                :aria-label="tin.name"
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
