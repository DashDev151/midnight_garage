# The sale value system: price, patience and standing

**Version 3, 2026-07-30. PROPOSAL. Nothing here is signed; every number is illustrative
until the maintainer signs it by name under directive 22.**

Supersedes the scope of `sprint138.md` and `sprint139.md`. Companion:
`sale-value-system-context.md` explains the surrounding systems this design does not change.

---

## 0. What changed in v3

A second external review checked every calculation in v2 and found one wrong. It was the one
carrying the most weight.

**The correction, and the claim it kills.** Path 3 spent 70,000 of parts and the document
said the outstanding bill fell from 180,000 to 90,000. **The bill IS the repair cost, so
70,000 of spend clears 70,000 of bill.** Twenty thousand yen appeared from nowhere and
everything downstream inherited it. Corrected, Path 3 makes **83,000, not 105,880**, and its
labour rate falls to **6,917 per slot, the worst of any path**.

**So v2's headline finding was false.** "Labour is roughly equally productive everywhere" was
an artefact of my arithmetic error. The truth is better design, and v3 is built on it:

| path | per labour slot | per parking-slot-week | the extreme it occupies |
| --- | ---: | ---: | --- |
| 0, repair flip | 8,813 | 70,500 | balanced, the baseline |
| 1, coherent build | 8,475 | 39,556 | **most absolute profit, worst per bay** |
| 3, salvage flip | **6,677** | **112,175** | **worst per hour, best per bay** |

**Each path is now the extreme of exactly one constraint.** Rough work pays worst by the hour
and best by the bay; building pays best by the car and worst by the bay; the honest flip is
the balanced middle. That is a sharper portfolio than v2 described, and it came from being
wrong.

Everything else the review found, and the response:

| finding | response |
| --- | --- |
| The fixer at 0.88 against the trade network at 0.87 is not a choice | **Accepted.** The fixer drops to 0.80 and pays in favour instead. |
| Staleness decays frequency but never price, so the door never shuts | **Accepted.** An offer-quality distribution is now specified, which also answers Q6. |
| Relist-spam resets patience for the price of a fee | **Accepted.** Relisting returns to 0.7 of fresh, not to fresh. |
| Stage E never says which channels use which formula, and Path 0 depends on it | **Accepted.** Pinned in §3E. |
| "Minimum work" contradicts Path 3 being the heaviest labour in the table | **Accepted.** The pitch line was wrong and is rewritten. |
| A cash sale to a complicit fixer damaging your public name is fictionally hollow | **Accepted.** The cars resurface. §5. |
| Concours means originality; a race build should not earn it | **Accepted, and it closes three loose ends at once.** §5. |
| Gating the scrapyard on low standing rewards griefing yourself | **Accepted, and it was a real trap.** Favour gates it instead. §6. |
| Dissolve the lemon cliff into a universal probability | **Accepted.** §5. |
| Sign the mileage curve before the slot economics | **Accepted.** §12 now carries a signing order. |
| Export wants a batch and a departure date | **Accepted**, with the tension it exposes. §6. |
| "Biannual" is ambiguous; shaken is 3 years then every 2 | **Accepted.** §11. |
| Shaken cuts both ways: near-expiry cars are cheap to buy | **Accepted.** §11. |

---

## 1. The problem

A sale has one outcome today: a price, decided almost entirely by what the car IS and what
state it is in, with a narrow taste band on top.

1. **Modifying a car to sell it loses money, always.** Parts retain a flat 55 per cent,
   credited at a tier fraction, so a 93,600 yen race turbo adds about 30,900 yen on an
   everyday car. No build, however good, changes that fraction.
2. **Taste is flat.** The score is a weighted MEAN of five stats that are anti-correlated by
   design, so a mean of five things that cannot all be high sits near the middle by
   construction and the 24 per cent band is barely exercised.
3. **Two of the three things a sale should express do not exist.** Nothing about a build
   changes how hard a car is to sell, and reputation reads only condition and authenticity,
   so a race turbo on stock internals sells as `clean` and earns +2.
