<script setup lang="ts">
import PixiCarSandbox from '../components/PixiCarSandbox.vue'
</script>

<template>
  <section>
    <h2>Art architecture spike</h2>
    <PixiCarSandbox />
    <p class="caption">
      One indexed body template, one shared wheel layer. Four paints are runtime palette swaps; the
      last car is slammed via a ride-height offset. No per-configuration sprites exist. (Sprint 00.)
    </p>
  </section>
</template>

<style scoped>
h2 {
  color: var(--mg-neon-violet);
}

.caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
