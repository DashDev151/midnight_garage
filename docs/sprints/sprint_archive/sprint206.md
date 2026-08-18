# Sprint 206: defects and the ruling

**Status: APPROVED (fix arc wave 1, playtest notes 2026-08-16).** Addresses session-1
notes 5 and 6 and session-2 notes S2-2, S2-3 and S2-7, plus the maintainer's directive
that the whole dependency graph be reviewed personally by the lead, not just suspension.

**Goal:** every defect that made the maintainer stop playing is dead, and the
remove-then-install ruling is enforced by a guard so it can never regress a sixth time.

## Reuse analysis (directive 16)

**Reused:** the existing `blockedBy` graph and its walkers (`occupiedBlockers`,
`externalBlockersFor`) - the ordering fix is content edits, not new machinery;
`resolveRemoveAssemblyMember`, the already-compliant remove-only resolver, which becomes
the mandatory first step; `resolveRefitAssembly`'s occupied-slot refusal (assemblies.ts:371)
as the exact pattern for the new install-only member resolver; the `useDropZone` primitive
and the Warehouse drawer for every new drag surface; `copyGuard.test.ts` /
`spellingGuard.test.ts` as the pattern for the new replace/swap copy guard; the existing
"PANEL OFF" tag on the zone header for the MISSING presentation.

**New:** a monotonic part-instance id counter on `GameState`; one install-only assembly
resolver; drop zones on the Warehouse (drop-back), benched members and the service
diagram; the copy guard test.

## Tasks

### A. Part-instance id collisions (S2-3)

Three mint sites derive ids from `${day}-${partInventory.length}`
(`parts.ts:156`, `parts.ts:219`, `pipelineActions.ts:401`). The array shrinks the same
day, so a later mint can reissue a live id; every removal filters by id equality, which
is exactly "removing one removed both".

- A1. `GameState.partInstanceCounter` (monotonic, never reset); all three sites mint
  from it. Dexie version bump, no migration (directive 19).
- A2. `pickableParts` asserts id uniqueness in dev and dedupes defensively.
- A3. Regression test: buy express, scrap, harvest a panel the same day; every id unique.

### B. The remove-then-install ruling (S2-7, fifth repetition)

There is no swap. Remove puts a part in the Warehouse; install takes one from it.

- B1. Split `resolveSwapAssemblyMember` into an install-only resolver that refuses an
  occupied member slot (mirror assemblies.ts:371). Delete the swap resolver and its
  store wrapper; `careerReplay` mapping updated.
- B2. Bench member controls become the pair used everywhere else: "Take it off" (shown
  while occupied, existing `removeAssemblyMember`) and "Fit" (shown while empty, opens
  the Warehouse in fit mode). The Warehouse fit-select calls the install-only resolver.
- B3. Copy sweep: the bench button label, the drag chip ("click a Replace slot"), the
  two tutorial steps still teaching "press Replace" (tutorialSteps.json:225, 304 - 304
  is also stale against the real button), `WorkbenchPanel.vue`'s "It gets replaced, not
  repaired", `CompendiumScreen.vue`'s "gets swapped". Reword in the two-step vocabulary.
- B4. Identifier and data-test rename (`replace-part-*`, `bench-replace-*`,
  `swapAssemblyMember`, `replaceInPlace`, `swapGateReason`, ...) so the code stops
  teaching the next agent the banned verb. `pnpm typecheck` before reporting (exported
  symbols move - directive 20 carve-out).
- B5. Guard test in the copy-guard family: `\breplac(e|ed|ing)\b` and `\bswap\w*\b`
  banned from player-facing template text and content copy JSON.
- B6. The chassis/bodywork/paint replace-in-place path is explicitly OUT of this
  sprint: those are the body carriers, and their model is decided by Sprint 208's
  redesign, not patched here.

### C. The dependency graph (session-1 note 5, reviewed whole by the lead)

Review of all 27 entries. The engine, drivetrain and brake chains are sound
(cooling before cams, box before clutch, rims before brakes, rims before tyres,
intake/exhaust/cooling before the engine pull). Four changes:

- C1. `springs.blockedBy = ["rims"]` - wheels come off before spring work.
- C2. `dampers.blockedBy = ["springs", "rims"]` - the corner strips in order:
  wheel, spring, damper. (The maintainer's exact reported violation.)
- C3. `steering.blockedBy = ["rims"]` - the rack unbolts from the hubs; front
  wheels off first, same rule as the brakes beside it.
- C4. `forcedInduction.blockedBy = ["intake", "exhaust"]` (was intake only) - a
  turbo hangs on the exhaust manifold; the biggest power part is rightly the bigger
  job.

Divergences from reality kept deliberately, with the gameplay reason on record:
anti-roll bars stay unblocked (reachable from under the lift; a pure-handling part
stays low-friction to experiment with); seats and dash stay surface-depth (interior
scope is deliberately shallow, GDD); driveline stays removable with the exhaust on
(prop-shaft work is not the game's teardown pinch point; the gearbox above it is).

### D. Drag is completed (S2-2)

- D1. Drag a part OFF a station back to the Warehouse: the drawer (and its tab while
  closed) is a drop zone accepting any station-held part; drop calls the existing
  `takeFromStation`.
- D2. Drag onto a benched assembly's empty member slot: member rows gain drop zones
  accepting what the install-only resolver accepts (B1), so drag and click agree.
- D3. Drag from the Warehouse onto the service diagram: the per-part drop zones exist
  (`CarDetailScreen` builds one per `CarPartId`) but only accept while that slot's fit
  mode is open. They now accept whenever the dragged part legally fits that empty slot,
  fit mode open or not; highlight on hover as everywhere else. The diagram is DOM-anchored
  regions over the canvas, so the pointer-event drop path is the same one the stations use.

### E. MISSING is not SCRAP (session-1 note 6)

`panelMissing` is forced into the `scrap` band because the band enum has no sixth value.
The band chip is not the place to lie: where a zone has no panel, the zone header shows
a distinct "Missing" tag (the existing "PANEL OFF" tag restyled and renamed) and no band
chip at all - there is no condition to grade on nothing. `zoneConditionBand` callers
that need a band for pricing keep the scrap floor internally; the player never sees the
word scrap on an absent panel.

## Definition of done

- The three id mint sites share the counter; the regression test pins uniqueness.
- No code path can move a fitted part anywhere but the Warehouse; no player-facing
  surface shows replace/swap; the guard test enforces it.
- The four graph edges are in content with tests; the divergence list above is the
  record.
- All three drag surfaces work by drag and by pick-and-place alike.
- An absent panel reads Missing, never Scrap.
- `pnpm typecheck` (B4 moves exported symbols); narrowest tests once; the pre-push
  gate is the evidence.

## Exit

**Implemented 2026-08-16 by three agents plus a lead reconciliation pass. All green.**

- **A.** `GameState.partInstanceCounter` (optional field, absent reads 0, so no fixture
  blast radius); all three mint sites use it; SAVE_VERSION 70 to 71, no migration.
  Regression tests pin same-day uniqueness and counter survival across advanceDay.
- **B.** `resolveSwapAssemblyMember` is dead; `resolveFitAssemblyMember` refuses an
  occupied slot. The bench is a "Take it off" / "Fit" pair. All named copy reworded
  (the guard found three more sites beyond the list; all reworded, zero exemptions);
  identifiers renamed; `replaceSwapGuard.test.ts` enforces the ruling permanently.
  B6 recorded as decided by Sprint 208 (carriers are transformations).
- **C.** The four edges shipped. Fallout was directive-17 case (a) throughout: about
  forty fixtures across sim and game now strip the corner in order, the 30-day golden
  script strips before its coilover install, and the bots learnt to clear a blocker
  (which exposed a real action-surface gap: `removeAssemblies` now mirrors
  `removeParts` onto the existing resolver, so the replay surface can do what a
  player can).
- **D.** All three drag surfaces live: station part drags back to the Warehouse's
  drop rail (and the tray part is itself draggable), empty benched member slots are
  drop zones through the fit resolver, and the service diagram accepts a legal drop
  with fit mode closed (`WorkshopViews` takes drop zones as a prop).
- **E.** An absent panel renders a Missing tag and no band chip on both zone
  surfaces; `zoneConditionBand`'s internal scrap floor is unchanged for pricing.
- **Smoke and career pins** re-derived from real runs after the id scheme and the
  sale event landed (`part-1-0` to `part-0` in the script).

**Evidence:** full suite 228 files / 4,684 tests, 0 failures; `pnpm typecheck` clean
across content, sim and game. Lead copy pass over every reworded string: no edits
needed. The pre-push gate re-verifies at push time.
