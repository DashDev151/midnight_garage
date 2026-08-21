# Sprint 231: retirement of the band pipeline

**Status:** Complete, ready for review. Not committed.
**Arc:** `repair-refactor-arc.md` sprint 8 of 9. Depends on 230 (the UI no longer touches
the old path).
**Scope:** both packages. Everything transitional dies here; the arc's retirement
checklist is owned by this sprint. This sprint runs `pnpm typecheck` as a task, not a
formality: it retires schema fields and exported symbols (the directive 20 carve-out's
exact case).

## Reuse analysis (directive 16)

New mechanisms: none. This sprint only deletes, re-points scripts, and re-pins, plus one
correctness fix carried over from sprint 230 (decision D-R2 below). The
`retiredIdentifiers` guard is the existing mechanism for keeping the deleted names dead.

## Two decisions taken before this sprint runs

Sprint 230's Exit closed with a readiness inventory and two open questions. Both are
answered here so the sprint is decision-free again.

**D-R1: delete only what is genuinely unreachable; the body pipeline keeps what it still
uses.** Sprint 230 found that a body-shop repair job still creates a `repair-zone` job, so
`repair()`, `repair-zone`, `repairJobGate`, `planGroupRepair` and
`energyPerBandStepByToolTier` are NOT all dead. The arc's rule 9 puts the body panel
pipeline out of scope, and moving body work onto the three-job model is a design question
about what a body-group part's job ladder should be, which this arc does not answer. So:
this sprint deletes every symbol no longer reachable, and NARROWS rather than deletes any
symbol the body pipeline still needs, renaming it if its current name implies a generality
it no longer has. Whatever survives is recorded in `TODO.md` as the body pipeline's
remaining debt, with the follow-up named: move body-group per-part repair onto the job
model, or decide deliberately that stages are its ladder. Nothing is left dead-but-alive
without that entry.

**D-R2: the job card must price what the player KNOWS, not what is true.** Sprint 230
removed `repairRevealFor`, the reveal-then-confirm gate whose job was to stop an on-car
repair charging for a band the player had never been shown. The job card replaced it with
a price computed off the slot's TRUE band, so an unverified slot's real condition is now
inferable from the figure on its card. That is a knowledge leak the old path did not have,
and this refactor is not licensed to weaken the diagnosis system by accident: the whole
point of `knowledge-and-diagnosis.md` is that finding out is a decision the player pays
for. Fix it in this sprint: a card for an UNVERIFIED slot prices off the apparent band the
car already carries (`apparentBandByPartId`), exactly as the rest of the UI treats an
unverified slot, and the true figure appears once the slot is verified by the routes that
already verify it. The felt behaviour: a card never tells you something you have not
found out, and a part you have not looked at properly still quotes you a guess.

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

1. Sim deletions, narrowed per D-R1.
2. Content deletions, staged-work kinds, version bumps.
3. Game deletions and the dev-screen re-base.
4. The D-R2 knowledge fix: the job card prices the apparent band on an unverified slot.
5. Guard registrations and schema-test updates.
6. Script re-authoring and golden re-derivations.
7. Approval-gate re-pin with its ledger paragraph.
8. The small DRY debt sprint 230 recorded: `JobCardPanel.vue` declares its own copy of
   `REPAIR_JOB_LABELS` and of `machineLabelFor`; it imports them from
   `utils/repairJobLabels.ts` instead.
9. `pnpm typecheck` (mandatory: this sprint retires schema fields and exported symbols,
   which is the directive 20 carve-out).
10. One full `pnpm test` sweep (this sprint touches every project; the narrow-first rule
    is satisfied by the per-area iterations above).

## Checks

Per-area test files while iterating; `pnpm typecheck`; one full `pnpm test` at the end.
The pre-push gate remains the final evidence at commit time (directive 20).

## Exit

All ten tasks landed. The bench recondition path is gone in full, the two stranded economy
blocks are gone with it, and the D-R2 knowledge leak is closed. **Decision D-R1 turned out to
spare more than sprint 230 expected**: the body shop's chassis repair keeps eleven sim and
store symbols and two economy keys alive, and one of those keys (`energyPerBandStepByToolTier`)
has a second live reader outside the repair path entirely. Everything that survived is in
`TODO.md` with its follow-up named, and the arc index's retirement checklist is ticked item by
item with each survival's reason on the line.

