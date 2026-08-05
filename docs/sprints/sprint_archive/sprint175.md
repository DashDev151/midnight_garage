# Sprint 175: what a buyer wants from an engine

**Arc:** `docs/sprints/scene-standing-arc.md`. This is step 0, the prerequisite.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, section 13 step 0.

**Model settled 2026-08-04; values not yet approved.** The shape is below under "The model"; what
remains is a lever table and the parts-gating question. It is
written now because everything after it depends on the answer, and because the shape of the decision
is clearer written down than argued from memory.

## The fault

`statFormulas.powerNormalizationCeiling` is **300 PS**. `normalizedPowerScore` divides a car's power
by it, and each archetype's `statTargets.power.target` is a fraction of that. Clearing the target
earns full marks on that stat; exceeding it earns nothing more.

| archetype | target | fully satisfied at |
| --- | ---: | ---: |
| racer | 0.75 | **225 PS** |
| tuner | 0.65 | 195 PS |
| hobbyist | 0.15 (`upper` 0.5) | 45 PS |
| first-timer | 0.25 (`upper` 0.55) | 75 PS |
| collector | 0.3 (`upper` 0.5) | 90 PS |
| stancer | 0.2 | 60 PS |

**Nothing above 225 PS is worth anything to anybody, ever.** Nine roster cars exceed that in stock
form, including the R35 at 480 and the LFA at 560, and the machining arc's own target for a fully
built 2JZ is about 750.

So the power ladder, forced-induction returns, and every machining operation that makes power all
terminate in a customer who stopped caring. **A player who builds a 750 PS Supra is paid what a
player who builds a 225 PS Supra is paid.**

## Why this blocks the arc

The Racers scene's craft operation is **Race prep: power and handling past catalogue**. Sold into
buyers whose power appetite saturates at 225 PS, that operation is inert, and the Racers scene ships
feeling identical to the Tuners scene from the buyer's side.

The refactor's section 7 called weak performance demand "a content problem, not a systems one". It
is a systems one: the ceiling is a single shared normalisation constant, not a per-buyer authored
value.

## The decision, unmade

**Raising the constant is the wrong fix.** It moves the wall without removing it, and it changes
what every buyer pays for power on every car at once.

**Expectation should scale with the game.** The maintainer's four inputs, recorded in `TODO.md` and
restated here because they are the substance of the decision:

1. **What the player can reliably BUY.** If the auction rooms that sell Supras are still shut to
   them, do not ask for that power band yet. Expectation follows access.
2. **Hand-authored jobs**, keyed on something not yet decided.
3. **Their own best build so far**, at roughly 10 to 15 per cent below it. It measures what the game
   has actually shown to be possible and what this player can do. **But it stalls on its own**: if
   demand only ever trails your best, nothing ever asks you to build a bigger one. Whatever ships
   needs something pulling from in front, not only following behind.
4. **Per-scene appetite.** Racers should want the most, then Tuners, and so on down. The relative
   targets already exist and are roughly right; it is the shared ceiling they all normalise against
   that is wrong.

## The model, as the maintainer described it 2026-08-04

Not yet a lever table, but the shape is settled.

**Input 4 builds itself.** Per-scene appetite already exists as authored relative targets and is
roughly right. Racers want most, then Tuners, down the list.

**Input 1 is car availability times PART availability.** Access to the cars that can make the power,
multiplied by access to the parts that make it. **Parts are not gated at all today**, and the
maintainer has flagged that as worth considering: without it, only the car half of the gate exists.

**Input 3 becomes a climbing chain, and this is the piece that stops it stalling.** Demand does not
merely trail the player's best build; it closes on it:

| the player has | the ceiling of demand sits at |
| --- | --- |
| a new personal best | best **minus 10 per cent** |
| delivered at that bar once | best **minus 5 per cent** |
| delivered again | best **minus 1 per cent** |
| a NEW personal best | the chain restarts from minus 10 |

So there is always something asking for slightly more than has been proven, and beating it resets
the pressure. That answers the objection the maintainer raised against best-minus-a-margin on its
own, which was that demand trailing you forever never asks you to go further.

**This governs the UPPER BOUND only, and that is the important constraint.** Most customers ask for
far less: the chain decides how high the top of the market reaches, not what the whole market wants.
**A player must be able to have a 700 PS build and a 300 PS build worth doing at the same time**, and
a model that drags every buyer up behind the ceiling would destroy that.

**Nothing is proposed here as a number.** A value invented at implementation time is exactly what
directive 22 exists to prevent, and this one reaches every buyer, every car and every sale.

