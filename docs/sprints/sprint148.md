# Sprint 148: somewhere to put it

**Status: READY TO IMPLEMENT. Sixth of the sale value arc. Depends on Sprint 147.**

Design of record: `docs/design/systems/sale-value-system.md` §7.1, and the parking ruling in
`sale-value-implementation-plan.md` §4.

## The defect

**Selling costs no space, and space costs nothing to leave empty.**

Two halves of the same hole:

1. A car on sale sits in whatever parking or service slot it already occupied. Listing is free.
   So there is no reason not to list everything you own, all the time, and "which car do I put
   out front" is not a question the game asks.
2. Rent is a flat `WEEKLY_RENT_YEN` of 20,000 regardless of how much yard you own. Buying a bay
   is a one-off price and then it is free forever, so capacity is a pure ratchet: there is never
   a reason not to buy the next bay the moment you can afford it, and never a reason to sell a
   car quickly rather than hold it.

Sprint 147 made waiting cost something in price. This sprint makes it cost something in space,
which is the half that actually bites, because space is finite and price decay is not.

## The fix

**A third bay kind, `forecourt`, and rent that scales with what you own.**

- **Viewings happen at the forecourt.** Listing a car on any channel where a buyer comes to look
  at it moves the car from its real slot onto a forecourt slot. No free forecourt slot, no
  listing. Delisting moves it back.
- **The forecourt holds listed cars only.** It is not extra parking. You cannot move a car there
  by hand and it does not count toward acquisition capacity, so the number of forecourt slots is
  exactly "how many cars I can have on sale at once" and nothing else.
- **Every bay you own bills weekly.** Rent becomes a base plus a per-bay rate per kind. Unused
  capacity bleeds; a held car costs you the slot you would otherwise put something in.

This is the design's own reasoning, and it is why there is no per-car holding fee: a held car
already costs the player the bay it occupies, so charging again for the car would double-charge
the same scarcity. It is also period-honest. **Shako shōmei** means you prove you have somewhere
to put a car before you may own it.

## Reuse analysis (directive 16)

### Genuinely new

- **One value in an existing enum**: `forecourt` joins `BayKindSchema`.
- **One parallel array**: `forecourtCarIds`, the same shape and invariant as the two that exist.
- **One content flag**: `requiresForecourt` on a selling channel.
- **One arithmetic change**: rent from a constant to a sum.

### Existing mechanisms reused

- **`packages/sim/src/facilities.ts` in full.** Occupancy, free-space checks, first-open-slot
  placement, `moveCar`, `swapCars`, `applyMoves`, `nextBayPriceYen`,
  `nextBayMinReputationTier`, `applyBayPurchase`. Every one of these already does the right
  thing for two kinds. **This sprint does not add a parallel space system; it teaches the
  existing one a third kind.**
- **`facilities.json` and `BayFacilitySchema`**, including its two refines pinning
  `bayPricesYen.length` and `minReputationTier.length` against `maxCount - startCount`. The
  forecourt is a third entry in an existing shape, not a new schema.
- **The grace slot.** A delist with no real slot free falls back to the existing single
  double-parking slot exactly as an acquisition does. The overflow rule already exists and is
  already tested; do not write a second one.
- **The `bay-purchased` and `moved` log events**, which are already keyed on `BayKind` and so
  carry the new kind with no shape change.
- **Sprint 143's flag-driven channel dispatch.** Whether a channel needs a forecourt is a
  content flag read at the call site, never a branch on `channelId`.
- **`hasAcquisitionSpace`**, unchanged in meaning: real capacity, then grace. The forecourt is
  deliberately not part of it.

### Must NOT be built

- **A per-car-per-week holding fee.** Ruled out above and in the plan. The bay is the charge.
- **A location field on `CarInstance`.** Cars carry no location today and must not start;
  slots are addressed by the arrays, which is what makes a specific slot real, persisted state.
- **Rent as a per-kind schedule with its own curve.** A flat rate per bay of each kind is the
  whole model.
- **Any change to how a car is priced.** This sprint moves cars around and charges rent. Stage A
  through Stage F are untouched.

## The one thing to get right

**A car must never be in two places, and never in no place.** The invariant is that every owned
car id appears exactly once across `serviceBayCarIds`, `parkingCarIds`, `forecourtCarIds` and
`graceParkingCarId`. Listing is a move, not a copy, and delisting is the reverse move.

