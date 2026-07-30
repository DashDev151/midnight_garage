# Sprint 143: make the ground safe before building on it

**Status: READY TO IMPLEMENT. First of the sale value arc (143 to 155).**

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

- [ ] The balance-probe module is renamed and nothing named `coherence` refers to it.
- [ ] Channel dispatch is flag-driven, proved by a test that adds a fictional channel and draws
      a working offer from it without touching `selling.ts`.
- [ ] `priceSensitivity` is gone from schema, data and tests.
- [ ] `StatWeightsSchema` has no defaults, and a completeness test covers all 29 entries.
- [ ] `.strict()` on `BuyerSchema`, `SellingChannelSchema`, and the `valuation` and `reputation`
      economy blocks.
- [ ] The retired-identifier ledger exists, is seeded with five entries, and
      `engineCharacter.test.ts`'s one-off is folded in and deleted.
- [ ] The duplicate-formula ban exists and passes.
- [ ] `pnpm typecheck` passes, output shown.
- [ ] Content and game projects pass, output shown.

## Exit

_To be completed at the end of the sprint._
