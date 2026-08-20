# Sprint 225: the repair job engine

**Status:** Planned
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

(Fill on completion.)
