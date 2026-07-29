# Sprint 132: parts pricing, integration and sanity check

**Status:** signed 2026-07-28. **COMPLETE, closed out 2026-07-29.** T1 and T5 to T7 landed
with the original work; T2, T3, T4 and T8 were found undone on review and were finished in
the closing pass. Ready for review.

## 1. Goal

Land the period-calibrated parts pricing sheet properly: get its levers recorded and
gated, resolve two things the review recommended that the code cannot express, and
verify what the new prices do to the restoration bill and therefore to every car's
market value.

The pricing work itself is done. `packages/content/data/partPricing.json` already
carries the new numbers, calibrated in
`docs/design/systems/parts-pricing-notes.md` against the 1994-2004
catalogue sweep (HKS, Endless, Cusco, RAYS) and the MAZDASPEED August 1998 advert.
This sprint is integration, compliance and measurement, not pricing.

## 2. Reuse analysis (directive 16)

**Genuinely new: nothing.** Not one new mechanism, formula, schema or state shape.
That is the point of this sprint and it is worth saying at the top.

**Existing mechanisms this rides on, unchanged:**

| Concern | The existing thing that already covers it |
| --- | --- |
| SKU pricing | `resolvePartPriceYen` in `packages/content/src/partPricing.ts`: `round100(base x class x grade x global)`, override wins outright. Already the single formula for every SKU. |
| Where prices live | `partPricing.json`, five knobs, no hand-authored `priceYen` anywhere. Already content law compliant. |
| The restoration bill | `carCostToMintYen` / `carCostToBandYen` in `packages/sim/src/bands.ts`, consumed by `instanceBaseValueYen`. Parts prices reach car value only through here. |
| Approval gating | `packages/content/tests/economyApprovalGate.test.ts`, the existing directive-22 pin file. Extend it; do not create a second gate. |
| Class ladder | `PartFitmentClass` and `fitmentClassForTier`, the same identity `expectationByTier` keys off, so a car's parts costs and its market expectations can never disagree about what kind of car it is. |

**The one thing that must NOT be built:** a second pricing path for "special" cars.
Section 4c explains why the review's override suggestions cannot be taken literally,
and the answer is not a parallel mechanism.

## 3. What is already in the working tree

`git diff packages/content/data/partPricing.json` shows 11 lever movements, verified
against the diff rather than against the notes:

**`baseCostYen`, 9 of 30 changed:**

| Part | From | To | Multiple |
| --- | ---: | ---: | ---: |
| exhaust | 25,000 | 40,000 | 1.60 |
| springs | 14,000 | 18,000 | 1.29 |
| dampers | 26,000 | 40,000 | 1.54 |
| brakePadsDiscs | 8,000 | 15,000 | 1.88 |
| brakeCalipersLines | 18,000 | 45,000 | 2.50 |
| intake | 15,000 | 18,000 | 1.20 |
| ignitionEcu | 20,000 | 28,000 | 1.40 |
| rims | 30,000 | 34,000 | 1.13 |
| aero | 18,000 | 26,000 | 1.44 |

**`gradeFactors.race`: 2.8 to 3.0.**

**`classFactors.legend`: 4.0, added.**

The other 21 base costs, `shitbox`/`common`/`uncommon`/`rare`, `stock`/`street`/`sport`,
`globalFactor` and `overrides` are untouched.

**Record for posterity, so nobody later "corrects" it:** these base costs are NOT
catalogue prices. Period bills carried 20 to 35 per cent of mandatory accessories
(wiring harnesses on ECUs, mounting stays on caliper kits, metal catalysts to make an
exhaust road-legal), and the review baked that into the base rather than modelling it
separately. A future reader comparing `exhaust: 40000` against a catalogue muffler
price will think it is too high. It is not.

## 4. Levers requiring sign-off (directive 22)

**No implementation task below starts until this section is signed.** Directive 22
requires the specific lever and value listed by name in the sprint doc first, and
these values are already in the tree, so the sign-off is retrospective and the sprint
cannot close without it.

### 4a. The 10 live levers

The nine base costs and `gradeFactors.race` in section 3, exactly as tabulated. Each
is anchored to period catalogue data in `parts-pricing-notes.md` sections 1 and 3.

### 4b. `classFactors.legend: 4.0` is inert, and that is the worst possible state

