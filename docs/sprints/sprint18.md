# Sprint 18 — Parts inventory & staged install/repair workflow

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, items #3/#4) and the
same-day design conversation. Depends on Sprint 17 for the drag-and-drop primitive (the maintainer's
explicit instruction: build it once, reuse it here). The maintainer clarified the workflow precisely:
same two-step shape as the Sprint 14 parts cart — stage freely, nothing real happens until one
Confirm — which also resolves #4.1 (undo) as a side effect rather than a separate feature. Status:
**designed, pending review.**

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

- [ ] New `StagedActionSchema` (discriminated union: `{kind: 'repair', componentId}` |
  `{kind: 'install', componentId, partInstanceId}`).
- [ ] `gameState.ts`: `GameState` gains `stagedCarWork: z.record(z.string(), z.array(StagedActionSchema)).default({})`
  keyed by `carInstanceId` (decision 1).

### B. Sim (`packages/sim`)

- [ ] New `confirmStagedWork(state, carInstanceId, context): {state, log}` — the Confirm resolver:
  reads `state.stagedCarWork[carInstanceId]`, loops each staged action through the existing
  `resolveJobLabor`/`findOrCreateJob` machinery against the day's shared remaining labor budget.
  (Precision note, verified 2026-07-10: `laborSlotsRemainingToday` is a *game-store computed*, not a
  sim helper — today's per-click flow passes its value into `resolveJobLabor` as a parameter, and the
  sim side computes the same quantity inline in `advanceDay`. `confirmStagedWork` should take the
  budget as a parameter the same way `resolveJobLabor` does, decrementing it across the loop — not
  reach for a helper that doesn't exist in `packages/sim`.) Clears the car's staged
  list on completion (whether or not every action could be fully labored today — a partially-started
  repair just continues normally via the existing "Continue repair" path afterward, per decision 4).
- [ ] Small staging mutators (`stageAction`/`unstageAction` — plain, instant `GameState` mutations, no
  new sim logic beyond the cross-car guard from decision 3) — likely thin enough to live directly in
  the game-layer store rather than needing their own sim module, similar to how cart add/remove are
  plain store mutations today; confirm exact placement at implementation time.

### C. Game (`packages/game`)

- [ ] New `screens/PartsInventoryScreen.vue` (or similar) — standalone route, and a reusable inner
  component extracted for embedding.
- [ ] `CarDetailScreen.vue`: components section reworked — repair toggle per row (styled switch, using
  Sprint 17's drop-zone/draggable primitives where install staging needs them), an inventory panel
  (the same component from the point above, in "pick a part to drag" mode, respecting decision 3's
  cross-car guard) shown while any staging is in progress, a running staged-actions list (cart-style,
  freely removable), and one Confirm lever per car.
- [ ] `router/index.ts`: new inventory route.
- [ ] `gameStore.ts`: `stageAction`/`unstageAction`/`confirmStagedWork` wired to the new sim pieces;
  computed views for "what's staged on car X" and "which part instances are currently staged
  anywhere" (for decision 3's greying-out).

### D. Testing

- [ ] Sim: `confirmStagedWork` — multiple staged actions sharing one labor budget, the equipment gate
  still refusing a staged repair at confirm time, a part staged then unstaged never creates a job,
  partial-labor-today leaves a normal continuable job behind.
- [ ] Sim/game: decision 7's lifecycle cleanup — staged work dropped on every car-exit path (walk-in
  sale, listing, service-job resolution via click *and* via the deadline backstop, give-up), and the
  displaced parts return to the stageable pool.
- [ ] Content: schema/fixture updates for `stagedCarWork`.
- [ ] Game: staging/unstaging costs nothing (cash and labor both unchanged until Confirm); the cross-
  car guard (decision 3); the inventory screen's standalone render; drag-to-stage via Sprint 17's
  composable.
- [ ] Save: `SAVE_VERSION` bump (next in sequence — Sprint 15 already takes 7→8) + golden-save
  additive test for the new `stagedCarWork` field, matching every prior additive-bump precedent.
- [ ] Golden masters re-pinned (new `GameState` field changes every hash, same as every prior sprint
  that added one).

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access.

**User-only:** play the actual staging flow — this is the sprint most likely to reveal that a design
choice reads differently in practice than on paper (e.g., whether per-car confirm feels right once
there are several cars in the shop at once). Same recurring browser-verification note as prior
sprints.

## Exit

*To be filled in once implemented.*
