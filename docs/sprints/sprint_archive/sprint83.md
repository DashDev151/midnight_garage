# Sprint 83 - Content wave II: the commons refill and the seventh symptom's revenge

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English. Directives 20 and 21 in force: narrowest checks once, the pre-push hook
is the gate, bot careers and the Python balance CLI are FORBIDDEN; the Vitest coherence probes
are the economic gate. Every authored string flows scratchpad first, orchestrator sweep second,
repo third (content-quality directive 2026-07-17).

## Confirmed current state (after Sprint 81)

- 25 models, but the common pool thinned to 3 when City Turbo II and Sera re-tiered to shitbox
  parts class; Sprint 81's Exit flags the next wave at the 560k+ floor (the class-parts economics
  need books of roughly 560,000 yen and up: `honda-crx-sir-ef8` at 560k is the measured floor).
- 14 symptoms; interior/instrument diagnosis coverage was cut when `erratic-fuel-gauge` proved
  structurally trap-less (both causes cheap parts); the Exit defers it pending an honest
  expensive trap.
- All guard rails content-blind and in force: per-model Vitest coherence rows, symptom
  coherence, naming-layer CI test (mark list extended Sprint 81), spelling and em-dash guards.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:** everything; this sprint is content plus probes, zero code. The
roster bible is the sole car source (the Zero Legend remains excluded and unreferenced). The
Sprint 81 sweep pipeline (scratchpad draft, orchestrator verdicts applied in place, integrator
applies verbatim) is the process.

**New mechanisms:** none. STOP and escalate if a symptom needs a partition shape the schema
cannot express.

## Decisions

1. **Commons refill: 5-6 models, books 560k-900k yen, roster-cited.** Candidates of the right
   class if the roster offers them: Eunos Roadster (NA6/NA8), Levin/Trueno AE92 or AE101,
   CR-X del Sol, Starlet GT turbo EP82, and kin: 1995-or-earlier only, real era specs, UNSURE
   flags over invented figures. Value anchors against CR-X SiR (560k), Civic SiR (650k), and
   Prelude BB4 (800k); every addition must clear the per-model coherence rows (the 560k floor is
   the lesson of Sprint 81, learned once, not twice).
2. **Symptom wave: 4-6 additions.** Must include one instrument/interior-flavoured symptom whose
   trap is a genuinely expensive slot (the failed `erratic-fuel-gauge` pattern inverted:
   e.g. electrical gremlins whose trap is the loom/ECU side, if the taxonomy prices it as a real
   trap: the probe decides, not hope). Reuse existing test partitions where honest; at most 3
   new tests; the bench-only ambiguity (`wont-idle`) stays unique unless a new one is
   deliberately designed and disclosed.
3. **Flavour breadth riders:** 6-10 new customer names with tag lines in the shipped register;
   2-4 new service-job flavour lines where a template still reads menu-ish (the weakest-lines
   bar applies: place, object, or a small refusal to explain); nothing else churned.
4. **Volume over caution, cuts cheap; the sweep is the gate.** Cut-review table in the Exit.
5. **Gate discipline:** Vitest probes (per-model rows, symptom coherence, naming, guards) run
   narrowly during integration, once; goldens re-pin once at the end with cause; the pre-push
   gate is the final evidence. No harness, no Python CLI (directive 21).

## Tasks

**Claude (agents, orchestrated):**

1. Draft in the scratchpad: `sprint83-cars-draft.md` (rows, naming-layer strings, anchors,
   UNSURE flags) and `sprint83-symptoms-draft.md` (symptoms, tests, mapping table, uncertainty
   flags) plus the flavour riders.
2. Orchestrator sweep checkpoint (blocking).
3. Integrate swept content verbatim; run the relevant Vitest probes once; re-pin goldens once
   with cause; fill the Exit with the cut-review table and probe numbers.

**Orchestrator (Fable):** the blocking sweep; final review; commit/push with maintainer approval.

**User-only (maintainer):** cut-review of the wave; the playtest after the sprint pair lands.

## Definition of done

