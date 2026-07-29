# The tuning system, from the ground up

**Status: DESIGNED to implementation depth, not scheduled. v5, 2026-07-29.**

v5 answers an external review. It purges the killed wear-rate design from every
section that still carried it, repairs the cross-references that pointed at deleted
text, replaces the aggregate support ratio with per-subsystem ratios under a
weakest-link rule, and corrects a sequencing error that would have shipped a new
dominant strategy. Every number is a proposal and unapproved.

**Deferred out of this system, by maintainer ruling 2026-07-29:**

- **Course-character build variety** (a client wanting a Wangan car, a touge beast,
  a track toy, a reliable runabout for their kid). This is job and copy design, not
  physics. The foundation exists, the variety does not. **Its own sprint.**
- **Fitting a turbo to an NA car.** It is both a part and an aspiration change, and
  the machinery to change an engine's character belongs with `engine-swaps.md`.

---

## 1. What is wrong, measured

**The system is solved: there is one correct build order and it never varies.**
Four defects produce that, and the fourth is a bug.

### 1a. A part's effect does not depend on the car

`StatModifierSchema` is five signed numbers and they are **absolute additive
deltas**. The catalogue is 472 SKUs, 118 per fitment class, and **the class moves
only price**. Every SKU's effect is byte-identical on every car in the game.

The race ladder sums to **+200 PS on anything**: x1.62 on a Supra, **x4.64 on a
Wagon R**. A ratio target cannot be expressed on an additive path.

### 1b. Nothing is grounded in how engines respond

The same +16 PS ECU applies to an NA Beat and a twin-turbo Supra. In reality an ECU
is worth about **3 per cent** on an NA (recovering timing and a conservative map,
with no boost to add) and **20 to 30 per cent** on a turbo. Same part, an order of
magnitude apart, and the model cannot tell them apart.

**The bar is that people who know performance cars must not roll their eyes.**

### 1c. Every part is a gain, so the cheapest gain always wins

Exhaust at +13 PS costs a fraction of block at +32 PS. Per yen, exhaust wins
outright and so on down the list. **There is no reason to ever buy the block.**

### 1d. Condition does not reach half the model, and this is a bug

`computeDerivedStats` scales every `statModifiers` value by
`bandFactor(installed.band)`. `buildFactors`, in the same file, reads only
`installed.partId`:

```text
factors.grip *= modifiers.grip
factors.braking *= modifiers.braking
factors.mass *= modifiers.mass
```

**It never reads the band.** A `scrap` race coilover delivers the identical 1.029
grip as a mint one; a destroyed big brake kit brakes like new. Two parallel modifier
systems, one respects condition and one does not.

**Fix this first. Nothing about condition and performance can be reasoned about
until it lands.**

---

## 2. What the data model can and cannot express

**Can:** an absolute PS delta; absolute deltas to handling, style, reliability,
authenticity; multiplicative grip, braking and mass (`physicalModifiers`, product
across slots); downforce and drag, but only by being one of three `aeroFunctional`
grades that replace the factory figure outright; a compound tier, but only through
the `tyres` slot's grade.

**Cannot, at all:** proportional power; any torque-curve or rev-range change; gear
ratios, final drive, redline; weight distribution, wheelbase, centre of mass;
drivetrain layout or aspiration; **any effect that depends on the car it is fitted
to.**

**A trap:** `redlineRpm`, `peakTorqueNm`, `torqueRpm`, `powerRpm` and
`displacementCc` exist on the spec and **the physics reads none of them**
(`formulas.md` section 2: "Display data; the physics does not read them"). Any
design reaching for a torque curve is inventing data.

### 2a. The three avenues, and the workshop progression that gates them

The maintainer's question, prompted by "the block adds capacity **if you bore**":
what are we actually doing to a part when we repair it, and what can an aftermarket
part do that a repair cannot?

There are **three** ways a part gets better. The game has two.

| avenue | what it is | ceiling | authenticity | gated by |
| --- | --- | --- | --- | --- |
| **1. Repair and recondition** | restoring a part toward the condition it left the factory in | **never exceeds stock** | preserved | tool tier. Tier 1 reaches `fine`, tier 2 reaches `mint` |
| **2. Fit aftermarket** | a differently-specified part in its place | the part's own grade | **destroyed** | nothing but money, and hiring the tools to fit it |
| **3. Machine what you own** | modifying a part you already have so it exceeds its own original spec | **above whatever it started as** | **preserved** | **the workshop's final tier** |

