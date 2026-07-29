# Sprint 50 - Auction cards: grid discipline and a place for the art

**Source:** playtest 2026-07-13 pass 2, item 9. Builds on Sprint 46 (its wording fixes land
first; this sprint is purely visual structure).

## Confirmed current state (code discovery, 2026-07-13)

`AuctionScreen.vue` per-lot card (`:161-270`): title/meta line, guide value, a reserve/leading/
close-label text line, turnout pill, then a 6-group summary row of inline label+`BandChip` pairs
that wrap loosely (`flex-wrap`, `:367-371`), then a collapsible "Show/Hide full condition report"
(`:199-238`) that expands into a per-group, per-part `BandChip` breakdown (all 29 parts) plus a
restoration-bill line, then bid controls. Two visual languages for one data shape on one card;
chips and text of mixed sizes; wrapping mid-card. No art anywhere.

**2026-07-13 maintainer correction (scope-narrowing, mid-design):** the expanded full condition
report specifically - the 29-part `mint`/`fine`/`worn`/`poor`/`scrap` breakdown - reads as
overcomplicated jargon for a pre-bid glance. Replace ONLY that expandable report with a real-world
Japanese used-car-auction-style grade: one overall number/letter (`S`/`6`/`5`/`4.5`/`4`/`3.5`/`3`/
`2`/`1`, or `R` for a car carrying serious defects) plus separate exterior and interior letter
grades (`A`-`E`). Explicitly OUT of scope: the internal 5-band condition/repair model
(`bands.ts`) stays exactly as it is - this is a computed DISPLAY translation of the car's existing
band state, not a new mechanic. Also explicitly OUT of scope: the collapsed 6-group summary row
above it (`lot-bands`, unrelated element, untouched) and every other screen that shows a band
(`CarDetailScreen.vue`, `PartsMarketScreen.vue`, etc.) - this is the auction lot card's expandable
report only.

## Reuse analysis (directive 16)

**New mechanisms:**

- A 2:1 (96x48-proportioned) art-placeholder block on every lot card (empty, bordered, sized to
  the art bible's car-master ratio so future sprites drop in edge to edge - maintainer-confirmed
  2026-07-13, superseding the original "square" phrasing in the playtest notes).
- A pure sim function computing an `{ overall, exterior, interior }` auction-grade summary from a
  car's existing band state, partitioned across the 6 groups so nothing is read twice: the overall
  number/`R` reads ONLY the mechanical groups (engine, drivetrain, suspension) - never body,
  wheels, or interior, since those already drive the two letter grades below and would otherwise
  double-count; worst band in body+wheels -> exterior letter; worst band in the interior group ->
  interior letter. A direct 5-band-to-A-E readout for the letters, no new tunables there; the
  overall ladder buckets an average band-index across the mechanical groups only, any scrap/missing
  part in engine/drivetrain/suspension forces `R`. Zero new persisted state, zero effect on repair
  cost/value/labor - display-only, same shape as Sprint 39's Shop Title (a pure function of
  existing state, no save-version bump).

**Existing mechanisms to reuse:**

- `BandChip` stays the single band-rendering atom for the 6-group summary row (untouched) -
  normalized to one size everywhere on this screen.
- All lot data/getters (`lotDetail`, `bidStateLabel`, turnout labels, bid controls, buyout,
  capacity warnings, My Active Bids) are untouched in logic; this is a template/CSS restructuring
  sprint plus one new derived display field.
- `bandIndex`/`isPartMissing`/the part-id-by-group grouping (`bands.ts`, `context.ts`) are reused
  verbatim by the new grade function rather than re-deriving band arithmetic.
- The restoration-bill figure (a plain yen amount, not condition jargon) survives, promoted to
  always-visible next to guide value rather than gated behind the now-removed toggle.

## Decisions

1. **Card layout becomes a fixed grid:** left column = the 2:1 art placeholder; right column
   = strictly stacked rows: (1) title + year/km/color meta, (2) guide value, (3) one status row
   (reserve · leading bid · close label) with consistent typography, (4) turnout + state as
   uniform chips. No inline wrapping of mixed-size elements.
