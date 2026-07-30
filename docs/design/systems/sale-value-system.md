# The sale value system: price, patience and standing

**Version 2, 2026-07-30. PROPOSAL. Nothing here is signed; every number is illustrative
until the maintainer signs it by name under directive 22.**

Supersedes the scope of `sprint138.md` and `sprint139.md`. Companion: `sale-value-system-context.md`
explains the surrounding systems this design does not change.

---

## 0. What changed in v2, and why

An external review of v1 found two structural faults and a set of sharper answers to the open
questions. Almost all of it is accepted. The material changes:

| review finding | response |
| --- | --- |
| The trade network at 0.98 defangs the whole liquidity axis | **Accepted.** Moved to 0.87. Time is not free any more. |
| The dodgy business never closes its loop; §7 disproves §6 | **Accepted.** The loop closes through cheap salvage, not through builds. Path 3 added and worked in full. |
| Labour is called the bottleneck and never enters the ledger | **Accepted.** Every path now carries profit per labour slot and per parking-slot-week. It changed the conclusions. |
| "Priced once" is violated by your own system | **Accepted.** The principle is reworded rather than the system defended. §2. |
| A hidden coherence value with hard thresholds is illegible | **Accepted.** The appraisal is now a first-class part of the design, §10, not a UI afterthought. |
| Stancer farming; and why does he pay coherence-crushed retention? | **Accepted, partly.** Tolerance scalar answers the first. The second gets a ruling: he does, and the reason is stated. |
| Extend the stancer exemption (Q1) | **Accepted as proposed:** a per-archetype tolerance scalar. |
| The export container is the historically correct dodgy exit (Q2b) | **Accepted,** with the fixer as its companion. §6. |
| Hold `retentionCeiling` at 1.10; fame is provenance, not coherence (Q3) | **Accepted.** Provenance becomes its own future multiplier. |
| Add a "too much" direction to the match (Q4) | **Accepted, and it is load-bearing.** §3E. |
| Shaken is the dominant fact of Japanese used-car economics | **Accepted.** §11. It also gives the dodgy trade its best hustle. |
| Mileage curve is gentle by period standards | **Accepted** as a proposal, paired with a mileage-blind export. |
| Time needs space, rhythm, staleness and drift | **Accepted in full.** New §8, and it reframed the whole document. |

One thing the review asked for that this document deliberately still does not answer: what a
listing week feels like minute to minute. §9 specifies its skeleton, but the copy, the cadence
and the texture of a lowball are a content job and are called out as such.

---

## 1. The problem

A sale has one outcome today: a price, decided almost entirely by what the car IS and what
state it is in, with a narrow taste band on top. Three measured consequences:

1. **Modifying a car to sell it loses money, always.** Parts retain a flat 55 per cent,
   credited at a tier fraction, so a 93,600 yen race turbo adds about 30,900 yen on an
   everyday car. No build, however good, changes that fraction.
2. **Taste is flat.** The score is a weighted MEAN of five stats that are anti-correlated by
   design: aftermarket buys power and destroys authenticity, and style is capped at 20 for
   any stock car. A mean of five things that cannot all be high sits near the middle by
   construction, so the 24 per cent band is barely exercised.
3. **Two of the three things a sale should express do not exist.** Nothing about a build
   changes how hard a car is to sell, and reputation reads only condition and authenticity,
   so a race turbo on stock internals sells as `clean` and earns +2. Selling a grenade
   currently makes your name.

And underneath all three, a fourth: **time is free.** Rent and wages accrue identically
whatever the player does, so they are noise rather than pressure, and the correct play is to
skip days until something good happens.

## 2. The principle, and an honest correction

**A sale has three outcomes: what you get, how long you wait, and what it does to your name.**
All three should respond to the build.

V1 claimed each stage "asks one question and asks it once". **That was wrong and the reviewer
was right to indict it with its own words.** Coherence is read in five places. It is not
double-counting, because each stage asks a genuinely different question about it, but the
claim needed replacing rather than defending:

| stage | what it asks of coherence |
| --- | --- |
| C, the discount | What does the market expect this build to cost in failures? |
| D, retention | Is this collection of parts worth what was paid for it? |
| E, the match | How much does *this particular buyer* mind? |
| F, liquidity | How many buyers mind enough to walk away? |
| G, standing | Does selling this reflect well on the shop? |

**The real principle is narrower and defensible: no stage may price the same question twice.**
Condition is priced in B and nowhere else. Coherence is priced five times, deliberately,
because five different parties care about it for five different reasons.

---

## 3. The price stack

### Stage A: what is this car?

    cleanValue = bookValueYen * mileageFactor(mileageKm) * (heatPercent / 100)

Unchanged. Stat-blind: a Supra is a Supra whatever has been done to it.

### Stage B: what state is it in?

    billBelow      = cost to reach the tier's expected band
    billAbove      = cost from the expected band to mint
    conditionValue = cleanValue
                   - marketRepairDiscount * billBelow
                   - beyondDiscount[tier] * billAbove
    conditionValue = max(conditionValue, scrapValueFraction * cleanValue)

Unchanged. `marketRepairDiscount` 1.3 means work up to expectation returns 1.3x its cost.
`beyondDiscount`: 0.4 entry, 0.8 everyday, 1.2 enthusiast, 1.3 flagship.

### Stage C: is it going to blow up? (NEW)

Reliability leaves taste and becomes a discount. A car that will grenade is objectively worth
less; that is a defect, and defects belong with condition.

    coherenceShortfall = 1 - coherenceFactor
    coherenceDiscount  = coherenceDiscountWeight * coherenceShortfall * tolerance[buyer]
    stagedValue        = conditionValue * (1 - coherenceDiscount)

PROPOSED `coherenceDiscountWeight` = **0.35**.

**`tolerance[buyer]` (Q1, accepted as the reviewer proposed).** Default **1.0**. Authored
exceptions only: **stancer 0.0** (genuinely does not care), **tuner 0.5** (knows what he is
buying and intends to fix it). One mechanism, parameterised, and a default of 1.0 with
explicit exceptions keeps the discount honest for everyone unnamed.

Reads the COHERENCE half of reliability only. Condition is priced in B.

### Stage D: what has been done to it? (CHANGED)

    partsValue = sum over installed non-stock, non-scrap parts of
                   part.priceYen * (genuinePeriod ? genuinePeriodMultiplier : 1.0)
    retention  = retentionFloor + (retentionCeiling - retentionFloor) * coherenceFactor
    creditedPremium = partsValue * retention * aftermarketReturn[tier] * foundationFactor
    marketValue     = stagedValue + creditedPremium

PROPOSED `retentionFloor` **0.30**, `retentionCeiling` **1.10**, held at 1.10 per Q3.

- Incoherent build retains 30 per cent. You fitted a turbo the car cannot support.
- Perfect build retains 110 per cent. **A well-sorted car is worth more than the sum of its
  parts.** This is where "recoup and then some" lives.
- A straight line between, so the reward is a spectrum, not a cliff.

**Ruling on the reviewer's stancer inconsistency.** `retention` is NOT reduced by
`tolerance[buyer]`. The stancer's exemption covers stage C only. The reason: C prices the
risk of the car failing, which he genuinely does not care about, while D prices whether the
parts were fitted properly. **A bodged install is a bodged install to everyone**, including a
man who wants it low and loud. He will still see hacked wiring and a bracket made of
brackets. He is indifferent to the engine grenading, not blind.

**Provenance is deliberately not here (Q3).** A famous car being worth more than its parts is
a property of that specific car's history, not of its coherence. It earns its own future
multiplier on the car's record: magazine feature, race history, a known builder. Raising
`retentionCeiling` to capture it would make every tidy build famous, which devalues the idea
and courts exactly the dominance the ceiling exists to avoid.

### Stage E: who wants it? (CHANGED)

**Taste becomes a match, not an average.** A mean punishes specialisation: to score highly a
car must be good at everything, and the stats are deliberately anti-correlated, so every car
lands in the middle. A match asks whether the car satisfies what that buyer wants, so a
specialised car can be somebody's perfect car.

