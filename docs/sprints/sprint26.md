# Sprint 26: The banded parts model: 29 parts, five conditions, one truth

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, note 9) plus the
maintainer's schema decisions of the same day: the 29-part list below is locked; conditions are
five named bands, not 0-100; **scrap is a terminal band** (never repairable, only replaceable,
and a removed scrap part can only be sold for scrap value, never reinstalled anywhere); forced
induction is a universal slot (installable on NA cars, turbo or supercharger); underbody also
hosts underglow installs; repair speed is a 3-tier repair level (level 1 climbs 1 grade per
labor slot, level 2 climbs 2, level 3 climbs 3, so level 3 always takes a repairable part
straight to mint in one slot); and the hidden-defect/inspection information game is PAUSED and
comes out of the game entirely in this sprint. Status: **designed, ready to implement.** Depends
on Sprint 25 (display-name map). Single Sonnet implementation agent: read `CLAUDE.md` in full
first; no em dashes anywhere, including code and comments.*

## The Loop Rework arc (Sprints 25-31), overview

The 2026-07-11 playtest found the core loop unsound: too-coarse component granularity with
contradictory condition numbers, authored numbers where derived ones belong (job payouts blind
to part prices, fix costs blind to car value, static book value), a dead market (one-shot
demand rolls, weekly dumps, guaranteed listings), and raw ids in player copy. The arc:

- **25: Triage.** Bugs, guardrails, copy fixes; book value removed from the UI.
- **26 (this): The banded parts model.** 29 parts, five bands, hidden-defect system removed.
- **27: Transparent value.** Cost-weighted pricing (value = clean value minus restoration
  bill) and full pre-bid condition visibility.
- **28: Drill-down UI + parts catalog expansion** (rotary parts, NA turbo/supercharger kits,
  underglow).
- **29: Service-jobs framework v2.** Themed multi-task templates, tier progression, derived
  payouts, daily cadence.
- **30: Living auctions.** Age/mileage in value, daily bidder interest, staggered arrivals.
- **31: Selling rework.** Listings removed; daily walk-in offer stream, tuned via sims.

GDD deltas: this arc supersedes GDD v0.5 in: §5.2 seven package slots (now 29 parts in 6
groups), §5.5 "no sub-package simulation" (softened), §4.1 five 0-100 condition zones (now
banded parts), §6.5 inspection/hidden issues (paused, removed for now), §6.3 sale channels
(listings removed in 31). Consolidated GDD v0.6 edit note at the end of the arc.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- `PartInstance`, grades (stock/street/sport/race), tags, the Naming Layer, parody brands.
- The staged-work confirm flow and labor-slot economy (`stagedWork.ts`, `jobs.ts`): repair
  and install remain staged actions resolved through the same pipeline, retargeted to parts.
- Equipment gating (`equipment.ts` + `equipment.json`): same mechanism remapped to the 6
  groups; equipment additionally gains the repair-level stat (decision 7).
- `marketValueYen`'s heat-applies-once law and call shape: kept working this sprint through a
  thin band-factor shim (decision 4); Sprint 27 replaces the formula's internals.
- Dexie versioning + golden-save tests; the balance harness; Sprint 25's display-name map.

**Genuinely new mechanisms:**

- The parts taxonomy in content (`parts-taxonomy.json` + Zod schema): 29 parts, groups,
  display names, cost tunables, stat hooks, presence rules.
- The condition band enum and its content-defined factor/threshold tables.
- Repair as whole-grade steps toward a player-staged target band, gated by a 3-tier repair
  level (1, 2, or 3 grades per labor slot).
- Scrap as a terminal band: repair-locked, universally uninstallable, sellable for scrap
  value (a new player action).
- The universal forced-induction slot and the underbody underglow slot.
- The 8-to-29 save migration.

**Removed outright (maintainer decisions 2026-07-11):**