Avenue 3 is **additive on top of 1 and 2**, not an alternative to them. You machine
a part you own, and it does not care whether that part is the factory item or an
aftermarket one.

**Real tuning is largely avenue 3**: boring and stroking for capacity, porting and
polishing for flow, skimming for compression, balancing and blueprinting for revs
and durability, lightening a flywheel for response. None is a part you buy. All are
work done to the part you have, and in Japan that culture (加工) is central rather
than peripheral.

### 2b. Four end states, and the choice between them is permanent

Because avenue 3 stacks on both 1 and 2, a part can finish in one of four places:

| end state | performance | authenticity |
| --- | --- | --- |
| Stock, reconditioned | baseline | **full** |
| **Stock, machined** | above stock, below aftermarket | **full** |
| Aftermarket | high | lost |
| **Aftermarket, machined** | **the ceiling** | lost |

**This is the design's best structure and it came from the maintainer.** It gives
the numbers-matching build a real performance path rather than only a sentimental
one, and it puts the absolute maximum behind a route that costs the car its
originality forever. Money and originality sit on opposite sides of a permanent
choice, on every single component, which is the GDD's engine-swap tension arriving
one level further down.

### 2c. Machining is an acquisition path, not a new axis

A machined block is still one SKU in one slot. What differs is how the player got it
there:

| | buying | machining |
| --- | --- | --- |
| cost | purchase price, delivery | machine time, labour, days |
| needs | money | **your existing part, consumed** |
| gated by | the catalogue | **owning the final workshop tier** |
| authenticity | destroyed | **preserved** |

No third property on a part, no second condition model, no new job system.

**Correction, from the maintainer:** `machineShopAssist` is **not** the right home
for this. That is basic tool hire, for bringing in an engine crane for a day, and it
is priced and scoped as such. **Machining is the player's own machine shop, built
and unlocked in the late-middle game**, and it is a facility rather than a rental.

### 2d. And it gives tool tier 3 a reason to exist

`repairBandCeilingByTier` is `{1: "fine", 2: "mint", 3: "mint"}`. **Tier 3 currently
buys nothing over tier 2 for repair.** The tier exists, is purchasable, and has no
distinct purpose on that axis.

Machining is exactly the purpose it is missing: tier 1 gets a car sellable, tier 2
gets it perfect, **tier 3 lets you make parts better than they were ever built**.
That is a clean progression with a real reason to reach the top of it, and it costs
no new concept.

**Scope note.** Avenue 3 is a genuine feature with its own sprint, not a footnote to
tuning. The tuning system does not depend on it. But **the tuning design must not
foreclose it**: do not express capacity increases as aftermarket SKUs pretending to
be replacements, and do not assume every upgrade path destroys authenticity.

---

## 3. Part roles

| role | does | the trade |
| --- | --- | --- |
| **Gain** | adds output directly | costs money |
| **Enabler** | adds nothing alone, decides how much a gain can safely deliver | costs money, shows no number |
| **Trade-off** | buys one thing at the cost of another | costs a stat |

### 3a. Trade-offs, concretely

v1 named the parts and never said what the trade actually was. It is this:

| part | buys | costs |
| --- | --- | --- |
| **Race cams** | top-end power | low-end power and driveability. The car is quicker on a circuit and worse everywhere else, and it idles badly |
| **Large turbo** | a much higher power ceiling | response, and reliability unless the enablers are there |
| **Aggressive springs and bars** | grip and turn-in | ride quality, and grip on a rough surface. A touge car that skitters |
| **Race brake pads** | stopping power hot | poor cold bite, so worse on the first corner and on the road |
| **Stripped interior** | weight | style and the car's habitability, which some buyers price |
| **Race aero** | downforce | drag, so a slower top end. The model already prices this correctly |

**The lesson: a trade-off part makes the car better at one job and worse at
another.** That is what makes a build a build rather than a shopping list, and it is
what makes the deferred job-variety work land: a client who wants a reliable runabout
does not want race cams in it.

### 3b. Block and internals are ceiling parts, and the block is also a gain

The maintainer's correction is right: **boring the cylinders adds capacity, and
capacity is power.** So the block is both.

- **As a gain:** overbore and stroke add displacement, which adds power roughly in
  proportion. Real, modest, and expensive per PS.
