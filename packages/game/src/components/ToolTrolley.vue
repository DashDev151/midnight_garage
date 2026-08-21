<script setup lang="ts">
import type { RepairJobStepCard } from '@midnight-garage/sim'
import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * The trolley wheeled up to the car: exactly the tools the selected job still
 * needs, in the order the recipe calls for them, one chip each however many
 * steps reach for the same spanner.
 *
 * It is the shadow board's interaction on a job done where the part sits. The
 * current step's tool glows and clicking it works the step; clicking anything
 * else shakes that chip and costs nothing. A step with no proper tool leaves
 * its chip an empty outline and puts a stand-in chip under it instead. Every
 * decision behind those states is the store's: this renders them and reports
 * the click.
 */

const props = defineProps<{
  /** The selected job's steps still to work, in recipe order. */
  steps: RepairJobStepCard[]
  /** The tool the current step names, or null when no job is selected. */
  currentToolId: string | null
  /** Whether that step is being worked without the proper tool. */
  currentSlogged: boolean
}>()

const emit = defineEmits<{ (e: 'run-step'): void }>()

const TROLLEY_NOTE = "The trolley's out. Tools go back when the job's done."
const SLOG_CHIP_LABEL = 'make do'

/** How long a refused chip shakes for. */
const SHAKE_MS = 200

const shakingToolId = ref<string | null>(null)
let shakeTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (shakeTimer) clearTimeout(shakeTimer)
})

interface TrolleyToolView {
  id: string
  label: string
  slogged: boolean
}

/** One chip per tool the job reaches for, in the order it first reaches for
 * it. */
const tools = computed<TrolleyToolView[]>(() => {
  const stocked: TrolleyToolView[] = []
  const seen = new Set<string>()
  for (const step of props.steps) {
    if (seen.has(step.tool)) continue
    seen.add(step.tool)
    stocked.push({ id: step.tool, label: step.toolLabel, slogged: step.slogged })
  }
  return stocked
})

function isCurrentTool(tool: TrolleyToolView): boolean {
  return tool.id === props.currentToolId
}

/** The one chip a click actually works a step with. */
function isGlowing(tool: TrolleyToolView): boolean {
  return isCurrentTool(tool) && !props.currentSlogged
}

/** The stand-in that carries the step when the proper tool is not to hand. */
function hasStandIn(tool: TrolleyToolView): boolean {
  return isCurrentTool(tool) && props.currentSlogged
}

function chipClasses(tool: TrolleyToolView): Record<string, boolean> {
  return {
    'trolley-tool-outline': tool.slogged,
    'trolley-tool-glow': isGlowing(tool),
    'trolley-tool-shake': shakingToolId.value === tool.id,
  }
}

function onToolClick(tool: TrolleyToolView): void {
  if (isGlowing(tool)) {
    emit('run-step')
    return
  }
  if (shakeTimer) clearTimeout(shakeTimer)
  shakingToolId.value = tool.id
  shakeTimer = setTimeout(() => {
    shakingToolId.value = null
    shakeTimer = null
  }, SHAKE_MS)
}
</script>

<template>
  <div class="tool-trolley" data-test="tool-trolley">
    <p class="trolley-note">{{ TROLLEY_NOTE }}</p>
    <ul class="chips">
      <li v-for="tool in tools" :key="tool.id" class="tool-cell">
        <button
          type="button"
          class="trolley-tool"
          :class="chipClasses(tool)"
          :data-test="'trolley-tool-' + tool.id"
          @click="onToolClick(tool)"
        >
          <span class="tool-label">{{ tool.label }}</span>
        </button>
        <span class="slog-slot">
          <button
            v-if="hasStandIn(tool)"
            type="button"
            class="slog-chip"
            :data-test="'trolley-slog-' + tool.id"
            @click="emit('run-step')"
          >
            {{ SLOG_CHIP_LABEL }}
          </button>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tool-trolley {
  border: var(--mg-border);
  background: var(--mg-night);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.trolley-note {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-1);
}

/* A tool's fixed footprint: the chip, and the reserved row under it the
   stand-in drops into. The row is always there, so a stand-in appearing
   moves nothing on the trolley. */
.tool-cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 116px;
}

.slog-slot {
  display: block;
  min-height: 20px;
}

/* Every chip is the same size in every state, as on the board. */
.trolley-tool {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1px;
  width: 100%;
  height: 40px;
  padding: 2px var(--mg-space-1);
  border: 1px solid var(--mg-panel-edge);
  border-radius: 0;
  background: var(--mg-panel);
  color: var(--mg-text);
  font: inherit;
  font-size: 0.6rem;
  line-height: 1.1;
  text-align: left;
  overflow: hidden;
  cursor: pointer;
}

.tool-label {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A tool the trolley could not be stocked with: the step gets worked by hand
   instead. */
.trolley-tool-outline {
  border-style: dashed;
  background: transparent;
  color: var(--mg-text-dim);
}

.trolley-tool:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

/* The step the job is on, right now. */
.trolley-tool-glow {
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
  animation: trolley-glow 1.4s ease-in-out infinite;
}

@keyframes trolley-glow {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px var(--mg-neon-cyan);
  }
  50% {
    box-shadow: inset 0 0 0 3px var(--mg-neon-cyan);
  }
}

.trolley-tool-shake {
  animation: trolley-shake 0.2s linear 1;
}

@keyframes trolley-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(2px);
  }
}

/* Working it by hand: the proper tool's place on the trolley stays empty and
   this hangs under it instead. */
.slog-chip {
  width: 100%;
  padding: 1px var(--mg-space-1);
  border: 1px solid var(--mg-neon-violet);
  border-radius: 0;
  background: transparent;
  color: var(--mg-neon-violet);
  font: inherit;
  font-size: 0.6rem;
  cursor: pointer;
  animation: trolley-slog-glow 1.4s ease-in-out infinite;
}

@keyframes trolley-slog-glow {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px var(--mg-neon-violet);
  }
  50% {
    box-shadow: inset 0 0 0 3px var(--mg-neon-violet);
  }
}

/* Reduced motion: the states still read (colour and border carry them), they
   just hold still. */
@media (prefers-reduced-motion: reduce) {
  .trolley-tool-glow,
  .trolley-tool-shake,
  .slog-chip {
    animation: none;
  }

  .trolley-tool-glow {
    box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
  }

  .slog-chip {
    box-shadow: inset 0 0 0 2px var(--mg-neon-violet);
  }
}
</style>
