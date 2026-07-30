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
| **138** | Measure what coherence did to the money | 136 | **CLOSED UNBUILT 2026-07-30, superseded** |
| **139** | The premium for building well, if there is one | **138 accepted, hard** | **CLOSED UNBUILT 2026-07-30, superseded** |
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

## 138 and 139 closed unbuilt, 2026-07-30

**Both are superseded by `docs/design/systems/sale-value-system.md`, and its implementation
plan, `docs/design/systems/sale-value-implementation-plan.md`.** Full reasoning lives in each
sprint doc's own closure section, added at its end without touching the doc's original body;
this is the index's summary.

- **138** measured whether the coherence penalty was felt. It found the taste band cannot
  express a single-stat signal at all: the score is a weighted mean of five deliberately
  anti-correlated stats, so it sits near the middle by construction. That is a finding about the
  instrument, not the size of the penalty, and it is answered structurally by the new
  taste-as-match design rather than by tuning the old one.
- **139** asked whether building well deserves a premium on top of the penalty. It does: Stage D
  of the new design scales parts retention with coherence, `retentionFloor` 0.30 to
  `retentionCeiling` 1.10, delivering the premium from the value side instead of as a separate
  bonus on taste.

**The tuning arc therefore completes as 140, 141, 142.** The sale value work is a new arc,
sprints 143 to 155, and it consumes this arc's output rather than replacing it: Stage C and
Stage D read the `coherenceFactor` that Sprint 136 built.

**Sprint 140 splits.** Its per-car style baseline task becomes a prerequisite for the new arc,
pulled forward as that arc's own early sprint, because buyer targets on style cannot be
authored while every stock car scores at most 20 out of 100 (`styleCap`, flat across the
roster). The rest of Sprint 140, deleting `statModifiers.handling`, the aero ceiling and the
parts-market power readout, is independent of the split and stays here unchanged.

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

## Four corrections carried into the sprint docs

**1. The support-ratio acceptance criterion.** An earlier draft said "adding any single gain part
must never raise that car's headline ratio". **That is too strong and would fail
correctly-implemented code**, because fitting race internals to a big-turbo car raises
cylinder-pressure support far more than it raises fuelling demand, so the headline rises, and it
should: buying the bottom end is exactly what fixes that build. `sprint136.md` carries the correct
pair: a structural assertion (demand and support slot sets are disjoint per subsystem) and a
behavioural one (a **pure gain** part, supporting nothing, never raises the headline).

**2. Demand reads GRADE, not band - rewritten 2026-07-30, corrected the other way round.** The
original text here said "demand reads band, support reads grade" and reasoned that reading grade
for demand would charge condition twice. Both halves were wrong, and shipping the band-scaled
version cost a working invariant: 172 measured cases where ageing a fitted gain part RAISED
reliability, because shrinking the part's own band-scaled demand outran the condition mean's own
fall. A worn turbo that reads as MORE reliable than a mint one is exactly the defect this arc
exists to remove. `sprint136.md`'s own worked example is the smoking gun: its line 511 publishes a
worn-FD figure of 6, which is what the formula gives WITHOUT band-scaling; the shipped,
band-scaled code gave 19 on the same build.

The correct rule: demand and support both read the fitted GRADE only, never the band. A blown
turbo does not stop demanding the bottom end its own hardware was built to stress; only its
OUTPUT falls, and that already has its own, single route into the model - the power stat itself
falls with condition, the same as it always has. Charging it a second time by shrinking demand as
well is the double-charge, not reading grade. Support was never band-scaled in the first place
(specification does not decay: a worn forged conrod is still stronger than a stock cast one), so
demand reading grade too is not a new idea here, it is the SAME idea applied consistently to both
sides of the ratio. Nobody should restore band-scaled demand: it is not a stricter reading of the
model, it is the bug.

**3. The value-per-yen test was cross-category only.** Sprint 137's acceptance test asserted that
no single category is the best power-per-yen at every rung, which would pass happily while a
single category's own ladder put the best value at the top. Both halves are now asserted, and the
within-ladder half is also a catalogue-wide rule in Sprint 135.

**4. "The base is the ceiling" rule 6 said a supported build sits on the base; it does not.**
Playing the shipped model exposed the gap the rule's own wording created: it read "a stock mint car
sits exactly on its own `reliabilityBase`, a properly supported build sits on it too", collapsing
two different claims into one sentence. The first half is right and stays right. The second half
is wrong on its own terms: even a full race build, properly supported and built perfectly, moves
more energy through every part of the car than stock, so its reliability has to drop relative to
stock, just far less than an unsupported build's does. A build being supported answers only whether
it holds together; it was never a reason the power itself should be free. `statFormulas.support.
stressCoefficient` (signed 0.20) fixes this with an outer multiplier on the existing
condition-plus-coherence budget, `1 - stressCoefficient * totalGainFraction` (clamped to `[0, 1]`),
kept deliberately apart from `coherenceFactor`'s own additive shortfall - folding it in there was
measured and rejected, because it would subtract an identical flat amount from a supported and an
unsupported build alike and collapse the unsupported case toward an uninteresting floor.
`totalGainFraction` is exactly 0 on a stock car, so the multiplier is exactly 1 there and the
stock-car-reads-exactly-its-base identity is untouched. Full arithmetic in `sprint136.md`'s third
amendment.

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
6. **The base is a ceiling, not a plateau (amended - see the fourth correction below).** A stock
   mint car sits exactly on its own `reliabilityBase`, and nothing ever exceeds it: that half is
   unchanged. What changed: a build that makes more power now sits below the base in proportion to
   how much more, whether or not it is supported. Only a build with zero total power gain sits
   exactly on the base; a properly supported build no longer does merely by being supported.
   Support still fully answers whether the build holds together (`coherenceFactor`, capped at 1);
   it no longer also erases the cost of the power itself, which is a second, independent question
   the original wording conflated. Nothing in this arc pays a bonus for competence, and that half
   is also unchanged: the new term only ever subtracts, and a well-supported build still always
   beats a poorly-supported one making the same power.
7. **A per-car spec value is character, never difficulty.** `reliabilityBase`, `styleBase` and
   `aeroCeiling` each say what the car IS. None of them varies by build, condition or tier, and
   none of them is a knob for tuning how hard the game is.
8. **No second paths.** No second power path, no torque curve, no fifth part grade, no second
   condition model, no second job system, no second coherence quantity.
9. **No wear rate, ever.** Design section 9. Nothing in the game degrades with use, because the
   player never lives with the car.
10. **British spelling, no em dashes, no emoji, no process-narrative comments.**
11. **Auction-demo fixtures are fragile to any price or bill-threshold move (2026-07-30).**
    `enforceMinWorkBill` (`packages/sim/src/auctions.ts` ~370-413) loops while the restoration bill
    sits under a yen floor, drawing from the PRNG on every step - so moving a part price or a bill
    threshold changes the draw count and reshuffles every later lot in a seeded catalogue. **If a
    sprint in this arc moves any part price or bill threshold**,
    `packages/game/src/screens/auctionRoom.test.ts`, `auctionRoomDemo.test.ts` and
    `AuctionRoomDemoScreen.test.ts` must be re-derived from a fresh seeded run, and
    `pnpm test --project game` must be run before the sprint is called done. This is what silently
    broke all three files in Sprint 135 and cost hours of archaeology.
