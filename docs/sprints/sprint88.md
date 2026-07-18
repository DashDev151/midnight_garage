# Sprint 88 - The diagram is the page

Fourth sprint of the 2026-07-18 playtest arc (items 11b, 11c, 12, 19). Pure game-package
work over the Sprint 87 sim. The service diagram stops being a hyperlink index and becomes
the repair surface itself.

## Reuse analysis (directive 16)

**New mechanisms (genuinely new):**

- A part info/action panel docked under the diagram (the diagram's blocks become the
  interactive items).
- Pixel-art placeholder sprites for the 29 parts and 3 assemblies.

**Existing mechanisms to reuse:**

- Every action the panel offers already exists as a store method: staged repair steps
  (`stageAction`), the replace drawer, `removePart`, and Sprint 87's assembly ops. The
  panel is a new face on existing verbs; NO new store mutations.
- `PartsDiagram.vue`'s two-level structure, hover inspector, `BandChip`, blocker
  highlighting and the hand-authored layout map + layout-coherence test (Sprint 84
  pattern) all carry forward; the click handler changes target from "scroll the list" to
  "open the panel".
- The art-spike rasteriser technique (`pixi/carSprite.ts`: indexed character-row templates
  drawn to an offscreen canvas, nearest-neighbour): the TEMPLATE + RASTERISE approach is
  reused, but rendered to data-URL images for the DOM diagram. No Pixi in CarDetailScreen
  (Sprint 84's DOM/CSS ruling stands); the rasteriser moves to a shared, Pixi-free module.
- `StatRadar` as-is, repositioned.

## Decisions

1. **The list goes.** The Components `<ul>`, its filter/expand controls and the
   group-row drill-down on CarDetailScreen are removed. The diagram plus its panel is the
   single repair surface. The panel shows: part name, `BandChip`, grade, uncertainty
   marker, what blocks it / what it sits under, and the action buttons (repair step,
   replace, remove, assembly remove/refit and bench work where applicable), all wired to
   the existing store methods. Keyboard path: blocks are focusable buttons already; the
   panel is their target.
2. **Hero layout (11c).** The `.cols` two-column grid is dissolved. New order: header row
   with title/info left and the radar top right (`StatRadar` at a smaller `size`); the
   diagram full container width beneath it; the info/action panel docked below the
   diagram; finances/sell/work panels unchanged after. `PartsDiagram`'s 640px stage cap is
   lifted to the container width.
3. **Labour made loud (19).** Every action button carries its full price inline as text,
   not tooltip: `Repair to fine · ¥9,600 · 2 slots`, `Refit · free`,
   `machine shop assist +¥15,000` where renting. The confirm bar gains per-action
   attribution (each staged item lists its own yen and slots) above the existing totals.
   Nothing is only-on-hover any more.
4. **Placeholder pixel art (12), to the orchestrator's spec.** Each of the 29 parts and
   3 assemblies gets an indexed-template sprite authored to
   `docs/design/part-sprite-placeholders.md` (orchestrator-authored, maintainer bar:
   "make something nice"): fixed grids (24x16 / 32x22 at 4x nearest-neighbour), the
   five-colour token palette with amber as garnish only, silhouette-first with
   per-part identity notes, one light source, closed outlines, consistent projection.
   The spec's review loop is BLOCKING: contact sheet to the scratchpad after every
   authoring pass, orchestrator inspects and issues per-sprite corrections, iterate to
   sign-off; at least one full correction round is expected. Empty slots render the
   same sprite as a dim ghost via CSS (the Sprint 84 ghost ruling carries over; no
   baked transparency). Diagram blocks show sprite + name; the layout map grows
   footprints for the sprites and the layout-coherence test still enforces
   blocker-overlaps-blocked (rule A) and no accidental overlap (rule B).
   **Provenance note (art bible law):** these are development placeholders, explicitly
   commissioned as such by the maintainer (playtest item 12). They must not appear in any
   public build, screenshot, devlog or marketing; the no-AI-assets law stands for anything
   public. Replacement by commissioned art is a launch-blocking TODO (recorded in
   TODO.md).
5. **Assemblies in the diagram.** At level 2, the wheel/engine/gearbox assemblies render
   as a bordered cluster around their member blocks with one action chip ("Pull the
   engine", with the assist caption when renting). A benched assembly shows in a bench
   strip under the diagram with its members as the same block components, same panel.
6. Radar/label sizing from Sprint 86 carries; no further type changes here.

## Definition of done

- [ ] The components list is gone; every repair action reachable through diagram + panel;
      no store mutation was added or altered.
- [ ] Full-width diagram, radar top right, panel docked; layout-coherence tests green
      with sprite footprints.
- [ ] Labour and yen visible on every action affordance without hovering; confirm bar
      itemises per action.
- [ ] All 29 + 3 sprites authored to `part-sprite-placeholders.md`, contact-sheet
      reviewed and signed off by the orchestrator, legible at diagram scale; ghosts for
      vacancies; TODO.md carries the replace-before-launch entry.
- [ ] Narrowest checks once; pre-push gate is the evidence (directive 20).

## Task breakdown

**Claude-implementable:** all decisions; sprite templates drafted by the implementer are
REVIEWED VISUALLY by the orchestrator before sign-off (rendered sheet to scratchpad).
**User-only:** eyeball pass on the new page and the sprite sheet.

## Exit

(Filled at sprint close.)
