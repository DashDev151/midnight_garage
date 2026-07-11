# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core directives

Priority order: **Safety > Correctness > Clarity > Efficiency.**

1. **Secrets and PII hygiene:** never read `.env` or other secret-bearing files (keys, certs, credential stores). Never print, echo, or paste secrets or PII into chat, code, comments, logs, or sample output; reference secrets by env var name and mask or omit PII.
2. **No decorative Unicode:** no emojis or decorative icons in code, comments, or docs. (Semantic characters like the yen sign in game copy are fine.)
3. **DRY:** search for an existing implementation before writing new code; no duplicate implementations.
4. **Single responsibility:** extend a unit when the concern is the same; split when responsibilities diverge. Prefer small single-purpose pipelines behind an orchestrator over nested branching.
5. **Read first:** before editing a file, read it in full; never edit a region you have not seen whole.
6. **Truthful and verified:** state uncertainties explicitly and never misrepresent results. Before reporting complete, run the project's checks (tests / lint / typecheck / build) and show the output. Show evidence, do not assert it. Nothing reaches production without user review; mark work only as "ready for review".
7. **Git safety:** FORBIDDEN: `reset` / `force` / `rebase` / `clean`. ALLOWED: `status` / `log` / `diff`. Commits need explicit permission (the commit step of the sprint workflow below counts once the user approves the sprint's work).
8. **Human air gap on data:** never access or modify data via MCP, cloud shell, CLI, or scripts. Hand any command that could touch data to the user to run. No exceptions.
9. **Stay on stack:** do not add, swap, or deviate from declared dependencies (`package.json` / `pyproject.toml`) or the locked stack below without explicit user approval.
10. **Professional comments:** document what the code does, not the process of writing it. Comment only where the code is not self-documenting.
11. **Clean codebase:** tests live in `tests/` directories, never in the package root. No scratch docs in the repo root. Archive temporary or outdated files rather than deleting them. Clean as you go.
12. **No background processes:** never run long-running or background processes; give the user the exact command to run in their own terminal.
13. **Token discipline:** when investigating (not editing), read narrowly - scope to the relevant file or symbol. Never load data files into context: inspect schema, row counts, and a small sample by command. Filter command and test output to what matters.
14. **No commit co-authorship line:** never add a "Co-Authored-By: Claude" (or any similar tool-attribution) line to a commit message, under any circumstance.
15. **No em dashes, ever (CRITICAL, maintainer directive 2026-07-11):** the em dash character (U+2014) is banned everywhere: game UI copy, content JSON strings, code, comments, tests, docs, commit messages, and chat replies. Use a comma, colon, semicolon, parentheses, or a plain hyphen instead. The repo was purged of all em dashes on 2026-07-11; a guard test (Sprint 25) keeps them out of `packages/` permanently.
16. **Reuse-first design (DRY at the design level, not just code):** before implementing ANY feature, first write down - in the sprint doc or the plan - (a) what mechanisms are genuinely **new**, and (b) what **already exists that must be reused** (systems, state shapes, sim functions, UI flows). Map the new feature onto existing primitives before writing a line of code; never stand up a parallel mechanism when an existing one covers the concern. The Sprint 08 service-jobs rework happened because a whole second "job" system was built alongside the existing job/labor system instead of reusing it - that is the exact failure this rule exists to prevent.

## Sprint workflow (mandatory)

All development happens in sprints, driven by the roadmap. Sprint docs live in `docs/sprints/sprintXX.md`. For every sprint:

1. **Read** the roadmap and planning docs (and the previous sprint doc, if any).
2. **Design** `sprints/sprintXX.md` from them: goal, definition of done, task breakdown separating Claude-implementable tasks from user-only tasks (purchases, account setup, anything behind the data air gap). **The design MUST open with a reuse analysis (directive 16): an explicit "new mechanisms" vs. "existing mechanisms to reuse" split, mapping every part of the feature onto what already exists before any code is written.**
3. **Implement** all actions in the sprint doc.
4. **Test** new implementations where relevant; run the project checks and show output.
5. **Hygiene:** clean up, update docs (including this file and the sprint doc's checkboxes) so they accurately track project state. Also check `TODO.md` (repo root) - deliberately deferred items that aren't tied to any specific future sprint number, so they don't get lost in sprint-doc archaeology. Add to it when you defer something with no sprint attached; remove from it once something gets actioned.
6. **Commit** (with user approval per the git safety rule).

## What this repository is

**Midnight Garage** - a browser-based, turn-based garage management sim set in 1995 Japan (synthwave pixel art, JDM car culture, hunt-build-sell loop). Solo-dev passion project, ~13-month roadmap to a free itch.io launch.

**Current state:** Sprints 00 through 26 are implemented and committed (`git log` has every hash). The maintainer playtest on 2026-07-11 (raw notes in `docs/playtest-notes-2026-07-11.md`) found the core repair/replace loop unsound: too-coarse component granularity, authored numbers where derived ones belong (job payouts blind to part prices, issue fix costs blind to car value, static book value), a dead market (one-shot auction demand rolls, weekly batch dumps, guaranteed-sale listings), and raw ids leaking into UI copy. The triage produced the **Loop Rework arc, Sprints 25-31**. Sprint 25 (triage/guardrails) is implemented: next-morning service-job car arrival (with a real in-transit UI state, not just a silent block), a real fix for a standard-parts-delivery off-by-one, an interim auction-pacing fix (the demand ceiling now re-seeds daily so a lot stuck below reserve isn't permanently dead, and the turnout badge can no longer overclaim "packed"), book value removed from the auction UI, every raw component id in player-facing copy replaced with a real display-name lookup, a drag text-selection bug fixed, a permanent em-dash guard test, equipment-requirement hints moved to tooltips, and four guaranteed-loss service-job payouts repriced with a permanent 1.2x-floor content invariant plus a new reputation gate on install-kind offers. Full detail is in `docs/sprints/sprint25.md`'s Exit section; the `days-to-local` pacing invariant it flagged as failing (p50 dropped to 12, below the [15,35] floor) is back in band (p50=16, hard-gated PASS) after Sprint 26's rework, so that TODO item is retired. **Sprint 26 (the banded 29-part model) is now implemented and verified:** five named condition bands (scrap/poor/worn/fine/mint) as the only per-part condition state, whole-grade repair to a player-chosen target band gated by a 3-tier repair level (yen cost level-independent), terminal scrap (unrepairable, scrap-sell only), a universal forced-induction slot, the hidden-defect/inspection system paused and removed, a group-level addressing bridge (per-part staging deferred to Sprint 28), and a Dexie v15->v16 save migration. Verified: 647 tests green (incl. a 37-test `bands.ts` suite), coverage thresholds pass, full balance run all hard invariants pass, with several aggressive bot strategies underperforming as the expected pre-Sprint-27 seam (they price against bands without the transparent value model yet; Sprint 27 re-bases them). The catalog was also seeded 20->119 parts (Sprint 28 content, prices are maintainer-tuning bait). Sprints 27-31 are designed but not yet implemented: 27 transparent cost-weighted value (clean value minus restoration bill) + full pre-bid condition visibility, 28 drill-down UI + catalog expansion (rotary parts, NA forced-induction kits, underglow), 29 service-jobs framework v2, 30 living auctions, 31 walk-in-only selling. Also on 2026-07-11: the em-dash ban (directive 15) landed with a repo-wide purge and a permanent guard test. Full sprint-by-sprint detail lives one file per sprint in `docs/sprints/sprintNN.md`; read the current sprint's doc (and the previous one, per the Sprint workflow above) before starting new work, not this paragraph.

- `docs/design/midnight-garage-gdd.md` - Game Design Document (v0.5). Vision, mechanics, economy, art direction, tech stack. The GDD feature set is **frozen for v1.0**; new ideas go to `IDEAS.md` (repo root, tracked), not into the GDD. `IDEAS.md` is the post-launch parking lot - anything there is out of v1.0 scope by definition. Note: it records a maintainer-sanctioned *post-launch* exception to two hard design rules below (an optional, zero-weight driving minigame) - so don't flag that idea as a rules violation; it's an accepted, deliberately-deferred opt-in, not an oversight.
- `docs/design/midnight-garage-roadmap.md` - Sprint-by-sprint plan (P0–P7), risk register, engineering standards, content pipeline.
- `docs/design/midnight-garage-roster.md` - Full car roster with scope tiers (PoC-10 → Go-Live ~48 → expansion packs). **Contains a secret easter egg ("The Zero Legend") - never surface it in public-facing text, devlogs, or marketing copy.**

When design questions arise, these documents are the source of truth. Don't invent mechanics or cars - check the docs, and treat conflicts between them as something to flag to the user (GDD is canonical for mechanics, roster for car scope).

## Locked technical decisions (GDD §13, roadmap §5)

The stack is decided; do not re-litigate it when scaffolding begins:

- TypeScript (strict) • Vue 3 Composition API • Pinia • Vue Router (memory-history mode; added Sprint 04) • Vite • PixiJS v8 (canvas islands only) • Dexie.js/IndexedDB saves • Zod-validated JSON content • Howler.js audio • Vitest + @vue/test-utils + happy-dom for component tests (the latter two added Sprint 04) • static deploy (Cloudflare Pages / itch.io). Python (polars) for the balance harness. pnpm monorepo.

Planned layout: `packages/sim` (pure TS sim core), `packages/game` (Vue app), `packages/content` (JSON + Zod schemas), `tools/balance` (Python CLI).

Engineering laws that all future code must obey:

1. **Boundary law:** `packages/sim` never imports Vue/Pixi/DOM/Dexie/`@midnight-garage/game` - enforced via ESLint import rules. It does depend on `@midnight-garage/content` (pure data + Zod), never the reverse - that's the one dependency the boundary law permits. Sim contract: `advanceDay(state, queuedActions, seed) → newState + eventLog`, fully deterministic (seeded PRNG; no `Date.now()`/`Math.random()` in sim) - implemented in `packages/sim/src/advanceDay.ts` from Sprint 02 onward.
2. **Content law:** any designer-tunable number lives in JSON under `packages/content`, not in code.
3. **Naming Layer (licensing):** every vehicle separates real `spec` data from swappable `display_name`/`brand` strings; a single config flag flips the whole game to parody names, with a CI test asserting no real-brand string leaks when flagged. Built from the first schema onward. Parts brands are parody-only from day one.
4. **Save law:** every save-schema change = Dexie version bump + migration + golden-save test in the same PR. Also call `navigator.storage.persist()` and keep the export-save-string flow prominent (Safari ITP can evict IndexedDB).
5. **Test law:** golden-master seed tests in CI; every fixed sim bug gets a regression test; balance invariants (bot careers → CSV → polars report, `pnpm balance:run` then `python -m balance.cli check`) exist and pass as of Sprint 03. **Wired into CI as of 2026-07-09** (external review 2026-07 finding 1, revisiting the Sprint-03 local-only deferral): a path-filtered `balance` job (`packages/sim/**` / `packages/content/data/**`) runs the full 1000-career-per-strategy harness + invariant check + uploads `report.md` as a build artifact, skipped (not failed) on pushes/PRs that don't touch sim or content data. See `.github/workflows/ci.yml`. Coverage is measured and gated too (`pnpm test:coverage`, added 2026-07-09) - see Commands below.
6. **Pre-commit/pre-push hooks (added 2026-07-09):** Husky + lint-staged. `pre-commit` runs `lint-staged` (ESLint --fix + Prettier --write on staged files only - fast, auto-fixes and re-stages). `pre-push` runs the full local gate (`typecheck` → `lint` → `format` → `test:coverage`) so a broken push is caught before it reaches CI, not just by it. Neither hook runs `build` (CI still does) - kept out for speed, since typecheck/lint/test already catch the overwhelming majority of real breakage.

## Hard design rules (accessibility & scope)

- **No reflex-based input anywhere** - no QTEs, no timing bars. Everything is decision-paced.
- No real-time waiting, energy systems, or monetized timers. Turn-based days: nothing happens while the browser is closed.
- No driving gameplay - events resolve via pre-run decisions + animated resolution.
- Currency is era-authentic yen (¥), everywhere.

## Commands

Run from the repo root (pnpm workspace):

- `pnpm install` - install all workspace dependencies
- `pnpm typecheck` - `tsc --noEmit` in sim/content, `vue-tsc --noEmit` in game
- `pnpm lint` - ESLint (includes the sim boundary-law rule)
- `pnpm format` / `pnpm format:fix` - Prettier check / write
- `pnpm test` - Vitest across all workspace projects; single project: `pnpm test --project sim`; single file: `pnpm test packages/sim/tests/rng.test.ts`
- `pnpm test:coverage` - Vitest with v8 coverage (text/html/lcov reports to `coverage/`, gitignored). Thresholds enforced (statements 80 / branches 65 / functions 78 / lines 82, set 2026-07-09 as a ratchet against the real measured baseline - raise them as coverage improves, don't lower them to pass). Excludes Pixi rendering, the art-spike/dev-sandbox screens, the dev-only console, and `saveDb.ts` (deliberately a thin Dexie wrapper, untested by design per Sprint 07) - everything else counts. Run in CI and in the pre-push hook.
- `pnpm build` - production build of `packages/game` (Vite)
- `pnpm dev` - game dev server (long-running: give this to the user to run, never run it yourself)
- `pnpm balance:run` - plays all 9 bot strategies (8 archetypes plus `competent-policy`, Sprint 23's measurement probe for the reputation-pacing invariant) through 1,000 seeded 100-day careers each and writes `tools/balance/data/careers.csv` + `careers.manifest.json` (also carrying `startingCashYen`/`weeklyRentYen` since Sprint 23, so the Python check validates against the values that actually ran) plus `auctionWins.csv`/`auctionFieldSizes.csv` for the auction-calibration section (since Sprint 10) and `acquisitions.csv` for the buyout-vs-bid telemetry section (since 2026-07-09). Builds the CLI via a dedicated `packages/sim/tsconfig.cli.json` (CommonJS, run with plain `node`) first, then two post-build fixups: `scripts/mark-commonjs.cjs` (marks the dist subtree CommonJS) and `scripts/fixContentRequires.cjs` (rewrites compiled `require("@midnight-garage/content")` calls to the dist-local relative path - `@midnight-garage/content`'s `package.json` `exports` points at raw `src/index.ts`, which plain Node can't resolve, so `tsconfig.cli.json` compiles it as an explicit root and this script points the requires at the result). **Wired into CI as of 2026-07-09** (path-filtered `balance` job) - still fine to run locally whenever you want fresher numbers than the last CI run.
- `python -m balance.cli report --data-dir tools/balance/data --out tools/balance/report.md` - renders the markdown balance report (median/p10/p90 cash + car count at day 25/40/70/100 per strategy, the auction win-price calibration, and the buyout-vs-bid share per strategy). Requires `pip install -e tools/balance` once (polars is the only dependency).
- `python -m balance.cli check --data-dir tools/balance/data` - checks 6 balance invariants against the CSV (Sprint 23 decision 7: 3 hard-gated - days-to-`local` pacing, buyout share, the 3 legacy Sprint 03/09 checks - 3 informational with real numbers disclosed rather than force-passed, see `invariants.py`'s module docstring and `sprint23.md`'s Exit); exits non-zero on any hard-gated failure.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format, coverage-gated test, build on every push/PR (`check` job) and deploys `main` to Cloudflare Pages once the secrets exist (`deploy` job). A third, path-filtered `balance` job (`packages/sim/**`/`packages/content/data/**`) runs the balance harness + invariant check on pushes/PRs that touch sim or content data, uploading `report.md` as an artifact - wired 2026-07-09, revisiting the Sprint-03 local-only deferral per external review finding 1 (see `docs/sprints/sprint03.md`). `deploy` waits on both `check` and `balance` (skipped counts as passing when nothing sim/content-relevant changed).
