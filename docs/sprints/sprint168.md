# Sprint 168: machining

## Goal

Build the third way a part gets better. Repair restores a part to what it was; fitting aftermarket
replaces it with something else; **machining improves the original**, and the part stays the car's
own.

This is the last unbuilt avenue of the tuning model, and it is what engine tool tier 3 has been
promised for.

**Design of record: `docs/design/systems/machining-system-design.md`. The numbers:
`docs/design/systems/machining-performance-table.md`. The code constraints:
`docs/design/systems/machining-integration-map.md`.**

## Definition of done

1. A player can machine a part, on a workshop page of its own, gated behind the engine line's tier
   3 and behind the part being at `mint`.
2. Machining is a property of the part. It travels with the part between cars and it is
   irreversible.
3. It adds power on the authored ladder, per engine character, scaling with the grade of the part
   machined.
4. It contributes support, which is the only thing that makes the two support-only operations do
   anything.
5. It costs authenticity, and `machiningCost` stops returning 0.
6. It costs a little reliability.
7. A machined part is worth more money.
8. **The power model still works.** The performance harness and the lap model are re-validated, not
   just the numbers.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.**

- **`PartInstance`** already persists per-part state and already survives the seventeen production
  sites that rebuild a car's slot as a fresh object literal. That is what makes machining travel
  with the part by construction rather than by care.
- **`statModifiers.powerFraction`**, keyed by engine character, already expresses exactly what an
  operation does to power. Additive and independent, as every part already is.
- **`slotContribution`'s `spec`** already expresses support. An operation adds to what the fitted
  grade already contributes; the support model keeps reading grade.
- **`machiningCost(car)`** is already written into `authenticityPercentOf` and already returns a
  number. It currently returns literal 0.
- **The job and labour system.** Directive 16 exists because a parallel job system was built here
  once and had to be reworked.
- **`updateLoosePart`** already takes a function from a `PartInstance` to a `PartInstance` without
  constraining which fields change.
- **The engine line's tier 3**, already named "Machine-shop tooling" at 1,500,000 yen in
  `toolLines.json`.

**Genuinely new.**

- One persisted field, `PartInstance.machining`, a list of operation ids.
- One content file: nine operations.
- One workshop page.

## The rulings, all the maintainer's

**Machining is a property of the part, not the car.** A machined block removed and fitted to
another car is still machined.

**It is irreversible.** Nothing un-machines a part.

**Only a `mint` part can be machined.** You do not bore a worn block, you rebuild it first.

**Labour is the cost.** Five units an operation, and no money per job. The 1,500,000 yen of tooling
buys the right to spend labour this way; it does not make the labour free.

**A machined part is worth more money**, because it is a dearer part. Not because performance moves
value, which it never does.

**Generated cars never arrive machined**, for now.

**A machined part can be sold.**

**Marginal operations are a lesson, not a defect.** Machining an NA engine's internals is worth
under one per cent for a full labour slot. The player should learn not to, and spend the labour
where it pays.

## Levers (directive 22)

**Approved**, and tabled in full in `machining-performance-table.md`:

- The nine operations' `powerFraction`, per engine character.
- The five `spec` contributions.
- The nine authenticity ratings, summing to 48 on a fully machined engine.
- **The catalogue's per-slot power fractions move on ALL THREE engine characters**, not only on
  forced. Roughly 24 fractions change: high-strung race 43 to 45, lazy 57 to 60, forced 95 to 130.
  The performance table holds every one. `TODO.md` forbids the forced rise by name; **the maintainer
  has approved it and that entry must be struck in this sprint** rather than left contradicting the
  target.

**Unsigned, to be tabled by the implementation and reported:** the reliability cost per operation,
and the machining premium on a part's value. Both start small and both are named in the Exit.

**One condition on the approval, from the maintainer: re-validate the power simulation model.** Not
a check that the arithmetic adds up, a check that the model still behaves.

