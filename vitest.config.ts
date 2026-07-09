import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.{ts,vue}'],
      exclude: [
        '**/*.test.ts',
        '**/cli/**',
        'packages/game/src/main.ts',
        'packages/game/src/router/**',
        // Pixi canvas rendering — visual, not practically unit-testable in
        // happy-dom; the boundary law already keeps it isolated from the sim.
        'packages/game/src/pixi/**',
        // Sprint 00 art-spike / dev sandbox screens, never real game UI.
        'packages/game/src/screens/SpikeScreen.vue',
        'packages/game/src/components/PixiCarSandbox.vue',
        // Dev-only console, tree-shaken out of the production bundle.
        'packages/game/src/components/DevConsole.vue',
        // Deliberately a thin, minimal Dexie wrapper (Sprint 07) so tests
        // don't need fake-indexeddb — logic worth testing lives in saveCodec.ts.
        'packages/game/src/save/saveDb.ts',
      ],
      thresholds: {
        // Ratcheted to the real measured baseline (2026-07-09), not an
        // aspirational number — a regression gate, not a rewrite mandate.
        // sim/content (the pure business logic) run far higher in practice;
        // this single project-wide floor is deliberately set by the
        // weakest legitimately-in-scope area (game UI) so it's honest.
        statements: 80,
        branches: 65,
        functions: 78,
        lines: 82,
      },
    },
  },
})
