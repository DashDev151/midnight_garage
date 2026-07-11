# External review request — 2026-07-10

## Context

**Midnight Garage** is a browser-based, turn-based garage management sim set in 1995 Japan (hunt →
restore → sell/enshrine JDM cars). Solo-dev passion project, targeting a free itch.io launch. Stack:
TypeScript (strict), Vue 3 + Pinia, Vite, PixiJS (canvas islands only — most of the UI is plain
Vue/CSS, not canvas), Dexie/IndexedDB saves, Zod-validated JSON content, pnpm monorepo
(`packages/content`, `packages/sim`, `packages/game`), plus a Python/polars balance harness
(`tools/balance`) that plays scripted bot careers through the real sim for statistical calibration.

`packages/sim` is a pure, deterministic core (seeded PRNG only, no wall-clock/Math.random, no
Vue/DOM/Pinia imports — enforced by lint) that exposes one contract:
`advanceDay(state, queuedActions, seed, context) -> newState + eventLog`. Everything else (the Vue
app, the balance harness) is a caller of that function.

A prior external review (through Sprint 07) is at `docs/reviews/external-review-2026-07.md` — useful
for calibrating tone/depth, not required reading.

## What's in scope

**Primary focus: Sprints 15 through 19c**, all implemented 2026-07-10 in a single compressed session,
**none yet committed** (except 15-18, which are committed but also unplaytested). This is the newest,
most architecturally significant, least-externally-vetted work in the codebase — real risk of tunnel
vision from rapid same-session iteration. In order:

- **15** — Reputation system: `reputationPoints`/`reputationTier` derivation, quality/lemon sale bonuses.
- **16** — Progression gating: equipment/facility/auction-tier access gated by reputation; new Upgrades tab.
- **17** — Drag-and-drop garage UI; a real positional slot model for service bays/parking (two rounds —
  round 2 was a rework after real playtesting found round 1 broken).
- **18** — Staged repair/install workflow (stage-then-confirm, mirroring the parts-cart pattern) + parts
  inventory UI (also two rounds — round 2 was a UI redesign after the maintainer found round 1 unusable).
- **19 / 19b / 19c** — Full auction rework: multi-day bidding replacing instant resolution, then two
  same-day correction passes (first-price instead of second-price resolution, escalation-model fixes,
  dynamic buyout pricing, bidder-economics retuning). The single largest and most mechanically invasive
  change in the project's history — three sprints of real design iteration in one sitting.

**Secondary, lower priority:** anything in Sprints 00-14 you notice in passing is welcome feedback, but
that range already went through the prior review and has more real-world mileage on it.

## What we want out of this

1. **Correctness** of the sim logic, especially the auction rework (19/19b/19c) — probability/economic
   reasoning, edge cases, RNG determinism, the boundary law.
2. **Design/architecture consistency** with the project's own stated rules (see `CLAUDE.md`'s Core
   directives and Engineering laws) — reuse-first design, save law, single responsibility.
3. **Anything a fresh reader catches** that same-session iteration would miss — this is the main value
   of an outside pass.
4. Test coverage adequacy — not just "do tests pass" but "are they testing the things that matter."

## Where to start reading, in order

1. `CLAUDE.md` — core directives, engineering laws, current commit/sprint state (kept intentionally
   short; full history lives in the sprint docs below, not duplicated here).
2. `docs/design/midnight-garage-gdd.md` — the frozen-for-v1.0 design doc; canonical for mechanics.
3. `docs/sprints/sprint15.md` through `sprint19c.md` — one doc per sprint in scope. Each opens with a
   mandatory reuse analysis (what's new vs. what's reused) and closes with an Exit section documenting
   what actually shipped, including deviations and bugs found during implementation — read the Exit
   sections if you only have time for one part of each.
4. `TODO.md` — everything currently known-open, including several fresh, unresolved findings from
   today (see below) — check this before flagging something we already know about.
5. `IDEAS.md` — deliberately out-of-scope/parked ideas, for context on what's intentionally not built.

## Known open items — please don't re-discover these, engage with them if relevant

- **None of Sprint 19/19b/19c has been played in a real browser yet.** `pnpm dev` review is pending.
- **The balance harness (`pnpm balance:run`) was run today for the first time since before Sprint 15.**
  It found and we fixed three real, previously-undetected bugs (Cautious Restorer was completely inert
  — see `TODO.md`'s Sprint 19c entries and `docs/sprints/sprint19c.md`'s Exit). It proves the mechanism
  works; it does not validate that any of this is actually fun to play — that's a known, standing,
  unresolved gap, not something we expect this review to close.
- **Auction duration has an outsized effect on how competitive an auction feels**, even within the
  "standard" 2-4 day band — a real, measured, unresolved calibration finding (`TODO.md`).
  Root-caused but not fixed; flagged as needing human playtesting judgment, not another constant tweak.
- **The hidden-issues/inspection mechanic (apex seals etc.) is currently non-functional as a real
  mechanic** — verified dead code and no persistent player-facing effect (`TODO.md`). Flagged for a
  future redesign, not attempted here.
- **Cautious Restorer still can't reliably earn reputation within 100 days** even after today's fixes —
  a genuine economic tension (needs ~Y3.85M in one-time equipment before it can ever sell a car under
  its "always fully restore" rule) rather than a bug, disclosed rather than silently patched.

## Constraints worth knowing before flagging something as a problem

- `packages/sim` importing Vue/DOM/Pinia is a real lint-enforced violation — flag it, but it shouldn't
  be present.
- Any `GameState` schema change should carry a `SAVE_VERSION` bump + migration-or-safe-default +
  golden-save test in the same commit (`packages/game/src/save/saveCodec.ts`'s doc comment has the
  full version history).
- Git history: destructive operations (`reset --hard`, `rebase`, force-push) are off-limits project
  convention — please don't run them against this repo even to test something locally.
