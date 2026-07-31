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

**Signed under the maintainer's standing authority of 2026-07-30.** Recorded here for review.

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

_To be completed on implementation._
