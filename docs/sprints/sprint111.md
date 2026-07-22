# Sprint 111: The playtest response (the cure lifts the curse)

**Date:** 2026-07-22
**Source:** the maintainer's first full-game playtest of the promoted systems
(`docs/playtest-notes-2026-07-22.md`, 13 items) plus the code investigation that
verified them. Implementation authorised same day.

**One-line goal:** repairing a fault now cures its fear (the headline bug), and the ten
smaller playtest findings land around it.

## Reuse analysis (directive 16)

**Reused:** the narrowing machinery (cure-on-repair is `revealOnRemoval`'s sibling: a
pure prune over `remainingCauseIds`, no new state); the demo's strike-through est-value
idiom (moves to the production card); the reactions block and seeded draw-order law
(the spite counter is one more entry); `uiSettings` (gains fields, no new persistence);
the existing immediate-execution path `removePart` already uses (free refits join it);
the Delivered dialog and mission content schema (payout is one field).

**Genuinely new:** the cure-prune helper; the spite reaction; a small Settings surface.

## The fixes (verdicts from the investigation)

1. **Cure-on-repair (bug, headline):** no resolver ever clears a symptom, so guide/you-say
   stay fear-priced after a full repair (probe: mint clutch, true value 162k -> 200k,
   displayed numbers unchanged). Fix: after any resolver raises a part's band (repair,
   recondition, new-part install), prune every remaining cause whose part now sits
   STRICTLY better than the cause's setBand (it can no longer explain the car); a
   symptom with no causes left is cured and leaves the car; equal band does not cure
   (the damage is still present). Repair becomes another way of knowing. Probes: the
   haunted-Carina regression; partial prune narrows; equal-band stays.
2. **Workup gate:** add the already-resolved case (hide/disable when every symptom is
   resolved). RULING recorded: owned-car diagnosis stays workup-only by design; the
   routed tests are the yard's time game, at home you have the afternoon.
3. **Free refits execute immediately** (zero labour, zero new cash), joining removals;
   Confirm remains for costed work only.
4. **Lot card truth-telling:** the demo's struck-room-price treatment for "you say"
   (green up, red down); the odds ledger line relabels "Doubt, resolved" once known.
5. **Settings surface:** fuse presets (explained in plain words) and auto-bid move off
   the room UI into a small settings screen; the room keeps play controls.
6. **Finances fold away:** the ledger/projection block on the car screen collapses into
   a details disclosure; profit talk waits for a sale.
7. **The spite counter (reactions):** when the player's bid is the FIRST to top the
   room's clearing price and a dealer is still active, chance `spiteChance` (0.35) of
   ONE counter a single rung past the clearing, never past the read, once per room.
   The sweep-in win becomes a final call. Force strip gains the arm.
8. **Tutorial economics:** `four-wheels` payout and budget 148,000 -> 144,000 (measured
   run cost ~133.4k with express tyres => ~10.6k profit); the tyres step recommends
   Express (authored line); the Delivered dialog shows the mission profit.
9. **Parked in TODO:** next-day delivery of auction wins (design question with sim-wide
   ripples); the owned-car routed-diagnosis question closed by the ruling above.

## Tasks

- [x] Agent A (sim/store/car screen): items 1-3, 6 + probes and re-pins.
- [x] Agent B (machine): item 7 + cap-law suite extension.
- [x] Agent D (content): item 8 content + TODO parking (item 9); authored copy verbatim.
- [x] Agent C (auction UI, after A): items 4, 5, 8's dialog line + game re-pins.
- [x] Orchestrator: copy sweep, verification, Exit.

## Exit

- [x] THE CURSE LIFTS: `pruneCuredCauses` wired into every band-raising resolver.
      Regression probe: the haunted Carina's displayed numbers recover exactly
      (guide 156,200 -> 180,000; estimate 143,600 -> 180,000; symptom removed) after a
      mint clutch. Equal band never cures; partial repair prunes only its own cause;
      zero collateral movement across 1,461 sim/content tests.
- [x] Workup gains the already-resolved gate (button disappears when nothing is left to
      learn); free refits execute immediately (zero labour, zero cash: no staging);
      Finances is a closed-by-default disclosure, the Sell section untouched.
- [x] The spite counter shipped (spiteChance 0.35, spiteMaxRungs 1): fires only at the
      sweep-in moment, once per room, exempt from the clearing but never at or above
      the read; the unarmed determinism guard passed unmodified, proving the base draw
      order untouched. Force strip gained the arm.
- [x] The lot card tells the truth: the room figure strikes through with the player's
      number beside it (the demo idiom) the moment a test moves the estimate; the odds
      ledger line relabels "Doubt, resolved" once every doubt is narrowed.
- [x] Settings landed on the menu's reserved button (route /settings): fuse presets with
      the plain explainer ("How long each bid stays open before the hammer.",
      orchestrator-swept) and the auto-bid enable; the room UI keeps play controls
      only, the ceiling input gated behind the setting. One latent bug fixed en route
      (uiSettings setters now merge instead of clobbering each other).
- [x] Tutorial economics: payout and budget settled at 145,000, NOT the 144,000 first
      ordered: the satisfiability probe caught the collision with the
      mistake-forgiveness law (one wrong-tyres slip costs 5,500; 144,000 left only
      4,898 of slack, short by 602). The smallest lawful figure wins; real profit lands
      ~11k with express tyres. The tyre step recommends express as a deliberate one-off
      ("usually the price of planning badly"); the Delivered dialog shows the mission
      profit from the car's real ledger.
- [x] Copy: the two ordered tutorial fixes landed same-day (the crane line rewritten,
      the aside cut); the express line and explainer swept personally; two
      process-narrative comments left by an agent stripped in the orchestrator pass.
- [x] Parked in TODO.md: next-day delivery of auction wins (design pass required);
      the RULING that owned-car diagnosis stays workup-only. Noted for a future DRY
      pass: the struck/up/down price idiom now has three copies (two demos + the card);
      share it when a fourth consumer appears.
- [x] Evidence: sim + content 67 files / 1,461 passed; game 54 files / 649 passed;
      typecheck clean. Uncommitted, ready for the maintainer's word; the pre-push hook
      is the full gate.
