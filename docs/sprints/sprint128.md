# Sprint 128: the physics port

**Status: DESIGNED. AWAITING LEVER SIGN-OFF (directive 22). No implementation may begin, and no
implementation agent may launch, until section 6 is signed by name and value.**

Opens after Sprint 127 exits. This is the sprint that makes the game run the validated model.

**Source of record:** `docs/design/car-performance/README.md` and `formulas.md`. The harness
(`docs/design/car-performance/lapsim/`) is the reference implementation and the acceptance oracle.

## 1. Goal, and the one sentence that defines done

The game's lap times become the model's lap times. **Acceptance: for the cars and courses the
harness has driven reference times for, `packages/sim` reproduces the harness to within 0.1 s.**
That is a mechanical check against a known answer, so this sprint needs no playtesting.

## 2. Reuse analysis (directive 16)

### Genuinely new

| New | Why nothing existing covers it |
|---|---|
| `aeroFit`, `brakeMuFrom`, `solveAccel` | No existing code separates a measured pair into two unknowns. This is the model's whole method and it has no analogue in the current sim. |
| The geometric corner-grip ceiling | Apex speed is currently unbounded in grip. |
| A cornerless course evaluator | A pure straight cannot be expressed in the `[radius, angle, straight]` contract: a zero-angle segment still enters its straight at apex speed, making it a flying kilometre. |
| The ratio bridge (section 4) | Nothing today connects a measured stock figure to a modified car. |

### Existing mechanisms reused, unchanged in shape

- **The whole lap assembly.** `lapTime`, `carBlock`, `straightTime`, `apexSpeed`, `vTopOf` keep
  their structure and signatures. This is a change of what feeds them, not of how a lap is walked.
- **`computeGrip` keeps its formula**, demoted from truth to predictor. It supplies the mod
  response and covers unmeasured cars. See section 4.
- **`statFormulas.aero`'s multiplicative form** `mu (1 + k v^2)` is already exactly what the model
  uses, and `downforceK` 6.2e-5 already matches the harness. No change of form.
- **`lapModel.ts`'s reference board** and `storyMissionProbes`'s `ceil1AtTwoPercentSlower` rule
  re-derive mechanically, as in Sprints 124 and 125. **No mission payout moves**; payouts derive
  from build cost, not lap time.
- **The economy approval gate and the `advanceDay` goldens** re-pin as usual.
- **`lapModelPace.test.ts`'s golden pins** re-pin. Its docblock already says a deliberate lever
  change is when that happens.

### Explicitly NOT in this sprint

What a part's condition does to performance (Sprint 129) and what an aftermarket part does to it
(Sprint 130). This sprint makes a **stock** car behave as measured, and leaves the existing
`statModifiers` path doing exactly what it does today.

## 3. What changes in `performance.ts`

**Deleted outright**, because a measurement replaced each of them and leaving a dead guess in the
file is how the next reader gets confused:

- `deliveryArchetype` and the nine-entry `pace.delivery` table, plus `deliverySaturationSpeed`.
- `pace.awdLaunchFactor`, `pace.launchCapCoeff`, and the RWD longitudinal-transfer slip guard.
- Braking as a copy of lateral grip in `straightTime`.

**Added:**

- `aeroFit(g97, g193) -> { mu, k }`, and `dfC = k / downforceK`.
- `brakeMuFrom(d, V, dfC)` with the global dead distance, feeding `straightTime`'s deceleration.
- `solveAccel(m, CdA, t97, t161) -> { aLaunch, pEff }`, plus the one-measurement and regression
  fallbacks for cars carrying less.
- `cornerMu(mu, r) = min(mu, geoMu (r/geoR)^geoT)`, applied in **both** places the double payout
  happens: the corner arc and the direction-change term. The harness scores all three placements
  and only "both" reaches the driven times without capping grip ordinary cars already use.
- The direction-change term loses its mass factor. The harness fitted the exponent and zero wins:
  mass is already priced through apex speed, braking distance and corner exit, and a fourth linear
  charge made the term a heavy-car handicap rather than a transition model.

**Deferred, with the number rather than a shrug.** The high-speed traction release (`tractionShare`
/ `paccAt`, which hands a traction-limited car back its power shortfall above 161 km/h) fires on 3
of 85 cars and moves no lap on any course by half a per cent. It stays out until something needs
it. Record it in `TODO.md` rather than half-implementing it.

