# Sprint 17 — Drag-and-drop foundation & garage UI

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, item #5) and the same-day
design conversation. Explicitly sequenced before Sprint 18 (parts inventory/install rework): the
maintainer's own instruction was to build one shared drag-and-drop primitive and use it for both car-
moving here *and* part-installing there ("hard agree, design as such") — this sprint proves it on the
simpler consumer first. Status: **designed, pending review.**

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

1. **Pointer Events over native HTML5 DnD** — see reuse analysis above. Recommend, not yet confirmed
   with you specifically on this point (the "hard agree" covered *building one shared primitive*, not
   this particular technical choice) — flagging so it's a deliberate call, not a silent default.
2. **Accessibility fallback: does drag-and-drop need a non-drag alternative?** Pointer-based dragging
   is unusable for keyboard-only or switch-access players. Options: (a) ship drag-only for now, revisit
   accessibility later, (b) keep a minimal click-based fallback (e.g., click a car to "pick it up",
   click a destination to "place it" — same underlying drop-zone logic, different trigger) alongside
   drag, so nothing is drag-only. Leaning toward (b) since it's cheap once the drop-zone logic exists
   anyway (the composable can expose "programmatic drop" as well as pointer-driven drop), but this is
   your call, not a default I should make silently. One extra data point for (b), found in review
   (2026-07-10): the roadmap's own accessibility sprint and Launch Definition of Done already commit
   to **full keyboard nav** — a drag-only interaction would create a known violation of that bar to
   be paid down later, so (b) isn't just preference, it's the option consistent with the plan of
   record.
3. **Drag threshold / accidental-drag prevention.** A plain click (e.g., following the existing
   `RouterLink` into a car's detail screen) needs to still work — dragging shouldn't hijack every
   click. Standard approach: require the pointer to move past a small distance threshold before a
   "drag" actually starts; below that threshold, a `pointerup` is treated as a normal click. This is a
   detail the composable handles internally, not something that needs a per-screen decision, but
   worth naming so it's not discovered as a bug later.

## Task breakdown

### C. Game (`packages/game`) — this sprint is entirely game-layer, no sim/content changes

- [ ] New composable, e.g. `composables/useDragAndDrop.ts`: exposes something like
  `useDraggable(payload: Ref<T>)` (returns bindable pointer-event handlers + a `isDragging` ref) and
  `useDropZone(accepts: (payload: T) => boolean, onDrop: (payload: T) => void)` (returns bindable
  handlers + an `isActiveTarget` ref for styling) — generic over `T`, no car/part-specific knowledge
  baked in.
- [ ] `GarageScreen.vue`: bay slots and parking rows become drop zones (`useDropZone`); car cards
  become draggable (`useDraggable`, payload = carId). Drop handler decides move-vs-swap exactly as the
  current button/dropdown logic already does (empty slot → `moveCar`; occupied → `swapCars`), just
  triggered by the drop instead of a click. `swapPicks` reactive state and the associated `<select>`/
  swap button markup removed entirely.
- [ ] Visual states (dragging/valid-target/invalid-target) styled with existing design tokens — no new
  color palette.
- [ ] If decision 2 lands on a click fallback: a minimal "select then place" mode reusing the same
  drop-zone `onDrop` handlers programmatically.

### D. Testing

- [ ] Game: the composable tested directly — drag start/move/end lifecycle, threshold behavior
  (decision 3), a drop that hits a valid zone vs. one that doesn't, without needing a real DOM
  screen around it.
- [ ] Game: `GarageScreen.test.ts` extended (or rewritten where it currently exercises the swap
  dropdown) — drag-and-drop move/swap behavior via simulated pointer events, confirming the same
  underlying `moveCar`/`swapCars` calls fire as the old UI made, and that the removed dropdown/button
  markup is actually gone.

## Claude-implementable vs user-only

**Claude-implementable:** all of the above. No new dependencies (Pointer Events are a browser
standard, not a library), no data-layer access.

**User-only:** play it — drag-and-drop is exactly the kind of interaction that needs a real hand on a
real trackpad/mouse (and touch device, if that matters to you) to confirm it *feels* right, which
automated tests can approximate but not fully judge. Same recurring browser-verification note as prior
sprints.

## Exit

*To be filled in once implemented.*
