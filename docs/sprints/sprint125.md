# Sprint 125 - Aero: downforce that grows with speed, and the drag it costs

**Status: DESIGNED, awaiting the maintainer's sign-off on the lever table (directive 22) before
implementation. 2026-07-25.** The third phase of the car spec arc, deferred out of Sprint 124 by the
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

## After this sprint

The car spec arc's remaining phase is the one Sprint 124 displaced: **UI polish and roster
promotion** (radar/detail surfacing of the new figures, a per-course lap board, a diegetic dyno, and
promoting spec-book cars into the playable roster). That becomes Sprint 126. Open calibration items
(the kei outliers, the ~2-3% fast-field residual, and validating courses other than Misaki) stay
tracked in `docs/design/lap-calibration.md` and are independent of this sprint.
