# Sprint 23 — Progression that can be climbed, and the cost of doing business

*Source: maintainer direction, 2026-07-11 — fourth sprint of the foundational-economy arc. Trigger:
the 2026-07-10 review showed the entire Sprint 15/16 progression tree is unreachable at population
scale (best observed faucet: 2 reputation points per 100 days vs a first threshold of 15; the
quality-sale bonus requires equipment gated behind the reputation it would earn — circular), and
rent was switched off in Sprint 20 pending a functioning economy. With Sprints 20-22 making the loop
profitable and skill-expressive, this sprint derives progression pacing and costs from explicit
targets instead of guessed constants — and re-arms the balance harness's invariants as hard CI
gates so the economy can never silently rot again. Status: **designed, not yet implemented.
Depends on Sprints 20-22** — reuse rows below cite those sprints' mechanisms as they exist AFTER
they land; none are in the codebase at `93e5e94`.*

## Goal

A competent player reaches `local` reputation around day 20-30, `known` around day 50-70,
`respected` around day 90-120 (legend is beyond the 100-day horizon by design). Rent returns as a
real but beatable pressure sized against measured flip margins. Every one of those statements
becomes an enforced harness invariant, not a hope.

## Pacing targets (maintainer to confirm — the sprint's single source of truth)

| Milestone | Target day (competent play) | Notes |
|---|---|---|
| `local` (15 pts) | day 20-30 | Unlocks regional auctions + welder/transmission bench (post-decision-3 ladder) |
| `known` (50 pts) | day 50-70 | Unlocks premium auctions + engine crane (post-decision-3 ladder) |
| `respected` (120 pts) | day 90-120 | Unlocks collector network |
| `legend` (300 pts) | post-day-100 | Not paced this sprint |
| Rent pressure | 1-2 competent flips/week cover rent comfortably | "Real until it's beaten", never fatal |

