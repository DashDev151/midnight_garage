# The tuning system, from the ground up

**Status: DESIGNED to implementation depth, not scheduled. v2, 2026-07-29.**

v1 (2026-07-28) established the shape. This revision answers the maintainer's design
review of 2026-07-29 and takes each open question to a decision or to a stated
choice. Every number is a proposal and unapproved.

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

```
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

## 5. Reliability: what it actually does

**This was the largest undesigned thing and it is the crux of the whole system.**
The maintainer's question: what should happen if you boost 1.5 bar on a stock kei
engine?

### 5a. The answer: reliability is a rate, not a dice roll

**Low reliability means the car destroys itself, fast, visibly, and predictably.**

Reliability becomes a derived number expressing **how well the build supports its
own output**, and it drives **the rate at which installed parts lose condition with
use**:

| reliability | what happens |
| --- | --- |
| high | parts wear at the normal rate. A sane build lasts |
| moderate | the stressed parts (block, internals, head, clutch) wear noticeably faster |
| low | those parts wear fast enough to watch. Mint to worn in days of use |
| **critical** | **a stressed part fails outright to `scrap`** |

The kei at 1.5 bar: reliability collapses, the block, internals and head burn down
through the bands over a handful of days, and then one of them goes to `scrap`.
`scrapDisablesCar` already covers all three, so **the car simply stops.** The engine
ate itself, which is exactly what happens in reality.

### 5b. Why this shape and not a dice roll

- **It is realistic.** An over-boosted stock engine does not usually explode at
  random; it wears out fast and then lets go.
- **It respects the no-reflex rule and the no-random-punish instinct.** The player
  is warned, sees it coming, and can act. Nothing is taken from them by a hidden
  roll.
- **It needs no new mechanic.** It accelerates the condition system that already
  exists and already drives value, performance and repair.
- **It creates maintenance as a real decision**, which the game does not currently
  have: the fast car needs looking after and the sensible one does not.
- **It makes the coherent build genuinely better** rather than merely differently
  numbered. It lasts.

### 5c. The player must be told, and that is what the dyno is for

A build with unsupported power must announce itself before it destroys anything: on
the dyno, on the car's own readout, and in the day log as it starts to happen. **A
consequence the player could not have foreseen is a punish; one they were shown is a
choice.**

### 5d. Reliability stops being an additive stat

A part does not "add reliability". The build either supports its own output or it
does not. So `statModifiers.reliability` goes away and reliability becomes derived
from build coherence (section 6). See section 8.

---

## 6. Build cohesion, and what it does to value

The maintainer's shape: adding a turbo is worth X, adding internals is worth Y, and
adding both should be worth **more than X + Y**. Incentivise coherent builds.

### 6a. Cohesion is one number and it drives two things

**Support ratio**: how well the enablers on the car match the demands of the gains
on it. A small turbo on stock internals is well supported. A large turbo on stock
internals is not. A large turbo with forged internals, upgraded fuel and better
cooling is.

That one number drives **reliability** (section 5) and **value** (below), which is
why a coherent build is both safer and worth more. One concept, two consequences,
no second system.

### 6b. Three ways to express the value part, and they are not equal

The economy bible's Law 5 says the premium multipliers "are capped at 1, so the
premium term can only ever be withheld, never inflated". A genuine bonus above the
sum of parts **breaks that law** and needs an amendment.

| option | how | breaks Law 5? |
| --- | --- | --- |
| **A. Penalty framing** | an incoherent build has its premium withheld; a coherent one gets it in full | No |
| **B. Bonus framing** | a coherent build's premium exceeds the sum of its parts | **Yes**, needs an amendment |
| **C. Coherence-varied retention** | `partsRetention` (how much of a part's price survives into car value) depends on cohesion | No. Law 5 caps `foundationFactor` and `aftermarketReturn`, not retention |

**A and B produce the same ordering**; they differ only in where the baseline sits.
**C gets a genuine super-additive result without touching the capped multipliers**,
because a well-integrated part really does retain more of its cost than the same
part bolted onto a mismatched car.

**Recommendation: C, and it needs a maintainer ruling** because retention is an
economy lever and because whether it is within Law 5's spirit is a judgement call.
The law's intent is "mods return cents on the yen, they don't multiply the chassis
price"; varying how many cents by how well the work was done still honours that.

**And the underlying claim is true, which is why it is worth doing:** a well-sorted
car is worth more than its receipts, because coherence signals competence and
because the thing actually works. A bag of mismatched parts is worth less than its
receipts. Both directions are real.

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

1. **Section 6b: which cohesion framing?** A (penalty), B (bonus, needs a Law 5
   amendment), or C (coherence-varied retention, recommended). This is an economy
   lever and a law question.
2. **How fast should a critical build destroy itself?** Days of use is the shape;
   the number is a feel question that wants playtesting rather than deriving.
3. **Can a player disable or ignore the warning** and blow the engine deliberately?
   I would say yes: it is their car, and a known risk taken knowingly is a decision.
4. **Does the dyno cost money as well as a labour slot?** GDD 5.4 says one labour
   slot and is silent on cash.
