# Sprint 184: the customer decides whether you did well

**Status: COMPLETE, archived. The tabled value was signed two days after this doc was written.**

`reputation.tierThresholds` was approved on 2026-08-06 and moved from 0 / 60 / 200 / 500 / 1400 to
**0 / 140 / 450 / 1150 / 2900**. The approval is recorded in `economyApprovalGate.test.ts` and the
values are live in `economy.json`. This sprint had recommended leaving them alone for pacing; the
maintainer moved them for scale, which the approval ledger states. The header said "tabled for
signature" until the 2026-08-13 archive pass corrected it.

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

The direction is signed: *"lower the rep gain via service jobs, and raise the rep gain via car
sales. a full, good car sale should gain more rep than a standard service job."* These are the
values that carry it. **A standard service job is tier 2, which pays 9 to 14 today**, and that is
the bar a good sale has to clear.

### New

| lever | value | reasoning |
| --- | ---: | --- |
| `reputation.satisfiedSaleBonus` | **15** | clears the top of the tier-2 band, so any sale that pleased its buyer beats a standard job |
| `reputation.delightedSaleBonus` | **30** | beats a tier-3 job (15 to 20) outright, and is reachable by every play style, which concours never was |

### Reduced: service jobs come down on EVERY rung

Maintainer ruling: *"service jobs are giving too much rep across the board. Reel it in on all
rungs."* So the fix is not the top rung alone; `baseReputation` halves across all 38 templates and
the grade multiplier comes down with it.

| tier | `baseReputation` from | to |
| --- | --- | --- |
| 1 | 4 to 6 | **2 to 3** |
| 2 | 9 to 14 | **5 to 7** |
| 3 | 15 to 20 | **8 to 10** |
| 4 | 26 to 34 | **13 to 17** |

| lever | from | to |
| --- | --- | --- |
| `GRADE_REPUTATION_MULTIPLIER` | stock 1.0 / street 1.3 / sport 1.7 / race **2.2** | 1.0 / 1.15 / 1.35 / **1.6** |

**What that does to the shape.** The best job in the game, tier 4 with a race part, falls from
**75 to 27**. A standard tier-2 job falls from 9-14 to 5-7. Against a satisfied sale at 15 and a
delighted one at 30, selling a car well now beats every service job including the best one, and
beats a standard job by roughly three times. The service board becomes the steady trickle it should
be rather than the main road to legend.

### Deleted with the mechanism

`cleanSaleMinBand`, `cleanSaleBonus`, `concoursSaleMinAuthenticityPercent`, `concoursSaleBonus`,
`lemonSalePenalty`, `lemonMaxAverageBandFactor`, `matchedSaleRepBonus`, and
`SERVICE_JOB_FAILURE_REP_MULTIPLIER` (which the monotonic ruling retires).

### Re-derived, not chosen

`reputation.tierThresholds` (0 / 60 / 200 / 500 / 1400). Raising a sale from 2 to 15 changes the
earn rate substantially, so the ladder must be re-derived against the new rate or the whole
campaign's pacing shifts silently. **This is the one value that cannot be set in advance**: it is
measured after the rest lands, tabled, and signed before it moves.

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

Everything in the Levers section above landed at the signed values. `pnpm typecheck` clean (the
directive-20 carve-out applies: this retires seven economy fields and five exported symbols),
`npx eslint .` clean, all three Vitest projects green: **content 610/610, sim 2458/2458, game
946/946**.

### What was built

**One new predicate.** `saleOutcomeFor(buyer, model, car, ...)` in `packages/sim/src/valuation.ts`,
returning `satisfied` / `delighted` / `nothing`. Satisfied is the buyer's champion stat clearing its
target, read through the same `championStatFor` the taste gate uses rather than a second copy;
delighted is every stat with non-zero importance clearing its target. It shares the normalised score
vector with `normalizedTasteScore` (a small extracted `normalizedStatScores`), so a buyer's verdict
and the price they pay can never be computed off two different numbers.

**One module deleted outright**, not migrated (directive 19). `packages/sim/src/carCondition.ts` held
only `saleReputationDeltaFor` and `saleQualityFor`, so the whole file and its `index.ts` export are
gone, along with `packages/sim/tests/carCondition.test.ts`. The only assertion in that test file with
independent value (the forced-induction missing-vs-absent distinction) was already covered whole by
`bands.test.ts`.

**Reputation is now fully monotonic.** `SERVICE_JOB_FAILURE_REP_MULTIPLIER` and
`reputationForFailure` are gone, and the failure branch of `resolveServiceJob` no longer calls
`applyReputationDelta` at all. Three consequential shape changes the brief did not anticipate, all
made because leaving them would have shipped a field that structurally reads 0 forever:

- `service-job-failed`'s `reputationLost` field is retired from the day-log schema (it could only
  ever be 0),
- `ServiceJobView.failureReputationPenalty` is retired from the store, and the car page's copy now
  reads *"handing it back now forfeits the payout"* rather than naming a rep figure,
