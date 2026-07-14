# Sprint 63 - The work order: clean repair rows, an honest Confirm, and British spelling

**Source:** playtest 2026-07-14 pass 2, items 7, 8, 9, plus the same-day codification of
British spelling as CLAUDE.md core directive 18.

## Confirmed current state (code discovery, 2026-07-14)

- **Sentence-buttons.** `repairStepLabel` (`CarDetailScreen.vue:155-162`) builds "Repair
  to worn - ¥300 · 1 labor" / "Repair further, to fine - +¥300 · +1 labor" as the ENTIRE
  button label, on both group rows (`:576-588`) and part rows (`:617-722`), beside a
  planned-chip ("-> worn") and a "Clear planned repair" button. All plumbing is
  `game.nextRepairStep` / `game.unstageAction` / `detail.stagedActions`.
- **The Confirm number is the wrong number.** `Confirm ({{ game.laborSlotsRemainingToday }}
  labor left today)` (`CarDetailScreen.vue:765`) shows labour REMAINING today - it never
  changes as work is planned. No planned-labour total exists anywhere:
  `PlannedEstimateView` is yen-only (`gameStore.ts:249-256`), `previewPlannedWork` returns
  only a projected car.
- **"labor" survives in exactly 4 player-visible spots:** `CarDetailScreen.vue:161, 765`,
  `GarageScreen.vue:117` (HelpHint), `AuctionScreen.vue:94`. No other American forms found
  in player copy (color/tire/gray/center all clean - `tyre` has been house style since the
  2026-07-10 notes). Code identifiers contain "labor" ~773 times, including persisted
  save-schema field names (`GameState.laborSlotsSpentToday`, `Job.laborSlotsRequired/Spent`).
- **Guard infra:** `copyGuard.test.ts` scans only HelpHint text in `screens/` - it would
  miss 3 of the 4 sites; a spelling guard needs a broader text-node scan.
