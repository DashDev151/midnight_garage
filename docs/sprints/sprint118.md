# Sprint 118: The honest bench (workshop rework, phase 1a)

**Source design:** `docs/design/workshop-rework.md` (FINAL, maintainer-approved 2026-07-23).
This sprint lands the half of phase 1 whose levers are ALREADY SIGNED in that document: the
labour retune and config rename, machine hire as a daily unlock and running cost, and the
honest per-car ledger. Playtest items 3 and 5 (`docs/playtest_notes/playtest-notes-2026-07-23.md`)
close here. The unsigned levers (zones, materials, SKU dispositions) belong to Sprint 119 and
nothing in this sprint touches them.

## Reuse analysis (directive 16)

**New mechanisms**

- A day-keyed machine-hire state (`machineHirePaidDayByGroup`) with an explicit per-line hire
  action.
- Machine-access gating on staged work: where a fee used to be silently charged, the work now
  requires the line (owned or hired today) and surfaces a gate reason when it is not.

**Existing mechanisms to reuse**

- The day-keyed fee pattern: `attendanceFeePaidDayByTier` (`packages/content/src/gameState.ts:418`)
  plus `resolveAttendAuction` (`packages/sim/src/bidding.ts:295`) is the exact template for the
  state shape, the already-paid no-op, the zero-fee no-op, and the store wrapper.
- `machineShopAssist.feeYenByGroup` and `signatureSlotsByGroup` (economy.json lines 374-387):
  values and applicability unchanged; only the charging cadence changes. The existing
  ownership condition inside `machineAssistFeeYen` / `signatureOpFeeYen` /
  `installMachineAssistFeeYen` (`packages/sim/src/jobs.ts:367-416`) that already waives a fee
  when the shop owns the tools is preserved verbatim as the hire-not-needed condition.
- The staged-work machine (`confirmStagedWork`, `packages/sim/src/stagedWork.ts:101`) and the
  game store's planned-totals path (`plannedRepairCostYen` / `plannedStepFor`,
  `packages/game/src/stores/gameStore.ts:1872/2001`) for the honest totals.
- The day report (`packages/game/src/components/DayReport.vue`) and the ledger flow for the
  running-cost line.
- The economy approval gate re-pin flow (`packages/content/tests/economyApprovalGate.test.ts`,
  an exempt file that records the approval citation).

## Levers (all signed in workshop-rework.md, 2026-07-23)

| Lever | Was | Signed |
|---|---|---|
| `energy.energyPerGradeByTier`, renamed to `energy.energyPerBandStepByToolTier` | 10 / 6 / 4 | 5 / 4 / 3 |
| `energy.energyByClass["bolt-on"]` (the common fitting anchor) | 10 | 3 |
| `energy.energyByClass.buried` (the same 0.3 scaling applied) | 20 | 6 |
| `energy.energyByClass.surface` | 0 | 0 (unchanged) |
| Removal (`energy.actionPoints.removePart`, `removeAssembly`) | 0 | 0 (unchanged) |
| `energy.basePoolPoints` | 60 | 60 (unchanged; the pool and per-staff contribution remain live knobs for the post-rework tuning pass) |
| `machineShopAssist.feeYenByGroup` | 15000 / 18000 / 5000 / 3000 / 14000 / 7000, charged per operation | same values, charged once per line per day |

No other economy value moves in this sprint.

## Tasks

### T1: the rename and the retune (content + sweep)

- `packages/content/data/economy.json`: rename `energy.energyPerGradeByTier` to
  `energy.energyPerBandStepByToolTier`; set values `{ "1": 5, "2": 4, "3": 3 }`. Set
  `energy.energyByClass` to `{ "surface": 0, "bolt-on": 3, "buried": 6 }`.
- `packages/content/src/economy.ts` (lines 1166-1194): rename the schema field, keep the
  non-increasing refine.
- Update every reference (the complete list, from a repo grep):
  `packages/sim/src/bands.ts` (270, 275, 278, 329, 336, 382, 413), `coherence.ts` (335, 361),
  `jobs.ts` (698, 1103), `stagedWork.ts` (154), `serviceJobs.ts` (343, 367),
  `bots/serviceJobHelpers.ts` (128), `bots/bandHelpers.ts` (99),
  `packages/game/src/stores/gameStore.ts` (553, 1438, 1887, 1937, 2021, 2812, 2814, 2941),
  and the tests: `packages/content/tests/schemas.test.ts:366`,
  `packages/sim/tests/advanceDay.test.ts:227`, `bands.test.ts` (95, 98, 268),
  `energyCalibration.test.ts:28`, `stagedWork.test.ts:61`, `jobs.test.ts` (402-2107 range),
  `restorationPacing.test.ts:59`, `valueModelProbes.test.ts` (304, 448).
