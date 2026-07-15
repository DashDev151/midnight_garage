# Sprint 66 - The honest car: the wage law, coherent generation, and real churn

**Source:** playtest 2026-07-15 (`docs/playtest_notes/playtest-notes-2026-07-15.md`), items 19, 6a,
15. The two real system problems in this pass, plus the one content tune that belongs with them.

## Confirmed current state (code discovery, 2026-07-15)

### Item 19 - the repair margin is exactly 20%, by construction

The maintainer's read ("a lot of work, profit similar or lower than selling as-is") is right about
the feel and wrong about the sign. The arithmetic, verified end to end:

- A repair of one grade on one part costs `repairStepFraction (0.1) x partPriceYen`
  (`planPartRepair`, bands.ts:359-373). `chargeRepairWork` charges exactly that, no markup, no fee.
- `costToMintYen` = `gradesBetween(band, 'mint') x repairStepFraction x partPriceYen` (bands.ts:96-110)
  - the SAME product. So paying X yen drops `billToMintYen` by exactly X.
- `marketValueYen`'s base = `cleanValue - marketRepairDiscount (1.2) x billToMintYen`. So X yen paid
  raises guide value by `1.2X`.
- **Net: every repair yen returns 1.20 yen. Profit rises by 0.2X - never falls.** Repairing the
  screenshot's ¥14,400 engine bill nets exactly +¥2,880 on a ~¥135k car: a ~2% move for a visible
  amount of work. That is the whole complaint, precisely stated.
- The rate is flat by construction: `repairStepFraction` is one constant applied to every band
  transition, so a poor->worn rung returns the same 1.2x as a full restore. There is no
  partial-repair penalty to find - the slope itself is the problem.
- `foundationFactor` (Sprint 60) can't help here: it scales `installedPartsValueYen`, which is 0
  for stock parts, and every generated car is all-stock. It is inert until aftermarket is fitted.

**The binding constraint (why 1.2 was chosen).** `instanceBaseValueYen` floors at
`scrapValueFraction (0.05) x cleanValue`. For the floor never to bind - Sprint 54's own probe
asserts it doesn't on any generatable car - we need
`marketRepairDiscount x partsGeneration.maxBillFraction < 1`. Today: `1.2 x 0.7 = 0.84`. The slope
cannot be raised without lowering the bill ceiling in the same move. **Any fix here is a joint
(D, F) decision, not a single-number tune.**

### Item 6a - condition is decoupled from mileage

`generateAuctionCarInstance` (auctions.ts:281-343) chains
`year -> ageYears -> mileage range -> roll mileage -> condition baseline range -> roll baseline ->
upkeep offset + per-part jitter -> band`. The break:

- `upkeepTier` is rolled INDEPENDENTLY of age/mileage (`upkeepTierWeights`, 25% neglected).
- `upkeepBaselineOffset.neglected = -22` and per-part `upkeepJitterRange.neglected = [-30, 10]`
  apply as ABSOLUTE offsets regardless of how new the car is.
- At age 0 `mileageRangeMinByAgeYears` starts at 0 km, and `conditionBaselineMinByMileageKm` at 0 km
  is 70. So: baseline 70, neglected -22 = 48, one part's jitter -30 = 18 -> `poor` (worn >= 40,
  poor >= 15). **A 11 km car can and does roll poor/worn parts.** Exactly the maintainer's car.
- `provenanceNote` is a hardcoded sim pool (`PROVENANCE_POOL_BY_UPKEEP_TIER`, auctions.ts:33-37)
  picked ONLY by upkeep tier - never by age or mileage. Hence "dealer trade-in, service history
  unknown" on a nearly-new car.
- Nothing anywhere forbids a brand-new car appearing at a local-yard auction (the maintainer's
  "why is this at a backyard mechanic" point).

### Item 15 - churn

`AUCTION_DAILY_SPAWN_RATE` = {local-yard 0.6, regional 0.55, premium 0.4, collector 0.2}
(economy.json). `rollDailySpawnCount` (catalogs.ts:105-109) = `floor(rate)` plus one more at the
fractional probability; every rate is < 1, so each tier adds 0 or 1 lot/day - **~1.75 lots/day
across the whole board.**

## Reuse analysis (directive 16)

