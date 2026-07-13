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

(filled at completion)
