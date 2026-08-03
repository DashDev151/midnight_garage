<script setup lang="ts">
import { CARS, PAINT_ALIASES, PAINT_COLOURS } from '@midnight-garage/content'
import type { PaintColour } from '@midnight-garage/content'
import { Application, type Container } from 'pixi.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { OUTLINE } from '../pixi/carSprite'
import {
  PREVIEW_BACKGROUND,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  buildPaintPreview,
} from '../pixi/paintPreview'
import { PAINT_FINISHES, rampFor, type PaintFinish, type Ramp } from '../pixi/paintRamp'
import PaintCarPreview from './dev/PaintCarPreview.vue'
import { PAINT_FAMILIES } from './dev/paintFamilies'
import { FACTORY_COLOURS_BASIS_LEGEND, ROSTER_CARS } from './dev/paintRosterCars'

const selectedId = ref('red')
const finish = ref<PaintFinish>('metallic')

const selected = computed(() => PAINT_COLOURS.find((c) => c.id === selectedId.value))

const ramp = computed(() => {
  const colour = selected.value
  if (!colour) return null
  return rampFor(colour.hex, finish.value)
})

/** The four tones the body template indexes, in ramp order. The outline is the
 * drawing's own and no paint colour swaps it. */
const tones = computed(() => {
  const current = ramp.value
  if (!current) return []
  return [
    { role: 'outline', hex: OUTLINE },
    { role: 'shade', hex: current.shade },
    { role: 'base', hex: current.base },
    { role: 'highlight', hex: current.highlight },
  ]
})

/** The 34-colour swatch grid, grouped by family for browsing the whole
 * palette independent of any one car. */
const paletteFamilies = computed(() =>
  PAINT_FAMILIES.map((family) => ({
    label: family.label,
    colours: family.ids
      .map((id) => PAINT_COLOURS.find((c) => c.id === id))
      .filter((c): c is PaintColour => c !== undefined),
  })),
)

const host = ref<HTMLDivElement | null>(null)
let app: Application | null = null
let scene: Container | null = null

function redraw(): void {
  const current = ramp.value
  if (!app || !current) return
  scene?.destroy({ children: true, texture: true })
  scene = buildPaintPreview(current)
  app.stage.addChild(scene)
}

onMounted(async () => {
  app = new Application()
  await app.init({
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    background: PREVIEW_BACKGROUND,
    antialias: false,
  })
  host.value?.appendChild(app.canvas)
  redraw()
})

watch(ramp, redraw)

onUnmounted(() => {
  app?.destroy(true, { children: true, texture: true })
  app = null
  scene = null
})

/**
 * The car pool selector: every one of the 94 roster cars, not only the 26
 * shipped in `cars.json`, because the point of this section is reviewing the
 * authoring before more of the roster ships.
 */
const SHIPPED_IDS = new Set(CARS.map((car) => car.id))

const selectedRosterNo = ref(ROSTER_CARS[0]?.rosterNo ?? 1)
const focusedIndex = ref(0)

const selectedCar = computed(() =>
  ROSTER_CARS.find((car) => car.rosterNo === selectedRosterNo.value),
)

const isShipped = computed(() => {
  const car = selectedCar.value
  return car !== undefined && car.id !== '' && SHIPPED_IDS.has(car.id)
})

const basisLegend = computed(() => {
  const car = selectedCar.value
  return car ? (FACTORY_COLOURS_BASIS_LEGEND[car.basis] ?? '') : ''
})

interface PoolEntry {
  token: string
  /** The ramp of the rendered colour: the whole tone for a solid entry, the
   * first half for a two-tone. Real two-tone rendering is not attempted here. */
  ramp: Ramp
  isTwoTone: boolean
  /** The alias parody name where one applies to this entry, the palette name
   * otherwise. */
  headline: string
  /** The alias's real name, set only when an alias applies. */
  realName?: string
  /** Names both halves of a factory two-tone; set only for a two-tone entry. */
  twoToneNote?: string
}

