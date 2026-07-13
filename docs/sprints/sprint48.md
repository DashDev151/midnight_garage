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

(filled at completion)
