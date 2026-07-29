# Sprint 112: The four-stamp grade (the sheet learns to tell the truth at a glance)

**Date:** 2026-07-22
**Source:** the art-reference review of the auction card (this morning's session). The maintainer
caught the design flaw live: the current stamps' naive read is wrong (an overall that secretly
means mechanicals-only beside a worst-single-part letter). Decision criterion ruled the same
day: gameplay feel over factual accuracy. Shape approved and locked by the maintainer:
**one OVERALL number + three area letters (MECH / EXT / INT)**, with the area-weight imbalance
solved by pricing, not by weighting tables. Implementation ordered same day, ahead of the long
playtest.

**One-line goal:** the stamps' naive read becomes the correct read: overall says how big the
visible project is relative to the car, letters say where it lives.

## Reuse analysis (directive 16)

**Reused (the grade is a readout over existing engines, never a second computation):**

- `carCostToMintYen` (bands.ts): the apparent restoration bill IS the economically weighted
  deficit; parts weigh exactly what they cost to put right, per model, so a trashed kei
  interior barely dents its overall while a collector retrim craters one.
- `model.bookValueYen`: the clean-value denominator (mileage and heat deliberately excluded:
  the grade measures the metal, not the market).
- `apparentViewOf` feeding at the call sites (unchanged): stamps still never leak hidden state.
- `bandIndex` / `isPartMissing` (bands.ts): the letter arithmetic's atoms, as today.
- `GradeStamp.vue`: pure presentation, already label+grade generic; a fourth call site, no new
  component.
- The economy content seam (content law): the ratio thresholds are designer-tunable and live in
  `economy.json`, validated by the existing Zod schema layer.

**Genuinely new:** the ratio-to-grade step mapping (one small content block + lookup), the
`mechanical` letter, and the impression-based letter rule (area average with a scrap/missing
step-down) replacing worst-single-part.

## Design (locked with the maintainer, 2026-07-22)

1. **Overall** = `carCostToMintYen(apparentCar) / model.bookValueYen`, stepped through a
   content-tunable table (`economy.auctionGrading.overallRatioSteps`, first match wins,
   fallback `1`). Starting values: S <= 0.01, 6 <= 0.04, 5 <= 0.08, 4.5 <= 0.13, 4 <= 0.19,
   3.5 <= 0.27, 3 <= 0.38, 2 <= 0.55, else 1. Tunable like everything else.
2. **R overrides** when any apparent mechanical part is scrap or genuinely missing: the
   visible-corpse flag, knowingly unrealistic (real R = accident history), kept as donor
   shorthand. Trigger unchanged from the previous system.
3. **Letters (MECH = engine/drivetrain/suspension, EXT = body/wheels, INT = interior)**: the
   area's average apparent band index over present parts (genuinely missing counts as scrap;
   legitimately-absent slots never count; an all-absent area reads A), `Math.round`ed to a
   letter, then stepped down one letter (floor E) when anything in the area is scrap or
   missing. Equal letters mean equal wreckage of that area: a state claim, not a cost claim;
   the cost asymmetry lives in the overall, which prices it.
4. The card shows four stamps; `GradeStamp` tones apply unchanged (letters already mapped).
5. Display-only: no mechanic reads the grade; `apparentViewOf` keeps feeding it.

## Tasks

- [x] Agent: sim remap (`auctionGrade.ts` rewritten with clean present-tense comments),
      content block + schema, call-site sweep (store, card, demo, exports), test rewrite
      (constructed-car behaviour probes incl. the imbalance probe: identical interior trash
      grades the kei's overall worse than the collector's; re-pins from real runs), game
      re-pins + the fourth stamp.
- [x] Orchestrator: design, spec, stamp label copy, verification, Exit.

## Exit

- [x] The four-stamp system shipped exactly as locked: `computeAuctionGrade(car, model,
      context)` prices OVERALL as `carCostToMintYen / bookValueYen` through
      `economy.auctionGrading.overallRatioSteps` (8 content-tunable steps, fallback `1`);
      MECH/EXT/INT are impression letters (area average, one-step wreckage penalty, floored
      at E); R overrides on any apparent scrap/missing mechanical part; callers still feed
      `apparentViewOf`, so hidden damage never leaks. No second value computation exists.
- [x] The imbalance probe passes with real roster numbers: identical worn interiors (bill
      ¥9,400) read INT `C` on both cars, but grade `honda-city-e-aa` (book ¥180,000)
      overall `5` against `toyota-supra-rz-jza80` (book ¥4,200,000) overall `S`: the
      priced denominator does the weighting, the letters stay state claims.
- [x] The cheap-part probe passes: one scrap set of rims on an otherwise-mint
      `honda-civic-sir2-eg6` reads EXT `C` (average B, stepped down for the wreckage) with
      MECH `A`, INT `A`, and overall `5` (¥30,000 against ¥650,000 book, 4.6%): a cheap
      part locates loudly in its letter and no longer craters the headline.
- [x] Test rewrite was directive-17 case (a): the old assertions pinned the superseded
      worst-single-part mapping, replaced (not loosened) with 8 behavioural probes
      including both R-trigger polarities (missing mechanical forces R; missing
      non-mechanical never does) and the legitimately-absent carve-out.
- [x] One honest deviation, agent-flagged: probe (b) uses the mid-priced Civic rather than
      the roster-cheapest City, because on a ¥180,000 book even one scrap wheel is honestly
      a grade-4 project: that is the system working, not a probe fixture.
- [x] Orchestrator sweep: new sim file verified clean (present-tense comments, no process
      narrative, no em dashes across all changed files); card renders Overall/Mech/Ext/Int
      in the existing stamp idiom.
- [x] Evidence (narrowest checks, once each): sim auctionGrade 8/8; content schemas 20/20;
      game AuctionScreen 25/25; `pnpm typecheck` clean across content, sim, and game.
      Uncommitted, ready for the maintainer's word; the pre-push hook remains the full
      gate.