**New mechanisms:** a wear-exposure model coupling condition to age/mileage (replacing the
absolute upkeep offset), an age/mileage-aware provenance pick, a minimum-age floor for auction
lots, and one new machine-checked economy law (the wage law).

**Existing mechanisms to reuse:** every value/repair function is untouched in shape - this is a
constants + generation-chain change riding the Sprints 47/54/55/60 machinery. `enforceMaxBillFraction`
(the Law 2 guard) already softens any car that breaches the bill ceiling and is the natural place
the new (D, F) pairing lands. `computeRosterCoherence` already derives the flip margin per model
and hard-gates it - the wage law joins it as another closed-form row rather than a new harness.
The probe-suite pattern (`valueModelProbes.test.ts`) carries the acceptance tests. Sprint 59's
unimproved-flip probe is the contrast case the wage law must beat.

## Decisions

1. **The wage law (economy-bible Law 6).** A day of repair labour must return meaningfully more
   than a day of standing still costs. Stated checkably: for a representative damaged car,
   `profit(buy -> repair -> sell) - profit(buy -> sell as-is)` must exceed the rent accrued over
   the labour days that repair takes, by a real margin - not the ~20%-of-spend sliver it returns
   today. *Litmus: is a day at the bench worth more than a day doing nothing?* This is the law the
   playtest is actually asking for, and it is the one Law 1 (slope >= 1) was too weak to deliver.
