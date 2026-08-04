# The scene standing arc: index

**Design of record:** `docs/design/systems/scene-standing-refactor.md` (finalised).

Seven sprints, 175 to 181. This page carries the facts every one of them rests on, verified against
the code on 2026-08-04, so no sprint doc restates them and none can quietly disagree.

| sprint | what | blocked by |
| --- | --- | --- |
| **175** | Buyer power expectation | **a maintainer decision, not yet made** |
| **176** | The six scenes: buyers and channels | 175 |
| **177** | Standing moves the band | 176 |
| **178** | The earn event and the shop ledger | 177 |
| **179** | Word of mouth, and scene commissions | 178 |
| **180** | The operation chassis and its six skins | 178 |
| **181** | Teardown of the old specialty system | 179, 180 |

## Verified current state

Everything here was read from the source, not recalled.

### The six buyer archetypes

`packages/content/data/buyers.json`. Each carries `statTargets` per stat as
`{target, upper?, importance}`, `tierPreferences` and a `wantLine`.

| id | display | the shape of it |
| --- | --- | --- |
| `collector` | Collector | authenticity target 0.9 **importance 1.0**; power importance 0.15 with an `upper` of 0.5 |
| `tuner` | Tuner | power target 0.65 importance 0.9; **authenticity importance 0** |
| `stancer` | Shakotan | style target 0.65 **importance 1.0**; reliability and authenticity both importance 0 |
| `racer` | Racer | power target 0.75 **importance 1.0**, handling target 0.75 importance 0.9; authenticity 0 |
| `first-timer` | First-timer | reliability target 0.75 **importance 1.0**; power `upper` 0.55 |
| `hobbyist` | Hobbyist | handling 0.7, style 0.8, authenticity importance 0.5. **Deleted by this arc** |

**The tuner-0 / collector-1.0 authenticity split is the sharpest authored distinction in the file**
and the refactor is explicit that broadening the tuner must not soften it.

### The five selling channels

`economy.json`'s `sellingChannels`.

| channel | fee | ceiling | matchedOnly | hobbyist weight |
| --- | ---: | ---: | --- | ---: |
| `shopFront` | 0 | **1.0** | no | 1.0 |
| `freeAdsPaper` | 1,500 | 1.05 | no | **1.4** |
| `tunerMagazine` | 12,000 | **1.17** | **yes** | 0.05 |
| `weekendMeet` | 3,000 | **1.17** | **yes** | 0.8 |
| `tradeNetwork` | 0 | none | n/a | **none** |

**`tradeNetwork` has no `buyerPoolWeights` and no `tasteCeiling`**: it is wholesale, its buyer is not
a real `Buyer.id`, and it therefore can never produce a matched sale. That is already true and stays
true.

**Collectors genuinely have no favoured selling channel**: best weight 1.0 at the shop front, 0.15
in the magazine, 0.3 at the weekend meet. The refactor's Collector Network consignment channel is
the fix.

### The taste band, exactly

`valuation.ts`, `channelTasteMultiplier`. `tasteSpread` is **0.12**, so the standard band is
**[0.88, 1.12]**.

```
low       = 1 - spread                       = 0.88
normalTop = 1 + spread                       = 1.12
ceiling > normalTop  ->  low + (ceiling - low) * score     (REPLACES the band)
ceiling <= normalTop ->  min(low + (normalTop - low) * score, ceiling)   (CLAMPS it)
```

`score` is `normalizedTasteScore`, 0 to 1. **This function is the single insertion point for
per-scene standing**: a stage that moves a floor or a ceiling is changing `low` and `ceiling` for
one scene's buyers and nothing else.

### The matched delivery already exists

**This is the arc's most important finding and it removes most of step 4's risk.**
`resolveSellViaWalkIn` in `selling.ts` already computes exactly the definition the design names:

```ts
const matched = buyer !== undefined && tasteCeiling !== undefined
  ? channelBuyerTaste(buyer, model, car, ..., tasteCeiling) >= 1
  : false
```

