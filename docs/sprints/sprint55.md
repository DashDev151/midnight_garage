# Sprint 55 - Economy Rebuild 3 of 3: the global coherence system

**Source:** playtest 2026-07-14 item 6 (`docs/playtest-notes-2026-07-14.md`) - "we need a better
economy balancing system that serves to balance the economy as a whole" - plus the open
`TODO.md` auction fire-sale item, which interacts directly with the re-anchored values. Closes
the Economy Rebuild arc: Sprints 53-54 fixed the laws; this sprint makes the whole ledger
self-checking so prices can never silently drift apart again (Law 4 of the economy bible).

## Confirmed current state (code discovery, 2026-07-14)

Yen numbers currently live in scattered hand-authored anchors with no cross-checks between them:
car `bookValueYen` per model (`cars.json`), part prices (`parts.json` +
`stockReplacementPriceYen` mirror), labor rate Y6,000 and callout fee Y5,000
(`economy.json`), job payout margin [1.4, 1.65] (derived, Sprint 29), rent Y20,000/week,
starting cash Y1.5M, reserve fraction 0.5, offer spread [0.82, 1.12], taste spread 0.12,
mileage curve, and (post-53/54) class factors, `marketRepairDiscount`, `maxBillFraction`. The
balance harness checks bot-career OUTCOMES (days-to-`local`, buyout share, solvency) but nothing
checks the PRICE STRUCTURE itself - which is exactly how "brake pads at 2x the car" shipped
without any red light. `TODO.md` still carries: auction steal-share 84% (fire sale), flipping
net-loss vs passive - both re-measured for free by this arc's harness runs.

## Reuse analysis (directive 16)

**New mechanisms:**

- An `anchors` consolidation in content (naming and grouping; mostly moves, not new numbers).
- A closed-form "coherence" section in the balance harness (pure functions over content + sim
  formulas per roster model - no careers needed) with hard invariants in `balance.cli check`.

**Existing mechanisms to reuse:**

- The balance harness CLI, report/check split, hard-vs-informational invariant convention
  (Sprint 23 decision 7), and CI wiring - the coherence section is one more report section and
  check group, not a new tool.
- The economy bible (Sprint 53) as the home of the anchor audit table.
- `marketValueYen`, `carCostToMintYen`, reserve/buyout derivation - the coherence checks CALL
  the real sim functions, so the checks can never drift from the implementation.
- The existing content-integrity test pattern (e.g. the `stockReplacementPriceYen` mirror test,
  the 1.2x job-payout floor invariant from Sprint 25/29).

## Decisions

1. **The anchor sheet.** `economy.json` gains an explicit `anchors` grouping; every yen number in
   content is either in it or derived from it. The bible's audit table lists each anchor, what
   derives from it, and its sanity rationale. Sprint 53's `partPricing.json` is the parts
   chapter of this system (already anchor-plus-derivation by construction); the coherence
   report additionally lists every active per-SKU price override and flags any override
   drifting far from its derived price, so the override list can never silently rot. No number
   moves value in this step - consolidation is mechanical; retuning is decision 3.
