# Sprint 127: the measured car data, and the schema that holds it

**Status: APPROVED, IMPLEMENTING.** Maintainer approval 2026-07-27, including the power and weight
corrections on 63 cars.

**Coverage, measured before any work started.** Of the 26 shipped models: **16 are fully measured**
(all three pairs), **1 is partial** (the Honda City E has a lateral pair only), and **9 carry
nothing** and stay `modelled`. The regression fallback is therefore load-bearing for this roster
rather than an edge case, which Sprint 128 must treat as a first-class path.

First of four sprints that put the car performance model into the game. This one moves **data
only**: the sim's physics is untouched, so no lap time changes. Sprint 128 is the physics.

**Source of record:** `docs/design/car-performance/README.md` (LOCKED). Read it and `formulas.md`
before touching anything here.

## Why this is its own sprint

The port has two independent failure modes and separating them is the whole point: bad data behind
correct physics, and correct data behind bad physics. Landing them together means any error is
ambiguous. Landing the data first also means Sprint 128 opens against a content set that has already
been round-tripped against its source, so its acceptance test measures the physics alone.

It is not behaviour-free, and the doc says so rather than pretending: **Forza's power, weight and
weight distribution supersede ours on 63 cars**, and power feeds `derivedStats`. Some cars' power
stat will move. That is a data correction the roster needs regardless of the model.

## Reuse analysis (directive 16)

### Genuinely new

| New | Why nothing existing covers it |
|---|---|
| `spec` fields for measured performance PAIRS | No car field carries a measured outcome today. Every physical field (`dragCd`, `comHeightMm`, `topSpeedKmh`) is a published dimension. And these are pairs by nature: a single figure cannot separate grip from downforce, or launch from power. |
| A content guard pinning `cars.json` to the spec book | The spec book is the vetted upstream and stays so. Nothing currently asserts the two agree. |

### Existing mechanisms reused, unchanged

- **The Naming Layer's `spec` object** (`carModel.ts`). Real immutable fact lives here, names stay
  swappable. Every new field is measured fact, so it belongs in `spec` by engineering law 3.
- **The Zod content schema and its test** (`packages/content/src/carModel.ts`,
  `tests/schemas.test.ts`). New fields are optional additions in the existing style.
- **`docs/design/car-performance/car-spec-book.html`** stays the vetted upstream and the place a
  figure is argued about. This sprint copies it into content; it does not replace it.
- **Directive 19**: a schema change is a Dexie version bump and nothing else. No migration, no
  golden-save test, no legacy-compat branch.

### Explicitly NOT in this sprint

`performance.ts`, `courses.json`, `economy.json`, the display curve, and every derived quantity
(`mu`, `dfC`, `bmu`, `aLaunch`, `pEff`). Those are Sprint 128. **If a task here needs one of them,
the task is in the wrong sprint.**

## The schema

Added to `spec`, all optional, all measured:

| Field | Unit | Meaning |
|---|---|---|
| `lateralG97`, `lateralG193` | g | the lateral pair. **Note the speeds: 97 and 193, not 161.** |
| `braking97To0M`, `braking161To0M` | m | the stopping pair |
| `zeroTo97S`, `zeroTo161S` | s | the acceleration pair |
| `measuredFrom` | enum | provenance: `forza-panel`, `forza-panel-override`, `modelled` |

Three rules the schema itself should carry where Zod can express them, because each is an error the
model cannot detect downstream:

1. **The pairs are pairs.** A car carrying `lateralG97` without `lateralG193` cannot have its
   downforce separated from its mechanical grip. Where only one is present the schema must say so
   explicitly rather than let a half-pair look complete.
2. **`lateralG193` is at 193 km/h.** Name it so nobody can read it as 161. This is the one error in
   this dataset that silently corrupts everything downstream, and it has already happened once.
3. **`measuredFrom: 'forza-panel-override'`** is reserved for the two cards carrying a `gOvr`, and
   the reason travels with the data rather than living only in the spec book.

`spec.zeroToHundredS` (published 0-100) stays for display but is **no longer a calibration target**.
Audit its consumers as a task; if nothing reads it, delete it under directive 19.

## Tasks

Claude-implementable:

1. Extend the `spec` Zod schema with the fields and the pair rules above.
2. Populate `cars.json` from the spec book for all 26 shipped models: the measured pairs, plus
   Forza's `stockPowerPs`, `curbWeightKg` and `weightDistributionFront` where they differ.
   **Every figure copied, none retyped from memory or recomputed.**
3. A guard test that reads the spec book and asserts every shipped car's measured fields match it
   exactly. This is the test that makes the spec book the single upstream rather than a doc that
   drifts.