It already drives `reputation.matchedSaleRepBonus`, and its own comment already calls it MATCHED.
`drawPersonaChannelOffer` uses the same `>= 1` test to gate the two `matchedOnly` channels. **So the
earn event needs a hook, not a detector.**

The channel is recoverable at accept time from `state.carsForSale.find(...)?.channelId`;
`PendingSaleOffer` itself carries only `{carInstanceId, buyerId, priceYen}`.

### The operation chassis already exists as machining

`machining.ts` plus `economy.json`'s `machining` block. An operation is authored as:

```
{ id, displayName, description, carPartId, powerFraction (per engine character),
  spec, authenticityCost, labourPoints }
```

applied per `PartInstance`, with `gradeMultiplier`, `reliabilityCostPerOperation` and
`valuePremiumPerOperation` alongside. **This is the "one chassis, six skins" shape the design
requires, already proven in code**, which is what makes sprint 180 feasible at all.

### The old specialty system, and its reach

**31 files mention specialty.** The load-bearing ones:

- `serviceJobs.ts`: `freshSpecialty`, `topSpecialtyGroup`, `applySpecialtyDelta`, and the offer
  bias, in-lane premium and title derivation that read it.
- `missions.ts`: the third caller of `applySpecialtyDelta`, reading a mission's authored
  `specialtyGroups`.
- `storyMissions.json`: **all ten missions carry `specialtyGroups`**, and they are hand-written tags
  with no link to their own requirements. `four-wheels` is tagged `["body"]` for a tyre-and-engine
  job, which is the tutorial's crediting bug.
- `techniques.json`: six techniques, `thresholdPoints` **120** each, each carrying
  `unlocksTemplateIds` pointing at one service-job template.
- `economy.json`'s `specialty` block: `biasFactor` 0.5, `softcapPoints` 100,
  `premiumThresholdPoints` 40, `inLanePremium` 1.15, `titleThresholdPoints` 80,
  `titleBiasMultiplier` 1.25.
- `gameState.ts`: the `specialty` record. `StandingScreen.vue` displays it.
- `specialtyCopy.ts` and `specialtyCopy.json`: per-discipline copy.

### Personas carry no archetype

`personas.json` entries have **`id`, `name`, `intro` and nothing else**. `four-wheels` links to
`yuki` by `personaId`. Giving personas an archetype is what lets a mission credit a scene without a
hand-written tag, and is why the tutorial needs no rewriting.

### The power ceiling, and why it blocks everything

`statFormulas.powerNormalizationCeiling` is **300 PS** and `normalizedPowerScore` divides by it.
Against that:

| archetype | power target | satisfied at |
| --- | ---: | ---: |
| racer | 0.75 | **225 PS** |
| tuner | 0.65 | 195 PS |
| collector | 0.3 (`upper` 0.5) | 90 PS |

**Nine roster cars exceed 225 PS in stock form** and a fully built engine clears it twice over. So
the Racers scene, whose craft operation is power and handling past catalogue, sells into buyers who
stopped caring three quarters of the way down the range. Sprint 175 exists to fix this before
anything depends on it.

## Rules this arc obeys throughout

- **Result quality is specialty's domain. Rate, cost and access are not.** Not how fast, not how
  cheap, not whether: how well.
- **Value never reads stats.** `marketValueYen` stays stat-blind; stats route through taste only.
- **Nothing basic is ever locked.** Every operation is additive capability.
- **No rate multipliers, ever**, in any form. That principle killed four earlier proposals and is
  recorded in the design's decision log.
- **Banned vocabulary unchanged.** The system says scene, standing, stage, deed, ledger, operation.
- **Everything is a tally underneath and no number is ever surfaced.** The ledger is a history of
  cars, not a bar.

## Acceptance test for the whole arc

Give two players with different scene standings the same auction sheet. **If their shortlists
differ**, the Show Crowd shop bidding on the rust-free shell and the Touge shop on the tired chassis
with good bones, the system works.
