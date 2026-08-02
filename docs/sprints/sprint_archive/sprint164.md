# Sprint 164: the two-tone penalty penalises

## Goal

`derivePaintBand`'s colour-mismatch penalty steps the wrong way. `SEVERITY_BAND_ORDER` runs
best-first, `['mint', 'fine', 'worn', 'poor', 'scrap']`, and the penalty returns
`SEVERITY_BAND_ORDER[idx - 1]`, which moves a band **towards** mint.

| paint band before | after the "penalty" |
| --- | --- |
| mint | **scrap** |
| fine | **mint** |
| worn | fine |
| poor | worn |
| scrap | poor |

So a car whose panels disagree on colour is rewarded in four cases out of five, and catastrophically
punished in the fifth. The function's own doc comment says "stepped one band worse", which is what
it should do and does not.

No test covers it.

## Definition of done

1. A colour mismatch steps the paint band exactly one rung worse, and `scrap` stays `scrap`.
2. A test covers every rung, so the direction cannot silently invert again.
3. The valuation impact is measured, not assumed.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.** All of them. `SEVERITY_BAND_ORDER` already expresses the ladder
and `bandForSeverity` already reads it in the correct direction. This is a wrong index, not a
missing mechanism.

**Genuinely new.** Nothing.

## Levers (directive 22)

**None.** The size of the penalty is not changing; only its direction. One band worse is what the
function already claims to do.

If the measurement shows the corrected penalty is too harsh or too mild, that is a finding to
report, not a number to move.

## Tasks

1. [x] Step the band one rung worse on a colour mismatch, with `scrap` as the floor.
2. [x] Cover every rung with a test.
3. [x] Measure how many cars are affected and what it does to their value.

## User-only tasks

None.

## Exit

**The fix.** `derivePaintBand` (`packages/sim/src/bodyPipeline.ts`) now applies the penalty
through the severity/band pair the rest of the module already uses:

```ts
return bandForSeverity(severityThresholdForBand(band) + 1)
```

`severityThresholdForBand` is the declared inverse of `bandForSeverity`, and `bandForSeverity`
already clamps at the worst rung, so the `scrap` floor is the existing clamp rather than a second
piece of index arithmetic. No new mechanism, and the raw `SEVERITY_BAND_ORDER` indexing is gone
from the function. The doc comment now states the floor.

| paint band before | before the fix | after the fix |
| --- | --- | --- |
| mint | scrap | fine |
| fine | mint | worn |
| worn | fine | poor |
| poor | worn | scrap |
| scrap | poor | scrap |

**Who the penalty can reach.** Generation never writes a zone colour: `rollZoneStates` rolls
metal, surface and finish only, and `planSwapPanel` clears the field. `planPaintStage` is the sole
writer, reached from the player's paint action (`stagedWork.ts`) and from `planZoneRepair`, which
deliberately puts the zone back in the colour it already wore so a quoted respray cannot invent a
disagreement. Measured over 312 generated lots (26 models x 12 seeds): **zero zones carry a colour
at all**, so no generated car can mismatch, before or after this change. The penalty only ever
bites a player who sprays two panels different shades. That is now a standing assertion rather
than a reading of the code.

**What it does to value: nothing, at any rung.** Injecting a two-shade mismatch into the same 312
lots and moving the paint band one rung in either direction changed `marketValueYen` on **0 of
312** cars (mean value 867,052 yen at neutral heat, identical under the old rule, the new rule and
no penalty at all). Three independent reasons, all of them structural:

- `carCostToBandYen`/`carCostToMintYen` route `panels`/`paint`/`underbody` through
  `bodyPartRepairBillYen`, which reads `car.zoneState` directly and never the derived band, so the
  restoration-bill deduction inside `instanceBaseValueYen` cannot see the penalty.
- `paint` is not in `economy.valuation.foundation.parts`, so `foundationFactor` is untouched.
- All four `paint` catalogue SKUs are `stock` grade, and `installedPartsValueYen` skips stock, so
  the carrier contributes no aftermarket premium whose band could matter.

**What it does move: the sale verdict.** `saleReputationDeltaFor` (`carCondition.ts`) reads every
part's band, and `costWeightedBandFactor` is read by the lemon rule and nothing else. On an
otherwise-perfect car whose panels disagree:

| paint (clean) | rep before the fix | rep after the fix | rep with no mismatch |
| --- | --- | --- | --- |
| mint | -8 (lemon) | +2 (clean) | +4 (concours) |
| fine | +4 (concours) | 0 | +2 |
| worn | +2 | 0 | 0 |
| poor | 0 | -8 (lemon) | 0 |

The old direction was doing real damage at both ends: a flawless respray in two shades was
classed a **lemon** and cost 8 reputation where an honest sale scores 0, a 12-point swing against
the best car in the game; and a `fine`-paint two-tone car was **promoted to concours**, which is
the exact opposite of what concours means.

**Is the new penalty harsher than the game can absorb?** No lever was touched and none is
proposed. Injecting a mismatch into the 312 generated lots moves the sale verdict on 53 of them
(17%), every one of them `poor -> scrap`, turning a neutral 0 sale into a -8 lemon; the old rule
moved 1 of 312. All 53 sit at `poor` because their worst finish is 3, which is bare, stripped
metal. Reaching that in play means painting two panels different colours AND leaving a third
stripped to bare metal: a half-finished respray, which reading as a lemon is correct. Recorded as
a measurement, not a problem.

**Tests.** `packages/sim/tests/paintMismatch.test.ts`, new, 8 cases. No suitable existing home:
`beyondRepairPanels.test.ts` is scoped to the metal axis and `bodyCarrierIdentity.test.ts` to what
a carrier holds, so this follows the same file-per-concern convention they do. Every rung is
covered unpenalised (bare, one shade across the car, and a single painted panel) and penalised,
plus the two boundaries the old index got wrong in opposite directions (`mint` to `fine` rather
than `scrap`, `scrap` staying `scrap`), a distinct-shade count check, and the generation probe
above. Severity 4 is fed as an input even though `ZoneState.finish` caps at 3, so the floor is
pinned for a band the function is total over rather than only for what today's schema can reach.

**No existing test moved** (directive 17: no case (a) or (b) arose, because nothing changed).
Exactly one fixture in the repo puts a colour on a zone, `bodyCarrierIdentity.test.ts`'s single
`kaido-blue` panel, and one painted zone is not a disagreement, so its result is identical either
side of the fix. Ran green unchanged: `bodyCarrierIdentity`, `beyondRepairPanels`, `stagedWork`,
`paintMismatch` (53 tests), plus `valueModelProbes` and `CarDetailScreen` (110 tests), the two
places a paint colour and a paint-derived value could have met.

**Checks.** `pnpm typecheck` clean across content, sim and game (run per the request, not the
directive 20 carve-out, which does not apply: no schema field or exported symbol was reshaped).
The full gate is the pre-push hook.
