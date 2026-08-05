# Sprint 177: standing moves the band

**Arc:** `docs/sprints/scene-standing-arc.md`. Step 3.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, section 5.

The mechanism, without the means of earning it. Standing is set by hand in tests and by the dev
console here; sprint 178 makes it earnable.

## Goal

**Being known in a scene changes what that scene pays you, and changes nothing for anybody else.**

## The insertion point, verified

`valuation.ts`'s `channelTasteMultiplier` is the single place a taste band is built:

```
low       = 1 - tasteSpread                  = 0.88
normalTop = 1 + tasteSpread                  = 1.12
ceiling > normalTop  ->  low + (ceiling - low) * score
ceiling <= normalTop ->  min(low + (normalTop - low) * score, ceiling)
```

**A stage moves `low`, `ceiling`, or both, for one scene's buyers only.** Nothing else in the
pricing path changes, and every other scene continues to price exactly as it does today.

## The stages

| stage | that scene's band | first-pass, tunable |
| --- | --- | --- |
| **Known** | floor 0.88 to **0.92** | |
| **Respected** | floor to **0.95**, ceiling 1.12 to **1.17** | 1.17 is exactly the magazine and weekend-meet ceiling, so a Respected scene pays magazine money off the shop front |
| **The Shop** | ceiling to **1.25** | past every channel that exists |

### The rules that keep it honest

**"Anything above 1.12 is matched-only" is toothless as written, and needs a decision before build.**

MATCHED in the code is `channelBuyerTaste >= 1.0`, a test on the OUTPUT price. Any payment above 1.12
trivially satisfies it, so the rule enforces nothing. Worse, because standing raises the FLOOR, the
bar for being matched at all falls as standing rises:

| stage | band | score needed to be "matched" |
| --- | --- | ---: |
| none | 0.88 to 1.12 | **0.500** |
| Known | 0.92 to 1.12 | 0.400 |
| Respected | 0.95 to 1.17 | 0.227 |
| The Shop | 0.95 to 1.25 | **0.167** |

**That is a compounding loop the design did not intend**: more standing makes matching easier, and
matching is what earns standing. And concretely, at The Shop a score-0.6 car - a fairly WRONG car -
prices at `0.95 + 0.30 x 0.6 = 1.13`, above the old ceiling, which is exactly what the rule was
written to prevent.

**The fix for both is one change: define matched on the SCORE, not on the price.**
`normalizedTasteScore >= 0.5` is the score that yields 1.0 at the standard band, so it means the
same thing at every stage and cannot drift. **This is a lever and a behaviour change**: it also
governs the two `matchedOnly` channels and `reputation.matchedSaleRepBonus` today, so it must be
approved rather than assumed.

**Ceilings take the max, never stack.** For that scene's buyers the effective ceiling is
`max(channelTasteCeiling, sceneStandingCeiling)`. **Stacking would compound**: a Respected scene in
the magazine would otherwise reach 1.17 + 0.05, and The Shop would run away entirely.

**The floor stops at 0.95, never 1.0.** Respect is not gullibility. The design's other half, that a
specialised car is also somebody's WRONG car, survives only because the floor rises partway.

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| Building a taste band | `channelTasteMultiplier`, the one place it happens. It gains a per-scene floor and ceiling rather than a second function |
| Channel ceilings | `sellingChannels[*].tasteCeiling`, unchanged. Standing takes the max against it |
| Matched detection | `channelBuyerTaste >= 1`, already live in `resolveSellViaWalkIn` and in the `matchedOnly` gate |
| Per-buyer pricing | `valuateCarForBuyer` and `valuateCarForBuyerViaChannel`, both already routing through the multiplier |

**Genuinely new:** a per-scene standing record on `GameState`, and the floor/ceiling lookup from it.

## The work

1. **`GameState` carries a stage per scene.** Six scenes, one of `none | known | respected | shop`.
   Dexie version bump, no migration (directive 19).
2. **`channelTasteMultiplier` takes the scene's band.** Floor and ceiling resolved from the stage,
   ceiling maxed against the channel's own, matched-only above 1.12.
