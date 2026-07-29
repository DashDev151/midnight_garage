# Sprint 21 - Car value model: condition, parts and market pressure set the price

*Source: maintainer direction, 2026-07-11 - second sprint of the foundational-economy arc
(20 auction structure -> **21 value model** -> 22 inspection/hidden issues -> 23 progression/costs ->
24 debt/humans). Trigger: the 2026-07-10 first-principles review showed a fully restored car is worth
only ~10% of book more than a rough one, because value is routed through capped derived stats
(style caps at 20/100, reliability at 70, handling weight-crushed) and the dominant stat
(authenticity) ignores condition entirely. Maintainer: "the car valuation system needs a full rework.
we need much better ways of determining value of the car based on base value, condition, market
pressure (supply demand velocity.. like real markets) and installed parts."
Status: **implemented; all checks green; committed (`1aeb2d2`).***

## Goal

One shared answer to "what is this car worth", used by every price in the game:

```text
marketValue = bookValue x conditionFactor x marketPressure + installedPartsValue
```

Buyer archetypes apply bounded *taste* on top of that value (who pays a bit more, never whether the
car is worth anything); sale channels apply their existing spreads. Restoring a rough car must move
its value dramatically (target: full restoration adds 35-60% of book), because restoration is the
game's title fantasy and currently adds ~10%.

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Base value | `model.bookValueYen` (content, per model) | Stays the designer-owned anchor every factor multiplies. |
| Tuning surface | `economy.json` + `EconomyConfigSchema` + `SimContext` threading (Sprint 20 step 0) | Every new number in this sprint is born there. No new constants in code. |
| Buyer taste inputs | `computeDerivedStats` + `buyer.statWeights` + the existing `normalizedStatScore` computation in `valuation.ts:27-35` | Kept verbatim as the *taste* signal. Stats stop being the value pipeline; they decide which buyer pays more. |
| Who shows up | `interestedBuyers` tier gate (`bidding.ts`) | Unchanged - still gates walk-in/listing/auction participation. |
| Pressure store | `GameState.marketHeat` (`Record<modelId, number>`, percent, default 100) | Kept as the state; only the weekly *update rule* is replaced (random walk -> supply/demand). |
| Sale channels | `sellViaWalkIn` (fit-weighted pick x `WALK_IN_OFFER_RANGE`), `listPubliclyAskingPrice` (average over interested), `PUBLIC_LISTING_WAIT_DAYS` | Same channel structure and spreads; they consume the new value. One change: heat is no longer applied inside `listPubliclyAskingPrice` (it now lives inside `marketValueYen` - applying it twice would double-count). |
| Auction pricing | Sprint 20's `demandCeilingYen`/buyout, both derived from one `anchorValueYen(lot)` | Re-anchored by replacing that one function's body. Wholesale fraction, spread, counter chance etc. all untouched. |
| Save machinery | `SAVE_VERSION` + `MIGRATIONS` + golden-save tests | New `marketLedger` state rides it (bump 12 -> 13). |
| Verification style | golden masters re-pinned once at sprint end; sim-level distribution probes as tests (Sprint 20 pattern) | Same. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **`marketValueYen` - a taste-free market value.** Nothing like it exists: `valuateCarForBuyer`
   conflates value and taste in one formula, so the game has never had a statement of what a car is
   worth independent of who is looking at it. Every other price (wholesale anchor, walk-in, listing,
   future insurance/loan collateral) needs exactly this.
2. **Condition factor with per-component value weights.** Today condition only reaches price through
   the capped stat formulas. An engine being 30% of a car's value while wheels are 5% exists nowhere.
3. **Installed-parts value.** Today parts only add value via stat modifiers into the same capped
   pipeline. "A Y400k suspension kit adds real yen to the sale price" exists nowhere.
4. **Supply/demand market pressure.** `driftMarketHeat` is a pure random walk (+/-4 weekly). Demand
   waves, supply gluts and flood-the-market effects exist nowhere.

### Deleted outright

