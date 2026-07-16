# Sprint 73 - Diagnosis I: symptoms, causes, and the fear-priced board

**Source:** `docs/design/diagnosis-spec.md` v2 (the detective model; maintainer pricing law
2026-07-15: the room prices the symptom, the player prices the cause). Depends on Sprints 70-72.
This sprint puts symptomatic cars in the world and prices them; Sprint 74 adds the player's
inspection verbs; Sprint 75 integrates and polishes.

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English in all player copy. All new tunables in `packages/content`.

## Confirmed current state (code discovery, 2026-07-15)

- Generation: `generateAuctionCarInstance` (`auctions.ts:331`) rolls per-part bands at
  `auctions.ts:374-397`, calls `enforceMaxBillFraction` (`auctions.ts:446`) at `auctions.ts:412`.
  Top level: `generateAuctionCatalog` (`auctions.ts:509`).
- Room pricing: `carGuideValueYen` (`bidding.ts:65`) -> `anchorValueYen` (`bidding.ts:84`) feeds
  `reserveYen` (`bidding.ts:109`), `computeBuyoutPriceYen` (`bidding.ts:221`), rival ceilings via
  `privateValuationYen` (`bidding.ts:131`), and `advanceLotOvernight` (`bidding.ts:331`). One
  switch point prices the whole room.
- Sheet: `computeAuctionGrade` (`auctionGrade.ts:85`) is called ONLY from `gameStore.ts:1538`
  (display), so pointing it at the apparent view is a one-call-site change.
- Value: `marketValueYen` (`marketValue.ts:250`); worst-case probe car construction exists in
  `coherence.ts:229` (reuses `enforceMaxBillFraction`).
- `LotDetail` built at `gameStore.ts:1517-1551`; lot card fields listed in `AuctionScreen.vue`.
- Bands: `scrap|poor|worn|fine|mint`; "worse of two bands" = lower index in that order.
- Content pipeline precedent: `partPricing.json` (schema `content/src/partPricing.ts`, parse in
  `data.ts`, context via `buildSimContext`, `context.ts:143`).
- `SAVE_VERSION` is 32 after Sprint 72.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The generation chain: symptom rolling is appended INSIDE `generateAuctionCarInstance`, after
  the existing enforce step; no new pipeline.
- `enforceMaxBillFraction`: re-run on the true car; Law 2 stays the same guard.
- `marketValueYen`: both sides of the pricing law are computed with it (apparent view vs
  cause-applied views); no parallel value model.
- The whole room (reserve, buyout, rivals, overnight) reprices through the single
  `anchorValueYen` seam.
- `computeAuctionGrade` unchanged; fed the apparent view.
- `coherence.ts` for the blind-buy guardrail; `ServiceTaskList`'s `[ ]` checklist idiom for the
  cause list UI.

**New mechanisms:**

1. `symptoms.json` + `diagnosticTests.json` content (+ Zod schemas) and `economy.diagnosis`.
2. `CarInstance.symptoms` + `CarInstance.apparentBandByPartId` and the apparent-view helper.
3. `sheetGuideValueYen` (the fear-priced room value) and the `anchorValueYen` switch.
4. `computeSymptomCoherence` (the blind-buy EV guardrail).
5. Lot-card symptom line + open cause list (read-only this sprint).

## Decisions

