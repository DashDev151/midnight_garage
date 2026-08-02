<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import { useGameStore } from '../stores/gameStore'
import { DYNO_NAME } from '../utils/dynoLabels'

/**
 * The rolling road's readout. Pure renderer over `game.dynoSheet`: every
 * figure on this screen is the sim's own, and nothing here computes,
 * interprets or adjusts one. A session measures and changes nothing, so this
 * screen has no control that writes anything to the car.
 *
 * The plainest treatment that obeys the diegetic-UI law: a printed strip off
 * the shop's own machine, read top to bottom, no gauges and no dashboard. The
 * pixel-art rolling road itself is an outstanding art dependency, recorded in
 * the sprint doc.
 */
const game = useGameStore()

const sheet = computed(() => game.dynoSheet)

/** A support ratio in the two decimals the model is meaningful to. */
function formatRatio(ratio: number): string {
  return ratio.toFixed(2)
}

/** Specific output to one decimal - a tenth of a PS per litre is as fine as
 * this comparison ever needs to be. */
function formatSpecificOutput(psPerLitre: number): string {
  return psPerLitre.toFixed(1)
}

/** Capacity in litres, the way anyone in a workshop says it. */
function formatLitres(cc: number): string {
  return `${(cc / 1000).toFixed(1)} litres`
}

/** A power figure signed, so a build that lost power reads as one. */
function formatPowerDelta(deltaPs: number): string {
  return `${deltaPs >= 0 ? '+' : ''}${deltaPs} PS`
}
</script>