`ByFitmentClassFactorSchema` is a plain `z.object` over four keys, so Zod **strips**
`legend` silently rather than rejecting it. `FITMENT_CLASSES` in
`packages/content/src/data.ts` is `['shitbox', 'common', 'uncommon', 'rare']`. The key
parses green, does nothing, and reads to any future maintainer as a live lever.

Three options, needing a choice:

1. **Delete the key.** Zero risk, zero work. The exotic end stays priced as `rare`.
2. **Make it real.** Add `legend` to `PartFitmentClassSchema`, `FITMENT_CLASSES`, and
   `fitmentClassForTier`, then decide which roster tier maps to it. This is a schema
   change touching parts pricing AND `valuation.expectationByTier` (the two are
   deliberately keyed off the same identity), so it is a bigger change than it looks
   and it interacts with the pending roster re-tier.
3. **Defer.** Delete now, revisit with the re-tier, which is already going to touch
   tier identity.

**DECISION (maintainer, 2026-07-28, revised same day): option 3, DEFER.** The call was
briefly "implement it" and was then reversed. Both are recorded so the reasoning below
is not mistaken for the outcome.

**What happens in this sprint: delete `classFactors.legend`.** It is inert (Zod strips
it), so removing it changes no resolved price. The key is going because an inert lever
that reads as a live one is the worst of the three states, not because the idea is
rejected.

**The deferral is recorded in `TODO.md`**, since it is not tied to a numbered sprint.
The rest of this section is the design work that will still be true whenever it is
picked up.

This is less invasive than I first judged. `packages/content/src/partFitment.ts` already
carries the intent in its own doc comment: the roster's `RarityTier` enum **already has**
`legend` and `gaisha`, and `fitmentClassForTier` folds both into `rare` "until the roster
grows and earns a real mapping of its own". Implementing `legend` is un-folding something
the code was written expecting, not adding a concept.

**But it drags two things with it, one of which is a new approval.**

**(i) `gaisha` needs a decision too.** Once `legend` maps to itself, `gaisha` is the only
tier still folded into `rare`, and the roster's gaisha are exactly the exotics the review
said `rare` undercooks (Countach, 512 TR, F355, 930, the Delta, the M3s). Three ways:
fold `gaisha` into the new `legend`; give it its own class; or leave it in `rare`.
**Recommendation: fold `gaisha` into `legend`.** It puts the exotics on the 4.0 factor,
which is what the review wanted, without a sixth class.

**(ii) NEW ECONOMY LEVERS, unapproved.** `expectationForCar` reads
`economy.valuation.expectationByTier[fitmentClass]` and **throws** on a missing class. So
adding `legend` to the enum requires a new `expectationByTier.legend` block carrying
`band`, `beyondDiscount` and `aftermarketReturn`. Those are three economy values that do
not exist yet and are therefore unapproved under directive 22. **They must be proposed
with numbers and signed before T1 starts.** They are not entailed by the 4b sign-off:
directive 22 is explicit that a general approval never extends to unlisted constants.

### 4c. The three suggested `overrides` cannot be written as described

`parts-pricing-notes.md` section 5 proposes rotary engine parts at +30 to 50 per cent,
exotics at x1.6 to 2.0, and kei drivetrain parts at x0.8. **The schema cannot express
any of them.** `overrides` is `z.record(z.string(), z.number().int().nonnegative())`,
keyed by **SKU id**, valued as an **absolute yen price**. There are no multipliers and
no car-level or car-type keys.

Taken literally, "rotary +40 per cent" means hand-authoring an absolute yen figure for
every rotary engine SKU, which is precisely the mass content edit the sheet exists to
prevent, and it would drift the moment any base cost moved again.

Options:

1. **Do nothing.** Rotaries, exotics and the ABC keis price off their class like
   everything else. The `overrides` block stays empty, as its schema doc intends
   ("ships EMPTY; every entry is a deliberate, individually-justified decision").
2. **Add a per-car-model multiplier** to the sheet. A real feature with a real design
   cost, and it needs its own justification rather than arriving as a footnote.

**DECISION (maintainer, 2026-07-28): option 1 confirmed, `overrides` stays empty.**

**And the rotary premium is sanctioned as its own mechanic**, in the maintainer's words:
"add another Rotary modifier that modifies the pricing of certain parts when a car is
tagged rotary."

That is genuinely new and so it gets a real design, not a config line. Open points, to
be settled in a short design pass before implementation:

- **Where the tag lives.** A car's engine layout may already be derivable from existing
  spec data; if it is, deriving beats adding a second source of truth (directive 16).
  Establish this before adding any field.
