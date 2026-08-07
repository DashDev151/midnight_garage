<script setup lang="ts">
import type {
  CarPartId,
  ComponentId,
  EngineCharacter,
  Grade,
  PaintFinish,
  PaintTinSize,
  Part,
  PartFitmentClass,
  SimpleConsumableId,
} from '@midnight-garage/content'
import {
  CONSUMABLE_TINS,
  PAINT_COLOURS,
  PAINT_TINS,
  fitmentClassForTier,
  paintStockKey,
  PART_FITMENT_CLASS_DISPLAY_NAMES,
  PartFitmentClassSchema,
} from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import GradeChip from '../components/GradeChip.vue'
import { groupSpriteId, partSpriteDataUrl } from '../components/partSprites'
import RotaryMarker from '../components/RotaryMarker.vue'
import { mapBackTarget } from './mapBack'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

const game = useGameStore()
const route = useRoute()

/** The tab bar reaches this screen too, with no `from` flag - the back
 * control then falls back to the garage exactly as it always has
 * (`mapBack.ts`). */
const backTarget = computed(() => mapBackTarget(route.query.from, { name: 'garage' }))

/** The plain class slicer's options, in a stable order (cheapest to priciest)
 * rather than object-key order. */
const FITMENT_CLASS_OPTIONS: readonly PartFitmentClass[] = PartFitmentClassSchema.options

/** The 6 real component groups, in the same stable order the car-detail
 * drill-down uses - the filter's own group-then-part structure. */
const COMPONENT_GROUPS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/** One filter option per catalog address, not the coarser 6-group addressing
 * staging/jobs use. */
const CAR_PART_OPTIONS: readonly CarPartId[] = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'fuelSystem',
  'ignitionEcu',
  'cooling',
  'forcedInduction',
  'gearbox',
  'clutch',
  'differential',
  'driveline',
  'chassis',
  'dampers',
  'springs',
  'antiRollBars',
  'steering',
  'brakePadsDiscs',
  'brakeCalipersLines',
  'rims',
  'tyres',
  'bodywork',
  'paint',
  'aero',
  'seats',
  'dashGauges',
]

/** `CAR_PART_OPTIONS` bucketed under its group, for the catalog's click-
 * through drill-down - group first, then the specific part within it. */
const groupedCarPartOptions = computed(() =>
  COMPONENT_GROUPS.map((groupId) => ({
    groupId,
    label: game.componentLabel(groupId),
    parts: CAR_PART_OPTIONS.filter((id) => game.groupForCarPart(id) === groupId),
  })),
)

const GRADE_OPTIONS: readonly Grade[] = ['stock', 'street', 'sport', 'race']
const SORT_OPTIONS = [
  { value: 'price-asc', label: 'price: low to high' },
  { value: 'price-desc', label: 'price: high to low' },
] as const

/** The market's default view is six department hero cards, no parts list at
 * all - `view` gates the whole hero-grid vs. catalog template split.
 * `'browse-everything'` is the demoted "All parts" escape hatch (a small link,
 * not a seventh hero); `'department'` is reached only by clicking one of the
 * six heroes.
 */
type MarketView = 'home' | 'browse-everything' | 'department'
const view = ref<MarketView>('home')

/** The catalog's own click-through state: `null` (browse-everything) shows the
 * flat, unfiltered catalog; a department view sets this to that group; picking a
 * sub-part within it narrows further to the exact `CarPartId` via
 * `componentFilter`.
 */
const selectedGroup = ref<ComponentId | null>(null)
const componentFilter = ref<CarPartId | ''>('')
const gradeFilter = ref<Grade | ''>('')
const sortBy = ref<(typeof SORT_OPTIONS)[number]['value']>('price-asc')
const deliverySpeed = ref<'standard' | 'express'>('standard')

/** Two fitment controls. `classFilter` is the plain class slicer; `vehicleFilter`
 * is the "Fits this vehicle" picker - choosing a car sets `classFilter` to that
 * car's own fitment class so the counter narrows to what could ever go on it.
 * The two stay independently editable afterward (picking a vehicle is a shortcut
 * to a class, not a separate mode).
 */
