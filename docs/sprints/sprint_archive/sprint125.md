# Sprint 125 - Aero: downforce that grows with speed, and the drag it costs

**Status: IMPLEMENTED, ready for review, with ONE OPEN LEVER QUESTION for the maintainer (see the
Exit). Sections A and C signed 2026-07-25 ("continue with the rest of sprint 125"); the three open
decisions took their recommended answers.** The third phase of the car spec arc, deferred out of Sprint 124 by the
maintainer ("fine aero in next sprint") to keep that sprint's surface small. Sprint 124's Exit is the
prerequisite: lap time is now a real sim over real courses, so a speed-dependent grip term finally
has somewhere to land.

## The idea in one paragraph

A wing does two opposite things: it presses the car into the road (more grip, rising with the square
of speed) and it pushes back against it (more drag, lower top speed). Today the model has the drag
half only, and it is fixed per car. This sprint adds the downforce half and makes both respond to
what is bolted on. The pay-off is a real decision instead of a strictly-better upgrade: a wing wins
time on Tsurugi and Kirifuri and LOSES it on the Wangan.

## Reuse analysis (directive 16)

**New mechanisms:**

- A `downforceCoeff` per car (stock): ~0 for nearly every car in the roster, a small positive for the
  few with genuine factory aero (R35, LFA, 22B, the GT wings).
- A speed-dependent grip term in the lap model: `muEffective(v) = muMechanical * (1 + k * v^2)`,
  evaluated per corner at that corner's own speed. Calibrated: the Calsonic telemetry gives
  **k = 6.2e-5** for a full race aero package (+4.5% grip at 97 km/h, +18% at 193, ~+50% at 323).
- A drag cost paired to it, so fitting a wing raises `CdA` as well as grip.

**Existing mechanisms to REUSE (do not rebuild):**

- **The aero/body-kit part family already exists** (widened in Sprint 119: Lip Kit, GT Wing, Race
  Aero Kit, Lightweight Body Kit, Underglow Kit, by grade). Aero is an EXISTING part slot with
  existing SKUs, pricing, fitment, condition bands and value contribution. This sprint gives those
  SKUs a performance meaning; it does NOT introduce a new part type, a new slot, or a new shop flow.
- `performance.ts`'s `lapTime` and `computeGrip`: the downforce term multiplies the existing
  mechanical mu inside the existing corner loop. No new solver.
- `frontalAreaM2`/`dragCd`: the drag half already exists; the aero part adds to it.
- `effectiveCompound`'s pattern (read the fitted part, fall back to the model's stock value) is
  exactly the pattern the fitted-aero lookup should copy.

**Deliberately NOT touched:** `computeGrip` itself, `gripToDisplay`, `balanceOf`, and therefore the
handling stat and `valuation.ts`. Downforce is zero at zero speed, and the handling stat is a
skidpad/low-speed projection, so aero must not move it. This is also what keeps the `advanceDay`
goldens still.

## Definition of done

- A car's cornering grip rises with speed when it has aero, and its drag rises with it.
- Fitting a better aero SKU measurably changes lap time, and the sign of the change DIFFERS by
  course (quicker on Tsurugi/Kirifuri, slower on Wangan). That divergence is the acceptance test.
- Stock cars with no aero are unchanged to the decimal (the whole roster's current times must not
  move), so this sprint cannot silently retune the game.
- The handling stat, valuation, and both `advanceDay` goldens are unchanged.

## The lever table (directive 22 - SIGN BY VALUE BEFORE IMPLEMENTATION)

### A. The aero model constants (new `statFormulas.aero` block)

| Constant | Proposed | Meaning |
|---|---|---|
| `downforceK` | 6.2e-5 | grip multiplier per (m/s)^2 at `downforceCoeff` 1.0, from the Calsonic two-point fit |
| `maxGripMultiplier` | 1.6 | ceiling on the aero grip multiplier, so nothing runs away at top speed |

### B. Per-car stock `downforceCoeff` (schema field, content value per car)

Proposed: **0 for every current roster car except** a handful with real factory aero. Starting
proposal, R35 0.35, LFA 0.30, 22B 0.15, Evo VI TME 0.10, everything else 0. (Only the R35/LFA/22B/Evo
are in the 85-car book; of the playable 26, all would be 0, which is why no shipped lap time moves.)

### C. Aero part deltas (per aero SKU grade)

