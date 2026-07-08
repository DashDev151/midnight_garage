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
13. **Token discipline:** when investigating (not editing), read narrowly — scope to the relevant file or symbol. Never load data files into context: inspect schema, row counts, and a small sample by command. Filter command and test output to what matters.
14. **No commit co-authorship line:** never add a "Co-Authored-By: Claude" (or any similar tool-attribution) line to a commit message, under any circumstance.

## Sprint workflow (mandatory)

All development happens in sprints, driven by the roadmap. Sprint docs live in `docs/sprints/sprintXX.md`. For every sprint:

1. **Read** the roadmap and planning docs (and the previous sprint doc, if any).
2. **Design** `sprints/sprintXX.md` from them: goal, definition of done, task breakdown separating Claude-implementable tasks from user-only tasks (purchases, account setup, anything behind the data air gap).
3. **Implement** all actions in the sprint doc.
4. **Test** new implementations where relevant; run the project checks and show output.
5. **Hygiene:** clean up, update docs (including this file and the sprint doc's checkboxes) so they accurately track project state. Also check `TODO.md` (repo root) — deliberately deferred items that aren't tied to any specific future sprint number, so they don't get lost in sprint-doc archaeology. Add to it when you defer something with no sprint attached; remove from it once something gets actioned.
6. **Commit** (with user approval per the git safety rule).

## What this repository is

**Midnight Garage** — a browser-based, turn-based garage management sim set in 1995 Japan (synthwave pixel art, JDM car culture, hunt-build-sell loop). Solo-dev passion project, ~13-month roadmap to a free itch.io launch.

**Current state: Sprint 06 implemented, ready for review** (Sprints 03-05 committed & pushed through `c6f602f`: Sprint 05 `ffc9be4`, Sprint 04 `da7c2fb`, Sprint 03 `fa6cc79`, Sprint 02 `97af527`, Sprint 01 `832e47b`, Sprint 00 `00b44e2`; Sprint 06 not yet committed). Sprint 06 (Auction & market screens) closes the buy->build->sell loop: an auction screen (`/auctions`) lists the weekly catalog by tier with inspect + max-bid controls (resolved via the existing second-price `resolveAuction`), the car-detail screen gained a sell flow (walk-in offer or public listing), and a lean parts market (`/parts`) lets the player buy catalog parts to install. New sim mechanics this sprint: `buyParts` and `buyoutLots` (both additive `DayActions` fields + `advanceDay` resolution + log entries; golden-master unchanged). A post-review pass added the **auction Interest meter** (`computeLotInterest` — a fuzzy rival-demand read: level + expected-clearing range + contender count, with a `precision` hook for a future "auction scout" staff trait) and **instant buyout** (pay 1.1x book to win a lot guaranteed), fixing bid "blindness"; a proposed *timed/real-time* bidding war was **rejected** for conflicting with the no-reflex-input pillar. The store's pending plan generalized from `pendingJobs` to a full `pending: DayActions`. A shared `emptyDayActions()` was added to `sim/actions.ts` (bots use it now). 160 tests. **Next focus (user-directed): interactive service/walk-in jobs** — the Act 1 early-game floor + tutorial vehicle (see `TODO.md`); its sequencing vs. Sprint 07 persistence is an open user call. Still in-memory only — persistence (Dexie + export/import + the save law) is Sprint 07, which also retires the dev-grant crutch. Real acquisition works now; dev grants remain for convenience. Detail in `docs/sprints/sprint06.md`. **The economy is now playable end to end and assessable by feel** — the open "too simplified" concern (see `TODO.md`) finally has a surface to judge against; Sprint 08 is the Fun Gate. Sprint 04 stood up the Vue app shell and the state bridge: two Pinia stores in `packages/game/src/stores/` — `useGameStore` (wraps a real `GameState` + `SimContext`, exposes `newGame`/`endDay` calling `advanceDay`, the object Dexie will persist in Sprint 07) and `useUiStore` (ephemeral view flags) — a `vue-router` shell in `createMemoryHistory()` mode (Garage + Spike routes, lazy-loaded so Pixi stays out of the garage chunk), provisional synthwave design tokens + a wired-but-file-later OFL pixel font, and a dev-only console (give-cash / warp-days) that is tree-shaken out of the production bundle. The DoD is live: **End Day advances the real sim in the browser** — cash drains to rent, catalogs refresh, all in a live event log, entirely from `advanceDay` (empty `DayActions` this sprint; real player actions are Sprints 05-06). Sim gained `newGame.ts` (`createInitialGameState`, moved out of the bots module; `runCareer` imports it). Still in-memory only — persistence is Sprint 07. Detail in `docs/sprints/sprint04.md`. The economy is now playable end-to-end in the sim: auction generation, second-price sealed-bid resolution with per-bidder personality noise, shared buyer valuation, and two sell channels, all wired into `advanceDay` (which gained a 4th `SimContext` parameter carrying the static content catalogs). Five bot strategies (`packages/sim/src/bots/`) — Flipper, Cautious Restorer, Balanced Player, Random (a control added at user request), Passive Grinder — play 1,000 seeded 100-day careers each via `pnpm balance:run`; `python -m balance.cli report`/`check` render a markdown report and check 5 invariants (all passing on the real 500,000-row run). **CI wiring is deliberately deferred by user decision** — the harness runs locally, by hand, not on every push (tracked in `TODO.md`, no sprint number attached). This sprint also fixed a real formula bug (buyer valuation was capped below book value, making profit structurally impossible) and corrected `docs/economy-v0.md`'s starting cash (¥1.2M → ¥1.5M — the original left zero operating margin against 100 days of rent). Cautious Restorer's day100 result is honestly negative — a documented, un-gated finding, not a hidden bug. The Random bot's bidding was also caught and fixed mid-review: its "restore" archetype had copied Cautious Restorer's 1.1x bid premium without also copying the reason (Cautious Restorer earns that premium by always inspecting first) — an unearned premium that was winning 78% of its auctions purely by overpaying. Bid size is now uniform across all three Random archetypes. **User's standing review note (2026-07-08, tracked in `TODO.md`): the economy simulation is still considered too simplified** — the framework is good enough to build on, but don't treat Sprint 03's invariants passing as proof the economy itself is right. Full detail, including every implementation-time finding, is in `docs/sprints/sprint03.md` — don't duplicate it here. Sprints 00-02 built the monorepo/CI/art-spike, the full content data model + Naming Layer, and `advanceDay`'s labor/job/rent core, respectively — see their own sprint docs for detail. **Cloudflare Pages deploy is deferred by user decision** — the CI deploy step self-skips until the secrets exist; revisit before Sprint 8 (Fun Gate). Sprint docs live in `docs/sprints/`. Remaining user tasks: Cloudflare setup, Aseprite, trademark search (also tracked in `TODO.md`). The repo holds three authoritative planning documents:

- `docs/design/midnight-garage-gdd.md` — Game Design Document (v0.5). Vision, mechanics, economy, art direction, tech stack. The GDD feature set is **frozen for v1.0**; new ideas go to `IDEAS.md` (repo root, tracked), not into the GDD. `IDEAS.md` is the post-launch parking lot — anything there is out of v1.0 scope by definition. Note: it records a maintainer-sanctioned *post-launch* exception to two hard design rules below (an optional, zero-weight driving minigame) — so don't flag that idea as a rules violation; it's an accepted, deliberately-deferred opt-in, not an oversight.
- `docs/design/midnight-garage-roadmap.md` — Sprint-by-sprint plan (P0–P7), risk register, engineering standards, content pipeline.
- `docs/design/midnight-garage-roster.md` — Full car roster with scope tiers (PoC-10 → Go-Live ~48 → expansion packs). **Contains a secret easter egg ("The Zero Legend") — never surface it in public-facing text, devlogs, or marketing copy.**

When design questions arise, these documents are the source of truth. Don't invent mechanics or cars — check the docs, and treat conflicts between them as something to flag to the user (GDD is canonical for mechanics, roster for car scope).

## Locked technical decisions (GDD §13, roadmap §5)

The stack is decided; do not re-litigate it when scaffolding begins:

- TypeScript (strict) • Vue 3 Composition API • Pinia • Vue Router (memory-history mode; added Sprint 04) • Vite • PixiJS v8 (canvas islands only) • Dexie.js/IndexedDB saves • Zod-validated JSON content • Howler.js audio • Vitest + @vue/test-utils + happy-dom for component tests (the latter two added Sprint 04) • static deploy (Cloudflare Pages / itch.io). Python (polars) for the balance harness. pnpm monorepo.

Planned layout: `packages/sim` (pure TS sim core), `packages/game` (Vue app), `packages/content` (JSON + Zod schemas), `tools/balance` (Python CLI).

Engineering laws that all future code must obey:

1. **Boundary law:** `packages/sim` never imports Vue/Pixi/DOM/Dexie/`@midnight-garage/game` — enforced via ESLint import rules. It does depend on `@midnight-garage/content` (pure data + Zod), never the reverse — that's the one dependency the boundary law permits. Sim contract: `advanceDay(state, queuedActions, seed) → newState + eventLog`, fully deterministic (seeded PRNG; no `Date.now()`/`Math.random()` in sim) — implemented in `packages/sim/src/advanceDay.ts` from Sprint 02 onward.
2. **Content law:** any designer-tunable number lives in JSON under `packages/content`, not in code.
3. **Naming Layer (licensing):** every vehicle separates real `spec` data from swappable `display_name`/`brand` strings; a single config flag flips the whole game to parody names, with a CI test asserting no real-brand string leaks when flagged. Built from the first schema onward. Parts brands are parody-only from day one.
4. **Save law:** every save-schema change = Dexie version bump + migration + golden-save test in the same PR. Also call `navigator.storage.persist()` and keep the export-save-string flow prominent (Safari ITP can evict IndexedDB).
5. **Test law:** golden-master seed tests in CI; every fixed sim bug gets a regression test; balance invariants (bot careers → CSV → polars report, `pnpm balance:run` then `python -m balance.cli check`) exist and pass as of Sprint 03, but run locally on demand only — CI wiring is deliberately deferred by user decision (see `docs/sprints/sprint03.md`).

## Hard design rules (accessibility & scope)

- **No reflex-based input anywhere** — no QTEs, no timing bars. Everything is decision-paced.
- No real-time waiting, energy systems, or monetized timers. Turn-based days: nothing happens while the browser is closed.
- No driving gameplay — events resolve via pre-run decisions + animated resolution.
- Currency is era-authentic yen (¥), everywhere.

## Commands

Run from the repo root (pnpm workspace):

- `pnpm install` — install all workspace dependencies
- `pnpm typecheck` — `tsc --noEmit` in sim/content, `vue-tsc --noEmit` in game
- `pnpm lint` — ESLint (includes the sim boundary-law rule)
- `pnpm format` / `pnpm format:fix` — Prettier check / write
- `pnpm test` — Vitest across all workspace projects; single project: `pnpm test --project sim`; single file: `pnpm test packages/sim/tests/rng.test.ts`
- `pnpm build` — production build of `packages/game` (Vite)
- `pnpm dev` — game dev server (long-running: give this to the user to run, never run it yourself)
- `pnpm balance:run` — plays all 5 bot strategies through 1,000 seeded 100-day careers each and writes `tools/balance/data/careers.csv` + `careers.manifest.json`. Builds the CLI via a dedicated `packages/sim/tsconfig.cli.json` (CommonJS, run with plain `node` — no new runtime dependency) first. **Not wired into CI** — run it locally whenever you want fresh numbers.
- `python -m balance.cli report --data-dir tools/balance/data --out tools/balance/report.md` — renders the markdown balance report (median/p10/p90 cash + car count at day 25/40/70/100 per strategy). Requires `pip install -e tools/balance` once (polars is the only dependency).
- `python -m balance.cli check --data-dir tools/balance/data` — checks the 5 balance invariants against the CSV; exits non-zero on any failure.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format, test, build on every push/PR and deploys `main` to Cloudflare Pages once the secrets exist. It does **not** run the balance harness — that's a deliberate, user-requested deferral (see `docs/sprints/sprint03.md` and `TODO.md`), not an oversight; don't add it without being asked.
