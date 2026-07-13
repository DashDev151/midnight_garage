# Sprint 51 - Chrome: menu access, one End Day button, no spike in the build

**Source:** playtest 2026-07-13 pass 2, items 1, 2, 3, 4, and 19 (the copy sweep, minus the
Upgrades screen, which Sprint 52 rewrites wholesale).

## Confirmed current state (code discovery, 2026-07-13)

- The MenuScreen (`/menu`) is unreachable in-game: `main.ts:21` redirects there once at boot;
  `App.vue`'s nav has no Menu link. The nav DOES carry an ungated "Spike" link (`App.vue:29`) to
  the art-spike sandbox, plus `SaveMenu` mounted inline among the route links (`App.vue:30`).
- `EndDayButton` renders in 6 places with no shared position: top of GarageScreen, bottom of
  Auction/PartsMarket/ServiceJobs, twice inside CarDetail (in-transit banner + Work section).
- The only keyboard handling in the app is CarDetail's local Escape-cancels-pick listener
  (`CarDetailScreen.vue:459-463`).
- Stale copy bug found during discovery: the Upgrades header HelpHint still says "Tool upgrades
  take cash only" - false since Sprint 43. The word "gate" appears in the Tools HelpHint
  (`UpgradesScreen.vue:99`).

## Reuse analysis (directive 16)

**New mechanisms:**

- A global Escape handler and a Menu nav link.
- A single fixed-position End Day slot.

**Existing mechanisms to reuse:**

- `MenuScreen` already exists (Sprint 40) - it gains a section, not a rewrite. `SaveMenu` moves
  house intact; every save/export/import flow inside it is untouched.
- `EndDayButton` is already ONE shared component (Sprint 24) with its own cart-confirm modal -
  it just gets ONE mount point instead of six.
- The router's existing route table; the spike route stays in code, gated.
- CarDetail's pick-cancel Escape handler keeps priority (it already exists; the global handler
  defers to it).

## Decisions

1. **Menu access (item 1):** a "Menu" link at the end of the nav, plus a global Escape keybind
   that navigates to `/menu`. Guards: ignore while focus is in an input/textarea/select; if a
   modal (DayReport, JobComplete, End-Day cart confirm) is open, Escape closes the modal
   instead; CarDetail's pick session consumes Escape first (existing behavior). MenuScreen gains
   a "Back to the garage" action when a run is live (Continue already covers it - verify the
   label reads right mid-session).
2. **Save moves to the menu (item 2):** `SaveMenu` unmounts from the nav and mounts on
   MenuScreen in its own "Save" section. The save-code export flow stays one click from the
   menu (Save law: keep the export flow prominent - the menu is now one Esc away from anywhere,
   which satisfies it).
3. **One End Day button, bottom right (item 3):** rendered once in `App.vue` as a fixed
   bottom-right overlay, visible on gameplay routes only (not menu, not modals-open state
   changes). All six per-screen instances removed. `<main>` gets bottom padding so content never
   hides beneath it. The cart-confirm behavior rides along unchanged.
4. **Spike out of the build (item 4):** the `/spike` route registers only under
   `import.meta.env.DEV`, and the nav link is removed entirely (dev reaches it by URL). Code
   fully retained per the maintainer's instruction.
5. **Copy sweep (item 19, partial):** fix the stale "cash only" Upgrades header hint (it is
   factually wrong today - a truth bug, not just tone); remove "gate" from any player-visible
   string outside UpgradesScreen's tool wall (Sprint 52 rewrites that screen's copy). Add a
   lightweight guard test asserting a small banned-word list ("gate", "staged", "dev") never
   appears in rendered HelpHint/template copy, so dev-speak can't silently return.

## Tasks

1. Game: nav link + global Escape (+ tests: navigates, defers to modal close, ignores inputs);
   SaveMenu relocation (+ existing SaveMenu tests re-pointed); fixed End Day slot (+ tests: one
   instance app-wide, present on gameplay screens, absent on menu; cart-confirm still fires);
   spike gating; copy fixes + the banned-word guard test.
