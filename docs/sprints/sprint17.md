# Sprint 17 — Drag-and-drop foundation & garage UI

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, item #5) and the same-day
design conversation. Explicitly sequenced before Sprint 18 (parts inventory/install rework): the
maintainer's own instruction was to build one shared drag-and-drop primitive and use it for both car-
moving here *and* part-installing there ("hard agree, design as such") — this sprint proves it on the
simpler consumer first. Status: **implemented and committed** (both rounds — the original design plus
the round-2 playtest fixes below). See Exit for two deliberate implementation-time deviations from the
design as written (no `setPointerCapture`; plain move buttons kept alongside drag).

## Goal

Replace `GarageScreen.vue`'s swap dropdown-plus-button with real drag-and-drop for moving cars between
service bays and parking, and build the underlying drag-and-drop mechanism as a genuinely reusable
primitive — not a one-off for this screen — since Sprint 18 needs the same interaction for installing
parts.

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Move/swap sim logic | `moveCar`/`swapCars` (`facilities.ts`, Sprint 09/11) — pure, instant, already exposed on the store (`game.moveCar`/`game.swapCars`) | **Completely untouched.** This sprint only changes *how* the player triggers these calls (drag gesture instead of button + dropdown) — the underlying move/swap resolution, capacity checks, and free-instant-move behavior don't change at all. |
| Store action shape | `game.moveCar(carId, to: BayKind)`, `game.swapCars(serviceCarId, parkingCarId)` — both already return a boolean success flag (verified 2026-07-10; the first draft's inline `'service' \| 'parking'` union also broke this table's rendering with an unescaped pipe) | **Reused directly** — a drop handler just calls one of these two functions depending on whether the drop target is empty (move) or occupied (swap), exactly the same decision the current button/dropdown UI already makes, just triggered differently. |
| View data | `serviceBaysView`, `parkingView`, `ShopCarView` (carId, displayName, isCustomerCar) — already exactly what's needed to render draggable cards | **Untouched.** No new store state for "what cars exist where" — only new state for "what's currently being dragged," which is ephemeral UI state, not game state. |
| Design tokens | `--mg-neon-cyan`/`--mg-neon-violet`/`--mg-panel`/`--mg-border` etc. (existing CSS custom properties in `style.css`, used throughout every screen; note `--mg-border` is a full border shorthand — `1px solid var(--mg-panel-edge)` — not a bare color) | **Reused for drag/drop visual states** (dragging, valid-target-hover, invalid-target) — no new color/style vocabulary invented. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **A general-purpose drag-and-drop composable.** Nothing like this exists anywhere in the codebase
   today — every existing interaction is a plain click (buttons, `<select>` dropdowns). This is real
   new infrastructure, deliberately built once, generic, for two consumers (this sprint's car-moving,
   Sprint 18's part-installing) rather than bespoke to either.
2. **Pointer Events, not the native HTML5 Drag-and-Drop API.** Considered and rejected: the browser's
   native `draggable`/`dragstart`/`drop` API needs zero new code but has notoriously poor-to-nonexistent
   touch support — dragging simply doesn't work on touch devices without extra polyfill work. A
   composable built on the **Pointer Events API** (`pointerdown`/`pointermove`/`pointerup` +
   `setPointerCapture`) handles mouse and touch identically with the same code, and needs no new
   dependency — pointer events are a standard browser API, not a library. Matches "stay on stack"
   without even touching the question of adding one.

## Definition of Done

- A reusable `useDragAndDrop`-style composable exists in `packages/game`, built on Pointer Events, with
  a clean draggable-item / drop-zone API that doesn't know or care what's actually being dragged (car
  ids today, part ids in Sprint 18).
- `GarageScreen.vue`'s bay slots and parking rows are drop zones; car cards within them are draggable.
  Dropping a car on an empty slot moves it; dropping on an occupied slot swaps; dropping somewhere
  invalid (or releasing outside any zone) is a no-op, cleanly cancelled.
- The existing swap dropdown/button UI is removed entirely, not left alongside drag-and-drop as a
  second way to do the same thing.
- Visual feedback while dragging: the dragged card follows the pointer, valid drop targets highlight,
  invalid ones don't.
- All checks green; new tests cover the composable's drag lifecycle directly (not just simulated
  pointer events against the full screen) and the garage screen's move/swap-via-drop behavior.

## Decisions (approve / adjust before implementation)

