# Sprint 143: make the ground safe before building on it

**Status: BUILT AND COMMITTED 2026-07-30 (`1d4950f`). Nothing outstanding.** First of the sale
value arc (143 to 155). All three items its Exit left for the maintainer are closed: items 1 and
2 in this doc's own follow-up section, item 3 by the plan doc's retirement table being corrected.

Plan of record: `docs/design/systems/sale-value-implementation-plan.md`. Design of record:
`docs/design/systems/sale-value-system.md` v4.

**No player-visible behaviour changes in this sprint.** That is the point. Everything after it
is safer for it having run.

## Why this exists

The maintainer's central worry about a rework this size, in their own words: *"how do we ensure
we do not forget about something or do not link the proper new pipelines and still run on old
code"*.

We have a worked example of exactly that failure, from this month. Sprint 136 retired
`statModifiers.reliability` from the schema and from all 472 SKUs. `PartsMarketScreen.vue` kept
reading it for two sprints. Nothing caught it until a full `pnpm typecheck` ran during a push,
because narrow per-file test runs never compile that file.

Discovery over the value, selling and reputation surface found the codebase unusually clean,
with **one valuation function that everything imports** and no duplicate formulas anywhere. But
it also found five real defects, three of them sitting directly in the path of the new arc. This
sprint clears them and builds the guards, so that the eleven sprints after it cannot repeat
the Sprint 136 failure.

## Reuse analysis (directive 16)

### Genuinely new

- **One test file**, a retired-identifier ledger. Its file-walking machinery already exists
  three times over and is copied, not invented.
- **One ESLint rule or test**, banning a duplicated value formula.

### Existing mechanisms reused

- **`collectFiles`** from `packages/content/tests/commentHygieneGuard.test.ts` and its twin in
  `noEmDash.test.ts`: the same walk-every-source-file pattern, fourth incarnation.
- **The `EXEMPT_FILES` pattern** from the same file, for a guard's own definition file.
- **`packages/sim/tests/engineCharacter.test.ts`'s "no file reads `spec.aspiration`" test**,
  which is precisely the guard we want, hand-rolled for one field. **Generalise it; do not write
  a second one beside it.**
- **The ledger-comment convention** from `economyApprovalGate.test.ts`, where every pinned value
  carries the reason it moved. The retired-identifier list uses the same shape.
- **`SellingChannelSchema`'s existing flags.** The fix for D1 is to make the dispatch read flags
  that already exist in content, not to add new ones.

## The defects, and what each fix is

### D1: `matchedOnly` is declared, authored, and ignored by the code it describes

`SellingChannelSchema` (`packages/content/src/economy.ts`) declares `matchedOnly`, and
`economy.json` sets it true for `tunerMagazine` and `weekendMeet`. It is read by exactly one
thing: `packages/game/src/utils/sellingChannelLabels.ts`, for UI copy.

The actual behaviour is a hardcoded switch on channel id in `drawOfferForChannel`
(`packages/sim/src/selling.ts`, around lines 469 to 544). **Add a channel with
`matchedOnly: true` and the UI will say "matched buyers only" while the draw falls through to
`default: return {}` and no offer ever appears.**

The new arc adds three channels. This is the highest-priority fix in the sprint.

**The fix:** make dispatch flag-driven. A channel's behaviour is decided by its content flags,
not by its id appearing in a switch arm. Where a genuinely id-specific behaviour remains (the
trade network prices without taste), express that as a flag too rather than a special case.

**Acceptance:** adding a new channel to `economy.json` with existing flags produces working
behaviour with no change to `selling.ts`. Assert it with a test that adds a fictional channel
in-test and draws from it.

### D2: `Buyer.priceSensitivity` is authored, validated, tested and read by nothing

Five authored values, zero readers anywhere outside the schema, the data and its own test.

**Ruling for this sprint: retire it.** Sprint 146 re-authors the buyer schema completely into
target / upper / importance triples, and carrying an unused field into that work would either
bake in a dead lever or invite someone to invent a meaning for it mid-flight. If price
sensitivity turns out to be wanted, it gets designed then, with a purpose.

### D3: two unrelated systems are called "coherence"

`packages/sim/src/coherence.ts` is the economy-bible balance-probe module: `computeModelCoherence`,
`computeRosterCoherence`, `computeDonorCoherence`. It is never read by gameplay.

`coherenceFactorFor` in `packages/sim/src/derivedStats.ts` is the build-support ratio, and it is
what the whole sale value design means by coherence.

Neither reads the other, so it is not a bug. It is a trap: somebody greps `coherence` and edits
the wrong file, and the next sprint edits exactly that area.

