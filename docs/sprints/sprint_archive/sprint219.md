# Sprint 219: evidence-informed priors

**Status: CLOSED.** Amends section 1 of
`docs/design/systems/knowledge-and-diagnosis.md` (recorded there as
rulings-ledger item 13). Both probe (e) gates are green: the worst-case
scenario passes on the ordering alone, and the typical-car scenario closes on
the ruling as actually given (positive, clearly below deep, not super
profitable) rather than the lead's own earlier provisional 35-75% band, which
the measured 0.27 ratio missed and which is disclosed rather than gated. See
the Exit's task F for the final scoping and both closing measurements.

## The ruling

The prior for a hidden slot is informed by what is visible: a car whose visible
half is clean suggests its hidden half is too. Light flips must return better
than currently (positive), and clearly less than deep flips.

## The mechanic

`priorBand(slot)` gains an evidence term:

- `evidenceDelta = round(avgBandIndex(all born-verified + since-verified slots)
  - bandIndex(mileagePriorBand))`, clamped to [-1, +1].
- `priorBand = clamp(mileagePriorBand + provenanceModifier + evidenceDelta,
  poor, mint)`.
- One function, used by the player display AND `buyerKnowledgeViewOf` exactly as
  today: buyer and seller see the same visible half, so both guesses move
  together; no information leaks (the term reads only observable slots).

## Acceptance (probe (e) becomes a gate again, then split into two scenarios)

Original acceptance (superseded by the maintainer's own follow-up correction,
task D below - kept here for the record):

- Light flip yen-per-day: strictly positive.
- Light flip yen-per-day between 35% and 75% of deep flip yen-per-day at entry
  tier (initial band, behaviour-first, playtest-tuned).

**Corrected acceptance (2026-08-18 follow-up):** directive 22's own analysis
rule - never treat a worst-case constructed probe as a typical-case crisis -
applies to the probe itself, not only to the content it measures. Probe (e)
splits into two scenarios, both gated:

1. WORST-CASE car (`buildRoughProbeCar`, unchanged): light must stay BELOW
   deep, and nothing more. Losing here is correct behaviour - a wreck is what
   deep teardowns are for.
2. TYPICAL light-flip candidate (`buildTypicalProbeCar`, new): a
   generation-plausible mid-mileage entry car whose visible/born-verified half
   genuinely averages `fine`, one visible symptom with a cheap-to-mid true
   cause, and ordinary buried wear (a `fine`/`worn` mix, not worst-case).
   Light flip diagnoses and fixes the one fault, verifying only what that
   touches; deep flip opens and fixes everything. Gate, as FINALLY scoped
   (task F): light strictly positive AND strictly below deep - the ruling as
   given ("clearly below, not super profitable"), not the 35-75% figure
   above, which was only ever the lead's own first guess at what "clearly
   below" should mean numerically and is disclosed rather than gated.

## Tasks

- A. The evidence term in `knowledge.ts`; the design-doc amendment.
- B. Fallout per directive 17 (estimated chips, bills, probes, golden hashes
  move: priors shift for most generated cars).
- C. Probe (e) re-gated with the new band; measured numbers in the Exit.
- D. (2026-08-18 follow-up) Probe (e) reworked into the two scenarios above;
  `buildTypicalProbeCar` added; measured numbers for both in the Exit. If
  scenario 2 still fails on a genuinely typical car, that is reported as the
  real shortfall, not patched with an invented lever.
- E. (2026-08-18 second follow-up) `knowledgePriors.unverifiedHaircutByTier`
  entry/everyday 0 -> 1 (behaviour-first governance: value chosen and stated
  by felt behaviour, guard re-pinned in the same change), superseding
  sprint217.md's "small money buys little scrutiny" felt-behaviour statement.
  Both scenarios re-measured. If the ratio still lands outside [0.35, 0.75],
  that is reported and the sprint stops there - no second lever.
- F. (2026-08-18 final scoping) Scenario 2's gate becomes the ruling itself,
  hard-asserted: light strictly positive AND strictly below deep. The 35-75%
  figure was never more than the lead's own provisional number; the measured
  0.27 ratio satisfies the actual ruling and is disclosed in the probe's own
  comment rather than gated, alongside the per-slot-discount design-shape
  option task E's diagnosis left open. Close the sprint doc and archive it.
