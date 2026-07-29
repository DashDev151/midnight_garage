# Sprint 14 - Parts market: cart, checkout & delivery timing

*Source: playtest item #7 ("the parts-market cart/checkout overhaul"), first flagged out-of-scope in
Sprints 10/11, tracked as a placeholder in `TODO.md` ever since. **Scope corrected 2026-07-09**: the
placeholder had accreted invented scope (a junk/scrapyard grade tier, multiple vendors) that traced
back to an earlier Claude session, not to the GDD or any playtest note - moved to `IDEAS.md` as an
unapproved idea, not carried into this design. The maintainer then grounded #7 directly (2026-07-09):
it's not cosmetic - during playtesting they misclicked "Buy" on a ¥500k turbo and ate half their
capital in one click, with no confirmation step to catch it. In the same conversation they also asked
for a real delivery-timing choice: pay a surcharge for a part to land today ("express"), or pay sticker
price and wait until tomorrow ("standard"), chosen once at checkout. All six open decisions below were
resolved directly by the maintainer the same day. Status: **implemented, ready for review.** 361 tests
(was 336).

## Goal

Buying a part today is one irreversible click per catalog row (`resolveBuyPart`, Sprint 11) - nothing
stops a misclick from draining serious cash instantly. This sprint adds a real cart: add parts to a
running list, see a total, commit with one deliberate checkout click. Checkout also asks a genuine
question - express (surcharge, arrives instantly, matches today's behavior) or standard (sticker price,
arrives next day) - turning "instant buy" from the only option into a paid convenience. Also in scope:
sorting/filtering the parts catalog, currently a flat 20-item list with no way to narrow it, a gap that
only grows as the roster/parts catalog expands toward Phase 5.

