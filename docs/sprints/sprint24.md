# Sprint 24 — Debt, polish and humans: close the arc, then prove it plays

*Source: maintainer direction, 2026-07-11 — final sprint of the foundational-economy arc. Everything
here is either (a) a confirmed defect from the 2026-07-10 external-style review that earlier arc
sprints didn't structurally eliminate, (b) a small playtest-note item from `TODO.md`, or (c) the
arc's human validation: a full maintainer playtest of the redesigned economy plus v0 of the
maintainer's own record-real-play idea (2026-07-09), so the balance harness can eventually be
calibrated against how humans actually play. Status: **designed, not yet implemented. Depends on
Sprints 20-23** (several review findings die structurally in 20 and are deliberately absent here).
Note for the implementer: the fixes below were specced against the pre-arc codebase (commit
`93e5e94`), so exact line references may drift as Sprints 20-23 land — re-grep the quoted code at
implementation time; the root causes and required behaviors stand.*

## Goal

Zero known defects, zero stale docs, and the first real evidence about human play: a session log a
future sprint can turn into data.

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Part-fit rule | the predicate inside `gameStore.installablePartsFor` (`part.componentId === componentId && part.requiredTags` all in `model.tags`, gameStore.ts:510-514) | Extracted to sim and enforced there too — one rule, two layers, zero duplicates (fix 2). |
| Applied-delta logging | `serviceJobs.ts:253-255`'s before/after reputation diff | The exact pattern the two sale paths must copy (fix 3). |
| Drag/pick session | `useDragAndDrop.ts` (`clearDragSession` already exists for tests) | Fix 1 wires it to navigation and adds the missing fallback — no new drag machinery. |
| Persistence | `saveDb.ts` (thin Dexie wrapper, deliberately untested per Sprint 07) | Session log is a new Dexie table in the same wrapper — GameState untouched, no SAVE_VERSION bump, goldens untouched. |
| Save/export UI | `SaveMenu.vue`'s existing export-save-string flow | "Export session log" sits beside it. NOTE: the existing export copies to clipboard (`navigator.clipboard.writeText` + textarea fallback) — there is NO blob-download pattern in the codebase; the session export builds a small one (see the session-log section). |
| Test conventions | `GarageScreen.test.ts`/`CarDetailScreen.test.ts` mount patterns, `clearDragSession()` between tests | New component tests follow them. |

### Genuinely new mechanisms

1. **Session event log** (v0 of recorded real play): an append-only Dexie table of player actions.
   Nothing records what a human does across a session; the day `eventLog` records what the *sim*
   did, which is the wrong side of the interface for modeling player behavior.

### Deliberately absent (died structurally in Sprint 20 — do not re-implement)

The auction tie-break mismatch, the duration-sensitivity problem, the self-bid-raises-own-buyout
quirk, and the reserve-formula duplication (Sprint 20's rewrite owns that code).

## Fixes (each: root cause -> exact change -> test)

### Fix 1 — stale pick session silently kills the Replace workflow (review finding, confirmed)

Root cause: the drag/pick session is module-level and survives navigation
(`useDragAndDrop.ts:17-31`); `useDropZone.resolve()` silently returns on a non-accepting payload;
`CarDetailScreen.vue`'s `onReplaceClick` (lines ~173-179) short-circuits on ANY pick session and
never falls through to opening the drawer.

- [x] `router/index.ts`: `router.afterEach(() => clearDragSession())` — a navigation always ends
  any in-flight pick/drag (import from `../composables/useDragAndDrop`).
- [x] `CarDetailScreen.vue` `onReplaceClick`: only complete-the-pick when
  `acceptsInstall(componentId, payload)` is true for the picked payload; otherwise fall through to
  the normal open/close-drawer branch (the pick stays alive — the user may have meant a different
  row).
- [x] `CarDetailScreen.vue`: render a small "placing: [part name] — click a Replace slot, or Esc to
  cancel" chip whenever a pick session is active (mirror the existing drag-ghost pattern; add the
  Esc key handler calling `clearDragSession`).
