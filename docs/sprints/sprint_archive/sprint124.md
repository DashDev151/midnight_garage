# Sprint 124 - Rebuild lap on grip + pace (the timing half)

**Status: IMPLEMENTED, ready for review. Lever table sections A and B signed by the maintainer
2026-07-25 ("section A signed off", all five courses ship, integrate now, aero next sprint). See the
Exit at the foot of this doc.** This is the second half of the car-spec arc
(`docs/design/car-performance/archive/car-spec-integration-plan.md`): Sprint 123 made handling = grip + balance; this sprint
replaces the placeholder lap formula with the calibrated grip+pace model. The physics is calibrated
against the Forza gold standard (`docs/design/car-performance/archive/lap-calibration.md`, main field +/-3%); the prototype
lives in `docs/design/car-performance/lapsim/`.

## Why this is not yet implemented

Per directive 22 and the arc's own rule ("each sprint presents its own lever table for sign-off
BEFORE implementation"), the new pace/lap/course constants that replace `economy.lapModel` are
approval-gated levers. A general "execute the integration" does not authorise picking them. They are
proposed below with their calibrated values for a one-pass sign-off. Two further reasons to pause at
the wall rather than push through: the model is still batch-1 calibrated (kei outliers and a ~2-3%
fast-field residual are open, see the calibration doc), and the mission ceilings derive from it, so
signing off now means accepting that a later calibration pass re-derives those two numbers.

## Reuse analysis (directive 16)

**New mechanisms (genuinely absent today):**

- `computePace(model)` - a straight-line/acceleration measure from real power-to-weight shaped by the
  torque-curve archetype (top-end vs tractability). Ported from the prototype's `carBlock` + straight
  solver.
- A **course model**: corner/straight profiles. Today lap time is course-independent (`courseId` is
  cosmetic, confirmed in code). A real lap needs course shape so grip and pace trade off.
- `lapTime(model, course)` = corner time (from grip) + straight time (from pace) + the launch and
  agility terms - the quasi-static point-mass sim, ported verbatim from the calibrated prototype.
- Speed-dependent aero (`downforceCoeff`, `aeroGrip = coeff * v^2`) - **deferred to a follow-up
  (124b)**; ~0 for every stock car, so it changes no stock lap. Keeping it out of this sprint keeps
  the surface small.

**Existing mechanisms to REUSE (do not rebuild):**

- `performance.ts`: `computeGrip`, `balanceOf`, `gripToDisplay`, `drivetrainOf`, `enginePositionOf`,
  `trackOf`, `effectiveCompound` (Sprint 123, signed). Pace consumes `computeGrip`'s raw uncapped g
  for cornering. **DO NOT touch these functions** - they feed the handling stat and (via handling)
  `valuation.ts`, so changing them moves the `advanceDay` goldens. This sprint is lap-time-only.
- `lapModel.ts`: keep the **public signature** `lapTimeSecondsFor(car, model, context): number | null`
  and the `LapBoardRow` / `LapReferenceCar` shapes and `selectBoardRows`. Only the internal formula
  changes, so the store (`lapBoardRowsFor`), the board UI (`ServiceJobsScreen.vue`), and the null
  ("no tyres") contract are untouched.
- `requirements.ts`: `lapTimeCeiling` kind and `evaluateLapTimeCeiling` unchanged (still call
  `lapTimeSecondsFor`). `courseId` becomes real (selects the course) instead of cosmetic.
- `storyMissionProbes.test.ts`: the formula-on-probe rule (`ceil1AtTwoPercentSlower`) is unchanged; it
  re-derives both ceilings automatically from the new measured laps.
- `lapReferences.json` + its schema: keep the 12-pool + 1-anchor mechanism; times recompute live.
- The tyre grade -> compound -> grip path (`effectiveCompound`): the fitted tyre already changes grip;
  reuse it. No separate lap-only tyre term (delete the old `gripMult` table).

## Goal / definition of done

- `lapTimeSecondsFor` returns a grip+pace lap on a real course; the old
  `C * (weight/power)^ratioExp * gripMult[grade]` formula and its `economy.lapModel` block are gone.
- Lap is course-dependent: a grippy light car wins a twisty course, a powerful low-drag car a fast one.
- The two mission ceilings (`the-column-clock`, `under-one-fifteen`) re-authored to the new model,
  re-derived by the probe rule (mechanical, no free choice).
- The reference board still renders; reference cars retuned if needed so the board spans sensibly.
- All checks green. Goldens verified unmoved (lap-only; handling untouched) by running the files.
- Model reproduces the Forza main field within the calibrated tolerance.

## The lever table (directive 22 - SIGN, BY VALUE, BEFORE IMPLEMENTATION)

Grouped by confidence. Grip constants are already signed (Sprint 123) and unchanged.

