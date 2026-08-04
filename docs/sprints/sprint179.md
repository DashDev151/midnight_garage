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

**Built.** `pnpm typecheck` clean across content/sim/game; `pnpm test` green across all three
projects in one combined run (195 files, 3844 tests). Not committed - awaiting review.

### Values set (orchestrator's blanket lever authority, recorded for review)

`packages/content/data/economy.json`:

- `sceneStandingProgress.wordOfMouthMultiplierByStage` (NEW) - `known` **1.4**, `respected`
  **1.8**, `shop` **2.4**. Below Known the multiplier is a flat 1 (there is no `none` entry);
  `wordOfMouthMultiplierFor` (sim/sceneStanding.ts) never looks one up at that stage.
- `sceneStandingProgress.rollingWindowShareCap` (NEW) - **1.5**. The rolling window's own
  ceiling, scaling the stage multiplier above.
- `sceneCommissions` (NEW top-level block) - `refreshIntervalDays` **7**, `payoutMultiplier`
  **1.25**.

`economyApprovalGate.test.ts` re-pinned (`2cdca89c...1dfeb8c`); `schemas.test.ts`'s anchor list
and `economy-bible.md`'s own anchor table both gained `sceneCommissions` alongside the two new
`sceneStandingProgress` fields, per that test's own comment requiring both to move together.

### Word of mouth: multiplicative, and where exactly it multiplies

**Multiplicative, applied AFTER the reputation-tier focus exponent, never folded into
`buyerPoolWeights` itself.** `saleCandidates` (sim/selling.ts) already built
`channelWeight = authored ^ focusExponent`; word of mouth now multiplies that RESULT rather than
raising `authored * wordOfMouth` to the exponent together. Two reasons: it keeps the two
standing mechanisms orthogonal (a legend-tier player's sharpened focus exponent never amplifies
word of mouth non-linearly), and it matches the design's own framing exactly - word of mouth
scales the channel's realised weight, it does not re-author the channel.

**The rolling window is a second, independent multiplier on top of the stage one**, computed in
`recentDeliveryShareMultiplier` (sim/sceneStanding.ts): the scene's own share of every scene's
matched deliveries inside `rollingWindowDays`, linear onto `[1, rollingWindowShareCap]` -
`1 + share * (cap - 1)`. A scene with no recent deliveries anywhere in the window (or no recent
deliveries of its own) reads exactly the flat stage multiplier; a scene that received every
recent delivery reads the full cap. This was the one genuinely free implementation choice (the
orchestrator's brief fixed only the endpoints - 1.0 untouched, 1.5 exclusive - and the cap
value); linear-in-share is the simplest curve that hits both exactly and needs no extra lever.

**Threading:** `wordOfMouthMultipliers(state, economy)` (sim/sceneStanding.ts) computes all six
scenes' multipliers once per day's offer draw (`drawDailyOffers`), not once per for-sale car,
since nothing it reads changes within that pass. It rides inside `ChannelDrawWeighting` (a new
optional `wordOfMouthMultipliers` field) through `channelDrawWeighting` -> `drawFlaggedChannelOffer`
-> `drawOfferForChannel` -> `drawDailyOffers`, the exact call chain the sprint brief named.
`channelDrawWeighting`'s new fourth parameter defaults to `{}` (no word of mouth), so every
pre-existing 3-argument call site (tests, previews) keeps compiling and prices exactly as before
this mechanism existed - confirmed by the untouched `advanceDay.test.ts` job-loop golden master
and by every pre-existing `selling.test.ts` assertion passing unchanged.

**The guard, verified three ways** (`selling.test.ts`, new describe block): (1) direct arithmetic,
where even a Collector at The Shop with the full rolling-window cap (0.4 x 2.4 x 1.5 = 1.44)
still sits below Daily Drivers' flat 2.0 in the free ads paper; (2) the real draw, where a
Collector at Shop stage is measurably rarer than Daily Drivers in the free ads paper over 400
seeded days; (3) the real draw again, where Known measurably raises Racers' own share of the
paper (their coldest channel, 0.2) without ever making the paper draw them more than its own
best-favoured scene.

### Scene commissions: how one picks its target car, and its power ask