3. **Every call site passes it.** `valuateCarForBuyer`, `valuateCarForBuyerViaChannel`,
   `channelBuyerTaste`, and the bidding path that shares them.
4. **A dev-console control** to set standing, so 178's earn event has something already proven to
   drive.

## The interaction to check before building

**Bidding shares this pricing path.** `valuateCarForBuyer` is used as an AI competitor's true value
at auction as well as for player sale offers. **Scene standing must not change what an AI bidder
pays**: your reputation with the Show Crowd cannot make a rival bid more at the block. Establish
which call sites are the player selling and which are the world valuing, and apply standing only to
the first. Say which is which in the report.

## Levers (directive 22)

**Not approved:**

1. The floors (0.92 at Known, 0.95 at Respected) and the ceilings (1.17 at Respected, 1.25 at The
   Shop). First-pass in the design and explicitly tunable.
2. **The matched definition**, per the analysis above: whether it moves from `taste >= 1.0` to
   `normalizedTasteScore >= 0.5`. This governs the two `matchedOnly` channels and
   `matchedSaleRepBonus` today, so it changes live behaviour and is the one decision this sprint
   cannot start without.

## Definition of done

1. A scene at Known, Respected or The Shop prices that scene's buyers differently, and no other
   scene moves at all.
2. Ceilings max, never stack, against channel ceilings.
3. No raised ceiling is reachable by a mismatched car, **and the test for that does not get easier
   as standing rises**.
4. An AI bidder is unaffected by player standing.
5. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

Earning it, the ledger, word of mouth, commissions, operations. Standing is set by hand.

## Exit

**Built.** `pnpm typecheck` clean across all three packages; all three test projects run once,
green (content 610, sim 2234, game 950).

### Values set (orchestrator's blanket lever authority, recorded for review)

`packages/content/data/economy.json`, `valuation` block:

- `sceneStanding.known.floor` = **0.92** (no ceiling named - Known moves the floor only).
- `sceneStanding.respected.floor` = **0.95**, `sceneStanding.respected.ceiling` = **1.17**.
- `sceneStanding.shop.floor` = **0.95**, `sceneStanding.shop.ceiling` = **1.25**.
- `matchedTasteScoreThreshold` = **0.5** - the score `tasteMatchFor` must clear for MATCHED.
  Mathematically exact, not a guess: `1 - tasteSpread + 2 x tasteSpread x score = 1` at
  `score = 0.5` for any `tasteSpread`, so it is the one value that means "prices at exactly the
  no-standing band's top" at every stage.

`economyApprovalGate.test.ts` re-pinned (hash `ef2782ce...f1f`); the doc comment records both
levers by name and value. No mission payout or budget cap moved - none of the ten story-mission
probes reads scene standing, and the matched-threshold change moves a boolean gate, never a
`marketValueYen` input.

### The insertion point, and what did NOT change