### A. Pace/lap physics constants (calibrated against Forza; proposed = the prototype values)

| Constant | Proposed | Meaning |
|---|---|---|
| `eta` | 0.88 | driveline efficiency (crank -> wheel) |
| `rho` | 1.2 | air density |
| `f_roll` | 0.012 | rolling resistance |
| `k_AWD` | 0.66 | AWD launch-traction fraction |
| `a_capK` | 0.70 | RWD/FWD launch cap coefficient (cap = a_capK * mu) |
| `k_agi` | 0.5 | agility/transition per-corner weight |
| `a_cruise` | 0.12 | coast threshold (m/s^2) |
| `v_full` | 33 | speed (m/s) where power delivery saturates |
| delivery factors x9 | plainNA 1.0, bigNA 1.0, superch 0.98, seqTwin 0.90, parallelTwin 0.85, seqTwinR 0.85, vtecNA 0.88, rotaryNA 0.82, singleTurbo 0.78 | corner-exit pull by engine archetype |

Note: `eta` and `k_agi` are flagged first-pass; the fast-field ~2-3% residual would most cleanly close
by nudging `eta` (0.88 -> ~0.92) but that moves every course, so it is called out for an explicit
decision rather than fitted silently.

### B. Course definitions (FIRST-PASS design geometry, not gold-standard calibrated)

The physics is Forza-calibrated; the four in-game course *shapes* are the prototype's invented
archetypes (we have no Forza times for them, only for Legend Island). They are `[radius m, angle deg,
straight m]` segment lists in `docs/design/car-performance/lapsim/lapsim-report.cjs` (Touge / Mountain / Wangan /
Circuit) plus the calibrated Legend Island. **Decisions for the maintainer:**

1. Which courses ship in the game? (Recommend the four archetypes for variety; Legend Island stays a
   calibration reference only.)
2. Which course backs each lap mission? (Currently both say "kirifuri", cosmetic. A twisty course
   suits `the-column-clock`, a faster one `under-one-fifteen`, or keep one course for both.)

### C. Grip->corner / pace->straight mapping

The prototype's `lap()` assembles corner time = `arc / min(sqrt(mu*g*r), v_top)` plus the agility term,
and straight time from the marched accel/brake solver. No extra mapping constants beyond section A;
this is structural, signed implicitly by signing A + B.

### D. Derived, mechanical (NOT free choices - recomputed at implementation)

- `the-column-clock` maxSeconds: currently 83.1; re-derives as `ceil1AtTwoPercentSlower(new AE86 lap)`.
- `under-one-fifteen` maxSeconds: currently 71.8; re-derives as `ceil1AtTwoPercentSlower(new FD3S lap)`.
- `lapReferences.json` reference cars: retune PS/kg only if the board no longer straddles sensibly.

### E. Non-economy display constant (noted, not a lever)

- `RADAR_POWER_REFERENCE_PS` 500 -> ~560 (real power now tops at the LFA's 560; game constants file).

## Task breakdown (all Claude-implementable once A+B signed)

1. Port `computePace` + the straight/corner solvers + `lapTime(model, course)` into `performance.ts`
   (or a new `lapModel` internal), reading the section-A constants from a new `economy.performance`
   content block. Unit-test each against the prototype's published numbers so the port is provably
   faithful.
2. Add the course content (section B) + a `CourseSchema` in `packages/content`.
3. Rewrite `lapTimeSecondsFor` internals to call `lapTime(model, course)` with the requirement's (now
   real) `courseId`; delete `lapTimeFromRaw`, the `economy.lapModel` block, and the `gripMult` table.
4. Rewrite `lapModel.test.ts` for the grip+pace shape (the `84.9` sanity pin and `expectedLapTimeSeconds`
   are formula-restatements that must be rebuilt).
5. Run `storyMissionProbes`; read the re-derived ceilings; re-author `storyMissions.json` 83.1 / 71.8.
6. Bump `RADAR_POWER_REFERENCE_PS`; re-pin `economyApprovalGate` sha256 (economy.json changes) in the
   same change as this doc's signed table; verify no payout moved.
7. Verify the `advanceDay` goldens (`d0e2394e`, `509aa1f1`) by running the file - they must NOT move
   (lap-only); if they do, a handling coupling leaked and must be found, not re-pinned.

## Re-pin inventory (from the code audit)

- **Re-author (mechanical):** `storyMissions.json` `83.1`, `71.8`.
- **Rewrite:** `lapModel.test.ts` (formula shape changes).
- **Re-pin with approval:** `economyApprovalGate` sha256 (economy.json gains `performance`/course
  block, loses `lapModel`). Payouts UNCHANGED (independent of lap time) - verify, do not edit.
