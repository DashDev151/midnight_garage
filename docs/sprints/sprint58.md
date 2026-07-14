# Sprint 58 - Chrome cleanup: one menu title, one save surface, and a parts market that shows its cart

**Source:** playtest 2026-07-14 items 1 and 10 (`docs/playtest-notes-2026-07-14.md`). Small,
independent UI polish; batched last so the economy arc and the bigger UI sprints go first.

## Confirmed current state (code discovery, 2026-07-14)

**Menu (item 1):**

- `App.vue:65` renders `<h1>MIDNIGHT GARAGE</h1>` in the always-on header chrome;
  `MenuScreen.vue:55` renders an identical `<h1>` in the screen body - both visible at once on
  `/menu`. The nav bar itself has no save control; the duplication is entirely inside
  `MenuScreen.vue`.
- The two save UIs are: (a) the inline `.load-panel` (Sprint 40 - textarea + "Load save code"
  button wired to `game.importSaveCode`), and (b) the Save section (Sprint 51) mounting
  `SaveMenu.vue`, which contains its OWN load textarea + button (same store call) plus "Copy
  save code" and "Export session log". `SaveMenu` is the strict superset.
- No test asserts on title count or on both load UIs coexisting; `MenuScreen.test.ts`'s load
  tests (invalid-code error, disabled-until-pasted, valid-code navigates) exercise the inline
  panel's selectors.

**Parts market (item 10):**

- `PartsMarketScreen.vue`: the cart rail (`<aside class="cart-rail">`, cart panel + On order)
  is inside the non-home `v-else` branch - structurally absent on the hero-grid home view, so
  cart contents are invisible from home.
- Category names come from content: `componentDisplayNames.json:5` `"suspension":
  "Suspension"`, read through the shared `componentLabel()` helper. Brake parts
  (`brakePadsDiscs`, `brakeCalipersLines`) genuinely live under the `suspension` group in
  `parts-taxonomy.json`, so the rename is accurate, not cosmetic fiction.
- Rename blast radius (all read the same content key, zero code edits): parts-market hero card
  and breadcrumb, CarDetail group headers, Upgrades tool-wall column header and classifieds
  line, day-log tool-upgrade lines, DevConsole. `specialtyCopy.json`'s suspension flavor
  ("the chassis works") is a separate copy surface and does NOT change.
- The JSON/schema still carry dead pre-Sprint-26 keys `"brakes"` and `"forcedInduction"` -
  required by the schema, read by nothing.
- Navigation back from a department is only the breadcrumb root ("Parts market"); `returnHome()`
  already does exactly what a Back button needs. Tests query by `data-test`, none string-match
  "Suspension" - the rename is test-safe.

## Reuse analysis (directive 16)

**New mechanisms:** none. Every change is a relocation, a deletion, or a content string.

**Existing mechanisms to reuse:**

- `SaveMenu.vue` absorbs the menu's load affordance (it already has one); `MenuScreen`'s inline
  panel is deleted, its behavior tests ported to `SaveMenu`'s selectors.
- `App.vue`'s chrome title stays the single title; `MenuScreen`'s `<h1>` goes.
- `returnHome()` backs the new Back button verbatim.
- `componentDisplayNames.json` + `componentLabel()` make the rename a one-string content edit
  (the Sprint 25 display-name law paying rent).

## Decisions

1. **One title.** Delete `MenuScreen.vue`'s own `<h1>`; the app chrome's title is the title.
   The menu keeps a lighter section identity (its existing layout minus the redundant h1).
2. **One save surface.** Delete the inline `.load-panel`; the Save section (`SaveMenu`) is the
   single save/load/export surface on the menu. Port the three load-behavior tests to
   `SaveMenu`'s `import-save` flow so no behavior coverage is lost (SaveMenu's own load path is
   currently untested - this closes that gap too). Keep Continue / New Game confirmation /
   Settings stub untouched.
3. **Cart always visible.** Restructure `PartsMarketScreen` so the cart rail renders on all
   three views including home (rail moves outside the view branch; home becomes hero grid +
   rail in the same `.market-layout` shell). New test: cart contents visible on the home view.
4. **"Suspension and Brakes".** One content string edit in `componentDisplayNames.json`. Check
   the two tightest render sites (tool-wall column header, hero card) for wrapping with the
   longer label and adjust CSS only if needed. `specialtyCopy.json` untouched; flagged to the
   maintainer as an optional follow-up if the Specialty copy should ever match.
5. **A real Back button.** In department and browse-everything views, a `< Back` button (new
   `data-test="market-back"`) beside the breadcrumb, calling `returnHome()`. The breadcrumb
   stays.
6. **Dead-key cleanup (hygiene, same files):** drop `"brakes"` and `"forcedInduction"` from
   `componentDisplayNames.json` and its schema, with the content test updated - schema-required
   dead weight goes.

## Tasks

**Claude:**

1. Menu: h1 removal, load-panel removal, test ports (MenuScreen + SaveMenu).
2. Parts market: rail restructure + cart-on-home test; Back button + test; rename + wrap check;
   dead-key cleanup + content test.
3. Full gate; no harness (pure UI/content-copy, zero sim surface); Exit filled.

**User-only (maintainer):**

- None; visual glance at the slimmer menu and the home-view cart on the next playtest.

## Definition of done

- `/menu` shows "MIDNIGHT GARAGE" exactly once and exactly one save/load surface, with no lost
  behavior coverage.
- The cart (and On order) are visible from the parts-market home view; a Back button exits a
  department without hunting the breadcrumb.
- The suspension category reads "Suspension and Brakes" everywhere the group label renders.
- Full gate green.

## Exit

Not started.
