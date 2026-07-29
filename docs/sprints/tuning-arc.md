# The tuning overhaul arc: sprints 134 to 142

**This is the index. Each sprint has its own doc, and that doc is the one to implement
from.** `docs/design/systems/tuning-system.md` is the design of record behind all of them;
read it when a sprint doc leaves something unclear.

**Every sprint doc is written to be implemented without design decisions.** Where a value is
unapproved it is listed by name with a proposed figure, so the maintainer signs a table rather
than answering a question (directive 22). Where a decision is genuinely still open, the sprint
says so and stops rather than inviting the implementer to make it.

---

## The arc at a glance

| sprint | what | gated by | sign-off needed |
| --- | --- | --- | --- |
| **134** | Condition reaches the build | nothing | **none** |
| **135** | Proportional and engine-specific power | 134 | threshold, fractions, grade shapes |
| **136** | Support ratios and the always-on readout | 135 | weights, thresholds, copy |
| **137** | The forced-induction return curve | **136, hard** | one curve |
| **138** | Measure the buyer-selection spread | 136 | **none** |
| **139** | Cohesion into buyer selection | **138 accepted, hard** | set by 138 |
| **140** | Stat simplification, aero ceiling, style base | 135 | aero ceiling, style base |
| **141** | The dyno screen | 136 | fee, plus a GDD ruling |
| **142** | Grade sensitivity and the condition review | 134 | grade band curves |

**Sprint 134 needs nothing signed and can start immediately.** Sprint 140's first two tasks
move no lever either. Sprint 138 changes nothing at all.

---

## This arc was ten sprints and is now nine

**A cross-reference against the design found a full sprint of throwaway work and three smaller
duplications.** They are recorded here because the failure mode is worth not repeating: each
one came from splitting a single change across two sprints for reviewability, and then having
the second sprint overwrite what the first authored.

**1. The old 135 and 136 were one change.** The old 135 converted the absolute power ladder to
fractions by dividing by a `powerReferencePs` lever; the old 136 then re-authored every one of
those fractions per engine character. **Thirty authored values, one economy lever and one
schema shape, all dead one sprint after they landed**, and the reference lever would then have
needed its own removal. They are merged, the reference does not exist, and the per-character
fractions are authored directly.

**2. The old 136 and 138 authored the same sixteen numbers twice.** The old 136 authored street
and sport rungs at the original ladder's shape; the old 138 overwrote them with per-category
curves. **The final shapes are now authored once, in 135.**

**3. Only one curve actually needed the hard gate.** The gate exists because *increasing*
returns on forced induction is a dominant strategy without a rising support cost. That is one
category. The other seven shapes are harmless and ship with 135, so **sprint 137 is now the
forced-induction curve alone.**

**4. `statModifiers.power` was to be deleted six sprints after it stopped meaning anything.**
It is now retired at the end of 135, in the same sprint that authors every replacement, which
is also when a missed SKU fails loudly rather than silently.

**One thing deliberately left split.** Sprint 142's grade-sensitivity curves are independent of
everything between 134 and 141 and could have merged into 134. They did not, because **134
needs no sign-off and must be able to ship immediately**, and merging would gate a live bug fix
behind an unsigned lever table. 142 may run at any point after 134.

---

## Two hard gates, and why they exist

**137 must not ship before 136.** Increasing returns on forced induction, on its own, is a
dominant strategy: buy the biggest turbo, ignore everything else. What makes it safe is the
support cost rising alongside it. Shipping 137 first builds a *stronger* version of the defect
this arc exists to remove. There is no partial version.

**139 must not ship before 138 has reported AND the maintainer has accepted its numbers.** The
entire value half rests on an unverified assumption: that routing cohesion through buyer
selection produces a price spread large enough to feel. 138 measures it. **If the spread is too
small, 139 does not proceed and the arc stops**, because the fallbacks (withhold premium within
Law 5, or amend Law 5 openly) are Law 5 questions rather than implementation choices.

---

## What is NOT in this arc

- **Reputation** (design 7b), because it is blocked on the reputation ratchet (design 8) and
  would ship inert.
- **Machining** (design 4), which is what gives tool tier 3 its missing purpose.
- **Course-character job variety**, which is job and copy design rather than physics.
- **Fitting a turbo to a naturally aspirated car**, which is both a part and an aspiration
  change and lives in `engine-swaps.md`.

Each has its own `TODO.md` entry.

---

## Two roster facts every sprint here depends on

Measured against shipped content on 2026-07-29, not assumed:

1. **The power ladder is bit-for-bit identical across all four fitment classes.** The class
   moves only price. There is one ladder, and the flat-ladder defect is uniform across the
   roster rather than a class quirk.
2. **Roster mean stock power is 176.88 PS** across all 26 shipped cars, median 166, minimum 55
   (Wagon R), maximum 324 (Supra RZ and Aristo 3.0V, tied). No shipped car is excluded from
   normal play, so the mean needs no exclusions.

---

## One correction carried into the sprint docs

An earlier draft gave the support-ratio sprint the acceptance criterion "adding any single gain
part must never raise that car's headline ratio". **That is too strong and would fail
correctly-implemented code**, because fitting race internals to a big-turbo car raises
cylinder-pressure support far more than it raises fuelling demand, so the headline rises, and
it should: buying the bottom end is exactly what fixes that build.

`sprint136.md` carries the correct pair in its place: a structural assertion (demand and
support slot sets are disjoint per subsystem) and a behavioural one (a **pure gain** part,
supporting nothing, never raises the headline).

---

## Rules that bind every sprint in this arc

1. **Directive 22.** No economy value moves without the maintainer signing that specific lever
   by name and value. Every sprint doc lists its unsigned values in a "The levers" section.
   When one is hit that is not listed, **execution ENDS** and the numbers go to the maintainer;
   no follow-up waves, no new agents.
2. **Directive 17.** A failing test is a diagnosis. Re-derive pins from real runs; never
   iterate a number toward a pass; never loosen a threshold to make something go green.
3. **Directive 20.** Run the narrowest check that answers the question, once. The git hooks are
   the gate; do not run the full suite by hand before a push that re-runs it.
4. **Performance never moves price.** `car-performance/README.md` 7a. A faster car is not worth
   more for being faster. A better-built car is worth more to the person who can tell, which is
   a different claim and the only one this arc makes.
5. **No second paths.** No second power path, no torque curve, no fifth part grade, no second
   condition model, no second job system.
6. **No wear rate, ever.** Design section 9. Nothing in the game degrades with use, because the
   player never lives with the car.
7. **British spelling, no em dashes, no emoji, no process-narrative comments.**