- `pnpm typecheck`; narrowest tests; one full suite (this ships right before a
  playtest).

## Exit

**Status: CLOSED.** Tasks A through F all DONE and green. Task C's original
single-scenario gate was superseded by a follow-up correction (task D) -
directive 22's never-treat-worst-case-as-typical rule applies to how the
PROBE itself is built, not only to the numbers it produces. Task D's rework
correctly diagnosed the worst-case scenario as passing (losing there is
correct) and found a real, structural gate failure on the new typical-car
scenario (light overshooting deep). Task E moved the one lever that failure
pointed at (`unverifiedHaircutByTier`), under behaviour-first governance,
which closed the specific gap it targeted but overshot the ratio the OTHER
way. Task F is the final scoping: the numeric 35-75% band was always the
lead's own provisional read of the actual ruling ("light flips positive,
clearly below deep, not super profitable"), and the measured 0.27 ratio
satisfies that ruling as given - so scenario 2's gate became the ruling
itself, hard-asserted, with the ratio disclosed rather than gated. Both
scenarios pass; every measurement pass and its numbers are on the record
below. `pnpm typecheck` clean across content/sim/game throughout.

### Task A - the evidence term

`evidenceDeltaFor` (`packages/sim/src/knowledge.ts`) reads
`car.verifiedSlots` fresh on every `priorBand` call - `round(avgBandIndex(all
verified slots' real installed bands) - bandIndex(mileagePriorBand))`,
clamped to `[-1, +1]`, added alongside the existing provenance modifier and
clamped `poor..mint` exactly as before. Zero evidence (no `verifiedSlots`, an
empty array, or every verified slot empty) reads as no adjustment, which
keeps every pre-existing `priorBand` test that never seeds `verifiedSlots`
passing unchanged. `priorBand` is still the single function both the player
display (`knowledgeViewOf`) and `buyerKnowledgeViewOf` route through, so both
move together automatically - verified directly by the `knowledgeViewOf` and
`buyerKnowledgeViewOf` test blocks, which exercise both through the same
`maskedKnowledgeView` masking loop untouched by this sprint.
`docs/design/systems/knowledge-and-diagnosis.md` section 1 carries the
amendment; rulings-ledger item 13 records the ruling and this sprint's own
probe (e) finding.

### Task B - fallout per directive 17

Two `packages/sim/tests/knowledge.test.ts` cases asserted a flat-prior band
that the evidence term now correctly moves - both diagnosed as case (a)
(stale assertions of the old, now-superseded behaviour), updated:

- `knowledgeViewOf > masks an unverified slot to priorBand, never the truth`:
  a car seeded via `seedVerifiedSlots` (every born-verified surface/tyres/rims
  slot mint) at 90,000 km read `'worn'` on mileage alone; the evidence term
  now lifts it to `'fine'`.
- `buyerKnowledgeViewOf > never marks a guess down past poor`: the fixture
  used `mintCarParts` (every born-verified slot still mint) at the worst
  mileage, which the evidence term would now lift off `'poor'`, defeating the
  test's own floor-check intent. Rebuilt on `uniformCarParts('poor')` so
  every verified slot matches the equally-poor mileage prior (zero evidence
  delta), isolating the floor behaviour the test actually checks.

Added a dedicated `priorBand evidence term (sprint219.md task A)` block (7
new tests): no evidence leaves the read untouched (undefined and empty-array
cases), a single clean/rough verified slot moves the guess exactly one band,
the +-1 clamp holds under an extreme spread, verifying more slots re-sharpens
the guess on a later call (fresh average, no snapshot), and an empty verified
slot contributes no evidence.

One golden-master hash moved: `advanceDay.test.ts`'s "reproduces an exact
state hash (deterministic acquisition->sale)" - the script's acquired car's
estimated bands (and so its sale offer) shift under the new prior. Re-derived
from a real run: `e9f2b288` to `31c2410c`, with a new dated paragraph
recording why, per the file's own running convention.

