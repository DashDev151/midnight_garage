# The tuning overhaul arc: sprints 134 to 142

**This is the index. Each sprint has its own doc, and that doc is the one to implement from.**
`docs/design/systems/tuning-system.md` is the design of record behind all of them; read it when
a sprint doc leaves something unclear.

**Every sprint doc is written to be implemented without design decisions.** Where a value is
unapproved it is listed by name with a proposed figure, so the maintainer signs a table rather
than answering a question (directive 22). Where a decision is genuinely still open, the sprint
says so and stops rather than inviting the implementer to make it.

---

## The arc at a glance

| sprint | what | gated by | sign-off |
| --- | --- | --- | --- |
| **134** | Condition reaches the build | nothing | **none needed** |
| **135** | Proportional power, and the ECU price ladder | 134 | **SIGNED 2026-07-29** |
| **136** | Support ratios, and reliability as what they move | 135 | **SIGNED 2026-07-29** |
| **137** | The forced-induction curve and its price ladder | **136, hard** | **SIGNED 2026-07-29** |
| **138** | Measure what coherence did to the money | 136 | **none needed** |
| **139** | The premium for building well, if there is one | **138 accepted, hard** | set by 138; **may be cancelled** |
| **140** | Stat simplification, aero ceiling, style base | 135 | aero ceiling, style base, **and 68 of each still unauthored** |
| **141** | The dyno screen | 136 | fee, hire-or-facility, plus a GDD ruling |
| **142** | Grade sensitivity and the condition review | 134 | grade band curves |

**Sprints 134 to 138 are all clear to start**, in order, subject to 137's hard gate on 136.
**Every lever they need is signed**, so an implementation agent works straight through them
without stopping to ask.

**What is still unsigned is all downstream of 138**: 140's aero and style tables (and 68 of each
still unauthored), 141's dyno fee plus the GDD ruling, and 142's grade band curves. 139's shape
is set by 138's report.

---

## The shape of the arc changed on 2026-07-29

**Coherence reaches money through reliability, and that collapsed three sprints' worth of
machinery into a wire that already existed.** The maintainer's ruling: *"what is moved by
coherence? Buyer base? Sure... but WHY is there less demand for a stupid build? BECAUSE it is
going to blow up. Reliability IS the final figure that gets moved by coherence."*

What that changed, concretely:

1. **Sprint 136 gained teeth.** It shipped a text readout with no mechanical effect and an
   explicit constraint that support must not reach price. Both are reversed: an incoherent build
   now loses reliability, every buyer already weights reliability, and the readout's job is to
   name which part would fix it.
2. **Buyer selection came free.** Reliability is 57 per cent of a first-timer's taste, 37 per
   cent of a racer's and **zero per cent of a stancer's**. A collapsed build loses the buyers who
   would know better and keeps the one who does not care, which is design 7a's mechanism with
   nothing built for it.
3. **Sprint 138's choice was made before its measurement.** It offered two routes and route 2
   (reliability) was chosen on reasoning. So 138 no longer models a hypothetical: it measures a
   running system, which is a stronger place to decide from.
4. **Sprint 139 shrank to the premium half and may be cancelled outright.** The penalty landed in
   136. Whether building well deserves a *reward* on top is genuinely open, and closing 139
   unbuilt is recorded in its own doc as a legitimate outcome rather than a failure.
5. **The reliability deletion moved from 140 to 136**, so the whole model lands in one place: the
   additive deletion, the flat cap's retirement, the per-car base that replaces it, the severity
   ceiling and the coherence term.
6. **Three defects were found in the existing reliability model and all three are fixed in 136.**
   It was a weighted mean, so a seized block read 92 out of 100 (fixed by a severity ceiling,
   lever 8, signed). `reliabilityCap` was 70 with no recorded rationale and 30 points of dead
   headroom above it. **And it was flat, so a mint FD and a mint Carina read the same number**,
   which is the one claim about those two cars nobody who owned either would accept. The cap is
   retired and replaced by a per-car `spec.reliabilityBase` (lever 7, signed 2026-07-29).
   **Authored for all 94 roster cars at once, not just the 26 in content**, and living in the
   roster doc. The scale runs **65 to 100** and the axis is age and engineering culture rather
   than price: an NSX is a supercar you can drive to work and a Countach is not, so they sit
   thirty points apart inside the same culture class. The floor is 65 rather than lower because
   the base multiplies everything else, and a car with nothing to lose is a car where condition
   and coherence stop mattering.