Both golden masters are GREEN and **no hash was re-derived**, which is the honest result rather
than a lucky one: the deleted mechanism was unreachable, so nothing the scripts do resolves
through different code. `packages/sim/tests/advanceDay.test.ts`,
`packages/sim/tests/careerReplay.test.ts` and `packages/sim/src/careerScripts/smoke.script.json`
are byte-for-byte untouched.

### What was deleted

**The recondition chain, in full.** Nothing could create a `recondition-part` job once
`WorkbenchPanel.vue` was unmounted, so the whole path went together rather than in pieces:

- `packages/sim/src/jobs.ts`: `resolveReconditionLabor`, `reconditionQuote`,
  `reconditionGateReason`, `findLoosePart`, `ReconditionQuote`, `ReconditionGateReason`, and
  the module-private `planReconditionPart`, `reconditionJobIdFor`, `completeReconditionJob`,
  `updateLoosePart`, `ReconditionPlan`. `repairJobIdFor` is the surviving id minter.
- `packages/content/src/job.ts`: `'recondition-part'` off `JobKindSchema`, with its two
  refinements.
- `packages/content/src/gameState.ts`: the `'part-reconditioned'` `DayLogEntry` variant.
- `packages/content/src/cashLedger.ts`: its `cashMovementFor` arm and the doc sentence that
  explained why it carried no amount.
- `packages/content/src/sessionEvent.ts`: the `'reconditionPart'` variant;
  `packages/sim/src/careerReplay.ts`: its replay case.
- `packages/game/src/utils/dayLogFormat.ts`: both branches (`recondition-part` on the
  job-kind line and `part-reconditioned` on its own).
- `packages/game/src/stores/gameStore.ts`: `reconditionPart`, `reconditionQuoteFor`,
  `nextReconditionStep`, `benchWorkRefusal`.

**The workbench panel and its helpers.** `packages/game/src/components/WorkbenchPanel.vue` and
`WorkbenchPanel.test.ts`, plus `packages/game/src/screens/workshopFloor.ts` entire
(`benchIdleReason`, `BenchIdleReason`), which the panel was the only caller of. Deleted rather
than archived: git history is the record for retired source (directive 11).

**Store getters with no caller left.** `repairCeilingCaption`, `benchRepairCeilingCaption`, the
private `repairCeilingSentence` both were built from, `repairMachineNoteFor`,
`nextPartStepRange`, and `repairRevealFor` (D-R2's subject). `removeMachineNoteFor` and
`installMachineNoteFor`, its two siblings on the same pattern, are untouched and still render.

**Two stranded economy blocks.** `economy.machineShopAssist` (whole block) and
`economy.machineListings`, from both `economy.json` and `economy.ts`. Neither had a production
reader: `toolHire` took over the first across sprints 224 and 226, and D-A2 killed what the
second timed.

**One `StagedAction` kind.** `'repair'`, which had zero consumers anywhere.

### What was narrowed, and why

- `planGroupRepair` (`packages/sim/src/bands.ts`) **lost its `repairBandCeilingByTier`
  parameter**. The clamp now lives solely in `repairJobGate`, which already refused an
  above-ceiling target outright; having the plan quietly clamp underneath the caller as well
  was two answers to one question. `clampRepairTarget` survives it, because
  `sensibleRepairTargetBand` (`marketValue.ts`) reads it outside the repair path.
- `JobCardPanel.vue` **stopped declaring its own copies** of `REPAIR_JOB_LABELS` and
  `machineLabelFor` and imports both from `utils/repairJobLabels.ts` (task 8). That required
  exporting `machineLabelFor`, which was module-private.

### What survived D-R1, with the reachability that saved it

Traced rather than assumed. **Exactly one control creates a `repair-zone` job in the shipped
game**: the body shop's part dock, on `chassis` only (`BodyShopScreen.vue`'s `part-repair`
control ->  `gameStore.repair()` -> `resolveJobLabor` -> `findOrCreateJob` -> `repairJobGate`).
It is chassis-only because `planGroupRepair` skips every `removable` slot and the other two
fixed carriers derive their band from zone state and early-return. Every other creator is
unreachable: `advanceDay`'s `createJobs` is bots-only (directive 21), `careerReplay` is
replay-only, and `economyBenchActions` is behind the `import.meta.env.DEV` route gate.