- [x] Tests: cross-screen scenario (start a pick, navigate, session is null); non-fitting pick +
  Replace click opens the drawer; fitting pick + Replace click stages the install.

### Fix 2 — the sim never validates part-component fit on install (review finding, confirmed)

Root cause: only the UI filters (`installablePartsFor`); `stageAction` and `jobs.ts`'s install path
accept any part for any component (`applyJobToCar` installs it, jobs.ts:98-119).

- [x] Add `partFitsCar(part: Part, model: CarModel, componentId: ComponentId): boolean` to the
  EXISTING `packages/sim/src/parts.ts` (Sprint 14 file holding `resolveBuyPart`/
  `resolvePartDeliveries` — a fit predicate is parts domain, same home; do NOT create a new file).
- [x] `gameStore.installablePartsFor` uses it (delete the inline copy).
- [x] `gameStore.stageAction`: refuse (`return false`) an install action whose part fails it.
- [x] `jobs.ts` `findOrCreateJob`: an explicit install-fit check in the install path returning
  `{ ok: false }` — NOT by widening `repairJobGate` (which deliberately opens with
  `if (kind !== 'repair-zone') return ok` and, post-Sprint 22, branches per kind; the install fit
  check is its own small guard beside it), and NOT a throw (bots/dev-console must not crash the
  tick). **Extended beyond the letter of this task**: `advanceDay.ts`'s bot batch job-creation loop
  calls `repairJobGate` directly, never `findOrCreateJob` — the new `installFitGate` is exported and
  called from both call sites (see Exit).
- [x] Tests: sim-level (a brakes-only part staged onto suspension never creates a job, state
  unchanged) and store-level (`stageAction` returns false).

### Fix 3 — `car-sold` logs the nominal reputation delta, not the applied one (review finding, confirmed)

Root cause: `selling.ts` (walk-in ~line 154-171, and the public-listing resolution in
`advanceDay.ts` step 7) log `saleReputationDeltaFor(car)` while `applyReputationDelta` floors
`reputationPoints` at 0 — a player at 2 points selling a lemon logs −5 but loses 2.
`serviceJobs.ts:253-255` already does this correctly via before/after diff.

- [x] Both sale paths compute `applied = after.reputationPoints - before.reputationPoints` and log
  that (omit the field when 0, as today). The `saleQuality` label still derives from the *nominal*
  delta (unaffected by flooring) — see Exit.
- [x] `selling.test.ts`'s "clamped at zero" test asserts the exact applied value (currently only
  `< 0` — it masks the bug). Split into two tests (a real partial-floor case at 2 points, and the
  genuinely-zero-to-lose case at 0 points) since the old fixture's `reputationPoints: 0` start makes
  the applied delta always exactly 0 under the fix, not merely `< 0`.

### Fix 4 — End-Day cart warning (playtest 2026-07-10 #1)

- [x] `game.endDay()` is invoked inline from FIVE screen templates (`GarageScreen.vue`,
  `CarDetailScreen.vue`, `ServiceJobsScreen.vue`, `AuctionScreen.vue`, `PartsMarketScreen.vue`)
  plus `DevConsole.vue`. Do not patch five copies: extract one shared
  `components/EndDayButton.vue` used by all five screens (a worthwhile DRY fix on its own), with
  the cart check inside it — when `gameState.cartPartIds.length > 0`, a component-local confirm
  dialog "N part(s) in the cart haven't been ordered — end the day anyway?" (proceed/cancel;
  follow `JobCompleteModal.vue` for structure/styling; no `uiStore` state needed).
  `DevConsole.vue`'s direct call stays ungated (dev tool). `CarDetailScreen.vue` keeps its richer
  "End Day (¥cash)" label via a `showCash` prop; the other four stay plain "End Day".
- [x] Test (`EndDayButton.test.ts`): non-empty cart shows the dialog; cancel does not advance the
  day; proceed does; empty cart ends the day with no dialog.

### Fix 5 — dedicated tests for the three untested Sprint 17/18 components (review finding)

