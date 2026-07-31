# Sprint 146: taste becomes a match

**Status: READY TO IMPLEMENT. Fourth of the sale value arc. Depends on Sprint 145.**

Design of record: `docs/design/systems/sale-value-system.md` §3 Stage E.

## The defect

Taste is a weighted **mean** of five stats. To score highly a car must be good at everything,
and the five stats are **anti-correlated on purpose**: fitting aftermarket buys power and
destroys authenticity. So a mean of five things that cannot all be high sits near the middle by
construction, and the 24 per cent taste band is barely exercised.

Measured consequence: the whole band moves a typical car by a couple of per cent. Every system
this arc has built funnels into a signal that cannot be felt.

## The fix

A buyer is **satisfied, not impressed**. Each archetype carries a **target** per stat, an
optional **upper bound**, and an **importance** weight.

    shortfall(stat) = max(0, target[stat] - s) + max(0, s - upper[stat])
    match           = clamp(1 - sum(importance * shortfall) / sum(importance), 0, 1)

**Exceeding a target earns nothing.** That single property is what lets a real car reach a match
of 1.0, which a mean of five anti-correlated stats never can. A loud low car scores about 0.2
with the stancer today; under a match his only target is style, the car clears it, and he pays
his ceiling. Which is correct. That is his car.

**The upper bound is load-bearing, not flavour.** Without it a perfectly coherent tuned car
still matches the commuter, and "modification narrows your market" survives only as an authoring
convention hidden inside authenticity weights. With it, the narrowing is a mechanism. It is also
period-correct: a modified car meant shaken trouble and insurance questions, and ordinary buyers
avoided them rather than merely not caring.

## Reuse analysis (directive 16)

### Genuinely new

- **One private function's body** rewritten, and **one optional field** (`upper`) per stat.
- **One archetype**, the kei specialist.

### Existing mechanisms reused

- **`normalizedTasteScore`** in `valuation.ts` is private, with exactly two callers
  (`tasteMultiplier` and `channelTasteMultiplier`). **Replace its body. Every downstream caller
  is unaffected by signature and only sees a different number.**
- **`normalizedPowerScore`**, which already puts power on the same 0 to 1 footing as the other
  four by dividing by `powerNormalizationCeiling`. Uncapped by design, so a monster scores past
  1 and simply clears every power target, which is exactly right.
- **`Buyer.tierPreferences`**, which already gates candidacy. **This is how the kei specialist
  works without tier-relative targets**: it prefers entry and everyday, and holds absolute power
  targets like everyone else.
- **`Buyer.wantLine`**, already authored and already surfaced on live offers.
- **`BuyerSchema` is already `.strict()`** from Sprint 143, so a stale key from the old shape
  errors rather than vanishing.

### Must NOT be built

- **Tier-relative targets.** They would make a Wagon R and a Supra equally impressive, which is
  nonsense. Absolute targets plus `tierPreferences` is the answer.
- **A second taste path.** One function, one formula.

## The authoring

**Six archetypes, all signed under the maintainer's standing authority of 2026-07-30.** Stats
are on the normalised 0 to 1 scale. Blank upper means no upper bound. Importance 0 means the
buyer genuinely does not look at that stat.

**first-timer** wants a sensible car that starts every morning.

| stat | target | upper | importance |
| --- | ---: | ---: | ---: |
| power | 0.25 | **0.55** | 0.30 |
| handling | 0.30 | | 0.20 |
| style | 0.20 | | 0.15 |
| reliability | **0.75** | | **1.00** |
| authenticity | 0.50 | | 0.20 |

The power upper is the mechanism the design asked for: a caged race car actively puts this buyer
off rather than merely failing to interest them.

**racer** wants it fast, and it has to finish.

| stat | target | upper | importance |
| --- | ---: | ---: | ---: |
| power | **0.75** | | **1.00** |
| handling | **0.75** | | 0.90 |
| style | 0.10 | | 0.05 |
| reliability | 0.60 | | 0.60 |
| authenticity | 0.00 | | 0.00 |