- **As a ceiling:** forged internals and a girdled block decide how much boost and
  how many revs the engine survives.

Internals are almost purely a ceiling part. Head and valvetrain are both, weighted
towards gain on an NA and towards ceiling on a turbo.

**This is the answer to "why buy the block".** Not because it is efficient power per
yen (it is not, and should not be), but because without it the big turbo eats the
engine.

---

## 4. Power: proportional, and keyed to the engine

### 4a. Proportional

`statModifiers.power` becomes a fraction of the car's own stock output rather than
absolute PS. This alone kills the x4.64 kei case.

### 4b. Response depends on what the engine is

A pure proportional ladder is still uniform, and real engines are not. **Headroom
depends on the engine's character**, derived from data the spec already carries:

| character | derived from | headroom | why |
| --- | --- | --- | --- |
| **Forced** | the induction tag | high | boost is power until fuel, cooling or internals run out |
| **High-strung NA** | high specific output for capacity | low | a 10,000 rpm B16A left almost nothing on the table |
| **Lazy NA** | low specific output for capacity | medium | detuned from the factory, and it gives some back |

Specific output is `stockPowerPs / (displacementCc / 1000)`, both already on `spec`.
**No new authored content**, just a derivation, and it gets the right answers: the
Beat (98 PS/litre, kei-limited) reads high-strung; the Cefiro's RB20DET reads
forced; a Carina 1.5 reads lazy.

### 4c. Per-part response, illustrative not signed

| part | NA | forced | note |
| --- | ---: | ---: | --- |
| ignitionEcu | 0.03 | 0.25 | the flagship case: timing versus boost |
| exhaust | 0.04 | 0.14 | noise versus backpressure and spool |
| intake | 0.02 | 0.05 | almost nothing either way, correctly |
| camsTiming | 0.10 | 0.05 | where NA power lives |
| headValvetrain | 0.08 | 0.06 | porting and valves |
| block | 0.12 | 0.02 | capacity on NA; a ceiling part on turbo |
| forcedInduction | n/a | 0.35 | the ladder's own rungs, see 4d |

### 4d. Returns per category are NOT uniformly diminishing

The maintainer's correction, and it is the more interesting design. A category's
return curve is a property of the category:

| category | curve | why |
| --- | --- | --- |
| **Forced induction** | **increasing** | a bigger turbo is not more of the same thing, it is a categorically more capable one. The top rung should feel like a different part |
| Block | roughly linear | capacity is capacity |
| Cams | roughly linear | more duration, more top end, more lost bottom end |
| Intake | strongly diminishing | a filter, then a pipe, then nothing |
| Exhaust | diminishing | cat-back, full system, then titanium saves weight rather than power |
| ECU | threshold | little on its own, and it unlocks what the others can do |

**Increasing returns on forced induction is the single best anti-dominance
mechanism in the design**, because it means the expensive path genuinely pays if you
commit to it and genuinely ruins you if you commit halfway.

---

## 5. Cohesion, reliability, value and reputation are ONE system

**The maintainer's correction, and it is the one that unlocks the design: the
"greater than the sum of its parts" idea and "a knowledgeable buyer will not touch
it" are not two mechanics. They are the same mechanic described from opposite
ends.** v2 and v3 of this document treated them separately and had to invent a
workaround to reconcile them. Treated as one thing, the workaround disappears.

### 5.0 The single chain

```text
build          ->  support ratio  ->  reliability  ->  WHO BIDS      ->  price
(gains vs                                          ->  REPUTATION    ->  standing
 enablers)
```

One derived number. Two consequences. Both landing at the sale, which is where the
player's loop actually ends.

### 5.1 Support ratio: per subsystem, headline is the weakest link

**How well the enablers on the car match the demands of the gains on it.** A small
turbo on stock internals is well supported. A large turbo on stock internals is not.
A large turbo with forged internals, upgraded fuel and better cooling is.

**It is NOT one aggregate ratio.** An earlier draft proposed a single
`total support / total demand`, and external review correctly killed it on two
counts: a scalar cannot name the part that would fix it, and it is gameable, because
massively over-supplying fuel would arithmetically mask stock internals under a big
turbo. That is physically nonsense; fuel does not hold a piston together.

**So: one ratio per subsystem, and the headline number is the minimum of them.**

