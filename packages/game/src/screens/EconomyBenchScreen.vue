<script setup lang="ts">
import {
  BuyerArchetypeSchema,
  ComponentIdSchema,
  ConditionBandSchema,
  ReputationTierSchema,
  SceneStandingStageSchema,
  StatKeySchema,
  type BuyerArchetype,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type DayLogEntry,
  type Grade,
  type ReputationTier,
  type SceneStandingStage,
  type SellingChannelId,
  type StatKey,
  type ToolTier,
  type TrimZoneState,
  type ZoneId,
} from '@midnight-garage/content'
import { ALL_CAR_PART_IDS } from '@midnight-garage/content'
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import { SELLING_CHANNEL_LABELS } from '../utils/sellingChannelLabels'
import {
  BENCH_CAR_ID,
  BENCH_ZONE_IDS,
  benchCampaignYear,
  benchCarInstance,
  benchGameState,
  benchYearRange,
  carSpecFrom,
  defaultCarSpec,
  defaultShopSpec,
  generatedBenchCar,
  isMetalZone,
  machiningOptionsForSlot,
  skusForSlot,
  type BenchCarSpec,
  type BenchShopSpec,
} from './dev/economyBench'
import {
  acquisitionPanelFor,
  bandPricedChannelsFor,
  buyerRowsFor,
  channelPricePanelFor,
  channelRowsFor,
  costSheetFor,
  heatPercentFor,
  listingOffersSeenFor,
  mileageNoteFor,
  openingBlockFor,
  pendingOfferFor,
  statsPanelFor,
} from './dev/economyBenchReadout'
import {
  labourRemaining,
  runBenchAction,
  type BenchAction,
  type BenchLogLine,
} from './dev/economyBenchActions'

const game = useGameStore()
const context = computed(() => game.context)

const BANDS = ConditionBandSchema.options
const GROUPS = ComponentIdSchema.options
const STAT_KEYS = StatKeySchema.options
const REPUTATION_TIERS = ReputationTierSchema.options
const SCENES = BuyerArchetypeSchema.options
const STAGES = SceneStandingStageSchema.options
const TOOL_TIERS: readonly ToolTier[] = [1, 2]
const METAL_SEVERITIES = [0, 1, 2, 3, 4]
const SURFACE_SEVERITIES = [0, 1, 2]
const FINISHES = [0, 1, 2, 3]

const modelId = ref(context.value.models[0]?.id ?? '')
const model = computed(() => context.value.modelsById[modelId.value])

const shopSpec = ref<BenchShopSpec>(defaultShopSpec(context.value))
const carSpec = ref<BenchCarSpec>(
  defaultCarSpec(context.value.models[0]!, shopSpec.value, context.value),
)
const generatorSeed = ref(1)

// The bench's own world. `shallowRef`: a GameState is replaced wholesale by
// every resolver, exactly as the real store holds it.
const state = shallowRef(
  benchGameState(
    shopSpec.value,
    benchCarInstance(carSpec.value, context.value.models[0]!, context.value),
    context.value,
  ),
)
const log = ref<BenchLogLine[]>([])
const entries = shallowRef<DayLogEntry[]>([])

/**
 * Whether the builder has been edited since the world below it was built.
 *
 * The readouts describe the built world, so without this an edited mileage box
 * would sit beside the previous car's price with nothing on screen saying which
 * car the figures belong to - the one failure a measuring instrument cannot
 * have. The panel is MARKED rather than rebuilt on every keystroke because a
 * rebuild throws the car and the running log away: the log's premise is a
 * measured delta across an action, and a stray touch of an input would discard
 * a whole session's work and every part fitted in it.
 *
 * Set synchronously, so a function that edits the spec and then rebuilds
 * (picking a model, loading a lot, resetting) ends on a clean panel rather than
 * having its own edit flagged after the fact.
 */
const dirty = ref(false)
watch(
  [carSpec, shopSpec],
  () => {
    dirty.value = true
  },
  { deep: true, flush: 'sync' },
)

const car = computed(() => state.value.ownedCars.find((c) => c.id === BENCH_CAR_ID))

/** The chosen value of the control that fired an event. Template expressions
 * carry no type assertions, so every `@change` narrows here instead. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function partName(partId: string): string {
  const part = context.value.partsById[partId]
  return part ? `${part.brand} ${part.name}` : partId
}

/** Rebuilds the world from the two spec panels and clears the log: a new car
 * is a new session, and a delta measured against a car that no longer exists
 * would be a lie. */
function rebuild(): void {
  const chosen = model.value
  if (!chosen) return
  state.value = benchGameState(
    shopSpec.value,
    benchCarInstance(carSpec.value, chosen, context.value),
    context.value,
  )
  log.value = []
  entries.value = []
  dirty.value = false
}

function pickModel(id: string): void {
  modelId.value = id
  const chosen = context.value.modelsById[id]
  if (!chosen) return
  carSpec.value = defaultCarSpec(chosen, shopSpec.value, context.value)
  rebuild()
}

/** Loads a REAL generated lot through `generateAuctionCarInstance` - the
 * common case, since a realistic car is rolled rather than hand-set. */
function loadGeneratedLot(): void {
  const chosen = model.value
  if (!chosen) return
  const rolled = generatedBenchCar(chosen, generatorSeed.value, shopSpec.value, context.value)
  carSpec.value = carSpecFrom(rolled)
  rebuild()
}

/** Reads the car as it now stands back into the builder, so a session's work
 * becomes the next session's starting point. */
function readCarBackIn(): void {
  const current = car.value
  if (!current) return
  carSpec.value = carSpecFrom(current)
}

function resetSpec(): void {
  const chosen = model.value
  if (!chosen) return
  carSpec.value = defaultCarSpec(chosen, shopSpec.value, context.value)
  rebuild()
}

// --- the builder's own controls -------------------------------------------

/** The oldest and youngest years the generator would allow this car in this
 * shop's campaign - sim's own window (`generatedYearRangeFor`), which bounds
 * the year control rather than being read a second time here. */
const yearRange = computed<[number, number]>(() =>
  model.value
    ? benchYearRange(model.value, shopSpec.value, context.value)
    : [carSpec.value.year, carSpec.value.year],
)

function clampYear(year: number): number {
  const [oldest, youngest] = yearRange.value
  if (!Number.isFinite(year)) return oldest
  return Math.min(youngest, Math.max(oldest, Math.round(year)))
}

/** Clamps a typed year into the production window and writes the clamped
 * figure back into the box, so the control can never show a car the generator
 * could not produce. The year is flavour and reaches no price, so nothing else
 * moves with it. */
function setYear(event: Event): void {
  const input = event.target as HTMLInputElement
  const year = clampYear(Number(input.value))
  carSpec.value = { ...carSpec.value, year }
  input.value = String(year)
}

function setSlotSku(partId: CarPartId, skuId: string): void {
  const slot = carSpec.value.build[partId]
  carSpec.value.build[partId] = { ...slot, partId: skuId === '' ? null : skuId }
}

function setSlotBand(partId: CarPartId, band: string): void {
  carSpec.value.build[partId] = { ...carSpec.value.build[partId], band: band as ConditionBand }
}

function toggleSlotMachining(partId: CarPartId, operationId: string): void {
  const slot = carSpec.value.build[partId]
  const has = slot.machining.includes(operationId)
  carSpec.value.build[partId] = {
    ...slot,
    machining: has
      ? slot.machining.filter((id) => id !== operationId)
      : [...slot.machining, operationId],
  }
}

