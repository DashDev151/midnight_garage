# Sprint 137: the forced-induction return curve

**Status: SIGNED 2026-07-29, ready to implement once the gate opens.**
**HARD GATE: Sprint 136 must have shipped and be green before any work starts here.**

Fourth of nine in the tuning overhaul arc. **This is a small sprint: one category's power curve
and its matching price ladder.** It is separate only because it is the one shape that is
dangerous on its own.

## Sign-off record (directive 22)

**Maintainer, 2026-07-29: both levers approved, and they are approved as a pair.** The ruling
that produced them: *"the final race turbo can be a larger jump but that does not mean it should
be a better buy, that is how you get monotony, why would you ever then install smaller ones. If
that means that the part cost needs to be adjusted then so be it."*

| lever | what | signed as |
| --- | --- | --- |
| 1 | the `forcedInduction` power curve | increasing, **0.20 / 0.45 / 1.00** |
| 2 | the `forcedInduction` price ladder | **1.30 / 2.93 / 6.50** |

**Neither ships without the other.** Lever 1 alone makes the race turbo 2.17 times better value
per horsepower than the street one, which is the monotony the ruling names. Lever 2 alone prices
a linear curve as though it were increasing. **If for any reason only one can land, land
neither** and hand it back.

Design reference: `docs/design/systems/tuning-system.md` sections 5e and 17 (constraint A).

## Why this is its own sprint, and why the gate is not advisory

Sprint 135 authored the final grade shape for every power category **except forced induction**:
block, internals and cams linear; head mildly diminishing; exhaust diminishing; intake strongly
diminishing; ECU threshold-shaped. Those seven are harmless and they landed once.

**Forced induction is the exception, because design 5e wants it *increasing*, and increasing
returns on forced induction is not an anti-dominance mechanism. On its own it is the opposite:**
it creates a new dominant strategy for any player rich enough to buy the biggest turbo and
ignore everything else.

**What makes it safe is the support cost rising alongside it.** A larger turbo demands
proportionally more of every subsystem, so the expensive path pays only if the player commits to
all of it, and ruins them if they commit halfway.

**If Sprint 136 has not shipped, this sprint does not open.** There is no partial version, and
there is nothing else here that could ship without it.

## The gap, stated plainly

`forcedInduction` currently carries a **linear** shape (street 0.33, sport 0.67, race 1.00),
authored deliberately in Sprint 135 as the safe placeholder. So in the model a bigger turbo is
more of the same thing.

It is not. A bigger turbo is a categorically more capable part: a step change in what the engine
can be, rather than a proportional increment. That is what the curve should say, and it is what
makes the expensive path worth committing to.

## Reuse analysis (directive 16)

### Genuinely new

**Nothing.** Two numbers move in `parts.json`, per character. No schema, no sim function, no
screen.

### Existing mechanisms reused, unchanged

- **`statModifiers.powerFraction[character]`**, authored in Sprint 135. Only `forcedInduction`'s
  street and sport values move; its race value and every other slot are untouched.
- **The support ratios** from Sprint 136, which are what make this safe and which need no change
  to do their job.

## The levers (SIGNED 2026-07-29, directive 22)

### Lever 1: the forced-induction grade shape

Street and sport as a fraction of the race value, which does not move.

| slot | curve | street | sport | race |
| --- | --- | ---: | ---: | ---: |
| forcedInduction | **increasing** | **0.20** | **0.45** | 1.00 |
| | *current, from Sprint 135* | *0.33* | *0.67* | *1.00* |

**"Increasing" is a property, not three numbers**, and the property is what to assert: each step
up the ladder must deliver more than the step below it. At 0.20 and 0.45 the three increments
are 0.20, 0.25 and 0.55, which satisfies it with room.

Authored values are Lever 1 times each character's race fraction, to three decimal places:

| character | race fraction | street | sport |
| --- | ---: | ---: | ---: |
| high-strung NA | 0.20 | 0.040 | 0.090 |
| lazy NA | 0.28 | 0.056 | 0.126 |
| forced | 0.35 | 0.070 | 0.158 |

### Lever 2: the forced-induction price ladder

Sprint 135 made `partPricing.gradeFactors` a per-slot map with `1 / 1.3 / 2 / 3` as the default,
and gave `ignitionEcu` its own entry. **`forcedInduction` deliberately kept the default there**,
because its curve was still linear and the default is near flat against a linear curve. Lever 1
makes the curve increasing, so the ladder has to move in the same sprint.

| slot | stock | street | sport | race |
| --- | ---: | ---: | ---: | ---: |
| **forcedInduction** | 1.00 | **1.30** | **2.93** | **6.50** |

Derived so price tracks power exactly: `1.30/0.20 = 2.925/0.45 = 6.50/1.00 = 6.50`. Yen per
horsepower is then flat across the three rungs, which is what makes a street turbo a legitimate
purchase for a player who cannot reach the top rung rather than a trap.

**The street rung is pinned and the top is raised, not the reverse.** Cutting street to 0.60 to
flatten the ladder downward would put the street turbo below the stock forced-induction part and
break both Sprint 132 catalogue invariants. Raising the top is also the period-correct direction:
a single-turbo conversion kit was never 2.3 times a bolt-on.

What it does to the money, on a flagship car (`classFactor` 0.9, `baseCostYen` 90,000):

| grade | price now | price after | power on a Supra | yen per PS |
| --- | ---: | ---: | ---: | ---: |
| street | 105,300 | **105,300** | +22.7 PS | 4,643 |
| sport | 162,000 | **236,900** | +51.0 PS | 4,643 |
| race | 243,000 | **526,500** | +113.4 PS | 4,643 |