1. **Pointer Events over native HTML5 DnD — confirmed by the maintainer before implementation.**
   See reuse analysis above. **Implementation-time deviation from this decision's own description:**
   the composable does NOT use `setPointerCapture`. Captured pointer events route exclusively to the
   capturing element, which would prevent a drop zone from ever receiving its own `pointerup` —
   forcing hit-testing via `elementFromPoint` instead, which needs a real layout engine and isn't
   reliably testable in this project's happy-dom test environment (confirmed: `elementFromPoint`
   doesn't compute real hit-testing there). Skipping capture lets each drop zone's own `pointerup`
   handler fire naturally via standard DOM event targeting — simpler, and directly testable by calling
   the returned handlers, matching this doc's own testing task. No behavioral downside found: nothing
   in this sprint's interactions needs the pointer to keep tracking off-window or over an iframe.
2. **Accessibility fallback — confirmed by the maintainer: include it.** Click a car's "move…" button
   to pick it up, click "Place here" on a valid target to complete the move/swap — the same `accepts`/
   `onDrop` a live drag uses, different trigger. Matches the roadmap's full-keyboard-nav commitment
   (found in review, still holds).
3. **Drag threshold / accidental-drag prevention.** A plain click (e.g., following the existing
   `RouterLink` into a car's detail screen) needs to still work — dragging shouldn't hijack every
   click. Standard approach: require the pointer to move past a small distance threshold before a
   "drag" actually starts; below that threshold, a `pointerup` is treated as a normal click. This is a
   detail the composable handles internally, not something that needs a per-screen decision, but
   worth naming so it's not discovered as a bug later.

## Task breakdown

### C. Game (`packages/game`) — this sprint is entirely game-layer, no sim/content changes

- [x] New composable `composables/useDragAndDrop.ts`: `useDraggable(getPayload: () => T)` (a function,
  not a `Ref<T>`, so a `v-for` item can supply an always-current id) returns bindable pointer handlers
  plus `isDragging`/`isPicked` computed refs and a `togglePick()` for the accessibility fallback;
  `useDropZone(accepts, onDrop)` returns `isActiveTarget`, `onPointerUp` (live-drag drop), and `onClick`
  (pick-fallback placement) — one `accepts` predicate gates both trigger paths. A module-level
  `session` ref is the single shared "what's being dragged or picked right now," read via the also-
  exported `useDragSession()` for ghost-preview rendering.
- [x] `GarageScreen.vue`: bay slots and parking rows are drop zones; car cards are draggable
  (payload = carId). Drop handler decides move-vs-swap exactly as the old logic did (empty slot →
  `moveCar`; occupied → `swapCars`). `swapPicks` reactive state and the `<select>`/swap-button markup
  are removed entirely, replaced by drag-and-drop and the click fallback. **Scope clarification:** the
  plain single-purpose "→ parking"/"→ service bay" move buttons were *not* removed — only the swap
  dropdown was ("the existing swap dropdown/button UI is removed entirely" in the DoD refers to that
  select+button combo specifically). The plain buttons stay as the simple, always-available,
  zero-gesture path for the common non-swap case, and give the accessibility fallback something to
  build on rather than inventing a separate pick-up affordance from scratch.
- [x] Visual states styled with existing design tokens — `--mg-neon-cyan` border for an active drop
  target, opacity dim for a dragging card, a dashed `--mg-neon-violet` outline for a picked one — no
  new color palette.
- [x] Click fallback: a "move…" button toggles pick, a "Place here" button (shown only on zones that
  would currently accept the picked payload) completes it — reuses the exact same `accepts`/`onDrop`
  the live-drag path uses, per decision 2.
- [x] New `components/ShopSlot.vue` — not explicitly called for in the original task breakdown, added
  because `useDraggable`/`useDropZone` must each run in a persistent per-item scope (stable local
  closure state for pointer tracking) — calling them fresh on every parent re-render inside a `v-for`
  would reset an in-progress drag's threshold-tracking state on any unrelated reactive change. A small
  presentational child component (car-or-empty, drag handlers, its own drop zone; move-vs-swap decided
  by the parent via an `accepts`/`drop` prop pair) is the standard, correct Vue answer — and doubles as
  the reusable "one slot" unit Sprint 18 can crib from for its own drop targets.

### D. Testing

- [x] Game: the composable tested directly (14 tests) — drag start/move/end lifecycle, threshold
  behavior (decision 3), a drop that hits a valid zone vs. one that doesn't (rejecting is not the same
  as cancelling — the session stays live until something actually resolves it), the window-level
  cancel-on-release-over-nothing fallback, and the full click-fallback pick/place/cancel cycle.
