<script setup lang="ts">
import type { BenchZone } from '@midnight-garage/content'
import { computed, onBeforeUnmount, ref } from 'vue'
import type { BenchToolView, BenchZoneView } from '../stores/gameStore'

/**
 * A bench's shadow board: five zones in fixed order, every tool of the bench
 * painted in its own place whether the shop owns it or not.
 *
 * The board is a FIXED layout. A tool never moves, never reorders and never
 * disappears: buying a rung, hiring a line for the day or opening the room
 * restyles the chip that is already there. The room's own tools hang on a
 * separate strip below, which appears whole once the covering shop is bought.
 *
 * The board is also where work is done. The current step's tool glows and
 * clicking it works the step; clicking anything else shakes that chip and
 * costs nothing. A step with no proper tool leaves the board chip an empty
 * outline and puts a stand-in chip under it instead. Every decision behind
 * those states is the store's: this renders them and reports the click.
 */

const props = defineProps<{
  zones: BenchZoneView[]
  roomOpen: boolean
  /** The tool the selected job's current step names, or null when no job is
   * selected or its tool hangs on another bench. */
  currentToolId: string | null
  /** Whether that step is being worked without the proper tool. */
  currentSlogged: boolean
}>()

const emit = defineEmits<{ (e: 'run-step'): void }>()

const ZONE_HEADINGS: Readonly<Record<BenchZone, string>> = {
  clean: 'Clean',
  fit: 'Fit',
  cut: 'Cut',
  join: 'Join',
  measure: 'Measure',
}

const ROOM_STRIP_LABEL = 'The room'
const SLOG_CHIP_LABEL = 'make do'
const HIRED_TAG_LABEL = 'hired'

/** How long a refused chip shakes for. */
const SHAKE_MS = 200

const shakingToolId = ref<string | null>(null)
let shakeTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (shakeTimer) clearTimeout(shakeTimer)
})

interface BoardZoneView {
  zone: BenchZone
  heading: string
  tools: BenchToolView[]
}

/** The board proper: everything a line can own or hire. */
const boardZones = computed<BoardZoneView[]>(() =>
  props.zones.map((zone) => ({
    zone: zone.zone,
    heading: ZONE_HEADINGS[zone.zone],
    tools: zone.tools.filter((tool) => tool.tier !== 'shop'),
  })),
)

/** The room's own tools, in board order - shown only once the room is open. */
const roomTools = computed<BenchToolView[]>(() =>
  props.zones.flatMap((zone) => zone.tools.filter((tool) => tool.tier === 'shop')),
)

function isCurrentTool(tool: BenchToolView): boolean {
  return tool.id === props.currentToolId
}

/** The one chip a click actually works a step with. */
function isGlowing(tool: BenchToolView): boolean {
  return isCurrentTool(tool) && !props.currentSlogged
}

/** The stand-in that carries the step when the proper tool is not to hand. */
function hasStandIn(tool: BenchToolView): boolean {
  return isCurrentTool(tool) && props.currentSlogged
}

function chipClasses(tool: BenchToolView): Record<string, boolean> {
  return {
    [`bench-tool-${tool.state}`]: true,
    'bench-tool-glow': isGlowing(tool),
    'bench-tool-shake': shakingToolId.value === tool.id,
  }
}

function onToolClick(tool: BenchToolView): void {
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
  <div class="board-wrap">
    <div class="shadow-board" data-test="shadow-board">
      <section v-for="zone in boardZones" :key="zone.zone" class="zone">
        <h4 class="zone-heading">{{ zone.heading }}</h4>
        <ul class="chips">
          <li v-for="tool in zone.tools" :key="tool.id" class="tool-cell">
            <button
              type="button"
              class="bench-tool"
              :class="chipClasses(tool)"
              :data-test="'bench-tool-' + tool.id"
              @click="onToolClick(tool)"
            >
              <span class="tool-label">{{ tool.label }}</span>
              <span
                v-if="tool.state === 'hired'"
                class="tool-tag"
                :data-test="'bench-tool-tag-' + tool.id"
                >{{ HIRED_TAG_LABEL }}</span
              >
            </button>
            <span class="slog-slot">
              <button
                v-if="hasStandIn(tool)"
                type="button"
                class="slog-chip"
                :data-test="'bench-slog-' + tool.id"
                @click="emit('run-step')"
              >
                {{ SLOG_CHIP_LABEL }}
              </button>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <div v-if="roomOpen" class="room-strip" data-test="bench-room-strip">
      <h4 class="zone-heading">{{ ROOM_STRIP_LABEL }}</h4>
      <ul class="chips">
        <li v-for="tool in roomTools" :key="tool.id" class="tool-cell">
          <button
            type="button"
            class="bench-tool"
            :class="chipClasses(tool)"
            :data-test="'bench-tool-' + tool.id"
            @click="onToolClick(tool)"
          >
            <span class="tool-label">{{ tool.label }}</span>
          </button>
          <span class="slog-slot"></span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.shadow-board {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--mg-space-2);
  border: var(--mg-border);
  background: var(--mg-night);
  padding: var(--mg-space-2) var(--mg-space-3);
}

.zone {
  min-width: 0;
}

.zone-heading {
  margin: 0 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.1em;
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
   moves nothing on the board. */
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

/* Every chip is the same size in every state - a shadow occupies exactly the
   space the tool that fills it will. */
.bench-tool {
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

.tool-tag {
  color: var(--mg-yen);
}

/* An empty hook: the outline of a tool that is not in the shop. */
.bench-tool-outline {
  border-style: dashed;
  background: transparent;
  color: var(--mg-text-dim);
}

.bench-tool-hired {
  border-color: var(--mg-yen);
}

.bench-tool-room {
  border-color: var(--mg-neon-violet);
}

.bench-tool:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
}

/* The step the job is on, right now. */
.bench-tool-glow {
  border-color: var(--mg-neon-cyan);
  color: var(--mg-neon-cyan);
  animation: bench-glow 1.4s ease-in-out infinite;
}

@keyframes bench-glow {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px var(--mg-neon-cyan);
  }
  50% {
    box-shadow: inset 0 0 0 3px var(--mg-neon-cyan);
  }
}

.bench-tool-shake {
  animation: bench-shake 0.2s linear 1;
}

@keyframes bench-shake {
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

/* Working it by hand: the proper tool's hook stays empty and this hangs
   under it instead. */
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
  animation: bench-slog-glow 1.4s ease-in-out infinite;
}

@keyframes bench-slog-glow {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px var(--mg-neon-violet);
  }
  50% {
    box-shadow: inset 0 0 0 3px var(--mg-neon-violet);
  }
}

.room-strip {
  margin-top: var(--mg-space-2);
  border: var(--mg-border);
  border-color: var(--mg-neon-violet);
  background: var(--mg-night);
  padding: var(--mg-space-2) var(--mg-space-3);
}

/* Reduced motion: the states still read (colour and border carry them), they
   just hold still. */
@media (prefers-reduced-motion: reduce) {
  .bench-tool-glow,
  .bench-tool-shake,
  .slog-chip {
    animation: none;
  }

  .bench-tool-glow {
    box-shadow: inset 0 0 0 2px var(--mg-neon-cyan);
  }

  .slog-chip {
    box-shadow: inset 0 0 0 2px var(--mg-neon-violet);
  }
}
</style>