Each archetype carries, per stat, a **target**, an optional **upper bound**, and an
**importance** weight.

    shortfall(stat) = max(0, target[stat] - s) + max(0, s - upper[stat])
    match           = 1 - sum(importance * shortfall) / sum(importance)
    match           = clamp(match, 0, 1)

**Exceeding a target earns nothing: the buyer is satisfied, not impressed.** That property is
what lets a real car reach 1.0, which a mean of five stats never can.

**The upper bound is Q4, accepted, and the reviewer is right that it is load-bearing rather
than flavour.** Without it a perfectly coherent tuned car can still match the commuter at
1.0, and "modification narrows your market" survives only as an authoring convention hidden
inside authenticity targets. With it, the narrowing is an explicit mechanism. It is also
period-correct: in 1990s Japan a modified car meant shaken trouble and insurance questions,
and ordinary buyers actively avoided them rather than merely not caring.

Worked contrast, a loud low car, style 0.70, reliability 0.10:

- Current mean: the stancer scores it about **0.2** and pays near the floor.
- Match: his only target is style 0.60, which it clears, so he scores **1.0** and pays his
  ceiling. Correct. That is his car.
- The commuter, with an upper bound on power and a target on reliability, scores it near
  **0**, and under §4 never turns up at all.

Multiplier shape unchanged, still bounded by the listing channel:

    tasteMultiplier   = 1 - tasteSpread + 2 * tasteSpread * match
    channelMultiplier = (1 - tasteSpread) + (ceiling - (1 - tasteSpread)) * match

Hold `tasteSpread` at **0.12**. The band was never the problem; the score was.

---

## 4. Stage F: liquidity, and the closing door

    matches(b)  = match(b, car) >= channel.matchThreshold
    weight(b)   = matches(b) ? (match(b,car) - threshold) / (1 - threshold) : 0
    staleness   = stalenessFloor + (1 - stalenessFloor) * exp(-daysListed / stalenessHalfLife)

    dailyOfferChance = channelOfferFactor
                     * staleness
                     * sum over b of presence(b) * weight(b)

**Staleness is the reviewer's third mechanism and it is what turns waiting into a decision
rather than a grind.** Offer frequency decays as a listing ages, and buyers negotiate harder
on a car everyone has seen sitting. PROPOSED `stalenessHalfLife` **14 days**,
`stalenessFloor` **0.35**.

Mathematically it makes Stage F a proper optimal-stopping problem: the expected value of
continuing to wait declines, so **there is a rational moment to take the fast exit, and
grinding past it is provably losing.** No deadline, no punishment, just a softly closing door.

**Relisting** reopens it partially: a fresh channel, a small fee, optionally a cosmetic
refresh. Authentic dealer behaviour, and it gives the player something to do about a stale car
other than capitulate.

Shape:

- **Stock, sound, ordinary** suits nearly everyone. Many offers, fast, modest money.
- **Coherent specialised build** suits one archetype. Few offers, slow, near the ceiling.
- **Incoherent build** suits almost nobody but the stancer. Long wait, thin money.

## 5. Stage G: standing

`saleReputationDeltaFor` gains a coherence term:

- **Lemon** if any part is scrap or missing, OR condition is below its threshold, **OR
  `coherenceFactor` is below `lemonCoherenceCeiling`** (PROPOSED **0.55**).
- **Concours** additionally requires coherence >= `concoursCoherenceFloor` (PROPOSED **0.95**).
  A concours car is not merely mint, it is right.

**On the cliff (accepted).** A hidden continuous value with hard thresholds is unfair. The
primary answer is §10's appraisal, which makes coherence visible and warns before the sale.
**If coherence stays hidden for any car, the threshold becomes a probabilistic band rather
than a cliff** (lemon chance rising from 0 at 0.65 to 1 at 0.45), so a player is never
silently guillotined by a number they could not see.

And standing feeds liquidity, which is simultaneously the fix for the reputation ratchet:

    presence(b) = basePresence(b) * reputationFlowFactor(reputation, b) * seasonFactor(b, week)

Good standing brings more buyers and better ones. Poor standing brings fewer, and a
**different set**. Nothing is confiscated; the flow thins and changes character.

