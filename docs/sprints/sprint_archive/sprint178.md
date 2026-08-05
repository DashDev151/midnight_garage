# Sprint 178: the earn event and the shop ledger

**Arc:** `docs/sprints/scene-standing-arc.md`. Step 4.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, sections 4 and 8.

## Goal

**Standing becomes earnable, and the record of it is a list of cars you can point at.**

## The earn event already exists

**This is the sprint's central fact and it removes most of the risk.** `resolveSellViaWalkIn` in
`selling.ts` already computes the exact definition the design names, already comments it as MATCHED,
and already drives `reputation.matchedSaleRepBonus`:

```ts
const matched = buyer !== undefined && tasteCeiling !== undefined
  ? channelBuyerTaste(buyer, model, car, ..., tasteCeiling) >= 1
  : false
```

The channel comes from `state.carsForSale.find(...)?.channelId`; the buyer from the pending offer.
`drawPersonaChannelOffer` uses the same `>= 1` test to gate the two `matchedOnly` channels.

**So this sprint hooks an existing computation. It does not write a detector.**

Two facts that fall out and must be preserved:

- **`tradeNetwork` can never produce a matched delivery.** It has no `tasteCeiling` and its buyer is
  not a real `Buyer.id`. Wholesale earns no standing, which is correct: the trade pays wholesale
  precisely because nobody there is choosing your car.
- The matched read happens **at accept time**, against the car as it is being sold.

## The second earn path: commissions

A completed commission for a scene also counts. Scene commissions are a Respected-stage unlock and
arrive in sprint 179, so this sprint builds the event and 179 supplies the second source.

**Missions credit through their customer, not a tag.** `storyMissions.json`'s ten entries carry
hand-written `specialtyGroups`, which is the bug this arc kills. A mission links to a persona by
`personaId`, and `personas.json` entries currently carry only `id`, `name` and `intro`.

**Personas gain an archetype**, and a delivered mission credits that scene. `four-wheels` links to
`yuki`, a student who wants "anything on four wheels that starts every morning" with almost no
money, which is a Daily Drivers buyer exactly.

**The tutorial needs no rewriting.** It teaches take the job, buy a car, diagnose it, fix it, hand it
over, and none of that changes. Only what the handover credits does, and that now comes from the
customer. **No tutorial copy is touched by this sprint.**

## The ledger

**The record of standing is the list of cars, not a number.** Every matched delivery appends: the
car, the scene, the price, the day. The player says "I built those".

**Everything is a tally underneath and no number is ever surfaced.** Stage advancement counts deeds
and compares against thresholds, because everything does. The requirement is that the player is
shown a history and never a bar. Anyone who reads "no point track" literally and tries to build
thresholdless advancement will stall.

The screen: the ledger, filterable by scene, with each scene's current stage stated in words.
`StandingScreen.vue` exists for the old system and is the natural home, but it is torn down in
sprint 181, so decide deliberately whether to grow it or replace it.

## Anti-lock-in: the rolling window

The loop (deliver to a scene, become known in it, draw more of its buyers, deliver more) is the
feature. Unguarded it is the trap: everybody specialises in Daily Drivers because that is the early
stock, and the standing is dead weight by mid-game.

**Standing never decays.** History is history. Stages and operations, once earned, are permanent, so
the Daily Drivers specialist keeps a quick-flip lane forever while chasing Collector standing.

**The daily draw follows recent deliveries**, on a rolling window, on top of the channels' authored
weights. Pivoting takes effect in days rather than requiring a second climb. That weighting lands in
sprint 179; **this sprint records the window** so 179 has something to read.

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| Detecting a matched sale | `channelBuyerTaste >= 1` in `resolveSellViaWalkIn`. Hooked, not rewritten |
| Knowing the channel at accept | `state.carsForSale[].channelId`, already read for exactly this |
| Rewarding a matched sale | `reputation.matchedSaleRepBonus`, already applied there. Standing joins it |
| A per-day event record | the day log and `financeLedger`'s existing shapes |
| Mission delivery | `resolveDeliverMission` in `missions.ts`, the third `applySpecialtyDelta` caller. It swaps what it credits |

**Genuinely new:** the ledger store and screen, persona archetypes, stage thresholds, the rolling
delivery window.

## Levers (directive 22)

**Not approved:**

1. **The stage thresholds.** "A few matched deliveries" and "a body of matched work" are counts and
   need numbers.
