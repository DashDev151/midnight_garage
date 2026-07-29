# Sprint 80 - Staff I: the hiring machine and the Staff Office

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes anywhere. British English in all player copy and prose; code identifiers keep their
existing spelling (`labor`). All authored player-facing strings in this sprint are subject to the
maintainer's content-quality directive (2026-07-17): drafts go to the orchestrator for a personal
flavour sweep before Exit; nothing cheesy, cringey, unrealistic, or culturally insensitive ships.

## Confirmed current state (after Sprint 79)

Staff is a half-built system whose back half already runs live:

- `packages/content/src/staff.ts` defines `StaffMemberSchema` (id, displayName, stats
  engine/chassis/body/hustle 1-5, weeklyWageYen, trait) and `TraitIdSchema` (5 traits);
  `packages/content/data/traits.json` holds trait copy with no wired effects.
- `GameState.staff` defaults to `[]` and nothing in real play ever populates it.
- Live consumers: `packages/sim/src/laborSlots.ts` (+1 slot per member with hustle >=
  `STAFF_HUSTLE_BONUS_THRESHOLD` = 4), `packages/sim/src/serviceBay.ts` (passive daily income,
  hustle x `SERVICE_BAY_YEN_PER_HUSTLE` x reputation multiplier), `packages/sim/src/finances.ts`
  (weekly wage deduction with a `wage-paid` log entry).
- No hiring path, no candidate content, no Staff Office screen (GDD section 11 lists it as a
  planned screen), no trait effects. GDD section 7: hire up to 4, via job ads / poached at meets /
  story hires; light capped levelling; no morale sim.

This sprint builds the front half: acquisition via job ads, the Staff Office, and the wage
economics, with a closed-form hire coherence probe in place of playtest tuning.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:** `StaffMemberSchema`/`TraitIdSchema` and `traits.json` as-is; the
three live consumers above (this sprint adds zero new staff effects); the day-boundary tick in
`advanceDay.ts` (pattern: `advanceStoryMissions`) for ad refresh; the seeded PRNG stream for
candidate rolls; reputation tiers for ad-quality gating; the Zod content pipeline and content law
for every tunable; the coherence-probe pattern in `packages/sim/src/coherence.ts` and the
Sprint 78 formula-derived-content pattern for wages; existing screen idioms
(`StandingScreen.vue` panels, two-step confirm buttons, `data-test` attributes) for the Staff
Office; the spelling and em-dash guard tests, extended to the new content files.

**New mechanisms:**

1. Candidate generation and the job-ads state (`GameState.staffAds`), refreshed by the day tick.
2. Hire/dismiss resolvers and the Staff Office screen with its route.
3. An `economy.json` `staff` block (wage formula and ad knobs) plus `staffCandidates.json`
   (name/bio pools) and a hire coherence probe.

## Decisions

1. **Scope: acquisition only.** In-play staff effects remain exactly the three existing
   formulas (labour slots, passive bay income, weekly wages). Trait effects, engine/chassis/body
   consumption, assignment/delegation, and skill/XP land in Staff II. The Staff Office displays
   all four stats and the trait copy honestly; the sprint doc and Exit disclose that only hustle
   carries mechanical weight until Staff II. Poaching at meets and story hires wait for the
   events arc; job ads are the sole v1 channel (GDD section 7 lists all three).

2. **Job ads.** `GameState.staffAds`: a list of `{candidate, postedOnDay}`. Refresh runs in the
   day tick on the existing weekly cadence (`day % 7 === 0`, same day wages deduct): expired ads
   (older than `adExpiryDays`) drop, then seeded rolls top the board back up to `maxOpenAds`
   with fresh candidates. All knobs live in the `economy.json` `staff` block: proposed defaults
   `maxOpenAds: 3`, `adExpiryDays: 14`. Ads persist across days until hired or expired; hiring
   removes the ad. One refresh per week keeps the board calm and the decision deliberate.

3. **Candidate generation.** A candidate is a rolled `StaffMember`: display name from
   `staffCandidates.json` name pool (seeded, no repeats against current staff and live ads),
   stats rolled within a per-reputation-tier budget (`statBudgetByTier` in the `staff` block:
   better shops attract better people, consistent with the progression bible's Capability
   pillar), one trait rolled uniformly, and `weeklyWageYen` derived by formula, never rolled
   independently of stats.

4. **Wage formula (content law, Sprint 78 pattern).** `weeklyWageYen` is a pure function of the
   stat line, all coefficients in the `staff` block:
   `wageBaseYen + wagePerStatPointYen * sum(stats) + hustlePremiumYen * max(0, hustle - 3)`,
   rounded to 100 yen. Exact coefficient values are set during implementation so that the hire
   coherence probe passes with honest margins; values are content, the formula relationship is
   asserted by test (content and formula can never drift, as with mission payouts).

