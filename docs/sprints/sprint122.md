# Sprint 122: Real stock specs into the game data (car spec arc, phase 1)

**Source design:** `docs/design/car-spec-arc.md` (the arc), plus the vetted figures reviewed
and signed off in the Car Spec Book artifact across this session. This sprint lands the
researched, maintainer-approved real stock specs for the 26 in-game cars into the canonical
game data (`packages/content/data/cars.json`) and extends the spec schema to carry the tuning
dials. It does NOT build any in-game spec-sheet UI or the feel simulation; those are later
phases (see Deferred).

**Maintainer authorisation for the numbers.** The arc's standing decisions cover this sprint's
values in full: "accurately capture the real stock specs," "real power vs the 280 PS lie: real,
and display the gentleman's quote," "Euro spec for imports," "new figures only, don't treat old
`cars.json` as locked, correct where wrong," and the explicit "go-ahead and fully integrate into
the proper game spec sheet." Car spec facts live in `cars.json`, not `economy.json`; the economy
approval gate (`economyApprovalGate.test.ts`) pins `economy.json` and is untouched by this sprint.

## Reuse analysis (directive 16)

**New mechanisms**

- Optional rich fields on `spec` carrying the immutable per-car tuning dials the feel model will
  later read: the true power/torque curve anchor points, geometry, aerodynamics, and stock tyre.
- `quotedPowerPs`: the gentleman's-agreement marketing cap (280 PS, 64 PS kei) as a display-only
  fact, distinct from the real `stockPowerPs` that the sim already reads.
- Data-provenance fields (`dataConfidence`, `estimatedFields`) so a later pass knows which numbers
  are published fact and which are honest estimates.

**Existing mechanisms to reuse**

- `spec` stays the Naming-Layer "real immutable fact" block (GDD 2.4); every new field is immutable
  historical fact, so it belongs here, never in the swappable display/parody strings.
- `stockPowerPs` and `curbWeightKg` keep their names and their two consumers unchanged
  (`derivedStats.ts:88` power, `derivedStats.ts:97` + `lapModel.ts:51` weight). `stockPowerPs` now
  simply holds the REAL output; no rename, no consumer churn.
- **No `spec.drivetrain` / `spec.enginePosition`.** The schema already documents that layout lives
  in `tags` (FR/FF/AWD/MR/RR) by deliberate decision; drivetrain and engine position are derivable
  from the layout tag for the whole roster (FR->front/RWD, FF->front/FWD, MR->mid/RWD, AWD->front,
  RR->rear/RWD). Storing them would stand up a parallel mechanism for a concern the tag already
  owns. They stay in the staging dataset for the feel model, which derives or adds them if and only
  if derivation proves lossy.
- `engineConfig` / `aspiration` are FINER than the coarse `Piston`/`Rotary` and `NA`/`Turbo`/
  `Supercharged` filter tags (they distinguish rotary-2 vs V6, single vs twin turbo). That is the
  same split the schema already makes between precise `spec` fact and coarse gameplay `tags`, not a
  duplication.
- Directive 19: a `cars.json` shape change needs no migration; the additive optional fields keep
  every existing parse valid. No Dexie bump (cars.json is static content, not saved state).

## The additive schema (exact)

All new fields OPTIONAL (only the 26 in-game cars carry them today; the roster's remaining cars
join in later sprints). Added inside `spec`, after `stockPowerPs`:

- `quotedPowerPs?: int > 0` - marketing/gentleman's cap; absent when it equals real power.
- `powerRpm?: int > 0`, `peakTorqueNm?: int > 0`, `torqueRpm?: int > 0`, `redlineRpm?: int > 0`
- `displacementCc?: int > 0`
- `engineConfig?: enum` I3|I4|I5|I6|V6|V8|V10|V12|flat-4|flat-6|rotary-2|rotary-3
- `aspiration?: enum` NA|turbo|twin-turbo|supercharged
- `weightDistributionFront?: number` (percent on front axle, 30..70)
- `wheelbaseMm?: int > 0`, `comHeightMm?: int > 0`
- `dragCd?: number > 0`
- `stockTyre?: string` (e.g. "235/45R17")
- `tyreCompound?: enum` eco|touring|performance|sport|grand
- `zeroToHundredS?: number > 0`, `topSpeedKmh?: int > 0`
- `dataConfidence?: enum` HIGH|MED|LOW
- `estimatedFields?: string[]`

## Core corrections landing this sprint (weight / real power)

19 of 26 cars get a corrected weight and/or real power. The seven gameplay-load-bearing ones:

| Car | kg | real PS | quoted |
| --- | --- | --- | --- |
| Toyota Supra RZ (JZA80) | 1590 -> 1500 | 280 -> 324 | 280 |
| Toyota Aristo 3.0V (JZS147) | 1690 -> 1680 | 280 -> 324 | 280 |
| Nissan Skyline GT-R (BNR32) | 1430 | 280 -> 320 | 280 |
| Nissan Fairlady Z (Z32) | 1560 -> 1570 | 280 -> 304 | 280 |
| Nissan Silvia (S13) | 1180 -> 1150 | 175 -> 205 | - |
| Nissan Cefiro (A31) | 1290 -> 1370 | 215 -> 205 | - |
| Honda City E (AA) | 690 | 61 -> 63 | - |