- **Auto-adjust, verify only:** `requirements.test.ts` (lap case, runtime-measured),
  `missions.test.ts` (lap tip, runtime-measured), `storyMissionProbes` stat/taste pins,
  `derivedStats.test.ts`, `radar.test.ts`.
- **Must NOT move (confirm by running):** `advanceDay.test.ts` goldens `d0e2394e` / `509aa1f1`;
  `valuation`/`marketValue` (lap time never feeds value; only the untouched handling stat does).

## Open decisions for the maintainer

1. **Integrate now, or finish calibration first?** The main field is +/-3%; the two probe cars
   (AE86, FD3S) are well inside it, so the ceilings are trustworthy to ~+/-3% and would re-derive on a
   later pass. Recommend: integrate now (physics is sound), accept a later ceiling re-derive.
2. **Sign section A as-is, or close the ~2-3% fast residual via `eta` first?** (A one-line change, but
   global.)
3. **Section B:** which courses ship, and each lap mission's course.
4. **Aero (124b) now or later?** Recommend later (zero stock impact).

## Exit (2026-07-25)

Signed and implemented in one pass. The old placeholder lap formula is gone; lap time is now the
Forza-calibrated grip-and-pace model over a real course.

**Maintainer sign-off:** section A as proposed (no `eta` change). Section B: all five courses ship,
the four archetypes plus the calibrated ex-Legend-Island flagship, named **Misaki International
Raceway** (`misaki`), a coastal cape circuit. Both lap missions stay on Kirifuri. Integrate now;
aero deferred to the next sprint.

**What landed**

- **Content.** `spec.widthMm`/`heightMm` (real published dimensions, all 26 cars) so frontal area,
  and therefore drag, is real rather than class-estimated. New `courses.json` + `CourseSchema` with
  the five courses; wired through `data.ts` and the sim context (`courses`, `coursesById`). New
  `statFormulas.pace` block carrying every signed section-A constant; the old `lapModel` block
  deleted from both schema and data.
- **Model.** `performance.ts` gains `lapTime(model, course, powerPs, compound, economy)` plus
  `frontalAreaM2` and `deliveryArchetype`: the quasi-static point-mass sim (grip-limited apex speeds,
  the marched accel/brake straight solver with real drag, the launch-traction ceiling, the
  torque-delivery ramp, and the agility term). It reuses the signed Sprint 123 `computeGrip`
  untouched. Every lever reads from content; only numerical-method details are local.
- **Faithfulness proof.** `lapModelPace.test.ts` pins the port against the prototype
  (`docs/design/car-performance/lapsim/`) across six cars spanning every delivery archetype on four courses: all 24
  car-course pairs match to **0.000 s**.
- **Consumers.** `lapTimeSecondsFor(car, model, context, courseId)` now resolves a real course
  (returns null for an unknown one, alongside the existing no-tyres/scrap contract). `courseId` is
  live everywhere instead of cosmetic. The reference board times its entries on the mission's own
  course via a neutral reference chassis, so the board retunes itself per course; row shapes,
  straddle selection, and the UI are untouched. `earnsTip` now times each ceiling on its own course,
  so a future multi-course mission cannot conflate two times. `RADAR_POWER_REFERENCE_PS` 500 -> 560.

**Levers moved:** exactly those signed (section A's constants; the five course definitions). Mission
payouts and budget caps: **unchanged**, verified, they derive from build cost, not lap time.

**Re-derived, not chosen:** the two lap ceilings, by `storyMissionProbes`'s own
`ceil1AtTwoPercentSlower` rule from freshly measured probe builds. `the-column-clock` 83.1 -> **78.1**
(the AE86 probe is quicker on the real model), `under-one-fifteen` 71.8 -> **76.4** (the FD3S probe is
slower). Both missions still pass their probe builds, so the campaign remains satisfiable.

**Checks:** full suite green, **132 files / 2292 tests**, typecheck clean. The `advanceDay` goldens
`d0e2394e` and `509aa1f1` are **unchanged and passing**, which is the evidence that this stayed
lap-only and never leaked into the handling stat or valuation. `economyApprovalGate` re-pinned in
this same change with the approval recorded; `schemas.test.ts`'s top-level anchor list drops
`lapModel`. `lapModel.test.ts` rewritten for the new shape (relationship assertions, not magic
numbers): null contracts, determinism, course-dependence, and monotonicity in power, weight, and
tyre grade, plus the sanity that power buys more on the bayshore than on a tight pass.

**Known follow-ups (not regressions):** the kei outliers and the ~2-3% fast-field residual from the
batch-1 calibration remain open in `docs/design/car-performance/archive/lap-calibration.md`; a later calibration pass would
re-derive the two ceilings again, mechanically. Aero (`downforceCoeff`, speed-scaled) is Sprint 125.