4. **Time is free.** Rent and wages accrue identically whatever the player does, so they are
   noise rather than pressure, and the correct play is to skip days until something happens.

## 2. The principle

**A sale has three outcomes: what you get, how long you wait, and what it does to your name.**

V1 claimed each stage "asks one question and asks it once". That was wrong. Coherence is read
in five places, deliberately, because five different parties care about it for five different
reasons:

| stage | what it asks of coherence |
| --- | --- |
| C, the discount | What does the market expect this build to cost in failures? |
| D, retention | Is this collection of parts worth what was paid for it? |
| E, the match | How much does *this particular buyer* mind? |
| F, liquidity | How many buyers mind enough to walk away? |
| G, standing | Does selling this reflect well on the shop? |

**The principle is narrower: no stage may price the same QUESTION twice.** Condition is priced
in B and nowhere else.

---

## 3. The price stack

### Stage A: what is this car?

    cleanValue = bookValueYen * mileageFactor(mileageKm) * (heatPercent / 100)

### Stage B: what state is it in?

    billBelow      = cost to reach the tier's expected band
    billAbove      = cost from the expected band to mint
    conditionValue = cleanValue
                   - marketRepairDiscount * billBelow
                   - beyondDiscount[tier] * billAbove
    conditionValue = max(conditionValue, scrapValueFraction * cleanValue)

`marketRepairDiscount` 1.3, so work up to expectation returns 1.3x its cost.
`beyondDiscount`: 0.4 entry, 0.8 everyday, 1.2 enthusiast, 1.3 flagship.

**A yen of parts clears a yen of bill.** Obvious, and v2 got it wrong, so it is now written
down: spending X on repairs reduces `billBelow` by exactly X, never more. The only mechanism
that may break that identity is salvage harvesting (§9), and it does so by changing what the
parts COST, never by changing what they CLEAR.

### Stage C: is it going to blow up?

    coherenceShortfall = 1 - coherenceFactor
    coherenceDiscount  = coherenceDiscountWeight * coherenceShortfall * tolerance[buyer]
    stagedValue        = conditionValue * (1 - coherenceDiscount)

PROPOSED `coherenceDiscountWeight` = **0.35**.

`tolerance[buyer]` defaults to **1.0**, with authored exceptions: **stancer 0.0**,
**tuner 0.5**. **Taste-blind channels (the trade network, the fixer, export) price at the
default tolerance of 1.0**, since no particular buyer is expressing a view.

### Stage D: what has been done to it?

    partsValue = sum over installed non-stock, non-scrap parts of
                   part.priceYen * (genuinePeriod ? genuinePeriodMultiplier : 1.0)
    retention  = retentionFloor + (retentionCeiling - retentionFloor) * coherenceFactor
    creditedPremium = partsValue * retention * aftermarketReturn[tier] * foundationFactor
    marketValue     = stagedValue + creditedPremium

PROPOSED `retentionFloor` **0.30**, `retentionCeiling` **1.10**.

`retention` is NOT reduced by `tolerance[buyer]`. Stage C prices the risk of failure, which
the stancer does not care about; stage D prices whether the parts were fitted properly, and
**a bodged install is a bodged install to everyone.** He is indifferent to the engine
grenading, not blind to a bracket made of brackets.

### Stage E: who wants it?

Each archetype carries, per stat, a **target**, an optional **upper bound**, and an
**importance** weight.

    shortfall(stat) = max(0, target[stat] - s) + max(0, s - upper[stat])
    match           = 1 - sum(importance * shortfall) / sum(importance)
    match           = clamp(match, 0, 1)

**Exceeding a target earns nothing: the buyer is satisfied, not impressed.** That is what lets
a real car reach 1.0, which a mean of five stats never can. The upper bound is what makes
"modification narrows your market" a mechanism rather than an authoring convention, and it is
period-correct: a modified car meant shaken trouble, and ordinary buyers actively avoided them.