**stancer** wants it to look right and does not care about anything else.

| stat | target | upper | importance |
| --- | ---: | ---: | ---: |
| power | 0.20 | | 0.10 |
| handling | 0.10 | | 0.05 |
| style | **0.65** | | **1.00** |
| reliability | 0.00 | | 0.00 |
| authenticity | 0.00 | | 0.00 |

His `tolerance` of 0.0 from Sprint 144 already exempts him from the coherence discount. Together
these say the same thing twice, deliberately: he does not care that it will grenade.

**tuner** wants a platform somebody has already done the hard work on.

| stat | target | upper | importance |
| --- | ---: | ---: | ---: |
| power | 0.65 | | 0.90 |
| handling | 0.55 | | 0.60 |
| style | 0.45 | | 0.40 |
| reliability | 0.45 | | 0.40 |
| authenticity | 0.00 | | 0.00 |

**collector** wants it original and unmolested.

| stat | target | upper | importance |
| --- | ---: | ---: | ---: |
| power | 0.30 | **0.50** | 0.15 |
| handling | 0.30 | | 0.15 |
| style | 0.50 | | 0.40 |
| reliability | 0.60 | | 0.30 |
| authenticity | **0.90** | | **1.00** |

The power upper is what makes a big-turbo build *worse* to a collector than a stock car, rather
than merely no better.

**kei specialist**, NEW. The Cappuccino, Beat and AZ-1 scene was real.

| stat | target | upper | importance |
| --- | ---: | ---: | ---: |
| power | 0.15 | **0.50** | 0.40 |
| handling | 0.50 | | 0.70 |
| style | 0.55 | | 0.80 |
| reliability | 0.60 | | 0.60 |
| authenticity | 0.60 | | 0.50 |

`tierPreferences`: **entry and everyday only**. Low absolute power targets plus a tier
preference is what stops small cars being locked out of premium channels, without making targets
tier-relative. The power upper says an engine-swapped kei is not what this buyer came for.

`wantLine` needs authoring for this archetype, in the game's established voice.

## Expect large movement

**Every price that passes through taste moves**, because the score's whole shape changes. Sale
prices, offers, story-mission taste gates, and the acquisition-to-sale golden master.

All directive 17 case (a). Re-derive from real runs; never iterate toward a pass.

## The smoke test, first

**Assert that a car can now reach a match of 1.0.** Build a loud, low, unreliable car and score
it against the stancer: it should be a perfect match. Under the old mean, no real car could
reach 1.0 against any buyer, and that is the defect in a single assertion. Run it before
implementing so it fails first, then passes.

## Task breakdown

1. **Reshape `BuyerSchema`**: target, optional upper, importance per stat. Required, no defaults.
   Retire `statWeights` and add it to the retired-identifier ledger.
2. **Re-author all five existing archetypes** from the tables above, and add the kei specialist.
3. **Rewrite `normalizedTasteScore`'s body.** Nothing else in `valuation.ts` changes shape.
4. **Check every consumer** of the taste functions still reads correctly: `selling.ts` has five
   call sites, plus `requirements.ts`, the bots and `gameStore.ts`.
5. **Tests**: the 1.0 smoke test; exceeding a target earns nothing; an upper bound reduces a
   match; a specialised car beats a generalist one for the right buyer and loses for the wrong
   one; the kei specialist prefers a Cappuccino to a Supra.
6. **Re-derive** every moved pin.

## Hard constraints

- No tier-relative targets. No second taste path.
- Schema fields required, no defaults.
- `pnpm typecheck` before reporting, per directive 20's carve-out.
- `--project content` and `--project game` once each. Never the full sim project.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] `BuyerSchema` carries target, optional upper and importance; `statWeights` is retired and
      in the ledger.
