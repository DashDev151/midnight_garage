# The tuning system

**Status: DESIGNED, REVIEWED, NOT IMPLEMENTED. Nothing in this document exists in
the game.**

**One exception, and it matters: section 1d is not a proposal. It describes a bug in
shipped code today**, where `buildFactors` ignores a part's condition band entirely.
That one is real, live, and is step 1 of the build order.

The design of record for what an aftermarket part does, how a build holds together,
and what that is worth. **Every number here is a proposal and unapproved**; directive
22 applies, so no value may be pulled without the maintainer signing that specific
lever.

**Deferred out of this system, deliberately:**

- **Course-character build variety** (a client wanting a Wangan car, a touge beast, a
  track toy, a reliable runabout). Job and copy design, not physics.
- **Fitting a turbo to a naturally aspirated car.** Both a part and an aspiration
  change; that machinery lives in `engine-swaps.md`.
- **Machining** (section 4). A real feature with its own scope; this system must not
  foreclose it.
- **The reputation half** of section 7, which is blocked on section 8.

---

## 1. The four defects

**The system is solved: there is one correct build order and it never varies.**

### 1a. A part's effect does not depend on the car

`StatModifierSchema` is five signed numbers and they are **absolute additive
deltas**. The catalogue is 472 SKUs, 118 per fitment class, and the class moves only
price. Every SKU's effect is byte-identical on every car in the game.

The race ladder sums to **+200 PS on anything**: x1.62 on a Supra, **x4.64 on a Wagon
R**. A ratio target cannot be expressed on an additive path.

### 1b. Nothing is grounded in how engines respond

The same +16 PS ECU applies to a naturally aspirated Beat and a twin-turbo Supra. In
reality an ECU is worth about **3 per cent** on an NA engine (recovering ignition
timing and a conservative factory map, with no boost to add) and **20 to 30 per cent**
on a turbo. Same part, an order of magnitude apart, and the model cannot tell them
apart.

**The bar: people who know performance cars must not roll their eyes.**

### 1c. Every part is a gain, so the cheapest gain always wins

Exhaust at +13 PS costs a fraction of block at +32 PS. Per yen exhaust wins outright,
and so on down the list. **There is no reason to ever buy the block.**

### 1d. Condition does not reach half the model, and this one is a bug

`computeDerivedStats` scales every `statModifiers` value by
`bandFactor(installed.band)`. `buildFactors`, in the same file, reads only
`installed.partId`:

```text
factors.grip *= modifiers.grip
factors.braking *= modifiers.braking
factors.mass *= modifiers.mass
```

**It never reads the band.** A `scrap` race coilover delivers the identical 1.029
grip multiplier as a mint one; a destroyed big brake kit brakes like new. Two parallel
modifier systems, and only one respects condition.

**This is a defect rather than a design question, and it is fixed first.**

---

## 2. What the data model can and cannot express

**Can:** an absolute PS delta; absolute deltas to handling, style, reliability and
authenticity; multiplicative grip, braking and mass (`physicalModifiers`, product
across slots); downforce and drag, but only by being one of three `aeroFunctional`
grades that replace the car's factory figure outright; a tyre compound tier, but only
through the `tyres` slot's grade.

**Cannot, at all:** proportional power; any torque-curve or rev-range change; gear
ratios, final drive or redline; weight distribution, wheelbase or centre of mass;
drivetrain layout or aspiration; **any effect that depends on the car it is fitted
to.**

**A trap worth naming:** `redlineRpm`, `peakTorqueNm`, `torqueRpm`, `powerRpm` and
`displacementCc` all exist on `spec` and **the physics reads none of them**
(`formulas.md` section 2: "Display data; the physics does not read them"). Any design
reaching for a torque curve is inventing data, not using it.

---

## 3. Part roles

| role | does | the trade |
| --- | --- | --- |
| **Gain** | adds output directly | costs money |
| **Enabler** | adds nothing alone; decides how much a gain can safely deliver | costs money, shows no number |
| **Trade-off** | buys one thing at the cost of another | costs a stat |

