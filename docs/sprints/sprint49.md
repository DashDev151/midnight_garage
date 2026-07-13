# Sprint 49 - Parts market: hero cards and a checkout rail

**Source:** playtest 2026-07-13 pass 2, items 5 and 6 (reference screenshot: a real retailer's
right-hand basket panel).

## Confirmed current state (code discovery, 2026-07-13)

`PartsMarketScreen.vue`: defaults to the ENTIRE catalog listed (`visibleParts` starts from
`game.partsCatalog` unfiltered, `:138-149`); the six group tiles + per-part chips already exist
as a working drill-down (`selectGroup`/`selectPart`, `:95-102`), but they filter the always-on
list rather than gating it. The Cart renders BELOW the catalog and on-order sections
(`:265-318`) with delivery-speed radio, totals, checkout, and partial-checkout warning.

## Reuse analysis (directive 16)

**New mechanisms:**

- A hero-card default state (no list until a department is entered) and a breadcrumb.
- A two-column layout with a sticky right cart rail.

**Existing mechanisms to reuse:**

- The ENTIRE drill-down state machine survives (`selectGroup`, `selectPart`,
  `groupedCarPartOptions`, `visibleParts`, grade/sort filters) - this sprint changes when the
  list RENDERS, not how selection works.
- Every store call is kept verbatim: `addToCart`, `removeFromCart`, `cartItems`,
  `cartStandardTotalYen`, `cartExpressTotalYen`, `checkoutCart`, `pendingPartOrders`,
  `fitsAnyOwnedCar` tagging. Zero store-layer changes.
- The cart's own blocks (items, delivery speed, totals, checkout button, insufficient-cash
  disable, partial-checkout warning) move as-is into the rail.

## Decisions

1. **Default view = six department hero cards**, large, with the group name, part count, and a
   blank art placeholder region (consistent with Sprint 50's placeholder discipline). No parts
   list is rendered until a department is opened. "All parts" is demoted to a small
   "browse everything" link, not a seventh hero.
2. **Hierarchy on click:** hero -> department view: breadcrumb ("Parts market > Engine"), the
   department's part-slot chips (existing `groupedCarPartOptions`), grade/sort filters, and the
   scoped list. Chip click narrows to one slot exactly as today. Breadcrumb root returns to the
   heroes.
3. **Cart becomes a sticky right rail** (~300px column beside the list): cart items with remove
   buttons, delivery-speed choice, totals, Checkout, warnings - all existing functionality,
   nothing dropped. The on-order (pending deliveries) block sits under the cart in the rail.
   On narrow viewports the rail stacks below the list (media query) - never lost.
4. End Day placement is NOT handled here - Sprint 51 standardizes it app-wide; this screen just
   stops rendering its own instance once 51 lands (coordinate whichever ships second).

## Tasks

1. Game: hero-card default state + breadcrumb + department view restructure (+ tests: no list
   rows render at default; entering/leaving a department; chip narrowing still works; grade/sort
   persist within a department).
2. Game: two-column layout with the cart rail (+ tests: add/remove/checkout/delivery-speed flows
   unchanged - existing tests keep passing with updated selectors; partial-checkout warning
   renders in the rail).
3. Verification: full gate.

## Definition of done

- Opening the parts market shows six hero cards and no part list.
- Every existing purchase flow (cart, delivery speed, checkout, on-order tracking, fit tags,
  grade/sort) works identically from the new layout.
- The cart is always visible beside the list while shopping in a department.
- Full gate green.

## Exit

(filled at completion)
