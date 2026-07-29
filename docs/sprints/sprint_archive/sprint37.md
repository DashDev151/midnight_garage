# Sprint 37: The job ladder (capability-ceiling content)

*Arc: Progression Rework. Read `docs/design/progression-bible.md`, `arc-progression-rework.md`,
`sprint36.md`'s Exit, and `CLAUDE.md` in full; no em dashes anywhere. Sprint 36 built the
tool-tier mechanics; this sprint authors the content that makes them matter. The FULL template
set is specified below; implement exactly, do not invent or drop templates.*

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (this sprint is ~90% content):**

- The template pipeline as-is: `serviceJobTemplates.json` fields, `ServiceJobTypeSchema`, derived
  payouts (`serviceJobCostBreakdown` -> `deriveServiceJobPayoutYen`, margin floor 1.2x), the
  profitability guard (`serviceJobPayout.test.ts`, 1.15x across every template x model x band).
  Payouts are NEVER authored.
- Sprint 36's `minToolTier` field + offer/accept enforcement: this sprint only sets values.
- `SERVICE_JOB_TIER_MIN_REPUTATION` (reputation gating of job tiers 1-4) stays orthogonal: a
  template has BOTH a reputation tier (who trusts you with it) and tool ceilings (what your shop
  can physically do).
- `installFitGate` (`jobs.ts`) for the one own-car ceiling below.
- The flavor/integrity guards: `integrity.test.ts` (flavor lines only name groups the template
  touches), the em-dash guard, parody-brand law.

**Genuinely new (small):** the authored template content; the NA-to-turbo own-car ceiling.

## Locked specification

### 1. The template set (32 templates: 17 kept, 15 new)

`packages/content/data/serviceJobTemplates.json` is replaced with EXACTLY this set. Notation:
`repair part->band @T` = repair task, targetBand, minToolTier T; `install part (grade+) @T` =
install task, minGrade, minToolTier T. Kept ids keep their id strings verbatim.

**Engine ladder**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| cooling-system-service (kept) | 1 | 4 | 4 | repair cooling->fine @1 |
| electrics-once-over (kept) | 1 | 4 | 5 | repair ignitionEcu->fine @1 |
| timing-refresh (new) | 1 | 4 | 5 | repair camsTiming->fine @1 |
| fuel-system-clean (new) | 1 | 3 | 4 | repair fuelSystem->fine @1 |
| top-end-refresh (new) | 2 | 5 | 10 | repair headValvetrain->fine @2, repair camsTiming->fine @2 |
| head-rebuild (new) | 3 | 6 | 16 | repair headValvetrain->mint @2 |
| race-turbo-upgrade (kept) | 4 | 6 | 32 | install forcedInduction (race+) @1 |
| forced-induction-conversion (kept) | 4 | 8 | 30 | install forcedInduction (sport+) @3 |
| engine-internals-rebuild (kept) | 4 | 8 | 28 | install internals (sport+) @3, install headValvetrain (sport+) @3 |

(race-turbo-upgrade is @1 by maintainer ruling: swapping a turbo on an already-boosted car is
bolt-on; the CONVERSION is @3. The offer/fit machinery already distinguishes them by the car's
slot state.)

**Drivetrain ladder**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| driveline-service (new) | 1 | 4 | 5 | repair driveline->fine @1 |
| clutch-swap (kept) | 2 | 5 | 10 | install clutch (street+) @1 |
| gearbox-rebuild (kept) | 3 | 6 | 18 | install gearbox (sport+) @2 |
| differential-upgrade (kept) | 3 | 6 | 16 | install differential (sport+) @2 |

**Suspension ladder**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| brake-pads-service (new) | 1 | 3 | 4 | repair brakePadsDiscs->fine @1 |
| coilover-install (kept) | 1 | 4 | 6 | install dampers (street+) @1 |
| suspension-refresh (kept) | 2 | 5 | 11 | repair dampers->fine @2, repair springs->fine @2 |
| brake-system-overhaul (new) | 2 | 5 | 12 | repair brakePadsDiscs->mint @2, repair brakeCalipersLines->fine @2 |
| alignment-and-setup (new) | 3 | 6 | 18 | repair steering->fine @3, repair antiRollBars->fine @3 |

**Wheels ladder**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| tyre-fit-and-balance (new) | 1 | 3 | 4 | repair tyres->fine @1 |
| tyres-and-pads-service (kept) | 1 | 4 | 6 | repair tyres->fine @1, repair brakePadsDiscs->fine @1 |
| fresh-rims-fitment (new) | 2 | 4 | 9 | install rims (street+) @1 |
| staggered-setup (new) | 3 | 5 | 15 | install rims (sport+) @2, repair tyres->mint @2 |

