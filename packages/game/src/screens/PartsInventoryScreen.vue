<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HelpHint from '../components/HelpHint.vue'
import PartsInventoryPanel from '../components/PartsInventoryPanel.vue'
import { mapBackTarget } from './mapBack'

const route = useRoute()

/** The tab bar reaches this screen too, with no `from` flag - the back
 * control then falls back to the garage exactly as it always has
 * (`mapBack.ts`). */
const backTarget = computed(() => mapBackTarget(route.query.from, { name: 'garage' }))
</script>

<template>
  <section class="inventory">
    <RouterLink :to="backTarget" class="back">&lt; Back</RouterLink>
    <h2>
      Parts inventory
      <HelpHint label="Parts inventory">
        Everything you own that isn't already planned onto a car. Pick one up here (or drag it
        directly) and place it on a car's component to plan an install.
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
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}
</style>
