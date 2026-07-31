# How a car arrives: age, damage, and what happened to it

**Status: ALL THREE LAYERS BUILT (Sprints 153, 154 and 155).** Layer 3's implementation record,
including the authored pattern weights and the two places the built mechanism differs from the
sketch below, is `docs/sprints/sprint155.md`'s Exit.

Supersedes the 2026-07-31 draft, which covered only the damage budget.

## The three questions

A car arriving at auction answers three separate questions, and today the game answers one of
them badly and the other two not at all.

| layer | question | today |
| --- | --- | --- |
| **1. How much** | is this car rough? | a money target with no limit, which wrecks cheap cars |
| **2. How likely** | what kind of car is this likely to be? | one flat table for every car in the game |
| **3. Where** | what actually happened to it? | uniform random across every eligible part |

Each layer ships on its own and is worth having on its own.

---

## Layer 1: how much damage, and how old

### What is wrong

**A rule breaks parts until the repair bill reaches a percentage of the car's value, and it has no
limit.** It authors 62 to 89 per cent of the final damage on **every car in the game** at every
tier. The honest wear model contributes almost nothing.

**It cannot be reached by age or mileage.** On a 1993 Wagon R at 23,588 km, the worst condition
any part can roll is 51 per cent, and `poor` needs below 15. **`poor` is arithmetically
unreachable.** Measured: the wear model produced **0.0** poor parts and a ¥6,223 bill; the rule
added ¥17,882 and 15.4 poor parts.

**Cheap cars are destroyed by it**, because their parts are cheap so it must break far more of
them to reach a money target. And entry cars expect `worn`, so **only `poor` counts as
below-expectation work**: `poor` is the only currency an entry car can pay in. The worst car in
the roster is the **Alto Works** at 85 per cent of the maximum damage it can physically hold. The
Beat is a kei and is fine, because it sits in `everyday`. **The axis is tier, not culture.**

**It applies to every lot**, so nothing can ever be the exception.

**The bug already has a regression test, relaxed to let it pass.** `auctions.test.ts:594` is named
*"a brand-new (age-0) car does not roll nearly every part poor"* and is weakened to
`poorOrWorseFraction < 0.4`. Restoring it is part of the definition of done.

**Upkeep is defeated.** Cherished and neglected converge on the same roughly fifteen ruined parts.
`economy-bible.md` claims *"cherished provenance now means less damage, never none"*. It currently
means the same damage.

### Age: already right, and about to matter

The year roll is `min(yearFrom + rng.int(0, 8), max(yearFrom, currentYear - AUCTION_MIN_AGE_YEARS))`.

**The three-year minimum cannot override `yearFrom`**, because `yearFrom` is inside the `max`. A
1994 model in a 1995 campaign generates as a 1994 car, age 1. So near-new cars already generate
correctly, and **that is the point**: the roster sits squarely in the game's own era, so a good
share of cars should arrive close to new. Today they arrive close to new and then get wrecked.

**Two real defects remain:**

1. **There is no production end year.** A Hakosuka, built 1969 to 1972, can generate as a 1977 car.
   `yearTo` is a new roster column and a new `CarModel.spec` field, authored for all 94 rows under
   directive 24.
2. **The nine-year window is a hardcoded literal.** `rng.int(0, 8)` with no lever. Once `yearTo`
   exists the window becomes `[yearFrom, min(yearTo, currentYear - AUCTION_MIN_AGE_YEARS)]` and the
   literal goes.

### The fix

**Roll a damage budget per car, with a cap, instead of chasing a money target with no limit.**

    damageBudget = rolled per lot, in BAND STEPS from mint
    degrade parts until the budget is spent, or the Law 2 ceiling binds

Band steps are what the player perceives. Yen is a downstream accident of
`partPricing.classFactors`, which is itself mis-calibrated. Counting in steps also removes the
granularity asymmetry: a car with eight parts at `worn` carries real damage whatever its tier.

**The bill then falls out of the parts' own prices**, which is the right direction of causation. A
rough cheap car SHOULD have a small bill, because its parts are cheap.

### The distribution

Roster-wide target:

| grade | share | reads as |
| --- | ---: | --- |
| tidy | **45%** | a couple of jobs, a good weekend |
| used | **35%** | honest wear, real work, no drama |
| rough | **15%** | a proper project |
| project | **5%** | someone gave up on it |

#### The venue CAPS, it does not bias