| subsystem | asked by | answered by |
| --- | --- | --- |
| cylinder pressure | boost, compression | internals, block |
| fuelling | airflow | fuelSystem |
| heat | sustained output | cooling |
| revs | cams, ported head | headValvetrain, internals |
| torque transmission | total output | clutch, driveline |

A build is only as supported as its worst subsystem, which is both physically true
and exactly what a mechanic would say. **The weakest-link rule gives the legibility
requirement (6d) for free**: the game does not have to work out what to warn about,
because the minimum already names the subsystem, and the subsystem names the part.

That is the whole of the new state.

### 5.2 The value half: it is buyer selection, not a multiplier

**This is the "greater than the sum of its parts" effect, and it is legitimate
because it never touches a premium multiplier at all.**

A coherent build does not receive a bonus. It **reaches a different set of buyers**,
and those buyers pay more because they can see what they are looking at. An
incoherent build reaches fewer people, and the ones it reaches are the ones who
cannot read it, so they bid less and hesitate more.

| build | who bids | what happens to the money |
| --- | --- | --- |
| coherent, well supported | everyone, including the buyers who know | full interest, best prices |
| powerful but unsupported | only buyers who cannot read it | thinner pool, weaker prices |
| dangerous | almost nobody serious | it sits, or it goes cheap |

**Why this is clean where v3's retention idea was not.** That version found a lever
Law 5 did not happen to name and used it to achieve what Law 5 forbids. This one
does not inflate anything: it changes **who is buying**, and a car sold to an
enthusiast genuinely fetches more than the same car sold to someone nervous about
it. Buyer taste and the buyer pool are an existing, separate path from the capped
premium multipliers.

**To verify before building**, not assume: that routing cohesion through buyer
selection genuinely leaves `foundationFactor` and `aftermarketReturn` untouched, and
that the resulting spread is large enough to be felt without a second lever.

### 5.3 The reputation half: selling a grenade costs you

**Approved by the maintainer.** Selling a very unreliable car damages standing. The
reputation system exists; this wires into it rather than adding anything.

Sales already produce a reputation delta through `saleReputationDeltaFor`, keyed on
the quality of what was sold. **Reliability becomes part of that quality
judgement**, which is the correct place for it: a garage's reputation is precisely
the aggregate of what its cars turned out to be like.

**At what point.** Not linearly. A sane build is simply normal and earns nothing
extra, because competence is the baseline rather than an achievement. The effect is
one-sided and starts at a threshold:

| support ratio | reputation effect |
| --- | --- |
| adequate or better | none. This is the expected standard |
| below adequate | a penalty, scaling with how far below |
| dangerous | a large penalty, and it should sting |

**At what magnitude, and this is where an earlier draft was wrong.** v4 proposed
that the reputation cost must always exceed the money the bad build made, so selling
grenades could never be a strategy. **The maintainer rejected that, and correctly:
it forecloses a playstyle they want to allow.**

> *"I actually do want to give the player the freedom to sell shitty builds, gain a
> bunch of cash, and tank their rep. Dodgy back alley mechanic simulator style... it
> should be a legitimate though inefficient and weird way to play the game, but I
> want to allow it."*

**So the dodgy path must be viable, not punished out of existence.** The governing
rule is therefore not "it costs more than it makes". It is:

**Selling bad builds makes more cash, faster. It costs you access.**

That is a real trade rather than a trap: quick money now against better opportunities
later. A player who wants to run a back-alley shop can, and the game should let them
without pretending they have made a mistake. It is inefficient and strange, which is
exactly the brief.

**This is the same principle as the rest of this document.** The reason there must
not be one correct build order is the reason there must not be one correct way to
run a garage. Anti-dominance applies to business models too.

**The delayed version is part of the design, not an enhancement.** A car sold with a
known-bad build can come back, and word gets round. That is the reputation half
arriving with a face on it rather than as a silent number, and it is a garage-sim
consequence rather than a racing-game one.

**But see section 5.5: reputation currently cannot express this trade at all.**

### 5.5 Reputation is a ratchet, and that blocks the trade above

**Raised by the maintainer, 2026-07-29, and it is a bigger problem than this
system.** Recorded here because it gates 5.3, but it needs its own design pass.

**Reputation today is essentially an unlock gate.** Gaining it opens content:
auction houses, workshop tool tiers, mission access. **Losing it once those are open
does very little**, because the unlocks do not close again.

