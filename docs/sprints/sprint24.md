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

- [ ] `router/index.ts`: `router.afterEach(() => clearDragSession())` — a navigation always ends
  any in-flight pick/drag (import from `../composables/useDragAndDrop`).
- [ ] `CarDetailScreen.vue` `onReplaceClick`: only complete-the-pick when
  `acceptsInstall(componentId, payload)` is true for the picked payload; otherwise fall through to
  the normal open/close-drawer branch (the pick stays alive — the user may have meant a different
  row).
- [ ] `CarDetailScreen.vue`: render a small "placing: [part name] — click a Replace slot, or Esc to
  cancel" chip whenever a pick session is active (mirror the existing drag-ghost pattern; add the
  Esc key handler calling `clearDragSession`).
- [ ] Tests: cross-screen scenario (start a pick, navigate, session is null); non-fitting pick +
  Replace click opens the drawer; fitting pick + Replace click stages the install.

### Fix 2 — the sim never validates part-component fit on install (review finding, confirmed)

Root cause: only the UI filters (`installablePartsFor`); `stageAction` and `jobs.ts`'s install path
accept any part for any component (`applyJobToCar` installs it, jobs.ts:98-119).

- [ ] Add `partFitsCar(part: Part, model: CarModel, componentId: ComponentId): boolean` to the
  EXISTING `packages/sim/src/parts.ts` (Sprint 14 file holding `resolveBuyPart`/
  `resolvePartDeliveries` — a fit predicate is parts domain, same home; do NOT create a new file).
- [ ] `gameStore.installablePartsFor` uses it (delete the inline copy).
- [ ] `gameStore.stageAction`: refuse (`return false`) an install action whose part fails it.
- [ ] `jobs.ts` `findOrCreateJob`: an explicit install-fit check in the install path returning
  `{ ok: false }` — NOT by widening `repairJobGate` (which deliberately opens with
  `if (kind !== 'repair-zone') return ok` and, post-Sprint 22, branches per kind; the install fit
  check is its own small guard beside it), and NOT a throw (bots/dev-console must not crash the
  tick).
- [ ] Tests: sim-level (an engine part staged onto suspension never installs, state unchanged) and
  store-level (`stageAction` returns false).

### Fix 3 — `car-sold` logs the nominal reputation delta, not the applied one (review finding, confirmed)

Root cause: `selling.ts` (walk-in ~line 154-171, and the public-listing resolution in
`advanceDay.ts` step 7) log `saleReputationDeltaFor(car)` while `applyReputationDelta` floors
`reputationPoints` at 0 — a player at 2 points selling a lemon logs −5 but loses 2.
`serviceJobs.ts:253-255` already does this correctly via before/after diff.

- [ ] Both sale paths compute `applied = after.reputationPoints - before.reputationPoints` and log
  that (omit the field when 0, as today).
- [ ] `selling.test.ts`'s "clamped at zero" test asserts the exact applied value (currently only
  `< 0` — it masks the bug).

### Fix 4 — End-Day cart warning (playtest 2026-07-10 #1)

- [ ] `game.endDay()` is invoked inline from FIVE screen templates (`GarageScreen.vue`,
  `CarDetailScreen.vue`, `ServiceJobsScreen.vue`, `AuctionScreen.vue`, `PartsMarketScreen.vue`)
  plus `DevConsole.vue`. Do not patch five copies: extract one shared
  `components/EndDayButton.vue` used by all five screens (a worthwhile DRY fix on its own), with
  the cart check inside it — when `gameState.cartPartIds.length > 0`, a component-local confirm
  dialog "N part(s) in the cart haven't been ordered — end the day anyway?" (proceed/cancel;
  follow `JobCompleteModal.vue` for structure/styling; no `uiStore` state needed).
  `DevConsole.vue`'s direct call stays ungated (dev tool).
- [ ] Test (`EndDayButton.test.ts`): non-empty cart shows the dialog; cancel does not advance the
  day; proceed does; empty cart ends the day with no dialog.

