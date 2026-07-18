# Sprint 89 - Yuki teaches you the game

Final sprint of the 2026-07-18 playtest arc (item 22). Story mission 1 (`four-wheels`)
becomes the scripted tutorial: the first thing a new player does. Depends on Sprints 85-88
(unfailable missions, machine-shop assist, the assembly model, the diagram-as-page): the
tutorial teaches the FINISHED flows, which is why it lands last.

## Reuse analysis (directive 16)

**New mechanisms (genuinely new):**

- A guided-step overlay (content-declared steps with completion conditions read from game
  state; a dismissible coach panel per step).
- One scripted auction lot injection (deterministic car, scripted quiet turnout).

**Existing mechanisms to reuse:**

- The story-mission machine as-is: `four-wheels` stays a real mission (gate 0, budget cap,
  roadworthy requirement, payout, delivery flow). The tutorial is a layer OVER it, not a
  parallel quest system.
- Auction generation: the scripted lot goes through `generateAuctionCatalog`'s normal
  output path (one injected lot while the tutorial is active), bids resolve through the
  standard bidding sim with the rival ceiling pinned at reserve: a guaranteed win via
  parameters, not a bypassed auction.
- Inspection, shop purchase, tool/assist, assembly ops, staged work, end-day: all taught
  in place on the real screens; the overlay never re-implements an action.
- The satisfiability-probe pattern (Sprint 78): the scripted car's recipe IS the probe;
  content is formula-derived from it so the tutorial can never drift unwinnable.

## The script (beats)

1. **Day 1, the board.** Yuki's mission is pinned and the overlay introduces it: she
   needs a cheap, dependable runabout; budget cap visible. Accept starts the walkthrough
   (no deadline exists any more; a "skip the walkthrough" control demotes it to a normal
   mission for repeat players).
2. **The Local Yard.** The scripted lot is present: a shitbox-class runabout, fixed
   model/colour/mileage, apparent condition set by the recipe, one visible symptom priced
   into the sheet. Overlay teaches reading the sheet, grades, guide/reserve, and paying
   for an inspection (the inspection reveals the symptom is minor: the sleeper lesson).
3. **Winning.** Player bids; scripted turnout folds at reserve. Teach: reserve, raise,
   why buyout is usually the wrong button.
4. **First look.** Car arrives; diagram tour (levels, hover, the panel); the recipe's
   faults are visible: worn tyres, poor brake pads, and one buried engine fault.
5. **The wheel.** Pull the wheel assembly, bench it, buy tyres and pads at the shop
   (teach tier chips vs condition), fit at the tyre machine via assist fee (teach renting
   vs owning; the ¥150k machine is pointed at as the natural first purchase), refit.
6. **The engine.** Strip the bolt-on blockers, pull the engine assembly with machine-shop
   assist (teach the fee and the crane it stands in for), repair the fault on the stand,
   refit. Labour-day pacing and End Day taught here across the work.
7. **Delivery.** Requirements green, ledger under the cap, deliver; payout and
   reputation; the campaign frontier opens and the overlay bows out for good.

## Decisions

