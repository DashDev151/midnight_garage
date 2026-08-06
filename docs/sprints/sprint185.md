# Sprint 185: one source, two generated artefacts

**Status: IMPLEMENTED, READY FOR REVIEW.** Four questions came out of it that only the maintainer
can answer; they are in the Exit and in `TODO.md`.

Maintainer ruling, 2026-08-05: *"that car spec lineage is a mess please clean it up. csv file single
source of truth everything else feeds from there."*

## Goal

A car's physical figures currently live in **three hand-maintained files**, with no generator
joining any of them, and the one tool that was supposed to join two has been throwing for months.
After this sprint a figure is edited in exactly one place and everything else is generated.

## What is wrong, found by trying to change one number

Changing the Wagon R's top speed by 11 km/h exposed the whole chain:

```
roster CSV  ->  car-spec-book.html  ->  cars.json          (importSpecBook.cjs THROWS)
            ->  lapsim-data.json    ->  harnessReferenceTimes.json
```

- **`scripts/importSpecBook.cjs` is dead.** It fails with `spec key outside the known order:
  culture`. Its `SPEC_KEY_ORDER` predates `culture`, `yearTo`, `reliabilityBase`, `styleBase`,
  `styleCeiling`, `aeroCeiling` and `factoryColours`. So `carSpecBookGuard.test.ts` instructs the
  reader to run a command that cannot run.
- **The game and the calibration harness can silently disagree about the same car.**
  `lapsim-data.json` carries its own copy of every car. When `cars.json` was corrected and it was
  not, the Wagon R's Hakone lap moved 0.2 s away from its own acceptance fixture.
- **The roster CSV is incomplete**, because figures were only ever typed into the spec book:
  `redlineRpm` is missing on 19 of the 53 shipping cars, plus scattered `powerRpm`, `torqueRpm`,
  `peakTorqueNm`, `displacementCc`, `engineConfig`, `engineCode` and `chassisCode`.

## What is NOT changing, stated plainly

**No measured value, no formula, no lap time moves in this sprint.** The measured Forza figures stay
canon. `packages/sim/src/performance.ts` stays locked. `lapsim-report.cjs` remains the reference
implementation validated against real driven laps, and `harnessReferenceTimes.json` remains the
acceptance fixture the game must reproduce.

**The spec book file is not edited at all.** Its 64 `fz` records are verbatim Forza panel captures
and they are the evidence behind every measured figure; they stay exactly where they are
(maintainer ruling: *"you can leave the measured numbers where they are"*). What the file loses is
its ROLE as a place a human types a number, and that is stripped by documentation rather than by
touching a locked directory.

## The lineage this builds

```
roster CSV  --generate-->  packages/content/data/cars.json
            --generate-->  docs/design/car-performance/lapsim/lapsim-data.json
```

One source, two generated artefacts, one guard that fails if either drifts. The game and the
harness compute from literally the same numbers, so the Wagon R class of divergence becomes
impossible rather than merely unlikely.

## Reuse analysis (directive 16)

**New: one generator and one guard.** Both replace things that already exist rather than sitting
beside them.

**Existing mechanisms reused:**
- **The roster CSV already has a column for every field `cars.json` carries.** No schema change and
  no new columns. The only exception is `zeroToHundredS`, which `TODO.md` already records as having
  no consumer anywhere in `packages/` and which is dropped rather than added.
- **`CarModelsSchema` is unchanged.** The generator's output is validated by the schema that already
  exists, so a bad row fails loudly at build rather than silently at runtime.
- **`rosterCsvGuard.test.ts` already pins roster facts** and is extended rather than duplicated.

**Deleted, not migrated (directive 19):** `scripts/importSpecBook.cjs`, and
`packages/content/tests/carSpecBookGuard.test.ts` whose job the new guard does from the correct
upstream.

## Tasks