### 3a. What each trade-off actually trades

| part | buys | costs |
| --- | --- | --- |
| **Race cams** | top-end power | low-end power and driveability. Quicker on a circuit, worse everywhere else, and it idles badly |
| **Large turbo** | a much higher power ceiling | response, and reliability unless the enablers are there |
| **Aggressive springs and bars** | grip and turn-in | ride quality, and grip on a rough surface. A touge car that skitters |
| **Race brake pads** | stopping power when hot | poor cold bite, so worse on the first corner and on the road |
| **Stripped interior** | weight | style, and habitability that some buyers price |
| **Race aero** | downforce | drag, so a lower top speed. The model already prices this correctly |

**A trade-off part makes the car better at one job and worse at another.** That is
what makes a build a build rather than a shopping list, and it is what the deferred
job-variety work will land on: a client wanting a reliable runabout does not want race
cams in it.

### 3b. Some parts hold two roles

**The block is both.** Boring the cylinders adds capacity, and capacity is power, so it
is a gain. Forged internals and a girdled block decide how much boost and how many revs
the engine survives, so it is also an enabler.

Internals are almost purely an enabler. Head and valvetrain are both, weighted towards
gain on an NA engine and towards enabler on a turbo.

**This is the answer to "why buy the block".** Not because it is efficient power per
yen (it is not, and must not be), but because without it a large turbo has nothing
holding it together. Section 6c states the convention that keeps dual-role parts
mathematically honest.

---

## 4. Three ways a part gets better

The game has two of them.

| avenue | what it is | ceiling | authenticity | gated by |
| --- | --- | --- | --- | --- |
| **1. Repair and recondition** | restoring a part toward the condition it left the factory in | **never exceeds stock** | preserved | tool tier: 1 reaches `fine`, 2 reaches `mint` |
| **2. Fit aftermarket** | a differently-specified part in its place | the part's own grade | **destroyed** | money, and hiring the tools to fit it |
| **3. Machine what you own** | modifying a part you already have so it exceeds its own original spec | **above whatever it started as** | **preserved** | **the workshop's final tier** |

Avenue 3 is **additive on top of 1 and 2**, not an alternative. You machine a part you
own, and it does not care whether that part is the factory item or an aftermarket one.

**Real tuning is largely avenue 3**: boring and stroking for capacity, porting and
polishing for flow, skimming for compression, balancing and blueprinting for revs and
durability, lightening a flywheel for response. None is a part you buy. All are work
done to the part you have, and in Japan that culture is central rather than peripheral.

### 4a. Four end states, and the choice is permanent

| end state | performance | authenticity |
| --- | --- | --- |
| Stock, reconditioned | baseline | **full** |
| **Stock, machined** | above stock, below aftermarket | **full** |
| Aftermarket | high | lost |
| **Aftermarket, machined** | **the ceiling** | lost |

This gives the numbers-matching build a real performance path rather than a sentimental
one, and puts the absolute maximum behind a route that costs the car its originality
forever. Money and originality sit on opposite sides of a permanent choice, on every
component.

### 4b. Machining is an acquisition path, not a new axis

A machined block is still one SKU in one slot. Only the route differs:

| | buying | machining |
| --- | --- | --- |
| cost | purchase price, delivery | machine time, labour, days |
| needs | money | **your existing part, consumed** |
| gated by | the catalogue | **the final workshop tier** |
| authenticity | destroyed | **preserved** |

No third property on a part, no second condition model, no new job system.

**`machineShopAssist` is NOT the home for this.** That is basic tool hire, for bringing
in an engine crane for a day, and it is priced and scoped as such. Machining is the
player's own machine shop, built and unlocked in the late-middle game: a facility, not
a rental.

**Machining is deterministic.** You pay, you wait, you get the part. Real machining risk
is the first thing a future reader will try to invent, and it would add a random
catastrophic loss to a game that has none.