1. Steps live in content (`tutorialSteps.json`, Zod-schema'd): id, anchor screen,
   completion condition (declarative selectors over game state), copy key. The overlay
   component reads sim/store state only; it can never mutate the sim.
2. The scripted lot: injected while the tutorial mission is accepted-and-unwon,
   deterministic under the career seed, flagged internally so telemetry/probes can
   exclude it. Rival ceiling = reserve; turnout copy uses the existing quiet-room
   phrasing. If the player somehow buys another car first and completes the mission with
   it, the tutorial simply advances (completion conditions read state, not the scripted
   car's id, wherever possible; the engine/wheel beats anchor to whichever car holds the
   mission assignment).
3. The recipe (exact model, bands, symptom, prices) is derived in the satisfiability
   probe and asserted: purchase at reserve + parts + fees + assist ops must land
   comfortably under `budgetCapYen` with slack for one player mistake (a wrong-band
   purchase), and the payout must still clear a visible profit. Numbers in content are
   generated from the probe recipe (Sprint 78 pattern).
4. Every line of overlay and Yuki copy is drafted by the orchestrator personally
   (content quality bar; Yuki's established voice from the Sprint 76-78 missions). The
   implementer wires keys and applies copy verbatim from the swept sheet.
5. Skippable, never re-entrant: skipping is permanent for that career; the mission
   remains a normal unfailable mission. No overlay ever appears again after delivery or
   skip.
6. Save schema: tutorial progress is one small field on the save (step id or done);
   Dexie bump, no compat (directive 19).

## Definition of done

- [x] A fresh career walks the beats end to end on the real screens; no reflex input,
      no timers, no new mutation paths (the overlay is a view; it reads state only).
- [x] The scripted lot is deterministic, wins at reserve, and never appears outside the
      tutorial window.
- [x] Satisfiability probe pins the recipe with mistake-slack (30,091 yen headroom after a
      wrong-band purchase; 67,591 yen visible profit); content derived from it.
- [x] Skip works, is permanent, and demotes cleanly.
- [x] All copy orchestrator-swept before merge; guard tests green.
- [x] Narrowest checks once; pre-push gate is the evidence (directive 20).

## Task breakdown

**Claude-implementable:** overlay system, scripted lot, probe, wiring; copy applied from
the orchestrator's swept sheet. **User-only:** a full tutorial playthrough before this
sprint is called done (the arc's exit condition).

## Exit

All six decisions landed (implementation by subagent, orchestrator-policed). The record:

- **The tutorial is a view over the real game.** Six content-declared beats
  (`tutorialSteps.json` + Zod), completion conditions a declarative union read from
  `GameState`, an overlay (`TutorialOverlay.vue`) that highlights real controls and never
  mutates the sim. The scripted Local Yard lot (`tutorialLot.json`, a Wagon R) injects
  deterministically while the mission is live and the car unwon, rival ceiling pinned to
  reserve so the win comes through the real bidding sim, not a bypass.
- **Probe-guaranteed satisfiable:** spend 139,409 yen (reserve 99,159 + stock tyre 5,500
  + tyre fit fee 3,000 + engine assist 2x15,000 + head repair 1,750) against the 175,000
  cap; 30,091 yen of slack survives one wrong-band mistake; 67,591 yen visible profit
  against the 207,000 payout. Content derived from the probe (Sprint 78 pattern), so it
  cannot drift.
- **Directive 17, case (a):** six `SAVE_VERSION` canaries 40 to 41 (two additive optional
  fields, `tutorialStatus` and lot `scripted`); the "no pinned mission on day 1"
  ServiceJobsScreen test rewritten (the sprint intentionally pins Yuki on day 1 for a
  tutorial career; `createInitialGameState` still seeds none, so bots/probes are
  unaffected). No golden-master hashes moved.
- **Copy:** all six beats applied verbatim from the swept sheet; the tentative Yuki
  uncle/crane aside kept (it lands on the fee beat in her established dry register).
  Functional UI chrome added and orchestrator-approved: "Walkthrough" (panel header,
  consistent with the swept "the walkthrough" prose), "Step N of 6", "Finish", and the
  skip-confirm buttons "Skip" / "Keep it"; the swept "Skip the walkthrough" and the
  "Skip for good?..." confirm line are verbatim. No narrative copy was invented.
- **Deviations, orchestrator-reviewed:** the buyout warning is a standing caution line,
  not hover-triggered (hover is reflex-ish; the accessibility law prefers a standing
  line): approved. The scripted lot injects while the mission is offered-or-active so it
  is present the moment the player reaches the yard on day 1: approved.
- **KNOWN ISSUE carried out of this sprint (see the finding below):** decision 2's
  scripted car is a Wagon R (naturally aspirated) shipped with its `forcedInduction` slot
  pre-filled, because `evaluateRoadworthy` currently fails a legitimately-absent NA turbo
  slot. That is a real pre-existing bug (Sprint 76) that this sprint and the Sprint 78
  probe both mask; the proper fix (align `evaluateRoadworthy` with `isPartMissing`, then
  drop the FI pre-fill so the tutorial car is an honest NA Wagon R) is raised to the
  maintainer as a follow-up, not silently taken here.
- **Narrow evidence (each once):** three typechecks clean (sim, content, game);
  tutorialProbe 4/4; TutorialOverlay 6/6; saveCodec 73/73; content 88/88; affected
  gameStore/screen suites green.
- **Full evidence:** pushed through the pre-push gate; no separate manual pass
  (directive 20).
- **Open user-only item (the arc's exit condition):** a full fresh-career playthrough of
  the tutorial on the real screens.
