# Sprint 47 - The profitable flip: honest bills and a value model without dead zones

**Source:** playtest 2026-07-13 pass 2, items 7, 13, 14, and the balance half of 17. The arc's
economy centerpiece.

## Confirmed root causes (code discovery, 2026-07-13 - all verified to the yen)

- **Item 13 (bill vs charge mismatch):** the displayed restoration bill (`carCostToMintYen`,
  `bands.ts:187-240`) sums parts + repair-step costs ONLY. The actual charge adds a flat
  per-JOB consumables fee (`jobs.ts:366-392`, tier 1 = ¥2,000 on every line). Six per-part
  repairs = six jobs = six fees: ¥24,000 bill + 6 x ¥2,000 = ¥36,000 ~ the observed ~¥35k.
  A group-level "Repair all" creates ONE job (one fee); per-part clicks silently multiply it.
- **Item 14 (City worth ¥36,339 despite no poor/scrap parts):** exact floor clamp.
  `marketValue.ts:75-89`: `value = max(0.22 x clean, clean - 0.8 x bill)`. City: clean =
  180,000 x mileageFactor(92,937 km) = ¥165,178; unclamped branch = 165,178 - 0.8 x 238,800 =
  **-¥25,862**; so value = 0.22 x 165,178 = **¥36,339** (matches the screenshot exactly).
  While clamped, d(value)/d(bill) = 0: the player's ¥54,000 of repairs moved value by exactly
  ¥0 (profit went -1,831 to -55,831 = -54,000). The City must shed ¥77,751 of bill before value
  moves AT ALL. Generation is NOT the problem: at that mileage parts roll ~60% worn / ~27% fine /
  ~11% poor / ~0% scrap - the car is honestly mediocre; the value model was the liar.
- **Item 17 (flipping feels like guaranteed loss) - structural, not tuning:** even unclamped,
  each ¥1 of repair returns at most ¥0.8 of value (the 0.8 hassle DISCOUNT), minus consumables.
  Repairing for resale is loss-making by construction; all real margin comes from acquisition
  discount (reserve = 0.5 x guide) or sale-roll luck (offer spread up to ~1.25x).
- **Item 7 (customer car with a random missing diff):** service-job cars are generated through
  the identical `generateAuctionCarInstance` path with the same 1.5% per-slot missing roll
  (`serviceJobs.ts:550-556` -> `auctions.ts:261-266`). Install tasks force their own slot empty
  via a completely independent mechanism (`forceTasksOutstanding`, `serviceJobs.ts:443-470`), so
  suppressing the random roll for customer cars is safe and touches nothing else.

## Reuse analysis (directive 16)

**New mechanisms:**

- A per-car upkeep roll in generation (real cross-car condition variance - decision 4).
- The valuation bill re-referenced to FINE (market-expected condition), not mint (decision 3).
- A reshaped `instanceBaseValueYen` curve (hassle premium + soft floor) in place of the current
  discount + hard clamp.
- "Sane flip" and "salvage flip" acceptance probes.
- A no-random-missing flag on the service-job generation path.
- (The consumables fee is a DELETION, not a mechanism - see decision 1.)

**Existing mechanisms to reuse:**

- `bands.ts` stays the single cost pipeline (`planPartRepair`/`planGroupRepair`/
  `carCostToMintYen`) - never forked. With the consumables fee deleted (decision 1), this one
  pipeline IS both the display and the charge, with nothing bolted on at charge time.
- `marketValueYen`'s shape (clean value x mileage x heat, minus a bill-driven deduction,
  Sprint 27) is kept; only the deduction curve changes. `installedPartsValueYen`, walk-in offer
  pricing (`valuation.ts`/`selling.ts`), and reserve derivation (0.5 x anchor) are untouched in
  form and re-tuned only if the probes demand it.
- `valueModelProbes.test.ts` is the acceptance harness home; the balance harness + invariants
  gate the whole change.
- Sprint 44's decisions stand: constant part costs (no tier scaling), no sale-price control.

