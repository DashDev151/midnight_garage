# The tuning system, from the ground up

**Status: DESIGNED to implementation depth, not scheduled. v4, 2026-07-29.**

v4 answers the maintainer's second review. It replaces the split treatment of value
and reliability with a single system (section 5), deletes the Law 5 workaround, and
records the three upgrade avenues and the workshop progression that gates them
(section 2a). Every number is a proposal and unapproved.

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

### 5.1 Support ratio: the one number

**How well the enablers on the car match the demands of the gains on it.** A small
turbo on stock internals is well supported. A large turbo on stock internals is not.
A large turbo with forged internals, upgraded fuel and better cooling is.

That is the whole of the new state. It drives everything below, and because it is
one number the player can be shown it, warned by it, and reason about it.

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

**At what magnitude.** The governing rule: **the reputation cost of a bad build must
exceed the money it made**, or selling grenades becomes a strategy. It should be
possible once, as a mistake or a desperate move, and visibly stupid as a habit. The
exact numbers are economy levers and want deriving against real sale margins rather
than guessing, then playtesting.

**The delayed version is now the design, not an enhancement.** v3 recorded "it comes
back" as optional; the maintainer has approved it. A car sold with a known-bad build
can return, and word gets round. That is the reputation half arriving with a face on
it rather than as a silent number, and it is a garage-sim consequence rather than a
racing-game one.

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

## 6. How the support ratio is computed

Section 5 says what cohesion does. This says how it is derived, because it is the
one genuinely new piece of state and it must be simple enough for a player to
reason about.

### 6a. Demand and support

**Every gain part places a demand** on the engine, proportional to the output it is
asking for. A large turbo demands a great deal; a panel filter demands almost
nothing.

**Every enabler part provides support**, and the stock item provides the baseline
the factory designed for.

`supportRatio = total support / total demand`, with a stock, unmodified car sitting
at exactly 1.0 by construction. Above 1.0 the build is over-engineered, which is
safe and mildly wasteful. Below 1.0 it is asking for more than it can take.

### 6b. Which parts support what

| enabler | supports |
| --- | --- |
| internals, block | cylinder pressure, so boost above all |
| fuelSystem | the fuel to burn what the air allows |
| cooling | sustained output rather than peak |
| headValvetrain | revs |
| clutch, driveline | torque reaching the road without slipping or breaking |

Each is a genuine physical dependency, which matters: a player who knows engines
should be able to predict what the game is about to tell them.

### 6c. The worked example, which is the maintainer's own

**1.5 bar on a stock kei engine.** The turbo's demand is enormous; internals, fuel
and cooling are all stock and provide baseline support only. The support ratio
collapses well below 1.0.

Consequences, all through section 5's single chain: the car makes real power, the
dyno reports it and reports the danger, the buyers who understand engines will not
touch it, the ones who remain pay poorly, and if it is sold anyway the reputation
cost lands.

**What does not happen: the engine does not explode.** It is a car that is worth
less and costs standing, not a car that detonates on a timer. See 5A.

### 6d. Two properties this must have

**Legible.** A player must be able to look at a build and see the shortfall, and the
shortfall must name the part that would fix it. "This is asking more of the bottom
end than it can give" is a sentence the game should be able to say.

**Not a cliff.** The ratio degrades smoothly so a build can be slightly optimistic
without being ruined. The threshold in 5.3 is where reputation starts to bite, not
where the number starts to move.

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

It also closes the loop with section 5: a low-reliability build wears its parts
fast, and those parts lose their advantage faster than stock ones would. The
over-boosted car gets slower as it destroys itself, which is correct and legible.

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
and enabler gating; per-category return curves; the support ratio; reliability as a
wear rate; per-car aero ceiling; the dyno screen.

| Concern | Reuse this |
| --- | --- |
| Where a part's effect lives | `statModifiers`, `physicalModifiers` |
| Condition reaching physics | `physicalConditionFactors`, `statFormulas.condition` |
| Power reaching physics | `computeDerivedStats` into `carBlock` |
| Rescaling when power moves | `powerRatio`, the ratio bridge |
| Grip, braking, mass from a build | `buildFactors`, after the band fix |
| Aero from a fitted part | `aeroFunctional` plus `statFormulas.aero.byGrade` |
| A part degrading with use | the condition band system, whole |
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

Performance and value stay independent. Section 6 does not breach this: cohesion
changes what an **installed part** retains, which is a parts-value path and already
exists. It never makes a car worth more because it is faster.

---

## 14. Build order

1. **Fix the condition bug** (1d). Small, isolated, unblocks reasoning.
2. **Proportional power** (4a). Closes the x4.64 case. Independently shippable.
3. **Engine response** (4b, 4c). Where the realism arrives.
4. **Roles, enabler gating, support ratio** (3, 6a). The structure.
5. **Reliability as a wear rate** (5). The consequence, and the biggest new mechanic.
6. **Stat simplification** (8) and per-car aero ceiling (9b).
7. **The dyno** (11), which makes 4b and 5 legible to the player.
8. **Re-derive the provisional condition curves** with everything in place.

Steps 1 and 2 are worth doing alone. Step 5 is the one that needs the most care and
the most playtesting.

---

## 15. Still open for the maintainer

1. **Section 6b: penalty framing, or amend Law 5?** Recommendation is the penalty
   framing, on the grounds that it is correct rather than merely permitted. The
   alternative is an honest amendment, not a workaround.
2. **Section 5c: does a bad build come back after the sale?** The market
   consequence in 5a is the core and stands alone. A returning car plus a
   reputation hit is a better story and a new mechanic; recommend deferring it until
   5a has been played.
3. **Section 2a: is machining its own feature?** It is genuinely good, genuinely
   JDM, and it is the only honest answer to "the block adds capacity if you bore".
   It also has a real authenticity payoff nothing else in the game currently
   delivers. But it is a feature, not a footnote, and it wants its own scoping.
4. **Does the dyno cost money as well as a labour slot?** GDD 5.4 says one labour
   slot and is silent on cash.
5. **What does an incoherent build do to the buyer POOL versus the price?** 5a
   proposes both narrow. Whether a dangerous car should be effectively unsellable,
   or merely cheap, is a feel question worth deciding deliberately.
