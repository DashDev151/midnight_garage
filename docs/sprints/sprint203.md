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

(filled at completion)
