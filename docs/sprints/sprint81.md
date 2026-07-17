# Sprint 81 - Content wave I: the roster to 25, diagnosis to 14 symptoms

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes anywhere. British English in all player copy. This sprint is almost entirely content on
proven machines; the machines do not change. All authored player-facing strings are subject to
the maintainer's content-quality directive (2026-07-17): drafts are produced in the scratchpad,
personally swept by the orchestrator (never cheesy, cringey, unrealistic, or culturally
insensitive; understated, dry, era-true 1995 Japan; no romaji sprinkles, no stereotypes, no
anachronisms), and only then integrated into `packages/content`.

## Confirmed current state (after Sprint 79)

- `packages/content/data/cars.json` holds 10 models; the roadmap's Phase 5 first wave targets 25.
- `symptoms.json` holds 8 symptoms (19 causes), `diagnosticTests.json` 12 tests; the arc review
  (2026-07-16) flagged 8 symptoms as a thin v1 for a system whose progression is learning the
  cause tables.
- The guard rails all exist and are content-blind: the centralised pricing formula and anchor
  economy (economy bible), `computeModelCoherence` (per-model Law 1/2/3/6 rows),
  `computeSymptomCoherence` (blind-buy EV bounds, sleeper and trap edges per symptom), the
  naming-layer CI test (no real-brand leak under the parody flag), the spelling and em-dash
  guards, and golden-master determinism tests.
- Maintainer direction (2026-07-17): flesh content out generously; too much beats too little;
  cutting is easy. Quality of flavour and world-building is paramount and gated by the
  orchestrator's sweep.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:** everything. The generation chain, pricing formula
(`partPricing.json` factors), fitment classes, buyer-taste tags, upkeep rolls, the symptom/cause/
test schemas and their coherence probes, the naming layer, and all guard tests consume new rows
with zero code change. The roster bible (`midnight-garage-roster.md`) is the sole source of car
scope; the GDD is canonical for mechanics.

**New mechanisms:** none. If a new symptom genuinely needs a new diagnostic-test partition shape
the schema cannot express, STOP and escalate to the orchestrator rather than extending the
schema silently.

## Decisions

1. **Roster wave: 10 to 25 models.** All 15 additions chosen from the roster bible's scope
   tiers; no invented cars; cite the roster entry for each. Spread the wave across fitment
   classes so every tier's auction pool deepens (indicatively 3 shitbox / 5 common /
   4 uncommon / 3 rare, adjusted to what the roster bible actually offers). **The roster
   document contains a maintainer-secret entry ("The Zero Legend"): it is excluded from this
   wave entirely and must never be referenced in content, code, comments, or notes.**
2. **Per-model requirements.** Real `spec` data (era-correct 1995-or-earlier chassis and engine
   codes, curb weight, stock power) with the naming layer respected from birth: swappable
   `display_name`/`brand` strings and parody equivalents, following the register of the existing
   10 (read them first); `bookValueYen` anchored against comparable existing models per the
   economy bible's anchor inventory, never invented in isolation; fitment class, buyer-taste
   tags, upkeep tier, and part `requiredTags` coverage so the existing 464-part catalogue fits
   every new model (add parts rows only where a slot would otherwise have no fitting part).
3. **Diagnosis wave: 8 to 14 symptoms.** Six new symptoms, each with 2-3 causes (weights
   summing to 100, per-cause `carPartId` and `setBand` drawn from the shipped taxonomy), each
   containing at least one sleeper and one trap edge (probe-enforced), with repair estimates
   derived (never authored) per the diagnosis spec. Reuse the 12 existing test partitions where
   they honestly separate the new causes; author at most 4 new tests (10-25 minutes each, named
   for real workshop procedure); preserve at least one bench-only ambiguity across the full
   symptom set. `computeSymptomCoherence` must pass over all 14.
4. **Flavour surface.** New symptom lines (diegetic, one sentence, auction-sheet register), test
   result copy, and parody brand/display names are the world-building surface of this sprint;
   all of it flows scratchpad first, orchestrator sweep second, repo third. Existing shipped
   copy sets the voice; when in doubt, quieter.
