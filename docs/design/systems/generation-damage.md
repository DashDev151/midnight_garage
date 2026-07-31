# How a car arrives: damage as a rolled budget

**Status: DESIGN, APPROVED 2026-07-31. NOT BUILT.**

## What is wrong

**1. Age and mileage barely matter.** A rule breaks parts until the repair bill reaches a
percentage of the car's value. That rule writes most of the damage on **every car in the game**.
The honest wear model contributes only 11 to 38 per cent of the final bill; the rule manufactures
the rest.

**2. The rule has no limit.** `enforceMinWorkBill` (`auctions.ts:370`) degrades one part per
iteration until the yen target is met, with a 121-step spin guard as its only real stop. Nothing
tells it what a sensible amount of damage looks like.

**3. Cheap cars are destroyed by it.** Entry parts cost 15.5 per cent of flagship parts while
entry cars cost far less than that gap, so the loop must break far more of a cheap car to reach
its target. Worse, entry cars expect `worn`, so **only `poor` counts as below-expectation work**:
`poor` is the only currency an entry car can pay in.

**4. It happens to every car, so nothing can be the exception.** One fixed fraction applied to 100
per cent of lots cannot produce rare wrecks. Whatever the number is, it happens every time.

### Measured, on the Wagon R

A 1993 Wagon R at 23,588 km on average upkeep. The wear model's worst reachable part condition is
**51 per cent**; `poor` requires below 15. **`poor` is arithmetically unreachable.**

| | bill | parts at `poor` |
| --- | ---: | ---: |
| what age and mileage produced | ¥6,223 | **0.0** |
| what the rule added | ¥17,882 | **15.4** |

Every broken part on that car was written by the rule.

### It is not a kei problem

The **Alto Works** (¥400,000, entry) is the worst car in the roster, at 85 per cent of the maximum
damage it can physically hold. The **Beat** is a kei and is fine, because it sits in `everyday`.
The axis is **tier**, and specifically expensive-for-its-tier.

### The bug already has a regression test, relaxed to let it pass

`auctions.test.ts:594` is named *"a brand-new (age-0) car does not roll nearly every part poor"*
and is weakened to `poorOrWorseFraction < 0.4`, with a comment explaining the weakening as a
consequence of this rule. **The bug has been reporting itself in the repo.** Restoring that
assertion to something meaningful is part of the definition of done.

### Upkeep is defeated

Cherished and neglected converge on the same roughly 15 poor parts; upkeep only changes how many
steps the loop takes to get there. `economy-bible.md` claims *"cherished provenance now means less
damage, never none"*. **It currently means the same damage.**

---

## The fix

**Roll a damage budget per car, with a cap, instead of chasing a money target with no limit.**

    damageBudget = rolled per lot, in BAND STEPS from mint
    degrade parts until the budget is spent, or the Law 2 ceiling binds

Then most cars are tidy, some are rough, and a few are projects.

### Why band steps and not yen

Band steps are what the player perceives: how beaten up the car looks. Yen is a downstream
accident of `partPricing.classFactors`, which is itself mis-calibrated (entry 0.14 against
everyday 0.16, spanning a two-to-four-fold book-value gap). **Counting in steps also removes the
granularity asymmetry**: a car with eight parts at `worn` carries real, countable damage whatever
its tier, where today an entry car's `worn` parts count for nothing.

The bill then falls out of the parts' own prices and the tier's expectation band, which is the
right direction of causation. A rough cheap car SHOULD have a small bill, because its parts are
cheap. That is real.

### The wear model sets the distribution, the roll picks the outcome

This is the part that restores meaning to everything the rule currently erases.

- **Age and mileage** shift the distribution rougher. An old, high-mileage car is likelier to roll
  a project.
- **Upkeep tier** shifts it tidier or rougher, which gives cherished provenance its stated meaning
  back.
- **The roll** decides this particular car.

So the wear model stops being a baseline that gets overwritten and starts being the thing that
decides what kind of car is likely.

### Illustrative shape, not signed

| grade | roughly | what it reads as |
| --- | ---: | --- |
| tidy | over half of lots | a couple of things need doing |
| used | under a third | honest wear, a weekend of work |
| rough | around one in eight | a real project |
| project | a few per cent | the car the maintainer wants to be rare |

Weights shift with age, mileage and upkeep. **Every number here needs signing under directive 22.**

---

## What must NOT change

- **Law 1** (`economy-bible.md`): below-expectation repair returns at least the yen spent, by
  construction, through `marketRepairDiscount` 1.3. Unaffected: it is a property of the valuation
  stack, not of how much damage a car carries.
- **Law 2**: `worstCaseBill <= maxBillFraction x cleanValue`. `enforceMaxBillFraction` already runs
  before this rule and **stays as the outer ceiling**. The budget must respect it.
- **The (D, F) interlock**: `marketRepairDiscount x maxBillFraction < 1`. Untouched. Nothing in
  Law 2 constrains this rule; today's floor sits at roughly 0.10 of clean value against a 0.60
  ceiling, six-fold clear.
- **`poor` stays terminal.** Generation never produces `scrap`.

## The separate defect, fixed separately

**Entry tier's expectation band is `worn`, so only `poor` registers as below-expectation work.**
That is a defect whatever this rule becomes, and it touches `valuation.expectationByTier`, which
is Law 1 territory and needs its own sign-off. **Do not fold it into this change**, and do not
retune `partPricing.classFactors` in the same change either, or the result cannot be attributed.

## What moves when this lands

The cost is not the lever, it is everything pinned to it.

| what | where |
| --- | --- |
| The exact-value pin on `minWorkBillFractionByTier` | `schemas.test.ts:301-306` |
| The floor-distribution probe, 250 lots x 4 tiers | `auctions.test.ts:665-760` |
| The relaxed age-0 assertion, to be **restored** | `auctions.test.ts:594-607` |
| The age-monotonicity test, which declined to pin a margin | `auctions.test.ts:609-622` |
| `buildRoughProbeCar` and every probe derived from it | `balanceProbes.ts:265-278` |
| `sensibleFlipMarginYen`, repair labour and cost probes | `balanceProbes.ts:105, 393, 444` |
| The economy approval gate | `economyApprovalGate.test.ts:197, 330` |
| The whole worked example, regenerated | `worked-example-two-cars.md` |

## Definition of done

1. A two-year-old, low-mileage car reads as a tidy car.
2. Cherished and neglected upkeep produce visibly different cars.
3. A project car is rare, and the rate is a signed number rather than an accident.
4. `auctions.test.ts:594` is restored to a meaningful threshold and passes honestly.
5. Damage scales sensibly across tiers without an entry car being wrecked to reach a yen figure.
