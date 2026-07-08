# Sprint 00 — Foundations: Tooling Proves Itself End-to-End

*Source: roadmap Phase 0, Sprint 0. Status: **implemented — ready for review; user-only tasks (group E) outstanding.***

## Goal

Prove the entire toolchain end-to-end before any real content exists: monorepo scaffold, CI, deploy pipeline, and — critically — the R1 art architecture (layered sprite compositing + palette swap), so the art-volume risk is retired before a single yen is spent on sprites.

## Definition of Done (from roadmap)

A placeholder car renders in 4 palette-swapped colors on a deployed URL, built and deployed from CI, with at least one passing sim test.

## Task breakdown

### A. Repo and monorepo scaffold (Claude)

- [x] `git init`; `.gitignore` (node, Vite, Python, Aseprite autosaves, OS cruft); `.editorconfig`. (pnpm 11.10.0 installed via `npm i -g pnpm`; corepack needs admin rights on this machine.)
- [x] pnpm workspace (`pnpm-workspace.yaml`, root `package.json`) with the layout locked in the roadmap:
  - `packages/sim` — pure TypeScript sim core. Zero runtime deps. Seed with a trivial but real function (e.g. a seeded PRNG `createRng(seed)`) and one Vitest test in `packages/sim/tests/`.
  - `packages/game` — Vite + Vue 3 + TS strict app. Depends on `sim` via workspace protocol.
  - `packages/content` — JSON tables + Zod schemas. Seed with an empty-but-valid `cars.json` and its schema, plus a validation test in `packages/content/tests/`.
  - `tools/balance` — Python CLI stub (`pyproject.toml`, polars pinned, one no-op `report` command). Wiring only; real harness is Sprint 3.
- [x] TypeScript strict everywhere (`"strict": true`, shared `tsconfig.base.json`).
- [x] ESLint + Prettier at the root. Include the **boundary law rule now**: an ESLint import restriction so `packages/sim` cannot import from `vue`, `pixi.js`, `dexie`, or `packages/game`.
- [x] Vitest wired at the workspace root (`pnpm test` runs all packages).

### B. CI and deploy (Claude scaffolds, user connects accounts)

- [x] GitHub Actions workflow: typecheck, lint, test, build on every push; deploy `main` build of `packages/game` to Cloudflare Pages. Deploy step self-skips until the secrets exist, so CI stays green pre-Cloudflare.
- [x] Secrets referenced by name only (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) — user adds values in GitHub repo settings.

### C. Art architecture proof — R1 spike (Claude, in `packages/game`)

- [x] Pixi v8 sandbox mounted inside a Vue component (`src/components/PixiCarSandbox.vue`) — the "canvas island" pattern that will later host the garage scene.
- [x] One deliberately-bad placeholder car as **layered sprites** (`src/pixi/carSprite.ts`): indexed body template + separate shared wheel layer + a ride-height y-offset (last demo car is slammed). Programmatic pixel data; an Aseprite original can replace it later.
- [x] Body drawn in an indexed 4-tone template palette; runtime **palette swap** renders 4 distinct paints side by side. Paint order is shuffled by the seeded sim RNG, which also proves the game-to-sim workspace import.
- [x] This sandbox is the deploy target for the DoD.

### D. Economy spreadsheet v0 (Claude drafts, user reviews)

- [x] `docs/economy-v0.md`: price curves by rarity tier, weekly rent/wage pressure, labor-slot costs, and act pacing targets phrased as Sprint 3 harness invariants. Draft numbers pending user review.

### E. User-only tasks (air-gapped / purchases / accounts)

- [x] Create the GitHub repository and push (Claude prepares the commit; user approves and provides the remote). Done: `github.com/DashDev151/midnight_garage`, commit `00b44e2`, CI run #1 fully green (check 31s, deploy 17s, 7/7 tests).
- [ ] **DEFERRED (user decision, Sprint 00 review):** Create Cloudflare Pages project; add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets to GitHub. The deploy step self-skips until then, so CI stays green. The DoD's "on a deployed URL" clause is parked with it — revisit before the Fun Gate (Sprint 8) at the latest, since playtesters need a link.
- [ ] Buy Aseprite; (optional this sprint) draw the deliberately-bad car sprite to replace the programmatic placeholder.
- [ ] Trademark search on the final title ("Midnight Garage" vs. alternates in GDD); register domain.
- [ ] Create private `IDEAS.md` (kept out of the public repo or in a private location — scope-creep parking lot per risk R3).

## Testing

- [x] Five passing Vitest tests in `packages/sim/tests/rng.test.ts` (determinism, seed divergence, float bounds, inclusive int range, empty-pick throw).
- [x] Content schema validation + unique-id tests in `packages/content/tests/content.test.ts`.
- [x] ESLint boundary rule verified by a deliberate `import 'pixi.js'` in sim: errored with the boundary-law message, removed, file re-lints clean (exit 0).
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (7 tests, 2 files), `pnpm build` (163 kB gzipped) all green locally. CI run pending first push (user task E).

## Hygiene and docs

- Update `CLAUDE.md` Commands section with the real `pnpm` commands once the scaffold exists.
- Tick checkboxes here as tasks complete; note deviations inline rather than silently changing scope.

## Exit

Sprint is done when the DoD screenshot-able moment exists: 4 palette-swapped cars on a live Cloudflare Pages URL, deployed by CI, tests green. Then: hygiene pass, doc updates, commit (with user approval).