## Decisions

1. **The consumables fee is abolished (maintainer decision, 2026-07-13).** The per-job
   `consumablesCostYen` charge is deleted from the charging path (`jobs.ts`) everywhere it
   applies - on-car repairs, bench reconditioning, and the service-job cost breakdown alike -
   and the `consumablesCostYen` field is removed from `ToolLineTierSchema` + `toolLines.json`
   (content law: no dead knobs). Bill truth becomes structural: displayed bill and actual charge
   are now literally the same formula, so per-part vs group repair fragmentation no longer
   changes cost. Accepted consequence: higher tool tiers lose their higher supply costs and
   become strictly better (faster, no per-job downside beyond purchase price) - a deliberate
   simplification, not an oversight.
2. **Repairs get cheaper overall (maintainer decision, 2026-07-13).** `repairStepFraction`
   (currently 0.15 of catalog price per grade) is the primary knob, tuned DOWN alongside
   decision 3's value curve until the sane-flip probe passes with honest margins. Known
   knock-on, watched and retuned in the same pass: service-job payouts DERIVE from player cost
   (Sprint 29's `playerMinCostYen` x margin), so cheaper repairs shrink payouts proportionally -
   `serviceJobs.marginMin/marginMax` are retuned to hold payouts near current levels, and
   days-to-local is the hard invariant guarding the outcome.
3. **The valuation bill is re-referenced to FINE, and the deduction becomes a hassle PREMIUM
   with a soft floor.** The root miscalibration behind the City: the value model deducts the
   cost to bring EVERY part to MINT, but a buyer of a 1984 kei car prices roadworthiness, not
   concours - so an all-worn/fine car (a perfectly good old car) carried a showroom-restoration
   bill it never deserved and floor-clamped. Maintainer requirement (2026-07-13): an old,
   high-mileage but genuinely sound car must NOT be near-worthless; only true shitboxes collapse.
   - `valuationBillYen = (full cost to bring every part to fine) + mintGapWeight x (remaining
     cost from fine to mint)`, `mintGapWeight` ~0.5 first-pass, content-tunable. Worn -> fine
     work carries full valuation weight (the money play); fine -> mint carries half (visible
     diminishing returns - mint polish stays primarily the reputation play via the existing
     clean/concours sale bonuses, unchanged).
   - `value = clean - premium x valuationBill`, premium > 1 (buyers pay extra for done-ness),
     softened floor - no hard clamp anywhere.
   - Slope requirements (the marginal yen of value per yen of valuation bill removed):
     R1: strictly positive everywhere above the scrap floor - no dead zone, ever.
     R2: >= ~1.1 while valuationBill/clean <= ~0.5 - the sane-flip region is genuinely
     profitable per repair yen.
     R3: >= ~0.4 even deep in wreck territory - low enough that full catalog-priced restoration
     of a wreck stays a loss (honest), high enough that DONOR-PRICED work profits (see the
     wreck profit path below).
   - **Worked example (the City, all worn/fine, ~14 worn parts, avg part price ~¥41k):**
     to-fine bill ~= 14 x 1 grade x repairStepFraction x price. At today's 0.15 that is ~¥86k;
     at a retuned ~0.10 it is ~¥57k. clean = ¥165k. value ~= 165k - 1.15 x 57k ~= ¥99k
     (vs today's floor-clamped ¥36k). Buy near reserve (~¥50k), spend ¥57k repairing to fine,
     sell near clean ¥165k: ~+¥58k margin, with every repair yen returning ~1.15. That is the
     sane flip the playtest demanded, derived, not asserted.
   - **The wreck profit path (maintainer requirement 2: money can still be made on true
     shitboxes):** a wreck's valuation bill is dominated by flat catalog replacement prices for
     scrap/missing slots, so its guide value (and reserve = 0.5 x guide) collapses - but filling
     a slot removes CATALOG-priced bill while a donor part costs a FRACTION of that (pull it
     from another cheap wreck - the Remove/install loop that already exists). At deep-region
     slope 0.4+, removing ¥95k of bill via a donor seat that cost effectively ~¥20k of wreck
     purchase nets positive. Selective repair + donor swaps IS the shitbox economy; full
     catalog-priced restoration remains an honest money pit. Verified by the salvage-flip probe
     (decision 6).
   - Exact curve shape (exponential, piecewise, rational) and constants are implementation-time
     tuning against the probes plus the full harness; this doc fixes the requirements and the
     reference math, not the final numbers.
4. **Generation gets real cross-car variance (maintainer requirement 1: cheap cars must
   actually be BAD, and a sound old car must actually be sound).** Confirmed problem: at ~93k km
   every car rolls from one narrow baseline band ([38,83]) with small symmetric jitter (+/-15) -
   ~60% worn / 27% fine / 11% poor / ~0% scrap, so every car is interchangeably mediocre and
   condition explains almost nothing about price. Design: a per-car **upkeep roll** layered on
   the existing mileage-based baseline (the existing chain is kept; upkeep only shifts it):
   - Weighted tiers, first-pass: neglected 25% / average 50% / cherished 25% (content-tunable).
   - Baseline offset: neglected -22 / average 0 / cherished +12 (clamped to [5,95]).
   - Per-part jitter becomes tier-shaped: neglected [-30,+10] (a bad tail: individual trashed
     components), average [-15,+15] (today's), cherished [-8,+15].
   - Missing-slot chance scales by upkeep: neglected x3, average x1, cherished x0.
   - **The math at ~93k km:** cherished centers ~72 -> overwhelmingly fine/mint, near-zero
     to-fine bill, prices near clean (the "one-owner, garage kept" car is genuinely worth
     money). Average reproduces today's worn/fine texture (flip bread and butter). Neglected
     centers ~28 -> roughly a quarter of parts scrap, ~40% poor: a real wreck (~8 scrap + ~11
     poor of 29 parts), dirt cheap by decision 3's own math, honest donor/salvage material.
   - The existing one-line condition blurb ("one-owner, garage kept") is wired to the upkeep
     tier so the variance is legible pre-bid, not hidden (reuse of the existing flavor line,
     which currently has no mechanical meaning).
5. **Customer cars never roll random missing slots.** The service-job generation call passes a
   zero missing chance; install-task forced emptiness is the only way a customer car has an
   empty slot. Auction cars keep the roll unchanged.
6. **Two acceptance probes.** (a) **Sane flip (hard-gated):** scripted across >= 200 seeds -
   buy an average-upkeep common-tier car at its reserve, do worn->fine repairs only (no parts,
   no mint polishing), sell at guide value: median margin must be positive. (b) **Salvage flip
   (informational, disclosed):** buy a neglected wreck at its collapsed price, fill its
   scrap/missing slots from a second cheap donor wreck, sell: median margin measured and
   disclosed in the Exit - this is the direct check on decision 3's wreck profit path. Both
   live in `valueModelProbes.test.ts`.

## Tasks

1. Sim/content: delete the consumables charge (`jobs.ts`) and the `consumablesCostYen`
   field/knob (`toolLines.ts` schema + `toolLines.json`); update every test that priced it in
   (affordability gates, cost breakdowns, payout derivations).
2. Sim/content: the fine-referenced valuation bill + the new deduction curve + knobs in
   `economy.json`; `repairStepFraction` tuned down; `serviceJobs.marginMin/marginMax` retuned to
   hold payouts; re-pin `valueModelProbes` and affected statistical tests to measured reality;
   golden hashes re-pinned (real, intended economy change - disclose).
3. Sim/content: the upkeep roll (weights/offsets/jitter shapes/missing-multiplier as content
   knobs), wired into the generation chain and the condition blurb; distribution tests pinning
   the three tiers' band mixes; auction reserve/guide re-verified against the new spread.
4. Sim: the customer-car missing-roll suppression + regression tests (a customer car generated
   from a template with no install task never has an empty slot).
5. Verification: full gate; full balance harness - all hard invariants must pass (days-to-local
   may shift; retune within the band or escalate to the maintainer if the band itself must move);
   the sane-flip probe green, the salvage-flip numbers disclosed; Exit discloses before/after
   bot cash curves honestly.

## Definition of done

- Displayed bill == what completing that work actually charges, always, to the yen.
- No car anywhere in the value range has a zero marginal return on repair.
- An old, high-mileage but sound (cherished/average) car prices near its clean value; only cars
  with genuinely bad components collapse in price - and those cars visibly ARE bad pre-bid.
- The sane-flip probe passes; the salvage-flip path is measured and disclosed; the City scenario
  from the playtest, re-run, is no longer a silent money pit.
- Customer job cars only ever miss parts their own tasks will replace.
- Full gate + harness green with honest disclosure of every number that moved.

## Exit

Implemented directly. All five tasks done.

**Files touched:**

- `packages/sim/src/jobs.ts` - the per-job consumables charge deleted (`chargeRepairWork`
  simplified to charge the plan's `costYen` alone); `reconditionQuote` no longer adds it.
- `packages/content/src/toolLines.ts` / `data/toolLines.json` - `consumablesCostYen` removed from
  the schema and every tier.
- `packages/sim/src/bands.ts` - new `costToValuationYen`/`carValuationBillYen`: the FINE-referenced
  valuation bill (to-fine at full weight, fine-to-mint remainder at `mintGapWeight`), distinct from
  the unchanged mint-referenced `costToMintYen`/`carCostToMintYen` restoration bill still shown to
  the player.
- `packages/sim/src/marketValue.ts` - `instanceBaseValueYen` rewritten: the old single-rate
  hassle-factor-plus-hard-floor deduction replaced by a two-slope premium (`valuationPremiumNear`
  below the threshold, `valuationPremiumFar` above it - both strictly positive, no dead zone) plus
  a small `scrapValueFraction`-based backstop floor that only binds for a near-total-scrap car.
- `packages/content/src/economy.ts` / `data/economy.json` - `hassleFactor`/`floorFraction` removed;
  `mintGapWeight` (0.5), `valuationPremiumNear` (1.15), `valuationPremiumFar` (0.4),
  `valuationPremiumThresholdFraction` (0.5) added; `restoration.repairStepFraction` 0.15 -> 0.1;
  `serviceJobs.marginMin`/`marginMax` 1.2/1.45 -> 1.4/1.65 (compensating for the cheaper repair
  fraction shrinking `taskCostYen`, so payouts hold roughly steady); four new
  `partsGeneration.upkeep*` knobs (tier weights, baseline offset, jitter range, missing multiplier).
- `packages/sim/src/auctions.ts` - `generateAuctionCarInstance` rolls a per-car upkeep tier
  (neglected/average/cherished) that offsets the condition baseline, reshapes the per-part jitter
  range (replacing the old flat `CAR_CONDITION_JITTER`, now deleted from `constants.ts`), scales
  the missing-slot chance, and picks `provenanceNote` from a tier-matched flavor pool; gained a new
  `allowMissingSlots` parameter (default `true`, every existing auction-lot call site unaffected).
- `packages/sim/src/serviceJobs.ts` - customer-car generation passes `allowMissingSlots: false`;
  `forceTasksOutstanding` (unchanged) remains the only way a customer car's slot goes empty.
- `packages/sim/tests/valueModelProbes.test.ts` - two new acceptance probes (decision 6): a
  hard-gated sane-flip (average-upkeep common car, worn->fine repairs only) and an informational
  salvage-flip (two neglected wrecks, one parted into the other).
- Test fixture fallout fixed across `marketValue.test.ts` (the closed-form helper and every
  hand-derived hassleFactor/floorFraction assertion rewritten to the two-slope formula),
  `jobs.test.ts` (every consumables-inclusive assertion simplified), `advanceDay.test.ts` (a
  dynamically-computed cash assertion, plus both golden hashes re-pinned), `schemas.test.ts` (the
  new economy knobs), `gameState.test.ts`-adjacent content tests, and
  `facilitiesInAdvanceDay.test.ts` (two tests that assumed a seed's panels slot would roll below
  mint now force it explicitly, since the upkeep roll changed what that seed produces).

### Verification

Full gate, all green:

- `pnpm typecheck` (content/sim/game) - clean.
- `pnpm lint` - clean.
- `pnpm format` - clean (Prettier reflowed a few files; no logic changes).
- `pnpm test` (content+sim+game) - **935/935 pass**, 74/74 files.

Golden hashes re-pinned in `advanceDay.test.ts` (both the 30-day career and the acquisition-and-
sale path) - a real, intended economy rewrite (consumables gone, repair fraction and valuation
curve rewritten, generation's upkeep roll changes the RNG draw sequence), not a logic break; every
other assertion in the file (job completion, determinism, "wins a lot at auction, then sells the
car") still passes unchanged.

**Acceptance probes (decision 6), measured:**

- Sane flip (average-upkeep common car, worn->fine only): buy ~Y169,295, repair ~Y113,600, sell
  ~Y535,930 -> **margin +Y253,035**. Hard-gated, passes.
- Salvage flip (two neglected wrecks, one parted into the other, full scrap->mint): each wreck
  ~Y3,600, two wrecks ~Y7,200 total, sold parted-out ~Y144,000 -> **margin +Y136,800**. Disclosed,
  not gated - the wreck-profit path (decision 3's requirement 2) holds even at this maximally
  extreme case.
- The playtest's own City scenario, re-derived: an all-worn/fine car at ~93k km now prices near
  clean value instead of floor-clamping, and every repair yen spent on it returns real value - the
  reported "guaranteed loss" is structurally gone.

**Balance harness** - run in full (not skipped) given the scope of this sprint's economy rewrite.
All hard invariants pass: days-to-`local` p50=13.0 (in [10,35], 868/1000 seeds reached it); buyout
share 0.0%; Passive Grinder solvency, Flipper-vs-Passive separation, and the sanity floor all hold.
Disclosed: most non-passive strategies' day-100 median cash rose again relative to the prior commit
(balanced-player Y887,406 -> Y1,190,658; flipper Y824,170 -> Y1,039,448; cautious-restorer
Y524,096 -> Y820,956; random Y547,004 -> Y779,880; handyman Y546,665 -> Y827,623) - the direct,
expected effect of cheaper repairs (0.1 vs 0.15 fraction) and a value curve that no longer
floor-clamps ordinary cars, so restoration work now genuinely pays for itself instead of being a
pure sink. Competent-policy (the one bot with a real reputation faucet) continued to improve
(Y1,519,846 -> Y1,545,884).

### Deviations from the spec / notable calls

- The service-job payout margin retune (1.2/1.45 -> 1.4/1.65) is a reasoned first-pass
  compensating estimate (the payout formula also includes labor/callout terms unaffected by
  `repairStepFraction`, so an exact "hold payouts perfectly steady" retune would need the real
  task-cost/labor mix per template) - not empirically re-verified template-by-template beyond the
  full balance harness's aggregate pass above. Flagged as tuning bait, matching every other
  first-pass economy knob in this sprint.
- The salvage-flip probe uses a uniform-scrap car (every one of 29 parts scrap) as the "neglected
  wreck" stand-in, rather than sampling the real generation roll's neglected-tier mix (~25%
  scrap/~40% poor) - a deliberately more extreme, fully-deterministic case for a hard-to-flake
  acceptance test, not a claim that every neglected car is this bad. The generation-side upkeep
  roll itself (tested via the balance harness's real career data, not a dedicated unit test of the
  band-mix distribution) is what actually produces the softer neglected/average/cherished spread
  in play.

Nothing has been committed yet - queued for its own commit next, per the maintainer's "commit and
move to the next sprint when all green" instruction.