- The 8-way `ComponentIdSchema` as condition granularity.
- The ENTIRE hidden-issue and inspection system, PAUSED as a feature: issue generation and
  catalog, `revealed`/`repaired` flags, `issuePenaltyYen`/`issueAdjustedValueYen`/
  `effectiveComponentCondition`, `modelRiskDiscount`, the inspect action, travel fees,
  `lot.inspected`, the Fix button and `fix-issue` staged action, and every UI surface of
  these. Git history is the code archive; `hidden-issues.json` moves to
  `packages/content/archive/` (hygiene rule: archive, don't delete). The feature may return
  only with a genuinely better design (tracked in `TODO.md`); nothing in this arc may
  reintroduce it casually.

## The locked taxonomy (29 parts)

| Group | Parts |
|---|---|
| engine (10) | block, internals, headValvetrain, camsTiming, intake, exhaust, fuelSystem, ignitionEcu, cooling, forcedInduction |
| drivetrain (5) | gearbox, clutch, differential, driveline, chassis |
| suspension (6) | dampers, springs, antiRollBars, steering, brakePadsDiscs, brakeCalipersLines |
| wheels (2) | rims, tyres |
| body (4) | panels, paint, underbody, aero |
| interior (2) | seats, dashGauges |

## Design decisions (locked)

1. **Condition is a band and nothing else.** `type ConditionBand = 'scrap' | 'poor' | 'worn'
   | 'fine' | 'mint'`. No 0-100 number survives anywhere for car parts; the band IS the
   state (the two-truths failure mode is structurally impossible). Content defines
   `bandFactors` (proposed: mint 1.0, fine 0.85, worn 0.65, poor 0.40, scrap 0.15) and the
   migration thresholds (90/70/40/15).
2. **State shape:** `CarInstance.parts: Record<CarPartId, { band: ConditionBand, installed:
   PartInstance | null }>`, all 29 keys always present (`CarPartId` is the taxonomy id; the
   catalog's purchasable `Part` keeps its own id and gains `carPartId` as its address, so
   the two "part" meanings never collide). `forcedInduction` alone carries
   `fitted: boolean`: factory-fitted (true, with a rolled band) on `Turbo`-tagged models,
   unfitted on NA cars (band ignored while unfitted). Fitting an FI kit part sets `fitted:
   true`, mint. Owned `PartInstance`s become banded too (used parts read "worn turbo", not
   "72%").
3. **Universal FI slot:** turbo AND supercharger kit parts exist in the catalog (different
   stat profiles) and install onto ANY car's FI slot, piston or rotary tags permitting per
   part. Underbody hosts underglow kits the same way: a normal `installed` part whose stat
   contribution is style. (Catalog entries themselves land in Sprint 28; the slots and
   install paths land here, with at least one seed part each so the path is testable.)
4. **Value shim (this sprint only), cost-weighted per maintainer directive:** the existing
   `conditionFactor` pipeline keeps working, but its input becomes the cost-weighted mean of
   band factors, where each part's weight is its share of the car's total
   `costToMint` (decision 5): a scrap turbo drags value far more than scrap brakes, on
   identical cars, from day one. The old hand-authored `componentValueWeights` die.
   `anchorValueYen` drops its deleted `(1 - modelRiskDiscount)` term. Sprint 27 replaces
   this shim with the full restoration-bill deduction model.
5. **Repair is whole-grade steps; scrap is terminal.** Repairing a part moves it up by whole
   grades toward a player-staged target band (stop anywhere: patching a poor gearbox to worn
   is a legal, visible choice). A **scrap** part cannot be repaired at all, under any
   equipment or skill: the only action available on it is Replace. Mint needs no repair
   (Repair is simply unavailable as a no-op). Cost per grade climbed is per-part content
   (`stepCostYen`, roughly realistic per part class). `costToMint(part)`: for a repairable
   band, grades-to-mint times `stepCostYen`; for a scrap part, its
   `stockReplacementPriceYen` (decision 6) instead, since there is no repair path to price.
   This atom is reused by valuation (decision 4), Sprint 27 pricing, and Sprint 29 payouts.
6. **Scrap parts cannot move between cars; they can only be replaced or sold for scrap
   (maintainer directive).** The install fit-check rejects any `PartInstance` whose band is
   scrap, unconditionally, for every car: not a tag mismatch, a hard universal block. A
   scrap `PartInstance` sitting in the player's inventory (put there by removing it from a
   car being replaced) has exactly one action available: **Scrap it** for cash,
   `scrapValueYen = round(stockReplacementPriceYen * scrapValueFraction)` (content tunable,
   propose 0.05, "pennies on the yen"). Every taxonomy part gains
   `stockReplacementPriceYen` in content: a generic stock-equivalent replacement cost, used
   both here and as decision 5's scrap `costToMint`, and doubling as the fallback Replace
   price on the rare car/part combination with no fitting catalog entry. A factory-fitted
   part that was never a discrete `PartInstance` (`installed: null`) has nothing to
   scrap-sell: replacing it is a normal purchase with no trade-in.
