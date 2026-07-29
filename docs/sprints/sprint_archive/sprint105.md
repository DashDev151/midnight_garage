# Sprint 105: Fault ladders and the repair/reputation rebalance (the stakes economy)

**Date:** 2026-07-20
**Source:** maintainer design discussion, 2026-07-20. The live auction room feels right, but
inspection has no teeth because every fault is a cheap, always-profitable fix. The agreed
fix: give doubts a real range of outcomes (from cheap fix to rare write-off), tone the
repair reward down so fixing is lucrative but not a money-printer, and lean on the existing
reputation penalty so selling an unsound car actually hurts. This is the economic
foundation the auction promotion (Sprint 100) sits on, so it lands FIRST, despite the
higher number.

**One-line goal:** make inspection a genuine "gem, ordinary, or grenade?" decision by
widening what a doubt can hide, and rebalance the three rewards for fixing (money, spread,
reputation) so no single one dominates.

## Reuse analysis (directive 16)

This sprint adds NO new systems. It is a rebalance of two config numbers plus a content
pass inside the existing schema.

**Existing mechanisms reused:**

- The value model (`marketValueYen`, `billBelow`, `marketRepairDiscount`,
  `scrapValueFraction`): unchanged in shape. We retune one number (the repair discount) and
  rely on the existing scrap floor (5% of clean) to make catastrophes bottom out near
  write-off. No new valuation maths.
- The symptom/cause/diagnosis system (`packages/content/data/symptoms.json`,
  `CauseSchema`'s `carPartId`/`setBand`/`weight`, the `tests` partitions, `runDiagnosticTest`):
  the fault ladders are authored ENTIRELY within this schema, more causes across a wider
  band range with weighted odds. The room already prices the weighted average
  (`sheetGuideValueYen`) and the tests already narrow; nothing new is wired.
- The reputation-on-sale mechanic (`saleReputationDeltaFor`, `LEMON_SALE_REPUTATION_PENALTY`,
  `cleanSaleBonus`/`concoursSaleBonus`): already docks rep for a lemon and rewards a clean
  or concours sale. We sharpen the penalty and move it into the content config; the trigger
  and the code path stay.
- The `apparent` view / odds pricing / the live auction room: the wider swings flow through
  all of it unchanged, that is the whole point (bigger swings make the existing steal/trap
  dynamics finally bite).

**Genuinely new (small):**

1. Wider, weighted cause ladders per symptom, including a rare catastrophic cause that sets
   an expensive/foundational part to `scrap`.
2. The `marketRepairDiscount` retune (1.5 -> 1.3).
3. Moving the lemon penalty into `economy.json`'s `reputation` block (content law,
   directive 2) and sharpening it.

## Design

### 1. The fault ladders (the heart of this sprint)

Today each doubt has three causes topping out at `poor` band (e.g. `non-starter`:
flat-battery `worn` 55, fuel-pump `poor` 30, seized-engine `poor` 15). Even the
"seized-engine" only drops the block to `poor`, a moderate fix. That is why the true
worth never strays more than ~11% from the room read.

The pass reshapes every symptom's `causes` into a **spectrum** with these properties:

- **A wide range of outcomes.** From a cheap cause (a mild band drop on a cheap part) up
  through moderates to a genuine **write-off** (an expensive or foundational part, e.g.
  `block`/`internals`/`chassis`/`gearbox`, set to `scrap`). The scrap floor (5% of clean)
  means a write-off's true worth collapses toward nothing.
- **Catastrophes are rare.** The write-off cause carries a low weight (target ~8-15%), so
  most cars are fine or a cheap fix; the disaster lurks. Rarity is what makes it scary and
  keeps inspection worth doing.
- **The value swing scales with the car.** Because a part's repair/replacement cost is
  per-class (`stockReplacementPriceYenByClass`), a write-off on a kei is kei-money and on a
  GT-R is GT-R-money automatically. The typical mild-vs-moderate swing lands in the
  maintainer's 10-30% band; the rare catastrophe is the deep tail beneath it.
