# Sprint 202: the work is direct, the paint survives, the money is visible

**Status: APPROVED, implementing.** Scope set by the maintainer's rulings of 2026-08-13
after the first open-play session (findings and traces:
`docs/playtest-notes/playtest-notes-2026-08-13-open-play.md`), extended same day with the
approved tool-hire conversion (task E) and the behaviour-first governance amendment now
recorded in CLAUDE.md directive 22.

**Levers (directive 22, as amended 2026-08-13):** task E moves values under the
behaviour-first model: the felt behaviour is stated in task E, the values are chosen
there, and the guard test re-pins with that statement recorded. No raw number goes to the
maintainer; validation is by playtest. Two save-schema changes ride along (a new optional
field on `PartInstance`; deletion of `stagedCarWork`), each a Dexie version bump and
nothing else per directive 19.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- Direct-execution resolvers already exist for nearly everything staging wraps:
  `gameStore.repair` / `install` (used today by "Continue"), `removeAssembly` /
  `refitAssembly`, bench recondition, machining. Only the four panel-pipeline resolvers
  (`resolvePipelineStageAction` / `Paint` / `RemovePanel` / `InstallPanel`) are private to
  `stagedWork.ts` and need lifting to exported resolvers. No new labour or job mechanics:
  `resolveJobLabor` arithmetic is identical per-click (verified: no batching effects
  exist).
- The refusal-on-the-button pattern: `removeBlockReason` rendered as "Take off X, Y
  first" on the Remove button. Installs get the same pattern from the same data
  (`occupiedBlockers` over `blockedBy`).
- The slot-naming precedent for requirement failures: `noLapTimeReason` already resolves
  display names in `requirements.ts`.
- `cashMovementFor` (`cashLedger.ts`), the single cash-classification law, drives the new
  daily ledger; no third mapping (the Sprint 198 rule).
- The `sessionEvents` Dexie table and export flow carry the ledger stream; `zoneSeverity`
  utils and the existing zone data feed the visibility panel.

**Genuinely new:** the captured-paint-state field on a removed panel instance (the state
does not exist anywhere today; verified), the per-day ledger stream, and new session
event types for repair/install/pipeline ops (they are unlogged today).

## Tasks

### A. Panel finish preservation (the bug; maintainer ruling: refit unchanged = keep paint)

- A1. On `pipeline-remove-panel`, capture the zone's paint state onto the harvested
  `PartInstance` as a new optional field (finish, colour, surface, primed). Today only a
  metal-derived band survives and everything else is lost (`stagedWork.ts:424-472`).
- A2. On panel install, when the incoming instance carries captured state, restore it to
  the zone instead of the bare-metal literal (`planInstallPanel`,
  `bodyPipeline.ts:1063-1079`); restoring colour re-arms the colour-mismatch check that
  the current undefined-colour drop silently bypasses. Instances without the field
  (bought new, or post-repair) stay bare exactly as today: new and repaired panels need
  paint, refitted unchanged ones do not.
- A3. Dexie bump for the schema field. Test updates, directive 17 case (a), verified
  list: `bodyCarrierIdentity.test.ts:252-269` (pins bare-on-refit),
  `CarDetailScreen.test.ts:1049-1081` (pins the exact reported symptom as expected),
  `stagedWork.test.ts` remove/install cases, `zoneSeverity.test.ts` if counts shift.

### B. Staging dies; every action is direct (maintainer ruling)

- B1. Lift the four pipeline resolvers out of `stagedWork.ts` into exported immediate
  resolvers; wire panel remove/install/stage/paint buttons to them directly.
- B2. Wire install and repair buttons to the existing immediate resolvers. The button
  carries the inline gate: order-blocked installs show "Take off X, Y first" (install
  counterpart of the removal pattern, same `blockedBy` data); insufficient labour and
  machine-line reasons render on the same affordance. Each action button shows its
  labour and yen cost before the click (several already do).