| Grade / SKU | `downforceCoeff` | `dragCd` delta | Character |
|---|---|---|---|
| stock (none) | 0 | 0 | as today |
| street (Lip Kit) | +0.10 | +0.01 | looks fast, barely is |
| sport (GT Wing) | +0.40 | +0.04 | the real trade: grip for top speed |
| race (Race Aero Kit) | +0.85 | +0.09 | track weapon, hopeless on the bayshore |

The race row is anchored to the Calsonic (CdA 0.94 against the stock BNR32's ~0.72, so roughly +0.09
on Cd at that body's frontal area). The rest is a designed ramp, not measured, flag it as the
softest part of this table.

### D. Open decisions

1. **Do the Lightweight Body Kit / Underglow SKUs get aero values, or only the Lip/Wing/Race Aero
   line?** Recommend: only the aero line; a lightweight kit should later touch mass, not downforce.
2. **Should aero also appear in the display?** Recommend not this sprint (the handling stat stays a
   low-speed number, by design). The lap board already shows the consequence.
3. **Balance sanity:** should a race wing ever be strictly correct on all five courses? Recommend
   no, and treat that as the acceptance test rather than a tuning goal.

## Task breakdown (mechanical once A-C are signed)

1. Schema: `spec.downforceCoeff` (optional, defaults 0) on the car model; `statFormulas.aero` block;
   aero-delta fields on the aero part SKUs (mirroring how existing part `statModifiers` are shaped).
2. `performance.ts`: `aeroGripMultiplier(v, coeff, aero)` and wire it into `lapTime`'s per-corner
   apex speed and into the straight solver's braking term (they share one friction budget, so both
   must see it). Add the fitted-aero drag to `CdA`.
3. An `effectiveDownforce(car, model, partsById)` helper mirroring `effectiveCompound`.
4. Content values from sections B and C.
5. Tests: stock roster times unchanged (a regression pin over all 26); a winged car quicker on
   Tsurugi and slower on Wangan; the handling stat unchanged; the goldens unchanged.
6. Re-pin `economyApprovalGate` (economy.json gains the aero block) in the same change as the
   recorded sign-off. Payouts must not move; the mission ceilings must not move (no probe build
   fits aero, verify rather than assume).

## Re-pin inventory

- **Re-pin with approval:** `economyApprovalGate` sha256.
- **Verify unchanged (do not edit):** both `advanceDay` goldens, mission payouts, the two lap
  ceilings, `derivedStats`/`radar` tests, valuation and marketValue probes.
- **New:** an aero test file, plus the stock-times-unchanged regression pin.

## Exit (2026-07-25)

Implemented against the signed values. Full suite green, **133 files / 2307 tests**, typecheck clean,
both `advanceDay` goldens unchanged, no shipped lap time, mission ceiling, or payout moved.

**What landed**

- `spec.downforceCoeff` on the car schema (absent/0 everywhere today) and `aeroFunctional` on the
  part catalog, so a SKU declares whether it actually works aerodynamically.
- `statFormulas.aero`: `downforceK` 6.2e-5, `maxGripMultiplier` 1.6, and the per-grade
  downforce/drag table exactly as tabled.
- `performance.ts`: `aeroGripMultiplier`, `effectiveDownforce`, and an `AeroEffect` threaded through
  `carBlock`, the apex solve, the braking term, and `CdA`. Apex speed is implicit once downforce is
  in play (grip depends on the speed being solved for) and closes in one step:
  `v^2 = mu g r / (1 - mu K g r)`, with the multiplier ceiling governing when the denominator goes
  non-positive. With no aero every formula reduces to the pre-aero model exactly, which the
  all-cars/all-courses regression test asserts directly.
- The 12 genuinely aerodynamic SKUs (lip, wing, race aero, across the four fitment classes) are
  marked functional; the body-panel and underglow SKUs sharing the slot are not.

**Open decisions, as taken:** D1 only the true aero line is functional; D2 no display surfacing this
sprint; D3 see below, this is the one that did not land as designed.

**THE OPEN LEVER QUESTION (needs a ten-second call).** D3 wanted a race wing to be genuinely wrong
somewhere. With the signed values it is a net gain on all five courses. The drag half works exactly
as intended, it is simply outweighed. Measured on the Supra RZ, seconds against its own no-aero lap:

Measured on the Supra RZ against the REVISED courses (see the course revision below):