### 4c. This gives tool tier 3 a purpose

`repairBandCeilingByTier` is `{1: "fine", 2: "mint", 3: "mint"}`. **Tier 3 currently
buys nothing over tier 2.** Machining is the purpose it lacks: tier 1 gets a car
sellable, tier 2 gets it perfect, **tier 3 lets you make parts better than they were
ever built.**

**Scope: avenue 3 is its own feature and its own sprint.** This system does not depend
on it, but **it must not be foreclosed**: do not express capacity increases as
aftermarket SKUs pretending to be replacements, and do not assume every upgrade path
destroys authenticity.

---

## 5. Power

### 5a. Proportional

`statModifiers.power` becomes a fraction of the car's own stock output rather than an
absolute PS figure. This alone closes the x4.64 case.

### 5b. Response depends on what the engine is

| character | derived from | headroom | why |
| --- | --- | --- | --- |
| **Forced** | the induction tag | high | boost is power until fuel, cooling or internals run out |
| **High-strung NA** | high specific output for capacity | low | a 10,000 rpm B16A left almost nothing on the table |
| **Lazy NA** | low specific output for capacity | medium | detuned from the factory, and it gives some back |

Specific output is `stockPowerPs / (displacementCc / 1000)`, both already on `spec`.
**No new authored content**, only a derivation, and it lands correctly: the Beat
(98 PS/litre, kei-limited) reads high-strung, the Cefiro's RB20DET reads forced, a
Carina 1.5 reads lazy.

### 5c. The rotary carve-out

**Specific output per nominal cc is meaningless for a rotary.** A 13B is 1308 cc by
convention and behaves like roughly 2.6 litres, so the derivation above would read every
rotary as extraordinarily high-strung. An RX-8 would come out at 191 PS per nominal
litre.

**Multiply rotary displacement by 1.8 before deriving specific output.** That is the
equivalency factor motorsport bodies have long used for exactly this comparison, and it
puts the RX-8 at about 106 PS per equivalent litre: a healthy NA with modest headroom,
which is correct. `engineConfig` already carries `rotary-2` and `rotary-3`.

### 5d. Per-part response

Illustrative, not signed:

| part | NA | forced | note |
| --- | ---: | ---: | --- |
| ignitionEcu | 0.03 | 0.25 | the flagship case: timing versus boost |
| exhaust | 0.04 | 0.14 | noise versus backpressure and spool |
| intake | 0.02 | 0.05 | almost nothing either way, correctly |
| camsTiming | 0.10 | 0.05 | where NA power lives |
| headValvetrain | 0.08 | 0.06 | porting and valves |
| block | 0.12 | 0.02 | capacity on NA; an enabler on turbo |
| forcedInduction | n/a | 0.35 | see 5e |

### 5e. Return curves differ by category

| category | curve | why |
| --- | --- | --- |
| **Forced induction** | **increasing** | a bigger turbo is not more of the same thing, it is a categorically more capable one |
| Block | roughly linear | capacity is capacity |
| Cams | roughly linear | more duration, more top end, more lost bottom end |
| Intake | strongly diminishing | a filter, then a pipe, then nothing |
| Exhaust | diminishing | cat-back, full system, then titanium saves weight rather than power |
| ECU | threshold | little on its own; it unlocks what the others can do |

**Increasing returns on forced induction is NOT an anti-dominance mechanism. On its own
it is the opposite**: it creates a new dominant strategy for any player rich enough to
buy the biggest turbo and ignore everything else.

**What makes it safe is the support cost rising alongside it** (section 6). A larger
turbo demands proportionally more of every subsystem, so the expensive path pays only if
you commit to all of it, and ruins you if you commit halfway. **The curve must never
ship before the support ratios** (section 17, constraint A).

---

## 6. Support: how a build holds together

### 6a. One ratio per subsystem, headline is the weakest link

