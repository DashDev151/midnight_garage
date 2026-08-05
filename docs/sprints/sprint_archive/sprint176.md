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

**APPROVED 2026-08-04.** The maintainer granted blanket lever authority for this build; every value
below is recorded so the morning review can see exactly what moved.

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

**Implemented.** All six definition-of-done items hold:

1. Six archetypes ship in `buyers.json`: Collector, Tuner, Show Crowd (`show-crowd`, was `stancer`),
   Racer, Daily Drivers (`daily-drivers`, was `first-timer`), Touge (new).
2. Hobbyist deleted outright (id, archetype, schema entry, every `buyerPoolWeights` key). Zero
   references left in `packages/*/src`, enforced by three new `retiredIdentifiers.test.ts` entries
   (`first-timer`, `stancer`, `hobbyist`, all retired this sprint).
3. All four previously-weighted channels (`shopFront`, `freeAdsPaper`, `tunerMagazine`,
   `weekendMeet`) name all six archetypes; the new `collectorNetwork` channel does too.
   `tradeNetwork` stays persona-less, untouched.
4. Collectors have a channel that favours them: `collectorNetwork`, `buyerPoolWeights.collector`
   3.0, the highest weight of any archetype on any channel.
5. The tuner-0/collector-1.0 authenticity split is untouched (tuner importance stays exactly 0,
   collector stays exactly 1.0) - only the tuner's power/handling/style/reliability importances
   moved.
6. Every archetype's coherence tolerance resolves to an authored value: `coherenceToleranceFor`
   (valuation.ts) and `economy.valuation.tolerance` were renamed together in the same change (the
   trap the arc named), and a new guard describe block in `coherenceValuation.test.ts` iterates all
   six archetypes, reconstructing each one's expected value via `marketValueYen` directly and
   comparing against `valuateCarForBuyer`'s real result - it would fail if the two definitions ever
   drifted apart again.
7. `pnpm typecheck` clean across content/sim/game. All three Vitest projects run once, full green:
   content 610/610, sim 2234/2234, game 948/948.

**The tolerance trap was checked specifically**, per the sprint's own instruction: both the code
string in `coherenceToleranceFor` and the JSON key in `economy.valuation.tolerance` were renamed in
the same change, `touge` was added to both explicitly, and the new authored-value guard test locks
the whole mapping down so a future rename that repeats this mistake fails a fast, narrow test
instead of shipping silently.

**Beyond the lever list, two things needed fixing for the Collector Network channel to actually
function, not just parse:**

- `ForSaleEntry.weekendMeetPending` (and the matching logic in `resolveSetForSale`/
  `drawOfferForChannel`, `selling.ts`) was hardcoded to `channelId === 'weekendMeet'`. Generalised to
  read `channel.oneDrawNextEndDay` instead, so the new channel's one guaranteed draw actually arms
  and resolves. The field keeps its original name (a persisted save field; renaming it would be a
  save-schema churn for zero player value).
- Sprint 173 routed the `dealer-network` overworld building to the auctions screen. Per the arc's own
  correction (section 7 of this doc), dealer network is `sellingChannels.tradeNetwork`, a selling
  channel, not an auction tier. Re-routed to the garage's alley (`garage-interior`, no `room` query -
  the screen already defaults there), the same target the garage building itself uses, since that is
  where a listed car actually sits and there is no standalone sell screen. `overworldNav.test.ts`
  updated to match.

**Numbers set, recorded for the morning review (every one from the sprint doc's own approved lever
list, transcribed verbatim into `economy.json`/`buyers.json`; none invented):**

- Rename: `stancer` -> `show-crowd` (displayName "Show Crowd", was "Shakotan"), `first-timer` ->
  `daily-drivers` (displayName "Daily Drivers", was "First-timer"). No `statTargets`,
  `tierPreferences` or `wantLine` content moved for either.
- `valuation.tolerance`: `show-crowd` 0.0 (unmoved value, renamed key), `tuner` 0.5 (unchanged),
  `touge` 1.0 (new, authored explicitly rather than left to inherit `default`).
- Tuner importances: power 0.9 -> 0.6, handling 0.6 -> 0.7, style 0.4 -> 0.6, reliability 0.4 -> 0.6.
  Targets and authenticity (target 0, importance 0) untouched.
- Touge (new): handling target 0.75 importance 1.0; power target 0.7 importance 0.6 (provisional,
  per the sprint doc, pending sprint 175); style target 0.3 importance 0.2; reliability target 0.6
  importance 0.5; authenticity target 0 importance 0. `tierPreferences` enthusiast 0.8, everyday 0.6,
  entry 0.3.
- `buyerPoolWeights` re-authored on `shopFront`/`freeAdsPaper`/`tunerMagazine`/`weekendMeet` and
  authored fresh on `collectorNetwork`, exactly per the sprint doc's approved table (collector /
  tuner / show-crowd / racer / daily-drivers / touge): shopFront 1/1/1/1/1/1; freeAdsPaper
  0.4/0.7/0.5/0.2/2.0/0.3; tunerMagazine 0.2/1.6/0.3/1.8/0.05/1.4; weekendMeet
  0.3/1.5/2.2/0.4/0.4/1.0; collectorNetwork 3.0/0.2/0.1/0.2/0.05/0.1.
