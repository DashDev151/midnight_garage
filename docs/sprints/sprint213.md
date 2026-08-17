# Sprint 213: the flip economy, reconciled

**Status: APPROVED (maintainer, 2026-08-17), including the reduced targets.**
Design settled over the 2026-08-16/17 forensics of the maintainer's own day-5
session (the Honda Today flip): the value model paid its promised repair premium
and the selling machinery took it back; on top of that both income rates were
ruled too high and come down together.

## The axioms (maintainer rulings)

- A car's value is a function of what it IS, never of what it took to get there.
- One labour rate, used everywhere, sets what customer work pays.
- World credibility caps state values (a sorted entry kei is a Y110-130k car).
- The tier ladder is intentional progression.

## The design (A+B+C plus the defect fix, amplitudes reduced)

1. **Sale-side reconciliation (defect fix).** A right car sold to the right buyer
   fetches its value: the best-matched buyer prices at par with neutral value;
   discounts are for mismatched buyers and stale listings, never a flat tax. The
   13-15 per cent buyer stack that cancelled the Today's entire earned margin dies.
2. **Buyers fear projects (per-tier outstanding-work multiplier).** Damaged metal
   hammers near its floor because buyers price hassle and risk - still purely
   f(state). Steepest at entry, gentler up-tier. Gentler than first proposed: the
   crashed Today hammers ~Y18-22k, not Y12k.
3. **Excellence premium (state-based).** Book is average condition; a
   fine-throughout, coherent, fresh example prices above it - modestly (~10-15
   per cent at entry). The Today sorted sells ~Y100-110k.
4. **Labour-cost deflation.** Tier-1 repair/recondition point costs come down so a
   clean entry flip runs ~130-150 points (~2 days), raising yen-per-point without
   touching value. Radial yen-per-point is rate-anchored and unaffected by this.
5. **Both rates come down (maintainer ruling 2026-08-17).** `laborRateYen` and the
   callout drop so radial work lands ~Y500-650/point; the flip package amplitudes
   land entry flips at ~Y200-300/point (~Y25-35k per well-bought kei).

## The balance method (the anchor is the calendar)

Pick the pace: week 1-2 survive on phone work while learning; ~week 3 first tool
line; ~week 5-6 the body line or first mid-tier car. That pace needs ~Y50-70k net
per week: radial floor ~Y35-45k (supply-bounded), one to two kei flips ~Y25-35k
each. Set the levers to hit that; one pace decision moves everything consistently.

## Acceptance (probes before playtest, closed-form, no bots)

- Per-tier flip bands at a fair buy: entry Y200-300/pt, mid ~Y800/pt, high
  Y1,200+/pt; radial wage ~Y500-650/pt on its bounded supply.
- The maintainer's day-5 session replayed as the golden before/after case: the
  same Today, bought and built the same way, lands in the entry band.
- A whole-week arithmetic check reproduces the pace anchor (~Y50-70k net).
- Standing coherence probes stay green (fixing profitable below band; no
  negative-margin trap on any reachable repair).

## Levers (behaviour-first; felt statements re-pinned with the guard)

`laborRateYen`, `calloutFeeYen`, `marketRepairDiscount` (per-tier),
`beyondDiscount`/excellence terms, buyer quality/affinity stack
(`qualityFresh`, affinity curve), tier-1 `energyPerBandStepByToolTier` and related
action points. Exact values chosen at implementation against the probes; every one
carries its felt statement. If the excellence premium needs a new valuation term
(shape), it is one small state-based factor recorded here as approved in intent.

## Definition of done

- All probes green with the stated bands; the golden session lands in band.
- No second labour rate anywhere; the staff-wage invariant re-anchored if the rate
  moved.
- Guard re-pinned once with the full felt-statement ledger.
- `pnpm typecheck`; narrowest tests once; pre-push is the gate.

## Exit

**Implemented 2026-08-17. All green.**

- **Sale reconciliation.** `valuation.affinityNearParFraction` (new field, 0.9)
  backs a shared two-segment `affinityMultiplier` curve (`sim/valuation.ts`) both
  `tasteMultiplier` and `channelTasteMultiplier` build from: below the matched
  threshold the price climbs steeply from the mismatch floor, at and above it a
  buyer who merely clears "matched" already prices 90 per cent of the way to par.
  `liquidity.qualityFresh` 0.96 -> 1.0 and `qualityFloor` 0.86 -> 0.90 remove the
  flat freshness tax a fresh listing paid regardless of match quality.
- **Buyers fear projects.** `valuation.marketRepairDiscount` reshapes from one
  scalar to a per-fitment-class record - entry 1.5, everyday 1.4, enthusiast 1.35,
  flagship 1.3 - steepest at the cheap end. Entry's rate is capped below the
  `marketRepairDiscount x partsGeneration.maxBillFraction < 1` interlock (Law
  1/2's scrap-floor guarantee), landing at 1.5 rather than the sprint narrative's
  illustrative 2.0-2.2; the probes are the acceptance gate, and they pass.
- **Excellence premium.** New `valuation.excellenceByTier` (entry 0.12, everyday
  0.10, enthusiast 0.08, flagship 0.06) backs a new `excellencePremiumYen`
  (`sim/marketValue.ts`), gated on a car being genuinely fine-throughout and
  scaled by its own coherence and freshness - the fix for the old "a fully
  restored car can never be worth more than clean" ceiling.
- **Labour-cost deflation.** `energy.energyPerBandStepByToolTier` shifts from
  {1:5, 2:4, 3:3} to {1:4, 2:3, 3:2} - the whole curve moved down one step,
  preserving its own non-increasing shape (the schema's own refine forces this;
  tier 1 cannot drop below tier 2 without tier 2 moving too).
- **Both rates down.** `laborRateYen` Y6,000 -> Y3,600, `calloutFeeYen` Y5,000 ->
  Y1,750 - both below the narrative's illustrative ranges once the radial-wage
  probe was scoped correctly to genuine bench-repair work rather than parts-heavy
  replacement jobs. The staff-wage invariant re-anchored by the same 0.6 ratio
  (`staff.wageBaseYen`/`wagePerSkillPointYen`/`wagePerLaborSlotYen`/
  `contractBaseYenPerDay`/`contractPerSkillPointYenPerDay`), which leaves every
  hire-coherence bound at exactly the same margin (a pure rescale is
  scale-invariant on every one of those ratios).
- **Probes** (`sim/tests/flipEconomyProbes.test.ts`, new): (a) roster flip
  yen/point - entry 270, everyday 622, enthusiast 1,328, flagship 8,297
  (disclosed, not gated - flagship's own mint expectation clamped to a tier-1
  fine ceiling); (b) radial wage Y646/point; (c) the golden day-5 Honda Today
  session replayed byte-for-byte lands at Y207/point; (d) one entry flip plus a
  supply-bounded week of radial work nets Y79,629 after rent.
- Mission payouts/budget caps in `storyMissions.json` re-derived as a mechanical
  consequence of the `marketRepairDiscount` move (their own price-lock formula,
  never an independent balance choice) - full list in the guard re-pin.
- Guard re-pinned once (`economyApprovalGate.test.ts`) with the full
  felt-statement ledger for all seven levers.
- `pnpm typecheck` clean across content/sim/game; full `pnpm test` green (231
  files, 4,762 tests).