So the trade proposed in 5.3 (cash now against access later) **cannot currently be
expressed.** A player who unlocks everything and then tanks their reputation keeps
everything they unlocked and pays almost nothing. The dodgy path is not inefficient,
it is simply free, which is worse than forbidding it.

Two ways to give reputation a continuous cost, and the second is much better:

**A. Unlocks can be lost.** Drop below a threshold and the auction house stops
letting you in. Coherent, and harsh in a way that may feel arbitrary: losing a tool
you paid for reads as confiscation.

**B. Reputation gates the FLOW of opportunity, not just the door.** A well-regarded
garage gets better cars consigned to it, better jobs offered, better buyers walking
in, and gets them more often. A disreputable one gets fewer and worse. Nothing is
taken away; the quality of what arrives simply reflects what you are known for.

**Recommendation: B.** It makes the trade real without confiscating anything, it
gives reputation a job on every single day rather than at a handful of thresholds,
and it makes the back-alley playstyle **self-consistent rather than punished**: you
sell rubbish, so rubbish is what comes to you, and you make thin money quickly. That
is a coherent identity for a shop rather than a penalty box.

It also fixes something the ratchet hides: at present, high reputation stops mattering
the moment the last thing is unlocked.

**Not in scope for the tuning system.** Section 5.3's reputation effect should be
built to the shape described there, and it will be weak until this is resolved. Say
so in the sprint rather than inflating the numbers to compensate.

### 5.4 The player must be able to see it coming

A build that cannot support itself must announce that before the sale: on the dyno
(section 11), on the car's own readout, and when listing it. **A consequence the
player could not have foreseen is a punish; one they were shown is a choice.**

They must also be free to sell it anyway. It is their car and their reputation, and
a known risk taken knowingly is a decision rather than a trap.

---

## 5A. Why reliability is NOT a wear rate

An earlier revision of this document proposed that an unsupported build degrades
over days of use until something fails. **The maintainer killed it and was right.**
Recorded here so it is not re-proposed.

**The player never lives with the car.** The loop is buy, fix, sell. There is no
period of ownership during which a build accumulates use, so a mechanic denominated
in days of driving has no time in which to operate. The buyer lives with the car,
not the player.

**And the condition system has no motion to accelerate.** That revision claimed it
did; that was false. `degradeBand` exists only inside `auctions.ts`, applied at
generation time to make a car worse before the player ever sees it. Nothing decays
during play. Condition is static, and the only thing that moves it is the player
repairing it.

Any future proposal that reaches for "the car wears out" needs to answer both of
those first.

### 5d. Reliability stops being an additive stat

A part does not "add reliability". The build either supports its own output or it
does not. So `statModifiers.reliability` goes away and reliability becomes derived
from the support ratio (5.1). See section 8.

---

## 6. How the support ratios are computed

Section 5 says what cohesion does. This says how it is derived, because it is the
one genuinely new piece of state and it must be simple enough for a player to reason
about.

### 6a. Demand and support, per subsystem

**Every gain part places demand on specific subsystems**, not on the engine
generally. A large turbo demands cylinder pressure, fuelling and heat capacity. Race
cams demand revs. Neither demands torque transmission directly; the resulting power
does.

**Every enabler answers specific subsystems**, and the factory part answers exactly
the demand the factory designed for. So a stock, unmodified car sits at exactly 1.0
on every subsystem by construction, which is the property that makes the whole thing
readable.

`ratio[subsystem] = support[subsystem] / demand[subsystem]`, and the car's
`supportRatio` is `min(ratio)` across all of them.

### 6b. Why the minimum rather than the mean

Because an engine fails at its weakest point, not its average one. Two builds:

| build | fuel | internals | mean | **min** |
| --- | ---: | ---: | ---: | ---: |
| big turbo, huge fuel system, stock bottom end | 2.4 | 0.4 | 1.4 | **0.4** |
| big turbo, matched fuel, forged bottom end | 1.1 | 1.1 | 1.1 | **1.1** |

A mean says the first build is *better supported* than the second. It is not; it is
a hand grenade with an excellent fuel pump. The minimum says so, and it also says
which part to buy next.

### 6c. The worked example, which is the maintainer's own

**1.5 bar on a stock kei engine.** Cylinder pressure demand is enormous; internals
and block are stock and answer the factory's demand only. That subsystem's ratio
collapses, and it is the minimum, so it is the headline.