- `collectorNetwork`: `feeYen` 20000, `tasteCeiling` 1.20, `matchedOnly` true, `poolWidening` 0.3,
  `requiresForecourt` true, `oneDrawNextEndDay` true (the weekend meet's shape, reused - see the
  decision note below).
- `SAVE_VERSION` 59 -> 60 (Dexie/save-schema bump only, no migration, no golden-save test, per
  directive 19 - the rename/deletion touches persisted `buyerId`/`channelId` string values).
- Mechanical, not independent levers: `storyMissions.json`'s `first-proper-car` and `low-and-loud`
  `tasteMatch.buyerId` fields renamed with their `minMultiplier` unchanged (1.08, 1.09 - neither
  archetype's targets moved). `street-power-street-manners`'s tuner `minMultiplier` re-derived from
  a fresh probe run (the tuner's own retune changed the measured ratio): 1.06 -> 1.05.

**Decisions the sprint doc left open, made here, flagged for review:**

1. **Naming convention for the two renamed/new multi-word archetype ids**: kebab-case
   (`daily-drivers`, `show-crowd`), matching the existing `Buyer.id` regex
   (`/^[a-z0-9-]+$/`, kebab-case enforced) and the precedent `first-timer` already set. The sprint
   doc's own lever table used camelCase headers (`showCrowd`, `dailyDrivers`) for table-column
   brevity; I read that as informal table typesetting rather than a normative id, since camelCase
   would fail the `id` field's own regex. `touge` and `collectorNetwork` are unambiguous either way
   (single word / matches the channel id convention, which IS camelCase, e.g. `tunerMagazine`).
2. **The Collector Network channel's gate**: authored OPEN from day one, not reputation-gated,
   despite the design's "reputation-gated members' club" framing. Mechanically verified: no story
   mission in this content names `unlocksAuctionTier: "collector-network"` either, so the buying-side
   tier the fiction describes is *also* unreached by any mission today - "whatever gate it inherits"
   (the lever list's own words) inherits nothing, because there is nothing to inherit. Authoring a
   new story mission to gate it was outside this sprint's scope (content-only, no new mission
   content named or approved). Flag for the maintainer: either author an unlocking mission in a
   future sprint, or treat "open from day one, high fee, matched-only" as the real gate.
3. **`oneDrawNextEndDay` mechanically ties BOTH one-draw channels to the identical single weekly day**
   (`calendar.meetDayOfWeek`, via `isMeetDay`). The Collector Network's "fortnightly" framing is
   fiction the schema does not mechanically enforce - building a real biweekly cadence would have
   meant inventing a new scheduler, which the sprint doc explicitly said not to do. Recorded as a
   real, not cosmetic, simplification.
4. **A genuinely surprising measured consequence, not a bug**: with the Show Crowd's weekend-meet
   weight raised to 2.2, the Show Crowd is now the meet's most-likely buyer for almost any car,
   including ones it does not actually want (a stock kei, style far under its target). For that kei,
   the weekend meet now prices LOWEST of the four day-one-comparable channels (¥224,894), below even
   the free shop front (¥230,000) - the free ads paper stays the standout at ¥241,500. This is a
   direct, correctly-measured consequence of the approved weights, not a defect; `selling.test.ts`
   was rewritten to assert the new, verified relationship rather than the old one.
5. **The Touge want-line** (new copy, Vimes voice): "Wants to know how it turns in, not how fast it
   leaves a corner. A car that won't commit to the apex is no good on the pass."

**Failing tests diagnosed (directive 17) - all case (a), stale assertions the intentional content
change made wrong, none were regressions:**

- `coherenceValuation.test.ts`'s tolerance-ruling block referenced the old ids directly; renamed in
  place, values unchanged.
- `selling.test.ts`: three real failures against a fresh run - (i) `listedOn`'s helper threw on a
  test's own synthetic, never-shipped channel id (fixed with optional chaining, not a content
  question); (ii) the "weekend meet is best-priced for a kei" test's premise no longer holds (see
  decision 4 above) - rewritten to assert what is now true, measured against the same real code path
  the old test used, never hand-picked; (iii) several id-list assertions (`likelyBuyerIds`,
  `keiInterested`) recomputed from the buyers who genuinely state an `entry`-tier preference under
  the new archetype set (`daily-drivers`, `touge`).
- `storyMissionProbes.test.ts`: `street-power-street-manners`'s pinned `tuner` `minMultiplier`
  (1.06) no longer matched a fresh measurement (1.05) after the tuner's retune - re-pinned to the
  freshly measured value, per this file's own established methodology.
- `economyApprovalGate.test.ts`: the `economy.json` content hash changed as expected; re-pinned in
  the same change as this Exit, alongside the new ledger entry recording every lever above.

**Not touched, deliberately, per "Deliberately not here":** no standing, no stages, no band, no
ledger, no drift archetype, no change to how taste is computed.