## And the price ladder stopped being one ladder

Sprint 135 gives each power category its own curve while `partPricing.gradeFactors` applied a
single `1.3 / 2 / 3` to every part in the game. Value per yen was therefore a residue of that
mismatch: **a street ECU was 2.89 times worse value per horsepower than a race one**, and the
proposed increasing turbo curve would have made the turbo 2.17 times.

The maintainer's ruling: *"value and effect should be roughly proportional. The final race turbo
can be a larger jump but that does not mean it should be a better buy, that is how you get
monotony, why would you ever then install smaller ones. If that means that the part cost needs to
be adjusted then so be it."*

`gradeFactors` becomes a per-slot map with the old ladder as its default, and **a slot's price
ladder moves in the same sprint as its power curve**, so no distortion ever ships between two
sprints. Only two slots need their own entry: `ignitionEcu` in Sprint 135, `forcedInduction` in
Sprint 137. **A maximal race engine build on a Supra goes from ¥1,420,200 to ¥1,846,500** for the
same 632 PS, which is the largest price movement in the arc and is deliberate.

---

## This arc was ten sprints and is now nine

**A cross-reference against the design found a full sprint of throwaway work and three smaller
duplications.** They are recorded because the failure mode is worth not repeating: each came from
splitting a single change across two sprints for reviewability, and then having the second sprint
overwrite what the first authored.

**1. The old 135 and 136 were one change.** The old 135 converted the absolute power ladder to
fractions by dividing by a `powerReferencePs` lever; the old 136 re-authored every one of those
fractions per engine character. **Thirty authored values, one economy lever and one schema shape,
all dead one sprint after they landed.** They are merged, the reference does not exist, and the
per-character fractions are authored directly.

**2. The old 136 and 138 authored the same sixteen numbers twice.** The final grade shapes are now
authored once, in 135.

**3. Only one curve actually needed the hard gate.** The other seven shapes are harmless and ship
with 135, so **sprint 137 is the forced-induction curve alone.**

**4. `statModifiers.power` was to be deleted six sprints after it stopped meaning anything.** It
is retired at the end of 135, in the same sprint that authors every replacement, which is also
when a missed SKU fails loudly rather than silently.

**One thing deliberately left split.** Sprint 142's grade-sensitivity curves are independent of
everything between 134 and 141 and could have merged into 134. They did not, because **134 needs
no sign-off and must be able to ship immediately**, and merging would gate a live bug fix behind
an unsigned lever table. 142 may run at any point after 134.

---

## Two hard gates, and one soft one

**137 must not ship before 136.** Increasing returns on forced induction, on its own, is a
dominant strategy: buy the biggest turbo, ignore everything else. What makes it safe is the
support cost rising alongside it. Shipping 137 first builds a *stronger* version of the defect
this arc exists to remove. There is no partial version.

**139 must not ship before 138 has reported AND the maintainer has accepted its numbers.** It now
gates a smaller question than it used to (the premium, not the whole coupling), but the gate is
the same: 138 measures, the maintainer chooses a shape or chooses none, and only then does 139
open.

**Soft: 136 and 140 must not edit `StatModifierSchema` concurrently.** 136 deletes
`reliability` from it, 140 deletes `handling`, and both face the same question about the taxonomy
sharing that schema. Whichever lands first settles it and the other follows.

---

## What is NOT in this arc

- **Reputation** (design 7b), because it is blocked on the reputation ratchet (design 8) and would
  ship inert.
- **Machining** (design 4), which is what gives tool tier 3 its missing purpose, **and which now
  also owns the top of the power ladder.** The signed fractions cap a parts-only build at x1.95,
  which is right for most of the roster and low for the RB26 and the 2JZ specifically. `TODO.md`
  carries why, and why raising the forced fraction is the wrong fix.
