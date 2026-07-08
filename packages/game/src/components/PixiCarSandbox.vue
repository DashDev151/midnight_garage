<script setup lang="ts">
import { Application } from 'pixi.js'
import { onMounted, onUnmounted, ref } from 'vue'
import { buildPaletteDemo } from '../pixi/carSprite'

const host = ref<HTMLDivElement | null>(null)
let app: Application | null = null

onMounted(async () => {
  app = new Application()
  await app.init({
    width: 880,
    height: 160,
    background: 0x14102a,
    antialias: false,
  })
  host.value?.appendChild(app.canvas)
  app.stage.addChild(buildPaletteDemo())
})

onUnmounted(() => {
  app?.destroy(true, { children: true, texture: true })
  app = null
})
</script>

<template>
  <div ref="host" class="pixi-island"></div>
</template>

<style scoped>
.pixi-island {
  display: flex;
  justify-content: center;
  border: 2px solid var(--mg-neon-pink);
  padding: 1rem;
  background: var(--mg-night);
  overflow-x: auto;
}
</style>