- [x] Game: `GarageScreen.test.ts` extended — drag-and-drop move/swap behavior via real simulated
  pointer events (not just calling store methods directly), confirming the same underlying
  `moveCar`/`swapCars` calls fire as the old UI made, that a refused drop changes nothing, and that the
  removed `<select>`/swap-button markup is actually gone.

## Claude-implementable vs user-only

**Claude-implementable:** all of the above. No new dependencies (Pointer Events are a browser
standard, not a library), no data-layer access.

**User-only:** play it — drag-and-drop is exactly the kind of interaction that needs a real hand on a
real trackpad/mouse (and touch device, if that matters to you) to confirm it *feels* right, which
automated tests can approximate but not fully judge. Same recurring browser-verification note as prior
sprints.

## Exit

Implemented as designed, with two deliberate deviations found and made during implementation, both
documented inline above rather than silently: (1) no `setPointerCapture` — capturing would prevent a
drop zone's own `pointerup` from ever firing, forcing `elementFromPoint`-based hit-testing that isn't
reliably testable in this project's happy-dom environment; native, uncaptured event targeting does the
same job more simply and is directly testable; (2) the plain "→ parking"/"→ service bay" move buttons
were kept, not removed — only the swap `<select>` was actually called out for removal, and the plain
buttons double as a zero-gesture accessible path plus the anchor the click-fallback's "move…" button
sits next to.