- Common pool at 8+ models, all clearing the coherence rows; symptom set at 18-20 with the
  instrument gap closed by a probe-passing trap; every authored string swept; Exit filled with
  the cut-review table; evidence is the single pre-push gate.

## Exit

**Built, with one structural finding escalated and ruled on.** The orchestrator-swept drafts
(`sprint83-cars-draft.md`, `sprint83-symptoms-draft.md`) were integrated verbatim into
`packages/content/data`. Cars 25 -> 26, symptoms 14 -> 17 (four integrated, one then cut by
ruling - see Deviation 2), diagnostic tests 14 -> 17, customer names 12 -> 20, three service-job
flavour lines replaced. Zero code/mechanism changes: every row rides the existing generation,
pricing, coherence, and guard machinery. One of the four new symptoms (`clutch-slip`) failed the
symptom-coherence "sleeper and trap on both sides of zero" gate at two of its four fitment tiers;
escalated per the task's STOP instruction, and the orchestrator ruled CUT (2026-07-17): the gate
exists to kill weak content, and it did its job.

1. **Cars: 25 -> 26 models, 1 of 6 drafted rows integrated.** Only `toyota-mr2-aw11` (Toyota MR2
   AW11, common, 820,000 yen) per the orchestrator's ruling; see the cut-review table below.
   **Tag fix on integration:** the draft flagged the AW11's supercharged 4A-GZE as a
   taxonomy gap ("the tag vocabulary offers only NA or Turbo") and placed `Turbo` as a
   placeholder. Verified false against `packages/content/src/carModel.ts` /
   `packages/content/src/tags.ts`: `INDUCTION_TAGS`/`TagSchema` already include `Supercharged`
   (added for exactly this case). Integrated the row with `tags: ["MR", "Supercharged",
   "Piston", "80s", "JDM"]`, not the draft's placeholder `Turbo` - an honest correction, not a
   schema change, and it clears `CarModelSchema`'s "exactly one induction tag" refinement the
   same as every other row.

2. **Symptoms: 14 -> 17 (four integrated, `clutch-slip` then cut by ruling).** All four new
   symptoms were integrated with the sweep's five in-place revisions already baked into the
   draft's JSON blocks (the oil-LIGHT card line and mechanic's-gauge test copy on
   `oil-pressure-flutter`, "tee'd into the fuel line" on `hesitates-under-load`, the bundled
   bites-high-and-grumbles card line on `clutch-slip`); `clutch-slip` was then removed by
   orchestrator ruling after failing the symptom-coherence gate (Deviation 2), leaving
   `oil-pressure-flutter`, `hesitates-under-load`, and `steering-wander` shipped.
   `oil-pressure-flutter` closes the DoD's instrument gap with a genuinely expensive trap
   (`dashGauges` sender vs `internals` worn main bearings, an 11.25x cost differential) and
   clears its own coherence rows on all four tiers cleanly. New tests: 3, exactly at the
   ceiling (`oil-pressure-check` 20 min, `fuel-pressure-check` 15 min,
   `steering-linkage-check` 10 min) - all three belong to the surviving symptoms, so the cut
   leaves them untouched; `stethoscope` stays exactly as shipped (`tick-at-idle`,
   `exhaust-rasp`).

3. **Flavour riders.** 8 new customer names (`serviceJobCustomerNames.json` 12 -> 20), era-
   checked (driving ranges, video rental, sake-shop delivery are genuine 1995 fixtures, not
   costume dressing). 3 service-job flavour-line replacements
   (`top-end-refresh`/`fuel-system-clean`/`driveline-service`), each swapping a menu-speak tail
   for a place/object/person detail, within the 2-4 budget.

4. **Naming layer: no change needed.** `REAL_BRANDS` already lists Toyota and
   `REAL_MODEL_TOKENS` already lists `MR2` (added Sprint 81 for the SW20), so the AW11's real
   name/brand were already guarded; its parody name reuses the shipped "MR-II" stem
   (disambiguated by the `(AW11)` chassis suffix, mirroring the real cars' own relationship to
   the SW20). `naming.test.ts` confirms parody mode leaks nothing and differs from real mode
   for every car, AW11 included.