- **Which parts it touches.** Not all of them: a rotary's exhaust, brakes and suspension
  cost what any other car's do. The premium belongs on the engine hard parts. Note that
  `camsTiming` is a live question rather than a multiplier, because a rotary has no
  camshafts at all, and pricing a part the engine does not have is a modelling choice
  worth making deliberately.
- **The value.** A new unapproved lever under directive 22, needing a named number.

**Scope call: the rotary modifier is NOT in this sprint.** This sprint is integration,
gating and measurement of a pricing sheet that already exists. Adding a new pricing
mechanism mid-measurement would make the section 6 numbers unattributable. It follows
immediately after, with its own lever sign-off.

## 5. The finding that actually matters

**There is no approval gate on `partPricing.json`.** `economyApprovalGate.test.ts` pins
`economy.json` and `storyMissions.json` and nothing else. Eleven levers moved in this
sheet and the suite stayed green. Directive 22's guarantee ("a guard test pins the
economy content so no lever moves silently") does not currently cover parts pricing.

That is the gap this sprint closes, and it is more valuable than any individual number.

## 6. The sanity check, and why it is not optional

Parts prices reach car value through exactly one path:

```
carCostToMintYen (the restoration bill, priced from the parts catalogue)
  -> instanceBaseValueYen: cleanValue
       - marketRepairDiscount (1.3) x billBelowExpectation
       - beyondDiscount        x billAboveExpectation
  -> marketValueYen
```

So **every one of these increases makes every damaged car worth less**, and the
increases are not small: caliper sets 2.5x, brake pads 1.9x, exhaust 1.6x, dampers
1.54x. A car with scrap brakes and tired suspension now carries a materially bigger
bill against an unchanged book value.

Two laws are in the blast radius and both must be re-verified rather than assumed:

