<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import EndDayButton from './EndDayButton.vue'
import LabourBar from './LabourBar.vue'

/**
 * The app-wide floating HUD: a vertical labour gauge sitting directly above
 * the End Day control, fixed to the bottom-right corner of the viewport.
 * Mounted once at the app root (`App.vue`) so it renders in the identical
 * spot on every gameplay screen - a genuine overlay above the game, not a
 * per-screen widget.
 */
const game = useGameStore()

const endDayButton = ref<InstanceType<typeof EndDayButton> | null>(null)

/**
 * Forwarded from the wrapped End Day button so the app root's global Escape
 * handler can close its cart-confirm modal without reaching past this
 * wrapper.
 */
defineExpose({
  confirming: computed(() => endDayButton.value?.confirming ?? false),
  cancel: (): void => endDayButton.value?.cancel(),
})
</script>

<template>
  <div class="floating-hud">
    <LabourBar vertical :remaining="game.laborSlotsRemainingToday" :max="game.laborSlotsPerDay" />
    <EndDayButton ref="endDayButton" />
  </div>
</template>

<style scoped>
.floating-hud {
  position: fixed;
  right: var(--mg-space-4);
  bottom: var(--mg-space-4);
  /* Above screen content, below the tutorial overlay (z-index 120) - the
     walkthrough box must always be able to sit on top of this cluster. */
  z-index: 110;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-2);
}
</style>