1. **State shape.** `CarInstance` gains `symptoms: { symptomId: string, trueCauseId: string,
   remainingCauseIds: string[] }[]` (default `[]`; `remainingCauseIds` starts as the full cause
   list and is the PLAYER's knowledge, narrowed in Sprint 74) and `apparentBandByPartId:
   Partial<Record<CarPartId, ConditionBand>> | null` (default `null` = honest car; when set, it
   holds the PRE-damage band for exactly the parts a cause damaged). Economics keep reading
   `parts[..].band` (the truth) everywhere, unchanged.
2. **Generation order** (inside `generateAuctionCarInstance`, after the existing
   `enforceMaxBillFraction` call): roll symptom count (`economy.diagnosis.symptomChanceByTier`:
   shitbox 0.45, common 0.30, uncommon 0.22, rare 0.12; second-symptom chance 0.15; cap 2; a
   symptom id is drawn uniformly without replacement); per symptom, roll `trueCauseId` by
   weight; record the damaged part's current band into `apparentBandByPartId`; set the true
   band to the WORSE of (current band, cause `setBand`); re-run `enforceMaxBillFraction` on the
   result; if it would alter ANY band, DROP that symptom entirely and restore the recorded
   apparent band (deterministic Law 2 rule; no clamping negotiation).
3. **The pricing law, implemented.** New `packages/sim/src/diagnosis.ts`:
   - `apparentViewOf(car): CarInstance`: a copy with each damaged part's band swapped to its
     apparent value (pure; used for display AND sheet pricing).
   - `expectedTrueValueYen(car, model, state, context)`: for each symptom, the weighted mean of
     `marketValueYen` over "apparent view with THAT cause's damage applied"; combined across
     symptoms by applying each symptom's expectation sequentially (order by array index;
     deterministic).
   - `sheetGuideValueYen(car, model, state, context) = apparentValue - fearPremium x
     (apparentValue - expectedTrueValue)` with `economy.diagnosis.fearPremium: 1.1`.
   - `carGuideValueYen` (`bidding.ts:65`) becomes: honest car -> unchanged; symptomatic car ->
     `sheetGuideValueYen`. Reserve, buyout, rivals, turnout machinery: untouched code, now
     fear-priced through the seam. RIVALS NEVER READ `trueCauseId` OR `remainingCauseIds`; add
     a test that rival ceilings are identical before/after `remainingCauseIds` narrows.
4. **The symptom pool (all copy is player-facing; British spelling).** `symptoms.json`, 8
   entries. Cause bills are DERIVED (the damage prices itself through the existing atoms);
   weights sum to 100 per symptom. Tests are defined per symptom with partitions over cause
   ids; running a test reveals which partition group contains the true cause (Sprint 74 wires
   the verb; the content ships now).

   | Symptom id | Card line | Causes (id: part -> setBand, weight) |
   | --- | --- | --- |
   | smokes-on-startup | "Smokes on startup." | valve-seals: headValvetrain -> worn, 55; tired-rings: internals -> poor, 30; head-gasket: headValvetrain -> poor, 15 |
   | non-starter | "Won't start. Turns over, nothing catches." | flat-battery: ignitionEcu -> worn, 55; fuel-pump: fuelSystem -> poor, 30; seized-engine: block -> poor, 15 |
   | tick-at-idle | "Faint tick at idle. Probably nothing." | lifter-tick: headValvetrain -> worn, 70; rod-knock: internals -> poor, 30 |
   | wont-idle | "Won't hold an idle. Hunts and dies." | vacuum-leak: intake -> worn, 50; tired-ecu: ignitionEcu -> poor, 30; worn-cams: camsTiming -> poor, 20 |
   | crunch-into-second | "Crunches into second when cold." | worn-synchros: gearbox -> worn, 60; chewed-gearset: gearbox -> poor, 40 |
   | clunk-over-bumps | "Clunks over bumps at the back." | tired-bushes: antiRollBars -> worn, 45; blown-dampers: dampers -> poor, 35; steering-play: steering -> poor, 20 |
   | pulls-under-braking | "Pulls left under braking." | glazed-pads: brakePadsDiscs -> worn, 55; seized-calliper: brakeCalipersLines -> poor, 45 |
   | overheats-in-traffic | "Runs hot in traffic. Fine on the move." | fan-switch: ignitionEcu -> worn, 40; tired-radiator: cooling -> poor, 40; early-head-gasket: headValvetrain -> poor, 20 |

   Test definitions (per symptom; minutes in `diagnosticTests.json`, partitions in the symptom
   entry). Result copy: one line per partition group, authored in content.

   | Symptom | Test (minutes) | Partition |
   | --- | --- | --- |
   | smokes-on-startup | cold-start-watch (10) | [valve-seals, tired-rings] vs [head-gasket] |
   | smokes-on-startup | compression-test (25) | [valve-seals] vs [tired-rings, head-gasket] |
   | non-starter | electrics-check (10) | [flat-battery] vs [fuel-pump, seized-engine] |
   | non-starter | hand-crank (15) | [seized-engine] vs [flat-battery, fuel-pump] |
   | tick-at-idle | stethoscope (15) | [lifter-tick] vs [rod-knock] |
   | wont-idle | spray-test (10) | [vacuum-leak] vs [tired-ecu, worn-cams] |
   | crunch-into-second | gearbox-oil-check (15) | [worn-synchros] vs [chewed-gearset] |
   | clunk-over-bumps | bounce-test (10) | [blown-dampers] vs [tired-bushes, steering-play] |
   | clunk-over-bumps | undercarriage-look (15) | [tired-bushes] vs [blown-dampers, steering-play] |
   | pulls-under-braking | wheel-off-look (15) | [glazed-pads] vs [seized-calliper] |
   | overheats-in-traffic | coolant-check (10) | [early-head-gasket] vs [fan-switch, tired-radiator] |
   | overheats-in-traffic | warm-idle-watch (20) | [fan-switch] vs [tired-radiator, early-head-gasket] |

   `wont-idle` has ONE yard test by design: tired-ecu vs worn-cams is the bench-only ambiguity
   (spec dial 5). `glazed-pads` targets an unrepairable slot (`brakePadsDiscs`): the fix is a
   replacement, priced by the existing atoms; that is intended.
5. **`economy.diagnosis`** key: `{ fearPremium: 1.1, symptomChanceByTier: { shitbox: 0.45,
   common: 0.30, uncommon: 0.22, rare: 0.12 }, secondSymptomChance: 0.15, maxSymptomsPerCar: 2,
   visitMinutes: 60, travelFeeYenByTier: { "local-yard": 2000, "regional": 8000, "premium":
   20000, "collector-network": 50000 } }` (visit fields consumed in Sprint 74; ship the whole
   key now). Add to `schemas.test.ts` anchors and the economy-bible audit table (pre-approved
   2026-07-15; note it in the bible changelog line).
6. **The blind-buy guardrail.** `computeSymptomCoherence(context)` in `coherence.ts`: for each
   symptom on a representative generatable car per tier (reuse the probe-car construction),
   compute `edgePerCauseYen[i] = sheetGuide - marketValueYen(view with cause i)` and
   `blindBuyEvYen = expectedTrueValue - sheetGuide`. Assert: `blindBuyEvYen >= 0` and
   `blindBuyEvYen <= 0.2 x (apparentValue - expectedTrueValue)`; at least one cause edge is
   positive (a sleeper exists) and at least one is negative (a trap exists) for every symptom.
   Disclose the full table in the balance report.
7. **Lot card this sprint** (read-only knowledge): the symptom line(s) under the provenance
   line; the open cause checklist (`[ ]` idiom from `ServiceTaskList.vue`) with derived
   per-cause repair estimates (`costToBandYen` from the apparent band to `fine`... no: the
   estimate shown per cause is `marketValueYen(apparent) - marketValueYen(apparent with cause
   applied)`, labelled "if it's this: about -¥X"); grade stamps and `restorationBillYen` now
   computed from `apparentViewOf` (change the `computeAuctionGrade` call at `gameStore.ts:1538`
   and the bill source in `lotDetail`); guide value shows `sheetGuideValueYen` labelled "guide
   (as graded)". No inspect button yet (Sprint 74).
8. **Sheet grade stays apparent forever** on the lot; sale-side buyers keep pricing the true
   car via `marketValueYen` (no code change; assert it in a test).
9. **Symptoms only spawn at auction generation** (not service-job cars, not the dev-granted
   car). `SAVE_VERSION` 32 -> 33, no migration.

## Tasks

**Claude:**

1. Content: `content/src/symptom.ts` (Zod: symptom, cause, test-application shapes),
   `content/src/diagnosticTest.ts`; data files per decision 4 (8 symptoms, 10 distinct test
   ids, all result copy authored, weights as tabled); `economy.diagnosis` per decision 5;
   exports, `data.ts` parses, `SimContext` + `buildSimContext` + `gameStore` wiring; content
   guard tests (schema parse, id uniqueness, weights sum to 100, every cause part id is a real
   `CarPartId`, every partition covers the full cause set exactly once, at least 2 causes per
   symptom).
2. `CarInstance` fields per decision 1 (+ codec roundtrip test); `SAVE_VERSION` 33.
3. Generation per decision 2 inside `generateAuctionCarInstance`, with tests: honest cars have
   `null` apparent record; a symptomatic car's true band is worse-or-equal; the Law 2 drop rule
   fires (construct a near-ceiling car, force a heavy cause, assert the symptom dropped and
   apparent restored); determinism (same seed, same symptoms).
4. `diagnosis.ts` per decision 3 with unit tests (apparent view purity; expected-value maths on
   hand-computable fixtures; premium arithmetic).
5. The `carGuideValueYen` seam + the rival-blindness test per decision 3.
6. `computeSymptomCoherence` per decision 6 + report disclosure in `tools/balance` (a new
   section rendering the table; label bot-derived nothing: this is closed-form).
7. Lot card per decision 7 (store `LotDetail` gains `symptoms: { line: string, causes: {
   label: string, deltaYen: number }[] }[]`; `AuctionScreen.vue` renders them).
8. Golden re-pins with comment; full gate; Exit.

**User-only (maintainer):**

- None.

## Definition of done

- Symptomatic cars generate with fixed true causes and apparent records; Law 2 holds on every
  generatable TRUE car via the drop rule; honest cars are untouched.
- The whole room (reserve, buyout, rivals) prices `sheetGuideValueYen`; rivals are provably
  blind to knowledge state; buyers keep pricing truth.
- The blind-buy guardrail passes for all 8 symptoms on all 4 tiers and its table is in the
  balance report.
- Lot cards show symptom lines, open cause lists with derived deltas, apparent-based grades and
  bills; all copy British, no decorative Unicode.
- `SAVE_VERSION` 33; full gate green; goldens re-pinned.

## Exit

**Built, matching the decisions above:**

1. Content: `packages/content/src/symptom.ts` (`CauseSchema`, `TestApplicationSchema`,
   `SymptomSchema`) and `diagnosticTest.ts` (`DiagnosticTestSchema`, a flat `{id, minutes}`
   registry - the partition + result copy live on the symptom's own `tests` entries instead, since
   a partition only makes sense against the specific cause list it narrows). `symptoms.json` (8
   entries) and `diagnosticTests.json` (12 entries - task 1's own text says "10 distinct test
   ids"; decision 4's table actually names 12 distinct ids, so 12 is what shipped, a doc-typo
   correction rather than a design choice) authored per decision 4's tables verbatim, weights
   summing to 100 per symptom, every result line British-spelled with no em dashes.
   `economy.diagnosis` added per decision 5 (reuses `ByAuctionTierSchema` for
   `travelFeeYenByTier`, a new explicit object for the 4-key `symptomChanceByTier`); `schemas.test.ts`'s
   anchor list and `economy-bible.md`'s audit table + Amendment log updated in this commit.
2. `CarInstance` gained `symptoms` (default `[]`) and `apparentBandByPartId` (default `null`,
   `z.partialRecord` - a genuinely sparse per-part map, not Zod's record-over-an-enum default of
   "every key required," which the schema needed spelling out explicitly); `SAVE_VERSION` 32 -> 33,
   the pure additive case, no migration. Every raw (non-`.parse()`-routed) `CarInstance` literal in
   sim/game source and tests updated to include both fields (`coherence.ts`'s three probe-car
   builders, `auctions.ts`'s own construction, and every affected test fixture).
3. Generation (`auctions.ts`): `rollSymptomCount` (two independent chance rolls, capped at
   `maxSymptomsPerCar`), `pickWeightedCause` (the established cumulative-sum-over-one-`rng.next()`
   convention already used by `rollUpkeepTier`/`pickServiceJobTemplate`), and `applySymptoms`
   (applies each drawn symptom's cause to the ALREADY Law-2-compliant car
   `generateAuctionCarInstance` produces, then re-runs `enforceMaxBillFraction` and drops the
   symptom outright - reverting to the pre-symptom state - if the guard had to alter anything).
   `generateAuctionCarInstance` gained a trailing `allowSymptoms` parameter (default `true`,
   mirroring `allowMissingSlots`'s own precedent); `serviceJobs.ts`'s customer-car generation call
   passes `false` (decision 9).
4. `packages/sim/src/diagnosis.ts`: `apparentViewOf` (pure, degenerates to identity for an honest
   car), `expectedTrueValueYen` and `sheetGuideValueYen` (both share one internal
   `symptomDiscountYen` helper computing the apparent view/value and walking the cause list
   exactly ONCE, rather than each recomputing it independently - a real performance fix found
   while gating the full suite, not part of the original design, see below).
5. `bidding.ts`'s `carGuideValueYen` branches on `car.symptoms.length > 0` to `sheetGuideValueYen`;
   every downstream reader (`reserveYen`, `computeBuyoutPriceYen`, `privateValuationYen`,
   `advanceLotOvernight`) reprices through this one seam untouched. Rival blindness and sale-side
   blindness (decision 8) both proved directly in `diagnosis.test.ts`.
6. `computeSymptomCoherence` (`coherence.ts`) - the blind-buy guardrail, one row per symptom x
   fitment tier on a shared `buildCleanProbeCar` helper (extracted from `computeDonorCoherence`'s
   own inline construction, now reused by both - directive 3). Hard-gated in `coherence.test.ts`
   (all 8 symptoms x 4 tiers: `blindBuyEvYen` in `[0, 20%]` of the apparent-to-expected gap, both a
   positive and a negative cause edge present); disclosed in the balance report
   (`exportCareers.ts`'s `symptomCoherence.csv`, `data.py`/`report.py`'s new section) - not
   Python-invariant-gated, matching `computeDonorCoherence`'s own precedent (Sprint 71 decision 8)
   of TS-gated-and-report-disclosed rather than duplicating the same closed-form assertion in both
   languages.
7. Lot card: `LotDetail` gained `symptoms: {line, causes: {label, deltaYen}[]}[]`
   (`lotSymptomViews`, `gameStore.ts`) - each cause's `deltaYen` is a plain, honest
   `marketValueYen(apparent-with-this-cause) - marketValueYen(apparent)` comparison, never the
   fear-priced sheet gap. `groupBands`/`auctionGrade`/`restorationBillYen` all re-sourced from
   `apparentViewOf(lot.car)` instead of the true car (the doc's own instruction only named grade
   stamps and the bill; `groupBands` feeds the SAME lot card next to them and would otherwise leak
   the true damage state right beside an apparent-based grade - a deliberate consistency extension,
   not a scope creep, documented here rather than silently done). `AuctionScreen.vue` renders the
   symptom line(s) + a `[ ]`-idiom cause checklist (decision 7 says "the idiom," not the literal
   `ServiceTaskList.vue` component - the shape genuinely differs, an extra `deltaYen` per row that
   component doesn't render, so this is new scoped markup/CSS following the same look, not a
   change to the shared component). Placement: decision 7 says "under the provenance line," but
   `AuctionScreen.vue` has no rendered provenance line today (confirmed by search) - placed under
   the grade stamps instead, the closest existing "condition disclosure" anchor on the card.
   "guide (as graded)" label added to the existing guide-value line (the number itself was already
   `sheetGuideValueYen`-sourced via the `carGuideValueYen` seam - no computation change needed,
   only the caption).
8. Golden hashes re-pinned twice this sprint, both confirmed stable (re-run to the same value):
   first for the generation change alone (`edd4dc35` -> `4570c86a`, `79f49596` -> `f1e394b3` -
   every generated car now rolls one extra symptom-count check even when it lands on zero,
   shifting every subsequent random draw), then again for the `carGuideValueYen` seam going live
   (`f1e394b3` -> `404a063c` on the acquisition/sale career only - the won/sold car itself carries
   no symptom, confirmed directly, but another lot on the SAME board can, and `advanceLotOvernight`
   reprices every active lot nightly, so a symptomatic lot elsewhere shifts `marketHeat` and which
   lots clear - a real economy-wide consequence of the seam, not a bug in this scenario's own car).

**A real performance fix found while gating, not part of the original design:** running the full
`pnpm test:coverage` gate timed out two `bots/runCareer.test.ts` tests
(`BOOTSTRAP_SAMPLE_TIMEOUT_MS`, 200-seed Cautious Restorer samples) that were comfortably under
budget before this sprint. Root cause: a symptomatic lot now reprices through `sheetGuideValueYen`
(several extra `marketValueYen` calls, one per cause) every time `carGuideValueYen` is read -
reserve, buyout, every rival cohort's private valuation, every night the lot stays open - real,
deliberate added work from decision 3's seam going live, not a bug. Fixed two ways: (1) a genuine
waste was found and removed - `sheetGuideValueYen` was calling `expectedTrueValueYen`, which
independently recomputed the exact same apparent view and value from scratch; both now share one
`symptomDiscountYen` helper, computing the apparent view/value and walking the cause list exactly
once; (2) even after that fix, measured directly under `pnpm test:coverage` (v8 instrumentation
overhead the test's own existing comment already documents as the reason this constant exists at
all): ~22.4s and ~21.9s for the two tests, up from comfortably under the old 20s budget - real,
bounded added cost from a deliberate feature, not a runaway regression, so `BOOTSTRAP_SAMPLE_TIMEOUT_MS`
raised 20,000 -> 45,000 with real headroom, the same "explicit wall-clock budget, not a looser
assertion" precedent this exact constant was introduced under (Sprint 41).

**Directive 17 statements for every existing test this sprint touched** (all case (a) - the
implementation intentionally changed what's correct):

- `packages/content/tests/gameState.test.ts`: the hand-built round-trip fixture's one owned car
  gained `symptoms: []`/`apparentBandByPartId: null` - the two new fields default-fill on parse, so
  a fixture missing them no longer parses back to byte-identical input.
- `packages/sim/tests/generationCoherence.test.ts`: "a barely-driven car is never rough" now
  excludes any car that rolled a symptom from its sample - a symptom's cause is a DELIBERATE,
  mileage-independent exception to that invariant (the entire point of a symptom is a surprising
  fault on an otherwise-fine-looking car), not a regression in the age/mileage/upkeep wear model
  the test was written to cover; renamed to say "from the wear model alone" so the narrowed scope
  is legible in the test name itself.
- `packages/game/src/stores/gameStore.jobs.test.ts`: `findUnfinishedRepairOffer` narrowed to a
  SURFACE-depth band-only task specifically - this file's own work-loop only ever knew the simple
  on-car `repair()` verb, which Sprint 71's bench-only rule already refused for a bolt-on/buried
  slot (a pre-existing gap in the test's own logic, invisible until this sprint's extra
  generation-time RNG draw happened to shift which template the shared seed's offer stream
  produces, handing this specific test a buried-part template - `Cams & Timing must be fine` on
  `camsTiming` - for the first time). Not a new mechanic exposing a new gap; a latent one, newly
  reached.
- `packages/sim/tests/bots/runCareer.test.ts`: `BOOTSTRAP_SAMPLE_TIMEOUT_MS` re-measured and raised
  - see the performance-fix note above; not a behavioural assertion change.

**Not done / deferred (by design, per the decisions above):**

- Sprint 74's inspection verb (running a test, narrowing `remainingCauseIds`) - `tests` content
  shipped this sprint per decision 4's own instruction, but nothing consumes it yet.
- Teaching any bot to react to a symptom (buy blind, run a test, adjust a bid) - out of scope for
  this sprint and not part of any decision above; existing bots simply price whatever
  `carGuideValueYen` returns, same as every other lot.

**Gate:** `pnpm typecheck` / `pnpm lint` / `pnpm format` / `pnpm test:coverage` (1228 tests, 89
files, all green; coverage 89.62/79.71/92.17/93.46 stmts/branch/funcs/lines against the 80/65/78/82
thresholds) / `pnpm build` all green. Balance harness run for real (`pnpm balance:run` + `python -m
balance.cli check` + `python -m balance.cli report`): the new `symptomCoherence.csv`/report section
render correctly with real content; the only hard-gate failure is the already-disclosed, unrelated
`competent-policy` Days-to-`local` stall (Sprint 71/72's own known gap, re-confirmed not
re-litigated here).