- **No tell.** The `cardLine` is severity-blind: two cars with the same doubt read
  identically. Only inspection distinguishes them. (Enforced by keeping one card line per
  symptom regardless of the rolled cause, as today.)
- **Residual uncertainty.** With more causes than the two-group tests can fully separate in
  one go, a player often narrows to "probably fine, but it could be the bad one", and must
  decide to test again (spend minutes) or gamble. That tension is the anti-monotony
  guarantee. Variety comes for free: different doubts carry different spectra and the true
  cause rolls fresh per car, so there is no memorisable pattern.

**Worked example, `non-starter` (illustrative target, exact numbers tuned in authoring):**

| Cause | Part | setBand | Weight | Reads as |
|---|---|---|---|---|
| flat-battery | ignitionEcu | worn | 48 | cheap |
| dirty-fuel-pump | fuelSystem | poor | 26 | moderate |
| corroded-loom | ignitionEcu | poor | 16 | moderate |
| seized-engine | block | **scrap** | 10 | **write-off** |

The room prices the weighted average (mostly the cheap/moderate outcomes, lightly discounted
for the 10% grenade). Inspect and it's the battery -> worth more than the room feared, a
steal. Inspect and it's the seized block -> worth a fraction of the read, walk and let the
room get burned. Don't inspect -> you bid the average and, over time, overpay the grenades
and underbid the gems.

The tests keep partitioning the (now larger) cause list into two groups each, with updated
`resultCopy`; the content-integrity test (`symptom.test.ts`) still enforces full,
non-overlapping coverage. Symptoms may need a third test to resolve a four/five-cause
ladder to a single answer, else they stay deliberately partially-knowable (a design lever
per symptom).

### 2. Repair reward: `marketRepairDiscount` 1.5 -> 1.3

Fixing stays lucrative, just less. A below-expectation repair still returns MORE than it
costs (spend the bill, gain 1.3x), so buying rough and fixing is still a real money source,
alongside the auction spread. It is a pure balance tweak: the mechanic is identical to
today, dialled down so it no longer drowns out the other two rewards. Tunable in
`economy.json`; 1.3 is the starting point, to settle in playtesting.

Consequence, disclosed: this lowers the value of every car carrying below-expectation work,
so `advanceDay` golden masters and value-pinned tests move (case (a), intended). No
migration (directive 19); re-pin and re-run the coherence/satisfiability probes, assessing
any that fail rather than force-passing.

### 3. Reputation: sharpen the lemon penalty, and make it tunable

Move `LEMON_SALE_REPUTATION_PENALTY` out of `constants.ts` into `economy.json`'s
`reputation` block (it is a designer-tunable number; the clean/concours bonuses already
live there, so this closes a content-law gap). Then sharpen it so selling a mechanically
unsound car is a real setback, not a footnote: a lemon sale should cost several clean
sales' worth of reputation. Starting target: penalty ~-8 against the current +2 clean /
+4 concours (so one lemon undoes ~four clean sales), tuned in playtesting. Optionally widen
the lemon trigger (`LEMON_MAX_AVERAGE_BAND_FACTOR`, currently 0.45) so more "sold it rough"
cases catch, decided during tuning.

The point is the shift in emphasis: fixing is rewarded three ways now, the (reduced) repair
profit, the buying spread, and NOT tanking your name. Money still flows from good work and
good buying; reputation punishes cutting corners.

## Decisions

1. **No new mechanics.** Everything reuses the value model, the diagnosis system, and the
   reputation-on-sale path. This is a rebalance plus a content pass (directive 16).
2. **Fixing stays a major money source.** The repair reward drops to 1.3, not to break-even.
   Three rewards for good work (repair profit, spread, reputation), none dominant.
3. **Catastrophes are rare and hidden.** Low weight, scrap-band on an expensive part,
   severity-blind card line, residual uncertainty after partial testing. Wide outcome range
   so it never reads as a solved puzzle.
