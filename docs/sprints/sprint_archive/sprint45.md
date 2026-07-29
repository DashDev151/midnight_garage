# Sprint 45 - The double-parking grace slot (real capacity before real loss)

**Source:** maintainer follow-up (2026-07-13) to the auction-lot-id bug fix, on the underlying
design flaw the bug exposed: winning an auction (or a buyout, or accepting a service job) can
still fail outright the instant parking is full, with zero player agency between "still winning"
and "car evaporates." Two maintainer-approved changes, both approved verbatim:

1. Acquisition capacity should check parking OR service bays, not parking alone - if all parking
   is full but a service bay is open, the car goes straight into the open bay.
2. Beyond that, one unowned "grace" overflow slot always exists (always exactly one slot past
   whatever real capacity is owned). A car that can't fit in real capacity double-parks there
   instead of being lost outright. The grace slot is visually marked (red, "double parking"
   warning). Every day it's occupied at End Day, the player pays a fine. Only once the grace slot
   is ALSO occupied does a new acquisition genuinely fail.

## Reuse analysis (directive 16)

**New mechanisms:**

- `GameState.graceParkingCarId: string | null` - the one overflow slot, additive.
- `economy.json`'s `DOUBLE_PARKING_FINE_YEN` - the daily fine, flat top-level constant.
- `resolveGraceParking` (facilities.ts) - the day-boundary migrate-or-fine step.
- `assignToShop` (facilities.ts) - the parking -> bay -> grace placement cascade.
- The `acquisition-blocked` reason rename `no-parking` -> `no-space` (accuracy: the condition is no
  longer "parking is full," it's "nowhere at all is free").
- UI: the double-parked warning slot on the garage screen.

**Existing mechanisms that MUST be reused (no parallel systems):**

- `parkingCarIds`/`serviceBayCarIds`/`parkingBayCount`/`serviceBayCount` and their existing
  `parkingOccupancy`/`hasParkingSpace` pair (facilities.ts) - the new service-bay-side
  `serviceBayOccupancy`/`hasServiceBaySpace` are a direct mirror of the same shape, not a new
  concept.
- `gameStore.ts`'s existing `shopAtCapacity` computed (`parkingFull && serviceBayFreeCount <= 0`)
  already expresses "no owned space anywhere" at the UI layer for drag-and-drop purposes - the new
  sim-side `hasOwnedShopSpace` is the same boolean, moved down to where the acquisition gate
  actually needs it.
- `assignToParking`'s existing shape (first free slot in one array, or append past capacity) is
  the direct template for the bay-side placement inside `assignToShop`; `assignToParking` itself
  is UNTOUCHED and keeps serving `devGrantCar` exactly as today (a deliberate capacity-bypassing
  dev tool, not a path this sprint touches).
- `releaseCarFromShop` already centralizes "clear this car's slot wherever it is" - extended with
  one more branch (grace), not a second release path.
- The `'car-moved'` DayLogEntry (`{ carInstanceId, to: BayKind }`) already exists and is exactly
  the right shape for "the double-parked car migrated into a real slot" - reused verbatim, no new
  log entry needed for that half of the mechanic.
- `applyWeeklyRentAndWages`'s day-boundary financial-charge pattern (finances.ts) is the template
  `resolveGraceParking`'s fine-charging half follows; `WEEKLY_RENT_YEN`'s flat top-level
  economy.json constant is the naming/shape template for `DOUBLE_PARKING_FINE_YEN`.
- The three existing acquisition call sites (`bidding.ts` auction-win and buyout,
  `serviceJobs.ts` accept) already share one gate-then-place shape
  (`hasParkingSpace` -> `assignToParking`) - this sprint swaps both halves of that shared shape,
  it does not add a fourth call site or a different pattern for any one of the three.
- Save law: additive `GameState` field, Dexie bump + golden-save test, the same pattern as every
  prior sprint's additive field (most recently Sprint 42's `carLedgers`).

## Decisions

### 1. Capacity check: parking OR service bay (item 1)

