# Sprint 145: a car looks like itself

**Status: READY TO IMPLEMENT. Third of the sale value arc. Prerequisite for Sprint 146.**

Design of record: `docs/design/systems/sale-value-system.md` §13.2. Plan:
`docs/design/systems/sale-value-implementation-plan.md` §6, S3.

This is Sprint 140's Task 0, pulled forward, because **buyer targets on style cannot be
authored while every stock car scores the same.**

## The defect

`styleCap` is 20, and the style stat is capped there for a car with no aftermarket. So **a
Toyota 2000GT and a Nissan S-Cargo score identically on style**, and the car itself contributes
nothing to how it looks.

That is harmless today, because nothing consumes style hard enough to care. It stops being
harmless the moment Sprint 146 authors a stancer whose entire preference is style: he would be
indifferent between a Countach and a delivery van, which is not a defensible thing for the
model to say about those two objects.

`TODO.md` has carried this since the tuning design was written, and its own words are the
brief: *"a car-level base is the natural fix and it is the only thing that makes the upper
reaches of the scale mean anything."*

## Reuse analysis (directive 16)

### Genuinely new

- **One per-car spec field**, `styleBase`, in the same shape as `reliabilityBase` from
  Sprint 136 and deliberately so.

### Existing mechanisms reused

- **`reliabilityBase`'s entire pattern**, landed in Sprint 136: a per-car value on
  `CarModel.spec`, authored for all 94 in the roster CSV, written into `cars.json` for the 26
  shipped, and held to the CSV by `rosterCsvGuard.test.ts`. **Follow it exactly; invent nothing.**
- **`weightedBandFactorForStat`** in `derivedStats.ts`, which already scales a stat by condition.
  The base replaces the flat cap as its input, not as a second path.
- **The roster CSV's `styleBase` column**, which already holds **91 of 94** authored values from
  the research pass, on the 4 to 20 scale that matches the existing cap.

### Must NOT be built

- **A second style path.** Style is one number from one place.
- **A rescaling of the 91 authored values.** See the ruling below.

## The ruling on range, which is deliberate restraint

The authored values run 4 to 20 against a `styleCap` of 20, so they sit exactly on the scale the
game already uses. Landing them as-is makes a 2000GT and an S-Cargo differ, which is the whole
point of the sprint.

**It does NOT make the upper reaches of the scale mean anything**, because stock still tops out
at 20 and the remaining 80 per cent of the axis is still reachable only by bolting things on.
That is the second half of `TODO.md`'s complaint and this sprint does not close it.

**Deliberately not fixed here.** Rescaling 94 subjective judgements is authoring work, not
wiring, and the right time to do it is with the appraisal screen in front of you and a stancer
actually shopping. Landing the mechanism first means that retune is one column in a spreadsheet
rather than a code change. Recorded in `TODO.md` rather than done quietly.

## The three missing cars

The research pass authored 91. Three have no value, and all three need one before the guard can
hold. Proposed, on the same 4 to 20 scale, for the implementer to author unless they disagree
with reasons:

| car | proposed | why |
| --- | ---: | --- |
| Honda Civic 1.5 (EF2) | **6** | a plain late-eighties economy hatchback, sold on being sensible |
| Nissan S-Cargo | **12** | deliberately odd, and genuinely beloved for it; a low number would be wrong about a car people buy *because* of how it looks |
| Nissan Laurel Club S (C33) | **11** | a handsome, restrained saloon; the tuner interest is in the RB20DET, not the bodywork |

## The levers

**Signed under the standing lever grant recorded as R3 in
`docs/design/systems/sale-value-implementation-plan.md`, and provisional until the maintainer
ratifies it.**

| lever | value |
| --- | --- |
| `spec.styleBase`, 91 cars | already authored in the roster CSV, unchanged |
| `spec.styleBase`, 3 cars | **6 / 12 / 11** per the table above |
| `statFormulas.styleCap` | **retired**, replaced by the per-car base |

