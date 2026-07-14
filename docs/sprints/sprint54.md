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

Implemented as designed. `docs/design/economy-bible.md` updated: Laws 1 and 2 now marked
implemented (Law 3 landed Sprint 53; Law 4 remains Sprint 55 scope).

**Content:** `packages/content/src/economy.ts`/`economy.json`: `valuation.mintGapWeight`,
`valuationPremiumNear`, `valuationPremiumFar`, `valuationPremiumThresholdFraction` all deleted;
replaced by one field, `valuation.marketRepairDiscount` (1.2, schema-enforced `.min(1)` - Law 1
as a structural constraint, not just a convention). `partsGeneration.maxBillFraction` (0.7,
`.positive().max(1)`) added - the generation-time ceiling Law 2 enforces.

**Sim:** `packages/sim/src/bands.ts` - `costToValuationYen` and `carValuationBillYen` deleted
outright (the fine-referenced bill retires; `carCostToMintYen`, already used for the
player-facing "restoration bill," is now also the ONLY bill the market prices against).
`packages/sim/src/marketValue.ts` - `instanceBaseValueYen` rewritten to the one-slope formula
(`max(floor, cleanValue - marketRepairDiscount * billToMintYen)`); at `billToMintYen = 0` this
returns exactly `cleanValue`, so the no-inflation ceiling is structural, not clamped.
`packages/sim/src/auctions.ts` - `generateAuctionCarInstance` now runs every rolled car through
a new `enforceMaxBillFraction` guard before returning: up to 4 bounded passes lift every part at
the car's current worst band by one step (band damage is the common trap cause), and only if
still over budget once everything is mint does a fallback pass fill genuinely-missing slots
(rare, and only actually needed when missing slots themselves are what's driving the bill) - both
passes are pure functions of the already-rolled car, so determinism per seed is unaffected. Both
`auctions.ts`'s own catalog generation and `serviceJobs.ts`'s customer-car rolling share this one
function, so the guard covers both call sites for free (task 2), with zero changes needed to
`serviceJobs.ts` itself.

**Game:** zero functional changes, confirmed rather than assumed - `gameStore.ts`'s
`restorationBillYen`/`totalBillYen` already read `carCostToMintYen` and `guideValueYen` already
reads `carGuideValueYen` (which wraps `marketValueYen`), both with unchanged signatures; no
HelpHint copy referenced the retired two-slope wording, so no copy edit was needed either.

**Tests:** `packages/sim/tests/valueModelProbes.test.ts` gained the four acceptance-probe
families from decision 5 - the Honda City probe (the exact playtest scenario: an all-poor
shitbox, bought at reserve, triage-repaired exactly as played, asserting guide value rises by
>= marketRepairDiscount x every step's own cost and profit never regresses), a full-restore
probe per roster tier (the worst generatable roll for each of shitbox/common/uncommon/rare,
fully restored and sold at guide, must clear a positive margin - proven mathematically in the
sprint's own design work to hold with real margin: `0.5*cleanValue - 0.4*billYen >= 0.22*cleanValue`
at the worst permitted bill), a no-free-lunch probe (buying at full guide with no repair can't
expect to profit via the real walk-in channel), and a ceiling probe (an all-stock-mint car
prices at exactly its clean value, never above; a restored high-mileage car stays below a
restored low-mileage one). A fifth new test asserts the scrap-value floor never actually binds
on any of the ~300 generated lots this sprint's probes sample across the whole roster (Law 2's
own guarantee, checked directly against the unclamped formula, not inferred from output). One
real bug caught by the Honda City probe during its own construction: the test's first fixture
used `testFixtures.ts`'s `uniformCarParts` helper, which is pinned to `common`-class stock parts
regardless of the model passed in - fine for this file's other (rare-tier) probes, but silently
wrong for a shitbox-tier car, since a `common`-class bill is ~4x too expensive for it and pinned
the probe's own guide value to the scrap floor before any repair math ran. Fixed with a small
local `uniformClassedCarParts` helper that resolves stock parts at the MODEL's own fitment
class - the exact class-mismatch failure mode Sprint 53 fixed everywhere else, caught here by
the probe itself doing its job.

Existing Sprint 47 tests (`marketValue.test.ts`) rewritten in place for the one-slope formula
(no behavior change to what they test, only the formula they check against); the pre-existing
"backstop floor" test kept (a hand-built, Law-2-bypassing fixture still needs the floor to
exist as a genuine backstop) with its own doc comment clarifying that a real generated lot can
never reach it.

**Verification:** full gate green - `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm
format`, `pnpm test:coverage` (996 tests passed, coverage 91.18%/81.48%/92.12%/95.09%
stmts/branch/func/line, all above the gated floor), `pnpm build`. One golden-master hash
re-pinned (`packages/sim/tests/advanceDay.test.ts`'s acquisition-and-sale-path career,
`63d7048c` -> `2ec1f080`) - the real, intended effect of rewriting the value formula on a
generation-driven career with no hand-fixed part fixture to insulate it; the file's own
scripted-30-day-career hash was unaffected (that career apparently never exercises enough
value-formula-dependent paths to shift).

Balance harness (`pnpm balance:run` then `python -m balance.cli check`): all hard-gated
invariants pass. **Days-to-`local` p50 = 12.0 days (940/1000 seeds)** - unchanged from Sprint
53's own p50=12.0, though more seeds now reach it within the horizon (940 vs 915) - no retune
needed. Buyout share 0.0%, Passive Grinder solvency Y1,220,000 (unchanged, it never trades),
sanity floor clear across every strategy. The disclosed cash-curve shift this sprint's own
design work anticipated is real and in the expected direction: **Handyman's day-100 median cash
moved from below Passive Grinder (Y1,086,811 in Sprint 53's report) to above it
(Y1,281,496)** - the repair-focused bot now genuinely profits from repairing, which is exactly
the loop this sprint exists to fix. Cautious Restorer (also repair-heavy) rose from Y977,146 to
Y1,064,228, though it still sits below Passive Grinder. Flipper rose slightly (Y1,317,295 ->
Y1,331,581). `report.md` regenerated and committed with these figures. Law 4 (the full
machine-checked global coherence audit) remains Sprint 55 scope, as designed.