Consequences, all through section 5's single chain: the car makes real power, the
dyno reports it and reports the shortfall **by name**, the buyers who understand
engines will not touch it, the ones who remain pay poorly, and if it is sold anyway
the reputation cost lands.

**What does not happen: the engine does not explode.** It is a car that is worth
less and costs standing, not a car that detonates on a timer. See 5A.

### 6d. Two properties this must have, and now gets for free

**Legible.** The minimum names its own subsystem, and the subsystem names the part.
"This is asking more of the bottom end than it can give" is a sentence the game can
now generate rather than approximate.

**Not a cliff.** Each ratio degrades smoothly, so a build can be slightly optimistic
without being ruined. The threshold in 5.3 is where reputation starts to bite, not
where the number starts to move.

### 6e. The rotary carve-out

Raised by external review. **Specific output per nominal cc is meaningless for a
rotary.** A 13B is 1308 cc by convention and behaves like roughly 2.6 litres, so the
4b derivation would read every rotary as extraordinarily high-strung and hand them
almost no headroom. An RX-8 would come out at 191 PS per nominal litre.

**Use the standard equivalency factor: multiply rotary displacement by 1.8 before
deriving specific output.** That is the figure motorsport bodies have long used for
exactly this comparison, so it is principled rather than a fudge, and it puts the
RX-8 at about 106 PS per equivalent litre, which reads correctly as a healthy NA
with modest headroom.

`engineConfig` already carries `rotary-2` and `rotary-3`, so the carve-out has
something to key off and needs no new content.

---

## 7. Condition, redesigned

**Fix the bug first** (1d): `physicalModifiers` must scale with the installed band,
exactly as `statModifiers` already do.

**Then make condition bite harder at the top of the ladder.** Approved by the
maintainer: *"the higher the grade, the more condition matters"* and *"a blown race
turbo should not be desirable"*.

A race part is highly strung, runs to a service interval, and degrades badly. A
stock part is under-stressed and tolerates a decade of neglect. That produces the
property the game currently lacks: **a race damper at `poor` is worse than a street
damper at `mint`.**

**No wear rate is implied by any of this.** Condition still only moves when the
player repairs a part or when generation hands them a car in a given state. A race
part is not more fragile over time, because nothing in this game degrades over time
(5A). It is more *sensitive*: at a given band it has lost more of its advantage than
a stock part at the same band would have. That is a curve shape, not a process.

The four dials and their curves stay as the mechanism. Their values are already
flagged PROVISIONAL in `car-performance/README.md` 7b, which calls that "the most
important sentence in this section", and they should be re-derived once the whole
system is in place rather than before.

---

## 8. Which stats stay additive: the recommendation

The maintainer asked. Per stat:

| stat | verdict | why |
| --- | --- | --- |
| **power** | **proportional** | settled, section 4 |
| **handling** | **DELETE the additive path** | it is a second route to what `physicalModifiers.grip` already does. The schema's own comment warns "a second path for either would charge one upgrade twice", and this is that. Handling should derive from grip alone |
| **style** | **keep additive** | taste, not physics. Additive is honest. Note it separately needs a car-level base: `styleCap` is 20, so every stock car in the game scores identically |
| **reliability** | **DELETE, make it derived** | section 5d. A part does not add reliability; the build supports itself or does not |
| **authenticity** | **keep additive** | each non-original part subtracts. Already works, already correct |

`StatModifierSchema` therefore goes from five fields to **two** (`style`,
`authenticity`), with power moving to a proportional field and handling and
reliability becoming derived. That is a real simplification, not just a change.

---

## 9. Aero

### 9a. One package, not split parts

Splitting into wing, splitter and diffuser would need the physics to model **aero
balance** front against rear. It does not: there is a single `downforceCoeff`.
Adding balance is a physics change of real size and it buys granularity the player
would struggle to read.

**Keep one aero package slot.** Revisit only if aero balance ever becomes a modelled
quantity.

### 9b. But the ceiling should be per car, which is the better idea

The maintainer's instinct: *"maybe not for all cars. some cars naturally have better
aero parts available."* That is right and it is cheap.

**A car's body decides how much aero it can carry.** An FD, a Supra or a Countach
has real aerodynamic potential and a genuine aftermarket behind it. A Wagon R does
not, and bolting a GT wing to one should look silly and do very little. A per-car
aero ceiling expresses that in one number.

