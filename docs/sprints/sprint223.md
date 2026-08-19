# Sprint 223: the auction sheet becomes paper (proof of concept)

**Status:** In progress
**Trigger:** Maintainer direction, 2026-08-19: the auction house's car sheets should look
like physical paperwork. Manila folder, printed form, handwritten annotations for what the
player knows, the car photo as a Polaroid stapled to the page, and natural variation so no
two folders read cloned (tilts, folded corners, coffee rings). This sprint is a CSS-only
proof of concept: no final art, everything throwaway, but as convincing as CSS can be.

**Authority granted by the maintainer for this work, until revoked:** any palette
additions required (paper, manila, inks, stamp colours join the tokens); free pixel
rotation allowed; a stand-in handwriting font is fine; AI-art concerns waived because
nothing here ships.

## Reuse analysis (directive 16)

New mechanisms: a deterministic seed utility (`paperSeed`: car-instance id to stable small
numbers) and the CSS paper system itself. Reused: `AuctionLotCard.vue` keeps its entire
template structure, props, store reads, data-test surface and behaviour (this is a
re-dress); `GradeStamp` restyles into a rubber stamp rather than being replaced; the
existing `.lot-art` placeholder becomes the Polaroid's photo well; room names and all
player-facing strings stay as shipped (form furniture labels only, no new flavour copy).

## Design (the whole look, exactly)

Seeded per CAR INSTANCE (two identical models get different folders; a car keeps its
folder for life): folder tilt, form tilt, photo tilt, staple vs paperclip, folded corner
(which, whether), coffee ring (whether, where, single or double), stamp offsets, per-line
handwriting tilt. All derived by hashing the instance id; no randomness at render.

Layers, back to front:
1. Table: the catalogue area behind the cards reads as a dark desk surface.
2. Folder: manila, faint fibre grain, a top tab carrying the lot number, heavy soft
   shadow, tilt up to about 1.2 degrees.
3. Form: aged white sheet inset on the folder, faint ruled lines, typed sections in a
   typewriter stack (Courier New), small-caps section headings. The existing figures,
   ledger and controls live here unchanged.
4. Human layer: the Polaroid (white frame, fat lip carrying the car name handwritten,
   photo tilt up to 4 degrees, staple or paperclip sprite drawn in CSS); rubber-stamp
   grade chips; coffee ring; folded corner; handwritten ink.

Two inks rule: printed type is what the paper claims (seller columns, room estimate);
handwriting is what the player knows (room-says, spread, guidance, work notes) in a
handwriting stack (Segoe Print, Bradley Hand, cursive), biro blue, seeded per-line tilt,
never aligned to the printed rules.

Photo content (no assets exist): sky-to-ground gradient backdrop, car silhouette via
clip-path in the car's own paint colour where the view exposes it (seeded muted colour
otherwise), dark wheel circles, faint film grain.

Tokens: new `--mg-paper-*` group (manila, paper, ink, biro, pencil, stamp red, stamp
blue, coffee) added globally so later sheets reuse them.

## Tasks

- [x] `paperSeed.ts` util (hash, range, pick) + unit tests (deterministic, spread).
- [x] `AuctionLotCard.vue` re-dress per the design; all data-tests and behaviour
  unchanged; `GradeStamp` rubber-stamp restyle.
- [x] Auction catalogue surface (desk) behind the cards.
- [x] Verify: existing auction tests stay green; new paperSeed tests; no typecheck run
  needed unless exported surfaces move.

## Exit

Built and passing; not yet reviewed by eye against a running board (maintainer to judge).

- `packages/game/src/utils/paperSeed.ts` (new): fnv1a-based `seedRange`/`seedPick`/
  `seedChance`, no `Math.random`/`Date.now` anywhere. `paperSeed.test.ts` (new, 11 tests):
  determinism, range bounds, salt decorrelation, spread across 200 generated ids.
- `packages/game/src/components/AuctionLotCard.vue`: re-dressed in place. The card root
  wraps into `.paper-folder` > `.paper-sheet` (which now owns the 320px/1fr split the
  parent `.lot` grid used to own) holding the untouched `.lot-left`/`.lot-right` content.
  `.lot-art` is unchanged and now sits inside a new `.polaroid` wrapper (photo backdrop,
  clip-path car silhouette in the car's own paint colour or a seeded muted stand-in,
  wheels, grain, vignette, staple-or-paperclip attachment). Coffee rings, a folded
  corner and pencil smudges are new `aria-hidden` elements. `.room-says`/`.spread-line`/
  `.bid-guidance`/`.work-subtext` moved to the handwriting stack with seeded per-line
  tilt/jitter; the headline figure gets a hand-drawn ink ring (own element when the
  estimate hasn't moved, a `::before` on `.up`/`.down` when it has, so no tested text
  node is touched). The actions slot is wrapped in `.carbon-slip`. Every prop, emitted
  event, store read and data-test attribute is unchanged; `GradeStamp` gained one
  additive optional `seedId` prop.
- `packages/game/src/components/GradeStamp.vue`: rubber-stamp restyle (2px border,
  letterpress fleck overlay, seeded rotation/offset via `paperSeed` replacing the old
  `Math.random`). The green/amber/red/defect tone-to-colour mapping is unchanged
  deliberately: it carries real grade information and an existing test locks the class
  names to it, so the brief's "stamp-red or stamp-blue by seed" ink pick was not
  implemented as a literal colour swap - only the stamp's shape and texture changed.
