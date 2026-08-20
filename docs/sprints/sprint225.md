# Sprint 225: the repair job engine

**Status:** Implemented; ready for review. All five tasks landed. `pnpm test --project sim`
is green (118 files, 3031 passed, 1 skipped) and `pnpm typecheck` is clean across content,
sim and game. Both golden masters were re-pinned for the two new state fields and the
re-pin was measured, not assumed (see Exit). Not committed (a commit needs explicit
maintainer approval).
**Arc:** `repair-refactor-arc.md` sprint 2 of 9. Depends on sprint 224 (content).
**Scope:** sim only. The new engine lands COMPLETE and TESTED beside the old repair path.
No old sim path changes behaviour this sprint; no UI reads the engine yet. State gains two
fields (schema bump).

## Reuse analysis (directive 16)

New mechanisms: `packages/sim/src/repairJobs.ts` (job cards, step availability, step
execution) and the `benchParts` / `lift` state fields. Existing mechanisms reused, never
duplicated: `costToBandYen` prices every parts bill (unchanged maths); `chargeRepairWork`
takes the money and posts the car/service-job ledger; `toolLevelsFor` answers ownership;
`machineHiredToday` answers hire; `pruneCuredCauses` + `verifyAndResolve`/
`verifyManyAndResolve` run on grade writes exactly as the old completion path does;
`energySpentToday` and the `energyMax` pool are drawn exactly as today; `state.jobs` and
`JobSchema` persist step progress (no parallel job store); crew skill maths
(`crewSkillFor`, `crewSpeedDiscount`, perfectionist) reuse the existing readers.

## Locked model (implementers make zero choices here)

### Job identity and storage

- New job kinds `'service' | 'rebuild' | 'restore'` added to `JobKindSchema`
  (`packages/content/src/job.ts`), additive. `RepairJobKindSchema` is imported from
  `@midnight-garage/content` (sprint 224).
- A repair job REUSES `JobSchema` fields: `laborSlotsRequired` = the recipe's step count,
  `laborSlotsSpent` = steps done. No new job fields. The parts bill is charged when
  `laborSlotsSpent === 0` and the first step runs.
- Job id, new helper `repairJobIdFor(target, kind)` in repairJobs.ts:
  installed target -> `job-${carInstanceId}-${kind}-${componentId}-${carPartId}`;
  loose target -> `job-part-${partInstanceId}-${kind}`. Kind is inside the id, so a
  Service and a Rebuild on the same part are distinct jobs and a resume can never change
  target band (closes sprint 193 section A row 4 by construction).

### Targets

```ts
export type RepairTarget =
  | { kind: 'installed'; carInstanceId: string; carPartId: CarPartId }
  | { kind: 'loose'; partInstanceId: string }
```

### Offer rules (when a job exists at all)

For a part with taxonomy entry `entry` and current band `band`:
- Not offered if `entry.repairable === false`, if `band === 'scrap'`, if the part id is
  `bodywork` or `paint` (zone-derived; they have no recipes), or if the slot is empty.
- A job `kind` is offered iff `bandIndex(band) < bandIndex(repairJobs[kind].target)`.
- Location gates: `service` runs on an installed part (in situ) or a loose part on its
  bench. `rebuild`/`restore` on a removable part require the part LOOSE and on its bench
  (`benchParts`); on a `removable: false` part they run installed (on the car). A rebuild
  clicked on an installed removable part is refused `'needs-bench'`.
- `restore` is additionally refused `'needs-shop'` unless `ownsToolShopForGroup(state,
  entry.group, context)` (existing helper) - regardless of the recipe's tools.

### Step availability (the one rule, used by cards and execution)

For step `s` of a part in group `g`:
- `bench = s.bench ?? workbench.benchByGroup[g]`;
  `group = s.bench ? BENCH_PRIMARY_GROUP[s.bench] : g` where
  `BENCH_PRIMARY_GROUP = { 'engine-bench': 'engine', 'chassis-bench': 'drivetrain',
  'body-trim-bench': 'body' }` (new sim constant in repairJobs.ts; used only for
  bench-override steps).
- `tier = toolTierOnBench(workbench, bench, s.tool)` (new helper: find the tool id in the
  bench's zone arrays; returns `1 | 2 | 'shop'`; throws on unknown tool - the content
  test guarantees it never does).
- tier 1 -> `'owned'`.
- tier 2 -> `'owned'` if `toolLevelsFor(state, context)[group] >= 2`; else `'hired'` if
  `machineHiredToday(group, state)`; else `'locked'` if `s.requiresMachine`; else
  `'slog'`.