### Probe results (decision 5, narrow, run once each)

Per directives 20/21: no full suite, no coverage, no build, no balance/Python CLI. Ran targeted
files once: `packages/content/tests/schemas.test.ts`, `.../integrity.test.ts`,
`.../symptom.test.ts`, `.../naming.test.ts`, `.../spellingGuard.test.ts`,
`packages/sim/tests/coherence.test.ts`, `packages/sim/tests/advanceDay.test.ts`.

- **Schema/structural (content package): all pass.** `cars.json` (incl. the AW11 row) and
  `symptoms.json`/`diagnosticTests.json` (incl. the new symptoms and 3 new tests) parse clean;
  symptom ids unique, every cause's weights sum to 100, every cause addresses a real
  `CarPartId`, every test partition covers its symptom's cause list exactly once, every test id
  registered. First run over the interim 18, re-run once over the final 17 after the
  `clutch-slip` cut - both green. `integrity.test.ts` (referential integrity, cars + service
  jobs) passes.
- **Naming layer: pass.** Parody mode leaks no real-brand/model-token string over all 26 cars,
  including AW11; parody differs from real for every car; no part brand collides with a real
  car brand.
- **Spelling guard: pass.** No American spellings in the 4 new symptoms' `cardLine`/
  `resultCopy` pairs.
- **Per-model coherence rows, AW11 (economy-bible.md law 4 + Sprint 71 donor law), measured via
  `computeRosterCoherence`/`computeRosterDonorCoherence`:**
  - `cleanValueYen` 615,000; `worstBillYen` 285,200; `billToCleanRatio` 0.464 (well under the
    0.6 `maxBillFraction` ceiling - Law 2 pass).
  - `flipMarginYen` 169,768 (27.6% of clean); `sensibleFlipMarginYen` 152,128 (24.7%) - both
    positive, Law 1 pass.
  - `consumablesShare` 7.07% - Law 3 pass, well under cap.
  - Donor: `wholeSaleYen` 861,000 vs `partedYieldYen` 591,000 - whole clearly beats parted.
  - AW11 clears every hard-gated coherence row at its drafted 820,000 yen common book value; no
    retune needed.
- **Symptom coherence (Sprint 73 decision 6, the blind-buy guardrail): final 17 all clean on
  every tier.** Over the interim 18, `clutch-slip` failed the "sleeper and trap on both sides
  of zero" assertion at 2 of 4 tiers (full numbers in Deviation 2); after the orchestrator's
  cut ruling, the suite was re-run once over the final 17 and passes in full: coverage (68
  rows = 17 symptoms x 4 tiers), blind-buy EV non-negative everywhere, windfall cap
  everywhere, and sleeper/trap edges on both sides of zero for every symptom on every tier,
  including all three surviving new ones.
