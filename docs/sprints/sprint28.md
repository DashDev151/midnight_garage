# Sprint 28: Drill-down UI and the parts catalog remap

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 9
(remainder)), the rotary content hole found during triage, and the maintainer's 2026-07-11
additions: NA forced-induction installs (turbo or supercharger) and underglow kits. Status:
**designed, ready to implement.** Depends on Sprints 26-27. Single Sonnet implementation
agent; read `CLAUDE.md` first; no em dashes.*

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The Sprint 24 `.meter-line` / `.action-line` row pattern in `CarDetailScreen.vue`: sub-part
  rows are the same two-line structure one indent level deeper; design tokens
  (`--mg-fs-*`, `--mg-space-*`) throughout.
- The staged-work confirm flow and ReplaceDrawer: unchanged mechanics, retargeted to a
  sub-part address.
- `partFitsCar` tag logic and the Naming Layer / parody-brand rules for all new catalog
  entries; the naming-layer CI test must stay green.
- Sprint 25's tooltip pattern for equipment locks; Sprint 26's display-name content.

**Genuinely new mechanisms:**

- Expandable group rows (pure UI state; no sim change).
- A shared band formatter/chip component for the five conditions (scrap/poor/worn/fine/mint,
  from Sprint 26's content tables).
- A rotary marker glyph on rotary-only part cards (a small triangle: semantic, so allowed
  under the no-decorative-Unicode rule).

## Goal

Make the granular model playable and legible: the car page drills from 6 group bars into
sub-part rows with their own repair/replace actions, the parts market speaks sub-parts, and
the catalog actually covers the taxonomy (today it cannot: verified during triage that zero
Rotary-tagged parts exist, so the FC and FD RX-7s can never receive any engine or forced
induction part; and whole sub-part classes like tyres, dampers, seats have no parts at all).

## Design decisions (locked)

1. **Car page:** 6 group rows (aggregate band chip + bar), each expandable to its part rows
   (name, band chip, Repair-to-target-band / Replace on the action line). Group-level
   "Repair all to fine" survives as a convenience on the group action line, skipping any
   scrap part it can't touch. A **scrap** part row shows Replace only: no Repair control at
   all, per Sprint 26 decision 5 (repair is structurally unavailable, not merely disabled).
   No percentages appear anywhere: the band IS the condition (Sprint 26).
2. **Copy rules:** display names only, no raw ids anywhere (extends Sprint 25 task 6); no
   `requiredTags` jargon on part cards: fit is shown as fit ("doesn't fit this car" dimming
   stays), and rotary-only parts carry the small triangle marker with a tooltip. Equipment
   locks are tooltips (never inline strings).
3. **Parts market and drawer:** filter/group by group then part; the drawer for a part shows
   only catalog parts addressed to it that fit the car. The parts inventory screen renders a
   **Scrap it** button on any scrap-band `PartInstance` card (Sprint 26 decision 6), paying
   `scrapValueYen` and removing it; a scrap card never shows an Install/fit option anywhere,
   since the fit-check rejects it universally.
4. **Catalog expansion (content):** add parody-brand entries so every car part that
   reasonably has an aftermarket has at least stock and street options for common platforms:
   a rotary line (internals/apex-seal kit, rotary turbo kits, rotary ECU), forced-induction
   kits in BOTH flavors (turbo and supercharger) installable on NA cars via the universal FI
   slot, and underglow kits for the underbody slot (style). Target roughly 25-35 new
   entries; prices set relative to `parts-taxonomy.json` repair economics so
   replace-vs-repair is a real choice, not dominated either way. This is designer bait: flag
   every priced entry in the sprint Exit for maintainer tuning.
5. **Auction surfaces:** already transparent (Sprint 27 built the card chips and the
   read-only parts list). This sprint only unifies them onto the same shared row/chip
   components as the owned-car page and polishes density. Nothing is estimated, hidden, or
   revealed; there is no inspection.

## Definition of Done

- Drill-down works keyboard-and-pointer (the pick-mode accessibility fallback still covers
  drag interactions); no layout regressions on the other screens.
- Catalog validation tests: every car part with a Replace button has at least one fitting
  part for at least one roster car; every rotary-tagged car has fitting engine/FI options;
  at least one turbo kit, one supercharger kit, and one underglow kit exist and install on
  an NA piston car; naming-layer test green; no guaranteed-loss interaction with Sprint 25's
  job-payout invariant test.
- Full gate green; component tests for expand/collapse, sub-part staging, drawer filtering.

## Tasks (Claude-implementable)

- [ ] CarDetailScreen drill-down (rows, bands helper, findings badges, group repair-all).
- [ ] PartCard/ReplaceDrawer/PartsMarketScreen re-grouping + copy rules + rotary marker.
- [ ] AuctionScreen estimated/true compact bars.
- [ ] Content: catalog remap audit + ~20-30 new entries (rotary line included).
- [ ] Tests per DoD; Exit section.

## User-only tasks

- [ ] Visual pass on the drill-down and the auction card density; price-tune the new catalog
  entries in JSON.

## Exit

*(Filled at implementation.)*
