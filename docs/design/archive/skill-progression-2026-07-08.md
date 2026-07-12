<!--
Archived 2026-07-12 (Progression Rework arc, Sprint 39 close-out). This is the original
2026-07-08 design note, preserved verbatim as the historical record. It has been superseded by
the reconciled `docs/design/skill-progression.md` (which keeps this doc's still-valid staff/
player skill design, but updates the "Tools, not levels" framing to the real Sprint 36 tool-tier
mechanism and cites `docs/design/progression-bible.md` as canonical). Kept per the clean-codebase
rule: archive, don't delete.
-->

# Skill & Progression Design (planned - not yet scheduled)

*Design note for a later sprint, added 2026-07-08 at the maintainer's request. Elaborates GDD §7
(staff) and the "Tools, not levels" progression philosophy. Staff skill lands with the staff system
(roadmap Sprint 13); the player-character skill profile is new v1.0 scope, slotted against the
service-jobs feature (a light version) with the rest as a fast follow. Numbers here are
placeholders for the balance harness / economy pass to set.*

## The idea

Put the player character or a staff member to work on a task and they **get better at that kind of
task over time** - learn-by-doing XP. A seasoned engine builder finishes faster, wastes less, and
turns out cleaner work than a green one. Skills grow from the work you'd do anyway; they are not a
separate grind.

## The load-bearing guardrail: skill *optimizes*, it never *unlocks*

The GDD's progression is deliberately **"Tools, not levels"** - job *tiers* are gated by shop
equipment + reputation, and "money alone never skips the climb." Skill must not quietly become a
levels-gate. The clean, and frankly better, split:

- **Tools + reputation gate WHAT you can attempt.** No two-post lift, no engine-out work - period.
  No amount of skill bypasses a missing tool.
- **Skill governs HOW WELL you do what you're already allowed to do** - efficiency, quality, cost.

Hold that line and skill *complements* "Tools, not levels" instead of fighting it. The moment a
skill level unlocks a job tier, the philosophy breaks. **Rule: skill optimizes, tools/rep unlock.**

A nice consequence: it creates a real delegation decision - *do I wrench this engine myself (I'm
fast at it) or hand it to my green junior so I'm free for something else, knowing they'll be slow
until they learn?*

## The model (shared by player and staff)

Reuse the four stats already on `StaffMemberSchema` (`engine`, `chassis`, `body`, `hustle`), so the
player and staff share one mental model:

- **engine / chassis / body** - build-work competence (map to job kinds / condition zones).
- **hustle** - the market side: auctions, selling, negotiation. (This is where the **auction-scout
  read** connects - a high-`hustle` scout raises `computeLotInterest`'s `precision`, sharpening the
  Interest meter. The `auction-rat` trait already exists in the schema for exactly this.)

Today those stats are **static** (rolled 1-5 at hire) and the **player has no profile at all** (just
labor slots). This system adds: (a) growth via XP for staff, and (b) a player profile that grows.

### XP / growth

- **Earned by doing the matching task** (engine job -> engine XP), so it accrues from normal play.
- **Diminishing returns**: quick, satisfying early gains; slow mastery. No infinite ramp - there's a
  soft ceiling so late-game margins don't run away.
- Represent skill as a continuous value under the hood even if shown as 1-5 pips.

### Effects - start with ONE, expand later

1. **Labor efficiency (primary, ship first):** higher skill -> the same job costs fewer labor slots
   (or completes in fewer days). Directly felt, easy to reason about.
2. **Quality (fast follow):** higher skill -> better condition outcome and/or lower chance of a
   botched job.
3. **Cost (later, optional):** less wasted parts/rework. Overlaps with efficiency; lowest priority.

Do **not** build a full RPG tree on day one. One effect, learn-by-doing, diminishing returns.

### Traits (already in the schema) sit on top

`ex-pro-driver`, `auction-rat`, `perfectionist`, `night-owl`, `gaisha-fluent` are static modifiers
layered over grown skill (e.g. `perfectionist` -> quality bump; `auction-rat` -> sharper Interest
read). They're hire-time flavor + specialization; skill is the earned axis.

## Economy interaction (handle with care)

Skill is another profit lever (faster/cheaper/better = fatter margins), and the economy is already
flagged as unproven/"too simplified." Two guardrails:

- **The balance harness validates it** - give bots skill curves and check the money curve doesn't
  trivialize. It's measurable, not guesswork.
- **Diminishing returns + tools/rep still capping tiers** keeps a late-game ceiling so mastery
  doesn't make money meaningless.

## Sequencing

- **Staff skill + XP -> roadmap Sprint 13 (staff system)** - its natural home; the data model already
  has staff stats + traits.
- **Player-character skill -> introduce a light version with the service-jobs feature** (the next
  major feature, where the player does repeated work worth improving at), or as a fast follow if we
  keep the first service-jobs cut deliberately simple to prove the loop first. Genuinely new v1.0
  scope - consciously approved by the maintainer 2026-07-08.

## Open questions (for the economy / harness pass)

- The XP curve shape and per-level effect magnitudes.
- Whether efficiency and quality both ship in v1, or efficiency alone.
- How staff skill and the player's skill combine when both work the same car.
