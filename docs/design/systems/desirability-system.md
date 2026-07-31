# Authenticity and style: two stats a car can actually earn

**Status: DESIGN. NOT BUILT.** Supersedes both earlier 2026-07-31 drafts of this document. The
first invented two new stats and was wrong to; the second stated the problem without specifying
the system. This one specifies it.

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
target** (stancer 0.65, kei-specialist 0.55, collector 0.50, tuner 0.45). Only 7 of 29 slots carry
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
| `styleBase`, rescaled | roster CSV | all 94 | **needs authoring**, replaces the 4-20 range |
| `styleCeiling` | roster CSV | all 94 | **new, needs authoring** |
| `styleSaturationPoints` | `economy.json` | one value | **needs signing** |
| per-slot authenticity weights | `parts-taxonomy.json` | 29 slots | **new, needs authoring** |
| per-operation authenticity cost | machining content | 13 operations baselined | **stand-in figures, need signing** |
| `CarInstance.authenticityPercent` | `carInstance.ts` | - | **RETIRE** |
| `statModifiers.authenticity` | `stats.ts`, `parts.json` | 472 SKUs | **RETIRE** |
| `genuinePeriod` | `carInstance.ts`, `part.ts` | - | **RETIRE** |
| `valuation.genuinePeriodMultiplier` | `economy.json` | 1.25 | **RETIRE** |

Nothing in `buyers.json` changes. The collector already weights authenticity 1.00 and the stancer
already weights style 1.00 with authenticity at 0.00, so the discrimination this design needs is
already authored and already ratified.

---

## 6. Consequences

**`concoursSaleMinAuthenticityPercent` (85) becomes reachable.** It currently gates a reputation
bonus on a number no player can influence. Once authenticity is derived, concours is something a
player builds toward and that threshold becomes load-bearing.

**Concours and the magazine feature split** (`sale-value-system.md` §5): concours needs mint
condition, high coherence AND high authenticity; a mint, coherent, **modified** car earns a
magazine feature instead. Neither exists in code.

**Every stock car's style rises**, because the base rescales. Buyer style targets were authored
against the old scale and should be re-checked against the new one, though not necessarily moved.

---

## 7. What is still open

1. **The rescaled `styleBase` and new `styleCeiling` values for 94 cars.** Authoring work, and the
   largest single job in this design.
2. **`styleSaturationPoints`.** Today about 82 points of style are fittable across all slots. A
   saturation point near that means a fully dressed car exactly fills its gap.
3. **Per-slot authenticity weights.** 29 numbers, authored once.
4. **The machining system**, on which the authenticity costs depend.
