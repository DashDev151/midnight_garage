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

## Sprint workflow (mandatory)

All development happens in sprints, driven by the roadmap. Sprint docs live in `docs/sprints/sprintXX.md`. For every sprint:

1. **Read** the roadmap and planning docs (and the previous sprint doc, if any).
2. **Design** `sprints/sprintXX.md` from them: goal, definition of done, task breakdown separating Claude-implementable tasks from user-only tasks (purchases, account setup, anything behind the data air gap).
3. **Implement** all actions in the sprint doc.
4. **Test** new implementations where relevant; run the project checks and show output.
5. **Hygiene:** clean up, update docs (including this file and the sprint doc's checkboxes) so they accurately track project state.
6. **Commit** (with user approval per the git safety rule).

## What this repository is

**Midnight Garage** — a browser-based, turn-based garage management sim set in 1995 Japan (synthwave pixel art, JDM car culture, hunt-build-sell loop). Solo-dev passion project, ~13-month roadmap to a free itch.io launch.

**Current state: Sprint 00 implemented (ready for review).** The pnpm monorepo scaffold exists (`packages/sim`, `packages/content`, `packages/game`, `tools/balance`) with CI, the R1 palette-swap art spike, and `docs/economy-v0.md`. Sprint docs live in `docs/sprints/`. User-only Sprint 00 tasks (GitHub remote, Cloudflare secrets, Aseprite, trademark search) are outstanding. The repo holds three authoritative planning documents:

- `docs/design/midnight-garage-gdd.md` — Game Design Document (v0.5). Vision, mechanics, economy, art direction, tech stack. The GDD feature set is **frozen for v1.0**; new ideas go to `IDEAS.md` (private), not into the GDD.
- `docs/design/midnight-garage-roadmap.md` — Sprint-by-sprint plan (P0–P7), risk register, engineering standards, content pipeline.
- `docs/design/midnight-garage-roster.md` — Full car roster with scope tiers (PoC-10 → Go-Live ~48 → expansion packs). **Contains a secret easter egg ("The Zero Legend") — never surface it in public-facing text, devlogs, or marketing copy.**

When design questions arise, these documents are the source of truth. Don't invent mechanics or cars — check the docs, and treat conflicts between them as something to flag to the user (GDD is canonical for mechanics, roster for car scope).

## Locked technical decisions (GDD §13, roadmap §5)

The stack is decided; do not re-litigate it when scaffolding begins:

- TypeScript (strict) • Vue 3 Composition API • Pinia • Vite • PixiJS v8 (canvas islands only) • Dexie.js/IndexedDB saves • Zod-validated JSON content • Howler.js audio • Vitest • static deploy (Cloudflare Pages / itch.io). Python (polars) for the balance harness. pnpm monorepo.

Planned layout: `packages/sim` (pure TS sim core), `packages/game` (Vue app), `packages/content` (JSON + Zod schemas), `tools/balance` (Python CLI).

Engineering laws that all future code must obey:

1. **Boundary law:** `packages/sim` never imports Vue/Pixi/DOM/Dexie — enforced via ESLint import rules. Sim contract: `advanceDay(state, queuedActions, seed) → newState + eventLog`, fully deterministic (seeded PRNG; no `Date.now()`/`Math.random()` in sim).
2. **Content law:** any designer-tunable number lives in JSON under `packages/content`, not in code.
3. **Naming Layer (licensing):** every vehicle separates real `spec` data from swappable `display_name`/`brand` strings; a single config flag flips the whole game to parody names, with a CI test asserting no real-brand string leaks when flagged. Built from the first schema onward. Parts brands are parody-only from day one.
4. **Save law:** every save-schema change = Dexie version bump + migration + golden-save test in the same PR. Also call `navigator.storage.persist()` and keep the export-save-string flow prominent (Safari ITP can evict IndexedDB).
5. **Test law:** golden-master seed tests in CI; every fixed sim bug gets a regression test; balance invariants (bot careers → parquet → polars report) run on content changes.

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

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format, test, build on every push/PR and deploys `main` to Cloudflare Pages once the secrets exist.