7. **Repair speed is a 3-tier repair level, exact table, not an open multiplier (maintainer
   directive).** Bands are ordered scrap(0) < poor(1) < worn(2) < fine(3) < mint(4).
   Equipment defines `repairLevel: 1 | 2 | 3` per group (the best owned equipment covering a
   part's group sets its level; base hand tools default to level 1). At level L, one labor
   slot climbs up to L grades toward the target band: `slotsNeeded = ceil(gradesToClimb /
   repairLevel)`. Matching the maintainer's own worked examples: level 1 climbs fine to
   mint (1 grade) in one slot; level 2 climbs worn to mint (2 grades) in one slot; level 3
   climbs poor to mint (3 grades, the maximum possible since scrap is unrepairable) in one
   slot. **Yen cost never depends on equipment tier:** total cost is always
   `gradesClimbed * stepCostYen` regardless of how many slots it took, so a car's intrinsic
   repair cost, and therefore its value (decisions 4-5), never depends on which shop happens
   to own it, only on the work itself. When the staff/skill system lands (see
   `docs/design/skill-progression.md`), mechanic skill may raise a mechanic's effective
   repair level, capped at 3: skill optimizes, never unlocks, exactly per that design.
8. **Stats from parts** (content weights): power from engine parts (ignitionEcu, camsTiming,
   intake, exhaust, internals, and FI when fitted); handling from suspension and tyres;
   reliability from engine and drivetrain with cooling emphasized; style from body,
   interior, and rims, with underglow and aero contributing. Every part feeds at least one
   stat or the restoration bill; no dead parts.
9. **Sale classification re-based on bands:** lemon = any part at scrap OR cost-weighted
   average below the lemon threshold; clean = nothing below fine; concours = everything mint
   plus the existing authenticity requirement. (Replaces the issue-based lemon trigger,
   which is deleted. Scrap being both unrepairable and an automatic lemon trigger is
   intentional: it is the game's honest "this needs real money before it's sellable" state.)
10. **Lots are transparent (consequence of the pause):** an auction car's parts and bands are
    plain state on the lot, no reveal machinery. Minimal UI this sprint: the lot detail shows
    the 6 group bands (cost-weighted aggregate band). The full pre-bid information surface
    (per-part list, card chips) is Sprint 27's.
11. **Migration (save law):** Dexie bump. Old 8-component percentages map through the band
    thresholds; each old component fans out its band to its mapped parts (engine to the 9
    non-FI engine parts; forcedInduction to the FI slot with `fitted` from the Turbo tag;
    brakes to both brake parts; wheels to rims + tyres; body to panels/paint/underbody with
    aero mint; interior to seats + dashGauges; drivetrain to its 5). Installed parts remap
    by catalog address (ECU to ignitionEcu, internals kits to internals, turbo kits to
    forcedInduction, brake parts to brakePadsDiscs). A migrated part landing on scrap
    immediately follows decision 6 (uninstallable, sellable only). Old `hiddenIssues` fields
    are dropped. Golden-save test updated in the same change.
12. **Bots interim:** strip every `lot.inspected` gate (the flag no longer exists); bots bid
    from the same transparent value shim as the player. Proper bot re-basing is Sprint 27's.

## Definition of Done

- Taxonomy, bands, factors, thresholds, step costs, stock replacement prices, repair levels,
  scrap value fraction, stat weights all in content JSON with Zod schemas (content law); no
  tunable in code.
- `car.parts` everywhere; grep-clean: no `car.components`, no `hiddenIssues`, no
  `inspected`, no `issuePenaltyYen`, no `fix-issue` outside migration code.
- Tests: band math, cost-weighted aggregation (the two-identical-cars case: scrap turbo car
  is worth measurably less than scrap brakes car), install locality, whole-grade repair with
  target bands, the repair-level formula at all three worked examples (fine to mint at
  level 1, worn to mint at level 2, poor to mint at level 3, each in exactly one slot), that
  repair cost in yen is identical regardless of which level performed it, that a scrap part
  offers Repair nowhere in the sim, that a scrap `PartInstance` fails `partFitsCar` for
  every car, that scrapping a scrap `PartInstance` pays `scrapValueYen` and removes it from
  inventory, FI fitted/unfitted, migration, generation, sale classification; golden seeds
  updated.
- Full gate green; `pnpm balance:run` + `python -m balance.cli check` re-run, deltas
  documented in Exit (changed numbers are expected, not regressions).
- UI compiles and plays: group bands render on car page and lot detail; Repair/Replace work
  group-level via the bridge; no percent signs remain anywhere for car condition.
- `TODO.md` gains the paused-feature entry for the inspection/hidden-defect game.

## Tasks (Claude-implementable)

- [ ] Content: `parts-taxonomy.json` + schema (`stepCostYen`, `stockReplacementPriceYen`,
  `bandFactors`); `scrapValueFraction`; equipment `repairLevel: 1 | 2 | 3`; part schema
  `carPartId` remap of the existing catalog; seed FI kit + underglow entries.
- [ ] Sim: state shape, whole-grade band math, install/repair with the terminal-scrap rule,
  the repair-level slot formula, the universal scrap fit-check block, the scrap-sell action,
  stats, generation, value shim, sale classification, lot transparency; full deletion list.
- [ ] Save: Dexie bump + migration + golden saves.
- [ ] Game: group-band rendering, staged repair with target band (Repair hidden/disabled on
  scrap rows), a "Scrap it" action on scrap `PartInstance` inventory cards, removal of
  inspect/Fix/issue UI.
- [ ] Bots compile fixes; balance re-run; tests; Exit.

## User-only tasks

- [ ] Review `parts-taxonomy.json` numbers (step costs, band factors, stat weights): all
  designer-tunable JSON; the structure is what this sprint delivers.

## Exit

*(Filled at implementation.)*
