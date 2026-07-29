# Sprint 34: Mileage-driven generation and single-count condition

*Source: maintainer directive 2026-07-12, following the Sprint 33 value-model audit. Read
`CLAUDE.md` in full first; no em dashes anywhere.*

## Why this sprint exists

The Sprint 33 audit traced every function from raw car to final price and found two structural
issues (neither is circular logic; value is a pure function of static book value plus generation
draws):

1. **Age and mileage were independent random draws at generation.** A 1-year-old car could roll
   180,000 km; a 30-year-old could roll 30,000 km, equal odds. The two price signals (mileage via
   `mileageFactor`, condition via the restoration bill) were uncorrelated, so they added noise
   instead of reinforcing, and the cars themselves were incoherent.
2. **An installed aftermarket part's condition band was counted twice.** It lowered
   `installedPartsValueYen` (via `bandFactor`) AND raised `carCostToMintYen` (the restoration bill
   subtracted from value). A worn aftermarket part was penalized on both sides, the swing exceeding
   the part's own value. Dormant for generated cars (all stock today), live for any player-modded
   car and for every generated car once pre-installed aftermarket parts land.

This sprint makes generation a single causal chain (age sets a mileage range, mileage sets a
condition range, each rolled with its own variance) so mileage is the one coherent wear driver,
and makes condition price exactly once.

## Reuse analysis (directive 16)

**Genuinely new (small):**
- Two content curves: mileage-by-age and condition-by-mileage, plus their two generation helpers
  (`mileageRangeForAge`, `conditionBaselineRangeForMileage`).

**Existing mechanisms to reuse (nothing here is a new system):**
- `generateAuctionCarInstance` / `interpolateCurve` / `bandForMigratedCondition` /
  `CAR_CONDITION_JITTER`: the same generation machinery, fed new inputs. The Sprint 33
  age->condition curve is **replaced**, not added alongside (single-system rule, directive 4/16).
- `mileageFactor` (value side) and `carCostToMintYen` (restoration bill): unchanged. Mileage stays
  the sole value driver via `mileageFactor`; condition reaches price only via the bill.
- `installedPartsValueYen`: the same function, minus the band double-count.

**Not a save-schema change:** `CarInstance` already carries `year`, `mileageKm`, and per-part
`band`, so there is **no Dexie bump and no migration**. Golden-master seed hashes re-pin because
generation output changes; the golden SAVE test is unaffected.

## Design decisions (locked 2026-07-12)

1. **Causal chain.** `year -> ageYears -> mileage range -> roll mileage -> condition range -> roll
   condition baseline -> per-part jitter`. Age influences nothing downstream except the mileage
   range, and stays absent from all value math (audit-confirmed: reg year is in zero value
   computations).

2. **Mileage-by-age curve (km), rolled uniformly in-range.** 1990s Japan centres ~9-10k km/yr,
   low by world standards because of the shaken inspection regime, with wide variance and a
   high-use tail:
   `[0]: 0-3,000; [1]: 1,000-12,000; [2]: 5,000-30,000; [4]: 12,000-55,000; [8]: 35,000-105,000;
   [12]: 55,000-150,000; [20]: 90,000-230,000`. Linear-interpolated, clamped outside the ends.

3. **Condition-by-mileage curve (percent, pre-jitter).** `[0km]: 70-98; [20k]: 58-95; [60k]:
   45-88; [120k]: 33-78; [200k]: 22-68`. The per-car baseline is rolled in this range, then each
   part jitters +/- `CAR_CONDITION_JITTER` (15) as today.

4. **Double-count fix (option A): the restoration bill is the single place condition is priced.**
   `installedPartsValueYen` values an aftermarket part at its full retained mint worth
   (`priceYen * partsRetention * genuineMultiplier`), with **no `bandFactor` discount**; a `scrap`
   aftermarket part contributes zero (it cannot be restored, and the bill already replaces it at
   stock price). Condition then flows to price only through `carCostToMintYen`. Chosen over the
   alternative (bill excludes aftermarket parts, `installedPartsValue` keeps the band discount)
   because it leaves the more-central bill untouched and matches what the player sees: the repair
   bill is the tangible cost of condition.

## Definition of Done

