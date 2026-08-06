# Authenticity and style: two stats a car can actually earn

**Status: BOTH SECTIONS BUILT. Section 3 (authenticity) in Sprint 151, section 2 (style) in
Sprint 152.** Supersedes both earlier 2026-07-31 drafts of this document. The first invented two
new stats and was wrong to; the second stated the problem without specifying the system. This one
specifies it.

**One consequence this document predicted has a number attached now, and it is open.** Section 6
says "buyer style targets were authored against the old scale and should be re-checked against
the new one". The re-check happened by itself: median stock style rose from 13 to 53 on
`everyday`, 15 to 64 on `enthusiast` and 17 to 74 on `flagship`, so a mint stock car now clears
targets that used to be out of reach without work, and the unimproved-flip guard
(`valueModelProbes.test.ts`) fails on those three tiers. See `docs/sprints/sprint_archive/sprint152.md`'s Exit:
the numbers are measured and NOTHING was tuned, because every candidate lever is outside the one
this sprint was authorised to move.

**What shipped, and the one thing that did not.** Authenticity is derived exactly as section 3
states, on the 29 per-slot weights recorded in `authenticity-weights-proposal.md`, and all four
retirements landed. The gap that ships with it: `paint` is zone-derived and the catalogue has no
non-stock SKU for it at any fitment class, so `isStock` is always true there and **11 of the 100
points cannot be lost to modification** - a resprayed car still reads as fully original. `panels`
and `underbody`, which shared this gap, now carry street, sport and race ladders and read as
modified correctly. Paint's weight still drives the condition factor, where it is correct and
load-bearing. The fix (per-zone refinished state) is its own follow-up, recorded in `TODO.md`.

**There is no third stat.** An earlier draft proposed rolling the two into a `desirability` dial.
**RULED 2026-07-31: deleted as a concept.** Buyers score authenticity and style separately, which
is the only way a concours 2000GT and a widebody 350Z can be different cars to different people.
A rollup would have had nothing to do that the two stats do not already do better.

---

## 1. What is wrong today

**`authenticity` is a dice roll the player cannot touch.** `CarInstance.authenticityPercent` is
set once at generation as `rng.int(60, 95)` (`auctions.ts:759`) and nothing ever writes it again.
The derived stat is adjusted by two dead mechanisms: all **472** parts carry
`statModifiers.authenticity` of exactly 0, and **no shipped content ever sets `genuinePeriod`
true** (six sites hardcode `false`). So the collector, who wants authenticity 0.90 at importance
1.00, is satisfied or not by a dice roll at auction.

**`style` is a modification-only axis with an 80-point head.** A stock mint car scores exactly its
`styleBase`, authored 4 to 20 across the roster, so **no stock car can clear any buyer's style
target** (stancer 0.65, hobbyist 0.55, collector 0.50, tuner 0.45). Only 7 of 29 slots carry
style weight, totalling 14 points.

---

## 2. Style

### The shape

A car has a **base** (how it looks stock) and a **ceiling** (how good it could ever look).
Aftermarket parts do not add points; they **close the gap between the two**.

    fitted      = sum of statModifiers.style over installed parts
    reach       = min(1, fitted / styleSaturationPoints)
    styleRaw    = styleBase + (styleCeiling - styleBase) * reach
    style       = round(clamp(styleRaw * conditionFactor, 0, 100))

`conditionFactor` is the existing `weightedBandFactorForStat(car, model, 'style', ...)`, so a
rough car does not look good however it is dressed.

### Why this shape and not addition

It solves the 2000GT problem with no special case. Illustrative values:

| car | base | ceiling | headroom | underglow worth |
| --- | ---: | ---: | ---: | --- |
| Toyota 2000GT | 80 | 85 | **5** | almost nothing |
| Nissan 350Z | 30 | 95 | **65** | a lot |

The same part on two cars produces different results **because the cars are different**, not
because a rule forbids one of them. A rocket bunny kit on a 2000GT *can* raise style, into a
five-point gap, so it is never the play. And a 2000GT is no longer stuck at 20 out of 100, which
was the thing that felt wrong.

**Both numbers are authored per car, freshly, in the roster CSV, for all 94 rows.** RULED
2026-07-31: not derived from `aeroCeiling`, not derived from `culture`. `styleBase`'s existing
4-to-20 range is rescaled as part of this.

---

## 3. Authenticity