- B3. Delete the staging machinery: `stagedCarWork` from `GameState` (Dexie bump),
  `stageAction`/`unstageAction`/`unstageAssemblyAction`/`unstagePipelineAction`/
  `confirmCarWork` and their read-side helpers from the store, `confirmStagedWork` and
  `clearStagedWork` call sites in sim (missions, commissions, selling, service jobs)
  reduce to no-ops and are removed, the staged panel/Confirm UI and the end-day
  unconfirmed-work warning from `CarDetailScreen`/`EndDayButton`, `ReplaceDrawer`'s
  staged install becomes direct.
- B4. New session-log event types for the newly direct actions (repair, install, the four
  pipeline ops); today these are unlogged. The 198 converter treats the old
  `stageAction`/`confirmCarWork` vocabulary as historical (the two archived 2026-08-13
  logs keep it; the converter maps what it can and marks the rest).
- B5. Test surface, directive 17 case (a) throughout: `stagedWork.test.ts` (respec to the
  direct resolvers), `gameStore.stagedWork.test.ts`, `CarDetailScreen.test.ts` staging
  cases, `EndDayButton.test.ts` warning cases, `saveCodec.test.ts` `stagedCarWork`
  branches (deleted per directive 19), `sessionLog.test.ts` event vocabulary, plus the
  one-ref incidental setups listed in the blast-radius trace.

### C. The money becomes visible (maintainer ruling: full daily ledger in the logs)

- C1. A game-side ledger stream: every cash movement (from the day's log entries,
  classified by `cashMovementFor`) appended per day to a persisted `ledgerEvents` table
  beside `sessionEvents`, including machine hire (today the only unlogged cash flow of
  its size).
- C2. The session export becomes a bundle: actions stream + daily ledger (in and out, by
  category, per day) + career identifier + export day.
- C3. Payload enrichment (absorbs integration-board task 198.8): `acceptOffer` carries
  the price, `completeServiceJob` the payout, `checkoutCart` the contents and total.
- C4. Reconciliation check in tests: the ledger stream's weekly rollup equals the
  existing `financeLedger` week to the yen.

### D. Hygiene from the session findings

- D1. `newGame()` clears `sessionEvents` and `ledgerEvents` (the table currently
  accumulates across careers forever; `clearSessionEvents` has zero call sites).
- D2. Mission requirement refusals name the failing slots: `evaluateRoadworthy` returns
  the failing part ids, the requirement line renders display names ("paint below worn")
  instead of "1 slot below worn".
- D3. Zone condition visibility: a readable per-zone panel on the car screen showing each
  zone's metal, finish and colour state plainly (the absence of this is why nine panels
  were pulled to inspect them, which is what exposed the paint bug).

### E. Machine gates become a currency conversion (maintainer ruling: charge labour, not yen)

The maintainer's framing, recorded verbatim in substance: this is a currency conversion
problem; stop charging yen and charge labour instead. The bench precedent
(`jobs.ts:1503-1507`, "possible at every tier, just slower") becomes the law for ALL
machine-gated work.

- E1. `hasMachineLineFor` stops being a refusal and becomes a rate selector: any
  machine-gated operation (install/remove/repair on gated slots, panel installs, chassis
  and zone repairs, tyre bench-fit) is always possible; without the machine (neither
  owned tier 2+ nor hired today) its labour cost is multiplied. Hire fees
  (`feeYenByGroup`) and tier-2 purchases are untouched: hire becomes the cash price for
  skipping the labour premium, which is the cash-versus-labour choice the maintainer
  wants (currently weak; see the TODO note below).
- E2. **The value, chosen under behaviour-first governance: one new content key,
  `machineShopAssist.machinelessLaborMultiplier = 3`.** What it means: working a gated
  slot by hand takes three times the labour. What the player should feel, measured over
  the 2026-08-13 session's own work pattern: the teardown by hand fits inside one
  80-point day (56 points); the FULL strip-and-rebuild entirely by hand spreads over
  three to four working days (281 points) instead of costing ¥109,000 of hire; and
  hiring the machines buys back about two thirds of the labour (down to 94 points),
  which is worth yen precisely once the shop has more work than hours. Pinned by
  `machineGateConversion.test.ts`; the `economyApprovalGate` re-pins in this change with
  this paragraph recorded in its header.
