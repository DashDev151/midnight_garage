<script setup lang="ts">
import { lapBlockers, lapTimeSecondsFor } from '@midnight-garage/sim'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useGameStore } from '../stores/gameStore'

/**
 * The player-facing test track: the one destination on the map with no
 * screen of its own. Pick a car you own, pick one of the four shipped
 * courses, and read a time off the same locked performance model
 * `PerformanceSandboxScreen.vue` runs as a dev tool
 * (`lapTimeSecondsFor`/`lapBlockers`, `packages/sim/src/lapModel.ts`) -
 * there is no second lap model here, and nothing is fitted, repaired or
 * changed by visiting.
 *
 * Unlike the sandbox, this offers only cars the player actually owns (no
 * slot editors, no build codes, no research cars) and nothing here is a
 * timing challenge: the player chooses a car and a course and reads a
 * result, with no reflex input of any kind.
 */

const game = useGameStore()
const route = useRoute()

const cars = computed(() => game.carsDetailed)
const courses = computed(() => game.context.courses)

/** The course an overworld location's own hotspot asked for (the touge
 * defaults to Hakone, the wangan to itself, the raceway to Misaki) - a
 * starting point only; every shipped course stays pickable regardless of
 * how this screen was reached. Falls back to the first course when the
 * query is missing or names a course that does not exist. */
function courseIdFromQuery(): string {
  const requested = route.query.course
  const wanted = typeof requested === 'string' ? requested : undefined
  const match = courses.value.find((course) => course.id === wanted)
  return (match ?? courses.value[0])?.id ?? ''
}

const selectedCarId = ref(cars.value[0]?.car.id ?? '')
const selectedCourseId = ref(courseIdFromQuery())

// A car sold or scrapped mid-visit falls back to whatever is left, rather
// than the screen quietly holding on to a car that is no longer owned.
watch(cars, (list) => {
  if (!list.some((detail) => detail.car.id === selectedCarId.value)) {
    selectedCarId.value = list[0]?.car.id ?? ''
  }
})

const selectedCar = computed(
  () => cars.value.find((detail) => detail.car.id === selectedCarId.value) ?? null,
)
const selectedCourse = computed(
  () => courses.value.find((course) => course.id === selectedCourseId.value) ?? null,
)

const lapSeconds = computed<number | null>(() => {
  const detail = selectedCar.value
  const course = selectedCourse.value
  if (!detail || !course) return null
  return lapTimeSecondsFor(detail.car, detail.model, game.context, course.id)
})

/** Named parts stopping the car running at all, read the same way the
 * sandbox's own HUD does - a car nobody can drive says why, not just that
 * it can't. */
const blockedPartNames = computed<string[]>(() => {
  const detail = selectedCar.value
  if (!detail) return []
  return lapBlockers(detail.car, game.context).map(
    (partId) => game.context.partsTaxonomyById[partId].displayName,
  )
})
</script>

<template>
  <section class="test-track">
    <RouterLink :to="{ name: 'overworld' }" class="back" data-test="test-track-back">
      &lt; Back to the street
    </RouterLink>
    <h2>Test track</h2>

    <p v-if="cars.length === 0" class="empty" data-test="test-track-empty">
      Nothing to take up here. Bring a car home first.
    </p>

    <template v-else>
      <label class="picker">
        Car
        <select v-model="selectedCarId" data-test="test-track-car-select">
          <option v-for="detail in cars" :key="detail.car.id" :value="detail.car.id">
            {{ detail.displayName }}
          </option>
        </select>
      </label>

      <label class="picker">
        Course
        <select v-model="selectedCourseId" data-test="test-track-course-select">
          <option v-for="course in courses" :key="course.id" :value="course.id">
            {{ course.name }}
          </option>
        </select>
      </label>

      <p v-if="lapSeconds !== null" class="result" data-test="test-track-time">
        {{ lapSeconds.toFixed(2) }}s
      </p>
      <p v-else class="refusal" data-test="test-track-blocked">
        This one can't be driven right now<span v-if="blockedPartNames.length">
          : {{ blockedPartNames.join(', ') }}</span
        >.
      </p>
    </template>
  </section>
</template>

<style scoped>
.test-track {
  max-width: 480px;
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

.empty {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.picker {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin-bottom: var(--mg-space-3);
}

.picker select {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-md);
}

.result {
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
}

.refusal {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
