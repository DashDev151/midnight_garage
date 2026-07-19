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

- [ ] Demo screen + turn resolver + two canned lots (a quiet thin-turnout kei, a packed
      contested one).
- [ ] Copy for the room beats (orchestrator-authored, tone law).

## Exit

- [ ] Maintainer has played both rooms and issued a verdict; the verdict and its
      reasoning recorded here.