**Which formula a channel uses, pinned.** v2 gave two and never said which applied where, and
Path 0's baseline turns on it.

    standard channel (ceiling <= 1 + tasteSpread):
        multiplier = min(1 - tasteSpread + 2 * tasteSpread * match, ceiling)

    premium channel (ceiling > 1 + tasteSpread):
        multiplier = (1 - tasteSpread) + (ceiling - (1 - tasteSpread)) * match

So the shop front CLAMPS the standard band at 1.00: a good car reaches market value and stops.
The magazine and the meet REPLACE the band, reaching 1.17 for a perfect fit. Hold `tasteSpread`
at **0.12**.

---

## 4. Stage F: liquidity, and the door that actually closes

    matches(b)  = match(b, car) >= channel.matchThreshold
    weight(b)   = matches(b) ? (match(b,car) - threshold) / (1 - threshold) : 0
    staleness   = stalenessFloor + (1 - stalenessFloor) * exp(-daysListed / stalenessHalfLife)

    dailyOfferChance = channelOfferFactor * staleness
                     * sum over b of presence(b) * weight(b)

PROPOSED `stalenessHalfLife` **14 days**, `stalenessFloor` **0.35**.

### The offer-quality distribution (NEW, and it does three jobs)

**v2's staleness decayed how OFTEN an offer arrived and never what it was WORTH**, so the
prose promised buyers who "negotiate harder" and no mechanism delivered them. With a floor of
0.35 the infinitely patient player still eventually collected the full multiplier: the door
slowed and never shut.

An arriving offer is now a fraction of the channel price:

    offerQuality ~ Normal(mean: qualityMean(daysListed), sd: qualitySpread)
    qualityMean(d) = qualityFresh - (qualityFresh - qualityFloor) * (1 - exp(-d / qualityHalfLife))
    offerYen = round(channelPrice * clamp(offerQuality, qualityFloor, 1.0))

PROPOSED `qualityFresh` **0.98**, `qualityFloor` **0.86**, `qualityHalfLife` **12 days**,
`qualitySpread` **0.04**.

This delivers, with one mechanism:

- **The price decay §4 promised.** Expected proceeds now fall with time, so waiting is
  formally suboptimal past a point and there is a rational moment to take the fast exit.
- **The lowball, mechanically.** The day-3 offer at 0.96 you refuse; the day-19 offer at 0.88
  you stare at.
- **Q6, the texture of a listing week**, which v2 could not answer. The week is a sequence of
  arriving numbers you accept or decline, and declining costs a day.

### Relisting, and the exploit it would otherwise open

**If relisting reset staleness to fresh, patience would be back for the price of a fee.** So
it does not: a relist returns staleness and offer quality to **`relistRecovery` = 0.7 of
fresh**, never to 1.0. Same plate, same advertisement, and everyone has seen it.

---

## 5. Stage G: standing

### The lemon is a probability, not a cliff

v2 had a hard threshold at 0.55 and offered a probabilistic band only as a fallback for hidden
cars. **The band becomes universal**, because a hard line on a hidden continuous value is
unfair however visible we make it, and because a probability is the better fiction: it is
whether the buyer CATCHES it.

    lemonRisk = clamp((lemonRiskCeiling - coherenceFactor)
                      / (lemonRiskCeiling - lemonRiskFloor), 0, 1)

PROPOSED `lemonRiskCeiling` **0.65**, `lemonRiskFloor` **0.45**. So coherence 0.65 or better
is never a lemon, 0.45 or worse always is, and Path 2's stupid car at **0.605 carries a 22.5
per cent risk**, displayed in the appraisal as exactly that. An informed gamble, in a game
already built on looks against truth.

### Concours means original, and fixing that closes three things

**A coherence-1.0 race build earning "concours" would read as nonsense to the audience this
game courts.** Concours means originality. So:

- **Concours** requires mint condition, high coherence, **and high authenticity**. An
  unmolested car, properly kept.
- A mint, coherent, **modified** car earns a **magazine feature** instead: the period-correct
  honour for exactly that car, and the event that grants the **provenance multiplier** v2
  parked as future work.

That single split resolves the concours semantics, the provenance placeholder, and the
"should `retentionCeiling` exceed 1.10" question. **It should not** (Q3 holds): fame is a
property of a specific car's history and now has its own carrier.