New facilities.ts helpers, mirroring the existing parking pair exactly:
- `serviceBayOccupancy(state)`: count of non-null `serviceBayCarIds`.
- `hasServiceBaySpace(state)`: `serviceBayOccupancy(state) < state.serviceBayCount`.
- `hasOwnedShopSpace(state)`: `hasParkingSpace(state) || hasServiceBaySpace(state)`.

### 2. The grace slot (item 2)

- `GameState.graceParkingCarId: string | null`, default `null`. Exactly one slot, always present,
  never purchasable, never expands - "one past whatever you currently own," not a fixed absolute
  number, so it moves with the player as real bays are bought.
- `hasGraceSpace(state)`: `state.graceParkingCarId === null`.
- `hasAcquisitionSpace(state)`: `hasOwnedShopSpace(state) || hasGraceSpace(state)` - THE new gate,
  replacing `hasParkingSpace` at all three acquisition call sites.
- `assignToShop(state, carInstanceId)` - THE new placement cascade, replacing `assignToParking` at
  the same three call sites: parking (if free) -> service bay (if free) -> the grace slot. Never
  called unless `hasAcquisitionSpace` already passed, so the grace branch is only ever reached when
  it's genuinely free.
- `releaseCarFromShop` gains a grace check (alongside its existing service/parking checks) so a
  double-parked car's slot clears the moment it leaves the shop (sold, scrapped, service job
  closed out) exactly like any other slot does today.
- Manual drag-and-drop into or out of the grace slot is explicitly OUT OF SCOPE this sprint - the
  slot only ever fills via the acquisition cascade and only ever empties via the automatic
  day-boundary migration below. `BayKind` stays a two-value enum; the grace slot is a distinct,
  simpler concept (a temporary fined overflow, not a third kind of ownable bay), not folded into
  the bay/move/swap machinery.

### 3. Day-boundary resolution: migrate first, fine only if still stuck

New `resolveGraceParking(state, economy): { state, log }` in facilities.ts, called from
`advanceDay.ts` as a new step (right after service-bay income, before weekly rent - the same
"day-boundary financial charges" grouping):

1. If `graceParkingCarId` is set AND real capacity has opened up since (parking or a bay), migrate
   the car there via the SAME placement logic `assignToShop`'s owned-space branch uses, clear
   `graceParkingCarId`, and log the existing `'car-moved'` entry (`to: 'parking'` or `'service'`).
   This runs BEFORE the fine check, so a car that frees up its own overflow slot the same day (the
   player sold another car, bought a bay, etc.) never gets fined for that day.
2. Otherwise, if `graceParkingCarId` is still set, deduct `economy.DOUBLE_PARKING_FINE_YEN` from
   cash and log a new `'double-parking-fine'` entry (`carInstanceId`, `amountYen`). No floor check
   needed (matches `WEEKLY_RENT_YEN`'s own unconditional-deduction precedent - going negative is an
   existing, accepted possibility elsewhere in this economy).

