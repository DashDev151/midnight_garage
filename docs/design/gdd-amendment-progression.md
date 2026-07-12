# GDD Amendment Draft: Progression Rework (Sprints 36-39)

*Drafted 2026-07-12 at the end of the Progression Rework arc, per Sprint 39's close-out task. This
is a DRAFT for maintainer review and approval - `docs/design/midnight-garage-gdd.md` has NOT been
edited. The GDD is canonical; this document proposes the specific text changes needed to bring it
back in sync with what actually shipped (Sprints 36-39), and flags the one place where the gap
predates this arc and needs an explicit maintainer call, not just a sync-up.*

## Why an amendment is needed

The Progression Rework arc replaced the equipment-ownership model the GDD describes (S9.0) with
always-owned, tiered tool lines (`docs/design/progression-bible.md`, now canonical for
progression). The GDD's S9.0 already said **"Tools, not levels"** - this amendment sharpens that
stated intent to match the real mechanism, it does not reverse it. It also adds Specialty (S9.1),
a genuinely new system the GDD predates, and corrects the labor-slot base number (S3.2), which
drifted from its Sprint 0 placeholder during balancing.

## S3.2 Labor Slots (the core resource)

**Current text:** "Each character (player + staff) provides labor slots per day (base 2, more with
skill/tools)."

**Proposed replacement:**

> Each character (player + staff) provides labor slots per day (base 6, retuned from the original
> placeholder during Sprint 33's balance pass). Tool tier does not add MORE slots - it makes each
> slot cover MORE work: repairing a part costs `ceil(grades-to-climb / tool tier)` labor slots, so
> a tier-3 line clears the same repair in a third the slots a tier-1 line needs. "More with skill"
> remains a planned but unbuilt staff/player-skill system (see `docs/design/skill-progression.md`
> for the full design and how it composes with tool tier without duplicating its gate).

**Why:** the base number (2 -> 6) is a straightforward balancing drift correction (Sprint 33), not
an arc change. The "more with... tools" clause needed correcting in KIND, not just number: tools
were never meant to grant additional slots, they make existing ones more efficient - the amendment
states the real mechanism precisely instead of the vaguer original phrasing.

## S9.0 The Climb (progression arc - a core pillar)

**Current text:** "**How the gate works - Tools, not levels.** Job tiers are unlocked by shop
equipment purchases, each a visible pixel upgrade in the garage: **Basic tools → Two-post lift →
Dyno cell → Engine crane & stand → TIG welder/fab corner → Aero/composites bench.** You can't
build what you can't lift. Equipment + staff skill + rep gate the ceiling; money alone never skips
the climb."

**Proposed replacement:**

> **How the gate works - tools, tiered, never locked.** Six always-owned tool lines, one per
> component group (engine, drivetrain, suspension, wheels, body, interior), each three tiers - e.g.
> suspension: trolley jack & axle stands -> two-post lift -> drive-on alignment lift. Tier 1 of
> every line is owned from day one: nothing is ever fully locked out, only slow. Upgrading a line
> (cash-gated only, no reputation gate) buys labor speed on that line's own work AND raises the
> ceiling for that line's fabrication-grade ("built," not "bolt-on") jobs specifically - swapping a
> turbo on an already-boosted car is tier-1 bolt-on work; converting a naturally-aspirated engine to
> forced induction needs engine tier 3. Reputation gates breadth (which job tiers and auction tiers
> are even offered) separately from a tool line's own depth ceiling; money alone still never skips
> either climb.

**Why:** the original text describes binary equipment PURCHASES unlocking whole job tiers on a
single linear ladder (Basic tools -> ... -> Aero bench) - this was the pre-Sprint-36 mechanism,
and it is what produced the day-one job-board failure that triggered this whole arc (a fresh player
could be shown work needing the final, most expensive machine). The replacement describes the real
shipped mechanism: six PARALLEL lines, always-owned at tier 1, upgraded for speed and fabrication
access - the GDD's own "Tools, not levels" INTENT is preserved and sharpened, not reversed.

*No change proposed to the "Power ceiling by act" paragraph immediately below - it describes a
consequence of which grades/parts are available at a job tier, which this arc did not touch.*

## S9.1 Reputation Tiers

**Current text:** "**Unknown → Local → Known → Respected → Legend** (5 tiers, mapping to the acts
above). Rep gates: auction access, districts, staff quality, commission budgets, Legend leads. Rep
comes from great builds delivered, events, features - not raw cash."

**Proposed addition** (the existing text is unchanged and still accurate - reputation itself was
not touched by this arc; this is a new paragraph appended after it):

> **Specialty (added, Sprint 38): the horizontal complement to reputation's vertical climb.**
> Per-discipline word of mouth, keyed to the same six groups as the tool lines, earned from
> service-job work in that discipline. Reputation gates BREADTH (which tiers of work and auction
> access are offered at all); specialty gates DEPTH (which discipline's work walks in the door
> more often and at a premium, and - once specialty is high enough - named signature techniques
> and a derived shop title, e.g. "the engine house"). Revealed only through offer mix and copy,
> never a meter (`docs/design/progression-bible.md`, the canonical source for both axes going
> forward).

**Why:** Specialty is a genuinely new system the GDD predates entirely; it does not replace or
change reputation's own mechanism, so the existing text stands and this is purely additive.

## S6.1 Money In, item 2 (Commissions) - flagged for an explicit maintainer call

**Current text:** "**Commissions** - customers bring a car + a brief + a budget ('make my S14
analog a touge weapon, ¥900k'). Score vs. brief drives payout and rep."

**Proposed replacement:**

> **Commissions (service jobs)** - customers bring a car and a task list (repair to a target
> condition, or install a graded part) drawn from an authored per-discipline ladder (bolt-on ->
> involved -> fabrication-grade), gated by tool tier and, at the top, by earned specialty/technique.
> Payout is fully DERIVED from the real task cost plus a margin roll (never an authored flat sum,
> and never a "brief" the player is scored against) - the job is either completed (paid, plus
> reputation and specialty) or not (failed: no pay, reputation and specialty penalty).

**This one needs your call, not just a sync-up.** The original "score vs. brief drives payout"
framing implies a GRADED QUALITY mechanic against a customer-stated budget - that was never
actually built this way, even before the Progression Rework arc (Sprint 29 shipped fully derived,
pass/fail payout, not a scored brief). This amendment describes what shipped, but the gap predates
Sprints 36-39 and isn't something this arc caused or is positioned to resolve. Worth an explicit
decision: retire the "score vs. brief" framing in favor of the derived pass/fail model as designed
(this amendment's proposed text), or treat it as a still-open future layer (a quality-score system
on top of the current pass/fail) and word the amendment to say so instead. Recommend the former
(match reality) unless a scored-brief mechanic is something you still want built.

## Sign-off

None of the above has been applied to the GDD. On approval (in full, or per-section), the changes
land as a direct GDD edit in a follow-up commit - not bundled into any Sprint 36-39 commit.
