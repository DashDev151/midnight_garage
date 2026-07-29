# Sprint 90 - Roadworthy tells the truth about NA cars

A correctness hotfix surfaced while landing Sprint 89 (playtest arc). `evaluateRoadworthy`
fails a naturally-aspirated car for its legitimately-empty turbo slot, which makes Yuki's
`four-wheels` mission unsatisfiable with most cheap shitboxes (the NA ones) and forced both
the Sprint 78 satisfiability probe and the Sprint 89 tutorial to mask it by pre-filling the
turbo slot (a turbocharged Wagon R). Fix the check; drop the mask.

## Reuse analysis (directive 16)

**New mechanisms:** none.

**Existing mechanisms to reuse:**

- `isPartMissing(car, model, partId)` (`bands.ts:196`) already encodes the exact rule:
  a `forcedInduction` slot on a non-forced-induction model is legitimately absent, not
  missing. Every other consumer (auction grading, all cost functions) already uses it;
  `evaluateRoadworthy` is the sole evaluator that does not. The fix is to make it
  consistent, not to invent anything.
- `context.modelsById[car.modelId]` (`context.ts:64`) resolves the model the check needs;
  `evaluateRoadworthy` already receives `context`.
- The Sprint 78 / Sprint 89 satisfiability-probe pattern; the tutorial lot builder.

## Decisions

1. **The fix.** `evaluateRoadworthy` (`packages/sim/src/requirements.ts:217-234`) resolves
   `model = context.modelsById[car.modelId]` and, inside the slot loop, skips any slot
   where `!isPartMissing(car, model, partId)` treats it as legitimately absent (i.e. an
   empty slot only fails when it is genuinely missing, not when the model never had that
   part). A present part still fails when below `worn`, unchanged. If the model cannot be
   resolved, fail closed (count the slot), matching how the sibling evaluators degrade.
2. **Regression test (the core assertion, both directions):** an NA model whose 28 real
   slots are all at `worn` or better and whose `forcedInduction` slot is empty grades
   roadworthy TRUE; the same car with any real slot dropped to scrap/empty grades FALSE;
   a forced-induction model with an empty `forcedInduction` slot grades FALSE (there the
   turbo is a genuine missing part). Add to the requirements test suite.
3. **Drop the mask, tutorial.** `buildTutorialLot` (`packages/sim/src/tutorial.ts`) stops
   force-filling the NA turbo slot; the scripted Wagon R is built as an honest NA car
   (empty `forcedInduction`). Remove any FI-related override in `tutorialLot.json` if
   present. The tutorial's engine beat still teaches a real repair (the `worn` internals /
   head, per the recipe); it never taught an FI repair, so no copy or beat changes.
4. **Drop the mask, probes.** Re-derive the Sprint 89 tutorial probe
   (`tutorialProbe.test.ts`) and the Sprint 78 `four-wheels` satisfiability probe
   (`storyMissionProbes.test.ts`) so each builds/asserts the honest NA car (empty FI slot)
   and confirms the mission is satisfiable WITHOUT pre-filling FI. This is the test that
   proves the fix does its job: the same recipe that was only satisfiable via the mask is
   now satisfiable honestly.
5. **No save change** (pure evaluation, no state shape change); **no golden-master change
   expected** (roadworthy reads state, never writes it). Confirm the goldens do not move;
   if any does, that is a signal something unexpected changed and must be explained, not
   blindly re-pinned.
6. **Directive 17 for any existing roadworthy test that passes on the bug:** a test that
   asserts an NA car fails roadworthy for its empty FI slot is asserting stale/wrong
   behaviour (case (a) once the fix redefines correct); update it to the true behaviour
   and state so.

## Definition of done

- [x] An honest NA car (empty FI, all real slots >= worn) grades roadworthy; a turbo car
      with an empty FI slot does not; the regression test pins both.
- [x] The tutorial Wagon R is naturally aspirated with no phantom turbo; the tutorial
      beats and copy are unchanged.
- [x] Both satisfiability probes assert `four-wheels` is satisfiable with the honest NA
      car, no FI pre-fill.
- [x] No save bump, no golden movement (goldens passed unchanged, as expected for a
      read-only evaluation fix).
- [x] Three package typechecks clean; narrowest tests once; pre-push gate is the evidence
      (directive 20).

## Task breakdown

**Claude-implementable:** all decisions. **User-only:** none (folds into the arc-closing
playtest, where Yuki's mission should now complete with a cheap NA car).

## Exit

The fix landed (implementation by subagent, orchestrator-policed). The record:

- **The fix:** `evaluateRoadworthy` resolves the car's model via `context.modelsById` and
  skips a legitimately-absent slot through `isPartMissing` (the same rule auction grading
  and every cost function already use); an unresolvable model fails closed. An honest NA
  car now grades roadworthy with its empty `forcedInduction` slot; a turbo car with an
  empty FI slot still fails (there the turbo is genuinely missing). Consequence:
  `four-wheels` is now satisfiable with a naturally-aspirated shitbox, which most cheap
  cars are: the direct answer to "is Yuki's job possible".
- **Regression test** pins both directions through the real evaluate path.
- **The mask is gone:** `buildTutorialLot` leaves the NA turbo slot empty exactly as a
  real NA auction lot is built; the tutorial's beats, copy and taught engine repair
  (worn head/valvetrain) are unchanged. Both satisfiability probes (Sprint 89 tutorial,
  Sprint 78 four-wheels) now prove the mission passes with the honest empty-FI car.
- **No save bump, no golden movement:** roadworthy reads state and never writes it, so no
  hash moved and none was re-pinned (directive 17 did not fire; no existing test asserted
  the old NA-fails-roadworthy behaviour).
- **One scoping deviation, orchestrator-accepted:** the four-wheels budget/payout pin in
  `storyMissionProbes.test.ts` still uses the old filled-FI probe cost; the honest car is
  graded separately for the satisfiability proof. Re-deriving the two content numbers
  from the honest recipe would shift them ~1% and cascade into a mission-economy retune,
  out of scope for a read-only bug fix. The current numbers are safe (the honest car
  needs less work, so the cap is slightly generous, never tighter). Recorded in TODO.md
  for the next mission-economy pass.
- **Narrow evidence (each once):** sim 51 files / 956 tests green; all three package
  typechecks exit 0.
- **Full evidence:** pushed through the pre-push gate; no separate manual pass
  (directive 20).