---

## 6. The dodgy trade, and the loop that closes it

**The reviewer's Finding 2 was correct: v1's dodgy path was a stancer lottery, not a business.**
Building badly and hoping is not a tempo trade. The loop closes on the buying side, not the
building side.

**In: the scrapyard.** Already designed (`systems/scrapyard.md`): readable wrecks, parts of
unknown condition, a routing puzzle. **Playing dodgy is a quicker or cheaper route to
unlocking it, not an exclusive one.** Everyone gets there; poor standing gets there sooner and
for less, which is when a thin-margin business most needs cheap stock.

**Out: two exits, and the trade network is demoted to the floor.**

- **The trade network** becomes the boring, certain floor at **0.87** of market value
  (Finding 1). Taste-blind, no fee, fast. It exists so that no car is ever unsellable, and it
  is deliberately a bad price.
- **The export container (Q2b, accepted).** Historically the correct answer: late-90s grey
  export to New Zealand, Australia, the UK and Ireland was precisely the escape valve for
  cars the domestic market did not want, whether for mileage, condition or shaken position.
  It pays **indifferent to domestic taste and indifferent to mileage**, ties up capital for
  weeks, and carries occasional customs friction. It scales into a late-game identity.
- **The fixer**, for character. Instant cash at a haircut, an accruing favour meter, and
  occasional calls to collect on it. **He is also the scrapyard supply contact**, so one
  person serves both ends of the dodgy loop.

**Why it is worth playing, in one line: cheap in, minimum work, certain out, and fast.** It
wins on turnover and input cost, never on margin. §9 proves it with numbers.

---

## 7. Time, space and rhythm: the economy of a week (NEW)

The reviewer's inversion is accepted wholesale: **rent and wages are not uncompelling because
they are small, but because they are flat.** A cost you cannot outplay is noise. Waiting stops
being free the moment it competes with something.

And the design test that comes with it: **if waiting is always bad, dump-fast dominates and
the degenerate strategy has merely moved.** Waiting must be sometimes right.

Four mechanisms, three of them the minimum viable set.

**1. Space (the strongest).** A car occupies a slot from purchase until sale, listed or not.
Slots are few and expensive to expand. The stance car waiting for its one buyer is now
blocking the bay you would put tomorrow's auction pickup in. Zero UI, zero pressure, and a
visible per-car opportunity cost. It is also viciously authentic: **shako shōmei** means urban
Japan is the one place on earth where you must prove you have somewhere to put a car before
you may own it.

**2. Weekly rhythm.** End-day spam works because every day is identical. Give the week a shape:
**auction day** (USS ran weekly), the **weekend meet**, **wages due Friday**, and a catalogue
that rotates with genuinely good lots that appear once and go to someone else. Now capital
tied up in an unsold car has teeth: you watched the cheap S2000 go on Thursday because your
money was sitting in a stance car. **Time pressure is a stick; time rhythm is a landscape.**

**3. Staleness.** Specified in §4. Makes infinite patience formally suboptimal without a
deadline.

**4. Heat drift under held cars.** Already owned, not yet doing this job. Let values move while
cars sit. **This is the piece that makes waiting sometimes right**, which is what stops
dump-fast dominating: holding until the spring meet when stancer presence spikes can be the
correct play. The moment a player deliberately holds a car because they are waiting for the
market, the economy has become something that exists despite them.

**Held back deliberately:** floorplan financing, with daily interest on stock. Domain-correct,
and the sharpest instrument here. It belongs as a difficulty option or a late-game scale
mechanic, not as baseline.

**And wages fix themselves.** Once days are productive, an idle mechanic is not a line item,
he is foregone output. That is what "labour is the bottleneck" needed to mean in the ledger
all along.

**The spec question this forces, answered:** a listed car **does** occupy a slot, whatever the
channel, and **viewings happen at the shop**. The buyer turns up, looks it over, and may
lowball. That is what gives the waiting days their texture, and it is the last unspecced gap
the review identified. The export container is the one exception: the car leaves the slot when
it enters the container, which is part of what you are paying for.

---

## 8. What the ledger has to record

