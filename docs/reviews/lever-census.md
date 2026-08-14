# The lever census

Sprint 199, Workstream F steps 1 and 2 of the economy overhaul brief. Read-only: no lever
moved, nothing deleted. This is the one-page summary a person reads; the full row-by-row
table is tool output, regenerated on demand rather than committed (see "The tool" below).

## Headline counts

1,112 leaves scanned (1,061 in `economy.json`, 51 in `partPricing.json`; the brief's
1,053/51 headline differs slightly from the flattened total here because this count walks
array elements as individual leaves, e.g. each step of a five-band curve, rather than
counting the array once - a flattening-convention difference, not a missing or extra field).

| Tier | Leaves | What it means |
|---|---:|---|
| **Dead** | 1 | Zero production evidence anywhere in `packages/sim`, `packages/game`, `packages/content`. |
| **Shadow price** | 0 | None currently in `economy.json`. `fearPremium` was the one known case and it was already killed in Sprint 98; confirmed below. |
| **Physics/calibration** | 191 | Load-bearing but governed separately, via the locked car-performance calibration arc, not a traditional design knob. |
| **Content (authored catalogue)** | 328 | Real money or real curves, but a price list or step table, not an independently sign-off-able knob (a machining operation's own cost, a part's own reference price, a curve's own points). |
| **Texture** | 371 | Consumed, real, but fails the wiggle test leaf-by-leaf: generation flavour, pacing cosmetics, one point of a multi-point weight table. |
| **Anchor (surviving)** | ~221 leaves, ~130 named lever clusters | Passes the wiggle test individually and names a real player decision. |

The brief's acceptance test asks for the anchor count **after maintainer review** to land in
the dozens. This census's first pass lands at roughly 130 clusters (a cluster being one named
field, e.g. `staff.wageBaseYen` or `bands.bandFactors`, even where it holds several leaves).
That is an 88% cut from 1,112 raw leaves, but it is not yet dozens: getting there needs the
maintainer's own texture/behaviour calls on the borderline items flagged below, which this
census intentionally leaves as a proposal rather than pre-deciding.

## The tool

`tools/lever-census/traceLevers.cjs` (with `tools/lever-census/runAccuracyChecks.cjs`
alongside it). Committed under `tools/` rather than `packages/content/tools` because it reads
across `packages/sim`, `packages/game` and `packages/content` source trees, not just content.

Run with `node tools/lever-census/traceLevers.cjs` (writes
`tools/lever-census/output/leverTrace.json`, gitignored, regenerable, not committed) and
`node tools/lever-census/runAccuracyChecks.cjs` (the accuracy gate, exits non-zero on
failure).

**Method.** Uses TypeScript's own compiler API (already a repo dependency), parsed
syntactically per file, no type checker or cross-file call graph. Per file it tracks which
local identifiers alias the economy config or the part-pricing sheet, by name convention
(`economy`, `ECONOMY`) and by following real assignment and destructuring
(`const { tasteSpread } = economy.valuation`, `const eco = context.economy`), then records
every property-access chain rooted at one of those aliases. A chain broken by a
non-literal index (`sheet.baseCostYen[basisId]`) is recorded as a dynamic hit on the base
path. A chain that ends mid-object (handed to a function, spread, stringified) is recorded as
a named-ancestor use of that object, not proof every leaf beneath it is individually read.

The one deliberate design correction worth recording: the bare config root
(`economy`/`partPricing` passed whole to some function, unresolved further) is **not**
treated as evidence for any specific leaf. It is threaded through nearly every module in this
codebase (`context.economy`), so it would otherwise "prove" every leaf, including a fabricated
one, is consumed - the tool's own accuracy check catches exactly this. Root passthrough is
folded into group-level liveness instead: a leaf with no evidence of its own, in a group where
a sibling leaf IS confirmed live, reports `UNKNOWN`, not `DEAD_CANDIDATE`. A leaf whose entire
top-level group has zero confirmed-live evidence anywhere is the strongest static signal this
tool can produce, and that signal fired exactly once (`AUCTION_WHOLESALE_FRACTION`, below).

