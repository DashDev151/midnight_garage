# Sprint 176: the six scenes

**Arc:** `docs/sprints/scene-standing-arc.md`. Steps 1 and 2.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, sections 3 and 9.

Content only. No standing, no ledger, no operations: this sprint changes **who exists and who reads
which advert**, so that everything after it has real scenes to stand in.

## Goal

**Six scenes, one per buyer archetype, each with a champion stat and a channel that suits it.**

## Reuse analysis (directive 16)

### Reused, not rebuilt

| concern | what already does it |
| --- | --- |
| A buyer's taste | `buyers.json`'s `statTargets`, `{target, upper?, importance}` per stat. Touge is authored in the same shape, not a new one |
| Who reads which channel | `sellingChannels[*].buyerPoolWeights`. Adding a scene is a column, not a mechanism |
| A channel's premium | `tasteCeiling` plus `matchedOnly`, already driving the magazine and the weekend meet |
| A consignment channel's gate | the Collector Network already exists as a reputation-gated, fortnightly **buying** tier. The selling side hangs off the same building, same gate, same fiction |
| Tier appetite | `tierPreferences`, already authored per archetype |

**Nothing new is stood up.** This sprint adds rows and retunes numbers.

### Genuinely new

- The Touge archetype.
- A selling channel on the Collector Network.

## The work

### 1. Rename, without changing behaviour

- `first-timer` becomes **Daily Drivers**. The design's reason: "first-timer" is condescending to
  somebody who just wants a good cheap car. These are budget-commuter buyers.
- `stancer` becomes **Show Crowd**. Broad English; shakotan, kaido racer, VIP, grachan and bosozoku
  live in flavour copy, never in system vocabulary.

**Both are id changes as well as copy**, so every `buyerPoolWeights` key, every save-facing
reference and the `archetype` field move with them. Save schema is a Dexie version bump and nothing
else (directive 19).

**The rename has one trap that typecheck will not catch.** `valuation.ts`'s `coherenceToleranceFor`
hardcodes the strings `'stancer'` and `'tuner'`, AND `economy.valuation.tolerance` keys on them:

```
{ default: 1.0, stancer: 0.0, tuner: 0.5 }
```

That value scales the coherence discount in `marketValueYen`. **Typecheck catches the code string;
nothing catches the JSON key.** Miss it and the Show Crowd silently falls through to `default: 1.0`
and starts caring about coherence, which is the exact opposite of what a stanced car is about, with
no error anywhere.

**Rename both, in the same change**, and add a test that every archetype's tolerance resolves to an
authored value rather than to the default by accident.

### 2. Delete the hobbyist

Not demoted to an unaffiliated pool: **deleted**. Its demand is inherited by Daily Drivers and the
broadened Tuner.

**This is a larger lever change than it reads.** Hobbyist carries **1.4 in the free ads paper** and
**0.8 at the weekend meet**, so removing it does not just drop a row: it shifts every remaining
weight's relative share in four channels and changes who walks in on channels this arc is not
otherwise touching.

**Re-author all four weighted channels deliberately.** `tradeNetwork` has no `buyerPoolWeights` and
is untouched.

### 3. Retune the Tuner

The improve-everything-please crowd. Power importance **0.9 to about 0.6**; handling, style and
reliability importance up.

**Authenticity importance stays 0.** The tuner-0 / collector-1.0 authenticity split is the sharpest
authored distinction in `buyers.json` and broadening the tuner must not soften it.

### 4. Author the Touge scene

Handling-biased, the twin of the power-biased Racers:

- handling importance **1.0**, target about 0.75
- power importance about 0.6
- authenticity importance 0

**The name stays Touge.** Place-based like Show Crowd, and one of the few Japanese terms an English
audience already knows, via Initial D (airing 1998, dead centre of the setting). The era's
self-descriptor was *hashiriya*, "runners": nobody called themselves "a touge", you ran the touge, so
hashiriya belongs in flavour copy only.

Touge needs `buyerPoolWeights` authored into **every** weighted channel. The design's guidance:
weekend meet and magazine plausibly warm, free ads cold.

### 6. Split the magazine and the meet by character

