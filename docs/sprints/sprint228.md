# Sprint 228: the garage purchase page and the hire panel

**Status:** Planned
**Arc:** `repair-refactor-arc.md` sprint 5 of 9. Depends on 226.
**Scope:** game package. UpgradesScreen becomes the garage purchase page (spec section 6);
the machine-hire panel gains the lift and the one-a-day cap. No sim changes.

## Reuse analysis (directive 16)

New mechanisms: none in the sim; one reorganised screen and two panel rows. Reused:
`game.toolLineViews` / `game.toolShopViews` feed the same rows they feed today;
`upgradeToolLine` / `buyToolShop` / `buyDyno` actions unchanged; `buyLift` / `hireLift`
landed in 226; the hire panel keeps its structure, data-tests, and
`hireMachineLine` action (renamed here); `HintTooltip` carries the rep-gate copy
unchanged; day-log lines mirror the dyno's existing pair.

## Locked design

### UpgradesScreen.vue reorganised into three sections, in this order

Membership rule from the spec, stated in the screen's header comment: work AT it, bench;
car goes ON it, bay; walk INTO it, room.

1. **"Benches"** (`data-test="garage-benches"`): three bench groups in order engine bench,
   chassis bench, body & trim corner (headings from `workbench.json` `displayName`s).
   Under each, its tool line rows (engine: engine; chassis: drivetrain, suspension,
   wheels; body & trim: body, interior). Each row keeps today's ladder rendering and
   data-tests (`tier-node-{componentId}-{tier}`, `upgrade-tool-{componentId}`); a row
   whose covering shop is owned shows a "Shop" chip instead of the rung 2 buy button.
   Row subline when rung 2 is unbought (locked copy): "Fills the {bench name} board and
   brings its rig."
2. **"The bay"** (`data-test="garage-bay"`): two rows.
   - Two-post lift (`buy-lift`, `hire-lift-upgrades`): "Two-post lift", price
     ¥400,000, rep `local`, hire ¥5,000. Effect subline (locked): "Under-car work runs
     lighter on the lift."
   - Rolling road: the existing dyno column's content as a row (`buy-dyno` kept).
3. **"Rooms"** (`data-test="garage-rooms"`): the three shop cards exactly as today
   (`buy-tool-shop-{shopId}`), with one added coverage subline per card (locked):
   "Restore work for {group list} happens in here."

Rep-gate tooltips keep their current copy and data-tests. All classifieds remnants are
already gone (226). The old 7-column tool wall layout is replaced by the three sections;
keep the screen's existing visual idiom (panel cards, BandChip-style chips), no new art.

### Machine-hire panel (CarDetailScreen)

- Rows stay: six lines (`hire-machine-{group}` data-tests unchanged), then a new lift row
  (`hire-lift`, mirroring the dyno row's shape: "Hired today" chip when
  `lift.hirePaidDay === day`, "In-house" when owned), then the dyno row, then the
  machine-shop door row, all unchanged.
- Cap: when `game.hireCapReachedToday` (getter from 226) and a group is not the one
  hired, its hire button is disabled with caption (locked copy, data-test
  `hire-cap-note`): "One line a day. The {hired line name} has the tag on it."
- Store action rename: `hireMachineLine` -> `hireToolLine` (aligning with the sim rename;
  update the two call sites and the action's tests; data-test names do NOT change).

### Day log (dayLogFormat.ts)

Two new branches mirroring the dyno pair exactly:
- `lift-hired`: "Hired the two-post lift for the day ({fee})".
- `lift-bought`: "Bought the two-post lift ({price})".

## Tasks

1. UpgradesScreen reorganisation per the locked design.
2. Hire panel lift row + cap caption + action rename.
3. Day-log branches.
4. Tests:
   - `UpgradesScreen` tests: three sections render in order; each bench lists its lines;
     shop-owned chip suppresses the rung-2 buy; lift buy gates on rep/cash and calls
     `buyLift`; rooms show coverage sublines. Follow the existing mounting idiom
     (real Pinia store, `newGame`, `data-test` selectors).
   - CarDetailScreen machine-panel tests: lift row states (absent / hired / owned); cap
     disables the other five lines' buttons and shows the caption; hiring the same line
     again stays enabled.
   - dayLogFormat tests: the two new lines.
5. No typecheck run needed unless a signature moves (rename: run `pnpm typecheck` once,
   the carve-out applies to the renamed action).

## Checks

The three test files above individually; `pnpm typecheck` once (action rename).

## Exit

(Fill on completion.)