Surviving on that path: `gameStore.repair()`, the `repair-zone` job kind, `repairJobGate`,
`jobMachineGroup`, `planGroupRepair`, `planPartRepair`, `energyToClimb`, `repairCeilingForLevel`,
`clampRepairTarget`, `repairStepFor`/`nextRepairStep`, `repairStepText`, and the economy keys
`repairBandCeilingByTier` and `energy.energyPerBandStepByToolTier`.

Surviving for reasons **outside** the body path, which is the part sprint 230's inventory
missed:

- **`energy.energyPerBandStepByToolTier` is also read by `toolShopInfo` and `toolTierInfo`**,
  which build the Upgrades screen's `laborSlotsPerGradeText`. That is player-facing tool-line
  copy, not a repair surface. This is why the checklist's "`energyToClimb`'s tier parameter"
  item could not be actioned either.
- **`machineGateGroupFor` and `machineLaborMultiplier` are called by this arc's OWN new
  engine**: `removalEnergyPointsFor` (`repairJobs.ts`) sizes remove-and-refit energy through
  both. They are additionally read by the body pipeline's weld rate (`pipelineActions.ts`),
  `assemblyMachineGateGroup`, and the tyre bench-fit note. The taxonomy's `machineGate` field
  and `MachineGateOperationSchema` survive with them.
- **`clampRepairTarget`** via `marketValue.ts`, as above.
- **`taskLaborChain.ts` is not orphaned** and the file stays: `diagnosis.ts` and
  `serviceJobs.ts` both read it, and its private `jobStepPoints` is used twice inside it.

### The D-R2 knowledge fix

**`repairJobCards` now quotes what the player knows.** `quotedSubjectFor`
(`packages/sim/src/repairJobs.ts`) returns the subject unchanged for a loose target, a car
with no `verifiedSlots`, or a verified slot; otherwise it substitutes the band AND the part
identity from `knowledgeViewOf(car, model, context).parts[partId].installed`. Only `partsYen`
reads it. `offered`, `refusal`, `route`, `hireFeeYen`, `steps`, `energyPoints` and
`removalEnergyPoints` all still read the real subject, and `resolveRepairStep` charges the real
subject, so verification is not weakened anywhere.

**Felt behaviour:** a card never tells you something you have not found out. A part you have not
looked at properly quotes you a guess, and the guess is the same one the band chip on that slot
is already showing you.

**Correction to D-R2's own wording, made deliberately.** The decision names
`apparentBandByPartId` as the source. That is the wrong map: it is the room's pre-damage record
(`apparentViewOf`, `diagnosis.ts`), it is `null` on every car with no symptoms, and it only
holds slots a symptom cause touched. Pricing off it would have left the leak wide open on every
honest car and on every unverified slot no cause touches. The player-side apparent band for an
unverified slot is `priorBand` via `knowledgeViewOf`, which is what the UI already renders, and
that is what shipped. `isSlotVerified` is reused as the single predicate rather than a second
one being invented.

**Energy needed no masking, and that was proven rather than assumed.** `energyPlanFor` reads
recipe step count, `energyPerStepPoints`, `slogMultiplier`, `depthClass`, crew and lift; none
reads a band. `removalEnergyPointsFor`'s only band-sensitive branch compares a `vacatedBaseline`,
which can never coexist with an installed part and is only ever stamped by a removal, which
verifies the slot. Test 3 below pins it.

**Three tests added** to `packages/sim/tests/repairJobCards.test.ts`, on an `intake` fixture
(true band `poor`, guess `fine`, stock SKU installed so identity masking is a provable no-op and
only the band moves): the quote masks on all three job kinds; the charge is the TRUE bill and
completion verifies the slot; and two cars differing only in true band produce identical energy
and step lists.