- Generation: young cars are low-mileage and mostly good condition; old cars high-mileage and
  worse. A seeded test asserts mileage rises with age and condition falls with mileage.
- Every car-generation path (auction lots and any service-job customer-car generation) uses the
  new chain; there is no remaining flat `rng.int(30_000, 180_000)` mileage draw and no remaining
  age->condition path.
- Age appears in no value computation (unchanged; still clean).
- A worn aftermarket part is penalized exactly once: a test shows `installedPartsValueYen` no
  longer band-discounts and that restoring the part raises value only through the shrinking bill.
- Full gate green; balance harness re-run, all hard invariants pass (watch days-to-`local` and the
  auction steal tail, since a wider young/old value spread can move both); golden hashes re-pinned;
  economy movement documented as expected, not a regression.

## Tasks (Claude-implementable)

- [x] Content + schema: the two curves in `economy.json`; `economy.ts` schema (rename the
  age->condition curve fields to the mileage->condition ones, add the mileage-by-age curve; reuse
  the existing `CurveSchema`, relaxed so a curve's `y` can be 0 for the km-floor curve).
- [x] Sim generation: rewire every generation path to `age -> mileage -> condition` (all paths
  route through the single `generateAuctionCarInstance`); replace `conditionBaselineRangeForAge`
  with `conditionBaselineRangeForMileage` + new `mileageRangeForAge`; roll `mileageKm` from the age
  curve instead of the flat `rng.int(30_000, 180_000)`.
- [x] Sim value: `installedPartsValueYen` de-dup (option A) + removed the now-unused `bandFactor`
  import (it was this file's only use).
- [x] Tests per DoD: age/mileage/condition correlation; installed-parts de-dup; golden hashes
  re-pinned; existing installed-part value tests updated for the dropped band discount.

## Deferred / flagged (not in this sprint)

- **`stepCostYen` (per-grade repair cost) is stock-calibrated and does not scale with part value**,
  so wear on expensive aftermarket parts is cheap to fix. A separate content-calibration question
  for the balance pass (add to `TODO.md`), not fixed here.

## Exit

Implemented and verified 2026-07-12. Both changes landed as designed:

- **Generation is now the single chain** `year -> age -> mileage range -> roll mileage -> condition
  range -> roll condition -> per-part jitter`. The flat `rng.int(30_000, 180_000)` mileage draw and
  the Sprint 33 age->condition curve are both gone. All generation routes through the one
  `generateAuctionCarInstance` (service-job customer cars and the dev grant both call it), so there
  is no second flat-mileage or age->condition path. `CurveSchema`'s `y` was relaxed
  `positive() -> nonnegative()` to admit the `[0, 0]` new-car mileage floor (safe: the only other
  consumer, `mileageFactorCurve`, is all-positive).
- **Condition is priced exactly once.** `installedPartsValueYen` dropped the `bandFactor` discount
  (import removed; `bandFactor` still used legitimately in `bands.ts`/`derivedStats.ts`) and now
  skips `scrap` aftermarket parts; a part's band reaches value only through the restoration bill.

Verification (all shown, all green): typecheck; lint; format; `pnpm test` 760 passing; `pnpm build`;
`pnpm test:coverage` above thresholds. Golden hashes re-pinned `9dfc95d8 -> 10108ea2` (30-day career)
and `6dfec42b -> 2261bd6a` (acquisition-and-sale), purely from the generation-order/output change.

Balance harness (all hard invariants PASS): days-to-`local` p50 = 12.0 (in [10,35], holds from
Sprint 33); buyout share 0.0%; no strategy below the sanity floor. Expected, welcome movement: the
auction steal tail fell 79.6% -> 65.8% with contested/frenzy wins rising 16% -> 26%, because coherent
young-car generation (low mileage + good condition) raises their reserves and makes them harder to
steal. The steal tail is still above the informational [5,15]% target, so the deeper auction-contest
tuning remains a separate deferred item (`TODO.md`); Sprint 34 moved it in the right direction as a
side effect, it did not aim to close it.

Deferred out of this sprint (now in `TODO.md`): `stepCostYen` is stock-calibrated and does not scale
with part value, so wear on expensive aftermarket parts is cheap to restore relative to the value
recovered, a calibration question, not a bug, dormant until player mods or pre-installed aftermarket
parts exist.
