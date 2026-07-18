# Sprint 91 - Yuki's first job stops turning a profit

A small mission-economy retune. Yuki's `four-wheels` currently pays ~¥66,500 profit on a
~¥140,500 build (a ~47% markup on a broke kid's first car). The intro mission should teach
the loop and cover your costs, not fleece the game's warmest recurring character; the
profit fantasy belongs to the radial job board and flips, not to Yuki. This also folds in
the Sprint 90 follow-up already parked in TODO.md (re-derive four-wheels budget/payout from
the honest NA probe recipe).

## Reuse analysis (directive 16)

**New mechanisms:** none.

**Existing mechanisms to reuse:**

- The story-mission content shape (`storyMissions.json`: `budgetCapYen`, `payoutYen`) and
  the satisfiability probe pattern (`storyMissionProbes.test.ts`, `tutorialProbe.test.ts`).
  This sprint changes two numbers and re-pins the probes; it invents nothing.
- The deterministic tutorial economics (measured 2026-07-18): reserve ¥100,239 + stock
  tyre ¥5,500 + tyre fit ¥3,000 + engine crane rental ¥30,000 + head repair ¥1,750 =
  **¥140,489 total spend**.

## Decisions

1. **Retune `four-wheels` to a near-break-even payout.** Payout drops from ¥207,000 to
   **¥148,000**, giving ~¥7,511 profit on the measured ¥140,489 taught build (a modest
   "thanks for your time", not a margin). The lesson shifts from "pocket the difference" to
   "cover her costs and spend well under her budget"; beat-1 copy is revised to match
   (decision 4).
2. **Set the budget cap to ¥160,000** (down from ¥175,000, re-derived off the honest NA
   recipe, retiring the TODO.md follow-up). This keeps the probe's one-mistake slack
   healthy: ¥160,000 - (¥140,489 + ¥5,500 sport-tyre mistake) = ¥14,011 >= ¥10,000. The cap
   sits above the payout on purpose: her budget is generous, the payout is fixed, so profit
   is `payout - your spend` and wasting money toward the cap erodes it. That IS the frugality
   lesson the tutorial teaches.
3. **Probe updates.** Set `four-wheels` `payoutYen: 148000`, `budgetCapYen: 160000` in
   `storyMissions.json`. `tutorialProbe.test.ts` and the `four-wheels` block in
   `storyMissionProbes.test.ts` re-assert against these: the `four-wheels` block must stop
   using the generic Sprint-78 formula pin (`assertPassesAndBudgetLocked`, which derives
   payout/budget from `probeCost`) and instead assert the hand-tuned values plus a
   SMALL-profit guard: profit `> 0` and `<= ¥15,000` (the probe now actively guards that the
   intro mission is NOT a big earner, the whole point). Keep the mistake-slack `>= ¥10,000`
   and the roadworthy/satisfiability assertions. No other mission's formula pin changes.
4. **Beat-1 copy sweep (orchestrator personally).** The tutorial's accept beat currently
   reads "The difference is yours if you spend well." That oversells a mission that no
   longer has a fat difference. The orchestrator redrafts it to frame the intro mission as
   covering costs and learning restraint, in the existing instruction register; applied
   verbatim by the implementer.
5. **No other mission changes.** Yuki's later missions (`first-proper-car`) and every other
   persona keep their current economics; this is the intro mission only.

## Definition of done

- [x] `four-wheels` payout ¥148,000, budget cap ¥160,000; profit ¥7,511 on the taught
      build; TODO.md entry retired.
- [x] Both probes green; the profit assertion guards a SMALL profit (0, 15,000] in
      tutorialProbe; storyMissionProbes keeps satisfiability + a directional off-formula
      guard (see Exit).
- [x] Beat-1 copy redrafted by the orchestrator and applied verbatim; guard tests green.
- [x] No save change (content-only). Narrowest checks once; pre-push gate is the evidence.

## Task breakdown

**Claude-implementable:** all; the beat-1 copy is drafted by the orchestrator.
**User-only:** confirm the exact target profit figure if ~¥7,500 is not the wish.

## Exit

Landed (implementation by subagent, orchestrator-policed). The record:

- **Numbers:** four-wheels payout ¥207,000 to ¥148,000, budget cap ¥175,000 to ¥160,000.
  On the deterministic taught build (spend ¥140,489) that is ¥7,511 profit and ¥14,011
  mistake-slack. The intro mission now covers costs plus a token, not a 47% markup.
- **Directive 17, both case (a):** the tutorialProbe visible-profit assertion (>=40,000 to
  the small-profit window (0, 15,000]) and the storyMissionProbes four-wheels formula pin
  (removed) both asserted the old fat-margin contract this sprint deliberately replaces.
- **Deviation, orchestrator-endorsed:** the profit/slack guard could not honestly live in
  `storyMissionProbes` because that file's cost proxy is the car's full book value
  (~¥160,264), not the fear-discounted auction reserve (~¥100,239) a player actually pays;
  asserting profit there would test a purchase price that never occurs. The real economic
  guard stays in `tutorialProbe` (reserve-based, the truth); `storyMissionProbes` keeps
  four-wheels' satisfiability plus a directional guard that its hand-tuned values sit below
  the Sprint-78 formula (so a revert toward the fat payout fails). Correct placement, not a
  fudge (directive 6).
- **Beat-1 copy** redrafted by the orchestrator and applied verbatim ("She pays {payout}
  on delivery, barely over your costs. This first one is about learning the work, not the
  money."). TODO.md follow-up retired.
- **Consequence to watch in playtest:** the ¥160,000 cap leaves ~¥19,500 of over-reserve
  room on the car purchase before a lean build breaks budget. For the tutorial (scripted
  reserve win) this is ample; for a live, non-tutorial four-wheels where rivals push the
  price up, it asks for a good buy. If that feels tight in play, the cap is the knob (the
  payout is what sets profit; the cap is independent forgiveness).
- **Narrow evidence:** sim 51 files / 956 tests; content 10 / 88; both typechecks exit 0.