### Who saw it? The cars resurface

**A cash sale to a complicit fixer damaging your public name is mechanically necessary and
fictionally hollow.** The honest fix is cheap and better atmosphere: **the cars come back
around.** A grenade you sold turns up on a forecourt two streets over, or in the yard you buy
from, and word travels with it. Standing falls because the neighbourhood is small, not because
an invisible referee was watching.

### Standing feeds the flow, which IS the ratchet fix

    presence(b) = basePresence(b) * reputationFlowFactor(reputation, b) * seasonFactor(b, week)

**This design has already solved the reputation ratchet and should say so.** Unlocks can stay
ratcheted, because taking away a tool the player paid for feels arbitrary. What standing now
buys is **throughput**: how many buyers appear, how good they are, and what turns up in the
yard. That applies at every level, forever, so standing never stops mattering and nothing is
ever confiscated. `TODO.md`'s ratchet entry can close against this section.

---

## 6. The dodgy trade

**Its loop closes on the buying side, not the building side.** Building badly and hoping is a
lottery, not a business, and §9's Path 2 exists to prove it.

**The pitch line, corrected.** v2 said "cheap in, minimum work, certain out, and fast", and
its own table showed Path 3 as the heaviest labour of any path. The identity is:

> **Cheap in, grimy work, certain out, and out of the bay fast.**

Rough cars need MORE hours, not fewer. What the trade wins is the bay and the input price,
never the hour.

### In: the scrapyard, gated on favour rather than disgrace

**Gating the yard on low public standing would reward a player for deliberately selling
lemons to tank their own reputation.** Griefing yourself to unlock content is a known bad
pattern and v2 walked straight into it.

**It is gated on the fixer's favour meter instead.** Dodgy sales build favour; favour opens
the yard. The accelerant becomes *engagement with the dodgy economy* rather than self-harm,
the honest player still gets there later through the campaign or cash, and the favour meter
finally has a payoff.

### Out: three exits, properly spaced

| exit | pays | speed | takes | notes |
| --- | --- | --- | --- | --- |
| trade network | **0.87** | fast | any car | the neutral floor, open to everyone |
| the fixer | **0.78 to 0.82** | instant | **anything, including what others refuse** | pays the difference in **favour** |
| export container | taste- and mileage-blind | **slow cash, fast bay** | batch of 3 to 4 | monthly departure |

**v2 had the fixer at 0.88 against the network's 0.87, which is not a choice.** He now pays
worse and settles the difference in favour, which is his real currency. Every dodgy sale is a
live micro-decision: better cash from the network, or worse cash plus progress toward the yard.

**The export container's tension, stated out loud because v2 buried it.** The car **leaves its
slot when it is loaded** but **pays weeks later, on the ship's departure**. So export is the
**fast exit for space and the slow exit for cash** — the precise opposite of the fixer. A
batch of 3 to 4 is what containers actually carried, and it creates a "filling the container"
goal that shapes buying for weeks.

---

## 7. Time, space and rhythm

**Rent and wages are not uncompelling because they are small, but because they are flat.** A
cost you cannot outplay is noise. Waiting stops being free the moment it competes with
something.

**And the test that comes with it: if waiting is always bad, dump-fast dominates and the
degenerate strategy has merely moved.** Waiting must be sometimes right.

**1. Space, the strongest.** A car occupies a slot from purchase until sale. The stance car
waiting for its one buyer is blocking the bay you would put tomorrow's pickup in. Zero UI, a
visible per-car opportunity cost, and viciously authentic: **shako shōmei** means urban Japan
is the one place on earth where you must prove you have somewhere to put a car before you may
own it.

**Forecourt against covered storage (Q1).** They are different slots. **Viewings happen at the
forecourt**, so a listed car needs one. Covered storage is cheaper and holds stock you are not
selling yet. That makes the COMPOSITION of your space a decision, not just its size.

**2. Weekly rhythm.** Give the week a shape: **auction day** (USS ran weekly), the **weekend
meet**, **wages due Friday**, the **container's monthly departure**, and a catalogue that
rotates with good lots that appear once and go to someone else. Capital tied up in an unsold
car now has teeth: you watched the cheap S2000 go on Thursday because your money was in a
stance car.

