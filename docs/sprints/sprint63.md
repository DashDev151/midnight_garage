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

Not started.
