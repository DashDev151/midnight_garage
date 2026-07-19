# Sprint 96: The car screen answers back (playtest 2026-07-19, items 12-13)

> **Same-day amendment (playtest item 17):** the maintainer scrapped the "Shop for
> {slot}" deep-link button and the `?slot` query plumbing hours after they landed - the
> player learns to navigate the parts market, guided by the walkthrough, not teleported.
> Decisions 1-3 below stand only in their signage half: the bench empty state keeps the
> informative text (`bench-empty-{carPartId}`) and the fee-caption gating; the Shop
> button, the market's query handling, and the drawer's query are removed. The
> ReplaceDrawer link reverts to the plain market link it had before this sprint.

**Date:** 2026-07-19
**Source:** `docs/playtest_notes/playtest-notes-2026-07-19.md` items 12 (diagram condition
unreadable at a glance) and 13 (tyre-change dead end, live rage). Lands together with
Sprint 95 (whose walkthrough copy names this sprint's new control).

## The measured defect (item 13, traced click by click as a player)

Changing scrap tyres on the tutorial car today:

1. Car Detail (car in the service bay). Click the wheels on the diagram.
2. Press **Remove assembly** (instant, free). "Wheels & tyres" appears in the bench strip.
3. Click the **Tyres** chip (stamped Scrap).
4. The panel shows: name, Scrap chip, a dangling "machine shop assist +¥3,000" caption, and
   **Refit assembly**. Nothing else. Scrap cannot be reconditioned
   (`nextReconditionStep` returns null for scrap), and with no replacement tyres in
   `partInventory` there are zero `bench-swap` Fit buttons. **The panel is a dead end**: the
   one enabled control (Refit assembly) belongs to a different task, and the fee caption
   prices an action that is not on screen.
5. The invisible expected detour: Parts tab, Wheels & tyres, Tyres, Add to cart, Checkout
   (standard = next morning), End Day, back to the car.
6. Only now does the Tyres chip offer **Fit OEM Stock Tyres** (instant, charges the
   fitting-shop assist). Then **Refit assembly**.

Two aggravators: bench work is instant while the adjacent "Planned work / Confirm" panel
talks about staging (two work models on one screen with no signage), and the on-car Replace
flow already solved this exact confusion (ReplaceDrawer's empty state links to the parts
market) while the bench got nothing.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- The docked bench-member panel in `CarDetailScreen.vue` (`selectedBench` branch): the
  empty-state affordance is a new branch in the existing panel, not a new surface.
- `ReplaceDrawer.vue`'s empty state ("No parts on hand - visit the parts market"): the
  precedent AND a beneficiary (its link upgrades to the slot-prefiltered form).
- The parts market's existing department/slot drill-down state (`selectedGroup` +
  `componentFilter` in `PartsMarketScreen.vue`): the deep link sets the same state, no new
  view.
- `game.carPartLabel` / `groupForCarPart` for naming the slot in copy and resolving the
  department.
- The condition band colour tokens already used by `BandChip`/the diagram dot for the tint.
- `PartsDiagram.vue`'s existing per-part block rendering and hover state.

**Genuinely new mechanisms:**

1. A parts-market deep link: route query (`/parts?slot={carPartId}`) that
   `PartsMarketScreen` reads on mount to preselect the department and slot filter.
2. The bench empty-state action ("Shop for {slot}") shown when a bench member has no
   recondition step and no fit candidates.
3. The diagram condition tint (item 12).

## Decisions

1. **The bench panel never dead-ends.** When a selected bench member has no
   `reconditionStep` and no swap candidates, the panel states the situation and hands the
   player the next click: "No replacement tyres on hand." + a **Shop for tyres** button
   navigating to `/parts?slot=tyres`. The assist-fee caption moves inside the Fit context:
   it renders only when at least one Fit button (or the recondition button it prices) is
   present, never dangling alone.
2. **ReplaceDrawer's empty-state link upgrades** to the same slot-prefiltered deep link
   (currently it lands on the market root and the player must re-derive the department).
3. **Deep link semantics:** `slot` query names a `CarPartId`; the market resolves its
   group, enters that department with the slot filter applied, and clears the query from
   further navigation (it is an entry hint, not persistent state).
4. **Diagram condition tint (item 12):** each diagram part block gets an always-on,
   low-alpha wash of its condition colour (glanceability is the requirement, so it cannot
   be hover-only), strengthened on hover; the tiny corner dot is removed as redundant. The
   condition ramp is functional colour (same family as BandChip), not neon accent, so the
   art bible's rule-of-glow is respected; alpha stays low enough that the sprites read
   first. Uncertain/unknown bands keep a neutral wash.
5. **No mechanics change.** Bench ops stay instant; staging/Confirm stays as is; the
   sub-assembly model (the maintainer's own Sprint 84-88 ruling) is untouched. This sprint
   is signage and navigation.

## Tasks

**Claude-implementable:**

- [x] `CarDetailScreen.vue`: bench-member empty-state branch ("No replacement {label} on
      hand." + `data-test="bench-shop-{carPartId}"` Shop button navigating to
      `parts?slot={carPartId}`); the swap-fee caption renders only beside a real Fit
      button. Label casing preserves acronyms ("Shop for ignition & ECU", never "ecu").
- [x] `PartsMarketScreen.vue`: validated `slot` query preselects the department and slot
      filter through the same state the cards set, then the query is dropped via
      `router.replace`.
- [x] `ReplaceDrawer.vue`: empty-state link carries the slot query.
- [x] `PartsDiagram.vue`: always-on condition wash per block (18% alpha, 28% on
      hover/focus, same palette tokens the dot used; neutral wash for uncertain; ghost
      slots unwashed; applied at both hierarchy levels since both carried the dot), corner
      dot removed.
- [x] Tests: bench dead-end describe (Shop button appears exactly when no candidates and
      no recondition; no dangling fee caption; a granted replacement restores Fit and
      removes Shop), deep-link tests (valid slot preselects, unknown slot ignored),
      diagram wash/dot tests, drawer link pin. `PartsMarketScreen.test.ts` moved to a real
      memory-router mount (case (a): the screen now reads the live route by design). Final
      state: the five screen-side files 122/122.

**User-only:**

- [ ] Judge the tint alpha live (too loud vs too subtle) in the next playtest pass.

## Exit

- [x] Narrow test evidence (single files, once each at final state): the five screen-side
      test files 122 passed, including the one harness fix (the bench deep-link test now
      drives navigation through a RouterView host so the screen's not-found redirect
      watcher retires exactly as it does in the real app). The pre-push hook on this
      commit's push is the full gate (directive 20).
- [x] Copy swept personally (the two new player-facing strings are the specified
      empty-state pair); no em dashes; British spelling.
