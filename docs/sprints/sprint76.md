# Sprint 76 - Story missions I: the contract machine

**Source:** `docs/design/story-builds-spec.md` v2 + maintainer rulings 2026-07-15 (hand-authored
campaign for v1.0; procedural commissions deferred to endgame; Hall of Legends deferred behind
this). Depends on Sprints 70-75 (the Requirement module from 72; diagnosis makes acquisition a
gamble). Scope path: story builds ride under GDD §12.2 commissions as an extension; the
reference-lap board (Sprint 77) is recorded there as part of this arc, per the 2026-07-15
delegation. No GDD amendment.

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English in all player copy.

## Confirmed current state (code discovery, 2026-07-15)

- `requirements.ts` exists (Sprint 72) with `slotCondition` and `evaluateRequirement(spec, car,
  ledger, day, context)`.
- Stats: `computeDerivedStats(model, instance, partsById, partsTaxonomy, economy): StatBlock`
  (`derivedStats.ts:78`); `StatBlock = { power (PS-like), handling 0-100, style 0-20 cap,
  reliability 0-100, authenticity 0-100 }` (`content/src/stats.ts:4`; `statFormulas` caps:
  style 20, reliability 70 + part modifiers).
- Taste: `valuateCarForBuyer(buyer, model, instance, partsById, partsTaxonomy,
  partsTaxonomyById, heatPercent, economy)` (`valuation.ts:71`) = `marketValueYen x
  tasteMultiplier`; buyers: `collector, tuner, stancer, racer, first-timer` (`buyers.json`).
- Ledger: `carLedgerFor(state, carInstanceId): { purchaseYen: number | null, repairYen,
  partsYen }` (`carLedger.ts:15`).
- Reputation: points on `GameState.reputationPoints`, thresholds `unknown 0 / local 60 /
  known 200 / respected 500 / legend 1400`; `applyReputationDelta` (`calendar.ts:63`);
  specialty via `applySpecialtyDelta` (`serviceJobs.ts:920`), lanes = the 6 `ComponentId`s.
- Offers surface on `ServiceJobsScreen.vue`; offer caps (`offerCountCapByDay`) govern service
  jobs only. Modal convention: `SaleCompleteModal.vue`. Car removal on sale:
  `resolveSellViaWalkIn` (`selling.ts:327`) is the pattern for handing a car over.
- `advanceDay` (`advanceDay.ts:59`) is where day-boundary mission logic hooks.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- `requirements.ts`: missions ADD primitives to the shared module; grading is
  `evaluateRequirement` over a list, exactly like job tasks.
- `computeDerivedStats`, `valuateCarForBuyer`, `carLedgerFor`, `applyReputationDelta`,
  `applySpecialtyDelta`: every predicate and reward reads an existing system.
- The car-hand-over mechanics of the sale path (removal, ledger cleanup) for delivery.
- `ServiceJobsScreen` as the surface (a pinned card, not a new inbox).

**New mechanisms:**

1. Five new requirement primitives (below).
2. `storyMissions.json` content schema + `GameState.storyMissions` progress records.
3. The mission state machine (locked -> offered -> active -> delivered / lapsed -> re-offered)
   and its `advanceDay` hook.
4. Accept / deliver / lapse resolvers and their log kinds.

## Decisions

1. **New primitives in `requirements.ts`** (each pure, each with `label/actual/required`
   strings for the grading UI):
   - `statThreshold { stat: 'power'|'handling'|'style'|'reliability'|'authenticity', min }`
     and `statCeiling { stat, max }` over `computeDerivedStats`.
   - `budgetCap { maxTotalSpendYen }` over `carLedgerFor` (spend = `(purchaseYen ?? 0) +
     repairYen + partsYen`; a null purchase counts 0: only reachable via dev grants, accepted).
   - `deadline { dueOnDay }` over `state.day` (evaluated at delivery time).
   - `tasteMatch { buyerId, minMultiplier }`: pass when `valuateCarForBuyer / marketValueYen >=
     minMultiplier` (both at current heat; the ratio cancels heat).
   - `roadworthy {}`: every one of the 29 slots holds an installed part at band >= `worn`.
   (`lapTimeCeiling` arrives with the lap model in Sprint 77.)