Per arc rule 7, a per-car spec value is character and never difficulty: `styleBase` says what
the car IS, and it does not vary by build, condition or tier.

## Task breakdown

1. **Author the three missing values** in `docs/design/midnight-garage-roster.csv`.
2. **Add `styleBase` to `CarModel.spec`**, required, no default, exactly as `reliabilityBase` is
   declared. A default here would let a car silently score zero, which is the `powerFraction`
   bug wearing a different hat.
3. **Write the value into `cars.json`** for all 26 shipped cars, read FROM the CSV rather than
   re-judged. The CSV is the single source of truth.
4. **Extend `rosterCsvGuard.test.ts`** to hold every built car's `styleBase` to its row, in the
   same assertion style it already uses for `reliabilityBase`.
5. **Wire it into the style stat** in `derivedStats.ts`, replacing the flat cap as the stock
   contribution. Retire `styleCap` and add it to the retired-identifier ledger.
6. **Re-derive** whatever moves. Style feeds taste, taste feeds price, so expect sale-price and
   valuation pins to move on any car whose stock style is no longer 20.

## Expect movement, and one thing that must not move

**Every car whose `styleBase` is below 20 gets less style than it had**, so its taste score falls
for any buyer weighting style, so its price falls a little. That is the correction, not a
regression.

**A car with `styleBase` exactly 20 must not move at all.** That is the sprint's smoke test, and
it is the same shape as Sprint 144's stock-car invariant: find a car authored at 20, assert it
is unchanged end to end, and run it before anything else.

## Hard constraints

- No second style path, and no rescaling of the authored 91.
- `styleBase` is required in the schema, never defaulted.
- `pnpm typecheck` before reporting, per directive 20's carve-out: this adds a required spec
  field and retires a content lever.
- `--project content` and `--project game` once each. Never the full sim project.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] All 94 roster rows carry a `styleBase`.
- [x] `spec.styleBase` is required with no default, and all 26 shipped cars carry it.
- [x] `rosterCsvGuard` holds every built car's value to its CSV row and fails on a single digit.
- [x] The style stat reads the per-car base; `styleCap` is retired and in the ledger.
- [x] A car authored at 20 values identically to before, asserted.
- [x] A 2000GT and an S-Cargo no longer score the same on style, asserted.
- [x] Every moved pin re-derived from a real run, old and new recorded.
- [x] Typecheck, content and game all pass, output shown.

## Exit

**Status: all six tasks complete, definition of done fully satisfied.** The smoke test passed on
the first run against the mirrored `reliabilityBase` wiring; the only real fallout was one story
mission's style threshold and stancer taste match, both re-derived from a fresh run below.

### The smoke test, run first

