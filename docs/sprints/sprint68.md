# Sprint 68 - Provenance and closure: whose part, which offer, what did I make

**Source:** playtest 2026-07-15, items 17, 11, 21, 22, 23. One real bug and four missing closures.

## Confirmed current state (code discovery, 2026-07-15)

- **Item 17 - the bug, and the fix already exists.** `resolveRemovePart` (jobs.ts:295-359) decides
  the `customerJobId` tag purely by **where the car is parked**, never by where the part came from:
  the owned-car branch (jobs.ts:336-343) pushes the part back untagged; the service-job branch
  (jobs.ts:345-355) tags it **unconditionally** -
  `const taggedPart = { ...installed, customerJobId: serviceJob.id }`. Its own comment frames the
  rule as "car we own vs customer's car", which is the whole mistake. So a stock damper the player
  BOUGHT and fitted becomes the customer's property the moment they pull it back off.
  **Sprint 61's `ServiceJob.baselineInstalledPartIds` is exactly the missing signal** - it records
  the `PartInstance.id` sitting in each install-task slot at generation, so
  `installed.id === job.baselineInstalledPartIds[carPartId]` is true for the customer's original
  part and false for anything the player fitted (a purchased instance, or a removal-generated id).
  It is currently read ONLY by `isServiceTaskDone` - `resolveRemovePart` never consults it.
- `customerJobId`'s full blast radius: **set** jobs.ts:353; **read** `installFitGate` (jobs.ts:562/564,
  blocks fitting a tagged part to a different car), `resolveScrapPart` (parts.ts:245, refuses to
  scrap), `isPartAvailableFor` (gameStore.ts:1523/1525), `PartCard.vue:72` (the "customer's part"
  badge + scrap-locked reason), `saveCodec.ts:1155`; **cleared** `resolveServiceJob`
  (serviceJobs.ts:981/992 - close-out drops every `partInventory` entry tagged with the job's id,
  with the comment "Player-owned parts are never touched"). That close-out is precisely where the
  bug bites hardest: a player's own mis-bought part is **confiscated** at hand-back today.
- **Item 11.** `EndDayButton.vue` already has the confirm state machine: `confirming` ref, `onClick`
  checks `gameState.cartPartIds.length > 0` and holds instead of ending, `confirmEndDay`/`cancel`,
  `defineExpose({ confirming, cancel })` so App.vue's Escape handler can close it; hooks
  `end-day`, `end-day-cart-warning`, `end-day-cart-cancel`, `end-day-cart-confirm`. Missing store
  getters: no "job done but not handed back" (would filter `activeServiceJobViews` by
  `.workDone && !.inTransit`) and no aggregate "any staged work anywhere" (would iterate
  `Object.values(stagedCarWork)`).
- **Item 21/22.** No reject/decline action exists anywhere in `selling.ts` or the store. Offers
  don't expire per-offer: `drawDailyOffers` (selling.ts:231-273) **replaces `pendingOffers`
  wholesale** each day ("an offer is valid the day it's drawn for only"); `PendingSaleOffer` has no
  `expiresOnDay`. `ShopCarView` (gameStore.ts:286-297) carries `carId`, `displayName`,
  `isCustomerCar`, `arrivingTomorrow` - no offer field; `ShopSlot.vue`'s badges (:83-84) are two
  hardcoded spans, not a generic mechanism.
- **Item 23.** `resolveSellViaWalkIn` (selling.ts:293-360) already logs `car-sold` with
  `priceYen` and - when the purchase price is known - a real `profitYen`. `acceptOffer`
  (gameStore.ts:2426-2433) only pushes the log; **there is no modal**. The pattern to copy is
  right there: `JobCompleteModal.vue` is driven by `game.lastJobResult` (a store ref set on
  completion, cleared on dismiss) and mounted once globally in App.vue.

## Reuse analysis (directive 16)

**New mechanisms:** a reject-offer resolver, an offer badge field, a sale-summary modal - all thin.

**Existing mechanisms to reuse:** `baselineInstalledPartIds` (Sprint 61) IS the provenance record -
item 17 needs no new state, just a comparison at the one tagging site. The End Day confirm state
machine (Sprint 51/64) extends to more warnings without reshaping. `JobCompleteModal`'s
store-ref + global-mount pattern carries the sale summary verbatim (`lastSaleResult` mirrors
`lastJobResult`). `resolveSetForSale`'s own "drop the car's pending offer" branch already does
exactly what rejecting one offer needs. `ShopCarView`/`ShopSlot`'s badge slot takes one more field.
The Sprint 42 car ledger already holds purchase/repairs/parts - the sale summary is a read, not new
bookkeeping.

