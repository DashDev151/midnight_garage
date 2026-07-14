# Sprint 54 - Economy Rebuild 2 of 3: the value law (repair is always worth more than it costs)

**Source:** playtest 2026-07-14 item 9 (`docs/playtest-notes-2026-07-14.md`); second sprint of
the Economy Rebuild arc. Sprint 53 made repair costs proportionate to the car; this sprint makes
repair VALUE exceed repair cost everywhere, kills the dead zone, and stops the auction from
generating unrecoverable lots. Depends on Sprint 53 (class-scaled bills) - without it the value
law cannot hold on cheap cars because their real spend exceeds their ceiling.

## Confirmed current state (code discovery, 2026-07-14)

- `marketValue.ts:81-100`: two-slope deduction (`valuationPremiumNear` 1.15 below
  `0.5 x cleanValue` of bill, `valuationPremiumFar` 0.4 above it) clamped to a floor of
  `bands.scrapValueFraction (0.05) x cleanValue`. The far slope is a structural 60%-loss zone;
  the floor is a Sprint 47 regression (was `floorFraction` 0.22, per Sprint 44's deliberate
  tune). Full diagnosis in `sprint53.md`.
- Two DIFFERENT bills exist: the player sees `carCostToMintYen` (mint-referenced) as "restoration
  bill", but the market prices against `carValuationBillYen` (fine-referenced, mint gap at half
  weight via `valuation.mintGapWeight` 0.5) - a number never shown to the player.
- `auctions.ts:266-326`: per-part condition rolls with no bill-vs-value guard of any kind.
- Sprint 47 shipped two deterministic acceptance probes ("sane flip", "salvage flip") - the
  pattern to reuse and extend.
- The Finances panel computes `projectedProfit = guideValue - totalSpent`
  (`CarDetailScreen.vue:238-242`) - correct as-is once guide value obeys Law 1; no UI change
  needed.

## Reuse analysis (directive 16)

**New mechanisms:**

- A generation-time bill guard (one clamp step inside the existing condition-roll chain).
- The Honda City playtest-regression probe (new test, existing probe pattern).

**Existing mechanisms to reuse:**

- `marketValueYen`'s shape stays `cleanValue - discount(bill)` with a floor - only the discount
  function simplifies (two slopes + threshold -> one slope) and the reference bill unifies. All
  callers (reserve, buyout, walk-ins, bots, Finances panel) are already wired to it and need
  zero changes.
- `carCostToMintYen` becomes THE bill - `carValuationBillYen`'s separate fine-referenced formula
  retires, deleting a player-visible inconsistency for free (the number on the Finances panel
  becomes exactly the number the market prices, a Legibility & Trust win).
- The Sprint 47 acceptance-probe pattern, the golden-hash re-pin workflow, the balance harness.
- Sprint 34's generation chain: the guard is one more step in it, seeded and deterministic, not a
  new generator.

## Decisions

1. **One slope, always above 1.** `marketValueYen = max(floor, cleanValue -
   marketRepairDiscount x billToMintYen)` with `valuation.marketRepairDiscount` = 1.2 (content,
   tuning bait). Every repair yen returns Y1.20 of guide value at every reachable state - Law 1
   by construction. `valuationPremiumNear`/`Far`/`ThresholdFraction`/`mintGapWeight` are deleted
   from content and code. **The ceiling is structural (maintainer requirement, 2026-07-14):**
   the 1.2 multiplies the DISCOUNT while damaged, never a bonus on top - at bill = 0 the
   formula returns exactly `cleanValue`, so a fully restored car can never be worth more than
   the identical clean car, and a restored high-mileage car stays below a low-mileage one (the
   mileage factor lives inside `cleanValue` and survives restoration). The only thing above
   clean value remains deliberate aftermarket upgrades (`installedPartsValueYen`, Sprint 32,
   unchanged).
2. **One bill.** The valuation bill IS `carCostToMintYen` (mint-referenced, consumables
   included). The displayed "restoration bill remaining" and the market's discount input become
   the same number. `costToValuationYen` and its `mintGapWeight` retire.
3. **The floor is demoted to scrap disposal.** `bands.scrapValueFraction x cleanValue` remains
   as the backstop, but Law 2 guarantees no generated car ever sits on it - enforced by a new
   invariant test asserting zero floor-bound lots across seeded generation sweeps. The floor
   stops being a load-bearing pricing mechanism and goes back to being what its name says.
