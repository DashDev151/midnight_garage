<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ProgressBar from '../components/ProgressBar.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'

/**
 * The one place the shop's granular
 * standing lives - exact reputation points with the named next tier, all six
 * specialty disciplines with their points and named tier-4 technique, the
 * derived shop title, and every scene's ledger. Progression bible law 4
 * permits exact numbers and progress bars for reputation and specialty on
 * THIS view only; the scenes panel is a different law again - a scene's
 * stage is stated in words, never a bar, and its car list is a receipt (the
 * price a real delivery sold for), not a progress readout. Everywhere else
 * stays meter-free - nothing follows the player around, nothing pops up
 * mid-job. Pure renderer over `game.standingView` - no local logic, no new
 * state.
 */
const game = useGameStore()

const standing = computed(() => game.standingView)
</script>

<template>
  <section class="standing">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <h2>Your standing</h2>

    <section class="panel" data-test="reputation-panel">
      <h3>Reputation</h3>
      <p class="lead">
        You're
        <strong data-test="rep-tier">{{ standing.reputation.tier }}</strong>
        at
        <strong data-test="rep-points">{{ standing.reputation.points }}</strong>
        rep.
      </p>
      <ProgressBar
        :value="standing.reputation.points"
        :max="standing.reputation.nextTier?.threshold ?? null"
        :caption="
          standing.reputation.nextTier
            ? `to ${standing.reputation.nextTier.tier}`
            : 'top of the ladder'
        "
        data-test="rep-bar"
      />
      <p v-if="standing.reputation.nextTier" class="next" data-test="rep-next">
        Next: <strong>{{ standing.reputation.nextTier.tier }}</strong> at
        {{ standing.reputation.nextTier.threshold }} rep.
      </p>
      <p v-else class="next" data-test="rep-next">
        You've reached the top of the ladder. Nowhere higher to climb.
      </p>
      <p v-if="standing.shopTitleName" class="title-line" data-test="shop-title">
        Around the ward they call your shop "{{ standing.shopTitleName }}".
      </p>
      <p v-else class="title-line">
        Do enough work in one discipline and the ward will start giving your shop a name.
      </p>
    </section>

    <section class="panel" data-test="specialty-panel">
      <h3>Specialty</h3>
      <p class="hint">
        Every job builds your standing in the disciplines it touches. Clear a discipline's threshold
        and you earn its signature craft.
      </p>
      <ul class="disciplines">
        <li
          v-for="row in standing.specialties"
          :key="row.componentId"
          class="discipline"
          :data-test="'specialty-' + row.componentId"
        >
          <div class="discipline-head">
            <span class="discipline-name">{{ row.componentLabel }}</span>
            <span class="discipline-points">{{ row.points }} pts</span>
          </div>
          <ProgressBar
            :value="row.points"
            :max="row.technique?.thresholdPoints ?? null"
            :complete="row.technique?.unlocked ?? false"
            :caption="row.technique ? `to ${row.technique.displayName}` : undefined"
            :data-test="'specialty-bar-' + row.componentId"
          />
          <p v-if="row.technique" class="technique" :class="{ earned: row.technique.unlocked }">
            <span v-if="row.technique.unlocked"> Earned: {{ row.technique.displayName }}. </span>
            <span v-else>
              {{ row.technique.displayName }} unlocks at {{ row.technique.thresholdPoints }} pts.
            </span>
          </p>
        </li>
      </ul>
    </section>

    <section class="panel" data-test="scenes-panel">
      <h3>Scenes</h3>
      <p class="hint">
        A scene remembers the cars you built for it. No score, no bar - just the work.
      </p>
      <ul class="scenes">
        <li
          v-for="scene in standing.scenes"
          :key="scene.scene"
          class="scene"
          :data-test="'scene-' + scene.scene"
        >
          <div class="scene-head">
            <span class="scene-name">{{ scene.label }}</span>
            <span class="scene-stage" :data-test="'scene-stage-' + scene.scene">{{
              scene.stageCopy
            }}</span>
          </div>
          <p v-if="scene.cars.length === 0" class="scene-empty">Nothing delivered here yet.</p>
          <ul v-else class="scene-cars" :data-test="'scene-cars-' + scene.scene">
            <li v-for="car in scene.cars" :key="car.carInstanceId" class="scene-car">
              <span class="scene-car-name">{{ car.carLabel }}</span>
              <span class="scene-car-price">{{ formatYen(car.priceYen) }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.standing {
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
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.lead {
  margin: 0 0 var(--mg-space-1);
}

.lead strong,
.next strong {
  color: var(--mg-neon-cyan);
}

.next,
.title-line {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.hint {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.disciplines {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.discipline {
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.discipline-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.discipline-name {
  color: var(--mg-text);
}

.discipline-points {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.technique {
  margin: 2px 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.technique.earned {
  color: var(--mg-success);
}

.scenes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.scene {
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.scene-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.scene-name {
  color: var(--mg-text);
}

.scene-stage {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  text-align: right;
}

.scene-empty {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.scene-cars {
  list-style: none;
  padding: 0;
  margin: var(--mg-space-1) 0 0;
  display: grid;
  gap: 2px;
}

.scene-car {
  display: flex;
  justify-content: space-between;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.scene-car-price {
  color: var(--mg-yen);
}
</style>
