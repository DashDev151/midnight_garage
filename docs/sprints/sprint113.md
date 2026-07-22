# Sprint 113: The core-loop law (every car earns its keep)

**Date:** 2026-07-22
**Source:** the long-run playtest blocker (`docs/playtest-notes-2026-07-22-long-run.md` item 7)
and the maintainer's ruling that settled it, quoted for the record: "The entire gameplay loop
is Buying a car, FIXING IT, and then selling it. Without the FIXING IT part there IS NO
GAMEPLAY LOOP. IT MUST ALWAYS BE PROFITABLE TO FIX." Scope confirmed same session, option (a):
every car has a profitable fix phase and the phase has an end; fixing to the expectation band
is always profitable; beyond-expectation stays diminishing; there must always be something
wrong, so the player works to reach acceptable condition. The measured trigger: 20% of shitbox
lots generated with zero fixable work and 32% with no repair play (600 lots/tier, seed 42).

**One-line goal:** generation never produces a car without work, and fixing to expectation is
provably cash-positive on every tier, gated forever.

## Reuse analysis (directive 16)

**Reused:** the generation pipeline's existing seams (`generateAuctionCarInstance`,
`applySymptoms`, `enforceMaxBillFraction`: the floor top-up is one more step in the same
chain, obeying the same Law 2 bill-ceiling guard); `carCostToBandYen` + `expectationForCar`
(the floor is measured in the same units the value model already prices);
`apparentBandByPartId` semantics (top-up damage is honest visible wear, so it never touches
the apparent view); the Law 6 wage machinery in the coherence suite (the profitability proof
is the existing `wageMarginYen` measurement, promoted from disclosed to gated); the content
schema seam for tunables.

**Genuinely new:** the per-tier minimum-work floor (content block + top-up step), whatever
minimal repair-return retune the measurement demands (lever chosen from measured numbers, the
Law 6 maintainer-call in TODO is hereby answered: a negative shitbox wage margin is no longer
acceptable), and the flipped gate.

## Design (locked with the maintainer, 2026-07-22)

1. **The floor:** after symptoms are applied, if the TRUE car's below-expectation bill
   (`carCostToBandYen` to `expectationForCar(model).band`) is under
   `bookValueYen * partsGeneration.minWorkBillFractionByTier[tier]`, seeded top-up damage
   degrades parts (one band at a time, never forcing `scrap`, honest visible wear, never
   masked) until the floor is met, still under the Law 2 ceiling (schema-enforced:
   floor fraction strictly below the bill-ceiling fraction). Cherished provenance now means
   less damage, never none. Starting fractions (tunable): shitbox 0.10, common 0.06,
   uncommon 0.05, rare 0.04.
2. **CORRECTED BY THE MAINTAINER (same day), and the correction is the record.** The
   orchestrator over-read the ruling: it reinterpreted "always profitable to fix" through
   Law 6's rent-inclusive wage accounting and, under the general mandate, changed live
   economy constants to satisfy that bar (`marketRepairDiscount` 1.3 -> 1.4; a new
   labour-time factor scaling wrench-time by fitment class; the Law 6 gate flip; six story
   mission payouts re-authored to track the shifted formula). The maintainer's correction,
   verbatim in substance: unprofitability was NEVER about labour; labour slows the loop
   down, it does not decide whether a fix is profitable; the issue was solely that cars
   spawned already at expectation, so no repair play existed; and the wage-margin gradient
   across tiers is INTENTIONAL PROGRESSION: it is supposed to get easier to make money with
   nicer cars. None of the constant changes were explicitly approved. **All of wave 3 and
   the partial wave 4 are REVERTED**; the ruling's whole implementation is design point 1,
   the generation floor. Standing lesson recorded in the working memory: economy constants
   and formulas change only with explicit approval of the specific change, never by
   extension of a general mandate.

   What "always profitable to fix" means, corrected: below the expectation band the market
   already returns more than every repair yen by construction (Law 1's below-band clause,
   `marketRepairDiscount` 1.3, unchanged); the generation floor guarantees that play exists
   on every car. Labour and rent are pacing, not per-repair profitability. Law 6's wage
   probe keeps its pre-sprint posture (non-shitbox gated positive, shitbox measured and
   disclosed) as pacing information.