**This is the part most likely to be got wrong, and getting it wrong triple-counts one fact.**

`auction.carTierWeightsByAuctionTier` already exists and already makes cheap rooms sell cheap
cars: the local yard is **70 per cent entry**, the collector network is **70 per cent flagship**.
Entry cars are separately the roughest by their own culture and tier profile. **So a cheap room is
already full of rough cars before any venue rule is applied at all.** Adding a per-venue roughness
distribution on top would count the same fact three times: the tier mix, then the tier shift
inside the profile, then the venue.

**So the car decides how rough it is, and the venue only decides what it refuses to sell.**

The rate that emerges from the shipped tier mix, with no venue roughness rule at all:

| venue | tier mix | project rate that emerges |
| --- | --- | ---: |
| `local-yard` | entry 70 / everyday 28 / enthusiast 2 | **~9%** |
| `regional` | entry 25 / everyday 45 / enthusiast 27 / flagship 3 | **~6%** |
| `premium` | entry 3 / everyday 17 / enthusiast 55 / flagship 25 | ~4% |
| `collector-network` | everyday 3 / enthusiast 27 / flagship 70 | ~2% |

That gradient is the right shape and it costs nothing, because it falls out of content already
authored and signed.

**RULED 2026-07-31: there is no per-venue lever at all.** An earlier draft proposed a
presentability floor so a premium room could not put a wreck under the hammer. Cut, on the
maintainer's ruling that a rare wreck at a premium auction is interesting rather than a problem.

So the whole venue gradient is emergent, from content that already ships and is already signed.
Nothing new is authored and nothing can drift out of step with the tier mix, because there is no
second thing to keep in step.

**The property the design now leans on must be asserted rather than assumed**: the project-grade
rate comes out ordered `local-yard > regional > premium > collector-network`.

#### The scrapyard inverts all of this, deliberately

**RULED 2026-07-31.** The scrapyard is not an exception to the emergent rule, it is its opposite,
and it needs its own mechanism rather than a tweak to this one.

- **Any car can be there, entry through flagship.** Its tier availability is **flat**, not the
  weighted mix every auction room uses. A yard takes whatever arrives on the truck.
- **Everything in it is in bad condition, whatever the car is.** Condition at the scrapyard is
  **imposed by the venue**, not emergent from the car's culture and tier. A cherished-profile
  flagship still arrives wrecked, because it is in a scrapyard.

Both are the reverse of the auction design above, and that is the point rather than an
inconsistency: an auction room's stock reflects **who shops there**, and a yard's stock reflects
**how the car ended up there**.

**Why it matters more than it looks.** This is how a player touches a flagship early. They cannot
afford an intact Supra for a long time, but they can afford a wrecked one, and a crashed Supra in
a yard is the whole fantasy of the place. **The scrapyard is a progression on-ramp to cars the
auction economy would otherwise gate behind money**, which is a different and better reason for it
to exist than "cheap parts".

It also makes the project-grade car findable on purpose. Layer 1 makes wrecks rare at auction by
construction; the scrapyard is where a player goes when a wreck is exactly what they want.

### The constraint that decides where this code goes

**A symptom is a label on damage that already exists.** `applySymptoms` writes the true band into
the part at generation and simultaneously records the pre-damage band in `apparentBandByPartId`,
which is the sole input to the sheet price, the fear line, the uncertainty chips and the whole
diagnosis game.

The order is load-bearing:

    condition -> zones -> Law 2 ceiling -> SYMPTOMS -> the min-work floor

**The budget replaces the floor and must sit exactly where the floor sits.** Three rules follow,
and breaking any of them silently inverts the diagnosis game with no crash:

1. **Run after symptoms**, never before.
2. **Never write `apparentBandByPartId`.** Budget damage is honest visible wear, not a second
   hidden defect. The floor already gets this right and its reasoning is recorded at its own call
   site.
3. **Account for damage symptoms have already spent.** Otherwise a symptomatic car takes budget
   damage stacked on top and comes out systematically rougher than an honest one.

A fourth, softer coupling: symptoms are **vetoed** if they would breach the Law 2 ceiling, so a
budget that eats ceiling headroom silently lowers the real symptom rate below its signed value.
Measure it rather than assume it.

### What must not change

- **Law 1**: below-expectation repair returns at least the yen spent. A property of the valuation
  stack, unaffected by how much damage a car carries.
