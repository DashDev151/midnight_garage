# Sprint 110: The promotion (the live room and the failure map enter the main game)

**Date:** 2026-07-21
**Source:** maintainer mandate, 2026-07-21: "commit, redesign sprint 100, then continue
directly to the full implementation... full control to implement this end to end."
Supersedes `sprint100.md`, which was scoped before the live-room redesign and is stale by
its own history. The demo is signed off; this sprint makes it the game.

**One-line goal:** the overnight auction is gone; every lot resolves in the live room,
inspection is the routed failure map, and auto-bid ships with the fuse as its
accessibility counterpart.

## Reuse analysis (directive 16)

**Existing mechanisms reused (the promotion is a re-plumbing, not a rebuild):**

- The demo's room machine (`auctionRoomDemo.ts`): the drawn-clearing model, the fuse,
  reactions, bid sizing, the seeded stream and draw-order law. Generalised into a
  config-driven `auctionRoom.ts`; the demo keeps its own screen but reads the same
  machine and the same content config (one source of truth, no fork).
- The failure map: already IS the production inspection system (the board and demo share
  `SymptomChecklist` and the store getters). The promotion adds nothing to diagnosis;
  it inherits it.
- `sheetGuideValueYen` (the room read), `playerEstimateYen` (the player's number),
  `runTestIds` (the inspected flag): the room's knowledge model is already live data.
- The existing buyout/purchase settlement seam in sim: the hammer settles through the
  same pure purchase path; no new money mechanics.
- The lot lifecycle (spawn, expiry, tiers, travel fees, the visit system): unchanged.
- `AuctionLotCard` and its slots: the card keeps identity/grades/checklist/ledger; only
  the actions slot changes (the bid stack dies, "Take a seat" replaces it).
- The `testRun` tutorial condition and the two-step find flow: untouched; only the bid
  step's guidance changes.

**Genuinely new:**

1. `auctionRoom` content config (schema + JSON): the whole ROOM_TUNING block, including
   the reactions and a `steady` turnout band (real lots have three turnouts; the demo
   had two).
2. A sim-level pure settlement for a hammer win (or reuse of the buyout resolver with an
   arbitrary price, whichever the code offers cleanest).
3. The production room screen (route per lot) built from the demo's room UI.
4. Auto-bid + fuse-length setting: the accessibility suite v1.
5. Removal: the overnight bidder process in `advanceDay`, the `auctionInterest` config,
   and the persistent bid/outbid lot fields.

## Design decisions

1. **The machine moves, the demo follows.** `auctionRoom.ts` (game package) is the
   generalised machine; `ROOM_TUNING` leaves code for `economy.json`'s new `auctionRoom`
   block (content law). The demo screen switches to the shared machine and config; the
   dev force strip stays demo/dev-only, never in the production room.
2. **One sitting per lot per day.** Enter the room from the lot card. Hammer to a dealer
   removes the lot (sold). Walk away before bidding, or a no-sale, keeps the lot until
   its natural expiry. No run-it-back outside the demo.
3. **The hammer settles instantly** through the sim's pure purchase path at the hammer
   price: cash out, car in, same day. No overnight anything.
4. **Overnight bidding dies wholesale** (directive 19: no legacy branches): the
   `advanceDay` bidder process, `auctionInterest`, `leadingBidder`/`playerHasBid`
   persistence, and the old increment ladder config all go. Dexie bump, goldens re-pin,
   no migration.
5. **Bots acquire via buyout only.** The harness is already ruled non-evidentiary
   (TODO.md standing item; directive 21). Strategies keep compiling through the buyout
   path; career pins re-derive to whatever honestly falls out. No bot learns to sit in
   a room; that is the rework's job, later.
6. **Auto-bid is part of the room, not a menu apology:** an in-room toggle, ceiling
   defaulting to the player's own number (editable), placing rung-one bids automatically
   while the room is live. It never jumps, so reactions stay reader-triggered. The
   fuse-length setting (three presets scaling `clockMs`) ships beside it in a small
   persisted settings slice. Both recorded as the accessibility suite v1 (TODO.md).
7. **The tutorial's auction lesson becomes the quiet room:** the scripted lot's room
   rolls no dealers ("a quiet morning, nobody else came"), so the player bids the
   reserve, holds one fuse, and wins honestly at reserve. Copy is
   orchestrator-authored; the guided flow personally traced.
8. **Turnout bands:** thin and packed keep their demo bands; `steady` sits between
   (dealers 4, clear 0.72-0.90 as the starting values, tunable like everything else).
9. **Demo screens survive** as dev sandboxes (they are the tuning bench and the map
   walkthrough); the auction board routes to the real room.
10. **The Exit cites the pre-push gate** (directive 20); the promotion lands as one
    verified batch.

## Tasks

**Claude-implementable (waved):**

- [x] Wave 1: `auctionRoom` schema + content block (incl. steady + reactions);
      `auctionRoom.ts` generalised from the demo machine; demo re-pointed to both;
      machine tests moved/extended.
- [x] Wave 2: sim settlement seam; `advanceDay` overnight removal; `auctionInterest`
      and bid-field removal; Dexie bump; bot strategies to buyout-only; sim/content
      re-pins (goldens, probes) from real runs.
- [x] Wave 3: production room screen + card actions + auto-bid + fuse setting; tutorial
      quiet-room + bid-step copy (orchestrator-authored); game re-pins.
- [x] Wave 4: orchestrator verification (tutorial trace, room laws, hygiene), Exit,
      regenerated map outputs if content moved.

**User-only:**

- [ ] The first full-game playtest of the promoted systems; tune the room block, the
      odds, and the reaction chances against the real loop.

## Exit

- [x] The machine generalised bit-identically (every demo pin survived the move) into
      `auctionRoom.ts`, config-driven from `economy.json`'s `auctionRoom` block (steady
      turnout added: 4 dealers, 0.72-0.90). The demo runs the shared machine and config:
      it remains the tuning bench for the real game.
