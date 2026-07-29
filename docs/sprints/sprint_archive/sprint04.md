# Sprint 04 - Vue shell & state bridge

*Source: roadmap Phase 2 (Ugly MVP), Sprint 4. GDD section 13 (locked stack). This is the first
sprint with anything interactive on screen beyond the Sprint 00 art spike - it wires the committed
sim (`fa6cc79`) into a real, clickable loop in the browser. Status: **implemented and locally
verified - ready for review.***

## Goal

Stand up the browser application shell and the state bridge between the pure sim and Vue: a Pinia
store wrapping real `GameState`, a minimal screen shell, synthwave design tokens, and a dev console.
The single proof-of-life is the roadmap's DoD: **pressing "End Day" advances the real sim in the
browser** - you watch cash drain to rent, service-bay income tick, market heat drift, and auction
catalogs refresh in a live event log, all produced by `advanceDay`, not by faked UI state.

This is deliberately an *infrastructure* sprint. It builds no game screens with real player actions
yet - the player can't queue a bid, start a job, or sell a car until Sprints 5-6. What it proves is
that the sim runs the browser, deterministically, through the same contract the balance harness
already exercises headlessly. End Day this sprint is exactly Passive Grinder played one interactive
day at a time (empty `DayActions`), which we already know stays solvent for 100 days - so the loop
is well-trodden before a human ever touches it.

## Definition of Done (from roadmap)

> End-day button advances the real sim in the browser.

Expanded acceptance for this sprint:

- A Pinia store holds a real, Zod-valid `GameState` and a `SimContext` built once from seed content.
- "New Game" seeds a fresh career; "End Day" calls `advanceDay` and replaces state with its result,
  appending the returned `DayLog` to a visible running log.
- Day counter, cash (in ¥), reputation tier, and owned-car count render from store getters and
  update on every End Day.
- Car model names render **through the Naming Layer** (`resolveCarDisplayName`), never raw fields.
- A minimal screen shell switches between at least a Garage home screen and the Sprint 00 Pixi
  spike, via Vue Router in memory-history mode.