### Fix 5 — dedicated tests for the three untested Sprint 17/18 components (review finding)

- [ ] `ShopSlot.test.ts`: renders car vs empty slot; empty slot exposes its slot id to drops;
  drop/click wiring calls the handlers.
- [ ] `PartCard.test.ts`: `fits=false` blocks the `select` emit and applies the disabled style;
  `fits=true` emits.
- [ ] `ReplaceDrawer.test.ts`: renders ALL owned, unstaged parts with correct `fits` flags — the
  show-everything behavior is a DELIBERATE Sprint 18 round-2 playtest decision (see the component's
  own comment: "shown either way so the player sees their whole inventory"); do not assert
  filtering. Assert: non-fitting parts cannot stage, fitting parts stage via the emitted event,
  empty-inventory state renders.

### Fix 6 — British spelling sweep (playtest 2026-07-10 #9)

- [ ] Player-visible strings only: game copy in `packages/game/src` templates + content
  `displayName`/`hintText`/flavor strings (e.g. equipment.json's "Tire Machine & Balancer" ->
  "Tyre..."). **Ids, code identifiers, CSS, props stay untouched** (`tire-machine` id is stable by
  design; `color` props are code, not copy).
- [ ] Sweep list to check beyond tyre: -ize/-ise is NOT in scope (era-neutral), "curb"->"kerb" only
  in player copy if present, "aluminum"->"aluminium" if present. Record the full changed-string list
  in the Exit.
- [ ] Naming-layer CI test still passes (no real-brand leak introduced).

### Fix 7 — documentation debt

- [ ] `docs/sprints/sprint15.md`/`sprint16.md`/`sprint19.md`/`sprint19b.md`/`sprint19c.md` headers:
  status lines still say "not yet committed" — correct to committed (hashes from `git log`).
- [ ] `CLAUDE.md` "Current state" paragraph: rewrite post-arc (sprint number, what the arc changed,
  pointer to sprint20-24 docs).
- [ ] `TODO.md`: strike every item the arc resolved (auction calibration items, hidden-issues
  rethink, Sprint 19 follow-ups, balance-harness distrust items now covered by invariants + session
  log), each with a one-line "resolved by Sprint NN" note; keep what genuinely remains.

## Session log v0 (the record-real-play seed, maintainer idea 2026-07-09)

- [ ] `saveDb.ts`: new Dexie table `sessionEvents` (`++id, day, type`), Dexie schema version bump
  in the same wrapper (IndexedDB versioning, NOT the GameState `SAVE_VERSION` — no migration, no
  golden-save changes; the wrapper stays coverage-excluded per Sprint 07). New helpers mirroring
  the existing `loadSave`/`writeSave`/`clearSave` triple: `appendSessionEvent(event)`,
  `loadSessionEvents()`, `clearSessionEvents()`.
- [ ] `gameStore.ts`: a private `logSessionEvent(type: string, payload: object)` called from every
  player-action method (bid, buyout, inspect, stage/unstage/confirm, buy part/checkout, accept/give
  up job, sell/list, move car, buy equipment/bay, end day). Day number from state; wall-clock
  timestamp is allowed here (game layer, not sim). Fire-and-forget: the Dexie write is async —
  don't await it in the action path; swallow failures with the same try/catch shape `writeSave`
  already uses (a lost telemetry event must never break play).
- [ ] `SaveMenu.vue`: "Export session log" -> downloads `loadSessionEvents()` as a JSON file.
  NOTE: no download pattern exists to reuse — the existing save export copies to CLIPBOARD — so
  build the small standard `Blob` + `URL.createObjectURL` + anchor-click helper here (a dozen
  lines; keep it local to `SaveMenu.vue` until a second consumer exists). No import/replay this
  sprint — v0 is capture only.
- [ ] Test: actions append events; export serializes them (mock Dexie per existing store-test
  pattern).

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

## Exit

*(to be written at implementation end)*