`valuation.ts`'s price math: `fitComponent = 0.6 + 0.7 x score`, `tierComponent` (`x 0.3`),
`priceSensitivity` (`x 0.15`) - replaced by `marketValueYen` x taste. (`buyer.priceSensitivity`
stays in the schema/content, unused by pricing after this sprint - do not remove the field; note it
in the schema doc comment as reserved.) `driftMarketHeat`'s random walk and
`MARKET_HEAT_WEEKLY_DRIFT_RANGE`. `POWER_NORMALIZATION_CEILING` and `DEFAULT_TIER_PREFERENCE_WEIGHT`
move into `economy.json` (the former still feeds taste's stat normalization).

## Decisions (maintainer-approved shape, first-pass numbers openly tunable in economy.json)

1. **Value composition:** `marketValueYen = round(bookValueYen x conditionFactor x (heat/100)) +
   installedPartsValueYen`. Parts are additive (real markets: mods return cents on the yen, they
   don't multiply the chassis price).
2. **Condition factor:** weighted component condition through a curve.
   Weights (sum 1.0): engine 0.30, body 0.20, drivetrain 0.15, suspension 0.10, interior 0.10,
   brakes 0.05, wheels 0.05, forcedInduction 0.05.
   `weighted = sum(weight_c x condition_c)` (0-100).
   `conditionFactor = floor + (ceiling - floor) x (weighted/100)^exponent` with floor **0.35**,
   ceiling **1.10**, exponent **1.3**. Worked examples (tests assert these):
   weighted 0 -> 0.35; weighted 60 -> ~0.74; weighted 100 -> 1.10.
3. **Installed parts value:** per installed part instance:
   `part.priceYen x retention(0.55) x (conditionPercent/100) x (genuinePeriod ? 1.25 : 1.0)`,
   summed, rounded.
4. **Buyer taste:** `valuateCarForBuyer = round(marketValue x taste)` where
   `taste = (1 - spread) + 2 x spread x normalizedStatScore`, spread **0.12** (so taste is bounded
   [0.88, 1.12] and centered near 1.0 for an average car).
5. **Market pressure v1** (deterministic, three signals - see Design): a slow per-model demand wave,
   a supply glut penalty, and a flood-the-market penalty when the player dumps copies; clamped
   [70, 140], smoothed 25% weekly. Real velocity (order books, rival dealers' inventory) is
   deliberately out of scope - expandable later without schema changes.
6. **Heat applies exactly once, inside `marketValueYen`.** `listPubliclyAskingPrice` KEEPS its
   `marketHeatPercent` parameter but now only forwards it into each `valuateCarForBuyer` call - the
   function itself no longer multiplies by heat (that extra multiply is the double-count being
   removed); listing gains a patience premium instead:
   `average(valuateCarForBuyer over interested) x LISTING_PATIENCE_PREMIUM(1.05)` - "slow, market
   price" stays the better-but-slower channel vs walk-in's [0.85, 1.1] roll.
7. **Auction anchor becomes taste-free:** Sprint 20 exports a single `anchorValueYen(lot, state,
   context)` helper that `demandCeilingYen`, the buyout price and the turnout bands ALL call (that
   is a Sprint 20 requirement, restated here because this sprint depends on it). This sprint
   replaces that one function's body with `marketValueYen(model, lot.car, heat, partsById,
   economy)` (was: best interested buyer's valuation). Dealers buy at wholesale off market value;
   taste belongs to end customers.
8. **Stat formulas keep their shapes, lose their magic numbers** to `economy.json.statFormulas`
   (power condition floor 0.5, handling base 50, weight divisor 50, style cap 20, reliability cap
   70) - same values, zero behavior change this sprint; Sprint 22/23 can then tune them as data.
   (Whether the caps themselves should rise is a taste-tuning question, deferred - value no longer
   depends on them.)

## Design

### New module `packages/sim/src/marketValue.ts`

```ts
export function conditionFactor(car: CarInstance, economy: EconomyConfig): number
export function installedPartsValueYen(
  car: CarInstance, partsById: Readonly<Record<string, Part>>, economy: EconomyConfig): number
export function marketValueYen(
  model: CarModel, car: CarInstance, heatPercent: number,
  partsById: Readonly<Record<string, Part>>, economy: EconomyConfig): number
```

`marketValueYen` is deliberately **issue-blind** and stays that way permanently. Sprint 22 adds a
separate `issueAdjustedValueYen` wrapper (market value minus unrepaired-issue penalties) and
re-bases `valuateCarForBuyer` onto it in one line - which is why this sprint MUST record
`valuateCarForBuyer`'s full caller list in its Exit: 22 reuses that list to thread the issue
catalog.

### `valuation.ts` rewrite

`valuateCarForBuyer(buyer, model, instance, partsById)` gains a `heatPercent` parameter and an
`economy` parameter and becomes the two-liner `marketValue x taste`. Callers to update - grep
`valuateCarForBuyer` at implementation time and enumerate the final list in the Exit; known today:
`selling.ts` (`sellViaWalkIn`, `listPubliclyAskingPrice`, `bestFitBuyer`), Sprint 20's
`anchorValueYen` helper, `gameStore.ts` (`lotDetail`, walk-in/listing estimates), and FOUR bot
files calling the old 4-arg signature directly: `bots/balancedPlayer.ts`, `bots/randomStrategy.ts`,
`bots/investor.ts`, `bots/handyman.ts` (bots read state heat like any other caller).
`DEFAULT_TIER_PREFERENCE_WEIGHT` is deleted as dead code (its only consumer was the removed
`tierComponent`); `POWER_NORMALIZATION_CEILING` moves to `economy.json.statFormulas` (it still
feeds taste's stat normalization).

### Market pressure (`marketHeat.ts` rewrite)

New state: `GameState.marketLedger = { lotSupply: Record<modelId, number>, playerSales:
Record<modelId, number> }` - exponentially-decayed counters (floats), default `{}` for both.

- **Bump points:** `lotSupply[modelId] += 1` for each fresh lot - in `advanceDay.ts`'s weekly
  refresh block (the `if (next.day % 7 === 0)` branch where `refresh.freshLots` are appended;
  `refreshCatalogs` itself is pure and must stay so - the bump lives in `advanceDay.ts` beside the
  append). `playerSales[modelId] += 1` per resolved player sale (walk-in in
  `resolveSellViaWalkIn`, listing resolution in `advanceDay.ts` step 7).
- **Weekly update** (same pipeline position as today's `driftMarketHeat`, every `day % 7 === 0`),
  for every model in context:
  1. Decay: `lotSupply[m] x= 0.75`, `playerSales[m] x= 0.75` (drop keys below 0.01).
  2. `phase = hashStringToSeed(modelId) % WAVE_PERIOD_WEEKS`
  3. `wave = WAVE_AMPLITUDE x Math.sin(2 * Math.PI * (weekIndex + phase) / WAVE_PERIOD_WEEKS)`
     (`weekIndex = day / 7`; `Math.sin` is pure - allowed; no `Date`/`Math.random`).
  4. `target = 100 + wave - SUPPLY_WEIGHT x lotSupply[m] - SALES_WEIGHT x playerSales[m]
     + (lotSupply[m] < SCARCITY_THRESHOLD ? SCARCITY_BONUS : 0)`, clamped [HEAT_MIN, HEAT_MAX].
  5. `heat[m] = round(heat[m] + SMOOTHING x (target - heat[m]))`.
- **First-pass values (economy.json):** WAVE_AMPLITUDE 12, WAVE_PERIOD_WEEKS 24, SUPPLY_WEIGHT 4,
  SALES_WEIGHT 6, SCARCITY_THRESHOLD 0.5, SCARCITY_BONUS 8, HEAT_MIN 70, HEAT_MAX 140,
  SMOOTHING 0.25, LEDGER_DECAY 0.75.

Plain-language intent, so tuning stays honest: a model the player floods sells soft for a few weeks;
a model absent from catalogs for a month runs hot; every model breathes slowly on its own cycle.

### Save law

`SAVE_VERSION` 12 -> 13. Migration: add `marketLedger: { lotSupply: {}, playerSales: {} }`.
Golden-save test in the same commit.

## Task breakdown

### Content (`packages/content`)

- [x] Extend `EconomyConfigSchema` + `data/economy.json`: `valuation` block (componentValueWeights
  map, conditionFloor/Ceiling/Exponent, partsRetention, genuinePeriodMultiplier, tasteSpread,
  listingPatiencePremium), `marketPressure` block (the 10 values above), `statFormulas` block
  (powerConditionFloor, handlingBase, handlingWeightDivisor, styleCap, reliabilityCap,
  powerNormalizationCeiling). Zod-validate weights sum to 1.0 (refine).
- [x] `gameState.ts`: `MarketLedgerSchema` + field on `GameStateSchema` (defaults `{}`).

### Sim (`packages/sim`)

- [x] New `marketValue.ts` per the Design signatures, with the three worked-example values in doc
  comments.
- [x] `valuation.ts`: rewrite `valuateCarForBuyer` as marketValue x taste; delete the old price math;
  keep `interestedBuyers` untouched (it lives in `bidding.ts` - no move).
- [x] `derivedStats.ts`: read the five magic numbers from `economy.json.statFormulas` (thread
  `economy` - it is already on `SimContext` after Sprint 20).
- [x] `marketHeat.ts`: replace `driftMarketHeat` with the weekly update above; add the two ledger
  bump helpers; wire bump points in `catalogs.ts`/`selling.ts`/`advanceDay.ts`. (Deviation:
  `driftMarketHeat` renamed to `updateMarketHeat` - "drift" no longer describes a deterministic
  supply/demand update; `catalogs.ts`'s `refreshCatalogs` itself stays untouched/pure, the
  `bumpLotSupply` call lives beside its call site in `advanceDay.ts` as specified.)
- [x] `selling.ts`: `listPubliclyAskingPrice` gains the `economy` param; `sellViaWalkIn` threads heat
  into `valuateCarForBuyer`. (Deviation from this bullet's literal wording: per decision 6 above,
  `marketHeatPercent` is KEPT, not dropped - decision 6 is explicit that the param stays and is
  forwarded into `valuateCarForBuyer`, only the function's OWN extra heat multiply is removed. The
  task-breakdown wording and decision 6 disagreed; decision 6 (more detailed, and matching the
  "no-double-count" test's own framing) was treated as authoritative.)
- [x] Sprint 20 anchor swap: `anchorValueYen(lot)` body becomes `marketValueYen(...)`, gated by the
  existing `interestedBuyers` "does anyone show up at all" check (kept per the reuse table's "still
  gates ... auction participation" - see the function's own doc comment for the reasoning).

### Game (`packages/game`)

- [x] `gameStore.ts`: update every caller of the changed signatures (walk-in/listing estimates,
  `lotDetail`, AND the direct `computeDerivedStats(model, car, context.partsById)` call around
  line 348 which gains the `economy` argument). No new UI this sprint - screens already display
  these numbers.
- [x] `save/saveCodec.ts`: `SAVE_VERSION` 12 -> 13. Purely additive (schema default), so no explicit
  `MIGRATIONS[12]` transform was needed - matches the doc comment's own v13 entry.

### Testing

- [x] Unit: `conditionFactor` asserts the three worked examples exactly (0 -> 0.35, 60 -> ~0.74
  within 0.01, 100 -> 1.10); parts value asserts retention/condition/genuine multipliers; taste
  asserts bounds [0.88, 1.12] and monotonicity in stat score. (`marketValue.test.ts`,
  `valuation.test.ts`.)
- [x] Pressure: determinism (same seed+day -> same heat); flood probe (bump playerSales on one model
  -> its heat drops below 100 within 2 updates while a control model doesn't); scarcity probe;
  clamp probe; no-double-count test (listing price with heat 120 changes only via `marketValueYen`).
  (`marketHeat.test.ts`, `selling.test.ts`.)
- [x] **Restoration-uplift probe (acceptance):** across a generated lot population (reuse Sprint
  20's probe harness), median `marketValue(fully restored) - marketValue(as rolled)` is between 35%
  and 60% of book. (`valueModelProbes.test.ts`. UNCERTAIN - see Exit: not run yet, and the formula's
  own arithmetic puts the expected median close to the 35% floor; flagged for the gate.)
- [x] **Full-flip probe (acceptance):** scripted patient-bidder acquire (Sprint 20 probe) -> set all
  components to 100 -> best-channel sale price; median margin >= +15% of book, >= 70% of flips
  positive. (Rent is 0 - this measures the loop, not the treadmill.) (`valueModelProbes.test.ts`.)
- [x] Golden masters re-pinned once, at the end. NOT YET RUN - see Exit; the two pins in
  `advanceDay.test.ts` are left at their Sprint 20 values with an updated comment, per this sprint's
  own explicit instruction to re-pin only after the gate reveals the real hashes.
- [x] Migration golden-save test (v12 save with no ledger loads).

## Claude-implementable vs user-only

**Claude-implementable:** all of the above, including `pnpm balance:run` (standing permission
2026-07-10) - read as mechanism telemetry only.

**User-only:** eyeball the new numbers on real cars in the browser (do a rough shitbox and a
restored uncommon *feel* right?); veto/adjust the component weights table and the 35-60% uplift
target - both are design taste, defaults above are first-pass.

## Definition of done

All checks green; both acceptance probes pass as tests; heat provably responds to supply/demand and
stays deterministic; save migration golden-tested; Exit section written with the real measured
numbers (uplift median, flip margin median) - not just "tests pass".

## Exit

**Implemented; all checks green.** `pnpm typecheck` / `pnpm lint` / `pnpm format` / `pnpm test`
(546/546 across 58 files) / `pnpm build` all pass. Two real bugs were found and fixed during gate
verification (neither present in the implementing agent's own uncertain-items list, both caught by
running the actual gate rather than trusting the code read correct): (1) `packages/content/src/gameState.ts`'s
`MarketLedgerSchema.default({})` didn't satisfy the schema's inferred output type under this Zod
version - fixed with an explicit `{ lotSupply: {}, playerSales: {} }` default; (2)
`valueModelProbes.test.ts` passed `[PROBE_MODEL]` as an array literal directly into
`generateAuctionCatalog`, which TypeScript infers as a 1-tuple and, combined with this codebase's
very large Zod-inferred `CarModel` type, tripped a "two different types with this name are
unrelated" structural-comparison failure - fixed by binding an explicitly-typed
`const PROBE_MODELS: readonly CarModel[]` first, which is the standard fix for this class of TS
inference quirk.

Two deliberate deviations from the literal doc text (both explained inline above, not hidden):
`driftMarketHeat` renamed to `updateMarketHeat` (a "drift" no longer describes a deterministic
supply/demand formula), and `listPubliclyAskingPrice` KEEPS its `marketHeatPercent` parameter
rather than dropping it - the task-breakdown bullet said "drops," but decision 6's own prose says
"KEEPS ... but now only forwards it" and the no-double-count test only makes sense under that
reading, so decision 6 was treated as authoritative over the task-breakdown's summary wording.

**Real measured numbers** (2026-07-11, this exact deterministic lot population):

- **Restoration-uplift median: 36.7% of book** (n=300) - clears the 35-60% target, closer to the
  floor than the ceiling. Matches the hand-computed estimate (~36.35%) almost exactly, confirming
  the formula behaves as designed rather than needing a correction.
- **Full-flip margin median: 66.0% of book, 100% of flips positive** (n=197, of 200 lots pursued) -
  clears the >=15%/>=70% targets by a wide margin. This measures the acquisition-restoration-sale
  loop in isolation (rent is 0 per Sprint 20, restored in Sprint 23), so it's evidence the *value
  model* is sound, not yet evidence the full economy (with rent, equipment costs, and reputation
  gating back in) is balanced - that's Sprint 23's job.
- Both `advanceDay.test.ts` golden-master hashes re-pinned: `a2efcf89` (30-day script) and
  `24842ca3` (acquisition-and-sale path) - moved because `marketValueYen` now prices every
  auction anchor and walk-in sale in the career.
- One Sprint-20-owned test needed re-measuring, not fixing: `bidding.test.ts`'s hammer/anchor
  distribution probe hard-pinned a median (~0.54) measured against the *old* buyer-taste-inflated
  anchor (`valuateCarForBuyer`, [0.88, 1.12] taste band). Decision 7's re-anchor onto taste-free
  `marketValueYen` mechanically raises that ratio (smaller denominator, same numerator) - the real
  measured median is now **0.71** (p10 0.51). Re-pinned with an explanatory comment; this is a
  side effect of removing taste from the anchor, not a new tuning problem, and the underlying
  hammer mechanics (counter chance, quiet-days) are untouched.

`pnpm balance:run` was not re-run this sprint - read as mechanism telemetry only per the doc, and
the two acceptance probes above are the sprint's real evidence; left as a natural pairing with
Sprint 23's harness work rather than run redundantly here.