## Tasks

1. `PartInstance.machining`, and the Dexie version bump. **No migration** (directive 19).
2. The nine operations as content, with their power, spec, authenticity rating and labour.
3. Power: operations read into the same path as a fitted part's `powerFraction`, scaled by the
   grade of the part machined.
4. Support: an operation's `spec` added to the slot's grade-derived contribution.
5. `machiningCost(car)`: a walk over installed parts summing applied operations' ratings,
   **charged on stock-grade parts only**. An aftermarket part already spent its slot's whole
   authenticity weight when it was fitted, so charging machining on top books one loss twice.
6. Reliability: a small per-operation cost.
7. Value: a machined part is dearer, including when loose. `installedPartsValueYen` skips
   `grade === 'stock'` today, which would make the ruling inert on the restoration case.
8. The workshop page. Gated on tier 3 and on `mint`. **Shows everything to begin with**: each
   operation's power on this engine's character, its support, its authenticity cost, its labour and
   its reliability cost. Strip back after it has been used, not before.

   **Show the five support ratios, not just an operation's own spec number.** Support only moves the
   headline when it lifts the weakest subsystem, so an operation bought on a subsystem that was
   never the constraint changes nothing visible. Without the ratios in view that reads as a bug
   rather than as the model working.
9. Raise the catalogue's forced fractions to the authored ladder, and strike the `TODO.md` ban.
10. Re-validate the power model.

## Tests

1. **The performance harness passes untouched**, run explicitly. Stock cars are unchanged.
2. **The ladder is exactly as authored**, on all three engine characters, measured through the real
   derivation: stock, stock machined, street, street machined, sport, sport machined, race, race
   machined.
3. **Machining never reaches the next grade up**, on any character. This is what keeps the money
   ladder meaningful and it must be pinned, not assumed.
4. **Machining travels.** A machined part removed from one car and fitted to another is still
   machined, through the real remove-and-fit path rather than a constructed state.
5. **Machining survives a repair job**, which is the failure the `PartInstance` choice exists to
   prevent.
6. **Only a mint part can be machined**, and the gate holds at every band below.
7. **The two support-only operations do something.** O-ringing and con-rod peening move a build's
   support verdict, on a stock part, which is the case that is inert without their `spec`.
8. **`machiningCost` is no longer 0**, and a machined car reads lower authenticity by the summed
   ratings.
9. **Machining an aftermarket part costs no authenticity**, on any grade above stock, while
   machining the same part at stock costs its full rating. This is the one that stops the slot being
   charged twice.
10. **A machined part is worth more**, installed and loose.
11. **Test 3's margin is pinned deliberately.** Sport-machined below race holds by 0.05 on
    high-strung NA, so the test must assert it rather than trust the rule: unlike the stock-machined
    case, that end of the ladder is tuned rather than structural.

## To measure and report in the Exit

- **Does the reliability cost double-charge?** It and `totalGainFractionOf`'s intensity term
  describe the same thing.
- **Machining for resale**: yen per labour point against the alternatives.
- **Parting out a machined car**: whether it beats selling it whole.
- **The fractions rising**: what it does to lap times and to every existing power pin, on all three
  characters.
- **Machining against buying, per labour point.** `partPricing.test.ts` carries two bounds that
  exist to stop a single correct first purchase, and **both iterate `PARTS`, so machining passes
  them without being looked at**. Tooling is a one-time 1,500,000 yen and operations are money-free
  thereafter, so port and polish at 6.18 per cent on forced is plausibly the dominant first move on
  every turbo car. **Extend those probes to treat machining as a pseudo-slot** and report where it
  ranks. This is the exact defect those guards exist for, arriving through the one door they do not
  watch.
- **Does machining belong in the plays ranking?** `plays.ts` ranks what a player can do with a car.
  A machining play is a candidate and its absence should be a decision rather than an oversight.

## Exit

_To be completed at the end of the sprint._
