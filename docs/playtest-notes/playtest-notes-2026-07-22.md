# Playtest notes, 2026-07-22 (first full-game run of the promoted systems)

Maintainer's raw notes, formalised. Status per item: DONE (landed same day), ANSWERED
(explained, no change needed unless the maintainer disagrees), INVESTIGATE (code-level
verification running before any design), DESIGN (needs a decision, then a sprint).

1. **"You say" prominence on the lot card** - DESIGN (small). Reproduce the demo's trick
   on the production card: strike the room's figure, show the player's number beside it,
   green up or red down. Today "you say" is a quiet line under the reserve.
2. **Fuse presets unexplained** - ANSWERED + DESIGN. They are the accessibility fuse
   lengths (Standard = the tuned 5s per bid, Relaxed ~8s, Unhurried ~12s). Discoverability
   failed: no label, no help. Fold into the settings home per item 3.
3. **Auto-bid moves off the main room UI** - DESIGN (small). A proper settings surface
   (with the fuse presets and future accessibility toggles); the room keeps only play
   controls.
4. **Full workup vs yard knowledge** - INVESTIGATE. The owned-car Diagnosis panel offers
   "Full workup (10 labour)" even when the doubt is already fully narrowed at the yard.
   At minimum hide it when resolved; the bigger question (should owned-car diagnosis be
   the routed tests rather than a flat workup?) needs the investigation's facts first.