2. **Content schema** `content/src/storyMission.ts` + `storyMissions.json` (authored in Sprint
   78; TWO placeholder missions ship this sprint to run the machine end to end and are
   replaced in 78). Fields: `id`, `personaId`, `title`, `requestCopy` (the customer's ask, 2-4
   sentences), `gateReputationPoints`, `requirements: RequirementSpec[]`, `budgetCapYen`
   (mirrored into a `budgetCap` requirement at load; single source), `deadlineDays` (from
   accept), `payoutYen`, `tipFraction: 0.10`, `tipTriggerFraction: 0.15`, `reputationReward`,
   `lapseReputationPenalty`, `reofferDays`, `specialtyGroups: ComponentId[]`,
   `deliveredCopy`, `overdeliveredCopy`, `lapsedCopy`. Personas: `content/src/persona.ts` +
   `personas.json`: `id`, `name`, `intro` (one line). All names fictional; the naming guard
   (`naming.test.ts`) is extended to scan mission + persona copy for real-brand leaks.
3. **State.** `GameState.storyMissions: { missionId, status: 'offered'|'active'|'delivered'|
   'lapsed', acceptedOnDay: number|null, dueOnDay: number|null, reofferOnDay: number|null }[]`
   (locked = absent). Strictly linear campaign: missions sort by `gateReputationPoints`; the
   next locked mission is OFFERED (record appended) by the `advanceDay` hook once
   `reputationPoints >= gate` AND every earlier mission is `delivered`. At most one `offered`
   or `active` mission exists at any time. Offers never expire (a campaign beat waits);
   `deadlineDays` starts at accept. Story missions do NOT count against
   `offerCountCapByDay`.
4. **Resolvers** in new `packages/sim/src/missions.ts`:
   - `resolveAcceptMission(state, missionId, context)`: offered -> active; stamps
     `acceptedOnDay`, `dueOnDay = day + deadlineDays`. Log kind `mission-accepted`.
   - `gradeMissionCar(state, missionId, carInstanceId, context)`: pure report
     `{ pass, lines: { label, actual, required, pass }[] }`: every requirement + the budget cap
     + the deadline. Free, repeatable, no state change (bind-at-delivery per the spec ruling).
   - `resolveDeliverMission(state, missionId, carInstanceId, context)`: requires pass; removes
     the car (sale-path mechanics), pays `payoutYen` (+ tip: if every `statThreshold` in the
     mission is exceeded by `>= tipTriggerFraction` of its `min`, add `round(payoutYen x
     tipFraction)`), applies `reputationReward` via `applyReputationDelta` and splits it across
     `specialtyGroups` via `applySpecialtyDelta`; status `delivered`. Log kind
     `mission-delivered`.
   - Lapse (in the `advanceDay` hook): active past `dueOnDay` -> `lapsed`, apply
     `-lapseReputationPenalty`, set `reofferOnDay = day + reofferDays`; on that day the SAME
     mission returns to `offered` (infinite retries; the campaign never dead-ends). The player
     keeps the car they built (the taste-mismatch open-market sale IS the consequence). Log
     kinds `mission-lapsed`, `mission-reoffered`.
5. **Payout sanity is a test, not a formula.** Every authored mission ships a SATISFIABILITY
   PROBE (pattern established here with the two placeholders, filled per mission in 78): a
   concrete build recipe (model id + parts + bands) constructed with test fixtures, asserted
   to pass `gradeMissionCar`, with probe cost `C` (purchase proxy = the probe car's
   `marketValueYen` at heat 100 + parts at catalog + repairs at atoms). Assert
   `payoutYen >= 1.15 x C` (the Law 4 spirit) and `budgetCapYen >= 1.05 x C`. A mission that
   cannot prove a route is unshippable by test.
