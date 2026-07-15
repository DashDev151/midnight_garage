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

## Tasks

**Claude:**

1. Content: the (D, F) pairing + spawn rates in `economy.json` with schema doc comments; the new
   `partsGeneration.wearExposureByMileageKm` curve and `auctionMinAgeYears`; `provenance.json`
   + schema + content test.
2. Sim: `wearExposure` threaded into `generateAuctionCarInstance`'s upkeep application; the
   age-aware provenance pick; the min-age clamp. Unit tests (a ~0 km car never rolls below
   near-mint at ANY upkeep tier; a high-mileage neglected car still rolls rough; provenance fits
   the age band).
3. Probes: a **wage probe** (repair-then-sell beats sell-as-is by more than the rent over the
   labour it takes, per roster tier) as the machine-checked form of Law 6; re-run Sprint 54's
   floor probe and ceiling probe; confirm Sprint 59's unimproved-flip band still holds (it should
   move: a rough car is cheaper now, so the as-is flip is a WORSE play, which is the point).
4. Docs: economy-bible Law 6 recorded with the maintainer's framing and the (D, F) constraint
   written down explicitly, so no future sprint moves one without the other.
5. Full gate; balance harness + invariant check (this is a real economy change: expect the
   coherence table's flip margins to move, days-to-`local` to shift, and bot cash curves to
   change). Add the wage law to `computeRosterCoherence`'s per-model table and hard-gate it
   alongside Laws 1-4. Disclose every number in the Exit.

**User-only (maintainer):**

- Approving this sprint doc is the recorded approval Law 6's bible amendment requires.
- Rule on the first-pass (D, F) = (1.5, 0.6) once the harness numbers are in - that pair sets how
  dramatically condition swings a car's price, which is the single biggest feel dial in the game.

## Definition of done

- A day of repair labour provably out-earns a day of rent, probe-enforced per roster tier; Law 6
  recorded and hard-gated in the coherence table.
- The scrap floor still never binds (Sprint 54's probe green) and a fully restored car is still
  worth exactly clean value (the ceiling holds).
- A near-zero-mileage car cannot roll worn/poor parts at any upkeep tier; provenance copy always
  fits the car's age; no current-model-year car appears at auction.
- The board turns over roughly twice as fast; all hard balance gates pass (or a maintainer-approved
  band change is recorded); full gate green; Exit discloses the full before/after numbers.

## Exit

Not started.
