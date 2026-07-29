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

Implemented and verified. Full gate green: **1154 tests** (up from 1134), coverage
91.42/81.63/92.81/95.01, typecheck/lint/format/build clean. No balance harness, and the sprint's
own check holds: **no golden hash moved**, which is the expected result rather than a lucky one -
the provenance fix only changes a path bots never walk (no bot has ever mis-fitted a part onto a
customer's car).

**No save-schema change, confirmed rather than assumed** (task 4). `offer-rejected` is a
`DayLogEntry`, and `dayLog` is a store ref that `saveCodec.ts` never touches - grepped, not
guessed. `ShopCarView.hasOffer` is derived from `pendingOffers` at read time and persists nothing.
`SAVE_VERSION` stays at 30 and `packages/game/src/save/` is untouched in the diff.

### Item 17: the bug, fixed at its one line

`resolveRemovePart` decided the `customerJobId` tag by where the car was PARKED
(`const taggedPart = { ...installed, customerJobId: serviceJob.id }`, unconditional), so a part
the player bought and fitted became the customer's property the instant they pulled it back off -
and `resolveServiceJob`'s close-out, which drops every inventory entry carrying the job's id, then
**confiscated it**. The player was robbed of a part they had paid for, for changing their mind.

Sprint 61's `baselineInstalledPartIds` was already the exact missing signal and needed no new
state: it records the `PartInstance.id` in each install-task slot at generation, and was only ever
read by `isServiceTaskDone`. `isCustomersOwnPart` now asks it the same question one slot over.
A legacy job with an empty baseline (pre-Sprint-61 save) keeps the old tag-everything behaviour -
an empty baseline means "we cannot know whose this is", and the conservative read preserves the
meaning the save was written under. That is asserted directly rather than left incidental, and the
existing Sprint 35 test passes unchanged because its fixture is exactly that shape.

Proved **end to end**, not as two resolvers checked apart: buy a part, fit it to the customer's
car, pull it off, hand the job back, and the part is still in inventory with its `pricePaidYen`
intact.

### Follow-up: the first pass traded one theft for its mirror image

Found the same day, while the maintainer questioned an unrelated line ("how can a purchase price
be unknown?") which surfaced directive 19 (no save backwards compatibility before launch), whose
review then caught this.

**`baselineInstalledPartIds` only recorded INSTALL-task slots** (`if (task.action !== 'install')
continue`). My ownership check read "no baseline for this slot" as "the player must have fitted
it". So on a job carrying any install task, the player could pull the customer's **engine** - a
slot no task touches - and keep it. I fixed the game stealing from the player and shipped the
player stealing from the customer, with a test asserting the wrong behaviour and confident wrong
reasoning attached to it ("the customer never had a part there that we know of").

The record was answering a question it was never built to answer. Fixed at the source rather than
patched at the reader: the baseline is now **total over the car** - every slot snapshots what
arrived, including `null` for a slot that arrived empty (which no real `PartInstance.id` can equal,
so a part fitted into an empty slot is decided by the record, not by the absence of one).
`isCustomersOwnPart` collapses to a single identity check.

Directive 19 paid for itself immediately here: the legacy empty-baseline branch is **deleted**, not
preserved, and its test with it. That branch was also quietly load-bearing for repair-only jobs
(whose baseline is empty), which is exactly the "dead semantics alive in live logic" the directive
names.

No schema change: `z.record(z.string(), z.string().nullable())` already permits any keys, so no
version bump. No golden hash moved either - the scripted career never accepts a service job.

### Found while working

- **The type system caught a real gap I would otherwise have shipped.** Adding `offer-rejected` to
  `DayLogEntry` broke `dayLogFormat.ts`'s exhaustive switch ("Function lacks ending return
  statement"), which is the day report telling me it had no idea how to render the new entry.
  Now: "Turned down Y500,000 for the Civic". Sprint 64's classifier routes it to notable through
  its existing `default` branch, which is the right bucket.
- **A vacuous test of my own, caught and fixed.** The "warns about a finished job" case had an
  `if (!workDone) return` guard. I measured it: the rolled job is `workDone=false`, so the guard
  always fired and the test asserted **nothing**. It now forces the state deterministically (the
  task's target band set to the band the part already has, so `isServiceTaskDone` is satisfied
  through the real rule, not a stubbed flag) and asserts `finishedJobsAwaitingHandback` really
  contains the job before touching the UI. Same class of miss as Sprint 67's `.part-row` selector;
  worth naming twice.
- **`resolveRejectOffer` took a `SimContext` it never used.** Dropped rather than kept for API
  symmetry - an unused parameter is dead surface, and lint said so.

### Decisions as designed

Reject costs no reputation (turning down a lowball is a negotiation, not a slight) and leaves
`carsForSale` alone, so the car stays up for tomorrow's draw. The End Day warnings **stack into one
panel** and keep every Sprint 51 hook name (`end-day-cart-warning`/`-cancel`/`-confirm`), so
App.vue's Escape handler needed no change; all four pre-existing tests pass untouched. The sale
receipt reports **null profit as a dash** when the purchase price was never known, never a
fabricated number - the same honesty `car-sold`'s optional `profitYen` already encodes, now
asserted.

### Not done

I did not start the dev server to see the receipt, the badge, or the stacked warnings in a browser
(long-running processes are outside what I run myself). `pnpm dev`, then sell a car for the modal.
