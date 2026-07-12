# Arc: Progression Rework (Sprints 36-39)

*Source: maintainer redesign directive 2026-07-12, after the day-one job-board failure exposed the
equipment system as structurally rotten. The design PRINCIPLES live in
`docs/design/progression-bible.md` (canonical, maintainer-locked); this doc is the arc's execution
spine; each sprint doc (`sprint36.md`-`sprint39.md`) grounds one slice in the codebase. Read
`CLAUDE.md` in full first; no em dashes anywhere.*

## Why this arc exists

The equipment system is a binary ownership gate: a job is either doable (machine owned) or
impossible (not owned). Everything wrong with the early game flows from that one choice: day one
is a dead zone, the job board must either show impossible work (the playtest-aborting bug) or
filter down to a monotone board (what interim fix `dc306d9` exposed), and progression is a cliff.
The maintainer's directive, by analogy to Stardew Valley's tools: the player starts with ALL the
tools, just bad versions; progression upgrades them through tiers.

## The model in one paragraph (full rules: the bible)

Four pillars, no double-dipping: **Reputation** (the existing 5-tier ladder) gates breadth
(auctions, job tiers, clientele); **Specialty** (per-discipline word of mouth, new) gates depth
(offer mix, in-lane premium, techniques, the shop title); **cash** buys capability and nothing
reputational; **capability** (tool tiers, bays, staff) sets throughput and ceilings. Nothing basic
is ever locked; early difficulty is scarcity, not walls; everything is revealed diegetically;
every unlock is a named real thing; nothing decays.

## The tool-line model (grounded in the codebase)

Tool lines are keyed by the EXISTING 6-group `ComponentId` vocabulary (`packages/content/src/
tags.ts`: engine, drivetrain, suspension, wheels, body, interior): the sim already speaks groups
everywhere, and `repairLevel 1|2|3` per group already exists (`bands.ts` `repairLevelForGroup`,
defaulting to 1 with nothing owned). The rework re-sources that same number from a persistent
`toolTiers: Record<ComponentId, 1|2|3>` (all 1 at new game) instead of an ownership scan. The
lift/engine/body/trim fantasy lives in the tier display names (content JSON).

Two axes per line:
- **Efficiency (always available):** labor is `ceil(grades / repairLevel)` (`slotsNeededToClimb`),
  and tier IS the repairLevel. Unchanged formula, re-sourced input.
- **Capability ceiling (unlocks):** service-job tasks carry `minToolTier`; fabrication-grade work
  needs tier 2-3 (the bolt-on vs built line). Below it, work is not offered and not startable.

Kept deliberately: payouts price worst-case (tier 1) labor (`serviceJobCostBreakdown`); better
tools finish faster and the freed labor is the upgrade's payoff.

### What this deletes

The ownership gate (`hasEquipmentFor` as refusal), the accept-time equipment refusal, the
offer-generation actionability filter (including interim fix `dc306d9`), the equipment-hint
reroll, `ownedEquipmentIds` itself, and the bots' buy-or-skip equipment logic.

## Sprint plan

- **Sprint 36 - Tool lines (mechanical core).** `toolTiers` replaces `ownedEquipmentIds`;
  `toolLines.json` replaces `equipment.json`; upgrade action replaces buy action; all gates
  deleted; bots re-based; Dexie v23 + migration + golden test; UpgradesScreen becomes tier
  ladders. Fully specified in `sprint36.md` (prices, consumables, migration map, offer rule).
- **Sprint 37 - The job ladder (content).** 32 fully-specified templates (17 kept, 15 new) in
  bolt-on -> involved -> fabrication ladders across all six lines; day-one board asserted diverse
  AND honest; the NA-to-turbo own-car ceiling. Template table in `sprint37.md`.
- **Sprint 38 - Specialty (identity axis).** Per-discipline specialty beside reputation, earned
  from service work per group; offer bias + in-lane premium; additive save bump; diegetic copy
  only. Exact formulas and tunables in `sprint38.md`.
- **Sprint 39 - Techniques + shop title (the reveal).** Six named techniques unlocking six
  signature templates; the derived shop title; no new save state. Tables in `sprint39.md`.

Each sprint lands independently: full gate + balance harness + commit. Harness probes re-base
deliberately per sprint with movement disclosed, never silently forced green.

## Governance (maintainer-owned)

- The GDD's equipment model (S3.2, S9.0, S9.1, S6.1) is amended by this arc; a draft diff is
  produced in Sprint 39 for maintainer sign-off. Note: GDD S9.0 already says "Tools, not levels",
  so the arc sharpens the GDD's stated intent.
- `docs/design/skill-progression.md` (pre-arc) is reconciled against the bible at arc close:
  superseded content archived, not deleted (clean-codebase rule).
- The build logbook / wall-of-builds idea goes to `IDEAS.md` (post-launch).

## Balance-harness impact (known up front)

`equipmentOwnedCount` keeps its CSV column name but counts tier upgrades (sum of tiers minus 6).
Handyman becomes the tier-upgrade archetype; Investor stays the never-upgrades control. The
days-to-`local` invariant keeps its meaning (reputation pacing) but its numbers will move;
re-based per sprint with maintainer disclosure. Sprint 38 adds informational specialty columns.
