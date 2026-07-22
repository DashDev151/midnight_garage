<script setup lang="ts">
import type { ServiceJobTaskView } from '../stores/gameStore'

/**
 * The ONE task list for a service job.
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
 * A real checklist, not a paragraph of grey. A list of work the player MUST
 * do cannot render as flavour text - it gets a box per line and
 * full-strength text.
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