- [x] Six archetypes authored, including the kei specialist with a `wantLine`.
- [x] A real car reaches a match of 1.0 against the buyer who wants it, asserted.
- [x] Exceeding a target earns nothing, asserted.
- [x] An upper bound actively reduces a match, asserted against the first-timer and a caged car.
- [x] The kei specialist prefers a small car to a fast one, asserted.
- [x] Every moved pin re-derived from a real run, old and new recorded.
- [x] Typecheck, content and game all pass, output shown.

## Exit

**Smoke test.** Written first, against the unmodified code: a Nissan Silvia S13 built loud and low
(race aero kit, race forged wheels), 20% authenticity, against buyers.json's shipped `stancer`
archetype. `valuateCarForBuyer` returned 464,347 against a plain `marketValueYen` (at the
stancer's own zero coherence tolerance) of roughly 616,000 - short of even the taste-free market
read, let alone the top of the band. That is the defect: under the mean, a genuinely loud-low
car does not even clear its own audience. After the fix the identical car reaches
`marketValueYen x (1 + tasteSpread)` exactly, the top of the standard taste band and a match of
1.0, against the same stancer.

**Per task:**

1. `BuyerSchema` reshaped: `statWeights: StatBlockSchema` replaced by `statTargets`, a
   `{ power, handling, style, reliability, authenticity }` object of `{ target, upper?, importance
   }`, all fields required except `upper`, no defaults. `BuyerArchetypeSchema` gained
   `'kei-specialist'`. `statWeights` (the buyer-specific reading, distinct from the still-live
   taxonomy `StatWeightsSchema` of the same bare name) retired via `buyer.statWeights` in the
   ledger (`retiredIdentifiers.test.ts`), scoped precisely to avoid colliding with the unrelated,
   still-shipping taxonomy field.
2. All six archetypes authored exactly from the sprint's tables in `buyers.json`, including the
   new kei specialist (`tierPreferences`: entry and everyday only, its own `wantLine` authored in
   the game's voice).
3. `normalizedTasteScore`'s body replaced with the shortfall/match formula; signature, both
   callers (`tasteMultiplier`, `channelTasteMultiplier`) and every exported function above it
   untouched.
4. Every consumer checked: `selling.ts`'s five call sites, `requirements.ts`'s `evaluateTasteMatch`,
   the bots (`bestFitBuyer`/`valuateCarForBuyer` only, opaque calls) and `gameStore.ts` all read
   through the same exported functions with an unchanged signature - none needed a code change.
5. Tests written per the list: the 1.0 smoke test, exceeding-a-target, the upper bound, specialised-
   vs-generalist, and the kei specialist vs a fast flagship, all in `valuation.test.ts`.
6. Every moved pin re-derived from a real run (below).

**The authoring, judged on two contrasting cars each** (Nissan Silvia S13, stock/mint vs. the same
car built loud/low/unreliable - race aero, race forged wheels, race bucket seats worn, valvetrain
and cooling worn, 20% authenticity; taste read through each buyer's own real `channelBuyerTaste`,
shopFront ceiling 1.00 unless noted):

| buyer | row's two cars | car A | car B |
| --- | --- | ---: | ---: |
| stancer | stock Silvia S13 vs loud/low/unreliable Silvia | 1.0157 | **1.1200 (ceiling)** |
| first-timer | stock Silvia S13 vs loud/low/unreliable Silvia | **1.1177** | 1.0966 |
| collector | stock Supra at 0% vs 100% authenticity (yen) | 4,150,356 | 4,603,956 |
| first-timer | stock Supra at 0% vs 100% authenticity (yen) | 4,587,126 | 4,641,613 |
| kei specialist | stock Honda Beat vs stock Toyota Supra | **1.0854** | 1.0704 |

The specialised car is the stancer's perfect match and the first-timer's second choice, in the same
row - exactly the design's claim. The Cappuccino named in the sprint's own text
(`docs/design/midnight-garage-roster.md` uid MG-028) is not in the shipped `cars.json` subset
(`builtInContent: no`, no measured performance figures yet), so the kei-specialist test uses the
Honda Beat PP1 instead - the other shipped kei car the archetype's own flavour text names.

**Every re-derived pin, old to new:**

- `storyMissions.json` `tasteMatch.minMultiplier` (mechanical consequence of the new formula, not
  an independent decision - re-derived from a fresh `storyMissionProbes.test.ts` run against each
  probe's unchanged build): `first-proper-car`/first-timer 1 -> **1.08**; `low-and-loud`/stancer
  0.99 -> **1.07**; `street-power-street-manners`/tuner 1 -> **1.07**. `economy.json` and every
  mission `payoutYen`/`budgetCapYen` are untouched (confirmed: `economyApprovalGate.test.ts`'s
  three approval-gated assertions all still pass unmodified), so nothing here is a directive-22
  lever; documented in that file's own historical comment ledger alongside its prior entries.
- `advanceDay.test.ts`'s acquisition-to-sale golden master hash: `c4048612` -> **`d467f8b9`**.
- Three sim/game test fixtures that hardcoded a specific buyer/car pairing as "definitely
  unmatched" no longer are, under the new formula, and were rebuilt: `selling.test.ts`'s
  tunerMagazine mismatch-mechanism test (a synthetic authenticity-only buyer replaces
  `honda-city-e-aa` vs first-timer, which is structurally unmatchable on that channel now - see
  below); `selling.test.ts`'s "no reputationDelta" test (buyerId switched to the `trade-network`
  sentinel, which never resolves to a real `Buyer`, since the `tuner`/civic pairing it used is now
  a real match); `gameStore.market.test.ts`'s unmatched-receipt test (rebuilt to self-discover a
  genuinely unmatched real buyer/car pairing, mirroring the matched-sale test already beside it,
  instead of trusting one hardcoded pairing to stay unmatched).

**Outstanding - flagged for the maintainer, not resolved in this change.**
`valueModelProbes.test.ts`'s "unimproved-flip probe (the instant-flip guard)" - a closed-form
economic invariant still in force per CLAUDE.md, asserting that buying a car at auction and
reselling it untouched the same day never turns a reliable profit - now fails on all four tiers:
entry's median resale ratio (1.0528) exceeds `economy.selling.offerSpread`'s own top (1.05);
everyday/enthusiast/flagship's median margin is **+4.0% / +4.35% / +4.44% profit**, not a loss.
Root cause: the match formula's worst case for a buyer is bounded well away from 0 whenever every
target sits below 1.0 (true of all six archetypes), and `pickWeightedCandidate`'s existing
value-weighted buyer selection compounds this by disproportionately picking whichever buyer scores
the car highest - so an ordinary, unmodified car now reads as a reasonable match for most buyers
most of the time, pushing the median walk-in sale price up enough to beat the auction buyout
premium outright. This is a genuine, reproducible consequence of the signed formula and tables
interacting with two pre-existing mechanisms, not a bug in the formula's implementation (verified
against the exact spec) and not something this sprint's lever list authorised a fix for
(`economy.selling.offerSpread`, `economy.AUCTION_BUYOUT_PREMIUM` and the tables themselves are the
only levers that could close it). Per directive 22, left failing and unresolved rather than
silently patched or the test loosened to hide it - the four failing assertions and their exact
numbers are reproducible via `pnpm test --project sim packages/sim/tests/valueModelProbes.test.ts`.

