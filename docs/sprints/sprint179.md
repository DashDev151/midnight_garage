# Sprint 179: word of mouth, and work that comes to you

**Arc:** `docs/sprints/scene-standing-arc.md`. Steps 5 and 6.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, sections 5 and 8.

The two things standing grants below The Shop stage. After this, being known changes **who walks in**
as well as what they pay.

## Goal

**Known changes the crowd. Respected brings you briefs.**

## 1. Word of mouth (the Known payload)

**That scene's draw weight is increased across all your channels.**

`sellingChannels[*].buyerPoolWeights` already biases who turns up, without gating: anyone can walk
into the shop front, a tuner is simply far likelier to read the magazine. **That stays the deliberate
aiming tool**, and word of mouth multiplies on top of it rather than replacing it.

**Combined with the rolling delivery window** recorded in sprint 178: the daily draw follows recent
deliveries as well as standing, so pivoting scenes takes effect in days rather than requiring a
second climb. "Switch, or keep reaping" stays a live decision through the whole mid-game.

**The guard that matters:** word of mouth must not make a channel's authored character meaningless.
A Collector at The Shop should not flood the free ads paper, where collectors are authored at 0.4,
with collectors. Decide whether word of mouth scales the existing weight (multiplicative, so a
channel that does not carry a scene still barely carries it) or adds to it (additive, which
overrides authoring). **Multiplicative is almost certainly right**; say which you chose and why.

## 2. Scene commissions (the Respected payload)

**Better-paying briefs, authored on that scene's own stat targets.**

A commission is a job someone brings you, which the game already has two shapes for:

| existing shape | what it is |
| --- | --- |
| `storyMissions.json` | ten hand-authored missions with a persona, requirements, a budget cap and a payout |
| `serviceJobTemplates.json` | generated service jobs with tasks and payouts |

**A scene commission is closest to a story mission**: a named customer, a brief, a payout, and a
requirement that reads the scene's own taste. Reuse that shape rather than inventing a third.

Its requirement should be **the scene's own stat targets**, so a Touge commission asks for the
handling a Touge buyer wants and a Collector commission asks for originality. That way the brief and
the buyer cannot drift apart: both read one authored source.

**A completed commission is the second earn event** (sprint 178, section 4 of the design), so
finishing one credits its scene exactly as a matched delivery does.

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| Biasing who turns up | `buyerPoolWeights`, per channel. Word of mouth scales it |
| Drawing a buyer | `pickWeightedCandidate` and `drawPersonaChannelOffer`, already weighting a pool |
| A brief with a customer, a budget and a payout | `storyMissions.json` and `resolveDeliverMission` |
| What a scene wants | `buyers.json`'s `statTargets`, read by the commission's requirement |
| Crediting a completed commission | the earn event built in sprint 178 |

**Genuinely new:** the word-of-mouth weighting itself, and commissions as a generated rather than
hand-authored brief.

## Levers (directive 22)

**Not approved:**

1. **The word-of-mouth multiplier per stage.** How much more of a scene turns up at Known,
   Respected and The Shop.
2. **The rolling window's weight** against standing: how much recent work counts versus history.
3. **Commission payouts.** These are mission payouts, which directive 22 names explicitly.
4. **How often a commission arrives**, per stage.

## Definition of done

1. Reaching Known visibly changes who turns up, on every channel, without erasing a channel's
   authored character.
2. Recent deliveries shift the draw within days.
3. A Respected scene offers commissions written against that scene's own targets.
4. Completing one credits that scene.
5. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

The craft operations (sprint 180) and the teardown (181).

## Exit

_To be completed at the end of the sprint._
