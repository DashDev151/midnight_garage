# Sprint 201: one garage, open play

**Status: IMPLEMENTED, awaiting the maintainer's walk (U1) and session (U2).** Maintainer mandate 2026-08-13, verbatim in
substance: disable the tutorial and start in open play; the Garage screen and the workshop
rooms are supposed to be THE SAME THING; integrate them into a single cohesive whole, fix
the routing, and trace it so it makes sense. The static room pictures are rejected. This
sprint is the playability gate in front of the whole integration arc: it exists so a full
recorded session (integration board gate G1) becomes possible.

**Levers (directive 22): NONE.** No economy value, payout, or formula moves. Every change
is UI, routing, copy, or new-game wiring.

## The measured problem

Repairing a removed part today takes 16 interactions across 6 screens, including a trip
through the world map into a building the player is already inside, landing in the wrong
room of it ("alley", one tab from the workshop floor), plus an undocumented tray step.
Full trace with file:line in `docs/playtest-notes/playtest-notes-2026-08-13.md` and the
navigation report cited there. Root cause: the garage exists twice: `GarageScreen` (`/`,
the real one: bays, parking, forecourt) and `GarageInteriorScreen` (`/garage-interior`, a
static Pixi picture with six room tabs and HTML buttons under it). The stations live behind
the picture. This is directive 16's parallel-system failure, in the UI layer.

## Reuse analysis (directive 16)

**Existing mechanisms reused, unchanged:**

- The station model in sim: `workbenchPartId` / `machinePartId`, `resolvePlaceOnStation`,
  `resolveTakeFromStation`, the repair and machining gates. Untouched.
- `WorkshopFloorScreen` and `MachineShopScreen` content: both are propless pure views over
  `gameStore` (their only route coupling is a `from` query for the back link). They become
  panels of the garage screen as they are.
- `WorkStationTray.vue`: already shared by both stations. Untouched.
- The overworld's own interaction pattern (`buildOverworldScene` + `locationAt`
  hit-testing): the proof that click-the-object navigation already exists in this codebase.
  The garage adopts the pattern's principle (click the thing, it opens); whether the garage
  screen uses a canvas or HTML layout is an implementation choice, not a new mechanism.
- The mission machine: `four-wheels` is the ordinary first story rung offered on day 1 by
  `advanceStoryMissions`; open play inherits it with no work.
- `NewGameOptions.tutorial` already exists in `newGame.ts`; disabling is using it, not
  building it.

**Genuinely new mechanisms: none.** This sprint deletes a parallel system and recomposes
existing views. That is the point.

## Tasks

### A. Tutorial off (open play from day 1)

- A1. `gameStore.ts` `newGame()` (the single production caller, ~5134): stop passing
  `{ tutorial: true }` and stop calling `installTutorial()`. A new career simply never is a
  tutorial career; every sim gate already reads the absence as inactive (verified: normal
  day-1 local-yard auction board, normal day-1 service jobs, Wagon R back in the random
  pool, `four-wheels` offered day 1 through the normal mission machine). The maintainer's
  "start as tutorial-already-completed" intent is delivered by absence, with no fake
  `done` stamp.
- A2. Tutorial content, overlay, and sim module stay in the tree, dormant. Nothing renders
  or waits on them. No deletion.
- A3. Test updates, directive 17 case (a) (intentional behaviour change), verified list
  from the impact trace: `tutorialIsolation.test.ts` and `tutorialProbe.test.ts` (now
  construct `{ tutorial: true }` careers explicitly, still valid as sim tests),
  `TutorialOverlay.test.ts` (component still testable in isolation),
  `gameStore.market.test.ts` (tutorial-lot sort assertion goes),
  `gameStore.jobs.test.ts` day-1 Yuki-only assertion inverts, `AuctionRoomScreen.test.ts`
  seeds its lot explicitly, `skipTutorial()` calls in three screen tests become no-ops or
  are removed.

### B. One garage

- B1. Stations onto the garage screen. `GarageScreen` (`/`) gains the workshop stations as
  directly clickable elements: workbench and machine open their existing views in place
  (panel or drawer, same route). The `WorkshopFloorScreen` and `MachineShopScreen`
  components are re-parented, not rewritten; the standalone `/workshop-floor` and
  `/machine-shop` routes are retired and their two inbound links retargeted
  (`GarageInteriorScreen` dies with them; `CarDetailScreen` ~1839 points its machine-shop
  link at the garage machine panel).