**Two consequences this fix creates, both recorded in `TODO.md` rather than papered over**:
`cardRefusalFor` still reads the true band for its `at-or-above-target` test, so the OFFER matrix
still discloses the band bracket; and `repairStepRefusalText` prints the quote, so "The parts
bill wants ¥0 you don't have." is reachable. The candidate that answers both at once (verify in
the same call that takes the money) is named there and was not taken, because it changes what the
player learns and when.

### Guard registrations

18 entries in `packages/content/tests/retiredIdentifiers.test.ts`, all `retiredInSprint: 231`,
each verified CLEAN against the file's own scan before registering:

`machineShopAssist`, `machinelessLaborMultiplier`, `probeAmortisationOps`, `machineListings`,
`resolveReconditionLabor`, `reconditionQuote`, `reconditionGateReason`, `findLoosePart`,
`reconditionPart`, `reconditionQuoteFor`, `nextReconditionStep`, `benchWorkRefusal`,
`benchIdleReason`, `repairCeilingCaption`, `benchRepairCeilingCaption`, `repairMachineNoteFor`,
`nextPartStepRange`, `repairRevealFor`.

Module-private helpers that died with them are named inside the owning entry's reason rather than
given entries of their own (`planReconditionPart`, `reconditionJobIdFor`, `completeReconditionJob`,
`updateLoosePart`, `ReconditionPlan`, `repairCeilingSentence`): they were never importable, so
typecheck already prevents their revival. Word-boundary collisions were checked and are clear:
`\breconditionQuote\b` does not match `reconditionQuoteFor`, `\brepairCeilingCaption\b` does not
match `benchRepairCeilingCaption`, `\bmachineListings\b` does not match `machineListing`, and
`requiresToolTier`/`minReputationTier` are untouched.

**Ten names on the doc's list were NOT registered**, and the reasons split two ways. Nine survive
(`machineGate`, `repairBandCeilingByTier`, `energyPerBandStepByToolTier`, `machineLaborMultiplier`,
`machineGateGroupFor`, `repairCeilingForLevel`, `planGroupRepair`, `planPartRepair`,
`repairJobGate`, `workbenchPartId`) and banning a live name would fail on live code. Four more are
genuinely dead but blocked by a truthful record: `minToolTier`, `machineListing`,
`rollMachineListings` and `recondition-part` are each named in `saveCodec.ts`'s per-version log,
in a sentence describing what a specific `SAVE_VERSION` bump did. The guard scans comments, so
registering them means rewording those sentences into falsehoods or deleting the version log
outright. Left unregistered and put to the maintainer in `TODO.md`.

`packages/content/tests/schemas.test.ts` lost `'machineListings'` and `'machineShopAssist'` from
`expectedTopLevelKeys`. `'repairBandCeilingByTier'` stays. No value pin was removed: the
`energyPerBandStepByToolTier` pin (`{1:4, 2:3, 3:2}`) is still live, as are the 224-era `toolHire`
pins.

### Gate re-pin

One hash moves. Each is `sha256(JSON.stringify(import))`, computed the way the test computes them:

| File | Hash | Moved |
| --- | --- | --- |
| `economy.json` | `5ccaccabab5137b44d973ef0e1adeb6def101ef35c7c930cca5e5d4690077a98` | yes |
| `damagePatterns.json` | `6a3936623b3a0be38270b85d71f2e25e976f5eba58b4caf5773526ae221f6cca` | no |
| `partPricing.json` | `27b1b29d6273e8ff07d3986559890bf851bbf5afbc5e3cf44bf3ea598472f675` | no |
| `toolLines.json` | `55b4e5310653268c690b4c4c3f99589d36c21a3b95fee3dd8314a70763362861` | no |
| `toolShops.json` | `614b847052a6c9c136ef3988505c5ce0c5519a3fa07dbd96f237355a7e2de4e4` | no |
| `workbench.json` | `a96b72c33da9dfe6c108f21a8e7c3465f67dce1ab8f4e810979c02724f4027cd` | no |

