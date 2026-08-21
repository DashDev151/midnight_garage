# Sprint 232: the tutorial retrace, the copy sweep, and the arc exit

**Status:** Planned
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

(Fill on completion: the full tutorial trace table, the copy-sweep change list, the
reconciliation figures, and the handoff note.)

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

**B. The bench and station gates are asymmetric.** `resolvePlaceOnBench`
(`repairJobs.ts:330`) refuses a part currently on the workbench or machine station, but
`placeOnStationGateReason` (`parts.ts:416`) does not refuse a part currently on a bench.
Not reachable today: the only draggable part card is the drawer's, and the drawer's browse
list excludes benched parts (`WarehouseDrawer.vue:155`), so no live path can list one part
in both places. Options: (1) leave it and record the reasoning; (2) add an `on-bench` gate
reason, which is a new refusal string and so needs copy.

**C. Candidate list order.** `benchCandidates` returns `partInventory` order, oldest
first, matching the bench surface directly above it, which is in carry-over order. The
drawer's browse list deliberately reverses to newest first so the part just bought or just
pulled off a car is at the top, and step 6 to step 8 of the walkthrough is exactly that
case. Options: (1) leave it, consistent with the list it sits under; (2) reverse it,
consistent with the drawer and with the part the player most likely wants. A feel call,
not a correctness one.