- E3. The old hard-refusal copy ("needs the machine line") becomes cost disclosure on the
  button: both prices visible where they apply (the labour figure, and the hire line
  under it when hire would cheapen it).
- E4. Tests: the gated-op refusal tests respec to the multiplier (directive 17 case (a));
  a new probe asserts the conversion behaviour: every gated operation is executable at
  tier 1 with zero machine spend, and the machine-less labour total for a full entry-tier
  rebuild stays within two day-pools.
- E5. TODO.md gains the maintainer's deferred note (no sprint attached): labour needs to
  become more valuable; today surplus labour makes "one more End Day click" the answer to
  everything, so the cash-versus-labour choice E1 creates has no teeth yet. Give the
  player reasons to prefer spending cash.

### User-only

- U1. Play on the built result. The measure of B: the brakes-and-diff trap cannot recur,
  because the button says what is in the way before the click. The measure of E: day 1 to
  first sale with zero yen spent on machines, paced by labour.

## Definition of done

- A refitted unchanged panel keeps its paint; bought and repaired panels need paint; the
  colour-mismatch check fires on refitted colours again.
- No staging state, actions, or UI exist; every work action executes on click with its
  cost and any refusal reason on the button; the bot `createJobs` path is untouched.
- The session export bundles actions and a per-day categorised ledger that reconciles to
  the weekly sheet to the yen; hire appears in it; a new career starts with empty logs.
- Mission refusals name slots; zone condition is readable on the car screen.
- Every machine-gated operation runs at tier 1 with zero machine spend at the stated
  labour premium; hire still works and still charges its day fee; the guard test is
  re-pinned with the behaviour statement recorded.
- `pnpm typecheck` before reporting (directive 20 carve-out: schema fields and exported
  symbols retired); narrowest relevant tests updated and green; pre-push gate is the full
  evidence.

## Exit

**Status: complete.** Tasks A, C, D1, D2 and E landed earlier in the sprint; this pass
implemented B (staging removed, every action direct) and D3 (the per-zone body condition
panel), and left the whole tree green.

**B - staging removed:**

- `packages/sim/src/pipelineActions.ts` (new): the four pipeline resolvers
  (`resolvePipelineStageAction`/`resolvePipelinePaintAction`/`resolvePipelineRemovePanelAction`/
  `resolvePipelineInstallPanelAction`) plus `chargeAndApplyPipelineEffect`/`bodyLineCapability`,
  lifted out of `stagedWork.ts` unchanged in behaviour - each already took a labour budget and
  resolved a single op, so lifting was a house move, not a rewrite. `isFreeInstallRefit` moved to
  `jobs.ts` (it was never pipeline-specific). `stagedWork.ts` (sim) deleted outright:
  `confirmStagedWork`/`previewPlannedWork`/`clearStagedWork` had no direct-action analogue and
  were removed with the `stagedCarWork` field; their five call sites (missions, sceneCommissions,
  selling x2, serviceJobs) reduce to their surrounding call.
- `packages/content/src/gameState.ts`: `stagedCarWork` field deleted. `SAVE_VERSION` 68 -> 69,
  directive-19 plain bump, no migration.