## What implementation would touch, once decided

- `packages/content/data/economy.json` and `economy.ts`: whatever replaces or supplements
  `statFormulas.powerNormalizationCeiling`.
- `packages/sim/src/valuation.ts`: `normalizedPowerScore` and `tasteMatchFor`, if expectation stops
  being a constant and starts being a function of state.
- `packages/content/data/buyers.json`: per-archetype targets, if appetite moves there.
- The economy approval gate, re-pinned with the recorded approval.

**The stat radar is NOT affected and must stay unaffected.** Its scale is the separate,
display-only `statFormulas.radarPowerCeilingPs` (800), deliberately split from the buyer ceiling in
Sprint 171 precisely because a chart and a buyer want opposite things from one. Do not reunify them.

## Definition of done

1. A buyer's power appetite can exceed 225 PS.
2. Building a genuinely powerful car is worth more to somebody than building a moderately powerful
   one.
3. **A 700 PS build and a 300 PS build are both worth doing at the same time.** The chain moves the
   top of the market, not the whole of it.
4. Beating the current bar visibly raises it, and a new personal best restarts the climb.
5. The model is written into `desirability-system.md` or the sale-value design, not only into code.
6. The radar's own ceiling is untouched.

## Levers (directive 22)

**APPROVED 2026-08-04 under the maintainer's blanket lever authority for this build.** Resolved and
implemented, values recorded in `economyApprovalGate.test.ts`'s re-pin comment:

1. (original item 1) **The chain's steps: 10, 5, 1 per cent, one shop-wide ceiling (not
   per-scene).** `statFormulas.powerExpectationChainStepDiscounts = [0.10, 0.05, 0.01]`. Per-scene
   chains were not built - `GameState.powerExpectationChain` is a single figure, not one per
   archetype.
2. (original item 4) **How far below the ceiling the ordinary customer sits:
   `powerNormalizationCeiling` 300 to 600.** That is what protects the 300 PS build - every
   archetype's own fraction is unchanged, so a Show Crowd buyer (0.2) still wants a modest 120 PS
   at the new ceiling, same as it wanted 60 at the old one relative to its own target.

**Still outstanding, out of this sprint's scope** (both are `scene-standing-arc.md`'s inputs 1 and
2, not inputs 3/4 this sprint was scoped to):

1. (original item 2) How access converts into appetite: what "the rooms that sell Supras are shut"
   actually multiplies.
2. (original item 3) **Whether parts get gated at all**, which is a new mechanic rather than a
   value and needs its own decision. Without it only the car half of input 1 exists. Recorded in
   `TODO.md`.

## Exit

**Implemented.** Two-part fix, both parts named and valued by the maintainer under blanket lever
authority for this build (2026-08-04):

**Part 1 - the fixed ceiling.** `statFormulas.powerNormalizationCeiling` 300 -> 600
(`packages/content/data/economy.json`, schema note in `economy.ts`). Every archetype's own
`statTargets.power` fraction is untouched - only the PS a fraction now equates to moves: racer
225 -> 450, tuner 195 -> 390, touge 210 -> 420, daily-drivers 75 -> 150 (`upper` 165 -> 330),
show-crowd 60 -> 120, collector 90 -> 180 (`upper` 150 -> 300). 600 sits just above the roster's
fastest stock car (560 PS).

**Measured before/after** through `valuateCarForBuyer` against four representative cars (a stock
kei - Wagon R - a mid-power stock enthusiast car - 180SX - a stock high-power car built as a
synthetic 480 PS R35 fixture since the R35 is not yet in the shipped `cars.json` subset, and a
heavily built 2JZ Supra at all-race grade):

| car | buyer | before (300) | after (600) | delta |
| --- | --- | ---: | ---: | ---: |
| stock kei | racer | 215,205 | 212,842 | -1.10% |
| stock kei | daily-drivers | 239,823 | 236,891 | -1.22% |
| mid enthusiast (180SX) | racer | 742,216 | 720,243 | -2.96% |
| mid enthusiast (180SX) | touge | 741,985 | 726,324 | -2.11% |
| stock high-power (synthetic R35, 480PS) | daily-drivers | 9,152,025 | 9,342,539 | +2.08% |
| stock high-power (synthetic R35, 480PS) | collector | 9,258,753 | 9,338,054 | +0.86% |
| heavily built Supra (all-race 2JZ) | every archetype | unchanged | unchanged | 0% |