4. Audit `spec.zeroToHundredS` consumers; report, do not delete unilaterally.
5. Dexie version bump if any persisted shape changes (it should not: `spec` is model data, not
   instance data. Confirm rather than assume).
6. Re-pin whatever the power/weight corrections move, and **report the diff car by car** so the
   maintainer sees which cars changed and by how much before it is committed.

Maintainer-only:

7. Review the power/weight diff from task 6. Some are large (the Celica is 276 PS to 259, the Silvia
   1121 kg to 1140).
8. Optionally capture more fingerprints. 59 of 85 roster cars are fully measured; only the 26
   shipped models matter for this sprint, and their coverage should be reported as task 0 before
   any other work starts.

## Definition of done

- [x] Every shipped car carries its measured pairs, or is explicitly marked `modelled`.
- [x] The guard test proves content matches the spec book, and fails if either drifts.
- [ ] The power and weight diff is reported and reviewed. (Reported below; the review is the
      maintainer's.)
- [ ] No lap time and no economy value has moved except through the power corrections, and that
      movement is itemised rather than summarised. **This clause was wrong when it was written and
      the Exit records why:** power is not the only live physics input the book supersedes. Drag,
      top speed, kerb weight and model year are read by the shipped sim today, so lap times moved
      on measured cars. Every movement is itemised below; nothing was re-pinned.

## Exit

**Status: data landed, downstream re-pinning HALTED and referred.** The content package is green.
Six of the eleven downstream failures are mechanical re-pins; three are approval-gated mission
values (directive 22, so this thread ends and the numbers go up as a question); two are findings
that need a ruling rather than a re-pin.

### What landed

1. **Schema** (`packages/content/src/carModel.ts`). Six optional measured fields
   (`lateralG97`/`lateralG193`, `braking97To0M`/`braking161To0M`, `zeroTo97S`/`zeroTo161S`), an
   optional `measuredFrom` enum (`forza-panel` / `forza-panel-override` / `modelled`), and three
   refinements that reject a half pair, one per pair, each naming its two speeds in the failure
   message. The speeds live in the field names and in a block comment above them, because the
   lateral pair reads at 97 and 193 km/h while braking and acceleration read at 97 and 161, and
   downforce goes as the square of speed.
2. **`topSpeedKmh` is no longer integer-constrained.** The overridden Silvia's corrected top speed
   is 245.2 km/h (152.4 mph exactly), and its `dragCd` of 0.305 was back-solved from that figure.
   Rounding the speed to 245 would have silently decoupled the two, so the constraint went rather
   than the decimal. No consumer wanted an integer: the only reader is
   `packages/sim/src/performance.ts`, which divides it by 3.6.
3. **`packages/content/data/cars.json`**, populated by script for all 26 shipped models: the
   complete measured pairs, plus `stockPowerPs`, `curbWeightKg`, `weightDistributionFront`,
   `dragCd`, `topSpeedKmh` and `yearFrom` from the book. 205 field values changed. Not one was
   retyped, rounded or recomputed.
4. **`scripts/importSpecBook.cjs`**, the importer, kept in the repo rather than thrown away: the
   book is a living upstream, so re-importing must stay a command rather than an afternoon. Run it
   with `node scripts/importSpecBook.cjs`, then
   `npx prettier --write packages/content/data/cars.json`. It refuses any spec key it does not
   know, rebuilds each spec in schema key order, and prints the field-by-field diff below.
5. **A pair-rule test** in `packages/content/tests/schemas.test.ts`: the schema refuses a car whose
   lateral, braking or acceleration pair is missing a half, and still accepts the complete one. The
   rule is a claim until something proves it bites.
6. **`packages/content/tests/carSpecBookGuard.test.ts`**, the pin. It reads the spec book HTML
   directly, evaluates its `CARS` array exactly as the lap harness does (including lifting 0-161
   km/h out of the verbatim `fz` panel block), and fails on any disagreement in either direction,
   over the measured pairs, the six superseded fields and the provenance marker.

### Coverage, as shipped

16 cars carry all three pairs, 1 (`honda-city-e-aa`) carries the lateral pair only, and 9 carry
nothing and are marked `modelled`. One car is `forza-panel-override`: `nissan-silvia-s13`, the
starter-car preset. The other override in the book, the Celica GT-Four ST205, is not a shipped
model.

The City E is the reason the pair rule earns its keep. The book holds a 97 km/h braking figure and
a 0-97 time for it with no 161 km/h partner, and both were dropped rather than carried. A lone
reading cannot separate the two unknowns the pair exists to separate, and a half pair reads as
complete to anything downstream.

### The power and weight diff

Every changed field, car by car. Nine cars change power, fifteen change kerb weight, ten change
front weight distribution, fifteen change drag, sixteen change top speed and sixteen change model
year: seventeen of the twenty-six move at all, nine are untouched. `-` means unchanged.

| car | power PS | % | kerb kg | % | front % | drag Cd | top km/h | year (delta) | era-rubber mu |
|---|---|---|---|---|---|---|---|---|---|
| honda-city-e-aa | - | - | 690 -> 670 | -2.9% | 62 -> 60 | - | - | 1981 -> 1984 (+3) | 0.8 -> 0.835 |
| toyota-sprinter-trueno-ae86 | - | - | 940 -> 950 | +1.1% | - | 0.35 -> 0.41 | 185 -> 202 | 1983 -> 1985 (+2) | same |
| nissan-180sx-rps13 | 205 -> 157 | -23.4% | 1220 -> 1322 | +8.4% | - | 0.33 -> 0.364 | 225 -> 222 | 1991 -> 1993 (+2) | 0.875 -> 0.905 |
| toyota-chaser-tourer-v-jzx90 | - | - | 1450 -> 1540 | +6.2% | 55 -> 52 | 0.31 -> 0.385 | 250 -> 257 | 1992 -> 1991 (-1) | same |
| nissan-silvia-ks-s14 | - | - | 1240 -> 1265 | +2.0% | 53 -> 54 | 0.32 -> 0.331 | 235 -> 256 | 1993 -> 1994 (+1) | same |
| mazda-savanna-rx7-fc3s | 185 -> 203 | +9.7% | 1230 -> 1352 | +9.9% | 52 -> 51 | 0.31 -> 0.336 | 230 -> 251 | 1985 -> 1990 (+5) | 0.835 -> 0.875 |
| mazda-rx7-fd3s | - | - | - | - | - | 0.31 -> 0.282 | 250 -> 286 | 1991 -> 1992 (+1) | same |
| toyota-supra-rz-jza80 | - | - | 1500 -> 1510 | +0.7% | - | 0.32 -> 0.354 | 285 -> 283 | 1993 -> 1998 (+5) | 0.905 -> 0.93 |
| honda-beat-pp1 | - | - | - | - | - | 0.35 -> 0.382 | 135 -> 177 | - | - |
| honda-crx-sir-ef8 | - | - | 970 -> 980 | +1.0% | 60 -> 62 | 0.3 -> 0.271 | absent -> 250 | 1989 -> 1991 (+2) | same |
| toyota-sera-exy10 | 110 -> 109 | -0.9% | 900 -> 930 | +3.3% | 60 -> 62 | - | 195 -> 193 | 1990 -> 1991 (+1) | same |
| honda-prelude-si-vtec-bb4 | 200 -> 162 | -19.0% | 1240 -> 1302 | +5.0% | 58 -> 62 | 0.32 -> 0.366 | 200 -> 221 | 1991 -> 1994 (+3) | 0.875 -> 0.905 |
| nissan-silvia-s13 | 205 -> 175 | -14.6% | 1150 -> 1140 | -0.9% | - | 0.32 -> 0.305 | 225 -> 245.2 | 1991 -> 1989 (-2) | same |
| toyota-mr2-sw20 | 225 -> 244 | +8.4% | 1240 -> 1205 | -2.8% | 43 -> 42 | 0.31 -> 0.348 | 240 -> 267 | 1989 -> 1995 (+6) | 0.875 -> 0.905 |
| nissan-skyline-gtr-bnr32 | 320 -> 280 | -12.5% | 1430 -> 1480 | +3.5% | - | 0.4 -> 0.351 | 250 -> 268 | 1989 -> 1992 (+3) | same |
| nissan-fairlady-z-z32 | 304 -> 280 | -7.9% | 1570 -> 1520 | -3.2% | 52 -> 54 | 0.31 -> 0.378 | 250 -> 265 | 1989 -> 1994 (+5) | 0.875 -> 0.905 |
| toyota-mr2-aw11 | 145 -> 147 | +1.4% | 1070 -> 1188 | +11.0% | 44 -> 43 | 0.35 -> 0.339 | 210 -> 226 | 1986 -> 1989 (+3) | 0.835 -> 0.875 |

Two consequences of the year column, neither acted on:

- **Auction availability.** `spec.yearFrom` gates a model's earliest appearance and its age roll in
  `packages/sim/src/auctions.ts`. Sixteen cars move, fifteen later and one earlier (the Silvia K's,
  1991 to 1989, which is the corrected stock car's own year). The largest moves are the SW20 (+6),
  and the FC3S, the Supra and the Z32 (+5 each).
- **Grip, today, on the shipped sim.** The era-rubber band table in `economy.json` steps at 1968,
  1975, 1982, 1988, 1993 and 1998, and eight cars cross a step: the City E, the 180SX, the FC3S,
  the Supra, the Prelude, the SW20, the Z32 and the AW11. Sprint 128 will supersede that fallback
  for the seventeen measured cars, but it stays load-bearing for the nine `modelled` ones.

### Verification

`pnpm test packages/content`:

```
 RUN  v4.1.10 C:/Users/daanj/midnight_garage

 Test Files  19 passed (19)
      Tests  152 passed (152)
   Start at  23:10:49
   Duration  2.25s (transform 7.09s, setup 0ms, import 23.52s, tests 919ms, environment 5ms)
```

`pnpm --filter @midnight-garage/content typecheck`:

```
$ tsc --noEmit
```

### What the data correction broke downstream, itemised

The sim reads the corrected fields today, so `pnpm test --project sim --project game` goes red:
11 failures of 2187, in 5 files. Each was A/B confirmed against the previous `cars.json` (both
non-pin failures pass on the old data and fail on the new), so every one is a consequence of the
corrected figures and none is a code fault. Nothing was re-pinned.

**Mechanical re-pins (6), correct to move, not moved here:**

| test | pin | now |
|---|---|---|
| `sim/advanceDay` 30-day golden hash | `d0e2394e` | `0b19bab5` |
| `sim/advanceDay` acquisition-to-sale golden hash | `509aa1f1` | `e5f520b3` |
| `sim/lapModelPace` AE86 on kirifuri | 236 s | 237.06 s (+1.06) |
| `sim/lapModelPace` FD3S on kirifuri | 225.8 s | 225.56 s (-0.24) |
| `sim/lapModelPace` BNR32 on kirifuri | 229.9 s | 231.34 s (+1.44) |
| `sim/lapModelPace` Supra RZ on kirifuri | 226.9 s | 223.19 s (-3.71) |

**Approval-gated, so this thread ends here (directive 22).** Three `storyMissionProbes` assertions
compare a mission's pinned value against what the probe build now actually achieves. Moving them
means moving `storyMissions.json`, which is maintainer-gated lever by lever:

| mission | pinned | probe build now needs |
|---|---|---|
| `the-column-clock` lap ceiling | 237.1 s | 238 s (the AE86 is slower on the corrected data) |
| `under-one-fifteen` lap ceiling | 230.1 s | 230 s (the FD3S is marginally quicker) |
| `street-power-street-manners` power threshold | 235 | 192 |

The third is not a re-pin, it is a satisfiability failure and the most important line in this
document. That mission's threshold was set against a 180SX making 205 PS stock. The stock car
makes 157, so the same sport intake/exhaust/ECU/turbo build no longer reaches 235 power, and the
mission as pinned is now unwinnable with the car it names. That needs a design decision (lower the
threshold, or change what the mission asks for), not a number swap.

**Two findings that need a ruling, not a re-pin:**

- `sim/aero`, "a wing is worth least where it is paid for most". For the Supra the race wing's net
  gain is now 1.5 s on tsurugi against 2.9 s on the wangan, inverting the invariant. The Supra's
  own inputs moved underneath it: drag 0.32 to 0.354, top speed 285 to 283, and a year crossing the
  1998 era-rubber step. The assertion encodes a design intent about where aero should pay, so
  loosening it to pass would be exactly the move directive 17 forbids.
- `game/gameStore.jobs`, the completion-and-payout test. Its seeded 20-day work loop no longer
  finishes the generated job, so `completeServiceJob` never returns `paid`. The flow itself is
  untouched by this sprint; the seeded content walked out from under the fixture. It needs someone
  to establish whether the generated job became genuinely uncompletable or merely slower than the
  fixture's 20 iterations.

### `spec.zeroToHundredS` audit

**Nothing in `packages/` reads it.** The only occurrences are its own schema line in `carModel.ts`,
the values in `cars.json`, and three archived design docs that named it as a calibration target
(`docs/design/car-performance/archive/`). No sim function, no store, no component and no test
consumes it. It is dead weight kept for display that no display uses, and it is now superseded by
`zeroTo97S` as a measured figure. Not deleted, per the task: the call is the maintainer's.

### Dexie

**No version bump needed, confirmed rather than assumed.** `spec` is car MODEL data. The persisted
shape carries `modelId` and looks models up by it (`packages/game/src/save/saveCodec.ts`), and
`gameState.ts` contains no `spec` field at all, so no saved record changes shape. The save DB stays
at version 2.

### One thing observed and deliberately not touched

`spec.estimatedFields` is now stale on several cars. It still lists `fr` or `cd` as estimated where
the value that just landed is a panel reading, and the book's own `est` list disagrees with ours on
seven cars. It is not in this sprint's field list and it feeds nothing, so it was left alone rather
than swept in silently. It should be copied from the book's `est` in the same pass that decides
`zeroToHundredS`.
