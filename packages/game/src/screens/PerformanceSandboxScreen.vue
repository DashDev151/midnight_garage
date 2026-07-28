<script setup lang="ts">
import type { CarPartId, Grade, CarTier } from '@midnight-garage/content'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import {
  DEFAULT_HEAT_PERCENT,
  GRADES,
  HEAT_PERCENT_RANGE,
  MILEAGE_RANGE_KM,
  SLOT_STATES,
  TIERS,
  decodeBuildCode,
  defaultBuild,
  encodeBuildCode,
  evaluateBuild,
  fittableGrades,
  modelAtTier,
  sandboxCars,
  slotView,
  type SandboxBuild,
  type SandboxCar,
  type SlotState,
} from './dev/sandboxModel'

/**
 * THE PERFORMANCE SANDBOX.
 *
 * A development tool on a dev route, not a player feature. Pick any of the 85
 * vetted cars, set every component's condition and fitted tier, set the mileage
 * and the market heat the car is priced at, and watch the four lap times, the
 * retail value and the physical figures move.
 *
 * It runs the live sim through `dev/sandboxModel.ts`: there is no snapshot and
 * nothing here can go stale, because every figure is computed by the same
 * functions the game itself calls, on the content this build shipped with.
 */

const game = useGameStore()

const cars = sandboxCars(game.context)
const taxonomy = game.context.partsTaxonomy
const courses = game.context.courses

type TaxonomyEntry = (typeof taxonomy)[number]

/** The 29 components in taxonomy order, split into their six groups in the
 * order the taxonomy lists them. */
const groups = (() => {
  const ordered: { id: string; parts: TaxonomyEntry[] }[] = []
  for (const entry of taxonomy) {
    const last = ordered[ordered.length - 1]
    if (last && last.id === entry.group) last.parts.push(entry)
    else ordered.push({ id: entry.group, parts: [entry] })
  }
  return ordered
})()

const selectedId = ref((cars.find((entry) => entry.inGame) ?? cars[0])?.id ?? '')
const tierOverrides = ref<Record<string, CarTier>>({})
const search = ref('')
const pickerOpen = ref(false)
const codeInput = ref('')
const codeNote = ref('')

const car = computed<SandboxCar>(() => {
  const found = cars.find((entry) => entry.id === selectedId.value)
  if (!found) throw new Error(`unknown sandbox car "${selectedId.value}"`)
  return found
})

const tier = computed<CarTier>(() => tierOverrides.value[selectedId.value] ?? car.value.defaultTier)
const model = computed(() => modelAtTier(car.value, tier.value))
const fittable = computed(() => fittableGrades(model.value, game.context))

const build = ref<SandboxBuild>(defaultBuild(model.value))
const mileageKm = ref(car.value.defaultMileageKm)
const heatPercent = ref(DEFAULT_HEAT_PERCENT)

const stockResult = computed(() =>
  evaluateBuild(
    model.value,
    defaultBuild(model.value),
    car.value.inGame,
    mileageKm.value,
    heatPercent.value,
    game.context,
  ),
)
const result = computed(() =>
  evaluateBuild(
    model.value,
    build.value,
    car.value.inGame,
    mileageKm.value,
    heatPercent.value,
    game.context,
  ),
)
const blockedPartIds = computed(() => result.value.blockers.map((blocker) => blocker.partId))

const buildCode = computed(() => encodeBuildCode(car.value.id, tier.value, build.value))

const filteredCars = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return cars
  return cars.filter((entry) => entry.displayName.toLowerCase().includes(query))
})

/* ---- reading and writing the build ---- */

function gradesFor(partId: CarPartId): readonly Grade[] {
  return fittable.value[partId] ?? ['stock']
}

function stateOf(partId: CarPartId): SlotState {
  return slotView(build.value[partId]).state
}

function gradeOf(partId: CarPartId): Grade {
  return slotView(build.value[partId]).grade
}

function setState(partId: CarPartId, state: SlotState): void {
  build.value[partId] =
    state === 'missing' ? { missing: true } : { band: state, grade: gradeOf(partId) }
}

function setGrade(partId: CarPartId, grade: Grade): void {
  if (!gradesFor(partId).includes(grade)) return
  const current = stateOf(partId)
  build.value[partId] = { band: current === 'missing' ? 'mint' : current, grade }
}

/** `groupId` null means every component. A slot the catalogue has no part for
 * at this tier keeps what it has, rather than being silently moved to a part
 * that does not exist. */
function applyState(groupId: string | null, state: SlotState): void {
  for (const entry of taxonomy) {
    if (groupId !== null && entry.group !== groupId) continue
    setState(entry.id, state)
  }
}

function applyGrade(groupId: string | null, grade: Grade): void {
  for (const entry of taxonomy) {
    if (groupId !== null && entry.group !== groupId) continue
    setGrade(entry.id, grade)
  }
}

function selectCar(id: string): void {
  selectedId.value = id
  build.value = defaultBuild(model.value)
  resetMileage()
  pickerOpen.value = false
  codeNote.value = ''
}

/** Changing tier only changes which fitment class of parts is on offer. A grade
 * the new class cannot supply falls back to stock rather than staying fitted as
 * something that does not exist. */
function selectTier(next: CarTier): void {
  tierOverrides.value = { ...tierOverrides.value, [selectedId.value]: next }
  for (const entry of taxonomy) {
    const slot = build.value[entry.id]
    if (!slot || 'missing' in slot) continue
    if (!gradesFor(entry.id).includes(slot.grade)) {
      build.value[entry.id] = { band: slot.band, grade: 'stock' }
    }
  }
}