"Competent play" is operationalized by the probe policies below, not by bot archetypes — per the
maintainer's 2026-07-10 instruction to step back from bot strategies as evidence.

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Reputation plumbing | `reputationPoints`/`deriveReputationTier`/`applyReputationDelta`/`REPUTATION_TIER_THRESHOLDS` (Sprint 15) | Untouched machinery; only the *values* flowing through it change. |
| Sale reputation | `saleReputationDeltaFor` (Sprint 15, extended Sprint 22) | Gains the clean/concours split (decision 1) — same function, richer return. |
| Service-job reputation | `serviceJobs.json` `baseReputation` (content) + `reputationForFailure` (a function in `serviceJobs.ts` computed FROM it — not a content field) | Retuned as data; no code change expected. |
| Gates | `equipment.json`/`facilities.json` `minReputationTier`, `AUCTION_TIER_MIN_REPUTATION` | Ladder values re-derived from the pacing table; the gating code is untouched. |
| Rent | `WEEKLY_RENT_YEN` (moved to `economy.json` and set to 0 BY Sprint 20) | Restored per decision 4's sizing rule. |
| Measurement | Sprint 20-22 probe harness + `pnpm balance:run` + `tools/balance` (polars CLI) | All measurement tasks reuse these; no new measurement infra. |
| CI | path-filtered `balance` job (`.github/workflows/ci.yml`) | The re-armed invariants run where the soft ones already do. |
| Bot canaries | 8 existing strategies + `runCareer` | Kept running as smoke instruments; only cautiousRestorer gets a correctness fix (decision 6). |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Clean/concours sale split** — two quality bonuses instead of one all-or-nothing bar. Needed
   because the single bar (avg >= 85 AND authenticity >= 85) is unreachable for most cars
   (authenticity rolls 60-95 at generation and condition can't move it), which is half of why the
   faucet never flowed.
2. **Days-to-tier telemetry** — computed in `tools/balance` (Python: a groupby over the existing
   per-day `reputationTier` column in `careers.csv` — first day each tier appears, per career). No
   TS/CSV shape change needed; new because nothing computes it today.
3. **Hard invariants** — the Python `check` command exists but its economy invariants were
   deliberately softened to informational when nothing was validated. Post-arc there ARE validated
   targets; failure becomes failure again. That policy flip (and the new invariant set) is new.

### Deleted / corrected

The cautiousRestorer repair-loop deadlock (2026-07-10 review finding: `REPAIRABLE_COMPONENTS.find()`
abandons the whole car — after claiming the only service bay — when the first needy component's
equipment is reputation-gated; the doc comments also misattribute the root cause to budget).
Corrected here because this sprint changes the very gates involved.

## Decisions

1. **Sale faucet split** (replaces the single quality bonus in `saleReputationDeltaFor`):
   - *Clean sale* (+2): every component's **effective** condition >= 85 (Sprint 22 definition) AND
     zero unrepaired issues.
   - *Concours sale* (+4, replaces clean, doesn't stack): clean AND `authenticityPercent >= 85`.
   - Lemon (−5) unchanged, still takes precedence (including Sprint 22's severe-unrepaired-issue
     trigger). Plain sales stay 0.
2. **Service-job faucet:** retune `serviceJobs.json` `baseReputation` values so a full-time
   service-focused week yields ~4-6 points (measure first — task M2 — then scale all values by one
   factor; keep relative differences between job types). Scaled values round to the nearest integer
   with a floor of 1 — `baseReputation` is a nonnegative int and the smallest current values are 1,
   so a fractional factor must never silently zero a job type's faucet. Failure penalty formula
   untouched.
3. **Equipment gate ladder** (equipment.json `minReputationTier`): tire-machine —, brake-lathe —,
   upholstery-bench — (all already ungated); suspension-press `local` -> **ungated**; welder
   `known` -> **`local`**; transmission-bench `known` -> **`local`**; engine-crane `respected` ->
   **`known`**. Rationale: a full restoration (the core fantasy and the clean-sale faucet) must be
   *possible* at `unknown` only for interior/suspension/wheels/brakes work, and fully unlocked one
   tier earlier than today — the gate ladder stays real but stops being circular. Auction-tier and
   facility gates unchanged.
4. **Rent sizing rule:** `WEEKLY_RENT_YEN` = 0.3 x median weekly gross margin, rounded to the
   nearest Y10,000 — a hand-derived value written into `economy.json`, not a code helper. Weekly
   gross margin = M1's median margin per flip x flips/week; flips/week = 7 / M1's median
   days-per-flip (acquisition day to sale day, 1 service bay), capped at 2.
   Fallback if measurement is ambiguous: **Y60,000**. Delete the
   "temporarily 0" comment; the value lives in `economy.json` with the sizing rule in its doc
   comment.
5. **Thresholds stay (15/50/120/300) unless measurement says otherwise.** The faucets were the
   broken half. If M3 shows competent days-to-local outside 20-30 after decisions 1-3, adjust
   faucet values first, thresholds second, and record what moved in the Exit.
6. **cautiousRestorer correctness fix:** the repair loop iterates ALL needy components and repairs
   the first one whose equipment is owned or obtainable (`ensureEquipmentFor` true), instead of
   `find()`-then-abandon; the service bay is claimed only after an obtainable component is found;
   the misleading doc comments (budget-as-root-cause) are rewritten to name the reputation gate;
   the masking test (`runCareer.test.ts`, "equipment bought" only) is strengthened to require a
   majority of bootstrapped careers to also reach `reputationPoints > 0` within 100 days — feasible
   after decisions 1-3, and exactly the assertion that was impossible before. Also close the
   related pre-existing gap the same file documents: `REPAIRABLE_COMPONENTS` covers only 5 of 8
   components (wheels/brakes/forcedInduction are never repaired), which after decision 1 blocks a
   clean sale whenever one of those rolls under 85 — extend the list to all 8, ordered by ascending
   equipment cost (tire-machine Y150k, brake-lathe Y250k, upholstery Y350k, suspension press Y400k,
   welder Y700k, transmission bench Y900k, engine crane Y1.5M covering engine + forcedInduction).
7. **Invariant policy:** the re-armed checks below FAIL CI (exit non-zero), no longer
   informational. Numbers are bands, not points, to keep honest tuning room.

## Re-armed harness invariants (Python `balance.cli check`)

| # | Invariant | Band |
|---|---|---|
| 1 | Every non-passive strategy's day-100 median cash beats passive-grinder's | strict > |
| 2 | Flipper day-100 median cash | > starting cash (loop is profitable) |
| 3 | Days-to-`local`, competent probe policy (see below) | p50 in [15, 35] |
| 4 | Auction win-price distribution (Sprint 20 basis: hammer/anchor) | steal+frenzy tails each 5-15%, mid majority |
| 5 | Buyout share of player-policy acquisitions | < 30% |
| 6 | The 3 existing gated checks in `tools/balance` (passive-grinder solvency, flipper-vs-passive separation, sanity floor) | kept, except where a row above supersedes one |

The existing *informational* entries are retired. Note: `TODO.md`'s "Invariant #5 (lemon cap)"
idea was never a real gated check, and the mechanism it would have tested (the sliding-scale
handover rule) is deleted by Sprint 22 — a checkbox below records its disposition in `TODO.md`
rather than pretending to "keep" it.

Invariant 3 runs on a **scripted competent-policy career** (new, small: patient-bid clean lots via
inspection, full-restore + fix issues, clean-sale everything, work service jobs on idle labor).
Policy code lives in `packages/sim/src/bots/competentPolicy.ts` — it must be importable by the
production CLI (`tsconfig.cli.json` compiles `src/` only, never `tests/`) — documented in-file as a
measurement probe, not a new archetype, and exported through `exportCareers.ts` as a 9th career
row-set in `careers.csv`. Deterministic, no strategy cleverness beyond the listed rules.

## Task breakdown

### Measurement first (write results into this doc's Exit before tuning)

- [ ] M1: run the Sprint 21 full-flip probe; record median margin per flip AND median days-per-flip
  -> feeds decision 4's rent number. (Sprint 22's information probe is context only — it measures
  an inspect-vs-blind delta, not flip margin.)
- [ ] M2: reuse `serviceGrinderStrategy` (it is exactly the "accept every repair job, work it"
  policy — directive 15) for a service-only career at current `baseReputation` values; record
  points/week -> feeds decision 2's scale factor.
- [ ] M3: after decisions 1-3 are implemented, run the competent-policy career; record days-to-tier
  percentiles -> confirms or adjusts per decision 5.

### Content (`packages/content`)

- [ ] `equipment.json` gate ladder per decision 3.
- [ ] `serviceJobs.json` `baseReputation` x M2 scale factor (round to nearest int, floor 1).
- [ ] `economy.json`: rent restored per decision 4; clean/concours values (+2/+4) and their bars.
- [ ] `EconomyConfigSchema`: new `reputation` block for the clean/concours values + bars (schema
  change paired with the data change, same as every Sprint 20-22 JSON addition).

### Sim (`packages/sim`)

- [ ] `carCondition.ts`: `saleReputationDeltaFor` clean/concours split (decision 1); update the
  `car-sold` log entry so the day report can name which bonus fired.
- [ ] `bots/cautiousRestorer.ts` + `tests/bots/runCareer.test.ts`: decision 6 in full.
- [ ] `cli/exportCareers.ts`: export the competent-policy career as a 9th strategy row-set in
  `careers.csv`; write `startingCashYen` and `weeklyRentYen` (read from `economy.json`) into
  `careers.manifest.json` so the Python check validates against the values that actually ran.
  (Days-to-tier needs NO export change — derived in Python from the daily `reputationTier` column.)
- [ ] `constants.ts`: retire `QUALITY_SALE_MIN_CONDITION`/`QUALITY_SALE_MIN_AUTHENTICITY`/
  `QUALITY_SALE_REPUTATION_BONUS` once decision 1's economy.json values replace them — no dead
  constants left behind.

### Balance harness (`tools/balance`)

- [ ] `check`: the 6 invariants above, hard-fail; `report`: days-to-tier percentile table (Python
  groupby, see reuse item 2) + which invariants are enforced (so the report is self-describing).
- [ ] `TODO.md`: record dispositions for the old "Invariant #5 (lemon cap)" entry (mechanism
  deleted by Sprint 22; superseded by the new invariant set) and "Invariant #6 (first-timer resale
  speed)" (state whether the competent policy covers it or it stays open).

### Game (`packages/game`)

- [ ] Day report copy for clean/concours ("Sold as a clean example — reputation +2"); no other UI.

### Testing

- [ ] Unit: clean vs concours vs lemon precedence truth table; gate ladder (a `local` player can buy
  a welder, an `unknown` player cannot); rent charged again weekly.
- [ ] The strengthened cautiousRestorer test per decision 6.
- [ ] Goldens re-pinned once (rent + reputation values shift trajectories).

## Claude-implementable vs user-only

**Claude-implementable:** everything above including all measurement runs.

**User-only:** confirm/adjust the pacing-targets table (it is the sprint's constitution); sign off
the M-task numbers before they're locked into `economy.json`; browser sanity pass on the day-report
copy.

## Definition of done

All checks green; all 6 invariants pass in CI's balance job on a fresh 1000-career run; M1-M3
results recorded in the Exit with the final chosen values next to their targets; the
cautiousRestorer test proves a bootstrapped career can actually earn reputation.

## Exit

*(to be written at implementation end — must include the M1/M2/M3 measured numbers and every value
that moved)*