**Confidence limits, stated rather than hidden:** alias tracking is per file, not per lexical
scope (two same-named locals in different functions of one file share an alias entry - this
can only make a genuinely dead leaf look consumed, never the reverse); and multi-hop
indirection through a non-`economy`-named parameter in an unrelated file is invisible to a
call-graph-free walk (this is why `CONSUMED_VIA_GROUP`, not per-leaf `CONSUMED`, is the
majority tier: most of the codebase passes a whole config object to a helper, which reads
specific fields inside its own body).

**Accuracy gate (12 checks, all pass):**
- 8 leaves already known by direct code reading (`calendar.daysPerWeek` -> `calendar.ts`,
  `machineShopAssist.feeYenByGroup.engine` -> `jobs.ts`, `staff.maxStaff` -> `staff.ts`,
  `STARTING_CASH_YEN` -> `newGame.ts`, and four more) resolve to the right consumer file.
- `fearPremium`: confirmed zero references anywhere in the scanned corpus (see below).
- A fabricated leaf (`economy.__doesNotExist__.neverReal`) classifies as `DEAD_CANDIDATE`,
  proving the "nothing found" path actually fires rather than being unreachable.
- A leaf in an otherwise-live group (`machineShopAssist.probeAmortisationOps`) classifies as
  `UNKNOWN`, not `DEAD_CANDIDATE`, proving the group-liveness rescue works.
- No `CONSUMED`/`CONSUMED_VIA_GROUP`/`DYNAMIC` leaf lists an implausible number of consumer
  files (a regression guard for the type-node bug the first draft actually hit: an
  `economy: EconomyConfig` field on an interface was briefly read as a value-level use,
  making every leaf list every file that so much as typed the config; fixed by skipping
  `ts.isTypeNode` and interface/type-alias bodies entirely).

## The `fearPremium` case

`economy.diagnosis.fearPremium` was removed from the schema and the JSON in Sprint 98
(`sheetGuideValueYen` already carries the fear via cause-weighted odds). It survives only in
`tools/balance` (Python, condemned by directive 21, a different language and outside the scan
universe): a docstring in `data.py`, an f-string in `report.py`, and one manifest subscript
in `report.py` (`symptom_coherence_manifest["fearPremium"]`) that would throw on contact with
a freshly generated manifest, because no current export emits that key. Zero references in
`packages/sim`, `packages/game` or `packages/content`, confirmed by the accuracy gate.

## The kill list

**Dead: `economy.AUCTION_WHOLESALE_FRACTION`** (1 leaf). Zero production references. Its only
reference anywhere is `packages/sim/tests/bidding.test.ts`, which passes it as a literal
argument to `privateValuationYen` for a probe of that function's own bell-curve behaviour, not
because production code reads the field. `privateValuationYen`'s own doc comment names its one
real caller: `bots/buyoutHelpers.ts`'s `walkAwayTargetYen`, which every bot strategy
(`balancedPlayer.ts`, `cautiousRestorer.ts`, `competentPolicy.ts`, `flipper.ts`, `handyman.ts`,
`investor.ts`, `randomStrategy.ts`) calls with its own local strategy constant
(`FAIR_BID_MULTIPLIER`, `BID_FRACTION_OF_BOOK`, `BID_MULTIPLIER`), never with
`economy.AUCTION_WHOLESALE_FRACTION`. `bidding.ts` states outright that "the live auction room
is a player-only interaction" and bots "buy at the flat instant-buyout premium instead" - so
even the bot path this field was presumably meant to price is dead for a different reason
(bot-career simulation itself is directive-21-suspended). Proposed: delete the field and its
schema entry once approved; the approval gate's hash re-pins in the same change.

**Shadow price: none found.** `fearPremium` was the one known case and it is already gone.