1. **Backfill the CSV from the spec book, once.** For every car with a book entry, copy the fields
   the CSV lacks (`rl`, `psr`, `tqr`, `tq`, `cc`, `cfg`, `ec` and chassis code) into their roster
   columns. This is the migration that makes the CSV complete; after it, the book is never read
   by a tool again.
2. **Research six values for three cars** that have no book entry: `redlineRpm` for the Toyota
   Corolla AE91 and the Land Cruiser 70, and `powerRpm`, `peakTorqueNm`, `torqueRpm` and
   `redlineRpm` for the Suzuki Jimny JA11. Record them in
   `docs/design/reference/roster-research-provenance.csv` as every other researched value is.
3. **Fill the mechanical columns** for the 27 newly-built cars: `id` (from the book's own id where
   one exists, otherwise kebab-case of the display name), `tags` (derived from drivetrain,
   aspiration, engine type, decade and kei status, exactly as the shipped 26 are), and
   `measuredFrom`.
4. **Author `parodyName` and `parodyBrand`** for the 27. **Copy, written by the orchestrator, not
   an agent.** Six brands are established (Handa, Toyoda, Nissen, Suzuko, Mazuda, Subaro); ten are
   new (Autozam, BMW, Daihatsu, Datsun, Eunos, Ferrari, Lamborghini, Lancia, Mitsubishi, VW).
5. **Write the CSV to `cars.json` generator.** It emits every row with `builtInContent: yes`, in
   the schema's own field order, and its output is parsed by `CarModelsSchema` before it is written.
6. **Write the CSV to `lapsim-data.json` generator**, so the harness reads the same figures the game
   does.
7. **Replace the guard.** `cars.json` and `lapsim-data.json` must both match the CSV, in either
   direction, so neither can drift. Delete `carSpecBookGuard.test.ts` and `importSpecBook.cjs`.
8. **Mark the spec book non-authoritative** in `docs/design/car-performance/README.md`: it is the
   evidence archive, its `fz` captures are canon, and its adopted-figure columns are history that
   no tool reads.

## What falls out for free

- **The 27 new cars are authored** by running the generator, rather than by hand.
- **The 13 wrong tiers correct themselves.** `TODO.md` records that 13 of the 26 shipped cars sit on
  a different tier in `cars.json` than in the roster. The roster is right and the generator reads
  the roster, so they resolve on the first run. `rosterCsvGuard.test.ts` pins those 13 as an exact
  set and that pin comes out with them.

## Definition of done

- `cars.json` holds all 53 approved cars and is byte-identical to a fresh generator run.
- Editing a figure in the CSV and re-running the generator moves it in both artefacts.
- The old guard and the broken importer are gone.
- No lap time changes for any of the 26 already-shipped cars. **If one moves, that is a finding to
  report, not a fixture to re-pin**, because the acceptance fixture is a check against a known
  answer.
