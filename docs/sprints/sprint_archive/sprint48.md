# Sprint 48 - The car page: plan, price, decide

**Source:** playtest 2026-07-13 pass 2, items 8, 15, 16, and the UI half of 17. Depends on
Sprint 47 (consumables-inclusive plan costs; the value function it previews).

## Confirmed current state (code discovery, 2026-07-13)

`CarDetailScreen.vue`: per-part rows each carry a `BandChip`, a `BandPicker` (segmented chip
buttons per target band), a "Repair to X" stage toggle, Remove/Replace buttons, and per-group
"Hide/N parts in good order" toggles (`:742-755`) on every group; the group header has its own
`BandPicker` + "Repair all to X" + a yen label. Player-visible "staged" copy at six sites
(`CarDetailScreen.vue:625,703,772,774`; `PartsInventoryScreen.vue:13`;
`PartsInventoryPanel.vue:21`). The Finances panel (`:804-847`) shows only CURRENT ledger/value -
nothing about planned work. `BandPicker.vue` is the one shared target-band control.

## Reuse analysis (directive 16)

**New mechanisms:**

- A click-per-rung repair button (replaces `BandPicker`'s chip presentation - still the ONE
  target-choosing control, shared by group row, part row, and inventory recondition).
- One global condition filter (dropdown with per-band checkboxes) replacing every per-group
  good-order toggle.
- A pre-confirm estimate block in Finances (planned costs, value after, profit after).
- A sim helper `previewPlannedWork(car, plannedActions)` returning the hypothetical post-work
  car, for value preview.

**Existing mechanisms to reuse:**

- Sprint 47's plan pipeline prices every label here (post-47 there is no hidden fee at all, so
  plan cost == charged cost by construction) - no second cost source.
- `stagedCarWork` state, `confirmStagedWork`, and the staged-actions list survive unchanged in
  the sim; only player-facing WORDS change (directive: code identifiers keep their names).
- `marketValueYen` on the preview car gives "value after planned work" - the same function the
  guide value already uses, never a parallel estimator.
- The existing drill-down (`expandedGroups`, `visibleRowsFor`) remains the page skeleton.

## Decisions

1. **One condition filter, top of the Components section.** Multi-select dropdown: Mint / Fine /
   Worn / Poor / Scrap / Missing. Default preserves today's de-noised view: worn, poor, scrap,
   missing checked; fine and mint hidden. All per-group "parts in good order" toggles removed.
2. **The repair target becomes a single click-per-rung button (maintainer decision, 2026-07-13,
   superseding the earlier slider idea as clunky).** One button per repairable row. Each click
   raises the planned target by exactly ONE band: a poor part reads "Repair to Worn - ¥X · N
   labor"; clicking plans that step and the button becomes "Repair further, to Fine - +¥Y · +N
   labor"; a third click reaches Mint. A compact chip beside the button shows the current
   planned target ("-> Fine"); the existing unplan/remove control clears the whole planned
   repair (stepping back down = clear and re-click; at most two extra clicks, acceptable - a
   tiny step-down affordance may be added at implementation if it proves annoying). Same
   pattern at group level ("Repair all to Worn/Fine/Mint", climbing from the group's worst
   repairable band) and on the inventory recondition control - one interaction pattern
   everywhere `BandPicker` is used today. **Labor feedback must come from the real repair plan
   (`ceil(grades/toolTier)`), never a hardcoded one-click-one-labor assumption** - three clicks
   is 3 labor at tier 1 but 2 at tier 2 and 1 at tier 3; that shrinking number IS the tool
   upgrade's visible payoff, so the button must show it honestly.