## Decisions

1. **Provenance is the baseline, not the parking spot (item 17).** `resolveRemovePart`'s
   service-job branch tags the removed part **only if it IS the customer's original**:
   `installed.id === job.baselineInstalledPartIds[task.carPartId]`. Anything else - a part the
   player bought and fitted, correctly or by mistake - comes back to `partInventory` untagged and
   stays the player's, freely sellable, scrappable, and re-fittable elsewhere. A legacy job with an
   empty baseline (pre-Sprint-61 save) keeps today's tag-everything behaviour for that job only, so
   no in-flight save changes meaning mid-job. This also fixes the confiscation-at-close-out half of
   the bug for free: `resolveServiceJob` still drops everything tagged with the job's id, and now
   only the customer's own parts ever carry that tag.
2. **End Day tells you what you left undone (item 11).** Two new warnings, same confirm shape and
   the same "warn, never block" rule as the cart:
   - a service job whose work is DONE and whose car is in the shop: *"The Tanaka job is finished -
     hand the car back before you close up?"*
   - planned-but-unconfirmed work on any car: *"You've planned work on 2 cars but haven't confirmed
     it - it won't start."*
   Backed by two new store getters (`finishedJobsAwaitingHandback`, `carsWithUnconfirmedWork`).
   Warnings stack into one confirm panel rather than one modal per condition; the cart warning
   joins the same list.
3. **Reject an offer (item 21).** New `resolveRejectOffer(state, carInstanceId)` - drops that car's
   entry from `pendingOffers`, leaves `carsForSale` alone (the car stays on the market for
   tomorrow's draw), logs an `offer-rejected` DayLogEntry. The mechanic already exists inside
   `resolveSetForSale`'s un-list branch; this is the same removal, scoped to the offer.
   Deliberately no reputation cost: turning down a lowball is not a slight.
4. **A car with a live offer says so (item 22).** `ShopCarView` gains `hasOffer: boolean`;
   `ShopSlot.vue` renders a third badge (a yen chip) when true. Same hardcoded-badge shape as
   `arriving tomorrow`/`customer job` - three is still not enough to justify a generic system.
5. **A sale closes with a receipt (item 23).** `lastSaleResult` on the store (mirroring
   `lastJobResult`), set by `acceptOffer` from the `car-sold` log entry it already receives, and a
   new `SaleCompleteModal.vue` mounted once in App.vue beside `JobCompleteModal`. It shows what the
   Sprint 42 ledger already knows: purchase, repairs, parts, total spent, the price the buyer paid,
   and the realised profit, signed and coloured (the Finances-panel convention). Escape dismisses
   it via App.vue's existing modal priority order. When the purchase price is unknown (a dev grant),
   the profit line reads "-" rather than fabricating one - the same honesty `car-sold`'s optional
   `profitYen` already encodes.

## Tasks

**Claude:**

1. Sim: `resolveRemovePart`'s baseline check (item 17) + tests (a player-fitted part comes back
   untagged and survives close-out; the customer's original still tags and still reconciles; a
   legacy empty-baseline job keeps the old behaviour). `resolveRejectOffer` + `offer-rejected`
   log entry + schema + tests.
2. Store: `finishedJobsAwaitingHandback`, `carsWithUnconfirmedWork`, `lastSaleResult`,
   `rejectOffer`, `ShopCarView.hasOffer`.
3. Game: the End Day warning stack (item 11); the reject button (item 21); the offer badge
   (item 22); `SaleCompleteModal.vue` + App.vue mount (item 23). Component tests for each.
4. Save: no schema change expected (`offer-rejected` is a log entry, not state) - confirm and say
   so in the Exit; if `PendingSaleOffer` or `ShopCarView` turns out to need persistence, bump and
   golden-test per the save law.
5. Full gate; no balance harness (a bug fix that only makes the player RICHER at the margin - bots
   never mis-fit parts on customer cars - plus UI. If any golden hash moves, treat it as a bug and
   explain it.)

**User-only (maintainer):**

- None beyond review.

## Definition of done

- A part the player bought and fitted to a customer's car is still theirs after removal, and
  survives the job's close-out; the customer's original still reconciles out exactly as before.
- End Day warns (never blocks) about a finished-but-unhanded job and about unconfirmed planned work.
- An offer can be explicitly rejected; a car holding a live offer is badged in the garage.
- Selling a car shows a real receipt with the realised profit. Full gate green.

## Exit

Not started.