**BUILT (Sprint 151).** `stocknessOf`, `machiningCost` and `authenticityPercentOf` in
`packages/sim/src/derivedStats.ts`; weights in `parts-taxonomy.json`'s existing `statWeights`;
tests in `packages/sim/tests/authenticity.test.ts`.

### The formula

    stockness   = sum(weight_s * isStock(s)) / sum(weight_s)   over every slot s
    authRaw     = 100 * stockness - machiningCost(car)
    authenticity = round(clamp(authRaw * conditionFactor, 0, 100))

`isStock(s)` is true when the slot's fitted part has `grade === 'stock'`. `weight_s` is a new
per-slot authenticity weight in `parts-taxonomy.json`, mirroring how style weights already work:
a non-original engine matters more than a non-original air filter.

`conditionFactor` is the same weighted band factor, over the authenticity weights.

This delivers the maintainer's definition exactly: **all parts stock and all parts mint is perfect
authenticity.** Worse condition lowers it. Aftermarket parts lower it.

### The dice roll is retired

`CarInstance.authenticityPercent` is **DELETED**, not repurposed. Under the definition above a
car with all-stock, all-mint parts *is* perfectly authentic, so a stored roll that says otherwise
would contradict the rule. A generated car's authenticity falls out of the parts generation
already fits it with. Save-schema change; directive 19 says version bump and nothing else.

`statModifiers.authenticity` on parts is also **retired**: a part's `grade` already says whether
it is original, so a second per-part authenticity number is a duplicate answer to one question.

`genuinePeriod` and `genuinePeriodMultiplier` are **retired**. RULED 2026-07-31: redundant, and
re-addable later if a genuine-versus-repro distinction earns its place.

### Machining: performance without betrayal

Machining modifies the original part rather than replacing it, so it costs far less authenticity
than fitting an aftermarket one. Each operation carries a cost on a 1-to-10 scale (**1-2 a purist
shrugs, 4-6 a raised eyebrow, 7-9 a collector weeps**), baselined in the machining table recorded
alongside this document.

The important property, and it is not an accident: the cheap operations (valve job 1, full balance
1, journal polish 1, rod peening 2) are exactly what a restoration shop does to a numbers-matching
engine, while the expensive ones (cam regrind 7, bore and hone 8, O-ringing 9) are boost
preparation. **So a restorer can make a car genuinely quicker without losing authenticity, and a
tuner pays for going further.** That satisfies the standing constraint:

> we should not make it Too easy for players to rely solely on authenticity. But at the same time
> we should not make it impossible to have a car that is both a well performing and authentic.

out of the physical facts, with no balancing rule bolted on.

### The cost mapping, and why authenticity ships before machining

**RULED 2026-07-31: authenticity is built against the stand-in machining costs**, not held back
until the machining system exists.

**The stand-in mapping: an operation's 1-to-10 rating IS its cost in authenticity points**, summed
over every operation applied to the car.

    machiningCost(car) = sum of the authenticity rating of every operation applied

The scale falls out sensibly on real builds:

| build | operations | cost |
| --- | --- | ---: |
| a careful freshen | valve job 1 + full balance 1 + journal polish 1 | **3** |
| a mild road port | the above + port and polish 6 + deck 6 | **15** |
| a full boost build | the above + bore 8 + O-ring 9 + cam regrind 7 | **39** |

So a numbers-matching engine that has been blueprinted is still essentially authentic, and one
built for boost has given up most of it, which is exactly the intent.

**This term contributes zero until machining ships**, because no operation can be applied. That is
honest rather than awkward: authenticity is fully correct today for every car that has never been
machined, which is every car, and the term switches on when machining does. It is specified now so
that machining is built against a defined contract instead of inventing one later.

**`machineShopAssist` is not the machining system.** It is a daily hire fee gating whether buried
or signature work can be done at all. The operations above do not exist as actions, and the
baseline table is the start of that design rather than a lever table for a shipping system.

---

## 4. How the two interact

**Fitting a part raises style and lowers authenticity in the same action.** They oppose each other
because it is physically the same event, not because a formula enforces it.

**No penalty for being unfinished.** Within a route, partial work earns partial credit. A 350Z with
only underglow is not punished, it has simply spent a little of its 65 points of headroom.
**Coherence does not transfer from reliability here**: on reliability an incoherent build is
actively worse and breaks; on looks an underdone build is merely unfinished.

**What must be preserved.** Modifying the wrong car stays a losing proposition. A kei's low style
ceiling is what makes the loss the default; the buyer match is what makes the same build
occasionally right. Measured today: return on modification spend was 0.336x on the Wagon R and
0.722x on the S13.

