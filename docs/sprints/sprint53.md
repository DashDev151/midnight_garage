# Sprint 53 - Economy Rebuild 1 of 3: the diagnosis, the economy bible, and fitment-class parts pricing

**Source:** playtest 2026-07-14 items 6 and 9 (`docs/playtest-notes-2026-07-14.md`) - the
maintainer-declared paramount focus. Opens the **Economy Rebuild arc (Sprints 53-55)**. The
maintainer's directive is explicit: no more point patches; gut the system and build a better one
from the ground up. The arc split: Sprint 53 fixes what repairs COST (proportionate to the car),
Sprint 54 fixes what repairs are WORTH (always more than they cost), Sprint 55 makes the whole
ledger self-checking (global coherence invariants).

## The diagnosis (deep analysis, 2026-07-14 - every number below traced to live code)

The playtest car: Honda City E (AA) 1983, 116,226 km, every group `poor`. Displayed: guide value
Y7,735, restoration bill Y336,800, reserve Y3,868. After Y45,000 of triage work (a few
poor-to-worn repairs plus stock tyres and brake pads) the bill fell exactly Y45,000, guide value
did not move at all, and the sale ballpark rose ~Y100. Four stacked causes, ranked deepest first:

**Cause 1 (structural): a flat, tier-blind parts catalog priced against a 23x car-value ladder.**
Since Sprint 44 every part has one global price (`parts.json`; `stockReplacementPriceYen` in
`parts-taxonomy.json` mirrors it). The full 27-part replacement catalog sums to ~Y1,104,000 and
the all-poor mint-reference bill to ~Y366,400 - the same number whether the host car is a Y4.2M
rare or this Y180,000-book shitbox. The Honda's clean-value ceiling is:

    cleanValue = bookValueYen x mileageFactor x heat
               = 180,000 x 0.8594 (at 116,226 km) x 1.0 = ~Y154,700

A car whose restoration costs ~2.4x its restored ceiling cannot be made profitable by ANY value
formula: the spend is real money. Sprint 44 accepted this as "intended fiction" (a truly worn kei
car is a parts car) and endorsed triage flips as the viable cheap-car play. The maintainer played
exactly that endorsed triage play and lost - see causes 2 and 3.

**Cause 2 (the feedback killer, a Sprint 47 regression): the value floor collapsed 4.4x.**
Sprint 44 deliberately set the whole-car value floor to `0.22 x cleanValue` (`floorFraction`,
raised from 0.15 "to lift the bottom of the market"). Sprint 47 deleted `floorFraction` and
repurposed `bands.scrapValueFraction` (0.05 - a PER-PART scrap payout rate) as the whole-car
floor, with no re-tune discussion in its sprint doc: an incidental byproduct, not a decision.
Result: guide value Y7,735 = 0.05 x 154,699 exactly. The two-slope formula underneath is deeply
NEGATIVE for this car (154,699 - [1.15 x 77,350 + 0.4 x 237,650] = -29,314), so the display sits
on the floor and stays there until the valuation bill falls below ~Y222,400 - the first
~Y55,000-95,000 of repair spend produces literally zero visible value change. That is the exact
"Y45,000 bought Y100" the playtest hit (the ~Y100 ballpark wobble was buyer-taste noise from
`valuation.tasteSpread`, not the value model responding).

**Cause 3 (a guaranteed-loss zone even without the floor): the far slope is 0.4.** In the Sprint
47 two-slope model (`marketValue.ts:81-100`), bill above `0.5 x cleanValue` is discounted at
`valuationPremiumFar = 0.4`: each repair yen spent in that zone returns Y0.40 of value - a
structural 60% loss across an enormous zone on any damaged car. Only below the threshold does the
near slope (1.15) make repair marginally profitable, and by then a cheap car's flip is long dead.

**Cause 4 (no trap guard): generation freely rolls unrecoverable lots.** `auctions.ts` rolls
per-part condition with zero correlation check between the resulting bill and the car's clean
value. Value-trap lots are not rare edge cases; at the local-yard tier (shitboxes - the only tier
a new player can afford) they are the bulk of the board. The new player's first flip is
disproportionately likely to be a trap, which is precisely the aborted playtest.