`gameStore.knowledge.test.ts` needed no changes - every assertion there
already reads `priorBand`/`estimatedBand` dynamically rather than asserting a
hardcoded band, so it moved with the mechanic automatically.

### Task C - probe (e) re-gated on the original single-scenario construction

First pass, before the maintainer's follow-up correction. Attempted the full
gate (light strictly positive, ratio in [0.35, 0.75]) as a real assertion on
`buildRoughProbeCar`'s worst-case construction alone. It failed - measured
light -5,743 yen/day vs deep +5,400 yen/day (ratio -1.06) - and the root
cause traced to that construction's own born-verified evidence being itself
near-poor on a worst-case car, diluting the one repaired slot's signal below
the rounding threshold. Superseded by task D below: the maintainer's own
diagnosis of THIS diagnosis was that the probe was measuring the wrong
thing - a worst-case car SHOULD lose a light flip, so the failure was
correctly attributed to the mechanic but wrongly framed as its shortfall.

### Task D - probe (e) reworked into two scenarios (2026-08-18 follow-up)

**Scenario 1 (worst case, `buildRoughProbeCar`, unchanged construction),
gate: light strictly below deep.** PASSES. Measured light -5,743 yen/day
(margin -14,446 over 2.52 days, 4 labour points) vs deep +5,400 yen/day
(margin +20,872 over 3.87 days, 112 labour points) - identical numbers to
task C's run, now correctly read as the mechanic behaving exactly as it
should: this car's visible half is itself near-poor, so the evidence term
rightly declines to lift the guess, and a light flip that leaves most of a
wreck unopened loses to an honest teardown. Losing here is the commitment
working, not a shortfall.

**Scenario 2 (typical car, `buildTypicalProbeCar`, new), gate: light
positive AND 35-75% of deep.** `packages/sim/src/balanceProbes.ts` gains
`buildTypicalProbeCar`: a mid-mileage (90,000 km) entry car whose
born-verified half (`defaultVerifiedSlots`) is genuinely `fine`, with typical
ambient wear on `TYPICAL_PROBE_WORN_PART_IDS` (half the suspension bolt-ons
plus exhaust/cooling/differential, at `worn`) and the design doc's own worked
example as the one findable fault (`smokes-on-startup`'s `gunked-breather`
cause on `intake`, explicitly "the cheapest engine rebuild you'll ever do"
per its own test copy). **Does NOT close.** Measured light 18,208 yen/day
(margin 45,796 over 2.52 days, 4 labour points) vs deep 14,526 yen/day
(margin 42,346 over 2.92 days, 36 labour points, 3,700 yen parts) - ratio
1.25 (wants light > 0, which holds, and ratio in [0.35, 0.75], which does
not: light EXCEEDS deep).

**Root cause, diagnosed rather than patched.** `lightSaleYen` and
`deepSaleYen` come out bit-for-bit identical at 91,388 yen. The evidence term
correctly reads this car's genuinely clean visible half and lifts the guess
for every still-hidden slot from the raw mileage prior (`worn` at 90,000 km)
up to `fine` - which is exactly `sensibleRepairTargetBand`, the same band
deep's own repair delivers. Once an unverified slot's masked guess already
equals the band a repair would reach, repairing it creates no incremental
sale value at all - and `unverifiedHaircutByTier.entry` is 0 (the one tier
with no further markdown for staying unverified), so nothing marks the guess
down below that true repaired band either. Deep still spends the real 3,700
yen and 36 labour points opening and fixing the car's ambient wear; light
spends nothing on those slots and sells for the identical price. Three
independently-approved facts compound: the evidence term's own +-1 reach, the
entry tier's zero unverified haircut, and the sensible repair target
happening to land exactly where evidence can reach. This is a genuine
typical-car finding, not a probe artefact (directive 22's worst-case warning
does not apply to this scenario - it is deliberately the typical one), and a
design-shape question - which of those three facts should give, and how -
rather than a value this sprint's scope authorises picking unilaterally.

**Superseded by task E below**, which moves the lever this diagnosis pointed
at rather than leaving the finding to sit unaddressed.

### Task E - the haircut lever, and its own measured overshoot (2026-08-18 second follow-up)

