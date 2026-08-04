<script setup lang="ts">
import { Application, Graphics, type Container } from 'pixi.js'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { OVERWORLD_LOCATION_LABELS, type OverworldLocationId } from '../pixi/overworld/buildings'
import { buildOverworldScene, SCENE_HEIGHT, SCENE_WIDTH } from '../pixi/overworld/overworldMap'
import { HOVER_OUTLINE } from '../pixi/overworld/overworldPalette'
import { boundsFor, destinationFor, locationAt } from './overworldNav'

/**
 * The map you travel on: a Pixi host rendering the 960x540 overworld scene,
 * with its fifteen locations hit-tested on click. A real destination is
 * plain navigation and nothing else changes - no labour, no time, no day
 * advance. The two inert buildings (the cafe, the bank) refuse the click and
 * say so instead of navigating anywhere.
 *
 * Follows `PaintPaletteScreen.vue`'s own Pixi lifecycle: an `Application`
 * created on mount, torn down on unmount. The scene itself never changes
 * once built, so there is no redraw to wire up - the one exception is the
 * hover outline, a small `Graphics` overlay sat on top of (not part of) the
 * built scene, redrawn only when the hovered location changes, so it never
 * touches `buildOverworldScene`'s own "never changes" contract.
 */

const router = useRouter()
const host = ref<HTMLDivElement | null>(null)
const refusalNote = ref<string | null>(null)
const hoveredLocationId = ref<OverworldLocationId | null>(null)

const hoveredLocationName = computed(() =>
  hoveredLocationId.value ? OVERWORLD_LOCATION_LABELS[hoveredLocationId.value] : null,
)

let app: Application | null = null
let scene: Container | null = null
let hoverOutline: Graphics | null = null

/** A hard-edged rectangle around the hovered location's own bounds - a flat
 * vector stroke, not a texture, so the nearest-neighbour scaling every
 * sprite here uses never softens it. */
function drawHoverOutline(id: OverworldLocationId | null): void {
  if (!hoverOutline) return
  hoverOutline.clear()
  if (!id) return
  const bounds = boundsFor(id)
  if (!bounds) return
  hoverOutline
    .rect(bounds.left, bounds.top, bounds.width, bounds.height)
    .stroke({ width: 2, color: HOVER_OUTLINE })
}

function onCanvasClick(event: MouseEvent): void {
  const id = locationAt(event.offsetX, event.offsetY)
  if (!id) return
  const destination = destinationFor(id)
  if (destination.kind === 'inert') {
    refusalNote.value = destination.message
    return
  }
  refusalNote.value = null
  void router.push(destination.to)
}

function onCanvasPointerMove(event: PointerEvent): void {
  const id = locationAt(event.offsetX, event.offsetY)
  if (id === hoveredLocationId.value) return
  hoveredLocationId.value = id
  drawHoverOutline(id)
}

function onCanvasPointerLeave(): void {
  hoveredLocationId.value = null
  drawHoverOutline(null)
}

onMounted(async () => {
  app = new Application()
  await app.init({
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    background: 0x1c1d20,
    antialias: false,
  })
  host.value?.appendChild(app.canvas)
  app.canvas.addEventListener('click', onCanvasClick)
  app.canvas.addEventListener('pointermove', onCanvasPointerMove)
  app.canvas.addEventListener('pointerleave', onCanvasPointerLeave)
  scene = buildOverworldScene()
  app.stage.addChild(scene)
  hoverOutline = new Graphics()
  app.stage.addChild(hoverOutline)
})

onUnmounted(() => {
  app?.canvas.removeEventListener('click', onCanvasClick)
  app?.canvas.removeEventListener('pointermove', onCanvasPointerMove)
  app?.canvas.removeEventListener('pointerleave', onCanvasPointerLeave)
  app?.destroy(true, { children: true, texture: true })
  app = null
  scene = null
  hoverOutline = null
})
</script>

<template>
  <section class="overworld">
    <h2>
      The street
      <span v-if="hoveredLocationName" class="hover-name" data-test="overworld-hover-name">{{
        hoveredLocationName
      }}</span>
    </h2>
    <div ref="host" class="stage" data-test="overworld-stage"></div>
    <p v-if="refusalNote" class="refusal" data-test="overworld-refusal">{{ refusalNote }}</p>
  </section>
</template>

<style scoped>
.overworld {
  display: flex;
  flex-direction: column;
  align-items: center;
}

h2 {
  align-self: flex-start;
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0 0 var(--mg-space-2);
}

.hover-name {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-md);
  margin-left: var(--mg-space-2);
}

.stage {
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  overflow-x: auto;
  max-width: 100%;
}

.stage :deep(canvas) {
  image-rendering: pixelated;
  cursor: pointer;
}

.refusal {
  margin-top: var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