5. **Hire coherence probe (closed-form, no playtest needed).** New probe rows alongside the
   existing coherence table, evaluated per reputation tier at that tier's minimum and maximum
   stat budget:

   - Bound A (no money pump), all candidates: `weeklyWageYen >=` the candidate's weekly passive
     bay income at the hiring tier (`hustle * SERVICE_BAY_YEN_PER_HUSTLE * 7 * repMult[tier]`).
     Passive income alone must never repay a wage; the upside has to come from using the slot.
   - Bound B (hiring is worth it), candidates with hustle >= 4 only:
     `weeklyWageYen <= passiveWeekly + 1.5 * slotValueWeekly`, where `slotValueWeekly =
     WEEKLY_RENT_YEN / PLAYER_BASE_LABOR_SLOTS` (the wage law's rent-opportunity convention).
   - Candidates below the hustle threshold have no mechanical value this sprint; the probe
     discloses their wage-to-value honestly rather than asserting it, and the Exit records the
     numbers. Their value arrives with Staff II trait/stat effects.
   - Disclose (not gate) the legend-tier passive income against wages for a member hired early
     and kept: passive income growth with reputation is intended progression, not a leak.

   **Amended 2026-07-17, orchestrator ruling after implementation.** The as-implemented probe
   (above) could only DISCLOSE bound A, because the passive-income economics made it jointly
   infeasible with bound B (see the original Exit finding). The ruling fixed the economics rather
   than living with the disclosure, so both bounds now HARD-GATE:

   - `SERVICE_BAY_YEN_PER_HUSTLE` moved out of `sim/constants.ts` into content
     (`economy.staff.serviceBayYenPerHustlePerDay`, content law) and lowered 3,000 -> 500.
   - Passive bay income is now FLAT and reputation-independent (`hustle * rate * days`, the
     `repMult[tier]` term removed from `serviceBay.ts`): wages carry no reputation term, so income
     must not either, or a fixed-wage hire becomes a fame-scaled annuity. Staff II revisits passive
     scaling with real delegation. This also retires the fourth bullet's legend-annuity disclosure
     (there is no reputation growth of passive income left to disclose).
   - Wage coefficients re-derived by exhaustive search to `wageBaseYen 8000` / `wagePerStatPointYen
     1000` / `hustlePremiumYen 1500` so that: Bound A hard-gates for every candidate in every tier
     (flat passive is tier-independent); Bound B is REDEFINED to hard-gate only the lowest
     reputation tier's minimum-wage hustle-bonus candidate (`local`, stats {1,1,1,4}) at
     `weeklyWageYen <= passiveWeekly + 1.5 * slotValueWeekly`. Higher tiers and higher-stat
     candidates are DISCLOSED per tier, not gated: an ads board containing an overpriced candidate
     is intended design (the decision is the game).

6. **Hiring and dismissal.** Hire: free of signing fee; the member joins `state.staff`
   immediately (labour slot applies from the next day's slot computation; first wage lands on
   the next weekly tick via the existing `finances.ts` path, which needs no changes). Cap:
   `maxStaff: 4` (GDD section 7); hire is refused at cap. Dismiss: immediate, no severance, no
   morale machinery (GDD: no morale sim); two-step confirm in the UI.

7. **The Staff Office screen.** New route and nav entry alongside the existing screens; two
   panels in existing idiom: the roster (name, four stats, trait name and copy, weekly wage,
   dismiss button with two-step confirm) and the job ads board (same card shape plus a Hire
   button, disabled at cap, with the posted/expiry day visible). `data-test` attributes per repo
   convention. Diegetic framing: the board reads as pinned notices, not a menu of stat blocks;
   keep copy minimal and let the numbers sit in a period-plausible frame.

8. **Candidate content and the flavour sweep.** `staffCandidates.json`: a pool of at least 40
   romanised Japanese names (era- and register-appropriate, surname-first display per existing
   persona convention), and a pool of one-line bios attachable to any candidate (trade
   background, previous shop, a plain human detail). Bios are world-building surface:
   understated, dry, zero romaji sprinkles, zero cliches; drafted by the implementing agent,
   then submitted to the orchestrator's personal flavour sweep before merge. The spelling,
   em-dash, and naming guards extend to the new file.

9. **RNG and goldens.** Candidate rolls consume the seeded stream inside the day tick, so
   golden-master hashes will move: re-pin with cause stated (directive 17 case (a)); the
   determinism test must cover ad refresh (same seed, same ads).

10. **Save schema.** `staffAds` is a new `GameState` field: bump `SAVE_VERSION`, no migration,
    no legacy branch (directive 19).

11. **Deferred to Staff II (recorded now).** Trait effects (auction-rat extra yard minutes;
    perfectionist quality/speed) and engine/chassis/body consumption; assignment/delegation
    design; the skill/XP half (with the open question of how staff and player skill combine,
    from skill-progression.md, which needs a maintainer ruling at Staff II design time); the
    `gameStore` split into domain stores including `useStaffStore` (TODO.md schedules it "once
    staff lands", i.e. after this arc's shape is proven).

## Rework: the crew model (maintainer redesign, 2026-07-17)

After reviewing the built system, the maintainer redesigned the staff core. This supersedes the
hustle model in decisions 1, 3, 4, 5, and 7; the acquisition machinery (ads, hiring, cap, wages,
Staff Office) stands. The principle: **more people means more work, plainly; passive income is an
assignment you trade labour for, never a bonus on top.**

R1. **Hustle is removed entirely**, not renamed. `StaffMemberSchema.stats` becomes
    `{engine, chassis, body}` (1-5, the Staff II quality layer). `STAFF_HUSTLE_BONUS_THRESHOLD`
    and `hustlePremiumYen` retire. `statBudgetByTier` shrinks to the three stats.

R2. **Every member contributes labour.** New member field `laborSlotsPerDay` (1 or 2), rolled at
    generation (weighting a content knob, proposed 70/30), printed plainly on the card, priced
    into the wage. No thresholds: a pair of hands is a pair of hands.

R3. **Assignment.** Each hired member is either **at the bench** (default: their slots add to the
    daily pool in `laborSlots.ts`) or **on the fleet contract** (steady retainer income, diegetic
    framing: taxi firms and delivery fleets; their labour is unavailable: "they can't help,
    they're busy"). Reassignment happens in the Staff Office and takes effect from the next day;
    no notice period in v1 (a friction knob later if toggling proves too free).
    `serviceBay.ts` is repurposed: income accrues only from contract-assigned members at
    `contractBaseYenPerDay + contractPerSkillPointYenPerDay * sum(stats)` (all content keys;
    the flat `serviceBayYenPerHustlePerDay` key retires).

R4. **Wage formula** becomes `wageBaseYen + wagePerSkillPointYen * sum(stats) +
    wagePerLaborSlotYen * laborSlotsPerDay`, rounded to 100 yen; coefficients re-derived so the
    reworked probe passes.

R5. **Probe bounds (computeHireCoherence reworked, all closed-form; maintainer ruling
    2026-07-17: a contract-assigned member MUST net a profit, that is the point of the
    assignment).** The two playstyles this balances: all-parked (steady passive floor, capped at
    your own 6 actions a day) versus all-benched (no passive income, near-double throughput),
    and everything between.
    - **A (net profit), hard, every candidate, every tier:** weekly contract income within
      [1.05, 1.40] x weekly wage. Every parked member profits; the scale stays modest (a full
      parked crew of 4 earns roughly rent-scale money, not flip-scale money).
    - **B (honest work beats the retainer), hard, every candidate:** weekly contract income <=
      0.5 x (laborSlotsPerDay x 7 x `economy.serviceJobs.laborRateYen`). The same hands doing
      billable work always out-earn the retainer by at least double, so a busy shop benches and
      a quiet one parks; passive is the floor, never the ceiling.
    - **C (first hire reachable), hard at the entry tier's cheapest candidate:** the upfront
      cost of hiring (R6a's introduction fee) stays within 15% of `STARTING_CASH_YEN`, so a
      day-one shop can afford its first hire as a real early decision.

R6a. **Introduction fee (supersedes decision 6's "free of signing fee").** Hiring costs a
    one-off fee of 2 x the candidate's weekly wage (content knob, `introductionFeeWeeks`; set 0
    to disable). With parking now net-positive, a fee is what keeps "hire four on day one" an
    investment with a payback period instead of a free annuity: cash spent on a hire is cash not
    spent on a car. Flagged for maintainer veto at review.

R6. **Consequences.** Schema change (`SAVE_VERSION` bump, no migration, directive 19); golden
    re-pins with cause (candidate roll shape changes); ad-refresh determinism test updated;
    verify no trait copy references the removed stat; the Staff Office roster gains the
    assignment control and new hint copy (the "grafter" line retires with the stat), all new
    strings through the orchestrator's flavour sweep; day-report classification for a new
    `contract-income` log entry. With 4 staff at up to 2 slots each, late-game capacity reaches
    base 6 + 8: payroll becomes the dominant fixed cost, which is intended.

R7. **Decision 11 amended:** assignment/delegation moves INTO this sprint via R3; trait effects,
    stat effects on work quality, and skill/XP remain Staff II.

## Tasks

**Claude (agents, orchestrated):**

1. Content: `staff` block in `economy.json` (wage formula coefficients, `statBudgetByTier`,
   `maxOpenAds`, `adExpiryDays`, `maxStaff`); `staffCandidates.json` (name and bio pools);
   Zod schemas for both; extend spelling/em-dash guard coverage.
2. Sim: candidate generation (seeded, tier-budgeted, formula-waged); `staffAds` state and the
   weekly refresh in the day tick; `resolveHireStaff` / `resolveDismissStaff` with cap and
   confirm semantics; `SAVE_VERSION` bump.
3. Probe: hire coherence rows (bounds A and B, disclosures) wired into the coherence table and
   asserted in tests; wage-formula/content drift test per the Sprint 78 pattern.
4. UI: Staff Office screen, route, nav; roster and ads panels; component tests.
5. Tests: determinism of ad refresh; hire/dismiss lifecycle; cap enforcement; wage deduction
   integration (existing `finances.ts` path picks up a hired member unchanged); golden re-pins
   with stated cause.
6. Full gate (`pnpm typecheck`, `lint`, `format`, `test:coverage`, `build`, `balance:run`,
   `balance.cli check`); fill the Exit.
7. Rework: implement R1-R7 (supersedes the hustle model within tasks 1-5); re-run the full
   gate; append the rework outcome to the Exit with the probe tables and golden re-pins.

**Orchestrator (Fable):** personal flavour sweep of every authored string (names, bios, screen
copy) before merge; final review and sign-off of the whole sprint.

**User-only (maintainer):**

- Review the Staff Office in the dev server when convenient; wage-feel tuning is knobs.
- Sprint review and commit approval.

## Definition of done

- A new career can see job ads appear on the weekly tick, hire up to 4 staff, watch labour
  slots and passive income respond through the existing formulas, pay wages, and dismiss.
- Ad refresh is deterministic under a fixed seed; hire coherence bounds A and B pass; the
  below-threshold and legend-tier numbers are disclosed in the Exit.
- Wage formula and content cannot drift (asserted by test).
- Every authored string has passed the orchestrator's flavour sweep, and the guards cover the
  new content files.
- Rework (R1-R7): hustle is gone from schema and code; every member shows and contributes
  plain daily labour; bench/contract assignment works from the Staff Office with effect next
  day; probe bounds A (net profit 1.05-1.40x wage), B (retainer <= 0.5x billable for the same
  hands), and C (first hire within 15% of starting cash) all hard-gate; every new string passed
  the orchestrator sweep.
- Full gate green; goldens re-pinned with cause; Exit filled.

## Exit

**Built.** All six Claude tasks landed. The acquisition front half is complete: job ads appear on
the weekly tick, up to four staff can be hired, labour slots and passive bay income respond through
the three unchanged back-half formulas, wages deduct, and staff can be dismissed.

1. **Content.** `economy.json` gained a `staff` block (schema `EconomyConfigSchema.staff` in
   `packages/content/src/economy.ts`): wage coefficients `wageBaseYen 8000` / `wagePerStatPointYen
   1600` / `hustlePremiumYen 4000`, `statBudgetByTier` (a per-stat inclusive `[min,max]` range per
   reputation tier: unknown [1,3], local [1,4], known [2,4], respected [2,5], legend [3,5]),
   `maxOpenAds 3`, `adExpiryDays 14`, `maxStaff 4`. `staffCandidates.json` holds a 40-name pool
   (surname-first romanised) and a 24-line bio pool, validated by `StaffCandidatePoolSchema`
   (`content/src/staff.ts`) and exported as `STAFF_CANDIDATES` (`content/src/data.ts`). The
   content-side spelling guard (`spellingGuard.test.ts`) now covers both pools; the repo-wide
   em-dash guard covers the new file automatically.

2. **Sim.** `packages/sim/src/staff.ts`: `deriveStaffWageYen` (the pure wage formula), the seeded
   `rollStaffCandidate` (stats rolled per-stat within the hiring tier's budget, trait uniform, wage
   derived not rolled, name de-duplicated against current staff and live ads, bio drawn), the weekly
   `refreshStaffAds` (drops ads older than `adExpiryDays`, tops the board to `maxOpenAds`), and
   `resolveHireStaff` / `resolveDismissStaff` (cap-checked, no-op contract). `GameState.staffAds`
   added (`content/src/gameState.ts`, `StaffAdSchema = {candidate, bio, postedOnDay}`); wired into
   the day tick as step 7d (`advanceDay.ts`) on the `day % 7 === 0` boundary, placed after every
   other rng consumer so only `staffAds` moves the golden. `SAVE_VERSION` 36 -> 37 (pure additive,
   no migration, directive 19). Three new day-log entries (`staff-ads-refreshed`, `staff-hired`,
   `staff-dismissed`) rendered by `describeLogEntry` and classified in the morning report.

3. **Probe + drift test.** `computeHireCoherence` (`coherence.ts`) emits one row per tier per budget
   endpoint. `staffProbes.test.ts` gates the wage-formula/content drift (a rolled candidate's wage
   is always `deriveStaffWageYen` of its own stats; the formula equals the raw content closed-form)
   and bound B; it discloses bound A, below-threshold, and legend numbers. The tuning finding
   (below) is the load-bearing result of this task.

4. **UI.** `StaffOfficeScreen.vue` (route `/staff`, nav link `[data-test=nav-staff]`): the roster
   panel (name, four stats, trait name + copy, weekly wage, two-step-confirm dismiss) and the job
   board (bio, four stats, trait, wage, posted/expiry days, Hire disabled at cap). Store gained
   `staffOfficeView` plus `hireStaff` / `dismissStaff`. `StaffOfficeScreen.test.ts` covers empty
   states, ad rendering with resolved trait copy, hire lifecycle, the cap, the labour-slot flag, and
   the two-step dismiss.

5. **Tests.** `staff.test.ts` covers candidate-roll determinism, ad-refresh determinism + top-up +
   expiry + name de-duplication, hire/dismiss lifecycle, cap enforcement, the labour-slot bonus via
   the unchanged `availableLaborSlots`, and wage deduction through the unchanged
   `applyWeeklyRentAndWages`. Golden re-pins below.

6. Full gate (below); this Exit.

**The hire coherence finding (decision 5) - bounds A and B are jointly infeasible.**

The probe is a tuning instrument, and it found a real incoherence. Bounds A (`wage >= passive`, no
money pump) and B (`wage <= passive + 1.5*slotValue`, hiring is worth it), gated per reputation tier
with `repMult[tier]`, CANNOT both hold for any coefficients of decision 4's tier-independent wage
formula. Proven two ways (exhaustive search + closed form):

- Passive weekly income is `hustle * SERVICE_BAY_YEN_PER_HUSTLE(3000) * 7 * repMult`. A single
  hustle-4 staffer earns the shop Y84,000-Y168,000/week in passive income (unknown -> legend),
  dwarfing the fixed Y5,000 bound-B window and any believable wage.
- The passive figure scales 2x with reputation while the wage formula has no tier term, and five
  reputation tiers cannot have disjoint per-stat budgets inside the 1..5 stat space - so the same
  `(sum, hustle)` candidate is reachable at two tiers whose passive windows are incompatible.
- Search confirms NO joint-feasible `(base, perStat, hustlePremium)` exists at perHustle 3000 (or at
  1000/600/500/400/300) with reputation-scaled passive; even reputation-INDEPENDENT it needs
  perHustle <= ~1000.

Because `SERVICE_BAY_YEN_PER_HUSTLE` and the passive-income economics are OUT OF SCOPE this sprint
(decision 1 freezes the three back-half formulas), the probe HARD-GATES bound B and DISCLOSES bound
A honestly, mirroring Sprint 79's `[INFO, not gated]` demotions and the donor-coherence disclosure
test. The disclosure test pins the current money-pump shape so a future service-bay retune that lets
bound A pass will visibly flip it (directive 17 case (a)).

Disclosure table (representative candidate = every stat at the tier's budget endpoint; yen/week):

| tier | budget | hustle | wage | passive@hire | bound A (wage-passive) | bound B margin | passive@legend |
| --- | --- | --- | --- | --- | --- | --- | --- |
| unknown | min | 1 | 14,400 | 21,000 | -6,600 | n/a | 42,000 |
| unknown | max | 3 | 27,200 | 63,000 | -35,800 | n/a | 126,000 |
| local | min | 1 | 14,400 | 23,100 | -8,700 | n/a | 42,000 |
| local | max | 4 | 37,600 | 92,400 | -54,800 | **+59,800** | 168,000 |
| known | min | 2 | 20,800 | 52,500 | -31,700 | n/a | 84,000 |
| known | max | 4 | 37,600 | 105,000 | -67,400 | **+72,400** | 168,000 |
| respected | min | 2 | 20,800 | 63,000 | -42,200 | n/a | 84,000 |
| respected | max | 5 | 48,000 | 157,500 | -109,500 | **+114,500** | 210,000 |
| legend | min | 3 | 27,200 | 126,000 | -98,800 | n/a | 126,000 |
| legend | max | 5 | 48,000 | 210,000 | -162,000 | **+167,000** | 210,000 |

- **Bound B (gated):** all four hustle-bonus candidates pass with honest margins (+59,800 to
  +167,000/week, each far above the Y3,333 slot value).
- **Bound A (disclosed):** every candidate's wage sits below its own passive income - a money pump
  of Y6,600-Y162,000/week per hire. Not a bug in this sprint's code: it is the direct consequence of
  `SERVICE_BAY_YEN_PER_HUSTLE=3000`, a "first-pass" constant this sprint is not authorised to touch.
- **Below the hustle threshold (disclosed):** the six hustle<4 rows carry no bound-B claim (no
  labour slot yet); their wage-to-value is the same bound-A money pump, disclosed not asserted.
- **Legend (disclosed):** a member hired early and kept earns the shop up to Y210,000/week passive
  at legend against a fixed hire-time wage - intended progression per decision 5's fourth bullet,
  not gated.

**Recommendation to the maintainer (a service-bay-economics call, deferred):** to make bounds A and
B jointly gate-able with honest margins, (1) gate the wage bounds against reputation-INDEPENDENT
passive and disclose the reputation growth, AND (2) lower `SERVICE_BAY_YEN_PER_HUSTLE` from 3,000 to
roughly 500-1,000. At perHustle 500, feasible coefficients `(base 10000, perStat 200, hustlePremium
3000)` exist. Until then, enabling hiring introduces a passive-income money pump; the staff cap of 4
bounds it, and there are no players pre-launch.

**Amendment (2026-07-17, orchestrator ruling after implementation): the money pump is fixed, bound A
now HARD-GATES.** The ruling actioned the recommendation above rather than living with the
disclosure. Both halves landed:

- `SERVICE_BAY_YEN_PER_HUSTLE` moved out of `sim/constants.ts` into content
  (`economy.staff.serviceBayYenPerHustlePerDay`, content law) and lowered 3,000 -> 500.
- Passive bay income is now FLAT and reputation-independent (`serviceBay.ts` no longer multiplies by
  `REPUTATION_INCOME_MULTIPLIER`, which is retired): `sum(hustle) * rate * days`. Rationale: wages
  carry no reputation term, so income must not either, or a fixed-wage hire becomes a fame-scaled
  annuity. This also retires the legend-annuity disclosure (no reputation growth of passive income
  is left). Staff II revisits passive scaling with real delegation.
- Wage coefficients re-derived by exhaustive search to `wageBaseYen 8000` / `wagePerStatPointYen
  1000` / `hustlePremiumYen 1500` (was 8000 / 1600 / 4000). Bound A is gated for EVERY candidate in
  EVERY tier (proven exhaustively in `staffProbes.test.ts`); Bound B, redefined, hard-gates only the
  lowest tier that can produce a hustle-bonus candidate (`local`, its cheapest such candidate, stats
  {1,1,1,4}), and is DISCLOSED per tier elsewhere. `slotValueWeekly` = round(20,000/6) = 3,333;
  boundB slack = round(1.5 x 3,333) = 5,000; passive is `hustle x 3,500`/week.

Amended disclosure table (representative = leanest stats + highest hustle for bound A; cheapest
hustle-bonus candidate for bound B; yen/week):

| tier | boundA stats | boundA wage | passive | boundA margin | boundB wage | boundB ceiling | boundB margin | gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| unknown | {1,1,1,3} | 14,000 | 10,500 | **+3,500** | n/a | n/a | n/a | A only |
| local | {1,1,1,4} | 16,500 | 14,000 | **+2,500** | 16,500 | 19,000 | **+2,500** | A + B (gated) |
| known | {2,2,2,4} | 19,500 | 14,000 | **+5,500** | 19,500 | 19,000 | -500 | A; B disclosed |
| respected | {2,2,2,5} | 22,000 | 17,500 | **+4,500** | 19,500 | 19,000 | -500 | A; B disclosed |
| legend | {3,3,3,5} | 25,000 | 17,500 | **+7,500** | 22,500 | 19,000 | -3,500 | A; B disclosed |

- **Bound A (now gated):** the binding case is `local` {1,1,1,4} at +2,500/week; every candidate in
  every tier clears its own passive income. The exhaustive test walks each tier's whole `[min,max]^4`
  budget - the minimum wage-minus-passive over all reachable candidates is +2,500. No money pump.
- **Bound B (gated at `local`):** the cheapest hustle-bonus hire the lowest tier can post, {1,1,1,4},
  sits at +2,500 below the affordability ceiling - the same candidate is the binding case for both
  bounds, centred in its [14,000, 19,000] window (maximin-optimal coefficients).
- **Bound B (disclosed elsewhere):** `known`/`respected` price their cheapest hustle-bonus candidate
  Y500 over the ceiling, `legend` Y3,500 over - intended design, an overpriced candidate on a
  higher-tier board is the decision the game asks the player to make, not a leak.

**Amendment gate (2026-07-17, re-run of the full gate).**

- `pnpm typecheck` - clean across `content`, `sim`, `game`.
- `pnpm lint` - clean, zero errors.
- `pnpm format` - clean (all matched files use Prettier style; no auto-fix needed).
- `pnpm test:coverage` - 1488/1488 passed across 101 files (one net new `serviceBay` assertion).
  Coverage: statements 89.38% (>= 80), branches 79.38% (>= 65), functions 92.4% (>= 78), lines
  93.24% (>= 82).
- `pnpm build` - succeeds (the pre-existing >500kB main-chunk warning is unchanged, not new).
- `pnpm balance:run` - 900,000 career-day rows + the closed-form coherence CSVs. Bots never hire
  staff, so passive income stays 0 for every bot and the rng stream is byte-identical (the candidate
  wage is derived, not rolled) - the career CSVs are unchanged from the pre-amendment run.
- `python -m balance.cli check` - exits 0, all invariants pass: the 6 hard-gated coherence checks
  (Law 1/2/3/4/6) all pass unchanged. The hire coherence probe is a sim-test gate
  (`staffProbes.test.ts`), not wired into this Python harness.

**Amendment golden re-pin (directive 17 case (a)).**

- `advanceDay.test.ts` 30-day career: `8166e5e1` -> `cfcde727`. Cause: the re-derived wage
  coefficients change each weekly-refreshed job-ad candidate's `weeklyWageYen` (a pure function of
  its rolled stats). This career hires no staff, so passive income stays 0 throughout and the rng
  stream is byte-identical - only the candidate wage VALUES in `staffAds` moved. A content retune,
  not a bug.
- `advanceDay.test.ts` acquisition->sale career: `889d6691` UNCHANGED - it resolves with an empty
  `staffAds` (no 7-day boundary populates a surviving candidate) and hires no staff, so no amendment
  change reaches it.

**Full gate (original Sprint 80 run, superseded by the amendment gate above).**

- `pnpm typecheck` - clean across `content`, `sim`, `game`.
- `pnpm lint` - clean, zero errors.
- `pnpm format` - clean (auto-fixed `StaffOfficeScreen.vue`, `coherence.ts`, `staff.test.ts` during
  the sprint; re-verified passing).
- `pnpm test:coverage` - 1487/1487 tests passed across 101 files. Coverage: statements 89.37%
  (>= 80), branches 79.33% (>= 65), functions 92.4% (>= 78), lines 93.24% (>= 82); new
  `sim/src/staff.ts` at 100/90/100/100.
- `pnpm build` - succeeds (the pre-existing >500kB main-chunk warning is unchanged, not new).
- `pnpm balance:run` - fresh run, 900,000 career-day rows across 9 strategies plus the 10 closed-form
  coherence rows. The staff-ad refresh now consumes rng on every weekly boundary, so bot-career
  outcomes shifted (the informational-only bot checks read them); the closed-form coherence CSVs are
  untouched by staff (staff never touches car valuation).
- `python -m balance.cli check` - exits 0, all invariants pass: the 6 hard-gated coherence checks
  (Law 1/2/3/4/6, closed-form) all pass unchanged; the demoted bot-behaviour checks report
  informationally (per Sprint 79). The hire coherence probe is a sim-test gate (`staffProbes.test.ts`),
  not wired into this Python harness.

**Golden re-pins (directive 17 case (a)).**

- `advanceDay.test.ts` 30-day career: `6dafb76e` -> `8166e5e1`.
- `advanceDay.test.ts` acquisition->sale career: `486fefeb` -> `889d6691`.

Cause: `GameState` gained `staffAds`, and the weekly refresh populates it with seeded candidate
rolls on every 7-day boundary each career crosses - a real state change plus its own rng draws.

**Deviations, with why.**

1. ~~**Bound A disclosed, not gated (deviation from decision 5's "bounds A and B pass").**~~
   **RESOLVED by the 2026-07-17 amendment (see above): bound A now hard-gates.** As originally
   shipped, bound A was proven jointly infeasible with the shipped passive-income constant, so the
   honest outcome was to gate the satisfiable bound (B) and disclose the other. The orchestrator's
   ruling then fixed the passive-income economics (flat, reputation-independent, rate 3,000 -> 500)
   and re-derived the wage coefficients, so both bounds gate. No longer a deviation.
2. **The ad carries the bio (`StaffAd = {candidate, bio, postedOnDay}`), extending decision 2's
   literal `{candidate, postedOnDay}`.** `StaffMemberSchema` is reused exactly as-is (the reuse-first
   intent); the bio is candidate-presentation surface for the ads board (decision 8), so it rides
   the ad and is dropped when the member joins the payroll (the roster shows trait copy instead).

**Not done (user-only, per the sprint doc).**

- Review the Staff Office in the dev server; wage-feel tuning is knobs.
- ~~Rule on the hire-coherence finding~~ RULED (2026-07-17 amendment): `SERVICE_BAY_YEN_PER_HUSTLE`
  lowered to 500 and moved to content, passive income made reputation-independent, wage coefficients
  re-derived so both bounds gate. See the amendment above.
- Sprint review and commit approval.
- The orchestrator's flavour sweep of every authored string: three bios reworded and the
  staff-ads day-log line retitled per the 2026-07-17 verdicts (see the string-sweep note below).

**Flavour sweep (orchestrator verdicts, applied 2026-07-17).** Three candidate bios reworded and one
day-log line retitled; tests that pinned the old copy updated per directive 17 case (a):

- `staffCandidates.json` bio: "wrecker" -> "breaker's yard".
- `staffCandidates.json` bio: "retired pass builder" -> "old touge hand".
- `staffCandidates.json` bio: "Marshalls ... on weekends" -> "Marshals ... at weekends" (British
  spelling + register).
- `dayLogFormat.ts` `staff-ads-refreshed`: "New faces on the job board: N ads" -> "New notices on
  the job board: N" (same `entry.count` interpolation). No test pinned the rendered string; the
  content-side spelling guard covers the new bios and passes.

**Deferred to Staff II (recorded, decision 11).** Trait effects and engine/chassis/body/hustle
consumption; assignment/delegation; the skill/XP half; the `useStaffStore` split. Only hustle
carries mechanical weight until then; the Staff Office shows all four stats and the trait copy
honestly.

## Rework outcome (crew model R1-R7, R6a; maintainer redesign 2026-07-17)

The crew-model redesign landed on top of the built acquisition machinery, which was converted, not
rebuilt: ads, hiring, cap, wages, and the Staff Office all stand. The principle: more people means
more work, plainly; passive income is an assignment you trade labour for, never a bonus on top.

**R1-R4, R6a (built).**

- **R1 - hustle removed.** `StaffMemberSchema.stats` is now `{engine, chassis, body}` (1-5).
  `STAFF_HUSTLE_BONUS_THRESHOLD` (sim/constants), `hustlePremiumYen`, `wagePerStatPointYen`, and
  `economy.staff.serviceBayYenPerHustlePerDay` are gone; `statBudgetByTier` shrinks to three stats.
- **R2 - every member contributes labour.** New member field `laborSlotsPerDay` (1 or 2), rolled at
  generation from `economy.staff.laborSlotsPerDayWeights` (`[0.7, 0.3]`), shown plainly on the roster
  and ad cards ("+N labour/day"), and priced into the wage. No thresholds.
- **R3 - assignment.** New member field `assignment` (`bench` default, or `contract`) plus
  `pendingAssignment` (a switch scheduled for the next day boundary). `laborSlots.ts` sums each
  bench-assigned member's own `laborSlotsPerDay` onto the base pool; `serviceBay.ts` is repurposed as
  `computeContractIncomeYen`, paying `contractBaseYenPerDay + contractPerSkillPointYenPerDay *
  sum(stats)` a day per contract-assigned member. Reassignment is scheduled in the Staff Office and
  committed by `advanceDay` step 10 AFTER that night's contract income (step 8), so a bench day can
  never also collect the retainer. New `contract-income` day-log entry (renamed from
  `service-bay-income`), folded into the morning report's earned-money split.
- **R4 - wage.** `weeklyWageYen = round100(wageBaseYen + wagePerSkillPointYen * sum(stats) +
  wagePerLaborSlotYen * laborSlotsPerDay)`.
- **R6a - introduction fee.** Hiring charges `introductionFeeWeeks * weeklyWage` to cash at hire
  (`resolveHireStaff`), carried on the `staff-hired` log as `introFeeYen` and shown on the ad card
  before the player commits. `0` disables it.

**R5 - coefficients and the reworked probe.** Coefficients derived by exhaustive maximin-centred
search (`tools/balance` was not touched; the search is recorded in the sprint scratchpad), landing
at `wageBaseYen 4000` / `wagePerSkillPointYen 500` / `wagePerLaborSlotYen 1500` /
`contractBaseYenPerDay 1100` / `contractPerSkillPointYenPerDay 80` / `introductionFeeWeeks 2`. All
three bounds HARD-GATE with honest margins, proven exhaustively over each tier's `[min,max]^3` budget
cube x both slot counts in `staffProbes.test.ts` (`computeHireCoherence`, coherence.ts). Wages span
Y7,000 (unknown, `{1,1,1}`, 1 slot) to Y14,500 (legend, `{5,5,5}`, 2 slots); weekly contract spans
Y9,380 (sum 3) to Y16,100 (sum 15).

Bound A (net profit): weekly contract / weekly wage in `[1.05, 1.40]` for every candidate. The two
binding candidates per tier (the whole cube is asserted, not just these):

| tier | min ratio (stats, slots) | max ratio (stats, slots) | in [1.05, 1.40] |
| --- | --- | --- | --- |
| unknown | 1.104 (`{1,1,1}`, 2) | 1.340 (`{1,1,1}`, 1) | yes |
| local | 1.104 (`{1,1,1}`, 2) | 1.340 (`{1,1,1}`, 1) | yes |
| known | 1.106 (`{2,2,2}`, 2) | 1.301 (`{2,2,2}`, 1) | yes |
| respected | 1.106 (`{2,2,2}`, 2) | 1.301 (`{2,2,2}`, 1) | yes |
| legend | 1.108 (`{3,3,3}`, 2) | 1.274 (`{3,3,3}`, 1) | yes |

Bound B (honest work beats the retainer): weekly contract <= `0.5 * laborSlotsPerDay * 7 *
laborRateYen` (laborRateYen 6,000). Tightest per tier (max stats, 1 slot - largest contract, smallest
ceiling):

| tier | tightest (stats, slots) | weekly contract | ceiling | margin |
| --- | --- | --- | --- | --- |
| unknown | `{3,3,3}`, 1 | 12,740 | 21,000 | +8,260 |
| local | `{4,4,4}`, 1 | 14,420 | 21,000 | +6,580 |
| known | `{4,4,4}`, 1 | 14,420 | 21,000 | +6,580 |
| respected | `{5,5,5}`, 1 | 16,100 | 21,000 | +4,900 |
| legend | `{5,5,5}`, 1 | 16,100 | 21,000 | +4,900 |

Bound C (first hire reachable): introduction fee <= `0.15 * STARTING_CASH_YEN` (Y45,000). Hard-gated
at the entry tier (`unknown`); every tier's cheapest first hire is disclosed and also clears the cap:

| tier | cheapest (stats, slots) | weekly wage | intro fee | cap | margin | gate |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | `{1,1,1}`, 1 | 7,000 | 14,000 | 45,000 | +31,000 | gated |
| local | `{1,1,1}`, 1 | 7,000 | 14,000 | 45,000 | +31,000 | disclosed |
| known | `{2,2,2}`, 1 | 8,500 | 17,000 | 45,000 | +28,000 | disclosed |
| respected | `{2,2,2}`, 1 | 8,500 | 17,000 | 45,000 | +28,000 | disclosed |
| legend | `{3,3,3}`, 1 | 10,000 | 20,000 | 45,000 | +25,000 | disclosed |

A structural consequence for the maintainer: bound B caps a 1-slot retainer at Y21,000/week, which via
bound A caps wages below ~Y20,000/week - roughly half the old hustle-model figures. That is the
intended crew economics (the retainer must undercut real billable work by 2x). With 4 staff at up to
2 slots each, late-game bench capacity reaches base 6 + 8 = 14 and payroll (up to ~Y58,000/week)
becomes the dominant fixed cost, as R6 intends.

**Gate (crew-rework run, 2026-07-17).**

- `pnpm typecheck` - clean across `content`, `sim`, `game`.
- `pnpm lint` - clean, zero errors.
- `pnpm format` - clean (Prettier reflowed the reworked files; re-verified passing).
- `pnpm test:coverage` - 1511/1511 passed across 101 files. Coverage: statements 89.27% (>= 80),
  branches 79.34% (>= 65), functions 92.39% (>= 78), lines 93.18% (>= 82); `sim/src/staff.ts` at
  100 / 90.9 / 100 / 100. (One transient `router/index.test.ts` timeout under coverage load cleared
  on an isolated re-run; unrelated to staff.)
- `pnpm build` - succeeds (the pre-existing >500kB main-chunk warning is unchanged, not new).
- `pnpm balance:run` - 900,000 career-day rows + 25 closed-form coherence rows. Bots never hire, and
  the candidate roll consumes the same number of rng draws per candidate as before (three stat draws
  plus one labour-slot draw replaces four stat draws), so the rng stream is consumed identically and
  the career CSVs are byte-identical to the pre-rework run - only the never-read `staffAds` contents
  differ.
- `python -m balance.cli check` - exits 0, all invariants pass: the 6 hard-gated coherence checks
  (Law 1/2/3/4/6) all pass unchanged. The hire coherence probe is a sim-test gate
  (`staffProbes.test.ts`), not wired into this Python harness.

**Golden re-pin (directive 17 case (a)).**

- `advanceDay.test.ts` 30-day career: `e1cfd24f` -> `6e62e1c3`. Cause: the reworked candidate shape
  (hustle removed, `laborSlotsPerDay`/`assignment`/`pendingAssignment` added, wage coefficients
  re-derived) and the extra per-candidate labour-slot roll change every weekly-refreshed job ad
  (days 7/14/21/28). This career hires no staff, so there is no contract income and no assignment
  commit - only the `staffAds` candidate contents moved; the refresh is still the tick's last rng
  consumer, so no other draws shift. The repeat-run determinism test still passes.
- `advanceDay.test.ts` acquisition->sale career: `65447382` UNCHANGED - it never crosses a 7-day
  boundary, so `staffAds` stays empty and the schema/wage change never reaches it.

**Deviations, with why.**

1. **The passive `service-bay-income` day-log entry is renamed `contract-income`** (the passive bay
   income is replaced outright by the fleet retainer, not kept alongside). `DayLog` is the event log,
   not persisted state, so this is a free rename; classification (earned-money split) is unchanged.
2. **`StaffMember` gained `pendingAssignment`** beyond the doc's literal `assignment` field, to make
   "effective next day" both non-gameable and pool-stable: a bench day cannot also collect the
   retainer, and a mid-day switch never changes the labour pool under an action already taken. It is
   committed at the day boundary after contract income.
3. **The `staff-hired` day-log entry gained `introFeeYen`** so the morning report can name the fee
   the hire charged to cash (R6a).

**Strings for the flavour sweep (verdict: PASSED with one revision, applied 2026-07-17).** Every new
or changed player-facing string this rework introduces (the assignment control, the "+N labour/day"
and introduction-fee copy, the retired grafter/slot lines, the `contract-income` and reworded
`staff-hired` day-log lines) was drafted and listed with file + pointer in
`scratchpad/sprint80-rework-strings-for-sweep.md`. The orchestrator's sweep approved everything as
drafted except the Staff Office roster hint, reworded per the verdict ("for your own work" muddled
whose work it is): "Up to {maxStaff} on the books. At the bench their hands are yours; on a fleet
contract they earn a steady retainer instead. Wages come out weekly." No test pinned the draft hint,
so no test moved (directive 17 case (a), checked); UI-only string, no golden impact -
`StaffOfficeScreen.test.ts` re-run green (523/523 game tests) and Prettier clean on the touched file.
Style contract: understated, dry, 1995 Japan, British spelling, no romaji, no exclamation marks.

**Content rider (maintainer, applied verbatim).** Added a third flavour line to
`serviceJobTemplates.json`'s `engine-internals-rebuild` `flavorPool` ("New oil, please. The stuff the
last place put in has gone all sparkly in the sunlight...").

**R7 (decision 11 amended).** Assignment/delegation moved INTO this sprint via R3. Trait effects,
stat effects on work quality, and the skill/XP half remain Staff II.

**Copy polish batch (maintainer-approved 2026-07-17).** Two candidate bios revised per the
orchestrator's weakest-lines review (the ex-forklift and body-shop bios); the ten service-job
template revisions from the same batch are recorded in sprint81.md's Exit. Applied with the full
suite green (1511/1511); no test pinned the old copy and no golden moved.