function resetBuild(): void {
  build.value = defaultBuild(model.value)
  codeNote.value = ''
}

function copyCode(): void {
  const text = buildCode.value
  const clipboard = navigator.clipboard
  if (clipboard?.writeText) {
    clipboard.writeText(text).then(
      () => {
        codeNote.value = 'Copied.'
      },
      () => {
        codeNote.value = 'Copy failed; select the code above by hand.'
      },
    )
    return
  }
  codeNote.value = 'No clipboard here; select the code above by hand.'
}

function loadCode(): void {
  const decoded = decodeBuildCode(codeInput.value, cars)
  if (!decoded) {
    codeNote.value = 'That is not a build code this screen wrote.'
    return
  }
  selectedId.value = decoded.carId
  tierOverrides.value = { ...tierOverrides.value, [decoded.carId]: decoded.tier }
  build.value = decoded.build
  resetMileage()
  codeInput.value = ''
  codeNote.value = 'Build loaded.'
}

/* ---- the instance and the market it is priced in ---- */

/** Both controls clamp to their own range, so a figure typed into the number
 * box can never take the value engine somewhere the slider cannot reach. */
function clampedInput(event: Event, [min, max]: readonly [number, number]): number | null {
  const figure = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(figure)) return null
  return Math.round(Math.min(max, Math.max(min, figure)))
}

function setMileage(event: Event): void {
  const km = clampedInput(event, MILEAGE_RANGE_KM)
  if (km !== null) mileageKm.value = km
}

function setHeat(event: Event): void {
  const percent = clampedInput(event, HEAT_PERCENT_RANGE)
  if (percent !== null) heatPercent.value = percent
}

/** Back to the generator's own midpoint for this car's age. Picking a car
 * lands here too: mileage belongs to the instance, not to the build. */
function resetMileage(): void {
  mileageKm.value = car.value.defaultMileageKm
}

/* ---- formatting ---- */

interface Change {
  text: string
  tone: 'up' | 'down' | 'flat' | 'none'
}

function fixed(value: number, dp: number): string {
  return Number.isFinite(value) ? value.toFixed(dp) : 'no figure'
}

/** Drops decimals a figure does not have, so a whole number never claims a
 * precision the sim did not produce. */
function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

function trimmed(value: number, dp: number): string {
  return Number.isFinite(value) ? trimZeros(value.toFixed(dp)) : 'no figure'
}

interface ChangeOptions {
  /** True where a smaller figure is the quicker one: lap time, drag area, mass. */
  lowerIsBetter?: boolean
  /** Written against the number with no space, so a unit never appears alone. */
  unit?: string
  trim?: boolean
}

/** `up` means the figure moved the way that makes the car quicker or worth
 * more, which is downward on lap time, drag area and mass. */
function change(current: number, stock: number, dp: number, options: ChangeOptions = {}): Change {
  if (!Number.isFinite(current) || !Number.isFinite(stock)) {
    return { text: 'not comparable', tone: 'none' }
  }
  const delta = current - stock
  if (Math.abs(delta) < Math.pow(10, -dp) / 2) return { text: 'no change', tone: 'flat' }
  const sign = delta > 0 ? '+' : '-'
  const size = Math.abs(delta).toFixed(dp)
  const better = options.lowerIsBetter ? delta < 0 : delta > 0
  return {
    text: `${sign}${options.trim ? trimZeros(size) : size}${options.unit ?? ''}`,
    tone: better ? 'up' : 'down',
  }
}

function measured(value: number | null, dp: number, unit: string): string {
  if (value === null || !Number.isFinite(value)) return 'not measured'
  return `${value.toFixed(dp)}${unit}`
}

interface MetricRow {
  key: string
  label: string
  unit: string
  stock: string
  current: string
  change: Change
}

/** The three caps the stat formulas are written against, read from the economy
 * content so a label can never quote a number the formula no longer uses. */
const { powerNormalizationCeiling, styleCap, reliabilityCap } = game.context.economy.statFormulas

const statRows = computed<MetricRow[]>(() => {
  const stock = stockResult.value.stats
  const now = result.value.stats
  const rows = [
    { key: 'power', label: 'Power', unit: 'PS', stock: stock.power, current: now.power },
    {
      key: 'powerScore',
      label: 'Power, normalised',
      unit: `0 to 100, against the ${powerNormalizationCeiling}PS ceiling`,
      stock: stockResult.value.powerScore,
      current: result.value.powerScore,
    },
    {
      key: 'handling',
      label: 'Handling',
      unit: '0 to 100',
      stock: stock.handling,
      current: now.handling,
    },
    {
      key: 'style',
      label: 'Style',
      unit: `0 to 100, condition alone reaches ${styleCap}`,
      stock: stock.style,
      current: now.style,
    },
    {
      key: 'reliability',
      label: 'Reliability',
      unit: `0 to 100, condition alone reaches ${reliabilityCap}`,
      stock: stock.reliability,
      current: now.reliability,
    },
    {
      key: 'authenticity',
      label: 'Authenticity',
      unit: '0 to 100',
      stock: stock.authenticity,
      current: now.authenticity,
    },
  ]
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    unit: row.unit,
    stock: trimmed(row.stock, 1),
    current: trimmed(row.current, 1),
    change: change(row.current, row.stock, 1, { trim: true }),
  }))
})