`economy.json` gains `DOUBLE_PARKING_FINE_YEN: 8000` (top-level flat constant, matching
`WEEKLY_RENT_YEN`'s own shape exactly) - explicit maintainer-tuning bait, first-pass number.

### 4. The `no-parking` reason rename (accuracy)

`acquisition-blocked`'s `reason` enum value `'no-parking'` is renamed `'no-space'` everywhere (the
three resolvers, the schema enum, `dayLogFormat.ts`'s display text) - the condition it now
describes is "parking AND every service bay AND the grace slot are all full," not "parking is
full," and the old name would actively mislead about which resource is actually exhausted.
`DayLogEntry`/`DayLog` are ephemeral (never part of the persisted save - confirmed: `saveCodec.ts`
never references `dayLog`), so this rename carries no save-migration weight at all.

### 5. UI

- `AuctionScreen.vue`'s existing "Parking is full... a won lot has nowhere to go and will be lost
  to a rival" warning is rewritten: full parking+bays now means "a won lot will be double-parked
  (a daily fine until space frees up)," and the "lost outright" framing only applies when the
  grace slot is ALSO occupied (`gameStore` exposes both booleans so the banner can distinguish).
- `GarageScreen.vue` renders an extra slot, red-bordered, labeled "DOUBLE PARKED" with a warning
  icon and the car's name, ONLY when `graceParkingCarId` is set (no permanent empty "you might
  double-park here" slot cluttering the normal view). Shows the daily fine amount as a hint
  ("-Y8,000/day until space opens up").
- `gameStore.ts` exposes `graceParkedCarView` (reuses the existing `shopCarView` helper, same shape
  every parking/service slot already renders through) and `doubleParkingFineYen` (reads
  `context.value.economy.DOUBLE_PARKING_FINE_YEN` for display).

## Tasks

1. Content: `graceParkingCarId` on GameState; `'double-parking-fine'` DayLogEntry variant;
   `no-parking` -> `no-space` rename; `DOUBLE_PARKING_FINE_YEN` in economy schema/json; save
   version bump (25 -> 26, additive) + golden-save test.
2. Sim: `serviceBayOccupancy`/`hasServiceBaySpace`/`hasOwnedShopSpace`/`hasGraceSpace`/
   `hasAcquisitionSpace`/`assignToShop`/`resolveGraceParking` in facilities.ts; `releaseCarFromShop`
   extended; the three acquisition call sites (`bidding.ts` x2, `serviceJobs.ts` x1) re-pointed from
   `hasParkingSpace`/`assignToParking` to `hasAcquisitionSpace`/`assignToShop` and the reason rename;
   `advanceDay.ts` gains the new day-boundary step. Unit tests for every new function plus the full
   cascade (parking free -> bay free -> grace free -> genuinely blocked) at all three call sites,
   the migrate-before-fine ordering, and `releaseCarFromShop` clearing grace.
3. Game: `dayLogFormat.ts` display text for the new log entry and the renamed reason;
   `AuctionScreen.vue` warning rewrite; `GarageScreen.vue` double-parked slot; `gameStore.ts`
   exposed computeds. Component tests for the new slot's conditional rendering.
4. Verification: full gate; balance harness sanity run (hard invariants must pass; disclose
   whether the fine/cascade measurably changes any bot's cash curve - expected to be rare, since
   bots already avoid overcommitting past capacity in the common case); golden hashes re-pinned
   (GameState shape change) after confirming behavior-neutral on the existing fixtures.

## Definition of done

- Winning/buying/accepting with parking full but a bay open places the car in the bay, not lost.
- With parking and bays both full, the car double-parks in the one grace slot instead of being
  lost, visibly marked red with a warning.
- The grace slot costs a real, disclosed daily fine every End Day it's still occupied, and clears
  itself automatically (no fine that day) the moment real capacity has opened up by End Day.
- Only with parking, every bay, AND the grace slot all full does a new acquisition genuinely fail
  (same no-escrow behavior as today - no cash ever leaves the player's hand for a car that never
  arrives).
- Full gate + harness invariants green; the auction screen's capacity warning matches the real
  new consequence.

## Exit

Implemented directly (no subagents), all four tasks done, per the maintainer's verbatim
"approved please implement."

### Files touched

Content:

- `packages/content/src/gameState.ts` - `graceParkingCarId: string | null` (default `null`) on
  `GameState`; new `'double-parking-fine'` `DayLogEntry` variant; `acquisition-blocked`'s `reason`
  enum `'no-parking'` -> `'no-space'`.
- `packages/content/src/economy.ts` / `data/economy.json` - `DOUBLE_PARKING_FINE_YEN: 8000`.
- `packages/content/tests/gameState.test.ts` - the full-state fixture gained `graceParkingCarId:
  null`; the one-entry-per-event-type `DayLog` fixture gained a `'double-parking-fine'` row and its
  stale `reason: 'no-parking'` renamed.
- `packages/content/tests/schemas.test.ts` - asserts `DOUBLE_PARKING_FINE_YEN` is `8_000`.

Sim (`packages/sim/src/facilities.ts` is the one new-logic file; every acquisition call site
re-pointed, none forked):

- `serviceBayOccupancy`, `hasServiceBaySpace`, `hasOwnedShopSpace`, `hasGraceSpace`,
  `hasAcquisitionSpace`, `assignToShop`, `resolveGraceParking` - all new, per the decisions above.
  `assignToParking` itself is untouched (still backs `devGrantCar`).
- `releaseCarFromShop` gained the grace-clearing branch.
- `packages/sim/src/advanceDay.ts` - new day-boundary step 8a (`resolveGraceParking`, between
  service-bay income and weekly rent).
- `packages/sim/src/bidding.ts` (auction-win branch of `resolveLotForDay`, `resolveBuyoutInstant`)
  and `packages/sim/src/serviceJobs.ts` (accept resolver) - all three re-pointed from
  `hasParkingSpace`/`assignToParking` to `hasAcquisitionSpace`/`assignToShop`, reason renamed.
- `packages/sim/tests/facilities.test.ts` - new describe blocks for every new function: occupancy/
  space pairs, the full `assignToShop` cascade (parking -> bay -> grace), `resolveGraceParking`
  (migrate-into-parking, migrate-into-bay, charge-the-fine, no-op), and `releaseCarFromShop`
  clearing grace.
- `packages/sim/tests/bidding.test.ts`, `facilitiesInAdvanceDay.test.ts`, `serviceJobs.test.ts` -
  every "capacity-blocked" test at all three call sites rewritten: the old single-dimension
  `parkingBayCount: 0` override no longer produces a genuine block (a free bay or the grace slot
  now absorbs it), so each was updated to also zero the service-bay count and occupy the grace
  slot, plus new tests added for the bay-fallback and grace-fallback success cases. The
  `facilitiesInAdvanceDay.test.ts` buyout-blocked test also needed its cash assertion corrected:
  occupying the grace slot with a stand-in car means the day-boundary fine now genuinely charges
  during that test's own `advanceDay` call, unrelated to the buyout attempt itself - the assertion
  now expects `cashBefore - DOUBLE_PARKING_FINE_YEN`, not an unchanged balance, with a comment
  explaining why.
- Every hand-built `GameState` test fixture across the sim test suite gained `graceParkingCarId:
  null` (the same class of fixture breakage Sprint 38/42 hit with their own new required fields).

Game:

- `packages/game/src/stores/gameStore.ts` - `graceParkedCarView` (resolves the double-parked car's
  display info via the existing `shopCarView`), `graceSlotOccupied` (the raw occupancy boolean,
  used for capacity-gating logic independent of whether the occupant resolves to a displayable
  car), `doubleParkingFineYen`.
- `packages/game/src/screens/AuctionScreen.vue` - the old single "parking is full, a won lot will
  be lost" banner replaced with two tiers: a gold "will double-park, daily fine" warning
  (`shopAtCapacity && !graceSlotOccupied`) and a red "will genuinely be lost" warning
  (`shopAtCapacity && graceSlotOccupied`).
- `packages/game/src/screens/GarageScreen.vue` - a red-bordered "Double parked" section, rendered
  only when `graceParkedCarView` resolves, showing the car's name and the daily fine amount.
- `packages/game/src/utils/dayLogFormat.ts` - display text for `'double-parking-fine'`; the
  `acquisition-blocked` reason text rewritten into an explicit 4-way mapping (fixing a pre-existing
  imprecision where `'technique'` was lumped with `'tool-tier'`).
- `packages/game/src/save/saveCodec.ts` - `SAVE_VERSION` 25 -> 26, additive (no `MIGRATIONS[25]`
  entry needed - a pre-v26 save never had a double-parked car, so `null` is exactly correct).
- `packages/game/src/save/saveCodec.test.ts` - two new regression tests (a real pre-v26 envelope
  decodes with `graceParkingCarId: null`; a v26 state with a real double-parked car round-trips it
  exactly) plus three pre-existing inline `SAVE_VERSION` canary assertions bumped from 25 to 26.
- `packages/game/src/screens/AuctionScreen.test.ts`, `GarageScreen.test.ts` - new tests for both
  warning tiers and the double-parked slot's conditional rendering.

### Verification

Full gate, all green:

- `pnpm typecheck` (content/sim/game) - clean.
- `pnpm lint` - clean.
- `pnpm format` - clean (Prettier auto-fixed line-wrapping in 4 files; no logic changes).
- `pnpm test:coverage` - **922/922 tests pass**, 74/74 files. Coverage: statements 90.71%, branches
  80.41%, functions 91.64%, lines 94.62% (gate: 80/65/78/82).
- `pnpm build` - clean.

Golden-master hashes re-pinned in `advanceDay.test.ts` (both the 30-day career and the
acquisition-and-sale path): `GameState` gained `graceParkingCarId` and every tick now runs the new
`resolveGraceParking` step, a real shape/step change to the hashed state. Neither scripted career
ever actually double-parks a car (the field stays `null` throughout in both), so this is confirmed
behavior-neutral - every other assertion in the file (job completion, band/slot changes,
determinism, "wins a lot at auction, then sells the car") still passes unchanged.

Balance harness - all hard invariants PASS:

- Days-to-`local` (competent-policy probe): p50=12.0 days, in [10,35] (935/1000 seeds reached
  `local`).
- Buyout share: 0.0% (< 30% gate).
- Passive Grinder solvency, Flipper-vs-Passive separation, and the sanity floor all pass.

**Disclosure:** this harness run reflects the FULL uncommitted working tree, not Sprint 45 in
isolation - Sprint 44's constant-part-cost rebase and the same-day auction-lot-id-collision fix
(see this file's own "Source" note) are also live, uncommitted, on top of the same last commit.
Compared against the last COMMITTED `report.md`, several non-passive strategies' day-100 median
cash dropped substantially (balanced-player Y414,014 -> Y110,888; flipper Y319,648 -> -Y7,306;
cautious-restorer Y78,453 -> -Y71,812; random Y175,954 -> Y40,457), while competent-policy improved
(Y946,879 -> Y1,322,708) and the days-to-`local` pacing invariant held steady (p50 13 -> 12). The
auction-lot-id fix alone was already shown (in this session, before Sprint 45 started) to increase
real auction participation by removing a silent lot-id collision; Sprint 45's own
`hasAcquisitionSpace`/`assignToShop` cascade independently increases how often an acquisition
(auction win, buyout, or service-job accept) now succeeds instead of being wrongly refused by the
old parking-only check. Both changes point the same direction: bots convert more real activity
(cars won, jobs accepted) into in-progress inventory that isn't yet turned back into cash by day
100, which plausibly explains the lower median cash for strategies that don't move quickly (while
`cars owned` at day 70/100 for several of these same strategies dropped toward 0 rather than
rising, consistent with more being sold off, not fewer being acquired). No strategy fell below the
sanity floor, and every hard-gated invariant still passes. Per this project's own standing
guidance, a changed bot-economics number is not itself a regression (no bot policy here is a
validated "correct" baseline) - flagging the magnitude for the maintainer's awareness and for a
future balancing pass, not treating it as a bug to fix in this sprint.

### Deviations from the spec / notable calls

- The sprint doc's task 4 anticipated the fine/cascade "expected to be rare" in its balance impact.
  That expectation did not hold - see the disclosure above - though the effect is entangled with
  the two other uncommitted changes in the same tree, not cleanly attributable to Sprint 45 alone.
- `gameStore.ts` exposes two related-but-distinct booleans rather than one: `graceParkedCarView`
  (needs the occupant to resolve to a real, displayable car - used by `GarageScreen`) and
  `graceSlotOccupied` (the raw `graceParkingCarId !== null` fact - used by `AuctionScreen`'s
  capacity warnings). A test using a synthetic non-existent car id to occupy the grace slot
  surfaced this distinction: `graceParkedCarView` alone cannot gate a warning banner, since it
  resolves to `undefined` for any occupant id that isn't a real owned/service car.
- Every acquisition-blocked test across `bidding.test.ts`, `facilitiesInAdvanceDay.test.ts`, and
  `serviceJobs.test.ts` needed a second capacity dimension zeroed (not just a renamed string
  literal) to still produce a genuine block under the new 3-tier cascade - flagged in the Files
  touched section above since it was the most repeated fix across this sprint.

Nothing has been committed - this sits alongside the still-uncommitted Sprint 44 work and the
auction-lot-id-collision fix in the same working tree, awaiting the maintainer's review and
explicit commit permission.