5. **Balance and goldens.** New models and symptoms change generation pick pools: golden hashes
   re-pin with stated cause (directive 17 case (a)). Run the full balance harness and
   `balance.cli check`; hard-gated coherence rows must pass for every new model; disclose any
   informational movements in the Exit. Story-mission probe content is untouched by this wave
   (missions reference specific models that all remain).
6. **Volume over caution, cuts are cheap.** Where the roster bible offers alternatives within a
   tier, prefer authoring more rather than fewer; the maintainer cuts at review. The sweep, not
   the volume, is the quality gate.

7. **The world-copy pass (maintainer directive 2026-07-17).** Beyond the new content, this
   sprint revises the entire shipped flavour surface under `packages/content/data`: service-job
   template descriptions and customer voice, the shipped 8 symptom lines and 12 tests' result
   copy, buyer blurbs, trait descriptions, technique / tool-line / facility copy, specialty
   word-of-mouth lines, the sale-reveal lines, provenance copy, the customer name pool, and the
   persona mission copy (Sprint 78's maintainer copy approval never happened; this pass is its
   vehicle). The bar: engaging and fun to read, never cringe, and credible to a Japanese player
   who was there: the writing should read as though its author lived in Japan in 1995.
   Authenticity comes from mundane specificity used correctly and sparingly (auction-sheet
   grading vocabulary, shaken realities, kei-car life, period magazine culture), never from
   name-dropping the setting. "No change" is a valid verdict per string: revise only where it
   raises quality, do not churn good copy. All revisions draft in the scratchpad with
   before/after, pass the orchestrator sweep, then integrate.

## Tasks

**Claude (agents, orchestrated):**

1. Draft, in the scratchpad: the 15-model wave (full data rows plus naming-layer strings),
   part-fitment gap analysis and any needed parts rows, 6 symptoms with causes and test
   mappings, up to 4 new tests, and all flavour strings. Cite roster-bible entries per car.
   Separately draft the decision-7 world-copy pass as before/after revisions per string.
2. Orchestrator sweep checkpoint (blocking): flavour and world-building review of every
   authored string; factual spot-check of era claims; approve, rewrite, or strike.
3. Integrate approved content into `packages/content/data`; extend guard-test coverage to any
   new files; verify naming-layer CI passes with the parody flag on.
4. Re-run probes and harness; re-pin goldens with cause; disclose per-model coherence rows and
   symptom coherence for the additions.
5. Full gate; fill the Exit, including the complete list of added models (with roster
   citations) and symptoms for maintainer cut-review.

**Orchestrator (Fable):** the blocking sweep at step 2; final review and sign-off.

**User-only (maintainer):**

- Cut-review of the shipped wave list (anything that reads wrong or overlaps comes out; cuts
  are content deletions with no code impact).
- Sprint review and commit approval.

## Definition of done

- 25 models in `cars.json`, all roster-cited, all passing the per-model coherence rows and the
  naming-layer test; every model auctionable with full part fitment.
- 14 symptoms passing `computeSymptomCoherence`, with at least one bench-only ambiguity and
  honest sleeper/trap edges throughout.
- Every authored string passed the orchestrator sweep before integration, and the decision-7
  world-copy pass has covered every flavour surface under `packages/content/data` with an
  explicit revise-or-keep verdict per string.
- Full gate green, goldens re-pinned with cause, Exit filled with the cut-review list.

## Exit