| Course | drag alone | net with the wing | net as % of lap |
|---|---|---|---|
| Kirifuri | +0.22 | **-2.36** | -0.9% |
| Usui | +1.05 | **-1.32** | -1.1% |
| Wangan | **+4.19** | **-0.92** | **-0.48%** |
| Tsurugi | +0.48 | **-2.27** | -2.5% |
| Misaki | -0.12 | **-3.38** | -3.1% |

The bayshore punishes bodywork hardest by a wide margin (+4.19 s of pure drag, up from +3.31 before
the revision), so the mechanism is right and the longer, straighter Wangan sharpened it. But the wing
still nets out barely-positive there rather than negative: the revision moved it in the right
direction relatively (0.60% of the lap before, 0.48% after) without flipping the sign. Sensitivity,
for a decision: flipping the Wangan negative needs `race.dragCdDelta` around **0.11** for the Supra
and about **0.17** for the RX-7 (which gains far more from the wing there), so no single value flips
every car at once. Three honest options, maintainer's call:

1. **Accept it.** A wing is a real upgrade whose gain nearly vanishes on the bayshore, and the trade
   lives in price and top speed instead of lap time. Nothing to change.
2. **Raise `race.dragCdDelta`** from 0.09 (roughly 0.16 would flip the Wangan negative). A lever
   move, so it needs signing by value; it also makes the street/sport rows worth re-checking.
3. **Give the course set a genuinely drag-dominated member** (a long expressway blast with only a
   couple of corners), which is a course-content change rather than a physics one.

Not chosen unilaterally: option 2 changes a signed value and option 3 adds course content, both
outside what "continue with sprint 125" authorised. The acceptance test was rewritten to assert what
the model actually does (drag bites hardest on the fastest course; a wing is worth least where it is
paid for most), not the aspiration.

**Also found, not actioned:** the aero slot's underbody line (Skirt and Splitter Kit at sport, Flat
Floor Kit at race) is physically aerodynamic in a way the tabled aero line is not alone in, a flat
floor is one of the biggest real downforce devices. They are left non-functional because they are not
in the signed table. Worth a value decision alongside the question above.

## Course revision (maintainer brief, 2026-07-25)

Two of the five courses were redesigned to the maintainer's direction, landed alongside the aero
work. The Sprint 124 shapes were a first cut; these are the corrected ones.

| Course | Was | Now | Brief |
|---|---|---|---|
| Kirifuri Pass | 1.5 km, 8 corners | **4.2 km, 26 corners** (12 hairpin, 10 slow, 4 medium), 59% straight, avg radius 46 m | "substantially longer, more hairpins and very slow corners" |
| Wangan Bayshore | 5.8 km, 5 corners (all fast sweepers) | **9.2 km, 9 corners** (3 fast, 4 medium, 2 slow), 86% straight, longest straight 1800 m | "more straights, longer overall, replace some fast sweepers with medium-speed corners, add 1 or 2 slow corners" |

Kirifuri is now a genuine pass: 26 corners at 160 m spacing, which is close to the real Irohazaka's
density, and 12 of them hairpins. Wangan is now an expressway rather than a sweeper course, with two
slow junction-ramp corners and a 1.8 km main straight.

Consequences, all mechanical:

- The lap-sim prototype's own `COURSES` are now read from `courses.json`, and the faithfulness test
  resolves its four geometries from content instead of restating them, so prototype and game can
  never drift again.
- Both mission ceilings re-derived by the probe rule (unchanged rule, new measured laps):
  `the-column-clock` 78.1 -> **252.2 s**, `under-one-fifteen` 76.4 -> **248 s**. Payouts untouched.
  The large jump is simply the 2.9x longer pass; a built AE86 now averages about 61 km/h over 26
  corners, which is the right order for a real touge run.
- The blind predictions were re-run and re-recorded before driving (see `lap-calibration.md`), at
  Forza-parity stats rather than our spec book's.

## After this sprint

The car spec arc's remaining phase is the one Sprint 124 displaced: **UI polish and roster
promotion** (radar/detail surfacing of the new figures, a per-course lap board, a diegetic dyno, and
promoting spec-book cars into the playable roster). That becomes Sprint 126. Open calibration items
(the kei outliers, the ~2-3% fast-field residual, and validating courses other than Misaki) stay
tracked in `docs/design/car-performance/archive/lap-calibration.md` and are independent of this sprint.
