# Sprint 166: the four defects the stat docs found

## Goal

Writing `docs/carstats/` turned up five live defects. Four are fixed here; the fifth (machining) is
an unbuilt feature rather than a bug and stays on the backlog.

**The hard constraint on all of it: do not regress or degrade the handling simulator.** The
performance model is LOCKED and validated to about 2 per cent against the maintainer's own driven
laps. `harnessAcceptance.test.ts` holds every shipped car on every shipped course to a tenth of a
second and **must pass untouched**. A stock car's numbers must not move at all.

## Definition of done

1. Forced induction is read from the car's own `aspiration`, not from a tag that 68 roster rows do
   not carry.
2. Fitted aero adds to a car's factory downforce instead of replacing it, so a wing can never make
   a car worse at generating grip.
3. A car with bare panels says so, so the temporary style and authenticity dip is legible.
4. The dyno sheet's four figures always reconcile to the base.
5. `harnessAcceptance.test.ts` passes untouched and every stock car reads exactly what it read
   before.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.**

- `spec.aspiration` already exists on `CarModel` and is already authored in the roster CSV's own
  column. This retires a second source rather than adding a first.
- `effectiveDownforce` and `spec.aeroCeiling` already resolve what a fitted aero SKU is worth. Only
  how it combines with the factory figure changes.
- `factoryDownforceCoeff` already holds the floor. It is not recomputed, it is respected.
- The workshop already shows zone state; the bare-panel warning is a readout of what is already
  modelled.

**Genuinely new.** Nothing structural.

## The four fixes

### 1. Forced induction reads `aspiration`

`hasForcedInduction` reads `model.tags` alone. The roster authors induction in its own `aspiration`
column and leaves `tags` blank on all 68 unbuilt rows, so an imported turbo car silently reads NA,
takes NA power fractions everywhere, and nothing fails.

`spec.aspiration` is on `CarModel` already and only a dev screen reads it: two copies of one fact,
the wrong one live. **Read `spec.aspiration`, retire the tag path.** Every currently shipped car
must resolve to the same answer it resolves to today; prove that for all 26 before and after.

### 2. Aero adds to a floor rather than replacing it

A fitted aero part replaces a car's factory downforce figure, so a race wing DROPS the Honda City E
from 41 handling to 30 and a street lip kit is a net handling loss on 11 of the 26 shipped cars. A
bolt-on wing replaces the factory spoiler's contribution; it does not replace the car's underbody
and shape.

**Every car's factory downforce becomes a floor, and a fitted part adds to it:**

```
downforce = factoryDownforceCoeff + (sku.downforce x spec.aeroCeiling)
```

**Drag is deliberately NOT scaled by the ceiling and keeps arriving in full.** That is what makes a
wing on a kei van a bad idea, which is the whole point of the ceiling: the part generates little
downforce on that body but the drag is real regardless. A badly-mounted wing on a box slows the box
down, and it should.

**Open question for the maintainer, recorded rather than decided:** the instruction was "additional
aero always adds downforce and drag, depending how much per car", which could mean drag scales per
car too. This sprint implements unscaled drag for the reason above. If drag should also scale, that
is a one-line change and a second per-car number, and it makes a wing on a Wagon R a near-no-op
rather than a loss.

### 3. Bare panels are visible

Fitting a body kit resets all five panel zones to bare metal, so `paint` derives to `poor` and drags
the style and authenticity condition factors down until the car is painted. **The maths is right**:
the car really is sitting in primer and really is worth less like that, and the loss returns when it
is painted. What is wrong is that nothing says so.

Surface it where the player sees the stat drop. No formula changes.

### 4. The dyno sheet reconciles

`reliabilityBreakdownOf` is exact to 1e-14, but the sheet rounds each of its four terms
independently, so the displayed integers can sum to 91 against a base of 92. Round so the parts
always sum to the whole.

## Levers (directive 22)

**None.** No content value moves. Fix 2 changes how two existing numbers combine, not either
number.

## Tests

1. **`harnessAcceptance.test.ts` untouched and passing.** Run it explicitly and say so.
2. **Every stock car is unchanged**, all 26, strict equality on every stat and every lap time. A
   stock car carries no aero SKU, so fix 2 must not reach it.