/**
 * One pool cell, resolved to what the review screen renders. An alias applies
 * when its `colourId` matches this entry WHOLE, two-tone form included, and
 * its `cars` list includes the car's roster number. Matching the first half
 * alone would put the panda scheme's name on a plain white AE86.
 */
function buildPoolEntry(
  token: string,
  rosterNo: number,
  finishValue: PaintFinish,
): PoolEntry | undefined {
  const [primaryId, secondaryId] = token.split('+')
  const colour = primaryId ? PAINT_COLOURS.find((c) => c.id === primaryId) : undefined
  if (!colour) return undefined
  const alias = PAINT_ALIASES.find((a) => a.colourId === token && a.cars.includes(rosterNo))
  const secondaryColour = secondaryId ? PAINT_COLOURS.find((c) => c.id === secondaryId) : undefined
  return {
    token,
    ramp: rampFor(colour.hex, finishValue),
    isTwoTone: secondaryId !== undefined,
    headline: alias ? alias.parodyName : colour.name,
    realName: alias?.realName,
    twoToneNote: secondaryId
      ? `Factory two-tone: ${colour.name} and ${secondaryColour?.name ?? secondaryId}`
      : undefined,
  }
}

const poolEntries = computed<PoolEntry[]>(() => {
  const car = selectedCar.value
  if (!car) return []
  return car.pool
    .map((token) => buildPoolEntry(token, car.rosterNo, finish.value))
    .filter((entry): entry is PoolEntry => entry !== undefined)
})

const focusedEntry = computed(() => poolEntries.value[focusedIndex.value])

watch(selectedRosterNo, () => {
  focusedIndex.value = 0
})
</script>

<template>
  <section class="paint">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Back</RouterLink>

    <div ref="host" class="stage"></div>

    <div class="finish">
      <button
        v-for="option in PAINT_FINISHES"
        :key="option"
        type="button"
        :class="{ active: option === finish }"
        :data-test="'finish-' + option"
        @click="finish = option"
      >
        {{ option }}
      </button>
    </div>

    <div v-if="selected && ramp" class="readout">
      <p class="name">
        {{ selected.name }}
        <span class="id">{{ selected.id }}</span>
        <span class="id">{{ finish }}</span>
      </p>
      <p class="shade">{{ selected.shade }}</p>
      <div class="tones">
        <div v-for="tone in tones" :key="tone.role" class="tone">
          <span class="chip" :style="{ background: tone.hex }"></span>
          <span class="tone-role">{{ tone.role }}</span>
          <span class="tone-hex">{{ tone.hex }}</span>
        </div>
      </div>
    </div>

    <section class="car-pools">
      <h2>Car pools</h2>
      <label class="car-picker">
        Car
        <select v-model.number="selectedRosterNo" data-test="car-select">
          <option v-for="car in ROSTER_CARS" :key="car.rosterNo" :value="car.rosterNo">
            {{ car.rosterNo }} - {{ car.displayName }}
          </option>
        </select>
      </label>

      <div v-if="selectedCar" class="car-summary">
        <p class="car-name">
          {{ selectedCar.displayName }}
          <span v-if="isShipped" class="shipped-marker" data-test="shipped-marker">
            In cars.json
          </span>
        </p>
        <p class="basis">
          <span class="basis-value">{{ selectedCar.basis }}</span>
          {{ basisLegend }}
        </p>

        <div v-if="focusedEntry" class="hero">
          <PaintCarPreview :ramp="focusedEntry.ramp" :zoom="6" />
          <div class="hero-caption">
            <p class="pool-headline">{{ focusedEntry.headline }}</p>
            <p v-if="focusedEntry.realName" class="pool-real-name">
              {{ focusedEntry.realName }} (real name, behind the naming layer)
            </p>
            <p v-if="focusedEntry.twoToneNote" class="pool-two-tone">
              {{ focusedEntry.twoToneNote }}
            </p>
          </div>
        </div>

        <div class="pool-grid">
          <button
            v-for="(entry, index) in poolEntries"
            :key="entry.token + '-' + index"
            type="button"
            class="pool-entry"
            :class="{ active: index === focusedIndex }"
            :data-test="'pool-entry-' + index"
            @click="focusedIndex = index"
          >
            <PaintCarPreview :ramp="entry.ramp" :zoom="2" />
            <span class="pool-caption">{{ entry.headline }}</span>
          </button>
        </div>
      </div>
    </section>

    <div v-for="family in paletteFamilies" :key="family.label" class="family">
      <h3>{{ family.label }}</h3>
      <div class="swatches">
        <button
          v-for="colour in family.colours"
          :key="colour.id"
          type="button"
          class="swatch"
          :class="{ active: colour.id === selectedId }"
          :data-test="'colour-' + colour.id"
          @click="selectedId = colour.id"
        >
          <span class="chip" :style="{ background: colour.hex }"></span>
          <span class="swatch-name">{{ colour.name }}</span>
        </button>
      </div>
    </div>

    <p class="provenance">
      Dev screen: it reviews content, it is not itself content. The 34 colours and the 37 iconic
      aliases are @midnight-garage/content data now; every base hex is still an approximation read
      off the consolidated research's written shade brief
      (docs/design/reference/colour-palette-consolidated.md), because deriving a true value is art
      direction work nobody has done yet, and the three tones are derived from it by one rule per
      finish. The per-car pools and their basis come straight from the roster CSV, all 94 rows, not
      only the 26 that ship in cars.json. The two shifting purples are multi-layer pearls and a flat
      ramp can only approximate them.
    </p>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.stage {
  display: flex;
  justify-content: center;
  margin: var(--mg-space-3) 0;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  overflow-x: auto;
}

