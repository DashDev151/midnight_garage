# Sprint 127: the measured car data, and the schema that holds it

**Status: DESIGNED. Awaiting maintainer review. No implementation has begun.**

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

- [ ] Every shipped car carries its measured pairs, or is explicitly marked `modelled`.
- [ ] The guard test proves content matches the spec book, and fails if either drifts.
- [ ] The power and weight diff is reported and reviewed.
- [ ] No lap time and no economy value has moved except through the power corrections, and that
      movement is itemised rather than summarised.

## Exit

_(to be filled from real check output on completion. Do not pre-fill.)_
