# Sprint 203: half the clutter, all the answers

**Status: DESIGNED, awaiting maintainer go.** Source: the maintainer's first pass on the
Sprint 202 build (`docs/playtest-notes/playtest-notes-2026-08-13-ui-pass.md`). The
prevailing diagnosis is clutter and DRY violations: the same features, half the mess. One
finding is a lever change (body labour), handled under behaviour-first governance
(directive 22 as amended); everything else is UI, copy and flow.

**Levers:** task B only (body-stage labour units). Values chosen at implementation, felt
statement recorded here and in the guard re-pin. Nothing else moves a number.

## Reuse analysis (directive 16)

**Existing mechanisms reused:**

- The zone diagram already exists on the car screen (the body view); the sim already
  derives each zone's state AND its next pipeline stage (`planPipelineStage` refusals
  encode exactly what is possible next per zone). Task A renders answers that already
  exist; no new sim reads.
- The worst-zone rule (`deriveBodyworkBand`, `derivePaintBand`) already identifies which
  zone binds the band: that IS "what is dragging it down"; it has simply never been
  surfaced.
- The drag primitive exists (cars drag to bays via the existing draggable composable;
  `PartCard` already participates in drag state). Dragging a part from inventory to the
  workbench extends a shipped interaction, not a new one.
- `placeOnStation`/`stationForPart` already model the bench; the workbench panel's
  duplicate parts list is deleted in favour of the inventory tab plus drag (DRY).
- Paint tins are already physical inventory (`consumableStock`, paint tins by finish and
  colour); task E selects among owned tins instead of a colour palette, which is a
  filter, not a system.
- The pipeline stage labour values are content (`bodyPipeline` stage `laborUnits` times
  `energy.energyPerBandStepByToolTier`); task B moves numbers that exist.

**Genuinely new:** the compendium surface (a single reference screen for relocated
explanatory prose; content exists as the strings being removed, the screen does not), and
the zone-status iconography.

## Tasks

### A. The body answers the player's four questions, in order (rework of 202 D3)

Design law for this task and the whole sprint (maintainer, verbatim in substance): clean,
minimal, well structured, predictable UI, everywhere. Icons, colour and bands carry the
information; text is a last resort, never a wall. The correction from review: **the
per-zone CONDITION BAND is the headline.** The player thinks in poor/worn/fine/mint; a
zone gets exactly that vocabulary, derived per zone the same way the carriers derive
theirs. Metal, prep and paint state are the WHY beneath the band, not the front page.

- A1. **Whole-body verdict at a glance:** the derived bodywork and paint bands, one
  glanceable readout beside the diagram.
- A2. **Each zone shows its condition band ON the diagram:** every zone is coloured by
  its own band (the shared band colour language the rest of the game uses), the binding
  worst zone visibly marked. One diagram; no second view.
- A3. **The why, on demand:** selecting a zone reveals its state as icons (dent, rot,
  bare metal, unprimed, colour swatch), not sentences.
- A4. **The what-do-I-do, as the affordance itself:** each below-band zone's single
  action control IS the next pipeline step (beat / weld / fill / prime / paint / replace
  panel), computed by the sim's existing next-stage logic, rendered as a fixed,
  predictable control (an icon plus one word), never a composed sentence. The player
  never derives the sequence and never reads a paragraph.
- A5. The 202 text panel is deleted; its information lives entirely in A1-A4.

### B. Body labour comes down (lever task, behaviour-first)

- B1. Reduce the labour cost of panel beating, prep/fill, primer and paint stages. The
  lever family: the body pipeline stages' labour units and their interaction with
  `energyPerBandStepByToolTier`. Values chosen at implementation and recorded with the
  guard re-pin. The felt statement to satisfy: **a full respray of a kei (nine zones,
  prep to paint) is an afternoon to a day of the labour pool, not the better part of a
  week; a single panel's beat-fill-prime-paint chain fits comfortably alongside a day's
  other work.** Machine-less multiplier semantics (Sprint 202 E) are unchanged on top.

### C. String hygiene: the UI speaks the voice, the compendium holds the prose

