# Sprint 65 - Chrome: a real main menu, one honest save surface, tooltips not clutter, symmetry

**Source:** playtest 2026-07-14 pass 2, items 1, 2, 4, 5, 11. Batched last as pure chrome,
but item 1 is a real structural change: the menu must stop being a tab.

## Confirmed current state (code discovery, 2026-07-14)

- **The menu is a tab inside the chrome.** `App.vue` renders the header + nav
  unconditionally; `/menu` is a nav link like any gameplay screen. `route.meta` is used
  nowhere in the app - a clean mechanism is free. Boot already lands on `/menu`
  (`main.ts:19-24`); Escape already routes there with the Sprint 51 priority order.
- **"Save: Save".** `MenuScreen` renders a "Save" `<h2>` above `SaveMenu`, whose own UI is a
  small mismatched "Save" toggle button opening a nested popover. `SaveMenu` is mounted
  nowhere else.
- **Gate sentences inflate cards.** The audit found the always-visible gate texts:
  `.rep-hint` x3 (both facility cards + tool-wall next-rungs), `.listing-hint`,
  `.tier-rep-req` - each inflating its card/node against siblings. `GarageScreen` and
  `ServiceJobsScreen` are already clean (HelpHint / `title` respectively); `AuctionScreen`'s
  disabled buttons explain nothing (fixed in Sprint 64).
- **Symmetry:** `.hero-card`, `.tier-node`, `.purchase-card`, `.tool-column h4` are all
  content-driven heights with no min-height; "Suspension and Brakes" (and Sprint 63's
  "Wheels and Tyres") wrap to two lines while siblings stay on one. The in-repo precedent
  is `ShopSlot.vue`'s explicit `min-height: 84px`.
- **Greyed-but-clickable:** `.part.no-fit { opacity: 0.55 }` dims fully buyable rows
  (`PartsMarketScreen`), reading as disabled.

## Reuse analysis (directive 16)

**New mechanisms:** route-meta chrome gating (one `v-if`), a lightweight hover/focus tooltip
treatment, min-height sizing tokens.

**Existing mechanisms to reuse:** the Sprint 51 Escape handler and priority order (unchanged);
the boot-to-menu flow; `SaveMenu`'s store calls (`exportSaveCode`/`importSaveCode`/
`exportSessionLog`) and its ported Sprint 58 tests; the New Game confirm; `ShopSlot`'s
min-height precedent; the native-`title` precedent for secondary detail.

## Decisions

1. **A real menu (item 1).** The menu route gains `meta: { chrome: false }`; `App.vue` hides
   the header/nav on such routes (End Day is already hidden there). The Menu nav TAB is
   removed. The menu renders full screen with its own large title again - amending Sprint
   58 decision 1 without breaking its rule: still exactly one "MIDNIGHT GARAGE" on `/menu`,
   now the menu's own, since the chrome one is gone. Access: Escape (existing), plus a
   small right-aligned header control styled like the dev toggle - a control, not a tab
   (mouse players need a way in). Pause-menu semantics: Continue (and Escape while on the
   menu) returns to the PREVIOUS gameplay route, falling back to the garage on boot.
2. **One honest save surface (item 2).** `SaveMenu` drops the toggle-and-popover: its
   controls render inline, styled as the menu's own full-width buttons - Copy save code, a
   Load row (textarea revealed on demand, confirm button), Export session log. The
   redundant "Save" `<h2>` goes. All `data-test` hooks and the Sprint 58 ported tests keep
   working against the same selectors.
3. **Gate text becomes tooltips (item 5).** A small shared tooltip treatment (CSS
   hover/focus-visible, keyboard reachable; `title` reserved for secondary detail). The
   audited texts - `.rep-hint` x3, `.listing-hint`, `.tier-rep-req`, the facilities standing
   line - leave their cards: a gated card/node renders dimmed with its price still legible,
   and the reason lives in the tooltip. This is a full-audit sweep: any remaining
   always-visible gate-explanation found during implementation moves too, and the sprint
   doc's Exit lists every site touched.
4. **Symmetry (item 4).** With the gate text gone, sibling cards equalise naturally; lock it
   in with explicit min-heights (ShopSlot precedent) on `.hero-card` (label zone reserves
   two lines - "Suspension and Brakes"/"Wheels and Tyres" are permanent two-liners),
   `.tier-node`, and `.purchase-card`, so no future copy change re-staggers a grid.
5. **Honest affordances (item 11).** `.no-fit`'s opacity dimming goes; fit status is carried
   by the existing `.part-fit` tag (recoloured for contrast). Dimming is reserved for
   genuinely disabled controls - which, after decision 3, always explain themselves.

## Tasks

**Claude:**

1. Router meta + `App.vue` chrome gating + nav-tab removal + header menu control + previous-
   route Continue/Escape semantics; tests (chrome absent on /menu, present in gameplay;
   Continue returns to the screen the player left; exactly one title on /menu).
2. `SaveMenu` inline rework + `MenuScreen` layout; existing save tests stay green.
3. Tooltip component + the gate-text sweep on Upgrades (and any stragglers found);
   dimmed-card styling; tests (gate reason absent from card text, present via tooltip).
4. Min-height/symmetry pass on parts-market and upgrades grids.
5. `PartsMarketScreen` `.no-fit` affordance change.
6. Full gate; no balance harness (pure chrome).

**User-only (maintainer):**

- Eyeball the full-screen menu, tooltip feel, and equalised grids on a live session.

## Definition of done

- `/menu` is a full-screen menu outside the game chrome, with no nav tab, pause-menu
  Continue/Escape semantics, and exactly one title.
- One save surface, styled like the menu, no "Save: Save".
- No always-visible gate-explanation sentences remain; gated things dim and explain
  themselves on hover/focus; same-kind cards render at equal sizes.
- Buyable parts no longer look disabled. Full gate green.

## Exit

Not started.