- [x] The overnight auction is gone wholesale: the `advanceDay` bidder process,
      `auctionInterest`, the bid ladder constants, `bidsOnLots`, and the persistent
      bid/outbid lot fields all removed; lots now simply expire. Dexie 43 -> 44, no
      migration (directive 19). `settleAuctionHammer` shares one settlement core with
      buyout; a dealer hammer removes the lot through `settleAuctionLotLost`.
- [x] Decision 2 SUPERSEDED mid-sprint by something better: no one-sitting-per-day field.
      The room is seeded per lot per day, so re-entering replays the identical room -
      determinism is the anti-scum mechanism, and the schema stays smaller.
- [x] Production room shipped: `AuctionRoomFloor` shared by demo and the new routed
      `AuctionRoomScreen`; the room reads live data only (`sheetGuideValueYen`,
      `playerEstimateYen` over the narrowed lot, `runTestIds` for the inspected flag);
      raise options past cash disable with a reason; win settles instantly, cash out,
      car in. The demo's omniscient flip epilogue is demo-only (`Learned.trueValueYen`
      optional).
- [x] Accessibility suite v1: in-room auto-bid (ceiling defaults to the player's number,
      rung-one bids only, so reactions stay reader-triggered) and the fuse presets
      (standard/relaxed/unhurried) persisted in `uiSettings`.
- [x] The tutorial's auction lesson is the quiet room: no dealers on the scripted lot,
      bid the reserve, hold the fuse, win honestly; completion on ownership; the dead
      overnight "close" step deleted (ten steps now). Copy orchestrator-authored and the
      flow personally traced end to end (anchor, conditions, completion, the machine's
      zero-dealer path).
- [x] Two real bugs caught in the waves and fixed with tests: the machine scheduled a
      phantom opener in a dealerless room (crash in `landRoomBid`), and a Vue
      function-prop default silently disabled every raise button (Vue treats Function
      defaults as values, not factories).
- [x] Bots acquire via buyout only; walk-away multipliers unblocked (1.0 -> 1.3
      baseline) because the flat 1.25x buyout premium was mathematically unreachable
      under the old targets - a mechanical unblock, not balance tuning, flagged for the
      harness rework. Career pins re-derived honestly (directive 21 untouched: Vitest
      regression only, no career harness runs).
- [x] Open for the maintainer: the economy-bible anchor inventory has no `auctionRoom`
      row (bibles need recorded approval to amend; `staff` and `machineShopAssist` are
      already missing from that table, so the gap has precedent and awaits one ruling).
- [x] Evidence: game 53 files / 631 passed; sim + content 67 files / 1450 passed;
      typecheck clean. The pre-push hook is the full gate (directive 20); committed as
      one verified batch under the maintainer's end-to-end mandate.
