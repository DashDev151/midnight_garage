# Sprint 227: every consumer re-based on the job model

**Status:** Planned
**Arc:** `repair-refactor-arc.md` sprint 4 of 9. Depends on 225 and 226.
**Scope:** sim only. Service-job generation and quoting, diagnosis fix costs, valuation
(decision D-A1), the shared fix-cost atom, probes, bot helpers, goldens. After this sprint
every ECONOMIC reader prices repair through the job model; only the player-facing old
repair path (store actions + CarDetailScreen) still runs on the band pipeline, and it dies
in 231.

## Reuse analysis (directive 16)

New mechanisms: one shared atom, `partFixCostYen` (below), which is the consolidation the
`TODO.md` "four independent implementations of repair-or-replace cost" entry has been
waiting for; nothing else new. Existing mechanisms reused: every walker keeps its own loop
and its own labour convention (bands.ts adds none, serviceJobs.ts adds install labour,
plays.ts adds remove plus install - deliberate per that TODO entry); `costToBandYen`
remains the parts-price atom inside the shared function; margins, callout fee, offer
pacing, template weights, reputation tiers, symptom machinery all untouched.

## Locked model

### The shared atom (in `packages/sim/src/repairJobs.ts`)

```ts
export function partFixCostYen(entry, part, targetBand, context):
  { jobKind: RepairJobKind | 'replace'; partsYen: number; hireFeeYen: number }
```

