# Sprint 103: Auction room demo II, the clock and the duel

**Date:** 2026-07-20
**Source:** maintainer order, 2026-07-20: the live demo "has potential" but needs "more of a
call and response, more of a feeling of a back and forth bet", visually indicated with rival
silhouettes and the player, "a winning chip above the leading one as well as the price in
green", and a time element: "if the player is not leading, and the clock runs out, then they
lose the auction. If they are leading and the clock runs out they win. Start with about 6
seconds per bid." Rivals must hesitate: "sometimes they bid quickly, then sometimes they bid
right as the time is about to run out." Goal: "Let me actually feel what it might feel like,
then we can make a call."

**Goal:** rebuild the dev-only auction room demo around a live per-bid clock and visible
opponents, so the maintainer can feel the back-and-forth before ruling on Sprint 100.

**Reflex-rule note (recorded, not repealed):** the hard design rule "no reflex-based input"
stands in the GDD. The maintainer explicitly sanctioned a timed cut-off for this demo trial
("I know this goes against my no QTE directive but it does not make sense to have an auction
like this if there is no cut-off"). Nothing outside the dev demo gains a timer; if the verdict
adopts the room, amending the hard rule is a maintainer decision to be recorded in the GDD at
that point.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- The whole Sprint 99 demo scaffold: the dev route, the DevConsole entry, the
  coverage carve-out (screen excluded, resolver covered), the view-local no-save law.
- The room builder's value seams (`anchorValueYen` / `reserveYen` / `bidIncrementYen`),
  the seeded ceiling wobble (`bellNormal` on per-dealer seeds), and the two-room
  thin/packed contrast.
- The bid ladder law: every bid lands exactly one increment above the board; a counter to
  an unopened lot lands at the reserve.
- The drop rule (a dealer drops when the next rung passes their ceiling), the rotating
  drop-line copy, the dealer name pool, and the room-log idiom.
- The existing palette tokens; the leader price uses `--mg-success`, the established
  semantic green.
- `vi.useFakeTimers` is already the house pattern for time-driven component tests.

**Genuinely new:**

1. A time-event model inside the machine: an absolute demo clock, a per-bid fuse, and one
   pending scheduled rival action at a time, all fired by a `tick(room, nowMs)` entry
   point. Time is injected, never read, so the machine stays deterministic and testable.
2. Dealer temperaments (snappy / steady / cagey) driving seeded hesitation delays, with
   lateness growing as the price nears a dealer's ceiling.
3. The presentation layer: a lobby, a silhouette row (the player seated with the dealers),
   a leading chip carrying the board price in green, and a draining fuse bar.

## Design

### The machine (auctionRoomDemo.ts, all logic, no timers inside)

- **Lobby then room.** `buildDemoLobby` rolls the same two canned lots (fixed catalogue
  seed) and returns lobby cards. `enterRoom(entry, runIndex, nowMs)` builds a LIVE room:
  dealers' ceilings and temperaments re-roll on a per-run seed
  (`auction-room-demo:{key}:run{runIndex}`), so run 0 is pinned for tests and every
  "Run it back" plays differently, deterministically.
- **The clock.** `BID_CLOCK_MS = 6000`. Every landing bid resets the fuse. `tick` fires
  whatever is due: the pending rival counter at its scheduled instant (the clock resets
  from that instant, not from the tick that observed it), else the hammer at fuse-out.
- **Hammer at fuse-out:** player leading wins; a dealer leading takes it; nobody yet on
  the board is a no-sale.
- **Openers.** On entry, any dealer whose ceiling covers the reserve may open unbidden;
  one is scheduled like any counter. A player who only watches loses the lot to the room.
- **Who counters.** Any active dealer whose ceiling covers the next rung is eligible; ONE
  is picked per landing bid, seeded uniform, and scheduled. Rivals therefore trade bids
  with each other while the player watches, not only with the player; the deepest pocket
  still outlasts everyone by construction.
- **Hesitation.** Temperament bands (ms): snappy 500-1800, steady 1500-3600, cagey
  3800-5600; weights 30/45/25. Pressure: over the last 30% of the runway to a dealer's
  own ceiling the sampled delay scales by up to 1.6x. Final clamp 400-5700, so a rival
  who intends to bid never fumbles the clock, but a cagey one under pressure lands with
  the fuse visibly dying.
- **Player actions.** Bid: reserve if unopened, else one rung up; discards and reschedules
  the pending rival action (your raise interrupts them). Let it go: only offered while NOT
  leading; hammers immediately to the leader, or rolls the lot back if nobody has bid.
  A leading bid cannot be withdrawn, so no button while leading.

### The screen (thin: renders, owns one interval, forwards clicks)

- Lobby: two cards (`Thin turnout · 2 dealers` / `Packed room · 6 dealers`), button
  `Take a seat`.
- Live room: silhouette row seating You with the dealers; the leader wears a chip above
  the head carrying the board price in `--mg-success` green; dropped dealers dim with a
  small `out` tag; a bidder flashes briefly as their raise lands.
- The fuse: a draining bar under the board price, amber, turning red under 1.5s.
- Clock drive: `setInterval` at 50ms advancing a component-local `demoNowMs` accumulator
  (no wall-clock reads; fake-timer friendly), each tick handed to the machine. Cleared on
  unmount.
- Outcome strip (`Yours.` / `Gone.` / `Rolled back.`) with `Run it back` (same lot, next
  run seed) and `Back to the lobby`.

### Copy (locked verbatim; lines not listed here are unchanged from Sprint 99)

- Rival opens: `{name} opens: {yen}.`
- Player opens: `You open: {yen}.`
- Player raise: `You raise: {yen}.`
- Hammer to a rival at fuse-out: `Hammer. {name} takes it at {yen}.`
- Drop-line rotation, two lines reworded (the old fixed "his" misgendered Mrs. Sakaki
  whenever the rotation landed on her): `{name} closes the folder.` /
  `{name} sets the paddle down.` / `{name} steps out for a smoke.` /
  `{name} checks the time and is done.`

## Tasks

**Claude-implementable:**

- [x] Machine: lobby/enterRoom/tick time-event model, temperaments, hesitation, openers,
      seeded responder pick, per-run reseeding; all constants in one block at the top.
- [x] Screen: lobby, silhouette row, leader chip (green price), fuse bar, interval drive,
      outcome strip, cleanup on unmount.
- [x] Tests: machine timeline pins driven by synthetic times (opener fires, counter
      cadence, pressure lateness, win/lose/no-sale at fuse-out, interrupt-reschedule,
      run-index reseeding); screen tests on fake timers (chip follows the leader, letgo
      hidden while leading, no leaked timers after unmount).
- [x] sprint99.md Exit: point the open verdict at this v2 room.

**User-only:**

- [ ] Play both rooms (DevConsole chip), several runs each; rule on the feel and on
      Sprint 100. (Superseded by Sprint 104: the demo now carries the fair-odds read, the
      wholesale ceiling, and the inspection verdict; rule on that version.)

## Exit

- [x] Machine rebuilt as a pure time-event model: an injected demo clock, one pending
      rival action, `tick()` the only mover; every tuning figure in one constants block
      (`BID_CLOCK_MS` 6000; bands snappy 500-1800 / steady 1500-3600 / cagey 3800-5600,
      weights 30/45/25; pressure up to 1.6x over the last 30% of a dealer's ceiling
      runway; delay clamp 400-5700, which also guarantees a scheduled counter always
      lands before its own fuse). Zero wall-clock or Math.random reads in the machine or
      the screen (the component advances a 50ms accumulator), so every timeline is
      seeded and pinned.
- [x] The feel orders all land: You seated in the silhouette row; a single leading chip
      carrying the board price in `--mg-success` green; the fuse draining under the
      board, `--mg-danger` red under 1.5s; a 600ms flash on the seat that landed the
      last bid; rivals trading bids with each other (a watched lot is lost to the room);
      hesitation from snap-bids to fuse-dying counters; `Run it back` reseeding each run.
- [x] Run-0 thin timeline (pinned in tests): Endo ¥207,493 steady, Mrs. Sakaki ¥231,383
      snappy; Mrs. Sakaki opens at 1744ms; watched to the end she takes it at ¥208,774
      after Endo folds; fought to the end the player wins at ¥228,774. Late bids are a
      tell: the pressure stretch means a rival bidding near the buzzer is near their
      ceiling, so the clock feeds the reading game rather than replacing it.
- [x] Personally traced (orchestrator, this sitting): machine and screen read in full;
      hesitation arithmetic re-derived by hand (4700 low-pressure cagey, 5700 clamp at
      ceiling, 3315 mid-span steady, 500 snappy floor - all match the pins); drop-rung
      and win-price arithmetic re-checked against the ceilings; locked copy verified
      verbatim; letGo/bid guards confirmed in both machine and template; the single
      interval confirmed cleared on unmount (timer-count test pins it); no stale
      importers of the old machine API anywhere in packages/.
- [x] Evidence, narrowest once (agent's single final run): `auctionRoomDemo.test.ts`
      14 passed + `AuctionRoomDemoScreen.test.ts` 7 passed - Test Files 2 passed,
      Tests 21 passed. Machine stays coverage-included, screen stays excluded; router,
      DevConsole and vitest.config.ts untouched. Uncommitted pending maintainer word,
      alongside the Sprint 99/102 batch. The verdict sitting (user-only task above)
      rules on the feel and on Sprint 100.