**No target car model is ever named.** Reusing the story-mission shape means reusing its
requirement language (`RequirementSpec`, `evaluateRequirement`) exactly, and that language has no
"this must be model X" predicate - a story mission never names one either, and inventing a new
requirement kind for this would be exactly the "invent a third job type" directive 16 forbids.
**The target car is whichever car the player delivers**, same as any story mission; grading is
pure stat thresholds against that car's own `computeDerivedStats`.

**The payout is therefore computed at DELIVERY, dynamically, never stored on the offer.**
`resolveDeliverSceneCommission` (sim/sceneCommissions.ts) reads the ACTUAL delivered car through
the exact same `valuateCarForBuyer` every ordinary open-market sale prices through, for that
scene's own buyer, then multiplies by `economy.sceneCommissions.payoutMultiplier` (1.25). A
commission can therefore never under- or over-quote a car nobody had chosen yet, and "pays better
than the open market" is true by construction rather than by a hand-picked number.

**The requirement itself reads the scene's own `Buyer.statTargets` directly**, via one generic
rule with no per-scene hardcoding: `championStatFor` picks the stat with the HIGHEST `importance`
in that buyer's own authored profile (ties broken by stat order; no two shipped archetypes
currently tie). Verified against the shipped roster: collector -> authenticity, tuner ->
handling, show-crowd -> style, racer -> power, daily-drivers -> reliability, touge -> handling.
The requirement's `min` is that stat's own `target`, converted onto the raw scale
`computeDerivedStats` reports (x100 for the four bounded stats).

**Power is the one exception, read exactly where the sprint brief said it must be: `racer` and
`touge` only** (`POWER_HUNGRY_SCENES`, a fixed two-scene list - the brief names these two by name,
so this is not an inferred or approval-needing lever, it is the literal instruction implemented).
For those two scenes, any power requirement (the champion stat for Racers, a SECOND requirement
alongside handling for Touge) reads `currentPowerExpectationBarPs` (Sprint 175's own chain reader,
consumed here for the first time) when a chain exists, floored at that buyer's own ordinary
appetite (`statTargets.power.target * powerNormalizationCeiling`) so the ask can only ever be as
demanding as normal or more. Every other scene's commission never mentions power at all -
verified directly (`sceneCommissions.test.ts`).

**The constraint that matters most, verified structurally and empirically:** `valuateCarForBuyer`,
the function every ordinary sale, walk-in and channel offer prices through, takes no `GameState`
and no chain argument at all; there is no parameter through which a commission's consumption of
the bar could leak into it. Confirmed with a real run too: `drawDailyOffers` against
otherwise-identical states differing only in `powerExpectationChain` produces bit-for-bit
identical `pendingOffers`.

**Naming and copy, both fully reused, nothing newly authored:** a commission's customer is that
scene's own `personas.json` entry when one exists (`gen` for Tuners, `kaori` for Touge, and so
on), falling back to `serviceJobCustomerNames.json`'s existing generic pool for the two scenes
with no persona yet (Collectors, Racers) - both pools already shipped, reused verbatim rather
than authoring a third. The brief itself is that buyer's own `wantLine`, reused verbatim: "the
brief and the buyer can never drift apart" is true by construction, since both read the one
authored field.

### Lifecycle: one live commission per scene, a rolling refresh, no calendar coupling

`GameState.sceneCommissions` (new, genuinely-optional-key field, the `sceneLedger`/
`powerExpectationChain` pattern) holds one nullable slot per scene. `advanceSceneCommissions`
(sim/sceneCommissions.ts), hooked into `advanceDay` immediately after the story-mission tick:
every scene at Respected or The Shop with nothing live (`null`, or an `offered` commission that
has sat `>= refreshIntervalDays`) gets a freshly generated one; an `active` (accepted) commission
is never touched, exactly like a story mission once accepted. **Read as a rolling age check
against the commission's own `postedOnDay`, not a calendar weekday** - "refreshing weekly" is
implemented as "replaced after a week has passed since it was posted," so a scene reaching
Respected mid-week still gets its first refresh exactly one cadence later rather than snapping to
a fixed day. Delivering clears the slot back to `null`, so the next day's tick can generate a
fresh brief.

### Scope decision, stated plainly: no new gameStore actions or screen this sprint

