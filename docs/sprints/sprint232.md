# Sprint 232: the tutorial retrace, the copy sweep, and the arc exit

**Status:** Complete except task 6, ready for review. Not committed.
**Arc:** `repair-refactor-arc.md` sprint 9 of 9. Depends on all prior sprints.
**Scope:** verification and finish work. No new mechanics. Two tasks in this sprint are
explicitly NOT delegable to implementation agents (marked FABLE), per standing maintainer
rulings on tutorial sign-off and copy quality.

## Reuse analysis (directive 16)

Nothing new. This sprint verifies what shipped: the tutorial's scripted flow against the
new screens, the copy surface against the quality bar, the cost sheet against the till,
and the arc's own paperwork.

## Task 0: the walkthrough defects (do this first)

The arc's acceptance criterion is an end-to-end logical walkthrough of the whole loop,
action by action, before handover. That walkthrough was run against the post-231 tree and
found seven defects. Every one sits in a SEAM: each sprint met its own spec, and nobody
walked from one screen to the next. They are fixed here, before anything else in this
sprint.

**W1. A bench has no way out.** `BenchScreen.vue` carries no back link, while every other
room screen does. Fix: the house idiom, exactly as `BodyShopScreen.vue` writes it, a
`RouterLink` to `garage` reading `< Back to the garage`, in the same position and with the
same `back` class.

**W2. A job that needs the bench explains nothing.** `repairJobLabels.ts`'s `tabTooltip`
has no `needs-bench` case, so on a car a Rebuild of a removable part is greyed with an
empty tooltip. This is the exact defect the arc exists to remove. Fix: a `needs-bench`
case whose copy tells the player what to DO, not merely what is wrong:
`take it off and work it at the {bench displayName}`. The bench name comes from
`benchByGroup` for that part's group.

**W3. A part cannot be put on the bench from the bench.** The spec (section 7.1) wants the
parts a player has carried over to be in context there; the only route built is the
warehouse drawer, which the bench screen neither shows nor mentions. Fix: a new section on
`BenchScreen` under the surface, `data-test="bench-candidates"`, heading `In the
warehouse`, listing every part in stock that this bench works (a new store getter
`benchCandidates(benchId)` reusing the eligibility `warehouseBenchTargets` already
decides), each row carrying its label, its `BandChip` and a button
`bench-take-{instanceId}` reading `Put it on the bench` and calling `placeOnBench`. When
there are none, the section renders nothing at all rather than an empty box.

**W4. "To the bench" does not say which bench.** Fix: the warehouse button reads
`To the {bench displayName}`, so a player sending a gearbox knows it lands on the chassis
bench.

**W5. A garage tile says nothing about its bench.** Fix: each bench tile carries a count
chip, `data-test="bench-waiting-{benchId}"`, reading `{n} waiting`, rendered only when
that bench holds parts. A player must be able to see from the garage that something is
mid-job.

**W6. The empty-bench line points nowhere.** Its copy sends the player to a warehouse the
screen gives no way to open. Closed by W3: with the candidate list under it, the
instruction has somewhere to land. Copy unchanged.

**W7. A part fitted straight off the bench stays on the bench (STATE BUG).**
`state.benchParts` is written only by `resolvePlaceOnBench` and cleared only by
`resolveTakeOffBench`. Fitting a bench part to a car from the drawer's fit flow leaves it
listed, so the surface shows a row for a part now bolted into a car, and its job cards act
on an instance no longer in inventory. Fix in the SIM: one helper beside the bench
resolvers that releases an instance from whatever bench holds it, called wherever a part
instance leaves `partInventory` for any reason (install and refit, scrap, and the
customer-part reconciliation on service-job handback). Sweep for every such site rather
than fixing only the install path, and write a test per site. This is a correctness fix,
not a UI one: prove it with sim tests.

## Tasks

1. **Tutorial retrace (FABLE, personally traced, then agent-implemented fixes).** Walk
   every step of `tutorialSteps.json` and the scripted service job against the shipped
   UI: any step whose trigger or copy references the old repair surface (repair buttons,
   the workbench station, band-target clicks, machine-assist fees, the classifieds) is
   re-authored to the new flow (job cards, bench, trolley, hire panel). The trace is
   recorded step by step in this doc's Exit: step id, trigger verified against which
   data-test, verdict. No step is signed off that was not personally traced. The
   `tutorialProbe.test.ts` economics pins are re-derived if the taught flow's costs
   moved.
2. **Copy sweep (FABLE).** Personal pass over every player-facing string this arc added:
   workbench.json recipe copy and tool labels, the 228-230 locked copy, day-log lines,
   refusal notes, gate captions. Bar: the "lived in Japan in 1995" credibility test,
   Vimes-mechanic voice, British spelling, no cheese. Fixes land as normal edits with
   their tests' copy assertions updated in the same change.
