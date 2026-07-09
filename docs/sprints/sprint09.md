# Sprint 09 — Facilities & Bays (work capacity vs. storage)

*Source: the committed requirements capture `docs/design/facilities-bays.md` (written 2026-07-09 at
the maintainer's request, agreed as the sprint directly after Sprint 08), elaborating GDD §258's
"Tools, not levels" shop-equipment progression. This is planned scope, not new scope. Status:
**implemented and locally verified — ready for review.***

## Goal

Make the shop physical. Today the garage is infinite: any number of cars can be held and all of them
can receive labor on the same day — the only throttle is the daily labor budget. This sprint adds the
two capacities that turn the shop into a real place with real walls:

- **Parking bays = storage.** How many cars the shop can *hold* — owned cars and accepted customer
  cars alike. Full parking means you cannot take on more (auction wins, buyouts, job accepts).
- **Service bays = work capacity.** How many cars can be *actively worked* at once. **Labor only
  flows to a car sitting in a service bay** — owned-car builds and customer jobs both.

The player moves cars between parking and service, buys additional bays with yen (the first visible
"the shop itself is upgradable" beat), and feels the labor↔bays↔staff growth loop begin: add bays →
need labor to fill them → (Sprint 13) hire staff → idle labor → expand again.

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused (no parallel systems)

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Per-day player intent | `DayActions` + `emptyDayActions()` (`sim/actions.ts`) | Moves and bay purchases are **new additive fields on the same object** — not a second action channel. Bots and the store already speak this shape. |
| Committing a day | `advanceDay(state, actions, seed, context)` | Bay logic is new **steps inside the same function** (moves/purchases resolve first; capacity checks live inside the existing acquisition steps). No second resolver. |
| The day plan in the UI | `useGameStore.pending: DayActions` + `planActions()` | Queued moves/purchases ride the existing pending plan; `planActions`' labor auto-allocator gains a bay filter, not a rewrite. |
| "Which cars are in the shop" | `ownedCars` + `activeServiceJobs[].car` (Sprint 08's `findWorkableCar`) | Bay occupancy references these cars **by id**. No new car list, no car copies. |
| Work on a car | `jobs` / `createJob` / `applyLaborToJob` / `completeJob` | Untouched. The bay gate is a **filter in advanceDay's existing labor step** (and one new `job-blocked` reason), not a new work path. |
| Blocked-work signalling | `job-blocked` DayLogEntry with `reason` enum | **Extend the enum** with `'not-in-service-bay'` — reuse the entry, don't invent a sibling. |
| Static tunables | Content law: JSON under `packages/content` + Zod + `SimContext` | Bay start counts / caps / prices are a new `facilities.json` carried on the **existing** `SimContext`, same as parts/models/templates. |
| Save evolution | Save law: `SAVE_VERSION` bump + `MIGRATIONS` chain + golden-save test | v3 migration is **default-fill**, exactly the v1→v2 pattern. |
| Balance validation | `BotStrategy → DayActions` + `runCareer` + the Python harness | Bots gain move actions inside the DayActions they already return. The `BotStrategy` contract is untouched. |
| Immediate player resolution | `resolveServiceJob` precedent (pure sim fn, two triggers: instant store call for the player, advanceDay path for bots) | **Moves and bay purchases reuse this exact pattern** — `applyMoves` / `applyBayPurchase` are pure sim cores; the store calls them instantly on click, advanceDay calls the same functions to resolve bots' queued `moveCars` / `buyBays`. One resolution core each, never two. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Bay occupancy state** — `serviceBayCarIds: string[]` on GameState (plus two owned counts). No
   existing concept tracks *where* a car sits. Everything not in the array is implicitly in parking —
   one list, no per-car location field, no map to keep clean.
2. **A capacity rule** — parking occupancy = (owned cars + active service jobs) − (cars in service
   bays); acquisitions are blocked at capacity. No existing cap exists (that's the point).
3. **Move + buy-bay actions** — two new DayActions fields (`moveCars`, `buyBays`), because no
   existing action changes car location or shop capacity.
4. **A facilities catalog** — `facilities.json` (start counts, max counts, per-bay price ladders).
   First content file about the *shop* rather than its inventory.
5. **Two DayLogEntry types** — `car-moved`, `bay-purchased` — plus one `acquisition-blocked` entry
   and the `job-blocked` reason extension.
6. **Garage-screen bay layout** — the garage view reorganizes around service slots vs. parking rows.
   UI restructuring of an existing screen, not a new screen.

## Definition of Done

- GameState carries `serviceBayCount` / `parkingBayCount` / `serviceBayCarIds`; `SAVE_VERSION` → 3
  with a default-fill migration (start counts 1 / 3, empty service bays) and the golden-save test
  updated, same PR.
- **Labor only reaches jobs whose car is in a service bay.** A labor assignment targeting a
  parked car is skipped with a `job-blocked (not-in-service-bay)` log entry. Owned-car builds and
  customer jobs are gated identically.
- **Space is required at delivery, never at bidding:** the player can always queue bids, buyouts,
  and accepts; at resolution, a car that has no parking space to arrive into falls through with an
  `acquisition-blocked` log entry and **no money spent**. The UI warns ("parking full") but never
  blocks the action.
- The player **moves cars between parking and service instantly and for free** — unlimited moves per
  day, applied the moment they click (pure `applyMoves` core; bots reach the same core via `moveCars`
  DayActions). **Bay purchases are equally instant** (`applyBayPurchase`; `buyBays` for bots),
  escalating content-priced and capped at max counts — a bay bought today is usable today.
- The garage screen shows **service bays as slots** (car + work state, or empty) and **parking** as
  the waiting line — including customer cars (badged) — with move controls and a Facilities panel
  (counts, next-bay price, buy buttons).
- All five bots play legally under bay rules (they move cars into service bays via DayActions); the
  Service Grinder stays solvent with 1 service bay. Golden masters re-pinned (GameState shape
  changes; the scripted careers gain move actions).
- All checks green; new content/sim/game tests pass.

## Proposed decisions (approve / adjust before implementation)

1. **Occupancy is a single id list, not a per-car field.** `serviceBayCarIds: string[]` (length ≤
   `serviceBayCount`); any shop car not listed is in parking. Keeps `CarInstance` pure (auction lots
   and codec untouched), makes capacity checks one-liners, and cleanup is a filter when a car leaves
   (sell / job hand-back already filter lists). Individual bay *identity* (bay #2 vs bay #3) is
   cosmetic until equipment attaches to specific bays (~Sprint 14) — not modeled yet.
2. **Moves are instant and free for the player; DayActions exist only so bots can play (maintainer,
   2026-07-09).** The player has complete freedom: click to move a car between parking and a service
   bay and it happens *that instant*, no cost, no queue — move the same car 5–6 times in one day if
   you like. Mechanically this is the `resolveServiceJob` pattern: a pure sim core (`applyMoves`)
   with two triggers — the store calls it immediately on click; `advanceDay` calls the same function
   at step 0 to resolve the `moveCars` DayActions that headless bots (which can only speak
   DayActions) queue. One resolution core, no duplicated rules. The only thing that matters
   economically is *where each car sits when labor resolves on End Day* — at most
   `serviceBayCount` cars can occupy service bays at any instant, so shuffling freely never beats
   the cap. **Bay purchases work identically** (instant for the player via `applyBayPurchase` —
   buy a bay, use it the same day; `buyBays` DayActions for bots), following the same precedent of
   instant cash effects that `resolveServiceJob`'s payout set.
3. **Manual moves only — no auto-fill.** When a service bay frees (sale, hand-back), it stays empty
   until the player moves the next car in. Decision-paced pillar; auto-pull can be a later
   staff-trait delegation (Sprint 13's arc), not a v1 rule.
4. **Queuing work stays unrestricted; only labor is gated.** You may create a repair/install job for
   a parked car (planning ahead); it simply makes no progress until the car is in a service bay.
   One gate, in one place (advanceDay's labor step + `planActions`' allocator skips parked cars).
5. **Bidding is always allowed; space is required to take DELIVERY (maintainer, 2026-07-09).** The
   player can queue bids, buyouts, and job accepts freely regardless of parking state — no UI
   blocks. The capacity check happens at resolution, when the car would actually arrive: if parking
   (counted live, including cars received earlier in the same resolution) is full, the delivery
   falls through — no money spent, the win/buyout is forfeited to the rivals (or the offer stays on
   the board for accepts), and an `acquisition-blocked (no-parking)` entry explains why. The UI
   shows a "parking full — you can't take delivery" warning next to acquisition controls, but never
   prevents the action. Same-day sales free space only for the *next* day (sells resolve after
   auctions in advanceDay's existing step order, which this sprint does not reorder).
6. **First-pass numbers** (all in `facilities.json`, tunable): service bays start 1 / max 5, next-bay
   prices ¥300k → ¥750k → ¥1.5M → ¥3M; parking bays start 3 / max 15, prices ¥80k → ¥1M escalating
   across the 12 purchasable bays. The ¥300k second service bay is the first-month expansion beat
   (a few service jobs + one flip). The v2→v3 migration just default-fills the new fields — there
   are no real player saves yet (pre-launch, dev saves only); if a dev save happens to hold more
   cars than 3 parking bays it simply can't acquire more until it drains below capacity, which the
   delivery rule (decision 5) already handles with no special-case code.
7. **Bays ship standalone** — no lift/dyno equipment slice yet (that's the Sprint 14 "tools" arc per
   the roadmap); bays are deliberately its first, simplest axis.
8. **Deadline interplay flag:** with one service bay, accepting several customer jobs at once invites
   deadline failures — intended tension (don't overbook), but `SERVICE_JOB_DEADLINE_DAYS` (7) may
   need a bump if the harness shows repair jobs can't fit through a 1-bay pipeline. **Left unchanged
   this sprint** — it's a number to revisit from the user's local harness run, not something to
   hand-tune without that data.
9. **Dev console `devGrantCar` bypasses the parking cap** (dev-only tool; noted in code).

## Task breakdown

### A. Content (`packages/content`)

- [x] `src/facilities.ts`: `FacilitiesSchema` — per bay kind: `startCount`, `maxCount`,
  `bayPricesYen: number[]` (price of the Nth purchased bay; length = max − start, refined). Parsed
  export `FACILITIES` from new `data/facilities.json` via `data.ts`.
- [x] `GameStateSchema`: `serviceBayCount` (default 1), `parkingBayCount` (default 3),
  `serviceBayCarIds` (default `[]`). New `DayLogEntry`s: `car-moved` (carInstanceId, to:
  `service | parking`), `bay-purchased` (kind, priceYen), `acquisition-blocked` (kind:
  `auction-win | buyout | service-accept`, reason: `no-parking`); extended `job-blocked` reason enum
  with `not-in-service-bay`.
- [x] Save law: `SAVE_VERSION` → 3, v2→v3 default-fill migration (no explicit `MIGRATIONS[2]` step
  needed), golden-save test updated (both the v1 code and a newly-pinned v2 code decode with the
  bay fields default-filled).

### B. Sim (`packages/sim`)

- [x] `actions.ts`: `moveCars: [{ carInstanceId, to: 'service' | 'parking' }]`,
  `buyBays: [{ kind: 'service' | 'parking' }]` (additive; `emptyDayActions` covers callers).
- [x] `src/facilities.ts`: pure helpers — `parkingOccupancy(state)`, `hasParkingSpace(state)`,
  `releaseCarFromServiceBay(state, carId)`, `moveCar`/`applyMoves(state, moves)` (existence,
  capacity — including the "pulling a car out needs parking room" case decision 1 didn't originally
  spell out), `nextBayPriceYen(state, kind, facilities)`, `applyBayPurchase`/`applyBayPurchases`.
- [x] `context.ts`: `SimContext.facilities` (parameter on `buildSimContext`, defaulted to a
  permissive start-1/max-1, start-3/max-3 fallback so the ~10 pre-Sprint-09 test call sites that
  don't pass it keep compiling and still get sane new-game bay counts).
- [x] `advanceDay.ts`: new step 0 — resolves bots' `buyBays` then `moveCars` via the same
  `applyBayPurchases` / `applyMoves` cores the store calls instantly, logging both; the labor step
  skips jobs whose car is not in `serviceBayCarIds` (`job-blocked` / `not-in-service-bay`);
  **delivery checks** inside the accept (1c — restructured to update `next` per-accept so multiple
  accepts in one day are checked live against each other), buyout, and bid (4) steps: a blocked
  buyout/accept spends nothing and leaves the lot/offer available; a blocked *won* bid forfeits to
  the rivals (`acquisition-blocked` + `auction-bid-lost` together, since the auction already
  resolved); walk-in sell, listing, and `resolveServiceJob` all release the departing car's bay slot.
- [x] Bots: shared `bayHelpers.ts` (`serviceBayBudget`, `claimServiceBay` — a mutable free-bay
  counter + claim-or-skip helper, used instead of the doc's proposed `ensureInServiceBay` name) used
  by Flipper / Cautious Restorer / Balanced Player / Random Strategy's existing repair loops; Service
  Grinder additionally moves a finished car back to parking to free the bay for the next offer.
  Harness re-run is a user-side check, not CI (every bot's numbers shift under bay scarcity).
- [x] Golden masters: re-pinned both careers (new GameState fields; the job-loop career's script
  gained a day-1 `moveCars` action to keep doing the same repair work under the bay gate).

### C. Game (`packages/game`)

- [x] Store: `serviceBaysView` (one entry per bay slot — car or `null`), `parkingView` (owned +
  customer cars, badged `isCustomerCar`), `parkingCapacity` / `parkingOccupancyCount` /
  `serviceBayCount` / `serviceBayFreeCount` / `parkingFull` computeds, `nextBayPrice(kind)`;
  **instant** `moveCar(carId, to)` and `buyBay(kind)` (call `applyMoves` / `applyBayPurchase` on
  live state, `resolveServiceJob`'s pattern — no pending queue); `planActions` allocator skips any
  job (in-progress or newly-queued) whose car isn't currently in `serviceBayCarIds`; `CarDetail`
  gained `inServiceBay`.
- [x] `GarageScreen.vue`: reorganized into **Service bays** (slots with car + "→ parking") /
  **Parking** (cars with "→ service", disabled at zero free bays) / **Facilities** panel (counts,
  next-bay price, instant Buy buttons, "maxed out" at the ceiling). The old flat car-grid is gone —
  every shop car now shows exactly once, in whichever list it actually occupies.
- [x] `CarDetailScreen.vue`: a bay-status row (in bay / parked + a labor hint) with a toggle move
  button, shown for both owned and customer cars.
- [x] `describeLogEntry`: the three new entries + the new blocked reason.
- [x] `AuctionScreen.vue` / `ServiceJobsScreen.vue`: a `parkingFull` warning banner; bid/buyout/accept
  controls are never disabled by it, matching decision 5.

### D. Testing

- [x] Content: `gameState.test.ts` extended with the bay fields + the three new log entries.
- [x] Sim: two new files — `facilities.test.ts` (occupancy, `moveCar`/`applyMoves` in both
  directions incl. the parking-room-on-exit case, `applyBayPurchase`/`applyBayPurchases` incl. the
  escalating-ladder batch case) and `facilitiesInAdvanceDay.test.ts` (labor blocked/unblocked by bay
  membership, buyout/bid/accept all blocked at full parking with zero spend, a won bid forfeiting to
  rivals, buying a bay via DayActions being usable same-day). `newGame.test.ts` gained a bay-seeding
  case. Existing hand-built `GameState` literals across 4 test files gained the 3 new required
  fields.
- [x] Store: new `gameStore.facilities.test.ts` (start counts, parking-not-bay on grant, free
  repeated moves, refusal cases, buy-then-use-same-day, `parkingFull`). `gameStore.garage.test.ts`
  and `gameStore.jobs.test.ts` updated to move a car into the bay before queuing work that needs
  labor — the same real behavior change every bot needed.
- [x] Component: `GarageScreen.test.ts` rewritten for the new layout (parking vs. bay-slot
  assertions); `CarDetailScreen.test.ts` drives the toggle-bay button before repairing.
- [ ] Bots: Service Grinder solvent with 1 bay over 100 days — **local harness run, user-side**
  (`pnpm balance:run` then `python -m balance.cli check`); not run as part of this implementation
  pass per the data air-gap / no-background-process rules.

## Claude-implementable vs user-only

**Claude-implementable:** all of A–D. No new dependencies.

**User-only:** play a few days — feel the 1-service-bay squeeze, buy the second bay, confirm the
shuffle (move out / move in) is tactile rather than annoying; optionally re-run the balance harness
(`pnpm balance:run`, then `python -m balance.cli check`) since every bot's behavior changes under
bay rules.

## Implementation notes & verification

- **Step order in advanceDay** becomes: 0 buy bays → moves → 1 create jobs → 1b buy parts →
  1c accept jobs (parking check, now per-accept live) → 2 labor (bay gate) → 3 complete jobs →
  4 auctions (parking check) → 5–7 sells/listings (release the bay slot) → 8 expiries/refresh +
  service-job deadline backstop → 9–11 as today. Existing steps are not reordered.
- **All five bots needed the bay treatment, not just Service Grinder** — Flipper, Cautious Restorer,
  Balanced Player, and Random Strategy all queue repair jobs on owned cars, and with the labor gate
  live their jobs would have silently stopped progressing without a move-in step. This wasn't fully
  spelled out in the original task breakdown (which only mentioned Service Grinder explicitly) but
  was a correctness requirement, not an optional polish pass — caught by actually running the sim
  test suite rather than assumed from the design doc.
- **`moveCar` also gates the exit, not just the entry** — decision 1's "any shop car not listed is in
  parking" implies pulling a car OUT of a service bay increases parking occupancy by one; if parking
  is already full there's nowhere for it to go. This case wasn't explicit in the design doc but falls
  straight out of the capacity model, so `moveCar` refuses that move too (a no-op, same as every
  other capacity-gated action in this system).
- **Golden masters re-pinned**, exactly as expected: new GameState fields change the hash regardless
  of bay usage, and the job-loop career's script needed one added `moveCars` action (day 1) to keep
  reproducing its original repair/install outcome under the labor gate.
- **Verification:** `pnpm typecheck / lint / format / build` all green; **231 tests across 44 files**
  (was 195/41) — 15 new sim `facilities.test.ts` cases, 5 new `facilitiesInAdvanceDay.test.ts` cases,
  7 new store `gameStore.facilities.test.ts` cases, plus updates across ~12 existing test files.
  Save `SAVE_VERSION` → 3 (additive; v1 and v2 saves both still load via default-fill, both pinned
  and tested).

## Exit

The shop has walls: storage and work capacity are real, expansion is the first visible facility
upgrade, and the labor↔bays↔staff loop has two of its three legs (staff land in Sprint 13). This is
the last core-loop mechanic before the **Fun Gate** pass — after this sprint, a stranger's first 30
minutes contain earn (jobs), hunt (auctions), build (jobs/parts), sell (two channels), and grow
(bays), all persisted.
