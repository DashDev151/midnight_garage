# Sprint 221: metalwork ruins paint

**Status:** Complete. Committed and pushed in `2c299e8` (2026-08-19).
**Trigger:** Maintainer, on the sprint 220 walkthrough: after beating, welding or filler
work the paint currently remains pristine and the panel never needs repainting. Incoherent,
and it contradicts the ruling that every panel goes through the set pipeline.

## Goal

Any metal or filler stage on a zone destroys the finish over it. Beat, weld and
fillAndSand each set `finish` to bare and `primed` to false. Every damaged panel therefore
walks the full five steps; prime and paint stop being fresh-panel-only stages.

## Felt behaviour (governance amendment 2026-08-13)

Repairing metal ruins the paint over it. A dent repair on a painted panel ends with
primer, paint and polish: about 2,500 yen more in materials and 4 more labour than
before. A filled patch can never hide under factory paint, and a buyer never meets one.
The repair bill prices this honestly in both directions: a dented car with good paint
bills for the repaint its repair will force, and is worth correspondingly less to buy.
No economy.json value moves; the same stage costs simply occur when physics says they
must.

## Reuse analysis (directive 16)

New mechanism: none. This is a change to what three existing stage effects mutate.
Reused: the stage planners (`planMetalPipelineStage`, `planSharedPipelineStage`) whose
effects gain the finish reset; `zoneNextStep`, which needs no change (finish bare after
metalwork routes to prime, paint, polish by its existing logic); the sprint 220 UI, which
derives everything from the step model and follows automatically; the repair-bill walker
(`planZoneRepair`), which simulates these same planners and so reprices automatically;
`applyDerivedBodyBands` for the carrier bands.

## Tasks

- [x] Sim: beat, weld and fillAndSand effects also set `finish` to `BARE_FINISH` and
  `primed` to false (idempotent per click). Trim zones untouched (they have no such
  stages).
- [x] Tests: stage-effect tests updated (directive 17 case a where they asserted paint
  survival); new bill test: a zone with metal damage under mint paint bills for the
  full repaint chain; regression test that `zoneNextStep` after a fill reads prime.
- [x] Verify: sim test files touched, once; `pnpm typecheck` once (stage effect shape).

## Exit

`beat`, `weld` and `fillAndSand` (`planMetalPipelineStage`, `packages/sim/src/bodyPipeline.ts`)
now also set `finish: BARE_FINISH` and `primed: false` on every application, idempotent per
click. `zoneNextStep` needed no change, verified rather than rewritten: a zone left bare and
unprimed already routes to `prime` under its existing branches.

The repair-bill walker did NOT reprice automatically, and needed two passes to get right.

First pass: `planMetalZoneRepair` priced `repaintChain` from the zone's pre-metalwork finish,
then straightened metal to target in a trailing call after that price was already fixed; a zone
with metal damage alone (no surface damage) under otherwise-good paint priced no repaint at all,
because the finish reset from `beat`/`weld` landed after the pricing had already run. The first
fix moved the straighten ahead of the pricing, deciding whether a fill was needed from the
zone's pre-metalwork surface and finish.

That first fix still missed one case, caught in review: metal above target with surface damage
present but not itself over target (for example metal 2, surface 1, finish 1, target fine).
Deciding the fill from the pre-metalwork finish meant the fill check never saw that the
metalwork about to run would bare the finish and force a repaint over that surface; `prime`
then refused over the unlevelled surface `fillAndSand` was never called to clear, so the bill
undercounted the whole fill-and-repaint chain and the "repaired" zone came back with raw metal
and surface still on it. The corrected chain follows the causality in order: metal left above
target owes straightening (`metalWorkOwed`); straightening that far bares the finish, so it
owes the repaint too (`repaintOwed`, fed by `metalWorkOwed`, not decided from pre-metalwork
finish alone); a repaint owed over any raw surface owes the fill (`needsFill`, fed by
`repaintOwed`); and the fill owes fully straight metal, so the straighten pass goes to 0
whenever a fill is coming and to `targetSeverity` otherwise. Combined metal-and-surface damage
already priced correctly before either fix, once, because the straighten happened ahead of the
fill in that branch regardless; that path is unchanged throughout.

Ripple check: `applyDerivedBodyBands`/`derivePaintBand` read `finish` and needed no change, as
expected. `hasZoneDegradeHeadroom`/`hasZoneImproveHeadroom` (auctions.ts generation balancing)
are unaffected: they answer a question about generation's own damage-budget headroom
(`rollZoneStates`, `spendDamageBudget`), which never calls the stage planners this sprint
touched, so their correctness is unchanged.

Tests: 12 sim test files run once (`zonePipelineStages`, `zoneStatus`, `beyondRepairPanels`,
`pipelineActions`, `consumables`, `financeLedger`, `auctions`, `valueModelProbes`, `marketValue`,
`storyMissionProbes`, `damagePatterns`, `auctionGrade` - 243 tests) plus the two game-side files
(`zoneSeverity`, `BodyShopScreen` - 95 tests), all passing with no pre-existing failures: no test
in the suite had asserted paint surviving metalwork, so directive 17 never had case (a) or (b) to
adjudicate here. Tests added, all in the existing sim test files: stage-effect finish/primed
reset (beat, weld, fillAndSand, plus an idempotency check) in `zonePipelineStages.test.ts`; the
`zoneNextStep` regression in `zoneStatus.test.ts`; and in `beyondRepairPanels.test.ts`, the
pure-metal-damage repaint-chain bill test (hand-walked stage sum against
`bodyPartRepairBillYen`, no double count against bodywork), the metal-above-target-with-surface
case named above and its worn-target sibling at the weldable ceiling, and a sweep invariant
(metal 0-3 x surface 0-2 x finish 0-3 x target mint/fine/worn) asserting every axis of a repaired
zone lands at or below its target severity, and that a repaint is always billed whenever
metalwork owed above target meets a zone whose finish was not already bare.
`pnpm typecheck` run after the first fix, clean across content/sim/game; the review-caught
correction changed no exported shape, so no further typecheck run.

A full `pnpm test --project sim` run (beyond the narrow files named above) surfaced four more
failures the narrow runs could not reach: two golden state-hash pins in `advanceDay.test.ts`
and the smoke-script hash sequence plus checkpoint list in `careerReplay.test.ts`. All four are
directive 17 case (a), and all four trace to the same mechanism, verified rather than assumed by
inspecting the day-1 buyout car directly: `carCostToMintYen`/`carCostToBandYen` route a
zone-model car's bodywork and paint bills through `bodyPartRepairBillYen`, which every guide
value and buyout price already read before this sprint. The smoke script's day-1 buyout car
carries several metal-damaged zones under otherwise intact paint (for example a bonnet at metal
1 under finish 2), so the corrected bill now correctly prices the repaint that metal damage will
force, and the car appraises lower - none of the three checkpoint misses trace to a body-stage
action or to the review-caught correction (which only changes partial-band billing; a full-mint
valuation's fill decision is mathematically identical before and after that second fix, checked
directly). The day-7 `cashAtMost` ceiling moved up (214954 to 215156) because less was spent on
the cheaper buyout, consistent with the same cause, not a separate issue. Re-pinned: both
`advanceDay.test.ts` hashes, `careerReplay.test.ts`'s `EXPECTED_HASHES_BY_DAY`, and
`smoke.script.json`'s three checkpoints, each with a comment recording the behaviour that moved
them. `pnpm test --project sim packages/sim/tests/advanceDay.test.ts` and
`packages/sim/tests/careerReplay.test.ts` both pass, run once each after the re-pin.