**Not one aggregate ratio.** A single `total support / total demand` cannot name the
part that would fix it, and it is gameable: massively over-supplying fuel would
arithmetically mask stock internals under a big turbo, which is physically nonsense.
Fuel does not hold a piston together.

| subsystem | demanded by | supported by |
| --- | --- | --- |
| cylinder pressure | boost, compression | internals, block |
| fuelling | airflow | fuelSystem |
| heat | sustained output | cooling |
| revs | cams, ported head | headValvetrain, internals |
| torque transmission | total output | clutch, driveline |

`ratio[subsystem] = support[subsystem] / demand[subsystem]`, and the headline
`supportRatio` is **`min(ratio)` across all subsystems**.

A stock, unmodified car sits at exactly **1.0 on every subsystem by construction**,
which is what makes the whole thing readable.

### 6b. Why the minimum rather than the mean

| build | fuel | internals | mean | **min** |
| --- | ---: | ---: | ---: | ---: |
| big turbo, huge fuel system, stock bottom end | 2.4 | 0.4 | 1.4 | **0.4** |
| big turbo, matched fuel, forged bottom end | 1.1 | 1.1 | 1.1 | **1.1** |

A mean says the first build is better supported. It is not; it is a hand grenade with an
excellent fuel pump. The minimum says so, **and it names the part to buy next.**

### 6c. The convention for dual-role parts

Some parts appear on both sides (3b). The rule that keeps this honest:

**Demand comes from output. Support comes from specification. Within any one subsystem,
a part is a demander or a supporter, never both.**

- A **larger turbo** demands cylinder pressure, fuelling and heat. It supports nothing.
- A **forged block** supports cylinder pressure. It demands nothing on that subsystem.
- **Boring that block** adds capacity, which adds output, which raises demand on
  **fuelling, heat and torque transmission**. It does **not** raise its own cylinder
  pressure demand.
- A **ported head** supports revs and, as a gain, raises demand on fuelling and heat.

**A part never supports the subsystem its own gain demands.** That is physically true and
it makes self-cancelling impossible: no upgrade can pay for itself by existing.

### 6d. The worked example

**1.5 bar on a stock kei engine.** Cylinder pressure demand is enormous; internals and
block are stock and answer only the factory's demand. That subsystem's ratio collapses,
and being the minimum, it is the headline.

The car makes real power. The readout reports the shortfall **by name**. The buyers who
understand engines will not touch it, the ones who remain pay poorly, and if it is sold
anyway the reputation cost lands.

**The engine does not explode.** It is a car that is worth less and costs standing, not
one that detonates on a timer. See section 9.

### 6e. Two required properties, delivered for free

**Legible.** The minimum names its own subsystem, and the subsystem names the part.
"This is asking more of the bottom end than it can give" is a sentence the game can
generate rather than approximate.

**Not a cliff.** Each ratio degrades smoothly, so a build can be slightly optimistic
without being ruined. The threshold in 7b is where reputation begins to bite, not where
the number begins to move.

---

## 7. Cohesion, value and reputation are one system

**"Greater than the sum of its parts" and "a knowledgeable buyer will not touch it" are
not two mechanics. They are one mechanic described from opposite ends.**

```text
build            support ratios      WHO BIDS      ->  price
(gains vs   ->   (per subsystem, ->
 enablers)        min = headline)    REPUTATION    ->  standing
```

One derived state. Two consequences. Both land at the sale, which is where the player's
loop actually ends.

### 7a. Value: buyer selection, not a multiplier

A coherent build does not receive a bonus. It **reaches a different set of buyers**, and
they pay more because they can see what they are looking at.

| build | who bids | what happens to the money |
| --- | --- | --- |
| coherent, well supported | everyone, including the buyers who know | full interest, best prices |
| powerful but unsupported | only buyers who cannot read it | thinner pool, weaker prices |
| dangerous | almost nobody serious | it sits, or it goes cheap |