**`aftermarketReturn` is not part of this design.** RULED 2026-07-31: it stays exactly as it is,
tier-keyed and unmoved. It lives in the yen pipeline and answers how much of the parts money
survives into what the car is worth; style and authenticity live in the taste pipeline and answer
who wants the car. Different questions. The 2000GT case is handled by authenticity collapsing when
it is modified, which turns the collector away, so no second mechanism is needed.

---

## 5. Everything that must be authored or signed

| what | where | scope | status |
| --- | --- | --- | --- |
| `styleBase`, rescaled | roster CSV | all 94 | **AUTHORED (Sprint 152)**, 15-88, replaces the 4-20 range |
| `styleCeiling` | roster CSV | all 94 | **AUTHORED (Sprint 152)**, 42-96, preliminary and unsigned |
| `styleSaturationPoints` | `economy.json` | one value | **IMPLEMENTED** at 66, preliminary and unsigned |
| per-slot authenticity weights | `parts-taxonomy.json` | 29 slots | **AUTHORED (Sprint 151)**, preliminary and unsigned |
| per-operation authenticity cost | machining content | 13 operations baselined | **stand-in figures, need signing** |
| `CarInstance.authenticityPercent` | `carInstance.ts` | - | **RETIRED (Sprint 151)** |
| `statModifiers.authenticity` | `stats.ts`, `parts.json` | 472 SKUs | **RETIRED (Sprint 151)** |
| `genuinePeriod` | `carInstance.ts`, `part.ts` | - | **RETIRED (Sprint 151)** |
| `valuation.genuinePeriodMultiplier` | `economy.json` | 1.25 | **RETIRED (Sprint 151)** |

Nothing in `buyers.json` changes. The collector already weights authenticity 1.00 and the stancer
already weights style 1.00 with authenticity at 0.00, so the discrimination this design needs is
already authored and already ratified.

---

## 6. Consequences

**~~`concoursSaleMinAuthenticityPercent` (85) becomes reachable.~~ SUPERSEDED 2026-08-06** by the
progression bible's fifth amendment (`docs/sprints/sprint184.md`). It never did become reachable:
measured after authenticity was derived, an aftermarket block alone costs 18 of the taxonomy's 100
points and a kit with wheels costs 17, so a bar of 85 disqualified every built car by construction
and a tuner, show or racing shop was capped below the top rate however good its work was. The whole
condition predicate is deleted rather than retuned: reputation now reads whether the buyer got what
they came for (`saleOutcomeFor`, sim/valuation.ts). **Authenticity keeps every other reader** -
buyer taste, the coherence term in `marketValueYen`, and the radar chart - it simply no longer buys
a reputation bonus of its own.

**~~Concours and the magazine feature split.~~ Retired with the same amendment.** Neither ever
existed in code, and the split they were meant to express (an original car and a built one are
different kinds of good) is now expressed by which buyer is pleased rather than by two named
awards.

**Every stock car's style rises**, because the base rescales. Buyer style targets were authored
against the old scale and should be re-checked against the new one, though not necessarily moved.

---

## 7. What is still open

1. **Signing the 94 `styleBase` and `styleCeiling` pairs.** Authored in Sprint 152 from
   `style-authoring-proposal.md` and shipped as preliminary, reviewed-and-sane values. That
   document's section 6 lists the ten calls to review first, headed by the Z33 at 45 against the
   worked example's own 30.
2. **Signing `styleSaturationPoints`.** Implemented at 66 against the 108 points fittable across
   all slots, so a focused build reaches its car's ceiling without needing every part.
3. **What the risen stock-style scale does to the sale side.** The unimproved-flip guard now
   fails on `everyday` (margin -0.99 per cent against a -1 per cent bar), `enthusiast` (+0.19)
   and `flagship` (+1.05): a beautiful stock car is genuinely worth more to a buyer who cares
   how it looks, and nothing on the BUY side prices beauty, because `marketValueYen` takes no
   stats. Measured in `docs/sprints/sprint_archive/sprint152.md`; the fix is a lever decision, not an
   implementation one.
4. **The machining system**, on which the authenticity costs depend. `machiningCost(car)` is wired
   and returns 0 until it exists.
5. **Originality for `paint`**, which cannot currently read as modified at all. `panels` and
   `underbody` now can. See the header and `TODO.md`.
6. **Signing the 29 authenticity weights.** They ship as preliminary defaults, recorded in
   `sprint151.md` as the values implemented rather than approved under directive 22.