The other twelve are weight-only nudges of +-10..90 kg (Civic EG6 985->1050, Alto Works 700->650,
CR-X 950->970, MR2 SW20 1270->1240, Impreza 1200->1230, MR2 AW11 1050->1070, plus small ones on
Carina, 180SX, Chaser, Sunny, Sera, Prelude). Real power is unchanged on all twelve.

**Gameplay effect, disclosed.** Restoring real power lifts the four gentleman's-agreement cars'
derived power stat and quickens their lap times (Supra/Aristo +16%, GT-R +14%, Z32 +9%); the
S13 correction is the single largest single-car swing (+17% power). These make lap-time and
power-threshold missions MORE satisfiable, not less. `quotedPowerPs` preserves the 280 PS quote
for any display that wants the period-authentic marketing figure. No mission payout, budget, or
economy formula changes.

## Probe plan (directive 17: state the case per failure)

Run `pnpm test --project content` (schema + JSON validate) and `pnpm test --project sim` (the
probes that load real content), each once. Expected touches, all case-(a) intentional-input
changes, NOT loosened assertions:

- **Golden-master determinism** (scripted career uses `honda-city-e-aa`): the 61->63 power change
  shifts the career state hash. Re-pin to the new hash; this is the sim input legitimately
  changing, not a regression.
- **Story-mission satisfiability / stat probes**: stronger real power on the flagship cars changes
  derived-stat and lap-time headroom. Where a probe pins a specific number that moved, update it to
  the new correct value; where a probe asserts a mission is satisfiable, it should stay satisfiable
  (verify, don't assume). If any probe reveals a mission became UNsatisfiable or a threshold now
  fails, that is case-(b) - a real design signal - and it stops for maintainer triage rather than
  being edited away.
- Unit fixtures in `derivedStats.test.ts`, `lapModel.test.ts`, `marketValue.test.ts`,
  `valuation.test.ts`, `auctions.test.ts`, `bands.test.ts`, `carCondition.test.ts` use literal
  in-file model fixtures, NOT `cars.json`; they are unaffected and must not be touched.

## Definition of done

- [ ] Schema extended additively; `pnpm typecheck` clean.
- [ ] All 26 in-game cars carry the researched spec dials; 19 core corrections applied.
- [ ] `quotedPowerPs` present on exactly the four capped cars (Supra, Aristo, GT-R, Z32).
- [ ] `--project content` and `--project sim` green, each affected probe re-pinned as case-(a)
      with its reason recorded, or escalated as case-(b).
- [ ] No `economy.json` change; economy gate untouched.

## Deferred (later phases of the arc)

- **Phase 2:** recalibrate the four summary readouts (power/handling/style/reliability) and the lap
  model against the now-real specs, if the maintainer wants the derived-stat curve retuned. Levers
  there are economy formula constants and stay directive-22-gated.
- **Phase 3:** the feel simulation (torque curves, grip model) consuming these dials; the grip model
  and per-archetype torque curves tuned in the artifact are preserved in staging for it.
- The remaining ~56 roster cars beyond the current 26 in-game, when they are added to `cars.json`.
- An in-game spec-sheet UI (the artifact was the review surface, not a shipped screen).

## Exit

**Done, ready for review (not committed).**

- **Schema** (`packages/content/src/carModel.ts`, +33 lines): 22 optional dial fields added to
  `spec` after `stockPowerPs`, exactly as specified. `pnpm typecheck` clean across content, sim,
  and game.
- **Data** (`packages/content/data/cars.json`, +512/-43): all 26 in-game cars carry the vetted
  dials; the 19 core corrections applied; `quotedPowerPs` present on exactly the four capped cars
  (Supra 280/324, GT-R 280/320, Z32 280/304, Aristo 280/324). Verified: no car missing
  `engineConfig`; `drivetrain`/`enginePosition` correctly NOT stored (derived from the layout tag).
- **Probes**: `--project content` 133/133, `--project sim` 1418/1418, both green on a single run.
  No re-pin was needed and none was forced.
- **The predicted golden-master re-pin did not materialise, and this was verified rather than
  assumed.** The scripted career (`advanceDay.test.ts`, hash `d0e2394e`, run on `honda-city-e-aa`)
  is repair-only and stores nothing power-derived: `marketValue.ts` never reads `power`/
  `stockPowerPs`, and the power stat and lap model are computed on demand, never persisted into that
  career's state. So the City E's 61->63 power change cannot perturb the hash, which held.
- **Restoring real power did not trivialise any mission.** Story-mission stat thresholds are derived
  live from each car's own current stat (e.g. the power bar is 90% of that car's power stat), so a
  car getting stronger raises its own bar in step. The only fixed-ceiling lap missions target cars
  whose power was unchanged (FD, AE86, Civic), so none got easier. No case-(b) signal; nothing
  escalated.
- **No `economy.json` change; economy approval gate untouched.**

Deferred phases (2, 3, remaining roster, in-game spec-sheet UI) unchanged from the plan above.