- Re-pin `economyApprovalGate.test.ts` in the same change, citing the signed labour table in
  workshop-rework.md (that file is exempt from the comment-hygiene guard and is where the
  citation lives).

### T2: daily machine hire (sim)

- `packages/content/src/gameState.ts`: add `machineHirePaidDayByGroup`, a partial record of
  component group to day number, mirroring `attendanceFeePaidDayByTier`.
- New sim resolver `resolveHireMachineLine(state, group, context)` plus
  `hireMachineLineGateReason`, modelled on `resolveAttendAuction`: no-op if the shop's tools
  already waive the fee for that group (the existing ownership condition), no-op if already
  hired today, otherwise deduct `feeYenByGroup[group]` and stamp the day. The spend posts as a
  running cost (the same ledger treatment as rent), never to a car's ledger.
- Remove the per-operation charge sites and replace each with a gate on
  owned-or-hired-today for the relevant group:
  - signature-slot repairs: `repairJobGate` (`jobs.ts:708-718`),
  - buried removals: `resolveRemovePart` (`jobs.ts:493, 514`),
  - installs: `completeJob` (`jobs.ts:276-282, 302-308`), including the service-job path,
  - assembly remove/refit: `assemblyMachineAssistFeeYen` charge sites (`assemblies.ts:256, 382`),
  - the tyre bench swap: `benchSwapFeeYen` (`assemblies.ts:448`), the wheel line's only use.
  The assembly fees read the same `feeYenByGroup` values with the same ownership waiver, so
  they convert under the same signed lever.
- Staged-work validation surfaces the gate so a plan needing an unhired line cannot be
  confirmed, with a reason the UI can show.

### T3: the honest ledger (game store)

- `plannedRepairCostYen`, `plannedStepFor`, and `repairSignatureFeeYen` call sites
  (`gameStore.ts:1854-2035`): planned totals become plan cost only (parts + labour); the fee
  terms disappear. The estimate, the Confirm button, and the resolution charge are the same
  number.
- Expose hire state and a `hireMachineLine` wrapper on the store (the `attendAuction` wrapper
  is the pattern).

### T4: the UI

- A "Machine hire" panel on the workshop/bench screen (the screen that hosts staged-work
  confirmation; locate via the `plannedRepairCostYen` consumers): one row per line with the
  authored copy below, showing hired/owned state.
- Staged rows that need an unhired line show the gate reason and the Confirm button explains
  itself instead of failing silently.
- `DayReport.vue`: hire spends appear as notable lines and inside the Bills figure.

### T5: tests

- Day-keyed hire regression tests (pattern: the admission tests): one fee per line per day,
  zero-fee and already-paid no-ops, ownership waiver.
- Gating tests: signature repair, buried removal, and install each refuse without the line
  and proceed with it, charging exactly the plan cost.
- Totals honesty test: estimate equals charge for a staged plan that formerly carried a fee.
- Existing labour/pacing expectations updated as case (a), intentional change, per directive
  17: the implementation deliberately changed labour costs; each touched test states this.

## Copy (authored, British English; machinery naming per maintainer review 2026-07-23)

- Panel header: `Machine hire`
- Row names: the group's tier-2 machinery display name from `toolLines.json`, verbatim and
  derived at render time, never a second hand-typed list: `Engine crane & stand`,
  `Transmission bench`, `Two-post lift`, `Tyre machine & balancer`, `MIG welder & panel
  tools`, `Upholstery & trim bench`. The maintainer rejected the abstract "line" labels:
  the player hires real machinery, so the UI names the real machinery.
- Hire button: `Hire for the day ({price})`
- Hired state chip: `Hired today`
- Owned state chip: `In-house`
- Gate reason: `Needs the {machine} for today. Hire it for the day, or buy your own.`
- Day report line: `Hired the {machine} for the day ({price})`

## Review tasks (maintainer feedback 2026-07-23, same sprint)

### T6: real machinery names

Replace every "line" label with the machinery names above, sourced from the toolLines
content (tier index 1 display name) so the hire panel, gate reasons, and day report can
never drift from the Upgrades wall. Tutorial copy updated in the same pass (authored
personally, not by agents).

### T7: the floating labour bar and End Day button

