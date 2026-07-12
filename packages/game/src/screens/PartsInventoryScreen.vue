<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import PartsInventoryPanel from '../components/PartsInventoryPanel.vue'
</script>

<template>
  <section class="inventory">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <h2>
      Parts inventory
      <HelpHint label="Parts inventory">
        Everything you own that isn't already staged on a car. Pick one up here (or drag it
        directly) and place it on a car's component to stage an install.
      </HelpHint>
    </h2>
    <PartsInventoryPanel />
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  display: flex;
  align-items: center;
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}
</style>