2. **The Shop's price bar.** A marquee build is "a matched delivery over a price bar", and that bar
   is a yen figure. Consider whether it should scale with the car's tier rather than be flat: a
   marquee Daily Drivers car and a marquee Collector car are not the same money.
3. **The rolling window's length.**

## Definition of done

1. A matched delivery credits exactly one scene, chosen by the buyer, with no tag anywhere.
2. A trade-network sale credits nothing.
3. A delivered mission credits its customer's scene.
4. The ledger lists real cars, filterable by scene, and surfaces no number.
5. Stages advance from deeds.
6. The tutorial is untouched and still passes.
7. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

Word of mouth, commissions, operations, and deleting the old specialty system.

## Exit

**Built.** `pnpm typecheck` clean across all three packages; all three test projects run once, green
(content 611, sim 2244, game 954).

### GameState / save

`SceneLedgerEntrySchema`/`SceneLedgerSchema`/`FRESH_SCENE_LEDGER` (content/src/gameState.ts);
`GameState.sceneLedger` is `.optional()`. `SAVE_VERSION` 62 -> 63 (Save law - a schema shape change
always bumps it, additive or not), NO `MIGRATIONS[62]` entry (directive 19): a pre-v63 save decodes
with the key absent, which `sceneLedgerFor` reads as every scene's ledger empty - exactly right,
since no pre-v63 career could have earned a credited delivery under a mechanic that did not exist.
`saveCodec.test.ts` gained the one round-trip test the file's own established pattern asks for (the
absent case is already proven by every other test in the file never setting the field), and its six
`SAVE_VERSION` canary assertions moved 62 -> 63.

### Values set (orchestrator's blanket lever authority, recorded for review)

`packages/content/data/economy.json`, new top-level `sceneStandingProgress` block:

- `knownDeliveries` = **3** - total matched deliveries to a scene, ever, that reach Known.
- `respectedDeliveries` = **10** - total matched deliveries, ever, that reach Respected.
- `marqueeBarYenByTier` - **entry 500,000 / everyday 1,200,000 / enthusiast 3,000,000 / flagship
  8,000,000**, keyed on the delivered car's fitment class (`fitmentClassForTier(model.tier)` - the
  same identity Law 3's parts pricing already uses, so no new tier concept was invented).
- `rollingWindowDays` = **14** - how much delivery history the future word-of-mouth draw reads.
  Recorded, not consumed: `recentSceneLedgerEntries` (sim/sceneStanding.ts) exists and is unit
  tested, but nothing shipped calls it yet, exactly as scoped.

`economyApprovalGate.test.ts` re-pinned (`b822e5e1...cb195`); `schemas.test.ts`'s anchor-inventory
key list and `economy-bible.md`'s own anchor table both gained the new top-level block (the audit
test's own comment requires both to move together).

### The Shop's exact rule, spelled out