/**
 * Writes a patch onto one zone. Metal and trim zones are genuinely different
 * shapes (a bumper has no metal severity to read at all), so the write is
 * narrowed rather than cast: the two branches are identical to read and are
 * what lets the compiler keep the shapes apart.
 */
function patchZone(zoneId: ZoneId, patch: Partial<TrimZoneState>): void {
  const zones = carSpec.value.zones
  if (isMetalZone(zoneId)) {
    zones[zoneId] = { ...zones[zoneId], ...patch }
    return
  }
  zones[zoneId] = { ...zones[zoneId], ...patch }
}

function setZoneFinish(zoneId: ZoneId, finish: number): void {
  patchZone(zoneId, { finish })
}

function setMetalSeverity(zoneId: ZoneId, field: 'metal' | 'surface', value: number): void {
  if (!isMetalZone(zoneId)) return
  const zones = carSpec.value.zones
  zones[zoneId] = { ...zones[zoneId], [field]: value }
}

function toggleZoneFlag(zoneId: ZoneId, field: 'panelMissing' | 'primed'): void {
  patchZone(zoneId, { [field]: !carSpec.value.zones[zoneId][field] })
}

function setZoneColour(zoneId: ZoneId, colour: string): void {
  patchZone(zoneId, { colour: colour === '' ? undefined : colour })
}

function setZonePanelGrade(zoneId: ZoneId, grade: string): void {
  patchZone(zoneId, { panelGrade: grade === '' ? undefined : (grade as Grade) })
}

const symptomToAdd = ref('')

function addSymptom(): void {
  const symptom = context.value.symptomsById[symptomToAdd.value]
  if (!symptom) return
  const causeIds = symptom.causes.map((cause) => cause.id)
  carSpec.value = {
    ...carSpec.value,
    symptoms: [
      ...carSpec.value.symptoms,
      {
        symptomId: symptom.id,
        trueCauseId: causeIds[0] ?? symptom.id,
        remainingCauseIds: causeIds,
        runTestIds: [],
      },
    ],
  }
}

function clearSymptoms(): void {
  carSpec.value = { ...carSpec.value, symptoms: [], apparentBandByPartId: null }
}

function setSceneStanding(scene: BuyerArchetype, stage: string): void {
  shopSpec.value = {
    ...shopSpec.value,
    sceneStanding: { ...shopSpec.value.sceneStanding, [scene]: stage as SceneStandingStage },
  }
}

function setToolTier(group: ComponentId, tier: string): void {
  shopSpec.value = {
    ...shopSpec.value,
    toolTiers: { ...shopSpec.value.toolTiers, [group]: Number(tier) as ToolTier },
  }
}

function setReputationTier(tier: string): void {
  shopSpec.value = { ...shopSpec.value, reputationTier: tier as ReputationTier }
  // The campaign year moves with reputation, and the youngest year the
  // generator allows moves with it, so a year already set can fall outside the
  // new window.
  carSpec.value = { ...carSpec.value, year: clampYear(carSpec.value.year) }
}

/** An empty box means no recorded purchase, which is a different thing from a
 * purchase of nothing. */
function setPurchaseYen(raw: string): void {
  const purchaseYen = raw.trim() === '' ? null : Math.round(Number(raw))
  if (purchaseYen !== null && !Number.isFinite(purchaseYen)) return
  shopSpec.value = { ...shopSpec.value, purchaseYen }
}

/** Records the acquisition at the desk's own instant price for this car, which
 * is a figure already on the screen and already the sim's. */
function takeDeskPrice(): void {
  const panel = acquisition.value
  if (!panel) return
  shopSpec.value = { ...shopSpec.value, purchaseYen: panel.buyoutYen }
}

function toggleShopOwned(shopId: string): void {
  const owned = shopSpec.value.toolShopsOwned
  shopSpec.value = {
    ...shopSpec.value,
    toolShopsOwned: owned.includes(shopId)
      ? owned.filter((id) => id !== shopId)
      : [...owned, shopId],
  }
}

// --- the panels ------------------------------------------------------------

/** What mileage alone is doing to the price, and the curve behind it. */
const mileage = computed(() => mileageNoteFor(carSpec.value.mileageKm, context.value.economy))
/** The year the calendar stands at for this shop, which the generator's year
 * window and every age-driven curve read. */
const campaignYear = computed(() => benchCampaignYear(shopSpec.value))

const opening = computed(() =>
  car.value && model.value
    ? openingBlockFor(car.value, model.value, state.value, context.value)
    : null,
)
/** What the car IS: the five stats, the four laps, and whether the build hangs
 * together. */
const stats = computed(() =>
  car.value && model.value ? statsPanelFor(car.value, model.value, context.value) : null,
)
const buyers = computed(() =>
  car.value && model.value ? buyerRowsFor(car.value, model.value, state.value, context.value) : [],
)
const channels = computed(() =>
  car.value && model.value
    ? channelRowsFor(car.value, model.value, state.value, context.value)
    : [],
)
/** The staleness term behind every arrival chance in the channel table. */
const offersSeen = computed(() => listingOffersSeenFor(state.value, BENCH_CAR_ID))
/**
 * ONE channel at a time, chosen, rather than a buyer-by-channel matrix.
 * Seven buyers by six channels is forty-two prices and no reader can hold
 * that; one column against a chosen channel is the same information asked one
 * question at a time, and flipping the selector is what makes the scene
 * standing dials visible, since the column moves and the buyer table does not.
 */
const priceChannelId = ref<SellingChannelId>('shopFront')
const channelPrices = computed(() =>
  car.value && model.value
    ? channelPricePanelFor(car.value, model.value, priceChannelId.value, state.value, context.value)
    : null,
)
/** The channels with no buyer pool at all, which appear in no per-buyer table
 * and would otherwise have no price on the screen. */
const bandChannels = computed(() =>
  car.value && model.value
    ? bandPricedChannelsFor(car.value, model.value, state.value, context.value)
    : [],
)
/** Today's drawn offer, if the draw brought one. */
const pendingOffer = computed(() => pendingOfferFor(state.value, BENCH_CAR_ID, context.value))
/** What the sale did, kept on the log line that closed it - the car itself is
 * gone by then, so nothing else on the screen can still answer for it. */
const lastSale = computed(() => [...log.value].reverse().find((line) => line.sale)?.sale ?? null)
/** The channels whose odds are a calendar fact rather than a daily cadence. */
const oneDrawChannels = computed(() =>
  channels.value.filter((row) => row.oneDraw).map((row) => SELLING_CHANNEL_LABELS[row.channelId]),
)
const acquisition = computed(() =>
  car.value && model.value
    ? acquisitionPanelFor(car.value, model.value, state.value, context.value)
    : null,
)
const costs = computed(() =>
  costSheetFor(state.value, BENCH_CAR_ID, entries.value, game.resolveModelName),
)
const labourLeft = computed(() => labourRemaining(state.value, context.value))
const labourSpentOnLog = computed(() => log.value.reduce((sum, line) => sum + line.labourSpent, 0))
/** A line whose car left the bench has no measured delta at all, so it is not
 * in the sum rather than being counted as a zero. */
const runningTotalYen = computed(() =>
  log.value.reduce((sum, line) => sum + (line.deltaYen ?? 0), 0),
)
const yenPerLabourPoint = computed(() =>
  labourSpentOnLog.value > 0 ? runningTotalYen.value / labourSpentOnLog.value : null,
)

// --- actions ---------------------------------------------------------------