**This never inflates a premium multiplier.** It changes who is buying, and a car sold to
an enthusiast genuinely fetches more than the same car sold to someone nervous about it.
Buyer taste and the buyer pool are an existing path, separate from the capped multipliers
Law 5 governs.

**Unverified, and it is the design's main risk.** That buyer selection can produce a
price spread large enough to be felt is an assumption, not a measurement.

### 7b. Reputation: selling a grenade costs you

Sales already produce a reputation delta through `saleReputationDeltaFor`, keyed on the
quality of what was sold. **Reliability joins that judgement**: a garage's reputation is
the aggregate of what its cars turned out to be like.

**When.** One-sided and threshold-based. A sane build is the expected standard and earns
nothing extra, because competence is a baseline rather than an achievement.

| headline support ratio | reputation effect |
| --- | --- |
| adequate or better | none |
| below adequate | a penalty, scaling with how far below |
| dangerous | a large penalty, and it should sting |

**How much. The governing rule is NOT "it costs more than it makes."** That would
foreclose a playstyle the game should allow: selling shitty builds for quick cash and
tanking your standing is a legitimate, inefficient, strange way to play.

**Selling bad builds makes more cash, faster. It costs you access.**

A trade rather than a trap. **This is the same principle as the rest of the design: the
reason there must not be one correct build order is the reason there must not be one
correct way to run a garage.**

**A bad car can also come back.** Word gets round, and the reputation half arrives with a
face on it rather than as a silent number.

**But see section 8: reputation cannot currently express this trade at all.**

### 7c. The player must be able to see it coming

**A consequence the player could not have foreseen is a punish. One they were shown is a
choice.** So a build that cannot support itself announces that at three points and three
levels of precision:

| where | what is shown |
| --- | --- |
| the car's own readout, always | a qualitative warning that something does not add up |
| **listing it for sale** | the same warning, restated, unmissable |
| **after a dyno session** | the numbers, and the shortfall **named by subsystem** |

**This is what reconciles 7c with section 14.** A player who fits a big turbo and lists
without ever running a dyno is **still warned**; they simply do not learn precisely what
is wrong or by how much. **The dyno sells precision, not the existence of the problem.**

They must also be free to sell it anyway. It is their car and their reputation.

---

## 8. Reputation is a ratchet, and it blocks 7b

Reputation today is essentially an unlock gate: gaining it opens auction houses, tool
tiers and mission access, and **those unlocks never close again.** A player who has
opened everything and then tanks their standing keeps it all and pays almost nothing.

**The trade in 7b therefore cannot be expressed.** The dodgy path is not inefficient, it
is free, which is worse than forbidding it. It also means high reputation stops mattering
the moment the last thing unlocks.

**A. Unlocks can be lost.** Coherent, but confiscating a tool the player paid for reads
as arbitrary.

**B. Reputation gates the FLOW of opportunity rather than the door.** A well-regarded
garage gets better cars consigned, better jobs offered, better buyers walking in, and
gets them more often. A disreputable one gets fewer and worse.

**B is the recommendation.** It makes the trade real without confiscating anything, gives
reputation a job every day rather than at four thresholds, and makes the back-alley shop
**self-consistent rather than punished**: you sell rubbish, rubbish comes to you, and you
make thin money fast. An identity for a shop rather than a penalty box.

**Not in scope here.** 7b is descoped for this reason; shipping a knowingly inert
consequence is worse than not shipping it.

---

## 9. Reliability is not a wear rate

Recorded so it is not proposed again.

**The player never lives with the car.** The loop is buy, fix, sell. There is no period
of ownership during which a build accumulates use, so a mechanic denominated in days of
driving has no time in which to operate. The buyer lives with the car.

**And the condition system has no motion.** `degradeBand` exists only inside
`auctions.ts`, applied at generation time to make a car worse before the player ever sees
it. Nothing decays during play; the only thing that moves condition is the player
repairing it.

Any future proposal reaching for "the car wears out" must answer both of those first.