Per delivery: total deliveries to that scene (after appending this one) decide Known/Respected by
count alone. The Shop additionally needs the scene already at (or newly reaching, on this same
delivery) Respected, AND this delivery's price at or above its fitment class's marquee bar. Reading
both off the same post-append count is deliberate and provably safe: `respectedDeliveries` (10) can
never be cleared by a single delivery, so a scene can never vault from `none` straight to The Shop
in one sale regardless of price - verified directly (`sceneStanding.test.ts`'s "never on a single
cheap sale from nothing"). Standing never regresses: `higherStage` takes the max of the current
stage and the count-derived one before the marquee check ever runs.

### Screen: grew `StandingScreen.vue`, did not add a new one

`StandingScreen.vue` already mixes two concerns - reputation (survives sprint 181) and specialty
(dies there). Adding a third "Scenes" panel to the same screen keeps one nav entry ("Standing" - the
player's one destination for "how known am I") and, when sprint 181 tears the specialty system down,
that sprint deletes exactly the specialty panel and leaves reputation and scenes cohabiting the same
screen - a clean surgical edit either way. A brand-new screen would have needed a new nav link in an
already-busy chrome bar for no player benefit and no cleanup ANY simpler on the teardown side (the
specialty panel is a self-contained `<section>`, trivial to excise regardless of what else shares
the file). The new panel iterates all six scenes as six always-visible cards, each scoped to its own
cars - "filterable by scene" by construction (a scene's own card never shows another scene's cars),
not a dropdown control, so nothing is hidden by default. `game.standingView.scenes` (gameStore.ts)
is the new payload: `stage` and `stageCopy` (`SCENE_STANDING_STAGE_COPY`, new
`utils/sceneStandingLabels.ts`) are the only stage-facing fields - no count, no bar - and `cars` is
the real per-scene ledger, newest first, each row showing the car (`resolveCarDisplayName`, the same
naming-layer call every other car-facing view in the store already uses) and the price it sold for.
`sceneStandingView` (the pre-existing dev-console-only readout) is reused verbatim as the
scene/label/stage source; its stale "earning it is not built yet" doc comment is corrected.

### Persona archetypes authored

`personas.json`'s seven entries, read against their own `intro` and the mission each fronts:

| persona | archetype | why |
| --- | --- | --- |
| `yuki` | `daily-drivers` | Given directly; confirmed by `first-proper-car`'s own `tasteMatch(buyerId: 'daily-drivers')` requirement |
| `okada` | `daily-drivers` | "A parent who reads the classifieds twice" fronting `wont-strand-her` (reliability-gated, entry-tier budget for a commuting daughter) |
| `gen` | `tuner` | Runs a tuning shop; confirmed by `street-power-street-manners`'s own `tasteMatch(buyerId: 'tuner')` requirement |
| `daisuke` | `show-crowd` | "Parks sideways, on purpose"; confirmed by `low-and-loud`'s own `tasteMatch(buyerId: 'show-crowd')` requirement |
| `kaori` | `touge` | Writes the timed columns about "the pass" - Hakone Pass, the shipped Touge course, is literally a mountain pass, and both her missions (`the-column-clock`, `under-one-fifteen`) grade a Hakone lap time |
| `numata` | `daily-drivers` | Thirty taxis, "nothing clever, clever breaks" - a fleet reliability want, `the-fleet-spare`'s own reliability-gated requirement |
| `ishida` | `show-crowd` | Showroom presentation for a forecourt "photograph for the window" - `the-showroom-standard`'s own requirement is a style threshold, not authenticity, so Show Crowd fits the evidence over Collector |

No persona currently fronts `collector` or `racer` - the ten shipped missions simply do not cover
every scene, which is not a gap this sprint's scope requires closing (missions credit through their
real customer; a scene with no current mission earns only through matched sales, exactly as
designed).

### The earn event: hooked, not rewritten

`resolveSellViaWalkIn` (selling.ts) already computed `matched`/`buyer` for `matchedSaleRepBonus`;
the new code reads that SAME pair (`matched && buyer !== undefined`) and calls
`creditSceneDelivery(released, buyer.archetype, {...}, context.economy)` before the sale's final
state assembly - no second detector, per the sprint's own central fact.
`resolveDeliverMission` (missions.ts) reads `context.personasById[mission.personaId].archetype` and
credits unconditionally on a successful delivery (missions grade their own requirements; there is no
separate "matched" test for a mission). `storyMissions.json`'s `specialtyGroups` field is untouched
and still feeds the old `applySpecialtyDelta` call exactly as before - it is simply no longer read
for scene credit, per the sprint's own instruction not to delete it yet.

### The ledger: new content schema, new sim module

`SceneLedgerEntrySchema`/`SceneLedgerSchema`/`FRESH_SCENE_LEDGER` (content/src/gameState.ts);
`GameState.sceneLedger` is `.optional()` - the genuinely-optional-key pattern, the same one
`powerExpectationChain` (this arc's own prior sprint) already uses, chosen deliberately over
`sceneStanding`'s own `.default()` pattern to avoid re-touching the ~22 sim test fixtures that
pattern cost last sprint; every reader goes through `sceneLedgerFor` (sim/sceneStanding.ts, new
module), which falls back to an all-empty ledger. `packages/sim/src/sceneStanding.ts` holds the
whole earn/read surface: `freshSceneLedger`, `sceneLedgerFor`, `recentSceneLedgerEntries` (the
rolling window), and `creditSceneDelivery` (append + stage advance in one state transition, mirroring
`applyReputationDelta`'s own single-writer shape). `createInitialGameState` seeds
`sceneLedger: freshSceneLedger()` explicitly on every fresh career, the same treatment `dyno`/
`consumableStock` already get.

### Tests fixed (directive 17 diagnoses)

All are **case (a)**: the implementation change was correct and intentional, and the failure was
either a stale pin or a defect in the new test itself, not a regression in the shipped code.

1. **`economyApprovalGate.test.ts`'s economy.json hash** - a new approved lever
   (`sceneStandingProgress`) changed the file; re-pinned with the value ledger recorded in the test's
   own comment, per directive 22.
2. **`schemas.test.ts`'s "economy.json top-level anchors match the bible audit table"** - the same
   new top-level key needed adding to both the test's expected-keys list and `economy-bible.md`'s
   own anchor-inventory table, exactly as that test's own comment requires of any new top-level
   `economy.json` field. Not a design law amendment - mechanical bookkeeping the audit test enforces
   by construction.
3. **`commentHygieneGuard.test.ts`** - two of my own new comments (in `economy.ts` and
   `sceneStanding.ts`) named "sprint 179" while describing the future word-of-mouth consumer; the
   guard caught it exactly as CLAUDE.md warned it would. Reworded to describe the future behaviour
   without naming a sprint number.
4. **`advanceDay.test.ts`'s acquisition-and-sale golden-master hash** - NOT a pure shape change.
   This is the one script that both buys and completes a real sale; probed once (a throwaway
   `console.log`, run then deleted, no scratch file left behind) and confirmed the sold car (a
   Toyota Carina, day 4) genuinely clears `isTasteMatched` against its buyer and credits the
   `daily-drivers` scene with a real ledger entry at its real sale price - the earn event firing
   for real, which is the sprint's whole point. One delivery does not clear the three-delivery Known
   threshold, so `sceneStanding` itself still reads every scene at `none`; only the ledger gained the
   entry. Re-derived from the real run and recorded in the test's own comment. The sibling 30-day
   golden master (a hand-written `GameState` literal that never calls `createInitialGameState` and
   never completes a sale) held unchanged, confirming `sceneLedger`'s genuinely-optional-key pattern
   costs it nothing.
5. **A defect in my own new `sceneStanding.test.ts`** (not a directive-17 case at all, since it never
   reached the committed suite in a broken state) - the first draft of `deliverN` and two other
   direct `creditSceneDelivery` calls omitted the required `fitmentClass` field from
   `SceneDeliveryDetails`. `pnpm test` (esbuild transform, no type-checking) ran it anyway and one
   assertion failed for the right underlying reason (the marquee check silently no-opped); `pnpm
   typecheck` would have caught the missing property outright. Fixed by threading a real
   `fitmentClassForTier(model.tier)` through every call site.

### Verify section: the two named tests

- **Trade-network credits nothing**: `selling.test.ts`'s existing "never fires through the trade
  network" test gained `expect(result.state.sceneLedger).toBeUndefined()` and
  `expect(result.state.sceneStanding).toEqual(state.sceneStanding)` - the trade's own non-persona
  buyer can never resolve a real `Buyer`, so `creditSceneDelivery` is never even called.
- **The tutorial's delivery credits `daily-drivers` with no tag involved**: new
  `missions.test.ts` describe block delivers the REAL, shipped `four-wheels` mission (not a
  synthetic test mission) against a plain roadworthy car, and asserts the ledger gains exactly one
  `daily-drivers` entry - while `four-wheels`' own `specialtyGroups` still reads `["body"]`,
  demonstrating directly that the (wrong, legacy) tag has no bearing on which scene was credited.

### Files touched

`packages/content/src/persona.ts`, `packages/content/data/personas.json`,
`packages/content/src/gameState.ts`, `packages/content/src/economy.ts`,
`packages/content/data/economy.json`, `packages/content/tests/economyApprovalGate.test.ts`,
`packages/content/tests/schemas.test.ts`, `docs/design/economy-bible.md`,
`packages/sim/src/sceneStanding.ts` (new), `packages/sim/src/selling.ts`,
`packages/sim/src/missions.ts`, `packages/sim/src/newGame.ts`, `packages/sim/src/index.ts`,
`packages/sim/tests/sceneStanding.test.ts` (new), `packages/sim/tests/selling.test.ts`,
`packages/sim/tests/missions.test.ts`, `packages/sim/tests/advanceDay.test.ts`,
`packages/game/src/stores/gameStore.ts`, `packages/game/src/screens/StandingScreen.vue`,
`packages/game/src/screens/StandingScreen.test.ts`, `packages/game/src/utils/sceneStandingLabels.ts`
(new), `packages/game/src/components/DevConsole.vue`, `packages/game/src/save/saveCodec.ts`,
`packages/game/src/save/saveCodec.test.ts`.

Not committed - awaiting review.