**`economy.json`'s diff is deletions only.** Two whole keys leave and not one surviving number
moves, which is the whole content of the appended ledger paragraph: this is a RETIREMENT, not a
lever movement. The mission payout and budget cap pin is unchanged.

The ledger paragraph appended to `economyApprovalGate.test.ts`'s header, verbatim:

```text
Re-pinned 2026-08-21 for sprint231.md, and this one is a RETIREMENT rather than a lever
movement. Two whole keys leave `economy.json` and NO SURVIVING VALUE MOVES: every number
still in the file is byte for byte what it was before this sprint, the diff is deletions
only, and no mission payout or budget cap moves. `damagePatterns.json`, `partPricing.json`,
`toolLines.json`, `toolShops.json` and `workbench.json` are untouched, so their five hashes
hold unchanged.

`economy.machineListings` (`minGapDays` 4, `maxGapDays` 8, `windowDays` 3) is DELETED with
nowhere to go, and that is the point. It timed a classifieds window that decided WHEN a tool
line could be bought at all, and decision D-A2 (docs/sprints/repair-refactor-arc.md) killed
that gate outright: tool lines, shops and garage equipment are buyable whenever reputation
and cash allow. There is no replacement key because there is no longer a gate to time.

`economy.machineShopAssist` (the whole block) is DELETED because `economy.toolHire` took over
every one of its jobs across sprints 224 and 226, and it has had no production reader since.
Member by member: `feeYenByGroup` lives on as `toolHire.feeYenByGroup`, the per-operation
assist fee having become a per-line DAY hire under D-I1, with those six figures re-derived
and stated by behaviour in the 2026-08-20 sprint224 paragraph above; nothing about them moves
here. `machinelessLaborMultiplier` 3 lives on as `toolHire.slogMultiplier` 3, the identical
value under the name the slog route reads. `probeAmortisationOps` 40 lives on as
`toolHire.amortisationDays` 40, the same forty, re-expressed from operations to days and
promoted from a bound a probe checked to the divisor the six hire fees are DERIVED from
(`storyMissionProbes.test.ts`, "hiring 40x must not exceed buying the machine").

This supersedes one parenthetical in the 2026-08-20 sprint224 paragraph above: "`economy.
toolHire` (NEW block, additive: `machineShopAssist` is untouched this sprint and still drives
the live hire path)". That was true when it was written. Sprint 226 moved the live hire path
onto `toolHire`, and this sprint removes the block it left stranded.

Two repair keys the arc's retirement checklist listed for deletion SURVIVE this sprint,
unmoved and still read, under decision D-R1 (delete only what is genuinely unreachable):
`repairBandCeilingByTier` and `energy.energyPerBandStepByToolTier`. The body carrier's stage
repair still runs the old banded path, which arc rule 9 puts out of scope, and
`energyPerBandStepByToolTier` additionally feeds the Upgrades screen's tool-line copy, which
is not a repair surface at all. Both are recorded as open debt in `TODO.md`.
```

### Golden masters: nothing re-derived, and why that is correct

| Golden | Value | Location | Moved |
| --- | --- | --- | --- |
| 30-day career hash | `74a9b160` | `advanceDay.test.ts:463` | no |
| acquisition-to-sale hash | `ee53b632` | `advanceDay.test.ts:872` | no |
| `EXPECTED_HASHES_BY_DAY` | ten hashes, `a571205c` to `bebb9bf9` | `careerReplay.test.ts:237-248` | no |
| day-7 `cashAtMost` | `208515` | `smoke.script.json:35` | no |

**Task 6's script re-authoring had nothing to re-author, and this was established rather than
assumed.** `packages/sim/src/careerScripts/` holds one file, `smoke.script.json`, whose five
day-1 events are `buyout`, `checkoutCart`, `sellPart`, `rejectServiceJobOffer` and
`acknowledgeTutorialStep`; days 2 to 10 are empty. `careerReplay.test.ts`'s `engineRemovalScript`
fires `buyout`, `hireMachineLine`, three `removePart`s and a `removeAssembly`. **No retired kind
appears in either.** `advanceDay.test.ts` does carry a repair beat, `createJobs` with
`kind: 'repair-zone'` - but `repair-zone` SURVIVES under D-R1, so re-authoring it would have
deleted the only golden coverage of the surviving body-carrier path and bought nothing. The
sprint doc's task 6 wording is dead against its own D-R1 and was not followed.

