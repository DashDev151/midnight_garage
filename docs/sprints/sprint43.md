# Sprint 43 - The tool wall: reputation-gated machinery and a readable tech tree

**Source:** `docs/playtest-notes-2026-07-13.md` item 8, maintainer decision 1 (tiers 2 AND 3
rep-gated - a deliberate amendment to the progression bible's "cash is the only gate on
capability" law). Goal: machinery purchases respect reputation like facilities do, and the
Upgrades screen becomes a per-line ladder that explains what every tier actually unlocks.

## Reuse analysis (directive 16)

**New mechanisms:**

- `minReputationTier` on tool-line tiers 2/3 (content + schema + sim gate).
- The tech-tree layout (a 6-column ladder grid) with derived per-tier unlock info boxes.

**Existing mechanisms that MUST be reused:**

- The facilities gating pattern is copied wholesale: `minReputationTier` content field
  (`facilities.json` / `BayFacilitySchema`), `reputationAtLeast`, the
  `nextBayMinReputationTier` -> `applyBayPurchase` refusal shape (`facilities.ts:243-281`), and
  the UpgradesScreen `.rep-hint` UI treatment. Tool lines get the SAME field name, the same
  helper shape (`nextToolTierRepGate`), the same hint styling - one gating vocabulary, two
  purchasable things.
- Unlock info is DERIVED from existing content, zero new authored strings:
  `serviceJobTemplates.json` tasks' `minToolTier` mapped to lines via the existing
  carPartId -> group taxonomy lookup (templates whose tasks need this line at this tier = "jobs
  this tier makes offerable"), `economy.json` `toolCeilings.naToTurboConversionEngineTier`
  (engine tier 3's own-car unlock), and the labor rule (`ceil(grades / tier)` slots) for the
  speed line. `toolDeficitSummary`/offer-rule vocabulary already exists sim-side.
- `toolLineViews` (gameStore) extends with the new fields - no parallel view model.

## Decisions

1. **Content.** `ToolLineTierSchema` gains `minReputationTier: ReputationTierSchema.optional()`;
   a refinement enforces tier 1 never carries it (tier 1 is owned from day one - gating it is
   meaningless). First-pass values, uniform across all six lines: tier 2 `local`, tier 3 `known`
   (mirrors the bay ladder's feel; per-line variation is future tuning bait). The progression
   bible's law text is amended in the same commit: tools gate on cash AND reputation as of the
   2026-07-13 maintainer decision, with the original cash-only rationale preserved as history.
2. **Sim.** `applyToolUpgrade` (`toolLines.ts:58-78`) adds the reputation refusal between the
   tier-cap and cash checks, mirroring `applyBayPurchase`; new `nextToolTierRepGate(state,
   componentId, context)` helper mirrors `nextBayMinReputationTier` for the UI. Bots that call
   `applyToolUpgrade`-backed actions (handyman's `considerToolUpgrade` path) need no edits - the
   resolver refuses and the bot's intent no-ops, same contract as an unaffordable upgrade; note
   the expected harness effect in Exit (handyman's upgrade timing may shift later).
3. **UI: the tool wall.** UpgradesScreen's tools section becomes a 6-column grid (one column per
   line), each column a 3-node vertical ladder: owned tiers filled, next tier showing price +
   reputation requirement (rep-hint when unmet), locked tier dimmed. Selecting/hovering a node
   shows its info box: (a) jobs it makes offerable - template display names derived per the reuse
   analysis, (b) engine tier 3 additionally lists the NA-to-turbo conversion unlock, (c) the
   speed effect line ("repair work takes ceil(grades / tier) labor slots"). Pure CSS grid - no
   diagram library (stay on stack).
4. **Tests.** The existing test asserting NO rep hint on tools
   (`UpgradesScreen.test.ts:40-49`) inverts to assert the gate + hint; sim tests mirror the bay
   gate tests (refused below tier, allowed at tier, cash still checked); a derivation test pins
   that an engine tier-3 info box lists at least the known tier-3 engine templates and the turbo
   conversion. Update the screen's help copy (it currently states tools are never rep-locked) and
   the stale `facilities.ts:14-15` doc comment found during triage.

## Tasks

1. Content: schema field + refinement + toolLines.json values; progression-bible amendment;
   facilities.ts comment fix.
2. Sim: gate + helper + tests.
3. Game: toolLineViews extension, tool-wall grid + info boxes + rep hints, test inversion +
   derivation tests, help-copy update.
4. Verification: full gate; balance harness sanity run (handyman is the strategy to watch -
   disclose, do not deep-tune). Update this doc's Exit + CLAUDE.md current-state note for the
   sprint block.

## Definition of done

- Tool tier 2/3 purchases refuse below local/known reputation respectively, with the same UI
  affordance facilities use; tier 1 untouched.
- The tools section reads as six 3-step ladders; every next-tier node explains price, reputation,
  and what it unlocks - all derived, no hand-authored unlock lists.
- Progression bible amended; no doc still claims tools are cash-only.
- Full gate + harness hard invariants green.

## Exit

Implemented directly (no subagents), all four tasks done. This sprint had been designed on
2026-07-13 but never actually built - work moved on to Sprint 44 without it - discovered and
flagged by the maintainer, who then approved implementing it now, out of order, followed by a
combined commit of the Sprint 44 + auction-lot-id-fix + Sprint 45 work already sitting done in the
same tree.

### Files touched

Content:

- `packages/content/src/toolLines.ts` - `ToolLineTierSchema` gained `minReputationTier:
  ReputationTierSchema.optional()`; two new `ToolLineSchema` refinements (tier 1 must never carry
  it, tiers 2/3 always must).
- `packages/content/data/toolLines.json` - every line's tier 2 gained `"minReputationTier":
  "local"`, tier 3 `"minReputationTier": "known"` (uniform across all six lines, per decision 1).
- `docs/design/progression-bible.md` - the pillar table's Reputation row and the "Tools have no
  reputation gates" standing decision both amended (dated, with the original cash-only rationale
  kept as history, per the doc's own amendment-recording rule).

Sim:

- `packages/sim/src/toolLines.ts` - new `nextToolTierRepGate(state, componentId, context)`
  (mirrors `nextBayMinReputationTier` exactly); `applyToolUpgrade` gates in order: tier-cap ->
  reputation -> cash (matches the sprint doc's specified order, not `applyBayPurchase`'s
  price-then-reputation order).
- `packages/sim/src/bots/toolUpgradeHelpers.ts` - doc comment only (no logic change, per decision
  2): rewritten to describe the new no-bot-awareness contract instead of asserting a gate that no
  longer exists.
- No stale `facilities.ts:14-15` comment was found at today's line numbers (Sprint 45's own
  rewrite of that file already replaced whatever the design doc's triage-day comment referred to) -
  task 1's "facilities.ts comment fix" is a no-op, not skipped.

Game:

- `packages/game/src/stores/gameStore.ts` - `ToolLineView` gained `nextTierRepGate` and a full
  `tiers: ToolTierRungView[]` ladder; new `toolTierInfo(componentId, tier)` derives the info-box
  content live from the real catalog (job templates whose task list needs exactly this tier in
  this group, humanized from their kebab-case id since templates have no other player-facing name
  anywhere in the game; the engine-tier-3 NA-to-turbo ceiling; the `ceil(grades/tier)` speed-effect
  line).
- `packages/game/src/screens/UpgradesScreen.vue` - the Tools section rewritten from a flat list
  into a 6-column x 3-rung CSS grid ("the tool wall"): owned rungs green-bordered, the one
  next-purchasable rung cyan-bordered with its live Upgrade button + rep-hint, everything past
  that dimmed/locked. Any rung (owned, next, or locked) is clickable and toggles a shared info box
  below the grid showing what that tier unlocks. Help copy corrected (used to claim tools are
  cash-only).
- `packages/game/src/screens/UpgradesScreen.test.ts` - the old "tools are never reputation-gated"
  test fully inverted (decision 4): now asserts the gate refuses below the floor and succeeds once
  cleared; plus new tests for the tool-wall grid shape and the info box's toggle/content.
- `packages/game/src/stores/gameStore.toolLines.test.ts` - every fixture that upgrades past tier 1
  now sets `reputationTier` to the real content requirement; one new test asserting the reputation
  refusal specifically (unlimited cash, no reputation).
- `packages/sim/tests/toolLines.test.ts` - the old "has NO reputation gate" test inverted into two
  (refuses below the floor, succeeds once cleared); new `nextToolTierRepGate` describe block
  (fresh-game requirement, met-already null, maxed null, tier-3's own higher requirement once tier
  2 is owned); every `applyToolUpgrade`/`applyToolUpgrades` fixture that climbs past tier 1 updated
  to set `reputationTier` to the real requirement rather than relying on the old ungated behavior.

### A real, substantial finding (not a defect - disclosed and deferred, per maintainer direction)

Fixing this sprint's own downstream test fallout surfaced something bigger than the sprint doc's
task 4 anticipated ("handyman's upgrade timing may shift"). Two `runCareer.test.ts` assertions
failed:

- Cautious Restorer: 200/200 seeded careers still bootstrap into car ownership, but only 2/200
  ever clear tier 2's reputation floor on ANY of the six lines (was a documented majority before).
- Handyman (the tier-payback archetype whose entire identity is investing in tools): 0/30 seeded
  100-day careers ever upgrade a single tool line - a complete lockout, not a delay.

Root cause, confirmed structural: neither bot runs service jobs, and neither bot's sales reliably
clear the clean/concours quality bar - the only two ways reputation accrues in this sim - so a
cash-only-progression bot has no realistic route to `local` no matter how much cash it holds.
Raised to the maintainer before proceeding further (this could have been read as the gate being
miscalibrated); maintainer verdict (2026-07-13): this is the simulation exposing a bot playing the
game in an unintended way, and losing tool access as a consequence is correct, not a defect - fix
the bots' behavior later, not the gate now. Both `runCareer.test.ts` assertions were rewritten to
the honestly-measured reality (near-total/total lockout) with full disclosure comments, matching
this file's own established precedent elsewhere; a new TODO.md item records it as deferred
(`Handyman and Cautious Restorer have no realistic route to reputation...`).

### Verification

Full gate, all green:

- `pnpm typecheck` (content/sim/game) - clean.
- `pnpm lint` - clean.
- `pnpm format` - clean (Prettier reflowed 3 files; no logic changes).
- `pnpm test:coverage` - **931/931 tests pass**, 74/74 files. Coverage: statements 90.95%, branches
  80.85%, functions 91.79%, lines 94.81% (gate: 80/65/78/82).
- `pnpm build` - clean.

Balance harness - all hard invariants PASS:

- Days-to-`local` (competent-policy probe): p50=12.0 days, in [10,35] (934/1000 seeds reached
  `local`).
- Buyout share: 0.0% (< 30% gate).
- Passive Grinder solvency, Flipper-vs-Passive separation, and the sanity floor all pass.

Disclosed (informational, not gated): most non-passive strategies' day-100 median cash rose
substantially relative to the Sprint 45 commit's own report (balanced-player Y110,888 ->
Y887,406; flipper -Y7,306 -> Y824,170; cautious-restorer -Y71,812 -> Y524,096; random Y40,457 ->
Y547,004) - the direct, expected mechanism: bots that used to spend cash on now-reputation-refused
tool upgrades simply keep that cash instead, which also feeds into more/better auction bids
system-wide (auction win rows 87,957 -> 134,469 across the same 1000-seed run). This is the
predictable shape of blocking one spending path for cash-only-progression bots, not an unrelated
regression - every hard-gated invariant still passes, and competent-policy (the one bot with a
real reputation faucet) continues to clear its own tool tiers and improved further (day100 median
Y1,322,708 -> Y1,519,846).

### Deviations from the spec / notable calls

- The stale `facilities.ts:14-15` doc comment task 4 called out no longer exists at current line
  numbers (Sprint 45 rewrote that file's top section entirely) - treated as already resolved, not
  skipped.
- The "jobs this tier makes offerable" info-box content (decision 3a) has no existing
  player-facing template display name anywhere in the game to reuse (players only ever see a
  generated job's own flavor text) - implemented as a straight humanization of each template's
  kebab-case catalog id ("cooling-system-service" -> "Cooling System Service"), which is real,
  derived, catalog-sourced text, not hand-authored copy, matching the reuse analysis's "zero new
  authored strings" intent as closely as the actual content allows.
- The severity of the reputation gate's effect on cash-only bot archetypes (see above) was
  significant enough to raise to the maintainer mid-implementation rather than silently disclosing
  it after the fact - confirmed as an intended consequence, not a design defect, before finishing
  the sprint.

Nothing has been committed yet as of writing - queued for its own commit immediately after this
Exit is filled in, per the maintainer's explicit instruction ("finish the sprint and defer this for
later" / "then commit").