## 4. The ratio bridge, which is the design decision that matters most

The measured figures are the **stock** car's. A player's car is not stock. Three ways to connect
them, and only one survives:

1. Freeze the solved constants at stock. A turbo would then change nothing. Absurd.
2. Re-solve from the modified car's measured times. Those do not exist and never will.
3. **Carry the dimensionless ratios and let the car's own current figures supply the scale.**

Three is what the harness's own fallback regression already does: it predicts `aLaunch / (mu g)`
and `pEff / (crank x eta)`, never the absolutes, precisely so the car's own grip and power carry
the scale. Reusing that shape here is directive 16 working as intended.

```
solved once per model from the stock pairs:   rLaunch = aLaunch / (mu g)      rPower = pEff / Pw
read per car per lap:                          aLaunch = rLaunch x mu_now x g  pEff = rPower x Pw_now
```

Grip takes the same treatment, and this is the one good idea Sprint 126 had that survives its
retirement:

```
mu_now = lateralG_measured x computeGrip(model, fittedCompound) / computeGrip(model, stockCompound)
```

With no measured figure the ratio is against the formula itself and the result is today's value
exactly. With one, the car sits where it was measured and an upgrade moves it by the proportion the
formula predicts. **The formula stops being a parallel truth and becomes a predictor of a
measurable quantity**, which is also what makes every new fingerprint improve the cars that can
never be measured.

**Performance interacts with value nowhere.** `marketValueYen` takes no derived stat and must
continue to take none. A reviewer seeing a price move in this sprint should treat it as a bug.

### Cost, and where it is paid

`solveAccel` is a nested bisection over a Simpson quadrature. It must be **memoised per model on
the values the solve reads**, as the harness does. It runs once per model, not once per lap: the
ratios are stock properties, and only the cheap scaling is per-car. If profiling shows the solve on
a hot path, that is a bug in the memoisation, not a reason to precompute into content, because a
precomputed constant would freeze at stock and silently break the moment Sprint 130 lands.

## 5. Courses

`courses.json` becomes the four calibrated geometries, replacing kirifuri, usui, wangan and
tsurugi. Misaki already matches the harness verbatim and does not move.

**Hakone and Wangan are behavioural facsimiles, not surveys, and the content file must say so in a
comment that survives copy-paste.** No radius in either is a measurement of a real road.

Yatabe is a 1 km standing start with an empty segment array and its own evaluator, and it is the
only course carrying a calibration offset. That offset lives **inside the drag evaluator** and must
be structurally unable to reach a lap, exactly as in the harness, where `dragTime` is the sole
expression containing it.

## 6. THE LEVER TABLE (directive 22: sign by name and value before any agent runs)

### A. Removed from `statFormulas.pace`

| Lever | Today | Action |
|---|---|---|
| `awdLaunchFactor` | 0.66 | **DELETE.** Replaced by per-car `aLaunch`. |
| `launchCapCoeff` | 0.70 | **DELETE.** Same. |
| `delivery` (9 entries) | 0.78 to 1.00 | **DELETE.** Replaced by per-car `pEff`. |
| `deliverySaturationSpeed` | 33 | **DELETE.** Only the delivery ramp read it. |

### B. Changed in `statFormulas.pace`

| Lever | Today | Proposed | Note |
|---|---|---|---|
| `agilityWeight` | 0.30 | **0.82**, renamed to match the term | NOT a retune: the term's formula changes (the mass factor goes), so the old and new numbers are not comparable. 0.82 is the harness's fitted value for the term as it will now be written. |

### C. New in `statFormulas.pace`

| Lever | Proposed | Meaning |
|---|---|---|
| `brakeDeadDistanceM` | **5.987** | metres covered between a braking test tripping and full retardation arriving. A property of the measurement, not the car, so one global value; fitted by least squares across the 59 cars publishing both distances. |
| `geoMu` | **1.220** | usable mechanical grip at the reference radius |
| `geoR` | **20** | that reference radius, m |
| `geoT` | **0.0612** | how fast the ceiling rises with radius |
| `dragOffsetPct` | **3.28** | protocol offset, standing-kilometre course ONLY |

