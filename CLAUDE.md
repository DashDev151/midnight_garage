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
17. **A failing test is a diagnosis, not an obstacle:** when a test fails after an implementation change, determine WHY before touching it. Two cases only: (a) the test now asserts stale/wrong behavior (the implementation intentionally changed what's correct) - update it to assert the new correct behavior, or (b) the test caught a real regression - fix the code, not the test. Never edit, loosen, or delete a test merely to make it pass without first establishing which case applies; state which case it was when reporting the fix.
18. **British English everywhere (maintainer directive 2026-07-14):** all player-facing copy, docs, comments, commit messages, and chat replies use British spelling (labour, tyres, colour, -ise). Existing code identifiers keep their current spelling (e.g. `laborSlotsSpentToday` - renaming persisted save-schema field names means a migration for zero player value) unless the maintainer explicitly orders a rename; player-visible strings always use British forms. A spelling guard test (Sprint 63) enforces the copy surface.
19. **No save backwards compatibility before launch (CRITICAL, maintainer directive 2026-07-15):** there are no players and there are no old saves, so do not spend a single line protecting them. **This supersedes engineering law 4's migration and golden-save-test requirements for the whole of pre-launch development.** A schema change needs a Dexie version bump (mechanically required for the DB to open) and nothing else. FORBIDDEN until launch: hand-written data migrations that reshape old records; golden-save tests that pin a legacy shape; and legacy-compat branches in code ("a pre-vNN save has no X, so assume Y") - the last is the worst, because it silently keeps dead semantics alive in live logic forever. If an old save breaks, it breaks: wipe it and start a new game. KEEP the export-save flow (a live dev convenience, not a compat measure). Revisit only once the game is in front of real players. When a change would previously have earned a migration, say so in the sprint doc and move on.
20. **No redundant check runs (CRITICAL, maintainer directive 2026-07-17):** the git hooks ARE the quality gate. `pre-commit` runs lint-staged; `pre-push` runs typecheck, lint, format, and the coverage-gated suite. NEVER manually run a check that an upcoming hook will run anyway, never run the full suite "to be safe" before a commit or push that re-runs it, and never run the same command twice to reformat its output (capture once, filter once). While developing, run the narrowest check that answers the current question (a single test file or project), once. Sprint Exits cite the pre-push gate output as their evidence; a separate manual full-gate pass is forbidden. Local `pnpm build` only when the change plausibly affects the build (CI builds every push). A 12-line copy change must cost minutes, not an hour.
21. **Bot careers FORBIDDEN (CRITICAL, maintainer directive 2026-07-17):** do not run `pnpm balance:run` or any bot-career simulation, for any purpose (gates, sprint Exits, curiosity), until the maintainer explicitly re-authorises it. The bots cannot play the post-Sprint-79 game and their numbers carry no signal until the harness is rebuilt after playtesting. The closed-form coherence and satisfiability probes in Vitest remain fully in force: they are arithmetic, not bots. `python -m balance.cli check`/`report` are suspended with it (they only make sense against freshly generated CSVs). The path-filtered CI balance job is unaffected (it spends CI minutes, not the maintainer's).

## Sprint workflow (mandatory)

All development happens in sprints, driven by the roadmap. Sprint docs live in `docs/sprints/sprintXX.md`. For every sprint:

1. **Read** the roadmap and planning docs (and the previous sprint doc, if any).
2. **Design** `sprints/sprintXX.md` from them: goal, definition of done, task breakdown separating Claude-implementable tasks from user-only tasks (purchases, account setup, anything behind the data air gap). **The design MUST open with a reuse analysis (directive 16): an explicit "new mechanisms" vs. "existing mechanisms to reuse" split, mapping every part of the feature onto what already exists before any code is written.**
3. **Implement** all actions in the sprint doc.
4. **Test** new implementations where relevant; run the narrowest relevant checks once and show
   output. The pre-push hook is the full gate (directive 20); do not re-run it by hand.
5. **Hygiene:** clean up; fill the sprint doc's Exit and checkboxes (that doc is the sprint's permanent record). **Do NOT add a sprint narrative to this file** - it is a quick reference loaded into every session, not a changelog. Touch CLAUDE.md ONLY when a directive, command, locked decision, or the one-line current-state changes; if you are about to describe what a sprint did here, the sprint doc is where that goes. Also check `TODO.md` (repo root) - deliberately deferred items that aren't tied to any specific future sprint number, so they don't get lost in sprint-doc archaeology. Add to it when you defer something with no sprint attached; remove from it once something gets actioned.
6. **Commit** (with user approval per the git safety rule).

## What this repository is

**Ran When Parked** - a browser-based, turn-based garage management sim set in 1995 Japan
(synthwave pixel art, JDM car culture, hunt-build-sell loop). Solo-dev passion project, ~13-month
roadmap to a free itch.io launch.

**Current state:** Sprints 00-84 implemented and committed.

**Where the history lives, and why it is not here.** Each sprint's own
`docs/sprints/sprintNN.md` Exit is its permanent record; `git log` has every hash. **This file
never re-narrates them.** Before new work, read the current sprint's doc and the previous one (per
the Sprint workflow above) plus `TODO.md` (open items with no sprint number attached, including
the standing bot-harness rework and the parts-provenance rework scheduled after Sprint 69).