**Full restoration is also a loss** - this is not a "stopped repairing too early" problem. Taking
this car all the way to mint costs Y336,800 and yields a guide value of ~Y154,700: roughly
Y190,000 in the red, with fine (the best stopping point) still ~Y150,000 in the red.

## What the rebuilt economy must guarantee (the laws - seeds of `docs/design/economy-bible.md`)

The maintainer's requirement, promoted to the economy's first law: **it should be very rare for
the player not to profit by repairing a car to a better state.** The rebuilt system enforces
that by construction, not by tuning luck:

- **Law 1 (repair margin):** the marginal value returned per repair yen is >= 1 at every
  reachable state of every car (first-pass 1.2 - buyers discount a bill by MORE than the bill;
  the hassle premium is the flipper's edge). No zone anywhere with slope < 1. (Sprint 54.)
- **Law 2 (no value traps):** every car the game generates must satisfy
  `worstCaseBill <= maxBillFraction x cleanValue` (first-pass 0.7), so buy-at-reserve plus
  full-restore plus sell-at-guide clears a positive margin on every generatable lot. Enforced at
  generation AND as a closed-form invariant over the whole roster. (Sprint 54, checked forever
  by Sprint 55.)
- **Law 3 (proportionate parts):** parts and repair costs scale with the car's fitment class, and
  cross-class arbitrage is physically impossible (fitment-gated install), so "brake pads cost
  twice the car" cannot exist. (THIS sprint.)
- **Law 4 (one ledger, derived):** every yen number in the game is either a named anchor in one
  content sheet or derived from one; cross-price coherence is machine-checked, not vibes.
  (Sprint 55.)

Deliberate anti-realism, stated openly in the bible: in 1995 reality a worn-out kei car IS a
write-off. The game's fantasy is profitable restoration; the economy serves the fantasy.

## Confirmed current state (code discovery, 2026-07-14)

- Value model: `packages/sim/src/marketValue.ts` (two-slope deduction, floor at
  `bands.scrapValueFraction x cleanValue`, lines 81-100; `marketValueYen` lines 159-171).
- Repair/bill atoms: `packages/sim/src/bands.ts:88-165` (`costToMintYen`, `costToValuationYen`;
  `restoration.repairStepFraction` = 0.1). `restoration.partsCostFactorByTier` no longer exists
  anywhere - Sprint 44 reverted Sprint 41's tier scaling ("a part's repair price is intrinsic to
  the part") to kill donor-car repair arbitrage.
- Prices: `packages/content/data/parts.json` (flat; e.g. tyres stock Y22,000, brakePadsDiscs
  stock Y8,000), `parts-taxonomy.json` (`stockReplacementPriceYen` mirrors the stock row - an
  enforced integrity test; tyres/brakePadsDiscs/clutch are `repairable: false`).
- Roster: `cars.json` - shitbox 180k-220k, common 650k, uncommon 1.1M-1.8M, rare 3.2M-4.2M book.
- Acquisition: reserve = `0.5 x guideValue` (`bidding.ts:84-113`); no generation-time bill/value
  guard (`auctions.ts:266-326`).
- Sale: walk-ins price at `marketValueYen x taste [0.88, 1.12] x offerSpread [0.82, 1.12]`
  (`selling.ts`, `valuation.ts`).
- Job payouts derive from task costs (`deriveServiceJobPayoutYen`, margin 1.4-1.65 + callout fee,
  `serviceJobs.ts:392-401`) so they inherit whatever parts pricing does.
- Install gating: `installFitGate` already exists (slot fitment, customer-part protection) - the
  natural home for a class gate.

## Reuse analysis (directive 16)

**New mechanisms:**

- The expanded parts catalog: every part slot exists as REAL per-class SKUs (4 fitment classes
  x 4 quality grades = 16 store entries per component slot), each a first-class content entry
  with its own identity and name (maintainer direction 2026-07-14: real parts, not a display
  trick).
- The centralised parts pricing sheet (maintainer direction 2026-07-14): every SKU's price
  resolves as `base cost per part type x class factor x grade factor x global factor`, with a
  sparse per-SKU manual override map that wins outright - so a whole-market rebalance is a few
  factor edits and a single-SKU fix is one override line.
- One new clause in the existing install gate (a part SKU fits only its own class of car).
- Two parts-store fitment controls: a "Fits this vehicle" picker and a plain class slicer.
- `docs/design/economy-bible.md` (a new canonical design doc, sibling of progression-bible.md).

**Existing mechanisms to reuse (the whole point of the design):**

- Today's 119-part catalog is the CALIBRATION source, not 470 hand-typed prices: per-part base
  costs are extracted from its stock rows and the grade factors fitted from its existing grade
  ratios - the current data already follows ~1.0 / 1.3 / 2.0 / 2.8 almost exactly (brake pads
  8/10/16/22k, tyres 22/29/44/62k), so resolved family-class prices land where today's prices
  are, by construction. `stockReplacementPriceYen` stops being a hand-maintained mirror and
  derives from the car-class stock SKU (the old mirror-integrity test becomes structural).
- The Zod content pipeline, the Sprint 49 market screen structure, and the naming layer
  (parody brands per SKU, per the licensing law) all carry the expansion unchanged.
- `costToMintYen`/`costToValuationYen` (bands.ts) are untouched formulas - they already price off
  the part's own price, so class-priced SKUs flow through bills, repair charges, and service-job
  payout derivation (Sprint 29) with zero formula changes.
- `installFitGate` (Sprint 33/35) gains one clause (class must match) instead of a new gate.
- Sprint 44's anti-arbitrage objection is RESOLVED, not re-litigated: the repair price stays
  intrinsic to the part (bench = on-car, no host-car term); arbitrage dies because a kei-class
  part physically cannot install on a sports car, not because of a price factor bolted onto
  repair.
- Save migration: the standard Dexie bump + golden-save pattern (v27 -> v28).

## Decisions

1. **`docs/design/economy-bible.md` becomes canonical** for economy laws (GDD stays canonical for
   mechanics). Contents: the four laws above, the diagnosis (condensed from this doc), the anchor
   inventory (which numbers are hand-authored anchors vs derived - full audit lands Sprint 55),
   and the deliberate anti-realism statement.
2. **Fitment classes = the four roster tiers** (`shitbox`/`common`/`uncommon`/`rare`) for v1 -
   zero mapping burden, every car already carries its tier. Player-facing copy uses diegetic
   names from content (first-pass: "kei & compact", "family", "sports", "grand touring") - raw
   tier ids never reach the UI (Sprint 25 display-name law).
3. **Real SKUs (maintainer direction, 2026-07-14).** Every component slot ships 16 real
   catalog entries: 4 fitment classes x 4 grades (e.g. "Kei OEM stock block", "Family OEM
   stock block", ... plus branded street/sport/race variants per class). Exactly 4 of the 16
   fit any given car. A SKU's IDENTITY (id, slot, class, grade, display name, parody brand) is
   hand-authored content; its PRICE resolves from the pricing sheet in decision 4 - which is
   precisely what makes the store balanceable as a whole.
4. **The centralised pricing sheet (maintainer direction, 2026-07-14: rebalancing all part
   costs must amount to changing a few multiplication factors).** New content,
   `partPricing.json`:
   - `baseCostYen` per part type (~27 numbers, extracted from today's stock rows: brakePadsDiscs
     8,000, tyres 22,000, ...);
   - `classFactors` `{shitbox: 0.25, common: 1.0, uncommon: 1.6, rare: 2.5}`;
   - `gradeFactors` `{stock: 1.0, street: 1.3, sport: 2.0, race: 2.8}` (fitted from today's
     catalog, which already follows these ratios within a few percent);
   - `globalFactor` (1.0 - the one-knob whole-market lever);
   - `overrides`: a sparse `skuId -> priceYen` map that wins outright over the formula (ships
     EMPTY; every entry is a deliberate maintainer decision);
   - resolved price = `round-to-100(base x class x grade x global)`, computed once at content
     load, Zod-validated, so `Part.priceYen` reaches sim and game exactly as today.
   The tuning grammar this buys: "all parts too expensive" = `globalFactor`; "brake pads too
   expensive" = one `baseCostYen` entry; "kei parts too cheap" = one class factor; "race parts
   too cheap" = one grade factor; "family pistons specifically wrong" = one override line.
   Sprint 55's coherence report lists every active override and flags any that drifts far from
   its derived price, so the override list can never silently rot. First-pass sanity (all-poor
   mint-ref bill ~Y366,400 at family prices): shitbox ~Y91,600 vs ~Y155k ceiling (0.59), common
   ~Y366,400 vs ~Y585k (0.63), uncommon ~Y586,200 vs Y0.99-1.62M (0.36-0.59), rare ~Y916,000 vs
   Y2.88-3.78M (0.24-0.32) - all under Law 2's 0.7 for realistic rolls. (All-scrap rolls still
   violate it; that is Sprint 54's generation guard, deliberately not this sprint.) Item 6's
   literal complaint dies here: kei brake pads become ~Y2,000 against a Y50-155k car.
5. **Fitment in the sim and the store.** A `PartInstance`'s SKU now carries its class (one
   lookup helper exposes it); `installFitGate` refuses a class mismatch (sim-side, so no UI
   path around it) and the Replace drawer filters candidates to the car's class (UI-side),
   exactly the Sprint 35 customer-part pattern. The parts market gains two controls
   (maintainer-specified): a **"Fits this vehicle"** picker (choose one of your cars; the
   catalog narrows to its class, and to its empty/failing slots where slot context exists) and
   a plain **class slicer** (kei & compact / family / sports / grand touring). Cart lines and
   inventory rows name the class.
6. **Migration (Dexie v27 -> v28):** every existing owned/installed `PartInstance` remaps its
   part id to the matching class SKU - installed parts take their host car's class; loose
   inventory parts take the class of the car they were pulled from when known
   (`customerJobId` cars, recorded pulls), else `common`. Golden-save test in the same change.
7. **Bots:** `investor.ts` (and any bot buying parts) passes the target car's class when buying -
   the existing slot-precise purchase call gains one argument. Fire-and-let-the-resolver-refuse
   stays the contract everywhere else.
8. **Value model untouched this sprint.** The two-slope model and the 0.05 floor stay until
   Sprint 54 - one system per sprint, cleanly attributable harness shifts. Disclosed expected
   effect of this sprint alone: cheap-car bills shrink ~4x (the Honda's guide value would already
   climb off the floor to ~Y65,000), rare-car bills grow 2.5x, service-job payouts on cheap
   customer cars shrink proportionally (margin unchanged), days-to-`local` may shift and is
   disclosed against the p50=13 baseline.

## Tasks

**Claude:**

1. Write `docs/design/economy-bible.md` (laws, diagnosis, anchor inventory v1, anti-realism
   statement, the class factor table with its worked sanity numbers).
2. Content: the fitment-class enum + diegetic display names; the ~470-SKU identity catalog;
   `partPricing.json` (base costs extracted from today's stock rows, the fitted grade factors,
   class factors, `globalFactor`, an empty `overrides` map) with price resolution at content
   load; schema updates + content tests (every slot has all 16 SKUs; the formula multiplies
   correctly; an override wins outright; rounding; `stockReplacementPriceYen` derives per
   class; resolved family-class prices match today's catalog, with any deliberate deviation
   listed in the Exit).
3. Sim: the class lookup on `PartInstance` SKUs; `installFitGate` class clause; bill/repair/
   payout flow-through verified by tests (a kei bill is ~0.25x a family bill for the same
   damage).
4. Game: the "Fits this vehicle" picker + class slicer in the parts market; cart/inventory
   class labels; Replace-drawer class filter; store view updates.
5. Save: Dexie v27 -> v28 migration + golden-save test.
6. Bots: class-aware part purchases; run the full balance harness; disclose all shifts
   (days-to-`local` against p50=13, bill/value ratios, bot cash curves).
7. Hygiene: CLAUDE.md narrative, this doc's Exit, TODO.md check.

**User-only (maintainer):**

1. ~~Sign off the arc direction~~ **Approved 2026-07-14**, with the explicit refinement that
   class pricing ships as real per-class SKUs (16 per component slot), never a runtime price
   switch, plus the two store filters. (This amends Sprint 44's flat-catalog decision, with its
   anti-arbitrage rationale honored via the install gate.)
2. Review the four laws' first-pass constants (slope 1.2, maxBillFraction 0.7) and the pricing
   sheet's first-pass factors (class 0.25/1.0/1.6/2.5, grade 1.0/1.3/2.0/2.8).
3. Review the diegetic class names and the SKU naming convention (class + parody brand + grade)
   before they reach UI copy.

## Definition of done

- The economy bible exists and is referenced by CLAUDE.md as canonical for economy laws.
- Every component slot has 16 real, named store SKUs; exactly 4 fit any given car; the store
  can filter to "fits this vehicle" and by class.
- Every SKU price resolves from the pricing sheet: changing one base cost, class factor, grade
  factor, or the global factor moves every affected SKU (proven by test); a per-SKU override
  wins outright; overrides ship empty.
- The same damage on a kei car and a grand tourer produces bills ~10x apart; brake pads on a kei
  car cost ~Y2,000, not Y16,000-2x-the-car.
- No cross-class part install is possible, sim-side or UI-side; bench repair still prices
  identically to on-car repair (Sprint 44's law preserved).
- Dexie v28 migration + golden-save test green; full gate green; balance harness run with every
  shift disclosed honestly (no force-passed numbers).

## Exit

Implemented as designed. `docs/design/economy-bible.md` created as the canonical economy-law
document (Laws 1-2 designed, pending Sprint 54; Law 3 implemented this sprint; Law 4 designed,
pending Sprint 55).

**Content layer:** `packages/content/src/partFitment.ts` (new) - `PartFitmentClassSchema`
(shitbox/common/uncommon/rare), diegetic display names (Kei & Compact/Family/Sports/Grand
Touring), `fitmentClassForTier`. `packages/content/src/partPricing.ts` (new) -
`PartPricingSheetSchema` + `resolvePartPriceYen` (override, else
`round100(baseCost x classFactor x gradeFactor x globalFactor)`). `packages/content/data/
partPricing.json` (new) - `baseCostYen` extracted from the pre-Sprint-53 catalog's 29 stock
prices, `classFactors` {shitbox:0.25, common:1.0, uncommon:1.6, rare:2.5}, `gradeFactors`
{stock:1.0, street:1.3, sport:2.0, race:2.8} (fitted to the old catalog's own ratios),
`globalFactor:1.0`, `overrides:{}`. `packages/content/data/parts.json` expanded 116 -> 464
entries (4 fitment classes x 4 grades x 29 part types) - the original 116 ids are kept
UNCHANGED as the `common` class (preserves every historical save-migration fixture/test; their
prices already sit at the class-1.0 baseline), with 348 new class-prefixed SKUs generated from
them (e.g. `shitbox-stock-block`) sharing identical brand/name/grade - the class label is a
UI-time prefix (`partFitmentClassLabel`), never baked into the identity string.
`packages/content/src/part.ts` split into `PartCatalogEntrySchema` (raw, identity-only, no
price) and `PartSchema` (resolved, adds `priceYen`) + `resolvePartsCatalog`.
`packages/content/src/carPart.ts` split into `CarPartTaxonomyEntryContentSchema` (raw, no
price) and `CarPartTaxonomyEntrySchema` (adds `stockReplacementPriceYenByClass`, derived from
the resolved catalog's own stock SKUs, never hand-authored). `packages/content/src/data.ts`
wires the two-stage resolution at content-load time. Content tests updated (schemas.test.ts,
integrity.test.ts, naming.test.ts) plus two new permanent guards: every real car part has
exactly 16 SKUs (4 classes x 4 grades), and every fitment class has a real display name.

**Sim layer:** `packages/sim/src/parts.ts`'s `partFitsCar` gained the class-match clause - the
one choke point already used by `installFitGate`, the game store's Replace-drawer predicates,
and every bot's part-purchase filter, so all of them became fitment-aware for free, with zero
changes needed in `investor.ts`/`serviceJobHelpers.ts`/`bandHelpers.ts`. `packages/sim/src/
bands.ts`: `costToMintYen`/`costToValuationYen`/`scrapValueYen` gained an explicit
`fitmentClass` parameter (the installed part's own class for scrap/non-repairable branches);
`carCostToMintYen`/`groupCostToMintYen`/`carValuationBillYen`/`costWeightedBandFactor` derive
the car's class internally from `model.tier` for their missing-slot branches - zero external
callers needed changes. `packages/sim/src/context.ts`'s `stockPartByCarPartId` became
class-nested (`Record<PartFitmentClass, Record<CarPartId, Part>>`). `packages/sim/src/
auctions.ts`'s `stockInstanceFor`/`generateAuctionCarInstance` and `serviceJobs.ts`'s
`forceTasksOutstanding` and `jobs.ts`'s `resolveRemovePart` all derive the host car's class
once and fill/revert slots at that class's stock SKU.

**Game layer:** `PartsMarketScreen.vue` gained the two maintainer-specified filters - a plain
class slicer and a "Fits this vehicle" picker (choosing an owned car sets the class filter to
that car's own class); every part row, cart line, and the browse-everything "no-fit" dimming
now factor in class alongside the pre-existing platform-tag check. `gameStore.ts` gained
`fitmentClassLabel`. `PartCard.vue` (the shared inventory-row/Replace-drawer component) shows
each part's class in its meta line - covering both the standalone inventory screen and the
Replace drawer in one place, per the existing shared-component pattern.

**Save:** `SAVE_VERSION` 27 -> 28. NOT the pure-additive case (no new `GameState` field) -
`migrateV27ToV28` remaps every real `CarInstance` population's installed parts (owned cars,
auction lots, active/offered service-job cars) from their implicit pre-Sprint-53 `common`-class
id to the sibling SKU at their own model's real fitment class (same carPartId+grade), plus
customer-tagged loose inventory parts whose service job is still active (remapped to that job
car's class). Untagged loose parts and `pendingPartOrders` are left alone (no recoverable host
car - the correct "else common" default, which they already are). Four new golden-save tests
cover: a shitbox car's stock part remapping, a rare-tier customer-tagged part remapping, an
untagged loose part staying put, and the plain `SAVE_VERSION` regression trip-wire.

**Verification:** full gate green - `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm
format`, `pnpm test:coverage` (986 tests passed, coverage 91.27%/81.55%/92.12%/95.14%
stmts/branch/func/line, all above the gated floor), `pnpm build`. Test fallout from the new
fitment-class rule was substantial but mechanical: ~30 test fixtures across both packages
constructed a catalog part via `PARTS.find(...)` with no class filter (resolving to the
`common`-class sibling by array order) and installed it onto a `shitbox`-tier fixture car
(`honda-city-e-aa`, this codebase's default dev-grant/test model) - each fixed by adding the
matching `fitmentClass` filter or swapping to the class-prefixed id. Two golden-master hashes
in `advanceDay.test.ts` re-pinned (`9a900aae`, was `4e6c8a68`; `63d7048c`, was `ab316a54`) -
both from the real, intended catalog/pricing rebase (464 entries replacing 116, fitment-scaled
prices), not a logic bug; every other assertion in that file (job completion, determinism,
slot-level outcomes) passes unchanged against the same scripted careers.

Balance harness (`pnpm balance:run` then `python -m balance.cli check`): all hard-gated
invariants pass. **Days-to-`local` p50 = 12.0 days (915/1000 seeds)**, against the [10,35]
hard-gated band and Sprint 52's disclosed p50=13.0 baseline - a mild improvement, not a
retune, consistent with this sprint's own disclosed expectation ("days-to-local may shift and
is disclosed against the p50=13 baseline"). Buyout share 0.0%, Passive Grinder solvency
Y1,220,000, sanity floor clear across every strategy (lowest: investor Y782,638). Full
`report.md` regenerated and committed. The value-model laws (repair margin >= 1, no value
traps) are Sprint 54 scope - this sprint deliberately left `marketValue.ts`'s two-slope
formula and 0.05 floor untouched, so the Honda-City-style value trap the playtest hit is
NOT yet fixed; only the "brake pads cost twice the car" structural cause (Law 3) is resolved
here. Fitment-class pricing on its own already narrows cheap-car bills substantially (a
shitbox's flat-catalog ~Y366,400 all-poor mint-reference bill becomes ~Y91,600 at the 0.25x
class factor), but the floor/slope regression from Sprint 47 remains until Sprint 54 lands.