## Question C: do the sensible-restore / no-free-lunch probes charge machine hire?

**No.** The probes referenced in the sprint doc (`sensible-restore probe`, `no-free-lunch
probe`) actually live in `packages/sim/tests/valueModelProbes.test.ts` (not
`packages/sim/src/balanceProbes.ts`, which holds a different, related set of roster/donor/hire
probes; `valueModelProbes.test.ts` imports `computeRosterBalanceProbe` from it but the two
named probes are defined inline in the test file itself).

- The sensible-restore probe (`valueModelProbes.test.ts:657-718`) computes its repair cost as
  `repairCostYen = carCostToBandYen(worst.car, model, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID,
  ECONOMY, targetBand)` (line 691).
- `carCostToBandYen` (`packages/sim/src/bands.ts:256-280`) sums `partCostToBandYen` per part,
  which calls `costToBandYen` (`bands.ts:93-109`, a pure parts-price/repair-step-fraction
  formula) or a body-pipeline bill for zone-derived parts. Neither reads
  `economy.machineShopAssist.feeYenByGroup` or anything else machine-hire-related. Confirmed
  by grep: `valueModelProbes.test.ts` contains zero references to `hireMachineLine`,
  `machineLaborMultiplier`, `machineAssistFeeYen`, `signatureOpFeeYen`, `feeYenByGroup` or
  `machineShopAssist` in any form.
- The no-free-lunch probe (`valueModelProbes.test.ts:720-741`) does no repair at all - it
  checks that buying at full guide value with zero work done nets no expected profit via the
  walk-in sale channel - so machine hire is not even applicable to what it measures.
- Machine hire is a genuinely separate mechanic: `resolveHireMachineLine`
  (`packages/sim/src/jobs.ts:646-660`) charges `economy.machineShopAssist.feeYenByGroup[group]`
  once per group per day as a running cost "posted to the day report exactly as rent is,
  never to a car's ledger" (the function's own doc comment), invoked only through the
  job-booking flow, never through `carCostToBandYen`/`planGroupRepair`.

**What follows.** The probes certify the margin available to a player who never pays to hire a
machine line, working every gated operation at the tier-1 `machinelessLaborMultiplier` rate
instead (slower, not blocked - "the machine gate is a RATE, never a wall", per `jobs.ts`'s own
doc comment on `machineLaborMultiplier`). That is a real, always-available path, so the
guarantee they enforce is not vacuous. But a player who DOES pay to hire (to work at full
rate) spends real cash the probes never subtract, so the certified margin overstates what that
player nets. The sprint doc notes the blast radius shrank in Sprint 202 (hire is no longer
mandatory for any operation), which limits the exposure to "the always-available slow path is
correctly measured; the always-pay fast path is not measured at all" rather than "the
guaranteed path is measured incorrectly." Whether that gap is worth a probe update is a
question for the maintainer, not a fix folded into this read-only sprint.

## Notes for maintainer review (not part of the kill list; flagged, not actioned)

- `economy.supportReadout.shortfallCopy`/`framingByBand` (7 leaves) are UI copy strings living
  inside `economy.json`, not numeric economy content. Not dead (both are read, in
  `gameStore.ts`), just arguably filed in the wrong document.
- `economy.machineShopAssist.probeAmortisationOps` classifies `UNKNOWN`: it is not
  individually traceable to a consumer, only rescued from `DEAD_CANDIDATE` by its group's
  other confirmed-live fields. Worth a direct look outside this census.
- The `machining.operations` catalogue (175 leaves), `partPricing.baseCostYen` (30, one per
  `CarPartId`), and `auctionGrading.overallRatioSteps` (16) are classed as content rather than
  anchor on the same logic directive 24 already applies to the car roster: a number about one
  entry is authored content, a rule about the whole table is the lever. Their governing
  multipliers (`machining.gradeMultiplier`, `partPricing.classFactors`/`gradeFactors`/
  `globalFactor`) are counted as the actual anchors.