5. **"quietly one of life's pleasures"** - DONE (removed).
6. **Tutorial dead day (tyres arrive next day)** - DESIGN. Options: (a) tutorial guides
   Express delivery (exists, arrives today, small cost folded into item 9's tuning);
   (b) systemic change: auction wins deliver next morning. (a) is contained; (b) is a
   real design idea with sim-wide ripples, park it as its own decision rather than a
   tutorial fix.
7. **Yuki crane line** - DONE (rewritten: "Take it slow with the crane. My uncle rushed
   it once, and for a summer his garage had a sunroof.").
8. **Staged-work Confirm for free actions** - INVESTIGATE then implement. Free removals
   and refits should execute immediately; the plan/Confirm flow stays for costed work.
   Facts needed on how stagedCarWork distinguishes them today.
9. **Yuki job profit: show it, and tune to ~10k** - INVESTIGATE (reconstruct the real
   economics from the event log: won at 90,614 + tyres 5,500 + inspection 2,000 +
   recondition/install labour vs payout 148,000) then tune payout/costs to land ~10k
   with Express tyres. Delivered dialog gains the profit line.
10. **Carina: confirmed -6,300 clutch yet "you say" ABOVE the room** - ANSWERED, the
    maths is correct and it is the fear-pricing system working: the room priced the
    doubt AT THE ODDS: 0.48x0 + 0.14x(+1,100) + 0.20x(-6,300) + 0.18x(-33,550) =
    -7,145 (the ledger's "Doubts, at the odds" line). Confirming the clutch replaces
    -7,145 of fear with -6,300 of fact: +845. You beat the odds; the room feared the
    gearset. Communication polish (label the resolved state "Doubt, resolved") goes
    with item 1.
11. **The sweep-in win feels uncontested** - DESIGN (my thoughts in the reply; a
    "spite counter" reaction is the candidate: rare, one rung past the clearing, never
    past the read).
12. **Hide projected profit / the finances block** - DESIGN (small). Philosophy
    accepted: profit is realised at sale. Collapse the ledger/finances into an optional
    details disclosure. Note: item 13's event log shows the projection was read
    mid-teardown, which is exactly when it lies hardest; hiding it also defuses that.
13. **Repair economics deep dive** - INVESTIGATE, the headline. Event-log finding: at
    the "-29,854 projected" screenshot the Carina was MID-TEARDOWN (clutch, gearbox,
    driveline, exhaust all removed, new clutch not yet fitted), so the value/bill swing
    partly reflects a car in pieces. Two open questions the investigation must answer
    with code and a reconstruction: (a) where did "Repairs ¥36,000" come from; (b) THE
    REAL BUG CANDIDATE: after fitting the new clutch and refitting the chain, does the
    dragging-clutch SYMPTOM still discount the car (is a symptom ever cleared by
    repairing/replacing its causal part)? If the fear survives the cure, that is the
    defect: the car would be haunted forever.

## Event log (raw, newest first, from the maintainer)

Thanks - I'll drop it off first thing in the morning. / New local-yard catalog: 1 lot /
Delivery arrived: OEM Stock Clutch / Ordered OEM Stock Clutch ¥7,000 (arrives day 3) /
Removed clutch, gearbox, driveline, exhaust from car-lot-1-local-yard-1 / Moved to
service / Won the 1987 Toyota Carina (AT150) for ¥135,612 / Inspection visit ¥2,000,
60 minutes / Mission delivered: ¥148,000, +15 rep / install-part jobs x3 on
tutorial-lot-car / Reconditioned a part to worn (+10 labour) / Removed camsTiming,
headValvetrain, internals, block, cooling, exhaust, intake from tutorial-lot-car /
Delivery arrived: OEM Stock Tyres / Ordered OEM Stock Tyres ¥5,500 (arrives day 2) /
Removed tyres, rims / Moved tutorial-lot-car to service / Won the 1994 Suzuki Wagon R
(CT21S) for ¥90,614 / Inspection visit ¥2,000, 60 minutes / Mission accepted


## Round 2 (same day)

14. **"Morning: your tyres are in."** - DONE: time-neutral rewrite ("There they are:
    four fresh tyres."), correct for express (same day) and standard (next morning).
15. **Service diagram: wheels group reads GREEN while fully disassembled** -
    INVESTIGATE+FIX: suspected vacuous-truth bug (group status over installed parts
    only; zero installed parts passes every check). A group with empty slots must never
    read healthy.
16. **Crane line physics** - DONE: rewritten ("Engines come off the hooks exactly once,
    and they never land anywhere cheap."), the threat now points downward.
17. **Hand it over / Show them the car placement** - FIX: visual hierarchy (primary vs
    secondary, spacing) per existing idiom.
18. **The missing 2k** - ANSWERED: the yard inspection fee (an overhead across all lots
    at the visit, deliberately outside the car ledger and the mission spend). Balance
    maths reconciles exactly. Open cosmetic option: label the dialog line "profit
    before overheads".
19. **Deferred by the maintainer:** the larger service-diagram and repair-loop concerns
    are held for a dedicated redesign arc, not itemised here.

## Round 3 (same day)

20. **Walkthrough box overlaps the inspection UI; in the way through the repair steps** -
    FIX (agent): per-step panel position hint in tutorialSteps (schema + overlay):
    the find/inspect step pins to the extreme bottom-right, returning to the default
    after the seat step; the repair-arc steps (bay through reassemble) sit at the right
    edge, out of the diagram's way. Still user-draggable.
21. **"It has a certain something. Under the dirt." lacks excitement** - DONE (Yuki now
    genuinely lights up: "Oh, that one! I know she's scruffy, but look at her...").
22. **The crane line, rejected twice, and the real finding: it was the WRONG VOICE** -
    DONE. The line carried the mechanic's register in Yuki's mouth. Voice boundary now
    recorded as law (memory + here): Vimes is the narrator-mechanic only; Yuki speaks
    student. Her line: "Careful with that! Sorry. I'll stop watching. ...I won't,
    though."

23. **Spotlight ringed the Auctions tab instead of the just-unlocked stethoscope** -
    DONE: a DOM-timing race, not selection logic. The unlocked test button mounts in the
    same reactive flush that swaps the guidance lines; the spotlight watcher ran on pre
    flush and queried before the button existed, falling back to the tab. Fixed with
    post-flush timing; regression test uses a reactively-mounted stub (proven failing
    before the fix), since static-anchor fixtures cannot catch mount races.