Write that invariant as a test helper and assert it after every state transition the sprint
touches: list, delist, sell, buy, move, swap, bay purchase. If a car can be listed while still
holding its parking slot, the sprint has delivered nothing at all.

## Levers

**Signed under the standing lever grant recorded as R3 in
`docs/design/systems/sale-value-implementation-plan.md`, provisional until the maintainer
ratifies it.** Recorded here for review.

### Rent, replacing the flat constant

`WEEKLY_RENT_YEN` is RETIRED and replaced by an `economy.rent` block.

| lever | value |
| --- | ---: |
| `rent.baseWeeklyYen` | **6000** |
| `rent.perBayWeeklyYen.service` | **5000** |
| `rent.perBayWeeklyYen.parking` | **2000** |
| `rent.perBayWeeklyYen.forecourt` | **1500** |

    weeklyRentYen = baseWeeklyYen + sum over kinds of (bayCount[kind] * perBayWeeklyYen[kind])

Chosen so that **day one is unchanged at exactly 20,000**: 6000 + 5000x1 + 2000x3 + 1500x2. A
fully built-out yard (service 5, parking 15, forecourt 8) pays 73,000 a week, 3.65 times the
start, against an endgame restoration path the design puts at 273,813 profit over 30 days. That
is real pressure without being a wall, and it is the first thing in the game that makes an empty
bay a bad idea.

### The forecourt facility

Added to `facilities.json` beside `service` and `parking`:

| field | value |
| --- | --- |
| `startCount` | **2** |
| `maxCount` | **8** |
| `bayPricesYen` | **[150000, 220000, 320000, 450000, 620000, 800000]** |
| `minReputationTier` | **["local", "local", "known", "known", "respected", "respected"]** |

Priced above parking and below a service bay: street frontage is dearer than a covered slot at
the back but cheaper than a working bay with a lift in it. Starting at 2 means the opening
position is six cars owned, two of them sellable at once, which is a decision from the first
week rather than one that arrives at hour twenty.

### The channel flag

`requiresForecourt`, added to every entry in `economy.sellingChannels`. **The rule, not the
list: a channel is `true` when a buyer comes to look at the car, and `false` when the car is
collected or shipped.** Of what exists today the trade network is the only `false`, because a
trader comes and takes it away, which is precisely what makes that channel the fast exit the
design describes. Everything else is a viewing.

## Task breakdown

1. **`forecourt` into `BayKindSchema`** and a `forecourt` entry in `facilities.json` with the
   values above. Confirm `BayFacilitySchema`'s two length refines pass.
2. **`forecourtCarIds` and `forecourtBayCount` on `GameState`**, mirroring the parking pair
   exactly, including the same doc comment shape. Bump `SAVE_VERSION`. No migration
   (directive 19).
3. **Generalise `facilities.ts` from two kinds to three.** It currently dispatches with
   `to === 'service' ? ... : ...` ternaries in several places. Replace those with a single
   kind-keyed accessor pair (the array for a kind, the count for a kind) so a fourth kind would
   be one enum value and one content entry. **This is the sprint's real engineering and it is a
   DRY fix, not an addition.** `hasOwnedShopSpace` and `hasAcquisitionSpace` keep their current
   meaning and must NOT gain the forecourt.
4. **`requiresForecourt` on the channel schema** (`.strict()`, per guard G5) and on every
   channel in `economy.json`, per the rule above.
5. **Listing takes a forecourt slot.** In `resolveSetForSale`: if the chosen channel requires a
   forecourt and none is free, the listing is refused, no state change, with a log entry reusing
   the existing no-space event shape. Otherwise release the car's real slot and place it on the
   forecourt.
6. **Delisting and channel-switching.** Delisting returns the car to a real slot via the
   existing placement path, falling back to the grace slot, and refusing only when even that is
   taken. Switching between two forecourt channels keeps the same slot and must not release and
   re-take it. Switching to or from the trade network is a real move in one direction or the
   other.
7. **A sale frees the forecourt slot.** `releaseCarFromShop` already clears whichever slot holds
   the car; extend it to the third array so this is automatic rather than a new code path.
8. **Rent.** `economy.rent` with Zod entries, `finances.ts` computing the sum, `WEEKLY_RENT_YEN`
   retired into the ledger. `packages/sim/src/cli/exportCareers.ts` writes `weeklyRentYen` into
   the bot manifest and must write the computed opening figure instead of the dead constant.
   Bot code is directive-21-forbidden to run but must still compile and stay honest.