const classFilter = ref<PartFitmentClass | ''>('')
const vehicleFilter = ref<string>('')

// Owned cars AND accepted customer service-job cars (arrived or inbound) - so
// the accept-job, order-parts, both-arrive-tomorrow loop can filter parts to a
// car that isn't physically in the shop yet.
const vehicleOptions = computed(() => game.partsFitVehicleOptions)

/** Whichever car the "fits this vehicle" picker is pointed at, or `null` when
 * none is - the one resolution of that id, shared by the class shortcut below
 * and the power figure on each catalogue row. */
const selectedVehicle = computed(
  () => vehicleOptions.value.find((v) => v.id === vehicleFilter.value) ?? null,
)

function onVehicleFilterChange(): void {
  classFilter.value = selectedVehicle.value?.fitmentClass ?? ''
}

/** Hero click: home -> a specific department's catalog view. */
function enterDepartment(groupId: ComponentId): void {
  selectedGroup.value = groupId
  componentFilter.value = ''
  view.value = 'department'
}

/** The demoted "All parts" link: home -> the flat, unfiltered catalog. */
function enterBrowseEverything(): void {
  selectedGroup.value = null
  componentFilter.value = ''
  view.value = 'browse-everything'
}

/** Breadcrumb root: back to the six hero cards from either catalog view. */
function returnHome(): void {
  view.value = 'home'
  selectedGroup.value = null
  componentFilter.value = ''
}

function selectPart(partId: CarPartId): void {
  componentFilter.value = componentFilter.value === partId ? '' : partId
}

/** Back one level: an open slot's part list steps up to the slot cards; the
 * slot cards step up to the department heroes. */
function goBack(): void {
  if (componentFilter.value) componentFilter.value = ''
  else returnHome()
}

/** The /parts?slot={carPartId} deep link. The bench dead-end control and
 * ReplaceDrawer's empty state land here already pointed at the right department
 * with the slot filter applied - the same state a hero click plus a slot-card
 * click sets. The query is an entry hint, not persistent state, so it is
 * dropped from the route straight away.
 */
/** How many products a slot has - the count shown on its card. */
function slotPartCount(slotId: CarPartId): number {
  return game.partsCatalog.filter((p) => p.carPartId === slotId && !isDelisted(p)).length
}

/** The drilled-into group's own sub-parts, or empty when no group is
 * selected - avoids pairing `v-for`/`v-show` on the same element in the
 * template (this codebase's ESLint config flags `v-for` alongside a
 * conditional directive). */
const selectedGroupParts = computed(() => {
  const group = groupedCarPartOptions.value.find((g) => g.groupId === selectedGroup.value)
  return group?.parts ?? []
})

/** A part also has to be the right fitment class for at least one owned car,
 * on top of the pre-existing platform-tag check. */
function fitsAnyOwnedCar(part: Part): boolean {
  if (game.carsDetailed.length === 0) return false
  return game.carsDetailed.some(
    (d) =>
      fitmentClassForTier(d.model.tier) === part.fitmentClass &&
      part.requiredTags.every((t) => d.model.tags.includes(t)),
  )
}

/**
 * What a SKU is worth in power ON THE SELECTED CAR, as a percentage of that
 * car's own stock output: `powerFraction` is authored per engine character,
 * and `computeDerivedStats` spends it as `stockPowerPs * fraction`, so the
 * percentage is the fraction and the car's own stock power is the thing it is
 * a percentage OF. Returns `null` with no car picked, because the same SKU is
 * worth an order of magnitude more on a turbo than on a high-strung NA engine
 * and a catalogue with no car in view has nothing true to say about which.
 *
 * The figure is honest as shown and carries no caveats. Support does not gate
 * power - an unsupported build makes its full power and pays for it in
 * reliability (`packages/sim/src/support.ts`) - so nothing here is
 * conditional on the rest of the build. Condition DOES scale what a fitted
 * part delivers, but a catalogue SKU is not fitted and not worn; the car's
 * own build view is where an installed part's band is shown.
 */
