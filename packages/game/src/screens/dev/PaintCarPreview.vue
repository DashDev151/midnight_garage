<script setup lang="ts">
import { Application, type Container } from 'pixi.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { GLASS, OUTLINE, buildMasterCar } from '../../pixi/carSprite'
import type { Ramp } from '../../pixi/paintRamp'

/**
 * One car rendered through a ramp at a caller-chosen zoom. The paint palette
 * dev screen mounts this large for a pool's focused colour and small, several
 * at once, for the rest of the pool.
 */
const props = defineProps<{
  ramp: Ramp
  /** Integer zoom over the 96x48 master's own one-pixel-per-texel raster. */
  zoom: number
}>()

const BACKGROUND = 0x1c1d20

const host = ref<HTMLDivElement | null>(null)
let app: Application | null = null
let car: Container | null = null

function redraw(): void {
  if (!app) return
  car?.destroy({ children: true, texture: true })
  car = buildMasterCar({
    name: 'pool-entry',
    colors: {
      '0': OUTLINE,
      '1': props.ramp.base,
      '2': props.ramp.shade,
      '3': props.ramp.highlight,
      '4': GLASS,
    },
  })
  car.scale.set(props.zoom)
  app.stage.addChild(car)
}

onMounted(async () => {
  app = new Application()
  await app.init({
    width: 96 * props.zoom,
    height: 48 * props.zoom,
    background: BACKGROUND,
    antialias: false,
  })
  host.value?.appendChild(app.canvas)
  redraw()
})

watch(() => props.ramp, redraw)

onUnmounted(() => {
  app?.destroy(true, { children: true, texture: true })
  app = null
  car = null
})
</script>

<template>
  <div ref="host" class="preview"></div>
</template>

<style scoped>
.preview :deep(canvas) {
  display: block;
  image-rendering: pixelated;
}
</style>