9. **The garage screen.** `GarageScreen.vue` renders parking and service bays; it needs the
   forecourt alongside them, and a listing attempt with no free slot needs to say so in plain
   words rather than silently doing nothing. Follow the diegetic-UI law in `art-direction.md`.
10. **Tests and re-derivation.**

## Tests

- **The placement invariant** above, asserted after every transition the sprint touches.
- Listing with a free forecourt slot moves the car and frees its real slot.
- Listing with no free forecourt slot refuses, changes nothing, and logs.
- Delisting with no real slot free takes the grace slot; with grace taken too, refuses.
- Switching between two forecourt channels does not move the car.
- A completed sale frees the forecourt slot.
- Rent at the opening bay counts is exactly 20,000, and rises by the right per-bay rate after a
  purchase of each kind.
- The forecourt does not count toward acquisition space: a player with free forecourt slots and
  full parking and service still cannot buy a car except into grace.

## Re-derivation

Expect to move, and re-pin in this same change: the economy approval-gate hash (directive 22's
recorded-approval condition), `SAVE_VERSION` and its canary asserts in `saveCodec.test.ts`, and
the golden state hashes in `advanceDay.test.ts` (rent is charged inside the day cycle, so both
will move).

Run `pnpm typecheck` before reporting, per the directive 20 carve-out: this sprint retires a
constant, adds an enum value and reshapes state.

## Exit

**Landed as designed.** `forecourt` joined `BayKindSchema` and `facilities.json` at the signed
values; `GameState` gained `forecourtBayCount`/`forecourtCarIds` (defaulted, mirroring the
parking pair exactly, `SAVE_VERSION` 49 -> 50, no migration per directive 19); `facilities.ts`'s
kind dispatch is generalised; `requiresForecourt` is required and `.strict()` on every selling
channel; listing/delisting move a car on and off the forecourt; rent is `economy.rent`
(`baseWeeklyYen` + per-kind `perBayWeeklyYen`), computed by `finances.ts`'s new
`computeWeeklyRentYen`; the garage, car-detail and upgrades screens all show and gate the
forecourt.