- **Golden hashes: re-pinned with cause (directive 17 case (a)).** Both moved when the pools
  first grew; the acquisition->sale hash moved once more on the 18 -> 17 cut (the 30-day
  career's seeded draws never landed on `clutch-slip`, so its interim pin held). Final state
  verified passing (`advanceDay.test.ts` 15/15 green):
  - 30-day career hash: `6e62e1c3` -> `21512af3` (pinned at the interim 18-symptom pool; held
    unchanged at 17).
  - Acquisition->sale career hash: `65447382` -> `2ecb0cb9` (interim, 18 symptoms) ->
    `83bc96ab` (final, 17 symptoms after the cut).
  - Cause, both: content wave II changed the generation pick pools (cars.json 25 -> 26,
    symptoms.json 14 -> 17 via an interim 18), so seeded auction-catalog rolls from day 7
    onward draw different lots and symptom instances. A content change, not a sim-logic
    change; the repeat-run determinism test passes unchanged throughout.

### Cut-review table (decision 1, cars)

1 integrated, 5 rejected. All six were roster-bible-cited (v1.2) and priced at or above the
560,000 yen common floor; tier was the only open question per the draft.

| # | Model | Verdict | One-line reason |
| --- | --- | --- | --- |
| 1 | Honda Integra Type R (DC2) | Rejected | DC2 Type R is a late-1995 launch; cannot be a cheap 1995-or-earlier used common. |
| 2 | Suzuki Cappuccino (EA11R) | Rejected | Pattern-matches the kei/shitbox class (alongside Beat/Alto Works), not a light-NA-front-driver common. |
| 3 | **Toyota MR2 (AW11)** | **Integrated** | Common, 820,000 yen; clears the flip/donor coherence gates cleanly (see probe numbers above). |
| 4 | Mitsubishi Starion (A187A) | Rejected | Forced-induction FR pattern-matches the roster's uncommon floor (~1.1M), not common. |
| 5 | Nissan Pulsar GTI-R (RNN14) | Rejected | AWD turbo pattern-matches uncommon, not common. |
| 6 | Mazda Familia GT-R (BG8Z) | Rejected | AWD turbo pattern-matches uncommon, not common. |

### Cut-review (decision 2, symptoms)

3 of 4 drafted symptoms shipped (`oil-pressure-flutter`, `hesitates-under-load`,
`steering-wander`); 1 cut post-integration by orchestrator ruling. The four reach candidates the
draft itself dropped pre-sweep (kerbed-rim-to-rack, a second cosmetic/structural symptom, an
aero-lip-to-chassis trap, a second instrument symptom) are recorded in
`sprint83-symptoms-draft.md` flag 4.

| Symptom | Verdict | Reason |
| --- | --- | --- |
| `clutch-slip` | **Cut (orchestrator ruling, 2026-07-17)** | Failed the sleeper/trap coherence gate at common (+4,123/+4,323) and uncommon (+9,307/+2,587): both edges positive, no downside, blind-buy never loses; the drafter's own flag called it the thinnest mechanic's nod of the four, and re-weighting risked flipping the shitbox sleeper edge (+1,637, already marginal) negative. Full per-tier table in Deviation 2. |

### Deviation 1 (prominent): the commons refill is BLOCKED - DoD's "common pool at 8+" is unmet

The DoD calls for "common pool at 8+ models, all clearing the coherence rows." This sprint
integrated exactly **one** common (AW11), bringing the pool to **4**: CR-X SiR (560k), Civic
SiR-II (650k), Prelude BB4 (800k), MR2 AW11 (820k). **Honestly unmet against the 8+ target.**

Root cause (structural, not an integration shortfall): the roster bible (v1.2) does not contain
8+ true common-band cars. Every existing and newly-integrated common is a light NA front-driver;
every other unshipped roster model is either kei (shitbox class), forced-induction FR/AWD
(pattern-matches uncommon, as items 1 and 4-6 above confirm), or a late/out-of-era chassis (item
1). The sprint-83 decision-1 candidate list itself (Eunos Roadster, Levin/Trueno, CR-X del Sol,
Starlet GT turbo) is not in the roster bible today - confirmed absent by name-by-name check
against `midnight-garage-roster.md` v1.2 during drafting.

Per CLAUDE.md ("roster is canonical for car scope; do not invent cars; flag conflicts rather
than pick a side" and "bibles require explicit maintainer approval, recorded in the doc, to
amend"), these four were correctly **not** drafted as rows and are **not integrated**. They
await the maintainer's explicit roster-bible amendment approval:

- **Eunos Roadster (NA6CE/NA8C)** - B6-ZE 1.6 (120PS) or BP-ZE 1.8 (130PS), FR, NA, ~940-990kg.
  The archetypal 700-800k common roadster. Roster today has only the Eunos Cosmo.
- **Toyota Corolla Levin/Sprinter Trueno (AE92 or AE101)** - 4A-GE 16v (140PS) or 20v (160PS),
  FF, NA, ~1000kg. A clean 560-700k NA front-driver. Roster has only the AE86.
- **Honda CR-X del Sol (EG2 SiR)** - B16A (170PS), FF, NA, ~1000kg targa. A 600-750k common.
  Roster has only the CR-X SiR (EF8).
- **Toyota Starlet GT turbo (EP82)** - 4E-FTE (135PS), FF, Turbo, ~1050kg. A 560-650k small-
  turbo common, and a genuine 1989 chassis, unlike the rostered EP91 Glanza V (1996, out of
  era). Recommend citing the EP82 alongside or instead of the EP91.

Until the maintainer rules on this amendment, the common pool cannot honestly reach 8+ without
either inventing cars (forbidden) or mis-tiering forced-induction/AWD performance cars downward
against their own pattern (rejected above, items 4-6).

### Deviation 2: `clutch-slip` failed the symptom-coherence sleeper/trap gate at 2 of 4 tiers - escalated, ruled CUT, applied

`packages/sim/tests/coherence.test.ts`'s "every symptom shows both a sleeper and a trap cause
(edges on both sides of zero), on every tier" assertion failed for `clutch-slip` only, at the
`common` and `uncommon` fitment tiers. Full measured numbers (`edgePerCauseYen`, yen, over the
interim 18-symptom pool):

| Tier | `worn-clutch-disc` edge | `worn-input-shaft-bearing` edge | Gate |
| --- | --- | --- | --- |
| shitbox | +1,637 | -1,888 | pass (both sides of zero) |
| common | +4,123 | +4,323 | **fail (both positive - no downside outcome)** |
| uncommon | +9,307 | +2,587 | **fail (both positive - no downside outcome)** |
| rare | +17,719 | -1,031 | pass (both sides of zero) |

At the common and uncommon tiers, both the sleeper cause (worn disc) and the trap cause (worn
input-shaft bearing) leave the buyer ahead of the fear-discounted sheet price - there is no
scenario where buying `clutch-slip` blind turns out badly. This confirmed, with real numbers,
the draft's own flagged uncertainty #3: "`clutch-slip`'s trap cause naming is an interpretive
stretch on the taxonomy's granularity... this is the thinnest mechanic's-nod of the four - worth
a second look." `clutch` is a non-repairable, flat-priced part (its market value does not scale
down with a worse band the way a repairable part does), so the entire downside the symptom is
supposed to represent has to come from the `gearbox`/poor trap alone; at these two tiers the
sheet's fear discount is still too generous relative to both possible truths, not just one.

Escalated per the task's explicit instruction (no self-retune); **orchestrator ruling
(2026-07-17): CUT the symptom.** Rationale as ruled: the fear discount overshoots its worst case
at common/uncommon (both edges positive, no trap, blind-buy never loses); the drafter's own flag
3 called it the thinnest mechanic's nod of the four; and re-weighting risks flipping the shitbox
sleeper edge (+1,637, already marginal) negative. The gate exists to kill weak content; it did
its job. Applied: `clutch-slip` removed from `symptoms.json` (18 -> 17). The three new
diagnostic tests are unaffected (none belong to it); `stethoscope` stays exactly as shipped.
The symptom-structure and symptom-coherence suites were re-run once over the final 17 and pass
in full (see the probe-results section above).

### Definition-of-done status

- Common pool at 8+, all clearing coherence rows: **NOT MET** (4/8+, blocked - Deviation 1).
- Symptom set 18-20 with the instrument gap closed by a probe-passing trap: **MISSED BY ONE**
  (17 after the `clutch-slip` cut, Deviation 2); the instrument-gap half is **MET**
  (`oil-pressure-flutter` clears every tier). Both shortfalls close in the next wave: the
  roster-amendment batch (Deviation 1) can carry a replacement symptom through the standard
  scratchpad-sweep-integrate pipeline alongside the new commons.
- Every authored string swept: **MET** (both drafts carry the orchestrator sweep's revisions;
  integrated verbatim, less the one ruled cut).
- Exit filled with the cut-review tables: **MET** (above, cars and symptoms).
- Evidence is the single pre-push gate: **not run here** (directive 21 forbids the full
  suite/coverage/build from this seat); the narrow probes above are this integration's evidence,
  the pre-push gate is the next seat's (orchestrator commit/push) responsibility.