> Time pressure is a stick; time rhythm is a landscape.

**3. Staleness and the offer-quality slide**, §4.

**4. Heat drift under held cars.** Let values move while cars sit. **This is what makes waiting
sometimes right**, which is what stops dump-fast dominating: holding until the spring meet,
when stancer presence spikes, can be correct. The moment a player holds a car because they are
waiting for the market, the economy exists despite them.

**Held back deliberately:** floorplan financing, daily interest on stock. Domain-correct and
the sharpest instrument here; a difficulty option or a late-game mechanic, not baseline.

**Wages fix themselves.** Once days are productive, an idle mechanic is not a line item, he is
foregone output.

---

## 8. What the ledger records

**Profit**, **profit per labour slot**, **profit per parking-slot-week**, and **days to cash**.
Assumptions, illustrative: **3 labour slots per day**, a repair or install costs **1 slot**,
**4 parking slots** early.

---

## 9. Worked examples

Nissan Silvia K's (S13). Everyday, book 500,000, `reliabilityBase` 92, 90,000 km, heat 100.

    Stage A: cleanValue = 500,000 * 0.925 * 1.00 = 462,500

### Path 0: the repair flip (baseline)

Bought at auction **300,000**, uniformly worn. 60,000 of work to `fine`, 8 slots.

    Stage B: 462,500 - 1.3*0 - 0.8*40,000 = 430,500
    Stage E: match ~0.6, shop front standard band clamped at 1.00 -> 430,500

**Spent 360,000. Sold 430,500. Profit 70,500.** 8 slots, 7 days.
→ **8,813 per slot. 70,500 per slot-week.**

### Path 1: the coherent build

Same, plus a sport turbo with matching fuelling, cooling and clutch. Parts **100,000**, 4
slots. `coherenceFactor` 1.0.

    Stage D: retention 1.10, premium 100,000*1.10*0.6 = 66,000   496,500
    Stage E: racer match 0.95, magazine premium band ceiling 1.17
             0.88 + 0.29*0.95 = 1.1555                           573,700
             less 12,000 fee                                     561,700

**Spent 460,000. Sold 561,700. Profit 101,700.** 12 slots, 18 days.
→ **8,475 per slot. 39,556 per slot-week.** The 100,000 of parts returned **131,200**.

### Path 2: the dodgy build (the lottery, kept as a warning)

Same, plus a race turbo alone. Parts **93,600**, 1 slot. `coherenceFactor` 0.605.

    Stage C: discount 0.35*0.395 = 0.138 -> 371,000
    Stage D: retention 0.784, premium 44,000 -> 415,000
    If a stancer appears (tolerance 0): base 474,500, match 0.90,
             weekend meet 1.141 -> 541,400, less 3,000 -> 538,400

**If he turns up:** profit **84,800** over ~24 days. → 9,422 per slot, **24,733 per slot-week**.
**If he does not**, the trade network takes it at 0.87: **loss of 92,550**.
**Lemon risk 22.5 per cent** either way.

### Path 3: the salvage flip (CORRECTED)

The same shell from the **scrapyard as a wreck, 100,000**. Bill to `fine`: **180,000**.

    Stage B at purchase: 462,500 - 1.3*180,000 - 0.8*40,000 = 196,500

Minimum viable work: **70,000 of parts, 12 slots**, which clears **exactly 70,000** of bill,
leaving 110,000 outstanding. No aftermarket.

    Stage B after: 462,500 - 1.3*110,000 - 0.8*40,000 = 287,500

| exit | sale | profit | per slot | per slot-week |
| --- | ---: | ---: | ---: | ---: |
| trade network 0.87 | 250,125 | **80,125** | 6,677 | **112,175** |
| the fixer 0.80 | 230,000 | 60,000 | 5,000 | 84,000 |

**Spent 170,000.** 12 slots, 5 days. The fixer costs 20,125 of cash and buys favour toward the
yard: **that is the micro-decision**, and it only exists because he is priced away from the
network.

