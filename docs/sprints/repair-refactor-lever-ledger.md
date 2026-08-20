# Repair Refactor Lever Ledger (R1)

Behaviour-first governance (directive 22 amendment, 2026-08-13): every lever below states
the felt behaviour it buys; the maintainer validates by playtest. The economy guard re-pins
ride in the same sprints that move the values (224 and 231). Values marked "unchanged"
are listed so the arc's complete economic surface is in one place.

## Tool line tier 2 prices (`toolLines.json`, sprint 224)

| Group | Old | New | Felt behaviour |
|---|---|---|---|
| engine | 600,000 | 600,000 | The engine line stays the flagship purchase: a serious commitment around the `local` milestone. |
| drivetrain | 900,000 | 550,000 | No longer priced above the engine line; a gearbox bench is a mid-game step, not an end-game one. |
| suspension | 250,000 | 300,000 | Slightly up: it now buys real Rebuild capability (press, rebuild tooling), not just a better ceiling. |
| wheels | 150,000 | 250,000 | Up: the rim straightener ram is a genuine earner, priced like one. |
| body | 280,000 | 400,000 | Supersedes sprint 222 (D-A3): the line now carries the MIG and the parts-repair Rebuild kit, not just the panel pipeline. Still far below the pre-222 700,000. |
| interior | 350,000 | 280,000 | Down: the cheapest line, the natural first buy for flip-polish players. |

## Tool shop prices (`toolShops.json`, sprint 224)

| Shop | Old | New | Felt behaviour |
|---|---|---|---|
| machine-shop | 3,500,000 | 3,000,000 | The largest single purchase in the game, but no longer past the point of aspiration at `known`. |
| chassis-shop | 2,500,000 | 2,200,000 | Second tier of the three; a committed chassis specialist's move. |
| body-and-trim-shop | 600,000 | 1,500,000 | Supersedes sprint 222 (D-A3): it now grants Restore across two groups plus the pipeline's top end; 600,000 undersold that badly. |

## Day hire (`economy.toolHire`, replaces `machineShopAssist`, sprints 224/226)

Fee rule: `fee = tier2Price / amortisationDays`, `amortisationDays: 40` (the old
`probeAmortisationOps` constant, same value, same probe). Forty hires buy the kit.

| Group | Old fee | New fee | Felt behaviour |
|---|---|---|---|
| engine | 15,000 | 15,000 | Unchanged: an engine-out day is a real spend. |
| drivetrain | 18,000 | 13,750 | Follows the cheaper line down. |
| suspension | 5,000 | 7,500 | Follows the line up; still an easy yes for a paying job. |
| wheels | 3,000 | 6,250 | The ram earns its fee on one straightened rim. |
| body | 6,500 | 10,000 | Follows the line; a hire day covering MIG work on a customer car still quotes profitably (fee folds into the quote basis, sprint 227). |
| interior | 7,000 | 7,000 | Unchanged. |

- `maxHiredLinesPerDay: 1` (new, spec 3.3): a hire day is a planned day around one bench,
  not a shopping spree.

## Energy (sprint 224 adds, 226/227 consume)

| Lever | Value | Felt behaviour |
|---|---|---|
| `energyPerStepPoints` | 4 (new; replaces the 4/3/2 per-tier table per D-A4) | A two-step Service is most of one labour slot (8 of 10 points); a Rebuild with removal and refit around it is a solid morning. One lever to tune, not three. |
| `slogMultiplier` | 3 (rename of `machinelessLaborMultiplier`, value unchanged) | Slogging a step triples it: possible, visibly painful, never the plan. |
| `energyByClass.buried` | 6 (unchanged, new additional use) | An in-situ Service on a buried part costs the same awkwardness surcharge installing one does: working over the wing is real. |
| `actionPoints.removePart` | 2 (unchanged) | Removal effort unchanged; slog multiplies it when the rig is missing. |
| `actionPoints.benchFitMember` | 2 (was 0) | Fitting a tyre is finally work: two points on the machine, six by hand with levers (slog x3). At 0 the gate was decorative. |

## The two-post lift (`economy.lift`, new, sprints 224/226/228)

| Lever | Value | Felt behaviour |
|---|---|---|
| `hireFeeYen` | 5,000 | A lift day is cheap enough to book for any under-car job worth doing. |
| `purchasePriceYen` | 400,000 | An early-mid garage fixture: the first "the garage is becoming real" equipment buy after a tool line. |
| `minReputationTier` | `local` | Arrives with the first tool-line rung of standing. |
| `underCarStepDiscountPoints` | 1 | Every under-car step and remove/refit action is one point lighter (floor 1): owning the lift is felt daily, never decisive on any single job. |

## Job model (`economy.repairJobs`, new, structural, sprint 224)

`{ "service": { "target": "worn", "toolTier": 1 }, "rebuild": { "target": "fine",
"toolTier": 2 }, "restore": { "target": "mint", "toolTier": 3 } }` - the spec's table
verbatim. Mint work moves behind shop ownership (today tier 2 reaches mint); the felt
behaviour is the spec's core intent: a mint part is the mark of a garage with a room for
it, and mint stays reachable for anyone by buying a mint part (probes re-assert this,
sprint 227).

## Unchanged and deliberately not moved

- `restoration.repairStepFraction` 0.1; parts bills keep today's maths exactly.
- `energy.basePoolPoints` 80, `pointsPerLabour` 10.
- `serviceJobs.marginMin/Max` 1.18/1.35, `laborRateYen` 3,600, `calloutFeeYen` 1,750
  (quote BASIS changes in sprint 227 by folding hire fees in; the margins do not move).
- `dyno` block untouched.
- `machining` block untouched (shop gating already matches the new tier meaning).
- Body pipeline consumables and stage points untouched.