Full six-archetype table for all four cars is in the implementation report. **The heavily built
Supra's price was identical, archetype by archetype, before and after** - it already fully cleared
every archetype's power target under the OLD 300 ceiling too, so raising the ceiling could not
move it; closing that gap for a no-upper archetype is exactly what Part 2 exists for, and it ships
unconsumed this sprint on purpose. The largest swings (racer/touge on the mid-power car, daily-
drivers/collector on the high-power car) are the two `upper`-bearing archetypes becoming more
forgiving of a big engine, and a no-upper archetype's target crossing a car whose true delivered
power sits near the new, higher PS threshold - both the intended, direct arithmetic consequence of
doubling the ceiling, not a defect. No swing approached the magnitude of the game's existing
flip-margin tolerances (the largest was -2.96%), so this did not rise to a stop-and-report
threshold.

**Part 2 - the climbing chain.** `GameState.powerExpectationChain: { bestPowerPs, climbedSteps }
| undefined` (`packages/content/src/gameState.ts`), a new genuinely-optional field (absent means
nobody has ever delivered a car), Dexie/`SAVE_VERSION` bump 60 -> 61, no migration
(`packages/game/src/save/saveCodec.ts`). `currentPowerExpectationBarPs(chain, economy)`
(`packages/sim/src/valuation.ts`) derives the bar: `bestPowerPs * (1 -
powerExpectationChainStepDiscounts[min(climbedSteps, 2)])`. `advancePowerExpectationChain`
(`packages/sim/src/selling.ts`) is the one writer, called from `resolveSellViaWalkIn` at the moment
of delivery, reading the delivered car's power exactly as `normalizedPowerScore` does: a delivery
that beats the existing best restarts the chain at step 0; a delivery that clears the current bar
without beating the best climbs one step (capped at step 2, minus 1 per cent); a delivery below the
bar changes nothing. **Nothing reads the bar yet** - no archetype's `statTargets.power` moves with
it, matching the design's own instruction not to wire it into buyer taste this sprint.

**Design of record updated**, not only code: `docs/design/systems/scene-standing-refactor.md`
section 13 step 0 (marked BUILT, the shipped shape recorded) and
`docs/design/systems/sale-value-system.md` (a new subsection under Stage E). `docs/carstats/power.md`'s
ceiling reference corrected 300 -> 600. The radar's own `statFormulas.radarPowerCeilingPs` (800) is
untouched.

**Verification.** `pnpm typecheck` clean across content/sim/game. All three test projects green:
content 610/610, sim 2234/2234, game 948/948. Four pre-existing failures were real fallout from the
ceiling change, all directive 17 case (a) - stale assertions against the old ceiling, not
regressions:

- `schemas.test.ts` and `economyApprovalGate.test.ts`: direct pins of the old 300 value and the old
  `economy.json` hash - re-pinned to 600 and the fresh hash.
- `advanceDay.test.ts`'s acquisition-to-sale golden hash: moved because `powerExpectationChain` is
  now written for the first time on a real sale; the 30-day master (which never completes a sale)
  held unchanged, confirming the cause. Re-derived from a real run and re-pinned, with the usual
  narrated history.
- `storyMissionProbes.test.ts`: `street-power-street-manners`'s freshly-measured tuner taste ratio
  now rounds to 1.04, not the previously-pinned 1.05 - re-derived mechanically (the same probe
  build, read through the new ceiling) and `storyMissions.json`'s `tasteMatch.tuner.minMultiplier`
  updated to match; `payoutYen`/`budgetCapYen` unchanged.
- `valuation.test.ts`, two tests whose premise was "a stock/lightly-loaded car alone overshoots the
  daily-drivers upper bound" - no longer true for any shipped stock car once the upper's PS
  equivalent doubled (165 -> 330), which is the INTENDED effect of Part 1. Rewrote the caged-engine
  test against the GT-R (flagship, 280 stock PS) instead of the entry-tier City Turbo II, whose
  full-race build could no longer clear 330 PS; rewrote the kei-vs-flagship preference test to
  build the Supra with a modest sport-grade turbo/intake/exhaust/ECU fit rather than leaving it
  stock, since no shipped car's stock trim crosses the new upper at all any more (by design - 600
  sits above the roster's fastest stock car).

Economy approval gate re-pinned in the same change (`economyApprovalGate.test.ts`), with the full
lever list, the measurement summary and the mechanical `storyMissions.json` consequence recorded in
its own comment.

**Not committed** - awaiting review per the sprint workflow.