### Save version

`SAVE_VERSION` 78 -> 79, Dexie 5 -> 6, no migration (directive 19). The bump is genuinely
required rather than ceremonial: `'recondition-part'` and `'part-reconditioned'` are members of
discriminated unions inside persisted state (`state.jobs`, `lastDayReport.entries`), so unlike
v78's plain key drops a pre-v79 save carrying either would FAIL `GameStateSchema.parse` rather
than be stripped. The version bump makes an old save reject cleanly at the envelope instead of
exploding inside the parse. Four `SAVE_VERSION` assertions in `saveCodec.test.ts` moved to 79:
directive 17 case (a), a test asserting a value the change intentionally moved.

### Evidence

`pnpm typecheck` (task 9, mandatory under the directive 20 carve-out, which this sprint is the
exact case for):

```text
$ pnpm -r --if-present typecheck
Scope: 3 of 4 workspace projects
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

It earned its place immediately. The first run failed with
`src/utils/dayLogFormat.ts(173,4): error TS2366: Function lacks ending return statement` - the
game half of the `part-reconditioned` retirement had landed while the content half had not, so
the deliberately-exhaustive switch no longer covered a variant the schema still declared. No
narrow per-file test run would have caught it; that is the carve-out working exactly as written.

The full `pnpm test` sweep (task 10):

```text
$ vitest run

 RUN  v4.1.10 C:/Users/daanj/midnight_garage

 Test Files  243 passed (243)
      Tests  5060 passed | 1 skipped (5061)
   Start at  08:47:17
   Duration  316.64s
