# Car spec arc: the rebuild architecture

**Status: PROPOSAL for maintainer review (2026-07-24). Supersedes the earlier thin draft.**

## Principle (the law)

The `cars.json` spec sheet (real figures), the grip model, and the torque curves in
`docs/design/car-spec-book.html` are the ground truth. Every performance quantity the game shows or
grades against, the handling readout, cornering grip, straight-line pace, lap time, is DERIVED from
that sheet, not from a proxy. The old lap-time model is stripped. Value keeps its `bookValueYen`
anchor (economy bible) unless the maintainer decides otherwise (see Open Decision 1).

## What the audit established (so we build on fact, not assumption)

- **Three** spec fields are read anywhere in the sim: `stockPowerPs` (power stat),
  `curbWeightKg` (handling term + lap), `yearFrom` (auction/coherence age). Everything else the
  Sprint 122 schema added is dormant.
- The sim has **no** grip, cornering, acceleration, top-speed, or torque-curve concept. Handling =
  `handlingBase x fraction - curbWeightKg / divisor`. Lap = `round1(C x (weightKg/powerPs)^ratioExp
  x gripMult[tyreGrade])`, course-independent (`courseId` is cosmetic).
- Derived stats are a 5-axis `StatBlock` (power, handling, style, reliability, authenticity). They
  feed only: the taste multiplier on value (+/-12%), lap time, and the radar UI.
- Market value is stat-blind by design; lap never touches money.
- Lap consumers: two story missions (`the-column-clock` <=83.1s, `under-one-fifteen` <=71.8s), the
  overdelivery tip, and the reference-lap board UI. Reference data: `lapReferences.json` (12 pool +
  1 anchor).
- Story-mission thresholds are hand-authored but locked by `storyMissionProbes.test.ts` to a
  formula-on-probe-build rule (`floor90` of a measured stat, `ceil1AtTwoPercentSlower` of a measured
  lap, etc.). Change the formula shape and every lap/stat pin plus the 10 authored payouts move.

## What gets ADDED (the new baseline)

1. **A performance model in `packages/sim`** (new module, `performance.ts`), pure and deterministic,
   reading the spec sheet:
   - `computeGrip(model)` -> lateral g, ported verbatim from the signed-off artifact
     (compound[era x tyre-tier x width] x CoG-transfer x drivetrain-layout, mass-independent).
   - `computePace(model)` -> a straight-line/acceleration measure from real power-to-weight and the
     torque curve (peak power, delivery).
   - `torqueCurve(model)` -> the archetype delivery curve (sequential-twin valley, VTEC lift, turbo
     step) for pace shaping and for the diegetic dyno.
   - a new `lapTime(model, course)` built from grip (corners) + pace (straights), replacing the
     stripped formula.
2. **New content: the performance constant tables** (grip + lap), Content-Law-2 tunables, so no
   number lives in code. These are levers (directive 22).
3. **Two small schema inputs** the model needs and cannot cleanly infer:
   - `spec.activeYaw: 'attesa' | 'ayc' | null` (additive), replacing the artifact's
     engine-code/name regex with real data.
   - a `course` definition (corner/straight character) so lap time can reflect grip. The current
     model is course-independent; a real lap needs a course shape. Minimal: one course
     (Kirifuri) with a corner/straight weighting; richer later.
4. **Derive helpers** (no new storage): `drivetrainOf(model)` and `enginePositionOf(model)` from the
   layout tag; tyre width and track from `stockTyre`.
5. **A downforce coefficient + the aero bolt-on system** (Sprint 124). A per-car `downforceCoeff`,
   ~0 for nearly every stock car, a small positive for the R35 and LFA. Aftermarket aero parts raise
   it (street lip < GT wing < GT3 package). Its grip contribution is speed-dependent,
   `aeroGrip = downforceCoeff x v^2`, so it is negligible on a slow car and large on a fast one with
   no special-casing. It touches lap time only (there is no speed at skidpad, so it never moves the
   handling stat).
6. **A "race"/slick tyre-compound tier** above "grand", reachable only by fitting a race tyre part,
   so a track build's mechanical grip can exceed the stock 1.08g ceiling (~1.3-1.4g on slicks).

### Grip ceiling and modification headroom

`computeGrip` returns a continuous, UNCAPPED lateral-g value (mechanical grip: compound x transfer x
layout). Stock cars sit 0.66-1.08g. Slicks push mechanical grip to ~1.3g; aero adds
`downforceCoeff x v^2` on top at speed, so a slick + winged + lightened build reaches ~1.8-2.0g on
fast corners. That raw value feeds the lap model (Sprint 124), uncapped. The 0-100 handling STAT is a
separate low-speed display projection of the same grip through the 0.60-1.10g envelope, clamped at
100: stock cars read 12-96, a full track build reads "maxed" (100), and the differentiation above
stock is carried by lap times, not the radar number. The ceiling is respected in the model; only the
display saturates.

