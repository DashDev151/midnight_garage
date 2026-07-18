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
7. **The sprites earn a second home: the parts shop (maintainer add, 2026-07-18).** The
   same `partSpriteDataUrl` module renders in the parts-shop catalogue card
   (`PartsMarketScreen.vue`), keyed off each catalogue part's existing `carPartId`, so a
   product shows its slot's placeholder sprite (a tyre product shows the tyre sprite, an
   ECU the ignition sprite; all grade variants of a slot share one sprite, correct for
   placeholders). Pure reuse: no new sprite art, no new store method, the same provenance
   TODO already covers it. Minimal styling consistent with the diagram sprite; the
   catalogue list card only (the cart line stays text).

## Definition of done

- [x] The components list is gone; every repair action reachable through diagram + panel;
      no store mutation was added or altered.
- [x] Full-width diagram, radar top right, panel docked; layout-coherence tests green
      with sprite footprints.
- [x] Labour and yen visible on every action affordance without hovering; confirm bar
      itemises per action.
- [x] All 29 + 3 sprites authored to `part-sprite-placeholders.md`, contact-sheet
      reviewed and signed off by the orchestrator (v3, on the night-deep stage
      background), legible at diagram scale; ghosts for vacancies; TODO.md carries the
      replace-before-launch entry.
- [x] The parts-shop catalogue card renders each product's slot sprite via the same
      module (decision 7).
- [x] Narrowest checks once; pre-push gate is the evidence (directive 20).

## Task breakdown

**Claude-implementable:** all decisions; sprite templates drafted by the implementer are
REVIEWED VISUALLY by the orchestrator before sign-off (rendered sheet to scratchpad).
**User-only:** eyeball pass on the new page and the sprite sheet.

## Exit

All seven decisions landed (implementation across several subagents, orchestrator-policed
and orchestrator-designed for the sprites). The record:

- **The diagram is the page.** The Components list, its filters and group drill-down are
  gone; `PartsDiagram.vue`'s level-2 blocks are the interactive items, each rendering its
  placeholder sprite, and a docked info/action panel carries every verb (repair step,
  replace, remove, assembly remove/refit, bench work) through existing store methods with
  no new mutations. Hero layout: title/info left, radar top right, full-width diagram,
  panel below. Labour and yen are inline on every affordance; the confirm bar itemises
  per staged action.
- **The sprites, to spec.** All 29 part + 3 assembly sprites authored to
  `docs/design/part-sprite-placeholders.md` (orchestrator-authored), reviewed over three
  contact-sheet rounds and signed off. Rendered in the diagram blocks (ghosted via CSS
  for vacancies) AND, per decision 7, in the parts-shop catalogue card, both through the
  one `partSpriteDataUrl` module keyed on `carPartId`. Launch-blocking replacement TODO
  recorded.
- **Sprint 87 deferral closed:** `resolveRemovePart` now refuses an assembly-member slot
  at the sim primitive, not just the store/UI (Part F), with its regression test; sim
  green at 949.
- **Directive 17, all case (a):** the two CarDetailScreen panel tests
  (`panel-plan-preview` and the per-action attribution) failed because the preview and its
  clear-x were nested under a guard that collapsed when a repair reached the ceiling band;
  the markup guard was widened so the clear control survives (the test asserted the
  correct decision-3 behaviour, the code was wrong). The old-list CarDetailScreen tests
  were re-targeted to the diagram+panel surface, every behavioural assertion preserved.
- **Two process incidents, both the standing lesson:** (1) the lead stalled twice
  claiming to wait on children that were not live; resumed each time with orders to verify
  the tree directly (Sprints 81/87 lesson). (2) The round-two sprite review produced a
  FALSE NEGATIVE: seven corrections read as "unapplied" because the contact sheet was
  rendered on panel `#26272b`, the exact hex of the dark fill token, so new mass drawn in
  that token was invisible on the sheet while correct in-game. The sprite spec now
  mandates night-deep `#101113` sheets; v3 on that background vindicated all seven. (3)
  The lead finally died on an API limit during its own final checks; the orchestrator
  verified the tree, ran the checks, and dispatched a scoped agent to finish the test
  reconciliation and (separately) decision 7.
- **Copy:** the swept decision-3 formats ("Repair to {band} · {¥X} · {n} slots",
  "{¥X} · {n} slots" attribution, "Sits under: {names}") and reused strings only; no new
  player-facing copy. Decision 7's sprite is decorative (`aria-hidden`), no caption.
- **Narrow evidence (each once):** sim 50 files / 949 tests; game typecheck exit 0;
  CarDetailScreen 46/46; PartsMarketScreen 15/15; partsDiagramLayout + sprite-footprint
  tests green.
- **Full evidence:** this commit reached origin through the pre-push gate; no separate
  manual full pass (directive 20).
- **Open user-only item:** the eyeball pass on the new repair page and the parts shop,
  folded into the arc-closing playtest.
