# Sprint 99: The live room, as a throwaway demo (economy legibility, stage 2)

**Date:** 2026-07-19 (planned)
**Source:** `docs/design/economy-legibility.md` plank 3; the maintainer's 2026-07-12
live-bidding ruling (TODO.md): build a STRIPPED demo first, decide from the demo.

**Goal:** one screen that lets the maintainer FEEL the live auction room before any of
the real system is ripped out. Enter a sample lot's room; an open raise ladder; each
dealer visibly raises or drops out; the player chooses raise or pass each turn; the
round resolves win/lose in one sitting. No timers, no reflex input (accessibility law).

## Reuse analysis (directive 16)

**Reused:** dealer ceilings from the existing seam (`anchorValueYen` x turnout wobble -
the same `privateValuationYen` shape, minus the wholesale fraction, which the wobble
absorbs for the demo); `bidIncrementYen` for the ladder; the existing lot card
presentation for the subject lot; Sprint 98's room-number ledger for the header.

**New (all throwaway-scoped):** the room screen itself (a dev-route, like the art
spike), a tiny turn-resolver (dealer raises while ceiling >= next rung, visibly passes
otherwise), and canned sample lots. NO saves, NO board integration, NO tuning pass -
the demo exists to answer one question: does this feel right for the game.

## Decisions

1. Reachable from the dev chip only; coexists with the live overnight system; deleted
   or promoted by Sprint 100, never left to rot.
2. Dealer personalities are visual only (names/flavour on the drop-out line); their
   maths is the wobbled ceiling, nothing else - the demo tests the FEEL of visible
   price discovery, not new AI.
3. Exit is a maintainer verdict, not a metric: proceed to Sprint 100, iterate the demo,
   or keep the overnight model.

## Tasks

- [x] Demo screen (`AuctionRoomDemoScreen.vue` + `auctionRoomDemo.ts` turn resolver, dev
      route + DevConsole entry, coverage-excluded screen with the resolver module still
      covered) + two canned deterministic rooms: thin (Toyota Carina, 2 dealers, wide
      wobble) and packed (Honda City, 6 dealers, tight wobble). The maintainer halved
      the bid ladder before the verdict sitting: `AUCTION_BID_INCREMENT_FRACTION` 0.025
      plus the new `AUCTION_BID_INCREMENT_STEP_YEN` (5000) anchor, so a kei's ladder
      steps at exactly ¥5,000 (bible amendment logged; two advanceDay golden hashes
      re-derived; `bidding.test.ts`'s two `bidIncrementYen` pins were missed here and
      later re-pinned to the new ladder, referencing the config constants so they
      cannot go stale again). Fresh-game outcomes, raising to the end: thin WON at ¥198,774
      against room-says ¥181,290 (¥5,000 rungs; Mrs. Sakaki folds, Endo fights to
      ¥193,774); packed WON at ¥180,730 against room-says ¥167,884 (its book still
      rounds the ladder to ¥10,000; Toyoshima does all the countering, four dealers
      priced out at the ¥170,730 rung). Six smoke tests pin the beats.
- [x] Copy for the room beats (orchestrator-authored, tone law; verified verbatim in
      situ).

## Exit

- [x] First maintainer sitting, 2026-07-20: "confusing and shitty. But I think it has
      potential" - iterate the demo (option 2 of decision 3). Orders: real call and
      response, rival silhouettes with a winning chip and the price in green, a ~6
      second per-bid clock (leading at fuse-out wins, trailing loses; a sanctioned
      demo-only exception to the reflex rule), and rivals that hesitate rather than
      counter instantly. The rebuilt room is Sprint 103's, then extended by Sprint 104
      (fair-odds read, wholesale ceiling, inspection verdict); the final verdict (proceed
      to Sprint 100 / iterate again / keep the overnight model) now sits on the Sprint 104
      version.

**Feel observations from this version** (carried forward to the Sprint 103 sitting):
both rooms, fought to the end, hammer ABOVE the room's number - the wobble's upside
means the strongest dealer can chase past the sheet, so walking away at the right rung
is the skill being tested, and the turnout premium is real. The instant-counter flow
also made a contested room read as one duel with an audience; Sprint 103's any-eligible
responder pick addresses exactly that.