## Every system, and exactly how it changes

| # | System | Files | Today | Change |
|---|---|---|---|---|
| 1 | **Spec schema + inputs** | `content/src/carModel.ts` | 3 fields read; no drivetrain/track/activeYaw | Add `activeYaw` (additive optional); add derive helpers for drivetrain/engine-position/track. No migration (directive 19). |
| 2 | **Performance model (NEW)** | `sim/src/performance.ts` (new) | does not exist | Add grip, pace, torque-curve, and the new lap function; unit-tested against the artifact's published numbers so the port is provably faithful. |
| 3 | **Derived stats** | `sim/src/derivedStats.ts` | handling = weight-only; power = real PS | Handling derives from `computeGrip` (scaled to 0-100), still modified by suspension parts + condition. Power stat stays real PS. Style/reliability unchanged (condition/aesthetic, not spec-physical). |
| 4 | **Lap system (STRIP + rebuild)** | `sim/src/lapModel.ts`, `economy.lapModel`, `content/lapReferences.json` | `C x (weight/power)^exp x tyreGrade`, course-independent | Delete `lapTimeFromRaw`; rebuild `lapTimeSecondsFor` on grip + pace + course. Rebuild the 12+1 reference cars on the new model. Keep the board mechanism and the `LapReferenceCar`/`LapBoardRow` shapes so the UI is untouched. |
| 5 | **Missions / requirements** | `sim/src/requirements.ts`, `content/data/storyMissions.json`, `storyMissionProbes.test.ts` | `statThreshold`, `lapTimeCeiling`, `tasteMatch`; thresholds via formula-on-probe | Stat thresholds re-derive automatically (probe rule unchanged) once handling changes; the two lap ceilings are re-authored against the new lap model; probes rewritten for the new shapes. Optional: a `gripFloor` requirement kind if we want missions to grade cornering directly. |
| 6 | **Value / economy** | `sim/src/marketValue.ts`, `valuation.ts` | stat-blind; taste +/-12% reads power/handling | No structural change REQUIRED: the taste multiplier keeps reading the (now grip-driven) handling stat, so a better-handling car is already worth a little more to the buyers who value it. Whether performance should move value MORE than +/-12% is Open Decision 1 (economy-bible amendment). |
| 7 | **Content data** | `economy.json`, `cars.json`, `lapReferences.json` | old `lapModel` + `statFormulas` | Replace `economy.lapModel`; add the `performance`/grip block; retune `statFormulas.handling*`; rebuild `lapReferences.json`; re-author two mission lap ceilings; `cars.json` gains `activeYaw` on the ~6 cars that have it. |
| 8 | **UI** | `game/.../StatRadar.vue`, `utils/radar.ts`, `constants.ts`, `ServiceJobsScreen.vue`, `CarDetailScreen.vue` | radar (5 axes), lap board, `RADAR_POWER_REFERENCE_PS=500` | Radar handling axis now reflects grip (no code change, new values). Bump the power reference (real power tops out at 560, LFA). Lap board reads the new model unchanged (same row shape). Optional: a diegetic dyno (torque curve) and a grip/pace line on car detail. |
| 9 | **Tests / probes** | see Re-pin inventory below | | Rewrite `lapModel.test`; re-derive `storyMissionProbes`; re-pin the two `advanceDay` goldens, the `economy.json` sha256 + 10 payouts, the four `auctionRoomDemo` literals; formula-shaped value/coherence probes rewritten only where a formula shape changes. |
| 10 | **Coherence / balance** | `coherence.test.ts`, `tools/balance` (suspended) | Laws 1/2/3 formula-shaped | Self-adjust to lever moves; re-checked because value is touched via handling->taste. Balance harness stays directive-21-suspended. |

## The fan-out (dependency-ordered sprints)

Reshaped by the resolved decisions below: value stays stat-blind (no coupling sprint), handling
carries a balance nuance, and lap is a proper pace-plus-grip model across several courses. Each
sprint lands one layer, is separately testable, and presents its own lever table for sign-off BEFORE
implementation (directive 22). The order is forced by dependency: nothing grades against the model
until it exists and is proven faithful.