3. **Scripted content is exempt by construction:** the tutorial lot is fixed content, not
   generated; verified untouched.
4. **The economy bible** gains the core-loop law amendment (recorded maintainer approval,
   this session); TODO's Law 6 open question closes as answered by ruling.

## Tasks

- [x] Agent 1 (generation): the floor top-up + content tunables + schema refine; a permanent
      seeded distribution probe (every generated lot on every tier meets its floor, cherished
      subsample included); honest re-pins of whatever the generation change moves (goldens,
      catalog pins, career regressions). LANDED and KEPT.
- [x] Agent 2 (measurement, read-only): wage margins per tier/model measured and reported.
      The measurements stand as information; the retune built on them was reverted.
- [x] Agents 3-4 (retune): built, then REVERTED IN FULL on the maintainer's correction
      (design point 2). Two genuine latent finds from those waves are noted in the Exit for
      the record; their code went with the revert.
- [x] Agent 5 (the revert): drive the tree to floor-only state (constants restored, factor
      machinery removed, gate posture restored, payouts restored, pins re-derived at the
      final constants), all four checks green.
- [x] Orchestrator: bible-log correction, memory corrections, guardrails, verification, Exit.

## Exit

- [x] THE FLOOR IS THE SPRINT: every generated lot now carries at least
      `bookValueYen x partsGeneration.minWorkBillFractionByTier[fitmentClass]` of
      below-expectation work (shitbox 0.10, common 0.06, uncommon 0.05, rare 0.04), topped
      up as honest visible wear (never masked, never forced to scrap, Law 2 ceiling
      respected) via `enforceMinWorkBill` in the generation pipeline. Cherished provenance
      now means less damage, never none. A permanent distribution probe (250 lots per tier
      across 5 seeds, cherished subsample included) enforces the two-outcome contract: floor
      met, or every part already maximally worn short of scrap (the Sera case: cheap parts
      cannot always express 10% of book, and an all-poor car is maximum work). The tutorial's
      scripted lot is structurally unreachable by the floor.
- [x] The wage-margin retune built on top of the ruling was REVERTED IN FULL on the
      maintainer's correction (design point 2 records it verbatim in substance):
      `marketRepairDiscount` back to 1.3, the labour-time factor removed from content,
      schema, sim, and store (six sim files and the game store verified byte-identical to
      HEAD), the Law 6 probe postures restored exactly, mission payouts untouched at their
      authored values. Golden hashes verified by running: 30-day `64522008`, acquisition-sale
      `76db2e32`. Game auction-room pins re-derived from real output at the final constants.
- [x] Two latent finds from the reverted waves, recorded for the record only (their code
      went with the revert): a `laborSlotsRequired === 0` skip-guard that would silently
      drop real work if labour ever scales below whole units; and five `planGroupRepair`
      call sites in the store that a signature change breaks silently under Vitest's
      esbuild transform (only `vue-tsc` catches it).
- [x] GUARDRAILS LANDED: CLAUDE.md directive 22 (economy levers maintainer-gated one by
      one; a halt ends the thread; fixed overheads never charge against a single play;
      worst-case probes are not typical-case crises) and the approval-gate guard test
      (`packages/content/tests/economyApprovalGate.test.ts`: sha256 pin of economy.json plus
      the mission payout map, red on any unapproved movement; 2/2 passing). The economy
      bible's amendment log carries the ruling AND the same-day correction.
- [x] Evidence (from the revert verification, each suite run once, game twice): sim 56
      files / 1,357 passed; content 12 files / 116 passed (plus the new gate 2/2); game 54
      files / 658 passed; typecheck clean across all three packages. The pre-push hook
      remains the full gate.