No SHIPPED car sits at `styleBase` 20 (the roster's only 20 is the Lamborghini Countach, which
does not ship; the highest shipped value is the Mazda RX-7 FD3s at 18), so the test was built the
same way every other sim unit test in this codebase already builds its fixtures: a synthetic
`CarModel` (`packages/sim/tests/derivedStats.test.ts`), not a `cars.json` lookup. Its `styleBase`
was set to 20 (the retired cap's own value) and, at mint condition, `computeDerivedStats(...).style`
reads exactly **20** - unchanged from the flat-cap formula it replaced. A second test builds two
more synthetic models carrying the Toyota 2000GT's and Nissan S-Cargo's real authored CSV values
(15 and 12 respectively; neither ships either) and confirms they now score **15** and **12**,
no longer tied. Both tests are in the new `describe('styleBase replaces the flat styleCap', ...)`
block at the end of that file, and both passed before any further sim test was run.

### Task 1: the three missing values

Authored into `docs/design/midnight-garage-roster.csv` exactly as proposed: Honda Civic 1.5 (EF2)
**6**, Nissan S-Cargo **12**, Nissan Laurel Club S (C33) **11**. All 94 roster rows now carry a
`styleBase`, range 4-20 confirmed by script.

### Task 2: the schema field

`spec.styleBase: z.number().min(0).max(100)` in `packages/content/src/carModel.ts`, declared on
the identical footing as `reliabilityBase` immediately above it (required, no default, same bound
shape) with its own doc comment explaining the 4-to-20 authored range sits inside that bound and
why stock still tops out at 20.

### Task 3: cars.json

All 26 shipped cars' `styleBase` written in, read from the CSV (never re-judged), inserted
immediately after each car's `reliabilityBase` line. Values: honda-city-e-aa 6,
suzuki-wagon-r-ct21s 4, honda-civic-sir2-eg6 12, toyota-sprinter-trueno-ae86 16,
nissan-180sx-rps13 15, toyota-chaser-tourer-v-jzx90 13, nissan-silvia-ks-s14 14,
mazda-savanna-rx7-fc3s 15, mazda-rx7-fd3s 18, toyota-supra-rz-jza80 17, toyota-carina-at150 6,
nissan-sunny-b12 7, suzuki-alto-works-ha21s 9, honda-beat-pp1 14, honda-crx-sir-ef8 13,
honda-city-turbo-ii-aa 12, toyota-sera-exy10 14, honda-prelude-si-vtec-bb4 13,
nissan-silvia-s13 15, toyota-mr2-sw20 15, nissan-cefiro-a31 11, subaru-impreza-wrx-sti-gc8 15,
nissan-skyline-gtr-bnr32 17, nissan-fairlady-z-z32 16, toyota-aristo-30v-jzs147 12,
toyota-mr2-aw11 13.

### Task 4: rosterCsvGuard

Added `gives every car a style base inside the authored band` (all 94 rows, integer, 4-20),
mirroring `reliabilityBase`'s own band test exactly (`STYLE_FLOOR`/`STYLE_CEILING` beside
`RELIABILITY_FLOOR`/`RELIABILITY_CEILING`). The pre-existing generic "tuning-arc constants" loop
(`describe('the tuning-arc constants, once they reach content', ...)`) now exercises `styleBase`
for real for the first time, since it was skipping every car while the field was undefined - it
holds all 26 shipped cars to their CSV row and fails the moment either drifts.

### Task 5: wiring

`packages/sim/src/derivedStats.ts`: `style = styleFraction * model.spec.styleBase` replaces
`styleFraction * styleCap`, one line, same shape as reliability's own base-scaling. `styleCap`
removed from `economy.ts`'s schema and `economy.json`, and added to
`retiredIdentifiers.test.ts`'s ledger. The dev-only performance sandbox
(`PerformanceSandboxScreen.vue`) now reads the selected car's own `spec.styleBase` for its style
row's label, the same pattern its reliability row already used; the sandbox's generated research
roster (`tools/sandbox/generateCars.mjs` -> `packages/game/src/screens/dev/sandboxCars.ts`, 59
non-shipped cars) gained a flat placeholder `styleBase: 12`, read by nothing, on the same footing
as its existing `reliabilityBase` placeholder, and was regenerated.

### Task 6: re-derived pins

**Only one pin moved anywhere in the codebase.** `marketValueYen` (the buyer-agnostic auction
anchor, diagnosis pricing, balance probes and taste-blind exits) never reads style at all, so
book values, auction reserves and every non-taste-gated price are untouched. Only
`valuateCarForBuyer` (real callers: `selling.ts`'s buyer-matching and the taste-match story-mission
requirement) reads style, weighted 1.0 for the `stancer` archetype specifically (`buyers.json`).

`low-and-loud`'s probe (a mint `nissan-silvia-ks-s14` with sport aero/rims and street seats,
`styleBase` 14) measured style **56** fresh (was 62 under the flat cap - the 6-point drop is
exactly the car's own `styleBase` shortfall against the retired 20, the fitted parts' additive
bonuses unchanged). Re-derived by formula, not hand-picked:

- `statThreshold(style).min`: `floor90(62)=55` -> `floor90(56)=50`.
- `tasteMatch(stancer).minMultiplier`: `round2At97Percent(...)` `1` -> `0.99`.
- `payoutYen`/`budgetCapYen`: unchanged at 1,161,000 (the probe's build cost is unaffected by
  style; confirmed by the mission-payouts pin in `economyApprovalGate.test.ts` passing unchanged).

