# Sprint 38: Specialty, the identity axis

*Arc: Progression Rework. Read `docs/design/progression-bible.md`, `arc-progression-rework.md`,
sprint36/37 Exits, and `CLAUDE.md` in full; no em dashes anywhere. Reputation keeps gating
breadth; this sprint adds the horizontal axis: per-discipline SPECIALTY, earned by doing work in
a discipline, expressed by the world coming to you for it. Every formula and tunable is specified
below; implement exactly.*

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (specialty is reputation machinery split per group, NOT a new
system):**

- The earn plumbing: `resolveServiceJob` (`serviceJobs.ts`) already computes grade-scaled
  reputation via `reputationForCompletion`/`GRADE_REPUTATION_MULTIPLIER` and knows each task's
  group via `taskGroup`. Specialty earning rides the same completion/failure branches.
- The offer pipeline: `pickServiceJobTemplate` already does per-candidate selection; the
  specialty bias is a weight on it, not a new picker.
- The payout margin roll (`rollMargin`, economy.json `serviceJobs.marginMin/Max`): the in-lane
  premium multiplies the SAME roll.
- The additive save pattern (defaulted field + version bump + history + golden coverage, no
  migration function; precedent: v2 reputationPoints, v22 customerJobId).
- Existing copy hooks: the offer flavor snapshot, `dayLogFormat.ts`.

**Genuinely new (small):** the `specialty` state field; the bias weight + in-lane premium; the
per-line specialty copy pool.

**Explicitly NOT in this sprint:** any HUD/meter (bible law 4; dev console only); specialty from
SALES (parked in TODO.md: until a sale can be attributed to the disciplines the player actually
improved, sales must not feed specialty, bible standing decision); techniques and the shop title
(Sprint 39); decay (never, bible law 6).

## Locked specification

### 1. State and content

- `GameStateSchema`: `specialty: z.record(ComponentIdSchema, z.number().int().nonnegative())`
  with all six keys, seeded 0 in `newGame.ts`.
- `economy.json` new block (schema'd in `economy.ts`):

```json
"specialty": {
  "biasFactor": 0.5,
  "softcapPoints": 100,
  "premiumThresholdPoints": 40,
  "inLanePremium": 1.15
}
```

- New content file `packages/content/data/specialtyCopy.json` (+ Zod schema
  `src/specialtyCopy.ts`, exported): keyed by ComponentId, each an array of >= 2 offer-flavor
  lines in the word-of-mouth register ("Heard you're the one for engine work around here",
  per-line authored, 1995 voice, no em dashes, parody brands only).

### 2. Earning (in `resolveServiceJob`, both branches)

Let `G` = the set of DISTINCT groups among the job's tasks, `n = |G|`.
- Completion: each group in `G` gains `round(reputationGained / n)` specialty points, where
  `reputationGained` is the existing grade-scaled value already computed there.
- Failure: each group in `G` loses `round(penalty / n)`, clamped at 0 per group (mirrors the
  existing reputation clamp).
Reputation earning itself is UNCHANGED (both accrue from the same event; they gate different
things, bible law 3).

### 3. The offer bias (in `pickServiceJobTemplate`)

Candidate weight = `1 + biasFactor * min(1, specialty[primaryGroup(template)] / softcapPoints)`,
where `primaryGroup` = the group of the template's FIRST task (deterministic, no judgment).
Selection becomes weighted-random over eligible candidates using the existing rng (one draw via
cumulative weights; preserve draw count = 1 per pick to keep golden churn minimal). Bias never
excludes anything.

### 4. The in-lane premium (in offer payout derivation)

Let `top` = the argmax group of `specialty` (ties: higher points, then `ComponentIdSchema.options`
order). IF every task group of the offer equals `top` AND `specialty[top] >=
premiumThresholdPoints`, the margin roll is multiplied by `inLanePremium` (payout only; costs
unchanged; the profitability floor only gets safer).

### 5. Diegetic surfacing (the only UI)

When section 4's premium condition held for a generated offer, the offer's flavor line is drawn
from `specialtyCopy.json[top]` instead of the template's `flavorPool` (seeded rng pick). Nothing
else renders anywhere. The dev console gains a read-only specialty dump.

### 6. Save + harness

- `SAVE_VERSION` 23 -> 24, additive (no migration fn); version-history entry; golden tests: a
  v23 save decodes with all-zero specialty; a v24 state round-trips values.
- `bots/runCareer.ts` snapshot + `cli/exportCareers.ts` CSV: add `specialtyTopGroup` (string) and
  `specialtyTopPoints` (int64), informational. `tools/balance/src/balance/report.py`: render them
  in a short informational section; ALSO fix the stale "[15, 35]" days-to-local copy (the band is
  [10, 35]). NO new invariant.

### 7. Tests

- Earn split across groups on completion AND failure (multi-group template worked example:
  put-her-in-a-ditch spans 3 groups).
- Premium applied only when all-tasks-in-top-lane AND above threshold; not below threshold; not
  for mixed-group offers.
- Bias observable: with specialty engine=100 vs all-zero, engine-primary templates' share of 500
  seeded picks is measurably higher (assert a conservative delta, e.g. > 1.2x).
- Zero-specialty regression: with all-zero specialty, offer generation and payouts are
  byte-identical to pre-sprint behavior EXCEPT the golden hash re-pin if the weighted pick changed
  draw mechanics (target: it should not; assert the same template sequence for a fixed seed at
  all-zero specialty before re-pinning anything).
- Golden save v24; specialty copy renders on premium offers (game test).

## Definition of Done

- Doing engine work makes more and better-paying engine work arrive, visible only through offers
  and copy; zero new meters.
- Reputation behavior unchanged; all-zero specialty is behaviorally inert (regression-tested).
- Full gate green; balance harness (orchestrator-run): hard invariants pass, movement disclosed,
  re-base only with recorded maintainer approval; specialty columns visible in the report.

## Fences

Do NOT touch reputation derivation (`calendar.ts`), its thresholds, auction gating, tool tiers,
the value model, or selling. No specialty from sales (TODO note instead). No UI meters. Do NOT
run the balance harness.

## Exit

*(filled on completion)*
