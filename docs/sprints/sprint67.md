# Sprint 67 - The work order II: an accurate plan and a readable car page

**Source:** playtest 2026-07-15, items 7, 18, 10, 9, 16, 8, 13, 12. Everything the maintainer hit
on the car-detail screen in one pass.

## Confirmed current state (code discovery, 2026-07-15)

- **Item 7 (the stale inline cost).** `stepCost(nextGroupStepOrFallback(...), isStagedRepair(...))`
  renders the NEXT rung's incremental cost. `plannedRepairCostYen(carId)` and
  `plannedLaborSlots(carId)` (gameStore.ts:1190, 1216) are **per-CAR only** - no per-address
  variant exists. So a `Poor -> Fine` plan (2 rungs) shows "+¥4,800 · +1 labour" (the next rung)
  while Confirm correctly totals "¥9,600 · 2 labour". Both numbers are individually right; the row
  is answering a different question than the player is asking.
- **Items 18 + 10 are ONE line of code.** `rowCategory` (CarDetailScreen.vue:110-114):
  `if (row.legitimatelyAbsent) return null; if (row.missing) return 'missing'; return row.band`.
  `visibleRowsFor` passes anything whose category is `null`. So a legitimately-absent slot (forced
  induction on an NA car) is **unfilterable and always visible** - which is exactly item 18's "it
  shows missing slots even if only poor is selected" AND item 10's "an empty FI slot shouldn't
  appear under Missing". One fix closes both.
- **Item 16.** `orderedComponents` sorts `bandIndex(groupBands[a]) - bandIndex(groupBands[b])` -
  worst-band-first, introduced deliberately by **Sprint 41 decision 4** ("condition-panel
  readability"). Item 16 asks for the opposite. Mutually exclusive; see Decisions.
- **Item 9.** `expandedGroups` is a `Set<ComponentId>`; `toggleExpanded` flips one group. No
  expand-all control exists.
- **Item 8 (the radar).** `StatRadar.vue` has exactly ONE grid element - a single outer pentagon
  at magnitude 1 (`gridPolygonPoints`, radar.ts:58-66). No concentric rings, no spokes, no ticks.
  Labels sit at a fixed magnitude 1.18 with `text-anchor="middle"` and no width-aware placement,
  so long labels ride into the polygon. `viewBox` pads by `size * 0.28`.
- **Item 13.** `laborSlotsRemainingToday`/`laborSlotsPerDay` render on CarDetailScreen (a `.labor`
  caption), AuctionScreen and ServiceJobsScreen (header strips). **Nothing on GarageScreen** -
  its stat tiles are Day/Cash/Reputation/Cars owned only.
- **Item 12.** When `inTransit` is true CarDetailScreen renders ONLY an `.arriving-banner`
  (customer name, description, "nothing to do until it's dropped off") - the task list is inside
  the skipped `v-else`. The task list itself is **duplicated**: `.svc-tasks` on CarDetailScreen
  (:495-499) and `.tasks` on ServiceJobsScreen (:91-95), different classes, different guard
  placement, no shared component.

## Reuse analysis (directive 16)

**New mechanisms:** a per-address planned total (one store selector), a shared task-list
component, radar grid geometry, an expand-all toggle.

**Existing mechanisms to reuse:** `plannedRepairCostYen`/`plannedLaborSlots` already make the exact
`planGroupRepair(...)` call a per-address total needs - it is the same call body, scoped to one
staged action instead of summed over all. `stagedFor` already does the address lookup. The
Sprint 63 row anatomy (`+` button, `x`, chips, caption) stays; only which NUMBER the caption shows
changes. `radar.ts`'s `axisPoint`/`gridPolygonPoints` already parameterise magnitude - rings are
the same function at 0.25/0.5/0.75/1. `expandedGroups` is already a Set; expand-all is a bulk
add/clear. The `.stat-tile`/`dl` pattern on GarageScreen carries the labour card.

## Decisions

1. **The row shows the ROW's plan; the `+` shows the increment (item 7).** New store selector
   `plannedStepFor(carId, componentId, carPartId?)` returning `{ costYen, laborSlots } | null` for
   the action staged at THAT address (reusing `stagedFor`'s lookup + the same `planGroupRepair`
   call the per-car sums already make). The row's caption becomes the row's own planned total
   (`¥9,600 · 2 labour`), which by construction sums to Confirm's figure across rows. The `+`
   button's incremental cost moves entirely into its tooltip ("Repair further, to fine - +¥4,800 ·
   +1 labour"), where it answers "what does one more click cost" without competing with the
   planned total. *Every number on screen answers exactly one question.*
2. **A legitimately-absent slot is its own category, never `null` (items 18 + 10).** `rowCategory`
   returns `'absent'` for it; `CONDITION_FILTER_OPTIONS` gains no new checkbox - `'absent'` simply
   isn't in `visibleConditions` by default, so an NA car's FI slot no longer forces itself into
   every filtered view, and never appears under `Missing`. The filter's contract becomes total: a
   row shows iff its category is ticked. Default set unchanged
   (worn/poor/scrap/missing), so the FI slot hides by default - a `Show all` reveals it.
3. **Show all / Hide all (items 18 + 9).** Two controls on the filter row: **Show all** ticks every
   category (including `absent`); **Hide all** unticks every one. Plus **Expand all / Collapse all**
   for the group drill-downs (item 9), a bulk add/clear over `expandedGroups`. Four small buttons,
   no sentences (the Sprint 63 law).
4. **Constant component order (item 16) - Sprint 41 decision 4 is RETIRED.** `orderedComponents`
   drops the band sort and returns `COMPONENTS` verbatim: engine, drivetrain, suspension, wheels,
   body, interior - the same order every time, on every car, forever. Recorded as an explicit
   reversal: Sprint 41's rationale (surface the roughest work first) is real but loses to muscle
   memory - a panel that reorders itself as you repair it is a panel you have to re-read every
   time. The maintainer's instruction is the decision.
5. **A readable radar (item 8).** `StatRadar.vue` gains: concentric grid rings at 0.25/0.5/0.75/1
   (the same `gridPolygonPoints` at four magnitudes), a spoke per axis from centre to rim, and
   width-aware label placement - `text-anchor` derived from each axis's x-position (`start` on the
   right side, `end` on the left, `middle` at top/bottom) with the label magnitude pushed out to
   clear the rim, and the value on its own line under the axis name so neither crowds the polygon.
   `viewBox` padding grows to match. Pure presentation over the same `stats` prop.