function run(action: BenchAction): void {
  const chosen = model.value
  if (!chosen) return
  const result = runBenchAction(
    state.value,
    chosen,
    action,
    context.value,
    partName,
    game.resolveModelName,
  )
  state.value = result.state
  entries.value = [...entries.value, ...result.entries]
  log.value = [...log.value, result.line]
}

function resetBaseline(): void {
  log.value = []
}

/** This car's time on one course, or the word for a car that cannot be driven
 * at all. `lapTimeSecondsFor` returns nothing in that case, and a blank cell
 * would read as a model that had failed rather than a car that cannot run. */
function lapText(courseId: string): string {
  const seconds = stats.value?.evaluation.laps[courseId]
  return seconds == null ? 'blocked' : `${seconds.toFixed(2)}s`
}

/**
 * A measured stat delta, or a dash where the action moved that stat not at
 * all. A column of dashes with one figure in it is the point: a reader scans
 * for the one that moved.
 *
 * A line with no measurement at all says so in its own word, since a dash there
 * would claim the action left the stat where it was.
 */
function statDeltaText(line: BenchLogLine, stat: StatKey): string {
  if (!line.statDeltas) return 'car gone'
  const delta = line.statDeltas[stat]
  if (Math.abs(delta) < 0.05) return '-'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
}

/** The chosen course's own measured delta on one line, in seconds. */
function lapDeltaText(line: BenchLogLine): string {
  const lap = line.laps[logCourseId.value]
  if (!lap) return 'car gone'
  if (lap.deltaS === null) {
    // A car that could not be driven has no time, so there is nothing for the
    // other side to be measured against.
    if (lap.beforeS === null && lap.afterS === null) return 'blocked'
    return lap.beforeS === null ? 'now runs' : 'no longer runs'
  }
  if (Math.abs(lap.deltaS) < 0.005) return '-'
  return `${lap.deltaS > 0 ? '+' : ''}${lap.deltaS.toFixed(2)}s`
}

const buySkuId = ref('')
const fitInstanceId = ref('')
// A slot in no assembly, so the two controls open on something that actually
// resolves rather than on a slot the sim will refuse to touch on its own.
const fitSlot = ref<CarPartId>('seats')
const removeSlot = ref<CarPartId>('seats')
const repairGroup = ref<ComponentId>('engine')
/** Empty means the whole group, which is what a group-level staged repair
 * addresses; anything else narrows the same staged action to one slot. */
const repairSlot = ref<CarPartId | ''>('')
const repairBand = ref<ConditionBand>('mint')

function runRepair(): void {
  run({
    kind: 'repair',
    componentId: repairGroup.value,
    ...(repairSlot.value === '' ? {} : { carPartId: repairSlot.value }),
    targetBand: repairBand.value,
  })
}
const machineOperationId = ref('')
const hireGroup = ref<ComponentId>('engine')
const listChannelId = ref<SellingChannelId>('shopFront')
/** The seed the offer draw runs at, so a draw can be repeated exactly. */
const offerSeed = ref(1)
/**
 * Which course's lap delta the log shows. All four are measured and stored on
 * every line, so changing this re-reads measurements already taken rather than
 * recomputing anything - and a line measured on a car that has since been sold
 * still answers for the course it was measured on.
 */
const logCourseId = ref(context.value.courses[0]?.id ?? '')

const buyableSkus = computed(() => {
  const chosen = model.value
  if (!chosen) return []
  return ALL_CAR_PART_IDS.flatMap((partId) => skusForSlot(chosen, partId, context.value))
})

const fittedOperations = computed(() =>
  context.value.economy.machining.operations.filter((o) => o.performedOn === 'fitted-part'),
)

const slotsInRepairGroup = computed(() => context.value.partIdsByGroup[repairGroup.value] ?? [])
</script>