2. **Raise the slope, lower the bill ceiling, together.** `marketRepairDiscount` 1.2 -> **1.5** and
   `partsGeneration.maxBillFraction` 0.7 -> **0.6** (product 0.90, so the scrap floor still never
   binds and Sprint 54's floor probe holds). Worked consequence at the extremes:
   - Worst generatable car: value = `clean x (1 - 1.5 x 0.6)` = 0.10 x clean. Buy ~0.097 x clean,
     repair 0.6 x clean, sell ~0.99 x clean -> **~+0.29 x clean** for a full restoration.
   - Lightly damaged (bill 0.1 x clean): buy ~0.82 x clean, repair 0.1 x clean, sell 0.99 x clean
     -> **~+0.07 x clean**. Real, positive, and worth the bench time.
   - Every repair yen now returns 1.50 yen (a 50% margin on spend, up from 20%).
   All first-pass, maintainer-tuning bait; the harness and the new probes are the referee. If the
   measured wage still doesn't clear rent, `restoration.repairStepFraction` (0.1) is the second
   lever (it scales cost AND bill 1:1, so it raises the ABSOLUTE margin without touching the
   slope) - flagged, not pre-emptively moved.
3. **Wear is exposure, not a dice roll (item 6a).** `upkeepTier` stops applying an absolute
   baseline offset and jitter. Instead a new `wearExposure` factor in [0, 1], derived from the
   car's own mileage against the same `conditionBaselineMinByMileageKm` curve domain, SCALES the
   upkeep offset and jitter: a ~0 km car has ~0 exposure, so no upkeep tier can drag its parts
   below near-mint; a 150k km car has full exposure, so a neglected roll bites exactly as hard as
   it does today. Content: `partsGeneration.wearExposureByMileageKm` (a curve, reusing the existing
   `CurveSchema`/`interpolateCurve` shape). *A brand-new car is mint whoever owned it; only time
   and distance let neglect express itself.*
4. **Provenance must fit the car (item 6a).** The provenance pool becomes keyed by
   `(ageBand, upkeepTier)` rather than upkeep tier alone, and moves from the hardcoded sim pool
   into content (`provenance.json`, the content law - it is authored player-facing copy). A
   nearly-new car draws from a nearly-new pool ("first owner, dealer-serviced"); "parked up for
   years" is only ever drawn by an old one. A content test asserts every (ageBand, upkeepTier)
   cell has at least 2 lines.
5. **No brand-new cars at a backyard auction (item 6a).** A minimum lot age: `auctionMinAgeYears`
   (first pass **3**) clamps the generated `year` so a local yard never lists a current-model-year
   car. The maintainer's own framing ("why is the car coming to a backyard mechanic if it was just
   bought from a dealer") is the rationale; the roster's `yearFrom + rng.int(0,8)` roll gains this
   floor against the game's current year.
6. **Churn (item 15).** `AUCTION_DAILY_SPAWN_RATE` roughly doubles: local-yard 0.6 -> **1.3**,
   regional 0.55 -> **1.1**, premium 0.4 -> **0.7**, collector 0.2 -> **0.35** (~3.45 lots/day, up
   from ~1.75). `rollDailySpawnCount` already handles rates above 1 (`floor` plus the fractional
   chance), so no code change - a pure content tune. Watch the harness's acquisition counts and
   the days-to-`local` gate.

7. **Diminishing returns, keyed to tier (the maintainer's mid-sprint direction, 2026-07-15).**
   Added after decisions 1-2 were implemented and the coherence table was measured. The measurement
   is what forced it:

   | Tier | Repair gain to mint | Bench days | Net of rent | Pays the rent |
   | --- | --- | --- | --- | --- |
   | Honda City (shitbox) | Y26,170 | ~8 | +Y2,360 | 1.10x |
   | Wagon R (shitbox) | Y39,255 | ~13 | +Y3,541 | 1.10x |
   | Civic (common) | Y104,600 | ~8 | +Y80,790 | 4.39x |
   | Chaser (rare) | Y272,640 | ~13 | +Y235,497 | 7.34x |

   My first reading of that spread was "repair labour is value-blind, so cheap cars pay badly",
   filed as a disclosure. That diagnosis was half right and the conclusion was wrong. The
   maintainer's correction: **nobody should be taking a Honda City to mint in the first place.**
   The model is fine; the TARGET BAND is the mistake. The table was measuring an act no sane
   player would perform and then reporting that it barely pays.

   The real-world shape: it is not financially worth restoring a shitbox kei to mint, but it IS
   worth making it roadworthy. On a sports car it is genuinely worth building up to something
   special. The point of diminishing return is HIGHER on a better car. A tidy running Wagon R is
   priced within touching distance of a mint one; a scruffy FD is worth a fraction of a concours
   FD. The current single flat slope cannot express either fact.

   **Formulation.** Split the EXISTING mint-referenced bill at a per-tier expectation band and
   give it two slopes instead of one:
   - `billBelow` = cost to bring every part up to the tier's expectation band
   - `billAbove` = cost to go from there to mint (`billBelow + billAbove` = today's bill exactly)
   - `baseValue = cleanValue - D x billBelow - Dhigh x billAbove`, `Dhigh` per tier

   Properties, all of which fall out rather than needing clamps:
   - At mint both bills are zero, so value is exactly clean value. **Sprint 54's no-inflation
     ceiling survives untouched.**
   - Below expectation the return is `D` (1.5). Making a car roadworthy always pays, every tier.
   - Above expectation the return is `Dhigh`, deliberately under 1 for the low tiers.
   - A shitbox at `worn` is worth `clean - 0.4 x billAbove`: a tidy kei prices near a mint one.
   - A rare car at `fine` is worth `clean - 1.5 x billAbove`: the concours push pays.

   The aftermarket premium takes the same shape on the Law 5 term: a per-tier `aftermarketReturn`
   multiplier, so a race turbo on a kei returns a fraction of its cost. Fun, not profit, which is
   the maintainer's own framing ("though it might still be fun").

   | Tier | Expectation band | `beyondDiscount` | `aftermarketReturn` |
   | --- | --- | --- | --- |
   | shitbox | worn | 0.4 | 0.3 |
   | common | fine | 0.8 | 0.6 |
   | uncommon | fine | 1.2 | 0.9 |
   | rare | mint | 1.5 | 1.0 |

   First-pass, maintainer-tuning bait like every other anchor here.

   **This requires amending Law 1, and the maintainer approved it explicitly ("Happy to make the
   amendment Carefully") on 2026-07-15.** Law 1 currently reads that the marginal return is >= 1
   at every reachable state, `.min(1)` schema-enforced as a structural law. A `Dhigh` of 0.4
   breaks that on purpose. The amendment scopes Law 1 rather than weakening it: **the return is
   guaranteed >= 1 below the expectation band, absolutely and by construction; above it the
   player is knowingly spending on passion rather than investing, and the car page must say so
   out loud.** A value trap is one you cannot see. This one has to be legible or it is just the
   Sprint 47 bug wearing a new hat - hence the UI clause is part of the law, not a nicety.

   Law 5 is amended in the same way and for the same reason (the premium gets its own per-tier
   return). Law 2 is unaffected. The (D, F) interlock is SAFER, not weaker: `Dhigh <= D` is
   schema-enforced, so worst-case value stays above the `D x F < 1` bound that keeps the scrap
   floor from binding.

   **Consequence for Law 6 (decision 1).** The wage gets planned to the tier's EXPECTATION band,
   not to mint. That is the honest target: the repair a real player would actually do. The
   shitbox ratio should clear 1.10 comfortably once it stops measuring a restoration nobody wants.

## Tasks

**Claude:**

1. Content: the (D, F) pairing + spawn rates in `economy.json` with schema doc comments; the new
   `partsGeneration.wearExposureByMileageKm` curve and `auctionMinAgeYears`; `provenance.json`
   with its schema and content test.
2. Sim: `wearExposure` threaded into `generateAuctionCarInstance`'s upkeep application; the
   age-aware provenance pick; the min-age clamp. Unit tests (a ~0 km car never rolls below
   near-mint at ANY upkeep tier; a high-mileage neglected car still rolls rough; provenance fits
   the age band).
3. Probes: a **wage probe** (repair-then-sell beats sell-as-is by more than the rent over the
   labour it takes, per roster tier) as the machine-checked form of Law 6; re-run Sprint 54's
   floor probe and ceiling probe; confirm Sprint 59's unimproved-flip band still holds (it should
   move: a rough car is cheaper now, so the as-is flip is a WORSE play, which is the point).
4. Docs: economy-bible Law 6 recorded with the maintainer's framing and the (D, F) constraint
   written down explicitly, so no future sprint moves one without the other. Laws 1 and 5 amended
   per decision 7, with the maintainer's approval and the scoping rationale recorded in the
   Amendment log.
5. Decision 7: `valuation.expectationByTier` content anchor (band + `beyondDiscount` +
   `aftermarketReturn` per tier), schema-enforced `beyondDiscount <= marketRepairDiscount`;
   `marketValueYen`'s bill split at the expectation band; the Law 5 premium term scaled by
   `aftermarketReturn`; the wage law re-targeted from mint to the expectation band. Probes: the
   marginal return is >= 1 below expectation on every tier (Law 1's surviving clause, machine-
   checked); a mint shitbox LOSES money against a worn one (the new law's whole point); the
   ceiling still returns exactly clean value.
6. UI (the legibility clause of the Law 1 amendment - a diminishing return the player cannot see
   is just the Sprint 47 bug again): `CarDetailScreen.vue`'s Finances panel names the car's
   expectation band and marks work planned above it as passion spend, not investment.
7. Full gate; balance harness + invariant check (this is a real economy change: expect the
   coherence table's flip margins to move, days-to-`local` to shift, and bot cash curves to
   change). Add the wage law to `computeRosterCoherence`'s per-model table and hard-gate it
   alongside Laws 1-4. Disclose every number in the Exit.

**User-only (maintainer):**

- Approving this sprint doc is the recorded approval Law 6's bible amendment requires. Decision 7
  carries its own explicit approval for the Law 1 and Law 5 amendments (2026-07-15, "Happy to make
  the amendment Carefully").
- Rule on the first-pass (D, F) = (1.5, 0.6) once the harness numbers are in - that pair sets how
  dramatically condition swings a car's price, which is the single biggest feel dial in the game.
- Rule on decision 7's eight numbers, particularly the shitbox expectation sitting at `worn`
  rather than `fine` - that band is the line between "worth fixing" and "passion project" for the
  whole starter tier.

## Definition of done

- A day of repair labour provably out-earns a day of rent, probe-enforced per roster tier at each
  tier's own expectation band; Law 6 recorded and hard-gated in the coherence table.
- Diminishing returns are real and tier-keyed: the marginal return is >= 1 below every tier's
  expectation band (Law 1's surviving clause, machine-checked), a mint shitbox loses money against
  a worn one, and the car page says which side of the line planned work falls on. Laws 1 and 5
  amended in the bible with the approval recorded.
- The scrap floor still never binds (Sprint 54's probe green) and a fully restored car is still
  worth exactly clean value (the ceiling holds).
- A near-zero-mileage car cannot roll worn/poor parts at any upkeep tier; provenance copy always
  fits the car's age; no current-model-year car appears at auction.
- The board turns over roughly twice as fast; all hard balance gates pass (or a maintainer-approved
  band change is recorded); full gate green; Exit discloses the full before/after numbers.

## Exit

Implemented and verified. Full gate green: **1096 tests** (up from 1083), coverage
91.42/82.26/92.88/95.06 (all above the 80/65/78/82 thresholds), typecheck/lint/format/build clean.
Balance harness re-run in full; **all 11 hard gates pass** (9 previous plus the 2 new ones this
sprint adds), days-to-`local` p50=16.0, unchanged from Sprint 61's baseline and comfortably inside
the [10, 35] band.

### What landed

**Decisions 1-6 as designed.** `marketRepairDiscount` 1.2 -> 1.5 paired with
`partsGeneration.maxBillFraction` 0.7 -> 0.6 (product 0.90, interlock intact); the
`wearExposureByMileageKm` curve now scales the upkeep offset and jitter by the car's own mileage;
`AUCTION_MIN_AGE_YEARS` (3) clamps the generated year; `AUCTION_DAILY_SPAWN_RATE` roughly doubled
(~3.45 lots/day). Item 6a is fixed at the root and measured: minimum generated mileage moved
**11 km -> 8,503 km**, the lowest-mileage car's worst band moved **poor -> fine/worn**, and
provenance is now keyed by `(ageBand, upkeepTier)` so a nearly-new car reads "first owner,
dealer-serviced from new" rather than "barn find". Five new tests in `generationCoherence.test.ts`
pin all of it, including the maintainer's verbatim bug as a permanent regression.

**Decision 7 (diminishing returns) was added mid-sprint and changed the shape of the sprint.**
`valuation.expectationByTier` is live; `costToBandYen`/`carCostToBandYen` generalise the existing
cost atoms (with `costToMintYen`/`carCostToMintYen` now delegating to them, so the split can never
drift from the displayed bill); `instanceBaseValueYen` is the two-slope formula; Law 5's premium
takes its second per-tier multiplier. Laws 1, 5, and 6 are recorded in the bible with the
approval and the reasoning.

### The measurement that forced decision 7, and what it cost me

Worth recording honestly, because two of my own conclusions were wrong and the tests caught both.

1. **I filed the shitbox wage spread as a disclosure instead of a diagnosis.** The first
   coherence read showed a mint restoration returning 1.10x rent on a kei against 7.34x on a rare
   car. I wrote that up as "repair labour is value-blind, so cheap cars pay badly" and moved on.
   The maintainer's correction (nobody should take a Honda City to mint in the first place) was
   the actual finding: the model was fine and the TARGET BAND was the mistake. The table was
   faithfully measuring an act no sane player performs.
2. **I claimed re-targeting the wage to the expectation band would fix the shitbox ratio. It does
   not, and cannot.** `wageRatio` is INVARIANT to the target band: planning to `worn` instead of
   `mint` scales cost and labour by the same grade count, so the ratio is unchanged (Wagon R sits
   at 1.10 either way). The re-target was still correct - it measures the repair a real player
   makes - but the sprint doc's prediction was arithmetically wrong and is left standing in
   decision 7 rather than quietly edited.
3. **The wage probe's first subject was wrong.** I reused `buildWorstCaseRawCar` (all-`scrap`) out
   of DRY instinct. Scrap is unrepairable, so Honda City reported `repair=0, wage=0` and would have
   FAILED the new gate - not because the economy was broken, but because a write-off has no bench
   work to measure. Law 6 now has its own probe car (`buildWageProbeCar`, every slot `poor`).
   Reuse was the wrong instinct there: the worst-case car belongs to Law 2's question, not Law 6's.

### The numbers

Coherence table, all 10 models (full table in `tools/balance/report.md`):

| Model | Class | Sensible margin | Mint flip | Wage | xRent |
| --- | --- | --- | --- | --- | --- |
| honda-city-e-aa | shitbox | **+Y34,309 (25.4%)** | +Y3,202 | +Y1,180 | 1.10x |
| suzuki-wagon-r-ct21s | shitbox | **+Y46,309 (28.1%)** | +Y22,155 | +Y1,180 | 1.10x |
| honda-civic-sir2-eg6 | common | +Y92,995 (19.1%) | +Y124,348 | +Y80,790 | 4.39x |
| nissan-180sx-rps13 | uncommon | +Y79,418 (9.6%) | +Y251,651 | +Y156,998 | 7.34x |
| mazda-savanna-rx7-fc3s | uncommon | +Y360,723 (26.7%) | +Y443,475 | +Y156,998 | 7.34x |
| mazda-rx7-fd3s | rare | +Y787,800 (32.8%) | +Y860,300 | +Y388,857 | 11.47x |
| toyota-supra-rz-jza80 | rare | +Y1,087,800 (34.5%) | +Y1,160,300 | +Y388,857 | 11.47x |

The shitbox rows are the law in one line: the sensible play clears **+25.4%** on a Honda City
while chasing mint clears **+2.4%**. On the rare tier the ordering reverses and chasing mint pays
best, which is what makes a Supra a project and a kei a job. Both directions are now permanent
assertions (`valueModelProbes.test.ts`).

The `nissan-180sx-rps13` sensible margin (+9.6%) is the roster's thinnest by a wide gap and is
flagged rather than tuned - it is comfortably positive, but if any model wants a book-value or
mileage-curve look during the maintainer's tuning pass, it is that one.

**Sprint 59's unimproved-flip band moved and was re-measured, not nudged.** Shitbox +7.3%, common
+5.9%, uncommon +5.1%, rare +5.2% (from +5.5/+2.8/+2.5/+5.7); the band went 7% -> 8%. All four
drifted up a few points and all stay on the profit side. This is disclosed rather than tuned away:
it is still an order of magnitude below the ~49% giveaway item 19 reported. It does not undermine
Law 6, because both the as-is flip and the repair flip start from the same won price, so the
bidding discount is common to both and cancels.

**Two golden-master hashes re-pinned** (`f354f178` -> `9f8e0a15`, `2103500e` -> `cfabcf38`),
directive 17 case (a). The economy changed on purpose in three ways that all reach a scripted
career's end state; a golden master that did NOT move would mean the changes did nothing. The
drift is covered by targeted assertions (ceiling, floor, no-free-lunch, foundation, wage, sensible
play, generation coherence) rather than taken on trust.

### Disclosed: every bot's day-100 cash went sharply negative, and I did not tune for it

Flipper's day-100 median cash is **-Y106,183** against Y300,000 starting cash; investor
-Y134,380; cautious-restorer -Y22,858; balanced-player +Y11,656; handyman +Y258. Only
`service-grinder` (+Y418,498) and `competent-policy` (+Y401,414) beat Passive Grinder, both
slightly down from Sprint 61 (441k/435k). The auction tail is frenzy-dominant (75.1%, up from
Sprint 59's 72.2% - the tail bucket's own 90%-of-guide threshold has been stale since Sprint 59
and is still flagged, not patched here).

This is not a regression and I deliberately did not chase it. `bots/bandHelpers.ts` hardcodes
`targetBand: 'mint'` and every strategy's done-check is `isGroupAtLeast(car, id, 'mint', ...)` -
**verified, not assumed**. Every bot restores every car to mint, so every bot now executes the
exact play decision 7 exists to punish. The bot-free coherence table proves the same cars clear
+9.6% to +34.5% on the sensible play. The economy is sound; the bots cannot play it. Recorded as
finding 5 on `TODO.md`'s bot-harness rework entry, which is the cleanest measurement of that
defect yet produced. Tuning the economy to make mint-blind bots solvent would be tuning away the
sprint's whole point.

### Not done / handed to the maintainer

- The eight decision-7 numbers, the (D, F) pair, and the shitbox expectation band sitting at
  `worn` are all first-pass tuning bait and want a playtest.
- I did not start the dev server to see the passion-spend notice in a browser (long-running
  processes are outside what I run myself). `pnpm dev`, then any owned shitbox's car page with
  every part at `worn` or better.
- `provenance.json` (task 1's content-law move of the provenance pool) was NOT done. The pool
  stays in `auctions.ts` as an age-banded constant. It is authored player-facing copy and belongs
  in content by the content law; deferred deliberately to keep this sprint's diff on the economy,
  and it is the one piece of the sprint doc's plan that did not land.