Every worked example below reports four numbers, because the reviewer is right that the first
two alone cannot justify a lever:

- **Profit**, absolute.
- **Profit per labour slot**, since labour is the work bottleneck.
- **Profit per parking-slot-week**, since space is the inventory bottleneck.
- **Days from purchase to cash.**

Assumptions, all illustrative: **3 labour slots per day**, a repair or an install costs **1
slot**, and the player has **4 parking slots** early.

---

## 9. Worked examples

A Nissan Silvia K's (S13). Everyday, book 500,000, `reliabilityBase` 92, 90,000 km, heat 100.

    Stage A: cleanValue = 500,000 * 0.925 * 1.00 = 462,500

### Path 0: the humble repair flip (the baseline)

Bought at auction **300,000**, uniformly worn. 60,000 of work to reach `fine`, 8 slots.

    Stage B before: 462,500 - 1.3*60,000 - 0.8*40,000 = 352,500
    Stage B after:  462,500 - 0        - 0.8*40,000 = 430,500
    No aftermarket, so no C discount and no D premium. Market value 430,500.
    Stage E: broad appeal, match ~0.6. Shop front clamps at 1.00.  Sale 430,500.

**Spent 360,000. Sold 430,500. Profit 70,500.** 8 slots, 3 days' work, ~4 days listed, **7 days**.

→ **8,813 per labour slot. 70,500 per parking-slot-week.**

### Path 1: the coherent build

Same car and repair, plus a sport turbo with matching sport fuelling, cooling and clutch.
Parts **100,000**, 4 install slots. Headline ~0.95, `coherenceFactor` 1.0.

    Stage C: no shortfall.                                    430,500
    Stage D: retention 0.30 + 0.80*1.0 = 1.10
             premium = 100,000 * 1.10 * 0.6 = 66,000          496,500
    Stage E: racer match 0.95, tuner magazine ceiling 1.17
             0.88 + 0.29*0.95 = 1.1555                        573,700
             less 12,000 fee                                  561,700

**Spent 460,000. Sold 561,700. Profit 101,700.** 12 slots, 4 days' work, ~14 days listed
(few buyers match), **18 days**.

→ **8,475 per labour slot. 39,550 per parking-slot-week.**

Against Path 0's stock car at 430,500, **the 100,000 of parts returned 131,200.** Recoup and
then some, which was the requirement.

### Path 2: the dodgy build (the lottery, kept as a warning)

Same car and repair, plus a race turbo alone. Parts **93,600**, 1 slot. Headline ~0.70,
`coherenceFactor` 0.605.

    Stage C: shortfall 0.395, discount 0.138.  430,500 * 0.862 = 371,000
    Stage D: retention 0.30 + 0.80*0.605 = 0.784
             premium = 93,600 * 0.784 * 0.6 = 44,000            415,000
    Stage E, if a stancer appears: tolerance 0, so his base is
             430,500 + 44,000 = 474,500, match 0.90, weekend meet 1.17
             0.88 + 0.29*0.90 = 1.141                           541,400
             less 3,000 fee                                     538,400

**If he turns up: spent 453,600, sold 538,400, profit 84,800**, over ~24 days with staleness
biting. → 9,422 per slot, but only **24,733 per parking-slot-week.**

**If he does not**, the trade network now takes it at **0.87**: `415,000 * 0.87 = 361,050`.
**A loss of 92,550.**

**This path is a bad business and the document now says so.** It is a lottery ticket, not a
trade. It survives as the shape of a mistake a player can make, and as the reason the fast
exit needs to hurt.

### Path 3: the salvage flip (the dodgy business that actually works)

The same shell, bought from the **scrapyard as a wreck for 100,000**: several scrap parts, one
missing. Not a bargain because the seller is foolish, but because the condition is genuinely
bad and partly hidden.

    Stage B at purchase: 462,500 - 1.3*180,000 - 0.8*40,000 = 196,500

Minimum viable work: make it run and tidy the worst. **70,000 of parts, 12 slots**, leaving
90,000 of bill outstanding. No aftermarket at all.

    Stage B after: 462,500 - 1.3*90,000 - 0.8*40,000 = 313,500
    Market value 313,500. Sold to the fixer at 0.88, same week: 275,880.

