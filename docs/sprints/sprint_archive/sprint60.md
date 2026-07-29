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

Implemented and committed.

**The one-line value change (decision 1).** `marketValueYen` is now `baseValue +
round(foundationFactor(car) x installedPartsValueYen)` (`marketValue.ts`) - the base term
(clean value minus the restoration bill) is byte-for-byte untouched, so Law 1 holds structurally
and the entire repair economy is unchanged. `foundationFactor` is a new pure function over the
car's own bands/missing state - the factor of the single WORST foundational part, exported from
sim.

**The content anchor (decision 2).** `valuation.foundation` in `economy.json`: `parts` =
[tyres, brakePadsDiscs, brakeCalipersLines, steering, chassis, underbody]; `factorByState` =
{missing 0.10, scrap 0.15, poor 0.45, worn 1.0, fine 1.0, mint 1.0}. The schema enforces the law
structurally: every factor is clamped to [0, 1] (`.min(0).max(1)`) and the table must be
monotonic non-decreasing (a `.refine`), so the law can only ever WITHHOLD premium, never inflate
it, and a worse state can never withhold less than a better one. First-pass numbers, maintainer
tuning bait. The `schemas.test.ts` content assertion covers the new block; the top-level
anchor-audit test is unaffected (`foundation` nests under the existing `valuation` key).

**The probes (decision 3).** `valueModelProbes.test.ts` gains the foundation-law describe block:
(a) the maintainer's verbatim kei-truck build - a shitbox bought at reserve, fitted with real
shitbox-class race engine/turbo/cosmetics SKUs at full catalog price while the brakes, tyres and
underbody stay scrap - loses money end to end even when sold at FULL guide value (the most
generous case); (a') the SAME build with sound foundations instead is worth strictly more, by the
released premium, proving the loss is the foundation gate and not a blanket "aftermarket never
pays" rule; (e) the coherence probe car (all-scrap STOCK) carries zero premium, asserted
directly, so Law 5 cannot move any coherence figure. Probe (b) (repairing the foundation releases
the premium, the marginal-return law) and (c) (the no-inflation ceiling) live in
`marketValue.test.ts`'s new `foundationFactor`/`marketValueYen`-scaling describe blocks (6 pure
`foundationFactor` unit tests plus 3 integration tests: full premium on sound foundations,
withheld premium on a scrap brake, released premium on repair). Probe (d) (Sprint 59's
unimproved-flip band) is the unchanged flip probe, still green - a generated lot's stock parts
carry no premium for the factor to scale, so it is inert on every generatable car by
construction.

**The surfacing (decision 4).** `CarDetailScreen.vue`'s Finances panel gains a warning line
(`data-test="foundation-warning"`), rendered only when a bad foundation is actually withholding
premium: it names the failing foundational parts (via the existing `carPartLabel` lookup) and the
withheld yen, in shop-owner words ("No buyer pays for the extras while the basics are shot - sort
the X first."). Backed by a new `CarDetail.foundationWarning` store field computed from the same
`foundationFactor`/`installedPartsValueYen` the price itself uses, so the panel and the price can
never disagree. Two component tests (warning names the brakes and shows a positive withheld
figure on a real premium+scrap-brake car; no warning when the foundations are sound). No auction-
card change - the grade trio and `R` flag already carry the pre-bid read (decision 4).

**The bible amendment (decision 5).** Law 5 recorded in `economy-bible.md` (the "four laws"
section becomes five, with a full litmus and the maintainer's worked example), the anchor
inventory row extended, and a dated amendment-log entry added - the recorded maintainer approval
Law 5's own amendment rule requires (this sprint doc's approval constitutes it).

**Bots (decision 6).** No bot installs aftermarket parts, so every harness career's cars carry
zero premium and the factor is inert across the entire run - the balance harness output
(`report.md`, the invariant check) is byte-for-byte identical to Sprint 59's, disclosed as such
rather than presented as a fresh result. This is the cleanest possible confirmation that Law 5
touches only the premium term and nothing in the base economy.

**Verification.** Full gate green: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`
(two touched files auto-formatted), `pnpm test:coverage` (1051 tests, 79 files; coverage
91.31%/82.10%/92.40%/95.25%, all above the ratchet floor), `pnpm build`. Balance harness re-run:
all 9 hard gates pass, days-to-`local` p50=12 (identical to Sprint 59), and every disclosed
figure - including the coherence table's Law 1/2/3 numbers - matches Sprint 59's exactly, proving
zero economic drift outside the premium term. No golden-master hash moved (the scripted careers
use generated all-stock cars, zero premium, so the factor is inert on them too).

**Definition of done, checked against the sprint doc:**
- The verbatim kei-truck build loses money, probe-enforced; foundational repair releases the
  premium; ceiling and flip-band probes still green - yes.
- Law 5 recorded in `economy-bible.md`; anchors audited; coherence table unchanged (proven
  byte-identical) - yes.
- Full gate green; harness hard gates pass; Exit discloses the numbers - yes.
