# Context for a reviewer: the systems the sale value design sits on

**Companion to `sale-value-system.md`.** That document proposes changes to how a car is
priced, sold and judged. This one explains, briefly, the systems it depends on and does not
change, so a reviewer can evaluate the proposal without reading the codebase.

## The game

**Ran When Parked.** A turn-based garage management sim set in Japan, 1995 to about 2005.
Buy a car, work out what is wrong with it, repair or modify it, sell it. Days are discrete;
nothing happens while the browser is closed. No reflex input anywhere: every decision is
made at rest. Currency is period yen.

## Cars, tiers and parts

- A roster of **94 cars**, of which 26 are built. Each carries an authored `bookValueYen`
  and a **tier**: entry, everyday, enthusiast, flagship. Tier is a price band, and it keys
  parts costs, market expectations and generation severity.
- **29 part slots** per car (engine, drivetrain, suspension, body, wheels, interior). Each
  slot holds one part.
- Parts come in four **grades**: stock, street, sport, race. A part's price is
  `baseCost x classFactor[tier] x gradeFactor[grade]`, so the same race turbo costs six and
  a half times as much on a flagship as on an entry car.
- **Condition** is five bands: mint, fine, worn, poor, scrap, with factors 1.00, 0.85, 0.65,
  0.40, 0.15. A part can also be missing.

## The performance model, which is LOCKED

- A real physics model, validated to about **2 per cent** against the maintainer's own driven
  laps, running four calibrated courses. It is the game's physics and is not up for revision.
- It consumes measured per-car figures (lateral grip, braking distances, acceleration times,
  drag) and produces lap times.
- **A binding law: performance never moves price.** A car is not worth more for being faster.
  This is why the value stack is stat-blind until the taste stage.
- **Reliability is explicitly not performance.** It says whether the car works, and it has
  always been a legitimate input to value. That is the one route from a build to a price.

## The five derived stats

Every car resolves to `power`, `handling`, `style`, `reliability`, `authenticity`, each on a
0 to 100 scale (power is normalised against a ceiling and may exceed it).

- **Power.** Aftermarket power is a fraction of the car's own stock output, not a flat figure.
  Each engine derives a character from its specific output and induction: high-strung NA,
  lazy NA, or forced. A parts-only build caps at about x1.43, x1.57 and x1.95 respectively.
- **Handling** comes from suspension, brakes, tyres and the physics dials.
- **Style** is a per-car band rather than an additive total. A car has an authored `styleBase`
  (15 to 88 across the roster) and a `styleCeiling` (42 to 96), a mint stock car reads its base
  exactly, and fitted parts close the gap between the two.
- **Authenticity** starts high on an original car and is destroyed by fitting aftermarket.
  It is deliberately anti-correlated with power.
- **Reliability** is described below.

## Reliability, rebuilt across the last four sprints

    reliability = reliabilityBase
                * clamp(conditionFactor + coherenceFactor - 1, 0, 1)
                * intensityFactor

- **`reliabilityBase`** is per car, 65 to 100, authored for all 94. It is character, not
  difficulty: an NSX and a Countach sit thirty points apart. A stock mint car reads exactly
  its base, and **nothing ever exceeds it**.
- **`conditionFactor`** is a weighted mean of part condition over 21 reliability-bearing
  parts, capped by a severity ceiling that scales with the worst part's own relevance, so a
  poor propshaft no longer cripples a car as hard as poor cooling.
- **`coherenceFactor`** is `min(1, headline / 0.90)^2`, from the support ratios below.
- **`intensityFactor`** is `1 - 0.20 x totalPowerGain`. More energy through every part means
  less reliability, even on a perfect build. A fully supported race build reads about 82 per
  cent of base rather than 100.

## The support ratios, which are what "coherence" means

Five subsystems, each with something that **demands** and something that **supports**:

| subsystem | demanded by | supported by | demand weight |
| --- | --- | --- | ---: |
| cylinder pressure | the turbo | internals, block | 2.0 |
| revs | the cams | head/valvetrain, internals | 3.5 |
| fuelling | total power gain | fuel system | 0.8 |
| heat | total power gain | cooling | 0.7 |
| torque transmission | total power gain | clutch, gearbox, driveline, differential | 0.9 |

- The **weakest of the five ratios is the headline**. Buying the biggest turbo does not help
  if the bottom end cannot hold it.
- **Demand and support both read a part's GRADE, never its condition.** Specification does
  not decay: a worn forged conrod is still stronger than a stock cast one. Condition is
  priced once, in the condition factor.
- Stock parts carry a **factory margin proportional to demand**, so a sensible modest build
  is not punished, while an unsupported big one is.
- A readout names the weakest subsystem to the player.

## Repair, labour and time

- Repairing a part costs parts money and **labour slots**, of which the player has a small
  number per day. **Labour, not cash, is the real bottleneck**, which is why a build that
  needs fewer parts is meaningfully faster to turn around.
- Tools have tiers and gate how far a part can be repaired.
- Every car spawns with fixable work. Repair up to the market's expectation returns 1.3x its
  cost; that is the game's dependable earner.

## Where cars come from

- **Auction houses**, drawing a mix of tiers, generating each lot deterministically from a
  seed with condition, faults and a hidden true cause.
- The player inspects, diagnoses and bids. What a car looks like and what it is are
  deliberately different things.
- A **scrapyard** is designed but unbuilt: readable wrecks, parts of unknown condition, and a
  routing puzzle. The sale-value proposal leans on it as the dodgy player's cheap supply.

## Reputation as it stands

- A single score, moved by sale quality: **lemon, clean, concours**, currently judged on
  condition and authenticity only.
- It unlocks auction houses, tool tiers and mission access.
- **Known defect, and load-bearing for the proposal: it is a ratchet.** Unlocks never close,
  so once everything is open, losing standing costs nothing. Any design that makes reputation
  the penalty for bad work must fix this, or the penalty is inert.

## Selling as it stands

Five channels, each with a fee, an offer rate and a ceiling on the taste multiplier:
shop front (free, ceiling 1.00), free ads paper, trade network (taste-blind, fast, 0.95 to
1.02), tuner magazine and weekend meet (both fee-gated, ceiling 1.17, both refuse a car below
an average fit).

## What has just changed, for context

Four sprints landed immediately before this proposal: condition now reaches aftermarket
parts, power became proportional to the car's own output, an incoherent build now loses
reliability, and forced induction gained increasing returns with a matching price ladder.
The proposal is the next step: making those consequences actually reach the money, the
waiting and the player's name.
