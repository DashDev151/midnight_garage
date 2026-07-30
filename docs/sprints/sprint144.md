# Sprint 144: a build reaches the money

**Status: READY TO IMPLEMENT once Sprint 143 has landed. Second of the sale value arc.**

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

**Signed under the maintainer's standing authority of 2026-07-30, to be reviewed on their
return. Every value is the design's own proposal, unchanged.**

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

- [ ] Stock cars value identically to before, all 26, asserted.
- [ ] Stage C discounts an incoherent build, at the market's tolerance by default.
- [ ] The stancer is exempt and the tuner is halved, asserted against a first-timer.
- [ ] Retention scales 0.30 to 1.10 with coherence, monotonically, asserted.
- [ ] A perfectly coherent build is worth more than the sum of its parts.
- [ ] `partsRetention` is deleted and in the retired-identifier ledger.
- [ ] The value ledger carries both changes and still sums exactly to `marketValueYen`.
- [ ] Auction reserves, buyouts and the room read move with no auction-side code change.
- [ ] Every moved pin re-derived from a real run, old and new recorded.
- [ ] Typecheck, content and game all pass, output shown.

## Exit

_To be completed at the end of the sprint._
