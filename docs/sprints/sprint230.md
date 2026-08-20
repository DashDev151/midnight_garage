# Sprint 230: the job card, the trolley, and the on-car flow

**Status:** Planned
**Arc:** `repair-refactor-arc.md` sprint 7 of 9. Depends on 229.
**Scope:** game package. CarDetailScreen's repair surface is replaced: job card panel
(spec 8), in-situ Service and fixed-surface work via the tool trolley (spec 7.3), the
hire-day refit warning, tyre-fit captions, and the day-log lines for the new events. After
this sprint the player never touches the old repair path; 231 deletes it.

## Reuse analysis (directive 16)

New mechanisms: `JobCardPanel.vue` and `ToolTrolley.vue`. Reused: `repairJobCards` /
`resolveRepairStep` (225) power everything; `StepStrip` (229) is reused unchanged for
on-car steps; `WorkshopViews` remains the selection surface and is untouched; the
remove/fit/blockedBy flows keep their buttons and store actions; `dayLogFormat`'s
aggregation idiom (the body-materials pattern) formats step spam into per-part lines.

## Locked design

### JobCardPanel.vue (used by CarDetailScreen and BenchScreen)

Props: `cards: RepairJobCard[]`, `removalEnergyPoints` handling included. Renders the
spec-8 price list, one line per card (`job-card-{kind}`): job name ("Service" /
"Rebuild" / "Restore"), target `BandChip`, all-in figures (`job-card-cost-{kind}`):
"{energy} energy · {yen}" where energy = `energyPoints + removalEnergyPoints` and yen =
`partsYen + hireFeeYen`, and the tool-status chip (`job-card-route-{kind}`, locked
labels): own -> "own" (green token), hired-today -> "hired today" (green token),
hire -> "hire {fee}" (yellow token), slog -> "slog x3" (amber token), locked -> the
short reason ("needs the {shop}" / "needs the {machine}", grey token). NOTHING in the
panel is clickable; it renders no buttons (spec 8). BenchScreen swaps its 229 tab-row
cost display for this panel above the tabs (tabs remain the selector).

### CarDetailScreen surgery

- The per-part action panel's repair section (the `repair-part-{partId}` buttons, the
  `repair-ceiling-{partId}` caption, the `assist-fee-repair-{partId}` note, and the
  repair branch of `continueJob`) is REMOVED and replaced by:
  1. `JobCardPanel` for the selected part (always shown for repairable parts).
  2. For jobs runnable ON THE CAR - Service on any installed part, plus Rebuild/Restore
     on `removable: false` parts (chassis) - the 229 job tabs + `StepStrip` render under
     the panel, and the **tool trolley** renders beside them.
- `ToolTrolley.vue` (`data-test="tool-trolley"`): the DISTINCT tools of the selected
  job's remaining steps, as chips in step order (`trolley-tool-{toolId}`), current step's
  tool glowing; click semantics, shake, slog stand-in (`trolley-slog-{toolId}`), refusal
  notes and locked copy IDENTICAL to the bench board (229 section 4) - same component
  patterns, target `{ kind: 'installed', carInstanceId, carPartId }`. Header line
  (locked): "The trolley's out. Tools go back when the job's done."
- Removal flow additions:
  - When a buried part's removal route is `'hired'` (rig hired, not owned), the existing
    remove button gains a caption (`refit-warning-{partId}`, locked copy): "Refitting
    will need the {machine name} again."
  - When the route is `'slog'`, the 226 note already covers it (triple labour copy).
- The `remove-machine-note`/`assembly-machine-note` captions keep their 226 copy.
- Tyre fitting (WarehouseDrawer bench-fit note): when the wheels line is absent and
  unhired, the existing `bench-machine-note` renders (locked copy): "By hand with
  levers: triple the labour." Otherwise no note.
- Body pipeline surfaces, zone panel, sale/finance panels: untouched.

### Day log (dayLogFormat.ts)

- `repair-step` entries are AGGREGATED per car+part+kind in `classifyDayReport` (the
  body-materials-used pattern): "{Part label}, {car}: {n} steps of the {service /
  rebuild / restore}". Loose parts use the part label alone.
- `repair-job-completed` (locked): "Serviced the {part} to worn" / "Rebuilt the {part}
  to fine" / "Restored the {part} to mint", with ", {car}" appended for installed
  targets.
- The old `part-reconditioned` branch stays until 231.

## Tasks

1. `JobCardPanel.vue` + BenchScreen adoption.
2. CarDetailScreen surgery exactly as listed (remove old surfaces, add panel + tabs +
   strip + trolley).
3. `ToolTrolley.vue`.
4. Refit warning + tyre caption.
5. Day-log branches + aggregation.
6. Tests:
   - `JobCardPanel.test.ts`: five route chips render their locked labels/figures; panel
     contains zero buttons; all-in figures sum energy + removal and parts + hire.
   - CarDetailScreen tests: old repair data-tests are GONE (assert absence of
     `repair-part-*`); job cards render for a selected part; chassis shows tabs for all
     three jobs on-car; a buried part shows Service on-car and its Rebuild card routes
     `'needs-bench'` disabled; trolley glows/advances/refuses like the bench (mirror the
     229 cases against an installed target); refit warning appears exactly when the rig
     is hired-not-owned; in-situ buried Service first step costs 4+6 (assert store energy
     delta).
   - dayLogFormat tests: aggregation line and the three completion lines.
7. `pnpm typecheck` once (store surface changes).

## Checks

The three test files individually; one `pnpm test --project game` sweep; `pnpm typecheck`.

## Exit

(Fill on completion.)