**Body ladder**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| small-bodywork-touchup (kept, re-tiered 2->1) | 1 | 4 | 6 | repair panels->fine @1 |
| underbody-derust (new) | 2 | 6 | 12 | repair underbody->fine @2 |
| put-her-in-a-ditch (kept) | 2 | 6 | 14 | repair panels->fine @2, repair dampers->fine @2, install tyres (stock+) @1 |
| shaken-prep (kept) | 2 | 6 | 12 | repair underbody->fine @2, repair brakePadsDiscs->fine @1, repair exhaust->fine @1 |
| full-respray (kept) | 3 | 7 | 20 | repair paint->mint @3 |
| aero-fitment (new) | 4 | 7 | 26 | install aero (race+) @3 |

**Interior ladder**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| cabin-once-over (new) | 1 | 3 | 4 | repair dashGauges->fine @1 |
| seat-retrim (new) | 2 | 5 | 10 | repair seats->fine @2 |
| interior-retrim (kept) | 3 | 6 | 16 | repair seats->mint @2, repair dashGauges->mint @2 |

**Flagship**

| id | rep tier | deadline | baseRep | tasks |
|---|---|---|---|---|
| full-restoration (kept) | 4 | 10 | 32 | repair block->fine @3, repair paint->mint @3, repair seats->mint @2, install rims (street+) @1 |

Every template keeps/authors a `flavorPool` of >= 2 lines: first-person customer voice, 1995
Japan, may only name component groups the template touches (integrity guard), parody brands only,
no em dashes. Kept templates keep their existing flavor lines (extend where a re-tier changed the
work); new templates get fresh lines in the same register (direction: T1 = everyday complaints,
"pulls to the left", "temp creeps on hills"; T3/T4 = enthusiast briefs, "build it to handle
boost", "want it corner-weighted for Tsukuba").

### 2. The own-car ceiling (NA-to-turbo conversion)

`installFitGate` (`packages/sim/src/jobs.ts`): installing a part into the `forcedInduction` slot
of a car whose slot is legitimately-empty-NA (the existing `hasForcedInduction(model) === false`
distinction from Sprint 26) requires `toolTiers.engine >= 3`. Refusal day-log reason:
`'tool-tier'` (same vocabulary as the Sprint 36 accept refusal). The ceiling value (3) lives in
`economy.json` as `toolCeilings: { naToTurboConversionEngineTier: 3 }` (content law), schema'd in
`economy.ts`. UI: the replace drawer's install control for that case is disabled with reason
"Needs Machine-shop tooling" (reuse the Sprint 35 disabled-control pattern in `PartCard.vue`).
Installing into an already-turbo car's slot stays @1 (bolt-on swap).

### 3. Tests

- Day-one board (`serviceJobs.test.ts`): across 300 fresh seeds, (a) every offer's max deficit
  <= 1 with at most one deficient group (re-assert Sprint 36's rule against REAL content), (b)
  the union of offered templates' groups across all seeds covers all six groups, (c) no single
  template id exceeds 40% of all day-one offers pooled across the 300 seeds.
- Ladder sanity: for each of the six lines, median derived payout (over the roster, seeded) of
  its highest-minToolTier template exceeds its lowest's (involved work pays better, verified not
  asserted).
- `serviceJobPayout.test.ts`: update template ids; the 1.15x floor must pass for every new
  template WITHOUT weakening the floor.
- `integrity.test.ts` flavor-group guard green over the new set.
- NA-to-turbo: fit gate refuses at engine 1-2, allows at 3 (sim test); drawer disabled-with-
  reason (game test).
- Re-pin advanceDay golden hashes (template count changes offer RNG draws): real hashes from
  failures only.

## Definition of Done

- All six lines offer day-one work; the day-one board is diverse and honest (test-enforced).
- Ladder verified: payouts rise with ceiling tier per line; profitability floor green for all 32.
- NA-to-turbo impossible below engine T3 with a visible reason.
- Full gate green; balance harness (orchestrator-run) disclosed; days-to-`local` re-based only
  with recorded maintainer approval.

## Fences

Do NOT touch payout derivation code, the margin floor, tool-tier mechanics, the value model,
auctions/bidding/selling, or reputation logic. Content values in JSON only (the one code change is
the `installFitGate` ceiling + its schema field). Do NOT run the balance harness.

## Exit

Implemented directly (no subagent, per maintainer directive 2026-07-12). All 32 templates authored
exactly per the locked spec table (17 kept ids unchanged, 15 new); every task carries an explicit
`minToolTier`. `race-turbo-upgrade` stays @1 (bolt-on swap on an already-boosted car);
`forced-induction-conversion` is @3 (the conversion itself). Flavor lines for kept templates were
reused verbatim (no re-tier changed which parts/groups a template touches, so the integrity
flavor-group guard needed no rewriting); 15 new templates got fresh flavor lines in the T1
everyday / T3-T4 enthusiast-brief register, checked by hand against `integrity.test.ts`'s
foreign-word guard (including the `"underbody"` contains `"body"` substring trap - safe since body
is always the touched group when `underbody` is mentioned).

**NA-to-turbo ceiling.** One new pure sim helper, `naToTurboConversionBlocked` (`jobs.ts`), the
single source of truth wired into both `installFitGate` (the sim gate, reason `'tool-tier'`) and
the game store's `stageAction` (mirrors the sim gate pre-emptively, same pattern the existing
Sprint 24 fix 2 fit-check already used) and a new `installBlockedReason` (drives the UI). Only the
FIRST conversion is gated - a car that already carries a forced-induction part (factory-turbo or
previously converted) swaps freely at any tier, verified directly against the pure predicate.
`toolCeilings.naToTurboConversionEngineTier: 3` lives in `economy.json` (content law); the
`job-blocked` reason enum gained `'tool-tier'` alongside the existing `part-does-not-fit`.

