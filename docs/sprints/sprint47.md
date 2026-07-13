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

(filled at completion)