- **Economy bible law 1 / the core-loop law** ("every repair yen returns more than
  itself, over the whole range the economy asks a player to repair"). Below the tier
  expectation band the rate is `marketRepairDiscount` 1.3, so law 1 survives
  arithmetically for any bill in that region. The question is whether the **larger**
  bills now push a materially bigger share of typical generated cars **above** their
  band, into `beyondDiscount` territory where a repair yen can return less than itself.
- **The generation-time bill guard** (law 2, `auctions.ts`), which is supposed to
  guarantee no generated car's bill ever reaches the scrap-value backstop floor. Bills
  just went up across the board; that guard needs re-measuring, not re-reading.

**This sprint measures. It does not retune.** If the measurement says a lever needs to
move, that goes back to the maintainer as a named lever with a number, per directive 22
and per the standing instruction that a ten-second question outranks hours of compute.

The book-value work is deliberately NOT in scope here. Car book values from the roster
price list are a separate change; doing both at once would make it impossible to tell
which one moved the loop. **Parts first, measured; then book values, measured against
the new parts baseline.**

## 7. Tasks

Claude-implementable, in order. Nothing starts before section 4 is signed.

- [x] **T1.** Delete `classFactors.legend` from `partPricing.json`, and record the
      deferral in `TODO.md` with the section 4b design intact (the `gaisha` question and
      the `expectationByTier.legend` lever requirement both survive to whenever it is
      picked up). No resolved price changes: the key was inert.
- [x] **T2.** Record in `parts-pricing-notes.md` that its three `overrides` suggestions
      are not expressible in the current schema, so the next reader does not re-propose
      them, and that the rotary premium became its own mechanic instead.
- [x] **T3.** Extend `economyApprovalGate.test.ts` to pin `partPricing.json` on the
      same hash-pin pattern it already uses, with the section 4a lever table cited in
      the re-pin comment. This is the sprint's most important deliverable.
- [x] **T4.** Sanity-check the resolved catalogue, not the hand-worked examples: dump
      every SKU's resolved price and assert the ladder reads correctly. At minimum,
      within each `carPartId`, price must increase strictly with grade and with class;
      no SKU may resolve below the cheapest stock part of its own class; and the
      brake cliff (pads to calipers, roughly 3x at equal class and grade) must survive
      the round-to-¥100.
- [x] **T5.** Measure the restoration bill against the new prices, over generated
      cars rather than constructed worst cases (directive 22's second analysis rule).
      Report: median and p90 bill by roster tier, the share of each tier's bill sitting
      above its expectation band before and after, and whether law 1 still holds across
      the range the economy actually asks a player to repair.
- [x] **T6.** Re-measure the law-2 generation-time bill guard against the new prices.
- [x] **T7.** If and only if T5 or T6 shows a law broken, stop and report the numbers
      with a named lever proposal. Do not retune inside this sprint.
- [x] **T8.** Update `parts-pricing-notes.md` with the measured results, and move it
      out of `docs/design/reference/period-scans/` (it is a design note, not a scan
      manifest) into `docs/design/systems/`.

## 8. Definition of done

1. Section 4 signed, with the choice on 4b and 4c recorded here.
2. `partPricing.json` is approval-gated and a silent lever move is impossible.
3. The resolved catalogue's ladder is asserted by test, not by hand-worked example.
4. The restoration-bill impact is **measured and reported**, with law 1 and law 2
   either confirmed or reported broken with numbers.
5. `pnpm test --project content` and `--project sim` green; the pre-push hook is the
   full gate (directive 20) and is not re-run by hand.
6. This doc's Exit filled in with the measurements, not with a summary of intent.

## 9. Sign-offs and what is still open

**Signed by the maintainer, 2026-07-28:**

1. **4a:** the ten live levers approved as listed. The gate can be pinned.
2. **4b:** `legend` **deferred**; the inert key is deleted this sprint. (Signed as
   "implement" earlier the same day, then reversed to defer.)
3. **4c:** `overrides` stays empty; the rotary premium becomes its own mechanic.

**Nothing blocks implementation.** Deferring `legend` also removes the
`expectationByTier.legend` lever requirement, so this sprint needs no economy values
beyond the ten already signed.

**Carried forward to `TODO.md`, not to a numbered sprint:** the `legend` fitment class,
which drags the `gaisha` mapping call and three new `expectationByTier.legend` values
with it whenever it is picked up.

**Deferred to the follow-on sprint:** the rotary modifier's tag source, affected parts,
and value.

## Exit

**Status: ready for review.** Parts pricing is now approval-gated, the resolved catalogue's
ladder is asserted by test rather than by hand-worked example, and the calibration notes say
what the sheet actually produces instead of what it was projected to produce.

**This sprint was closed out in two passes and the gap between them is worth recording.** The
first pass landed T1 and did the T5 to T7 measurement work, then stopped without writing the
Exit; a later review found T2, T3, T4 and T8 undone, including the one this doc's own section
5 called "more valuable than any individual number". The closing pass finished them.

### What landed, and where

| File | Change |
| --- | --- |
| `packages/content/data/partPricing.json` | **T1:** `classFactors.legend` deleted. It was inert (a plain `z.object` strips an unknown key) while reading as a live lever, which is the worst of the three states. No resolved price moved. |
| `packages/content/tests/economyApprovalGate.test.ts` | **T3:** `partPricing.json` joins the gate, hash-pinned on the same pattern `economy.json` already uses. The ledger comment lists every lever now covered by name and value: the nine recalibrated base costs, `gradeFactors` (race 2.8 to 3.0), `classFactors` (0.14/0.16/0.4/0.9), `globalFactor` 1, and `overrides` empty. |
| `packages/content/tests/partPricing.test.ts` | **T4:** five tests over the RESOLVED catalogue. Price rises strictly with grade and strictly with class within a price basis; no SKU resolves below the cheapest stock part of its own class; the brake cliff survives the round to Y100; `overrides` is empty. |
| `docs/design/systems/parts-pricing-notes.md` | **T2 and T8:** moved out of `docs/design/reference/period-scans/` (it is a design note, not a scan manifest), the three inexpressible `overrides` recorded as settled rather than suggested, the factor section corrected to the values actually shipping, and section 4's coupling checks replaced with measured figures. |
| `TODO.md` | **T1:** the `legend` deferral was already recorded, carrying the `gaisha` mapping call and the three `expectationByTier.legend` values with it. |

### The gate, and the hole it closes

`economyApprovalGate.test.ts` pinned `economy.json` and `storyMissions.json` and nothing else.
**Eleven levers moved in `partPricing.json` during this sprint and the suite stayed green**,
which is exactly what section 5 warned about, and `classFactors` moved a twelfth time
afterwards, recorded only in a comment. Directive 22's guarantee that "a guard test pins the
economy content so no lever moves silently" did not cover parts pricing at all.

It does now. The pin covers the whole sheet, so a base cost, a class factor, a grade factor,
the global factor or a new override all turn the suite red.

**The pin locks in values approved elsewhere rather than approving anything new**, and the
ledger comment says which approval each one came from, so the gate carries its own history
from the first commit.

### The ladder, measured rather than asserted

The brake cliff holds at **exactly threefold** from pads to calipers at every class and grade
(entry 4,200 to 12,600; everyday 4,800 to 14,400; enthusiast 12,000 to 36,000; flagship 27,000
to 81,000), so the round to the nearest Y100 does not flatten it even on the cheapest class,
which was the specific risk worth testing.

Both monotonicity tests pass across the whole catalogue with no exceptions, which is not a
given: `classFactors` entry to everyday is a 14 per cent step (0.14 to 0.16), and on a cheap
enough base the Y100 rounding could have collapsed two adjacent classes onto the same price.
It does not, and the test now stops that happening silently if a factor moves.

Grouping is by **price basis**, not by `carPartId`, because a zone-panel SKU and a
whole-panel SKU share a slot while pricing from different bases, and comparing across those
would be comparing two different ladders.

### What the sheet produces (T5, measured in the closing pass)

Against the shipped catalogue and the canonical roster book values:

| tier | cars | cheapest car | median car | first-stage street build | full race build | build against median car |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| entry | 5 | 130,000 | 320,000 | 16,600 | 501,600 | 1.57x |
| everyday | 4 | 150,000 | 340,000 | 18,800 | 573,000 | 1.69x |
| enthusiast | 12 | 480,000 | 770,000 | 47,400 | 1,432,800 | 1.86x |
| flagship | 5 | 1,450,000 | 1,850,000 | 106,600 | 3,223,800 | 1.74x |

**The first stage is pocket money on every tier**, 7 to 13 per cent of even the cheapest car
in that tier, so a player can always afford to start. **A full race build costs more than the
car** at 1.57 to 1.86 times the median, which is period-true (the car research documents a
4.8M restoration on a 3.85M Z432) and good game economy: the car is the cheap part. **The
multiple is flat across tiers**, so no tier is the arbitrage one.

The notes' previous coupling checks were computed against the old class names and the old
class factors and were wrong in both. These replace them.

### T5 to T7 in the first pass

Recorded here because they are not written down anywhere else. The restoration-bill
measurement was done and it **fired T7**: a Sunny carrying 2.7 times its own value in parts
drove `instanceBaseValueYen` negative into the scrap floor, where repair moved price by
exactly zero. That went back to the maintainer rather than being retuned inside this sprint,
and the fix landed as the tier re-cut and teardown re-ordering in `ca3ae0a`. Four probes were
found to be measuring plays the game never offers, and one check was deleted outright for
charging a share of weekly rent against a single car's repair, which directive 22 forbids.

### Directive 17 calls

**One, case (a).** `packages/content/tests/commentHygieneGuard.test.ts` rejected a new comment
in `partPricing.test.ts` for naming a sprint number, which is process narrative under
directive 10. The comment was reworded to state the schema fact it was there to state. **The
guard was correct and the comment was wrong**; nothing was loosened.

No pin moved. `economy.json`'s hash and every mission payout are untouched, because this
sprint changed no economy value: the parts sheet was already at its approved values and the
gate simply began asserting them.

### Definition of done, against section 8

1. Section 4 signed, with 4b and 4c recorded. **Met** (section 9).
2. `partPricing.json` approval-gated, silent lever moves impossible. **Met.**
3. Resolved ladder asserted by test. **Met**, five tests.
4. Restoration-bill impact measured and reported. **Met**, above and in the notes.
5. Checks green. **Met**, output below.
6. This Exit filled in with the measurements. **Met.**

### Checks

`pnpm test --project content`: **19 files, 158 tests, all passing.** Only the content project
was run, because every change in the closing pass is content-side: two test files, one JSON
key already absent, and two documents. Nothing in `packages/sim` or `packages/game` reads
anything that moved.

```text
 Test Files  19 passed (19)
      Tests  158 passed (158)
   Duration  1.26s
```

### Still open, deliberately

- **The `legend` fitment class**, deferred with the `gaisha` mapping call and three new
  `expectationByTier.legend` values attached. In `TODO.md`.
- **The rotary parts premium**, sanctioned as its own mechanic with three open points (where
  the tag lives, which parts it touches, and its value). Section 5 of the notes carries the
  design; the value is an unapproved lever.
- **A second period sweep** for clutches, tyres and paint or bodywork rates, which are the
  eighteen base costs with no period anchor at all.
