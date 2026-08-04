# Sprint 175: what a buyer wants from an engine

**Arc:** `docs/sprints/scene-standing-arc.md`. This is step 0, the prerequisite.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, section 13 step 0.

**BLOCKED. This sprint cannot be implemented until the maintainer settles the model below.** It is
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

**Nothing is proposed here.** A number invented at implementation time is exactly what directive 22
exists to prevent, and this one reaches every buyer, every car and every sale.

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
3. The model is written into `desirability-system.md` or the sale-value design, not only into code.
4. The radar's own ceiling is untouched.

## Levers (directive 22)

**Every value in this sprint is a lever and none is approved.** It cannot start.

## Exit

_Blocked pending a maintainer decision._
