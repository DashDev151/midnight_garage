# Sprint 33: Playtest response - legibility, early-game gating, and calibration

*Source: maintainer's second playtest, 2026-07-12 (notes captured live). The auction findings
from that same playtest are handled separately (the committed auction fix + the live-auction
investigation in `TODO.md`); this sprint is everything else that playtest surfaced. Read
`CLAUDE.md` in full first; no em dashes anywhere.*

## Why this sprint exists

The stock-baseline/catalog build (Sprint 32) is mechanically sound but the first real play session
found it illegible and mis-paced in several concrete ways: permanent tutorial text clutters the
main screens, the job board offers work the player physically cannot do, the parts catalog is one
unusable flat list, the auction condition report is unreadable, the parts inventory hides the one
thing that matters (condition), cars generate in absurd condition for their age, and the labor
economy is wildly out of step with the 29-part repair granularity. None of this is a new system;
it is making the systems that exist legible and correctly paced for a real player.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (nothing here is a new system):**

- The Sprint 28 drill-down / `BandChip` / `PartCard` / `ReplaceDrawer` / screen components:
  polished and re-laid-out, not rebuilt. The catalog hierarchy and the auction condition report
  are new *layouts* over existing data.
- Sprint 29's service-job tier gating + the Sprint 13 equipment gate + the equipment-hint
  mechanic: the job-availability rules extend these, they do not fork a second gate (Sprint 08's
  one-system rule).
- The generation condition roll (`auctions.ts` / `newGame.ts`, the `CAR_CONDITION_*` constants +
  `bandForMigratedCondition`): recalibrated, not replaced. Age is available at generation (the
  tag-gating `currentYear` is still threaded; only its VALUE use was removed).
- The labor-slot economy + the 3-tier repair-level formula (Sprint 26 `bands.ts`): recalibrated
  numbers, same mechanic.
- The per-instance `PartInstance.band`: already exists, just surfaced in the inventory UI.

**Genuinely new (small):**

- A click-through catalog hierarchy (pure UI state: group -> sub-part).
- A restructured, legible auction condition report layout.
- A tutorial-phase gate on equipment purchases and job offers (a thin new precondition on top of
  the existing reputation-tier gate, not a parallel system).
- An age-aware (or tier-aware) input to the generation condition roll.

**Explicitly NOT in this sprint:** the in-inventory part-recondition mechanic (maintainer flagged
it as a future addition, `TODO.md`); the live-auction redesign (its own investigation); any final
number-tuning that genuinely needs more play data than one session (condition + labor land a
sensible first pass here, calibrated further in playtest).

## Design decisions (locked, and TWO that need a maintainer call first)

1. **UI declutter (note 1).** Persistent tutorial/explainer text ("drag a car onto another slot...",
   "Owning a component's equipment is what unlocks Repair...") comes off the main gameplay screens.
   One-off/dismissible tips or a help affordance, never permanent chrome. Audit every screen.
2. **Job board only shows actionable work (note 2).** A service-job offer appears only if the
   player can complete it NOW, or needs exactly ONE equipment purchase (surfaced as a buy-this
   hint). Equipment itself tiers: nothing purchasable during the tutorial phase, then the Tyre
   Machine & Balancer, then the rest gated behind reputation as today. Early-game offers are
   predominantly Replace-only (no equipment) with a few single-equipment-hint jobs. Extends Sprint
   29 tier gating + the equipment-hint mechanic; no turbo/late-game job on a fresh game.
3. **Parts catalog is a drill-down (note 3).** Main group -> sub-part hierarchy, not one flat list.
   Keep it lightweight; reuse the group/part vocabulary already in the taxonomy.
4. **Auction condition report is restructured for legibility (note 4).** The 29-part grid becomes a
   readable, scannable layout (grouped, aligned), reusing `BandChip` and the same per-part rows the
   owned-car page uses.
5. **Parts inventory shows condition (note 5a/5b).** Every `PartInstance` card shows its band, in
   the inventory screen AND the replace drawer; the drawer also gets a visual polish. (The
   recondition-a-part mechanic, note 5c, is deferred, see "not in this sprint".)
6. **Generation condition is age/tier-aware (note 6/S14).** A ~2-year-old car must not roll nearly
   every part `poor`. The condition baseline skews toward better for younger and/or higher-tier
   cars. First-pass curve here; final calibration in playtest. (This is generation condition, NOT
   the value model, age was correctly removed from VALUE and stays out.)
7. **Labor recalibration (note 7).** Base 2 labor slots against per-component repair makes a full
   restoration take ~20 days, far too slow. Re-calibrate labor throughput (base slots, the
   repair-level speed multiplier, and/or parts-per-slot) so restoration is paced to be fun, not a
   war of attrition. First pass here, tuned against the balance harness + playtest.

**NEEDS A MAINTAINER DECISION before its task starts:**

- **Customer-parts ethics (playtest note).** A Replace job keeps the removed old part in our
  inventory. Correct for cars we own; on a customer's car (service job) it is stealing the
  customer's part. Options: removed parts from customer cars are simply discarded (not kept); or a
  core-charge/credit; or the customer keeps them (the part just vanishes from our side). Pick one.
- **How hard is the tutorial gate (note 2)?** Confirm the exact early-game equipment ladder
  (tutorial: nothing; then Tyre Machine only; then reputation-gated as today) and how many
  jobs/day of each kind a brand-new game should show.

## Definition of Done

- No permanent tutorial/help text on main gameplay screens; verified across every screen.
- Job board never offers an un-doable job on a fresh game; equipment tiers per decision 2;
  early-game jobs are predominantly Replace-only. Test: a new-game first-offers set is all
  actionable.
- Catalog drill-down works keyboard-and-pointer; auction condition report is legible; inventory +
  drawer show part condition.
- Generated cars' condition is plausible for age/tier (young cars are not near-scrap); seeded-
  deterministic; a test asserts a young car's median part condition is well above `poor`.
- Labor throughput recalibrated; a test/anchor documents "days to fully restore a typical car" is
  in a sane band.
- Customer-parts handling implemented per the maintainer's decision.
- Full gate green; balance run + invariant check re-run (generation-condition + labor changes move
  economy numbers; document as expected, not regressions); no NEW hard-invariant break beyond the
  already-deferred Sprint 32 days-to-local one.

## Tasks (Claude-implementable)

- [ ] Game/UI: declutter pass (remove persistent hints, all screens); catalog drill-down; auction
  condition-report restructure; inventory + drawer part-condition display + drawer polish.
- [ ] Sim/content: job-availability gate (actionable-or-one-tier-up) + equipment tutorial tiering;
  age/tier-aware generation condition; labor recalibration (constants).
- [ ] Sim: customer-car removed-part handling per the maintainer's decision.
- [ ] Tests per DoD (fresh-game offers all actionable; young-car condition; labor-days anchor;
  customer-parts behavior); balance re-run; Exit.

## User-only tasks

- [ ] Make the two flagged design calls (customer-parts handling; the exact tutorial gate).
- [ ] Playtest again and give final numbers for condition skew, labor throughput, and job cadence.

## Exit

*(Filled at implementation.)*