The labour bar leaves its horizontal top-of-screen home. New shape: a floating HUD cluster
fixed to the bottom-right corner on EVERY screen, identical position everywhere, layered
above the screens: a VERTICAL labour bar sitting immediately above the End Day button.
Constraints: `data-test="end-day"` survives (it is a tutorial anchor); the walkthrough
box's bottom-right placement offsets clear of the cluster so they never overlap; the old
placements are removed so the bar and button exist exactly once.

### T8: day and cash join the floating UI (maintainer order, same review)

A neat box, fixed to the TOP-RIGHT corner on every screen, same floating overlay layer as
the bottom-right cluster: the day number and the player's cash, always visible. Copy:
`Day {n}` over the formatted yen figure; aria-label "Day {n}; cash {yen}". Then every
other day, cash, and labour display card or text is REMOVED so these three figures only
ever exist in the floating UI. Constraints and rulings:

- `data-test="day-value"` moves onto the box's day element (it is the final tutorial
  step's anchor and must keep working; the box exists on every screen, so the spotlight
  always finds it).
- The auction screen's current-balance line (an earlier playtest fix) is superseded by the
  always-visible cash box and goes with the rest.
- Narrative uses of the figures are NOT displays and stay: the day report's "Day {n}"
  heading and story copy, transactional totals ("Total {yen}", prices, fees), and
  per-action labour costs written on buttons and rows. Only standing readouts of the
  day / cash / labour-pool figures are duplicates.

## Definition of done

- [x] No per-operation machine fee is charged anywhere; every former charge site (jobs and
      assemblies alike) gates on owned-or-hired-today instead. (`grep cashYen` in
      `assemblies.ts`: zero matches; `grep "machine shop assist"` across `packages/game/src`:
      zero matches.)
- [x] Estimate = Confirm = charge for every staged plan; per-car totals are parts + labour
      only. (Honest-totals tests in `gameStore.stagedWork.test.ts`.)
- [x] Hire is one fee per line per day, appears on the day report, and is waived by the same
      ownership condition that waived the old fee. (Day-keyed tests in `jobs.test.ts`,
      `dayLogFormat.test.ts`, `gameStore.test.ts`.)
- [x] `energyPerGradeByTier` no longer exists anywhere in `packages/`; the renamed key
      carries 5 / 4 / 3 and `energyByClass` carries 0 / 3 / 6. (Remaining repo hits are doc
      history and the exempt citation file only.)
- [x] Economy approval gate re-pinned in the same change with the citation
      (`a602fc613cdf6c2c7ff322e8b22cb0763256efa8ee1fd209fff887ab6b7efebf`).
- [x] New regression tests in place; touched tests updated as case (a) with the reason stated.

## Exit

- [x] Narrow checks run once, output recorded here. Final state after both implementation
      passes and the tutorial copy update:
      `pnpm test --project sim`: 57 files, 1417 tests passed.
      `pnpm test --project game`: 55 files, 707 tests passed.
      `pnpm test --project content`: 14 files, 125 tests passed.
- [ ] Pre-push gate output cited at commit

Notes recorded at completion:

- The assembly charge sites (`assemblyMachineAssistFeeYen`, `benchSwapFeeYen`) were missing
  from this doc's original T2 list; both read the same `feeYenByGroup` values with the same
  ownership waiver, so they converted under the same signed lever. The T2 list above was
  corrected before that conversion ran.
- Tutorial copy: the four lines describing the old per-operation fee (steps `wheel` and
  `engine`) were rewritten for the daily-hire model, including the honest note that hire
  lasts one day. Flow traced against the overlay: it spotlights but never blocks input, and
  gated buttons carry the gate caption, so the walkthrough cannot wedge on an unhired line.
- The tutorial's designed margin rose by about 15,000 yen (measured 20,898 against the old
  under-15,000 bound): the engine round trip now costs one hire instead of two fees. Ruled
  by the maintainer in session ("keep the margin as it was, reduce Yuki's payment amount"):
  `four-wheels` payout/budget 145,000 to 130,000, probe bound restored to 15,000, approval
  gate re-pinned with the citation, one-mistake guarantee re-verified (129,602 within the
  130,000 cap). Recorded in the economy bible's amendment log.
- Bot-career probes for service-grinder and competent-policy now assert zero successes:
  bots have no hire behaviour, so a signature task wedges their bay. Known harness
  limitation (see `TODO.md`, bot-harness rework); handled per the file's existing precedent.
- `docs/design/tooling-system.md` carries a superseded-in-part note for its per-operation
  charge model. `docs/design/economy-bible.md` amended with maintainer approval (in
  session, "adjust this doc to align to reality"): the `energy.*` audit row carries the
  renamed key, and the amendment log records the retune, the daily-hire recharge, and the
  payout trim.