- `'shop'` -> `'owned'` if level 3, else `'locked'`.

Note the semantic change this encodes: on the NEW path a day hire grants the group's whole
tier 2 kit (spec 3.3). The old path's hire semantics are untouched until sprint 226.

### Energy plan (computed live, per call, from current state)

`energyPlanFor(state, context, target, kind) -> number[]` (one cost per step):
1. Base per step: `economy.energy.energyPerStepPoints` (4).
2. Slogged step (`availability === 'slog'`): x `economy.toolHire.slogMultiplier` (3).
3. Buried in-situ surcharge: if `kind === 'service'`, target is installed, and
   `entry.depthClass === 'buried'`: add `economy.energy.energyByClass.buried` (6) to
   step index 0 only.
4. Crew: compute the job's discount ONCE exactly as today's `crewEnergySaved` does, on the
   sum of (1)-(3); then subtract it from the steps in order (step 0 first), flooring every
   step at 1 point. Perfectionist parts-cost multiplier applies to the parts bill exactly
   as `planGroupRepair` applies it today.
5. Lift: if `entry.underCar`, the TARGET IS INSTALLED (lift work happens on the car;
   bench work is never lift-discounted), and the lift is owned or hired today
   (`state.lift`), subtract `economy.lift.underCarStepDiscountPoints` (1) from every
   step, floor 1. (Dormant until sprint 226 wires lift acquisition; the field exists from
   this sprint.)

Steps are atomic: a step runs only if `energyRemaining >= plan[stepIndex]`.

### Execution

`resolveRepairStep(state, target, kind, context, energyRemaining) ->
{ state, outcome, log }` where `outcome` is
`'stepped' | 'completed' | { refused: 'not-offered' | 'needs-bench' | 'needs-shop' |
'needs-machine' | 'needs-hire' | 'no-energy' | 'no-cash' }`:
1. Resolve part, entry, recipe, job (existing via `repairJobIdFor`, else create).
2. Offer + location gates above; `'needs-machine'` when the next step's availability is
   `'locked'` via `requiresMachine`, `'needs-shop'` for shop-tool locks.
3. `plan = energyPlanFor(...)`; refuse `'no-energy'` if short for the NEXT step.
4. If `laborSlotsSpent === 0`: parts bill = `costToBandYen(entry, part, targetBand, ...)`
   x perfectionist multiplier; charge via `chargeRepairWork` (posts car ledger or service
   job ledger); refuse `'no-cash'` if it refuses. Then tick.
5. Tick: `laborSlotsSpent += 1`, `energySpentToday += plan[stepIndex]`, emit
   `repair-step` event.