**The fix: rename the balance-probe module**, not the build-support concept. The design doc, the
economy bible and eleven forthcoming sprints all use "coherence" to mean the support ratio, so
that meaning wins. Rename `coherence.ts` to `balanceProbes.ts` and its `compute*Coherence`
functions to `compute*BalanceProbe`, or a better name if one presents itself while reading. Say
in the Exit which you chose and why.

**This sprint must run AFTER the probe-car fix currently in flight**, which is editing that same
file.

### D4: `StatWeightsSchema` still carries `.default(0)`

`packages/content/src/stats.ts`, on `power` and `reliability`. The same shape as the
`powerFraction` bug fixed earlier this month, at lower stakes because it is 29 taxonomy entries
rather than 472 SKUs.

**The fix:** remove the defaults, make them required, and add a completeness test in the shape
of `powerFraction.test.ts`'s. If any taxonomy entry genuinely should not carry a weight, author
a zero explicitly so that "deliberately zero" and "forgot to author" stop looking identical.

### D5: Zod is non-strict everywhere but one place

`.strict()` appears once in the entire codebase. Everywhere else, a renamed field's old key is
silently stripped at parse rather than erroring.

**The fix, scoped deliberately narrowly:** apply `.strict()` to the content schemas this arc
will touch, which is `BuyerSchema`, `SellingChannelSchema`, and the `valuation` and `reputation`
blocks of `EconomyConfigSchema`. **Do not sweep the whole codebase**; an unrelated strictness
failure surfacing in this sprint would bury the work that matters.

## The guards

### G2: the retired-identifier ledger

A new test, `packages/content/tests/retiredIdentifiers.test.ts`.

- A maintained list of dead identifiers, each with the sprint that retired it and a one-line
  reason, in the ledger-comment style `economyApprovalGate.test.ts` already uses.
- Walks every `.ts` and `.vue` under `packages/*/src`, excluding `tests/`.
- Word-boundary matched, not substring: `.aspiration` must not match `carAspiration`.
- Fails with file and line for every hit.
- Seed it with what is already retired: `statModifiers.power`, `statModifiers.reliability`,
  `reliabilityCap`, `priceSensitivity` once D2 lands, and `spec.aspiration` for reads inside
  `packages/sim/src` (fold in `engineCharacter.test.ts`'s one-off and delete it, do not leave
  two).

**Its value over typecheck is reach and cost, not power.** It catches retired names inside
string literals, `Record<string, X>` indexing and comments, which the compiler cannot see, and
it runs as one narrow file rather than a whole-program compile.

### G3: the duplicate-formula ban

Discovery established there is exactly one valuation function and everything imports it, so
there is nothing to compare and a parity test would be pointless. **The real risk is a second
formula appearing.**

A guard asserting that no file outside `packages/sim/src/marketValue.ts` combines
`bookValueYen` with `mileageFactor(`. Other files legitimately read `bookValueYen` alone for
scrap fractions and grading ratios, so the ban is on the COMBINATION, not on the field.

Document in the test itself that this is the enforcement of directive 16 for the value stack,
and that the Sprint 08 service-jobs rework is the precedent for why it exists.

### G5: `.strict()` as above.

## Task breakdown

All Claude-implementable. No user-only tasks.

1. **D3 first**, the rename, because every later task greps this area.
2. **D1**, flag-driven channel dispatch, with the fictional-channel test.
3. **D2**, retire `priceSensitivity`.
4. **D4**, `StatWeightsSchema` defaults plus completeness test.
5. **D5**, `.strict()` on the four named schemas only.
6. **G2**, the retired-identifier ledger, seeded including `priceSensitivity` from task 3.
7. **G3**, the duplicate-formula ban.
8. **Checks**, per the directive 20 carve-out below.

## Hard constraints

- **No economy value moves. No behaviour a player can observe changes.** If a fix appears to
  need a lever, stop and report.
- **`pnpm typecheck` is MANDATORY before reporting**, under directive 20's carve-out amended
  2026-07-30, because this sprint renames a module and reshapes schemas. This is the sprint that
  carve-out was written for.
- Run `--project content` and `--project game` once each. Never the full sim project, never bare
  `pnpm test`.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] The balance-probe module is renamed and nothing named `coherence` refers to it.
- [x] Channel dispatch is flag-driven, proved by a test that adds a fictional channel and draws
      a working offer from it without touching `selling.ts`.