Content and sim are complete, real and already running in every game session (wired into
`advanceDay`, exercised by 25 dedicated tests plus the word-of-mouth suite). What is deliberately
NOT built this sprint is a player-facing accept/grade/deliver UI for commissions. Three reasons,
stated rather than assumed: (1) the sprint's own Definition of Done never names a screen, unlike
sprint 178's ledger, whose DoD explicitly required one; (2) this codebase's own convention tests
gameStore actions through their SCREEN's component tests, not standalone - adding actions with no
screen would add real, uncovered surface against the coverage gate rather than tested glue; (3)
sprint 180's craft operations need the identical "named brief, pick a car, grade it, hand it
over" UI shape commissions need, and building that shape once, well, alongside 180 beats building
it twice. `docs/sprints/scene-standing-arc.md` already scopes 180 right after this sprint, so the
gap is closed immediately rather than left open-ended.

### Tests

- `packages/sim/tests/sceneStanding.test.ts` - a new describe block, six tests, unit-testing
  `wordOfMouthMultiplierFor`/`wordOfMouthMultipliers` directly: flat 1 below Known, exact
  per-stage values, the rolling-window curve's three landmarks (untouched/half-share/exclusive),
  the stale-entry boundary, the pivot-without-restage guarantee, and per-scene agreement with the
  batch function.
- `packages/sim/tests/selling.test.ts` - a new describe block, four tests, all measured through
  the real `drawDailyOffers`/`sweep` path per that describe block's own established law (never a
  reimplementation of the weighting): the arithmetic character guard, Known raising a cold scene's
  share without handing it the channel, the literal Collector-at-Shop-vs-Daily-Drivers guard, and
  the rolling-window pivot (a fortnight of exclusive touge deliveries shifting its own share
  measurably, standing itself untouched).
- `packages/sim/tests/sceneCommissions.test.ts` (new file, 26 tests) - generation gating (nothing
  below Respected, one immediately at Respected, still generates at Shop), persona/generic
  naming, the six-archetype champion-stat table, the power-hungry-only guard, Touge's two
  requirements against Racer's one, the power ask's three regimes (no chain / climbing bar /
  floored at ordinary appetite), the ordinary-buyer-untouched guard (structural argument plus a
  real `drawDailyOffers` run), the refresh-interval rolling age check (untouched while fresh,
  replaced once stale, never touched once active), accept/grade/deliver including a real failing
  grade, and the exact dynamic payout figure against a live `valuateCarForBuyer` call.

### Directive 17 diagnosis: one golden-master hash moved

`advanceDay.test.ts`'s acquisition-and-sale golden master (case (a), the implementation change
was correct and intentional). `GameState` gained `sceneCommissions`, seeded on every fresh career
by `createInitialGameState`, so the hash moved from `9cc0edef` to `7e72e421`. Verified as a PURE
SHAPE change rather than assumed: stripping `sceneCommissions` back out of the resulting state
reproduces `9cc0edef` exactly. Reasoned, not just measured: word of mouth reads as a flat 1 for
every scene still at `none` (true throughout this script), and no scene in it ever reaches
Respected, so `advanceSceneCommissions`'s own daily tick never draws from the shared rng stream
either. Re-pinned to `7e72e421`, narrated in the test's own comment alongside its full prior
history. The sibling 30-day golden master (a hand-written `GameState` literal that never calls
`createInitialGameState`) held unchanged, confirming the cause.

### Files touched

`packages/content/src/economy.ts`, `packages/content/data/economy.json`,
`packages/content/src/sceneCommission.ts` (new), `packages/content/src/gameState.ts`,
`packages/content/src/cashLedger.ts`, `packages/content/src/index.ts`,
`packages/content/tests/economyApprovalGate.test.ts`, `packages/content/tests/schemas.test.ts`,
`docs/design/economy-bible.md`, `packages/sim/src/sceneStanding.ts`,
`packages/sim/src/selling.ts`, `packages/sim/src/sceneCommissions.ts` (new),
`packages/sim/src/advanceDay.ts`, `packages/sim/src/newGame.ts`, `packages/sim/src/index.ts`,
`packages/sim/tests/sceneStanding.test.ts`, `packages/sim/tests/selling.test.ts`,
`packages/sim/tests/sceneCommissions.test.ts` (new), `packages/sim/tests/advanceDay.test.ts`,
`packages/game/src/utils/dayLogFormat.ts`, `packages/game/src/utils/dayLogFormat.test.ts`,
`packages/game/src/save/saveCodec.ts`, `packages/game/src/save/saveCodec.test.ts`.

Not committed - awaiting review.