**The maximal race engine build on a Supra goes from ¥1,420,200 to ¥1,846,500**, counting Sprint
135's ECU ladder as well, for the same 632 PS. That is the single largest price movement in the
arc and it is deliberate: full commitment should be expensive, which is what makes Sprint 136's
support cost a real decision rather than an obvious one.

## Task breakdown

### Task 1: re-author the power curve (Lever 1)

`packages/content/data/parts.json`: the `forcedInduction` slot's `street` and `sport` values,
for all three characters, to the figures above. **The race values do not change and no other
slot is touched.**

### Task 1b: author the price ladder (Lever 2)

`packages/content/data/partPricing.json`: add a `forcedInduction` entry to the per-slot
`gradeFactors` map Sprint 135 created, at `1 / 1.30 / 2.93 / 6.50`. **No other slot's entry
moves and the default is untouched.**

**Both halves land in the same commit.** The sign-off record above says why: either alone is a
worse state than neither.

### Task 2: tests

Extend the file Sprint 135 pinned its grade shapes in:

1. **The increasing property.** For each character, the sport-to-street increment strictly
   exceeds the street-to-stock increment, and the race-to-sport increment strictly exceeds the
   sport-to-street one. **Assert the property, not the three numbers.**
2. **Forced induction is the only increasing category.** Every other slot's shape is unchanged
   from Sprint 135 and remains linear or diminishing. This is the test that catches an
   accidental edit to a neighbouring row.
3. **Race totals unmoved.** Every character's maximal build reaches exactly the multiple Sprint
   135 pinned: x1.43 high-strung NA, x1.57 lazy NA, x1.95 forced. If this fails, a race value
   was touched.

### Task 3: the anti-dominance acceptance tests

**Acceptance 1: a maximal forced-induction build with no supporting parts has a collapsed
headline support ratio.** Sprint 136 already produces 0.588 for exactly that build, so this pins
the interaction rather than discovering it. Assert `dangerous` and `cylinderPressure`.

**Acceptance 2, part one: climbing the turbo ladder never improves value per yen.** With Lever 2
authored, `priceYen / powerGained` must be equal across street, sport and race, within the
rounding `resolvePartPriceYen` applies, on every fitment class and every character. **This is the
half an earlier draft of this doc was missing**, and it is the property the maintainer's ruling
is actually about. Sprint 135 introduced the same assertion as a catalogue-wide rule; this
sprint's job is to keep `forcedInduction` inside it while its curve becomes the steepest in the
game.

**Acceptance 2, part two: no single category is the best power-per-yen at every rung.** Build a
table of `powerFraction / priceYen` per slot per grade per character from the real catalogue
prices, and assert the winning slot is **not the same at all three rungs**. Cross-category, where
part one is within-category; both are needed and neither implies the other.

**If either part fails, execution ENDS and the table goes to the maintainer.** The fix would be a
price move or a further curve move, and both are levers under directive 22. **Do not tune the
curve until the test passes**; that is exactly the iterate-toward-a-pass directive 17 forbids.
Report the measured table either way, so the decision is made on numbers.

### Task 4: checks

```text
pnpm test --project content
pnpm test --project sim
```

`harnessAcceptance.test.ts` passes untouched: stock cars carry no power SKUs.

**Auction-demo warning (2026-07-30, standing rule across this arc):** if this sprint moves any part
price or bill threshold, `enforceMinWorkBill` (`packages/sim/src/auctions.ts` ~370-413) draws a
different number of PRNG steps and reshuffles every later lot in a seeded catalogue -
`packages/game/src/screens/auctionRoom.test.ts`, `auctionRoomDemo.test.ts` and
`AuctionRoomDemoScreen.test.ts` must be re-derived from a fresh seeded run, and
`pnpm test --project game` must be run before this sprint is called done.

### Task 5: re-derive whatever moved

Directive 17 case (a). Three things move and all three are expected:

1. **Any pinned build using a street or sport turbo**, on power and therefore on lap time.
2. **Any pinned price for a sport or race turbo**, and every build cost that contains one.
3. **`partPricing.json`'s sha256 guard in `economyApprovalGate.test.ts`**, added in Sprint 132.
   Re-pin the hash and extend the ledger comment with the `forcedInduction` ladder, in the same
   change as the recorded sign-off.

`statFormulas` does not move, so the `economy.json` half of that gate stays where Sprint 136 left
it.

## Hard constraints

- **Sprint 136 shipped and green, or this sprint does not open.**
- **No unlisted lever.** The two signed above are the whole of it: no other slot's power values
  and no other slot's price ladder.
- **Race power values do not move.** Only the price of the race turbo does.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Sprint 136 shipped and green, recorded here with its commit.
- [ ] Levers 1 and 2 recorded, and landed in the same commit as each other.
- [ ] `forcedInduction` street and sport re-authored for all three characters.
- [ ] The `forcedInduction` price ladder authored; no other slot's entry moved.
- [ ] The increasing property asserted as a property, for each character.
- [ ] Every other category's power shape provably unchanged from Sprint 135.
- [ ] Race power totals provably unmoved (x1.43, x1.57, x1.95).
- [ ] Value per yen flat across the turbo ladder, every class and character (acceptance 2a).
- [ ] No slot is the best power-per-yen at all three rungs (acceptance 2b).
- [ ] A maximal unsupported turbo build reads `dangerous` on `cylinderPressure` and its
      reliability collapses accordingly.
- [ ] The power-per-yen table measured and reported either way; execution stopped and the table
      handed over if either acceptance failed.
- [ ] `partPricing.json` hash and ledger re-pinned with the sign-off.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
