# Sprint 18 — Parts inventory & staged install/repair workflow

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, items #3/#4) and the
same-day design conversation. Depends on Sprint 17 for the drag-and-drop primitive (the maintainer's
explicit instruction: build it once, reuse it here). The maintainer clarified the workflow precisely:
same two-step shape as the Sprint 14 parts cart — stage freely, nothing real happens until one
Confirm — which also resolves #4.1 (undo) as a side effect rather than a separate feature. Status:
**implemented and committed** (round 1 plus the round-2 Repair/Replace redesign below). See Exit for
implementation-time findings.

## Goal

Two real problems, one workflow fixes both: (1) the player's purchased parts are never shown anywhere
— a genuine, critical gap, not a nice-to-have — and (2) every repair/install click today is instant and
irreversible, with no way to correct a misclick. This sprint adds a parts inventory screen and
reworks owned-car repair/install into the same stage-then-confirm shape the parts market cart already
uses: pick what you want done to a car (drag a part onto a component to stage an install, flip a
switch to stage a repair), freely add/remove, then one Confirm locks everything in at once.

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Stage-then-confirm shape | The parts-market cart (Sprint 14): `cartPartIds` on `GameState`, freely add/remove, nothing spent until checkout | **Direct template** — the exact same shape, applied to car work instead of purchases. Sprint 14 already proved this pattern is the right scoped exception to Sprint 11's "everything instant" default; this sprint is the second and (for now) last planned use of it. |
| Job/labor resolution | `findOrCreateJob`/`applyAvailableLaborToJob`/`resolveJobLabor` (`jobs.ts`) — already the exact "create-or-continue a job, spend today's labor against it" core | **Untouched, reused per staged action.** Confirm doesn't reimplement job creation — it calls the *same* resolvers once per staged action, in a loop, accumulating the day's remaining labor budget across them. What used to happen on N separate clicks now happens inside one Confirm click. |
| Repair equipment gate | `repairJobGate` (Sprint 13) | **Unchanged, still enforced at the same point** — inside `findOrCreateJob`, called from Confirm's loop exactly as it's called from today's instant click. Defense in depth is preserved: the UI should also prevent *staging* a repair for an ungated component (matching today's disabled-button pattern), but the real gate stays where it already lives. |
| Continuing an already-open job | `applyAvailableLaborToJob`'s existing-job lookup + `CarDetailScreen.vue`'s "Continue repair" button (already shows "Continue" vs. "Repair" based on whether a job is open) | **Deliberately out of scope for staging.** Only *starting new* work goes through stage-then-confirm; a job already in progress from a prior day's confirm keeps today's simple single-click continuation — no reason to re-litigate a decision that's already locked in. See decision 4. |
| Drag-and-drop | The composable built in Sprint 17 (`useDraggable`/`useDropZone`) | **Second consumer, as planned.** Parts in the inventory panel are draggable; each component row is a drop zone. No new drag mechanism invented here. |
| Cart-style running total / remove-anytime UI | `PartsMarketScreen.vue`'s cart panel (Sprint 14) — line items, a total, a remove button per line | **Loose template** for the staged-actions panel on `CarDetailScreen.vue` — same idea (a running list of what's queued, freely removable), adapted from "parts and yen" to "repairs and installs and labor slots." |
| Owned-part data | `partInventory` on `GameState`, `PartInstance` (id, partId, conditionPercent, genuinePeriod — verified 2026-07-10; the field is `conditionPercent`, not `condition`, which is the *car component* field name) | **Read, not restructured.** The inventory screen is a new *view* over existing data, not a new data model. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Staged car-work state.** Nothing today represents "actions the player intends to take on a car
   but hasn't committed to yet" — every action resolves the instant it's clicked. New persisted state
   (decision 1: persistent, matching the cart's own precedent) tracking, per car, a list of staged
   repair/install actions.
2. **A parts inventory screen.** No dedicated view of `partInventory` exists anywhere in the game
   today — confirmed, this is a real gap, not something to relocate from elsewhere.
3. **Cross-car staging conflicts.** Nothing today needs to ask "is this specific part already
   spoken for by a *different*, not-yet-confirmed stage elsewhere?" — a new small guard (decision 3).

## Definition of Done

- A parts inventory screen exists, listing every owned `PartInstance` (reusing the parts-market's
  existing sort/filter pattern where it makes sense), usable both as a standalone screen and as an
  embedded panel while staging work on a car.
- On a car's detail screen, repair and install are both **staged, not instant**: flipping a
  component's repair switch stages a repair; dragging a part from the inventory panel onto a
  component stages an install of that specific part. Any number of staged actions can build up before
  Confirm.
- Everything staged is freely removable with zero cost, at any time before Confirm — this **is** the
  undo mechanism (#4.1), not a separate feature bolted on afterward.
- A single Confirm control (styled as a switch/lever, not a plain button — the "physical" moment the
  maintainer asked for) locks in every staged action on that car at once: creates/continues the actual
  jobs, spends today's labor and any repair consumables for real, using the exact same resolvers the
  old instant-click flow already used.
- Continuing an already-open job (from a prior day's confirm) is unchanged — still the existing
  single-click "Continue repair" flow, not re-routed through staging.
- No sound, animation, or other "juice" this sprint — explicitly deferred by the maintainer. The
  interaction itself (drag to stage, switch to confirm) is the whole scope here.
- All checks green; new tests cover staging/unstaging with no state cost, Confirm resolving multiple
  staged actions against one shared labor budget, the equipment-gate still enforced at Confirm, and
  the cross-car part-staging guard.

## Decisions (approve / adjust before implementation)

1. **Staged work is persistent (survives reload), matching the parts cart's precedent exactly** —
   not ephemeral component-local state. Reasoning: losing carefully-chosen staged work to an
   accidental navigation or reload is at least as frustrating as losing an unchecked-out cart, and
   Sprint 14 already established that this class of "you were about to commit something" state
   belongs on `GameState`, riding the existing autosave/save-code mechanism. Scoped per car
   (`Record<carInstanceId, StagedAction[]>`), so staging on one car never affects another.
2. **Repair staging = a toggle per component; install staging = drag a part onto the component
   row.** No part-picker dropdown, no separate "choose part" screen — dragging the specific
   `PartInstance` you want directly onto the component *is* the selection. Matches the maintainer's
   explicit ask ("open this inventory and the player picks the part") via the physical gesture instead
   of a second UI step.
3. **A part staged on one car is unavailable to stage on another until its stage resolves (confirmed)
   or is explicitly unstaged.** Without this, the same `PartInstance` could theoretically get dragged
   onto two different cars' staging areas before either confirms. The inventory panel simply omits (or
   visibly greys out) any part instance already staged elsewhere.
4. **Staging applies only to *starting* new work, never to continuing work already in progress.**
   An open job from a prior confirm keeps today's existing single-click "Continue repair" flow
   unchanged — there's nothing to reconsider about a decision already locked in, so re-staging it would
   be needless ceremony. Confirmed scope boundary, not an oversight.
5. **Confirm is per-car, not global.** Each car's staged actions confirm independently — there's no
   "confirm everything across every car in the shop at once" mega-button. Matches how the maintainer
   described the workflow ("on the car") and keeps the mental model simple: one car, one staging area,
   one confirm.
6. **No sound/animation this sprint** — explicit maintainer call, tracked as a deferred follow-up for
   whenever "juice" work happens generally (dyno animations, touge cutaways, etc. are all in the same
   deferred bucket already).
7. **Staged-work lifecycle edges (added in review, 2026-07-10 — the first draft didn't address
   either).** (a) A car can leave state with staging still pending: sold via walk-in, listed for
   sale, or — for a customer car — its service job resolving (by click or deadline backstop) or being
   given up. Every one of those exit paths must drop `stagedCarWork[carId]`, otherwise the entry
   dangles forever and, worse, any staged install's `PartInstance` stays greyed out in the inventory
   for the rest of the career via decision 3's cross-car guard. (b) Customer cars
   (`activeServiceJobs[].car`) use the exact same `CarDetailScreen.vue` repair/install flow as owned
   cars, so staging applies to them identically — which is why (a) explicitly includes the
   service-job exit paths. Both need dedicated tests.
8. **Re-dragging onto an already-staged component replaces the staged install** (the displaced part
   returns to the available pool) — simplest rule, no stacking two installs on one component.

## Task breakdown

### A. Content (`packages/content`)

- [x] New `StagedActionSchema` (discriminated union: `{kind: 'repair', componentId}` |
  `{kind: 'install', componentId, partInstanceId}`) — new file `stagedWork.ts`.
- [x] `gameState.ts`: `GameState` gains `stagedCarWork: z.record(z.string(), z.array(StagedActionSchema)).default({})`
  keyed by `carInstanceId` (decision 1).

### B. Sim (`packages/sim`)

- [x] New `confirmStagedWork(state, carInstanceId, laborAvailable, context): {state, log}` — the
  Confirm resolver: reads `state.stagedCarWork[carInstanceId]`, loops each staged action through the
  existing `resolveJobLabor`/`findOrCreateJob` machinery against the day's shared remaining labor
  budget, taking it as a parameter exactly as the design's own precision note called for. Clears the
  car's staged list on completion whether or not every action could be fully labored today. A new
  `findWorkableCar(state, carInstanceId)` (`jobs.ts`) — not anticipated in the design doc — was
  extracted so `confirmStagedWork` and the game store's own pre-existing identical lookup share one
  implementation instead of two independent copies (directive 3/15).
- [x] Small staging mutators (`stageAction`/`unstageAction`) confirmed to live directly in the
  game-layer store, as the design doc's own "likely" prediction called it — plain `GameState`
  mutations plus the cross-car guard (decision 3) and the busy-component guard (decision 4), both
  enforced as real guards in the mutator, not just UI affordances.
- [x] New `clearStagedWork(state, carInstanceId)` (`stagedWork.ts`) — not explicitly named in the
  original plan, but required by decision 7: wired into `resolveSellViaWalkIn`, `resolveListForSale`,
  and `resolveServiceJob` (the last covers click-complete, give-up, *and* the deadline backstop, since
  all three already share that one resolver — see sprint08.md/sprint11.md's own precedent).

### C. Game (`packages/game`)

- [x] New `screens/PartsInventoryScreen.vue` — standalone `/inventory` route (added to the persistent
  top nav, not a contextual link, given how central this screen is) — plus a reusable inner
  `components/PartsInventoryPanel.vue`, embedded unmodified in both places.
- [x] `CarDetailScreen.vue`: components section reworked — a repair checkbox per non-busy row, a
  drop-zone per non-busy empty component (Sprint 17's `useDropZone`), the embedded inventory panel, a
  running staged-actions list (cart-style, freely removable), and one Confirm lever per car. A
  continuing job (decision 4) keeps the pre-existing single-click UI untouched.
- [x] `router/index.ts`: new `/inventory` route.
- [x] `gameStore.ts`: `stageAction`/`unstageAction`/`confirmCarWork` wired to the new sim pieces;
  `stagedActionsFor`/`stageableParts`/`isPartStagedAnywhere` computed views for "what's staged on car
  X" and "which part instances are currently staged anywhere" (decision 3's "omit," the simpler of the
  two design-sanctioned options, rather than grey-out).
- [x] New `components/PartCard.vue` — not in the original task breakdown, needed for the same reason
  Sprint 17 built `ShopSlot.vue`: a dynamically-changing `v-for` over owned parts needs each card's own
  persistent `useDraggable` state, which a single parent `<script setup>` can't safely provide.

### D. Testing

- [x] Sim: `confirmStagedWork` — multiple staged actions sharing one labor budget, the equipment gate
  still refusing a staged repair at confirm time, a part staged then unstaged never creates a job,
  partial-labor-today leaves a normal continuable job behind (`stagedWork.test.ts`).
- [x] Sim/game: decision 7's lifecycle cleanup — staged work dropped on walk-in sale, listing, and
  service-job resolution via both click and the deadline backstop (`selling.test.ts`,
  `serviceJobs.test.ts`, `gameStore.stagedWork.test.ts`), and the displaced parts return to the
  stageable pool (decision 8's replace behavior).
- [x] Content: schema/fixture updates for `stagedCarWork` across every raw `GameState` test fixture
  (the same mechanical ripple Sprint 17's `parkingCarIds` addition needed).
- [x] Game: staging/unstaging costs nothing (cash and labor both unchanged until Confirm); the
  cross-car guard (decision 3); the busy-component guard (decision 4); the inventory screen's
  standalone render and its omission of staged-elsewhere parts; drag-to-stage via Sprint 17's
  composable, including a real simulated-pointer-event drag (not just calling store methods).
- [x] Save: `SAVE_VERSION` bump 9→10 (Sprint 17 already took 8→9, correcting this doc's original
  "next in sequence — Sprint 15 already takes 7→8" guess) + golden-save additive test for the new
  `stagedCarWork` field, matching every prior additive-bump precedent.
- [x] Golden masters re-pinned (the new `GameState` field changes every hash, same as every prior
  sprint that added one).

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access.

**User-only:** play the actual staging flow — this is the sprint most likely to reveal that a design
choice reads differently in practice than on paper (e.g., whether per-car confirm feels right once
there are several cars in the shop at once). Same recurring browser-verification note as prior
sprints.

## Exit

Implemented as designed, with the reuse table's predictions holding up well against the real
codebase — `resolveJobLabor`/`findOrCreateJob`/`repairJobGate` are untouched, called by
`confirmStagedWork` exactly as planned, and the cart's stage-then-confirm shape (Sprint 14) really
was the direct template it was expected to be.

**A real, dormant bug was found and fixed, exposed by this sprint's own change, not introduced by
it.** The busy-branch "Continue repair" button called `game.repair(...)` unconditionally regardless
of which *kind* of job was actually open on a component. Before this sprint that was harmless — an
install job always completed in the exact click that created it (a single labor slot, and the old
button was disabled below that) — so a component could never be "busy" with an incomplete install
job in practice. Confirm's batch resolution changes that: an install staged *after* a repair in the
same car's list can now be left open if the repair consumed the day's whole labor budget first.
Fixed with a kind-aware `continueJob` helper (`CarDetailScreen.vue`) that calls `game.repair(...)` or
`game.install(...)` depending on the actual open job's `kind`, rather than always assuming repair.

**Two new components weren't in the original task breakdown, both following Sprint 17's own
precedent for the same underlying reason:** `components/PartCard.vue` (a single draggable part,
needed because the owned-parts list is genuinely dynamic — the same "persistent per-item composable
state" problem `ShopSlot.vue` was built to solve) and a new shared `findWorkableCar` (`sim/jobs.ts`,
extracted from a lookup the game store already had privately, so `confirmStagedWork` doesn't
duplicate it — a real, if small, reuse win directive 15 calls for).

**`PartsInventoryPanel.vue` was originally embedded, unmodified, in both the standalone `/inventory`
screen and `CarDetailScreen.vue`, exactly as the design asked — see Round 2 below for why the
`CarDetailScreen.vue` embedding was replaced.** Picking a part up on the standalone screen, then
navigating to a specific car and placing it there via the click-fallback, still works for free either
way: the drag/pick session is shared, module-level state (Sprint 17), not scoped to whichever screen
is mounted, so nothing extra needed building for that to work correctly across navigation.

**Decision 3 (the cross-car guard) implemented as "omit," the simpler of the two design-sanctioned
options** — a part staged anywhere simply disappears from every inventory view (standalone or
embedded) until unstaged or confirmed, rather than rendering greyed-out. **Decision 8 (replace)**
turned out to need no special-casing between repair and install: `stageAction` always drops any
existing staged action for the target component before adding the new one, uniformly for both kinds,
so dragging a part onto a component that already has a staged *repair* also cleanly replaces it (not
just install-over-install, which is all the design doc's own wording anticipated).

**Save law:** `SAVE_VERSION` 9→10, purely additive (`stagedCarWork` defaults to `{}`) — ordinary,
unlike Sprint 17's one-off non-additive migration for `parkingCarIds`. The doc's original "next in
sequence — Sprint 15 already takes 7→8" note was stale (Sprint 17 had already taken 8→9 by the time
this sprint actually implemented); corrected in the task breakdown above.

Both `advanceDay.test.ts` golden masters re-pinned — the new field changes `hashState`'s output even
though no career script stages or confirms anything.

490 tests (was 460); all checks green: `pnpm typecheck` / `lint` / `format` / `test:coverage` /
`build`. No new dependencies, no data-layer access.

## Round 2 — real playtest fix (same day)

The maintainer actually opened `CarDetailScreen.vue` and found the round-1 design genuinely broken in
practice, not a polish nit to defer: every component row rendered its own always-visible "drag a part"
drop zone, while the actual draggable parts lived in a `PartsInventoryPanel` embedded far below the
Confirm button — off-screen in a normal viewport, easy to mistake for "you have to drag from the
separate `/inventory` page" (which *looks* identical, since it's the same panel). A screenshot made
the clutter concrete: eight rows' worth of checkboxes, drop zones, and equipment hints, with no visible
drag source anywhere in frame.

**The fix, per the maintainer's explicit direction:** every non-busy component now shows exactly two
controls — **Repair** (unchanged mechanically, now a plain toggle button instead of a checkbox) and
**Replace**. Clicking Replace opens a new `components/ReplaceDrawer.vue` — an in-page side panel
(`position: fixed`, docked right), scoped to that one component, never a separate route. From the
drawer, every stageable part (`game.stageableParts`, unchanged from round 1) is listed with a
fits/doesn't-fit flag against the target component; a fitting part can be **clicked directly** (stages
instantly, closes the drawer — the fast path the maintainer asked for) **or dragged** onto the
component row that opened the drawer (still visible on the same screen, side by side with the
drawer — the source and the target are never more than one glance apart).

**Genuinely new, not anticipated at round 1:** `PartCard.vue` gained a `select` emit (a plain click,
distinct from the existing drag gesture and the "move…" pick-toggle button) and a `fits` prop
(dims a non-fitting card and makes it inert to the click path, without hiding it — the player still
sees their whole inventory, just told what won't work here). The install drop-zone's `accepts` check
now also requires the drawer to be open *for that specific component* — a live drag can only ever
originate from a card rendered inside the currently-open drawer, so no other row is ever a real target
regardless of fit, keeping the mental model to "Replace scopes everything to this one row."

**`CarDetailScreen.vue` no longer embeds `PartsInventoryPanel.vue` at all** — the permanent
bottom-of-screen list is gone, replaced entirely by the on-demand drawer. The standalone
`/inventory` route keeps using `PartsInventoryPanel.vue` unchanged, for plain browsing.

**The existing click-based accessibility fallback (pick a part via "move…", then click a target) still
works, and needed no changes** — `onReplaceClick` checks whether a part is currently *picked* first;
if so, clicking Replace completes that placement immediately (the same `accepts`/`onDrop` a live drag
uses) instead of opening the drawer. This means a part can be picked from the standalone `/inventory`
screen and placed on a car's Replace button without ever opening that car's drawer at all — the
pick/place path and the new drawer path coexist without conflicting, both resolving through the same
underlying `useDropZone`.

493 tests (was 490); all checks green again: `pnpm typecheck` / `lint` / `format` / `test:coverage` /
`build`.

**Verified 2026-07-10, same session:** the maintainer ran a quick check of the Repair/Replace + drawer
redesign and confirmed it looks successful. A full playtest pass (per-car Confirm feel with several
cars staged at once, drawer width/dock position, general polish) is planned for the next dedicated
playtest session, not this quick check — tracked in `TODO.md`. Signed off; committed.
