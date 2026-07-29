# Sprint 94 - The energy bar (labour becomes continuous)

Replaces the integer labour-slot model with a continuous daily energy bar (Stardew-style).
Maintainer direction 2026-07-18. This re-touches every action's cost and all labour UI, so it
is its own sprint (the largest of the current arc).

## Reuse analysis (directive 16)

**New mechanisms:**

- A continuous daily energy pool (`energyMax`) + spend (`energySpentToday`), full reset each
  day, replacing the integer `laborSlotsPerDay` / `laborSlotsSpentToday`.
- Fractional per-action energy costs (content-tunable), with tool tier reducing the cost.

**Existing mechanisms to reuse (rename/rescale, do not rebuild):**

- `laborSlotsPerDay` / `laborSlotsSpentToday` become `energyMax` / `energySpentToday` on the
  same daily-reset plumbing (`advanceDay` already resets spent-today to 0).
- The crew model's per-member labour contribution becomes a per-member `energyMax` increase
  (bigger pool) - same "benched members raise the pool" wiring.
- `slotsNeededToClimb` / `installSlotsByClass` / the teardown labour rules become the ENERGY
  cost functions; the shape (repair scales with grades and tier; removal is free; install by
  depth class) is unchanged, only the unit and the ceil-to-integer go away.
- The staged-work planner, the confirm bar, and every labour caption re-read the new unit.
- Sprint 93's `repairLevelForGroup` (tier -> speed) is the tier factor that reduces energy
  cost: this is where "tier-3 drains less" lives, folding the whole tier-speed axis onto the
  bar (Sprint 93 tier-3 = "fewer slots" becomes "less energy").

## The model

- **Unit:** energy is an INTEGER ("labour points") to keep the sim deterministic (no floats).
  Scale is x10 (maintainer ruling): 1 old labour slot = 10 points. Costs are authored as
  integer points per tier (a per-tier table, NOT a division that yields fractions), so the
  finer x10 granularity replaces "fractions" with distinct integers. NO decimals shown: the
  displayed value equals the backend integer. Base pool and per-action costs are content knobs.