2. Verification: full gate; `pnpm build` confirmed to exclude the spike chunk from the shipped
   nav (chunk may still emit - acceptance is "unreachable in prod", not "absent from dist").

## Definition of done

- Esc (or the nav link) reaches the menu from any gameplay screen; Save lives on the menu.
- Exactly one End Day button exists, fixed bottom right, identical on every screen that has it.
- No route or link reaches the art spike in a production build.
- The banned-word guard passes repo-wide.
- Full gate green.

## Exit

**Implemented and verified 2026-07-13.**

- `packages/game/src/App.vue` - a "Menu" nav link (replacing the removed "Spike" link); a global
  `keydown` handler (Escape) that, in order, defers to a focused input/textarea/select, defers to
  CarDetail's own pick-cancel handler (`useDragSession`), closes DayReport or JobComplete if
  either is open, closes End Day's cart-confirm modal if open, else navigates to `/menu`; the one
  app-wide `EndDayButton` mount (fixed bottom-right via `.floating-end-day`, `show-cash`, hidden on
  the menu and the dev-only spike route), reached via a template ref for the Escape handler to
  read/close its `confirming` state; `<main>` gains bottom padding so content never sits under it.
- `packages/game/src/components/EndDayButton.vue` - `defineExpose({ confirming, cancel })` so
  App.vue's global handler can close the cart-confirm modal without new shared state.
- `packages/game/src/screens/{AuctionScreen,PartsMarketScreen,ServiceJobsScreen,GarageScreen}.vue`
  and `CarDetailScreen.vue` (both its own instances) - the six per-screen `EndDayButton` mounts and
  their now-unused imports removed.
- `packages/game/src/screens/MenuScreen.vue` - a new "Save" section mounting `SaveMenu` (moved out
  of `App.vue`'s nav); its own save/export/import logic is untouched.
- `packages/game/src/router/index.ts` - the `/spike` route now registers only under
  `import.meta.env.DEV`; confirmed via `pnpm build` that the spike screen and its entire PixiJS
  dependency chain (previously several large chunks) are absent from the production bundle
  entirely, not merely unreachable - stronger than the doc's own acceptance bar.
- `packages/game/src/screens/UpgradesScreen.vue` - the stale, factually-wrong "Tool upgrades take
  cash only" header hint fixed to state the real tools-and-bays-both-cost-cash-and-reputation rule.
- `packages/game/src/copyGuard.test.ts` (new) - a static-source guard scanning every screen's
  `<HelpHint>` copy for "gate"/"staged"/"dev" (UpgradesScreen's own tool-wall HelpHint exempted from
  the "gate" check only, per the doc's carve-out for Sprint 52).
- `packages/game/src/App.test.ts` (new, 6 tests) - Menu link + single End Day instance; Escape
  reaches the menu; Escape defers to an in-progress pick session; Escape is ignored while a text
  field has focus; Escape closes the cart-confirm modal instead of navigating, and the modal's own
  confirm button still works normally afterward.
- `GarageScreen.test.ts`/`CarDetailScreen.test.ts` - the handful of tests that used to click the
  screen's own `EndDayButton` now call `game.endDay()` directly (the same action the button calls),
  since the button no longer renders on these screens in isolation.

A real test-isolation bug was found and fixed while writing `App.test.ts`: mounted `App` wrappers
were never unmounted between tests, so each left its `window` keydown listener live; by the later
tests, multiple stale listeners fired on one Escape dispatch, one of them reading an earlier test's
already-torn-down state and navigating the shared router regardless of the current test's actual
modal state. Fixed with the same explicit-teardown array pattern `CarDetailScreen.test.ts` already
uses for the identical class of leak.

Verification: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format` clean; full suite
`pnpm test` 957/957 passing; `pnpm build` succeeds. Balance harness skipped - pure chrome/UI
restructuring, zero sim-economics change.