<template>
  <section class="dyno">
    <RouterLink
      v-if="sheet"
      :to="{ name: 'car', params: { id: sheet.carId } }"
      class="back"
      data-test="dyno-back"
      >&lt; Back to the car</RouterLink
    >
    <RouterLink v-else :to="{ name: 'garage' }" class="back" data-test="dyno-back"
      >&lt; Garage</RouterLink
    >

    <header class="head">
      <h2>
        {{ DYNO_NAME }}
        <HelpHint label="Rolling road">
          The rollers tell you what you have built. They change nothing: a build that asks more of
          the engine than the engine can give was already costing you, dyno or no dyno. What you buy
          here is the numbers behind that.
        </HelpHint>
      </h2>
      <p v-if="sheet" class="car-name" data-test="dyno-car-name">{{ sheet.displayName }}</p>
    </header>

    <p v-if="!sheet" class="empty" data-test="dyno-empty">
      Nothing on the rollers. Bring a car into a service bay and put it on from its own page.
    </p>

    <template v-else>
      <section class="panel" data-test="dyno-character">
        <h3>How it responds</h3>
        <p class="headline" data-test="dyno-character-label">{{ sheet.engineCharacterLabel }}</p>
        <p class="note">{{ sheet.engineCharacterNote }}</p>
        <p
          v-if="sheet.specificOutputPsPerLitre !== null"
          class="figure"
          data-test="dyno-specific-output"
        >
          {{ formatSpecificOutput(sheet.specificOutputPsPerLitre) }} PS per litre, standard.
        </p>
        <p
          v-if="sheet.rotaryEquivalent && sheet.displacementCc && sheet.effectiveDisplacementCc"
          class="note"
          data-test="dyno-rotary-note"
        >
          Measured against {{ formatLitres(sheet.effectiveDisplacementCc) }} equivalent, not the
          {{ formatLitres(sheet.displacementCc) }} on the paperwork. A rotary is scaled that way so
          the figure means the same thing as a piston engine's.
        </p>
      </section>

      <section class="panel" data-test="dyno-power">
        <h3>What it makes</h3>
        <p class="headline" data-test="dyno-power-measured">{{ sheet.powerPs }} PS</p>
        <p class="figure">
          Left the factory with {{ sheet.stockPowerPs }} PS.
          <span data-test="dyno-power-delta">{{ formatPowerDelta(sheet.powerDeltaPs) }}</span>
        </p>
      </section>

      <section class="panel" data-test="dyno-support">
        <h3>What holds it together</h3>
        <p class="figure">
          Each figure is what that part of the car can give against what the build asks of it. One
          means it keeps up.
        </p>
        <ul class="ratios">
          <li
            v-for="row in sheet.rows"
            :key="row.subsystem"
            class="ratio-row"
            :class="{ weakest: row.weakest }"
            :data-test="'dyno-ratio-' + row.subsystem"
          >
            <span class="ratio-name">{{ row.label }}</span>
            <span class="ratio-meaning">{{ row.meaning }}</span>
            <span class="ratio-value" :data-test="'dyno-ratio-value-' + row.subsystem">{{
              formatRatio(row.ratio)
            }}</span>
            <span v-if="row.weakest" class="ratio-flag" data-test="dyno-weakest-flag"
              >weakest link</span
            >
          </li>
        </ul>
        <p class="headline" :class="sheet.band" data-test="dyno-band">
          {{ sheet.headlineBandLabel }} ({{ formatRatio(sheet.headlineRatio) }})
        </p>
        <p v-if="sheet.shortfallCopy" class="note" data-test="dyno-shortfall">
          {{ sheet.shortfallCopy }}
        </p>
        <p v-else class="note" data-test="dyno-shortfall-none">
          Nothing is being asked for more than it can give.
        </p>
      </section>

      <section class="panel" data-test="dyno-reliability">
        <h3>What it is carrying</h3>
        <p class="headline" data-test="dyno-reliability-value">
          {{ sheet.reliability }} out of {{ sheet.reliabilityBase }}
        </p>
        <p class="figure">
          {{ sheet.reliabilityBase }} is the best this car is ever going to be. Where the rest of it
          went:
        </p>
        <ul class="splits">
          <li data-test="dyno-cost-condition">
            <span class="split-name">Wear</span>
            <span class="split-value">{{ sheet.conditionCostPoints }}</span>
          </li>
          <li data-test="dyno-cost-coherence">
            <span class="split-name">The build not adding up</span>
            <span class="split-value">{{ sheet.coherenceCostPoints }}</span>
          </li>
          <li data-test="dyno-cost-power">
            <span class="split-name">The power itself</span>
            <span class="split-value">{{ sheet.powerCostPoints }}</span>
          </li>
        </ul>
        <p class="note">
          Wear you can fix with parts and hours. The build not adding up you fix by buying what the
          rest of it needs. The power itself is simply what more power costs, and every engine pays
          it.
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.dyno {
  max-width: 640px;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.head {
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h2 {
  display: flex;
  align-items: center;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.car-name {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.headline {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-md);
}

.headline.strained {
  color: var(--mg-yen);
}

.headline.dangerous {
  color: var(--mg-danger);
}

.figure,
.note {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.ratios,
.splits {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--mg-space-2);
  display: grid;
  gap: var(--mg-space-1);
}

.ratio-row {
  display: grid;
  /* The value column is fixed so every figure lines up down the strip, the
     way a printed sheet's would. */
  grid-template-columns: 1fr auto 4.5em;
  align-items: baseline;
  gap: var(--mg-space-2);
  font-size: var(--mg-fs-sm);
  border-top: var(--mg-border);
  padding-top: var(--mg-space-1);
}

.ratio-row.weakest {
  color: var(--mg-neon-cyan);
}

.ratio-name {
  color: inherit;
}

.ratio-meaning {
  color: var(--mg-text-dim);
  font-size: 0.9em;
}

.ratio-value {
  text-align: right;
  color: var(--mg-yen);
}

.ratio-flag {
  grid-column: 1 / -1;
  color: var(--mg-neon-cyan);
  font-size: 0.85em;
}

.splits li {
  display: flex;
  justify-content: space-between;
  font-size: var(--mg-fs-sm);
  border-top: var(--mg-border);
  padding-top: var(--mg-space-1);
}

.split-name {
  color: var(--mg-text-dim);
}

.split-value {
  color: var(--mg-yen);
}
</style>