- `packages/game/src/stores/gameStore.ts`: `stageAction`/`unstageAction`/`unstageAssemblyAction`/
  `unstagePipelineAction`/`confirmCarWork`/`isPartStagedAnywhere`/`stagedActionsFor`/
  `stagedActionGateReasonFor`/`stagedWorkGated`/`plannedEstimateFor`/`plannedStepFor`/
  `plannedActionAttribution`/`carsWithUnconfirmedWork` deleted, along with `CarDetail.stagedActions`
  and `.plannedEstimate`. New direct actions: `pipelineStage`/`paintZone`/`removePanel`/
  `installPanel`, each resolving instantly and logging its own session event; `repair`/`install`
  (already instant resolvers pre-sprint) now also log. `stageableParts` renamed `pickableParts`
  (every owned part, nothing reserved). Machine-gate previews converted from hard refusal to
  cost disclosure: `installGateReasonFor`/`repairGateReasonFor`/`benchSwapGateReasonFor` renamed
  `installMachineNoteFor`/`repairMachineNoteFor`/`benchSwapMachineNoteFor` (return `''` instead of
  `null`, never block); new `removeMachineNoteFor`; `removeBlockedReason`'s dead `'machine-line'`
  case dropped (the sim's `RemoveBlockReason` union no longer carries it); `AssemblyRowView` gained
  `machineNote`, `BenchMemberView.swapGateReason` is now always a string. New
  `MachineLaborDisclosure` type and `machineLaborDisclosureText` formatter.
- UI: `CarDetailScreen.vue` - staged panel/Confirm button/per-part "planned" chips and clear-plan
  buttons deleted; every repair/install/pipeline button now calls its direct store action and
  shows the machine-labour note inline. `ReplaceDrawer.vue`, `PartsInventoryPanel.vue` - direct
  install, `pickableParts`. `WorkshopViews.vue` - the "planned" region highlight and its `PLANNED_LABEL`
  removed (nothing is ever planned-but-not-yet-real any more). `EndDayButton.vue` - the
  unconfirmed-work warning removed. `economyBenchActions.ts` - `stageAndConfirm` replaced by direct
  `fitPart`/`repairGroup` resolver calls. `utils/partAddress.ts` trimmed to `WorkAddress`/
  `addressesOverlap` (the staged-action collision helpers had no direct-action use).

**New session event types** (`logSessionEvent`, all via the existing `pushDayLog` funnel):

- `repair` - `{ carId, componentId, targetBand, carPartId?, costYen?, laborSlotsUsed }`
- `install` - `{ carId, componentId, partInstanceId, carPartId?, laborSlotsUsed }`
- `pipelineStage` - `{ carId, zoneId, stage, laborSlotsUsed }`
- `pipelinePaint` - `{ carId, zoneId, colour, grade, laborSlotsUsed }`
- `removePanel` - `{ carId, zoneId, laborSlotsUsed }`
- `installPanel` - `{ carId, zoneId, partInstanceId, laborSlotsUsed }`

**Machine-less cost disclosure copy** (verbatim, `machineLaborDisclosureText`):
`"{handLaborSlots} labour by hand · {machineLaborSlots} with the {line} line, {feeYen} today"` -
e.g. `"18 labour by hand · 6 with the Engine crane & stand line, ¥15,000 today"`. Empty string
(nothing rendered) once the group is owned or hired today.

**D3 - zone condition panel:** `utils/zoneSeverity.ts` gained `metalConditionText`/
`surfaceConditionText`/`finishConditionText`/`paintStateText`, plain-word ladders distinct from
part condition bands (poor/worn/fine/mint mean something else on a zone) and from the raw 0-4/0-2/
0-3 severities. `paintStateText` is the one that would have caught the original refit-paint bug at
a glance: panel-off, a named colour, "primed, no colour yet", or "bare metal, unpainted" are four
different sentences, never a number. `CarDetailScreen.vue` gained an always-visible
`zone-condition-panel` section, all nine zones at once, so reading a car's paint no longer means
opening each zone.

**Directive 17 case (a) throughout** - every respec'd test asserted staging/hard-refusal machinery
that was intentionally retired, not a regression:

- `packages/sim/tests/pipelineActions.test.ts` (new, replaces deleted `stagedWork.test.ts`): 12
  passed - panel round-trip (paint preservation on unchanged refit, bare on bought/repaired) and
  the tool-tier gate kept, `confirmStagedWork`/`previewPlannedWork` describe blocks dropped (no
  direct-action analogue).
- `packages/sim/tests/consumables.test.ts`: 16 passed - the four `confirmStagedWork`-driven cases
  respec'd to sequential direct resolver calls.
- `packages/sim/tests/machineGateConversion.test.ts` (landed with task E): 3 passed, unchanged.
- ~20 other sim test files: one dead `stagedCarWork: {}` fixture line each, removed; `selling.test.ts`
  and `serviceJobs.test.ts` additionally lost their "drops staged work on exit" cases (nothing to
  drop any more).
- `packages/sim/tests/advanceDay.test.ts`: 15 passed - both golden-master hashes re-pinned
  (`stagedCarWork` leaving `GameState`'s shape moves the hash; no roll, cash figure or derived stat
  moved).
- `packages/game/src/stores/gameStore.directWork.test.ts` (new, replaces deleted
  `gameStore.stagedWork.test.ts`): 6 passed - direct repair/install, machine-gated install
  completing without refusal, disclosure text, remove note.
- `packages/game/src/stores/gameStore.sessionLog.test.ts`: 5 passed - `stageAction` event case
  replaced by `repair`/`install`/`pipelineStage`/`removePanel` event cases.
- `packages/game/src/stores/gameStore.jobs.test.ts`: staging/in-transit case rewritten to the
  direct-click equivalent (a repair click on an in-transit car applies no labour rather than being
  refused at the staging step).
- `packages/game/src/screens/CarDetailScreen.test.ts`: 103 passed - staged-panel, planned-band-chip
  and staged-machine-line-gate cases deleted or rewritten to direct clicks; new machine-labour
  disclosure and D3 zone-condition-panel describe blocks added.
- `packages/game/src/components/EndDayButton.test.ts`, `ReplaceDrawer.test.ts`,
  `packages/game/src/screens/PartsInventoryScreen.test.ts`, `packages/game/src/utils/partAddress.test.ts`:
  staged-work warning/assertions removed or rewritten to direct actions.
- `packages/game/src/save/saveCodec.test.ts`, `packages/content/tests/gameState.test.ts`:
  `stagedCarWork` round-trip assertions removed; a v68->v69 bump test added.
- `packages/game/src/utils/zoneSeverity.test.ts`: 10 passed (5 new) - the four D3 plain-word
  functions, including the refit-bare-vs-refit-unchanged distinction directly.

**Per-project totals (final run, `pnpm test --project <name>`):** content 626/626 (30 files); sim
2790/2792 at the implementing pass, then 2792/2792: the 2 `tests/bots/runCareer.test.ts` failures
were NOT pre-existing as first reported. They were a real consequence of task E, caught on review:
the machine-line gate used to wedge every bot service job carrying a gated task, and both tests
pinned that wedge ("paid stays 0", "the faucet never fires"). With the gate now a labour rate the
bots complete hand work and payouts land (26 paying careers in the grinder sample; the faucet fires
on 3 competent-policy seeds). Both pins updated to the newly measured values as directive 17 case
(a); the bots remain condemned as instruments (directive 21) and these tests remain no-throw and
behavioural pins only. Game 1065/1065 (81 files). `pnpm typecheck` clean across content, sim and
game.

**Decisions made that are worth a second look:**

- `removeMachineNoteFor` is currently unreachable through the on-car "Take it off" button: every
  taxonomy slot gated for `'remove'` (block, internals, headValvetrain, camsTiming, gearbox,
  clutch) is also an assembly member, so it only ever comes off via its assembly's own
  `machineNote`. The function and its test exist to document the contract, not a reachable UI path.
- `pipelineActionPlan` (the pre-click cost preview for the four pipeline actions) was kept rather
  than deleted - it never depended on `stagedCarWork`, so it survives as a pure preview function
  for the direct-click buttons; its doc comment was rewritten to drop every "Confirm" reference.
- `StagedAction` (content) keeps its name and shape: it is still the natural parameter type the
  four pipeline resolvers and `repair`/`install`'s call sites share, just describing "one action to
  resolve now" instead of "one action queued." Renaming it was judged not worth the blast radius
  for a type that is otherwise unchanged.
- A repository-wide `commentHygieneGuard.test.ts` (bans "Sprint NNN"/dated/"playtest"/"maintainer"
  references in comments, per directive 10) was failing on 31 comments by the end of this pass -
  29 in files this session touched, 2 in `machineGateConversion.test.ts` from the already-landed
  task E. All 31 rephrased to describe current behaviour without the process reference; the guard
  is green.