function powerPercent(part: Part): number | null {
  const character: EngineCharacter | null = selectedVehicle.value?.engineCharacter ?? null
  if (!character) return null
  const fraction = part.statModifiers.powerFraction[character]
  return fraction === 0 ? null : Math.round(fraction * 100)
}

/**
 * The tool this SKU would want before it could go onto the selected car,
 * named, or `null` when the shop can already fit it. Scoped to the "fits this
 * vehicle" picker for the same reason `powerPercent` is: the answer depends on
 * the car, and a catalogue with no car in view has nothing true to say about
 * it. Said here rather than after delivery, so a part that needs a shop the
 * garage has not got is a decision at the till instead of a surprise on the
 * bench.
 */
function toolGateReason(part: Part): string | null {
  const carId = selectedVehicle.value?.id
  return carId ? game.installToolGateReasonFor(carId, part.id) : null
}

/**
 * Reliability and authenticity are both absent from this badge deliberately.
 * Reliability is not a per-part delta at all any more: a part does not add
 * reliability, the build supports its own output or it does not
 * (`packages/sim/src/support.ts`). Authenticity likewise: it is a fact about
 * how much of the car is still original, so fitting ANY non-stock part costs
 * that slot's whole authenticity weight, which is a property of the slot
 * rather than of this SKU. Handling is absent for a third reason: a part
 * reaches it only through the grip it moves, which is a physical modifier
 * rather than a stat delta.
 */
