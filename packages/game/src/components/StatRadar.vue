<script setup lang="ts">
import type { StatBlock } from '@midnight-garage/content'
import { computed } from 'vue'
import {
  axisAnchor,
  axisPoint,
  gridPolygonPoints,
  RADAR_AXES,
  RADAR_RING_MAGNITUDES,
  statPolygonPoints,
} from '../utils/radar'

const props = withDefaults(defineProps<{ stats: StatBlock; size?: number }>(), { size: 200 })

/**
 * Sprint 67 decision 5 (playtest item 8): a readable radar. It had one grid
 * pentagon and nothing else - no rings to read a value against, no spokes to
 * follow, and every label centred on its vertex so the long ones rode into the
 * plot. Pure presentation over the same `stats` prop; no stat maths changed.
 */
const rings = computed(() =>
  RADAR_RING_MAGNITUDES.map((magnitude) => ({
    magnitude,
    points: gridPolygonPoints(props.size, magnitude),
  })),
)

/** One spoke per axis, centre to rim - the line a value is read along. */
const spokes = computed(() => {
  const centre = props.size / 2
  return RADAR_AXES.map((axis, i) => {
    const tip = axisPoint(i, 1, centre, centre, centre)
    return { axis, x1: centre, y1: centre, x2: tip.x, y2: tip.y }
  })
})

const polygon = computed(() => statPolygonPoints(props.stats, props.size))

const labels = computed(() =>
  RADAR_AXES.map((axis, i) => {
    // Just outside the rim. It can sit closer than the old 1.18 because the
    // anchor now pushes the text outward instead of centring it over the edge.
    const p = axisPoint(i, 1.12, props.size / 2, props.size / 2, props.size / 2)
    return { axis, x: p.x, y: p.y, anchor: axisAnchor(i), value: props.stats[axis] }
  }),
)

/**
 * Room for the labels outside the rim. Larger than the old 0.28 because a
 * side-anchored label grows outward by its own width - which is the point, and
 * would otherwise clip at the viewBox edge instead of overlapping the plot.
 */
const pad = computed(() => props.size * 0.38)
const viewBox = computed(
  () => `${-pad.value} ${-pad.value} ${props.size + pad.value * 2} ${props.size + pad.value * 2}`,
)
</script>

<template>
  <svg class="radar" :viewBox="viewBox" role="img" aria-label="Car stat radar">
    <polygon
      v-for="ring in rings"
      :key="ring.magnitude"
      class="grid"
      :class="{ rim: ring.magnitude === 1 }"
      :points="ring.points"
      data-test="radar-ring"
    />
    <line
      v-for="spoke in spokes"
      :key="spoke.axis"
      class="spoke"
      :x1="spoke.x1"
      :y1="spoke.y1"
      :x2="spoke.x2"
      :y2="spoke.y2"
      data-test="radar-spoke"
    />
    <polygon class="stat" :points="polygon" />
    <text
      v-for="label in labels"
      :key="label.axis"
      :x="label.x"
      :y="label.y"
      class="label"
      :text-anchor="label.anchor"
      dominant-baseline="middle"
      data-test="radar-label"
    >
      {{ label.axis }}
      <tspan :x="label.x" dy="1.1em" class="value">{{ label.value }}</tspan>
    </text>
  </svg>
</template>

<style scoped>
.radar {
  width: 100%;
  max-width: 280px;
  height: auto;
}

/* Rings read as depth, not as five competing outlines: only the rim carries
   the panel fill, the inner ones are hairlines over it. */
.grid {
  fill: none;
  stroke: var(--mg-panel-edge);
  stroke-width: 1;
  opacity: 0.5;
}

.grid.rim {
  fill: var(--mg-panel);
  opacity: 1;
}

.spoke {
  stroke: var(--mg-panel-edge);
  stroke-width: 1;
  opacity: 0.5;
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

.label .value {
  fill: var(--mg-text);
  font-size: 10px;
}
</style>