- A dev-only console can give cash and warp N days; it is absent from the production build.
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm build` all green; new store tests
  pass headlessly.

## Decisions

Decisions 1 and 7 were revised on review (2026-07-08) - the user correctly pushed back on
homebrewing what a standard tool already does. Both now adopt the standard tooling; see **Stack
additions** below for the dependency approval this records.

1. **Vue Router in memory-history mode - the standard tool, not a hand-rolled screen switch.** Vue
   Router is a first-party Vue-team package (same family as Pinia, which *is* in the locked stack),
   so its absence from the GDD §13 list reads as an enumeration gap, not a deliberate exclusion. A
   `currentScreen` enum + `<component :is>` switch is a private router that accretes badly as the
   screen count climbs (~8-12 screens across P2-P4). The one game-specific concern - not wanting
   players to deep-link into screens or break flow with the browser back button - is fully answered
   by **`createMemoryHistory()`**, which keeps routing entirely in memory: named routes, per-screen
   lazy-loading (helps the <25MB budget and Sprint 26 code-splitting), and route transitions
   (Sprint 12 juice), with **zero URL coupling**. That matters extra here because the game ships in
   an **itch.io iframe**, where URL/hash routing fights the embedding and memory history is the
   clean fit. `useUiStore` no longer owns `currentScreen`; navigation goes through the router
   (`router.push({ name })`), which route guards can gate on game state later.
2. **Two Pinia stores, cleanly split by persistence fate.** `useGameStore` holds the *sim* slice -
   `gameState` (the exact object Dexie will persist in Sprint 7), `context`, `dayLog`, and the
   `newGame` / `endDay` actions. `useUiStore` holds *ephemeral session* state - dev-console
   visibility and similar view flags - that is never saved. (Screen location lives in the router
   now, per decision 1, not in a store.) Drawing this line now makes the Sprint 7 save law (persist
   `GameState`, nothing else) a clean lift instead of a detangling job.
3. **Interactive per-day seed uses the same derivation as the harness** (`state.seed + state.day`),
   so an interactive game is as reproducible as a bot career - a prerequisite for Sprint 7's
   golden-save test and the GDD's "nothing happens while the browser is closed" determinism.
4. **Promote the initial-state factory out of the bots module.** `createInitialCareerState` today
   lives in `packages/sim/src/bots/runCareer.ts`; the interactive game is not a "bot career," so a
   new `packages/sim/src/newGame.ts` exports `createInitialGameState(context, seed)` and `runCareer`
   imports it (DRY: one factory, correct layering). The ¥1,500,000 starting-cash constant (Sprint
   03 finding 3) moves with it. No behavior change - a golden-master re-pin is not expected, but if
   the move perturbs any hash it'll be re-pinned and called out.
5. **Design tokens are provisional.** The synthwave palette extends the existing five CSS custom
   properties in `style.css`; the real art-direction lock is Sprint 9. Nothing here is a committed
   visual identity - just a coherent token set so Sprints 5-7 aren't hard-coding colors.
6. **The OFL pixel font is wired now, the file lands when convenient.** `@font-face` + a monospace
   fallback go in this sprint so the moment a chosen OFL pixel `.woff2` (+ its `OFL.txt`) is dropped
   into `packages/game/public/fonts/pixel.woff2`, it takes effect - but the fallback means an
   unshipped font never blocks the sprint. **Implementation note:** the font is referenced via the
   Vite *public* dir (`/fonts/pixel.woff2`), not `src/assets/` - a `src/assets` `url()` to a missing
   file breaks `pnpm build`, whereas a public-dir reference passes through untouched and simply 404s
   to the fallback at runtime. `public/fonts/OFL.txt` documents the drop-in. Choosing/obtaining the
   specific font is a small user task (below).
7. **Component testing set up from the start - `@vue/test-utils` + `happy-dom`.** Revised on review:
   retrofitting a component-test harness at screen six is worse than establishing the pattern at
   screen one, so the standard Vue component-testing stack goes in now. `happy-dom` is the lighter,
   Vitest-recommended DOM env (over `jsdom`); `@vue/test-utils` is the official mounting library.
   The game Vitest project runs under `happy-dom` (a superset of node for our purposes - Pinia store
   tests run fine there too), with `@vitejs/plugin-vue` already present for SFC compilation. Store
   logic and mounted-component smoke tests both land this sprint.

## Stack additions (recorded per core directive 9)

Approved by the user on review (2026-07-08). All three are first-party or standard, low-risk:

- **`vue-router`** (dependency, `packages/game`) - first-party Vue routing, used with
  `createMemoryHistory()`. Decision 1.
- **`@vue/test-utils`** (devDependency, `packages/game`) - official Vue component mounting for tests.
- **`happy-dom`** (devDependency, `packages/game`) - lightweight DOM environment for Vitest.

CLAUDE.md's "Locked technical decisions" list is updated to include these so the recorded stack
stays truthful. Versions are pinned at implementation time via `pnpm add`.

## Task breakdown

### A. Design tokens & fonts (`packages/game`)

- [x] Extend `src/style.css` into a real token set: existing night/neon palette plus violet, a yen
  highlight (amber), money-delta success/danger, a small type scale and spacing scale, all as CSS
  custom properties. No decorative Unicode (core directive 2).
- [x] `@font-face` for an OFL pixel font from `public/fonts/` (see decision 6 note) with a monospace
  fallback; app font applied. `public/fonts/OFL.txt` documents the expected file + license.

### B. State bridge - Pinia stores (`packages/game/src/stores`)

- [x] `useGameStore`: state `{ gameState, dayLog }` + a `shallowRef` `context`; built once via
  `buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)` and `createInitialGameState(context, seed)`.
  Actions: `newGame(seed?)`, `endDay(actions?)` calling `advanceDay(gameState, actions ??
  emptyActions(), gameState.seed + gameState.day, context)` and appending the returned log; plus
  `devGiveCash` (dev console). Getters: `day`, `cashYen`, `reputationTier`, `ownedCarCount`,
  `ownedCarNames` (through the Naming Layer), and a `resolveModelName` helper.
- [x] `useUiStore`: `{ devConsoleOpen: boolean }` + `toggleDevConsole()`. (Screen location is the
  router's, not the store's - decision 1.)
- [x] `emptyActions()` helper (`DayActionsSchema.parse({})` - a fully-defaulted `DayActions`), so End
  Day with no queued player actions is a first-class, typed call, not an ad-hoc object.

### C. Router (`packages/game/src/router`)

- [x] `src/router/index.ts`: a `vue-router` instance built with `createMemoryHistory()`, routes for
  `garage` (default) and `spike`, each screen `component` lazy-imported so the code-splitting pattern
  is set from the first route (confirmed in the build: SpikeScreen's ~194 kB Pixi chunk is split away
  from the ~2.5 kB garage chunk). Registered in `main.ts` via `app.use(router)`.

### D. Sim additions (`packages/sim`)

- [x] `src/newGame.ts`: `createInitialGameState(context, seed)` (moved from `bots/runCareer.ts`),
  re-exported from `src/index.ts`; `runCareer` imports it. Decision 4 - pure move, golden-master hash
  unchanged (advanceDay test still green).

### E. Screen shell & the End-Day loop (`packages/game/src/screens`)

- [x] `App.vue` shell renders a `<RouterView>` outlet + header chrome + nav + the dev console mount.
- [x] `GarageScreen.vue`: the home screen - day/cash/rep/car-count summary, an **End Day** button
  wired to `useGameStore().endDay()`, a **New Game** control, and a scrolling event-log panel that
  renders `dayLog` via `describeLogEntry` (a `DayLogEntry`-exhaustive formatter). This screen is the
  DoD.
- [x] Relocated the Sprint 00 `PixiCarSandbox` behind a `SpikeScreen.vue` route, reachable via nav.
- [x] `formatYen`/`formatYenDelta` utils (¥ + thousands separators, no decimals) - the one place
  currency is formatted (DRY).

### F. Dev console (`packages/game/src/components`)

- [x] `DevConsole.vue`, mounted only when `import.meta.env.DEV`: give-cash, warp-N-days (loops
  `endDay(emptyActions())`), and a state readout. **Stripped from the production bundle** via a
  conditional `defineAsyncComponent` import (a static import ships behind a `v-if`; the conditional
  dynamic import is tree-shaken when `import.meta.env.DEV` folds to `false`) - verified absent by
  grepping the built assets.

### G. Testing (`packages/game`)

- [x] `packages/game/vitest.config.ts` (name `game`, `environment: 'happy-dom'`, `plugins: [vue()]`)
  - auto-registered by the root glob. `@vue/test-utils` + `happy-dom` devDependencies added.
- [x] `stores/gameStore.test.ts` (store logic): `newGame` produces a Zod-valid day-1 `GameState`;
  `endDay` advances day by exactly 1 and is deterministic for a fixed seed; the log grows;
  `devGiveCash` adds cash; names resolve through the Naming Layer.
- [x] `screens/GarageScreen.test.ts` (mounted, `@vue/test-utils`): clicking End Day advances the
  rendered day counter (the DoD, asserted); the empty-log hint gives way to real entries after a
  week; New Game resets to day 1.
- [x] `packages/sim/tests/newGame.test.ts`: `createInitialGameState` returns a day-1, valid state
  with ¥1,500,000, base-100 market heat per model, and is pure.
- [x] `utils/formatYen.test.ts`: sign placement, separators, rounding, delta signs.

## Claude-implementable vs user-only

**Claude-implementable:** everything in A-G above (tokens, stores, router, sim refactor, screens, dev
console, tests, config, and the three dependency installs the user approved).

**User-only:**
- Choose and obtain the OFL pixel font (`.woff2` + `OFL.txt`), drop into
  `packages/game/public/fonts/pixel.woff2`. Non-blocking - monospace fallback works until then.
- Run `pnpm dev` to eyeball the shell and click End Day (dev server is user-run; core directive 12).
- Dependency approval for `vue-router`, `@vue/test-utils`, `happy-dom` - **granted on review**
  (Stack additions above); no further approval outstanding.

## Testing

- [x] Store + component tests (group G) pass under `pnpm test --project game` (happy-dom env).
- [x] Sim refactor parity test green; full `pnpm test` green - **114 tests, 24 files** (was 97/20).
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm build` green; dev console confirmed absent
  from the production bundle (grep of built assets).