No other story mission carries a style-gated requirement, so no other threshold moved (confirmed
by a fresh `storyMissionProbes.test.ts` run, 19/19 passing after the fix). `balanceProbes.test.ts`,
`valueModelProbes.test.ts` and `stockCarValuationInvariant.test.ts` all pass unchanged: every
probe car in those suites is built all-stock via `stockInstanceFor`, and buyer-agnostic
`marketValueYen` is what they measure.

`economy.json`'s approval-gate hash moved because `styleCap` was deleted:
`c63987887418659103156de09e48af05c59a8ccad04938819fb3225a3e7ad7ab` ->
`c9110158453777a12cd600e5d32a6a3ec373ef8d5d3f671200b0e4665cb1598d`, re-pinned in
`economyApprovalGate.test.ts` with a new ledger paragraph. The mission-payouts pin in the same
file is untouched byte for byte (no payout or budget cap moved, `low-and-loud` included).

### The 26 shipped cars, extremes

Every one of the 26 shipped cars' stock `styleBase` is below 20 (the roster's only 20 is the
non-shipped Countach), so every one loses stock style at mint condition versus the retired flat
cap - the correction the sprint exists to make. Biggest drop: `suzuki-wagon-r-ct21s`, `styleBase`
4, stock style falls from 20 to 4 (-16). Smallest drop: `mazda-rx7-fd3s`, `styleBase` 18, stock
style falls from 20 to 18 (-2). This only moves a car's PRICE where a buyer weights style
(`stancer` at 1.0; `collector`/`tuner` at 0.3; `first-timer` at 0.1; `racer` at 0) and only through
`valuateCarForBuyer` - book value and auction reserves are unaffected, per Task 6 above.

### Checks

`pnpm typecheck`: **PASS**, all three packages (content `tsc`, sim `tsc`, game `vue-tsc`).

`pnpm test --project content`: **531 passed, 531 total, 24 files, all green** (two real findings
along the way, both fixed - see below).

`pnpm test --project game`: **833 passed, 833 total, 62 files, all green**, unchanged.

Additionally (directive 20's narrow carve-out, named files, never the full sim project):
`derivedStats.test.ts`, `carCondition.test.ts`, `valuation.test.ts`, `marketValue.test.ts`,
`bands.test.ts`, `lapModel.test.ts`, `storyMissionProbes.test.ts`, `valueModelProbes.test.ts`,
`stockCarValuationInvariant.test.ts`, `balanceProbes.test.ts`, `selling.test.ts`,
`valueLedger.test.ts`, `coherenceValuation.test.ts`, `auctions.test.ts`, `bidding.test.ts`,
`buyout.test.ts` - 16 files, all green, all pass counts unchanged from before this sprint except
the two new `derivedStats.test.ts` cases.

**Two real findings along the way, both fixed:**

1. `commentHygieneGuard.test.ts` caught six comments literally naming "Sprint 145" - reworded to
   describe current behaviour instead, the same directive 10 fix Sprints 143 and 144 applied to
   their own new comments.
2. `storyMissionProbes.test.ts` caught `low-and-loud`'s stale style threshold and stancer taste
   match the moment `styleBase` was wired in - re-derived from the fresh probe measurement above,
   not hand-picked, and confirmed by re-running the file green.

### Outstanding

Stock style still tops out at 20 (the retired cap's own former ceiling), so the upper 80 per cent
of the axis is reachable only through bolt-on parts - the sprint's own deliberate restraint, not
an oversight. Recorded in `TODO.md` rather than closed here, alongside the note that rescaling
the 94 authored values is deferred until the appraisal screen exists. `docs/sprints/sprint140.md`
updated to mark its `styleBase`/Lever 2/Task 3 content, and the `styleCap` half of its Task 6, as
landed here, so it is not redone when that sprint's remaining `aeroCeiling` work is picked up.
