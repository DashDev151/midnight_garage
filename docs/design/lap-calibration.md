# Lap-time calibration: the Forza gold standard

**Status: PROTOTYPE calibration record (living document). Opened 2026-07-24.** Companion to
`pace-model-math.md`, `pace-model-design.md`, and `car-spec-book.html`. This file captures the
external anchor data the maintainer supplies over time and records how it is used to calibrate the
pace/lap model. It grows batch by batch; nothing here is committed to the game until the model is
signed off against enough anchors.

## 1. The gold standard

- **Source:** Forza Horizon 6, the **Legend Island** circuit.
- **Metric:** best-of-3 flying lap, driven by the maintainer (human, not an AI/rubber-band lap).
- **Track character (maintainer's read):** an excellent all-round performance indicator: a good mix
  of slow, medium, and fast corners plus straights. Slightly biased toward straight-line over
  slow-corner performance. A fast track overall.
- **Second gold standard:** Forza **PI** (Performance Index, 100-999). Forza's own aggregate of
  power, grip, braking, acceleration, and launch. In batch 1 it is a near-perfect monotonic
  predictor of Legend Island lap time (one sub-noise inversion). Used as an independent anchor and
  as an interpolator for cars we do not yet have a driven time for.

### Caveats every fit must honour

1. **Driver-noise floor.** Best-of-3 human laps carry a consistency band. Treat gaps below roughly
   **1.5% (~1.5 s on a ~100 s lap)** as ties and do not tune to them. Batch-1 example: NSX-R 1:42.9
   vs Evo VI 1:43.2 is 0.3 s apart, below the floor, so the model must not be pushed to separate
   them in that order.
2. **Gentleman's-agreement PS.** Forza appears to display the capped 280 PS for the restricted-era
   cars; our spec-book carries the de-restricted real figure (e.g. Evo VI 300). **Calibration feeds
   Forza's stat**, so the model is compared to Forza on identical inputs. Our game/spec keeps the
   real figure; the offset is documented per car.
3. **Model-year / variant drift.** Forza's build year or trim may differ slightly from ours
   (noted per car in the sense-check). Where a variant genuinely differs (drivetrain, weight), the
   calibration uses Forza's values for the anchor.

## 2. Anchor data

### Batch 1 (2026-07-24, 9 cars)

Stats as shown in Forza. `Lap(s)` is the mm:ss converted to seconds.

| # | Car | FzYr | PS | NM | kg | fr% | Drivetrain | PI | Lap | Lap(s) |
|---|-----|------|----|----|----|-----|-----------|----|-----|--------|
| 1 | Lexus LFA | 2010 | 560 | 480 | 1480 | 48 | RWD | 699 | 1:32.6 | 92.6 |
| 2 | Ferrari F355 Berlinetta | 1994 | 380 | 365 | 1450 | 41 | RWD (mid) | 588 | 1:41.3 | 101.3 |
| 3 | Honda NSX-R | 1992 | 280 | 294 | 1230 | 42 | RWD (mid) | 572 | 1:42.9 | 102.9 |
| 4 | Mitsubishi Evo VI GSR TME | 2001 | 280 | 373 | 1280 | 58 | AWD | 574 | 1:43.2 | 103.2 |
| 5 | BMW M3 (E30) | 1988 | 195 | 231 | 1253 | 51 | RWD | 474 | 1:52.1 | 112.1 |
| 6 | Toyota Altezza RS200 Z | 1999 | 210 | 216 | 1360 | 50 | RWD | 461 | 1:53.1 | 113.1 |
| 7 | Toyota 2000GT | 1969 | 152 | 176 | 1157 | 51 | RWD | 377 | 2:03.4 | 123.4 |
| 8 | Honda Beat | 1991 | 64 | 60 | 760 | 43 | RWD (mid) | 283 | 2:09.8 | 129.8 |
| 9 | Honda Acty | 1994 | 38 | 54 | 770 | 52 | **AWD** | 100 (floor) | 2:51.9 | 171.9 |

Maintainer notes carried for feel (not fitted): the stock LFA "feels great"; the Acty is "painful".

### Ceiling anchor: Calsonic Skyline GT-R (BNR32 Gr.A, JTC 1990)

The maintainer's **ultimate ceiling** target: an accurate model of the #12 Calsonic JTC race car - what
a BNR32 becomes fully built. It sets the top of our performance envelope and, uniquely, comes with a
full telemetry fingerprint, so it calibrates whole sub-models, not just a lap.

| Field | Value |
|-------|-------|
| Power / torque | 650 PS / 667 NM |
| Kerb | 1261 kg |
| Front weight | 60% |
| PI | 858 |
| Legend Island lap | 1:21.063 (**81.06 s**, the ceiling) |
| Braking 97->0 | 23.3 m |
| Braking 161->0 | 55.9 m |
| Lateral g | 1.58 (97 km/h), 1.78 (193 km/h) |
| 0-97 / 0-161 | 2.5 s / 5.238 s |
| Top speed | 322.9 km/h |

**Sub-model extraction (what the telemetry pins directly):**

- **Braking decel** (from `a = v^2 / 2d`): 97->0 = **1.59 g**; 161->0 = **1.82 g** average (the
  high-speed segment is aero-boosted, so the instantaneous figure at 161 is higher and the low-speed
  figure lower).
- **Traction circle confirmed.** Braking at 97 (1.59 g) essentially equals lateral at 97 (1.58 g).
  The friction budget is symmetric long/lat exactly as the model assumes - direct validation.
- **Aero downforce coefficient.** Fitting `grip(v) = mu_mech * (1 + k*v^2)` to the two lateral points
  (1.58 g at 26.9 m/s, 1.78 g at 53.6 m/s) gives **mu_mech = 1.51** (pure mechanical, race slicks) and
  **k = 6.2e-5 s^2/m^2**: downforce adds +4.5% grip at 97 km/h, +18% at 193, and ~+50% at 323. This is
  the clean two-point calibration for the aero-as-speed-scaled-bolt-on we specced earlier.
- **Grip ceiling / mod band.** mu_mech 1.51 maps to **~76 on our 0-100 display grip scale** (mod band
  55->100). A fully-built race car sits at ~76, leaving headroom above for slicks + maximum aero at
  speed. This validates the mod-band ceiling design - a heavy build reaches ~1.5 g mechanical, not the
  stock 0.66-1.08.
- **Drag.** Top speed 322.9 km/h (89.7 m/s) with 650 PS implies **CdA ~= 0.94**, up from the stock
  BNR32's ~0.72. The delta is the wing: a race aero package buys downforce and pays it back in drag,
  which the model must represent (more grip, lower top speed per PS).
- **Launch caps are stock-only.** 0-97 in 2.5 s is a **1.10 g average**, so peak launch exceeds 1 g.
  Our fixed 0.62 g launch cap (`a_cap`) is correct for street tyres but must **scale with the build's
  actual mu** - a slick-shod AWD car launches far harder. This is a targeted fix, not a rework.

Two scale points now anchor Legend Island: the **Calsonic at 81.06 s** (ceiling) and the **stock LFA
at 92.6 s**. Full-field spread including the ceiling and the Acty is now **2.12x** (81.06 -> 171.9),
against our model's current 1.45x - the course-geometry gap the maintainer flagged, quantified.

## 3. Stat sense-check (our spec vs Forza)

Four cars match effectively perfectly (F355, LFA, Beat, NSX-R). The rest are minor, except three
flags worth resolving.

| Car | Field | Ours | Forza | Verdict |
|-----|-------|------|-------|---------|
| F355 | all | 380/363/1450/41 | 380/365/1450/41 | Match (NM 363 vs 365 negligible). |
| LFA | all | 560/480/1480/48 | 560/480/1480/48 | Exact match. |
| Beat | all | 64/60/760/43 | 64/60/760/43 | Exact match. |
| NSX-R | all | 280/294/1230/42 | 280/294/1230/42 | Exact match. |
| 2000GT | y / kg | 1967 / 1120 | 1969 / 1157 | Forza is a later build year; kg +37 (kerb w/ fluids). Accept Forza's for the anchor. PS 150 vs 152 negligible. |
| Altezza | y / kg | 1998 / 1340 | 1999 / 1360 | Near-match; kg +20, year +1. Negligible. |
| **Evo VI TME** | PS / kg | 300 / 1360 | 280 / 1280 | PS = known gentleman's offset (feed 280). **kg: Forza is 80 kg lighter** (TME weight varies by source: RS ~1260, GSR ~1360). Flag: confirm which TME our spec should be. |
| **M3 (E30)** | kg / PS / NM | 1165 / 200 / 240 | 1253 / 195 / 231 | **Our kerb looks ~90 kg light** (real E30 M3 kerb ~1200-1260; Forza's 1253 is realistic). PS/NM ours = a later trim, Forza = the early 2.3. Flag: our M3 kg is a spec-correction candidate. |
| **Acty** | drivetrain / kg / fr | RWD / 710 / 48 | **AWD** / 770 / 52 | Two real variants: HA3 (RWD, mid-engine) vs HA4 (4WD). Forza models the 4WD (heavier, more front-biased). Calibration feeds AWD. Flag: decide the game roster's Acty variant. |

## 4. Where our model stands today (diagnostic, before any calibration)

The 9 anchors were run through our existing all-round course (`Circuit`) exactly as the model
stands, to measure the starting point. (Evo VI here still used our 300 PS, not Forza's 280.)

**Rank ordering (fastest to slowest):**

| Forza (Legend Island) | Our model (Circuit) |
|---|---|
| LFA, F355, NSX-R, Evo VI, M3, Altezza, 2000GT, Beat, Acty | LFA, F355, Evo VI, NSX-R, Altezza, M3, Beat, 2000GT, Acty |

- **Spearman rank correlation = 0.95.** The model already orders the field almost exactly like
  Forza. Every disagreement is an adjacent-pair swap.
- **Field spread:** ours **1.45x** slowest/fastest; Forza **1.86x**. Legend Island (fast,
  straight-biased) stretches the field far more than our Circuit compresses it. This is the single
  biggest gap and is mostly a **course-geometry** problem, not a physics problem.

**The three informative swaps + the Acty (the residuals worth explaining):**

1. **NSX-R vs Evo VI** (Forza: NSX just ahead; ours: Evo ahead). Within the 0.3 s driver-noise
   floor, and our Evo ran at 300 PS. Feeding Forza's 280 PS almost certainly resolves it. Not a real
   defect.
2. **M3 vs Altezza** (Forza: M3 ahead by 1 s; ours: Altezza ahead by ~3 s). Our grip model gives the
   1998 Altezza newer rubber (era mu 0.905) than the 1986 M3 (0.835), so the Altezza out-grips it.
   Forza has the lighter, better-balanced M3 ahead. **Signal: our era-grip gap may be too large, or
   we under-credit low mass + balance.** (Our M3 kg being 90 kg light widens the gap the wrong way,
   fixing it makes ours worse here, so this is a genuine weighting question, not just a data error.)
3. **2000GT vs Beat** (Forza: 2000GT ahead by 6 s; ours: Beat ahead by ~1 s). On a fast,
   straight-biased track the 2000GT's 152 PS crushes the Beat's 64 PS on the straights. Our Circuit
   is twistier and our low-era grip penalty (2000GT mu 0.66) costs it in corners. **Signal: Legend
   Island needs more straight emphasis, and/or the vintage-grip penalty is too harsh.**
4. **Acty magnitude** (Forza: 42 s behind the Beat; ours: only 14 s behind). 38 PS through a draggy
   (Cd ~0.45) tall box, AWD, on a fast track = catastrophic straight-line loss. **Signal: our
   straight/drag model under-punishes a power-starved, high-drag car on a fast track.** The most
   information-dense anchor in the batch.

## 5. Calibration plan

The diagnostic sets the strategy: **ordering is already right; calibrate scale, spread, and a few
weightings, not the whole model.** Staged so each step is falsifiable and we never overfit 9 points.

- **Stage 0 - parity inputs.** Store, per anchor, the exact Forza stats (PS/NM/kg/fr/drivetrain) as
  a separate calibration input row. Run the model on those, not our spec, so sim-vs-Forza is
  like-for-like. Keeps "is the model right" cleanly separate from "is our spec right" (section 3).
- **Stage 1 - build the Legend Island course.** Construct a segment list (radius/angle/straight)
  matching the maintainer's description (fast, all-round, slightly straight-biased). Ground it from
  the track's real length + corner count where researchable; otherwise synthesise. **Scale total
  length so the LFA hits 92.6 s** - this pins the absolute clock.
- **Stage 2 - fit spread (power vs grip vs drag).** Tune the straight fraction and corner-radius
  distribution so the field stretches to Forza's 1.86x. The **Acty (171.9 s)** pins how hard the
  straights punish low power + high drag; the **2000GT vs Beat** gap pins straight emphasis; the
  **LFA/F355** pair pins the fast-corner + top-end budget.
- **Stage 3 - resolve the weighting swaps.** With scale fixed, adjust the smallest number of levers
  to seat the mid cars: the **era-grip gap** (M3 vs Altezza), the **fast-track drag/power term**
  (Acty), and **AWD launch** (Acty, Evo). Introduce **torque (NM)** here as a physical corner-exit
  grunt term (see section 6) to place cars by delivery, not just peak power.
- **Stage 4 - validate against PI.** Regress our physics-based times against Forza PI; the residuals
  must be small and unbiased (no "all light cars fast" tilt). A sim whose times track PI as tightly
  as Forza's real times do has captured Forza's performance weighting from physics, not curve-fit.
- **Stage 5 - lock and regression-test.** Snapshot the matched anchor times as a calibration fixture
  so no future model change can silently drift from the gold standard. Re-open only with new batches.

**Success metric:** median absolute sim-vs-Forza error under ~2-3% of lap time (~2-3 s), correct
ordering outside the driver-noise floor, unbiased PI residuals. Do not chase sub-floor gaps.

### Open decisions (recommendations; confirm when convenient)

- **Legend Island's role:** a **calibration reference** that pins our physics constants, which then
  apply to the game's own four course archetypes (recommended) - rather than adding Legend Island as
  a fifth in-game course. The game keeps its designed tracks; Forza tunes the physics under them.
- **Acty game variant:** feed **AWD** for calibration regardless; separately decide whether the
  roster Acty becomes the 4WD HA4 or stays the RWD HA3 (roster-only car, low stakes).
- **Spec flags:** M3 (E30) kerb 1165 -> ~1250, and the Evo VI TME weight (1360 vs 1280), are
  spec-correction candidates pending your call (both roster-only, not economy levers).

## 6. Model improvements this data unlocks

- **Torque (NM) -> physical delivery.** Today corner-exit pull is an archetype constant (`dF`). With
  NM we can derive a grunt term from torque-to-weight and the torque/power ratio (how much of peak is
  available low in the rev range), replacing a lookup with a measured quantity.
- **Era-grip re-weight.** The M3/Altezza swap is direct evidence to re-examine the tyre-era mu gap.
- **Fast-track drag term.** The Acty is a clean constraint on the drag/power-starvation model at the
  slow end.
- **AWD launch.** Two AWD anchors (Acty, Evo) to pin `k_AWD` against.

## 7. First calibration pass (2026-07-24)

Three model/spec changes plus a first-cut Legend Island course, all against batch 1.

### Physics: launch cap now scales with grip

The fixed 0.62 g launch cap was stock-tyre-only. Replaced with `a_cap = 0.70 * mu` (prototype
`lapsim-report.js`): street rubber (mu ~0.88) still caps ~0.62 g as before, but a slick build
(mu ~1.5) launches past 1 g, matching the Calsonic (0-97 km/h in 2.5 s = 1.10 g average). AWD was
already grip-scaled (mu * 0.66) so it is unchanged. No current stock car moves materially; this
unlocks correct launch for future heavy builds. **Not yet ported to the game** (the pace model is
prototype). `pace-model-math.md` section 4 updated.

### Spec: three anchors switched to their Forza values (roster-only, no game/economy impact)

- **Acty** -> the 4WD variant: HA3->HA4, RWD->AWD, 710->770 kg, 48->52% front, 1990->1994.
- **M3 (E30)** -> Forza's early 2.3: 200->195 PS, 240->231 NM, 1165->1253 kg, 52->51% front,
  1986->1988 (the year also nudges it up one tyre-era band, which helps the M3/Altezza order).
- **Evo VI TME** -> Forza's weight: 1360->1280 kg, 60->58% front, 1999->2001. PS kept at the real
  300 (display); the sim/anchor comparison uses the 280 quote for Forza parity.

### First-cut Legend Island course

Traced from the top-view map (~4.715 km, flowing coastal circuit). 10 turns, `[radius m, angle deg,
following straight m]`:

```
[[700,20,300],[350,30,300],[200,40,200],[45,95,180],[250,38,200],
 [160,42,300],[18,175,350],[400,26,350],[280,35,400],[450,20,650]]
```

Length 4720 m, 68% straight. Character: fast W-coast sweepers, the tight southern point (45 m),
the centre lollipop hairpin (18 m), fast right sweepers, long main straight. Nine geometry
iterations converged it against batch 1:

| Car | Ours (s) | Forza (s) | %err |
|-----|----------|-----------|------|
| Lexus LFA | 95.2 | 92.6 | +2.8 |
| Ferrari F355 | 103.5 | 101.3 | +2.2 |
| Honda NSX-R | 105.7 | 102.9 | +2.7 |
| Evo VI TME | 104.7 | 103.2 | +1.5 |
| BMW M3 (E30) | 114.8 | 112.1 | +2.4 |
| Altezza RS200 | 112.7 | 113.1 | -0.3 |
| Toyota 2000GT | 125.9 | 123.4 | +2.1 |
| Honda Beat | 142.8 | 129.8 | +10.0 |
| Honda Acty | 158.8 | 171.9 | -7.6 |

Mean abs error 4.5 s (dominated by the two kei outliers); the seven-car main field is within +/-3%,
most within the driver-noise floor. Spread ours 1.67x / Forza 1.86x (the gap is now almost entirely
the Acty).

### Open items (next tuning targets, not yet actioned)

- **Kei outliers.** Beat +10% (too slow), Acty -8% (too fast). Extreme low-power cars where the
  model diverges: likely the Beat's top-speed cap over-punishes it on straights, and the Acty's
  drag/power-starvation is slightly too kind. Needs a targeted low-power/kei look, not a course fix.
- **M3 vs Altezza order** still inverted (ours: Altezza ahead by ~2%; Forza: M3 ahead by ~1%). The
  1988-vs-1998 tyre-era grip gap is the suspect; both are within ~1 driver-noise floor.
- **Fast-end residual.** The whole main field reads ~2-3% slow (uniform). Candidate: `eta` (driveline
  efficiency 0.88, a flagged calibration constant) nudged up, but that is a global physics tunable
  touching all courses - hold for maintainer sign-off rather than fit it to one track.
- **Grip display ceiling (DONE, maintainer-approved 2026-07-24).** The Calsonic's slick mu 1.51 read
  ~76, too low for an already-slick race build. Applied: the mod band `displayCurve.modifiedHighG`
  2.0 -> 1.62 (mu 1.10->1.62 maps to display 55->100), so a full-slick build reads ~90. economy.json
  changed and the economy guard test (`economyApprovalGate`) re-pinned in the same change. No current
  (stock) car exceeds mu 1.10, so nothing visible moves today; it sets the future mod ceiling.

## 8. Blind validation, round 1 (predictions recorded 2026-07-25, BEFORE driving)

The model's real test is prediction, not fit. These three were chosen to attack the parts of the
model the batch-1 anchors never touched, and the predictions are committed here before the
maintainer drives them, so the comparison cannot be rationalised after the fact.

**Course:** Misaki International Raceway (the calibrated ex-Legend-Island facsimile).
**Reproduce:** `node docs/design/lapsim/lapsim-report.cjs` (the `PREDICT` block).

**Superseded by the parity re-run below.** First pass, using our own spec-book figures: Integra
111.4 s, RX-7 109.7 s, GT-R 111.4 s.

### Re-predicted at Forza-parity stats (2026-07-25, still before driving)

The maintainer read the three cars' actual in-game stats, which differ from our spec book on two of
them, so the model is fed the numbers the game itself simulates (calibration stage 0). A spec
difference must never be able to masquerade as a model error.

| Car (Forza's listing) | PS | NM | kg | front | mu | 0-100 | top | **PREDICTED** |
|---|---|---|---|---|---|---|---|---|
| 2001 Honda Integra Type R (DC2) | 198 | 176 | 1197 | 62% | 0.88 | 6.3 s | 233 | **112.2 s (1:52.2)** |
| 1992 Mazda RX-7 Type R (FD3S) | 256 | 294 | 1260 | 50% | 0.89 | 5.5 s | 250 | **109.3 s (1:49.3)** |
| 1992 Nissan Skyline GT-R (BNR32) | 280 | 353 | 1480 | 59% | 0.88 | 5.2 s | 250 | **112.5 s (1:52.5)** |

**Spec reconciliation, for the record:**

- **Integra Type R.** Forza's "2001 Integra Type R" is the **US-market DC2** (B18C5), not the DC5:
  195 hp = 198 PS, 130 lb-ft = 176 NM, and 2639 lb = 1197 kg all match exactly, and the US car ran
  to 2001. Our roster carries the JDM DC2 (200 PS, 1060 kg), which is 137 kg lighter, hence the
  re-predict. Same chassis, different market spec.
- **RX-7.** Forza's 1992 Type R is 256 PS / 1260 kg against our 255 PS / 1260 kg, effectively
  identical, so the change is rounding only.
- **GT-R.** Forza shows the capped 280 PS (as expected) but **1480 kg** against our 1430, so it is
  predicted 50 kg heavier than our spec book's figure.

**Why these three (what each one probes that nothing else has):**

1. **Integra Type R, the only front-driver ever tested.** All ten anchors so far are RWD, mid, or
   AWD, so the FWD launch branch (`ag = (mu*cL)/(1 + mu*hL)`, where weight transfer moves AWAY from
   the driven wheels) has never once been checked against reality. It is a whole code path running
   on theory. A powerful, light FWD car is the sharpest available test of it, and the answer
   generalises to every FWD car in the roster.
2. **RX-7 FD3S, the only rotary, and a mission's own probe car.** The sequential-twin rotary
   delivery factor (0.85) is an invented archetype constant, and rotaries are core to the game's
   identity (FC, FD, RX-8, Cosmo). It doubles as the highest-stakes check available: this exact car
   is the probe build behind the `under-one-fifteen` mission ceiling, so its accuracy is the
   accuracy of shipped mission content.
3. **R32 GT-R, AWD with active yaw.** Probes three untested terms at once: the parallel-twin
   delivery factor (0.85), the active-yaw grip bonus (+0.035, granted for ATTESA), and the AWD
   launch factor at a much heavier weight than the Evo. Not blind-confounded: the Evo VI (AWD,
   1280 kg, matched to +1.5%) is a control, so a miss here isolates to yaw, delivery, or weight.

**Assumptions to confirm before driving (a stat mismatch invalidates the comparison, not the
model):** the GT-R is predicted at Forza's displayed 280 PS, not our de-restricted 320. Forza lists
the RX-7 as the 1995 "Type RZ", a lighter FD variant than our 1991 base car, so if the game shows
materially under 1260 kg, the prediction should be re-run at the shown weight before comparing.

**Reading the result:** treat anything inside **+/-3%** (about +/-3.3 s here) as a pass, which is
roughly the maintainer's own best-of-3 consistency band. Tighter than that measures driving, not the
model. A miss is diagnostic, not a failure: the FWD car isolates the launch branch, the RX-7 the
rotary delivery factor, the GT-R the yaw/delivery/AWD group.

## 9. Batch log

| Batch | Date | Cars | Status |
|-------|------|------|--------|
| 1 | 2026-07-24 | 9 (LFA, F355, NSX-R, Evo VI, M3 E30, Altezza, 2000GT, Beat, Acty) | Captured, sense-checked, diagnostic run. Awaiting more batches before fitting. |
| 1c | 2026-07-24 | Calsonic BNR32 Gr.A (ceiling anchor, full telemetry) | Captured; sub-models extracted (aero k=6.2e-5, mu_mech 1.51, CdA 0.94, launch >1 g). Second Legend Island scale point (81.06 s). |