4. **Swings scale with car value automatically** via per-class part costs; the typical
   swing sits in the 10-30% band, the rare tail reaches write-off.
5. **Lands before the Sprint 100 auction promotion.** The promotion inherits an economy
   where inspection already matters; promoting first would bake in a toothless inspection.
6. **Golden masters move; that is intended.** Re-pin as case (a); the coherence probes are
   the economic gate (directive 21, no bots), re-run and assess, do not paper over.

## Tasks

**Claude-implementable:**

- [ ] Content: reauthor `symptoms.json` fault ladders, wider weighted spectra per doubt with
      a rare scrap-band catastrophe on an expensive/foundational part; update each symptom's
      `tests` partitions + `resultCopy`; keep card lines severity-blind. (Orchestrator
      designs each ladder per the content-quality bar; the mechanical edits and
      integrity-test updates are delegated.)
- [ ] Config: `economy.json` `marketRepairDiscount` 1.5 -> 1.3.
- [ ] Config: move the lemon penalty into `economy.json` `reputation` (new field), wire
      `saleReputationDeltaFor`/`constants.ts` to read it, and set the sharpened value
      (~-8 to start). Optionally the lemon-trigger widen.
- [ ] Tests: update `symptom.test.ts` integrity coverage for the new ladders; re-pin the
      value/rep/`advanceDay` golden masters (case (a)); re-run the coherence/satisfiability
      probes and REPORT any failure with numbers for assessment.
- [ ] economy-bible + `live-auction.md`: record the repair-discount and reputation changes
      and the fault-ladder principle in the amendment log / design of record.

**User-only:**

- [ ] Playtest and tune: the 1.3 repair discount, the lemon penalty, the catastrophe rarity,
      and the per-doubt swings. These are feel numbers; the sprint ships sensible starts.

## Exit

- [x] Config moves shipped, all in `economy.json` now: `marketRepairDiscount` 1.5 -> 1.3;
      the lemon penalty and its band threshold moved out of `constants.ts` into
      `reputation` (`lemonSalePenalty` 8, sharpened from 5; `lemonMaxAverageBandFactor`
      0.45), `carCondition.ts` rewired to read them, the two constants removed. One coupled
      edit was forced and is economically inert: the schema refine
      `beyondDiscount <= marketRepairDiscount` rejected the config while
      `expectationByTier.rare.beyondDiscount` sat at 1.5; it is now 1.3, but `rare`'s
      expectation band is `mint` so there is never above-band work and the field cannot
      move a rare car's value (rare-car wage probe still green).
- [x] Eight catastrophe promotions in `symptoms.json` (existing worst cause -> terminal
      `scrap`, rare weight, copy verbatim): smokes-on-startup/tired-rings 13,
      non-starter/seized-engine 12, tick-at-idle/rod-knock 15, crunch-into-second/
      chewed-gearset 18, diff-whine/chewed-ring-pinion 18, quarter-panel-filler/
      structural-rail-repair 15, damp-passenger-footwell/rotten-bulkhead-seam 18,
      oil-pressure-flutter/worn-main-bearings 18. Ten other symptoms deliberately cap at a
      moderate `poor` (variety). All ladders still sum to 100.
- [x] Catastrophe economics verified (agent spot-check, damp-footwell -> rotten bulkhead):
      a shitbox honda-city-e's true worth drops from 12.2% (old poor) to **4.3% (the scrap
      floor)** of book, a genuine write-off; a common civic drops to 14.9% (value roughly
      halved). The chassis-scrap outcome also collapses the foundation factor (0.15),
      withholding the aftermarket premium, so it bites twice. The room prices the odds
      (mostly the cheap outcome, lightly discounted), so an uninspected bidder overpays it.