2. **The expandable full condition report is replaced by a computed auction-grade line -
   always visible, no toggle needed.** Where "Show/Hide full condition report" used to sit: a
   single short line, e.g. `Grade 4.5 · Ext B · Int C`, computed by the new sim function above and
   read once per lot (`LotDetail.auctionGrade`). The overall number/`R` is a MECHANICAL-ONLY
   reading (engine, drivetrain, suspension) - body, wheels, and interior deliberately excluded from
   it since they already drive the two letter grades; folding them into the overall number too
   would double-count the same defect in two places on the same line. The restoration-bill yen
   figure moves up next to guide value, always visible. The 29-part breakdown, the per-group
   `BandChip` cards, and the toggle button are all removed from this screen - the collapsed
   6-group summary row (`lot-bands`, decision-2-of-the-original-draft's "one condition grid, two
   densities" idea) is UNCHANGED and stays exactly as it renders today; only the expandable report
   beneath it is gone.
3. **My Active Bids** aligns into a proper table (car / your bid / state / action) instead of a
   text run.
4. Scope guard: no other screen's condition display changes; no sim/repair/value-model change;
   Sprint 46 still owns general auction wording.

## Tasks

1. Sim: `computeAuctionGrade(car, model, partIdsByGroup)` in a new `packages/sim/src/
   auctionGrade.ts` + tests (all-mint -> S/A/A, all-poor mechanically -> low number, any
   scrap/missing part in engine/drivetrain/suspension -> R, a legitimately-absent NA
   forced-induction slot never counts as a defect, exterior/interior read only body+wheels /
   interior and NEVER move the overall number, a scrap/missing body or interior part changes the
   letter grade but leaves the overall number untouched - proving no double-count).
2. Game: `LotDetail.auctionGrade` wired in `gameStore.ts`'s `lotDetail()`; `AuctionScreen.vue`'s
   expandable report block replaced by the always-visible grade line + promoted restoration-bill
   figure; remove the now-dead `isLotExpanded`/`toggleLotDetail`/`groupedPartRows` state and the
   `.lot-parts`/`.condition-groups`/`.part-rows` CSS. Card layout grid (decision 1), the art
   placeholder, and the My Active Bids table (decision 3) proceed unchanged from the original
   design.
3. Tests: existing AuctionScreen tests touching `toggle-detail-*`/the expanded report are rewritten
   for the new grade line; add one asserting the grade line renders per lot and matches
   `computeAuctionGrade`'s output for that lot's car.
4. Verification: full gate; visual sign-off is the maintainer's playtest (user-only task).

## Definition of done

- Every lot card shows the same fixed structure with an art placeholder; nothing wraps or
  overlaps at normal desktop widths; chips are one size.
- The old expandable 29-part condition report is gone from the auction screen, replaced by one
  always-visible computed grade line; the restoration bill is always visible beside guide value.
- The collapsed 6-group summary row is unchanged; every other screen's condition display is
  unchanged; the internal band/repair/value model is unchanged.
- Full gate green; zero sim-economics changes (the new grade function has no effect on cost,
  value, or labor - it only reads existing state).

## Exit

**Implemented and verified 2026-07-13.**

- `packages/sim/src/auctionGrade.ts` (new) - `computeAuctionGrade(car, model, partIdsByGroup)`,
  reusing `bandIndex`/`isPartMissing` from `bands.ts`. The 6 groups partition cleanly across three
  readings: `overall` (S/6/5/4.5/4/3.5/3/2/1, or `R`) reads ONLY the mechanical groups
  (engine/drivetrain/suspension) via an averaged band index bucketed against a fixed ladder, `R`
  overriding on any scrap/missing mechanical part; `exterior`/`interior` read body+wheels and
  interior respectively, a direct band-to-letter (A-E) readout. A legitimately-absent slot (NA
  forced induction) never counts anywhere. Zero new tunables, zero economic effect.
- `packages/sim/tests/auctionGrade.test.ts` (new, 7 tests) - all-mint S/A/A, all-poor low
  number/D/D, the NA-forced-induction non-defect case, and a dedicated
  "mechanical/exterior/interior partition" suite proving a mechanical defect forces R without
  touching either letter, and a body/interior defect changes only its own letter without ever
  moving the overall number (the double-count fix the maintainer flagged).
- `packages/game/src/stores/gameStore.ts` - `LotDetail.partRows` removed (dead once the report
  left the screen) and replaced with `auctionGrade: AuctionGrade`, computed once in `lotDetail()`;
  the now-unused `allCarPartRows` helper deleted.
- `packages/game/src/screens/AuctionScreen.vue` - card becomes a fixed 2-column grid (a 2:1 art
  placeholder left, stacked info rows right); the old "Show/Hide full condition report" toggle and
  its 29-part breakdown are gone, replaced by an always-visible grade line
  (`Grade 4.5 · Ext B · Int C · restoration bill <yen>`) plus the promoted restoration-bill figure;
  the collapsed 6-group `lot-bands` summary is untouched; My Active Bids is now a real table (car /
  your bid / state / action) instead of a wrapping flex row.
- `packages/game/src/screens/AuctionScreen.test.ts` - the old condition-report describe block
  replaced with tests for the grade line (asserting it matches `computeAuctionGrade`'s real output
  for that lot, and that the old toggle/report elements are gone), the art placeholder count, and
  the bids table.

Verification: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format` clean; full suite
`pnpm test` 950/950 passing; `pnpm build` succeeds. Balance harness skipped - the new grade
function is read-only display math with no effect on cost, value, or labor, and every other
sim/store call on this screen is unchanged.