A new `components/ShopSlot.vue` wasn't anticipated in the original task breakdown but was necessary
once implementation started: `useDraggable`/`useDropZone` need per-item persistent local state, which
a `v-for` inside `GarageScreen.vue`'s own `<script setup>` can't safely provide (recreating the
composables on every reactive re-render would reset an in-progress drag's threshold-tracking). This is
exactly the kind of "genuinely reusable primitive" the design called for — Sprint 18 can reuse the same
component shape for its own drop targets, not just the composable underneath it.

Both decisions (Pointer Events over native HTML5 DnD; include the click-based accessibility fallback)
were confirmed by the maintainer before implementation began, matching the recommended option in both
cases.

All checks green: `pnpm typecheck` / `lint` / `format` / `test:coverage` (436 tests, up from 416) /
`build`. No new dependencies, no data-layer access (this sprint never touches `packages/sim` or
`packages/content` at all — purely game-layer, as scoped).

**Not yet done — real, not automated-testable feel:** playing it with an actual mouse/trackpad, and
ideally a touch device, to confirm the drag gesture and the click-fallback both feel right. `pnpm dev`
is the maintainer's to run per this project's standing rule (dev server is long-running, never started
by Claude) — flagging this explicitly rather than claiming a UI feature is "done" on automated tests
alone.

## Round 2 — post-playtest fixes (real hand on a real trackpad, same session)

The maintainer did run `pnpm dev` and drag real cards, per the "not yet done" note above — and found
three real bugs no automated test had caught, since none of round 1's tests exercised these specific
gestures on purpose. All three traced back to one root cause: **a car's position within a section was
never actually stored anywhere.** `serviceBayCarIds` was a compact list of only-occupied ids (position
= array order, not a real bay identity), and "parking" wasn't a stored array at all — a car counted as
parked purely by not appearing in that list. Patching each symptom individually would have meant three
separate special-cases; fixing the shared root cause fixed all three at once.

**Reuse analysis (directive 15) for this round's fix:**

| Concern | Existing mechanism | How this round uses it |
| --- | --- | --- |
| Move/swap resolution, capacity checks | `moveCar`/`swapCars` (`facilities.ts`) | Kept as the public store surface for the plain non-drag "→ parking"/"→ service bay" buttons and every bot (both "don't care which slot," just "move it somewhere free") — reimplemented underneath as thin wrappers over the new positional core rather than replaced. |
| Drag-and-drop composable, `ShopSlot.vue` | `useDraggable`/`useDropZone` (round 1) | Untouched — the bug was in what a drop *resolved to* (a kind, not a slot), not in the gesture-detection mechanism itself. |
| Ghost preview session | `useDragSession`/`session` ref (round 1) | Untouched by the position model change, but its own **separate** real bug (below) is fixed in the same file. |

**Genuinely new this round:** the positional slot model. `serviceBayCarIds` changed shape from a
compact occupied-only list to a real, index-addressable `(string | null)[]` — one entry per physical
bay, `null` for empty — and gained a sibling `parkingCarIds` field with the same shape and invariant.
A new `moveCarToSlot(state, carId, to, slotIndex)` (`sim/facilities.ts`) is the real positional core
behind drag-and-drop: dropping onto an empty slot moves a car there exactly; dropping onto a slot
occupied by a *different* car exchanges their positions, same section or across. `assignToParking`
places a car entering the shop (auction win, buyout, service-job acceptance, dev grant) into the first
empty parking slot. `releaseCarFromServiceBay` is renamed `releaseCarFromShop` and now clears whichever
slot a car actually occupies (service or parking), not just a service-bay membership check.

**Bug 1 (found in manual testing): the ghost preview froze mid-drag.** The dragged card's on-screen
label only updated via `pointermove` bound to the origin card element — since pointer capture is
deliberately not used (round 1 decision 1), the browser stops delivering `pointermove` to that element
the instant the cursor leaves its bounding box, so the ghost froze wherever it last was while still over
the source card. Fixed in `useDragAndDrop.ts`: a `window`-level `pointermove` listener (added only once
a drag actually starts) is now the sole position source for the rest of the gesture; the origin
element's own `onPointerMove` only ever needs to detect the initial threshold crossing.

**Bug 2 (found in manual testing): same-section drops were refused outright.** Dragging a car from one
service bay onto another occupied service bay (or one parking row onto another) did nothing and the
drop target never highlighted — visually indistinguishable from a broken gesture, even though the
"right" outcome is just "nothing meaningfully changes." Root cause: under the old exclusion-based
model, position within a section carried no identity a same-section drop could meaningfully change, so
it had to be special-cased away as a rejection. With real slot positions, a same-section drop is now a
genuine reposition/swap (`moveCarToSlot` handles it identically to a cross-section drop) — accepted and
completed cleanly, not silently refused.

**Bug 3 (found in manual testing): parking had nothing to drop onto once it wasn't the padded-to-
capacity view round 1 already gave service bays.** Before this round, `parkingView` was still derived
by exclusion (every shop car not in `serviceBayCarIds`), so `GarageScreen.vue` needed its own
screen-local `parkingSlots` computed to pad it out to capacity for empty-slot rendering. Now that
`parkingCarIds` is itself real, capacity-sized state, `gameStore.ts`'s `parkingView` returns the padded
shape directly and that screen-local computed is gone — one source of truth, not two.

**A good catch made before it became a real problem:** many existing sim test fixtures set
`serviceBayCarIds: []` alongside a nonzero `serviceBayCount` (an undersized array, since they never
needed exact positions under the old model). Rather than hand-editing every fixture to be perfectly
padded to its own bay count, `facilities.ts` gained `slotAt`/`withSlot` helpers that treat any index at
or beyond a bay array's actual length as an implicit empty slot — robust to a shorter-than-expected
array everywhere, not just tolerant of it in the handful of places that happened to need it.

**Save law: `SAVE_VERSION` 8 -> 9 — the first genuinely non-additive migration this project has
needed.** Every prior version bump was a brand-new field with a safe schema default; this one changes
an *existing* field's shape and meaning. A plain default-fill (`parkingCarIds` defaulting to `[]`)
would silently strand every already-parked car from a pre-v9 save — still present in `ownedCars`/
`activeServiceJobs`, but invisible to the new parking view. `MIGRATIONS[8]` (`saveCodec.ts`)
reconstructs both arrays instead: the old compact `serviceBayCarIds` packs into the first N service
slots (padded with `null` beyond that), and every shop car NOT in that old list — the same exclusion
rule the pre-Sprint-17 `parkingView` itself used — packs into `parkingCarIds`, padded to
`parkingBayCount`. Golden-save test coverage added: one test decodes a hand-built pre-v9 save with both
a service-bay car and cars parked only by exclusion (one owned, one an active service job's), asserting
the reconstructed arrays land correctly; another round-trips a v9 state through real empty slots to
confirm `null` positions survive encode/decode faithfully now that they carry real meaning.

Both `advanceDay.test.ts` golden-master hashes re-pinned again — the shape change (and the new sibling
field) alters `hashState`'s output even though no career script's actions or outcomes changed.

All checks green again: `pnpm typecheck` / `lint` / `format` / `test:coverage` (460 tests, up from 436)
/ `build`.

**Verified 2026-07-10, same session:** the maintainer played it after the round-2 fixes landed — "working
well... working much better," with more polish acknowledged as still wanted (tracked as ongoing feel
work, not a specific open bug). Signed off; committed.