Read `geoMu` to two decimals and `geoT` to one significant figure: they trade off along a shallow
valley and neither is separately well determined.

### D. `statFormulas.aero` - THE HEADROOM LEVERS

The maintainer requires room for GT3-style wings, splitters and diffusers whether or not those
parts exist yet. **The game does not have that room today**, and these are the two levers that deny
it.

| Lever | Today | Proposed | Why |
|---|---|---|---|
| `maxGripMultiplier` | 1.6 | **2.5** | 1.6 means downforce can never exceed 0.6x the car's weight. A GT3 car makes about 1.0x at 250 km/h and would be clipped from ~194 km/h; the already-validated 787B is clipped from ~170. 2.5 allows 1.5x weight, which clears GT3 with headroom and still refuses a fantasy figure. |
| `byGrade.race.downforceCoeff` | 0.85 | **1.20** | 0.85 is below the 1.164 measured on a maxed road build, so the strongest wing a player can fit is weaker than one you have actually built. 1.20 puts the top road grade just above that measurement. |
| a new grade above `race` | (absent) | **defer to Sprint 130** | GT3-class aero is a part that does not exist yet. The ceiling must allow it now so the part can be authored later without moving physics again. |

**Behavioural target to sign, rather than only the numbers:** an aggressively winged build should
reach an effective grip of 1.5 or a little more, and a GT3-class package should not meet a ceiling
at road speeds.

### E. `statFormulas.grip.displayCurve` - A DECISION, NOT JUST A VALUE

Two faults, neither in the physics, both surfacing the moment measured grip lands:

- The readout is **blind to downforce**. `gripToDisplay` reads mechanical grip only, so fitting an
  aggressive wing does not move the handling number while the car corners half again as hard at
  speed. The one upgrade that reaches the top of the grip range is the one the stat ignores.
- The readout is **short**. Its modified band runs to 1.62 mechanical, but a maxed road car sits at
  about 1.25 and therefore reads about **68 of 100**. The top third belongs to race machinery a
  player cannot build.

| Option | What it does | Cost |
|---|---|---|
| **1. Leave it** | mechanical only, band unchanged | a maxed build reads 68; wings read as nothing. Recommended against. |
| **2. Rescale only** | `modifiedHighG` 1.62 -> **1.25** | maxed road build reads 100. Still blind to aero, and a race build pegs. |
| **3. Read effective grip at a reference speed (RECOMMENDED)** | display on `mu x (1 + downforceK x dfC x v_ref^2)` at `v_ref` = **200 km/h**, band top **1.60** | the stat finally answers "how hard does this corner", and a wing shows up. Needs `v_ref` and the band signed, and it changes the displayed handling of every car with factory downforce. |

Option 3 is the honest readout and the one that matches what the model knows. It is the largest
change of the three and it is the maintainer's call.

## 7. Tasks

Claude-implementable, in order, and **not before section 6 is signed**:

1. `economy.json` and its Zod schema: apply the signed levers exactly.
2. `performance.ts`: the deletions and additions of section 3, plus the ratio bridge of section 4.
3. `courses.json`: the four calibrated geometries, with the facsimile warning in-file.
4. The cornerless-course evaluator and its contained offset.
5. `gripToDisplay` per the signed option in E.
6. **The acceptance test**: a probe that reproduces the harness's driven reference times within
   0.1 s. This is the sprint's proof and it should be written before the port is finished, not
   after.
7. Re-pin: the economy gate, the `advanceDay` goldens, `lapModelPace.test.ts`, and the two
   story-mission lap ceilings (mechanically, via the existing rule; **payouts untouched**).
8. Update `docs/design/car-performance/README.md` section 7a: the model is no longer harness-only.

Maintainer-only:

9. Sign section 6, including the E decision.
10. Optionally re-drive one car after the port as an end-to-end sanity check. Not required: the
    acceptance test is arithmetic against a known answer.

## 8. Definition of done

- [ ] Section 6 signed, in this document, before any agent ran.
- [ ] The game reproduces the harness within 0.1 s on every driven reference time.
- [ ] No deleted lever survives anywhere in code, content or schema.
- [ ] **No car's market value has moved.** Performance and value are independent.
- [ ] Every re-pin is itemised with the approval it was made under.

## Exit

_(to be filled from real check output on completion. Do not pre-fill.)_
