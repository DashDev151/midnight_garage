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
      <span class="mark" aria-hidden="true">{{ task.done ? '[x]' : '[ ]' }}</span>
      <span class="label">{{ task.label }}</span>
    </li>
  </ul>
</template>

<style scoped>
/*
 * A real checklist, not a paragraph of grey.
 *
 * Sprint 67 unified three inline lists into this one and deliberately kept
 * their shared look - dim text, no markers. That was the wrong thing to
 * preserve: the maintainer read a job, missed one of its actions entirely,
 * and only found out later. A list of work the player MUST do cannot render
 * as flavour text. It gets a box per line and full-strength text.
 *
 * `[ ]`/`[x]` are ASCII on purpose (CLAUDE.md directive 2 bans decorative
 * icons) and they suit the terminal look the rest of the UI already has.
 */
.service-tasks {
  list-style: none;
  margin: var(--mg-space-1) 0;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: var(--mg-fs-sm);
  color: var(--mg-text);
}

.service-tasks li {
  display: flex;
  align-items: baseline;
  gap: var(--mg-space-2);
}

.mark {
  color: var(--mg-neon-cyan);
  flex-shrink: 0;
}

.service-tasks li.done {
  color: var(--mg-text-dim);
}

.service-tasks li.done .mark {
  color: var(--mg-success);
}

.service-tasks li.done .label {
  text-decoration: line-through;
}
</style>
