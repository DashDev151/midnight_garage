# Sprint 184: the customer decides whether you did well

**Status: PLANNED. Nothing implemented. Blocked on sprint 182.**

Design of record: `docs/design/progression-bible.md`, fifth amendment (2026-08-05).

## Goal

Reputation currently reads the car's condition bands at the moment of sale and calls that
craftsmanship. It should read **whether the person who bought it got what they came for**, and
nothing else.

## What is wrong today, in numbers

- **A clean sale pays 2.** A tier-1 service job pays 4 to 6. A tier-4 job with a race part fitted
  pays up to **75**. Missions pay 15 to 60, and legend is 1400. So the reputation ladder is a
  service business that happens to gate a car business, and **selling cars barely contributes to
  it at all**.
- **The only +4 in the game is unreachable for any builder.** Concours needs 85 of 100 authenticity
  points; an aftermarket block alone costs 18, a kit and wheels together 17. A tuner shop, a show
  shop and a racing shop are all structurally capped at +2 however good their work is.
- **Condition is the wrong instrument.** Selling a rough-engined show car to the Show Crowd is
  honest work: their reliability importance is exactly 0 and they never asked. Selling the same car
  to a Daily Driver is a broken promise. Today both read identically.

## Reuse analysis (directive 16)

**New mechanisms: one predicate, and it is small.**

- **`saleOutcomeFor(buyer, car)`**, returning `satisfied` / `delighted` / `nothing`. Satisfied is
  the buyer's champion stat cleared, which is exactly the gate sprint 182 builds, so this reads
  `championStatFor` and the same target lookup. Delighted is every stat with non-zero importance
  cleared.

**Existing mechanisms reused:**

- **`applyReputationDelta` (reputation.ts) is the single mutation point** and does not change.
  Only what computes the delta changes.
- **`championStatFor` and the target lookup** come from sprint 182 rather than being written again.
- **Service jobs and missions keep their own reputation paths untouched.** Their values are
  rebalanced; their mechanism is not.
- **The day-log `car-sold` entry already carries `reputationDelta` and `saleQuality`.** The quality
  vocabulary changes from lemon/clean/concours to the new outcomes; the entry shape does not.

**Deleted, not migrated (directive 19):**

- `saleReputationDeltaFor` and `saleQualityFor` (carCondition.ts), the whole lemon/clean/concours
  predicate.
- `economy.reputation.cleanSaleMinBand`, `cleanSaleBonus`, `concoursSaleMinAuthenticityPercent`,
  `concoursSaleBonus`, `lemonSalePenalty`, `lemonMaxAverageBandFactor`.
- The separate `matchedSaleRepBonus`, which is absorbed: a matched sale IS the reputation event now
  rather than a bonus stacked on a condition verdict.

## RULED: reputation is fully monotonic (maintainer, 2026-08-05)

**Option (a): nothing in the game ever lowers reputation.** A disappointed buyer pays nothing
rather than taking anything away.

The full consequence, accepted deliberately rather than discovered: **there is no longer any act a
player can commit that costs reputation.** `reputation.lemonSalePenalty` (-8) goes with the lemon
predicate, and `SERVICE_JOB_FAILURE_REP_MULTIPLIER` (2x the job's base for handing a job back
unfinished or overdue) goes with it under the same reading. Strictly law-6 compliant, and it
removes the only downward pressure the progression system had.

**Logged in `TODO.md` for investigation in play**, not left as an assumption: whether the ladder
still has tension without a penalty, and whether monotonic reputation reads as generous or as
weightless.

**The alternative, kept here in case play says it is wanted:** (b) sales never fall because the
buyer chose the car, but breaking a commitment the player accepted still does. Not built. Do not
implement it without a fresh ruling.

## Levers (directive 22)

**Values not proposed yet, deliberately.** The direction is signed ("a good car sale should
out-earn a standard service job") and the specific numbers are not, because they should be set
against the measured frequency of a satisfied sale, which sprint 183 produces. Every lever that
will move, by name:

- `economy.reputation.satisfiedSaleBonus` (new)
- `economy.reputation.delightedSaleBonus` (new)
- `serviceJobTemplates.json` `baseReputation` across all 38 templates (currently 4 to 6, 9 to 14,
  15 to 20, 26 to 34 by tier)
- `GRADE_REPUTATION_MULTIPLIER` (constants.ts, currently stock 1.0 to race 2.2)
- `SERVICE_JOB_FAILURE_REP_MULTIPLIER` (currently 2), subject to the decision above
- `economy.reputation.tierThresholds` (0 / 60 / 200 / 500 / 1400), which must move if the earn rate
  moves, or the whole campaign's pacing shifts silently

**Deleted levers are listed in the reuse analysis above** and their removal is part of the same
signed change.

## Definition of done

- A rough show car sold to the Show Crowd earns full reputation; the same car sold to a Daily
  Driver earns nothing.
- No reputation path reads authenticity, a condition band, or any derived stat directly.
- A builder can reach the top rung. Verified by a test that a modified car earns Delighted from a
  buyer whose targets it clears.
- The campaign still reaches `legend` in a plausible span, checked in numbers rather than asserted.
- `pnpm typecheck` clean (directive 20's carve-out applies: economy fields are retired).
- `npx eslint .` clean.

## Deliberately not here

- **Any change to what reputation GATES.** Auction rooms, tool tiers, bays, job tiers and the
  campaign calendar all keep reading `reputationTier` exactly as they do.
- **The Standing screen's reputation bar.** It reads the same points against the same thresholds;
  only the copy naming the outcomes changes.

## Exit

*(Filled on completion.)*