4. **Generation guard (Law 2).** After the existing per-part roll, if
   `billToMintYen > valuation.maxBillFraction (0.7, content) x cleanValue`, the roll is softened
   deterministically (worst parts lifted one band at a time, seeded order) until it fits. Every
   generatable lot is profitably restorable; deep-damage lots stay cheap (guide value small) but
   never traps. The rejected alternative, recorded: explicitly-labeled unrestorable "parts car"
   lots sold at scrap value as deliberate content - deferred (would need per-part harvesting
   economics to mean anything; candidate for IDEAS.md post-launch).
5. **Acceptance probes (deterministic, permanent):**
   - **The Honda City probe** - the playtest scenario as a regression test: generate the
     worst-permitted all-poor shitbox, buy at reserve, perform the exact triage play (consumable
     replacement + a few poor-to-worn repairs); assert guide value rises by >= 1.2x the spend at
     every step and projected profit stays positive. This is the test that would have caught
     both the Sprint 47 floor regression and the far-slope zone.
   - **Full-restore probe per tier:** worst generatable roll, full mint restore, sell at guide;
     assert flip margin positive for every roster tier.
   - **No-free-lunch probe:** buy at guide, sell immediately; assert expected outcome is
     break-even-or-worse (the profit engine is the acquisition discount plus repair margin, not
     a money pump).
   - **Ceiling probe (the no-inflation guarantee):** fully restoring any car (no aftermarket
     parts) yields guide value exactly equal to its clean value, never above; and a restored
     high-mileage example asserts below a clean low-mileage example of the same model.
   - Worked expectation for the Honda (class factor 0.25, discount 1.2): all-poor bill ~Y91,600,
     guide ~Y44,800, reserve ~Y22,400; the playtest's Y20-45k triage play now RAISES projected
     profit with every step (~+Y27k mid-triage); full mint restore nets ~+Y36k. Same car, same
     playtest actions: -Y41,133 becomes a functioning game.
6. **Golden hashes re-pin** (value changes touch nearly every derived number) after confirming
   the change is the intended economics shift, not accidental behavior drift; full harness run
   with all shifts disclosed. Days-to-`local` (p50=13 baseline) will move - service-job payouts
   already shifted in Sprint 53 and cheap-flip profitability now changes the competent-policy
   route; any band retune is a maintainer decision, not a silent adjustment.

## Tasks

**Claude:**

1. Sim: the one-slope model + unified bill in `marketValue.ts`/`bands.ts`; delete the retired
   knobs from code and content; update every touched test.
2. Sim: the generation guard in `auctions.ts` (+ walk-in/service-job customer car generation if
   they share the roll chain - verify and cover both).
3. Tests: the three probe families above; the zero-floor-bound-lots invariant; golden re-pins.
4. Game: no functional UI change expected (Finances panel and auction cards read derived
   numbers); verify copy like "restoration bill" still matches what is priced, adjust HelpHint
   copy if the unified bill changes any wording.
5. Balance harness: full run; disclose days-to-`local`, steal-share, bot cash curves; flag (not
   force) anything out of band for the maintainer.
6. Hygiene: economy-bible updated to "implemented" status for Laws 1 and 2; CLAUDE.md; Exit.

**User-only (maintainer):**

1. Approve `marketRepairDiscount` 1.2 and `maxBillFraction` 0.7 first-pass values (or supply
   preferred ones) before the harness tune.
2. Decide the days-to-`local` band if the harness shows the invariant needs a retune (same
   protocol as the Sprint 29 [15,35] -> [10,35] decision).
3. Playtest the same Honda-City-style flip end to end - the arc's real acceptance test.

## Definition of done

- Repairing any car to a better state raises its guide value by more than the spend, at every
  step, on every generatable car - proven by deterministic probes, not asserted.
- The playtest scenario (buy cheap shitbox at reserve, triage-repair it) shows a positive and
  growing projected profit in the Finances panel.
- The displayed restoration bill is the exact number the market prices against.
- No generated lot is floor-bound or bill-trapped; full gate + harness green with honest
  disclosure.

## Exit

Not started.