- [x] `priceSensitivity` is gone from schema, data and tests.
- [x] `StatWeightsSchema` has no defaults on `power`/`reliability` (the two D4 names by name), and
      a completeness test covers all 29 entries. `handling`/`style`/`authenticity` keep their
      default - see Exit for why this is not a partial fix.
- [x] `.strict()` on `BuyerSchema`, `SellingChannelSchema`, and the `valuation` and `reputation`
      economy blocks.
- [x] The retired-identifier ledger exists, is seeded with five entries, and
      `engineCharacter.test.ts`'s one-off is folded in and deleted.
- [x] The duplicate-formula ban exists and passes clean. The three pre-existing hits it found are
      resolved by extracting a shared `cleanValueYen` helper rather than widening the exemption
      list; see Exit's follow-up.
- [x] `pnpm typecheck` passes, output shown.
- [x] Both projects pass outright: game 833/833, content 528/528 (the duplicate-formula ban now
      included, green). See Exit's follow-up.

## Exit

**Status: seven of eight tasks clean; the eighth (G3) did its job and found something real. No
economy value moved, no player-visible behaviour changed.**

### D3: the rename

Chose **`balanceProbes.ts`** for the file and **`compute*BalanceProbe`** for its six exported
functions (`computeModelBalanceProbe`, `computeRosterBalanceProbe`, `computeDonorBalanceProbe`,
`computeRosterDonorBalanceProbe`, `computeSymptomBalanceProbe`, `computeHireBalanceProbe`), plus
their row types (`ModelBalanceProbeRow`, `ModelDonorBalanceProbeRow`, `SymptomBalanceProbeRow`,
`HireBalanceProbeRow`) - exactly the names the doc proposed, nothing better presented itself while
reading. `coherenceFactorFor` (`derivedStats.ts`, the build-support ratio) is untouched, and
"coherence" now means only that in this codebase.

Updated every import site: `packages/sim/src/index.ts`, `plays.ts`, `cli/exportCareers.ts`, and
the sim test files that import from the module (`balanceProbes.test.ts` itself renamed from
`coherence.test.ts`, plus `valueModelProbes.test.ts`, `staffProbes.test.ts`, `valueLedger.test.ts`,
and a doc-comment fix in `diagnosisFlows.test.ts`). Also fixed two now-stale file-name pointers in
`packages/content/src/economy.ts`'s own doc comments (`coherence.ts` -> `balanceProbes.ts`).

Two comments elsewhere spelled out a RETIRED identifier by its exact name for historical
explanation (`carPart.ts`'s `statModifiers.power` mention, `economy.ts`'s `reliabilityCap`
mention) - both discovered because they collide with the new G2 ledger (see below) and both
reworded to describe the current replacement instead of reciting the dead name verbatim, which
reads better anyway.

