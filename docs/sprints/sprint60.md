# Sprint 60 - The foundation law: no value for chrome on a deathtrap (economy-bible law 5)

**Source:** playtest 2026-07-14 pass 2, item 18 (CRITICAL), graduating the "LARGE ECONOMY
ADJUSTMENT" TODO entry captured 2026-07-14 pass 1 into a designed system. The maintainer's
framing: a hierarchy of needs for cars - if foundational things are broken, it must not
matter how many fancy parts are bolted on. His verbatim example: a cheap kei truck with
stock, barely-working brakes and a peeling, rusted body, fitted with a race turbo, a race
engine, and expensive cosmetics - under the current formula that build profits; in reality
it "should lose the player a bunch of money."

## Confirmed current state (code discovery, 2026-07-14)

- `marketValueYen = base + installedPartsValueYen`, where base =
  `cleanValue x mileage x heat - 1.2 x billToMint` (floored) and the aftermarket premium is
  added **purely additively, part by part** (`marketValue.ts:79-93, 121-138`) - a part's
  contribution never depends on any other part's condition.
- The only joint mechanism is buyer taste, hard-bounded to +/-12% (`valuation.tasteSpread`),
  nowhere near a five-figure race install. No sale-eligibility gate exists anywhere.
- `computeRosterCoherence`'s probe car is all-scrap STOCK (zero premium), so the coherence
  table's arithmetic never touches the premium term (`coherence.ts:107-159`).

## Reuse analysis (directive 16)

**New mechanisms:** one pure function (`foundationFactor(car)`), one content block
(`valuation.foundation`), one economy-bible law (Law 5), new probe families.

**Existing mechanisms to reuse:** `installedPartsValueYen` has a single call site inside
`marketValueYen` - the factor multiplies there and nowhere else; condition bands and the
missing-part state are the inputs; the auction grade's `R` structural-defect flag already
singles these cars out visually (no auction change needed); the Finances panel carries the
player surfacing; Sprint 55's anchor-audit table and content-integrity test absorb the new
keys; the probe-suite pattern carries the acceptance tests.

## Decisions

1. **The hierarchy gates the premium, never the repairs.** `marketValueYen` becomes
   `base + foundationFactor(car) x installedPartsValueYen`. The base term already prices
   broken foundations through the bill; the exploit was only ever the additive premium.
   Because the repair slope is untouched, economy-bible Law 1 (every repair yen returns
   more than itself) holds structurally - and repairing a failing foundational part now
   returns MORE than the 1.2 slope, because it also releases the withheld premium. That is
   the hierarchy of needs expressed as maths: foundations first, then the toys count.
2. **Worst part governs.** `foundationFactor` = the factor of the single worst foundational
   part (one deathtrap element poisons the whole build - an average would let chrome buy
   back trust). Content block (first-pass, all tuning bait, schema-clamped to [0,1] and
   monotonic):
   - `valuation.foundation.parts`: `tyres`, `brakePadsDiscs`, `brakeCalipersLines`,
     `steering`, `chassis`, `underbody`
   - `valuation.foundation.factorByWorstState`: missing 0.10, scrap 0.15, poor 0.45,
     worn-or-better 1.0
3. **The kei truck becomes a canonical probe.** New probe families: (a) the maintainer's
   verbatim build (race engine + turbo + cosmetics on scrap brakes / rusted body) loses
   money end to end - buy, install, sell; (b) repairing the failing foundational part
   recovers the premium (the marginal-return probe); (c) the no-inflation ceiling still
   binds; (d) Sprint 59's unimproved-flip band still passes (generated lots carry stock
   parts, which have no premium, so the factor is inert on them by construction - assert
   it); (e) the coherence table is arithmetically unchanged (all-scrap-stock probe car has
   zero premium - assert it).
4. **Surfacing is diegetic and lives on the car page.** When the factor is below 1, the
   Finances/value area names the failing parts and withholds the premium visibly, in
   shop-owner words ("No buyer pays for the extras while it can't stop straight - sort the
   tyres and brakes first."). No new auction-card element (the grade trio and `R` flag
   already carry the pre-bid read).
5. **Economy-bible amendment.** Law 5 (the foundation law) recorded with the maintainer
   decision and date; the new anchors join the audit table, which is already machine-checked
   against `economy.json`'s key set.
6. **Bots:** no bot deliberately installs aftermarket on scrap-foundation cars; the harness
   run discloses any drift (standing rule: disclosed shifts, not regressions).

## Tasks

**Claude:**

1. Sim: `foundationFactor` + the one-line `marketValueYen` change; exports; unit tests.
2. Content: `valuation.foundation` block + schema (clamps, monotonicity refine) + integrity
   test extension; economy-bible Law 5 text + anchor rows.
3. Game: the Finances-panel withheld-premium line + failing-part naming; component test.
4. Probes: the five families in decision 3.
5. Full gate; balance harness + invariant check (after Sprint 59's constants, so the two
   land as one coherent economy); disclose numbers in the Exit.

**User-only (maintainer):**

- Approving this sprint doc constitutes the recorded approval Law 5's bible amendment
  requires. Review the factor table's first-pass numbers.

## Definition of done

- The verbatim kei-truck build loses money, probe-enforced; foundational repair releases the
  premium; ceiling and flip-band probes still green.
- Law 5 recorded in `economy-bible.md`; anchors audited; coherence table unchanged.
- Full gate green; harness hard gates pass; Exit discloses the numbers.

## Exit

Not started.