**Scope note:** the delivery-timing half of this sprint is a deliberate, narrow pull-forward of what
the roadmap (`docs/design/midnight-garage-roadmap.md`) and `sprint05.md`/`sprint06.md` explicitly
assigned to **Sprint 16 ("order deliveries / lead times / parts scouts")** - not a scope violation,
since the maintainer asked for it directly as the other half of the checkout safeguard. This sprint
ships only the simplest possible version: one binary choice, a flat surcharge, a flat lead time. Sprint
16 keeps the richer version (parts scarcity, scout dispatch, variable/multi-day lead times for imports
per the GDD's Import Broker section) layered on top of this, not duplicated by it.

## Reuse analysis (directive 15 - read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| "Commit now, resolves automatically on a future day" | `PublicListingSchema`'s `resolvesOnDay` (`sale.ts`) + `advanceDay` step 7's filter-and-resolve loop over `activeListings` | **Direct template for `PendingPartOrder`** - same shape (`id`, a locked-in price, an `arrivesOnDay`), same resolution pattern (a loop each day-boundary tick: due today gets resolved, not-yet-due stays in the array). |
| Instant creation + a day-offset param | `resolveListForSale(state, carInstanceId, context, waitDaysOverride?)` | **Direct template for `resolveBuyPart`'s new order path** - same "deduct/commit now, stamp `arrivesOnDay = state.day + waitDays`" shape. |
| Instant catalog purchase | `resolveBuyPart` (`parts.ts`, Sprint 11) | **Becomes the express path, essentially unchanged** - deduct cash (now includes the surcharge), create the `PartInstance` immediately, log `part-bought`, exactly as today. |
| Bots' batch purchase path | `buyParts` on `DayActionsSchema` (Sprint 06) | **Extended, not replaced** - gains a `deliverySpeed` field; bots call the same resolver the player's checkout calls, not a parallel path. |
| Log-reason-enum extension pattern | `job-blocked`'s `reason` enum, `acquisition-blocked`'s `reason` enum (Sprints 09/13) | **Template for extending, not replacing, `DayLogEntry`** - new `part-ordered`/`part-delivered` variants slot into the existing discriminated union alongside untouched `part-bought`. |
| Bot shared decision helpers | `equipmentHelpers.ts` (Sprint 13), `bayHelpers.ts` (Sprint 09) | **Considered, not built this sprint** - implementation found `buyParts` has exactly one bot caller (`investor.ts`), and its mechanic structurally requires express (see decision 4's revision below), so a shared deadline-aware helper would have no real second caller yet. Investor is pinned to express directly instead; the helper is a `TODO.md` follow-up for whenever a second caller actually needs the choice. |
| Save law | `SAVE_VERSION` bump + schema default | **Reused, purely additive** - `pendingPartOrders: []` defaults for every pre-Sprint-14 save, matching Sprint 13's `ownedEquipmentIds` precedent exactly. |
| First-pass tunable economy constants | `sim/constants.ts` (`AUCTION_BUYOUT_PREMIUM`, `SERVICE_JOB_DEADLINE_DAYS`, `WEEKLY_RENT_YEN`, etc. - every existing first-pass economy number lives here, not in content JSON, despite CLAUDE.md's content law reading literally; this is the codebase's consistent, established practice for scalar tuning knobs vs. `packages/content`'s catalogs/lists) | **Followed, not re-litigated** - the express surcharge fraction and standard lead-time constants land in `constants.ts` alongside every comparable number, not as new content JSON. |
| Overlay/modal shape | `DayReport.vue` / `JobCompleteModal.vue` (store-ref-driven overlay, dismiss button) | **Loose visual precedent** for the cart panel - even though "a running selectable list before commit" is itself a new interaction shape (see below), the overlay/panel chrome matches what the game already looks like. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **The cart itself.** Nothing today stages a purchase before committing it - every instant action
   (Sprint 11's whole point) fires the moment it's clicked. This is a deliberate, narrow exception,
   not a reversion: Sprint 11 eliminated the old "queue everything, resolve at End Day" architecture
   specifically because it made the game feel unresponsive; this cart is scoped *only* to parts
   purchases, motivated by a real misclick-safety problem, and doesn't touch how any other action
   (repair, bid, sell, accept) resolves.
2. **Delivery-speed pricing.** Nothing today charges differently for the same catalog item based on a
   player choice made at purchase time - every price is currently a flat, fixed number.
3. **A pending-order queue that isn't tied to a car or a job.** `activeServiceJobs` and
   `activeAuctionLots` are the closest existing "something outstanding, resolved later" collections,
   but both are car-shaped. `pendingPartOrders` is the first "a plain purchase is outstanding" queue.

## Definition of Done

- `PartsMarketScreen.vue` has an **Add to cart** flow, not an instant per-row Buy - a visible cart
  panel lists selected parts with a running total; nothing is bought until an explicit **Checkout**
  click. This *is* the misclick safeguard (see the current total before committing), not a separate
  confirmation dialog on top.
- At checkout, the player picks delivery speed for the cart - **express** (surcharge, arrives today,
  behaves exactly like today's instant buy) or **standard** (sticker price, arrives tomorrow).
- A standard-tier purchase deducts cash and creates a `pendingPartOrders` entry immediately; the actual
  `PartInstance` lands in `partInventory` automatically once `arrivesOnDay` is reached, resolved by
  `advanceDay` exactly like a public listing - no separate player action to "collect" it.
- Bots (`buyParts` `DayActions`) go through the identical resolver with a `deliverySpeed` choice, not a
  parallel bot-only path.
- The parts catalog is sortable/filterable by `componentId`, `grade`, and price.
- `SAVE_VERSION` bumps, purely additive (`pendingPartOrders` and `cartPartIds` both default to `[]`);
  golden-save test added.
- **The cart survives a reload** - it lives on `GameState` (decision 3, reversed from the original
  ephemeral-ref proposal), so the existing autosave watcher and save-code export carry it for free.
- All checks green; new/updated tests cover the cart (nothing charged pre-checkout), both delivery
  tiers, and day-boundary delivery resolution (including "not yet due stays pending").

## Decisions - all six resolved directly by the maintainer (2026-07-09)

1. **Delivery-speed choice is once per checkout, for the whole cart - not per line item.** Confirmed
   as proposed. Matches the maintainer's own wording ("at the cart checkout they choose if they need it
   now or tomorrow") and keeps the data model simple (one field on the checkout action, not N).
2. **First-pass numbers: a flat +10% express surcharge** (revised down from the proposed +20%),
   **a flat 1-day standard lead time** (`PARTS_EXPRESS_SURCHARGE_FRACTION = 0.1`,
   `PARTS_STANDARD_DELIVERY_DAYS = 1` in `constants.ts`) - openly adjustable, matching every other
   first-pass number in that file.
3. **The cart is persistent - reversed from the original ephemeral-Pinia-ref proposal.** It survives a
   reload, so it lives on `GameState` itself (`cartPartIds: string[]`, repeats allowed for quantity >
   1) rather than a separate ref: the existing autosave watcher (Sprint 07) and save-code export carry
   it automatically, reusing the established persistence mechanism instead of building a second one.
   `SAVE_VERSION` bump covers this additive field alongside `pendingPartOrders`. Sim never reads or
   writes `cartPartIds` - it's inert, player-side staging data; only the game layer touches it. Golden
   master hashes (`hashState` covers the full `GameState`) will shift and need re-pinning, same as
   every prior additive `GameState` field.
4. **Bots default to standard delivery, paying for express only under real time pressure - revised
   during implementation once the actual caller surface turned out to be narrower than assumed.**
   `buyParts`/`resolveBuyPart` currently has exactly **one** bot caller: `investor.ts`. And Investor's
   existing mechanic structurally *requires* express: it predicts a part's `partInstanceId` and
   references it in the same tick's `createJobs`/`laborAssignments` (advanceDay resolves `buyParts`
   before labor is applied), which only exists if the part lands in inventory the same day. A
   standard-tier order wouldn't create that `PartInstance` until a later day's delivery step, so
   Investor choosing standard would hard-crash (`applyJobToCar` throws on a referenced part that isn't
   in inventory yet). Building a deadline-aware `decideDeliverySpeed` helper for a single caller that
   can't structurally use its "wait" branch would be exactly the premature generality CLAUDE.md's
   directives warn against - so this sprint ships **Investor pinned to express, explicitly, with a
   comment explaining why**, not a generic unused helper. Thematically consistent besides: Investor
   never invests in equipment *or* waits for a delivery - it pays full retail for speed every time.
   The deadline-aware version (built for real once a second, later-arriving bot needs it - e.g. a
   future service-job-installing bot) is now a `TODO.md` follow-up, not dead code shipped early.
5. **Removing a cart item before checkout costs nothing and needs no confirmation.** Confirmed -
   cash isn't spent until checkout, so "remove" is a plain, reversible edit (still an instant
   `GameState` mutation now that the cart lives there, same shape as every other instant action).
6. **Naming: `deliverySpeed: z.enum(['standard', 'express'])`.** Confirmed as proposed.

## Task breakdown

### A. Content (`packages/content`)

- [x] New `PendingPartOrderSchema` in `part.ts` (extending the existing file - same concern, not a new
  one): `id`, `partId`, `priceYen` (locked in at order time), `purchasedOnDay`, `arrivesOnDay`. Mirrors
  `PublicListingSchema`'s shape.
- [x] `gameState.ts`: `pendingPartOrders: z.array(PendingPartOrderSchema).default([])` and (decision 3)
  `cartPartIds: z.array(z.string().min(1)).default([])` - the persistent cart, a plain list of part ids
  (repeats = quantity), inert to the sim, read/written only by the game layer.
- [x] `DayLogEntrySchema`: new `part-ordered` (`partId`, `orderId`, `priceYen`, `arrivesOnDay`) and
  `part-delivered` (`orderId`, `partId`, `partInstanceId`) variants. Existing `part-bought` is
  untouched in shape - it still fires for the express path exactly as today, just now carrying the
  surcharged `priceYen`.
- [x] `index.ts`: export the new schema/type (via the existing `part.ts` re-export).

### B. Sim (`packages/sim`)

- [x] `constants.ts`: `PARTS_EXPRESS_SURCHARGE_FRACTION` (0.1, revised down from the proposed 0.2 per
  decision 2), `PARTS_STANDARD_DELIVERY_DAYS` (1).
- [x] `parts.ts`: `resolveBuyPart` gains a `deliverySpeed: 'standard' | 'express'` param (default
  `'express'`). Express path: unchanged shape, priced with the surcharge. Standard path: deducts
  sticker price, creates a `PendingPartOrder`, logs `part-ordered` - no `PartInstance` yet. New
  `resolvePartDeliveries(state)` resolves due orders, called from `advanceDay`.
- [x] `advanceDay.ts`: a new step 7b, modeled directly on the existing `activeListings` resolve-loop -
  calls `resolvePartDeliveries`; not-yet-due orders stay pending.
- [x] `actions.ts`: `BuyPartActionSchema` gains `deliverySpeed` (defaults to `'express'` so every
  pre-existing caller/fixture that omits it keeps compiling and behaving unchanged).
- [x] `bots/investor.ts` (the only bot that calls `buyParts` today): pinned to
  `deliverySpeed: 'express'` explicitly on its `actions.buyParts.push(...)` call, with a comment
  explaining why (decision 4, revised during implementation - see the reuse-analysis row above). No
  new shared bot-delivery helper this sprint; a `TODO.md` follow-up tracks building one once a second,
  genuinely deadline-driven caller exists.

### C. Game (`packages/game`)

- [x] `gameStore.ts`: `addToCart`/`removeFromCart` mutate `gameState.value.cartPartIds` directly
  (decision 3 - plain instant `GameState` mutations, same shape as `devGrantCar` etc., so the existing
  autosave watcher persists them for free); `cartItems`/`cartStandardTotalYen`/`cartExpressTotalYen`
  computed; `checkoutCart(deliverySpeed)` buys what it can afford (per-item, not all-or-nothing),
  leaving unaffordable lines in the cart, and clears the rest; `buyPart` kept as the lower-level
  primitive `checkoutCart` calls per item (not wired to any UI button anymore).
- [x] `PartsMarketScreen.vue`: replaced the instant Buy button with Add-to-cart; new cart panel (list +
  running total + delivery-speed radio choice + Checkout button, disabled when unaffordable); a
  minimal "On order" section listing pending deliveries; sorting/filtering controls over the catalog
  (`componentId`, `grade`, price).
- [x] `dayLogFormat.ts`: formats `part-ordered`/`part-delivered` entries.
- [x] `saveCodec.ts`: `SAVE_VERSION` bumped 6→7; version-history comment documents it as purely
  additive.

### D. Testing

- [x] Sim: `parts.test.ts` extended - express vs. standard paths (including the default-to-express
  case), pending-order creation with the correct `arrivesOnDay`, `resolvePartDeliveries` resolution on
  the due day, no premature delivery before then, and partial-delivery ordering across multiple orders;
  `buyParts.test.ts`/`advanceDay.test.ts` golden masters updated for the surcharge and the two new
  `GameState` fields.
- [x] Content: `gameState.test.ts` fixture updated for `pendingPartOrders` and `cartPartIds`. No
  separate schema test - `PendingPartOrder` is runtime-only data (no seed JSON backing it), so it
  doesn't fit `schemas.test.ts`'s "validate seed content" pattern, matching how other runtime-only
  types (`Job`, `ServiceJob`) aren't in that file either.
- [x] Game: new `gameStore.cart.test.ts` (add/remove/total; **nothing is charged until checkout** - the
  core safeguard this sprint exists for; both delivery tiers; partial-affordability checkout;
  cart contents round-trip through `encodeSave`/`decodeSave`, proving the persistence decision actually
  works rather than just asserting it compiles); `PartsMarketScreen.test.ts` rewritten for the cart UI
  and filtering.
- [x] Save: `saveCodec.test.ts` gained a pinned `GOLDEN_V6_CODE` case plus matching additive assertions
  on the v1/v2/v3/v5 cases and a real-data round-trip test, confirming a pre-v7 save decodes with
  `pendingPartOrders: []` and `cartPartIds: []`.

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access.

**User-only:** play the actual cart/checkout flow in a browser to confirm it genuinely solves the
misclick problem it exists for (same recurring blocker as Sprints 12/13 - not currently possible from
mobile); `pnpm balance:run` afterward to sanity-check bots' new delivery-speed choice doesn't shift
existing economy invariants. Per the standing agreement, a **proper playtesting sprint follows this one
implementation**, so this is also the sprint whose output that playtesting pass will exercise most
directly (a brand-new interaction surface, not just a numbers change).

## Exit

The parts market finally has a real cart: nothing spends real cash until an explicit checkout click
with the total visible, closing the exact misclick gap that prompted this sprint. Delivery timing gives
"instant" a real cost (the express surcharge) for the first time, and standard delivery is this
project's first purchase-side "commit now, resolves later" mechanic - built by reusing
`PublicListingSchema`'s `resolvesOnDay` pattern almost verbatim rather than inventing a new one.

**One design assumption was revised mid-implementation, honestly, not silently:** decision 4 planned a
shared, deadline-aware `decideDeliverySpeed` bot helper, but `buyParts` turned out to have exactly one
bot caller (`investor.ts`), whose existing same-tick install mechanic structurally can't use standard
delivery at all. Building the generic helper anyway would have been dead code serving a caller that
can't use it - so Investor is pinned to express with a clear comment instead, and the real helper is a
tracked `TODO.md` follow-up for whenever a second, genuinely deadline-driven caller exists.

Both open decisions from the maintainer's answers landed as designed: the cart is **persistent** (lives
on `GameState`, rides the existing autosave/save-code mechanism - no new persistence layer), and the
express surcharge is **10%**, not the originally-proposed 20%. `SAVE_VERSION` 6→7, purely additive.
361 tests (was 336); all checks green (`pnpm typecheck`/`lint`/`format`/`test`/`build`).

**Still unverified in a real browser** - same recurring blocker as Sprints 12/13, and explicitly
flagged again this sprint since it's the reason this note exists: the maintainer can't currently test
on mobile, so the actual cart/checkout/delivery-choice flow (does it *feel* like a safeguard, is the
"On order" section discoverable, is the checkout-disabled-when-unaffordable state clear) has only been
verified through component-mount tests, not a real play session. Tracked in `TODO.md` as a Sprint 14
follow-up, same shape as the still-open Sprint 12 Components-list check.

**Per the standing agreement, a proper playtesting sprint follows this one** - and this sprint is
arguably what that playtesting pass needs most: a genuinely new interaction surface (not just a numbers
retune), and the first real opportunity to start generating the kind of recorded-play data the
maintainer's own economy-realism idea (see `TODO.md`/`project_economy_refinement` territory) would need
to go anywhere.