This also stops the obvious degenerate outcome of raising the ceiling globally,
which is that every car in the game eventually becomes a GT3 car.

### 9c. The missing rung

`car-performance/README.md` 7g records that the headroom was deliberately opened and
the part never authored: **"there is still no aero grade above `race`."** The
acceptance target if one is written is stated there: an aggressively winged build
should reach an effective grip of about 1.5, and a GT3-class package should not hit
a ceiling at road speeds.

---

## 10. Suspension

**Leave the ladder as it is** (1.01 / 1.02 / 1.029 per part, compounding to about
1.09 across three), per the maintainer.

Their worry is fair: *"would it be almost never worth it to spend money on
suspension?"* The answer is that a 9 per cent grip gain is worth roughly 4 per cent
of cornering speed and a real chunk of lap time, because grip is the dominant term
in the model. So it is not nothing.

**But the honest answer is that suspension's value is course-dependent**, and the
mechanism that would make a player feel it is the deferred job-variety work: a touge
client rewards suspension, a Wangan client rewards power. Until those exist,
suspension will read as the boring purchase, and no amount of retuning its numbers
fixes that. **That is a reason to schedule the job work, not to inflate suspension.**

---

## 11. Information: what the player sees, and when

The maintainer's steer: base specs before purchase, dyno results and condition
after. Fleshed out:

| | before buying | after owning |
| --- | --- | --- |
| **Spec sheet** (power, weight, capacity, layout, year) | visible | visible |
| **True condition of parts** | apparent only | via inspection and workup, as today |
| **Engine response character** (4b) | **hidden** | **via a dyno session** |
| **Actual power as built** | claimed | **via a dyno session** |
| **Reliability and support ratio** | hidden | **via a dyno session** |

**That gives the dyno a real job and a real reason to cost a labour slot:** you do
not know how an engine responds to tuning until you put it on the rollers, which is
true in life and makes the screen worth building. GDD 5.4's "2-3 sliders (Boost
versus Reliability, Camber: Grip versus Tyre wear/Style)" is the trade-off dimension
of section 3a, and the dyno is where the player operates it.

Foundational work exists in `docs/design/car-performance/car-spec-book.html`.

---

## 12. Reuse analysis (directive 16)

**Genuinely new:** proportional power; the `tuningResponse` derivation; part roles
and enabler gating; per-category return curves; the per-subsystem support ratios;
reliability as a sale-time consequence; per-car aero ceiling; the dyno screen.

| Concern | Reuse this |
| --- | --- |
| Where a part's effect lives | `statModifiers`, `physicalModifiers` |
| Condition reaching physics | `physicalConditionFactors`, `statFormulas.condition` |
| Power reaching physics | `computeDerivedStats` into `carBlock` |
| Rescaling when power moves | `powerRatio`, the ratio bridge |
| Grip, braking, mass from a build | `buildFactors`, after the band fix |
| Aero from a fitted part | `aeroFunctional` plus `statFormulas.aero.byGrade` |
| A part's condition affecting it | the condition band system, whole. **Nothing degrades with use; see 5A** |
| A car that cannot run | `scrapDisablesCar`, `lapBlockers` |
| Withholding premium on a bad car | `foundationFactor`, Law 5 |
| Whether an engine is forced | `hasForcedInduction` |

**Must NOT be built:** a second power path, a torque curve, a fifth part grade below
stock (`IDEAS.md` records that as rejected and traced to an earlier session
inventing scope), a second condition model, or a second job system for the dyno.

---

## 13. The hard constraint

`car-performance/README.md` 7a: **"it does not move prices... treat 'the handling
number moved, so the price should move' as a bug, not a feature."**

Performance and value stay independent, and section 5 does not breach it.

**Note this carefully, because an earlier draft got it wrong here.** Cohesion does
NOT change what an installed part retains; that was the deleted retention workaround
(5.2). Cohesion changes **which buyers are interested**, and a buyer paying more for
a car they can see is well built is a taste judgement, not a performance-to-price
coupling. A faster car is not worth more for being faster. A *better built* car is
worth more to the person who can tell, which is a different claim and a true one.

---

## 14. Build order

**Two sequencing constraints are load-bearing. Violate either and the sprint ships a
worse version of the defect it exists to fix.**