- Non-repairable or scrap below target -> `'replace'`: `partsYen` = stock replacement
  price (exactly today's `costToBandYen` replace branch), `hireFeeYen` 0.
- Else `jobKind` = the smallest job whose `repairJobs[kind].target` reaches `targetBand`
  (worn -> service, fine -> rebuild, mint -> restore); `partsYen` = `costToBandYen` for
  the band distance; `hireFeeYen` = `toolHire.feeYenByGroup[group]` ONCE iff the job's
  recipe contains any tier-2-tool step (resolved via `toolTierOnBench`), else 0. Restore
  jobs always return `hireFeeYen` 0 (no hire route; the shop is assumed - D-A1).
- The function never reads the player's tools. It is the fixed-assumption price of a fix
  (D-A1: "the market prices a fix at what it costs a garage that hires whatever it
  doesn't own").

Consumers to switch (the TODO entry's four sites, plus valuation):
`bands.ts` (`carCostToBandYen`, `groupCostToMintYen`), `plays.ts:161/170/175`,
`balanceProbes.ts:431/487`, `serviceJobs.ts:270`, and `marketValue.ts:236-238`. Each
keeps its own labour accounting; only the per-part decision and price go through the atom.
Add the guard rule that TODO entry asks for: a new test
`packages/sim/tests/partFixCost.test.ts` asserting all five sites price a constructed
part identically for parts+hire (labour excluded), so they can never silently diverge
again.

### Valuation (D-A1)

- `marketValue.ts`'s ceiling read (`repairCeilingForLevel(1)`) is replaced by
  `economy.repairJobs.rebuild.target` (`fine`). The valuation walk's target BAND does not
  move (tier-1 ceiling was already `fine`); what changes is the cost of the walk: each
  part's outstanding work is priced by `partFixCostYen`, so hire fees enter where tier-2
  kit is needed. Labour pricing inside the walk keeps its current shape and rates, with
  labour POINTS now derived from the job model: steps x `energyPerStepPoints`, plus the
  walker's own removal/refit convention, never slog-multiplied (the reference garage
  hires, it does not slog).
- `energyToClimb`'s tier parameter is replaced at these call sites by the job-model step
  count; the function itself is deleted in 231.

### Service-job offer gating

Replaces `taskToolDeficit` / `isTemplateOfferable`'s "one tier away" rule:

- A `slotCondition` task with `minBand` `worn` or `fine`, or any `minGrade` (buy-new
  route): ALWAYS tool-offerable.
- A task whose `minBand` is `mint`: offerable only if the covering shop for the part's
  group is owned (spec 5: never offer a Restore commission to a player without the shop).
- `resolveSymptom` tasks: unchanged (their gating lives on diagnostic tests).
- Signature (`requiresOperationId`) gating: unchanged.
- `resolveAcceptServiceJob` re-checks the same rule (defence-in-depth stays).
- The per-task `minToolTier` field RETIRES: remove it from
  `ServiceJobSlotTaskSchema` (serviceJob.ts), from every template in
  `serviceJobTemplates.json`, and from every reader. Tool need is derivable from the
  band, so authored duplication would only ever drift.

### Service-job quoting

`serviceJobCostBreakdown` re-based; margins and callout fee untouched:

- Repairable slot, no `minGrade`, installed part not scrap: price via `partFixCostYen`
  for the task's `minBand` (parts + hire fee folded in - spec 5's "no quoted job is a
  loss"), plus labour yen = (job step points at x1 + the existing teardown/refit chain's
  action points at x1) converted exactly as today (points -> slots -> `laborRateYen`).
  The x1 is deliberate: the quote assumes the hire route (fee already folded); a player
  who slogs pays energy, not yen, and a player who owns keeps the fee as margin.
- Buy-new route (grade requirement, scrap, non-repairable): unchanged except the labour
  chain's multiplier handling follows sprint 226's accessRoute (x1 with the fee folded
  when the removal rig would be needed: fold `toolHire.feeYenByGroup[group]` once).
- `deriveSymptomJobPayoutYen` / `candidateFixCostYen` (diagnosis.ts): a symptom's fix is
  priced as the REBUILD of the cause part (resolution requires `fine`+): parts + hire fee
  via `partFixCostYen(entry, part, 'fine', ...)` + labour as above. The verdict copy's
  "about ¥X and N labour" figures follow automatically.

### Probes and tests (every touched file listed; adjudicate per directive 17 in the doc's Exit)

- `serviceJobPayout.test.ts`: re-derive `playerMinCostYen` honestly on the new model (the
  cheapest CASH route: parts + hire fee only where a welded step forces hire; slog costs
  energy, not yen). Keep `REQUIRED_COVERAGE = 1.15`. If any template x model x band cell
  goes below coverage: STOP and report the cell and the numbers - margins are levers and
  are not moved in this sprint.
- `storyMissionProbes.test.ts`: (a) mint-band satisfiability probe re-worded and
  re-derived: "restore needs the shop; mint stays reachable at any tier by buying and
  fitting a mint part"; (b) `make-it-pull` budget probe re-based: the two buried
  camsTiming operations cost one engine-line hire day (both fit in one day's hire), so
  assert `probeCostYen + toolHire.feeYenByGroup.engine <= budgetCapYen`; (c) the
  "repair-gated slots charge at tier 1" probe retires with the per-op fees (delete, with
  a comment pointing at accessRoute.test.ts as its successor).
- `energyCalibration.test.ts`: rewrite against `energyPerStepPoints` (pin the value 4,
  re-derive the day-1 and late-game throughput statements from the job model).
- `restorationPacing.test.ts`: re-derive day counts from step counts.
- `valueModelProbes.test.ts` / `flipEconomyProbes.test.ts`: switch their restoration-cost
  helpers to `partFixCostYen` + step energy; re-derive expected figures; any economic
  GATE that flips red is a STOP-and-report, never a retune.
- `serviceJobs.test.ts`: offerability cases rewritten to the new rule (worn/fine always;
  mint needs shop; acceptance re-check).
- `bots/bandHelpers.ts` and `bots/serviceJobHelpers.ts`: mechanical re-base (compile
  against the new atoms; bots remain directive-21-dead and get no new intelligence).
- Golden masters: offer payouts and valuation walks move, so both suites re-pin with a
  trace comment naming the two causes (hire-fee-in-quote, hire-fee-in-valuation). The
  careerReplay `cashAtMost` checkpoint must be re-derived from the run, not loosened.

## Tasks

1. `partFixCostYen` + the five consumer switches + `partFixCost.test.ts` (the agreement
   guard).
2. Valuation re-base (marketValue.ts).
3. Offer gating + `minToolTier` retirement (schema, data, readers).
4. Quoting re-base + symptom fix costs.
5. The probe/test list above, file by file.
6. Golden re-pins with trace comments.
7. `pnpm typecheck` (schema field retired: carve-out applies).

## Checks

`partFixCost.test.ts`, `serviceJobs.test.ts`, `serviceJobPayout.test.ts`,
`storyMissionProbes.test.ts` individually while iterating; one `pnpm test --project sim`
sweep at the end; `pnpm typecheck`.

## Exit

(Fill on completion. The Exit MUST state, per directive 17, case (a) or (b) for every
rewritten assertion, and quote the re-derived coverage numbers for the payout invariant.)
