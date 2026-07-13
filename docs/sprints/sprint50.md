# Sprint 50 - Auction cards: grid discipline and a place for the art

**Source:** playtest 2026-07-13 pass 2, item 9. Builds on Sprint 46 (its wording fixes land
first; this sprint is purely visual structure).

## Confirmed current state (code discovery, 2026-07-13)

`AuctionScreen.vue` per-lot card (`:161-270`): title/meta line, guide value, a reserve/leading/
close-label text line, turnout pill, then a 6-group summary row of inline label+`BandChip` pairs
that wrap loosely (`flex-wrap`, `:367-371`), then a collapsible full condition report that uses a
DIFFERENT, properly-gridded treatment of the same per-group band data, then bid controls. Two
visual languages for one data shape on one card; chips and text of mixed sizes; wrapping
mid-card. No art anywhere.

## Reuse analysis (directive 16)

**New mechanisms:**

- A 2:1 (96x48-proportioned) art-placeholder block on every lot card (empty, bordered, sized to
  the art bible's car-master ratio so future sprites drop in edge to edge - maintainer-confirmed
  2026-07-13, superseding the original "square" phrasing in the playtest notes).
- One shared condition-grid component used by BOTH the collapsed summary and the expanded full
  report.

**Existing mechanisms to reuse:**

- `BandChip` stays the single band-rendering atom - normalized to one size everywhere on this
  screen.
- All lot data/getters (`lotDetail`, `bidStateLabel`, turnout labels, bid controls, buyout,
  capacity warnings, My Active Bids) are untouched in logic; this is a template/CSS
  restructuring sprint.
- The show/hide full-report toggle behavior survives; only its contents get the shared grid.

## Decisions

1. **Card layout becomes a fixed grid:** left column = the 2:1 art placeholder; right column
   = strictly stacked rows: (1) title + year/km/color meta, (2) guide value, (3) one status row
   (reserve · leading bid · close label) with consistent typography, (4) turnout + state as
   uniform chips. No inline wrapping of mixed-size elements.
2. **One condition grid, two densities.** A shared component renders the six groups as a fixed
   6-column (wrapping to 3x2 on narrow) grid of label-above-chip cells for the collapsed
   summary; the expanded report reuses the same component per-group with its part rows beneath,
   keeping today's alignment but with normalized chip sizing and no text overlap.
3. **My Active Bids** aligns into a proper table (car / your bid / state / action) instead of a
   text run.
4. Scope guard: no behavior, wording (Sprint 46 owns wording), or sim changes.

## Tasks

1. Game: extract the shared condition-grid component; restructure the lot card template + CSS;
   normalize chips; the art placeholder block; My Active Bids table.
2. Tests: existing AuctionScreen tests keep passing with updated selectors; add one asserting
   the placeholder block renders per lot and one asserting summary and full report render
   through the same component.
3. Verification: full gate; visual sign-off is the maintainer's playtest (user-only task).

## Definition of done

- Every lot card shows the same fixed structure with an art placeholder; nothing wraps or
  overlaps at normal desktop widths; chips are one size.
- Summary and full report visibly share one grid language.
- Full gate green; zero sim/store changes.

## Exit

(filled at completion)