- **"Wheels"** renders solely via `componentDisplayNames.json` -> `componentLabel()` (the
  Sprint 58 rename precedent); `dayLogFormat.test.ts:254` asserts a rendered line containing
  it (expectation update per directive 17's stale case);
  `UpgradesScreen.test.ts:61`'s substring check survives the rename.

## Reuse analysis (directive 16)

**New mechanisms:** a planned-labour total (one summed field), a spelling-guard test, a row
layout.

**Existing mechanisms to reuse:** the entire plan/stage plumbing is untouched -
`nextRepairStep`, `unstageAction`, `stagedActions`, and Sprint 48's one-click-per-band law
all stay exactly as they are; only presentation changes. `plannedEstimateFor` grows the
labour sum beside its existing yen sums. `BandChip` renders the condition pair. The
Sprint 58 one-string rename pattern carries item 9.

## Decisions

1. **Row anatomy (group and part rows identical).** Per row: part/group name |
   `BandChip` current -> `BandChip` planned (when a plan exists) | the row's planned cost |
   compact controls: a small **+** button (climbs one band - Sprint 48's interaction,
   unchanged) and an **x** (clears the plan). The +'s incremental cost ("+¥300 · +1 labour")
   renders as a quiet caption or title, never as the button label. No sentences in buttons,
   anywhere on the page.
2. **Confirm tells the truth.** `PlannedEstimateView` gains `plannedLaborSlots` (summed
   sim-side beside the yen totals). The button reads "Confirm" with the planned totals as
   data chips (¥ and labour); "N labour left today" moves to a quiet caption beside the
   button, warning (not blocking - queued work already spans days) when the plan exceeds
   what is left today.
3. **British spelling, enforced.** Fix the 4 "labor" sites. New `spellingGuard.test.ts`:
   scans template TEXT nodes (mustache expressions and attribute bindings stripped) of every
   `.vue` under `screens/` AND `components/`, plus `dayLogFormat.ts` string literals, for
   banned American forms as whole words (labor, tire, color, gray to start). Code
   identifiers are exempt per directive 18 - renaming `laborSlotsSpentToday` and friends
   means a save migration for zero player value; flagged as a maintainer-optional follow-up,
   not this sprint.
4. **"Wheels" -> "Wheels and Tyres"** (item 9): one string in `componentDisplayNames.json`;
   the `dayLogFormat` test expectation updates (directive 17, stale case). Note for Sprint
   65: this makes a second group label that wraps to two lines - the symmetry work sizes for
   it.

## Tasks

**Claude:**

1. Sim/store: `plannedLaborSlots` summed into the estimate; unit test.
2. Game: repair-row rework (group + part + the bench recondition row for consistency),
   Confirm rework; component tests (chips show current -> planned; + climbs one band; x
   clears; Confirm shows the planned labour and updates as the plan changes; caption warns
   on overflow).
3. Copy: the 4 fixes; `spellingGuard.test.ts`; the Wheels rename + test expectation update.
4. Full gate; no balance harness (labels and a display-only derived sum; zero sim-economics
   change - if any golden hash moves, treat it as a bug).

**User-only (maintainer):**

- Decide eventually whether code identifiers should also be renamed (save migration); not
  blocking.

## Definition of done

- No sentence-buttons on the car page; every repair row reads current -> planned condition
  with cost and labour as separate elements.
- Confirm shows what the plan will spend, not what is left; the remaining-today figure still
  visible as a caption.
- Zero American spellings in player copy, guard-enforced; "Wheels and Tyres" everywhere the
  group label renders; full gate green.

## Exit

Implemented and committed.

**Clean repair rows (decision 1).** Every repair control on `CarDetailScreen.vue` (group rows and
per-part rows) is now compact: when a repair is planned, a `current BandChip -> planned BandChip`
preview; the climb-one-band control is a single **+** button whose visible text is just "+"
(the full "Repair to X" phrase moved to its `title`/`aria-label`), with the incremental cost
("+¥300 · 1 labour") as a quiet caption beside it; and an **x** clears the plan. No sentence lives
in a button anywhere on the page. The `PartCard.vue` bench-recondition control got the same
treatment for consistency (a **+** button plus a "-> worn · ¥300 · 1 labour" caption, replacing
its own "Recondition to worn (…)" sentence-button). All the `data-test` hooks
(`stage-repair-*`, `unstage-repair-*`, `recondition-part-*`) and the underlying plan/stage
plumbing are untouched, so the interaction is identical - only the presentation changed.

**Honest Confirm (decision 2).** `PlannedEstimateView` gained `plannedLaborSlots`, summed in the
store with the exact accounting `confirmStagedWork` uses (a repair action's
`planGroupRepair.laborSlotsRequired` when it has real work, plus `INSTALL_LABOR_SLOTS` per planned
install). The Confirm button now shows the PLANNED totals (¥ and labour) as a data chip and grows
as more work is planned; the "N labour left today" figure moved to a quiet caption below, which
warns ("- the rest carries to tomorrow") rather than blocks when the plan overruns today's labour
(queued work already spans days). The button no longer shows the misleading remaining-today
number as its only figure.

**British spelling, enforced (decision 3).** Fixed the 4 player-visible "labor" sites
(`CarDetailScreen`'s `repairStepLabel`, `GarageScreen`'s HelpHint, `AuctionScreen`'s header, and
- caught by the new guard, missed in discovery - a `dayLogFormat.ts` `labor-overbooked` LINE,
which was already "Labour" in the copy; the guard's real catch was confirming no OTHER American
form remained). New `spellingGuard.test.ts` scans the visible template text of every `.vue` under
`screens/` and `components/` (script/style blocks, tags with their attribute bindings, mustache
expressions, and comments all stripped, so a code identifier like `laborSlotsRequired` or a CSS
`color:` never trips it) plus `dayLogFormat.ts`'s backtick template literals (its assembled copy),
banning `labor`/`tire`/`tires`/`color`/`gray` as whole words. The single-quoted
`'labor-overbooked'` DayLogEntry TYPE discriminant is correctly exempt (a code identifier per
directive 18, only backtick copy strings are scanned). A couple of code comments mentioning
"labor"/"labored" were fixed too (directive 18 covers comments).

**"Wheels and Tyres" (decision 4).** One string in `componentDisplayNames.json`; the
`dayLogFormat.test.ts` expectation updated (directive 17, stale case - the tool-upgrade log line
now reads "Upgraded Wheels and Tyres to …"), and `UpgradesScreen.test.ts`'s `includes('Wheels')`
substring check survives the longer label unchanged.

**Testing.** New: 4 `CarDetailScreen.test.ts` tests (no sentence-buttons - the + button's text is
just "+" with a British-"labour" caption; the current -> planned band preview appears on stage and
clears on x; Confirm shows the planned labour and grows as work is added; the caption warns
without blocking when the plan overruns today), 1 `gameStore.stagedWork.test.ts` unit test
(the estimate's `plannedLaborSlots` equals the plan's own labour figure), the new
`spellingGuard.test.ts`, and a directive-17 update to the one existing test that asserted the
group button had no `title` (it now legitimately carries the step-description tooltip, not the
retired needs-equipment gate one).

**Verification.** Full gate green: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (1071 tests, 81 files; coverage 91.58%/82.19%/93.00%/95.37%, all above the
ratchet floor), `pnpm build`. No balance harness run - labels and a display-only derived labour
sum, zero sim-economics change; every sim golden hash held unchanged (the full test run passed),
confirming no behaviour moved.

**Definition of done, checked against the sprint doc:**
- No sentence-buttons on the car page; every repair row reads current -> planned condition with
  cost and labour as separate elements - yes (and the bench recondition control too).
- Confirm shows what the plan will spend, not what is left; the remaining-today figure still
  visible as a caption - yes.
- Zero American spellings in player copy, guard-enforced; "Wheels and Tyres" everywhere the group
  label renders; full gate green - yes.