### Optional mechanism: salvage harvesting

The review's second resolution, offered as a **separate proposal rather than folded into the
baseline**, because the corrected table must be honest before anything else is decided.

The dodgy player does not buy parts at book; **they pull them from the wrecks**, and the
scrapyard's routing puzzle is already the delivery vehicle. **A good route through the yard is
the discount.** A `salvagePartsCostFactor` of **0.78** means 70,000 of bill costs 54,600 to
clear:

| variant | spent | profit | per slot | per slot-week |
| --- | ---: | ---: | ---: | ---: |
| corrected baseline | 170,000 | 80,125 | 6,677 | 112,175 |
| with harvesting | 154,600 | **95,525** | 7,960 | **133,735** |

It gives "cheap in" a real mechanism, and it **self-caps** on what the yard actually holds that
week. **Note it changes what parts COST, never what they CLEAR** — the §3B identity holds.

### The comparison

| path | profit | per slot | per slot-week | days | standing |
| --- | ---: | ---: | ---: | ---: | --- |
| 0 repair flip | 70,500 | 8,813 | 70,500 | 7 | clean |
| 1 coherent build | 101,700 | 8,475 | 39,556 | 18 | clean, or a feature |
| 2 dodgy build, sold | 84,800 | 9,422 | 24,733 | 24 | 22.5% lemon risk |
| 2 dodgy build, dumped | −92,550 | — | — | 21 | 22.5% lemon risk |
| 3 salvage flip | 80,125 | **6,677** | **112,175** | 5 | high lemon risk |

**Each path is the extreme of exactly one constraint.**

- **Path 1 earns the most per car and the least per bay.** Building is justified by absolute
  margin and by scale, never by rate.
- **Path 3 is the worst per hour and the best per bay.** Rough work is grimy and slow to do,
  and it clears the bay fastest.
- **Path 0 is the balanced middle**, which is why it is the reliable business.

**If you are short of bays, you flip and you salvage. If you have bays to spare, you build.**
A genuine portfolio decision driven by space, and why slots must be expensive.

**Three things stop salvage dominating**, none of them a punishment: the yard holds a handful
of cars and rotates weekly; every such sale carries real lemon risk and standing thins the flow
both of buyers and of stock; and **it does not scale**, because the 1.3x return is a multiplier
on the bill, so absolute profit tracks how large a bill you can take on, which tracks capital,
tools and access. **Dodgy is better early, honest is better late.**

---

## 10. Legibility: the appraisal

A mechanic's appraisal on any car, decomposing the stack:

    Book, this model, this mileage, this market      462,500
    Work it still needs                             -117,000
    Build risk (fuelling is the weak point)          -14,300
    Parts fitted, as the market credits them         +44,000
    ----------------------------------------------------------
    What it is worth                                 375,200

    Best fit:   tuner       (0.81)  up to 428,000 via the magazine
    Poor fit:   first-timer (0.22)  will not call
    Lemon risk: 22%                 if it sells, it may cost you standing

It makes stages C and D visible, warns before a mistake rather than after, turns Path 2's
0.605 into a number the player can feel, and **it is where most of the fun of this system will
live.**

---

## 11. Period fidelity

**Shaken.** The inspection is at **three years from new, then every two years** ("biannual" is
ambiguous and should not be used). It is why values step down near expiry, why illegal
modifications get reverted before inspection, and substantially why Japan exports used cars.

- **Months remaining** is a value and liquidity modifier.
- **A non-compliant build** needs a compliance bill before a domestic sale, or a channel that
  does not care.
- **It cuts both ways, and that is the good part.** A car near expiry is **cheap at auction**,
  so months-remaining is a **buying skill** rather than only a selling tax, and the player can
  run the same arbitrage the export trade actually ran.

**Mileage.** The current curve (0.925 at 90,000 km) is gentle by period domestic standards,
where 90,000 km was high. Proposed: a steeper domestic curve, **paired with the mileage-blind
export channel**, which reproduces the real arbitrage rather than simulating it.