.stage :deep(canvas) {
  image-rendering: pixelated;
}

.finish {
  display: flex;
  justify-content: center;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-3);
}

.finish button {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-4);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.finish button.active {
  color: var(--mg-night-deep);
  background: var(--mg-neon-violet);
  border-color: var(--mg-neon-violet);
}

.readout {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

.name {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-violet);
}

.name .id {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin-left: var(--mg-space-2);
}

.shade {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-family: var(--mg-font-reading);
  font-size: var(--mg-fs-sm);
}

.tones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-3);
}

.tone {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.tone-hex {
  color: var(--mg-text);
}

.chip {
  display: inline-block;
  width: 22px;
  height: 22px;
  border: 1px solid var(--mg-panel-edge);
  flex: none;
}

.car-pools {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-4);
}

.car-pools h2 {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-weight: normal;
}

.car-picker {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin-bottom: var(--mg-space-3);
}

.car-picker select {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  max-width: 100%;
}

.car-name {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-neon-violet);
}

.shipped-marker {
  display: inline-block;
  margin-left: var(--mg-space-2);
  padding: 0 var(--mg-space-1);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  vertical-align: middle;
}

.basis {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-family: var(--mg-font-reading);
  font-size: var(--mg-fs-sm);
}

.basis-value {
  color: var(--mg-text);
  font-family: inherit;
  margin-right: var(--mg-space-1);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mg-space-2);
  margin-bottom: var(--mg-space-3);
}

.hero :deep(canvas) {
  border: var(--mg-border);
  border-radius: var(--mg-radius);
}

.hero-caption {
  font-family: var(--mg-font-reading);
}

.pool-headline {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text);
}

.pool-real-name {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

.pool-two-tone {
  margin: 0;
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
}

.pool-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
}

.pool-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-1);
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1);
  font-family: inherit;
}

.pool-entry.active {
  border-color: var(--mg-neon-violet);
}

.pool-entry :deep(canvas) {
  display: block;
}

.pool-caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  max-width: 192px;
  text-align: center;
}

.family h3 {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  font-weight: normal;
}

.family {
  margin-bottom: var(--mg-space-3);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
}

.swatch {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.swatch.active {
  color: var(--mg-text);
  border-color: var(--mg-neon-violet);
}

.provenance {
  color: var(--mg-text-dim);
  font-family: var(--mg-font-reading);
  font-size: var(--mg-fs-sm);
  border-top: var(--mg-border);
  padding-top: var(--mg-space-3);
}
</style>