## Canonical design docs

Source of truth when design questions arise. Don't invent mechanics or cars - check these, and
flag conflicts to the maintainer rather than picking a side (GDD is canonical for mechanics,
roster for car scope). Bibles require explicit maintainer approval, recorded in the doc, to amend.

- `midnight-garage-gdd.md` - the GDD (v0.6). **Feature set FROZEN for v1.0**; new ideas go to
  `IDEAS.md` (the post-launch parking lot - anything there is out of v1.0 by definition), never
  into the GDD.
- `midnight-garage-roadmap.md` - sprint-by-sprint plan (P0-P7), risk register, content pipeline.
- `midnight-garage-roster.md` - car roster + scope tiers. **Contains a secret easter egg ("The
  Zero Legend") - never surface it in public-facing text, devlogs, or marketing.**
- `art-direction.md` - the art bible (locked 2026-07-13): palette, pixel discipline, the
  diegetic/visceral-UI law (binding on all UI work), audio direction. **No AI-generated assets
  ship or appear in public materials, ever.**
- `progression-bible.md` - reputation/specialty/tool-tier law (locked 2026-07-12): four pillars,
  six laws, banned vocabulary.
- `economy-bible.md` - car value, repair cost, parts pricing law (locked 2026-07-14): six laws,
  the anchor inventory, the centralised pricing formula.
- `story-builds-spec.md` (landed Sprints 76-78) and `drive-mode-spec.md` (post-launch) - see
  `TODO.md`.

## Locked technical decisions (GDD §13, roadmap §5)

The stack is decided; do not re-litigate it when scaffolding begins:

- TypeScript (strict) • Vue 3 Composition API • Pinia • Vue Router (memory-history mode; added Sprint 04) • Vite • PixiJS v8 (canvas islands only) • Dexie.js/IndexedDB saves • Zod-validated JSON content • Howler.js audio • Vitest + @vue/test-utils + happy-dom for component tests (the latter two added Sprint 04) • static deploy (Cloudflare Pages / itch.io). Python (polars) for the balance harness. pnpm monorepo.

Planned layout: `packages/sim` (pure TS sim core), `packages/game` (Vue app), `packages/content` (JSON + Zod schemas), `tools/balance` (Python CLI).

Engineering laws that all future code must obey:

1. **Boundary law:** `packages/sim` never imports Vue/Pixi/DOM/Dexie/`@midnight-garage/game` - enforced via ESLint import rules. It does depend on `@midnight-garage/content` (pure data + Zod), never the reverse - that's the one dependency the boundary law permits. Sim contract: `advanceDay(state, queuedActions, seed) → newState + eventLog`, fully deterministic (seeded PRNG; no `Date.now()`/`Math.random()` in sim) - implemented in `packages/sim/src/advanceDay.ts` from Sprint 02 onward.
2. **Content law:** any designer-tunable number lives in JSON under `packages/content`, not in code.
3. **Naming Layer (licensing):** every vehicle separates real `spec` data from swappable `display_name`/`brand` strings; a single config flag flips the whole game to parody names, with a CI test asserting no real-brand string leaks when flagged. Built from the first schema onward. Parts brands are parody-only from day one.
4. **Save law:** **SUSPENDED until launch by directive 19 (2026-07-15) - a schema change is now just a Dexie version bump; no migration, no golden-save test, no legacy-compat branch.** The pre-launch cost was real and bought nothing: there are no players and no old saves. The law as written, in force again the moment the game reaches real players: every save-schema change = Dexie version bump + migration + golden-save test in the same PR. Unaffected either way: call `navigator.storage.persist()` and keep the export-save-string flow prominent (Safari ITP can evict IndexedDB).
5. **Test law:** golden-master seed tests in CI; every fixed sim bug gets a regression test; balance invariants (bot careers → CSV → polars report, `pnpm balance:run` then `python -m balance.cli check`) exist and pass as of Sprint 03. The CI balance job was retired 2026-07-17 along with the whole `check` job (directive 21 and the maintainer's local-only ruling); the Vitest coherence probes are the in-force economic gate. Coverage is measured and gated in the pre-push hook (`pnpm test:coverage`).
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
- `pnpm balance:run` - **FORBIDDEN until the maintainer re-authorises it (directive 21).** Plays all 9 bot strategies (8 archetypes plus `competent-policy`, Sprint 23's measurement probe for the reputation-pacing invariant) through 1,000 seeded 100-day careers each and writes `tools/balance/data/careers.csv` + `careers.manifest.json` (also carrying `startingCashYen`/`weeklyRentYen` since Sprint 23, so the Python check validates against the values that actually ran) plus `auctionWins.csv`/`auctionFieldSizes.csv` for the auction-calibration section (since Sprint 10) and `acquisitions.csv` for the buyout-vs-bid telemetry section (since 2026-07-09). Builds the CLI via a dedicated `packages/sim/tsconfig.cli.json` (CommonJS, run with plain `node`) first, then two post-build fixups: `scripts/mark-commonjs.cjs` (marks the dist subtree CommonJS) and `scripts/fixContentRequires.cjs` (rewrites compiled `require("@midnight-garage/content")` calls to the dist-local relative path - `@midnight-garage/content`'s `package.json` `exports` points at raw `src/index.ts`, which plain Node can't resolve, so `tsconfig.cli.json` compiles it as an explicit root and this script points the requires at the result). Its CI job was retired 2026-07-17 (directive 21).
- `python -m balance.cli report --data-dir tools/balance/data --out tools/balance/report.md` - **suspended with directive 21 (needs fresh CSVs).** Renders the markdown balance report (median/p10/p90 cash + car count at day 25/40/70/100 per strategy, the auction win-price calibration, and the buyout-vs-bid share per strategy). Requires `pip install -e tools/balance` once (polars is the only dependency).
- `python -m balance.cli check --data-dir tools/balance/data` - **suspended with directive 21 (needs fresh CSVs).** Checks 6 balance invariants against the CSV (Sprint 23 decision 7: 3 hard-gated - days-to-`local` pacing, buyout share, the 3 legacy Sprint 03/09 checks - 3 informational with real numbers disclosed rather than force-passed, see `invariants.py`'s module docstring and `sprint23.md`'s Exit); exits non-zero on any hard-gated failure.

CI (`.github/workflows/ci.yml`) contains only a self-contained `deploy` job (push to `main`, Cloudflare Pages once the secrets exist). The former `check` and `balance` jobs were retired 2026-07-17 (maintainer ruling: the pre-push hook is the enforced gate, "just run local"; balance is directive-21-forbidden).
