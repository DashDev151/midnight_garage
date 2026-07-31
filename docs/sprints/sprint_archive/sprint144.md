# Sprint 144: a build reaches the money

**Status: BUILT AND COMMITTED 2026-07-31 (`abb60f0`). Nothing outstanding.** Second of the sale
value arc.

Design of record: `docs/design/systems/sale-value-system.md` v4, sections 3C and 3D.
Plan: `docs/design/systems/sale-value-implementation-plan.md`.

**This is the highest value-to-effort sprint in the arc.** It delivers the design's central
promise on its own, and because everything imports one valuation function, it reprices auction
reserves, buyouts and the live room with no auction-side code at all.

## The two changes

**Stage C, new: an incoherent build discounts the car.**

    coherenceShortfall = 1 - coherenceFactor
    coherenceDiscount  = coherenceDiscountWeight * coherenceShortfall * tolerance
    stagedValue        = conditionValue * (1 - coherenceDiscount)

**Stage D, changed: parts retention scales with coherence instead of being flat.**

    retention = retentionFloor + (retentionCeiling - retentionFloor) * coherenceFactor

Today `partsRetention` is a flat 0.55 for every build in the game, which is why modifying a car
to sell it loses money whatever you do. A perfectly coherent build now retains 1.10, so it is
worth more than the sum of its parts; an incoherent one retains 0.30.

## Reuse analysis (directive 16)

### Genuinely new

- **One term** in the value stack (the Stage C discount).
- **One curve** replacing one constant (retention).
- **Two lines** in the value ledger.

Nothing else. No new state, no new schema on `CarInstance`, no new parameter on any caller.

### Existing mechanisms reused, unchanged

- **`coherenceFactorFor`** already exists, private, in `packages/sim/src/derivedStats.ts`, fed by
  `supportVerdict` from `support.ts`. **Export it; do not write a second one.** It is a pure
  two-line function reading only a headline and the economy, so consider relocating it somewhere
  both `derivedStats.ts` and `marketValue.ts` can import without widening the existing
  `derivedStats` and `support` mutual import.
- **`marketValueYen`'s existing signature** already carries `model`, `car`, `partsById` and
  `economy`, which is everything `supportVerdict` needs. **No new parameters are required for
  the coherence input.**
- **`valueLedger.ts`**, which decomposes value using the value formula's own atoms and is
  asserted to sum exactly to `marketValueYen`. Extend it; never let it re-derive.
- **`expectationForCar`, `foundationFactor`, `installedPartsValueYen`'s summation loop**, all
  unchanged in shape.

### Must NOT be built

- **A second valuation path.** Sprint 143's duplicate-formula guard exists for this.
- **A per-buyer value function.** See the tolerance ruling below.
- **Any change to Stage A or Stage B.** Discovery confirmed both already ship exactly as the
  design specifies, `beyondDiscount` table included.

## The tolerance ruling, which the design left open

Stage C's discount is per-buyer: the stancer ignores it entirely, the tuner halves it. But
`marketValueYen` is buyer-agnostic and is called by the auction anchor, diagnosis pricing and
the balance probes, none of which have a buyer.

**The ruling: `marketValueYen` gains one optional parameter, `coherenceTolerance`, defaulting to
1.0.** The default is *the market's own view*, not an accident, and the doc comment must say so
in those words. Taste-blind exits, the auction room and every probe get the default and are
correct. Only `valuateCarForBuyer` and `valuateCarForBuyerViaChannel` pass anything else, read
from the buyer.

Rejected: a separate buyer-aware value function, which would be a second value path and would
trip Sprint 143's own guard.

## The levers

**Signed under the standing lever grant recorded as R3 in
`docs/design/systems/sale-value-implementation-plan.md`, and provisional until the maintainer
ratifies it. Every value is the design's own proposal, unchanged.**

| lever | from | to |
| --- | --- | --- |
| `valuation.coherenceDiscountWeight` | new | **0.35** |
| `valuation.retentionFloor` | new | **0.30** |
| `valuation.retentionCeiling` | new | **1.10** |
| `valuation.partsRetention` | 0.55 | **DELETED** |
| `valuation.tolerance.default` | new | **1.0** |
| `valuation.tolerance.stancer` | new | **0.0** |
| `valuation.tolerance.tuner` | new | **0.5** |

`partsRetention` is deleted rather than left inert. A lever that reads live and does nothing is
the worst of the three states, and Sprint 143's retired-identifier ledger gains it.

## Expect large movement, and one invariant that must hold