- **Sprint 123 - Handling becomes grip + balance (the cornering half).** Port the signed-off grip
  model and `balanceOf` into `packages/sim` as pure functions; add the `activeYaw` schema flag and
  the drivetrain/track derive helpers; land the grip and balance constant tables in content. Rewire
  the `derivedStats` handling axis: `handling = f(grip, balance)` scaled to 0-100, still modified by
  suspension parts and condition. Grip's own numbers are already locked (the artifact), so this
  sprint's genuinely NEW levers are small: the handling 0-100 mapping and the balance weighting.
  Re-pins: `derivedStats.test`, `radar.test`, the two `advanceDay` goldens (handling -> taste ->
  sale price -> career state), `economyApprovalGate` (sha256 + payouts re-derive), `storyMissionProbes`
  (moved stat thresholds).
- **Sprint 124 - Rebuild lap on pace + several courses (the timing half).** The big new design.
  Add `computePace(model)` from real power-to-weight shaped by the torque curve (top-end vs
  tractability), define several courses as corner/straight profiles, and build
  `lapTime(model, course) = cornerTime(grip, tractability) + straightTime(topEnd)`. Delete the old
  `C x (weight/power)^exp` formula. Rebuild `lapReferences.json` on the new model; re-author the two
  lap-ceiling missions (now course-specific). Levers: pace constants, the torque-curve-to-pace map,
  the course definitions, the lap constants, the two mission ceilings. Re-pins: `lapModel.test`
  (rewrite), `requirements.test` lap case, `missions.test` lap tip, `storyMissionProbes` lap missions,
  `economyApprovalGate`.
- **Sprint 125 - UI polish + roster promotion.** Radar handling reflects grip + balance; bump the
  power radar reference for the real power range (tops at 560); a diegetic dyno (torque curve) and a
  per-course lap board on car detail; promote the three new cars (Eunos Roadster, BCNR33, GDB) and
  then roster batches into `cars.json`. Levers: book values per promoted car.

No performance-to-value sprint: value stays stat-blind. Performance and value both move only when a
PART is fitted (a sport intake lifts pace AND adds installed-parts value), which is already how the
economy works; the performance number never sets the price.

## Levers (directive 22) - the full surface, signed one sprint at a time

- Grip constant table: era-rubber ceilings x9, tyre-tier deltas x5, transfer coef/reference/floor,
  the width term, layout bonuses (passive AWD / active AWD / mid). [Sprint 123]
- Pace / torque-curve constants (power-to-weight scaling, curve archetype shape). [123]
- New lap-model constants + course shape (corner/straight split, grip and pace exponents),
  replacing `C`, `ratioExp`, `gripMult`. [125]
- `statFormulas` handling mapping (grip -> 0-100), replacing `handlingBase`,
  `handlingWeightDivisor`. [124]
- The two re-authored mission lap ceilings; any moved authored stat thresholds (these re-derive
  from the probe rule, but the authored numbers and the 10 payouts change -> `economyApprovalGate`
  re-pin). [124/125]
- Book values for promoted roster cars. [127]
- Non-economy display constant: `RADAR_POWER_REFERENCE_PS` (game constants, not a lever, but noted).

## Re-pin inventory (from the audit, so nothing is missed)

- **Hard hashes (re-pin by hand):** `economyApprovalGate.test.ts` `economy.json` sha256 + the 10
  mission payouts; `advanceDay.test.ts` goldens `d0e2394e` and `3fd7b213`; `auctionRoomDemo.test.ts`
  value literals (209266 / 230354 / 393886 / 252396 and the ratios).
- **Rewritten (formula shape changes):** `lapModel.test.ts` (whole file), `storyMissionProbes.test.ts`
  (handling + lap paths), `requirements.test.ts` lap case, `missions.test.ts` lap tip.
- **Formula-shaped, self-adjust to levers, verify only:** `marketValue.test.ts`,
  `valueModelProbes.test.ts`, `valuation.test.ts`, `valueLedger.test.ts`, `coherence.test.ts`,
  `generationCoherence.test.ts`.
- **Will NOT move (confirmed):** save goldens (`saveCodec.test.ts`) pin serialized blobs, not
  computed stats; derived values are recomputed on load.

## Resolved decisions (maintainer, 2026-07-24)

1. **Performance does NOT move value directly.** Value stays stat-blind. Performance and value are
   linked only through parts: fitting an aftermarket part changes both the car's performance and its
   installed-parts value, which the economy already models. No performance-to-price coupling, no
   economy-bible amendment.
2. **Handling = grip + balance nuance.** The handling axis carries the chassis-balance flavour
   (understeer / neutral / tail-happy) on top of raw grip.
3. **Several courses.** The lap model runs multiple courses with different corner/straight
   characters, so a grippy car wins a twisty course and a powerful car wins a fast one.
4. **The torque curve feeds pace and lap** mechanically, not just the dyno display.

Still open (a calibration convention, not a fork): `comHeightMm` is an honest estimate for most cars
and feeds handling via the transfer term; when a specific car reads wrong we refine that one car's
CoM. Assumed acceptable unless the maintainer objects.