- **Daily reset:** the pool refills to `energyMax` every day (a night's sleep). No carry-over.
- **Staff grow the pool:** `energyMax` = base + Σ(benched-member pool contribution). Staff
  make you less constrained by RAISING the ceiling, per the ruling (not by slowing drain).
- **Tier reduces drain:** a repair's energy cost scales down with the group's tool tier (the
  Sprint 93 speed axis). Higher tier = less energy per grade = more work per day. This is
  tier-3's "different advantage", now legible on the bar.
- **Per-action costs (content):** repair = grades x `energyPerGrade` / tierFactor (no ceil);
  install = `energyByClass` (surface/bolt-on/buried); removal = 0 (Sprint 79 law); assembly
  ops, diagnostics, etc. each get an energy cost. Exact numbers are derived to keep a typical
  day's work-throughput close to today's (a calibration pass, probe-checked).

## Decisions (to finalise at implementation)

1. **State + schema.** Rename the two persisted labour fields to `energyMax`/`energySpentToday`
   (or add and migrate-free per directive 19: this is pre-launch, so a Dexie bump + no
   migration). Content: an `energy` block in `economy.json` (base pool, per-member pool,
   `energyPerGrade`, `energyByClass`, tier factors), Zod-schema'd.
2. **Cost functions.** Convert `slotsNeededToClimb` / `installSlotsByClass` / teardown rules to
   energy-point costs; drop the integer ceil so tier genuinely yields fractional-of-a-slot
   costs. Keep removal free and the equivalence-refit free (Sprint 79/87).
3. **The bar UI.** Replace every integer labour display (CarDetailScreen confirm bar and its
   "N labour" caption, per-action captions, the day report, the crew line) with a labour bar.
   The bar (fill = spent/max) is the PRIMARY display; the integer readout appears ON HOVER.
   Per-action affordances show their integer point cost. No decimals. Copy drafted by the
   orchestrator.
4. **Calibration probe.** A closed-form probe pinning that a fresh shop's daily energy affords a
   sensible day's work (so day-1 is not softlocked) and that owning tools / benching staff
   measurably increases throughput. The tutorial and mission satisfiability probes re-derive
   against energy costs.
5. **Blast radius (directive 17).** Every test asserting integer labour slots re-derives to
   energy points; state each as case (a). Golden masters will move (labour is in the career
   sims); verify pure-value and re-pin, or STOP if a shape changes unexpectedly.
6. **Progression feel.** Confirm the intended curve: early game is energy-constrained (you
   cannot do everything in a day), and staff + tools steadily loosen it. The probe discloses
   the day-1 vs late-game throughput ratio so the calibration is honest.

## Open question for the maintainer (before build)

The one real decision is the **energy scale and day-1 tightness**: how many "slots" of work a
fresh, solo, tier-1 shop gets per day, and how fast staff/tools loosen it. Recommendation:
keep the base pool equal to today's `laborSlotsPerDay` (so day-1 feels the same as now), and
let tier and staff be the loosening levers, calibrated by the probe. Confirm, or state the
day-1 tightness you want.

## Task breakdown

**Claude-implementable:** all; the bar copy is orchestrator-drafted; the calibration is a
design call made during the sprint against the probe. **User-only:** eyeball the energy bar.

## Exit

Landed (implementation by subagent, orchestrator-policed). The record:

- **The model.** Labour is now a continuous daily bar backed by integer "labour points" at a
  x10 scale (`economy.energy`: `pointsPerLabour: 10`, `basePoolPoints: 60`,
  `energyPerGradeByTier: {1:10, 2:6, 3:4}`, `energyByClass: {surface:0, bolt-on:10,
  buried:20}`). Base pool = old 6 slots x 10 = 60, so **day-1 is unchanged**; the calibration
  probe discloses day-1 6 grades/day vs late-game (tier-3 + full bench) 35 grades/day, a 5.83x
  loosening. Integers only, no decimals; the bar is primary on the work surface
  (CarDetailScreen), the integer readout on hover.
- **Tier-3's advantage now lives on the bar:** `energyPerGradeByTier` makes a tier-3 repair
  cost 4 points/grade vs tier-1's 10, the Sprint-93 speed axis expressed as less drain.
- **Determinism held:** all energy math is integer (no floats in sim); both career goldens
  moved (`d997e784`->`7916de2b`, `acc59f28`->`8bf7a06b`), verified pure value rescales with the
  repeat-run determinism test still green, re-pinned with directive-17 comments.
- **Directive 17, all case (a):** every integer-slot assertion re-derived to points across
  sim + game; service-job payouts stay byte-identical (energy is time, not money -
  `laborRateYen` stays per-slot via `energy / pointsPerLabour`); staff-ad, auction-inspect,
  recondition, restoration-pacing all rescaled.
- **Copy:** the swept FINAL parts applied verbatim (word stays "labour", integers, bar +
  hover); the DRAFT-and-FLAG crew/day-report/upgrades/inspect/workup strings reviewed and
  approved as-is by the orchestrator (British, clean, functional).
- **Orchestrator rulings on the two flagged items:** (1) the bar is primary on the work
  surface; compact `N/M labour` integer text on the glanceable dashboards is fine, not
  bar-ified. (2) `crewSpeedDiscount` (Sprint 82 skill payoff) PRESERVED and rescaled - see the
  open question below; landed in the safe (preserved) state.
- **Save:** `SAVE_VERSION` 41->42, no migration (directive 19).
- **Narrow evidence:** sim 52 files / 970; content 10 / 89; game 47 / 553; all three
  typechecks exit 0.
- **Full evidence:** pushed through the pre-push gate; no separate manual pass (directive 20).
- **OPEN QUESTION for the maintainer (landed preserved, reversible):** staff now loosen the
  day via a bigger pool (the ruling) AND still via the Sprint-82 skill-based
  `crewSpeedDiscount` (a per-repair cost reducer). The "bigger pool, not slow drain" ruling
  addressed the base per-member contribution; it did not name the skill discount. Preserved
  because it is the crew-SKILL payoff (skilled hands work faster) and bound D prices it.
  Confirm keep, or strip it in a follow-up so staff only ever raise the pool.