- B2. Rehome the interior's unique surfaces, each with a named new home:
  - Office readouts (photo wall via `photoCountForReputationTier`, corkboard listing
    count, scene certificates): onto the Standing screen, which is their subject matter.
  - Body-and-paint entry, its `bodyPaintShopOpen` derelict gate and refusal copy: a
    station element on the garage screen, gated exactly as today.
  - Machine derelict state (`machineShopHasMachinery`): the machine station element shows
    it; refusal copy preserved.
  - The alley/solo-bay shortcuts die unmourned; the garage screen IS the yard.
- B3. Routing surgery, traced. `/garage-interior` is removed; the overworld garage
  building routes to `/`; every `from=<room>` back target and `mapBackTarget` entry that
  referenced `garage-interior` is retargeted (9 consumer screens, verified list in the
  navigation report). The `dealer-network` building also pointed at `garage-interior`;
  its correct destination is decided during implementation and flagged to the maintainer
  if it is anything other than the auctions screen.
  - B3a. A small routing-integrity test: every route name referenced by any navigation
    call or back target exists in the router. Cheap, permanent, and would have caught the
    alley landing.
- B4. Station refusal copy (kept from the original scope, one line each): a station that
  cannot use a part says why and names the right station ("machining wants a healthy
  part; recondition it on the workbench first").

### C. Secondary, in-sprint

- C1. Sell guard on parts: confirmation or undo; a single click must not cost 70% of a
  part. (The 2026-08-13 session paid a resale haircut plus double express postage for one
  misclick.)

### User-only tasks

- U1. Walk the remove, recondition, refit loop on the built result and give the feel
  verdict. The click count target: the loop never leaves the garage context except the car
  screen itself; no world map, no rooms.
- U2. When it holds: play the full open-play session and export the log (integration board
  G1). Every export is converter fuel for Sprint 198.

## Definition of done

- New game opens in day 1 open play; no walkthrough panel; normal board, jobs, and the
  first story mission present.
- `GarageInteriorScreen`, the room scenes, and both standalone station routes are gone;
  every former capability has a shipped new home; no navigation reference to a dead route
  (B3a test green).
- The repair loop is walkable entirely within garage plus car screen; maintainer verdict
  passes (U1).
- Parts sell action is guarded.
- `pnpm typecheck` run and clean before reporting (directive 20 carve-out: routes and an
  exported screen component are retired); narrowest relevant tests updated and green; the
  pre-push gate is the full evidence.

## Exit

**Implemented 2026-08-13 by four parallel agents plus a merged-tree verification pass.
Awaiting U1 (the maintainer's walk) and U2 (the full open-play session, integration board
G1) before the sprint closes.**

- A (tutorial off): `newGame()` no longer creates tutorial careers; sim untouched; the
  tutorial modules and overlay stay dormant in the tree. Seven test files updated as
  intentional-change cases. One behavioural fact for the maintainer: `four-wheels` is now
  offered at the first End Day (the mission machine runs in `advanceDay`; the tutorial
  installer used to pin it at game open). Making it greet the player at open is a one-line
  follow-up if wanted.
- B (one garage): `GarageScreen` gained a Work stations section (Workbench, Machine shop,
  Body and paint cards with live status; panels open in place; `?open=workbench|machine`
  deep-link). Deleted: `GarageInteriorScreen`, `WorkshopFloorScreen`, `MachineShopScreen`
  (contents live on as `WorkbenchPanel` / `MachineShopPanel`), the `pixi/garage/` scene
  directory, and routes `/garage-interior`, `/workshop-floor`, `/machine-shop`. Overworld
  garage building routes home to `/`; `dealer-network` is inert with a refusal line and
  remains an open content gap (alongside the known `collector-network` gap). New
  `routeIntegrity.test.ts` asserts every name-based navigation target resolves.
- B4 copy: machine refusal is now "The machine wants a healthy part. Recondition it on the
  workbench first."
- C (sell guard): both cash-out buttons on `PartCard` are arm-then-confirm with a priced
  question; disarms on pointer-leave, other actions, or timeout.
- D (office wall): photo wall, corkboard and certificates moved to the Standing screen;
  copy and test hooks reused verbatim.

**Evidence:** merged-tree verification, single run: 16 test files, 294 passed, 0 failed;
`pnpm typecheck` clean across content, sim and game (directive 20 carve-out: routes and
exported components retired); zero em dashes in the change set; process-narrative comments
swept from all touched files. The pre-push gate remains the full evidence at push time.