- C1. Sweep every player-facing surface for internal-note prose (long explanatory
  sentences, mechanics exposition, anything off the Vimes voice) with a fresh eye on the
  screens touched in 201/202. The rule from the maintainer, recorded as law for this
  codebase's UI: **needing a long sentence to explain a control is a UX design failure.**
  Controls get short in-voice labels; explanations move out.
- C2. A minimal compendium surface: one screen, properly written reference entries
  (workshop, stations, body pipeline, machine hire, selling), reachable from the menu.
  Relocated prose is REWRITTEN to the copy bar there, never pasted. Maintainer sweeps the
  copy per the content quality bar.

### D. The repair flow stops fighting the player

- D1. Drag a part from the inventory list onto the workbench (and the machine) to place
  it; the existing click path remains as fallback.
- D2. The repair/recondition control is a fixture: same label, same position, always,
  enabled state and target band as its only variation. No combined-string labels, no
  moving buttons, anywhere in the work surfaces (audit the bench, machine and car-screen
  action buttons against this rule).
- D3. The duplicate parts list under the workbench is deleted (DRY: the inventory tab is
  the list; the bench shows only what is ON it).

### E. The zone fix box and paint flow clean-up

- E1. The per-zone work box is rebuilt to the same standard as A: short fixed controls,
  no wrapped text, no long combined-string buttons.
- E2. Paint selection is picking a PHYSICAL TIN from owned stock (filtered to what fits:
  finish and colour), not a palette grid that still needs a separate purchase. Owning no
  suitable tin shows the one short line that says so and where to buy.

### F. The ledger reads forward, not backward (maintainer ruling, 2026-08-14)

**The problem:** "Work outstanding -¥48,191" frames the player as clearing a debt. The
core-loop law is the opposite: fixing always pays, and every repair yen returns more than
it costs. The display has been rendering the game's most generous law as a deficit. No
formula changes; only the direction the numbers are read in.

- F1. **The current value is the base, not the bottom line.** What the car is worth right
  now is the headline figure at the top (the sim's `totalYen`, unchanged).
- F2. **The work is a gain, with its price beside it.** The wear line stops being a
  subtraction and becomes the forward-looking opportunity: label **"Work adds"**, figure
  **+¥48,191** (the same magnitude, positive), with dim sub-text **"for ¥37,070 in parts
  and labour"** (`totalBillYen`, already computed). This shows the margin the core-loop
  law guarantees, which no screen has ever stated.
- F3. **Three honesty cases, all from existing sim state.** Nothing outstanding: the row
  says "Nothing outstanding" and shows no figure. Floor-pinned (the `floor` line binds):
  the gain is a lie, so the row reads **"Work adds nothing yet"** with **"worth scrap
  until the bill comes down"**. Both are the legibility clause doing its job.
- F4. **The rest of the breakdown becomes the explanation, demoted below the headline**
  (book, mileage, heat, polish, build risk, upgrades, doubts), so the panel reads in the
  player's own order: what is it worth, what can I gain, why is it not worth more. Same
  lines, same figures, same label map; only their placement and the section framing move.

### User-only

- U1. Walk the body flow on a rough car: verdict, binding zone, next actions, one full
  respray at the new labour costs; and the bench flow with drag. The acceptance bar is
  the maintainer's own four questions answering themselves on sight.

## Definition of done

- The four body questions are answerable from the screen in order without reading a
  paragraph; the diagram carries state; every below-par zone names its next action.
- Body-stage labour matches the felt statement in B1, values recorded, guard re-pinned.
- No player-facing surface serves internal-note prose; the compendium exists and reads
  in voice; UI labels are short and fixed.
- Parts drag to stations; the repair control never moves; the bench duplicate list is
  gone; paint is chosen from owned tins.
- `pnpm typecheck` before reporting if any exported symbol or schema moves; narrowest
  relevant tests once; pre-push gate is the evidence.

## Exit

**Implemented 2026-08-14 in two waves plus a lead copy pass. Awaiting the maintainer's
walk (U1) and the commit word; the pre-push gate is the final evidence at push time.**

- **A (the body answers, on the diagram):** every zone wears its own condition band as
  the same band chip parts use; the binding worst zone carries a marked ring; the
  whole-body verdict reads off the bodywork and paint carriers beside the diagram;
  selecting a zone shows icon whys and ONE fixed next-action control (Beat / Weld / Fill
  / Prime / Paint / Polish / Replace) driven by new pure sim helpers
  (`zoneConditionBand`, `zoneNextStep`, binding-zone finders in `bodyPipeline.ts`). The
  202 text panel is deleted. Judgement calls recorded: Polish added as the eighth verb
  (a painted-but-dull zone otherwise had no visible path to mint); strip/prep lives
  beside the paint picker as a discretionary action, not in the necessary-next-step
  ladder; one generic binding ring rather than two marker species.
- **B (labour to content, lowered):** `energy.bodyStagePoints` (stripPrep 1, beat 3,
  weld 6, fillAndSand 2, prime 1, paint 2, polish 1), flat per stage, no tool-tier
  multiplication; the tier's remaining body advantage is finish/polish quality and hire
  economics, never speed. Felt statement recorded in the guard re-pin and pinned by a
  probe: full kei respray 36 points (was ~135), single panel chain 8, weld heaviest at
  6. The button preview and the charge read the same content value.
- **D (the bench stops fighting):** parts drag from the inventory card onto the bench,
  the machine, or their closed station cards (drop places the part and opens the panel),
  through the one existing `placeOnStation` path; the composed-string repair button
  ("Repair to fine · ¥9,600 · 20 labour") that also vanished when idle is now a fixed
  "Repair" control that always renders, band as a chip, costs as adjacent text,
  disable-with-reason; the duplicate candidate list under the stations is deleted.
- **C (strings and the Shop Manual):** every long explanatory sentence on the working
  screens shortened to voice or deleted where the UI now shows the fact (full
  before/after table in the task record); two tutorial-speak hints deleted outright; the
  ledger hint is now "Book price, minus what's broken, plus real upgrades. Doubts price
  at the odds, till proven." A new Shop Manual screen (route `/compendium`, off the
  pause menu) holds seven reference entries, shapes not numbers. Lead copy pass
  applied four corrections: the bay-overflow paragraph split out of the stations entry;
  "better tools shorten the chain" corrected to the truthful ceiling-not-speed rule with
  welding's hard requirement named; the labour entry acknowledges coffee; the phone
  entry's "no upside" overclaim cut.