3. **Every repairable row shows its price.** "Repair to fine - ¥X" inline, consumables-inclusive
   (a per-part job's full real charge, from the Sprint 47 pipeline). Group header shows the
   bundled (one-job) price, so the group discount vs per-part fragmentation is visible rather
   than hidden.
4. **"Staged" becomes "Planned" in all player copy** (the six sites above): "Planned work (N)",
   "Nothing planned yet - free to add and remove until you Confirm.", `planned: (part name)`,
   and the inventory screens' wording. Test ids and code identifiers unchanged.
5. **Finances previews planned work before Confirm.** When planned actions exist, the panel gains
   an explicitly-labeled estimate column/rows: planned repair + parts spend, bill remaining
   after, guide value after (via the preview helper), projected profit after. Visually distinct
   (dimmed/italic, "estimate - not yet confirmed"). Clears when the plan empties.
6. **General declutter:** consolidate Remove/Replace into compact row-end controls, remove
   redundant inline hints (anything a HelpHint already covers), align rows on a consistent grid.

## Tasks

1. Sim: `previewPlannedWork` helper + tests (bands after planned repairs, installs applied).
2. Game: filter dropdown (+ tests: default hides fine/mint, toggling reveals); the
   click-per-rung repair button (+ tests: each click advances one band with correct marginal
   price/labor labels drawn from the real plan at tiers 1-3, clear resets the plan, group +
   part + recondition sites all share the pattern); per-row price labels (+ test against the
   Sprint 47 pipeline numbers); copy rename sweep (+ a guard test that "staged" no longer
   appears in rendered copy on these screens); Finances estimate block (+ tests: appears only
   with planned work, matches preview math, clearly labeled).
3. Verification: full gate; screenshot-level manual pass is the maintainer's (user-only task).

## Definition of done

- One filter governs part-row visibility; zero per-group toggles remain.
- Choosing a repair target is one button per row, one band per click; every step is priced with
  its marginal cost and real labor, and the displayed price is what Confirm will actually charge.
- The player can read cost, value delta, and projected profit of the whole plan BEFORE
  confirming, clearly marked as an estimate.
- No player-visible "staged" anywhere.
- Full gate green.

## Exit

**Implemented and verified 2026-07-13.**

Files touched:

- `packages/sim/src/stagedWork.ts` - new `previewPlannedWork(state, carInstanceId, context)`, a pure
  projection (no cash/labor/jobs) reused by the Finances estimate.
- `packages/sim/tests/stagedWork.test.ts` - 6 new tests covering group repair, per-part repair,
  install, multiple actions in order, no-op, and unknown-car projection.
- `packages/game/src/stores/gameStore.ts` - `NextRepairStepView`/`PlannedEstimateView` view types;
  `nextRepairStep` (group/per-part marginal next-rung diff off the real repair plan);
  `nextReconditionStep` (bench recondition's own next-rung step, reusing
  `reconditionQuoteFor`); `plannedRepairCostYen`/`plannedEstimateFor` (the Finances pre-Confirm
  estimate, built on `previewPlannedWork` + the existing `marketValueYen`/`carCostToMintYen`); all
  four exposed from the store.
- `packages/game/src/screens/CarDetailScreen.vue` - one global condition filter
  (`visibleConditions`/`CONDITION_FILTER_OPTIONS`) replacing the old per-group good-order toggle;
  click-per-rung repair buttons at both group and per-part granularity
  (`advanceGroupRepair`/`advancePartRepair`, `repairStepLabel`), each showing the real marginal
  price/labor and a separate "Clear planned repair" affordance that stays visible even once a plan
  reaches the mint ceiling; "Staged" -> "Planned" copy throughout; a new pre-Confirm Finances
  estimate block reading `detail.plannedEstimate`, dimmed/italic and explicitly labeled.
- `packages/game/src/components/PartCard.vue` - bench recondition converted to the same
  click-per-rung control via `game.nextReconditionStep`, dropping the per-instance target-band ref.
- `packages/game/src/components/BandPicker.vue` / `BandPicker.test.ts` - deleted (no consumers
  left); `packages/sim/src/bands.ts`'s now-dead `bandsAbove` helper also removed.
- `packages/game/src/screens/PartsInventoryScreen.vue`, `PartsInventoryScreen.test.ts`,
  `packages/game/src/components/PartsInventoryPanel.vue` - the two remaining player-visible
  "staged"/"unstaged" copy sites renamed to "planned"/"unplanned".
- `packages/game/src/components/PartCard.test.ts`,
  `packages/game/src/screens/CarDetailScreen.test.ts` - rewritten for the click-per-rung
  interaction pattern (real marginal targets via `game.nextRepairStep`/`nextReconditionStep`
  instead of hardcoded band literals), the new filter test ids, and a guard test asserting no
  player-visible "staged" text renders anywhere on the car-detail screen.

Real bug found and fixed during implementation: the group- and per-part-level "Clear planned
repair" button was nested inside the same `v-if` as the "Repair to…" advance button, both gated on
`nextRepairStep` returning non-null. Once a planned repair reached the mint ceiling (nothing left
to climb), `nextRepairStep` correctly returns null, but that also hid the *unstage* control -
leaving a plan the player could see (via the chip) but not clear from that row. Fixed by splitting
the advance button and the clear-chip/button into independent `v-if`s, gated respectively on
"there's a next rung" and "something is already planned here."

Deviations from the design doc: decision 6 (general declutter) was left largely as-is - the
existing Remove/Replace controls were already mutually exclusive per row (never both shown at
once), and no redundant inline hint duplicating a `HelpHint` was found, so no further consolidation
was needed beyond what decisions 1-5 already produced.

Verification: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format` clean; full suite
`pnpm test` 938/938 passing; `pnpm build` succeeds. Balance harness skipped - this sprint is a pure
UI/interaction rework with no change to any sim economic function's inputs or outputs (repair
cost/value/labor formulas are unchanged; only how the player invokes and previews them changed).