They currently read as the same crowd twice. **The magazine is performance press; the meet is about
being seen.** Racers top the magazine; the Show Crowd dominates the meet. **Tuners stay strong in
both** - they are the biggest scene in the game and should not fall below Touge anywhere.

| | collector | tuner | showCrowd | racer | dailyDrivers | touge |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tunerMagazine | 0.2 | 1.6 | 0.3 | **1.8** | 0.05 | 1.4 |
| weekendMeet | 0.3 | **1.5** | **2.2** | 0.4 | 0.4 | 1.0 |

Weights are relative **within a channel only**: 1.8 in the magazine and 1.8 at the meet are not
comparable quantities.

### 7. The dealer network already exists, and the map points at the wrong thing

**Correction to an earlier claim in this arc.** The dealer network is not missing: it is
`sellingChannels.tradeNetwork`, and `selling.ts` describes its buyer as **"a fax to the dealer
circle, never a named persona"**. It is fully implemented and does exactly what it should:

| | |
| --- | --- |
| `offerChanceFactor` **3** | offers arrive three times as often. Fast |
| `priceBand` 0.95 to 1.02 | uniform around plain `marketValueYen` |
| **no taste roll at all** | so no matched premium, ever |
| `requiresForecourt` **false** | it does not even occupy a bay |

**Sell quickly, from nowhere, and forgo the 1.12 to 1.17 a matched buyer would have paid.** That is
the reduced price, and it is the reason the channel exists.

**The error is in the map.** Sprint 173 routed the `dealer-network` building to the **auctions**
screen, on the reasoning that it names no auction tier of its own. True, and beside the point: it
names a SELLING channel. That routing is wrong and should be corrected.

**What it should point at is a genuine open question**, because a fax is not a place. Listing happens
per car on `CarDetailScreen` and there is no standalone sell screen, so the honest options are the
alley (where cars waiting and for sale actually sit), an informational stop that explains what the
trade pays, or removing it from the map as somewhere you never physically go. **Decide rather than
default.**

### 5. Give the Collectors somewhere to sell

Collectors have **no favoured selling channel**: 1.0 at the shop front, 0.15 in the magazine, 0.3 at
the weekend meet. So the one archetype defined by paying over the odds for the right car has nowhere
to be found.

**Hang a consignment channel off the Collector Network**, which already exists as a reputation-gated
members' club on the buying side, fortnightly, 70 per cent flagship. Collector-heavy weights, a high
ceiling, plausibly the same fortnightly rhythm. Same place, same gate, same fiction.

## Levers (directive 22)

**None of this may be implemented before the values are approved.** Every one is a lever:

1. The four weighted channels' `buyerPoolWeights`, re-authored for the hobbyist deletion.
2. Touge's `statTargets` and `tierPreferences`.
3. Touge's weights in every channel.
4. The Tuner's retuned importances.
5. The Collector Network channel: fee, `tasteCeiling`, `matchedOnly`, `buyerPoolWeights`,
   `poolWidening`, rhythm, and whatever gate it inherits.
6. **`valuation.tolerance` for Touge**, which currently inherits `default: 1.0` by omission.
   Probably right for a scene that wants a car working together, but it decides how hard an
   incoherent car is discounted for them and it should be authored, not defaulted.

**Held until sprint 175 settles**, and authored last rather than guessed now: **the power `target`
on Racers and Touge**. Every other value here is independent of the power model and can be approved
and built without it.

**A note on measuring them.** Bot careers are directive-21 forbidden, so these get judged by the
closed-form probes in Vitest and by play, not by simulation.

## Definition of done

1. Six archetypes: Daily Drivers, Tuners, Collectors, Show Crowd, Racers, Touge.
2. No hobbyist anywhere in content, code, save or copy.
3. Every weighted channel names all six.
4. A collector has a channel that favours them.
5. The tuner-0 / collector-1.0 authenticity split is intact.
6. **Every archetype's coherence tolerance resolves to an authored value**, none falling through to
   `default` by accident.
7. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

- **Standing, stages, the band.** Sprint 177.
- **Drift as a seventh scene.** Reserved, not in this arc.
- Any change to how taste is computed.

## Exit

_To be completed at the end of the sprint._