- **Law 2**: `enforceMaxBillFraction` stays as the outer ceiling and still runs before symptoms.
- **`poor` stays terminal.** Generation never produces `scrap`.
- **Aftermarket parts roll exactly the same band as stock.** RULED: a bolted-on turbo is not
  automatically tireder than a factory one, and the reverse case is just as real (fresh dampers
  fitted because the originals were finished).
- **Nothing degrades during play.** There is no wear model and there must not be one.

### Deliberately separate

Two defects sit next to this and must not be folded in, or the result cannot be attributed:

- **Entry tier registering damage only at `poor`**, because its expected band is `worn`. Law 1
  territory, its own sign-off.
- **`partPricing.classFactors` being mis-scaled** between tiers.

---

## Layer 2: how likely, and what kind of car this is

### The history roll

**A car gets a history**, rolled at generation, describing what happened to it. History is the
cause; the damage profile and the aftermarket parts are both effects.

**This is the right direction of causation.** An earlier draft proposed inferring "was this car
driven hard" from the aftermarket parts fitted to it, which is circular: aftermarket is itself a
roll with no reason to correlate. Rolling the history first and letting it drive both means a
drifted S13 gets drift wear **and** is likely to carry drift parts, because one caused the other.

It also answers the salaryman problem directly. A Chaser is a drift platform, but one that
commuted for fifteen years rolls `commuted`, gets commuter wear, and carries no drift parts.

### Culture, and how likely each history is

`culture` is authored for all 94 roster rows and **does not exist in `packages/` at all**. It has
to reach `CarModel` first: a schema field plus 26 values copied from the CSV.

Culture is the better axis than tier because it captures how a car was *used*. Tier correlates but
conflates price with care: a cheap Kyusha is cherished, an expensive drift car is hammered.

| care profile | cultures | tidy | used | rough | project |
| --- | --- | ---: | ---: | ---: | ---: |
| **cherished** | Exotic, Kyusha | 70 | 25 | 5 | 0 |
| **enthusiast** | Wangan, Touge, Rotary, Touring car | 50 | 35 | 13 | 2 |
| **mixed** | Front-drive tuner, Oddball | 45 | 35 | 15 | 5 |
| **hammered** | Drift, Rally-bred, Kurokan | 25 | 35 | 30 | 10 |
| **worked** | Honest transport, Kei | 20 | 35 | 33 | 12 |

**Tier shifts the profile one step**: flagship toward cherished, entry toward worked.

Checked against real cars: a **2000GT** (Exotic, flagship) is cherished with 0% project. An
**Acty** (Honest transport, entry) is worked with 12%. An **R32** (Drift, flagship) is hammered
shifted up to enthusiast: driven hard, but it cost enough that someone cared. A **180SX** (Drift,
enthusiast) stays hammered, which is true of every 180SX that ever existed.

**The venue table and the culture table compose.** Venue sets the ceiling on how rough a lot can
be; culture and tier decide where inside it this car lands.

---

## Layer 3: where the damage is

### Named damage patterns

**RULED: not one map, a set of named conditions** such as `frontal-collision`, `drifted`,
`grenade`, `neglected-commuter`.

A pattern is authored content that says **which parts a given kind of history ruins**, weighting
the six taxonomy groups (engine, drivetrain, suspension, wheels, body, interior) and the six body
zones (bonnet, boot, left, right, roof, chassis).

    history -> pattern -> where the budget is spent

Illustrative, not signed:

| pattern | ruins | leaves alone |
| --- | --- | --- |
| `frontal-collision` | bonnet, left and right zones, engine group | drivetrain, interior |
| `drifted` | wheels, suspension, rear body zones | engine, interior |
| `grenade` | engine group, catastrophically | everything else |
| `neglected-commuter` | consumables, thin damage everywhere | nothing in particular |

**This is what makes a car a story rather than noise.** Today damage is `rng.pick(pool)`, uniform
across every eligible part, which is exactly why a car reads as static.

### It must be one system with the inspection game, and here is exactly how

The skeleton already exists and is well built: **62 failure modes**, each `{ carPartId, setBand,
weight }`, grouped into **17 symptoms** with **47 diagnostic tests**. **A failure mode is already
an atom of named damage, addressed by `carPartId`.** That is the shared vocabulary.

**A pattern is one thing and one thing only: a weighting over part slots.**

    pattern = { id, displayName, slotWeights }