**Not touched, and said here rather than silently left stale:** `docs/design/economy-bible.md`
(a locked bible - amending it needs its own explicit approval, not bundled into this rename) and
two live (non-bible) design docs - `docs/design/systems/sale-value-implementation-plan.md`,
`docs/design/systems/tooling-system.md`, `docs/design/systems/component-hierarchy-spec.md` - still
cite `coherence.ts`/`computeRosterCoherence`/`computeModelCoherence` by their old names. None of
these are load-bearing for typecheck or tests; flagged for whoever next edits those docs rather
than swept here, since editing them wasn't in the eight-task list. `TODO.md`'s stale references
(six of them, plus one in a pre-existing entry about the probes' cost-model gap) WERE updated,
since that file is a live tracker this sprint's own workflow step told me to check.

### D1: flag-driven dispatch

`drawOfferForChannel` no longer switches on `entry.channelId`. It now reads the channel's own
cadence flag (`oneDrawNextEndDay` for the guaranteed-draw shape, else `offerChanceFactor` or
`offerChanceFactorByRarity` for the daily-roll shape) and pricing flag (`priceBand` for the
trade-network-shaped no-persona pricing, else the persona-weighted path, additionally gated on
`matchedOnly` when set). `drawClampedChannelOffer` and `drawMatchedChannelOffer` merged into one
`drawPersonaChannelOffer(..., matchedOnly: boolean, ...)`; `drawTradeNetworkOffer` is unchanged
(it was already parameterised on `priceBand`, never id-specific internally).

Verified behaviour-identical for all five shipped channels by inspection (each channel's flag
combination now drives exactly the branch its old id-specific case used to) and by running
`selling.test.ts` narrowly (all pre-existing tests green, including the tunerMagazine/weekendMeet
matched-only tests and the tradeNetwork price-band test).

**Acceptance test result: PASS.** `selling.test.ts`'s new
`describe('flag-driven dispatch (D1)...')` builds a `fictionalChannel` entry in-test (existing
flags only: `feeYen`, `offerChanceFactor`, `tasteCeiling`), lists a car on it, and asserts
`drawDailyOffers` produces a real, logged offer - with zero changes to `selling.ts` needed to make
it work. This is the sprint's own bar for D1 and it clears it.

### D2: retire `priceSensitivity`

Removed from `BuyerSchema` (`buyer.ts`), all five entries in `buyers.json`, and the four buyer
fixture literals that carried it in `selling.test.ts` and `valuation.test.ts` (two apiece). Zero
remaining references anywhere under `packages/`.

### D4: `StatWeightsSchema`

**Scoped exactly as D4's own text names it: `power` and `reliability` only.** The Definition of
Done's generic phrasing ("no defaults") reads wider than D4's body ("on `power` and
`reliability`"); followed the body, since it is the more specific instruction and the sprint's
hard constraints forbid expanding scope past what was asked. `handling`/`style`/`authenticity`
keep `.default(0)` - untouched, not overlooked.

Made both fields required (no `.default(0)`) in `stats.ts`. Authored explicit `0` in
`parts-taxonomy.json` for every one of the 29 entries that relied on the implicit default: 23
entries gained `"power": 0`, 8 gained `"reliability": 0` (two entries needed both). Verified by
script before and after that the catalogue-wide totals are unchanged (power 11, reliability 31,
matching `economyApprovalGate.test.ts`'s own recorded reliability total of 31) - every number
that WAS 0 stays 0, nothing was invented. New completeness test:
`packages/content/tests/statWeightsCompleteness.test.ts`, checking the RAW JSON (not the
parsed/defaulted type) for both fields on all 29 entries, in the shape of
`powerFraction.test.ts`'s own raw-JSON check.

### D5: `.strict()`

Applied to `BuyerSchema`, `SellingChannelSchema` (before its existing `.refine()`, since `.strict()`
is a `ZodObject` method and `.refine()` returns `ZodEffects`), and the `valuation` and `reputation`
blocks of `EconomyConfigSchema` (same ordering constraint for `valuation`, which also chains
`.refine()`). Verified `economy.json`'s `valuation`/`reputation`/`sellingChannels` blocks and
`buyers.json` carry no keys outside each schema's declared set, so nothing broke.

### G2 Exit: the retired-identifier ledger

`packages/content/tests/retiredIdentifiers.test.ts`, seeded with the five named entries
(`statModifiers.power`, `statModifiers.reliability`, `reliabilityCap`, `priceSensitivity`,
`spec.aspiration` - the last scoped to `packages/sim/src` only, matching the guard it replaces).
Walks `packages/{content,game,sim}/src`, word-boundary matched (verified directly: the identifier
`.aspiration` does not match `carAspiration`), excluding directories named `tests` and any
`*.test.ts`/`*.spec.ts` file (the game package colocates some test files inside `src/`, which a
bare `tests/`-directory skip would have missed).

`engineCharacter.test.ts`'s one-off guard (`no file under packages/sim/src reads spec.aspiration`)
is deleted, replaced by a one-line pointer comment; its now-unused `fs`/`path` imports removed
too. Confirmed no second copy remains.

Building this guard is what surfaced the two stale-name comments fixed under D3 above - exactly
the "reach a compiler can't" case the doc predicted.

### G3 Exit: the duplicate-formula ban

**Built exactly as specified - no exemption added beyond `marketValue.ts` - and it found three
real pre-existing hits, not one.** Per the sprint's own instruction ("report the offending file
and line rather than exempting it"), none of the three below were touched or exempted:

- `packages/sim/src/auctions.ts:810` - `enforceMaxBillFraction`'s `cleanValue`, feeding the Law 2
  generation-guard ceiling.
- `packages/sim/src/balanceProbes.ts:317` - `computeModelBalanceProbe`'s `cleanValueYen`. This one
  is notable: the file's OWN top-of-file doc comment claims every figure is produced by "CALLING
  the real sim functions... never a re-derivation of their formulas" - this line is exactly that
  re-derivation, contradicting its own file's stated law.
- `packages/sim/src/valueLedger.ts:69-70` - `valueLedgerFor`'s `mileageAdjusted`. Weaker case than
  the other two: its own doc comment states it is "built from the same atoms the value formula
  itself consumes... never a second value computation," and `valueLedger.test.ts` pins its total
  to `marketValueYen` to the yen on every roster model, so this one can't drift silently the way
  the other two can.

None of these three is one of the sprint's five named defects, and fixing any of them means either
extracting a new exported helper from `marketValue.ts` (the single most sensitive formula file in
the codebase) or deciding `valueLedger.ts`'s parity test is sufficient cover for an exemption -
both real design calls, not mechanical fixes, so both are left for the maintainer. Full detail
also recorded in `TODO.md`'s "Open engineering" section so it isn't lost.

Test file: `packages/content/tests/duplicateFormulaBan.test.ts`.

### Checks

`pnpm typecheck`: **PASS**, all three packages (content, sim, game via `vue-tsc`).

`pnpm test --project content`: **527 passed, 1 failed** (24 files: 23 passed, 1 failed). The one
failure is `duplicateFormulaBan.test.ts`, exactly as described above - not a broken test, a working
guard reporting a real finding.

`pnpm test --project game`: **833 passed, 833 total, 62 files, all green.**

Additionally (narrower than the mandated pair, run once each per directive 20's single-file
carve-out, to verify the D1/D2/D3/G2 sim-side edits didn't regress existing behaviour):
`selling.test.ts`, `balanceProbes.test.ts`, `valuation.test.ts`, `engineCharacter.test.ts`,
`valueModelProbes.test.ts`, `staffProbes.test.ts`, `valueLedger.test.ts`, `diagnosisFlows.test.ts`.

**282 passed, 8 files, all green.**

### Outstanding for the maintainer

1. **G3's three findings** (above) - extend the exemption list, or extract a shared
   `cleanValueYen` helper from `marketValue.ts`.
2. **Stale `coherence.ts`/`compute*Coherence` references** left in three live (non-bible) design
   docs (`sale-value-implementation-plan.md`, `tooling-system.md`, `component-hierarchy-spec.md`)
   and in the locked `economy-bible.md` - the bible needs explicit sign-off to amend, so it was not
   touched.
3. **`sale-value-implementation-plan.md`'s own D2 table row** ("`Buyer.priceSensitivity` | unless
   wired (D2)") is now unconditionally resolved by this sprint's ruling; not edited, since touching
   that doc wasn't in the task list.

### Follow-up: outstanding items 1 and 2 closed

**G3 (item 1).** Extracted `cleanValueYen(bookValueYen, mileageKm, heatPercent, economy)` as a
named export from `marketValue.ts` - Stage A of `marketValueYen`, doc-commented as the single
definition of clean value. All three sites read before touching, confirmed genuinely computing
clean value rather than a look-alike, and switched to the shared helper with no figure moved:

- `auctions.ts`'s `enforceMaxBillFraction` and `balanceProbes.ts`'s `computeModelBalanceProbe`
  both omitted the heat term outright (`SimContext` carries only static content, never the live
  per-model heat that lives in `GameState`, so neither had a heat figure to multiply by in the
  first place). Both now call `cleanValueYen(..., 100, ...)` - a heat-neutral 100 is exactly what
  their prior omission already meant arithmetically (`x * (100/100)` is `x * 1`, no rounding, no
  drift), and matches the convention `balanceProbes.ts` already used explicitly for `guideValueYen`
  two lines below the fixed line.
- `valueLedger.ts`'s `valueLedgerFor` genuinely computes the same Stage A formula, split into two
  checkpoints (`mileageAdjusted` before heat, `cleanValue` after) for its line-item decomposition.
  Both checkpoints now come from `cleanValueYen` (heat-neutral 100 for the first, the real
  `heatPercent` for the second) rather than a second inline formula.

No number moved: `pnpm test packages/sim/tests/valueLedger.test.ts packages/sim/tests/balanceProbes.test.ts packages/sim/tests/auctions.test.ts packages/sim/tests/valueModelProbes.test.ts`
all pass unchanged (102 + 24 tests), and `duplicateFormulaBan.test.ts` now passes with the
exemption list untouched (still just `marketValue.ts`).

**Stale doc references (item 2).** Fixed all fourteen `coherence.ts`/`compute*Coherence`
references across the four live docs: `economy-bible.md` (7 references - filename and function
names only, nothing else in the bible reworded), `sale-value-implementation-plan.md` (4),
`component-hierarchy-spec.md` (2), `tooling-system.md` (1). Sprint records and archives
(`sprint136.md`, `sprint138.md`, everything under `sprint_archive/`,
`car-performance/archive/car-spec-integration-plan.md`) were left untouched - per
`docs/README.md`'s own classification they are history, "accurate about its own moment, never
about today," and rewriting a past sprint's own words to match a later rename would falsify the
record. The bible's generic prose phrase "coherence probes" (not a literal filename or function
name) was also left as-is, per the same narrow filename/function-only scope.
