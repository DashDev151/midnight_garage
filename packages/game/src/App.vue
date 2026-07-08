<script setup lang="ts">
import PixiCarSandbox from './components/PixiCarSandbox.vue'
</script>

<template>
  <header>
    <h1>MIDNIGHT GARAGE</h1>
    <p class="subtitle">Sprint 00 — art architecture spike</p>
  </header>
  <main>
    <PixiCarSandbox />
    <p class="caption">
      One indexed body template, one shared wheel layer. Four paints are runtime palette swaps; the
      last car is slammed via a ride-height offset. No per-configuration sprites exist.
    </p>
  </main>
</template>

<style scoped>
h1 {
  color: var(--mg-neon-cyan);
  letter-spacing: 0.3em;
  margin-bottom: 0;
}

.subtitle {
  color: var(--mg-neon-pink);
  margin-top: 0.25rem;
}

.caption {
  color: #9a93c9;
  font-size: 0.85rem;
}
</style>