**Task 3, the real engineering.** `facilities.ts`'s `to === 'service' ? ... : ...` ternaries are
gone, replaced by two small kind-keyed accessor pairs: `carIdsFor`/`withCarIdsFor` (the slot
array for a kind) and `bayCountFor`/`withBayCountFor` (the owned count for a kind), each a single
3-case `switch` in exactly one place. Every function that used to branch on kind now calls
these instead: `releaseCarFromShop` loops `ALL_BAY_KINDS`; the renamed `assignToFirstOpenSlot`
(was `assignToFirstOpenRealSlot`) takes any kind; `moveCarToSlot`'s two-branch object-spread
collapsed to generic reads/writes; `applyBayPurchase`'s duplicated `kind === 'service' ? {...} :
{...}` collapsed to one dynamic composition. A fourth kind needs one enum value, one
`facilities.json` entry, one more `GameState` field pair (unavoidable - each kind's array/count
are real, independently-sized, persisted state), and one more `case` in each of the four
accessor functions - nothing else in the file changes. `bayCountsByKind` (new, exported) reads
all three at once for `finances.ts` and `exportCareers.ts`.

**The forecourt-specific additions**, built from those same primitives rather than a parallel
system: `assignToForecourt` (a thin wrapper over `assignToFirstOpenSlot`, the one legitimate way
a car reaches the forecourt) and `tryAssignToRealOrGrace` (the real-then-grace cascade
`assignToShop` already uses, but CHECKING rather than trusting that grace is free - `assignToShop`
may assume it because every caller has already confirmed `hasAcquisitionSpace`; a car coming off
the forecourt is not a fresh acquisition, so there is no such earlier guarantee, and this refuses,
returning `null`, instead of clobbering whoever is already double-parked). `moveCarToSlot`
refuses `to === 'forecourt'` outright in one guard clause, and `locate` only ever searches
`['service', 'parking']`, so a listed car cannot be dragged onto or off the forecourt by hand
either direction - the forecourt is populated and vacated exclusively through
`resolveSetForSale`. `hasOwnedShopSpace`/`hasAcquisitionSpace` are untouched: still exactly
`hasParkingSpace || hasServiceBaySpace` (+ grace for the latter), the forecourt deliberately
excluded, tested directly (`the forecourt is not acquisition capacity` describe block).

**`resolveSetForSale` (selling.ts).** Listing on a `requiresForecourt` channel releases the
car's real slot and places it on the forecourt, refusing - no state change, logging
`{ type: 'acquisition-blocked', kind: 'listing', reason: 'no-forecourt-space' }` - when none is
free. A car already on the forecourt switching to another forecourt channel keeps its slot (no
release-and-retake); switching to the trade network (the one `requiresForecourt: false` channel)
is a real move back to a real slot or grace. Delisting mirrors this: a forecourt car returns via
`tryAssignToRealOrGrace`, refusing silently (matching the file's existing silent-refusal
convention - insufficient cash already refuses the same way) when even grace is taken. A
completed sale (`resolveSellViaWalkIn`) frees the forecourt slot automatically, because
`releaseCarFromShop` now searches all three kinds - no new code path, per the reuse analysis.

**Judgement calls not fully dictated by the doc, flagged for review:**

1. **The no-space log event's exact shape.** "Reusing the existing no-space event shape" is read
   as reusing `acquisition-blocked`'s STRUCTURE (extend its `kind` enum with `'listing'`, its
   `reason` enum with `'no-forecourt-space'`) rather than its literal `reason: 'no-space'` value -
   the existing `'no-space'` copy ("parking, every bay, and the double-parking spot are all full")
   would be actively wrong for a forecourt-only block, so a new, accurate reason was added instead
   of reusing the old string. `dayLogFormat.ts`'s `acquisition-blocked` case gained the branch.
2. **The delist/switch-away refusal stays silent (no log entry).** Task 5 explicitly asks for a
   log entry on the listing refusal; task 6 does not ask for one on the delist refusal, and
   `resolveSetForSale`'s own doc comment already documents a silent-refusal convention (insufficient
   cash). Kept consistent rather than introduced a second logged-refusal shape unasked for.
3. **`forecourtBayCount`/`forecourtCarIds` keep Zod defaults** (`.default(2)`/`.default([])`),
   mirroring the parking pair's CURRENT shape exactly as task 2 instructs. This means a pre-v50
   save decodes cleanly (forecourt empty, no car ever having been listed under the old model, which
   is exactly correct) rather than failing to parse the way sprint147's `offersSeen` deliberately
   does. Both are compliant with directive 19 (neither writes a migration); this sprint's own
   instruction to mirror the parking pair is what decided it, flagged since sprint147 set a newer,
   different precedent (required, no default) for its own new field.
4. **`GarageScreen.vue`'s forecourt slots are plain, not `ShopSlot.vue`** - `ShopSlot` always
   renders a grab-handle and a move button, which would misrepresent the forecourt as a hand-move
   target. A small read-only block (RouterLink + "empty forecourt slot" text) was used instead,
   styled to match the existing grace-parking block's dashed-border treatment.
5. **`UpgradesScreen.vue` gained a "Forecourt bays" purchase card** and `DevConsole.vue`'s
   `devGrantBay` selector gained a `forecourt` option. Neither file is named in the sprint doc's
   task list, but `applyBayPurchase`/`nextBayPriceYen`/`nextBayMinReputationTier` all generalised
   to the forecourt automatically (task 3), and leaving the facility unpurchasable in the live UI,
   or leaving `devGrantBay`'s own two-branch ternary un-generalised (a real latent bug: granting a
   forecourt bay from the dev console would have silently incremented `parkingBayCount` instead),
   would have been an incomplete generalisation of exactly the thing task 3 asks for.

**Re-derived pins, old -> new:**

- `economyApprovalGate.test.ts`'s `economy.json` hash:
  `7902e54c1533a941755a4de4ea63c35f9c0802f2ed2a71080dd51946ef56b520` ->
  **`c314c4a3978b91020b171e96fd1fdeeeb96a579cfa5087c64a7a901fde637958`**. Re-pinned in the same
  change, citing the lever grant as R3 in `docs/design/systems/sale-value-implementation-plan.md`
  per the maintainer's own wording rule for this sprint (not "standing authority of 2026-07-30",
  which is the separate R2 typecheck carve-out). `partPricing.json`'s hash and every mission
  payout/budget cap are untouched (confirmed passing unchanged) - neither pipeline reads rent or
  the selling channels' capacity flag.
- `advanceDay.test.ts`'s job-loop golden master: `ae049e78` -> **`8cf486eb`**. Moves because the
  state now carries `forecourtBayCount`/`forecourtCarIds`; the actual rent CHARGED across the
  script's four boundaries is numerically unchanged (day 1's bay counts price to exactly 20,000
  under the new formula, same as the old constant), asserted directly in the same test via
  `computeWeeklyRentYen(bayCountsByKind(initialState()), CONTEXT.economy)` replacing the retired
  `CONTEXT.economy.WEEKLY_RENT_YEN` reference.
- `advanceDay.test.ts`'s acquisition-to-sale golden master: `f3ee5dec` -> **`634d4493`**. Moves
  for the same new-fields reason, plus the scripted car is now physically moved onto the forecourt
  while listed and back off it at sale, which the hash also captures. Both hashes re-run twice to
  confirm determinism before pinning.
- `SAVE_VERSION`: 49 -> **50**. All six literal `expect(SAVE_VERSION).toBe(49)` canaries in
  `saveCodec.test.ts` re-pinned to `50` in the same change (two of the six sit in tests literally
  titled "SAVE_VERSION is 48" - historical names tracking the live constant rather than their own
  chapter, per the same pattern sprint147's Exit already noted).
- `schemas.test.ts`'s `economy.json` top-level anchor list: `WEEKLY_RENT_YEN` removed, `rent`
  added; its `sellingChannels`/`liquidity` exact-object pins gained `requiresForecourt` on all
  five channels and a `forecourt` entry check in the `facilities.json` pin.
- `packages/content/tests/gameState.test.ts`'s hand-built round-trip fixture and every raw
  `GameState` literal across seventeen `packages/sim/tests/*.test.ts` files (`actionPoints`,
  `advanceDay`, `assemblies`, `auctions`, `bidding`, `bots/investor`, `buyoutHelpers`, `calendar`,
  `carLedger`, `energyCalibration`, `finances`, `jobs`, `laborSlots`, `marketHeat`, `parts`,
  `provenance`, `selling`, `stagedWork`, `valueModelProbes`, `staff`) rebuilt with
  `forecourtBayCount`/`forecourtCarIds` in place - every one found and fixed via
  `pnpm typecheck`'s whole-program compile, per the directive 20 carve-out. Fixtures built via
  `{ ...createInitialGameState(...), ...overrides }` needed no changes (the new fields ride along
  automatically); only hand-rolled literals did.
- `WEEKLY_RENT_YEN` and `offerSpread`-style retirement: added to
  `packages/content/tests/retiredIdentifiers.test.ts` (case (a), directive 17 - the field is gone,
  not a bug); three prose mentions of the literal string in doc comments (`economy.ts`,
  `finances.ts`, `exportCareers.ts`) reworded so the ledger's own word-boundary scan stays clean.

**Nothing left outstanding.** Every task in the breakdown landed; every test in the sprint's own
list exists and passes; `hasOwnedShopSpace`/`hasAcquisitionSpace` are unchanged and directly
tested as such.

**Checks, run in order (directive 20 - none re-run once green):**

1. `pnpm typecheck` - all three packages clean (content, sim, game/`vue-tsc`), after fixing every
   error the schema/state reshape surfaced (see the pin list above).
2. `pnpm test --project content` - 536 passed (24 files).
3. `pnpm test --project game` - 833 passed (62 files).
4. Named sim files only, never the full suite: `packages/sim/tests/facilities.test.ts` +
   `packages/sim/tests/selling.test.ts` + `packages/sim/tests/finances.test.ts` together (154
   passed, after fixing one self-inflicted bug in the new placement-invariant test itself - see
   below), then `packages/sim/tests/advanceDay.test.ts` separately (15 passed, run twice to
   confirm the re-derived hashes are stable before pinning).

A small follow-up narrow re-check, outside the four above but scoped to a fix made while
verifying task 3's generalisation was complete: `devGrantBay` (gameStore.ts) had its own
un-generalised two-branch ternary, which would have silently corrupted state if the dev console
ever granted a forecourt bay. Fixed and re-verified with `pnpm --filter @midnight-garage/game
typecheck` plus the two directly affected files (`GarageScreen.test.ts` + `gameStore.test.ts`,
28 passed) rather than re-running the full 833-test game suite a second time.

**A failing test, and which case it was (directive 17).** The placement-invariant test I wrote
myself (`facilities.test.ts`, "holds after acquisition, moves, a bay purchase and release") first
failed with "owned car car-2 appears in 0 slots". This was case (b) inverted: not a regression in
the implementation, but my own test script declaring three cars as owned up front and only then
placing them one at a time - a genuinely invalid intermediate state the invariant correctly
caught. Fixed by placing-and-owning each car atomically per step (mirroring how real acquisition
actually works), not by loosening the assertion.