**Constraint A: the forced-induction curve must NOT ship before the support ratios.**
External review caught an error in an earlier draft, which called increasing returns
on forced induction "the single best anti-dominance mechanism". That is backwards.
Increasing returns on its own creates a **new** dominant strategy for any player rich
enough to commit: buy the biggest turbo, ignore everything else. The anti-dominance
comes from the support-ratio cost rising alongside it. Ship the curve first and you
have built a stronger version of defect 1c.

**Constraint B: verify the buyer-selection spread before building on it.** The whole
value half of section 5 rests on one unverified assumption, that routing cohesion
through buyer selection produces a price spread large enough to feel. If it does not,
the cohesion payoff evaporates and the pressure to reach for a forbidden multiplier
comes straight back. **This is a measurement, and it is step 0 of the value work, not
a footnote.**

| # | step | notes |
| --- | --- | --- |
| 1 | **Fix the condition bug** (1d) | Small, isolated. Nothing about condition is reasonable-about until it lands |
| 2 | **Proportional power** (4a) | Closes the x4.64 case. Independently shippable |
| 3 | **Engine response** (4b, 4c, 6e) | Where the realism arrives. Includes the rotary carve-out |
| 4 | **Per-subsystem support ratios** (5.1, 6) | Must land before step 5 |
| 5 | **Return curves incl. forced induction** (4d) | **Blocked by step 4**, per constraint A |
| 6 | **Measure the buyer-selection spread** | **Constraint B.** A measurement, not a build. If it fails, stop and report |
| 7 | **Cohesion into buyer selection** (5.2) | Gated on step 6 |
| 8 | **Stat simplification** (8), per-car aero ceiling (9b), **style car-level base** | The style base was flagged in 8 and previously missing here; `styleCap` 20 makes every stock car identical |
| 9 | **The dyno** (11) | Makes 4b and 5 legible. GDD 5.4 |
| 10 | **Re-derive the provisional condition curves** | With everything in place |

**Reputation (5.3) is NOT in this list, deliberately.** See 15.2.

Steps 1 and 2 are worth doing alone and in that order.

---

## 15. Still open for the maintainer

### 15.1 The value half is unverified

Step 6 above. If buyer selection cannot produce a felt spread, the design needs
another answer and the honest options are the two in 5.2's predecessor: withhold
premium from incoherent builds within Law 5, or amend Law 5 openly. **Do not
reach for a third lever.**

### 15.2 Reputation should be descoped from this sprint

External review is right that this is a sequencing risk. 5.3's reputation half is
gated by 5.5's ratchet problem, which is explicitly out of scope, and the document
concedes the mechanic "will be weak until this is resolved". Shipping it anyway means
shipping a knowingly inert consequence, which is worse than not shipping it.

**Two honest options, and this is the maintainer's call:**

- **Descope 5.3 from the tuning sprint entirely.** Build the value half, leave
  reputation for the pass that fixes the ratchet.
- **Pull the flow-of-opportunity redesign (5.5 option B) into the critical path**,
  and build reputation on top of it.

**Recommendation: descope.** 5.5 is a genuine design pass touching how the whole
game hands out opportunity, and bolting it onto a tuning sprint would rush it.

### 15.3 Does generation produce incoherent builds?

Raised by external review, and it is a good question the design does not answer.
Generation does produce modified cars. Once support ratios exist, an auction lot
could arrive incoherent, and since 11 hides the ratio until a dyno session, **the
game could sell the player a grenade they had no way to detect.**

That is arguably excellent: a car that looks like a bargain and is not is exactly
what this game is about. But it must be a **deliberate decision** rather than an
emergent surprise, and if it is taken, the pre-purchase inspection routes need to
offer some way to smell it.

### 15.4 Is machining deterministic?

Raised by external review. Machining consumes the player's part (2c). **Recommend
deterministic: you pay, you wait, you get the part.** Real machining risk is the
first thing a future session will try to invent, and it would add a random
catastrophic loss to a game with no other random catastrophic losses. Recorded so
the answer is on the record rather than re-litigated.

### 15.5 Smaller ones

- **Does the dyno cost money as well as a labour slot?** GDD 5.4 says one labour slot
  and is silent on cash.
- **Does an incoherent build narrow the buyer pool, the price, or both?** 5.2
  proposes both. Whether a dangerous car should be nearly unsellable or merely cheap
  is a feel question worth deciding deliberately.
- **Is machining its own feature?** Yes, and it wants its own scoping (2a scope
  note). It is the only honest answer to "the block adds capacity if you bore".
