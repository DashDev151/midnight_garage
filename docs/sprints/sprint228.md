# Sprint 228: the garage purchase page and the hire panel

**Status:** Complete, ready for review. Not committed.
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

All four implementable tasks landed, plus the typecheck run task 5 names. Game package only:
no file under `packages/sim` or `packages/content` was touched, and both sim golden masters
were run to prove it rather than assumed. `UpgradesScreen.vue` is now the garage purchase
page in three named places, the machine-hire panel carries the lift and the one-a-day cap,
and the store's hire action is `hireToolLine`. Task 3's two day-log branches were already
live from sprint 226, so nothing was written for them; see deviation 1.

### The three sections as shipped

The screen keeps its existing `Facilities` bays section at the top (untouched, `buy-service-bay`
/ `buy-parking-bay` / `buy-forecourt-bay`), then the three new sections in the doc's order.
The membership rule is the screen's header comment, verbatim from the spec: work AT it, bench;
car goes ON it, bay; walk INTO it, room. Every panel, chip, tooltip and grid is the screen's
existing idiom; no new art, no new CSS dialect.

1. **Benches** (`garage-benches`). One `bench-group-{benchId}` block per bench, ordered by
   `WORKBENCH.benches` and populated by `WORKBENCH.benchByGroup`, so the grouping is read from
   content rather than restated in the component: `bench-group-engine-bench` (engine),
   `bench-group-chassis-bench` (drivetrain, suspension, wheels), `bench-group-body-trim-bench`
   (body, interior), each headed by the bench's own `displayName`. Each line is a
   `tool-line-{componentId}` row keeping today's ladder rendering and both existing data-tests
   (`tier-node-{componentId}-{tier}`, `upgrade-tool-{componentId}`) plus the existing
   `gate-tip-rep-{componentId}` and `gate-tip-tier-{componentId}-{tier}` tooltips. A row whose
   covering room is owned renders a `line-shop-chip-{componentId}` chip reading `Shop` in place
   of the rung 2 button. The unbought-rung subline is `tool-line-note-{componentId}`: "Fills the
   {bench displayName} board and brings its rig."
2. **The bay** (`garage-bay`). Two rows, lift first.
   - `lift-row`: name "Two-post lift", subline "Under-car work runs lighter on the lift.",
     then `hire-lift-upgrades` (priced from `game.liftHireFeeYen`, disabled on cash),
     `buy-lift` (priced from `game.liftPurchasePriceYen`, disabled by
     `game.liftPurchaseGateReason`), and `gate-tip-lift` carrying the screen's standard
     "Your standing isn't there yet - needs {tier} reputation" copy. Owned shows a
     `lift-chip` reading `In-house`; hired today shows the same `lift-chip` reading
     `Hired today`. Every figure comes from `ECONOMY.lift` through the store: the component
     holds no price, no fee and no tier.
   - `dyno-row`: the old dyno column's content as a row, `buy-dyno` and `gate-tip-dyno`
     unchanged, `dyno-hire-line` still under the list.
3. **Rooms** (`garage-rooms`). The three shop cards exactly as before
   (`tool-shop-{shopId}`, `tool-shop-covers-{shopId}`, `buy-tool-shop-{shopId}`,
   `gate-tip-shop-{shopId}`, `tool-shop-owned-{shopId}`), each gaining one subline
   `tool-shop-restore-{shopId}`: "Restore work for {covers} happens in here."

The 7-column tool wall is gone with its `.tool-column` grid, and with it the retired
`dyno-column`, `dyno-node` and `line-shop-{componentId}` data-tests. Nothing outside this
screen referenced any of the three (checked across `packages/`).

### The hire panel

Row order in `CarDetailScreen.vue`'s `machine-hire-panel`, top to bottom: the six
`machine-hire-row-{group}` lines in `ComponentIdSchema.options` order (engine, drivetrain,
suspension, wheels, body, interior), then `machine-hire-row-lift`, then
`machine-hire-row-dyno`, then `machine-hire-row-machine-shop`. The six lines and the last two
rows are otherwise untouched: same data-tests, same copy, same gates.

The lift row mirrors the dyno row's shape exactly: `machine-hire-chip-lift` reading `In-house`
when owned, the same data-test reading `Hired today` when the day's hire is paid, else a
`hire-lift` button reading "Hire for the day ({fee})". It sits outside the one-a-day cap,
which is a bench-machinery allowance, not a bay one.

Cap behaviour: `hireCapNote` is non-null only while `game.hireCapReachedToday`, and names the
line holding the tag through the same `MACHINE_LINE_NAMES` map the day log uses. Each of the
other five rows then renders its `hire-machine-{group}` button disabled (its `title` the
existing "Another line is already hired today") with a `hire-cap-note` caption beneath it:
"One line a day. The {hired line name} has the tag on it." The hired line's own row never
carries the caption, because that row shows its chip instead of a button. Re-hiring the same
line is still the free no-op it was, so its row does not change and the cap does not move.

### The rename

`hireMachineLine` -> `hireToolLine` on the store, aligning with the sim's own
`resolveHireToolLine`. One production call site moved (`CarDetailScreen.vue`'s
`onHireMachineLineClick`); no data-test changed; the queued sim action type is still
`hireMachineLine`, which is sim and session-event surface this sprint does not touch. The
store getter `hireMachineLineGateReason` keeps its name, matching the sim function it wraps.
Twenty test call sites updated across seven test files.

### Day log

Already live, unchanged this sprint. `lift-hired` formats as "Hired the two-post lift for the
day ({fee})" at `dayLogFormat.ts`, and the purchase reads "Bought the two-post lift ({price})"
off the existing `equipment-purchased` entry under the id `lift`; both have tests in
`dayLogFormat.test.ts`. Both landed with the lift itself in sprint 226 (`d6f7f82`).