6. **Minimal UI this sprint** (full flows in 77): the pinned mission card on
   `ServiceJobsScreen.vue` (persona name, title, request copy, payout, budget, deadline,
   "STORY" chip, Accept button, `data-test="mission-accept"`), and an active-mission summary
   row. Deliver/grade UI is Sprint 77; the sim resolvers are fully tested now.
7. `SAVE_VERSION` 34 -> 35, no migration. New day-log kinds added to the union + formatter.

## Tasks

**Claude:**

1. Primitives per decision 1 + unit tests per branch (including the tasteMatch heat-cancelling
   property and roadworthy's missing-slot fail).
2. Content schema + personas + TWO placeholder missions (ids `placeholder-a/b`, clearly titled
   as scaffolding) + naming-guard extension + content tests (ids unique, gates ascending,
   specialty groups valid, copy fields non-empty).
3. State + state machine + `advanceDay` hook per decisions 3-4; determinism test (same seed,
   same offer day); no interaction with `offerCountCapByDay` (test).
4. Resolvers + log kinds + formatters per decision 4; tip arithmetic tests both ways.
5. Satisfiability-probe infrastructure per decision 5, applied to both placeholders.
6. Pinned card UI per decision 6 with component tests (`ServiceJobsScreen.test.ts` patterns).
7. `SAVE_VERSION` 35; codec roundtrip; golden re-pins with comment; full gate; Exit.

**User-only (maintainer):**

- None this sprint (campaign copy approval comes with Sprint 78).

## Definition of done

- The full contract lifecycle runs in sim with placeholder content: gate -> offer -> accept ->
  grade (free, repeatable) -> deliver (pay + tip + reputation + specialty) or lapse (penalty,
  re-offer, never dead-ends).
- Grading is pure `requirements.ts` evaluation; every primitive unit-tested; budget reads the
  real ledger; missions bind a car only at delivery.
- Both placeholders prove a build route via satisfiability probes with the 1.15x payout floor.
- Story missions never touch the service-job offer cap. `SAVE_VERSION` 35; full gate green.

## Exit

**Built, task by task:**

1. Six requirement primitives in `requirements.ts`/`requirement.ts`: `statThreshold`, `statCeiling`,
   `budgetCap`, `deadline`, `tasteMatch`, `roadworthy` (`slotCondition` kept, now dispatched through
   a proper `switch (spec.kind)` instead of the old direct-destructure). `evaluateRequirement` gained
   an optional trailing `model?: CarModel` param so every pre-existing call site (`isServiceTaskDone`
   and its five callers) compiles unchanged. `tasteMatch` reads at a fixed neutral heat (100), proven
   algebraically and by a direct test (`the heat-cancelling property`) that the
   `valuateCarForBuyer / marketValueYen` ratio is heat-independent. 19 new unit tests in
   `packages/sim/tests/requirements.test.ts`.
2. `content/src/storyMission.ts` + `content/src/persona.ts` schemas; `data/storyMissions.json` (two
   placeholders, `placeholder-a`/`placeholder-b`, clearly titled as scaffolding) and
   `data/personas.json`; `data.ts` mirrors each mission's `budgetCapYen` into an auto-appended
   `budgetCap` requirement at load (single authored source, per decision 2). `naming.test.ts`
   extended with two new leak-guard tests (mission copy, persona copy); new
   `content/tests/storyMission.test.ts` (parse, id uniqueness, ascending gates, valid specialty
   groups, non-empty copy, positive payout/budget). `spellingGuard.test.ts` extended to scan the new
   copy fields too.
3. `GameState.storyMissions` (`StoryMissionRecordSchema`, purely additive, default `[]`);
   `SimContext` gained `storyMissions`/`storyMissionsById`/`personas`/`personasById`
   (`buildSimContext`'s 15th/16th trailing params, sorted by `gateReputationPoints`);
   `advanceStoryMissions` (new `missions.ts`) implements the lapse -> reoffer -> gate sequence and is
   wired into `advanceDay` as step 7c, right after the service-job deadline backstop. 24 tests in
   `packages/sim/tests/missions.test.ts` cover gating (including "a later mission never jumps ahead"
   and "nothing offered below every eligible gate"), lapse/reoffer (including the reputation floor),
   a same-seed determinism check, and a dedicated "service-job offer generation is byte-identical
   with or without an active mission" test for the `offerCountCapByDay` non-interaction the task
   calls for.
4. `resolveAcceptMission`, `gradeMissionCar`, `resolveDeliverMission` in `missions.ts`; four new
   `DayLogEntry` kinds (`mission-accepted`, `mission-delivered`, `mission-lapsed`,
   `mission-reoffered`) plus their `dayLogFormat.ts` render cases; tip arithmetic tested both ways
   (earns/withholds) plus a third case proving a mission with no `statThreshold` at all never earns
   a tip (see deviation 3 below). `dayLogFormat.test.ts` gained 4 fixture samples and 2 dedicated
   tip-copy tests.
5. `packages/sim/tests/storyMissionProbes.test.ts`: one satisfiability probe per real placeholder,
   each asserting `gradeMissionCar` actually passes and that `payoutYen >= 1.15 x C` /
   `budgetCapYen >= 1.05 x C` hold against a measured `C` (purchase proxy via `marketValueYen` +
   `carCostToBandYen`'s repair-atom sum, reused directly rather than reimplemented). Both placeholders
   pass with their currently-authored numbers (500k/400k and 1,000k/800k) - no JSON tuning needed.
6. Pinned mission card + active-mission summary row on `ServiceJobsScreen.vue`
   (`storyMissionOfferView`/`activeStoryMissionView` computeds, `acceptMission` action in
   `gameStore.ts`); 4 new component tests in `ServiceJobsScreen.test.ts`.
7. `SAVE_VERSION` 34 -> 35 (purely additive, no migration); two new roundtrip tests in
   `saveCodec.test.ts` (a pre-v35 save decodes with no campaign progress; a v35 state with real
   offered + active records round-trips both exactly). Two golden-master hashes re-pinned (below).
   Full workspace gate green (numbers below).

**Deviations, with why:**

1. `ServiceJobTaskSchema.requirement` is pinned to a new, separately-exported
   `SlotConditionRequirementSchema` (extracted from the union) rather than the full widened
   `RequirementSpecSchema`. Not explicitly specced. Reason: without this, every existing production
   and test call site that reads `task.requirement.carPartId`/`.minBand` directly (`serviceJobs.ts`,
   `bots/serviceJobHelpers.ts`, and a dozen test files) would need a `kind === 'slotCondition'`
   narrowing check for five sibling kinds a service job can never actually author. Since a service
   job's own requirement really is always `slotCondition`-shaped by construction, pinning the type
   to say so is more honest than forcing a defensive narrow everywhere, and it left every one of
   those call sites completely untouched. `evaluateRequirement` still accepts it unchanged, since a
   `SlotConditionRequirement` is one member of the `RequirementSpec` union and is always assignable
   where the wider union is expected.
2. `applySpecialtyDelta` (`serviceJobs.ts`) needed the bare `export` keyword added - the doc's own
   reuse analysis calls for reusing it directly, but it was private. A one-line accessibility fix,
   no logic change.
3. The tip trigger's vacuous-truth case: decision 4 says "if every `statThreshold` in the mission is
   exceeded by `>= tipTriggerFraction`", which is technically true of an empty set. Judged that a
   mission with no `statThreshold` at all has nothing to overdeliver against, so it should never earn
   a tip rather than always earning one - implemented as `earnsTip` returning `false` outright when a
   mission authors zero `statThreshold` requirements (placeholder-a, `roadworthy`-only, is exactly
   this case and is tested for it explicitly).
4. Day 1 of a fresh career never carries an offered mission - only `advanceDay`'s new step 7c ever
   offers one, so the campaign's first mission (`placeholder-a`, `gateReputationPoints: 0`) appears
   from day 2 onward, not seeded into `createInitialGameState` the way the day-1 auction catalog and
   service-job board are. The doc's decision 3 names `advanceDay`'s hook as the sole offering
   mechanism and doesn't ask for day-1 seeding; extending that precedent wasn't requested, so it
   wasn't added. Tested explicitly (`ServiceJobsScreen.test.ts`'s "shows no pinned mission card...
   day 1" case).
5. No `mission-offered` day-log kind was added, even though decision 3 describes a real state
   transition. Task 4 only names `mission-accepted`/`mission-delivered`/`mission-lapsed`/
   `mission-reoffered` - the pinned card itself is the discovery surface, matching the existing
   precedent that a fresh service-job offer also gets no per-offer day-log line.

**Directive 17 case (a) fixes (implementation intentionally changed what's correct):**

- `packages/content/tests/gameState.test.ts`'s hand-built-fixture round-trip test: added
  `storyMissions: []` to the fixture literal - a genuine new additive field.
- `packages/game/src/save/saveCodec.test.ts`: four hardcoded `expect(SAVE_VERSION).toBe(34)`
  assertions updated to `35`; their (and two sibling canary tests') titles, which named the stale
  version number in prose, updated to say 35 (Sprint 76) rather than 34 (Sprint 74).
- 16 `packages/sim/tests/*.test.ts` files (plus `src/newGame.ts`) each had a hand-built `GameState`
  object literal missing the new required `storyMissions` field (Zod's `z.infer` output type makes a
  `.default([])` field required on the inferred type, even though it's optional on parse) - each
  fixed with a single `storyMissions: [],` line; mechanical, delegated to a subagent, verified
  afterward via a clean `pnpm --filter @midnight-garage/sim typecheck`.
- Two golden-master state hashes re-pinned in `advanceDay.test.ts`: the 30-day career
  (`a808b5d7` -> `8a89c1d6`) and the acquisition/sale career (`ddaccece` -> `9c825103`) - both because
  `GameState.storyMissions` is now real, populated state (`placeholder-a`'s `gateReputationPoints: 0`
  means it goes from locked to `offered` on each career's very first day-boundary tick), not a logic
  bug. Every other assertion in the file passed unchanged.

**Not done:** deliver/grade UI (decision 6 defers it to Sprint 77 explicitly); real campaign content
(decision 2 defers it to Sprint 78 explicitly); `lapTimeCeiling` (arrives with the lap model in
Sprint 77).

**Full gate:**

- `pnpm typecheck`: clean (content, sim, game).
- `pnpm lint`: clean.
- `pnpm format`: clean.
- `pnpm test:coverage`: 1407/1407 tests, 95 files. Coverage 89.48% statements / 79.57% branches /
  92.4% functions / 93.35% lines - all above the ratchet floors (80/65/78/82).
- `pnpm build`: clean.
- `pnpm balance:run` (900,000 rows, 9 strategies x 1000 careers x 100 days) +
  `python -m balance.cli check`: every hard-gated invariant passes except the ONE already-documented
  pre-existing failure - "Days-to-`local`, competent probe policy: p50=None (0/1000 seeds reached
  `local` within the career horizon)" - the Sprint 71 teardown-stall bug `TODO.md`'s standing bot-
  harness-rework entry (item 6) already tracks in full, unrelated to story missions (no bot in this
  harness accepts, delivers, or is even aware of a story mission - that integration is unscoped for
  this sprint). Every other check passes, including the two informational disclosures from Sprints
  72/75 (the shitbox Law 6 wage loss, the donor-vs-repair finding), unchanged.
