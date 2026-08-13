<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import { mapBackTarget } from './mapBack'
import { useGameStore } from '../stores/gameStore'

/**
 * The shop's own cost sheets, one carbon copy per week, newest clipped on
 * top. Progression bible law 4's second pull-not-push exception: it opens
 * only when the player opens it, renders on no gameplay screen, follows
 * nobody around, and carries no percentage - real yen against real named
 * days. Pure renderer over `game.costSheetView`, which is itself a pure
 * derivation over the sim's own accumulator; nothing here totals anything.
 */
const game = useGameStore()
const route = useRoute()

/** The tab bar reaches this screen too, with no `from` flag - the back
 * control then falls back to the garage exactly as it always has
 * (`mapBack.ts`). */
const backTarget = computed(() => mapBackTarget(route.query.from, { name: 'garage' }))

const weeks = computed(() => game.costSheetView.weeks)
</script>

<template>
  <section class="costs">
    <RouterLink :to="backTarget" class="back">&lt; Back</RouterLink>
    <h2>What the week cost</h2>
    <p class="lead">
      The shop's own sheets, a week to a page. Rent, wages and machine hire keep the doors open;
      they belong to no car, so they are written here and nowhere else.
    </p>

    <p v-if="weeks.length === 0" class="empty" data-test="cost-sheet-empty">
      Nothing has been through the till yet. There will be a sheet here the first week money moves.
    </p>

    <ol v-else class="sheets">
      <li
        v-for="week in weeks"
        :key="week.weekNumber"
        class="sheet"
        :data-test="'cost-sheet-week-' + week.weekNumber"
      >
        <div class="clip" aria-hidden="true"></div>
        <header class="sheet-head">
          <h3>Week {{ week.weekNumber }}</h3>
          <p class="days">
            Days {{ week.firstDay }} to {{ week.lastDay }}
            <span v-if="week.open" class="open" data-test="week-open">- still running</span>
          </p>
        </header>

        <dl class="rows">
          <div class="row">
            <dt>Money in</dt>
            <dd data-test="row-income">{{ formatYen(week.incomeYen) }}</dd>
          </div>
          <div class="row">
            <dt>On cars</dt>
            <dd data-test="row-on-cars">{{ formatYen(week.onCarsYen) }}</dd>
          </div>
          <div class="row">
            <dt>Parts on the shelf</dt>
            <dd data-test="row-stock">{{ formatYen(week.stockYen) }}</dd>
          </div>
          <div class="row">
            <dt>Running the shop</dt>
            <dd data-test="row-running">{{ formatYen(week.runningYen) }}</dd>
          </div>
          <div class="row">
            <dt>Into the shop</dt>
            <dd data-test="row-investment">{{ formatYen(week.investmentYen) }}</dd>
          </div>
          <div class="row net">
            <dt>{{ week.open ? 'So far' : 'Left over' }}</dt>
            <dd :class="{ down: week.netYen < 0 }" data-test="row-net">
              {{ formatYenDelta(week.netYen) }}
            </dd>
          </div>
        </dl>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.costs {
  max-width: 640px;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-2);
}

.lead,
.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin: 0 0 var(--mg-space-4);
  max-width: 52ch;
}

.sheets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-4);
}

/* A carbon copy on a clipboard: ruled lines under the figures, and the
   older copies showing as edges behind the top sheet. */
.sheet {
  position: relative;
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(var(--mg-space-4) - 1px),
      var(--mg-panel-edge) calc(var(--mg-space-4) - 1px),
      var(--mg-panel-edge) var(--mg-space-4)
    ),
    var(--mg-panel);
  border: var(--mg-border);
  border-radius: 2px;
  padding: var(--mg-space-4) var(--mg-space-3) var(--mg-space-3);
  box-shadow:
    3px 3px 0 -1px var(--mg-night),
    4px 4px 0 -1px var(--mg-panel-edge),
    7px 7px 0 -2px var(--mg-night);
}

/* The clip that holds the stack, drawn rather than imaged. */
.clip {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 72px;
  height: 12px;
  background: var(--mg-panel-edge);
  border: var(--mg-border);
  border-radius: 2px;
}

.sheet-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  border-bottom: 2px solid var(--mg-panel-edge);
  padding-bottom: var(--mg-space-2);
  margin-bottom: var(--mg-space-2);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.days {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.open {
  color: var(--mg-neon-cyan);
}

.rows {
  margin: 0;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mg-space-3);
  height: var(--mg-space-4);
}

.row dt {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.row dd {
  margin: 0;
  color: var(--mg-yen);
  font-variant-numeric: tabular-nums;
}

.row.net {
  border-top: 2px solid var(--mg-panel-edge);
  margin-top: var(--mg-space-2);
  padding-top: var(--mg-space-2);
  height: auto;
}

.row.net dt {
  color: var(--mg-neon-violet);
}

.row.net dd.down {
  color: var(--mg-danger);
}
</style>