- `packages/game/src/screens/AuctionScreen.vue`: `.lots` is now a dark warm wood desk
  (two layered gradients, one a low-alpha plank-grain repeat); `.lot` dropped its own
  panel chrome (the folder carries it now) down to a plain full-width wrapper. The
  header/nav and the two capacity-warning lines are untouched (still neon). `.seat-link`/
  `.buyout` re-toned from neon-violet/panel-edge to ink-on-paper, keeping their border
  and hover affordance; `.buyout.confirming` keeps its urgency colour, now the paper
  stamp red instead of neon pink.
- `packages/game/src/style.css`: new `--mg-paper-*` token group (12 tokens, listed
  below), added to `:root` alongside the existing palette.

New `--mg-paper-*` tokens:

| Token | Value | Use |
| --- | --- | --- |
| `--mg-paper-manila` | `#c9a76b` | the folder |
| `--mg-paper-manila-dark` | `#a8895a` | tab, fold-backs |
| `--mg-paper-sheet` | `#efe7d4` | the form |
| `--mg-paper-sheet-dark` | `#ddd2b8` | sheet fold-backs |
| `--mg-paper-ink` | `#2b2620` | printed type |
| `--mg-paper-biro` | `#2f3f8f` | handwriting |
| `--mg-paper-pencil` | `#8a8272` | edge smudges |
| `--mg-paper-stamp-red` | `#a83a2c` | rubber-stamp ink, ink ring, urgency |
| `--mg-paper-stamp-blue` | `#2f4f7a` | rubber-stamp ink (reserved, unused by the grade stamps - see deviation above) |
| `--mg-paper-coffee` | `rgba(122, 74, 32, 0.28)` | coffee ring band |
| `--mg-paper-carbon` | `#d9c4bd` | the carbon-copy action slip |
| `--mg-paper-ruled` | `rgba(70, 90, 120, 0.15)` | ruled lines behind the ledger/info block |

Checks run once each, all green: `paperSeed.test.ts` (11), `GradeStamp.test.ts` (10),
`AuctionScreen.test.ts` (38), `AuctionRoomDemoScreen.test.ts` (17, the other consumer of
`AuctionLotCard`), and the full `game` project (90 files, 1327 tests) as a final
collateral-damage sweep. No typecheck run: no schema field or exported symbol was
retired, renamed or reshaped, only additive (`GradeStamp`'s optional `seedId` prop).

The finished look: each auction lot is a manila folder lying crooked on a dark wood
desk, casting a real shadow. Its tab, small-capped, carries the lot's own id. Inside,
an aged cream form (typewriter type, faint ruled lines behind the value block, a dotted-
leader ledger table) holds the original identity/grade/checklist content unchanged. The
car photo is a tilted Polaroid, stapled or paperclipped on, showing a hand-authored
low-slung coupe silhouette in the car's own paint colour against a sky-to-tarmac
backdrop with dark wheels and film grain. The four grade chips are crooked rubber
stamps with letterpress texture, still coloured by real grade (green/amber/red/deep-red)
rather than a decorative choice. Everything the player has actually learned - the room's
number, the spread, the bid guidance, the work note - is biro-blue handwriting, tilted
and never quite level with the printed rules, with the headline figure hand-ringed in
red. A third of folders carry a coffee ring, some a folded corner; a stapled carbon-copy
slip holds the buy controls. Around it, the auction screen's header and warnings stay
exactly as neon as before.

**Maintainer correction pass (2026-08-19).** The proof of concept above was judged close
but not there: layout didn't quite match a running board, the Polaroid photo could sit
proud of the sheet, the stand-in handwriting font read wrong, the grade stamps needed
truer border and texture, the diagnosis (the symptom checklist) wasn't carrying enough
weight, and too many ink weights competed for attention instead of one hand reading as
the loud line. The maintainer approved a standalone HTML mockup
(`auction-paper-poc.html`) as the design of record and this sprint ported the shipped
components to exact parity with it, rather than iterating blind against the live app
again. Changes: a real licensed handwriting face, Nothing You Could Do (Kimberly
Geswein, OFL-1.1, `packages/game/src/assets/fonts/`), replaces the system-font
handwriting stack everywhere, sized per the reference's own override block; the
Polaroid's tilt clamp tightened to -2.5..2.5 degrees and confirmed in-flow inside the
sheet rather than able to overhang it; a new quiet-ink tier (`--mg-paper-ink-quiet`)
demotes the spread line, bid guidance and work subtext below the room-says headline and
the symptom verdict, which now carry the loud, full-strength biro at the reference's own
sizes - one hand, two volumes, never a third typeface inside a handwritten line, even for
money; the moved-estimate strike and the eliminated-cause strike both became hand-drawn
overlay lines instead of `text-decoration`, and the "up"/"down" headline figures lost the
ink-ring (only the plain unmoved figure keeps it, matching the reference); the symptom
checklist - never actually re-dressed in the first pass - got its own paper conversion:
flexed cause rows with a right-aligned tabular delta, a hanging-indented trail, and a
seeded per-symptom verdict tilt; the coffee ring grew to about 74px at 0.4 alpha, the
carbon slip's tone and gradient partner updated, and the seat-link/buyout buttons
dropped their rounded corners and fill for a plain ink-brown 2px border with a red-outline
hover/focus affordance and individually seeded tilts; the grade stamps kept their
approved tone-carries-the-grade colour mapping untouched but picked up the reference's
border weight, worn-stamp mask and label/value proportions. Every prop, emit, store
read, data-test attribute and behaviour is unchanged - this was a markup/CSS alignment
pass only. Verified once each, all green: `AuctionScreen.test.ts` (42),
`AuctionRoomDemoScreen.test.ts`, `GradeStamp.test.ts`, `paperSeed.test.ts`, and
`InspectionDemoScreen.test.ts` (the one other suite that reads the symptom checklist's
markup) - no dedicated `SymptomChecklist.test.ts` exists. No typecheck run: nothing
exported moved, retired or reshaped.