- **Course-character job variety**, which is job and copy design rather than physics.
- **Per-engine part pricing**, deferred to the engine-swaps arc, because nothing can key a price
  off an engine until an engine is a content object.
- **Fitting a turbo to a naturally aspirated car**, which is both a part and an aspiration change
  and lives in `engine-swaps.md`.

Each has its own `TODO.md` entry.

---

## Two roster facts every sprint here depends on

Measured against shipped content on 2026-07-29, not assumed:

1. **The power ladder is bit-for-bit identical across all four fitment classes.** The class moves
   only price. There is one ladder, and the flat-ladder defect is uniform across the roster rather
   than a class quirk.
2. **Roster mean stock power is 176.88 PS** across all 26 shipped cars, median 166, minimum 55
   (Wagon R), maximum 324 (Supra RZ and Aristo 3.0V, tied). No shipped car is excluded from normal
   play, so the mean needs no exclusions.

---

## Three corrections carried into the sprint docs

**1. The support-ratio acceptance criterion.** An earlier draft said "adding any single gain part
must never raise that car's headline ratio". **That is too strong and would fail
correctly-implemented code**, because fitting race internals to a big-turbo car raises
cylinder-pressure support far more than it raises fuelling demand, so the headline rises, and it
should: buying the bottom end is exactly what fixes that build. `sprint136.md` carries the correct
pair: a structural assertion (demand and support slot sets are disjoint per subsystem) and a
behavioural one (a **pure gain** part, supporting nothing, never raises the headline).

**2. Demand reads band, support reads grade.** An earlier draft of `sprint136.md` did not say
whether condition applied to the demand side. It must, because demand comes from *output* and
output is band-scaled already, so a blown turbo must stop demanding a bottom end to contain boost
it is not making. Support must **not** be band-scaled, because support comes from *specification*
and specification does not decay: a worn forged conrod is still stronger than a stock cast one.
Getting this backwards charges condition twice.

**3. The value-per-yen test was cross-category only.** Sprint 137's acceptance test asserted that
no single category is the best power-per-yen at every rung, which would pass happily while a
single category's own ladder put the best value at the top. Both halves are now asserted, and the
within-ladder half is also a catalogue-wide rule in Sprint 135.

---

## Rules that bind every sprint in this arc

1. **Directive 22.** No economy value moves without the maintainer signing that specific lever by
   name and value. Every sprint doc lists its unsigned values in a "The levers" section. When one
   is hit that is not listed, **execution ENDS** and the numbers go to the maintainer; no
   follow-up waves, no new agents. The four story-mission reliability thresholds in Sprint 136 are
   the most likely place this fires.
2. **Directive 17.** A failing test is a diagnosis. Re-derive pins from real runs; never iterate a
   number toward a pass; never loosen a threshold to make something go green.
3. **Directive 20.** Run the narrowest check that answers the question, once. The git hooks are
   the gate; do not run the full suite by hand before a push that re-runs it.
4. **Performance never moves price.** `car-performance/README.md` 7a. A faster car is not worth
   more for being faster. **Reliability is not performance**: it says whether the car works, it
   has always been a valuation input, and it is the one legitimate route from a build to a price.
5. **Climbing a ladder never improves value per yen.** A top rung may be a bigger purchase; it
   must not be a better one, or the lower rungs are pointless. A slot's price ladder moves in the
   same sprint as its power curve.
6. **The base is the ceiling.** A stock mint car sits exactly on its own `reliabilityBase`, a
   properly supported build sits on it too, and nothing ever exceeds it. Nothing in this arc pays
   a bonus for competence.
7. **A per-car spec value is character, never difficulty.** `reliabilityBase`, `styleBase` and
   `aeroCeiling` each say what the car IS. None of them varies by build, condition or tier, and
   none of them is a knob for tuning how hard the game is.
8. **No second paths.** No second power path, no torque curve, no fifth part grade, no second
   condition model, no second job system, no second coherence quantity.
9. **No wear rate, ever.** Design section 9. Nothing in the game degrades with use, because the
   player never lives with the car.
10. **British spelling, no em dashes, no emoji, no process-narrative comments.**
