<script setup lang="ts">
import { Application, type Container } from 'pixi.js'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { buildOverworldScene, SCENE_HEIGHT, SCENE_WIDTH } from '../pixi/overworld/overworldMap'
import { destinationFor, locationAt } from './overworldNav'

/**
 * The map you travel on: a Pixi host rendering the 960x540 overworld scene,
 * with its fourteen locations hit-tested on click. A real destination is
 * plain navigation and nothing else changes - no labour, no time, no day
 * advance. The two inert buildings (the cafe, the bank) refuse the click and
 * say so instead of navigating anywhere.
 *
 * Follows `PaintPaletteScreen.vue`'s own Pixi lifecycle: an `Application`
 * created on mount, torn down on unmount. The scene itself never changes
 * once built, so there is no redraw to wire up.
 */

const router = useRouter()
const host = ref<HTMLDivElement | null>(null)
const refusalNote = ref<string | null>(null)

let app: Application | null = null
let scene: Container | null = null

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
  scene = buildOverworldScene()
  app.stage.addChild(scene)
})

onUnmounted(() => {
  app?.canvas.removeEventListener('click', onCanvasClick)
  app?.destroy(true, { children: true, texture: true })
  app = null
  scene = null
})
</script>

<template>
  <section class="overworld">
    <h2>The street</h2>
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
