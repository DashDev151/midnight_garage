# Sprint 231: retirement of the band pipeline

**Status:** Planned
**Arc:** `repair-refactor-arc.md` sprint 8 of 9. Depends on 230 (the UI no longer touches
the old path).
**Scope:** both packages. Everything transitional dies here; the arc's retirement
checklist is owned by this sprint. This sprint runs `pnpm typecheck` as a task, not a
formality: it retires schema fields and exported symbols (the directive 20 carve-out's
exact case).

## Reuse analysis (directive 16)

New mechanisms: none. This sprint only deletes, re-points scripts, and re-pins. The
`retiredIdentifiers` guard is the existing mechanism for keeping the deleted names dead.

## Locked deletion list

### Sim (`packages/sim/src`)

- `bands.ts`: delete `energyToClimb`, `repairCeilingForLevel`, `clampRepairTarget`,
  `planPartRepair`, `planGroupRepair`, and any helper that becomes orphaned with them.
  SURVIVES: `BAND_ORDER`/`bandIndex`/`gradesBetween`/`climbBand`/`degradeBand`,
  `canRepair`, `costToBandYen`, and the carrier/zone helpers (the body pipeline and
  `partFixCostYen` read them).
- `jobs.ts`: delete `repairJobGate`, `resolveReconditionLabor`, `planReconditionPart`,
  `machineGateGroupFor`, `machineLaborMultiplier`, `jobMachineGroup`, and the
  `repair-zone` / `recondition-part` branches of `completeJob`/`applyJobToCar`.
  SURVIVES: `findOrCreateJob`/`jobIdFor` (install-part), `chargeRepairWork`,
  `resolveRemovePart` (on accessRoute since 226), `resolveHireToolLine`, the install
  path, `applyAvailableLaborToJob` (install jobs still use it).
- `taskLaborChain.ts`: delete the file if 227 left it orphaned; otherwise delete the
  orphaned exports.
- Any residual read of the retired economy keys (search each name repo-wide before
  deleting the key).

### Content (`packages/content`)

- `economy.json` + `economy.ts`: delete `repairBandCeilingByTier`,
  `energy.energyPerBandStepByToolTier`, `machineShopAssist` (its three values live on in
  `toolHire` since 224/226). Re-pin the approval gate with a ledger paragraph stating
  the retirement and where each value moved.
- `parts-taxonomy.json` + `carPart.ts`: remove `machineGate` from every entry; delete
  `MachineGateOperationSchema` and the field.
- `job.ts`: remove `'repair-zone'` and `'recondition-part'` from `JobKindSchema`.
- `stagedWork.ts`: retire the `'repair'` kind; add three kinds for the headless/replay
  path (bots and scripts only, resolved in `advanceDay`'s queued loop by calling the
  same instant resolvers):
  - `repair-job`: `{ carInstanceId?, carPartId?, partInstanceId?, jobKind, steps }` -
    calls `resolveRepairStep` up to `steps` times, stopping on any refusal.
  - `place-on-bench`: `{ partInstanceId }`; `take-off-bench`: `{ partInstanceId }`.
- `gameState.ts`: remove `workbenchPartId`. Bump `SAVE_VERSION` and Dexie.
- `sessionEvent.ts`: remove `part-reconditioned` (replaced by the 230 lines).

### Game (`packages/game`)

- Delete `WorkbenchPanel.vue` + its test. `WorkStationTray.vue`: delete the workbench
  station wiring; the component itself stays only if the machine-shop station still uses
  it (verify by grep; if unused anywhere, delete it and its test).
- `gameStore.ts`: delete `repair()`, `reconditionPart()`, `repairCeilingCaption`,
  `benchRepairCeilingCaption`, `stationPart('workbench')` wiring, and every getter that
  read the deleted sim symbols. `repairStepText` SURVIVES (the body shop uses it).
- `dayLogFormat.ts`: delete the `part-reconditioned` branch.
- `economyBenchActions.ts` (dev screen): re-base its two reads
  (`repairStepFraction` stays; the per-band energy read becomes `energyPerStepPoints`).

### Guards

- `retiredIdentifiers.test.ts`: register, each with "retired in sprint 231, repair
  refactor" and the replacement name: `machineGate`, `repairBandCeilingByTier`,
  `energyPerBandStepByToolTier`, `machineShopAssist`, `machinelessLaborMultiplier`,
  `machineLaborMultiplier`, `machineGateGroupFor`, `repairCeilingForLevel`,
  `planGroupRepair`, `planPartRepair`, `resolveReconditionLabor`, `repairJobGate`,
  `machineListing`, `rollMachineListings`, `workbenchPartId`, `minToolTier`.
  (Check the ban regexes do not collide with `requiresToolTier` on diagnostic tests or
  `minReputationTier`; word-boundary the patterns.)
- `schemas.test.ts`: remove the retired anchors and value pins; the 224 additions remain.

### Golden masters and scripts (the honest half of this sprint)

- `advanceDay.test.ts`: the 30-day script's old repair actions are re-authored on the new
  kinds (the "restore body group to fine" beat becomes a chassis `repair-job` rebuild;
  keep the script's narrative shape and comments truthful). Re-derive both hashes from
  real runs, with derivation comments.
- `careerReplay.test.ts` + `smoke.script.json`: `repair` actions become `repair-job` (+
  `place-on-bench` where the part must be loose); the hire-before-gated-removal beat
  stays and must still demonstrably change the day's spend. Re-derive
  `EXPECTED_HASHES_BY_DAY` and the day-7 `cashAtMost` from the run.
- `bands.test.ts` / `jobs.test.ts`: delete the describes of deleted symbols; surviving
  atoms keep their tests. Every OTHER suite must pass; any unexpected failure is
  STOP-and-report (directive 17 case (b) until proven otherwise).
- KNOWN, found in sprint 226 and deliberately left: `jobs.test.ts` (around line 458)
  still reads `economy.machineShopAssist.machinelessLaborMultiplier` while the code under
  test reads `toolHire.slogMultiplier`. It passes only because both are 3, so it goes red
  the moment `machineShopAssist` is deleted here. Re-point it, do not delete it.

## Tasks

1. Sim deletions. 2. Content deletions + staged-work kinds + version bumps. 3. Game
deletions + dev-screen re-base. 4. Guard registrations + schema-test updates. 5. Script
re-authoring + golden re-derivations. 6. Approval-gate re-pin + ledger paragraph.
7. `pnpm typecheck` (mandatory). 8. One full `pnpm test` sweep (this sprint touches
every project; the narrow-first rule is satisfied by the per-area iterations above).

## Checks

Per-area test files while iterating; `pnpm typecheck`; one full `pnpm test` at the end.
The pre-push gate remains the final evidence at commit time (directive 20).

## Exit

(Fill on completion. Tick the arc index's retirement checklist here, item by item.)
