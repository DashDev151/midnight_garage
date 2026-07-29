# Sprint 134: condition reaches the build

**Status: READY TO IMPLEMENT. No sign-off required, because this sprint moves no economy
value.** First of nine in the tuning overhaul arc (`docs/sprints/tuning-arc.md`).

Design reference: `docs/design/systems/tuning-system.md` sections 1d and 10.

**This is a defect, not a feature.** Section 1d of the design doc is the only part of that
document describing shipped code rather than a proposal.

## The defect, stated plainly

`computeDerivedStats` in `packages/sim/src/derivedStats.ts` scales every `statModifiers`
value by `bandFactor(installed.band, economy)` before adding it. Forty lines above it, in
the same file, `buildFactors` reads a part's id, resolves its `physicalModifiers`, and
multiplies grip, braking and mass **without ever reading `installed.band`**.

```text
factors.grip *= modifiers.grip
factors.braking *= modifiers.braking
factors.mass *= modifiers.mass
```

So a `scrap` race coilover delivers the identical 1.029 grip multiplier as a mint one, and
a destroyed big brake kit brakes like new. **Two parallel modifier systems, and only one
respects condition.**

Sprint 129 put condition into the physics through `physicalConditionFactors` and did it
correctly. Sprint 130 added `physicalModifiers` and did not wire condition into them. This
sprint closes that gap, and nothing else.

## Reuse analysis (directive 16)

### Genuinely new

**Nothing.** That is the correct answer here and it should not be dressed up. The fix is to
call an existing function from a function that already sits beside it in the same file.

### Existing mechanisms reused, unchanged

- **`bandFactor(band, economy)`** (`packages/sim/src/bands.ts`), the exact function
  `computeDerivedStats` already applies to `statModifiers` eleven lines below the call site
  being added. **Do not introduce a second curve.** Grade sensitivity is design section 10
  and lands in Sprint 142.
- **`BuildFactors` and `STOCK_BUILD_FACTORS`** (`packages/sim/src/performance.ts`),
  unchanged in shape.
- **The band vocabulary** (`scrap` through `mint`), unchanged.
- **The economy config threading.** `computeDerivedStats` and `lapTimeSecondsFor` already
  hold an `EconomyConfig`; `buildFactors` gains it as a parameter rather than importing a
  second source of the same constants.

## The mechanism

`buildFactors` gains an `economy: EconomyConfig` parameter and scales each modifier by the
installed part's band:

```text
wear = bandFactor(installed.band, economy)
effective = 1 + (modifier - 1) * wear
```

**The interpolation runs toward 1.0, not toward 0, and this is the one place the sign can
be got wrong.** A `physicalModifier` is a multiplier around unity: 1.029 means "2.9 per
cent better than stock". A worn part must deliver *less of its advantage*, not less grip
than a bare hub.

| band | `bandFactor` | a 1.029 grip part delivers | a 0.979 mass part delivers |
| --- | ---: | ---: | ---: |
| mint | 1.00 | 1.0290 | 0.9790 |
| fine | 0.85 | 1.0247 | 0.9821 |
| worn | 0.65 | 1.0189 | 0.9863 |
| poor | 0.40 | 1.0116 | 0.9916 |
| scrap | 0.15 | 1.0044 | 0.9969 |

At mint, `bandFactor` is 1.0 and `effective` equals the modifier exactly, so **a mint build
produces byte-identical factors to today**. At scrap a race coilover still delivers 1.0044,
which is correct: a knackered coilover is a bad coilover, not an absent one. Parts that are
genuinely absent are already handled by `scrapDisablesCar` and `isPartMissing`.

`physicalModifiers.mass` is below 1 (a lighter part is 0.979), and because `modifier - 1`
is negative the same formula correctly pulls it back toward 1.0 as it wears. **A worn
lightweight part saves less weight; it never adds weight over stock.**

## Task breakdown

All tasks are Claude-implementable. No user-only tasks, no purchases, no data-air-gap steps.

### Task 1: change the signature and the body

`packages/sim/src/derivedStats.ts`, `buildFactors`:

1. Add a third parameter `economy: EconomyConfig`. `EconomyConfig` is already imported at
   the top of the file; no new import is needed.
2. Inside the loop, after the `if (!modifiers) continue` guard, compute
   `const wear = bandFactor(installed.band, economy)`. `bandFactor` is already imported
   from `./bands` on line 13; no new import is needed.
3. Replace the three multiplications with the interpolated form above.

### Task 2: update the three call sites

There are exactly three in source, and no others exist:

| file | call site |
| --- | --- |
| `packages/sim/src/derivedStats.ts` | inside `computeDerivedStats`, which already has `economy` in scope as a parameter |
| `packages/sim/src/lapModel.ts` | inside `lapTimeSecondsFor`, pass `context.economy` |
| `packages/game/src/screens/dev/sandboxModel.ts` | inside `evaluateBuild`, which already has `economy` in scope |

Three test files also call it and are covered by Task 4:
`packages/sim/tests/aftermarketPhysics.test.ts`,
`packages/game/src/stores/gameStore.garage.test.ts`,
`packages/game/src/stores/gameStore.market.test.ts`.

### Task 3: update the doc comment

`buildFactors`'s doc comment currently says the factors are "the product of every installed
SKU's own `physicalModifiers`". State that each is first scaled by its own installed band,
state the interpolation-toward-1.0 rule and why, and note that the sub-1 mass case falls
out of the same expression. **Document what the code does, not that it was changed**
(directive 10, and the standing no-process-narrative rule). Do not write a dated note.

### Task 4: tests

`packages/sim/tests/aftermarketPhysics.test.ts` is the right home; it already exercises
`buildFactors`. Add:

1. **The mint identity.** A build with every aftermarket part at `mint` returns factors
   strictly equal (`toBe`, not `toBeCloseTo`) to the raw product of the SKUs'
   `physicalModifiers`. This is the property that keeps the calibration untouched.
2. **Grip degrades toward stock.** A `scrap` race coilover delivers strictly less grip than
   the same part at `mint`, and strictly more than 1.0.
3. **Mass degrades toward stock.** A `scrap` lightweight part delivers strictly less mass
   saving than the same part at `mint`, and its factor is strictly less than 1.0 and
   strictly greater than the mint factor. **This is the sign-error test; write it
   explicitly rather than relying on the grip case.**
4. **The five-band pin.** One grip part and one mass part, pinned at all five bands to the
   values in the table above. Use the real SKU values from the catalogue, not invented
   ones, and derive the expected numbers from the formula rather than from a run.
5. **Monotonicity.** For a single part, the delivered advantage is non-increasing as the
   band worsens, across all five bands.

### Task 5: run the checks

Per directive 20, run the narrowest check that answers the question, once:

```text
pnpm test --project sim
```

Then, because the game package's store tests call `buildFactors`:

```text
pnpm test --project game
```

**Do not run the full suite "to be safe" and do not run `pnpm test:coverage`.** The
pre-push hook is the gate.

**`packages/sim/tests/harnessAcceptance.test.ts` must pass untouched.** Every shipped car
in that harness is evaluated at mint, so if it fails, the interpolation is wrong. **Fix the
code, never the test.**

### Task 6: re-derive whatever moved

Any car carrying non-mint aftermarket parts changes its physics, so its lap time, its
handling readout and therefore its taste-adjusted price move. Expect pins to move in:

- `packages/sim/tests/advanceDay.test.ts`, the acquisition-to-sale state hash. Its own
  comment states the rule: re-derive from a real run whenever the derived stats
  deliberately change.
- Any auction-room or valuation pin that reads a generated car's stats.

**Directive 17 governs and this is case (a): the implementation intentionally changed what
is correct.** For every pin: re-derive it from a real run, record the old value, the new
value, and the reason. **Never iterate a number toward a pass. Never loosen a threshold.**

`packages/content/tests/economyApprovalGate.test.ts` must **not** move. This sprint touches
no economy value; if that gate fails, something has gone wrong.

## Hard constraints

- **No economy value moves.** Nothing in `packages/content/data/economy.json`, no pricing,
  no payout, no labour formula, no part price (directive 22).
- **No second condition curve.** Grade sensitivity is Sprint 142.
- **No commit.** Leave the work in the tree and report; commits need explicit permission.
- No em dashes, no emoji, British spelling in all prose, no process-narrative comments.

## Definition of done

- [ ] `buildFactors` scales every physical modifier by the installed band via `bandFactor`.
- [ ] All three source call sites and three test call sites pass `economy`.
- [ ] A mint build produces byte-identical factors to before the change, proved by a strict
      equality test and by `harnessAcceptance.test.ts` passing unchanged.
- [ ] A `scrap` grip part delivers less than mint and more than stock.
- [ ] A `scrap` mass part saves less weight than mint and never more mass than stock, proved
      by its own test.
- [ ] The five-band shape is pinned for one grip part and one mass part.
- [ ] `pnpm test --project sim` and `pnpm test --project game` pass, output shown.
- [ ] Every moved pin re-derived from a real run, with old and new values recorded below.
- [ ] `economyApprovalGate.test.ts` unmoved.

## Exit

_To be completed at the end of the sprint._