Nothing else. Not a damage amount, not a band, not a list of effects. Amount is the budget's job
and band is the degrade step's job. **A pattern answers "where", and only "where".**

**One weighting, two consumers.** That is the whole of the cohesion:

| consumer | what it does with `slotWeights` |
| --- | --- |
| **the damage budget** | draws which slot to degrade from the weighting, instead of the uniform `rng.pick(pool)` it uses today |
| **the symptom draw** | weights each candidate symptom by how much its causes' `carPartId`s overlap the weighting |

So a car that rolled `frontal-collision` spends its visible damage on the bonnet, the left and
right zones and the engine group, **and is far likelier to present a front-end symptom than a
gearbox whine**. Today the symptom draw is independent of everything, which is why a car's visible
damage and its hidden fault have nothing to do with each other.

**Three things fall out of that single join rather than needing their own mechanisms:**

- **The scrapyard's localised damage is a pattern with a large budget.** "Went in the front, engine
  is scrap, most of the body is saveable" is `frontal-collision`. No second mechanism.
- **Model-specific faults are per-car pattern weights.** An FD weights toward a pattern that ruins
  the engine, and therefore also draws apex-seal symptoms more often. One authored number buys
  both halves, which is what praying to the apex-seal gods should mean mechanically.
- **Culture faults are per-culture pattern weights.** A drifted car ruins wheels, suspension and
  rear bodywork and presents symptoms from those parts.

**What a pattern must NOT do**, because each would duplicate something that already works:

- **Set a band.** Failure modes already do that, and `setBand` is a floor never a ceiling.
- **Create a symptom.** `applySymptoms` owns that, including its Law 2 veto.
- **Write `apparentBandByPartId`.** Budget damage is honest visible wear.

The last one is the trap. A pattern that picked a part and set its band **would be
`applySymptoms` minus the causes, the tests and the price** - a second, worse diagnosis system
growing beside the good one.

### Two existing defects this layer fixes

- **Body zones roll independently**, so there is no front/rear axis and `left` and `right` are
  uncorrelated. A collision cannot be expressed.
- **Symptom damage always writes to `bonnet`**, deliberately, to avoid an RNG draw. Every rust
  patch in the game is on the same panel.

---

## The authored exception: story missions

**Guardrails make the roster sane and therefore make it predictable.** A player who wants to build
a genuinely rough Countach will never roll one, because the system correctly refuses to put a
wreck in a premium room.

**That is not a reason to loosen the rules. It is a reason to hand-place the exceptions.** A
wrecked exotic is a story mission's car, not a generation outcome. The machinery exists: the
tutorial lot is already hand-authored, and story missions already unlock auction tiers.

This is also the honest home for cars that should barely exist: the one-off, the barn find, the
car with a history the generator has no vocabulary for.

---

## Sprint order

| sprint | layer | contents |
| --- | --- | --- |
| **153** | 1 | the rolled budget, the venue table, `yearTo`, the restored regression test |
| **154** | 2 | `culture` onto `CarModel`, the history roll, care profiles, history drives the aftermarket roll |
| **155** | 3 | named damage patterns, patterns drive where the budget lands, symptom choice becomes history-consistent, the bonnet fix |

The scrapyard consumes all three when it is built and adds no new damage mechanism.

## What moves when layer 1 lands

The lever is cheap; what is pinned to it is not.

| what | where |
| --- | --- |
| the exact-value pin on `minWorkBillFractionByTier` | `schemas.test.ts:301-306` |
| the floor-distribution probe, 250 lots x 4 tiers | `auctions.test.ts:665-760` |
| the relaxed age-0 assertion, to be **restored** | `auctions.test.ts:594-607` |
| the age-monotonicity test, which declined to pin a margin | `auctions.test.ts:609-622` |
| `buildRoughProbeCar` and every probe derived from it | `balanceProbes.ts:265-278` |
| the economy approval gate | `economyApprovalGate.test.ts` |
| the worked example, regenerated | `worked-example-two-cars.md` |

## Definition of done, layer 1

1. A young, low-mileage car reads as a tidy car.
2. Cherished and neglected produce visibly different cars.
3. A project car is rare, at a rate we chose, and cannot appear at a premium auction at all.
4. `auctions.test.ts:594` is restored to a meaningful threshold and passes honestly.
5. No car generates outside its own production years.
6. The symptom seam is intact: no double-discounting, and the measured symptom rate still matches
   its signed value.