**The invariant, which is the sprint's own smoke test: a car with no aftermarket parts must be
worth exactly what it is worth today.** Coherence on a stock car is 1.0, so the discount is
zero, and with no non-stock parts the retention curve multiplies nothing. **If a stock car's
value moves at all, something is wrong.** Assert it across all 26 shipped cars before anything
else.

Everything else moves, and substantially:

- A perfectly coherent build's parts premium roughly **doubles** (0.55 to 1.10).
- An incoherent build's premium nearly **halves**, and takes the Stage C discount on top.
- Therefore: valuation pins, sale-price pins, the balance probes (which call `marketValueYen`
  directly), and any story mission whose probe build fits aftermarket parts.

All of it is directive 17 case (a). Re-derive from real runs; never iterate toward a pass.

## Task breakdown

1. **Export the coherence factor** and settle its home without widening the existing
   `derivedStats` and `support` import cycle. Check that `marketValue.ts` does not end up inside
   that cycle transitively.
2. **Stage C**, with the `coherenceTolerance` parameter and its doc comment.
3. **Stage D**, the retention curve, and delete `partsRetention`.
4. **Content and schema**: the seven levers above, with Zod entries. Add `partsRetention` to the
   retired-identifier ledger.
5. **Buyer tolerance**: read it from the buyer in the two buyer-aware valuation functions.
   Sprint 143 has just reshaped `BuyerSchema`, so check its current state rather than assuming.
6. **The value ledger** gains a coherence-discount line and its retention line changes meaning.
   Its sum-to-`marketValueYen` assertion must still hold.
7. **Tests**: the stock-car invariant on all 26; a coherent build worth more than the sum of its
   parts; an incoherent one worth less; the stancer paying no discount where a first-timer does;
   retention monotonic in coherence.
8. **Re-derive** every moved pin, recording old and new.

## Hard constraints

- **A stock car's value must not move.** This is the acceptance gate.
- No change to Stage A or Stage B.
- No second valuation path.
- `pnpm typecheck` before reporting: this deletes a content lever and changes an exported
  signature, so directive 20's carve-out applies.
- `--project content` and `--project game` once each. Never the full sim project.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] Stock cars value identically to before, all 26, asserted.
- [x] Stage C discounts an incoherent build, at the market's tolerance by default.
- [x] The stancer is exempt and the tuner is halved, asserted against a first-timer.
- [x] Retention scales 0.30 to 1.10 with coherence, monotonically, asserted.
- [x] A perfectly coherent build is worth more than the sum of its parts.
- [x] `partsRetention` is deleted and in the retired-identifier ledger.
- [x] The value ledger carries both changes and still sums exactly to `marketValueYen`.
- [x] Auction reserves, buyouts and the room read move with no auction-side code change.
- [x] Every moved pin re-derived from a real run, old and new recorded (none moved - see Exit).
- [x] Typecheck, content and game all pass, output shown.

## Exit

**Status: all eight tasks complete, definition of done fully satisfied. Stock-car
invariant holds exactly; every other existing pin in the codebase (mission payouts,
budget caps, balance probes, auction/bidding/selling tests) held unchanged too - the
sprint's own predicted "large movement" did not land on any SHIPPED pin, for a
mechanical reason recorded below, not because the mechanism is inert.**

### Task 1: exported `coherenceFactorFor`

Exported directly from `derivedStats.ts` with no relocation. Checked the import
graph before touching anything: `marketValue.ts` did not previously import
`derivedStats.ts` or `support.ts`, and neither of those (nor anything they import -
`bands.ts`, `performance.ts`, `bodyPipeline.ts`, `crewSkills.ts`, `context.ts`)
imports `marketValue.ts` back, so `marketValue.ts` importing `coherenceFactorFor`
(from `derivedStats.ts`) and `supportVerdict` (from `support.ts`) introduces no
cycle. `pnpm typecheck` confirms this (no circular-reference errors anywhere).

### Task 2: Stage C