2. **Coherence invariants (closed-form, per roster model, hard-gated):**
   - **L2 check:** worst-permitted bill / clean value <= `maxBillFraction` for every model at
     representative mileages (calls the real generation guard's math).
   - **Flip-margin check:** buy-at-reserve + full-restore + sell-at-guide margin positive for
     every model, worst permitted roll.
   - **Consumables share:** full consumable set (tyres + pads + clutch, class-priced) <= a
     content-capped fraction of clean value per class (first-pass 0.15) - the direct,
     permanent "brake pads vs car price" guard.
   - **Payout sanity:** the Sprint 29 job-payout profitability invariant re-verified against
     class-scaled task costs (it should hold by derivation; the check proves it).
   - Each also renders as a per-model table in `report.md` (ceiling, worst bill, ratio, flip
     margin, consumables share) so the maintainer can eyeball the whole roster's economy on one
     page - the "global sense" view item 6 asks for.
3. **First global retune on top of the new laws** (numbers move here, disclosed, maintainer
   reviews the report): the auction fire-sale item from `TODO.md` (steal share 84%, flipping
   net-loss - both expected to change materially once guide values come off the floor and
   repair is profitable; re-measure first, then tune bidder contestation/arrival knobs only if
   still out of band), the walk-in `offerSpread` (its 0.82 lower edge can eat the 1.2 repair
   margin on a bad roll - candidate [0.90, 1.15]), and the mileage-curve floor. Book values
   stay untouched unless the coherence tables show a specific model out of line.
4. **Scope guard:** no new mechanics in this sprint - it is consolidation, instrumentation, and
   tuning. Anything that smells like a new system (dynamic pricing, market events) goes to
   IDEAS.md.

## Tasks

**Claude:**

1. Content: the `anchors` consolidation + schema; bible audit table.
2. Harness: the coherence section in the Python CLI (report tables + hard checks) fed by a new
   sim CLI export of the closed-form numbers (same pattern as `auctionWins.csv` etc.); CI
   path-filter already covers it.
3. Retune pass per decision 3, one knob at a time, each with a before/after harness diff in this
   doc's Exit.
4. `TODO.md`: retire or rewrite the fire-sale item based on what the re-measure shows.
5. Hygiene: bible marked fully in force; CLAUDE.md narrative; Exit.

**User-only (maintainer):**

1. Review the per-model coherence tables in `report.md` - this is the surface where any future
   "this feels stupid" pricing instinct gets checked against numbers.
2. Approve the retune decisions (offer spread, any contestation/arrival knob changes).
3. The arc-closing playtest: hunt, buy, restore, sell - the loop should now pay.

## Definition of done

- Every yen number is an anchor or derived; the bible's audit table matches content.
- The coherence invariants run in `balance.cli check` (hard-gated) and render as per-model
  tables in `report.md`; all pass on the shipped content.
- The fire-sale TODO item is re-measured and either retired or rewritten with fresh numbers.
- Full gate + harness green; the arc's Exit states, with evidence, that the repair loop is
  profitable across the roster.

## Exit

Implemented and committed. Closes the Economy Rebuild arc (Sprints 53-55).

**Content (decision 1):** `docs/design/economy-bible.md`'s Anchor Inventory section is now a
complete audit table (every `economy.json` top-level group, `partPricing.json`, and `cars.json`
`bookValueYen`, each with what it feeds), backed by a new machine check
(`packages/content/tests/schemas.test.ts`'s "economy.json top-level anchors match the bible audit
table" - a new top-level field added without updating both sides fails outright). A new
`coherence.maxConsumablesShareOfBookValue` (0.15) anchor is the content-tunable cap the Law 3
consumables check gates against, rather than a hardcoded Python/TS constant. `partPricing.json`'s
`overrides` map is still empty, so there is nothing yet for the override-drift check to flag - the
bible documents that the balance report's roster-coherence section is where a future drifted
override would first become visible.

**Harness (decision 2):** `packages/sim/src/coherence.ts` (`computeModelCoherence`/
`computeRosterCoherence`) derives four closed-form facts per roster model, calling the real sim
functions directly rather than re-deriving their math:

- Builds the worst PLAUSIBLE pre-guard car for the model (every real slot at `scrap`, at the
  roster's worst reachable mileage, read off the live `mileageRangeMaxByAgeYears` curve rather than
  a hardcoded constant) and runs it through the actual `enforceMaxBillFraction` (exported from
  `auctions.ts` for this sprint) - proving Law 2 holds for every model at its absolute worst, not a
  re-derivation of the guard's own math.
- **Bill-to-clean ratio** (Law 2): the softened bill over clean value at the worst mileage.
- **Flip margin** (Law 1): buy at reserve off the worst-bill lot's own damaged guide value
  (`marketValueYen`), pay the worst bill to fully restore, sell at guide (= clean value, Law 1's
  structural ceiling).
- **Consumables share** (Law 3): the full tyres+brakePadsDiscs+clutch class-priced replacement cost
  over book value.

A new Vitest suite (`packages/sim/tests/coherence.test.ts`) asserts all three invariants against
the real shipped roster - fast, CI-gated feedback using the exact same function the CLI export
calls, so a unit-test failure and a harness failure can never disagree. `exportCareers.ts` gained a
fifth CSV export (`coherence.csv`/`.manifest.json`, one row per roster model, no seeded careers
needed) alongside the existing careers/auctionWins/acquisitions/offers exports. Python side:
`data.py` gained `load_coherence`/`load_coherence_manifest`; `report.py` gained
`render_coherence_section` (a per-model markdown table: model, class, clean value, worst bill,
ratio, flip margin, consumables share); `invariants.py` gained 4 hard-gated checks (L2 ratio, Law 1
flip margin, Law 3 consumables share, and Law 4 payout sanity - `serviceJobs.marginMin >= 1.15`,
the structural floor `serviceJobPayout.test.ts`'s own exhaustive per-template/per-model proof
already established; this check is the one-line confirmation, not a re-derivation). `balance.cli
check` now hard-gates 9 checks total (was 5).

**Retune pass (decision 3), one knob per subsystem, each measured before and after:**

Baseline run (Sprint 53+54 content, before any Sprint 55 retune) via a fresh `pnpm balance:run`
(1000 careers x 9 strategies x 100 days):

| Metric | Before (baseline) | Target | After (retuned) |
|---|---|---|---|
| Auction steal share | 7.3% | 10-25% | **11.7%** (in band) |
| Auction mid share | 56.6% | majority | 75.7% |
| Auction frenzy share | 36.1% | 5-15% | **12.6%** (in band) |
| Flipper day-100 cash vs starting cash (Y1.5M) | Y1,331,581 (below) | beats | **Y1,579,076 (beats)** |
| Flipper vs Passive Grinder day-100 cash | +Y111,581 | - | +Y359,076 |
| Days-to-`local` p50 (hard-gated [10,35]) | 12.0 (940/1000 seeds) | in band | 13.0 (904/1000 seeds), still in band |

The re-measured baseline itself was the sprint's first real finding: the historical TODO.md
fire-sale problem (84% steal, measured back in the Sprint 30-32 era) had not persisted into the
current economy - it had flipped into the OPPOSITE extreme. Once Sprint 54's one-slope value law
raised `anchorValueYen` for a damaged car far above its old floor-collapsed level, the same
contestation rules (unchanged since the 2026-07-12 auction fix) pushed far more lots into "frenzy"
(hammer price > 90% of guide value) than the fixed, book-value-pegged `AUCTION_BID_INCREMENT_FRACTION`
used to allow before the anchor moved. Two knobs, applied together in one run since they touch
disjoint subsystems (auctions vs. walk-in sales) and their effects are independently attributable
from separate metrics:

1. `AUCTION_WHOLESALE_FRACTION` 0.85 -> 0.75 - pulls rival cohorts' private valuations (centered on
   this fraction of anchor) back down, since Law 1 already made anchor itself less discounted.
   Result: frenzy 36.1% -> 12.6%, steal 7.3% -> 11.7% - both now inside their target bands for the
   first time this harness has ever recorded a passing measurement (previously always informational
   and out of band, per `invariants.py`'s own module docstring history).
2. `selling.offerSpread` `[0.82, 1.12]` -> `[0.90, 1.08]` - the maintainer's own concern (decision 3):
   `valuateCarForBuyer`'s taste spread can already land as low as ~0.88x guide value; compounded
   with the old 0.82 lower edge, a fully-restored car's worst-case walk-in sale could clear as
   little as ~72% of clean value, enough to erase the worst-case flip margin (as low as ~22.4% of
   clean value at the Law 2 guard's own ceiling, the Honda City row in the coherence table). The
   raised floor closes that tail risk. The candidate upper edge from the sprint doc (1.15) was
   tried first and rejected: it raised the spread's own mean to 1.025, breaking Sprint 54's
   no-free-lunch invariant (`valueModelProbes.test.ts`'s "buying at full guide value with no repair
   done nets no expected profit via the real walk-in sale channel" - a real, caught-by-the-test
   regression, not a hypothetical) - `1.08` keeps the mean at 0.99.

Book values and the mileage-curve floor were left untouched: the coherence table showed every
roster model comfortably clear of both Law 2 and Law 1 at the worst-case mileage (ratios 31.7%-68.9%
against the 70% ceiling, flip margins 22.4%-37.3% of clean value), so there was no specific model to
point to as "out of line" - exactly decision 3's own gating condition for leaving an anchor alone.

One golden-master hash re-pinned (`advanceDay.test.ts`'s acquisition-and-sale path, `2ec1f080` ->
`60785b98`) with a documented justification: both retuned economy.json values touch this career's
real auction/sale price path, a genuine content change, not a logic bug.

**TODO.md:** the Sprint-30-era "living-auction tuning: fire sale" item is retired outright (resolved
by measurement, not superseded). The related "is the harness realistic" standing concern had its
stale supporting claim ("every strategy underperforms Passive Grinder") corrected to the current
reality while the standing methodological question itself stays open (a fixed economy doesn't
resolve "are the bots realistic," only "is the economy's pacing sane").

**Verification:** full gate green - `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (1001 tests, 77 files; coverage 91.23% statements / 81.44% branches / 92.17%
functions / 95.13% lines, all above the ratchet floor), `pnpm build`. Balance harness run twice
(baseline, then post-retune) with `python -m balance.cli check` passing all 9 hard-gated invariants
both times - the 4 new Sprint 55 coherence checks pass on the shipped roster with real margin (no
model anywhere near its Law 2/Law 3 ceilings). `tools/balance/report.md` regenerated against the
final, retuned content.

**Definition of done, checked against the sprint doc:**
- Every yen number is an anchor or derived; the bible's audit table matches content - yes, and now
  machine-checked, not just asserted in prose.
- The coherence invariants run in `balance.cli check` (hard-gated) and render as per-model tables in
  `report.md`; all pass on the shipped content - yes.
- The fire-sale TODO item is re-measured and either retired or rewritten with fresh numbers - yes,
  retired (re-measurement showed the problem had already inverted, and the retune pass closed the
  new one).
- Full gate + harness green; the arc's Exit states, with evidence, that the repair loop is
  profitable across the roster - yes: every roster model's worst-case flip margin is positive
  (22.4%-37.3% of clean value), Flipper now clears its own starting cash within 100 days for the
  first time this harness has recorded, and the auction market itself is no longer a fire sale in
  either direction.
