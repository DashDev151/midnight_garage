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

Not started.