- `JobCompleteModal.vue`'s Reputation row renders only when there is reputation to report, so a
  failed job no longer shows a green `+0`.

`applyReputationDelta`'s zero floor SURVIVES as a defensive guard and is still tested, with a comment
and a test name saying plainly that nothing in the game reaches it any more.

**Copy.** The `car-sold` entry keeps its shape; `saleQuality`'s enum goes `lemon|clean|concours` to
`satisfied|delighted` and the day log reads *"the buyer got what they came for"* /
*"the buyer got everything they came for"*. No player-facing string anywhere says concours or lemon.
`matchedSale` is untouched and still means the scene-standing delivery credit, which is a different
question from what the sale paid in reputation; both facts now sit on the entry without pretending to
be one.

**Guards.** Eleven entries added to `retiredIdentifiers.test.ts` (the seven economy fields plus
`saleReputationDeltaFor`, `saleQualityFor`, `SERVICE_JOB_FAILURE_REP_MULTIPLIER` and
`reputationForFailure`), and the economy hash re-pinned with its own ledger entry. **No Dexie or
`SAVE_VERSION` bump is needed**: nothing here touches `GameStateSchema`, since the day log is not
persisted.

### Tests changed, with the directive 17 case for each

Every one was case (a), a stale assertion of behaviour this sprint intentionally changed. **None was
case (b), and no test was loosened.**

| test | case | what changed |
| --- | --- | --- |
| `carCondition.test.ts` (whole file) | (a) | The predicate it tested no longer exists. Deleted rather than rewritten; its one independently-valuable assertion was already duplicated in `bands.test.ts`. |
| `selling.test.ts` "reputation side effects" (4 tests to 3) | (a) | The lemon tests asserted a penalty that is now forbidden. Replaced with: a champion-clearing sale pays `satisfiedSaleBonus` and logs `saleQuality: 'satisfied'`; a buyer who missed out pays nothing AND takes nothing (a shop on 40 points still has 40); a trade sale pays nothing because nobody was behind the offer. |
| `selling.test.ts` matched-sale block | (a) | Asserted `>= matchedSaleRepBonus`. Now asserts the exact `delightedSaleBonus`, since that fixture's buyer cares about exactly one stat and the car clears it. The scene-credit half of the block is untouched. |
| `serviceJobs.test.ts` "failure costs reputation" | (a) | Replaced with the grade-gradient assertion at the new multipliers (race 1.6x, street 1.15x), which is the fact that survived. |
| `serviceJobs.test.ts` failure + deadline-backstop tests | (a) | Were `50 - reputationForFailure(...)`; now assert the total is still exactly 50 and that no `reputationLost` field is emitted. |
| `schemas.test.ts` reputation block | (a) | Six deleted fields out, `satisfiedSaleBonus` 15 and `delightedSaleBonus` 30 in. |
| `authenticity.test.ts` (2 tests) | (a) | Both asserted a real number (82 and 83) AND that it fell below the concours bar. The numbers stay; the dead bar reference goes. |
| `valuation.test.ts` Show Crowd smoke test | (a) | Same shape. The "modified enough to have given up its originality" assertion now reads against the Collector's own authored authenticity target instead of the retired 85 bar, which is the live expression of the same idea. |
| `dayLogFormat.test.ts` (3 tests) | (a) | New vocabulary and new point values; one test added so both outcome strings are covered. |
| `commentHygieneGuard.test.ts` | **(b)** | The one genuine catch: three comments I wrote carried process narrative ("sprint 184", "the maintainer"), which directive 10 bans. The comments were rewritten to describe current behaviour; the guard was not touched. |

**Added:** `packages/sim/tests/saleOutcome.test.ts` (7 tests) for the predicate itself, including the
definition of done stated as a test (a rough show car reads `delighted` to the Show Crowd and
`nothing` to a Daily Driver, same car, same instant) and the builder-reaches-the-top-rung proof (a
fully race-built Silvia reads `delighted` to the Tuner at authenticity well under the old 85 bar).
Added to `reputation.test.ts`: a three-part guard that every reputation-writing path in the game is
nonnegative over the real shipped content.

### THE MEASUREMENT: `reputation.tierThresholds` is NOT moved, and here is why

Method: closed-form, in the style of `sceneStandingRetuneProbes.test.ts` (sprint183). Real
`saleOutcomeFor` / `valuateCarForBuyer` calls against the **48 shipped models** at five build levels
(stock mint, uniform street, sport, race, and a scene-targeted build) plus **400 generated auction
lots**. No bot career, no RNG-driven selling simulation (directive 21). The probe was run once and
removed; every figure below is reproducible from the same harness sprint 183 committed.

**1. Reputation income per act, measured.**

