# Sprint 15 — Reputation system

*Status: implemented, ready for review — not yet committed. See Exit.*

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, items #7/#10) plus the
same-day design conversation that followed. The maintainer wants equipment and facility purchases,
and auction car access, gated by player progression — not cash alone. Both turned out to depend on
one missing piece: `reputationTier` is never actually derived from anything in the sim (a gap
first surfaced during Sprint 13, tracked in `TODO.md`). This sprint builds that derivation and the
reputation *sources* feeding it; Sprint 16 spends it on the actual gates. Status: **designed, pending
review.**

## Goal

Make reputation a real, moving number instead of a permanently-`unknown` scaffold. `reputationPoints`
already accumulates from service jobs; this sprint (a) derives `reputationTier` from it, (b) adds two
new sources the maintainer specifically asked for — reward for selling a genuinely well-restored car,
penalty for selling a "lemon" — and (c) does nothing else. No gates change behavior yet; Sprint 16 is
where the newly-live tier actually starts blocking anything. Shipping the derivation alone, first,
means Sprint 16 can be reviewed purely on its own gating logic, not tangled up with "and also here's
where rep numbers come from."

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Reputation points storage | `reputationPoints` on `GameState` (Sprint 08), already incremented/decremented by `serviceJobs.ts`'s `resolveServiceJob` on completion/failure | **Untouched as a value** — this sprint adds new call sites that mutate it (car sales), it doesn't change how the field itself works. |
| Reputation tier ordering | `ReputationTierSchema` (`unknown`/`local`/`known`/`respected`/`legend`, `content/src/tags.ts`) + `reputationAtLeast`/`reputationTierIndex` (`calendar.ts`) | **Direct reuse** — the tier-derivation function returns one of these five values; nothing new about tier *ordering* is introduced. (Verified 2026-07-10: `reputationTierIndex` is currently module-private, not exported — the derivation either lives in `calendar.ts` beside it or the helper gets exported; either way it's reuse, not a rewrite.) |
| "Quality scales the reward" pattern | `GRADE_REPUTATION_MULTIPLIER` (Sprint 08) — a pricier/higher-grade installed part already earns more service-job reputation | **Same idea, reused for car sales** — a better-condition, more-authentic sale earns more reputation, mirroring how a better-grade install already does. |
| Reputation floor-at-zero | `resolveServiceJob`'s failure path already clamps loss at `Math.min(penalty, state.reputationPoints)` so points never go negative | **Reused for the new lemon penalty** — same clamp, not a new floor rule. |
| Reputation-gate mechanism | `applyEquipmentPurchase`'s `reputationAtLeast(state.reputationTier, equipment.minReputationTier)` check (built Sprint 13, currently dormant — no content sets the field) | **Not touched this sprint** — the mechanism already exists and already works; it's just been checking a tier that never changes. This sprint makes the check meaningful without changing the check itself. Sprint 16 is where content actually sets `minReputationTier` again. |
| Log-entry extension pattern | `service-job-completed`'s optional `partCostYen`/`profitYen` fields (Sprint 10) — extending an existing entry with optional data instead of inventing a parallel entry type | **Template for `car-sold`** — gains an optional `reputationDelta`, rather than a new `reputation-changed` log type living alongside it. |
| Car component data | `CarInstance.components` (Sprint 12, 8 keys, each `{condition, installed}`) | **Read, not changed** — the lemon check and the quality-sale bonus both read existing `condition`/`authenticityPercent` fields; no new car data. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Tier derivation itself.** Nothing today turns `reputationPoints` into `reputationTier` — this is
   the actual gap. A small, pure function (`deriveReputationTier(points): ReputationTier`) reading a
   new tunable threshold ladder, called everywhere `reputationPoints` changes.
2. **An "average condition across all 8 components" reading.** Checked: no such aggregate exists
   anywhere in the sim today (bots only ever read individual `components[id].condition` for their own
   repair-target picking; the closest thing is `derivedStats.ts`'s reliability blend, which averages
   only engine+drivetrain — purpose-specific, not general). Needed for both the lemon check (is this
   car a wreck?) and, eventually, enshrinement (90+ average condition, GDD §9.2 — not this sprint's
   concern, but the same helper will serve it later).
3. **Reputation from car sales.** Genuinely new: nothing currently ties `reputationPoints` to
   `resolveSellViaWalkIn`/`resolveListForSale` at all.

## Definition of Done

- `reputationTier` actually advances as `reputationPoints` accumulates, using a first-pass, openly
  adjustable point-threshold ladder (`constants.ts`) — re-derived every time `reputationPoints`
  changes, not just at specific trigger points, so it's never stale.
- Selling a car whose average component condition and authenticity both clear a quality bar grants a
  flat reputation bonus.
- Selling a "lemon" — average condition below a floor, **or** any single component severely damaged
  (the maintainer's own framing: "under 5-10%") — costs a flat reputation penalty. Applies to both
  sale channels (walk-in and public listing), checked against the car's real condition at the moment
  it leaves `ownedCars` (listing resolution happens days later, after the `CarInstance` itself is
  gone from state — see decision 4).
- `reputationPoints` never goes negative (matches the existing service-job-failure clamp).
- All checks green; new tests cover the derivation ladder, both new sale-side reputation paths, and
  the negative-floor clamp.
- **No gating behavior changes anywhere in the game this sprint.** Equipment, facilities, and auctions
  all still behave exactly as today — this sprint only makes the number underneath them real.

## Decisions (approve / adjust before implementation)

1. **First-pass point thresholds — explicitly a starting guess, not a modeled number** (per the
   maintainer's own call: "start with reasonable defaults and then playtest to finetune and also
   model it"). Proposed, scaled against what a service-job-only career can realistically earn
   (`baseReputation` in content is 1-4 per job, up to ~2.2x for a race-grade install;
   `SERVICE_JOB_FAILURE_REP_MULTIPLIER = 2` already exists):

   | Tier | Points required |
   |---|---|
   | `unknown` | 0 (start) |
   | `local` | 15 |
   | `known` | 50 |
   | `respected` | 120 |
   | `legend` | 300 |

   `REPUTATION_TIER_THRESHOLDS` in `constants.ts`, a plain ordered array/record — trivially retunable
   once real harness/playtest data exists. Not claimed correct; the number that matters is the *shape*
   (each tier meaningfully harder than the last), which any future retune preserves.

2. **Quality-sale bonus: a flat constant, not a continuous formula.** Matches this codebase's existing
   preference for simple, tunable constants over formulas at this stage (`SERVICE_JOB_FAILURE_REP_
   MULTIPLIER`, `GRADE_REPUTATION_MULTIPLIER`, etc. are all flat numbers, not curves). Proposed:
   `QUALITY_SALE_MIN_CONDITION = 85`, `QUALITY_SALE_MIN_AUTHENTICITY = 85`,
   `QUALITY_SALE_REPUTATION_BONUS = 3` — a car sold at 85+ average condition AND 85+ authenticity
   grants +3 reputation on top of the sale itself. Below that bar: reputation-neutral, exactly as
   already agreed ("leave plain selling reputation-neutral regardless of price").

3. **Lemon penalty: also a flat constant, and an OR condition per the maintainer's own framing.**
   Proposed: `LEMON_MAX_AVERAGE_CONDITION = 40` (average across all 8 components) **or**
   `LEMON_MAX_SINGLE_COMPONENT_CONDITION = 10` (any one component this bad, regardless of the
   average) triggers lemon status; `LEMON_SALE_REPUTATION_PENALTY = 5`. Deliberately does **not**
   apply to lowball/cheap-but-not-broken sales — only genuinely bad condition, matching the earlier
   agreement not to punish normal flipping.
   **Found in review (2026-07-10): quality and lemon CAN overlap with these constants** — seven
   components at 96+ and one at ≤10 still averages ≥85, so a car can clear the quality bar while
   tripping the single-component lemon rule. The lemon check therefore takes explicit precedence:
   a car with a dead component is never a "quality" sale, no matter how good the average looks.

4. **Lemon/quality check happens at the moment the car leaves `ownedCars`, not when a public listing
   later resolves.** `resolveListForSale` drops the real `CarInstance` from state the instant the
   listing is created — only `PublicListing` (price, model, day) survives until resolution, days
   later. So the condition check must run at listing-creation time and get **captured onto the
   listing** (a new field, e.g. `reputationDeltaOnSale: number`, computed once and carried until the
   listing actually resolves into a `car-sold` event). Walk-in sales don't have this problem (fully
   instant), but use the identical check function for consistency.
5. **`averageConditionPercent(car)` and the lemon/quality checks live in a new, small, focused module**
   (not bolted onto `selling.ts`, which is about buyer valuation, not condition — single-responsibility;
   likely a new `carCondition.ts` or added to `derivedStats.ts` if that reads more naturally once the
   code is in front of us) — exact placement is an implementation-time call, not a design blocker.

## Task breakdown

### A. Content (`packages/content`)

- [x] `sale.ts` (verified home of `PublicListingSchema`): gains
  `reputationDeltaOnSale: z.number().int()` (captured at listing time, applied at resolution).
- [x] `gameState.ts`: `DayLogEntrySchema`'s `car-sold` variant gains an optional
  `reputationDelta: z.number().int().optional()` field.
- [x] **Save law:** `PublicListingSchema` is nested inside the persisted `GameState`
  (`activeListings`), so this is a save-schema change — `SAVE_VERSION` 7→8 (currently 7, verified),
  additive default or migration for the new field, golden-save test updated, same PR.

### B. Sim (`packages/sim`)

- [x] `constants.ts`: `REPUTATION_TIER_THRESHOLDS`, `QUALITY_SALE_MIN_CONDITION`,
  `QUALITY_SALE_MIN_AUTHENTICITY`, `QUALITY_SALE_REPUTATION_BONUS`, `LEMON_MAX_AVERAGE_CONDITION`,
  `LEMON_MAX_SINGLE_COMPONENT_CONDITION`, `LEMON_SALE_REPUTATION_PENALTY` (decisions 1-3).
- [x] New small module: `averageConditionPercent(car)`, `saleReputationDeltaFor(car): number` (the one
  function both sale paths call — returns `-LEMON_SALE_REPUTATION_PENALTY`,
  `+QUALITY_SALE_REPUTATION_BONUS`, or `0`, checked in that order: the thresholds can overlap
  (see decision 3's review note), so lemon precedence is explicit in the function, not assumed).
- [x] `calendar.ts` (or a new home if that file stops fitting): `deriveReputationTier(points):
  ReputationTier` reading the new threshold constants.
- [x] A single, small helper `applyReputationDelta(state, delta): GameState` that adjusts
  `reputationPoints` (clamped at 0), re-derives `reputationTier`, and returns the updated state —
  used by service-job resolution (refactored to call it, not duplicate the clamp+derive logic) *and*
  the new sale paths, so there's exactly one place reputation ever changes state.
- [x] `selling.ts`: `resolveSellViaWalkIn` calls `saleReputationDeltaFor` + `applyReputationDelta`
  immediately; `resolveListForSale` calls `saleReputationDeltaFor` at listing time and stores the
  result on the `PublicListing`, not applied until resolution.
- [x] `advanceDay.ts`: the existing listing-resolution step applies the listing's stored
  `reputationDeltaOnSale` via `applyReputationDelta` alongside the existing cash payout.
- [x] `serviceJobs.ts`: `resolveServiceJob`'s completion/failure paths refactored to call the new
  `applyReputationDelta` helper instead of hand-rolling the clamp — same behavior, one code path.

### C. Game (`packages/game`)

- [x] No player-facing UI change this sprint — `reputationTier`/`reputationPoints` are already
  surfaced wherever the store exposes them today (no new screen needed to *see* the number moving).
  Confirm during implementation whether the existing display is even visible anywhere real ('/garage'
  header?) — if not, that's a one-line addition, not a redesign.

### D. Testing

- [x] Sim: `deriveReputationTier` unit-tested across the full threshold ladder (below/at/above each
  boundary); `applyReputationDelta`'s zero-floor clamp; `saleReputationDeltaFor` for quality/lemon/
  neutral cases (including the "both thresholds miss" neutral case and the OR-condition lemon check —
  bad average alone, bad single component alone, both).
- [x] Sim: `resolveSellViaWalkIn`/`resolveListForSale` extended for the reputation side-effect,
  including the listing-resolves-later path (`advanceDay.test.ts` or `selling.test.ts`, whichever
  already covers listing resolution).
- [x] Content: `gameState.test.ts` fixture updated for the new `PublicListing`/`car-sold` fields.
- [x] Golden masters: checked in review (2026-07-10) — the second golden master in
  `advanceDay.test.ts` ("acquisition and sale path") sells a car via `sellViaWalkIn`, so its hash
  re-pins once walk-in sales carry a reputation delta; the primary scripted career never sells and
  should only re-pin if the state shape itself changes. Note **no existing test creates a public
  listing at all** — the listing-time capture path (decision 4) needs genuinely new coverage, not an
  extension of an existing case.

### E. Harness (added in review, 2026-07-10)

- [x] `runCareer.ts`/`exportCareers.ts`/`report.py`: sample `reputationPoints`/`reputationTier` at the
  existing day-25/40/70/100 checkpoints in `careers.csv`. Cheap now, load-bearing for Sprint 16:
  outside Service Grinder (service jobs) and this sprint's new quality-sale bonus, no bot has any
  reputation income, so Sprint 16's gating ladder should be reviewed against real bot trajectories
  rather than guesses about how fast anyone climbs.

## Claude-implementable vs user-only

**Claude-implementable:** all of A-E. No new dependencies, no data-layer access.

**User-only:** none for this sprint specifically — the actual point-threshold *tuning* is explicitly a
later, playtest-driven pass (decision 1), not a blocker to shipping the mechanism now.

## Exit

Implemented as designed, including all five outside-review fixes (explicit lemon precedence,
the save-law task, the harness section, and the two golden-master notes). One design expectation
turned out empirically wrong in a harmless way: the doc predicted the second golden master
(`advanceDay.test.ts`'s "acquisition and sale path") would need re-pinning once `sellViaWalkIn`
carries a reputation delta. It didn't — seed 42's specific auction-won car lands in the
reputation-neutral band (neither the quality nor lemon thresholds trip), so `reputationDelta` is
never added to the log entry and the hash (`87e8338a`) is unchanged. Both golden masters are
still pinned to their pre-Sprint-15 values; a future seed or scenario that does cross a threshold
will re-pin normally when it happens, same as any other golden-master change.

`reputationPoints` is sampled in `careers.csv` (harness task E) alongside the existing
`reputationTier` column — not yet run at the full 1000-seed scale as part of this sprint (that's
a `pnpm balance:run` the maintainer can kick off whenever useful; no code changed in the harness
run path beyond adding the column).

All checks green: `pnpm typecheck` / `lint` / `format` / `test:coverage` (393 tests, up from
361) / `build`. No new dependencies, no data-layer access. `SAVE_VERSION` 7→8, purely additive
(`PublicListing.reputationDeltaOnSale` defaults to 0), golden v7 save test added alongside the
existing v1/v2/v3/v5/v6 ladder.

Not done this sprint (by design, Sprint 16's job): no gating behavior changed anywhere — equipment,
facilities, and auction access all still behave exactly as before. `reputationTier` is real now,
but nothing reads it to block anything yet.

Ready for review — not committed pending the maintainer's sign-off per the sprint workflow.
