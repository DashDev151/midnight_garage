# Sprint 106: Diagnosis IV - routed deduction (the diagnostic tree)

**Date:** 2026-07-21
**Source:** maintainer design discussion, 2026-07-21. The diagnosis mechanic is informationally
sound but experientially passive: every test is offered up front, order does not matter, and
the player can click buttons without reading anything and still get an adjusted price back.
The agreed rework: diagnosis becomes a routed, chained system - a test's result unlocks the
next choices, the authored result copy carries the routing hints, dead ends cost minutes, and
comprehension converts to yen. 2-3 layers for most diagnoses, no extreme depth.

**One-line goal:** ship the routing machinery plus a three-symptom vertical slice, so the
"reading is the mechanic" feel can be playtested before the full authoring sweep (Sprint 108).

**Sequencing:** 106 (this) -> playtest the slice -> 107 (bidding reactions, independent) ->
108 (authoring sweep across the remaining symptoms). Batch-authoring fifteen trees before the
slice is validated would be waste if the fork feel needs reshaping.

## Reuse analysis (directive 16)

**Existing mechanisms reused (the engine survives whole):**

- `CauseSchema` / `SymptomSchema` / `TestApplicationSchema`: extended with one optional
  field, never replaced. The cause spectra, weights, and scrap-band catastrophes from
  Sprint 105 are untouched.
- `runDiagnosticTest` and the narrowing model (`remainingCauseIds`, intersection with the
  partition group containing `trueCauseId`): unchanged. The rework changes WHICH tests are
  offered WHEN, not what running one does.
- `CarSymptom.runTestIds`: already persisted on the car. Availability derives from it plus
  `trueCauseId` (both existing state), so the tree adds NO new save state at all.
- The minutes budget (`beginInspectionVisit`, `economy.diagnosis.visitMinutes`, per-test
  `minutes`): unchanged, and it is the punishment mechanism for dead ends for free - a dead
  end costs its minutes and nothing else needs building.
- Per-outcome `resultCopy`: unchanged in shape; its editorial role is promoted (result lines
  now double as routing hints for the next fork).
- `SymptomChecklist.vue` (shared by the auction board and the room demo since the card
  extraction): evolves in place; both surfaces inherit the routed UI automatically.
- `symptomChecklistForCar` (gameStore): stays the single view-assembly point; it filters by
  the new availability function.
- `playerEstimateYen` / `sheetGuideValueYen` / the odds pricing: completely untouched.

**Genuinely new:**

1. One optional content field: `unlockedBy` on a symptom's test application.
2. One pure sim function: `availableTestIdsFor(carSymptom, symptom)` plus a `locked`
   legality outcome in `runDiagnosticTest`.
3. The routed checklist UI: breadcrumbs of what was run and learnt, then only the currently
   available fork.
4. Three authored slice trees (plus any new cheap observation tests they need).
5. Content-integrity extensions validating the tree shape.

## Design

### 1. The design law: information before choice

A chained system fails exactly like the current one if a fork is a blind 50/50 - that is
just clicking with extra steps. Every fork must be rankable by a player who read the
previous result line (or, at the root, the card line itself). The authored copy IS the
mechanic:

- Result lines point somewhere concrete ("plain rainwater, and it's tracking in high on the
  bulkhead side") so the reader can rank the next choices.
- Dead ends are tests that are informative in SOME knowledge states and worthless in the
  current one - and predictably so, to a reader. They stay offered (pruning them would
  delete the skill); their honest copy admits the nothing learnt, and the minutes are gone.
- The two intents both get a route: **rule out the grenade** (coarse, fast, the walk-away
  answer) and **pin the exact number** (slower, for bidding confidence). Fork design should
  let the player choose which question to chase first.

### 2. Content model: `unlockedBy`

`TestApplicationSchema` gains one optional field:

```ts
unlockedBy: z.object({
  testId: z.string().min(1),          // a test in this symptom's own list
  group: z.union([z.literal(0), z.literal(1)]),  // offered once that test resolved to this partition group
}).optional()
```

- Absent `unlockedBy` = a **root** test, offered from the start. All eighteen existing
  symptoms are valid as-is (every test is a root), so the fifteen un-reworked symptoms play
  exactly as today. Incremental migration by construction; no big-bang content risk.
- Single parent per test (no OR-arrays): 2-3 layers do not need more, and it keeps the
  integrity rules trivial. Widen later only if authoring genuinely demands it.
- Partitions stay strictly two-group. The branching comes from `unlockedBy`, not from n-ary
  outcomes, so every existing invariant (full non-overlapping coverage) survives.

Integrity rules (Zod refine + `symptom.test.ts`): every `unlockedBy.testId` names another
test of the same symptom; no self-reference; chains are acyclic and terminate at a root; at
least one root per symptom; unlock depth at most 3.

### 3. Sim: availability is derived, never stored

`availableTestIdsFor(carSymptom, symptom): string[]` - a test application is available iff
it has no `unlockedBy`, or its parent test is in `runTestIds` AND the parent's outcome group
(the partition group containing `trueCauseId` - the sim may read the true cause; the player
never sees it) matches `unlockedBy.group`.

`runDiagnosticTest` gains one legality gate: running a not-currently-available test returns
a new `'locked'` outcome and changes nothing. The UI never offers locked tests, but the sim
enforces its own law as everywhere else.

### 4. UI: the routed checklist

`SymptomChecklist` becomes a trail plus a fork:

- **Breadcrumbs:** each run test as a compact line - test name, then its earned result copy.
  The trail is the player's growing case file and carries the hints for the fork below.
- **The fork:** only currently-available, not-yet-run tests, with minutes. Locked tests are
  invisible until unlocked (the "new options open up" moment is the adventure feel).
- **Closed state:** when nothing further is available, a quiet closing line; the estimate
  stands at whatever the narrowing reached.
- `showDeltas` and the disabled-reason plumbing are unchanged; the board and the demo both
  inherit the rework through the shared component.

### 5. The vertical slice: the board-opens shape

This section records the FINAL shape. It took three iterations inside this sprint - the
first two were rejected by the maintainer's playtests, and the failures are worth keeping:

- **Iteration 1 (single-root corridors):** 3-cause ladders, one root test each, unlocks
  opening the one correct next test. Rejected: the majority-weight cause resolved in one
  click of the only button - an answer without a decision.
- **Iteration 2 (two roots):** a second root per tree. Rejected: still corridors - after
  any test, the next step needed no reading, because the unlock structure only ever
  offered the correct continuation. Information won was never USED to choose.
- **Iteration 3 (the board opens - final):** the fix is structural. Level 1 teaches;
  then a whole BOARD of follow-up tests opens at once, and which of them bites depends
  on the level-1 outcome. The previous result line is the only thing separating signal
  from waste. This required 4-5 cause ladders (with 3 causes, any two-group test has a
  singleton side and the doubt collapses too fast) - a deliberate amendment to the
  Sprint 105 ladders, maintainer-sanctioned.

**The laws, all probe-asserted over every routed symptom (Sprint 108 inherits them):**

1. **Root shape:** no root-test outcome carrying more than 25% of the symptom's weight
   may resolve outright. (Minority instant-reads stay: white sweet smoke IS the head
   gasket at 22 weight; that jackpot/bad-news moment is honest and rare.)
2. **Choice everywhere:** once a test has run, every reachable unresolved node offers at
   least two unrun tests.
3. **Waste and signal:** every such node offers at least one test that narrows nothing
   there (a live dead end) AND at least one that narrows.
4. **Reading pays, quantified:** expected minutes of uniform-random clicking >= 1.5x the
   weighted best-route minutes. Measured: footwell 31.8 vs 17.4 (1.83x), smokes 30.8 vs
   19.1 (1.61x), crunch 42.5 vs 25.0 (1.70x). This is the gate that makes "random
   clicking loses" arithmetic, not opinion.
5. **Grenade budgets, honest and pinned:** footwell 15, crunch 25, smokes 30 minutes
   worst case to decide the write-off in or out.

**The final trees** (weights sum 100 per ladder):

- **Footwell** (matrix worn 38 / blocked-scuttle-drain worn 20 / grommet poor 14 /
  split-sunroof-drain poor 10 / bulkhead-seam scrap 18): trace-the-wet (5m, root: up top
  or from below) opens the board of coolant-check (10m), scuttle-drain-poke (10m),
  undercarriage-look (15m), carpet-lift (5m, dead end everywhere); hose-the-roof (10m)
  unlocks off coolant-check's plain-water outcome.
- **Smokes** (valve-seals worn 45 / gunked-breather worn 20 / head-gasket poor 22 /
  tired-rings scrap 13): cold-start-watch (10m, root: blue or white) opens
  compression-test (25m), breather-check (10m), overrun-smoke-watch (10m, the classic
  stem-seal isolator), pull-a-plug (5m, dead end after the smoke told you it burns oil).
- **Crunch** (synchros worn 48 / low-thin-oil fine 14 / clutch poor 20 / gearset scrap
  18): gearbox-oil-check (15m, root: the oil tells a story or it does not) opens
  magnet-check (10m), clutch-drag-check (10m), linkage-check (10m, dead end with the
  same honest line either way), try-it-warm (15m, the tempting lazy option that costs
  what warming a gearbox through really costs).

### 6. Copy

Era band is **1995-2005** (maintainer, 2026-07-21) - period credibility spans the decade,
not the single year. All new result lines and closing lines pass the content bar and are
personally swept by the orchestrator; every line doubles as a routing hint, which makes the
sweep a gameplay review, not just a tone review.

## Decisions

1. **Keep the engine, route the surface.** Narrowing, partitions, minutes, and save state
   are untouched; the rework is availability plus authoring (directive 16).
2. **Availability is derived** from `runTestIds` + `trueCauseId` + content. No new save
   state, no migration (directive 19 moot).
3. **Absent `unlockedBy` = root**: all existing content stays valid and flat symptoms play
   exactly as today, so the sweep (108) can land symptom by symptom.
4. **Dead ends stay offered.** Pruning uninformative tests would delete the skill of
   avoiding them. Their copy is honest after the fact and predictable before it.
5. **Forks map to intents:** rule-out-the-grenade and pin-the-number are both authored
   routes, because they are the two real questions at a yard.
6. **Slice before sweep.** Three symptoms prove the feel; the other fifteen wait for the
   playtest verdict (Sprint 108).

## Tasks

**Claude-implementable:**

- [x] Schema: `unlockedBy` on `TestApplicationSchema` + integrity refinements (exists,
      acyclic, roots, depth <= 3) + `symptom.test.ts` coverage.
- [x] Sim: `availableTestIdsFor` (pure, exported) + `'locked'` outcome in
      `runDiagnosticTest` + unit tests (root-only symptom unchanged; unlock on right
      group; locked on wrong group; locked refusal).
- [x] Store: `symptomChecklistForCar` filters offered tests through availability and
      exposes run-test breadcrumbs (test label + earned result line) in run order.
- [x] UI: `SymptomChecklist` renders trail + fork + closed state; demo and board inherit;
      component tests updated.
- [x] Content: the three slice trees (unlock wiring + new 5-minute observation tests in
      `diagnosticTests.json` + all new result copy).
- [x] Probe: slice-tree route check (budget re-based to each tree's honest measured
      figure - see the design note - rather than a blanket 25).
- [x] Docs: routing law recorded (design section); sweep hand-off = Sprint 108's scope
      list.

**User-only:**

- [ ] Playtest the slice in the demo: does routing feel like thinking? Is the dead end
      fair? Verdict gates the Sprint 108 sweep.

## Exit

- [x] Schema shipped: `unlockedBy { testId, group }` optional on a symptom's test entry;
      `SymptomSchema.superRefine` enforces exists/not-self/acyclic/root-exists/depth <= 3.
      All 18 existing symptoms parse unchanged (root-only content is valid by
      construction). Content integrity tests cover accept + 5 rejection shapes.
- [x] Sim shipped: `availableTestIdsFor(carSymptom, symptom)` - pure, derived from
      `runTestIds` + `trueCauseId` + content, no new save state; exported via the barrel.
      `runDiagnosticTest` refuses a locked test (`'locked'`, state untouched, no minutes)
      after applicability checks and before the already-run/minutes checks.
- [x] Store/UI shipped: `symptomChecklistForCar` now returns the fork (available minus
      run) plus a `trail` (run tests in order, each with its earned result line, derived
      in the store from content + `trueCauseId` - the `resultCopyFor` prop and both
      screens' result-copy caching state are deleted, one source of truth). Checklist
      renders trail -> fork -> closed state ("That's everything the yard will tell you.",
      shown only after at least one test with nothing left to offer). Board and demo
      inherit through the shared card; a run test now leaves the fork entirely (stronger
      than the old disabled-button state, and asserted as such).
- [x] Slice content shipped: footwell, smokes, and crunch are routed trees (six
      `unlockedBy` wirings; `carpet-lift` / `pull-a-plug` / `try-it-warm` registered at
      5 minutes each). Causes, weights, and card lines byte-identical to Sprint 105.
      All 18 result lines + the closed-state line authored by the orchestrator and
      verified byte-verbatim in the shipped JSON (script check: 18/18, 0 mismatches) -
      the personal copy sign-off is real, not delegated.
- [x] Decision recorded mid-sprint: the grenade-route law is TWO TESTS, not a flat
      25 minutes. `compression-test` is a shared registry test honestly priced at
      25 minutes, so the smokes route costs 35; accepted deliberately (the bottom end
      should be the dearest question on the lot, and 35-of-60 shared minutes is exactly
      the budget tension the system wants). Probe asserts the honest per-tree budgets
      25 / 10 / 35.
- [x] Probes green: `diagnosisRouteProbes.test.ts` (9) - grenade routes within budget for
      every possible true cause, dead ends narrow nothing at their unlock node, roots and
      depth-2 structure hold.
- [x] Evidence: sim diagnosis 165 passed; content project 95 passed; route probes 9
      passed; game project 50 files / 615 passed; `pnpm typecheck` clean across all three
      packages. Uncommitted, pending maintainer word; the pre-push hook is the full gate.

**Board-opens addendum (same sprint; the design section's iteration history explains
the two rejected shapes this replaces):**

- [x] Machinery: `unlockedBy.group` became optional (absent = offered once the parent
      ran, either outcome - the board-opens primitive). Schema refinements and
      `availableTestIdsFor` updated; content 21 / sim 172 tests green.
- [x] Content: all three slice ladders widened (footwell 5 causes, smokes and crunch 4;
      new causes blocked-scuttle-drain, split-sunroof-drain, gunked-breather,
      low-thin-oil mapped into the existing taxonomy; grenade weights preserved) and all
      three trees rebuilt to the board shape recorded in the design section. Every
      result line authored by the orchestrator and verified byte-verbatim in the shipped
      JSON (23-line script check, 0 mismatches), with each dead-end line re-audited to
      read honestly in EVERY context it can fire.
- [x] The reading-pays probe did its job mid-sprint: the first rebuild measured smokes at
      1.18x and crunch at 1.30x, under the 1.5x bar. The bar stayed; the content rose to
      it (smokes gained overrun-smoke-watch, the classic stem-seal isolator, which also
      cut the seals reader route from 45 to 20 minutes; crunch gained linkage-check and
      try-it-warm rose 5 -> 15 minutes to its honest cost). Final measured ratios:
      1.83x / 1.61x / 1.70x, route probes 18/18.
- [x] Game layer re-pinned from real deterministic runs: the reshaped symptom population
      reshuffled the fixed-seed demo pair (the trap is now a Nissan Sunny (B12), read
      ¥124,809 / true ¥101,428; the Civic steal reads ¥194,534 / true ¥223,201 and its
      rolled cause is the blocked scuttle drain - the trace drops the estimate toward
      the feared seam before the poke reveals the gem). Positional test-button anchors
      replaced with by-id anchors throughout. Full game project 50 files / 637 green;
      sim + content 66 files / 1280 green.