**Era events on heat.** Gran Turismo spiking specific models in 1997-98, the R34 launch pushing
the R33 down, Best Motoring features, kei sports discontinuations. **Seasonal presence** does
the same for Stage F: racers thick in season, stancers thin in winter.

---

## 12. Levers, and the order they must be signed in

**Signing order matters, because early levers rescale the worked examples that justify later
ones.**

**First, because it rescales Stage A and therefore every example in §9:**

| lever | proposed | controls |
| --- | --- | --- |
| `valuation.mileageFactorCurve` | steeper than today | the domestic mileage phobia |

**Second, because §9's table prices it:**

| lever | proposed | controls |
| --- | --- | --- |
| parking slot count, forecourt against storage, expansion cost | author; anchor payback at 4 to 8 weeks of the marginal activity (~70,000/slot-week early) | the price of patience |

**Then the rest:**

| lever | proposed | controls |
| --- | ---: | --- |
| `tradeNetwork.priceBand` | 0.87 | the neutral floor |
| `fixer.priceBand` | 0.78 to 0.82 | the price of favour |
| `coherenceDiscountWeight` | 0.35 | how much incoherence discounts value |
| `retentionFloor` / `retentionCeiling` | 0.30 / 1.10 | what a build's parts are worth |
| `tasteSpread` | 0.12, hold | the standard band |
| `tolerance[archetype]` | 1.0 default; stancer 0.0, tuner 0.5 | who minds a bad build |
| `lemonRiskCeiling` / `lemonRiskFloor` | 0.65 / 0.45 | the lemon probability band |
| `stalenessHalfLife` / `stalenessFloor` | 14 days / 0.35 | how fast a listing goes cold |
| `qualityFresh` / `qualityFloor` / `qualityHalfLife` / `qualitySpread` | 0.98 / 0.86 / 12 days / 0.04 | what an arriving offer is worth |
| `relistRecovery` | 0.70 | how much a relist buys back |
| `salvagePartsCostFactor` | 0.78, if adopted | the harvest discount |
| lemon cost anchor | ~70,000 of foregone flow, one Path-0 flip | what standing is worth |
| buyer target / upper / importance | author | replaces the flat statWeights |
| `basePresence`, `seasonFactor`, `reputationFlowFactor` | author | who is about, and when |
| export batch size, departure cadence, friction odds | author | the slow exit |
| shaken value and liquidity curves | author | the dominant period fact |

## 13. New against reused

**New:** the coherence discount, coherence-scaled retention, taste as a match with upper
bounds, liquidity with staleness AND offer quality, the lemon probability band, the magazine
feature and its provenance multiplier, the tolerance scalar, parking slots split into forecourt
and storage, the weekly rhythm, heat drift under held cars, the appraisal, the fixer and the
export container, favour as the scrapyard gate, shaken, optional salvage harvesting.

**Reused unchanged:** book value, market heat and its weekly pressure model, the repair
deduction and its 1.3x, tier expectations and `beyondDiscount`, the foundation factor,
`aftermarketReturn`, the listing channels and their ceilings and fees, the buyer archetypes,
the support ratios and `coherenceFactor`, the reputation plumbing, the scrapyard design and its
routing puzzle, the auction generation model.

## 14. Open questions

1. **Which Path 3 resolution ships:** the corrected baseline alone, or the baseline plus
   salvage harvesting? Both are honest; the second gives "cheap in" a mechanism and needs one
   more lever signed.
2. **Does the fixer's appetite need a cap?** He currently takes anything, always. A finite
   monthly appetite would stop him being an infinite sink and would make favour scarcer.
3. **What does calling in a favour actually cost the player?** The meter needs a downside or
   it is only a currency.
4. **How does the magazine feature get earned?** Coherence and condition are necessary but a
   feature should be an event, not a threshold crossed silently.
5. **Does export friction ever lose the car**, or only delay it? The game has no random
   catastrophic loss anywhere, and export should probably not introduce the first.
6. **What does a listing week feel like?** §4 now supplies the mechanical half. The cadence,
   the copy and the character of the buyer at the gate are a content job.