6. If last step: write `band = repairJobs[kind].target` on the part (installed slot's
   `installed.band` or the inventory instance's `band`), run `pruneCuredCauses` and the
   verify helpers exactly as the old `repair-zone` completion does for that one slot,
   delete the job from `state.jobs`, emit `repair-job-completed`.

### Job cards (read-only pricing, section 8 of the spec)

`repairJobCards(state, context, target) -> RepairJobCard[]`, one per kind in order
service/rebuild/restore:

```ts
export interface RepairJobCard {
  kind: RepairJobKind
  targetBand: ConditionBand
  offered: boolean
  refusal?: 'at-or-above-target' | 'needs-bench' | 'needs-shop' | 'not-repairable'
  route: 'own' | 'hired-today' | 'hire' | 'slog' | 'locked'
  lockedReason?: 'needs-shop' | 'needs-machine'
  hireFeeYen: number | null      // toolHire fee for the deficient group when route is 'hire', else null
  stepsDone: number
  steps: { tool: string; toolLabel: string; copy: string; slogged: boolean }[]
  energyPoints: number           // sum of the live energy plan for REMAINING steps
  removalEnergyPoints: number    // 0, or the remove+refit action energy when the job needs the part out and it is still installed
  partsYen: number               // 0 once charged (job started)
}
```

Route aggregation: `'locked'` if any remaining step is locked (reason from the first);
`'own'` if every remaining step is `'owned'`; `'hired-today'` if any step relies on
today's hire; `'hire'` if any `requiresMachine` step's tool is tier 2 unowned/unhired;
else `'slog'`. `removalEnergyPoints` uses today's `removeLaborSlotsFor` +
`refitLaborSlotsFor`/`installLaborSlotsFor` figures for the part, multiplied per the OLD
path this sprint (sprint 226 swaps removal to rig-route pricing); it is display data only.

### Bench placement

- New state field `benchParts: z.record(BenchIdSchema, z.array(z.string().min(1))).default({})`
  in gameState.ts (import BenchIdSchema from workbench.ts).
- New state field `lift: z.object({ owned: z.boolean(), hirePaidDay: z.number().int().positive().nullable() }).strict().default({ owned: false, hirePaidDay: null })`.
- `resolvePlaceOnBench(state, partInstanceId, context)`: refuse (silent no-op, matching
  `resolveRemovePart`'s style) if the instance is not in `partInventory`, is already on a
  bench, or is `state.workbenchPartId`/`state.machinePartId`; else push onto
  `benchParts[benchByGroup[group]]`.
- `resolveTakeOffBench(state, partInstanceId)`: remove from whichever bench list holds it;
  an unfinished job on the part stays in `state.jobs` (ticked steps persist; the part can
  come back).
- Parts on benches remain in `partInventory` (bench membership is presentational and a
  location gate, never a second inventory).

### Events

Add to `packages/content/src/sessionEvent.ts` (additive): `repair-step`
`{ carInstanceId?, partInstanceId?, carPartId, jobKind, stepIndex, copy, slogged,
energyPoints }` and `repair-job-completed` `{ carInstanceId?, partInstanceId?, carPartId,
jobKind, targetBand }`. (Day-log formatting lands with the UI sprints.)

## Tasks

1. Content additions: `JobKindSchema` + the two session events + the two gameState fields.
   Bump `SAVE_VERSION` (saveCodec.ts) and the Dexie version (saveDb.ts, new
   `this.version(N).stores({...})` block copying the current stores object).
2. `packages/sim/src/repairJobs.ts` implementing everything under "Locked model", plus the
   helpers `repairJobIdFor`, `toolTierOnBench`, `stepAvailability`, `energyPlanFor`.
   Export everything the UI sprints will need (cards, resolvers, bench resolvers, types).
3. `packages/sim/src/index.ts` (or the existing export surface): export the new module the
   same way `jobs.ts` exports are surfaced.
4. Tests, new `packages/sim/tests/repairJobs.test.ts`. Required cases, each its own `it`:
   - Offer matrix: mint part offers nothing; fine offers restore only; worn offers
     rebuild+restore; poor offers all three; scrap offers nothing; `clutch` offers
     nothing (not repairable); empty slot offers nothing.
   - Service in situ on a buried part: step 0 costs 4+6, step 1 costs 4; completes to
     `worn`; parts bill charged on step 0 only; cash refused when short (`'no-cash'`, no
     tick).
   - Service on a bolt-on installed part: no surcharge.
   - Rebuild on an installed removable part refuses `'needs-bench'`; after
     `resolvePlaceOnBench` (part removed via existing `resolveRemovePart` first) it runs.
   - Rebuild route at tier 1: every non-welded tier-2 step is slogged at 12 points;
     with the group hired today (`machineHirePaidDayByGroup[group] = state.day`) the same
     steps cost 4 (`'hired'`).
   - Welded step (exhaust rebuild step 0) refuses `'needs-machine'` at tier 1 unhired;
     runs when body group hired today; runs when body line owned at tier 2. (Asserts the
     cross-bench group rule: the EXHAUST job keys the MIG on the BODY group.)
   - Restore refuses `'needs-shop'` without the covering shop even at tool tier 2; with
     the shop owned (`toolShopsOwned`) it runs and shop-tool steps are `'owned'`.
   - Restore on rims requires the CHASSIS shop (covers wheels); its 3 steps complete to
     mint.
   - Chassis (fixed surface) rebuild runs installed; never asks for a bench.
   - Interruption: run one step of a two-step rebuild, assert the job persists with
     `laborSlotsSpent 1`; advance the day (hire lapses); the second step refuses
     `'needs-machine'`/slogs per route; re-hire and complete; band updates only at the
     end.
   - Money: parts bill equals `costToBandYen` for the band distance (poor->fine = 2 steps
     x 0.1 x catalogue price), charged once, posted to the car ledger; a customer car's
     job posts to its service-job ledger.
   - Crew: with a benched crew member whose discount is D points, the job total is D
     lower, no step below 1.
   - Energy pool: a step refusing on `'no-energy'` does not tick, charge, or mutate.
   - Cards: card totals equal the sum of the live plan; `partsYen` drops to 0 after step
     0; route aggregation for each of the five route states; card for a job mid-way shows
     remaining steps only.
   - Invariant sweep: for all 23 recipes x all three kinds, every service step resolves
     tier 1 (service is always route `'own'`); shop-tier tools appear in restore recipes
     only.
5. Golden masters: the two new state fields move both hashes. Re-pin
   `advanceDay.test.ts` (both scenarios) and `careerReplay.test.ts` with the standard
   trace comment ("GameState gains benchParts and lift; hash re-derived from a real run;
   no behaviour change - old repair path untouched, verified by the unchanged
   cash/day-count assertions around the hashes"). Every OTHER existing test must pass
   untouched; if any other test fails, STOP and report (that is a real regression, case
   (b) of directive 17).

## Checks

- `pnpm test packages/sim/tests/repairJobs.test.ts` (new suite).
- `pnpm test --project sim` once at the end (collateral sweep + the two re-pins).
- `pnpm typecheck` (schema fields added: the carve-out applies).

## Exit

All five tasks landed. The engine is complete, exported and tested, and it sits entirely
beside the old repair path: no existing sim function changed behaviour, no screen reads the
new module yet, and the only reason either golden master moved is that `GameState` now
carries two more keys. That claim was measured rather than asserted (proof below).

### Files landed

New:

- `packages/sim/src/repairJobs.ts` (818 lines): the whole engine. Exported surface, in file
  order:
  - Types: `RepairTarget`, `ToolTierOnBench`, `StepAvailability`, `RepairJobCardRefusal`,
    `RepairJobRoute`, `RepairJobStepCard`, `RepairJobCard`, `RepairStepRefusal`,
    `RepairStepOutcome`, `ResolveRepairStepResult`.
  - Constants: `REPAIR_JOB_KINDS` (service, rebuild, restore, in ladder order),
    `BENCH_PRIMARY_GROUP`.
  - Step rules: `toolTierOnBench(workbench, bench, tool)`, `stepBenchFor(step, partGroup)`,
    `stepGroupFor(step, partGroup)`, `stepAvailability(state, context, step, partGroup)`.
  - Job identity, target and energy: `repairJobIdFor(target, kind, context)`,
    `targetBandFor(kind, context)`, `energyPlanFor(state, context, target, kind)`.
  - Benches and lift: `benchForGroup(group)`, `benchPartIds(state, bench)`,
    `benchHoldingPart(state, partInstanceId)`,
    `resolvePlaceOnBench(state, partInstanceId, context)`,
    `resolveTakeOffBench(state, partInstanceId)`, `liftAvailable(state)`.
  - Cards and execution: `repairJobCards(state, context, target)`,
    `resolveRepairStep(state, target, kind, context, energyRemaining)`.
- `packages/sim/tests/repairJobs.test.ts` (6 tests): the offer matrix; service in situ on a
  buried part (surcharge on step 0 only, completes to worn, parts bill charged once, refused
  for short cash without ticking); service on a bolt-on part carrying no surcharge; rebuild
  on an installed removable part refusing `needs-bench` then running once removed and
  benched; a chassis rebuild running installed and never asking for a bench; the energy pool
  refusing `no-energy` without ticking, charging or mutating.
- `packages/sim/tests/repairJobRoutes.test.ts` (15 tests): the tier-1 slog and the day hire
  on a three-step block rebuild; the welded exhaust step keying the MIG on the BODY group
  (refused at tier 1, unmoved by hiring the engine line, running on the body hire and on
  body tier 2); restore refused `needs-shop` at tool tier 2 and running with the shop; rims
  restore resolving to the chassis shop and completing to mint; interruption across a day
  with the hire lapsing and the band moving only on the last step; and the invariant sweep
  over all 23 recipes (every service step at tier 1, shop tools in restore recipes only).
- `packages/sim/tests/repairJobCards.test.ts` (11 tests): the parts bill for the band
  distance charged once and posted to the car ledger, and to the service job's own ledger on
  a customer car; the crew discount taken off the job total with no step below one point;
  card totals against the live plan with `partsYen` dropping to zero once started and only
  remaining steps shown; all five route states; and job identity (a service and a rebuild on
  one part being two non-interfering jobs, each resuming to its own locked target band).

Modified:

- `packages/content/src/job.ts`: `JobKindSchema` gains `service`/`rebuild`/`restore`.
  Additive; no job field added.
- `packages/content/src/sessionEvent.ts`: `repair-step` and `repair-job-completed` variants,
  payloads exactly as the locked model names them.
- `packages/content/src/gameState.ts`: `benchParts` and `lift`, both defaulted.
- `packages/game/src/save/saveCodec.ts`: `SAVE_VERSION` 76 -> 77, no `MIGRATIONS[76]` entry
  (directive 19: both fields carry schema defaults, so an old save decodes with every bench
  empty and no lift).
- `packages/game/src/save/saveDb.ts`: `this.version(4)` with the stores object unchanged.
- `packages/sim/src/index.ts`: `export * from './repairJobs'`.
- `packages/sim/src/jobs.ts`: `chargeRepairWork` exported (it was module-private) and its
  header now names the third caller. No behaviour touched.
- `packages/sim/src/newGame.ts`: the two fields seeded on a fresh career.
- `packages/sim/src/careerReplay.ts`: `repair-step` re-derives the step by working the same
  job; `repair-job-completed` is a no-op, since it is only ever emitted alongside the last
  `repair-step`.
- `packages/sim/src/careerScripts/smoke.script.json`: its two `kind: 'hash'` checkpoints
  re-pinned with the replay hashes they check.
- 22 existing sim test files: the two new fields added to their full-`GameState` fixture
  builders. Mechanical wiring, two lines each, no assertion touched.

### Golden re-pin, and the proof it is shape only

| Pin | Was | Now |
| --- | --- | --- |
| `advanceDay.test.ts`, 30-day master | `dbf45eb9` | `31707bd5` |
| `advanceDay.test.ts`, acquisition and sale | `deded012` | `bd89d46a` |
| `careerReplay.test.ts`, days 1 to 10 | `d1fd027b` ... `e61c3d6f` | `94fd8cfb` ... `746a821f` |

Only hash literals moved. Every non-hash assertion around them is untouched and passing: the
30-day master's rent-charge count and cash figures, the acquisition script's buy-and-sell
assertions, and the smoke script's own day-7 `cashAtMost` ceiling, day-10 `carsOwned` count
and day-10 `reputationTier`. Each re-pinned literal carries a trace comment in the file's
existing style recording that the state shape gained `benchParts` and `lift` and that the
hash was re-derived from a real run.

The stronger claim was measured directly: with the two new keys deleted from the final state
before hashing, both `advanceDay` hashes come back as exactly their pre-sprint values
(`dbf45eb9` and `deded012`). The serialised state is therefore identical apart from the two
new keys: no roll consumed, no cash figure, no derived stat moved. The measurement was run as
temporary instrumentation and removed again, so the file's diff is the re-pin and its comment
and nothing else.

### Check output

`pnpm test --project sim`:

```text
 Test Files  118 passed (118)
      Tests  3031 passed | 1 skipped (3032)
   Duration  161.74s
```

`pnpm typecheck` (directive 20's carve-out: two schema fields added):

```text
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

No test outside the two golden masters needed a changed assertion, which is task 5's own
condition for the sprint having caused no regression.

### Deviations from the locked model

1. `benchParts` is `z.partialRecord(BenchIdSchema, ...)`, not `z.record(...)`. Zod infers a
   `z.record` over a finite enum key as an exhaustive record, which rejects the `{}` default
   the model specifies. `partialRecord` is the same runtime shape with the key made optional,
   which is what "a bench with nothing on it is absent from the map" already meant.
2. The sim uses `RepairJobKind` imported from `@midnight-garage/content` (sprint 224's
   `workbench.ts`) as its job-kind type rather than declaring a sim-local alias. One
   definition, in the package that owns the content.
3. `repairJobIdFor(target, kind, context)` takes a third argument the model's signature does
   not list. The installed-target id embeds the component id, which is a taxonomy lookup, so
   the context is unavoidable.
4. The tests landed as three files rather than one. `repairJobs.test.ts` holds offer rules
   and execution, `repairJobRoutes.test.ts` the tool ladder and interruption, and
   `repairJobCards.test.ts` money, crew, cards and job identity. Every required case in task
   4 is present, each as its own `it`; 32 tests in total.
5. `careerReplay.ts` gained cases for the two new events, which no task lists. The replay
   switches exhaustively over the session event union, so adding an event to the union
   without a case does not compile. Wiring, not a design choice.
6. `smoke.script.json`'s two hash checkpoints were re-pinned alongside `careerReplay.test.ts`
   (task 5 names only the test files). The script's own hashes check the same replay, so
   they move with it; its three non-hash checkpoints are untouched.
7. `chargeRepairWork` had to be exported from `jobs.ts` to be reused. Reuse as directed; the
   only alternative was a second money path, which is what the reuse analysis forbids.
8. `RepairStepRefusal` declares `'needs-hire'`, per the model, but no path returns it: a
   tier-2 step nobody owns or has hired slogs rather than refusing, and one that cannot be
   slogged refuses `'needs-machine'`. The member is kept because the model names it and the
   hire-facing UI sprints may yet want it; it is unreachable today.
9. Only `verifyAndResolve` is used on a band write, not `verifyManyAndResolve`. A repair job
   writes exactly one slot, so the single-slot helper is the right one.