Task D's root cause named the specific gap: `unverifiedHaircutByTier.entry`
was 0, so an unverified slot's evidence-lifted guess could land exactly on
the band a repair would deliver, and repairing it then earned nothing at
sale. The lever that gap points at is `knowledgePriors.unverifiedHaircutByTier`
itself (already-approved shape, sprint217.md), reopened for a VALUE change
under the 2026-08-13 behaviour-first governance amendment: entry 0 -> 1,
everyday 0 -> 1 (enthusiast and flagship unchanged at 1 - every tier now
reads 1).

**Felt behaviour, recorded with the re-pin** (`packages/content/tests/
economyApprovalGate.test.ts`): no buyer pays the full guess for what you
would not show them; even small money discounts a shut bonnet by a band.
This SUPERSEDES sprint217.md's "small money buys little scrutiny" statement,
left in place there as the historical record of what shipped then, per this
file's own established convention for a superseded felt-behaviour claim (the
`stressCoefficient` re-pin, sprint136.md's third amendment). `economy.json`
re-hashed and the guard re-pinned in the same change.

**Both scenarios re-measured:**

- **Scenario 1 (worst case): still PASSES, bit-for-bit unchanged** - light
  -5,743 yen/day vs deep +5,400 yen/day. `unverifiedHaircutByTier` cannot
  push this car's guess any lower: `priorBand` already floors every
  unverified slot at `poor` here, and `unverifiedHaircutBand` floors at
  `poor` too, so the new haircut has nothing left to bite into.
- **Scenario 2 (typical car): still does NOT close, now UNDERSHOOTING.**
  Light fell to 3,850 yen/day (margin 9,683 over 2.52 days, 4 labour points,
  `lightSaleYen` 55,275 - down from 91,388); deep is unchanged at 14,526
  yen/day (`deepSaleYen` 91,388, since a fully verified car never reads the
  haircut). Ratio 0.27 (was 1.25), wants [0.35, 0.75].

**Root cause, diagnosed rather than chased with a further lever.** The
targeted gap DID close - `deepSaleYen` no longer equals `lightSaleYen` -
but the fix overshoots, because `unverifiedHaircutByTier` is a single
per-tier scalar with no per-slot term (the same shape limitation
`priorBand` itself already carries, per its own doc comment): it marks down
EVERY unverified slot a full band, not only the ones actually concealing
ambient wear. Of this car's roughly twenty still-hidden slots, only eight
(`TYPICAL_PROBE_WORN_PART_IDS`) are truly `worn`; the other twelve are truly
`fine`, honestly matched by the evidence-lifted guess, and now also get
marked down a full band purely for staying unverified - so the light flip's
sale price absorbs a bigger penalty than the true condition gap it is
concealing accounts for.