const physicalRows = computed<MetricRow[]>(() => {
  const s = stockResult.value.physical
  const n = result.value.physical
  const rows = [
    {
      key: 'mechanicalGrip',
      label: 'Mechanical grip',
      unit: 'lateral coefficient',
      dp: 3,
      stock: s.mechanicalGrip,
      current: n.mechanicalGrip,
      lower: false,
    },
    {
      key: 'downforceCoeff',
      label: 'Downforce',
      unit: 'coefficient',
      dp: 3,
      stock: s.downforceCoeff,
      current: n.downforceCoeff,
      lower: false,
    },
    {
      key: 'brakingCoeff',
      label: 'Braking',
      unit: 'coefficient',
      dp: 3,
      stock: s.brakingCoeff,
      current: n.brakingCoeff,
      lower: false,
    },
    {
      key: 'launchAccelMs2',
      label: 'Launch acceleration',
      unit: 'm/s^2',
      dp: 2,
      stock: s.launchAccelMs2,
      current: n.launchAccelMs2,
      lower: false,
    },
    {
      key: 'effectiveWheelPowerW',
      label: 'Effective wheel power',
      unit: 'kW',
      dp: 1,
      stock: s.effectiveWheelPowerW / 1000,
      current: n.effectiveWheelPowerW / 1000,
      lower: false,
    },
    {
      key: 'dragAreaM2',
      label: 'Drag area',
      unit: 'Cd by frontal area, m^2',
      dp: 3,
      stock: s.dragAreaM2,
      current: n.dragAreaM2,
      lower: true,
    },
    {
      key: 'massKg',
      label: 'Mass',
      unit: 'kg, driver included',
      dp: 0,
      stock: s.massKg,
      current: n.massKg,
      lower: true,
    },
  ]
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    unit: row.unit,
    stock: fixed(row.stock, row.dp),
    current: fixed(row.current, row.dp),
    change: change(row.current, row.stock, row.dp, { lowerIsBetter: row.lower }),
  }))
})

const conditionRows = computed<MetricRow[]>(() =>
  (['grip', 'braking', 'driveline', 'aero'] as const).map((dial) => ({
    key: dial,
    label: dial,
    unit: 'share still delivered',
    stock: '1.000',
    current: fixed(result.value.conditionFactors[dial], 3),
    change: change(result.value.conditionFactors[dial], 1, 3),
  })),
)

const measuredCells = computed(() => {
  const m = car.value.measured
  return [
    { key: 'g97', label: 'Lateral g at 97 km/h', value: measured(m.lateralG97, 2, 'g') },
    { key: 'g193', label: 'Lateral g at 193 km/h', value: measured(m.lateralG193, 2, 'g') },
    { key: 'b97', label: 'Braking 97 to 0', value: measured(m.braking97To0M, 1, 'm') },
    { key: 'b161', label: 'Braking 161 to 0', value: measured(m.braking161To0M, 1, 'm') },
    { key: 'z97', label: '0 to 97 km/h', value: measured(m.zeroTo97S, 2, 's') },
    { key: 'z161', label: '0 to 161 km/h', value: measured(m.zeroTo161S, 2, 's') },
    { key: 'top', label: 'Top speed', value: measured(m.topSpeedKmh, 0, 'km/h') },
    { key: 'ps', label: 'Stock power', value: measured(m.stockPowerPs, 0, 'PS') },
    { key: 'kg', label: 'Kerb weight', value: measured(m.curbWeightKg, 0, 'kg') },
    { key: 'fr', label: 'Weight on the front', value: measured(m.weightDistributionFront, 0, '%') },
    { key: 'cd', label: 'Drag coefficient', value: measured(m.dragCd, 2, '') },
    { key: 'src', label: 'Source', value: m.measuredFrom ?? 'not stated' },
  ]
})

const carFacts = computed(() => [
  { key: 'year', label: 'Year', value: String(car.value.year) },
  { key: 'section', label: 'Section', value: car.value.section },
  { key: 'drivetrain', label: 'Drivetrain', value: car.value.drivetrain },
  { key: 'engine', label: 'Engine', value: car.value.enginePosition },
  { key: 'aspiration', label: 'Aspiration', value: car.value.aspiration ?? 'not stated' },
  { key: 'ingame', label: 'In the game', value: car.value.inGame ? 'yes' : 'no, research entry' },
])

/** Where the tier in force came from, and what it does. A number whose
 * provenance is invisible is worse than no number. */
const tierNote = computed(() => {
  const origin = {
    'in-game': 'its real roster tier, read from the game content',
    derived: `derived from the ${car.value.section} section against the 26 in-game cars`,
    assigned: `assigned by judgement: no in-game car sits in the ${car.value.section} section`,
  }[car.value.tierSource]
  const lead =
    tier.value === car.value.defaultTier
      ? `${tier.value} is ${origin}.`
      : `Changed to ${tier.value} from ${car.value.defaultTier}, which was ${origin}.`
  return `${lead} Tier decides nothing about the physics on its own: it selects which of the four shared fitment classes of parts this car can be offered.`
})