<template>
  <section class="bench">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Back</RouterLink>
    <p class="banner" data-test="bench-banner">
      Economy bench. Dev only, nothing here is saved, and nothing here affects your career. Every
      figure is a sim function's own answer; the screen computes none of them.
    </p>

    <!-- 1. THE STATE BUILDER ------------------------------------------ -->
    <details open class="panel">
      <summary>1. The car</summary>
      <div class="row">
        <label>
          Model
          <select data-test="bench-model" :value="modelId" @change="pickModel(inputValue($event))">
            <option v-for="m in context.models" :key="m.id" :value="m.id">
              {{ m.displayName }} ({{ m.tier }})
            </option>
          </select>
        </label>
        <label>
          Mileage km
          <input
            v-model.number="carSpec.mileageKm"
            data-test="bench-mileage"
            type="number"
            min="0"
            step="5000"
          />
        </label>
        <label>
          Year
          <input
            :value="carSpec.year"
            data-test="bench-year"
            type="number"
            :min="yearRange[0]"
            :max="yearRange[1]"
            @change="setYear"
          />
        </label>
        <button type="button" data-test="bench-rebuild" @click="rebuild">Rebuild</button>
        <button type="button" data-test="bench-reset-spec" @click="resetSpec">
          Reset to stock and mint
        </button>
      </div>

      <p v-if="dirty" class="warn" data-test="bench-stale">
        The builder has been edited since this car was built. Every figure below still describes the
        car on the bench, not the settings above it. Press Rebuild to build the car you have typed,
        which starts a new car and clears the running log.
      </p>

      <p class="dim" data-test="bench-mileage-note">
        Mileage multiplier at the figure in the box above, which is the builder's and not
        necessarily the car's: x{{ mileage.factor.toFixed(3) }}.
        <template v-if="mileage.discountFromKm !== null">
          The curve is flat at 1.00 up to {{ mileage.discountFromKm.toLocaleString('en-US') }} km
          and falls away above it, so mileage never adds value: a car below that figure has had
          nothing taken off rather than something added on.
        </template>
        The breakpoints, from economy.json:
        <span v-for="(point, i) in mileage.curve" :key="point[0]">
          <template v-if="i > 0">, </template>{{ point[0].toLocaleString('en-US') }} km x{{
            point[1].toFixed(2)
          }}</span
        >. The first figure is flat all the way down to zero, the last is flat above itself, and
        between two of them the multiplier runs straight from one to the next.
      </p>
      <p v-if="mileage.youngestLotUndiscounted" class="dim" data-test="bench-fresh-lot-note">
        The youngest lot generation will ever produce is {{ mileage.minAgeYears }} years old and
        rolls {{ mileage.youngestLotRangeKm[0].toLocaleString('en-US') }} to
        {{ mileage.youngestLotRangeKm[1].toLocaleString('en-US') }} km, all of it inside the flat
        band. A lot of that age therefore carries no mileage discount whatever it rolls: it prices
        the same at {{ mileage.youngestLotRangeKm[0].toLocaleString('en-US') }} km as at
        {{ mileage.youngestLotRangeKm[1].toLocaleString('en-US') }}. Older lots roll higher ranges
        and are discounted normally.
      </p>

      <div class="row">
        <label>
          Generator seed
          <input v-model.number="generatorSeed" type="number" min="1" />
        </label>
        <button type="button" data-test="bench-generate" @click="loadGeneratedLot">
          Load a generated lot
        </button>
        <button type="button" data-test="bench-read-back" @click="readCarBackIn">
          Read the car back into the builder
        </button>
        <span class="dim">A generated lot is the common case; hand-building 28 slots is not.</span>
      </div>
      <p class="dim" data-test="bench-generated-note">
        A lot rolls at campaign year {{ campaignYear }}, the year this shop's reputation tier ({{
          shopSpec.reputationTier
        }}) puts the calendar at. Both the generator's year window and its age-driven mileage curve
        read it: a later campaign year admits younger cars.
      </p>

      <div class="row">
        <label>
          Add a symptom
          <select v-model="symptomToAdd">
            <option value="">pick one</option>
            <option v-for="s in context.symptoms" :key="s.id" :value="s.id">
              {{ s.cardLine }}
            </option>
          </select>
        </label>
        <button type="button" :disabled="!symptomToAdd" @click="addSymptom">Add</button>
        <button type="button" @click="clearSymptoms">Clear symptoms</button>
        <span class="dim" data-test="bench-symptom-count">
          {{ carSpec.symptoms.length }} on the car
        </span>
      </div>
    </details>

    <details class="panel">
      <summary>1a. The 28 slots</summary>
      <table class="grid">
        <thead>
          <tr>
            <th>slot</th>
            <th>SKU</th>
            <th>band</th>
            <th>machining</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="partId in ALL_CAR_PART_IDS" :key="partId" :data-test="'slot-' + partId">
            <td>{{ context.partsTaxonomyById[partId]?.displayName ?? partId }}</td>
            <td>
              <select
                :value="carSpec.build[partId].partId ?? ''"
                @change="setSlotSku(partId, inputValue($event))"
              >
                <option value="">(empty slot)</option>
                <option
                  v-for="sku in model ? skusForSlot(model, partId, context) : []"
                  :key="sku.id"
                  :value="sku.id"
                >
                  {{ sku.grade }} - {{ sku.brand }} {{ sku.name }}
                </option>
              </select>
            </td>
            <td>
              <select
                :value="carSpec.build[partId].band"
                @change="setSlotBand(partId, inputValue($event))"
              >
                <option v-for="band in BANDS" :key="band" :value="band">{{ band }}</option>
              </select>
            </td>
            <td>
              <label
                v-for="op in machiningOptionsForSlot(partId, context)"
                :key="op.id"
                class="inline"
              >
                <input
                  type="checkbox"
                  :checked="carSpec.build[partId].machining.includes(op.id)"
                  @change="toggleSlotMachining(partId, op.id)"
                />
                {{ op.displayName }}
              </label>
              <span v-if="machiningOptionsForSlot(partId, context).length === 0" class="dim"
                >-</span
              >
            </td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        Bodywork and paint are not set here: the zone table below is the single writer of those two
        bands, exactly as it is at generation.
      </p>
    </details>

    <details class="panel">
      <summary>1b. The nine zones</summary>
      <table class="grid">
        <thead>
          <tr>
            <th>zone</th>
            <th>metal</th>
            <th>surface</th>
            <th>finish</th>
            <th>panel gone</th>
            <th>primed</th>
            <th>colour</th>
            <th>panel grade</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="zoneId in BENCH_ZONE_IDS" :key="zoneId" :data-test="'zone-' + zoneId">
            <td>{{ zoneId }}</td>
            <td>
              <select
                v-if="isMetalZone(zoneId)"
                :value="carSpec.zones[zoneId].metal"
                @change="setMetalSeverity(zoneId, 'metal', Number(inputValue($event)))"
              >
                <option v-for="n in METAL_SEVERITIES" :key="n" :value="n">{{ n }}</option>
              </select>
              <span v-else class="dim">-</span>
            </td>
            <td>
              <select
                v-if="isMetalZone(zoneId)"
                :value="carSpec.zones[zoneId].surface"
                @change="setMetalSeverity(zoneId, 'surface', Number(inputValue($event)))"
              >
                <option v-for="n in SURFACE_SEVERITIES" :key="n" :value="n">{{ n }}</option>
              </select>
              <span v-else class="dim">-</span>
            </td>
            <td>
              <select
                :value="carSpec.zones[zoneId].finish"
                @change="setZoneFinish(zoneId, Number(inputValue($event)))"
              >
                <option v-for="n in FINISHES" :key="n" :value="n">{{ n }}</option>
              </select>
            </td>
            <td>
              <input
                type="checkbox"
                :checked="carSpec.zones[zoneId].panelMissing"
                @change="toggleZoneFlag(zoneId, 'panelMissing')"
              />
            </td>
            <td>
              <input
                type="checkbox"
                :checked="carSpec.zones[zoneId].primed"
                @change="toggleZoneFlag(zoneId, 'primed')"
              />
            </td>
            <td>
              <input
                :value="carSpec.zones[zoneId].colour ?? ''"
                size="10"
                @change="setZoneColour(zoneId, inputValue($event))"
              />
            </td>
            <td>
              <select
                :value="carSpec.zones[zoneId].panelGrade ?? ''"
                @change="setZonePanelGrade(zoneId, inputValue($event))"
              >
                <option value="">(stock)</option>
                <option value="street">street</option>
                <option value="sport">sport</option>
                <option value="race">race</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </details>

    <details class="panel">
      <summary>1c. The shop</summary>
      <div class="row">
        <label>Day <input v-model.number="shopSpec.day" type="number" min="1" /></label>
        <label>Cash <input v-model.number="shopSpec.cashYen" type="number" step="100000" /></label>
        <label>
          Market heat %
          <input v-model.number="shopSpec.heatPercent" type="number" min="1" step="5" />
        </label>
        <label>
          Reputation
          <select
            data-test="bench-shop-reputation"
            :value="shopSpec.reputationTier"
            @change="setReputationTier(inputValue($event))"
          >
            <option v-for="t in REPUTATION_TIERS" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <button type="button" data-test="bench-apply-shop" @click="rebuild">
          Apply and rebuild
        </button>
      </div>
      <div class="row">
        <label>
          Bought for
          <input
            :value="shopSpec.purchaseYen ?? ''"
            data-test="bench-purchase"
            type="number"
            step="10000"
            @change="setPurchaseYen(inputValue($event))"
          />
        </label>
        <button
          type="button"
          data-test="bench-take-desk-price"
          :disabled="!acquisition"
          @click="takeDeskPrice"
        >
          Take the desk's price
        </button>
        <span class="dim">
          What the books say this car cost, which is what a sale reports its profit against. Leave
          it empty and the sim reports no profit at all rather than inventing one. The bench does
          not pay it: the till is the Cash box above.
        </span>
      </div>
      <div class="row wrap">
        <label v-for="scene in SCENES" :key="scene" class="inline">
          {{ scene }}
          <select
            :value="shopSpec.sceneStanding[scene]"
            @change="setSceneStanding(scene, inputValue($event))"
          >
            <option v-for="stage in STAGES" :key="stage" :value="stage">{{ stage }}</option>
          </select>
        </label>
      </div>
      <div class="row wrap">
        <label v-for="group in GROUPS" :key="group" class="inline">
          {{ group }} rung
          <select
            :value="shopSpec.toolTiers[group]"
            @change="setToolTier(group, inputValue($event))"
          >
            <option v-for="t in TOOL_TIERS" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
      </div>
      <div class="row wrap">
        <label v-for="shop in context.toolShops" :key="shop.id" class="inline">
          <input
            type="checkbox"
            :checked="shopSpec.toolShopsOwned.includes(shop.id)"
            @change="toggleShopOwned(shop.id)"
          />
          {{ shop.displayName }}
        </label>
      </div>
    </details>

    <!-- 2. THE OPENING BLOCK ------------------------------------------ -->
    <details v-if="opening" open class="panel" :class="{ stale: dirty }">
      <summary>2. The opening block</summary>
      <p class="total" data-test="bench-total">
        Market value now: <strong>{{ formatYen(opening.totalYen) }}</strong>
      </p>

      <p v-if="opening.onScrapFloor" class="warn" data-test="bench-scrap-floor">
        This car is priced on the scrap-value backstop, not on its own bill. Every counterfactual
        below is fictional: repairing a slot moves the bill without moving the price. The per-slot
        value column is therefore not printed.
      </p>

      <table class="grid">
        <thead>
          <tr>
            <th>ledger line</th>
            <th class="num">yen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in opening.ledgerLines" :key="line.id" :data-test="'ledger-' + line.id">
            <td>{{ line.id }}</td>
            <td class="num">{{ formatYenDelta(line.yen) }}</td>
          </tr>
        </tbody>
      </table>

      <p class="dim">
        The aftermarket premium is ONE line and is never split per slot: it is a minimum over five
        foundation slots with a per-slot scrap gate, so a per-slot counterfactual can be wrong by
        the whole term. Beside it sits the figure that IS exact.
      </p>
      <p data-test="bench-foundation">
        Premium credited: {{ formatYen(opening.aftermarketPremiumYen) }} - held back by a failing
        foundation: <strong>{{ formatYen(opening.foundationWithheldYen) }}</strong>
      </p>

      <p class="dim">
        The restoration bill, slot by slot and zone by zone - exact. Below the tier's expectation
        band ({{ opening.expectationBand }}) a yen of work returns more than itself; above it, less.
        Whole bill to mint: {{ formatYen(opening.billToMintYen) }}.
      </p>
      <table class="grid">
        <thead>
          <tr>
            <th>slot</th>
            <th class="num">bill</th>
            <th class="num">below band</th>
            <th class="num">above band</th>
            <th class="num">costs the price</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="line in opening.restoration.lines" :key="line.partId">
            <template v-if="line.billYen !== 0">
              <tr :data-test="'bill-' + line.partId">
                <td>{{ context.partsTaxonomyById[line.partId]?.displayName ?? line.partId }}</td>
                <td class="num">{{ formatYen(line.billYen) }}</td>
                <td class="num">{{ formatYen(line.belowBandBillYen) }}</td>
                <td class="num">{{ formatYen(line.aboveBandBillYen) }}</td>
                <td class="num">
                  <span v-if="opening.onScrapFloor" class="dim">n/a</span>
                  <span v-else>{{ formatYenDelta(line.valueYen) }}</span>
                </td>
              </tr>
              <!-- Where a body carrier's own bill falls, so these are inside
                   the line above rather than beside it: adding a zone row to
                   the bill column would count the same work twice. -->
              <tr
                v-for="zone in (line.zones ?? []).filter((z) => z.yen !== 0)"
                :key="line.partId + zone.zoneId"
                class="sub"
              >
                <td>{{ line.partId }} / {{ zone.zoneId }}</td>
                <td class="num">{{ formatYen(zone.yen) }}</td>
                <td colspan="3"></td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </details>

    <!-- 2b. THE CAR AS BUILT ------------------------------------------ -->
    <details v-if="stats" open class="panel" :class="{ stale: dirty }">
      <summary>2b. The car as built</summary>
      <table class="grid">
        <thead>
          <tr>
            <th>stat</th>
            <th class="num">now</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stat in STAT_KEYS" :key="stat" :data-test="'stat-' + stat">
            <td>{{ stat }}</td>
            <td class="num">{{ stats.evaluation.stats[stat].toFixed(1) }}</td>
          </tr>
          <tr data-test="stat-power-score">
            <td>power, on the other four's own scale</td>
            <td class="num">{{ stats.evaluation.powerScore.toFixed(1) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        Power is in PS and the other four are out of 100, so the last row is power read on their
        scale. A buyer's champion gate is tested against these, and the sale panel below shows which
        of them cleared it.
      </p>

      <p data-test="bench-support">
        Support: <strong>{{ stats.support.band }}</strong> at
        {{ stats.support.headline.toFixed(3) }}, set by
        <strong>{{ stats.support.subsystem }}</strong> - the worst of the five subsystems, which is
        the whole of what the verdict reads. Coherence factor:
        <strong>{{ stats.coherenceFactor.toFixed(3) }}</strong
        >.
      </p>
      <p class="dim">
        The coherence factor is what that support ratio is worth in money: it discounts the car's
        value and scales how much of a fitted part's price the car keeps. At 1 the build is
        supported at or above adequate, which is the baseline and never a bonus, so a coherent build
        loses nothing here rather than earning something.
      </p>

      <table class="grid">
        <thead>
          <tr>
            <th>course</th>
            <th class="num">lap</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="course in context.courses" :key="course.id" :data-test="'lap-' + course.id">
            <td>{{ course.name }}</td>
            <td class="num" :class="{ dim: lapText(course.id) === 'blocked' }">
              {{ lapText(course.id) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="stats.evaluation.blockers.length > 0" class="warn" data-test="bench-lap-blockers">
        This car cannot be driven, so every lap above reads blocked rather than being a model that
        has failed:
        <span v-for="(blocker, i) in stats.evaluation.blockers" :key="blocker.partId">
          <template v-if="i > 0">, </template>{{ blocker.displayName }} ({{ blocker.reason }})</span
        >. Fit or repair those slots and the times come back.
      </p>
      <p v-else class="dim" data-test="bench-lap-note">
        Nothing is stopping the car being driven, so every course above has a time. A slot that
        disables the car, left empty or at scrap, blanks all four at once.
      </p>
    </details>

    <!-- 3. THE RUNNING LOG -------------------------------------------- -->
    <details open class="panel">
      <summary>3. The running log</summary>
      <div class="row">
        <span data-test="bench-running-total">
          Running total: <strong>{{ formatYenDelta(runningTotalYen) }}</strong>
        </span>
        <span class="dim">Labour left today: {{ labourLeft }}</span>
        <button type="button" data-test="bench-reset-baseline" @click="resetBaseline">
          Reset the baseline
        </button>
        <button type="button" @click="run({ kind: 'refill-labour' })">Refill labour</button>
      </div>
      <p class="dim" data-test="bench-labour-ratio">
        <template v-if="yenPerLabourPoint === null">
          No labour spent yet, so there is no ratio to show.
        </template>
        <template v-else>
          {{ formatYen(yenPerLabourPoint) }} of value per labour point over
          {{ labourSpentOnLog }} points.
        </template>
        Labour has no yen price anywhere in the game, deliberately: a repair costs energy and the
        player's hours are free. So this is a ratio and it can never enter a total.
      </p>

      <div class="row wrap actions">
        <span class="group">
          <select v-model="buySkuId">
            <option value="">pick a part to buy</option>
            <option v-for="sku in buyableSkus" :key="sku.id" :value="sku.id">
              {{ sku.carPartId }} / {{ sku.grade }} - {{ sku.brand }} {{ sku.name }} ({{
                formatYen(sku.priceYen)
              }})
            </option>
          </select>
          <button
            type="button"
            data-test="bench-buy"
            :disabled="!buySkuId"
            @click="run({ kind: 'buy-part', partId: buySkuId })"
          >
            Buy
          </button>
        </span>

        <span class="group">
          <select v-model="fitInstanceId">
            <option value="">pick a part on the shelf</option>
            <option v-for="p in state.partInventory" :key="p.id" :value="p.id">
              {{ partName(p.partId) }} ({{ p.band }})
            </option>
          </select>
          <select v-model="fitSlot">
            <option v-for="partId in ALL_CAR_PART_IDS" :key="partId" :value="partId">
              {{ context.partsTaxonomyById[partId]?.displayName ?? partId }}
            </option>
          </select>
          <button
            type="button"
            data-test="bench-fit"
            :disabled="!fitInstanceId"
            @click="run({ kind: 'fit-part', partInstanceId: fitInstanceId, carPartId: fitSlot })"
          >
            Fit
          </button>
        </span>

        <span class="group">
          <select v-model="removeSlot">
            <option v-for="partId in ALL_CAR_PART_IDS" :key="partId" :value="partId">
              {{ context.partsTaxonomyById[partId]?.displayName ?? partId }}
            </option>
          </select>
          <button
            type="button"
            data-test="bench-remove"
            @click="run({ kind: 'remove-part', carPartId: removeSlot })"
          >
            Remove
          </button>
        </span>

        <span class="group">
          <select v-model="repairGroup">
            <option v-for="g in GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
          <select v-model="repairSlot">
            <option value="">whole group</option>
            <option v-for="partId in slotsInRepairGroup" :key="partId" :value="partId">
              {{ context.partsTaxonomyById[partId]?.displayName ?? partId }}
            </option>
          </select>
          <select v-model="repairBand">
            <option v-for="band in BANDS" :key="band" :value="band">{{ band }}</option>
          </select>
          <button type="button" data-test="bench-repair" @click="runRepair">Repair</button>
        </span>

        <span class="group">
          <select v-model="machineOperationId">
            <option value="">pick a setup job</option>
            <option v-for="op in fittedOperations" :key="op.id" :value="op.id">
              {{ op.displayName }}
            </option>
          </select>
          <button
            type="button"
            data-test="bench-machine"
            :disabled="!machineOperationId"
            @click="run({ kind: 'machine-fitted', operationId: machineOperationId })"
          >
            Set up
          </button>
        </span>

        <span class="group">
          <select v-model="hireGroup">
            <option v-for="g in GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
          <button
            type="button"
            data-test="bench-hire"
            @click="run({ kind: 'hire-machine-line', group: hireGroup })"
          >
            Hire the line
          </button>
        </span>

        <span class="group">
          <select v-model="listChannelId">
            <option v-for="row in channels" :key="row.channelId" :value="row.channelId">
              {{ SELLING_CHANNEL_LABELS[row.channelId] }}
            </option>
          </select>
          <button
            type="button"
            data-test="bench-list"
            @click="run({ kind: 'list-for-sale', channelId: listChannelId })"
          >
            List
          </button>
          <button type="button" @click="run({ kind: 'delist' })">Delist</button>
        </span>

        <span class="group">
          <label>seed <input v-model.number="offerSeed" type="number" min="1" size="4" /></label>
          <button
            type="button"
            data-test="bench-draw-offers"
            @click="run({ kind: 'draw-offers', seed: offerSeed })"
          >
            Draw the day's offers
          </button>
          <button
            type="button"
            data-test="bench-accept-offer"
            :disabled="!pendingOffer"
            @click="run({ kind: 'accept-offer' })"
          >
            Take the offer
          </button>
        </span>

        <span class="group">
          <button type="button" data-test="bench-settle-week" @click="run({ kind: 'settle-week' })">
            Run the weekly market update
          </button>
        </span>
      </div>

      <div class="row">
        <label>
          Lap column
          <select v-model="logCourseId" data-test="bench-log-course">
            <option v-for="course in context.courses" :key="course.id" :value="course.id">
              {{ course.name }}
            </option>
          </select>
        </label>
        <span class="dim">
          All four courses are measured on every line; this picks which one the column shows.
        </span>
      </div>
      <table class="grid">
        <thead>
          <tr>
            <th>#</th>
            <th>action</th>
            <th class="num">value delta</th>
            <th v-for="stat in STAT_KEYS" :key="stat" class="num">{{ stat.slice(0, 4) }}</th>
            <th class="num">lap</th>
            <th class="num">cash</th>
            <th class="num">labour</th>
            <th>what the sim said</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, i) in log" :key="i" :data-test="'log-line-' + i">
            <td>{{ i + 1 }}</td>
            <td>{{ line.label }}</td>
            <td
              class="num"
              :class="{ up: (line.deltaYen ?? 0) > 0, down: (line.deltaYen ?? 0) < 0 }"
            >
              {{ line.deltaYen === null ? 'car gone' : formatYenDelta(line.deltaYen) }}
            </td>
            <td
              v-for="stat in STAT_KEYS"
              :key="stat"
              class="num"
              :data-test="'log-' + i + '-' + stat"
            >
              {{ statDeltaText(line, stat) }}
            </td>
            <td class="num" :data-test="'log-' + i + '-lap'">{{ lapDeltaText(line) }}</td>
            <td class="num">{{ formatYenDelta(line.cashDeltaYen) }}</td>
            <td class="num">{{ line.labourSpent }}</td>
            <td>
              <span v-if="line.refusal" class="warn">{{ line.refusal }}</span>
              <span v-else>{{ line.notes.join(' ') || '-' }}</span>
            </td>
          </tr>
          <tr v-if="log.length === 0">
            <td colspan="11" class="dim">Nothing done yet.</td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        Every column is the same measurement: the figure after minus the figure before. Value is
        market value, the five middle columns are the derived stats (power in PS, the rest out of
        100), and the lap is seconds on the chosen course, where a faster car reads negative.
        Nothing is attributed and nothing is modelled. A dash is a figure the action did not move; a
        lap reading blocked is a car that cannot be driven at all, which is the slot list in section
        2b and not a broken model. A job that outruns today's labour stays open - refill the pool
        and press the same button again to carry it on, exactly as the workshop floor does.
      </p>
      <p class="dim" data-test="bench-car-gone-note">
        A sale takes the car off the bench, so its line has no after to measure and reads car gone
        in every measured column rather than counting the whole car as a loss. What the sale itself
        did is in section 4.
      </p>
    </details>

    <!-- 4. THE SALE --------------------------------------------------- -->
    <details open class="panel" :class="{ stale: dirty }">
      <summary>4. The sale</summary>
      <table class="grid">
        <thead>
          <tr>
            <th>buyer</th>
            <th>champion stat</th>
            <th>gate</th>
            <th class="num">taste</th>
            <th>outcome</th>
            <th class="num">values it at</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in buyers" :key="row.buyerId" :data-test="'buyer-' + row.buyerId">
            <td>{{ row.displayName }}</td>
            <td>{{ row.championStat }}</td>
            <td :class="row.championGatePassed ? 'up' : 'down'">
              {{ row.championGatePassed ? 'passes' : 'fails' }}
            </td>
            <td class="num">{{ row.tasteScore.toFixed(3) }}</td>
            <td>{{ row.outcome }}</td>
            <td class="num">{{ formatYen(row.priceYen) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        Each price is what this buyer thinks the car is worth: market value at their OWN coherence
        tolerance, times the standard taste band. The value ledger cannot answer it, because it
        takes no tolerance parameter and so always reads the market's.
      </p>
      <p class="dim" data-test="bench-buyer-gate-note">
        A failing gate is the buyer's signature stat missing its target. That zeroes their taste
        score and the sale reads as pleasing nobody, which is the whole of what reputation reads at
        a sale. It does NOT refuse the sale: on a channel that is not matched-only they still turn
        up and still price the car, at the bottom of the taste band. What a failed gate costs is the
        reputation and the premium, not the deal.
      </p>
      <p class="dim" data-test="bench-buyer-price-caveat">
        It is NOT the offer they would make. A real offer is priced through the listing channel's
        own taste ceiling and this shop's scene standing, both of which can pay well above this
        band, and neither of which is in this column. The channel-realised price is the next table.
      </p>

      <div class="row">
        <label>
          Priced through
          <select v-model="priceChannelId" data-test="bench-price-channel">
            <option v-for="row in channels" :key="row.channelId" :value="row.channelId">
              {{ SELLING_CHANNEL_LABELS[row.channelId] }}
            </option>
          </select>
        </label>
        <span v-if="channelPrices" class="dim">
          <template v-if="channelPrices.tasteCeiling !== null">
            Taste ceiling {{ channelPrices.tasteCeiling.toFixed(2) }}.
          </template>
          {{ channelPrices.matchedOnly ? 'Matched buyers only.' : 'Prices anyone it brings.' }}
        </span>
      </div>
      <table v-if="channelPrices" class="grid">
        <thead>
          <tr>
            <th>buyer</th>
            <th class="num">taste through this channel</th>
            <th class="num">it would pay</th>
            <th class="num">standard band</th>
            <th class="num">share of the draw</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in channelPrices.rows"
            :key="row.buyerId"
            :data-test="'channel-price-' + row.buyerId"
          >
            <td>{{ row.displayName }}</td>
            <td class="num">{{ row.channelTaste.toFixed(3) }}</td>
            <td class="num">
              <span v-if="row.wouldBePriced">{{ formatYen(row.channelPriceYen) }}</span>
              <span v-else class="dim">refused, taste does not match</span>
            </td>
            <td class="num">{{ formatYen(row.standardPriceYen) }}</td>
            <td class="num">
              <span v-if="row.shareOfDraw === null" class="dim">not in this pool</span>
              <span v-else>{{ (row.shareOfDraw * 100).toFixed(1) }}%</span>
            </td>
          </tr>
          <tr v-if="channelPrices.rows.length === 0">
            <td colspan="5" class="dim">
              This channel has no buyer pool at all: it prices off a flat band, shown below.
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="channelPrices" class="dim" data-test="bench-channel-price-note">
        This is where the six scene-standing dials land. The taste column is the channel's own
        ceiling and this shop's standing with that buyer's scene, together; move a standing and this
        table moves while the one above it does not. An arriving offer is this price times a quality
        fraction that averages {{ channelPrices.qualityMeanFraction.toFixed(3) }} at
        {{ channelPrices.offersSeen }} offers seen, so a fresh listing realises most of it and a
        stale one less.
      </p>
      <table v-if="bandChannels.length > 0" class="grid">
        <thead>
          <tr>
            <th>no buyer pool</th>
            <th class="num">pays at least</th>
            <th class="num">at most</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="range in bandChannels"
            :key="range.channelId"
            :data-test="'band-channel-' + range.channelId"
          >
            <td>{{ SELLING_CHANNEL_LABELS[range.channelId] }}</td>
            <td class="num">{{ formatYen(range.minYen) }}</td>
            <td class="num">{{ formatYen(range.maxYen) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="bandChannels.length > 0" class="dim" data-test="bench-band-channel-note">
        A channel with no buyer pool has no persona to please and no taste to match: it pays a flat
        fraction of plain market value, uniformly between those two figures, and says nothing about
        you afterwards. That is why it is in no table above.
      </p>

      <table class="grid">
        <thead>
          <tr>
            <th>channel</th>
            <th class="num">someone arrives</th>
            <th class="num">an offer is priced</th>
            <th>matched only</th>
            <th>open</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in channels" :key="row.channelId" :data-test="'channel-' + row.channelId">
            <td>{{ SELLING_CHANNEL_LABELS[row.channelId] }}</td>
            <td class="num">{{ (row.odds.arrivalChance * 100).toFixed(1) }}%</td>
            <td class="num">{{ (row.odds.offerChance * 100).toFixed(1) }}%</td>
            <td>{{ row.matchedOnly ? 'yes' : 'no' }}</td>
            <td>{{ row.unlocked ? 'yes' : 'not yet' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        These are SINGLE-DAY probabilities and nothing else. They cannot be raised to a power for a
        week: staleness keys off offers seen, which only advances on a day the roll clears, so the
        listing's own chance moves underneath a multi-day question.
      </p>
      <p class="dim" data-test="bench-channel-basis">
        Read at day {{ state.day }} and at {{ offersSeen }} offers seen, which is this car's own
        listing entry, or zero while it is not listed.
        <template v-if="oneDrawChannels.length > 0">
          {{ oneDrawChannels.join(' and ') }} draw once on their own day rather than rolling every
          day, so a zero against one of them is today's calendar and not a channel that never comes.
        </template>
      </p>
      <p
        v-for="row in channels.filter((c) => c.burnsTicksForNothing)"
        :key="'trap-' + row.channelId"
        class="warn"
        :data-test="'channel-trap-' + row.channelId"
      >
        {{ SELLING_CHANNEL_LABELS[row.channelId] }} is a trap for this car. Somebody still turns up,
        so the listing still ages by one offer seen, but the channel refuses to price anyone whose
        taste does not match and nobody it reaches matches. It can never pay, and it charges the
        listing for saying so.
      </p>

      <p data-test="bench-pending-offer">
        <template v-if="pendingOffer">
          Live offer today: <strong>{{ formatYen(pendingOffer.priceYen) }}</strong> from
          {{ pendingOffer.displayName }}. Take it with the button in the running log.
        </template>
        <template v-else>
          No live offer. List the car, then draw the day's offers in the running log: the draw is
          the real one the day boundary runs, at a seed you choose, so a miss is a miss and the
          listing ages by it.
        </template>
      </p>

      <template v-if="lastSale">
        <p class="total" data-test="bench-sale-price">
          Sold for <strong>{{ formatYen(lastSale.priceYen) }}</strong
          >.
          <template v-if="lastSale.profitYen !== null">
            Realised profit: <strong>{{ formatYenDelta(lastSale.profitYen) }}</strong
            >.
          </template>
          <template v-else>
            No realised profit is reported: this car's purchase price was never recorded, so there
            is nothing to measure one against. Set Bought for in the shop panel and rebuild.
          </template>
        </p>
        <table class="grid">
          <thead>
            <tr>
              <th>what the sale moved</th>
              <th class="num">before</th>
              <th class="num">after</th>
            </tr>
          </thead>
          <tbody>
            <tr data-test="sale-reputation">
              <td>Reputation points (+{{ lastSale.reputationDelta }} for this sale)</td>
              <td class="num">{{ lastSale.reputationPointsBefore }}</td>
              <td class="num">{{ lastSale.reputationPointsAfter }}</td>
            </tr>
            <tr data-test="sale-tier">
              <td>Reputation tier</td>
              <td class="num">{{ lastSale.reputationTierBefore }}</td>
              <td class="num">{{ lastSale.reputationTierAfter }}</td>
            </tr>
            <tr data-test="sale-heat">
              <td>This model's market heat</td>
              <td class="num">{{ lastSale.heatPercentBefore }}%</td>
              <td class="num">{{ lastSale.heatPercentAfter }}%</td>
            </tr>
            <tr data-test="sale-player-sales">
              <td>Copies of this model you have sold</td>
              <td class="num">{{ lastSale.playerSalesBefore }}</td>
              <td class="num">{{ lastSale.playerSalesAfter }}</td>
            </tr>
            <tr
              v-for="scene in lastSale.sceneChanges"
              :key="scene.archetype"
              :data-test="'sale-scene-' + scene.archetype"
            >
              <td>Standing with {{ scene.archetype }}</td>
              <td class="num">{{ scene.before }}</td>
              <td class="num">{{ scene.after }}</td>
            </tr>
          </tbody>
        </table>
        <p class="dim" data-test="bench-sale-ledger">
          The profit is the sim's own, taken against this car's ledger at the moment of sale: bought
          for
          {{
            lastSale.ledger.purchaseYen === null
              ? 'an unrecorded figure'
              : formatYen(lastSale.ledger.purchaseYen)
          }}, repairs {{ formatYen(lastSale.ledger.repairYen) }}, parts fitted
          {{ formatYen(lastSale.ledger.partsYen) }}, listing fees
          {{ formatYen(lastSale.ledger.listingFeesYen) }}. Machine-shop hire is not in it, by the
          same design law that keeps it off the ledger, and neither is rent.
        </p>
        <p class="dim" data-test="bench-sale-heat-note">
          A sale does not move market heat on the day. It bumps the sales counter above, and the
          weekly market update is what reads that counter and moves heat with it - press that button
          in the running log to see the move. Reputation only ever rises, and a buyer who did not
          get what they came for simply pays nothing.
        </p>
        <p v-if="lastSale.matchedSale" class="dim" data-test="bench-sale-matched">
          The car genuinely met the buyer's want, so the sale credited their scene. An unmatched
          sale pays cash and no standing.
        </p>
      </template>
    </details>

    <!-- 5. THE ACQUISITION -------------------------------------------- -->
    <details v-if="acquisition" open class="panel" :class="{ stale: dirty }">
      <summary>5. Buying this car</summary>
      <p data-test="bench-room-read">
        The room's read of the car: {{ formatYen(acquisition.roomReadYen) }}. Reserve (where the
        board opens): <strong>{{ formatYen(acquisition.reserveYen) }}</strong
        >. Instant buyout at the desk: <strong>{{ formatYen(acquisition.buyoutYen) }}</strong
        >.
      </p>
      <table class="grid">
        <thead>
          <tr>
            <th>turnout</th>
            <th class="num">dealers</th>
            <th class="num">floor</th>
            <th class="num">band from</th>
            <th class="num">band to</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in acquisition.turnouts"
            :key="t.turnout"
            :data-test="'turnout-' + t.turnout"
          >
            <td>{{ t.turnout }}</td>
            <td class="num">{{ t.dealers }}</td>
            <td class="num">{{ formatYen(t.range.floorYen) }}</td>
            <td class="num">{{ formatYen(t.range.bandMinYen) }}</td>
            <td class="num">{{ formatYen(t.range.bandMaxYen) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="dim" data-test="bench-room-note">
        Floor, band, ceiling - not a single most-likely figure, which this two-piece distribution
        does not have. A cold room clears below the band, down as far as the floor; the odds of that
        are the room's own and are not shown here. Note the desk against the room:
        <template v-if="acquisition.buyoutAboveRoomRead">
          the desk charges a premium over the room's read of the car,
        </template>
        <template v-else> the desk charges the room's read of the car itself, </template>
        while the room clears somewhere below that same read. Buying out therefore runs well above
        the floor price, by construction rather than by accident.
      </p>
    </details>

    <!-- 6. THE COST SIDE ---------------------------------------------- -->
    <details open class="panel" :class="{ stale: dirty }">
      <summary>6. The cost side</summary>
      <p v-if="!car" class="warn" data-test="bench-car-sold-note">
        The car has been sold and its ledger went with it, so the table below reads empty. The sale
        took its own snapshot of that ledger, and it is in section 4.
      </p>
      <table class="grid">
        <thead>
          <tr>
            <th>on this car's ledger</th>
            <th class="num">yen</th>
          </tr>
        </thead>
        <tbody>
          <tr data-test="cost-purchase">
            <td>Bought for</td>
            <td class="num">
              {{
                costs.attributed.purchaseYen === null
                  ? 'unknown'
                  : formatYen(costs.attributed.purchaseYen)
              }}
            </td>
          </tr>
          <tr data-test="cost-repair">
            <td>Repair charges</td>
            <td class="num">{{ formatYen(costs.attributed.repairYen) }}</td>
          </tr>
          <tr data-test="cost-parts">
            <td>Parts fitted</td>
            <td class="num">{{ formatYen(costs.attributed.partsYen) }}</td>
          </tr>
          <tr data-test="cost-listing">
            <td>Listing fees</td>
            <td class="num">{{ formatYen(costs.attributed.listingFeesYen) }}</td>
          </tr>
        </tbody>
      </table>

      <table class="grid">
        <thead>
          <tr>
            <th>off this car's ledger</th>
            <th>bucket</th>
            <th class="num">yen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, i) in costs.unattributed" :key="i" :data-test="'spend-' + line.type">
            <td>{{ line.label }}</td>
            <td>{{ line.bucket }}</td>
            <td class="num">{{ formatYen(line.yen) }}</td>
          </tr>
          <tr v-if="costs.unattributed.length === 0">
            <td colspan="3" class="dim">Nothing spent off the car's ledger yet.</td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        Machine-shop hire sits here rather than on the car, by design law: one day's hire pulls four
        engines, so charging it to a single car would be a fiction. Rent and wages are excluded
        outright: a fixed overhead is never charged against one play's profitability.
      </p>
      <p class="dim" data-test="bench-cost-overlap">
        The two tables are not disjoint and must not be added together. A part is charged to the
        till when it is bought and stays on its line here for good; fitting it later adds its price
        to the car's own Parts fitted above without removing anything below, so the same yen sits in
        both, answering two different questions about it.
      </p>
      <p class="dim" data-test="bench-heat">
        This model's market heat right now: {{ model ? heatPercentFor(state, model) : 100 }}%.
      </p>
    </details>
  </section>
</template>

<style scoped>
.bench {
  font-size: var(--mg-fs-sm);
  padding-bottom: var(--mg-space-4, 2rem);
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
}

.banner {
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-3);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  margin-bottom: var(--mg-space-2);
}

.panel > summary {
  color: var(--mg-neon-violet);
  cursor: pointer;
}

/* A readout describing a car the builder no longer matches: still true about
   the car on the bench, and visibly not an answer about what is typed above. */
.panel.stale {
  opacity: 0.5;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  margin: var(--mg-space-2) 0;
}

.row.wrap {
  flex-wrap: wrap;
}

.actions .group {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 4px;
}

label,
.inline {
  display: inline-flex;
  align-items: center;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
}

input,
select {
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 1px 4px;
  font-family: inherit;
  font-size: inherit;
  max-width: 260px;
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: inherit;
}

.grid {
  width: 100%;
  border-collapse: collapse;
  margin: var(--mg-space-2) 0;
}

.grid th,
.grid td {
  border-bottom: 1px solid var(--mg-night-deep);
  padding: 1px 6px;
  text-align: left;
  vertical-align: top;
}

.grid th {
  color: var(--mg-text-dim);
  font-weight: normal;
}

.grid .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.grid tr.sub td {
  color: var(--mg-text-dim);
  padding-left: 18px;
}

.dim {
  color: var(--mg-text-dim);
}

.warn {
  color: var(--mg-danger);
}

.up {
  color: var(--mg-success);
}

.down {
  color: var(--mg-danger);
}

.total {
  font-size: var(--mg-fs-md, 1rem);
}
</style>
