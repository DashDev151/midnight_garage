<!--
  The rotary-only part marker: a small triangle
  glyph on any catalog part card that requires the `Rotary` tag - the one
  semantic exception to the no-decorative-Unicode rule (CLAUDE.md directive
  2), carrying its meaning in a `title` tooltip rather than inline jargon
  ("needs Rotary"). Shown by the caller only when the part actually requires
  `Rotary` - this component has no fit logic of its own, hence no script.
-->
<template>
  <span class="rotary-marker" title="Rotary engine part only">&#9650;</span>
</template>

<style scoped>
.rotary-marker {
  color: var(--mg-neon-violet);
  font-size: 0.7em;
  vertical-align: middle;
  margin-left: 4px;
}
</style>