- [x] Golden masters re-pinned (case (a), intended): `advanceDay` 30-day career
      `bab04b2a`->`7a539f1c`, acquisition->sale `43f9d715`->`d9d083cf`; schema/rep pins to
      the new discount and reputation fields. The value-model / wage / coherence / floor /
      tutorial-satisfiability / diagnosis / generation probes all read the discount
      dynamically and pass with no bound violated.
- [x] Story-mission payout probes (6) assessed and resolved. They failed because the lower
      repair discount RAISED the worn base cars' `marketValueYen`, so the one-price 1.3x
      formula output rose above the pinned payouts, a case-(a) stale pin, not a bound
      violation. The missions are formula-driven (payout = budget = ceil1000(1.3 x cost)),
      so re-pricing to the new formula preserves their designed 30% margin exactly:
      first-proper-car 489->534k, make-it-pull 847->892k, the-column-clock 1485->1557k,
      low-and-loud 1692->1763k, street-power-street-manners 1552->1623k, under-one-fifteen
      3496->3681k. storyMissionProbes now 15/15 green. (The campaign's relative economics
      are unchanged; only the absolute yen tracks the value model.)
- [x] Docs: economy-bible amendment log + `live-auction.md` updated (discount, lemon,
      catastrophe principle).
- [x] Evidence: `pnpm test --project sim --project content` was green but for the 6
      story-mission pins, which are now fixed (storyMissionProbes 15/15). Uncommitted,
      pending maintainer word. The pre-push hook is the full gate.

**Follow-up pass, DONE (one combined re-pin):**

- [x] Widened the six 2-cause catastrophe binaries into 3-cause spectra with a moderate
      middle cause each: tick-at-idle (+blowing-manifold), crunch-into-second
      (+dragging-clutch), diff-whine (+worn-propshaft-uj), quarter-panel-filler
      (+rust-patch), damp-passenger-footwell (+perished-grommet), oil-pressure-flutter
      (+worn-oil-pump). Each middle is a genuinely distinct fault the tests can isolate, so
      a doubt is a spectrum, not a coin; it also sharpens the steals (the room now fears a
      middle outcome too).
- [x] Added five more rare catastrophe modes, each grounded in real mechanical failure and
      approved by the maintainer: overheats-in-traffic -> cracked block (block scrap, 10),
      hesitates-under-load -> jumped chain/bent valves (headValvetrain scrap, 12),
      wont-idle -> burnt exhaust valve (headValvetrain scrap, 10), clunk-over-bumps ->
      rotted subframe mount (underbody scrap, 10), sagging-spring -> rotted strut turret
      (chassis scrap, 13). Thirteen of eighteen doubts can now hide a grenade; brakes,
      steering, tyres and exhaust stay honestly non-fatal.
- [x] Two new diagnostic tests registered in `diagnosticTests.json`: `clutch-drag-check`
      and `magnet-check` (the classic magnet-over-filler test), 10 min each; every other
      widened symptom reuses an existing test. `wont-idle` keeps its deliberate bench-only
      ECU-versus-cams ambiguity; the tutorial's `four-wheels` lot (tick-at-idle -> lifter
      resolves on a single stethoscope run) still works, verified by the passing tutorial
      satisfiability probe.
- [x] Copy: every new/changed diagnostic line personally read and signed off against the
      content bar (technical, period-credible, British, no em dash); no rewrites needed.
- [x] Re-pin: `advanceDay` hashes moved again with the reshaped symptom population
      (`7a539f1c`->`8be9ace1`, `d9d083cf`->`241e896b`); story-mission probes did not move
      (symptomless base cars). One soft band re-measured: `valueModelProbes`' rare-tier
      median as-is flip drifted to ~8.1% as the catastrophe/moderate causes reshaped the
      population, so its disclosed headroom band went 8% -> 9% (case (a), the probe's own
      "disclose, do not tune away" method; the wage law and the coherence sleeper/trap
      straddle both still pass). Content project 89/89 green; sim green.

Sprint 105 is complete. Uncommitted, pending maintainer word; the pre-push hook is the full
gate.