**Built.** Content wave I is in: 25 models in `cars.json`, 14 symptoms in `symptoms.json` (14 of
the roadmap's Phase 5 targets on both axes), the decision-7 world-copy pass applied, and the
naming-layer guard extended. Zero code-mechanism changes: every new row rides the existing
generation, pricing, coherence, and guard machinery, exactly as the reuse analysis promised.

1. **Roster: 10 to 25 models.** All 15 additions integrated from the orchestrator-swept draft
   (`sprint81-cars-draft.md`), including the sweep's naming rulings ("Prelood Si-V (BB4)",
   "Impressa VRX (GC8)", "Skylene GT-N (BNR32)") and the Sunny B12 `yearFrom` 1987 correction.
   Two post-integration tier rulings and one anchor bump were applied by a second orchestrator
   ruling (2026-07-17) after the coherence machine rejected the swept values; see Deviations.
   No new parts rows: the 464-part catalogue is a complete (slot x class x grade) matrix and
   every shipped part carries `requiredTags: []`, so all 15 models are fully auctionable as-is
   (draft's parts-gap analysis, confirmed by the passing coherence table over all 25).

2. **Diagnosis: 8 to 14 symptoms.** Six new symptoms integrated with the sweep's three copy
   revisions applied (corner-agnostic `sagging-spring` card line, no wheel-runs-true claim in
   `wheel-balance-check` group-2 copy, filler-plug swab instead of a drain in the diff oil
   check). One symptom (`erratic-fuel-gauge`) was cut and replaced post-integration by
   orchestrator ruling (see Deviations); the final set opens `tyres`, `rims`, `driveline`,
   `differential`, `springs`, `chassis`, `panels`, `exhaust`, and a second `cooling` angle.
   New tests: 2 (`wheel-balance-check` 15 min, `ride-height-check` 10 min), well inside the
   at-most-4 budget; `undercarriage-look`, `gearbox-oil-check`, `stethoscope`, and
   `coolant-check` are honestly reused with new partitions. The bench-only ambiguity
   (`wont-idle`'s ECU-vs-cams pair) carries forward untouched.

3. **World-copy pass (decision 7).** Every flavour surface under `packages/content/data`
   reviewed with per-string verdicts (draft `sprint81-worldcopy-draft.md`); 8 strings revised,
   the rest explicit KEEPs. Applied: 3 agent revisions ("properly hunkered down", "callipers",
   "Tyres and pads are both long overdue a change"), 3 orchestrator revisions ("starved of
   fuel", "squealing badly", "quick enough for the zero-yon"), the U1 ruling (wheels tier-3
   tool becomes "Laser alignment & balance rig"; road-force rigs are late-90s product), and
   the U2 ruling (buyers.json displayName "Stancer" becomes "Shakotan"; see the veto flag
   below). Sprint 78's story-mission copy reviewed in full and passed as-is: this pass is the
   maintainer copy approval that never happened.

4. **Naming layer.** `REAL_MODEL_TOKENS` extended with `WRX`, `GT-R`, `VTEC`, `MR2`. `STI` is
   deliberately not listed: the guard is case-insensitive substring matching and `sti` occurs
   inside ordinary English in the guarded copy ("still", "sticks"); `WRX` covers the only
   realistic STI leak (the full "WRX STI" badge, which the parody drops). The leak test folds
   the token list in automatically and passes over all 25 parody names/brands plus the
   service-job, story-mission, persona, and lap-reference copy surfaces. Parody mode differs
   from real mode for every car; no part brand collides with a real car brand.

5. **Probes (decision 5, hard gates).** `computeSymptomCoherence` over all 14 symptoms x 4
   tiers (56 rows): blind-buy EV non-negative and windfall-capped everywhere, sleeper and trap
   edges on both sides of zero on every tier. `computeRosterCoherence` +
   `computeRosterDonorCoherence` over all 25 models: Law 1 (both the mint flip and the
   sensible play), Law 2 (worst bill <= 0.6 x clean), Law 3 (consumables cap), Law 6
   (common/uncommon/rare wage), and whole-beats-parted all pass. Full tables in
   `tools/balance/report.md` (regenerated this sprint).

### The 15-model cut-review list (decision 1, with roster citations)

Tiers as shipped (two re-tiered by ruling, see Deviations). Tier spread 6 shitbox / 2 common /
4 uncommon / 3 rare against the draft's swept 4/4/4/3; pool depth now shitbox 2 -> 8, common
1 -> 3, uncommon 5 -> 9, rare 2 -> 5.

| # | Model | Roster-bible citation | Tier | Book |
|---|---|---|---|---|
| 1 | Toyota Carina (AT150) | Shitboxes: "Toyota Carina (AT150), 3A-U, Grandpa spec" | shitbox | 200,000 |
| 2 | Nissan Sunny (B12) | Shitboxes: "Nissan Sunny (B12), GA15, Fleet white" | shitbox | 180,000 |
| 3 | Suzuki Alto Works (HA21S) | Kei Sport: "Suzuki Alto Works (HA21S), K6A T, Kei hot-hatch wars" | shitbox | 340,000 |
| 4 | Honda Beat (PP1) | Kei Sport: "Honda Beat (PP1), E07A MTREC, MR NA scream" | shitbox | 480,000 |
| 5 | Honda CR-X SiR (EF8) | Fast FWD: "Honda CR-X SiR (EF8), B16A, Auto-add" | common | 560,000 |
| 6 | Honda City Turbo II (AA) | Fast FWD: "Honda City Turbo II (AA), ER Turbo, Bulldog" | shitbox (re-tiered) | 420,000 |
| 7 | Toyota Sera (EXY10) | Flagships/Weirdos: "Toyota Sera (EXY10), 5E-FHE, Butterfly doors" | shitbox (re-tiered) | 450,000 |
| 8 | Honda Prelude Si VTEC (BB4) | Fast FWD: "Honda Prelude Si VTEC (BB4), H22A, Boulevard sophisticate" | common | 800,000 |
| 9 | Nissan Silvia (S13) | FR/Drift: "Nissan Silvia (S13), CA18/SR20, Drift Pack" | uncommon | 1,100,000 |
| 10 | Toyota MR2 (SW20) | Flagships/Weirdos: "Toyota MR2 (SW20), 3S-GTE, Snap-oversteer lore" | uncommon | 1,400,000 |
| 11 | Nissan Cefiro (A31) | FR/Drift: "Nissan Cefiro (A31), RB20DET, Drift Pack" | uncommon | 1,100,000 (bumped) |
| 12 | Subaru Impreza WRX STI (GC8) | Homologation/AWD Turbo: "Subaru Impreza WRX STI (GC8), EJ20, Rally blue" | uncommon | 1,800,000 |
| 13 | Nissan Skyline GT-R (BNR32) | Homologation/AWD Turbo: "Nissan Skyline GT-R (BNR32), RB26DETT, Godzilla" | rare | 3,600,000 |
| 14 | Nissan Fairlady Z (Z32) | Flagships/Weirdos: "Nissan Fairlady Z (Z32), VG30DETT, Bubble flagship" | rare | 2,900,000 |
| 15 | Toyota Aristo 3.0V (JZS147) | Flagships/Weirdos: "Toyota Aristo 3.0V (JZS147), 2JZ-GTE, Sleeper sedan flip" | rare | 2,800,000 |

The Cefiro anchor note (orchestrator ruling 2): the RB drift trio (180SX, Silvia S13, Cefiro
A31) prices as a set at 1.1M. The common pool is thin at 3 (CR-X SiR, Prelude, Civic SiR-II);
the next roster wave should target 560k+ commons (Eunos Roadster class) to deepen it.

### The 6 added symptoms (cut-review)

| Symptom | Sleeper (worn) | Trap(s) (poor) | Tests |
|---|---|---|---|
| `wheel-vibration` | worn-tyres (55) | buckled-rim (30), worn-driveshaft (15) | `wheel-balance-check` (new), `undercarriage-look` (reuse) |
| `diff-whine` | worn-diff-bearings (60) | chewed-ring-pinion (40) | `gearbox-oil-check` (reuse) |
| `sagging-spring` | sagging-springs (70) | broken-spring (30) | `ride-height-check` (new) |
| `quarter-panel-filler` | panel-respray (75) | structural-rail-repair (25) | `undercarriage-look` (reuse) |
| `damp-passenger-footwell` | heater-matrix-weep (70) | rotten-bulkhead-seam (30) | `coolant-check` (reuse) |
| `exhaust-rasp` | blown-flex-joint (60) | cracked-manifold (40) | `stethoscope` (reuse) |

### Maintainer flags

- **SHAKOTAN RENAME, VETO WELCOME:** `buyers.json` displayName "Stancer" -> "Shakotan" (the
  `stancer` id is a code identifier and stays). "Stancer" is 2010s vocabulary; shakotan is
  what the scene was called in 1995, and the game already uses gaisha/touge/shaken this way.
  A one-string revert if it reads wrong.
- **Honorific house convention (recorded):** English titles (Mr./Mrs./Ms.) belong to job-card
  and ledger labels (translation register); "-san" belongs to spoken dialogue by named
  characters (personas). Both existing surfaces are correct as they stand.
- **`gearbox-oil-check` rename question:** the shipped test id now also serves the
  differential (`diff-whine`, filler-plug swab). Mechanically identical procedure, but the
  name says "gearbox"; a generic rename (e.g. `drain-and-inspect`) is a data-key change
  across symptoms.json and the diagnosis code, a maintainer call, not done here.
- **`forcedInduction` future-wave note:** no symptom targets `forcedInduction` this wave.
  Generation drops a symptom instance whose true cause targets a missing slot, and
  `computeSymptomCoherence` probes one representative model per tier, so a turbo-only cause
  could land on an NA representative and skew the row. A future wave can add a turbo-specific
  symptom once checked against the live roster order. Also deferred: `clutch`, `seats`,
  `paint`, `underbody`, `aero`, and (new, ruling 3) `dashGauges`/interior instruments.
- **Kei balance-watch (draft flag 12), disclosed with real numbers - benign.** Beat: sensible
  flip +124,309 (34.5% of clean), whole 504,000 vs parted 149,235, wage margin -9,772 (0.57x
  rent). Alto Works: sensible flip +81,364 (31.9%), whole 357,000 vs parted 154,610, wage
  margin -9,600 (0.60x rent). Both clear every hard gate; their richer-than-plain-shitbox
  flip fractions are the intended value-for-class effect of cheap parts on a desirable car
  (the same effect the re-tiered City Turbo II at +33.4% and Sera at +34.2% now show), and
  both stay inside the known, disclosed Sprint 72 shitbox wage gap alongside the other six
  shitbox-class models. No gate moved, nothing tuned.

### Full gate (all green)

- `pnpm typecheck` - clean across `content`, `sim`, `game`.
- `pnpm lint` - clean, zero errors.
- `pnpm format` - clean (all matched files use Prettier style).
- `pnpm test:coverage` - 1504/1504 passed across 101 files. Coverage: statements 89.17%
  (>= 80), branches 79.24% (>= 65), functions 92.33% (>= 78), lines 93.09% (>= 82).
- `pnpm build` - succeeds (the pre-existing >500kB main-chunk warning, unchanged).
- `pnpm balance:run` - 900,000 career-day rows (9 strategies x 1,000 careers x 100 days),
  34,806 auction-win rows, 7,863 acquisition rows, 1,009 offer rows, 25 coherence rows.
- `python -m balance.cli check` - exits 0. All 6 hard-gated checks pass over the 25-model
  roster: Law 2 (0/25 out of band), Law 1 worst-roll flip (0/25 non-positive), Law 1 sensible
  play (0/25 non-positive), Law 6 wage on common/uncommon/rare (0/17 non-positive), Law 3
  consumables (0/25 over cap), Law 4 service-job margin (1.18 >= 1.15). The Sprint 72
  shitbox wage gap now discloses 8 models (the 6 wave additions at shitbox class included),
  all in the known -9,600 to -9,772 band. Informational bot checks unchanged in character
  (bots still restore to mint; see Sprint 66/79 notes in the report).
- `tools/balance/report.md` regenerated from the fresh run (25-model coherence table, 14-symptom
  table).

### Golden re-pins (directive 17 case (a))

- `advanceDay.test.ts` 30-day career: `cfcde727` -> `e1cfd24f`.
- `advanceDay.test.ts` acquisition->sale career: `889d6691` -> `65447382`.
  Cause, both: the generation pick pools grew (10 -> 25 models, 8 -> 14 symptoms), so every
  seeded catalog roll from day 7 onward draws different lots and symptom instances. A content
  change, not a sim-logic change; the repeat-run determinism test passes unchanged.
- `integrity.test.ts` shitbox book-value ceiling 400,000 -> 500,000: the Kei-tagged cult cars
  (Beat 480,000) and the re-tiered City Turbo II/Sera legitimately exceed the old
  economy-v0.md sanity cap; the ceiling still catches a genuinely mispriced shitbox.
- Three game tests (`gameStore.market.test.ts`, `EventLogDrawer.test.ts`,
  `CarDetailScreen.test.ts`) that buy out the first local-yard lot: the 25-model pool can put
  a lot there whose buyout price exceeds starting cash; each now grants the buyout price via
  `devGiveCash` first (the in-file Sprint 59 pattern), since affordability was never what
  they exercised.

### Deviations, with why

1. **The previous integrator died mid-run; state verified and completed.** This Exit was
   written by a second integrator. Found on arrival: all three swept drafts fully and
   correctly integrated (zero drift against the stamped rulings, verified string-by-string),
   naming.ts correctly extended, the integrity-test ceiling change in place, but no evidence
   any probe or gate had run, an unfilled Exit, and a leftover scratch probe file
   (`packages/sim/tests/_tmpProbe.test.ts`, removed). Everything was re-verified from zero.
2. **The swept content failed three hard coherence gates on first run; a second orchestrator
   ruling (2026-07-17) resolved all three.** The sweep's flavour/era review could not see the
   class-priced-parts floor that only the coherence machine surfaces:
   - City Turbo II and Sera, as swept (common tier), failed whole-beats-parted (parted
     571,000 vs whole 441,000; 523,000 vs 472,500) and the sensible-play gate (-31.6%;
     -15.6%): common-class parts price against a 550k+ car and both sit below it. RULED:
     re-tier both to shitbox, keeping the swept book values; cheap-parts economics are
     fictionally honest for a 735kg 1983 budget hatch and a Tercel-mechanicals novelty coupe,
     on the Beat/Alto Works precedent. Both now pass everything (+33.4%, +34.2%).
   - Cefiro at the swept 1,000,000 cleared the gates by 0.9%, under the 5% sensible-play
     floor. RULED: bump to 1,100,000, level with its platform-era siblings (the RB drift trio
     prices as a set). Now +9.6%, identical to 180SX/S13.
   - `erratic-fuel-gauge` failed the sleeper-and-trap gate on common/uncommon/rare (both
     causes' edges positive: its trap targeted `dashGauges`, a style-weight-1 part too cheap
     to ever price as a trap; the draft had flagged this as its uncertainty 5). RULED: cut it
     (no re-weighting can fix two cheap causes) and replace with the orchestrator-authored
     `damp-passenger-footwell` (cooling/worn sleeper, chassis/poor trap, reuses
     `coolant-check`), which passes on all four tiers. The unused `gauge-resistance-check`
     test entry was removed with it; interior/dashGauges diagnosis coverage is deferred to a
     future wave pending an honest expensive trap for instrument symptoms.
3. **Tier spread ended 6/2/4/3, not the draft's swept 4/4/4/3** (which was itself a stated
   deviation from decision 1's indicative 3/5/4/3): consequence of ruling 2's re-tiers, not a
   selection change. Decision 1 permits adjusting to what the roster offers; the thin common
   pool is flagged above for the next wave.
4. **Sprint 80's staff work shares this tree** (uncommitted, its own sprint doc): the only
   shared files are `advanceDay.test.ts` (Sprint 80's re-pins and comments preserved; Sprint
   81's re-pins appended after them, so the hash history reads in order) and the untracked
   sprint docs. Nothing else of Sprint 80's was touched.
5. **Save schema unaffected**: no schema change this sprint, so no Dexie bump (`SAVE_VERSION`
   stays 37, Sprint 80's). Directive 19 not triggered.

**Copy polish batch (maintainer-approved 2026-07-17).** Ten service-job customer lines revised
per the orchestrator's weakest-lines review (menu-speak replaced with character voice); the two
staff-bio revisions from the same batch are recorded in sprint80.md's Exit. Verified in-tree with
the full suite green (1511/1511) before commit. The bot-career harness was deliberately NOT
re-run for this text-only batch, per the maintainer's standing ruling that bot careers provide no
value until the harness is rebuilt; the coherence table from this sprint's integration run
stands. Follow-up recorded: unbundle the closed-form coherence CSV from `balance:run`'s career
sims so routine gates never pay the harness's runtime again.