const lapRows = computed(() =>
  courses.map((course) => {
    const stock = stockResult.value.laps[course.id] ?? null
    const current = result.value.laps[course.id] ?? null
    return {
      id: course.id,
      label: course.name,
      unit: course.kind === 'standing-km' ? 'standing kilometre' : 'lap',
      stock: stock === null ? 'no time' : `${stock.toFixed(1)}s`,
      current: current === null ? 'cannot run' : `${current.toFixed(1)}s`,
      runnable: current !== null,
      change:
        stock === null || current === null
          ? { text: 'no time to compare', tone: 'none' as const }
          : change(current, stock, 2, { lowerIsBetter: true, unit: 's' }),
      percent:
        stock === null || current === null || stock === 0
          ? ''
          : (() => {
              const p = ((current - stock) / stock) * 100
              return Math.abs(p) < 0.05 ? '' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`
            })(),
    }
  }),
)

const valueDelta = computed(() => {
  const value = result.value.value
  if (value.currentYen === null || value.stockMintYen === null) return null
  return value.currentYen - value.stockMintYen
})

const valueChange = computed<Change>(() => {
  const delta = valueDelta.value
  if (delta === null) return { text: 'not comparable', tone: 'none' }
  if (delta === 0) return { text: 'no change', tone: 'flat' }
  return { text: formatYenDelta(delta), tone: delta > 0 ? 'up' : 'down' }
})

/** How many blockers the sticky summary names before it defers to the full list
 * in the lap card. Set everything to missing and fifteen parts stop the car; a
 * sticky bar that tall stops being a summary. */
const BLOCKED_SUMMARY_LIMIT = 3

/** The parts stopping the car, named, for the one line the sticky summary has
 * room for. */
const blockedSummary = computed(() => {
  const named = result.value.blockers.map((blocker) => `${blocker.displayName} (${blocker.reason})`)
  if (named.length <= BLOCKED_SUMMARY_LIMIT) return named.join(', ')
  const shown = named.slice(0, BLOCKED_SUMMARY_LIMIT).join(', ')
  return `${shown}, and ${named.length - BLOCKED_SUMMARY_LIMIT} more listed below`
})

function slotTone(partId: CarPartId): string {
  const state = stateOf(partId)
  const grade = gradeOf(partId)
  if (blockedPartIds.value.includes(partId)) return 'stops'
  if (state !== 'mint' && grade !== 'stock') return 'both'
  if (state !== 'mint') return 'condition'
  if (grade !== 'stock') return 'grade'
  return 'stock'
}
</script>

<template>
  <section class="sandbox">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Back</RouterLink>
    <p class="demo-banner" data-test="demo-banner">
      Dev tool: nothing here is saved. Every figure is the live sim on this build's own content.
    </p>

    <!-- car picker -->
    <div class="picker">
      <button
        type="button"
        class="picker-head"
        data-test="picker-toggle"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="pk-key">Car</span>
        <span class="pk-name" data-test="car-name">{{ car.displayName }}</span>
        <span class="pk-meta">
          {{ car.year }} / {{ car.section }} / {{ car.drivetrain }} / {{ tier }}
        </span>
        <span class="pk-act">{{ pickerOpen ? 'close' : 'change' }}</span>
      </button>
      <div v-show="pickerOpen" class="picker-body">
        <input
          v-model="search"
          type="search"
          class="search"
          data-test="car-search"
          :placeholder="`Search ${cars.length} cars by name`"
        />
        <div class="picker-list">
          <button
            v-for="entry in filteredCars"
            :key="entry.id"
            type="button"
            class="picker-row"
            :class="{ current: entry.id === car.id }"
            :data-test="`car-pick-${entry.id}`"
            @click="selectCar(entry.id)"
          >
            <span class="row-year">{{ entry.year }}</span>
            <span class="row-name">{{ entry.displayName }}</span>
            <span v-if="!entry.inGame" class="badge">not in the game</span>
            <span class="row-section">{{ entry.section }}</span>
          </button>
          <p v-if="filteredCars.length === 0" class="empty" data-test="no-car-match">
            No car matches that name.
          </p>
        </div>
      </div>
    </div>

    <!-- sticky summary: the four lap times and the value, always in view -->
    <div class="hud" data-test="hud">
      <p class="hud-name">
        <b>{{ car.displayName }}</b>
        <span v-if="!car.inGame" class="badge">not in the game</span>
      </p>
      <div v-if="result.blockers.length > 0" class="hud-blocked" data-test="hud-blocked">
        <span class="hb-key">Cannot be driven</span>
        <span class="hb-text">{{ blockedSummary }}</span>
      </div>
      <div v-else class="hud-laps">
        <div v-for="row in lapRows" :key="row.id" class="hud-cell" :data-test="`hud-lap-${row.id}`">
          <span class="hc-key">{{ row.label }}</span>
          <span class="hc-value">{{ row.current }}</span>
          <span class="hc-change" :class="row.change.tone">{{ row.change.text }}</span>
        </div>
      </div>
      <div class="hud-value" data-test="hud-value">
        <span class="hv-key">Retail</span>
        <template v-if="result.value.currentYen === null">
          <span class="hv-none">not priced: research entry</span>
        </template>
        <template v-else>
          <span class="hv-figure">{{ formatYen(result.value.currentYen) }}</span>
          <span class="hv-change" :class="valueChange.tone">{{ valueChange.text }}</span>
        </template>
      </div>
    </div>

    <!-- the car -->
    <section class="card">
      <h2>Car</h2>
      <div class="facts">
        <div v-for="fact in carFacts" :key="fact.key" class="cell">
          <span class="cell-key">{{ fact.label }}</span>
          <span class="cell-value">{{ fact.value }}</span>
        </div>
      </div>
      <p class="strip-label">Roster tier</p>
      <div class="strip tier">
        <button
          v-for="(entry, index) in TIERS"
          :key="entry"
          type="button"
          class="seg"
          :class="{ on: entry === tier, lit: index < TIERS.indexOf(tier) }"
          :data-test="`tier-${entry}`"
          @click="selectTier(entry)"
        >
          {{ entry }}
        </button>
      </div>
      <p class="note" data-test="tier-note">{{ tierNote }}</p>
    </section>

    <!-- the build -->
    <section class="card">
      <h2>Build</h2>
      <p class="hint">
        All {{ taxonomy.length }} components in taxonomy order. Condition on the top strip, fitted
        tier on the bottom one; a tier is offered only where the catalogue has a part that fits.
        Back to stock and mint restores the car as measured, which leaves forced induction empty on
        a naturally aspirated car.
      </p>

      <div class="set-all">
        <p class="strip-label">Set every component: condition</p>
        <div class="strip act">
          <button
            v-for="state in SLOT_STATES"
            :key="state"
            type="button"
            class="seg"
            :data-test="`set-all-state-${state}`"
            @click="applyState(null, state)"
          >
            {{ state }}
          </button>
        </div>
        <p class="strip-label">Set every component: tier</p>
        <div class="strip act">
          <button
            v-for="grade in GRADES"
            :key="grade"
            type="button"
            class="seg"
            :data-test="`set-all-grade-${grade}`"
            @click="applyGrade(null, grade)"
          >
            {{ grade }}
          </button>
        </div>
        <div class="buttons">
          <button type="button" class="btn" data-test="reset-build" @click="resetBuild">
            Back to stock and mint
          </button>
        </div>
      </div>

      <div v-for="group in groups" :key="group.id" class="group">
        <div class="group-head">
          <p class="group-name">
            {{ group.id }}
            <span class="group-count">{{ group.parts.length }}</span>
          </p>
          <div class="group-set">
            <span class="gs-key">set all</span>
            <div class="strip act mini">
              <button
                v-for="state in SLOT_STATES"
                :key="state"
                type="button"
                class="seg"
                :data-test="`group-state-${group.id}-${state}`"
                @click="applyState(group.id, state)"
              >
                {{ state }}
              </button>
            </div>
            <div class="strip act mini">
              <button
                v-for="grade in GRADES"
                :key="grade"
                type="button"
                class="seg"
                :data-test="`group-grade-${group.id}-${grade}`"
                @click="applyGrade(group.id, grade)"
              >
                {{ grade }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-for="part in group.parts"
          :key="part.id"
          class="component"
          :data-test="`component-${part.id}`"
          :data-tone="slotTone(part.id)"
        >
          <p class="component-name">
            {{ part.displayName }}
            <span v-if="stateOf(part.id) !== 'mint'" class="flag condition">
              {{ stateOf(part.id) }}
            </span>
            <span v-if="gradeOf(part.id) !== 'stock'" class="flag grade">{{
              gradeOf(part.id)
            }}</span>
            <span v-if="blockedPartIds.includes(part.id)" class="flag stops">stops the car</span>
          </p>
          <div class="strip condition" :data-state="stateOf(part.id)">
            <button
              v-for="(state, index) in SLOT_STATES"
              :key="state"
              type="button"
              class="seg"
              :class="{
                on: state === stateOf(part.id),
                lit: index > 0 && index < SLOT_STATES.indexOf(stateOf(part.id)),
              }"
              :aria-pressed="state === stateOf(part.id)"
              :data-test="`slot-state-${part.id}-${state}`"
              @click="setState(part.id, state)"
            >
              {{ state }}
            </button>
          </div>
          <div class="strip grade">
            <button
              v-for="(grade, index) in gradesFor(part.id)"
              :key="grade"
              type="button"
              class="seg"
              :class="{
                on: grade === gradeOf(part.id),
                lit: index < gradesFor(part.id).indexOf(gradeOf(part.id)),
              }"
              :aria-pressed="grade === gradeOf(part.id)"
              :data-test="`slot-grade-${part.id}-${grade}`"
              @click="setGrade(part.id, grade)"
            >
              {{ grade }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- the build code -->
    <section class="card">
      <h2>Build code</h2>
      <p class="hint">
        The whole build in one string: car, tier and all {{ taxonomy.length }} slots. The router
        runs on memory history with no URL coupling, so a build travels as a code rather than a
        link.
      </p>
      <p class="code" data-test="build-code">{{ buildCode }}</p>
      <div class="buttons">
        <button type="button" class="btn" data-test="copy-code" @click="copyCode">Copy</button>
        <input
          v-model="codeInput"
          type="text"
          class="search"
          data-test="code-input"
          placeholder="Paste a build code"
        />
        <button type="button" class="btn" data-test="load-code" @click="loadCode">Load</button>
      </div>
      <p v-if="codeNote" class="note" data-test="code-note">{{ codeNote }}</p>
    </section>

    <!-- results -->
    <section class="card">
      <h2>Lap times</h2>
      <div v-if="result.blockers.length > 0" class="blocked" data-test="lap-blockers">
        <p class="blocked-key">This build cannot be driven</p>
        <ul>
          <li v-for="blocker in result.blockers" :key="blocker.partId">
            <b>{{ blocker.displayName }}</b
            >: {{ blocker.reason }}
          </li>
        </ul>
        <p class="blocked-why">
          These components are function-or-fail in the taxonomy. At scrap, or with nothing fitted,
          the car does not run, so there is no lap time to quote on any course.
        </p>
      </div>
      <div class="scroller">
        <table class="metrics">
          <thead>
            <tr>
              <th>Course</th>
              <th>Stock</th>
              <th>This build</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lapRows" :key="row.id">
              <td class="m">
                {{ row.label }}<small>{{ row.unit }}</small>
              </td>
              <td class="n">{{ row.stock }}</td>
              <td class="n current" :class="{ stop: !row.runnable }" :data-test="`lap-${row.id}`">
                {{ row.current }}
              </td>
              <td class="n">
                <span class="chip" :class="row.change.tone">{{ row.change.text }}</span>
                <span v-if="row.percent" class="percent">{{ row.percent }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- the instance, and the market it is priced in -->
    <section class="card">
      <h2>Mileage and market heat</h2>
      <p class="hint">
        Neither is a property of the car: mileage belongs to this one instance of it, heat to the
        week the market is having. Both reach the retail figure and nothing else, so no lap time and
        no physical figure moves when either of them does.
      </p>
      <div class="control">
        <label class="ctl-key" for="sandbox-mileage">Mileage</label>
        <input
          id="sandbox-mileage"
          class="ctl-slider"
          type="range"
          :min="MILEAGE_RANGE_KM[0]"
          :max="MILEAGE_RANGE_KM[1]"
          step="1000"
          :value="mileageKm"
          data-test="mileage-slider"
          @input="setMileage"
        />
        <input
          class="ctl-number"
          type="number"
          :min="MILEAGE_RANGE_KM[0]"
          :max="MILEAGE_RANGE_KM[1]"
          step="1000"
          :value="mileageKm"
          data-test="mileage-number"
          @input="setMileage"
        />
        <span class="ctl-unit">km</span>
      </div>
      <div class="buttons">
        <button type="button" class="btn" data-test="mileage-default" @click="resetMileage">
          Back to {{ car.defaultMileageKm.toLocaleString('en-US') }}km, the generator's own midpoint
          for a car of this age
        </button>
      </div>
      <div class="control">
        <label class="ctl-key" for="sandbox-heat">Market heat</label>
        <input
          id="sandbox-heat"
          class="ctl-slider"
          type="range"
          :min="HEAT_PERCENT_RANGE[0]"
          :max="HEAT_PERCENT_RANGE[1]"
          step="1"
          :value="heatPercent"
          data-test="heat-slider"
          @input="setHeat"
        />
        <input
          class="ctl-number"
          type="number"
          :min="HEAT_PERCENT_RANGE[0]"
          :max="HEAT_PERCENT_RANGE[1]"
          step="1"
          :value="heatPercent"
          data-test="heat-number"
          @input="setHeat"
        />
        <span class="ctl-unit">per cent, {{ DEFAULT_HEAT_PERCENT }} is a neutral market</span>
      </div>
    </section>

    <section class="card">
      <h2>Value</h2>
      <p v-if="result.value.currentYen === null" class="not-priced" data-test="value-not-priced">
        This is a research entry, not a car the game sells. It has no book value in the content, so
        there is no retail figure to quote, and putting one on it would be inventing an economy
        number. The 26 in-game cars are priced; the other 59 are not.
      </p>
      <template v-else>
        <div class="facts" data-test="value-figures">
          <div class="cell">
            <span class="cell-key">Stock and mint retail</span>
            <span class="cell-value big" data-test="value-stock">{{
              formatYen(result.value.stockMintYen ?? 0)
            }}</span>
          </div>
          <div class="cell">
            <span class="cell-key">This build, retail</span>
            <span class="cell-value big current" data-test="value-current">{{
              formatYen(result.value.currentYen)
            }}</span>
          </div>
          <div class="cell">
            <span class="cell-key">What the build is worth</span>
            <span class="cell-value big" :class="valueChange.tone">{{ valueChange.text }}</span>
          </div>
        </div>
        <p class="note" data-test="value-note">
          Full retail for the car, not a buyer's taste-adjusted offer, at market heat
          {{ heatPercent }} and {{ mileageKm.toLocaleString('en-US') }}km on the clock. Condition
          and fitted parts move this figure; how fast the car is does not.
        </p>
      </template>
    </section>

    <section class="card">
      <h2>Roll-up stats</h2>
      <div class="scroller">
        <table class="metrics" data-test="stats-table">
          <thead>
            <tr>
              <th>Figure</th>
              <th>Stock</th>
              <th>This build</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in statRows" :key="row.key">
              <td class="m">
                {{ row.label }}<small v-if="row.unit">{{ row.unit }}</small>
              </td>
              <td class="n">{{ row.stock }}</td>
              <td class="n current" :data-test="`stat-${row.key}`">{{ row.current }}</td>
              <td class="n">
                <span class="chip" :class="row.change.tone">{{ row.change.text }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Physical figures</h2>
      <div class="scroller">
        <table class="metrics">
          <thead>
            <tr>
              <th>Figure</th>
              <th>Stock</th>
              <th>This build</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in physicalRows" :key="row.key">
              <td class="m">
                {{ row.label }}<small>{{ row.unit }}</small>
              </td>
              <td class="n">{{ row.stock }}</td>
              <td class="n current" :data-test="`physical-${row.key}`">{{ row.current }}</td>
              <td class="n">
                <span class="chip" :class="row.change.tone">{{ row.change.text }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">
        Green means the figure moved the way that makes the car quicker: upward on grip, braking,
        launch and power, downward on drag area and mass.
      </p>
    </section>

    <section class="card">
      <h2>Condition factors</h2>
      <div class="scroller">
        <table class="metrics">
          <thead>
            <tr>
              <th>Dial</th>
              <th>Stock</th>
              <th>This build</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in conditionRows" :key="row.key">
              <td class="m">
                {{ row.label }}<small>{{ row.unit }}</small>
              </td>
              <td class="n">{{ row.stock }}</td>
              <td class="n current" :data-test="`condition-${row.key}`">{{ row.current }}</td>
              <td class="n">
                <span class="chip" :class="row.change.tone">{{ row.change.text }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Measured inputs</h2>
      <p class="hint">
        Read-only. What the spec book measured, so what is measurement and what is derived is always
        visible.
      </p>
      <div class="facts">
        <div v-for="cell in measuredCells" :key="cell.key" class="cell">
          <span class="cell-key">{{ cell.label }}</span>
          <span class="cell-value" :class="{ absent: cell.value === 'not measured' }">
            {{ cell.value }}
          </span>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.sandbox {
  padding-bottom: var(--mg-space-5);
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.demo-banner {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-3);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

/* car picker */
.picker {
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-panel);
  margin-bottom: var(--mg-space-2);
}

.picker-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--mg-space-2);
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  color: var(--mg-text);
  font-family: inherit;
  padding: var(--mg-space-2) var(--mg-space-3);
}

.pk-key,
.pk-act {
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
}

.pk-act {
  margin-left: auto;
  color: var(--mg-neon-cyan);
}

.pk-name {
  font-size: var(--mg-fs-md);
  font-weight: 700;
}

.pk-meta {
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
  flex: 1 1 100%;
}

.picker-body {
  border-top: var(--mg-border);
  padding: var(--mg-space-2);
}

.search {
  width: 100%;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  color: var(--mg-text);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-2);
}

.picker-list {
  max-height: 40vh;
  overflow-y: auto;
  display: grid;
  gap: 2px;
  margin-top: var(--mg-space-2);
}

.picker-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  width: 100%;
  text-align: left;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  color: var(--mg-text);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
}

.picker-row.current {
  border-color: var(--mg-neon-cyan);
}

.row-year {
  color: var(--mg-text-dim);
  font-size: 0.7rem;
}

.row-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-section {
  color: var(--mg-text-dim);
  font-size: 0.65rem;
  white-space: nowrap;
}

.badge {
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mg-neon-violet);
  border: 1px solid var(--mg-neon-violet);
  border-radius: 4px;
  padding: 0 var(--mg-space-1);
  white-space: nowrap;
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* sticky summary */
.hud {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--mg-night);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
  margin-bottom: var(--mg-space-3);
}

.hud-name {
  margin: 0 0 var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
  display: flex;
  gap: var(--mg-space-2);
  align-items: center;
}

.hud-name b {
  color: var(--mg-text);
}

.hud-laps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--mg-space-1);
}

.hud-cell {
  display: grid;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1);
  min-width: 0;
}

.hc-key {
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hc-value {
  font-size: var(--mg-fs-md);
  color: var(--mg-neon-cyan);
}

.hc-change {
  font-size: 0.65rem;
  color: var(--mg-text-dim);
}

.hud-blocked {
  display: grid;
  gap: 2px;
  background: var(--mg-night-deep);
  border: 1px solid var(--mg-danger);
  border-radius: 4px;
  padding: var(--mg-space-2);
}

.hb-key {
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mg-danger);
}

.hb-text {
  font-size: var(--mg-fs-sm);
}

.hud-value {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1) var(--mg-space-2);
  margin-top: var(--mg-space-1);
}

.hv-key {
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
}

.hv-figure {
  color: var(--mg-yen);
  margin-left: auto;
}

.hv-none {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  margin-left: auto;
}

.hv-change,
.hc-change {
  font-size: 0.7rem;
}

.up {
  color: var(--mg-success);
}

.down {
  color: var(--mg-danger);
}

.flat,
.none {
  color: var(--mg-text-dim);
}

/* cards */
.card {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.card h2 {
  margin: 0 0 var(--mg-space-2);
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mg-neon-violet);
}

.hint,
.note {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-2);
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--mg-space-1);
}

.cell {
  display: grid;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-1) var(--mg-space-2);
  min-width: 0;
}

.cell-key {
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
}

.cell-value {
  font-size: var(--mg-fs-sm);
  word-break: break-word;
}

.cell-value.big {
  font-size: var(--mg-fs-md);
  color: var(--mg-yen);
}

.cell-value.absent {
  color: var(--mg-text-dim);
}

/* the two-axis strips */
.strip-label {
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
  margin: var(--mg-space-2) 0 var(--mg-space-1);
}

.strip {
  display: flex;
  gap: 2px;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px;
}

.seg {
  flex: 1 1 0;
  min-width: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--mg-text-dim);
  font-family: inherit;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: var(--mg-space-1) 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strip.mini .seg {
  font-size: 0.5rem;
}

/* A condition strip reads as a gauge: every segment up to the fitted band is
   lit in that band's own colour, so the length and the hue both say what state
   the component is in. */
.strip.condition .seg.lit,
.strip.condition .seg.on {
  color: var(--mg-night-deep);
}

.strip.condition[data-state='missing'] .seg.on {
  color: var(--mg-danger);
  border-color: var(--mg-danger);
}

.strip.condition[data-state='scrap'] .seg.on {
  background: var(--mg-danger);
}

.strip.condition[data-state='poor'] .seg.on {
  background: var(--mg-neon-violet);
}

.strip.condition[data-state='worn'] .seg.on {
  background: var(--mg-yen);
}

.strip.condition[data-state='fine'] .seg.on {
  background: var(--mg-neon-cyan);
}

.strip.condition[data-state='mint'] .seg.on {
  background: var(--mg-success);
}

.strip.condition[data-state='poor'] .seg.lit,
.strip.condition[data-state='worn'] .seg.lit,
.strip.condition[data-state='fine'] .seg.lit,
.strip.condition[data-state='mint'] .seg.lit {
  background: var(--mg-panel-edge);
  color: var(--mg-text);
}

.strip.grade .seg.on,
.strip.tier .seg.on {
  background: var(--mg-neon-pink);
  color: var(--mg-night-deep);
}

.strip.grade .seg.lit,
.strip.tier .seg.lit {
  background: var(--mg-panel-edge);
  color: var(--mg-text);
}

.strip.act .seg:hover {
  background: var(--mg-panel-edge);
  color: var(--mg-text);
}

.set-all {
  border: 1px dashed var(--mg-panel-edge);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
  margin-top: var(--mg-space-2);
}

.btn {
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  color: var(--mg-text);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  padding: var(--mg-space-1) var(--mg-space-2);
}

.buttons .search {
  flex: 1 1 160px;
  width: auto;
}

/* mileage and heat: a slider and the figure it is showing */
.control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
}

.ctl-key {
  flex: 0 0 90px;
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
}

.ctl-slider {
  flex: 1 1 180px;
  min-width: 120px;
  accent-color: var(--mg-neon-cyan);
}

.ctl-number {
  width: 9ch;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  color: var(--mg-text);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  text-align: right;
  padding: var(--mg-space-1);
}

.ctl-unit {
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

/* component groups */
.group {
  margin-top: var(--mg-space-3);
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.group-head {
  display: grid;
  gap: var(--mg-space-1);
  margin-bottom: var(--mg-space-2);
}

.group-name {
  margin: 0;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mg-neon-cyan);
}

.group-count {
  color: var(--mg-text-dim);
  letter-spacing: 0.04em;
}

.group-set {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
}

.gs-key {
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
}

.group-set .strip {
  flex: 1 1 0;
}

.component {
  display: grid;
  gap: 2px;
  border-left: 3px solid transparent;
  padding: var(--mg-space-1) var(--mg-space-2);
  margin-bottom: var(--mg-space-1);
  border-radius: 4px;
}

.component[data-tone='condition'] {
  border-left-color: var(--mg-yen);
}

.component[data-tone='grade'] {
  border-left-color: var(--mg-neon-pink);
}

.component[data-tone='both'] {
  border-left-color: var(--mg-neon-violet);
}

.component[data-tone='stops'] {
  border-left-color: var(--mg-danger);
  background: rgb(255 107 107 / 8%);
}

.component-name {
  margin: 0;
  font-size: var(--mg-fs-sm);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mg-space-1);
}

.flag {
  font-size: 0.55rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid var(--mg-panel-edge);
  border-radius: 3px;
  padding: 0 var(--mg-space-1);
}

.flag.condition {
  color: var(--mg-yen);
}

.flag.grade {
  color: var(--mg-neon-pink);
}

.flag.stops {
  color: var(--mg-danger);
  border-color: var(--mg-danger);
}

@media (min-width: 760px) {
  .component {
    grid-template-columns: minmax(140px, 1fr) 270px 190px;
    align-items: center;
    gap: var(--mg-space-2);
  }

  .group-head {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}

/* result tables */
.scroller {
  overflow-x: auto;
}

.metrics {
  border-collapse: collapse;
  width: 100%;
  min-width: 320px;
  font-size: var(--mg-fs-sm);
}

.metrics th {
  text-align: right;
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
  border-bottom: var(--mg-border);
  padding: 0 var(--mg-space-1) var(--mg-space-1);
  white-space: nowrap;
}

.metrics th:first-child {
  text-align: left;
}

.metrics td {
  padding: var(--mg-space-1);
  border-bottom: 1px solid rgb(255 255 255 / 5%);
}

.metrics td.m small {
  display: block;
  font-size: 0.55rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mg-text-dim);
}

.metrics td.n {
  text-align: right;
  color: var(--mg-text-dim);
  white-space: nowrap;
}

.metrics td.n.current {
  color: var(--mg-text);
}

.metrics td.n.stop {
  color: var(--mg-danger);
}

.chip {
  font-size: 0.65rem;
}

.percent {
  font-size: 0.55rem;
  color: var(--mg-text-dim);
  margin-left: var(--mg-space-1);
}

.blocked {
  border: 1px solid var(--mg-danger);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
}

.blocked-key {
  margin: 0;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mg-danger);
}

.blocked ul {
  margin: var(--mg-space-1) 0 0;
  padding-left: var(--mg-space-4);
  font-size: var(--mg-fs-sm);
}

.blocked-why {
  margin: var(--mg-space-2) 0 0;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.not-priced {
  margin: 0;
  border: 1px solid var(--mg-neon-violet);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2);
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
}

.code {
  margin: 0;
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  word-break: break-all;
  user-select: all;
}
</style>