`marketValueYen` (`packages/sim/src/marketValue.ts`) gained one optional
seventh parameter, `coherenceTolerance = 1.0`, doc-commented as "the market's
own view, not an accident." `stagedValue = Math.round(baseValue * (1 -
coherenceDiscountWeight * (1 - coherenceFactor) * coherenceTolerance))`, computed
from `coherenceFactorFor(supportVerdict(car, model, partsById, economy).headline,
economy)` - the exact function reliability already reads, never a second one.

### Task 3: Stage D

New exported `retentionFor(coherenceFactor, economy)` in `marketValue.ts`:
`retentionFloor + (retentionCeiling - retentionFloor) * coherenceFactor`.
`installedPartsValueYen` now takes `retention: number` as its fourth parameter
instead of reading `economy.valuation.partsRetention` - its summation loop is
otherwise byte-for-byte unchanged (per the reuse analysis). `partsRetention`
deleted from the schema and from `economy.json`, not left inert.

### Task 4: content and schema

Seven levers added to `EconomyConfigSchema`'s `valuation` block
(`packages/content/src/economy.ts`) and `economy.json`, all exactly the signed
values: `coherenceDiscountWeight` 0.35, `retentionFloor` 0.30, `retentionCeiling`
1.10, `tolerance.default` 1.0, `tolerance.stancer` 0.0, `tolerance.tuner` 0.5, and
`partsRetention` deleted. Added a defensive `.refine` (`retentionFloor <=
retentionCeiling`), matching this schema's existing style for paired bounds.
`partsRetention` added to `retiredIdentifiers.test.ts`'s ledger (sprint 144, two
real hits found and fixed: a doc-comment mention each in `economy.ts` and
`marketValue.ts`, reworded to describe the replacement rather than naming the dead
key, same pattern Sprint 143 used for its own D3 rename).

### Task 5: buyer tolerance

New `coherenceToleranceFor(buyer, economy)` in `valuation.ts`, checked against
Sprint 143's reshaped `BuyerSchema` before writing it (confirmed `archetype` is
still the field to key on). Only `valuateCarForBuyer` and
`valuateCarForBuyerViaChannel` call it; every other `marketValueYen` caller
(the auction anchor, diagnosis pricing, the balance probes, taste-blind exits)
is untouched and reads the function's own 1.0 default.

### Task 6: the value ledger

`valueLedger.ts` gained one new line id, `'coherence'` (Stage C's discount,
pushed as a checkpoint only when it is nonzero - a stock or fully-coherent car's
ledger carries no such line, matching the stock-car invariant at the line-item
level too), and the existing `'aftermarket'` line's retention now comes from the
same `retentionFor` call `marketValueYen` makes, not a re-derivation. The
sum-to-`marketValueYen` assertion (`valueLedger.test.ts`) still passes across
every roster model's worst-case car, softened and raw, at multiple heats, AND
across 5 seeds x 26 models x 3 heats of REALLY GENERATED lots (aftermarket rolls
included) - 390 real cases, unchanged. Added one new test asserting the
`'coherence'` line appears (negative) on an incoherent build and is absent on a
coherent one.

### Task 7: tests

New file `packages/sim/tests/coherenceValuation.test.ts` (8 tests): `retentionFor`
hits its floor/ceiling exactly and is monotonic; a fully supported build (headline
0.966+, capped `coherenceFactor` 1) credits MORE than its parts' raw catalog price
(measured: 2,922,260 credited against 2,656,600 raw - exactly the 1.10 ceiling,
since this fixture's foundation and tier factors are both 1); a bare race turbo
with no supporting mods (headline 0.699, `coherenceFactor` 0.604) credits LESS
(412,322 against 526,500 raw - retention 0.783); Stage C's discount is felt at
default tolerance and absent at zero tolerance on the same two builds; and the
stancer/tuner/first-timer ordering (task 5's wiring) holds on an incoherent car
with three synthetic buyers sharing identical `statWeights` so only tolerance
differs. New file `packages/sim/tests/stockCarValuationInvariant.test.ts` is the
sprint's own acceptance gate (below).

### Task 8: re-derive moved pins

**Nothing moved.** Checked, not assumed: `content 529/529` and `game 833/833`
both pass unchanged, and every named sim test file that calls `marketValueYen`
directly - `balanceProbes.test.ts`, `storyMissionProbes.test.ts`,
`valueModelProbes.test.ts`, `bidding.test.ts`, `auctions.test.ts`,
`selling.test.ts`, `diagnosis.test.ts`, `diagnosisRouteProbes.test.ts`,
`diagnosisFlows.test.ts`, `carLedger.test.ts`, `carCondition.test.ts` - passes
with the SAME numbers, no pin edited anywhere in any of them. The mission
payout/budget-cap table in `economyApprovalGate.test.ts` is untouched byte for
byte.

The reason, verified rather than assumed: coherence reads fitted GRADE only,
never band (`support.ts`), so `coherenceFactor` is exactly 1.0 on any all-stock
car regardless of condition. Every `balanceProbes.ts` probe car
(`buildWorstCaseRawCar`, `buildRoughProbeCar`, the donor/symptom clean cars) is
built via `stockInstanceFor` - all-stock, real generation-grade parts only - so
Stage C/D are no-ops on every one of them. The one shipped story mission whose
probe fits real aftermarket parts, `street-power-street-manners`, fits a matched,
supported build measured at headline 0.966 in Sprint 136's own amendment record -
above the 0.90 adequate knee, so its `coherenceFactor` is also exactly 1 (capped),
identical to a stock car's. Only `economy.json`'s approval-gate hash moved, because
four keys were added and one deleted; re-pinned in the same change with the
complete seven-lever ledger comment.

This is not evidence the mechanism is inert - `coherenceValuation.test.ts` proves
it moves real numbers by roughly the factor the sprint doc predicted (the ceiling
credits 1.10x raw parts price, the measured incoherent example 0.78x) - it means
the SHIPPED content (26 cars, their auction rolls, and the one story mission that
touches aftermarket parts) happens to never construct a build the sprint doc's
own coherence mechanism discounts. A genuinely incoherent SHIPPED build (a player
fitting a bare turbo with nothing supporting it) will feel exactly what
`coherenceValuation.test.ts` measures the moment it is built - there was simply
no such build already pinned in a test or a mission before this sprint ran.

One nuance worth recording: the measured "dangerous" example (coherenceFactor
0.604, retention 0.783) actually credits MORE than the old flat 0.55 would have
(0.783 x 526,500 = 412,322 against the old 0.55 x 526,500 = 289,575). Only a build
whose coherenceFactor falls below (0.55 - 0.30) / 0.80 = 0.3125 loses relative to
the old flat rate; a fully unsupported, heavily-demanding build (stacking several
unsupported gain parts rather than one) reaches that. The headline promise - "a
coherent build is worth more than the sum of its parts, an incoherent one worth
less" - is about the NEW curve's own two ends (1.10 vs 0.30), not about every
point on it beating the old flat constant; `coherenceValuation.test.ts`'s own
assertions are against the sum of parts (the design's stated bar), not against
the retired 0.55.

### Auction-side confirmation

`bidding.ts`, `auctions.ts` and `selling.ts` were not opened for editing this
sprint (confirmed by `git status`: zero diff in any of the three). All three
import `marketValueYen`/`valuateCarForBuyer` and now automatically read the new
Stage C/D behaviour with no code change of their own, exactly as the design
promised. `valueLedger.test.ts`'s "really generated lots (aftermarket rolls
included)" test is independent proof this reaches real auction-generated cars:
390 cases (5 seeds x 26 models x 3 heats) of lots rolled through the real
generation pipeline, including whatever aftermarket parts happened to roll, all
still summing exactly to `marketValueYen` after Stage C/D landed.

### Checks

`pnpm typecheck`: **PASS**, all three packages (content `tsc`, sim `tsc`, game
`vue-tsc`), run after every change including the two comment-hygiene fixes below.

`pnpm test --project content`: **529 passed, 529 total, 24 files, all green**
(two real findings fixed along the way - see below).

`pnpm test --project game`: **833 passed, 833 total, 62 files, all green**,
unchanged from before this sprint.

Additionally (directive 20's narrow carve-out, named files, never the full sim
project): `stockCarValuationInvariant.test.ts`, `coherenceValuation.test.ts`,
`marketValue.test.ts`, `valueLedger.test.ts`, `valuation.test.ts`,
`valueModelProbes.test.ts`, `balanceProbes.test.ts`, `bidding.test.ts`,
`selling.test.ts`, `requirements.test.ts`, `plays.test.ts`,
`diagnosisFlows.test.ts`, `storyMissionProbes.test.ts`, `auctions.test.ts`,
`diagnosis.test.ts`, `diagnosisRouteProbes.test.ts`, `carLedger.test.ts`,
`carCondition.test.ts` - all green, all pass counts unchanged from before this
sprint except the two new files.

**Two real findings along the way, both fixed, neither an economy-lever
question:**

1. `commentHygieneGuard.test.ts` caught four comments in new test files literally
   naming "Sprint 144" - reworded to describe current behaviour instead (the same
   directive 10 rule Sprint 143 applied to its own D3 rename).
2. `retiredIdentifiers.test.ts` caught two doc-comment mentions of the literal
   `partsRetention` name (`economy.ts`, `marketValue.ts`) the moment the ledger
   entry was added - reworded to describe the replacement rather than reciting
   the dead key, same pattern as Sprint 143's `statModifiers.power`/
   `reliabilityCap` fix.

### Outstanding

None. All hard constraints held: no Stage A/B change, no second valuation path
(`duplicateFormulaBan.test.ts` passed clean as part of the `--project content`
run above with its exemption list untouched - still just `marketValue.ts` -
confirming nothing in this sprint's diff combines `bookValueYen` with
`mileageFactor(`), stock-car value provably unmoved.