- [x] `ShopSlot.test.ts`: renders car vs empty slot; empty slot exposes its slot id to drops;
  drop/click wiring calls the handlers.
- [x] `PartCard.test.ts`: `fits=false` blocks the `select` emit and applies the disabled style;
  `fits=true` emits.
- [x] `ReplaceDrawer.test.ts`: renders ALL owned, unstaged parts with correct `fits` flags — the
  show-everything behavior is a DELIBERATE Sprint 18 round-2 playtest decision (see the component's
  own comment: "shown either way so the player sees their whole inventory"); do not assert
  filtering. Assert: non-fitting parts cannot stage, fitting parts stage via the emitted event,
  empty-inventory state renders.

### Fix 6 — British spelling sweep (playtest 2026-07-10 #9)

- [x] Player-visible strings only: game copy in `packages/game/src` templates + content
  `displayName`/`hintText`/flavor strings (e.g. equipment.json's "Tire Machine & Balancer" ->
  "Tyre..."). **Ids, code identifiers, CSS, props stay untouched** (`tire-machine` id is stable by
  design; `color` props are code, not copy).
- [x] Sweep list to check beyond tyre: -ize/-ise is NOT in scope (era-neutral), "curb"->"kerb" only
  in player copy if present, "aluminum"->"aluminium" if present. Record the full changed-string list
  in the Exit. (Neither was present in player copy — checked, not changed.)
- [x] Naming-layer CI test still passes (no real-brand leak introduced).

### Fix 7 — documentation debt

- [x] `docs/sprints/sprint15.md`/`sprint16.md`/`sprint19.md`/`sprint19b.md`/`sprint19c.md` headers:
  status lines still say "not yet committed" — correct to committed (hashes from `git log`).
- [x] `CLAUDE.md` "Current state" paragraph: rewrite post-arc (sprint number, what the arc changed,
  pointer to sprint20-24 docs).
- [x] `TODO.md`: strike every item the arc resolved (auction calibration items, hidden-issues
  rethink, Sprint 19 follow-ups, balance-harness distrust items now covered by invariants + session
  log), each with a one-line "resolved by Sprint NN" note; keep what genuinely remains.

## Session log v0 (the record-real-play seed, maintainer idea 2026-07-09)

- [x] `saveDb.ts`: new Dexie table `sessionEvents` (`++id, day, type`), Dexie schema version bump
  in the same wrapper (IndexedDB versioning, NOT the GameState `SAVE_VERSION` — no migration, no
  golden-save changes; the wrapper stays coverage-excluded per Sprint 07). New helpers mirroring
  the existing `loadSave`/`writeSave`/`clearSave` triple: `appendSessionEvent(event)`,
  `loadSessionEvents()`, `clearSessionEvents()`.
- [x] `gameStore.ts`: a private `logSessionEvent(type: string, payload: object)` called from every
  player-action method (bid, buyout, inspect, stage/unstage/confirm, buy part/checkout, accept/give
  up job, sell/list, move car, buy equipment/bay, end day). Day number from state; wall-clock
  timestamp is allowed here (game layer, not sim). Fire-and-forget: the Dexie write is async —
  don't await it in the action path; swallow failures with the same try/catch shape `writeSave`
  already uses (a lost telemetry event must never break play).
- [x] `SaveMenu.vue`: "Export session log" -> downloads `loadSessionEvents()` as a JSON file.
  NOTE: no download pattern exists to reuse — the existing save export copies to CLIPBOARD — so
  build the small standard `Blob` + `URL.createObjectURL` + anchor-click helper here (a dozen
  lines; keep it local to `SaveMenu.vue` until a second consumer exists). No import/replay this
  sprint — v0 is capture only.
- [x] Test: actions append events; export serializes them. No pre-existing "mock Dexie" pattern
  actually existed in this codebase to follow (`gameStore.save.test.ts` relies on happy-dom's real
  absence of IndexedDB making `saveDb.ts` calls silently no-op) — established a `vi.mock('../save/
  saveDb', ...)` pattern instead (spy on `appendSessionEvent`/`loadSessionEvents` while keeping the
  rest of the module real), the standard Vitest approach for this exact situation.

