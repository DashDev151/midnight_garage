<script setup lang="ts">
import {
  BuyerArchetypeSchema,
  ComponentIdSchema,
  ConditionBandSchema,
  ReputationTierSchema,
  SceneStandingStageSchema,
  type BuyerArchetype,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type DayLogEntry,
  type Grade,
  type ReputationTier,
  type SceneStandingStage,
  type SellingChannelId,
  type ToolTier,
  type TrimZoneState,
  type ZoneId,
} from '@midnight-garage/content'
import { ALL_CAR_PART_IDS } from '@midnight-garage/content'
import { computed, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import { SELLING_CHANNEL_LABELS } from '../utils/sellingChannelLabels'
import {
  BENCH_CAR_ID,
  BENCH_ZONE_IDS,
  benchCarInstance,
  benchGameState,
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
  buyerRowsFor,
  channelRowsFor,
  costSheetFor,
  heatPercentFor,
  openingBlockFor,
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
const REPUTATION_TIERS = ReputationTierSchema.options
const SCENES = BuyerArchetypeSchema.options
const STAGES = SceneStandingStageSchema.options
const TOOL_TIERS: readonly ToolTier[] = [1, 2]
const METAL_SEVERITIES = [0, 1, 2, 3, 4]
const SURFACE_SEVERITIES = [0, 1, 2]
const FINISHES = [0, 1, 2, 3]

const modelId = ref(context.value.models[0]?.id ?? '')
const model = computed(() => context.value.modelsById[modelId.value])

const carSpec = ref<BenchCarSpec>(defaultCarSpec(context.value.models[0]!, context.value))
const shopSpec = ref<BenchShopSpec>(defaultShopSpec(context.value))
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
}

function pickModel(id: string): void {
  modelId.value = id
  const chosen = context.value.modelsById[id]
  if (!chosen) return
  carSpec.value = defaultCarSpec(chosen, context.value)
  rebuild()
}

/** Loads a REAL generated lot through `generateAuctionCarInstance` - the
 * common case, since a realistic car is rolled rather than hand-set. */
function loadGeneratedLot(): void {
  const chosen = model.value
  if (!chosen) return
  const rolled = generatedBenchCar(chosen, generatorSeed.value, shopSpec.value.day, context.value)
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
  carSpec.value = defaultCarSpec(chosen, context.value)
  rebuild()
}

// --- the builder's own controls -------------------------------------------

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

const opening = computed(() =>
  car.value && model.value
    ? openingBlockFor(car.value, model.value, state.value, context.value)
    : null,
)
const buyers = computed(() =>
  car.value && model.value ? buyerRowsFor(car.value, model.value, state.value, context.value) : [],
)
const channels = computed(() =>
  car.value && model.value
    ? channelRowsFor(car.value, model.value, state.value, context.value)
    : [],
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
const runningTotalYen = computed(() => log.value.reduce((sum, line) => sum + line.deltaYen, 0))
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
          <input v-model.number="carSpec.mileageKm" type="number" min="0" step="5000" />
        </label>
        <label>
          Year
          <input v-model.number="carSpec.year" type="number" />
        </label>
        <button type="button" data-test="bench-rebuild" @click="rebuild">Rebuild</button>
        <button type="button" data-test="bench-reset-spec" @click="resetSpec">
          Reset to stock and mint
        </button>
      </div>

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
          <select :value="shopSpec.reputationTier" @change="setReputationTier(inputValue($event))">
            <option v-for="t in REPUTATION_TIERS" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <button type="button" data-test="bench-apply-shop" @click="rebuild">
          Apply and rebuild
        </button>
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
    <details v-if="opening" open class="panel">
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
            <tr v-if="line.billYen !== 0" :data-test="'bill-' + line.partId">
              <td>{{ context.partsTaxonomyById[line.partId]?.displayName ?? line.partId }}</td>
              <td class="num">{{ formatYen(line.billYen) }}</td>
              <td class="num">{{ formatYen(line.belowBandBillYen) }}</td>
              <td class="num">{{ formatYen(line.aboveBandBillYen) }}</td>
              <td class="num">
                <span v-if="opening.onScrapFloor" class="dim">n/a</span>
                <span v-else>{{ formatYenDelta(line.valueYen) }}</span>
              </td>
            </tr>
            <tr v-for="zone in line.zones ?? []" :key="line.partId + zone.zoneId" class="sub">
              <td>{{ line.partId }} / {{ zone.zoneId }}</td>
              <td class="num">{{ formatYen(zone.yen) }}</td>
              <td colspan="3"></td>
            </tr>
          </template>
        </tbody>
      </table>
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
      </div>

      <table class="grid">
        <thead>
          <tr>
            <th>#</th>
            <th>action</th>
            <th class="num">value delta</th>
            <th class="num">cash</th>
            <th class="num">labour</th>
            <th>what the sim said</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, i) in log" :key="i" :data-test="'log-line-' + i">
            <td>{{ i + 1 }}</td>
            <td>{{ line.label }}</td>
            <td class="num" :class="{ up: line.deltaYen > 0, down: line.deltaYen < 0 }">
              {{ formatYenDelta(line.deltaYen) }}
            </td>
            <td class="num">{{ formatYenDelta(line.cashDeltaYen) }}</td>
            <td class="num">{{ line.labourSpent }}</td>
            <td>
              <span v-if="line.refusal" class="warn">{{ line.refusal }}</span>
              <span v-else>{{ line.notes.join(' ') || '-' }}</span>
            </td>
          </tr>
          <tr v-if="log.length === 0">
            <td colspan="6" class="dim">Nothing done yet.</td>
          </tr>
        </tbody>
      </table>
      <p class="dim">
        Every delta is market value after minus market value before: exact by construction, with
        nothing attributed. A job that outruns today's labour stays open - refill the pool and press
        the same button again to carry it on, exactly as the workshop floor does.
      </p>
    </details>

    <!-- 4. THE SALE --------------------------------------------------- -->
    <details open class="panel">
      <summary>4. The sale</summary>
      <table class="grid">
        <thead>
          <tr>
            <th>buyer</th>
            <th>champion stat</th>
            <th>gate</th>
            <th class="num">taste</th>
            <th>outcome</th>
            <th class="num">would pay</th>
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
        Each price is that buyer's own valuation at their OWN coherence tolerance. The value ledger
        cannot answer this: it takes no tolerance parameter, so it always reads the market's.
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
    </details>

    <!-- 5. THE ACQUISITION -------------------------------------------- -->
    <details v-if="acquisition" open class="panel">
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
      <p class="dim">
        Floor, band, ceiling - not a single most-likely figure, which this two-piece distribution
        does not have. Note what the two columns say against each other: the desk charges the guide
        value itself, carrying no premium over it at the shipped tuning, while a room clears
        somewhere below that same read. Buying out therefore runs well above the floor price, by
        construction rather than by accident.
      </p>
    </details>

    <!-- 6. THE COST SIDE ---------------------------------------------- -->
    <details open class="panel">
      <summary>6. The cost side</summary>
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
          <tr v-for="line in costs.unattributed" :key="line.type" :data-test="'spend-' + line.type">
            <td>{{ line.label }}{{ line.count > 1 ? ` (x${line.count})` : '' }}</td>
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
        engines, so charging it to a single car would be a fiction. Parts land here the moment they
        are paid for and only join the car's ledger if and when they are fitted. Rent and wages are
        excluded outright: a fixed overhead is never charged against one play's profitability.
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