3. All 26 cars resolve the same induction answer before and after fix 1.
4. A wing never lowers a car's downforce. Pin the City E specifically, since it is the worst case.
5. The wing on a Wagon R is still a bad idea. Pin it, so fixing the City does not quietly undo
   Sprint 140.
6. The dyno's four figures sum to the base, across a wide sweep.

## Exit

**All four fixes built. The handling simulator did not move.** Ready for review.

### The hard constraint, discharged first

- `packages/sim/tests/harnessAcceptance.test.ts` is **untouched** and passes: 27 tests, every
  shipped car on every shipped course. It calls `lapTime` with no aero effect, so it exercises the
  factory path, which fix 2 leaves alone by construction as well as in fact.
- **Every stock car is unchanged, all 26, strict equality.** Measured rather than argued: a
  throwaway probe dumped all five derived stats, all four lap times and the resolved downforce for
  a stock mint instance of each of the 26 cars, before and after the whole sprint. Diff: **zero
  differences on any car, any stat, any course.** The probe was deleted after use.
- The relative guard already in `aero.test.ts` ("leaves a stock car exactly where it was, on all 26
  and every course") still passes: a stock car carries no aero SKU, so the ceiling has nothing to
  scale and the factory floor is what it always was.

### Fix 1, as built

`hasForcedInduction` (`packages/sim/src/bands.ts`) now reads `model.spec.aspiration`, and the tag
path is gone. **All 26 shipped cars resolve the same answer before and after, 16 forced and 10 not,
with no disagreements**; `bands.test.ts` now asserts that equivalence on all 26 permanently, so the
day a car's two representations diverge is the day it fails rather than the day it silently takes
the wrong power column.

`spec.aspiration` was made **required** on `CarModelSchema`. It had to be: the induction tag is
schema-guaranteed present (a refinement demands exactly one), so reading an optional field instead
would have swapped a guarantee for a silent `NA` default, which is the exact defect this fix
exists to close. Five sim test fixtures gained the field. No content value moved.

`spec.aspiration`'s entry in `retiredIdentifiers.test.ts` (which banned sim from reading it) is
removed: the ban recorded the old direction of travel and this sprint reverses it. Its replacement
is behavioural rather than structural, and stronger for it: `bands.test.ts` asserts the answer
against models whose aspiration and tag deliberately disagree, which is the only way to prove which
one is being read. `integrity.test.ts` still holds the two representations in agreement on every
shipped car.

### Fix 2, as built

`effectiveDownforce` returns `factoryDownforceCoeff(model, aero) + graded.downforceCoeff *
spec.aeroCeiling`. Drag is unscaled and arrives in full, as designed.

**The Honda City E, the worst case:** factory downforce 1.0038, the largest on the roster. A race
wing used to REPLACE it with 0.36 and drop the car from 41 handling to **30**; it now reads
**1.3638 and 47**. Street and sport went 41 to 25 and 41 to 27, and now read 41 and 43. Its lap
times went the same way: Misaki 144.4 to **143.7** against a stock 143.7, Hakone 133.3 to **132.0**
against a stock 131.8. Yatabe still costs it (34.9 stock, 35.7 winged), which is correct: a
standing kilometre has no corner to pay the drag back.

**The Wagon R is bit-for-bit unchanged**, because its own body makes nothing: 0.24 downforce with a
race wing before and after, 12/13/16 handling by grade before and after, and the same four lap
times. It still loses on every course (Misaki 148.9 to 149.0, Wangan 201.0 to 201.7, Hakone 142.9
to 143.2, Yatabe 36.0 to 36.7). Sprint 140 stands.

**Across the whole roster: a fitted aero part now lowers handling on no car at any grade.** It used
to lower it in 14 car/grade combinations, including a street lip kit on 11 of the 26.

### Fix 3, as built

`unpaintedPanelZoneIds` (`bodyPipeline.ts`) reports the panel zones carrying no paint;
`unpaintedPanelsText` (`utils/zoneSeverity.ts`, beside the workshop's existing zone vocabulary)
turns the count into the line; `CarDetail.unpaintedPanelsNote` carries it and `CarDetailScreen`
renders it directly under the radar, where the stat drop is. **No formula changed.**

> Five panels are still unpainted. Style and authenticity read low while the car sits like that,
> and both come back once the paint is on.

Tested through the REAL install path (grant a car, paint every zone, fit a body kit via
`game.install`), not a hand-written zone state: the note is absent before, present after, and the
`paint` carrier is at `poor` after, which is the band that drags both stats.

### Fix 4, as built

`displayedReliabilitySplit` (`dyno.ts`) hands out whole points by largest remainder against what
the rounded stat leaves to explain, so the four displayed figures always sum to the base. Swept
over 26 cars x 3 build shapes x 5 bands: **390 combinations, all reconciling**, with every figure
still within a point of the exact loss it reports. The finding's own case is pinned by name: the
180SX at poor on a maximal build reads 91 against a base of 92 when the three are rounded
independently, and 92 now.

### Tests touched, with their directive 17 case

| file | case | why |
| --- | --- | --- |
| `sim/tests/aero.test.ts` (5 assertions) | (a) | Asserted the replace behaviour this sprint deliberately changed. Re-authored to the addition, plus three new tests: the floor holds on all 26 at every grade, the City E by name, and the FD/Wagon R pair restated. |
| `sim/tests/bands.test.ts` | (a) | `NA_MODEL` expressed NA-ness through a representation the sim no longer reads. Fixture updated; a new describe block pins the new contract against deliberately disagreeing fixtures. |
| `sim/tests/marketValue.test.ts` | (a) | Same stale fixture, and the only one that FAILED rather than merely reading oddly: `naModel` overrode the tag alone, so its legitimately-empty forced-induction slot stopped being legitimate. Intent unchanged, expressed through the live field. |
| `sim/tests/carCondition.test.ts`, `derivedStats.test.ts`, `valuation.test.ts` | (a) | Fixtures gained the now-required `aspiration`. No assertion moved. |
| `sim/tests/engineCharacter.test.ts` | (a) | Trailing comment pointed at the retired-identifier guard that this sprint removes. |
| `content/tests/retiredIdentifiers.test.ts` | (a) | The `spec.aspiration` ban asserted the old source of truth. Entry removed; the word-boundary unit test it anchored was re-pointed at `statModifiers.power`, a live case of the same shape. |
| `content/tests/integrity.test.ts` | (a) | Doc comment described the tag as the live read. The assertion itself is unchanged and still valuable: it is now what keeps the display facet honest against the field the sim reads. |
| `sim/tests/dyno.test.ts` | new | The reconciliation sweep and the 91-against-92 pin. |
| `game/src/utils/zoneSeverity.test.ts` | new | The note's copy, its counting, and the two states it must stay quiet about (a missing panel, the chassis). |
| `game/src/screens/CarDetailScreen.test.ts` | new | The note through the real body-kit install. |

No test was loosened or deleted to make anything pass.

### Checks run

- `pnpm typecheck` (directive 20's carve-out: this retires a code path reading a schema field, and
  reshapes that field): all three projects clean.
- `harnessAcceptance.test.ts` explicitly, plus the aero, physics, dyno, body, valuation, generation
  and screen files the two behavioural fixes could plausibly reach, and the whole `content`
  project. All green. The pre-push hook is the full gate.

### Recorded rather than fixed

- **Four roster rows carry no `aspiration`**: the Nissan S-Cargo, Honda NSX-R (NA1), Ferrari F355
  Berlinetta (6MT) and Toyota 2000GT (MF10). All four are unbuilt, so nothing generates from them
  and no shipped figure is affected, and all four are naturally aspirated in fact. Left blank
  deliberately: with the field now required, importing one of those rows fails at the schema rather
  than silently reading NA, which is the loud failure this sprint wanted. Filling them is a roster
  edit, not an implementation one.
- **The drag question stays open**, exactly as the sprint tabled it: drag is unscaled here.
- **`docs/carstats/` needs a re-measure.** Three of its findings are closed by this sprint and one
  of its tables (handling's winged bounds) is now low. Logged in `TODO.md` rather than half-edited,
  since those documents are a measurement snapshot and correcting them properly means running the
  numbers again.