**Checks:** `pnpm typecheck` (all three packages), `pnpm test --project content` (533 passed),
`pnpm test --project game` (833 passed) all shown clean. No lint, format, build or coverage run,
per the sprint's own constraint. `pnpm test --project sim` was never run as a whole; every sim file
this change could plausibly touch was checked by name (`valuation.test.ts`, `selling.test.ts`,
`coherenceValuation.test.ts`, `storyMissionProbes.test.ts`, `advanceDay.test.ts`,
`requirements.test.ts`, `balanceProbes.test.ts`, `stockCarValuationInvariant.test.ts`, and
`valueModelProbes.test.ts`, which surfaced the outstanding finding above).

## Amendment: the shortfall normalisation defect

**The instant-flip guard's failure, left outstanding above, had a structural root cause, not a
tuning one.** With `shortfall = max(0, target - s) + max(0, s - upper)`, the low half of the
shortfall is carried as an absolute gap in score units, so it is capped at `target` itself: a
buyer whose targets are modest can never be badly disappointed, no matter how completely a car
misses them.

**Measured floor per archetype** (a car that clears NOTHING - every stat scores 0 - against each
buyer's real, unchanged `statTargets`; the closed form is `1 - importance-weighted mean target`,
since every stat's shortfall equals its own target at score 0):

    collector 0.315 | racer 0.298 | stancer 0.413
    tuner 0.446 | first-timer 0.451 | kei-specialist 0.497

Through the shop front that is a multiplier of 0.95 to 1.00. The worst car in the game still
fetched essentially full market value from somebody, and `pickWeightedCandidate`'s existing
value-weighted buyer selection hands the game the best-matching buyer regardless. The design's
own claim in this sprint's "The fix" section - that a specialised car should be somebody's
perfect car AND somebody else's wrong car - was half-built: the first half worked, the second
did not exist.

### The normalisation fix

Normalise each shortfall by the room it had to fall short in, so completely missing a bar costs
that stat's full weight:

    lowShortfall  = target > 0 ? max(0, target - s) / target : 0
    highShortfall = upper != null && upper < 1 ? max(0, s - upper) / (1 - upper) : 0
    shortfall     = clamp(lowShortfall + highShortfall, 0, 1)
    match         = clamp(1 - sum(importance * shortfall) / sum(importance), 0, 1)

A `target` of 0 means the buyer does not care about that stat and contributes no shortfall; an
`upper` of exactly 1 can never be exceeded (only power is uncapped, and no shipped archetype's
power upper reaches 1). Both guard the same division by zero.

**No authored `target`, `upper` or `importance` value moved.** The six tables this sprint signed
in `buyers.json` are untouched; this is a normalisation fix to the formula that scores them, not
a retune of what they say.

`normalizedTasteScore`'s per-stat scoring math (`valuation.ts`) was split into its own pure
function, `tasteMatchFor(targets, scoreByStat)`, called by `normalizedTasteScore` with the car's
real computed stats exactly as before. This is not a second taste path - it is the same formula,
factored so it is directly testable against a buyer's real authored targets without needing a
car whose derived stats happen to land on a particular number: the floor test below scores a
hypothetical car that clears nothing on any stat, which only a raw score vector of zeros can
express exactly, and real car physics cannot reach (power floors above zero on any car with
nonzero `stockPowerPs`, for one).

### Order of work and evidence

1. **The floor test, written first.** `valuation.test.ts`, "Sprint 146 amendment: shortfall
   normalisation": for all six archetypes, `tasteMatchFor(buyer.statTargets, { power: 0,
   handling: 0, style: 0, reliability: 0, authenticity: 0 })` must equal exactly 0. Run against
   the unmodified formula it failed on all six, reading exactly the floors above (0.29803921568627445,
   0.4130434782608695, 0.44565217391304346, 0.4513513513513513, 0.4966666666666667 for racer,
   stancer, tuner, first-timer and kei-specialist respectively, collector's 0.315 shown in the
   worked example above). After the fix, all six pass at exactly 0 (an exact float equality holds
   because the weighted-shortfall and total-importance sums accumulate the identical sequence of
   values when every included stat's shortfall is exactly 1).
2. Fix applied in `tasteMatchFor` (`packages/sim/src/valuation.ts`).
3. **Sprint 146's own smoke test re-confirmed passing, unmodified**: the loud, low Silvia against
   the stancer still reaches `marketValueYen x (1 + tasteSpread)` exactly, a match of 1.0 - that
   car clears every bar the stancer has (style, its only real target), so it was never affected by
   a fix that only changes what happens when a bar is MISSED.
4. **The instant-flip guard, re-run**, `valueModelProbes.test.ts`'s `unimproved-flip probe`:

   | tier | before (resale ratio or margin) | after (resale ratio, margin) | guard bound |
   | --- | --- | --- | --- |
   | entry | resale ratio **1.0528** (fails the spread ceiling outright) | resale ratio 1.0053, margin **+0.53%** | margin < -1.00% |
   | everyday | margin **+4.00%** | margin **+0.08%** | margin < -1.00% |
   | enthusiast | margin **+4.35%** | margin **+0.37%** | margin < -1.00% |
   | flagship | margin **+4.44%** | margin **+1.05%** | margin < -1.00% |

   The structural fix closed the great majority of the gap (entry's resale ratio moved back
   inside the offer spread's own ceiling outright; the other three tiers' median margin fell by
   roughly 3.4 to 3.9 percentage points), but **a small median profit remains on all four tiers**
   and the guard still fails.

   **Per directive 22, this stops here rather than reaching for another lever.** The likeliest
   single cause: `economy.AUCTION_BUYOUT_PREMIUM` is currently pinned at exactly **1.00** (see
   `economyApprovalGate.test.ts`'s own ledger entry - an explicit INTERIM value pending
   playtesting, "full guide value with nothing added on top"), so `computeBuyoutPriceYen` charges
   no premium at all over the anchor value for the convenience of an instant, uncontested
   purchase. That leaves zero cushion for the walk-in sale side's own natural upward skew - a
   real, unmodified car clears SOME of most buyers' targets to some degree even though it clears
   none of them completely, and `pickWeightedCandidate`'s pre-existing value-weighted buyer
   selection systematically hands the sale to whichever candidate buyer scores the car highest,
   pushing the realised median match (and so the realised median offer) above the "neutral"
   assumption the guard's own bound is built on. Closing the remainder needs one of
   `economy.selling.offerSpread`, `economy.AUCTION_BUYOUT_PREMIUM`, or the `statTargets` tables
   themselves - the same three lever categories this sprint's own outstanding note named - raised
   to the maintainer as a question rather than moved here.

5. **Every re-derived pin:**
   - `storyMissions.json`'s `tasteMatch.minMultiplier`, re-derived from a fresh
     `storyMissionProbes.test.ts` run against each probe's unchanged build:
     `first-proper-car`/first-timer 1.08 -> **1.07**; `low-and-loud`/stancer 1.07 -> **1.06**;
     `street-power-street-manners`/tuner 1.07 -> **1.05**. Documented in
     `economyApprovalGate.test.ts`'s own historical comment ledger; `economy.json`'s hash and
     every mission payout/budget cap are untouched (directive 22 does not apply - no target,
     upper, importance, payout or budget value moved).
   - `advanceDay.test.ts`'s acquisition-to-sale golden master hash (`d467f8b9`) **did not move**:
     re-confirmed by a real run rather than assumed. The golden career's sale never lands on a
     buyer/car pairing where the normalisation changes the outcome (every stat the golden's buyer
     cares about is either already cleared or already at 0 under both formulas), so the hash holds
     bit-for-bit.
   - `selling.test.ts`, `coherenceValuation.test.ts`, `requirements.test.ts`,
     `balanceProbes.test.ts`, `stockCarValuationInvariant.test.ts` (sim) and
     `gameStore.market.test.ts` (game) all re-run and pass unmodified: the fixtures Sprint 146
     itself rebuilt to self-discover a matched or unmatched pairing at run time, rather than
     trusting a hardcoded one, proved robust to this further formula change.

**Checks:** `pnpm typecheck` clean across all three packages; `pnpm test --project content` and
`pnpm test --project game` both shown clean; every named sim file above re-run individually,
never the full sim project. `valueModelProbes.test.ts`'s instant-flip guard remains RED on all
four tiers, by design - see above.