**Reliability is therefore not an additive stat either.** A part does not add
reliability; the build supports its own output or it does not.

---

## 10. Condition

**Fix the 1d bug first:** `physicalModifiers` must scale with the installed band, exactly
as `statModifiers` already do.

**Then make condition bite harder at the top of the ladder.** A race part is highly
strung and runs to a service interval; a stock part is under-stressed and tolerates a
decade of neglect. That produces the property the game lacks: **a race damper at `poor`
is worse than a street damper at `mint`**, and a blown race turbo is not something anyone
wants.

**No wear rate is implied.** A race part is not more *fragile* over time, because nothing
here degrades over time (section 9). It is more **sensitive**: at a given band it has lost
more of its advantage than a stock part at the same band would have. That is a curve
shape, not a process.

The four dials and their curves remain the mechanism. Their values are flagged PROVISIONAL
in `car-performance/README.md` 7b and are re-derived once the whole system is in place.

---

## 11. Which stats stay additive

| stat | verdict | why |
| --- | --- | --- |
| **power** | **proportional** | section 5 |
| **handling** | **DELETE the additive path** | a second route to what `physicalModifiers.grip` already does. The schema's own comment warns that "a second path for either would charge one upgrade twice", and this is that |
| **style** | **keep additive** | taste, not physics. Separately needs a car-level base: `styleCap` is 20, so every stock car scores identically |
| **reliability** | **DELETE, derive it** | section 9 |
| **authenticity** | **keep additive** | each non-original part subtracts. Already correct |

`StatModifierSchema` goes from five fields to **two** (`style`, `authenticity`), with
power moving to a proportional field and handling and reliability derived.

---

## 12. Aero

**One package slot, not split parts.** Splitting into wing, splitter and diffuser needs
the physics to model aero balance front against rear. It does not: there is a single
`downforceCoeff`.

**But the ceiling is per car.** An FD, a Supra or a Countach has real aerodynamic
potential and a genuine aftermarket behind it; a Wagon R does not, and bolting a GT wing
to one should look silly and do very little. One number per car expresses that, and it
prevents every car eventually becoming a GT3 car.

**The missing rung.** `car-performance/README.md` 7g records that the headroom was opened
and the part never authored: "there is still no aero grade above `race`". Its acceptance
target is stated there.

---

## 13. Suspension

**The ladder stays as it is** (1.01 / 1.02 / 1.029 per part, compounding to about 1.09
across three). A 9 per cent grip gain is worth roughly 4 per cent of cornering speed and
a real chunk of lap time, because grip is the dominant term in the model.

**But suspension's value is course-dependent**, and what makes a player feel it is the
deferred job-variety work. Until that exists it will read as the boring purchase, and no
amount of retuning its numbers fixes that. **That is a reason to schedule the job work,
not to inflate suspension.**

---

## 14. What the player sees, and when

| | before buying | after owning |
| --- | --- | --- |
| **Spec sheet** (power, weight, capacity, layout, year) | visible | visible |
| **True condition of parts** | apparent only | inspection and workup, as today |
| **That something does not add up** | not applicable | **always visible** (7c) |
| **Engine response character** (5b) | hidden | **dyno session** |
| **Actual power as built** | claimed | **dyno session** |
| **Support ratios, by subsystem** | hidden | **dyno session** |

**The dyno sells precision, not the existence of a problem.** You do not know how an
engine responds to tuning until you put it on the rollers, which is true in life and makes
the screen worth a labour slot.

Foundational work exists in `docs/design/car-performance/car-spec-book.html`.

---

## 15. Reuse analysis (directive 16)

**Genuinely new:** proportional power; the engine-character derivation; part roles and
enabler gating; per-category return curves; the per-subsystem support ratios; reliability
as a sale-time consequence; the per-car aero ceiling; the dyno screen.