6. **A labour card (item 13).** `laborSlotsRemainingToday`/`laborSlotsPerDay` become a first-class
   stat tile in GarageScreen's existing `dl.stats` grid (Day / Cash / **Labour** / Reputation /
   Cars owned), and the car page's `.labor` caption is promoted to the same visual weight. One
   number, two places, one source.
7. **One task list, always visible (item 12).** A new shared `ServiceTaskList.vue` (the job's
   tasks, each with its done state) replaces BOTH inline lists (`.svc-tasks` and `.tasks`) - the
   DRY the maintainer asked for. The in-transit branch stops hiding it: the arriving banner keeps
   its "nothing to do until it's dropped off" line AND renders the task list beneath it, so a
   player who forgot what the customer wants can see it (and go buy parts - the Sprint 61 fit
   filter already serves inbound cars, which this completes).

## Tasks

**Claude:**

1. Store: `plannedStepFor(carId, componentId, carPartId?)`; unit test (a 2-rung plan reports the
   2-rung total, and the per-car sum equals the sum of per-address totals).
2. Game: the row caption swap + tooltip (item 7); `rowCategory`'s `'absent'` category + the filter
   contract (items 18/10); Show all / Hide all / Expand all / Collapse all (items 18/9); constant
   `orderedComponents` (item 16); the labour tile (item 13); `ServiceTaskList.vue` + both call
   sites + the in-transit reveal (item 12). Component tests for each.
3. Game: the radar rework (item 8) + its test (rings/spokes render; labels don't share a position
   with the polygon's rim).
4. Full gate; no balance harness (pure UI + one derived selector; zero sim-economics change - if
   any golden hash moves, treat it as a bug).

**User-only (maintainer):**

- Eyeball the radar and the reordered component panel; Sprint 41 decision 4's reversal is recorded
  on this sprint's approval.

## Definition of done

- A row's cost/labour always equals what Confirm will charge for that row; the `+`'s increment
  lives in its tooltip.
- The condition filter is total (a row shows iff its category is ticked); an NA car's FI slot never
  appears under Missing; Show all / Hide all / Expand all / Collapse all exist.
- Component groups render in one constant order on every car.
- The radar has rings, spokes, and labels that never overlap the plot.
- Labour remaining is a first-class card on the garage and the car page.
- An in-transit job shows its task list; one shared component renders it everywhere. Full gate green.

## Exit

Not started.