## Human validation (user-only, the arc's real Definition of Done)

- [ ] Full playtest of the redesigned economy in the browser (`pnpm dev`): at minimum — win an
  auction war (get outbid overnight at least once, then hammer), lose one on purpose, buy one out,
  inspect a risky lot and walk away, discover an issue on a blind buy, fix it, clean-sale and
  concours-sale a car, flood one model, feel rent. Then the standing Sprint 12-14 browser-verify
  TODOs (CarDetail components list, equipment UI, cart/delivery) in the same session.
- [ ] Export the session log from that playtest — the first real-play artifact for the future
  statistical-ruleset idea (`TODO.md`).
- [ ] Triage session: what the playtest surfaces becomes the next arc's input.

## Not in scope (explicitly)

Main/pause menu ("at some stage" — maintainer), salvage/part-restoration mechanic (parked, "don't
design it unprompted"), recurring-cast character design (rejected as-is, needs maintainer
direction), Hall of Legends cadence, staff/events/rival/era systems, any Fun Gate outreach
(that decision comes AFTER this sprint's playtest).

## Definition of done

All checks green including the Sprint 23 hard invariants; every fix above has its named test; docs
truthful per Fix 7; session export produces a non-empty JSON from a real session; the maintainer
playtest happened and its notes are captured (in TODO.md or the next arc's planning doc).

**Everything Claude-implementable is done and verified** (see Exit). **The Human validation section
is explicitly user-only and still open** — this sprint (and the arc) cannot be marked fully done
until the maintainer's own browser playtest happens; that's the point of the section, not an
oversight.

## Exit

Implemented 2026-07-11. All checks green (typecheck/lint/format/test/test:coverage/build), 613
tests total across the monorepo (up from 576 after Sprint 23), a fresh 1000-career-per-strategy
`pnpm balance:run` re-confirms all 6 balance invariants (3 hard-gated, 3 informational) still pass
after this sprint's sim-level changes (Fixes 2/3).

### Fix 1 — stale pick session

Landed exactly as scoped. `router.afterEach(() => clearDragSession())` ends any in-flight pick/drag
on every navigation. `onReplaceClick` now gates completion on `acceptsInstall(componentId, payload)`
rather than "any pick session at all" — a pick that doesn't fit the clicked row falls through to the
normal open/close-drawer branch instead of silently doing nothing. A "placing: [part] — click a
Replace slot, or Esc to cancel" chip renders whenever a pick is active anywhere on the screen (not
gated to the currently-open drawer, since the whole point is picking from one row and completing on
another), with an `Escape` keydown handler calling `clearDragSession`.

### Fix 2 — sim-level part-fit validation

`partFitsCar` landed in `parts.ts` as scoped, and `gameStore.installablePartsFor`/`stageAction` both
use it. **One real gap found beyond the letter of the task**: `jobs.ts`'s `findOrCreateJob` was the
named enforcement point, but `advanceDay.ts`'s bot batch job-creation loop calls `repairJobGate`
directly — it never goes through `findOrCreateJob` at all (a different id scheme; see that
function's own doc comment). The new `installFitGate` is exported from `jobs.ts` and called from
*both* sites, mirroring `repairJobGate`'s own established "one gate, two callers" shape, so a bot's
queued install spec is validated exactly like the player's instant click. New `job-blocked` reason:
`'part-does-not-fit'`.

Two existing sim test fixtures (`jobs.test.ts`, `stagedWork.test.ts`) built their `SimContext` from
empty `models`/`parts` arrays — harmless before this fix (install specs were never fit-checked), but
it meant `findOrCreateJob`'s own "install-part job creation is never gated by equipment" test and
`stagedWork.test.ts`'s install-confirm test would now fail the new gate (no real model/part to
resolve). Fixed by loading real `CARS`/`PARTS` content into both fixtures' contexts instead of empty
arrays — the tests' own fixture car/part (`honda-city-e-aa` / `tanuki-street-coilovers`) already
genuinely fit each other, so this is a fixture correction, not a behavior compromise.

### Fix 3 — applied vs. nominal reputation delta

Both sale paths (`selling.ts`'s walk-in resolver, `advanceDay.ts`'s public-listing resolution) now
diff `reputationPoints` before/after `applyReputationDelta` and log that, not the nominal value —
mirroring `serviceJobs.ts`'s existing `reputationLost` pattern exactly. The `saleQuality` label
(clean/concours/lemon, Sprint 23) still derives from the *nominal* delta, deliberately: a car that
would have been a lemon sale is still mechanically a lemon regardless of how many points were left
to lose, so relabeling it based on the coincidental floored magnitude would be its own new bug.
`selling.test.ts`'s old single "clamped at zero, delta < 0" test started from `reputationPoints: 0`
— under the fix, an already-zero player has nothing left to lose, so the applied delta is exactly 0
and the field is correctly omitted, not merely negative. Split into two tests: a real partial-floor
case (2 points, lemon nominal -5, applied -2) and the already-zero case (0 points, applied 0, field
absent) — the same split added to `advanceDay.test.ts`'s public-listing resolution test.

### Fix 4 — End-Day cart warning

New `components/EndDayButton.vue` replaces five separate inline `game.endDay()` buttons
(`GarageScreen`, `CarDetailScreen`, `ServiceJobsScreen`, `AuctionScreen`, `PartsMarketScreen`) with
one shared component: confirms via an overlay dialog when `cartPartIds` is non-empty, proceeds
straight through otherwise. `CarDetailScreen`'s richer "End Day (¥cash)" label survives via a
`showCash` prop (default false, so the other four keep their plain "End Day"). `DevConsole.vue`'s
direct `game.endDay()` call in its day-warp tool is untouched, as scoped (a dev tool, not a player
flow that should ever be interrupted by a confirmation dialog).

### Fix 5 — component test coverage

`ShopSlot.vue`/`PartCard.vue`/`ReplaceDrawer.vue` went from 0% direct test coverage to dedicated
suites (7/4/4 tests respectively), covering exactly what the task named: car-vs-empty-slot
rendering, fit-gated select/pick behavior (including the real finding that `PartCard`'s grab-handle
deliberately picks even a non-fitting part — Fix 1 depends on this), and the drawer's
show-everything-but-flag-fit behavior with both a fitting-stages and non-fitting-refuses case plus
the empty-inventory state.

### Fix 6 — British spelling sweep

Real, changed strings (all player-visible copy, no ids/code/CSS touched):

| File | Before | After |
|---|---|---|
| `equipment.json` (`displayName`) | "Tire Machine & Balancer" | "Tyre Machine & Balancer" |
| `traits.json` (Night Owl `description`) | "An extra labor slot..." | "An extra labour slot..." |
| `CarDetailScreen.vue` | "Labor: N/M slots left today" | "Labour: N/M slots left today" |
| `ServiceJobsScreen.vue` (header line) | "...· labor N/M" | "...· labour N/M" |
| `ServiceJobsScreen.vue` (how-to copy) | "...assign labor —..." | "...assign labour —..." |
| `dayLogFormat.ts` (`job-progress`) | "...+N labor" | "...+N labour" |
| `dayLogFormat.ts` (`labor-overbooked`) | "Labor overbooked: ..." | "Labour overbooked: ..." |

Checked and confirmed absent from all player-visible copy (equipment/hidden-issues/service-job/
traits/parts/cars JSON display strings, and every `.vue` template): curb, aluminum, gray, liter,
meter, practice, recognize, organize, favorite, license, defense, honor. `-ize`/`-ise` deliberately
untouched per the sprint doc. The `tire-machine` equipment id, `curbWeightKg` schema field, and the
`color` car field/CSS property are all code identifiers, not copy — none renamed. Naming-layer CI
test still passes (confirmed: none of these are real-brand strings).

### Fix 7 — documentation debt

Sprint 15/16/19/19b/19c doc headers corrected to their real commit hashes (`7e70f5a`, `8e74448`,
`93e5e94` — 19/19b/19c all bundled into the same commit, confirmed via `git log`). `CLAUDE.md`'s
Current state paragraph rewritten for Sprint 23 (this sprint's own predecessor) at the point this
sprint started, and will be rewritten again below for Sprint 24. `TODO.md`: struck 5 items the arc
(or this sprint) genuinely resolved, each with a one-line disposition rather than a silent delete —
the Sprint 20 auction-calibration finding (superseded by Sprints 21-23's real numbers), the
Sprint 09 Flipper-negative-cash observation (generalized and superseded by Sprint 23 decision 7),
the hidden-issues "needs a rethink" finding (resolved by Sprint 22), a long-stale "parts acquisition
has no sim mechanic" checkbox (Sprint 14 shipped this, never struck off), and the two playtest items
this sprint itself closes (End-Day cart warning, British spelling). The recorded-play idea (still
open, not fully resolved) got a note that v0 capture infrastructure now exists but the actual
parsing/derivation work is still unscoped and still blocked on real play data.

### Session log v0 landed

Landed as scoped: a new `sessionEvents` Dexie table (`saveDb.ts`, schema version 2, no `SAVE_VERSION`
bump), a private `gameStore.ts` hook (`logSessionEvent`) called from 13 action methods (moveCar,
swapCars, moveCarToSlot, buyBay, buyEquipment, stageAction, unstageAction, confirmCarWork,
inspectLot, placeBid, buyout, checkoutCart, acceptServiceJob, completeServiceJob, sellWalkIn,
listForSale, endDay — 16 total, the spec's own list plus `moveCarToSlot`/`swapCars` as the same
"move car" family), and a "Export session log" button in `SaveMenu.vue` using a small local
Blob/object-URL/anchor-click helper (no existing download pattern to reuse). Logged only on an
action's real success (a refused click — unknown car, failed gate, no-op — logs nothing), so the
log reflects what actually happened, not every click attempt. Capture only, as scoped — no parsing,
no derived rulesets, no replay.

### What moved

`router/index.ts` (afterEach hook); `CarDetailScreen.vue` (onReplaceClick fix, pick chip, Esc
handler, EndDayButton, Labour copy); `parts.ts` (new `partFitsCar`); `jobs.ts` (new, exported
`installFitGate`, wired into `findOrCreateJob`); `advanceDay.ts` (installFitGate wired into the bot
batch loop; Fix 3's applied-delta diff); `gameStore.ts` (`installablePartsFor`/`stageAction` use
`partFitsCar`; `logSessionEvent` + 16 call sites); `selling.ts` (Fix 3's applied-delta diff);
`gameState.ts` (new `job-blocked` reason `'part-does-not-fit'`); new `components/EndDayButton.vue`;
`GarageScreen.vue`/`ServiceJobsScreen.vue`/`AuctionScreen.vue`/`PartsMarketScreen.vue` (EndDayButton,
Labour copy where applicable); `equipment.json`/`traits.json` (Tyre/Labour copy);
`dayLogFormat.ts` (Labour copy); `saveDb.ts` (new `sessionEvents` table + 3 helpers); `SaveMenu.vue`
(export session log); new test files `router/index.test.ts`, `ShopSlot.test.ts`, `PartCard.test.ts`,
`ReplaceDrawer.test.ts`, `EndDayButton.test.ts`, `gameStore.sessionLog.test.ts`, `SaveMenu.test.ts`;
updated `carCondition`... no — updated `jobs.test.ts`/`stagedWork.test.ts` (real content fixtures),
`selling.test.ts`/`advanceDay.test.ts` (applied-delta tests), `CarDetailScreen.test.ts` (Fix 1
tests), `equipment.json`/`traits.json`/sprint doc headers/`TODO.md`/`CLAUDE.md` (Fix 6/7). No golden
master hash changes — neither fix touches a scripted test career's actual behavior (Fix 2/3 are
edge-case corrections the existing golden scripts never exercise).