`channelTasteMultiplier` (sim/valuation.ts) is the only place a taste band is built. It gained a
`sceneStanding` parameter; the floor and ceiling it uses now come from
`sceneStandingBandFor(buyer, sceneStanding, economy)` - `none`/`known` return `ceiling: undefined`
(no scene ceiling contribution at all, so a channel's own ceiling is completely untouched -
verified this does NOT leak: at `known`, `freeAdsPaper` (channel ceiling 1.05) stays clamped at
1.05, it does not inherit the standard band's 1.12 top); `respected`/`shop` return the JSON band's
own floor/ceiling. The effective ceiling is `max(channelCeiling, sceneCeiling)`, never a sum - a
Respected scene at the shop front (channel ceiling 1.0) reaches exactly 1.17, matching the design's
own worked example ("Respected pays magazine money off the shop front"), and a Respected scene
IN the magazine (channel ceiling already 1.17) stays at 1.17, not 1.17+0.05.

`tasteMultiplier` (the plain, non-channel function `valuateCarForBuyer` uses) was left **untouched**
on purpose: it takes no ceiling parameter at all and is not the insertion point either doc names.

### Which call sites got standing, and which did not - the classification the sprint asked for

**No auction/bidding code path calls any taste function at all**, so DoD 4 ("an AI bidder is
unaffected by player standing") holds by construction, not by a new guard. Verified by reading
`bidding.ts`/`auctions.ts`: every auction-money figure (`anchorValueYen`, `reserveYen`,
`computeBuyoutPriceYen`, `privateValuationYen`) routes through `carGuideValueYen` ->
`marketValueYen`/`sheetGuideValueYen`, which take no `Buyer` at all - taste belongs to end
customers, not the trade, already a prior refactor's decision. So "the world valuing" and "the
player selling" turned out to already be two disjoint code paths before this sprint touched
anything; the work was choosing which of the PLAYER-SELLING call sites get the new parameter, not
guarding against bidding.

Standing threaded through (all player-selling, all channel-priced):

- `drawDailyOffers` -> `drawOfferForChannel` -> `drawFlaggedChannelOffer` ->
  `drawPersonaChannelOffer` (`selling.ts`) - the real daily listed-channel offer draw, on every
  channel including `shopFront`. `sceneStanding` is threaded as its own explicit parameter the same
  way `reputationTier` already is, sourced from `state.sceneStanding` at the one call in
  `drawDailyOffers`.
- `resolveSellViaWalkIn`'s MATCHED detection (now `isTasteMatched`, see below) and its
  `valuateCarForBuyerViaChannel`/`channelBuyerTaste` exports generally.

Left untouched (plain `valuateCarForBuyer`/`tasteMultiplier`, no ceiling parameter to insert standing
into, and none of them is the channel-priced live offer):

- `pickWeightedCandidate`/`likelyChannelBuyer`/`bestFitBuyer`/`sellViaWalkIn` (selling.ts) - the
  buyer-DRAW weighting (who walks in), deliberately unchanged: word of mouth is the next sprint's
  job, not this one's, and the design's own "Deliberately not here" list names it.
  `sellViaWalkIn` itself is test-only in current wiring (not called by `drawDailyOffers`).
- `gameStore.ts`'s `estimatedSaleValue` - the for-sale toggle's ballpark preview, explicitly "NOT a
  live offer" and channel-agnostic before this sprint too.
- `requirements.ts`'s `evaluateTasteMatch` - a story-mission `tasteMatch` requirement check, not a
  scene sale.
- `bots/sellingHelpers.ts`'s `decideSale` and `bots/runCareer.ts`'s offer telemetry - a bot's own
  accept-threshold heuristic and balance-CSV reference figure, not the real price (which the bot
  already receives correctly standing-priced via the same `drawDailyOffers` every player uses).

### The matched redefinition, and its measured effect

Changed `channelBuyerTaste(...) >= 1` (a test on the PRICE) to `isTasteMatched` (a test on the
underlying `normalizedTasteScore >= matchedTasteScoreThreshold`, buyer/car only) in both places that
read MATCHED: the `matchedOnly` gate in `drawPersonaChannelOffer` (now covers `tunerMagazine`,
`weekendMeet` and `collectorNetwork`) and `resolveSellViaWalkIn`'s `matchedSaleRepBonus` trigger.

Measured with a throwaway probe (run once via `pnpm test`, then deleted - no scratch file left in
the repo) over every real buyer x shipped-model pair (6 buyers x 26 cars = 156 pairs, each car
built mint-stock):

- **At no standing (today's baseline), the redefinition makes MATCHED less frequent, not more**:
  `tunerMagazine`/`weekendMeet` (ceiling 1.17) old-definition matched 94.9% of pairs, new-definition
  87.2%; `collectorNetwork` (ceiling 1.20) old 97.4%, new 87.2%. This confirms the sprint doc's own
  worked arithmetic (old threshold ~0.41-0.5 by channel ceiling vs the new flat 0.5 - REPLACE-branch
  channels with a ceiling above 1.17 were easier to match than the new test, so tightening was
  expected).
- **The compounding loop is real and is now closed.** Re-running the OLD price-based test with the
  floor raised exactly as `weekendMeet` standing would raise it: matched climbs 94.9% (none) ->
  99.4% (known) -> 100.0% (respected) -> 100.0% (shop) - standing alone, with the OLD definition,
  would have made nearly every car "matched" by The Shop regardless of fit. The NEW definition
  (`isTasteMatched`) is mathematically standing-blind by construction (it never reads a ceiling or a
  floor at all) and stays flat at 87.2% at every stage - verified directly from the formula, not
  merely asserted.

### GameState / save

`SceneStandingStageSchema` (`none | known | respected | shop`) and `SceneStandingSchema` (one stage
per `BuyerArchetype`, `.strict()`, all six named) added to `content/src/gameState.ts`;
`GameState.sceneStanding` defaults every scene to `none` (the `specialty` default-object pattern,
not the genuinely-optional-key one, since "unknown everywhere" is a real, immediately-useful value
rather than an absent concept). `SAVE_VERSION` 61 -> 62, additive, no `MIGRATIONS[61]` entry needed
(directive 19 also would have permitted skipping the bump's ceremony entirely, but the mechanical
Dexie/SAVE_VERSION bump the sprint doc asked for was cheap and is in).

### Dev console

`devSetSceneStanding(scene, stage)` (gameStore.ts) and a `sceneStandingView` dev-only readout,
mirroring `devSetReputationTier`/`specialtyView`'s existing shape exactly. Two new `<select>`s plus
a button in `DevConsole.vue`.

### Tests fixed (directive 17 diagnoses)

All of the below are **case (a)**: the implementation change was correct and intentional, and the
test asserted the shape/behaviour from before that intentional change.

1. **22 sim test fixtures + 1 content fixture** hand-built a `GameState` literal missing the new
   required `sceneStanding` field once it stopped being optional-shaped in the type. Added a
   `testSceneStanding()` helper to `sim/tests/testFixtures.ts` (mirrors `testSpecialty`) and one
   `sceneStanding: testSceneStanding()` line to each fixture; `content/tests/gameState.test.ts`'s
   two hand-built fixtures got the equivalent literal.
2. **Two `advanceDay.test.ts` golden-master hashes** moved (`5cd79fb0` -> `b834da40`,
   `e523cc30` -> `f1c5cdb0`) - a pure SHAPE change, the same class the `dyno`/`consumableStock`
   entries in that file's own history already document: `createInitialGameState` now seeds
   `sceneStanding`, and neither script ever reads or sets one, so no roll, cash figure or derived
   stat moved. Re-derived from a real run, recorded in the test's own comment.
3. **`gameStore.market.test.ts`'s matched-sale test** searched for a "matched" buyer/car pairing
   using the OLD `channelBuyerTaste(...) >= 1` definition via `weekendMeet`'s ceiling (1.17) - a
   pairing that clears the old, looser threshold does not necessarily clear the new, stricter 0.5
   score threshold, so the found pairing sometimes failed the (correctly updated) sim assertion.
   Fixed by searching with `isTasteMatched` instead, the same function `resolveSellViaWalkIn` now
   uses. The sibling "unmatched" test (searching via `shopFront`'s ceiling of exactly 1.0) needed no
   change: at a channel ceiling of exactly 1.0, the old price-based test and the new score-based
   test are mathematically identical (both true iff score >= 0.5), which is why only the
   `weekendMeet`-based search broke.

### Files touched

`packages/content/src/gameState.ts`, `packages/content/src/economy.ts`,
`packages/content/data/economy.json`, `packages/content/tests/economyApprovalGate.test.ts`,
`packages/content/tests/gameState.test.ts`, `packages/sim/src/valuation.ts`,
`packages/sim/src/selling.ts`, `packages/sim/src/newGame.ts`, `packages/sim/tests/testFixtures.ts`
plus the 21 sim test fixtures listed above, `packages/game/src/stores/gameStore.ts`,
`packages/game/src/components/DevConsole.vue`, `packages/game/src/save/saveCodec.ts`,
`packages/game/src/save/saveCodec.test.ts`, `packages/game/src/stores/gameStore.market.test.ts`.

Not committed - awaiting review.
