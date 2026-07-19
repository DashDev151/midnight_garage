# Sprint 100: The room replaces the overnight sim (economy legibility, stage 3)

**Date:** 2026-07-19 (planned; GATED on the Sprint 99 verdict)
**Source:** `docs/design/economy-legibility.md` plank 3.

**Goal:** the demo's room becomes the real auction flow; the invisible overnight bid
machinery is deleted.

## Scope sketch (full reuse analysis written when the sprint opens, after the demo
verdict shapes it)

- Lots list with visible interest (turnout shown); the player enters a lot's room on
  any day of its listing; unentered lots resolve at expiry (dealer-vs-dealer settle or
  no-sale) with one seeded roll instead of nightly steps.
- DELETED: `advanceLotOvernight`'s raise-chance machinery (per-cohort chances,
  value-gap eagerness, competitive pressure, `maxIncrementsPerNight`), quiet-day
  hammer counting, anti-snipe, `AUCTION_WHOLESALE_FRACTION`. Ceilings become
  anchor x wobble only.
- KEPT: reserve/buyout, increment ladder, turnout weights and wobble spreads, the
  scripted tutorial lot's guaranteed-win pins (re-expressed in room terms: no dealer
  enters the scripted room).
- The tutorial walkthrough's close step re-scripts to the room ("step in and bid the
  reserve; the room is quiet") - orchestrator-personal copy + a fresh step trace.
- Heavy probe/golden re-derivation, disclosed; the bot-harness impact is nil
  (directive 21 - bots remain forbidden and their auction pathways are already
  distrusted).

## Exit (drafted when opened)

- [ ] Overnight machinery gone; knob count matches the design doc's table.
- [ ] Tutorial trace re-run end to end through the room.
