# Sprint 137: the forced-induction return curve

**Status: AWAITING SIGN-OFF, then ready to implement.**
**HARD GATE: Sprint 136 must have shipped and be green before any work starts here.**

Fourth of nine in the tuning overhaul arc. **This is a small sprint: one category's curve, two
numbers.** It is separate only because it is the one shape that is dangerous on its own.

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

## The lever (UNAPPROVED, directive 22)

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

## Task breakdown

### Task 1: re-author

`packages/content/data/parts.json`: the `forcedInduction` slot's `street` and `sport` values,
for all three characters, to the figures above. **The race values do not change and no other
slot is touched.**

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

**Acceptance 2: no single category is the best power-per-yen at every rung.** Build a table of
`powerFraction / priceYen` per slot per grade per character from the real catalogue prices, and
assert that the winning slot is **not the same at all three rungs**. This is the sprint's real
acceptance criterion and it is a **measurement**, not an assertion of a number chosen in
advance.

**If acceptance 2 fails, execution ENDS and the table goes to the maintainer.** The fix would be
a price move or a further curve move, and both are levers under directive 22. **Do not tune the
curve until the test passes**; that is exactly the iterate-toward-a-pass directive 17 forbids.
Report the measured table either way, so the decision is made on numbers.

### Task 4: checks

```text
pnpm test --project content
pnpm test --project sim
```

`harnessAcceptance.test.ts` passes untouched: stock cars carry no power SKUs.

### Task 5: re-derive whatever moved

Directive 17 case (a). Any pinned build using a street or sport turbo moves.
`economyApprovalGate.test.ts` does **not** move: this sprint changes `parts.json`, not
`economy.json`. If a parts-content guard test exists, re-pin it in the same change as the
recorded sign-off.

## Hard constraints

- **Sprint 136 shipped and green, or this sprint does not open.**
- **No unlisted lever.** No price moves here.
- **Race values do not move, and no other slot is touched.**
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Sprint 136 shipped and green, recorded here with its commit.
- [ ] Lever 1 signed and recorded in this doc.
- [ ] `forcedInduction` street and sport re-authored for all three characters.
- [ ] The increasing property asserted as a property, for each character.
- [ ] Every other category's shape provably unchanged from Sprint 135.
- [ ] Race totals provably unmoved (x1.43, x1.57, x1.95).
- [ ] A maximal unsupported turbo build reads `dangerous` on `cylinderPressure`.
- [ ] The power-per-yen table measured and reported; acceptance 2 passed, or execution stopped
      and the table handed over.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
