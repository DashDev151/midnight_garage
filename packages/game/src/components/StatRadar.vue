<script setup lang="ts">
import type { StatBlock } from '@midnight-garage/content'
import { computed } from 'vue'
import { axisPoint, gridPolygonPoints, RADAR_AXES, statPolygonPoints } from '../utils/radar'

const props = withDefaults(defineProps<{ stats: StatBlock; size?: number }>(), { size: 200 })

const grid = computed(() => gridPolygonPoints(props.size))
const polygon = computed(() => statPolygonPoints(props.stats, props.size))
const labels = computed(() =>
  RADAR_AXES.map((axis, i) => {
    // Labels sit just outside the grid (magnitude 1.18).
    const p = axisPoint(i, 1.18, props.size / 2, props.size / 2, props.size / 2)
    return { axis, x: p.x, y: p.y, value: props.stats[axis] }
  }),
)
// A little breathing room so the outside labels aren't clipped.
const pad = computed(() => props.size * 0.28)
const viewBox = computed(
  () => `${-pad.value} ${-pad.value} ${props.size + pad.value * 2} ${props.size + pad.value * 2}`,
)
</script>

<template>
  <svg class="radar" :viewBox="viewBox" role="img" aria-label="Car stat radar">
    <polygon class="grid" :points="grid" />
    <polygon class="stat" :points="polygon" />
    <text
      v-for="label in labels"
      :key="label.axis"
      :x="label.x"
      :y="label.y"
      class="label"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {{ label.axis }} {{ label.value }}
    </text>
  </svg>
</template>

<style scoped>
.radar {
  width: 100%;
  max-width: 280px;
  height: auto;
}

.grid {
  fill: var(--mg-panel);
  stroke: var(--mg-panel-edge);
  stroke-width: 1;
}

.stat {
  fill: color-mix(in srgb, var(--mg-neon-cyan) 35%, transparent);
  stroke: var(--mg-neon-cyan);
  stroke-width: 2;
}

.label {
  fill: var(--mg-text-dim);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
