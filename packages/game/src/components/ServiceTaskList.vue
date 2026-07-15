<script setup lang="ts">
import type { ServiceJobTaskView } from '../stores/gameStore'

/**
 * Sprint 67 decision 7 (playtest item 12): the ONE task list.
 *
 * A service job's tasks were rendered by three separate inline lists with
 * three different class names and three different guards - `.svc-tasks` on
 * CarDetailScreen, and `.tasks` twice on ServiceJobsScreen (once for an offer,
 * once for a job in the shop). They drifted exactly as you would expect: the
 * in-shop list hid itself for an in-transit job (`v-if="!job.inTransit"`) and
 * the car page skipped its list entirely on the same condition, so a player
 * who had accepted a job and wanted to check what the customer actually asked
 * for - in order to go and buy the parts - had nowhere to read it.
 *
 * Every caller passes the same `ServiceJobTaskView[]` the store already
 * builds, so "what does this job need" has one answer and one look. An offer's
 * tasks are simply never `done`, which needs no special casing here.
 */
defineProps<{ tasks: readonly ServiceJobTaskView[] }>()
</script>

<template>
  <ul class="service-tasks">
    <li v-for="(task, i) in tasks" :key="i" :class="{ done: task.done }">
      {{ task.label }}
    </li>
  </ul>
</template>

<style scoped>
/* The union of the two lists this replaces, which were already near-identical
 * (grid, 2px gap, `done` in success green). Deliberately not a redesign: item
 * 12 asked for one list, not a new look. */
.service-tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text-dim);
}

.service-tasks li.done {
  color: var(--mg-success);
}
</style>
