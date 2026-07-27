# Skill & Progression Design (planned - not yet scheduled)

*Design note for a later sprint, originally added 2026-07-08 at the maintainer's request; reconciled
2026-07-12 (Progression Rework arc, Sprint 39 close-out) against `docs/design/progression-bible.md`,
now the canonical progression source. The original note (with the pre-arc "Tools, not levels"
framing this file has since updated) is preserved verbatim at
`docs/design/archive/skill-progression-2026-07-08.md`. Elaborates GDD S7 (staff). Staff skill lands
with the staff system (roadmap Sprint 13); the player-character skill profile is new v1.0 scope,
slotted against the service-jobs feature (a light version) with the rest as a fast follow. Numbers
here are placeholders for the balance harness / economy pass to set.*

## Relationship to Specialty (Sprint 38) - read this first

The Progression Rework arc (Sprints 36-39) shipped **Specialty**, the progression bible's
horizontal axis: per-discipline word of mouth, earned from service-job work, expressed only
through offer mix and in-lane pay (never a meter). **Skill (this doc) is a different axis and
remains unbuilt.** They do not overlap or compete:

| | Specialty (built, Sprint 38) | Skill (this doc, unbuilt) |
|---|---|---|
| What it changes | WHICH work walks in the door, and its pay | HOW WELL/FAST that work gets done |
| Who has it | The shop (one shared value per discipline) | Each worker individually (player or staff) |
| How it grows | Passive: earned automatically by completing work | The point of the mechanic: active, felt "getting better at this" |
| Surfaced as | Offer mix + word-of-mouth copy only | Labor-slot cost, quality outcome |

Skill sits on the SAME "tools/rep gate access, this pillar optimizes execution" side of the bible
as tool tiers - it never unlocks a job tier (that stays tools + reputation, bible law: no reward
double-dips). The two systems could both apply to the same job someday (specialty decided a
premium engine job walked in; the player's own engine skill decides how fast they knock it out),
with zero design conflict.

## The idea

Put the player character or a staff member to work on a task and they **get better at that kind of
task over time** - learn-by-doing XP. A seasoned engine builder finishes faster, wastes less, and
turns out cleaner work than a green one. Skills grow from the work you'd do anyway; they are not a
separate grind.

## The load-bearing guardrail: skill *optimizes*, it never *unlocks*

The progression bible's four pillars: **Reputation** gates breadth, **Specialty** gates depth
(offer mix/pay, not access), **Capability** (tool tiers, built Sprint 36) gates WHAT you can
attempt - a tool tier below the ceiling means that work is not offered at all, full stop, no
amount of skill bypasses it. Skill is not a fifth pillar; it is a modifier ON capability's THROUGHPUT
side only:

- **Tools + reputation gate WHAT you can attempt.** No machine-shop tooling, no engine build -
  period (Sprint 37's real example: NA-to-turbo conversion needs engine tier 3).
- **Skill governs HOW WELL you do what you're already allowed to do** - efficiency, quality, cost -
  the same role tool TIER already plays for raw labor-slot cost (`ceil(grades / repairLevel)`).

Hold that line and skill *complements* the bible instead of fighting it. The moment a skill level
unlocks a job tier, the model breaks and duplicates what tools+reputation already do (bible law 3:
no reward double-dips). **Rule: skill optimizes, tools/rep/specialty unlock or bias access.**

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
   (or completes in fewer days). Directly felt, easy to reason about. Composes multiplicatively
   with tool tier's own labor-slot reduction, not instead of it.
2. **Quality (fast follow):** higher skill -> better condition outcome and/or lower chance of a
   botched job.
3. **Cost (later, optional):** less wasted parts/rework. Overlaps with efficiency; lowest priority.

Do **not** build a full RPG tree on day one. One effect, learn-by-doing, diminishing returns.

### Traits (already in the schema) sit on top

`ex-pro-driver`, `auction-rat`, `perfectionist`, `night-owl`, `gaisha-fluent` are static modifiers
layered over grown skill (e.g. `perfectionist` -> quality bump; `auction-rat` -> sharper Interest
read). They're hire-time flavor + specialization; skill is the earned axis.

## Diegetic surfacing (bible law 4)

Per the bible, skill should be revealed through the world, not a meter, exactly like specialty's
word-of-mouth pool. A concrete option worth carrying into the real design pass: a completed job's
result copy references the worker's growing competence ("clean work, in half the time you'd
expect") rather than a numeric skill readout. Whether skill needs ANY visible number (even a dev
console one) is an open call for whoever designs this properly.

## Economy interaction (handle with care)

Skill is another profit lever (faster/cheaper/better = fatter margins), and the economy is already
flagged as unproven/"too simplified" (`TODO.md`'s standing concern). Two guardrails:

- **The balance harness validates it** - give bots skill curves and check the money curve doesn't
  trivialize. It's measurable, not guesswork.
- **Diminishing returns + tools/rep/specialty still gating access** keeps a late-game ceiling so
  mastery doesn't make money meaningless.

## Sequencing

- **Staff skill + XP -> roadmap Sprint 13 (staff system)** - its natural home; the data model already
  has staff stats + traits.
- **Player-character skill -> introduce a light version with the service-jobs feature** (already
  shipped and reworked across the Loop Rework and Progression Rework arcs - this would now slot
  against the CURRENT service-jobs framework, not the original Sprint 11 one), or as a fast follow.
  Genuinely new v1.0 scope - consciously approved by the maintainer 2026-07-08.

## Open questions (for the economy / harness pass)

- The XP curve shape and per-level effect magnitudes.
- Whether efficiency and quality both ship in v1, or efficiency alone.
- How staff skill and the player's skill combine when both work the same car.
- How skill's labor-slot reduction composes with tool-tier's own reduction (additive on top of
  `ceil(grades / repairLevel)`, or a further multiplier on the result) - needs a real decision once
  this is scheduled, not assumed here.