**Reported rather than chased with a second lever.** Whichever value would
split the difference is not a call to make mid-thread: a uniform per-tier
haircut cannot distinguish "twelve honestly-fine hidden slots" from "eight
genuinely-worn hidden slots" on the same car, so closing THIS gap precisely
likely needs a shape change (a per-slot or per-condition-spread term), which
is squarely design-shape territory under directive 22, not a value this
sprint's scope authorises picking unilaterally. `docs/design/systems/
knowledge-and-diagnosis.md` rulings-ledger item 13 and
`economyApprovalGate.test.ts`'s own re-pin comment both record the measured
outcome, not an assumed one. **Superseded by task F**, which settles whether
0.27 actually needed to reach 0.35 at all.

### Task F - final scoping: the ruling itself is the gate

The 35-75% band that tasks C through E all measured against was never a
maintainer-set number: it was the lead's own first, provisional read of the
design doc's own words ("light flips must return better than currently
(positive), and clearly less than deep flips"). The actual ruling, stated
plainly, is looser than that provisional band: light flips positive, clearly
below deep, not super profitable. Task E's own closing measurement - light
3,850 yen/day, deep 14,526 yen/day, ratio 0.27 - satisfies that ruling as
given: positive, clearly below deep (well under half), and nowhere near
"super profitable". The 0.27 missing the provisional 0.35 floor was never a
failure of the ruling; it was the provisional band being tighter than the
ruling it stood in for.

**Scenario 2's gate is therefore rewritten to the ruling itself**
(`packages/sim/tests/flipEconomyProbes.test.ts`): light strictly positive AND
light strictly below deep, both hard-asserted. The 0.27 ratio is disclosed in
the test's own comment, alongside one sentence noting the lead's provisional
0.35 floor was not met and how small a light flip's return should feel is
left open, to be judged against real play rather than a pre-set number - and
the per-slot/per-condition-spread discount design-shape option task E's
diagnosis surfaced stays recorded there too, as a live option for a future
sprint rather than a promise.

**Both scenarios, final measurement, both PASS:**

- Scenario 1 (worst case): light -5,743 yen/day, deep +5,400 yen/day - light
  strictly below deep. PASS.
- Scenario 2 (typical car): light +3,850 yen/day, deep +14,526 yen/day, ratio
  0.27 (disclosed, not gated) - light strictly positive AND strictly below
  deep. PASS.

No further lever moves. `docs/design/systems/knowledge-and-diagnosis.md`
rulings-ledger item 13 mirrors this same one-line outcome. This sprint doc
is archived to `docs/sprints/sprint_archive/sprint219.md`: both gates are
closed.

### Verification

- `pnpm typecheck`: clean across content/sim/game (checked again after task
  E's content change).
- `packages/sim/tests/knowledge.test.ts`: 39/39 pass (7 new evidence-term
  tests, 2 updated per the diagnosis above).
- `packages/game/src/stores/gameStore.knowledge.test.ts`: 8/8 pass, unchanged.
- `packages/content/tests/economyApprovalGate.test.ts`: 6/6 pass - `economy.json`
  re-pinned for task E's lever move (`f155da6e...` before task E,
  re-hashed after it; only the final hash is live in the file).
- `packages/sim/tests/advanceDay.test.ts`: 15/15 pass - the golden hash moved
  TWICE in this sprint (once for the evidence term, `e9f2b288` -> `31c2410c`;
  once more for task E's haircut move, `31c2410c` -> `09343a76`), each
  re-derived from a real run with its own dated paragraph.
- `packages/sim/tests/balanceProbes.test.ts`: 11/11 pass, unchanged (pure
  addition of `buildTypicalProbeCar`).
- `packages/sim/tests/flipEconomyProbes.test.ts`: 5/5 pass, 1 skipped
  (pre-existing golden-session skip, untouched) - both probe (e) scenarios
  green under both the pre- and post-task-E measurements.
- A full `pnpm test` after task A/B/D caught a real, unrelated-looking but
  genuine fallout: `packages/content/tests/commentHygieneGuard.test.ts`
  (directive 10's process-narrative ban) flagged a comment in the scenario 2
  write-up that named the ledger's own approval-authority word. Fixed by
  rewording the sentence to state the finding without naming who it is
  reported to.
- `pnpm test --project sim` and `--project game` both re-run clean after
  task E's lever move, isolating its fallout to the one golden hash above
  before the full run that closed task E.
- Full `pnpm test` at task E's close: **235 test files passed, 4,850 tests
  passed, 1 skipped** (the pre-existing golden-session skip) - zero red.
- Task F touched only `flipEconomyProbes.test.ts`'s own assertions and
  comment (no production code, no content). Re-running caught the comment
  hygiene guard twice more on the rewritten comment - "playtest" and a
  literal date, both banned in `packages/` comments the same as "maintainer"
  was earlier - fixed by rewording both. `packages/sim/tests/
  flipEconomyProbes.test.ts` and `packages/content/tests/
  commentHygieneGuard.test.ts` run together: 6/6 real tests pass, 1
  pre-existing skip, zero red on the final run. No further full-suite run
  needed per directive 20: the change is narrowly scoped to one
  already-verified-passing test file with no production or content-layer
  edit.

### Addendum: the evidence exploit, and freezing it at acquisition (rulings-ledger item 14)

**The exploit.** `evidenceDeltaFor` read `car.verifiedSlots`' CURRENT bands on
every `priorBand` call, not a snapshot. Repairing a car's born-verified
(visible) slots after acquisition raised the average those slots read at, so
the evidence term lifted the guess for every still-HIDDEN slot too - a
player could polish only the visible half of a wreck, never touch the rest,
and have a buyer's estimate of the untouched hidden slots rise anyway. This
let evidence testify about the player's OWN later spanner work rather than
the previous owner's care, and let a buyer overpay for a genuinely poor
hidden slot the seller never touched.

**The freeze.** `CarInstance` gains `acquisitionEvidenceDelta: number`
(optional int, -1/0/+1), computed once by `computeAcquisitionEvidenceDelta`
(`packages/sim/src/knowledge.ts`) and stored at every real acquisition path:
`seedVerifiedSlots` (the ordinary auction settlement in `bidding.ts`'s
`settleLotPurchase`) and `fullyVerifiedCar` (the scripted-lot/dev-grant
exemption, which now also takes `context` to compute and store it, for
uniformity, though the value is never consulted once every slot is already
verified). `priorBand` reads the stored field instead of recomputing live;
`evidenceDeltaFor` itself is unchanged in its arithmetic, only in when it
runs. `knowledgeViewOf` and `buyerKnowledgeViewOf` both route through
`priorBand` unchanged, so both inherit the freeze automatically, verified
directly. `docs/design/systems/knowledge-and-diagnosis.md` section 1 and
rulings-ledger item 14 record the amendment; `SAVE_VERSION` bumped 75 -> 76
(the genuinely-optional-key pattern, no migration).

**The exploit probe** (`packages/sim/tests/knowledge.test.ts`, "the exploit
closed" describe block): a wreck acquired uniformly `poor` (frozen evidence
delta 0, nothing clean-looking to reward), every born-verified slot then
hand-repaired to `mint`, every hidden slot left genuinely `poor` and
untouched. Both outcomes hold: (1) a hidden slot's `priorBand` and the
buyer's masked view of it (band and part identity) are byte-for-byte
unchanged by the polish - proving the exploit is closed - and (2) the sale
value gain from the polish is real and strictly positive (the visible slots
really are worth more repaired), attributable entirely to those visible
slots since nothing else in the priced view moved. A companion honest-signal
test confirms a car ACQUIRED with a genuinely clean visible half still reads
its stored positive delta unaffected by the fix.

**Re-measurement.** Neither of `flipEconomyProbes.test.ts`'s own two
scenario pairs moved: scenario 1 (worst case) still measures light -5,743
yen/day vs deep +5,400 yen/day; scenario 2 (typical car) still measures
light 3,850 yen/day vs deep 14,526 yen/day, ratio 0.27 - bit-for-bit
identical to the pre-freeze figures recorded above. Diagnosed rather than
assumed: in both fixtures, the light flip's one repaired slot was never a
member of the born-verified evidence set the average reads (scenario 1's
`trueCauseA`, scenario 2's `intake`, are both buried/bolt-on slots outside
`defaultVerifiedSlots`), so freezing the snapshot before rather than after
that one repair changes nothing for either probe - the exploit these probes
never happened to exercise, even though it was real and is now closed.

**Verification.** `pnpm typecheck` clean across content/sim/game.
`packages/sim/tests/knowledge.test.ts`: 46/46 pass (new
`computeAcquisitionEvidenceDelta` describe block, the frozen-`priorBand`
describe block replacing the old live-evidence one, and the two exploit-probe
tests). `packages/sim/tests/flipEconomyProbes.test.ts`,
`packages/sim/tests/balanceProbes.test.ts`,
`packages/game/src/stores/gameStore.knowledge.test.ts`,
`packages/game/src/save/saveCodec.test.ts`,
`packages/game/src/screens/dev/economyBench.test.ts`: all green.
`packages/sim/tests/careerReplay.test.ts`'s smoke-script golden hash sequence
moved (state-shape-only: the new field appears in every day's snapshot, no
cash or valuation figure this script exercises actually changed) -
re-derived from a real run and re-pinned in both the test file and
`smoke.script.json`'s own two `kind: 'hash'` checkpoints. Full `pnpm test`:
**235 test files passed, 4,858 tests passed, 1 skipped** (the pre-existing
golden-session skip) - zero red.