| act | rep |
| --- | ---: |
| Satisfied sale | **15** |
| Delighted sale | **30** |
| A sale, weighted by who actually turns up: unrestored lot flipped as bought | **0.4** |
| ... restored to mint, stock | **7.1** |
| ... sport build | **13.2** |
| ... race build | **17.1** |
| ... scene-targeted build | **15.7** |
| A sale where the player picks the buyer (a matched-only channel), restored | **22.5** |
| ... built for a scene | **24.4 to 26.3** |
| Service job, tier 1 | 2.5 mean (2 to 3 base; up to 5 with a race part) |
| Service job, tier 2 | 5.7 mean (5 to 7; up to 11) |
| Service job, tier 3 | 8.6 mean (8 to 10; up to 16) |
| Service job, tier 4 | 14.5 mean (13 to 17; up to 27) |
| All ten story missions, once each | 335 total (15 to 60 each) |

The draw-weighted column is the honest middle: it weights each scene by
`tierPreference x cultureAffinity x valuation`, which is exactly `pickWeightedCandidate`'s own
distribution. **Flipping a car with no work done pays 0.4** - the core-loop law survives the change
intact.

**2. What the current ladder costs, in acts, before and after.**

| rung | cars, old rate (~2.5/sale) | cars, new (built, draw-weighted 17.1) | cars, new (built + right channel, 26.3) | jobs, old | jobs, new |
| --- | ---: | ---: | ---: | ---: | ---: |
| `local` 60 | 24 | 3.5 | 2.3 | 12 | 24 |
| `known` 200 | 80 | 12 | 7.6 | 24 | 49 |
| `respected` 500 | 200 | 29 | 19 | 42 | 84 |
| `legend` 1400 | 560 | 82 | 53 | 73 | 146 |

(Job counts use the mean base of the highest tier unlocked at that rung, cumulative.)

**3. The finding, and the recommendation: LEAVE ALL FIVE NUMBERS WHERE THEY ARE.**

Take a shop that sells one car for every one and a half jobs it turns around, doing real work on
both:

- **old**: 2.5 + 1.5 x 14.0 = **23.5 points per bundle**
- **new**: 13.2 + 1.5 x 6.5 = **23.0 points per bundle**

(Working, so the numbers can be checked rather than taken: the sale term is the sport-build
draw-weighted figure from table 1. The job term is the mean of the tier-1-to-3 means available to a
mid-game shop - 11.2 old, 5.6 new, the halving - times a modest grade uplift for the install jobs
among them, larger under the old 2.2x race multiplier than under the new 1.6x.)

**Within 2 per cent.** The gain on the sale side (+10.7) almost exactly cancels the loss on the
service side (-11.3), so a balanced shop's wall-clock pacing to every rung is unchanged. What moved
is who climbs:

| play style | speed vs before |
| --- | ---: |
| Sales-led (1 sale : 0.5 jobs) | **1.7x faster** |
| Balanced (1 : 1.5) | **unchanged** |
| Service-led (1 : 4) | **1.5x slower** |

That is precisely the redistribution the sprint was for, achieved without touching the ladder. The
service road to legend roughly doubled (73 jobs to 146) and the sales road shortened about tenfold
(560 cars to 53-82), so the two are now within a factor of two of each other instead of a factor of
eight apart in the wrong direction. **Moving the thresholds now would be a second, uncalled-for
change to a pacing figure the first change did not disturb.**

**4. The one thing worth a separate decision, which this measurement does NOT force.** The ladder is
back-loaded and always has been: the gaps are 60 / 140 / 300 / **900**, so the last rung alone is
**64 per cent of the whole ladder** - 34 deliberately-sold cars for that one rung, against 19 for
all three rungs before it put together. That shape predates this sprint and is untouched by it. If it is worth
flattening, the coherent version is **0 / 90 / 260 / 560 / 1100** - gaps of 90 / 170 / 300 / 540,
each about 1.8x the last instead of today's 2.3x / 2.1x / 3.0x, dropping the last rung to 49 per
cent of the ladder and legend to about 42 deliberate cars. It also raises the story missions' share
of the total from 24 to 30 per cent, which is the main argument against it. **Tabled as a question,
not proposed as a fix**; nothing in this sprint's arithmetic says the current numbers are wrong.

### Open questions this sprint raises

1. **`saleOutcomeFor` reads `target` only, never `upper`.** Daily Drivers and Touge both author a
   power `upper` of 0.55 ("too much car"), which the taste PRICE honours and reputation now does not:
   a 400 PS commuter still reads `delighted` to a Daily Driver if it clears every target. This is
   exactly what the brief and the bible's fifth amendment specify ("every stat that buyer cares
   about cleared"), so it is built as written and flagged rather than quietly extended.
2. **Culture affinity is deliberately not read.** A buyer whose scene barely cares for a car's
   culture still pays full reputation if the car clears their targets. Culture governs who turns up
   and what they pay; whether the person standing in front of the car got what they wanted is a
   different question. Named here so it is a decision rather than an omission.
3. **Authenticity lost its only direct economic consumer.** The concours gate was the one place a
   car's derived authenticity bought the player something on its own; it now reaches the player only
   through buyer taste and the coherence term in `marketValueYen`. Recorded in the economy bible's
   amendment log.