**Spent 170,000. Sold 275,880. Profit 105,880.** 12 slots, 4 days' work, 1 day to sell,
**5 days**.

→ **8,823 per labour slot. 148,232 per parking-slot-week.**

Standing: still rough, below the clean threshold. **A lemon or a zero, every time.**

### The comparison, which is the point

| path | profit | per labour slot | per parking-slot-week | days | standing |
| --- | ---: | ---: | ---: | ---: | --- |
| 0 repair flip | 70,500 | 8,813 | 70,500 | 7 | clean |
| 1 coherent build | 101,700 | 8,475 | 39,550 | 18 | clean or concours |
| 2 dodgy build, sold | 84,800 | 9,422 | 24,733 | 24 | poor |
| 2 dodgy build, dumped | −92,550 | — | — | 21 | poor |
| 3 salvage flip | 105,880 | 8,823 | **148,232** | 5 | lemon |

**Three things fall out of that table, and they are the design.**

**Labour is roughly equally productive everywhere** (8,475 to 9,422 per slot). That is a
healthy result: no path is a labour trap. **What differs is how long your space and capital
are tied up.** This is exactly how a real dealer thinks, and it vindicates space as the
strongest of the four time mechanisms.

**The build path earns the most per car and the least per week.** So building is justified by
absolute margin and by scale, never by rate. **If you have few slots, you flip. If you have
many, you build.** That is a genuine portfolio decision driven by space, and it is why parking
slots must be expensive.

**The salvage flip wins on tempo, and that is correct and intended.** The dodgy trade is a fast
starter. Three things stop it dominating, and none of them is a punishment:

1. **Supply.** The scrapyard holds a handful of cars and rotates weekly. You cannot run four a
   week if only two are worth having.
2. **Standing compounds downward.** Every such sale is a lemon. Poor standing thins the buyer
   flow and worsens the supply, so the trade slowly eats its own seedcorn.
3. **It does not scale.** The 1.3x repair return is a multiplier on the bill, so absolute
   profit scales with how large a bill you can take on, which scales with capital, tools and
   access. A player working cheap salvage is capped at small absolute numbers. The honest
   player working a flagship takes a far bigger bill at the same multiplier.

**Dodgy is better early, honest is better late.** That is a real strategic arc rather than a
balance apology, and it is what makes the playstyle a choice with a shape rather than a
permitted eccentricity.

---

## 10. Legibility: the appraisal

**Accepted as a first-class part of the design, not a UI nicety.** A hidden continuous value
with hard thresholds is unfair, and the sim audience this game targets wants to see the
machine.

A **mechanic's appraisal**, available on any car in the shop, decomposing the stack:

    Book, this model, this mileage, this market      462,500
    Work it still needs                              -117,000
    Build risk (fuelling is the weak point)           -14,300
    Parts fitted, as the market credits them          +44,000
    ----------------------------------------------------------
    What it is worth                                  375,200

    Best fit:    tuner        (0.81)   up to 428,000 via the magazine
    Poor fit:    first-timer  (0.22)   will not call
    Warning:     this will sell as a LEMON and cost you standing

This does four things at once: it makes stage C and D visible, it warns before a mistake
rather than after, it turns the 0.605 "scrapes a clean" moment in Path 2 into something the
player can *feel*, and it is where most of the fun of this system will actually live. **It is
the answer to the lemon cliff**, and if any car's coherence remains hidden, §5's probabilistic
band applies instead.

---

## 11. Period fidelity

**Shaken, accepted, and the reviewer is right that it is the dominant fact.** The biannual
inspection is why values step down near expiry, why illegal modifications get reverted before
inspection, and substantially why Japan exports used cars at all. Proposed light version:

- **Months remaining** is a value and liquidity modifier. A car with two months left is worth
  meaningfully less and sells more slowly.
- **A non-compliant build** (excessive noise, ride height, unapproved parts) needs either a
  compliance bill before a domestic sale, or a channel that does not care.