**UI.** `PartCard.vue` gained a `noFitReason` prop (overrides the generic "doesn't fit here" hint);
`ReplaceDrawer.vue` computes the block once per drawer and passes it through, dimming every
candidate with "Needs Machine-shop tooling" when the conversion isn't unlocked yet - reusing the
existing `fits`-gates-interactivity mechanism rather than a new locked-reason branch.

**Tests.** Three Sprint-36-era tests broke on contact with real content (all expected, all fixed):
a `isServiceWorkDone` fixture that needed a genuinely MISSING tyres slot instead of a stock one
(put-her-in-a-ditch's install task is now `stock`+ per spec, trivially satisfied by any installed
tyre); the Sprint-36 placeholder "every minToolTier is 1" accept test, replaced by two real-content
tests (a tier-1 template accepts outright, `put-her-in-a-ditch` at tier 2 is refused on a fresh
game); and the day-one-board test's hard `maxDeficit === 0` assertion, replaced by three real
Sprint 37 DoD checks (max deficit <=1 always; the union of day-one offers touches all six groups
across 300 seeds - all 11 tier-1 templates are zero-deficit by construction and between them cover
every line; no single template exceeds 40% share). Added: an NA-to-turbo sim test (`jobs.test.ts`,
refuses at engine tier 1-2, allows at 3, plus a direct proof the predicate never blocks an
already-turbo car) and a CarDetailScreen game test split in two (the original "installs
successfully" case now grants engine tier 3 first; a new case proves the default tier-1 board
blocks the same install with the visible reason and nothing gets staged).

**Ladder verified (ad-hoc, per spec "verified not asserted" - not a committed test).** For all six
lines, the highest-minToolTier template's median derived payout (over the full roster, marginMin)
exceeds its lowest-tier sibling's: engine 20,900 -> 436,950; drivetrain 32,825 -> 622,450;
suspension 18,250 -> 38,125; wheels 22,225 -> 219,650; body 28,850 -> 60,650; interior 20,900 ->
39,450. Involved work pays better everywhere, purely as a consequence of the existing derived-payout
formula (no authored numbers).

**Golden hashes: unaffected, no re-pin needed.** The full test suite (774 tests, up from 768) went
green on the first run against the new content with zero golden-hash failures - the fixed-seed
scripted career in `advanceDay.test.ts` never happens to hit a service-job branch whose output
diverges under the new template pool.

**Gate (all shown, all green):** typecheck (content/sim/game); lint; format; `pnpm test` 774/774;
`pnpm test:coverage` 774/774 (statements 90.36%, branches 78.91%, functions 90.49%, lines 94.2%,
all above the 80/65/78/82 thresholds); `pnpm build`.

**Balance harness:** run directly (maintainer directive: sanity-check only this sprint, no deep
tuning analysis - full balance work follows arc close per Sprint 36's Exit). All hard invariants
PASS. Days-to-`local` p50 = 12.0 (in [10,35], down from Sprint 36's 19.0). No strategy below the
sanity floor; nothing catastrophic (no crashes, no runaway numbers). Day-100 medians moved with
the richer, honest tier-1 job content (service-grinder 1.93M -> 355k; competent-policy 176k ->
504k; flipper/restorer/handyman/balanced still negative or near-zero, same shape as Sprint 36's
disclosed movement) - not analyzed further here per the maintainer's explicit instruction; real
tuning is deferred to the arc-end balance pass (Sprint 36's Exit + `TODO.md`).