- **Vocabulary correction (maintainer re-ruling, 2026-08-14):** "Replace" is not a verb
  in this game; the flow is always car to inventory, then inventory to car. The zone
  button now always reads "Take it off" (a ruined panel comes off exactly like a sound
  one); the part-row control and its drawer read "Fit". The one honest exception is the
  three body value carriers (shell, paint, chassis), which are never removable by
  design: their control fits the new SKU over the occupant and says "Fit", never
  "Replace". Code identifiers (`replace-panel`, `ReplaceDrawer`, `replace-part-*` test
  ids) keep their names per the identifier exemption.
- **F (the ledger reads forward):** the owned-car finances panel and the auction lot card
  both open with "Worth now" over the ledger's own `totalYen`, then the work row, then
  the demoted breakdown under "The ledger". The work row is one shared pure function
  (`workRowFor`) over the ledger's `wear` and `floor` lines plus `carCostToMintYen`:
  "Work adds +¥48,191" with "for ¥37,070 in parts and labour", or "Nothing outstanding",
  or "Work adds nothing yet / worth scrap until the bill comes down" when the floor binds
  (checked first, so the gain figure can never lie). The `wear` line is dropped from the
  breakdown, since the row above now reads it forward and keeping both would double it.
  No formula, value or lever moved; both figures are named sim outputs as before. The dev
  economy bench keeps its raw signed table deliberately (a diagnostic, not a player
  surface) and its identical-figures guard stays green.
- **Hygiene:** eight process-narrative comments from the implementing waves swept; the
  comment guard, spelling guard and em-dash guard are green.

**Evidence at close of implementation:** wave agents' per-file runs all green (B: 49; D:
60 plus clean typecheck; A/E: 137 plus clean typecheck; C: 4512/4513 full-tree with the
one failure being the comment guard since swept and green). Final combined proof is the
pre-push gate on commit.