- `pnpm typecheck` clean (directive 20's carve-out applies), `npx eslint .` clean, all three test
  projects green.

## Deliberately not here

- **The Wagon R's corrected top speed.** Its roster row reads 151 / 0.38 and `cars.json` reads
  140 / 0.36; syncing it moves its Hakone lap past the acceptance tolerance against a harness
  reference validated on real driven laps. That belongs to the performance re-validation pass along
  with the 280 PS question, both recorded in `TODO.md`. **This sprint must preserve the divergence
  rather than resolve it**, and its guard needs an explicit, named exemption for that one car so the
  divergence is visible rather than silently generated away.
- Any change to the physics model, the harness, or a measured figure.

## Exit

### What landed

**The lineage, which was the point.**

```text
docs/design/midnight-garage-roster.csv
    --scripts/generateCars.cjs-------------> packages/content/data/cars.json
lapsim/lapsim-data.json (harness output)
    --scripts/generateHarnessReferenceTimes.cjs--> packages/sim/tests/harnessReferenceTimes.json
```

- `scripts/generateCars.cjs` emits every roster row marked `builtInContent: yes`, in
  `CarModelSchema`'s own field order, parses its own output with that schema before writing, and
  formats through the repo's Prettier so a run is byte-stable. `--print` writes to stdout and
  touches nothing, which is how the guard proves reproducibility without mutating the tree.
- `packages/content/tests/carsGeneratedFromRoster.test.ts` replaces `carSpecBookGuard.test.ts`: it
  runs the generator and compares byte-for-byte and field-by-field, in both directions.
- `scripts/importSpecBook.cjs` and `carSpecBookGuard.test.ts` are deleted.
- `rosterCsvGuard.test.ts` lost its field-copy half, which was the new guard's job done twice on a
  hand-listed subset of fields; both now share `packages/content/tests/rosterCsv.ts` for reading the
  CSV rather than each carrying a parser.
- `docs/design/car-performance/README.md` records the spec book as the evidence archive.
- `zeroToHundredS` is no longer emitted. `quotedPowerPs` now is, wherever the CSV carries it.

**The Wagon R divergence survived**, named and commented in both the generator
(`HARNESS_DIVERGENCE`) and the guard, with the guard asserting BOTH sides: `cars.json` at 140/0.36
and the roster row at 151/0.38. It fails if the gap widens and it fails again when the
re-validation pass closes it, which is when both entries come out.

**Task 7 could not be built as written, and the reason matters.** `lapsim-data.json` is not a
hand-maintained input: `lapsim-report.cjs` line 5 reads `car-spec-book.html` and line 8966 WRITES
`lapsim-data.json`, lap times, ranks and all. Generating it from the CSV would mean recomputing
every lap, which this sprint forbids. The file that IS hand-maintained downstream of it is
`harnessReferenceTimes.json`, which was a hand-copied 26-car subset of `lapsim-data.json`'s `cars[].t`.
That is now generated, and it is what closes the loop the task was aiming at.

**The roster CSV was completed.** 200 blank cells backfilled from the spec book across all 85 rows
the book covers; six values researched for the three cars it does not; ids, tags, `measuredFrom`
and the approved parody strings authored for 27 cars.

### The finding that changed the shape of the sprint

**The roster CSV and the spec book carried two different research streams and disagreed on physics
for almost every new car.** The sprint doc assumed only blanks differed. In fact 91 populated cells
across the 27 disagreed, including `dragCd` on the BNR34 (0.34 against the harness's 0.292), the
NSX-R and the F355 (0.32 against 0.365), the Hakosuka (0.50 against 0.416) and the Acty (0.63
against 0.45); the Cappuccino's top speed (183 against 150); the Countach's stock tyre (its front
225/50R15 rather than the 345/35R15 the grip was measured on); and the ENTIRE measured block of the
Celica GT-Four, where the roster carried the raw Forza panel figures that the book's own `gOvr`
ruling had already replaced because the panel measured a preset build.

Generating from the roster as it stood would have shipped physics the calibrated harness contradicts.
So the physics block of the 27 newly-built rows was reconciled to the harness's own inputs - the
book for the spec, the harness `DIMS` table for width and height, the harness's `compoundFor` for
the tyre compound. **The 26 already-shipped rows were not touched.** `dragCd` in this repo is a
model parameter back-solved from measured top speed, not a published aerodynamic fact, which is why
the harness's value is the right one to carry even where a manufacturer figure exists.

One row needed more than reconciling: **MG-001 Honda Today** named the 1985 JW1 with the two-cylinder
EH (545 cc, 31 PS, `engineConfig` I2, which the schema has no member for), while the spec book's
`honda-today-jw1` is a 1988 E05A three-cylinder. The row now describes the car the harness measured,
including `yearFrom` 1988. Its variant label and production window want a maintainer look.

### Four questions only the maintainer can answer

Each is a failing test left failing on purpose, or a car held back on purpose.

1. **Four gaisha cars are authored but not shipped.** GDD 4.5 sources a gaisha only through the
   unbuilt Import Broker, nothing in the sim reads `origin` yet, and `auctions.test.ts` carries a
   tripwire saying in its own words that a gaisha in `cars.json` before then "fails here, which is
   the point". Held back rather than shipped into ordinary auction catalogues: BMW M3 (E36), Lancia
   Delta HF Integrale Evo, Ferrari F355 Berlinetta, Lamborghini Countach LP5000 QV.
2. **The Honda Today ties the core-loop law.** `plays.test.ts` requires fixing to be the best use of
   a day on EVERY car; the Today reads repair-to-expectation 130/pt against strip-as-found 130/pt.
   A tie, not an inversion, on the cheapest car on the roster. Untouched: it is an economy question
   (directive 22).
3. **The Datsun 510 overshoots the grip ladder.** A maximal legal build reaches x1.509 of stock
   mechanical grip against `aftermarketPhysics.test.ts`'s x1.40 target band, which caps at 1.48. Two
   per cent over, on a narrow-tyred `eco`-compound 1970 car where the ladder's relative gain is
   largest.
4. **The collector network now draws rougher cars than the premium room.** `auctions.test.ts` asserts
   the project-grade rate falls monotonically from the local yard to the collector network; premium
   now reads 24.6% against collector's 26.6%. Driven by the tier and culture mix of the new
   flagship content, not by any lever.

Plus a fifth that is not a test failure: **the Honda Acty loses only 8.85% of its Wangan pace fully
scrapped**, against `conditionPhysics.test.ts`'s 10% floor. A 660cc truck is drag-limited rather
than grip-limited on a 7 km highway loop, so condition has less to take away.

### Directive 17, case by case

Case (a), the assertion was stale because the roster deliberately grew, and was updated to assert
the new correct behaviour:

- `engineCharacter.test.ts`, `proportionalPower.test.ts`, `reliabilityModel.test.ts` (three tables),
  `bands.test.ts`, `stockCarValuationInvariant.test.ts`: per-car pinned tables and roster counts,
  re-derived from the code's own output for the cars that joined.
- `auctions.test.ts`: the band-population premises (enthusiast 14, flagship 8; entry 3 uncommon and
  10 common, so the band weight is 11.5 rather than 6). The share assertions they support are
  unchanged and still pass.
- `advanceDay.test.ts`: both golden-master hashes. A pure content change - the catalogues draw from
  a larger pool from day one - with nothing in the sim moved.
- `harnessAcceptance.test.ts`: gained a named, both-ways-checked list of the three shipped cars the
  harness has never run, because they have no spec-book entry.
- `sandboxCars.test.ts`: 45 in-game / 40 synthesised, after regenerating the dev sandbox roster.
- `naming.test.ts` did not need changing: it caught two approved parody names leaking the protected
  token `GT-R`. The shipped BNR32 already substitutes `GT-N`, so the same substitution was applied
  to the BNR34 and the Hakosuka.

Case (b), the test caught a real problem and the code or content was fixed, not the test: the gaisha
tripwire (item 1 above), resolved by holding the four cars back.

Left failing, deliberately, as questions rather than fixtures: items 2, 3, 4 and the Acty.

### Definition of done, checked

- [x] `cars.json` is byte-identical to a fresh generator run, and the guard proves it every run.
- [x] Editing a figure in the CSV and re-running moves it in `cars.json`; the harness fixture is
      generated from the harness's own output rather than the CSV, for the reason given above.
- [x] The old guard and the broken importer are gone.
- [x] No lap time changed for any of the 26 already-shipped cars. Their only `cars.json` movement is
      `zeroToHundredS` dropped and `quotedPowerPs` added.
- [x] `pnpm typecheck` clean, `npx eslint .` clean, `--project content` and `--project game` green.
- [ ] `--project sim` has four deliberate failures, listed above.
- [ ] 48 of the 53 approved cars ship. Four gaisha are blocked on GDD 4.5, one on a missing parody
      name (the VW Golf GTI 16V Mk2, whose approved brand is VeeDub but whose name was not supplied).