- Which hands the dodgy trade **its most authentic hustle**, and dovetails exactly with the
  export exit, which is indifferent to both shaken and mileage.

**Mileage, accepted.** The current curve (0.925 at 90,000 km) is gentle by period domestic
standards, where 90,000 km was considered high. Proposed: a steeper domestic curve, **paired
with the mileage-blind export channel**, which reproduces the real arbitrage exactly rather
than simulating it.

**Era events on heat.** Heat is the right carrier and wants authored events layered on it: the
Gran Turismo release spiking specific models in 1997-98, the R34 launch pushing the R33 down,
Best Motoring features, kei sports discontinuations. **Seasonal presence** does the same for
Stage F cheaply: racers thick in season, stancers thin in winter.

---

## 12. Levers, all PROPOSED and unsigned

| lever | proposed | controls |
| --- | ---: | --- |
| `sellingChannels.tradeNetwork.priceBand` | **0.85 to 0.90**, midpoint 0.87 | the price of speed |
| `valuation.coherenceDiscountWeight` | 0.35 | how much incoherence discounts value |
| `valuation.retentionFloor` | 0.30 | parts retained by the worst build |
| `valuation.retentionCeiling` | 1.10, held | parts retained by a perfect build |
| `valuation.tasteSpread` | 0.12, hold | the standard band, pending measurement |
| `valuation.tolerance[archetype]` | 1.0 default; stancer 0.0, tuner 0.5 | who minds a bad build |
| `reputation.lemonCoherenceCeiling` | 0.55 | below this a sale is a lemon regardless |
| `reputation.concoursCoherenceFloor` | 0.95 | concours needs a right car, not a clean one |
| `liquidity.stalenessHalfLife` | 14 days | how fast a listing goes cold |
| `liquidity.stalenessFloor` | 0.35 | how cold it can get |
| buyer `target`, `upper`, `importance` | to author | replaces the flat `statWeights` |
| `channel.matchThreshold` | to author | how picky each channel is |
| `basePresence`, `seasonFactor` | to author | who is about, and when |
| `reputationFlowFactor` curve | to author | how standing changes who turns up |
| parking slot count and expansion cost | to author | the price of patience |
| shaken value and liquidity curves | to author | the dominant period fact |

## 13. New against reused

**New:** the coherence discount, coherence-scaled retention, taste as a match with upper
bounds, the liquidity axis with staleness, coherence in reputation, the tolerance scalar,
parking slots as inventory, the weekly rhythm, heat drift under held cars, the appraisal, the
export and fixer exits, shaken.

**Reused unchanged:** book value, the mileage curve's shape, market heat and its weekly
pressure model, the repair deduction and its 1.3x, tier expectations and `beyondDiscount`, the
foundation factor, `aftermarketReturn`, the listing channels and their ceilings and fees, the
buyer archetypes, the support ratios and `coherenceFactor`, the reputation plumbing and its
lemon/clean/concours vocabulary, the scrapyard design, the auction generation model.

## 14. Open questions

1. **What is a parking slot worth?** Everything in §9 hinges on it. Slot count, expansion cost
   and whether the shop front's forecourt differs from covered storage.
2. **How much sooner does poor standing reach the scrapyard, and by what gate?** A lower
   reputation threshold, a reduced unlock cost, or an earlier introduction. How much head start
   is fair before an honest player feels penalised for behaving.
3. **Does the export container need a minimum volume?** A single car in a container is not how
   the trade worked. Batching would be authentic and would make it a genuine late-game
   commitment rather than an alternative shop front.
4. **Is `lemonCoherenceCeiling` at 0.55 too forgiving?** Path 2's build scrapes a clean at
   0.605 despite being a genuinely stupid car. Settle it with Q5.
5. **What is standing worth per week?** Once the flow model exists this is computable
   (change in expected offers times average multiplier delta). **The lemon penalty cannot be
   priced until it is**, and the reputation-ratchet entry in `TODO.md` is now load-bearing for
   this whole design.
6. **What does a listing week feel like?** §7 gives it a skeleton (viewings at the shop,
   lowballs, wrong buyers). The cadence, the copy and the texture are a content job and are not
   specced here.