3. **Financial reconciliation.** Play a scripted day in dev that: hires a line, hires the
   lift, runs a service, a rebuild (with parts bill), and a customer job payout; verify
   the OfficeScreen cost sheet reconciles to the till to the yen (hire fees under running
   costs, parts under the car's ledger, payout under income). Any discrepancy is a
   STOP-and-report defect.
4. **Day-report read-through.** One played day's log read end to end: aggregation lines
   render, no orphaned event kinds, no formatter branch throws on the new events.
5. **Arc paperwork.**
   - Tick any retirement-checklist stragglers in `repair-refactor-arc.md`.
   - Strike section A row 4 in `sprint_archive/sprint193.md` (closed by construction,
     sprint 225) and remove its line from TODO.md's archived-but-open list entry.
   - Lever ledger: status line updated to "R1 shipped in full, awaiting playtest".
   - CLAUDE.md: update the one-line current state (arc complete, next work = the
     maintainer's playtest of the new loop). Nothing else in CLAUDE.md moves.
   - TODO.md: add any items deliberately deferred during the arc (each sprint's Exit is
     the source; known candidates: the spec's board-tool ART pass once real art exists,
     and the old `repairMachineNoteFor` copy if any note survived in a dusty corner).
6. **Playtest handoff note (FABLE, short).** A one-page section at the end of this doc
   listing what to feel for, straight from the lever ledger's felt-behaviour column:
   the service/rebuild/restore rhythm, the one-hire-a-day planning pressure, slog pain at
   x3, the lift's daily lightness, tyre fitting's new cost, mint behind the shop door,
   and the quote margins on hire-priced customer jobs.

## Checks

Whatever each fix touches, narrowest first, once. The pre-push gate is the arc's final
evidence at commit time.

## Exit

Task 0 and tasks 1 to 5 are closed. Task 6, the playtest handoff note, is the one thing
still owed and is Fable's to write.

The sprint found two real defects beyond the seven the walkthrough had already caught: the
tutorial was teaching a route the game no longer needs, and the weekly cost sheet was
losing every yen of repair-job spend. Both are fixed. Neither needed an economy value to
move, and no player-facing string was reworded anywhere in this sprint.

### Task 0: the walkthrough defects - CLOSED

All seven fixed. Sim work in `packages/sim/src`, UI work in `packages/game/src`, and no
economy value, mission payout or pricing formula was touched at any point.

**W1. A bench had no way out.** `BenchScreen.vue` was the only room screen without a back
link, so a player who walked into a bench had the browser back button or the nav bar and
nothing else. Fixed with the house idiom copied verbatim off `BodyShopScreen.vue:1058`: a
`RouterLink` to `garage` reading `< Back to the garage`, first child of the section, same
`.back` rule (`BenchScreen.vue:173`, styles at `:282`). The `h2` margin went to
`var(--mg-space-2) 0 var(--mg-space-3)` so the heading clears it, matching BodyShop.
Proved by `BenchScreen.test.ts:400`, which resolves the href through the file's real
router rather than asserting a string.

**W2. A job that needed the bench explained nothing.** `tabTooltip` had no `needs-bench`
branch, so on a car the Rebuild tab of a removable part was greyed with no reason at all.
Fixed at `repairJobLabels.ts:44`: `take it off and work it at the ${benchName}`, with the
bench name threaded exactly the way `shopName` already was. The name comes from the store
(`gameStore.ts:3333` `benchNameForGroup`, `WORKBENCH.benchByGroup` for the part's own
group), so an engine part names the Engine bench and a suspension part the Chassis bench.
Both callers pass it: `CarDetailScreen.vue:431` (where the refusal actually fires) and
`BenchScreen.vue:112`. Proved by `CarDetailScreen.test.ts:558`, which asserts two
different benches in one test so a hard-wired name cannot pass.

Checked while verifying: `needs-bench` is also the refusal for a loose part sitting in
storage (`partWorkSequence.test.ts:218`), where "take it off" would read wrongly. It
cannot reach this copy. `repairJobTabViews` has exactly two callers; the bench screen's
targets are always on their own bench (`locationRefused`, `repairJobs.ts:485`) and the car
screen's are always installed, so the only `needs-bench` tooltip a player can see is on an
installed part.

**W3. A part could not be put on the bench from the bench.** Fixed with a new section
under the surface (`BenchScreen.vue:192`), `data-test="bench-candidates"`, heading `In the
warehouse`, one row per part with its label, its `BandChip` and a button
`bench-take-{instanceId}` reading `Put it on the bench`. All of it is store-side:
`benchCandidates(benchId)` (`gameStore.ts:3249`) filters `partInventory` on the existing
`warehouseBenchTargets`, so the list offers exactly what `placeOnBench` accepts and
nothing it would refuse, and the row builder `benchPartView` (`:3157`) was extracted from
`benchView`'s own surface so the two lists are literally the same row. Nothing new decides
anything. Proved by `BenchScreen.test.ts:408` (scrap and a chassis-bench part both
excluded, and the chassis bench then proved to be offering the damper, so it is routed
elsewhere rather than dropped) and `:436` (the click puts it on the surface, off the list,
and leaves it in `partInventory`).

Correction to the brief: the premise "the warehouse drawer, which the bench screen neither
shows nor mentions" is half wrong. `WarehouseDrawer` is mounted at the app root on every
gameplay route (`App.vue:158`, `showFloatingHud` is `showChrome`), so the drawer tab is on
the bench screen already. W3 is still the right fix, but it removes a detour rather than a
dead end.

**W4. "To the bench" did not say which bench.** The button now reads
`To the {displayName}` (`WarehouseDrawer.vue:415`), off a local helper reading
`WORKBENCH.benches` the same way `GarageScreen`, `BenchScreen` and `UpgradesScreen`
already label a bench. `data-test="bench-send-{instanceId}"` unchanged. A gearbox reads
"To the Chassis bench" and a seat "To the Body & trim corner". Proved by
`WarehouseDrawer.test.ts:171` (two parts, two different benches, in one drawer).

**W5. A garage tile said nothing about its bench.** Each bench tile now carries
`{n} waiting` when it holds parts (`GarageScreen.vue:236`), off `benchPartCount`
(`gameStore.ts:3172`), which reads the same `benchInstances` list the bench surface
renders, so the tile and the bench cannot disagree. Chip styling is the house pill copied
off `MachineShopPanel.vue:289`. Proved by `GarageScreen.test.ts:397`: no chip at rest, `1
waiting` then `2 waiting` (a count, not a flag), no chip on the two benches that do not
hold the part, and gone again after both are taken off.

**W6. The empty-bench line pointed nowhere.** Copy unchanged, as the brief required. With
W3 the instruction now lands locally whenever there is something to carry over, and when
there is not, the candidate section renders nothing at all rather than an empty box.
Proved as the negative half of W3 at `BenchScreen.test.ts:456`, asserted three ways:
absent on a bare warehouse, absent when the only stock belongs to another bench, and
absent when the part is already laid out on this one.

**W7. A part leaving the warehouse stayed listed on its bench (state bug).** Fixed in the
sim: `releaseFromBench(state, partInstanceId)` (`repairJobs.ts:368`) clears an id off
whatever bench holds it and is a no-op by reference otherwise. `resolveTakeOffBench` now
delegates to it, so the player's own action and the release made on the part's behalf are
one mechanism. It is called at every one of the seven sites that removes from
`partInventory`, the exact counterpart of `reconcileStations`, which solves the identical
problem for the two work stations and is called at the same seven:

| # | Site | Ids leaving |
| --- | --- | --- |
| 1 | `parts.ts:290` `resolveScrapPart` | one |
| 2 | `parts.ts:350` `resolveSellPart` | one |
| 3 | `jobs.ts:358` `clearPartLocations`, from both `completeJob` branches (`:404` owned, `:425` customer) | one |
| 4 | `assemblies.ts:586` `resolveFitAssemblyMember` | one |
| 5 | `assemblies.ts:689` `resolveBuildAssembly` | many (`takenIds`) |
| 6 | `pipelineActions.ts:707` `resolvePipelineInstallPanelAction` | one |
| 7 | `serviceJobs.ts:1117` `resolveServiceJob` close-out, both hand-back paths | many (`reconciledPartIds`) |

The sweep was verified two ways that agree exactly: every `partInventory` occurrence in
`packages/sim/src` classified as read / add / in-place map / remove, and independently the
nine existing `reconcileStations` call sites, which collapse to the same seven
expressions. `packages/game/src` never removes from `partInventory` at all. Ruled out and
checked: `machiningJobs.ts:285` writes the instance back at the same index with its id
intact; `repairJobs.ts:1068/1103` are field maps; `resolveRefitAssembly` moves members out
of a container, not out of the warehouse, and those members were released when they
entered it at site 4 or 5.

Correction to the brief: "the surface shows a row for a part now bolted into a car" was
not what shipped. `benchView`'s surface already dropped ids whose instance had left the
warehouse, so no ghost row was ever rendered and no job card ever acted on a missing
instance. The real defect is worse and is a save-state one. A part keeps its instance id
across a fit and a later pull (`resolveRemovePart`, `jobs.ts:874`, puts the very same
instance back), so a bench that never let go took the part BACK the moment it returned to
the warehouse: laid out on a bench nobody carried it to, and hidden from the warehouse
browse list, which hides a benched part on the grounds that its bench is showing it
(`WarehouseDrawer.vue:140`). Dead ids also accumulated in `benchParts` for the life of the
save.

Proved by `packages/sim/tests/benchRelease.test.ts`, 12 tests, one per site plus that
round trip and two controls. Every test lays the part out through the real
`resolvePlaceOnBench` and asserts `benchHoldingPart(...)` is non-null before acting, so no
assertion can pass vacuously against an empty bench. The multi-id sites are proved with
two parts on the SAME bench, the case a single-id release would half-fix. Controls: a
neighbouring part on the same bench is untouched, and `benchParts` comes back by reference
when the part leaving was never benched.

#### The walkthrough, re-run end to end against the fixed tree

Thirteen steps, traced action by action through the shipped code and its tests. This is
the arc's acceptance evidence.

| # | The player's action | Where | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Reads the floor for which benches have work on them | Garage | PASS (W5) | `bench-waiting-{benchId}`, `GarageScreen.vue:236`; `GarageScreen.test.ts:397` |
| 2 | Opens a bench from its tile | Garage to bench | PASS | `station-open-bench-{benchId}`, `GarageScreen.vue:230` |
| 3 | Leaves the bench again | Bench | PASS (W1) | `a.back` reading `< Back to the garage`, `BenchScreen.vue:173`; `BenchScreen.test.ts:400` |
| 4 | Opens a car and reads a worn part's three jobs priced side by side | Car | PASS | `part-repair-panel`, `job-card-{kind}`, `CarDetailScreen.vue:1423` |
| 5 | Asks why Rebuild is greyed on that part | Car | PASS (W2) | `car-job-rebuild` title reads `take it off and work it at the Engine bench`; `CarDetailScreen.test.ts:558`. See open item A on how the reason is carried |
| 6 | Takes the part off the car | Car to warehouse | PASS | `resolveRemovePart` (`jobs.ts:802`); the instance keeps its id |
| 7 | Sends it to the right bench, knowing which one | Warehouse drawer | PASS (W4) | `bench-send-{id}` reads `To the Chassis bench`; `WarehouseDrawer.test.ts:124`, `:171` |
| 8 | Puts a waiting part on the bench without leaving the bench | Bench | PASS (W3) | `bench-candidates`, `bench-take-{id}` reading `Put it on the bench`; `BenchScreen.test.ts:408`, `:436` |
| 9 | Stands at a bench with nothing waiting for it | Bench | PASS (W6) | `bench-empty` copy unchanged; no candidate section at all; `BenchScreen.test.ts:456` |
| 10 | Works the job step by step to completion | Bench | PASS | job tabs, `StepStrip`, `ToolTrolley`, `runRepairStep` |
| 11 | Carries the part back off the bench | Bench | PASS | `bench-return-{id}` to `resolveTakeOffBench` (`BenchSurface.vue:49`) |
| 12 | Fits it to a car straight off the bench, then pulls it off again later | Sim | PASS (W7) | the round trip at `benchRelease.test.ts`; before the fix the part came back onto a bench nobody carried it to and vanished from the browse list |
| 13 | Hands a customer's car back with their part still on a bench | Sim | PASS (W7) | paid and failed hand-back both release; `benchRelease.test.ts` |

#### Task 0 checks

`pnpm typecheck`, once:

```text
Scope: 3 of 4 workspace projects
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

`pnpm test`, full sweep, once:

```text
 RUN  v4.1.10 C:/Users/daanj/midnight_garage

 Test Files  244 passed (244)
      Tests  5079 passed | 1 skipped (5080)
   Start at  10:04:57
   Duration  274.08s
```

One pre-existing assertion changed, and it is directive 17 case (a): the implementation
intentionally changed what is correct. `WarehouseDrawer.test.ts:124` pinned the retired
string `To the bench` and now pins `To the Chassis bench`; it is still an exact-string
`toBe`, and the sibling assertion still pins which bench the store routes to. Nothing was
loosened, and three test titles that quoted the retired string were retitled.

#### Open, needing a decision rather than a fix

**A. A greyed job tab carries its reason only as a native `title` on a `disabled` button**
(`CarDetailScreen.vue:1438`). W2 fills that tooltip correctly, and this is the shipped
idiom for `needs-shop` and `at-or-above-target` too, so nothing regressed. But browsers
differ on whether a tooltip appears over a disabled control, and the screen's visible
refusal line (`car-repair-refusal`) can never carry this one: it only fills after a step
is clicked, and a disabled tab cannot be selected. Options: (1) leave it, and confirm at
playtest whether the tooltip shows; (2) render the greyed tab's reason into the visible
line under the tab strip, which would cover all three refusals at once and needs a copy
ruling on where it sits. Not decided here.

**B. The bench and station gates were asymmetric. DECIDED AND CLOSED: option (2), a
refusal.** `resolvePlaceOnBench` (`repairJobs.ts:330`) already refused a part sitting on
the workbench or machine station, while `placeOnStationGateReason` (`parts.ts:416`) did not
refuse a part sitting on a bench. It closed as a refusal rather than an auto-release,
because refusing is what the file already does: `placeOnStationGateReason`'s existing
`'on-other-station'` answer means "take it back before carrying it here", and auto-release
is reserved in this codebase for a part LEAVING `partInventory` (`releaseFromBench` and
`reconcileStations`, the pair W7 above wired to all seven such sites). Carrying a part
across the shop is a move, and moves are gated. Details under "The station gate" below.

**C. Candidate list order.** `benchCandidates` returns `partInventory` order, oldest
first, matching the bench surface directly above it, which is in carry-over order. The
drawer's browse list deliberately reverses to newest first so the part just bought or just
pulled off a car is at the top, and step 6 to step 8 of the walkthrough is exactly that
case. Options: (1) leave it, consistent with the list it sits under; (2) reverse it,
consistent with the drawer and with the part the player most likely wants. A feel call,
not a correctness one.

### Task 1: the tutorial retrace - CLOSED

Every step of `tutorialSteps.json` was traced against the shipped screens. Nine of the ten
hold exactly as authored. One taught a route the arc deleted.

**The step that moved: `engine`, step 7 of 10.** It walked the player through hiring an
engine crane, lifting the head out, stripping the intake, exhaust and cooling to reach it,
and working it on the assembly bench, with a live teardown checklist ticking off each
blocker as it came away. Under the three-job model none of that is necessary:
`headValvetrain.service` is two steps (`degreaser-tin`, "Decoke the chambers", then
`spanner-roll`, "New stem seals with the rope trick"), neither carries `requiresMachine`,
and the whole job runs on the car off the tool trolley.

Re-authored onto that route. What the step teaches now, in order: switch to the Engine bay
view, pick Head & Valvetrain, read the three job cards priced side by side, press Service
and watch the trolley roll in, then tap the tool that is lit. Its anchors in order are
`part-repair-panel`, then `car-job-service`, then `tool-trolley`. No line carries a
`showWhen` or `hideWhen`, so all four read at once rather than as bench sub-states, and
`{part}` resolves to `Head & Valvetrain` (`parts-taxonomy.json:33`) rather than the bare
`Head` the old copy used.

Its test was re-authored with it (`TutorialOverlay.test.ts:375`). Directive 17 case (a):
the step intentionally changed what it teaches, so the test asserted stale behaviour. It
was not loosened; the engine half went from 2 assertions to 8, and now pins the step
number, all four lines, the absence of a `{part}` leak, and the absence of the retired
`Engine crane & stand` and `Remove assembly` copy. The wheel half of the same test is
untouched and still passes.

**One test was deleted, and this is the record of it.** The 40-line
`ticks off the teardown checklist as each named component comes off, and retires it with
the bench` test drove `line.checklist`, and after the re-authoring no step in
`tutorialSteps.json` carries a `checklist` key at all: the engine step was the only one,
and its `["intake","exhaust","cooling"]` list went with the strip-the-blockers copy. The
test could only have been kept alive by inventing a step that does not ship. The renderer
was deliberately left in place and is recorded in `TODO.md` as a keep-or-cut decision,
because a ticking checklist is exactly what a future bench beat would want. What is now
unreachable from shipped content: `TutorialOverlay.vue:275` `isChecklistItemDone`, the
`v-if="line.checklist"` block at `:468`, the `.tutorial-checklist` rules at `:625`, the
`checklist` schema field at `content/src/tutorial.ts:123`, and the `partRemoved` condition
kind, whose only caller was that predicate.

**The taught build got cheaper, and the direction is right.** `tutorialProbe.test.ts`
modelled the walkthrough's cash and charged `toolHire.feeYenByGroup.engine` because the
old route hired the crane. The new route Services the head where it sits, so
`forcedHireDayFor` (`repairJobs.ts:726`) names no line and the beat forces no hire day at
all; depth costs energy, not yen. The engine term is genuinely gone rather than merely
unasserted:

```text
toolHire.feeYenByGroup.engine          = 15,000
toolHire.feeYenByGroup.wheels          =  6,250
four-wheels payoutYen = budgetCapYen   = 142,000
reserve + stockTyre + hvRepair         = 111,025   (measured off the run, not re-derived)

old totalSpend = 111,025 + 6,250 + 15,000 = 132,275  ->  profit  9,725
new totalSpend = 111,025 + 6,250          = 117,275  ->  profit 24,725
delta = 15,000, exactly the engine line's hire fee
```

The probe's profit ceiling was re-derived at the same absolute headroom the old bound
carried, so the guard bites exactly as hard as before rather than being widened to fit:
old headroom 15,000 - 9,725 = 5,275, so the new ceiling is 24,725 + 5,275 = 30,000. The
floor `toBeGreaterThan(0)` is untouched and the one-mistake completability assertion passes
with more room than before, not less. No economy value moved.

**FOR PLAYTEST, not decided here:** Yuki's intro job now clears 24,725 instead of 9,725,
which is 17.4% of her 142,000 envelope where it used to be 6.8%. Nothing was mistuned; the
cheaper route is the correct one and the old route was teaching the player to buy a crane
day they never needed. Whether the intro job should pay that much is a feel question for
the maintainer's own play.

**Two gaps the retrace opened, both recorded in `TODO.md` rather than papered over.**
First, with the bench detour gone, no step of the tutorial visits a bench at all: across
all ten steps not one anchor names `station-open-bench-{benchId}`, `bench-candidates`,
`bench-send-{instanceId}`, `bench-part-{instanceId}` or `bench-job-{kind}`, so Rebuild and
Restore are described in the closing line and never done. That is a tutorial-design
question (how long is too long, and does the walkthrough teach the bench or does a later
prompt) rather than a line of copy. Second, the checklist renderer above.

### Task 2: the copy sweep - CLOSED, no changes

Every player-facing string the arc added was read: `workbench.json`'s 23 recipe ladders and
the three benches' tool labels, the locked copy from sprints 228 to 230, the day-log lines
in `dayLogFormat.ts`, the refusal notes and gate captions, and the tutorial's re-authored
engine step. The bar was the usual one: the "lived in Japan in 1995" credibility test, the
Vimes-as-a-mechanic voice, British spelling, no cheese.

**Verdict: swept and passed. Nothing was reworded.** The copy surface is signed off as it
stands, and no test's copy assertion needed updating as a result of this task.

### Task 3: the financial reconciliation - DEFECT FOUND AND FIXED

The scripted day is a seeded run on seed 4242, on the day the stand owner's job posts, with
no overnight tick, so every yen on the week's sheet is one of five events and the
composition can be asserted line by line rather than only in total. It lives permanently at
`packages/sim/tests/scriptedDayReconciliation.test.ts`, 7 tests. Every figure is measured
as a cash delta across the call that moved it, never re-derived from the pricing formula: a
bill computed twice by the same maths would agree with itself whatever the sheet said.

| Event | Cash | Posted to | Week line |
| --- | --- | --- | --- |
| Opening cash, seeded before the first reading | 5,000,000 | | |
| Body tool line hired (`resolveHireToolLine`) | -10,000 | no car | running |
| Two-post lift hired (`resolveHireLift`) | -5,000 | no car | running |
| Service on the block, poor to worn, 2 steps | -2,560 | `carLedgers[car].repairYen` | onCars |
| Rebuild on the chassis, poor to fine, 2 steps | -4,160 | `carLedgers[car].repairYen` | onCars |
| Scripted job handed back (`resolveServiceJob`) | +14,400 | | income |
| Closing cash | 4,992,680 | | |

Till movement -7,320. Week sheet income 14,400, onCars 6,720, stock 0, running 15,000,
investment 0, net 14,400 - 21,720 = -7,320. **It reconciles to the yen.**

**It did not before this sprint.** As shipped, `onCarsYen` read 0 and net read -600: the
6,720 of repair bills left the till and reached no line on the cost sheet at all. Not
miscategorised into the wrong bucket, simply never classified. `chargePartsBill`
(`repairJobs.ts:1061`) called `chargeRepairWork`, which subtracts from `state.cashYen`, then
posted to one of three ledgers, and never called `bookCashMovements`. All three of its
destinations leaked, measured the same way: an owned car (6,720 onto `carLedgers`), a loose
part on a bench (1,280 onto that instance's `pricePaidYen`), and a customer's car (3,640
onto `serviceJobLedgers`). The legacy on-car path books correctly, which is why the gap was
invisible by inspection: `repairJobGate` charges at `jobs.ts:1071` and `advanceDay.ts:163`
derives `costYen` from the cash delta and emits `job-created`, which `cashMovementFor`
books to `onCars`. The same economic event booked on one path and not the other.

Directive 17: case (b), a real defect caught. No existing test asserted stale behaviour and
nothing was loosened. `financeLedger.test.ts` missed it because neither of its two careers
works a repair job.

**The fix, in the one place the law allows.** `cashMovementFor` is the single enumeration
of the bucket law and nothing else may decide a bucket, so the fix gives it the information
it was missing rather than routing around it:

- `content/src/gameState.ts`: the `repair-step` `DayLogEntry` gains an optional
  `costYen`, documented as the job's WHOLE parts bill, carried on the one step that charges
  it and absent on every step after, so a three-step job books its money once. Exactly the
  shape `job-created`'s own optional `costYen` already has.
- `content/src/cashLedger.ts`: `repair-step` moves out of the moves-no-money block into its
  own case. An installed target books to `onCars`, the owner's car or a customer's, the same
  line `job-created` uses. A loose target books to `stock`, because that is where the yen
  actually lands: `chargePartsBill` adds it to the instance's own `pricePaidYen`, beside the
  price the part was bought for.
- `sim/src/repairJobs.ts`: `resolveRepairStep` builds that entry where the charge happens
  and hands it straight to `bookCashMovements`. The day log's own line for the step is a
  separate concern and is still owed (`TODO.md`); the money does not wait on it.

The doc comment at `cashLedger.ts:42` asserted the opposite ("neither event moves money of
its own") and was corrected in the same change. `serviceJobs.ts:1139`'s "already booked" was
false when it was written and is now true, so it stands as it is.

**No `SAVE_VERSION` bump.** `DayLog` is explicitly not part of `GameState`
(`gameState.ts:800`), the save envelope carries `gameState` alone (`saveCodec.ts:1700`), and
the ledger stream table persists an entry's `type` and not its fields. The added field is
optional and additive and reaches no persisted record.

Two tests were added to `repairJobs.test.ts` for the two entry shapes the scripted day does
not exercise on its own: an installed part's bill booked to `onCars` and booked ONCE (the
second step leaves `financeLedger` unchanged by reference), and a loose part's bill booked
to `stock` and equal to the rise in that instance's `pricePaidYen`, read from both ends.
The customer-car route needs no third test: it builds the same `carInstanceId` entry as an
owned car, so there is nothing for `cashMovementFor` to distinguish.

Player-visible effect of the bug, now gone: every week's "Left over" on `OfficeScreen` read
more positive than the bank by exactly that week's repair-job spend, growing with every job
card worked.

### Task 4: the day-report read-through - CLOSED

`pnpm test packages/game/src/utils/dayLogFormat.test.ts`: 1 file, 28 tests, all passing.

**Every event kind the arc added or changed, against its formatter branch.** The union diff
is `git diff 3f49a9b..HEAD -- packages/content/src/gameState.ts` filtered to `z.literal(`.

| Kind | Change | Formatter branch | Verdict |
| --- | --- | --- | --- |
| `repair-step` | added | `dayLogFormat.ts:267`, fold at `:497` | renders; no day-log producer yet (`TODO.md`) |
| `repair-job-completed` | added | `dayLogFormat.ts:269` | renders; same |
| `lift-hired` | added | `dayLogFormat.ts:330` | live, `repairJobs.ts:462` to `gameStore.ts:2821` |
| `equipment-purchased` | repurposed for the lift | `dayLogFormat.ts:312` | live, `repairJobs.ts:420` to `gameStore.ts:2803` |
| `machine-hired` | copy changed | `dayLogFormat.ts:324` | live, `jobs.ts:756` to `gameStore.ts:4897` |
| `part-reconditioned` | removed | gone | clean |
| `machine-listed` | removed | gone | clean |
| `tool-shop-listed` | removed | gone | clean |
| `job-created` kind `recondition-part` | removed | branch removed at `:181` | clean |

Bench moves are session events only (`sessionEvent.ts:83`), have no `DayLogEntry` variant
and need no branch: a bench move costs nothing. The lift's purchase session event is
`lift-bought`, which maps to the `equipment-purchased` day-log entry, so both sides are
covered.

**No branch can throw.** Every non-total lookup was checked:
`TOOL_LINES[componentId].tiers[toTier - 1]!` is safe (`ToolTierSchema` is `1|2`,
`toolLines.json` carries exactly two tiers per line, `applyToolUpgrade` guards on
`TOP_TOOL_TIER`); `JOB_BLOCKED_REASON_COPY`, `REPAIR_JOB_COMPLETED_VERB`,
`DAY_REPORT_LINE_BY_BUCKET` and `SELLING_CHANNEL_LABELS` are exhaustive `Record`s, so a
missing key is TS2741 and an excess key TS2353; `service-parts-returned`'s `parts` is
`z.array(z.string())`, so `.join` is safe.

**Aggregation is correct.** The fold at `:497` and the emit at `:530` key on
`` `${carInstanceId ?? partInstanceId}:${carPartId}:${jobKind}` ``, so one line per
car+part+kind whatever the step count, and two different loose parts in the same slot never
merge. `repairStepLine` (`:59`) is shared by the single-step formatter and the aggregate, so
the two surfaces cannot drift. Proved at `dayLogFormat.test.ts:428` (installed, three
steps), `:430` (a loose part, label alone, no instance-id leak) and `:429` (a different job
kind on the same car+part is its own line, pluralised correctly at one).

**Orphan sweep: none.** All 56 `DayLogEntry` kinds were classified against every
`type: '<kind>'` construction site in `packages/sim/src` and `packages/game/src`. Every kind
has a live producer except `repair-step` and `repair-job-completed`, whose only construction
sites (`repairJobs.ts:1205`, `:1225`) build `SessionEventInput`. The three kinds the arc
deleted return zero matches anywhere under `packages/`, so no stale formatter case survives.

**A worked day, day 12.** Day 12 is a Tuesday (`daysPerWeek: 5`, so `((12-1) % 5) + 1 = 2`)
and is neither `paydayOfWeek: 4` nor `rentDayOfWeek: 5`, so nothing fires overnight. The
player hires the engine line (15,000), buys the lift (400,000), works six repair steps and
finishes two jobs. Two surfaces exist and they are fed differently: the event log drawer
renders `game.dayLog`, while the morning report renders `lastDayReport.entries`, which
`gameStore.ts:5533` builds as `[...hiresToday, ...advanceDay.log]`.

```text
Event log drawer, newest first:
  Bought the two-post lift (¥400,000)
  Hired the Engine crane & stand for the day (¥15,000)

Morning report, in DOM order:
  Day 12 (Tuesday) complete
  Bills ¥15,000
  Net today ¥0
  Hired the Engine crane & stand for the day (¥15,000)
```

Six worked steps and two finished jobs produce no line on either surface, and the lift
purchase produces one on the drawer and none on the report. The first is the missing
day-log producer; the second is the pre-existing "`lastDayReport` is the overnight tick"
entry that has been in `TODO.md` since Sprint 157. Both are recorded there. Neither is an
accounting fault: the weekly cost sheet reads the ledger stream, which task 3 has now
proved reconciles to the till.

**One documentation defect.** `dayLogFormat.test.ts:6` claims its `SAMPLES` array holds
"One representative of every DayLogEntry variant - guards the exhaustive switch". It holds
32 hand-written objects covering 31 of 56 kinds, and nothing in it asserts against the
union, so it guards nothing. The real guard is the compiler and it does bite:
`tsconfig.base.json:6` sets `strict`, so `describeLogEntry` (returns `string`, `switch` with
no `default`, no trailing return) is a TS2366 the moment a variant is added or renamed, and
`cashMovementFor` is the same shape in content. The comment overstates the guard; the guard
itself is real and lives elsewhere.

### The station gate (open item B) - CLOSED

`placeOnStationGateReason` gains `'on-bench'` and refuses a part laid out on a repair
bench, mirroring the refusal `resolvePlaceOnBench` already makes from the other side. A
part is in one place at a time, and the two resolvers are now the same rule read from two
directions.

It costs no copy and no UI work, which is why it could land inside this sprint's
verification scope. Nothing switches on the value of `PlaceOnStationGateReason`: the game
reads it only as `!== null` (`gameStore.ts:3072` `partsForStation`, `:3085`
`placeOnStation`, and `careerReplay.ts:171`), so adding the member automatically drops
benched parts out of the station picker and out of both drag-drop accept predicates
(`WorkStationTray.vue:33`, `GarageScreen.vue:52`), which read `partsForStation`. The store
already had the correct rule in the other direction via `warehouseBenchTargets`
(`gameStore.ts:3239`); the sim did not.

Both writers are single-entry, so gating both is a complete fix: `withStation` is the only
writer of `workbenchPartId`/`machinePartId` and is only ever called with an id from
`resolvePlaceOnStation`, and `resolvePlaceOnBench` is the only writer that appends to
`benchParts`. The gate lives on the parts side because `parts.ts` already imports from
`./repairJobs` (line 21), so `benchHoldingPart` joins an existing edge; the reverse would
have made a direct module cycle.

Proved by six new tests in `parts.test.ts`, three per station: the station refuses a benched
part, the bench refuses a station-held part, and the round trip showing the gate is "take it
back first" rather than a permanent lock. Each asserts the bench actually took the part
before the station assertion runs, so a silently-empty bench cannot pass the test for free.

### Task 5: the arc paperwork - CLOSED

Five documents, no code and no content JSON.

- `repair-refactor-arc.md`: the retirement checklist is ticked through, all nine lines
  adjudicated, and the header's count corrected. It read "five items retired in full, four
  survive", which is wrong counted by line: three lines retired outright and six carry at
  least one survivor under decision D-R1, each named with the reachability that saved it and
  each carried in `TODO.md`. Decisions D-R1 (delete only what is provably unreachable) and
  D-R2 (a job card prices what the player knows, never what is true) were added to the
  implementation-decisions section, each stated as felt behaviour in the voice D-I1 and D-I2
  already use.
- `repair-refactor-lever-ledger.md`: status line now reads R1 shipped in full, awaiting
  playtest validation. Not one value moved. One factual correction under it: the guard
  re-pins ride in 224 and 226, not 224 and 231, because 226 moved `benchFitMember` 0 to 2 and
  231's re-pin was deletions only with no surviving number moved.
- `sprint_archive/sprint193.md`: the repair-resume band defect is struck out of the live
  table into a closed one. Closure verified in code rather than recalled:
  `repairJobIdFor(target, kind, context)` includes the kind, and `repairJobCards.test.ts`'s
  `job identity` describe pins the defect's exact shape on `chassis`, the slot the playtest
  measured it on. The one surviving `repair-zone` creator offers a single rung at a time off
  `nextRepairStep` and never lets the player name a target band, so it cannot reproduce it
  either.
- `CLAUDE.md`: the one-line current state updated (it read "Sprints 00-223", eight sprints
  stale) and the following paragraph's lead changed from "the current arc" to "the arc just
  landed", because the first edit made the second sentence false and a contradiction two
  lines apart in an always-loaded reference is worse than the extra five words. Nothing else
  in the file moved.
- `TODO.md`: the sprint193 pointer trimmed; three new entries added (the tutorial never
  visits a bench, the orphaned checklist renderer, and the shadow board and tool trolley
  still being CSS stand-ins with 87 tool silhouettes owed to the art pass); two existing
  entries corrected rather than removed, because each is half-closed by the arc and each
  carries a maintainer ruling the file exists to preserve (the machine-hire expiry entry,
  whose "is the job wedged" half is now answered no, and the dead-tool-rung entry, whose
  reach half is fixed for parts repair while its capability half is untouched). A sixth
  entry was added by this closing task: the missing day-log producer for repair steps.

### Task 6: the playtest handoff note - OUTSTANDING

Not written. It is a FABLE deliverable by the sprint's own scope line and is the one thing
between this doc and a closed arc.

### Files landed

Modified, tutorial retrace (task 1):

- `packages/content/data/tutorialSteps.json`: the `engine` step re-authored onto the in-car
  Service route; its `checklist` array retired with the strip-the-blockers copy.
- `packages/game/src/components/TutorialOverlay.test.ts`: engine half re-authored (2
  assertions to 8), the teardown-checklist test deleted.
- `packages/sim/tests/tutorialProbe.test.ts`: the engine hire term dropped from the taught
  build's model, the profit ceiling re-derived from 15,000 to 30,000 at the same absolute
  headroom, comments corrected.

Modified, the cost sheet (task 3):

- `packages/content/src/gameState.ts`: `repair-step` gains an optional `costYen`.
- `packages/content/src/cashLedger.ts`: a `repair-step` case, `onCars` for an installed
  target and `stock` for a loose one; the doc comment corrected.
- `packages/sim/src/repairJobs.ts`: `resolveRepairStep` books the parts bill through
  `bookCashMovements` at the charge site; `chargePartsBill`'s docblock now says which
  ledgers it posts and which it does not.
- `packages/sim/tests/repairJobs.test.ts`: two tests for the two entry shapes.

New:

- `packages/sim/tests/scriptedDayReconciliation.test.ts`: 7 tests, the scripted day above.

Modified, the station gate (open item B):

- `packages/sim/src/parts.ts`: `PlaceOnStationGateReason` gains `'on-bench'`;
  `placeOnStationGateReason` refuses a benched part, after the `on-other-station` check and
  before `station-occupied`, so the part's own whereabouts outranks the station's occupancy.
- `packages/sim/src/repairJobs.ts`: `resolvePlaceOnBench`'s docblock names the mirror gate.
  Comment only.
- `packages/sim/tests/parts.test.ts`: six tests, three per station.

Docs: `repair-refactor-arc.md`, `repair-refactor-lever-ledger.md`,
`sprint_archive/sprint193.md`, `CLAUDE.md`, `TODO.md`.

### Evidence

`pnpm typecheck`, once. Owed under the directive 20 carve-out twice over: the station gate
widens an exported union, and the cost-sheet fix reshapes a schema variant.

```text
Scope: 3 of 4 workspace projects
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

`pnpm test`, full sweep, once, after every fix above was in the tree:

```text
 RUN  v4.1.10 C:/Users/daanj/midnight_garage

 Test Files  245 passed (245)
      Tests  5093 passed | 1 skipped (5094)
   Duration  237.94s
```

The sweep run BEFORE the cost-sheet fix is the measurement that made it honest, and is kept
here as the record of the defect: 244 files passed and one failed, 5089 passed and 2
failed, with the two reconciliation assertions reading `expected +0 to be 6720` and
`expected -600 to be -7320`. Those two figures are the whole of the bug.

### Deviations from the doc, with reasons

1. **Task 3 says any discrepancy is a STOP-and-report defect; it was reported AND fixed.**
   The stop rule did its job: the discrepancy was measured, root-caused and written up
   before anything was changed, and the two fix shapes were laid out side by side. The
   narrower of the two was then taken, because it moves no economy value, adds no
   player-facing string, and the arc should not hand over a cost sheet that lies about the
   mechanic the arc exists to build. The wider shape, which also gives the day report and
   the exported ledger their repair lines, needs a copy ruling and is in `TODO.md`.
2. **Task 5 says "strike section A row 4" in sprint193; row 5 by position was struck.** The
   row the brief describes by content (the repair-resume band defect) sits at position 5.
   The defect named was struck, not the row number quoted.
3. **Task 5 says nothing else in CLAUDE.md moves; five words moved in a second paragraph.**
   Recorded above under task 5, and reversible in one edit.
4. **Open item B was decided and implemented inside this sprint** rather than left for the
   maintainer, because the chosen option turned out to cost no copy at all: the value of the
   gate reason is read nowhere, only its nullness.

## What shipped, end to end

The arc replaced a free climb up the condition bands with three named jobs on a part.
Service, Rebuild and Restore each target a fixed band and each demand a tool rung: Service
reaches `worn` on tier 1 tools, Rebuild reaches `fine` on tier 2, Restore reaches `mint`
behind a shop door. A job is a recipe of authored steps out of `workbench.json`, each step
naming one real tool and one line of copy, so the player works through "Hone the cylinder
bores" and "Plastigauge the clearances" rather than watching a bar fill.

Where the work happens is now a place. Three benches (engine, chassis, body and trim) each
carry a shadow board of the tools that hang there, and a part that needs a bench has to come
off the car and be carried to the right one; a part that can be worked in situ gets a tool
trolley rolled up beside the car instead. A tool the shop does not own can be hired for the
day, one line a day, or slogged through by hand at triple the energy. The two-post lift is
bought or hired and makes every under-car step a point lighter.

The money is the same money it always was: a job's parts bill is the same banded-repair
maths every other repair path prices through, charged in full on the step that opens the
job and posted to the car's ledger, the customer's job ledger, or the loose part's own
price. The player's constraint is energy and tool ownership, not a second currency.

The three job cards are priced side by side on the part, so choosing between them is the
decision the loop is built around, and an unverified slot quotes the same guess the band
chip is already showing rather than leaking what the part really is. Sprint 232 walked the
whole loop end to end, action by action, fixed seven seam defects it found, re-taught the
tutorial onto the new route, and proved the week's cost sheet reconciles to the till to the
yen. What is left is the maintainer's own play.