```

Two narrow runs after doc-comment and version edits that landed post-sweep:
`pnpm test --project content` (32 files, 667 tests, all passing - the comment-hygiene, spelling
and em-dash guards scan `stagedWork.ts`'s doc block) and
`pnpm test packages/game/src/save/saveCodec.test.ts` (1 file, 77 tests, all passing).

One Prettier fix: `gameStore.garage.test.ts` was left unformatted by the deletion pass and would
have failed the hook's `format` stage. `npx prettier --write` on that one file, then the file
re-run (10 tests, passing).

The pre-push hook remains the full gate (directive 20) and was not pre-empted.

**No test was loosened, edited to pass, or deleted to make a red run green.** The only test
expectation that moved for a reason other than a symbol disappearing is the `SAVE_VERSION`
quartet above, and three `machineShopAssist` re-points forced by the block's deletion
(`jobs.test.ts`, `pipelineActions.test.ts`, and two assertions in `tutorialProbe.test.ts`) whose
asserted numbers move because the `toolHire` values differ from the retired ones for five of six
groups. That is a test expectation following a retired key to its replacement, not an economy
lever moving: no surviving number changed.

### Deviations from the doc, with reasons

1. **`repairCeilingForLevel`, `clampRepairTarget`, `repairBandCeilingByTier` and
   `energyPerBandStepByToolTier` were on the locked deletion list and all four survive.** D-R1
   spares whatever the body pipeline still reaches, and all four are on the chassis path; the
   last also feeds the Upgrades screen. Sprint 230's readiness inventory named `repair()`,
   `repair-zone`, `repairJobGate`, `planGroupRepair` and `energyPerBandStepByToolTier` but
   missed these; the deletion list was written from that inventory.
2. **`machineGate`, `MachineGateOperationSchema`, `machineGateGroupFor` and
   `machineLaborMultiplier` were listed for deletion AND for guard registration, and all four
   survive.** This is a plan defect rather than a judgement call: the arc's own new engine
   (`removalEnergyPointsFor`, `repairJobs.ts`) calls the last two on every job card. Neither the
   deletion nor the registration was possible. `parts-taxonomy.json` is therefore untouched.
3. **`workbenchPartId` was not removed** and the `WorkStation` type still admits `'workbench'`.
   The station is unreachable (nothing passes `'workbench'` any more) but the field is still
   written by `withStation` and read defensively by `resolvePlaceOnBench`, and removing it forces
   five sim helpers, a game util, a test file and a save bump of its own. Recorded in `TODO.md`
   as the one unfinished item on the arc's retirement checklist. **`WorkStationTray.vue` also
   survives**: the machine shop mounts it and nothing in it was workbench-specific, so the doc's
   "delete the workbench station wiring" was a no-op inside that component.
4. **`sessionEvent.ts` does not contain `part-reconditioned`.** The doc files it there; it is a
   `DayLogEntrySchema` variant in `gameState.ts`. `sessionEvent.ts` holds `'repair'` (survives,
   with `gameStore.repair()`) and `'reconditionPart'` (deleted). Both were actioned correctly
   against the real locations.
5. **The three new headless kinds were added to `stagedWork.ts` as the doc says, but nothing
   consumes them**, and the doc's premise that they are "resolved in `advanceDay`'s queued loop"
   describes a loop that does not exist: `advanceDay` has no `StagedAction` loop and `GameState`
   has no `stagedActions` field. The schema doc comment was written to say so plainly rather than
   assert a wiring that is not there, and the wiring is in `TODO.md`. Nothing is blocked by the
   gap, because no shipped career script contains a repair beat.
6. **`economyBenchActions.ts` was not re-based.** The doc asks for its per-band energy read to
   become `energyPerStepPoints`; that was contingent on `energyPerBandStepByToolTier` being
   deleted, and it survives. The dev screen still reads a live key, so the re-base would have been
   churn.
7. **`taskLaborChain.ts` was not deleted.** The doc says "delete the file if 227 left it
   orphaned"; it did not. `diagnosis.ts` and `serviceJobs.ts` both read it and no export in it is
   orphaned.
8. **Task 6 (script re-authoring and golden re-derivation) resolved to nothing to do**, evidenced
   in the golden-masters section above. The hashes are unchanged because no reachable sim path
   changed.
9. **`repairRevealFor` is registered in the guard rather than treated as a plain deletion.** It
   was deleted in sprint 230, but the protection it provided was not replaced until this sprint,
   so its ledger entry records the replacement (D-R2) rather than "nothing replaced it".
10. **Two narrowings D-R1 permits were not taken**: `gameStore.repair()` keeps its group-shaped
    signature and name though its one caller always passes `('body', ..., 'chassis')`, and
    `repairJobGate`/`jobMachineGroup` still branch over a whole group. Renaming them is only
    honest once the body fork below is decided, since the fork may delete them outright; both are
    named in the `TODO.md` entry.

### Retirement checklist (arc index), ticked

Recorded in full on `repair-refactor-arc.md` with each survival's reason on its line. Summary:
five items retired (`machineShopAssist` + `machineAssistFeeYen`; `machinelessLaborMultiplier`;
the `machineListing` trio; `minToolTier`; the recondition half of the store-actions item), four
carry survivals (`machineGate`; the `repairBandCeilingByTier` trio; `energyPerBandStepByToolTier`;
`workbenchPartId`/`WorkStationTray.vue`).

### What is left open

Six entries added to `TODO.md`, one removed:

- the body carrier's surviving band pipeline and the fork that closes it (D-R1's debt);
- `workbenchPartId` and the two-station `WorkStation` type;
- the three unconsumed `StagedAction` kinds;
- the D-R2 residuals (the offer-matrix leak and the ¥0 refusal line), with the candidate fix;
- the four names the guard cannot take while `saveCodec.ts` keeps its version log;
- `tools/lever-census/` gone stale against the two retired keys (ungated, so nothing went red).

Removed: the `chassis` component-group entry. Its taxonomy premise is stale (`chassis` sits in
`body`, which is what the entry proposed) and the repair-ceiling caption that surfaced it retired
here, taking the bench-recondition half of the entry with it.

Two adjacent entries were corrected rather than removed: the race-parts-shop entry and the
tool-purchase-reputation entry both cited the classifieds listing window as a live mechanism to
reuse, and it is gone.