### Files landed

Modified (no new files this sprint):

- `packages/game/src/screens/UpgradesScreen.vue`: the three sections, the bench grouping read
  from `WORKBENCH`, the lift row, the `Shop` chip, the two new sublines, and the retirement of
  the tool-wall grid.
- `packages/game/src/screens/CarDetailScreen.vue`: the lift hire row, `hireCapNote` and the
  `hire-cap-note` caption, the renamed call, and one flex rule so a full-width caption cannot
  squeeze its row's name.
- `packages/game/src/stores/gameStore.ts`: `hireMachineLine` renamed to `hireToolLine`, and a
  new `liftHiredToday` getter derived from `liftAvailableToday && !liftOwned`.
- `packages/game/src/screens/UpgradesScreen.test.ts`: 22 tests. Four new (each bench lists its
  own lines; the lift row's reputation and cash gates and its buy; the lift row's hire; the
  rooms' coverage sublines), six reshaped onto the new structure, one retitled.
- `packages/game/src/screens/CarDetailScreen.test.ts`: two new tests (the lift row's three
  states; the cap disabling the other five buttons with the verbatim caption while the hired
  line stays a no-op), plus the rename at eleven call sites.
- `packages/game/src/stores/gameStore.{toolLines,garage,ledger,directWork,lift}.test.ts` and
  `gameStore.test.ts`: rename only.

### Evidence

Each command run once. Raw output, trimmed to the result lines.

`pnpm test --project game`:

```text
 Test Files  91 passed (91)
      Tests  1336 passed (1336)
   Duration  38.61s
```

`pnpm typecheck` (the directive 20 carve-out: an exported store action was renamed) failed
first, on this sprint's own new test code, and was fixed before the pass below:

```text
packages/game typecheck: src/screens/UpgradesScreen.test.ts(49,52): error TS18046: 'el' is of type 'unknown'.
```

Directive 17 case (a): a real defect, not a stale assertion. The section-order test read the
DOM directly (`wrapper.element.querySelectorAll(...)` then `Array.from(...).map(el => ...)`),
which `vue-tsc` types as `unknown` and which is not the file's idiom. Vitest never caught it
because the assertion is correct at runtime. It now reads
`wrapper.findAll('[data-test="garage-benches"], ...').map((section) => section.attributes('data-test'))`,
the same data-test-selector idiom as the rest of the file, asserting exactly the same order.
No assertion was loosened. Re-run, both green:

```text
 Test Files  1 passed (1)
      Tests  22 passed (22)        (packages/game/src/screens/UpgradesScreen.test.ts)

packages/content typecheck: Done
packages/sim typecheck: Done
packages/game typecheck: Done
```

`pnpm test packages/sim/tests/advanceDay.test.ts packages/sim/tests/careerReplay.test.ts`:

```text
 Test Files  2 passed (2)
      Tests  23 passed (23)
```

Both golden masters GREEN with no re-pin, which is the required result: this is a UI sprint
and no sim golden may move for it. Nothing under `packages/sim` or `packages/content` is
modified in the working tree.

The pre-push hook remains the full gate (directive 20); lint, format and coverage were not
pre-empted.

### Deviations from the doc, with reasons

1. Task 3 (day-log branches) required no work: both lines shipped with the lift in sprint 226
   and their tests already exist. The purchase line is not a `lift-bought` day-log branch as
   the doc anticipated; the sim books the purchase through the existing `equipment-purchased`
   entry with `equipmentId: 'lift'`, and `dayLogFormat.ts` names it there, producing the
   doc's copy to the character. Adding a second entry type for the same event would have been
   a parallel mechanism (directive 16). `dayLogFormat.ts` is unmodified this sprint.
2. The doc names two call sites for the renamed action; there is one in production
   (`CarDetailScreen.vue`). The dev economy bench's `hire-machine-line` action kind calls the
   sim's `resolveHireToolLine` directly and is the bench's own vocabulary, not the store
   action, so it is left alone.
3. The doc puts the "Hired today" / "In-house" chip on the hire panel's lift row only; the
   Upgrades bay row grew the same `lift-chip` as well. It is a status chip, not a control:
   without it the bay row goes blank the moment a hire is paid, since the hire button hides
   and the buy button remains. Same two words, same chip classes as the panel's.
4. `liftHiredToday` is derived as `liftAvailableToday && !liftOwned` rather than reading
   `lift.hirePaidDay === day` as the doc words it. The two are the same thing for an unowned
   lift, and reusing `liftAvailable` (the predicate the sim's own discount reads) keeps one
   definition of the day stamp instead of two.
5. The rung 2 subline hides when the covering room is owned as well as when the rung is
   bought, which is one condition more than the doc's "when rung 2 is unbought". The room
   already brings the rig, so the row that shows the `Shop` chip would otherwise still be
   offering to fill the board.
6. Retiring the 7-column wall took the old `line-shop-{componentId}` footer with it, and with
   it the copy "Topped by the {shop}, in-house". The rooms section states the same coverage
   from the other direction, on the card.

### Open

One inconsistency, deliberately not fixed here: the hire panel's `hire-lift` button carries no
disabled state or refusal title when cash is short (`game.hireLift()` refuses silently), while
the five machine lines show "Not enough cash" and the Upgrades screen's own
`hire-lift-upgrades` is disabled on cash. The doc specifies neither a gate nor refusal copy
for that row, and inventing either would be an unapproved control. Worth a line in a later
sprint of the arc.
