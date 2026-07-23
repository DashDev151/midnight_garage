# Sprint 117: Auction admission (built dark, tuned later)

**Date:** 2026-07-23. Source: the maintainer's D3 ruling ("build the mechanic where a player
needs to pay to attend the nicer auctions, but set it to 0 by default",
`docs/design/midgame-decision-brief.md`). The zeros ARE the maintainer-approved lever values
(directive 22 satisfied by the ruling itself); tuning them upward is a playtest decision
later. Queued behind Sprint 115's implementation (shared files).

**One-line goal:** attending a sale can cost money; today it costs nothing.

## Reuse analysis (directive 16)

**Reused:** the room-entry seam (the same action that seats the player charges the
admission); the existing cash-gate refusal idiom; the `economy.auctionRoom` content block
(admission lives beside the room's other knobs); the approval-gate re-pin discipline.

**Genuinely new:** `auctionRoom.attendanceFeeYenByTier` (all four tiers, ALL ZERO);
`gameState.attendanceFeePaidDayByTier` (which day each tier's admission was last paid:
recorded only when a nonzero fee is actually charged, so at zero the field stays empty);
the room header's admission line (rendered only when nonzero). Deleted: the dead
`AUCTION_TRAVEL_FEE_YEN` block and its schema/test rows (superseded twice over).

## Design decisions

1. **Per day, per tier, at the seat.** The first "Take a seat" at a tier each day charges
   that tier's admission; later sittings at the same tier that day are covered. Buyouts
   are exempt (the desk, not the room). Inspection visits keep their own existing travel
   fee: two separate fictions, no interaction, no double-charge ambiguity.
2. **Zero means silent.** No fee line, no "free admission" copy, no state recorded. The
   mechanic is invisible until a tier's number moves.
3. **Dexie bump only** for the new state field (directive 19).

## Tasks

- [x] Content: the zeroed fee map + schema; the dead travel-fee block deleted; approval
      gate re-pinned against this doc's ruling; schema tests.
- [x] Sim: charge-and-record at room entry (gate reason on short cash), probes.
- [x] Game: admission line in the room header when nonzero; seat gate surfaced; Dexie
      bump; tests.
- [x] Orchestrator: verification, Exit.

## Exit

- [x] The mechanic exists and is dark: `auctionRoom.attendanceFeeYenByTier` all zeros
      (the maintainer's ruled values), `resolveAttendAuction` in `bidding.ts` (room entry
      had no prior sim seam; it does now), charged per day per tier at the seat, buyouts
      exempt, nothing charged or recorded at zero (probed both ways: seven sim probes
      under a nonzero test override, plus the zero-content no-op).
- [x] The dead `AUCTION_TRAVEL_FEE_YEN` block is deleted from content, schema, tests, and
      the bible's anchor table: zero hits remain in `packages/`; only historical sprint
      docs and the ruling's own records still name it.
- [x] "Take a seat" upgraded from a plain link to a gated button with the standard
      disabled-reason idiom; the room header renders the admission line only when a fee is
      nonzero (the zero-renders-nothing pin is the important one, asserted).
- [x] SAVE_VERSION 45 -> 46, no migration; approval-gate hash re-pinned lawfully
      (e8faedcf -> e4a56a92) against this doc's ruling.
- [x] Judgement call endorsed: no day-report log entry for the charge while the mechanic
      is dark; if a tier's fee ever moves off zero, the day report wants a line, noted
      here so the tuning pass remembers.
- [x] Evidence: content 14 files / 122 passed (guards re-run against the final tree, the
      one honestly-justified repeat); sim 57 files / 1,412 passed; game 55 files / 688
      passed; typecheck clean. The pre-push hook is the full gate.