function statSummary(part: Part): string {
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`
  const entries: string[] = []
  const power = powerPercent(part)
  if (power !== null) entries.push(`P${signed(power)}%`)
  if (part.statModifiers.style !== 0) entries.push(`S${signed(part.statModifiers.style)}`)
  return entries.join(' ')
}

/** `bodywork`/`paint`'s own stock SKU stays in the catalogue (the derived value
 * carriers' installed reference - `bodyPipeline.ts`), but the market never
 * lists it again: a zone-panel SKU still carries `carPartId: "bodywork"` at
 * `grade: "stock"`, so the exclusion is guarded on `zoneId` too, or it would
 * delist the real zone panels alongside the whole-slot reference. */
const DELISTED_DERIVED_PART_IDS: readonly CarPartId[] = ['bodywork', 'paint']
function isDelisted(part: Part): boolean {
  return (
    part.grade === 'stock' &&
    part.zoneId == null &&
    DELISTED_DERIVED_PART_IDS.includes(part.carPartId)
  )
}

const visibleParts = computed(() => {
  let parts = game.partsCatalog.filter((p) => !isDelisted(p))
  if (componentFilter.value) {
    parts = parts.filter((p) => p.carPartId === componentFilter.value)
  } else if (selectedGroup.value) {
    parts = parts.filter((p) => game.groupForCarPart(p.carPartId) === selectedGroup.value)
  }
  if (gradeFilter.value) parts = parts.filter((p) => p.grade === gradeFilter.value)
  if (classFilter.value) parts = parts.filter((p) => p.fitmentClass === classFilter.value)
  return parts.sort((a, b) =>
    sortBy.value === 'price-asc' ? a.priceYen - b.priceYen : b.priceYen - a.priceYen,
  )
})

function fitmentClassLabel(fitmentClass: PartFitmentClass): string {
  return PART_FITMENT_CLASS_DISPLAY_NAMES[fitmentClass]
}

const checkoutTotal = computed(() =>
  deliverySpeed.value === 'express' ? game.cartExpressTotalYen : game.cartStandardTotalYen,
)

const lastCheckoutResult = ref<{ boughtCount: number; remainingCount: number } | null>(null)

function onCheckout(): void {
  lastCheckoutResult.value = game.checkoutCart(deliverySpeed.value)
}

/** The shelf count for one simple (non-paint) consumable - `0` for a shop
 * that has never bought that tin. */
function consumableStockCount(id: SimpleConsumableId): number {
  return game.consumableStock[id] ?? 0
}

/** The paint shop's own three armed choices: finish, size and colour -
 * together they pick one of the six catalogue tins and one shelf key. */
const paintFinish = ref<PaintFinish>('solid')
const paintSize = ref<PaintTinSize>('small')
const paintColourId = ref<string>(PAINT_COLOURS[0]!.id)

const selectedPaintTin = computed(() =>
  PAINT_TINS.find((t) => t.finish === paintFinish.value && t.size === paintSize.value),
)

/** The shelf count in exactly the armed finish and colour - a tin of a
 * different finish or a different colour never counts toward this. */
const selectedPaintStock = computed(
  () => game.consumableStock[paintStockKey(paintFinish.value, paintColourId.value)] ?? 0,
)

function onBuyPaint(): void {
  game.buyPaintTin(paintFinish.value, paintSize.value, paintColourId.value)
}
</script>

<template>
  <section class="parts">
    <RouterLink :to="backTarget" class="back">&lt; Back</RouterLink>
    <header class="head">
      <h2>Parts market</h2>
    </header>

    <div class="market-layout">
      <div class="market-main">
        <template v-if="view === 'home'">
          <ul class="hero-grid">
            <li v-for="group in groupedCarPartOptions" :key="group.groupId">
              <button
                type="button"
                class="hero-card"
                :data-test="'hero-' + group.groupId"
                @click="enterDepartment(group.groupId)"
              >
                <div class="hero-art" aria-hidden="true">
                  <img
                    class="hero-sprite"
                    :src="partSpriteDataUrl(groupSpriteId(group.groupId))"
                    alt=""
                    aria-hidden="true"
                  />
                </div>
                <span class="hero-label">{{ group.label }}</span>
                <span class="hero-count">{{ group.parts.length }} slots</span>
              </button>
            </li>
          </ul>
          <button
            type="button"
            class="browse-all"
            data-test="browse-everything"
            @click="enterBrowseEverything"
          >
            Browse everything
          </button>

          <section class="materials-shelf" data-test="consumables-shelf">
            <h3>Consumables</h3>
            <p class="materials-note">
              Buy a tin and it goes on the shelf. A pipeline stage draws from what is there, one use
              at a time, and refuses when it runs out.
            </p>
            <ul class="materials-list">
              <li
                v-for="tin in CONSUMABLE_TINS"
                :key="tin.id"
                class="materials-row"
                :data-test="'consumable-' + tin.id"
              >
                <span class="materials-name">{{ tin.name }}</span>
                <span class="consumables-stock" :data-test="'consumable-stock-' + tin.id">
                  {{ consumableStockCount(tin.id) }} on the shelf
                </span>
                <span class="materials-price">{{ formatYen(tin.priceYen) }}</span>
                <button
                  :data-test="'buy-consumable-' + tin.id"
                  :disabled="game.cashYen < tin.priceYen"
                  @click="game.buyConsumableTin(tin.id)"
                >
                  Buy
                </button>
              </li>
            </ul>

            <div class="paint-shop" data-test="paint-shop">
              <h4>Paint</h4>
              <p class="materials-note">
                A tin is mixed to one colour. Buying paint means buying a colour, so a mismatched or
                factory respray is a consequence of what is on the shelf, not a menu choice.
              </p>
              <div class="paint-shop-controls">
                <select v-model="paintFinish" data-test="paint-finish">
                  <option value="solid">Solid</option>
                  <option value="metallic">Metallic</option>
                  <option value="pearl">Pearl</option>
                </select>
                <select v-model="paintSize" data-test="paint-size">
                  <option value="small">Small (3 zones)</option>
                  <option value="large">Large (9 zones)</option>
                </select>
                <select v-model="paintColourId" data-test="paint-colour">
                  <option v-for="colour in PAINT_COLOURS" :key="colour.id" :value="colour.id">
                    {{ colour.name }}
                  </option>
                </select>
                <span v-if="selectedPaintTin" class="materials-price">{{
                  formatYen(selectedPaintTin.priceYen)
                }}</span>
                <button
                  data-test="buy-paint"
                  :disabled="!selectedPaintTin || game.cashYen < selectedPaintTin.priceYen"
                  @click="onBuyPaint"
                >
                  Buy tin
                </button>
              </div>
              <p class="consumables-stock" data-test="paint-stock-selected">
                {{ selectedPaintStock }} on the shelf in this colour and finish
              </p>
            </div>
          </section>
        </template>

        <template v-else>
          <nav class="breadcrumb" aria-label="Parts market breadcrumb">
            <button type="button" class="market-back" data-test="market-back" @click="goBack">
              &lt; Back
            </button>
            <button
              type="button"
              class="breadcrumb-root"
              data-test="breadcrumb-root"
              @click="returnHome"
            >
              Parts market
            </button>
            <span class="breadcrumb-sep">&gt;</span>
            <button
              v-if="selectedGroup && componentFilter"
              type="button"
              class="breadcrumb-root"
              data-test="breadcrumb-group"
              @click="componentFilter = ''"
            >
              {{ game.componentLabel(selectedGroup) }}
            </button>
            <span v-else class="breadcrumb-current">{{
              selectedGroup ? game.componentLabel(selectedGroup) : 'All parts'
            }}</span>
            <template v-if="selectedGroup && componentFilter">
              <span class="breadcrumb-sep">&gt;</span>
              <span class="breadcrumb-current">{{ game.carPartLabel(componentFilter) }}</span>
            </template>
          </nav>

          <!-- Level 2: the group's slots as cards with sprites, mirroring the
               home department heroes. Clicking one opens its part list. -->
          <ul v-if="view === 'department' && !componentFilter" class="hero-grid">
            <li v-for="partId in selectedGroupParts" :key="partId">
              <button
                type="button"
                class="hero-card"
                :data-test="'catalog-part-' + partId"
                @click="selectPart(partId)"
              >
                <div class="hero-art" aria-hidden="true">
                  <img class="hero-sprite" :src="partSpriteDataUrl(partId)" alt="" />
                </div>
                <span class="hero-label">{{ game.carPartLabel(partId) }}</span>
                <span class="hero-count">{{ slotPartCount(partId) }} parts</span>
              </button>
            </li>
          </ul>

          <div v-if="componentFilter || view === 'browse-everything'" class="filters">
            <select v-model="gradeFilter" data-test="filter-grade">
              <option value="">all grades</option>
              <option v-for="g in GRADE_OPTIONS" :key="g" :value="g">{{ g }}</option>
            </select>
            <select v-model="classFilter" data-test="filter-class">
              <option value="">all classes</option>
              <option v-for="c in FITMENT_CLASS_OPTIONS" :key="c" :value="c">
                {{ fitmentClassLabel(c) }}
              </option>
            </select>
            <select
              v-model="vehicleFilter"
              data-test="filter-vehicle"
              @change="onVehicleFilterChange"
            >
              <option value="">fits this vehicle...</option>
              <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">{{ v.label }}</option>
            </select>
            <select v-model="sortBy" data-test="sort-by">
              <option v-for="s in SORT_OPTIONS" :key="s.value" :value="s.value">
                {{ s.label }}
              </option>
            </select>
          </div>

          <ul v-if="componentFilter || view === 'browse-everything'" class="catalog">
            <li v-for="part in visibleParts" :key="part.id" class="part">
              <div class="part-info">
                <div class="part-main">
                  <span class="part-name"
                    >{{ fitmentClassLabel(part.fitmentClass) }} {{ part.brand }} {{ part.name
                    }}<RotaryMarker v-if="part.requiredTags.includes('Rotary')"
                  /></span>
                  <span class="part-meta">
                    {{ game.carPartLabel(part.carPartId) }}
                    <GradeChip :grade="part.grade" />
                    · {{ statSummary(part) || 'no stat change' }}
                  </span>
                  <span
                    v-if="game.carsDetailed.length > 0"
                    class="part-fit"
                    :class="{ fit: fitsAnyOwnedCar(part) }"
                    :title="
                      part.requiredTags.length ? 'Requires: ' + part.requiredTags.join(', ') : ''
                    "
                  >
                    {{ fitsAnyOwnedCar(part) ? 'fits a car you own' : "doesn't fit a car you own" }}
                  </span>
                  <!-- Only ever shown with a car in the "fits this vehicle"
                       picker, since the tool a part wants is a fact about
                       fitting it to a particular car. -->
                  <span
                    v-if="toolGateReason(part)"
                    class="part-tool-gate"
                    :data-test="'tool-gate-' + part.id"
                  >
                    {{ toolGateReason(part) }} to fit it
                  </span>
                </div>
              </div>
              <div class="part-buy">
                <span class="price">{{ formatYen(part.priceYen) }}</span>
                <button :data-test="'add-to-cart-' + part.id" @click="game.addToCart(part.id)">
                  Add to cart
                </button>
              </div>
            </li>
          </ul>
        </template>
      </div>

      <aside class="cart-rail">
        <section class="cart" data-test="cart-panel">
          <h3>Cart</h3>
          <p v-if="game.cartItems.length === 0" class="empty">Cart is empty.</p>
          <ul v-else class="cart-items">
            <li v-for="item in game.cartItems" :key="item.part.id" class="cart-item">
              <span class="cart-item-name"
                >{{ fitmentClassLabel(item.part.fitmentClass) }} {{ item.part.brand }}
                {{ item.part.name }}</span
              >
              <span class="cart-item-qty">x{{ item.quantity }}</span>
              <span class="cart-item-subtotal">{{ formatYen(item.subtotalYen) }}</span>
              <button
                :data-test="'remove-from-cart-' + item.part.id"
                @click="game.removeFromCart(item.part.id)"
              >
                Remove
              </button>
            </li>
          </ul>

          <div v-if="game.cartItems.length > 0" class="checkout">
            <div class="delivery-choice">
              <label>
                <input
                  v-model="deliverySpeed"
                  type="radio"
                  value="standard"
                  data-test="delivery-standard"
                />
                Standard - {{ formatYen(game.cartStandardTotalYen) }} (arrives next day)
              </label>
              <label>
                <input
                  v-model="deliverySpeed"
                  type="radio"
                  value="express"
                  data-test="delivery-express"
                />
                Express - {{ formatYen(game.cartExpressTotalYen) }} (arrives today)
              </label>
            </div>
            <button
              class="primary"
              data-test="checkout"
              :disabled="game.cashYen < checkoutTotal"
              @click="onCheckout"
            >
              Checkout ({{ formatYen(checkoutTotal) }})
            </button>
            <p
              v-if="lastCheckoutResult && lastCheckoutResult.remainingCount > 0"
              class="checkout-warning"
            >
              Bought {{ lastCheckoutResult.boughtCount }} - couldn't afford the rest, still in cart.
            </p>
          </div>
        </section>

        <section v-if="game.pendingPartOrders.length" class="orders">
          <h3>On order</h3>
          <ul>
            <li v-for="order in game.pendingPartOrders" :key="order.id">
              {{ game.partName(order.partId) }} - arrives day {{ order.arrivesOnDay }}
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

/* The default view - six department hero cards, no
   parts list until one is opened. */
.hero-grid {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-2) 0 var(--mg-space-3);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--mg-space-3);
}

.hero-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  font-family: inherit;
  cursor: pointer;
}

.hero-card:hover {
  border-color: var(--mg-neon-cyan);
}

/* The department's sprite frame: the group's representative assembly sprite
   fills this box. Placeholder art only, per the sprite module's provenance note. */
.hero-art {
  width: 100%;
  aspect-ratio: 2 / 1;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mg-space-2);
  overflow: hidden;
}

.hero-sprite {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.hero-label {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-md);
  /* Reserve two lines so a wrapping label ("Suspension and Brakes") doesn't
     render its hero card taller than the single-line siblings in the same grid
     row. */
  min-height: 2.6em;
  display: flex;
  align-items: center;
}

.hero-count {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.browse-all {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.materials-shelf {
  margin-top: var(--mg-space-4);
}

.materials-note {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-2);
}

.materials-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-2);
}

.materials-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.materials-name {
  flex: 1;
  color: var(--mg-neon-cyan);
}

.consumables-stock {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.materials-price {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.paint-shop {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
}

.paint-shop h4 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.paint-shop-controls {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

.paint-shop-controls select {
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.market-back {
  font-size: var(--mg-fs-sm);
  padding: 2px 10px;
}

.breadcrumb-root {
  color: var(--mg-neon-violet);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
}

.breadcrumb-sep,
.breadcrumb-current {
  color: var(--mg-text-dim);
}

.part-chips {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
}

.chip {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  font-family: inherit;
  cursor: pointer;
  font-size: var(--mg-fs-sm);
  padding: 2px 10px;
}

.chip.active {
  color: var(--mg-night-deep);
  background: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

.filters {
  display: flex;
  gap: var(--mg-space-2);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
  flex-wrap: wrap;
}

.filters select {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

/* The cart is a sticky right rail beside the list, stacking below it on
   narrow viewports so it's never lost. */
.market-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  align-items: start;
  gap: var(--mg-space-3);
}

@media (max-width: 800px) {
  .market-layout {
    grid-template-columns: 1fr;
  }
}

.cart-rail {
  position: sticky;
  top: var(--mg-space-2);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-3);
}

.catalog {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-4);
  display: grid;
  gap: var(--mg-space-2);
}

.part {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--mg-space-3);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
}

/* A part that doesn't fit an owned car is NOT dimmed - it's fully buyable
   (parts don't have to fit a current car to be bought), and dimming read as
   "disabled". Fit status is carried by the `.part-fit` tag below (recoloured),
   not by greying out a clickable row. */

.part-info {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  min-width: 0;
}

/* The part's slot sprite: a decorative thumbnail of a `partSprites` raster,
   kept crisp by the same nearest-neighbour treatment every sprite surface
   uses. Placeholder art only, per the sprite module's provenance note. */
.part-sprite {
  flex: 0 0 auto;
  width: 44px;
  height: 30px;
  object-fit: contain;
  image-rendering: pixelated;
}

.part-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.part-name {
  color: var(--mg-neon-cyan);
}

.part-meta,
.part-fit {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.fit {
  color: var(--mg-success);
  margin-left: var(--mg-space-2);
}

/* The "doesn't fit a car you own" tag reads as a note, not a disabled state -
   a distinct muted violet, legible against the panel. */
.part-fit:not(.fit) {
  color: var(--mg-neon-violet);
}

/* The tool a part still wants, in the same pink the car screen dims an
   unreachable part with - a wall to buy your way past, not a fit problem. */
.part-tool-gate {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
}

.part-buy {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.price {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.orders {
  margin-bottom: var(--mg-space-4);
}

.orders ul {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cart {
  background: var(--mg-panel);
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

.cart .empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cart-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.cart-item {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
}

.cart-item-name {
  flex: 1;
}

.cart-item-qty,
.cart-item-subtotal {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.cart-item-subtotal {
  color: var(--mg-yen);
}

.checkout {
  margin-top: var(--mg-space-3);
  padding-top: var(--mg-space-3);
  border-top: var(--mg-border);
}

.delivery-choice {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  margin-bottom: var(--mg-space-3);
  font-size: var(--mg-fs-sm);
}

.checkout-warning {
  color: var(--mg-neon-pink);
  font-size: var(--mg-fs-sm);
  margin-top: var(--mg-space-2);
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
}
</style>