| Concern | Reuse this |
| --- | --- |
| Where a part's effect lives | `statModifiers`, `physicalModifiers` |
| Condition reaching physics | `physicalConditionFactors`, `statFormulas.condition` |
| Power reaching physics | `computeDerivedStats` into `carBlock` |
| Rescaling when power moves | `powerRatio`, the ratio bridge |
| Grip, braking, mass from a build | `buildFactors`, after the 1d fix |
| Aero from a fitted part | `aeroFunctional`, `statFormulas.aero.byGrade` |
| A part's condition affecting it | the condition band system. **Nothing degrades with use** |
| A car that cannot run | `scrapDisablesCar`, `lapBlockers` |
| Withholding premium on a bad car | `foundationFactor`, Law 5 |
| Whether an engine is forced | `hasForcedInduction` |
| Reputation from a sale | `saleReputationDeltaFor` |

**Must NOT be built:** a second power path; a torque curve; a fifth part grade below stock
(`IDEAS.md` records that as rejected and traced to an earlier session inventing scope); a
second condition model; a second job system for the dyno.

---

## 16. The hard constraint

`car-performance/README.md` 7a: **"it does not move prices... treat 'the handling number
moved, so the price should move' as a bug, not a feature."**

Performance and value stay independent, and section 7 does not breach it. **Cohesion does
not change what an installed part retains.** It changes which buyers are interested, and a
buyer paying more for a car they can see is well built is a taste judgement rather than a
performance-to-price coupling.

**A faster car is not worth more for being faster. A better-built car is worth more to the
person who can tell.** Different claims, and only the second is made here.

---

## 17. Build order

**Two constraints are load-bearing.**

**Constraint A: the forced-induction curve must not ship before the support ratios.**
Increasing returns alone is a dominant strategy (5e). What makes it safe is support cost
rising alongside it.

**Constraint B: the buyer-selection spread is verified before anything is built on it.**
The whole value half rests on that one assumption.

| # | step | notes |
| --- | --- | --- |
| 1 | Fix the condition bug (1d) | Small, isolated. Nothing about condition is reasonable-about until it lands |
| 2 | Proportional power (5a) | Closes the x4.64 case. Independently shippable |
| 3 | Engine response (5b, 5c, 5d) | Where the realism arrives. Includes the rotary carve-out |
| 4 | Per-subsystem support ratios (6), **plus a minimal always-on readout** (7c) | The readout ships WITH the ratios, not with the dyno. Otherwise prices move on a number the player cannot see |
| 5 | Return curves including forced induction (5e) | **Blocked by step 4**, constraint A |
| 6 | **Measure** the buyer-selection spread | Constraint B. A measurement, not a build. If it fails, stop and report |
| 7 | Cohesion into buyer selection (7a) | Gated on step 6 |
| 8 | Stat simplification (11), per-car aero ceiling (12), style car-level base | |
| 9 | The dyno screen (14) | Adds precision to the readout from step 4 |
| 10 | Re-derive the provisional condition curves (10) | With everything in place |

**Reputation (7b) is not in this list**, per section 8.

---

## 18. Open questions

1. **Does the buyer-selection spread work?** Step 6. If not, the honest options are to
   withhold premium from incoherent builds within Law 5, or amend Law 5 openly. **Do not
   reach for a third lever.**
2. **Does generation produce incoherent builds?** Generation does produce modified cars.
   Once support ratios exist, an auction lot could arrive incoherent, and the player would
   meet a car that looks like a bargain and is not. Arguably excellent, but it must be a
   **deliberate decision**, and if taken, the pre-purchase inspection routes need some way
   to smell it.
3. **Does an incoherent build narrow the buyer pool, the price, or both?** 7a proposes
   both. Whether a dangerous car should be nearly unsellable or merely cheap is a feel
   question worth deciding deliberately.
4. **Does the dyno cost money as well as a labour slot?**
5. **When is machining scoped?** It is the only honest answer to "the block adds capacity
   if you bore", and it is what gives tool tier 3 a purpose.