- [ ] Manual: `pnpm dev`, click End Day repeatedly, confirm cash drains on rent weeks and the log
  shows real `advanceDay` events (user-run - the one box only the user can check).

## Hygiene and docs

- [x] Updated CLAUDE.md's current-state note (Sprint 04 shell + End-Day loop) and the locked-stack
  list (the three additions). No new game-layer commands beyond existing `pnpm dev`.
- [x] Left CLAUDE.md engineering law 1 as-is - it documents `advanceDay`, not the state factory, so
  the `newGame.ts` extraction doesn't change it.
- [x] Sprint doc checkboxes reflect final state; the two implementation-time refinements (public-dir
  font path in decision 6; conditional-import dev-console stripping in group F) are flagged inline.

## Exit

Sprint 04 closes P1's headless era: the sim now runs a browser, deterministically, behind a shell
ready for real screens. Sprint 05 (Garage & build-sheet screens) hangs the first genuine player
actions on this bridge - car detail with a radar chart, the part-install flow, and the labor-slot
job queue - turning End Day from "advance an empty day" into "commit the day's work." Persistence
(Dexie, export/import, the save law) is Sprint 07; this sprint deliberately keeps state in-memory,
but shapes it save-ready (decision 2) so that lift is clean. The Fun Gate (Sprint 08) is where five
strangers decide whether any of this is actually a game.
