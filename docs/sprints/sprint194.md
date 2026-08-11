# Sprint 194: the economy bench

**Status: IMPLEMENTED, ready for review.** No levers; this sprint changed no game value.

## The problem, in the maintainer's words

> *"The economy has grown to be so absolutely complicated that it is impossible to understand on a
> macro level how it feels, and there are so many intertwined systems that it is almost impossible
> to know whether a level number is too high or low. We need to experience it."*

So: a dev screen where you build any car, in any state, in any shop, and watch every yen move as you
change things. Pick a car, set its condition, work on it, sell it, and see the whole of it.

## The firm rule

> *"There can be no drift. We need to use the prod code. This cannot be another thing that needs to
> be maintained. If something is changed in the game files, it needs to change here too."*

**The screen computes nothing.** It builds a real `GameState` and a real `CarInstance` and hands
them to the same functions a live car goes through. There is nothing to drift from, because it is
the same code path.

**A guard test enforces it**: a car built on the bench and the same car built through the normal
path must produce identical figures.

## The shape: a ledger, not a dashboard

The maintainer's own sketch, and it is the right shape because it makes causality visible:

    Starting value        583,000
      Book                       X
      internals (worn)          -Z
      front bumper (missing)    -A
    ----
    Current value         640,000
      Repaired internals to mint      +B
      Installed front bumper (sport)  +C
      Machined the block              +D

Then the sale: what every buyer pays, and the odds of meeting each through every channel.

## What the investigations settled, because it decides the build

Three questions were measured before this was written. All three came back usable, two with limits
that shape the design.

### The running log needs no attribution at all

**Each action's delta is `marketValueYen` after minus before.** That is exact by construction,
because it IS the difference. No decomposition, no theory, no error. This is the bulk of the screen
and it is the easy half.

### The opening block is where care is needed, and it splits

| half | verdict |
| --- | --- |
| the restoration bill (`wear`, `polish`) | **exact per slot and per zone.** `carCostToBandYen` is a literal sum over slots and every multiplier above it is band-independent, so it scales each slot identically. Error is rounding, about a yen |
| the aftermarket premium | **not decomposable.** `foundationFactor` is a MIN over five slots and `installedPartsValueYen` has a per-slot scrap gate, so counterfactuals do not add up |

The premium's error is not small, it is total: with tyres and chassis both missing, each slot alone
reports **zero**, while fixing both releases 90 per cent of the premium. It is exactly zero when at
most one foundation slot sits below `worn`, which is why it would look correct until it wasn't.

**So: per-slot lines for the bill, ONE line for the premium**, with `foundationWithheldYen` beside
it, which is exact by construction.

**And a warning state.** On a car sitting on the scrap floor every counterfactual is fictional; the
block must say so rather than print numbers.

### Buyer odds are a closed form

    P(buyer b arrives via channel c today) = P_draw x  w_b / sum(w)

`P_draw` is `offerChanceFor x stalenessFor x channelFactor`, where staleness is
`0.35 + 0.65 e^(-offersSeen/3.5)`. The weight is
`tierPreference x culture x channelWeight^focusExponent x wordOfMouth x valuation`.

Every term is pure. The RNG enters at three points per car per day and never feeds back into the
weights. **Two functions are module-private and need exporting** (`saleCandidates`,
`cadenceChanceFor`); nothing needs writing.

**One honest limit:** that is a single-day probability. Across days it is a Markov chain on
`offersSeen`, because staleness keys off it and it advances only when the roll clears. Still exact,
but iterated rather than one expression. The screen should say which it is showing.

### Auction acquisition is computable, but the model is in the wrong package

**`packages/sim/src/bidding.ts` contains no bidding model.** No field sizing, no escalation, no
hammer: `settleAuctionHammer` takes the price as a parameter. The real room is a mutable state
machine in `packages/game/src/screens/auctionRoom.ts`.

**That is a structural decision this sprint has to take**: either lift the pricing core into sim, or
put the bench game-side. Lifting it is the better answer if it is clean, because the room's pricing
is economy and belongs with the economy.

The numbers themselves are simple. Reserve is `0.6 x guide`; clearing is a two-piece uniform:

| turnout | usual | mean |
| --- | --- | --- |
| thin | 0.70 to 0.85 | 0.769 |
| steady | 0.72 to 0.90 | 0.803 |
| packed | 0.75 to 0.95 | 0.841 |

with 1 lot in 20 clearing below into `[0.60, clearMin)`. So the honest presentation is floor,
band, ceiling, not a single "most likely" that the distribution does not have.

## Three limits the screen must state rather than paper over

1. **No buyer-specific ledger exists.** `valueLedgerFor` takes no `coherenceTolerance`, and buyers
   have their own (Show Crowd ignores incoherence entirely at 0.0, tuner at 0.5). The per-buyer
   panel calls `valuateCarForBuyer` directly; it cannot reuse the ledger.
2. **Labour has no yen price anywhere in the game**, deliberately: repairs cost energy and the
   player's hours are free. The bench can show yen per labour point as a ratio, but "what did this
   cost me" can never include time.
3. **Machining spend never reaches a car's ledger.** Machine-shop hire is barred by design law (one
   day's crane hire pulls four engines, so charging it to one car would be a fiction). The bench
   should show it as a separate line rather than pretend it is free or pretend it is the car's.

## Reuse analysis (directive 16)

**New: one screen, one state builder, and two exports.** No new economics, none.

**Existing mechanisms reused, and this is nearly all of it:**

- `valueLedgerFor` already decomposes `marketValueYen` term by term, and `valueLedger.test.ts`
  already proves the sum equals the real figure to the yen for every roster model. The opening
  block renders it rather than inventing one.
- `carCostToBandYen` already sums per slot. The per-slot bill lines read it.
- `foundationWithheldYen` shipped this morning and is exact.
- `computeDerivedStats`, `supportVerdict`, `saleOutcomeFor`, `normalizedTasteScore`,
  `valuateCarForBuyer`, `channelTasteMultiplier` all already answer their questions.
- `newGame` already builds a valid `GameState`; the bench mutates one rather than fabricating a
  shape.
- The dev console and its dev-only route pattern already exist.

**Nothing parallel is stood up.** If the bench needs a number the game does not have, that is a
finding about the game, not a licence to compute one here.

## Tasks

1. **The state builder.** Pick a model; set mileage, every slot's SKU and band, machining per part,
   every zone's state, symptoms. Set the shop: reputation, scene standing, tool rungs, shops owned,
   market heat, the day. Everything that reaches value must be settable.
2. **The opening block**, per the split above, with the scrap-floor warning.
3. **The running log.** Every action appends its measured delta. Actions are the real resolvers, not
   shortcuts: fitting a part runs the install, repairing runs the repair.
4. **The sale panel.** Per buyer: taste score, champion gate pass or fail, outcome, price. Per
   channel: the arrival odds, single-day, labelled as such.
5. **The acquisition panel.** Reserve, the turnout band's range, buyout. **Decide and record where
   the room's pricing lives.**
6. **The cost side.** Parts bought, repair charges, listing fees, and machining hire shown
   separately as the ledger cannot hold it. Rent and wages excluded, as instructed.
7. **The guard test.** A bench-built car and a normally-built car produce identical figures.

## Definition of done

- Every figure on the screen comes from a sim function; the screen computes none of them.
- Anything with a measurable effect on value or on profit appears somewhere on it.
- The opening block never prints a number it cannot stand behind, and says so where it cannot.
- The guard test passes.
- Dev-only route, excluded from coverage like the other dev screens.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here

- **Loading a car out of a live save.** *"No. I pick a car, I load a condition. We can add this
  later."*
- **Persistence between sessions.** *"Don't worry about that now."*
- **Making it pretty.** *"Just make it neat and user friendly."*
- **Rent, wages and other shared overheads.** Excluded by instruction, and by the same design law
  that keeps them off a car's ledger.

## Exit

Built in two waves: the sim foundations, then the screen.

### The bench

`/economy-bench`, dev-only, reachable from the dev console, excluded from coverage like the other
dev screens. Top to bottom: a collapsible builder, the opening block, the running log with its
action bar, the sale panel, the acquisition panel, the cost side.

**The builder sets everything that reaches value**: model, mileage, year, symptoms; per slot the
SKU, band and machining operations; per zone metal, surface, finish, `panelMissing`, primed, colour
and `panelGrade`; and the shop's day, cash, heat, reputation, six scene standings, six tool rungs
and shop ownership. **"Load a generated lot"** calls the real generator at a seed, because a
realistic car is the common case and hand-building 28 slots is not, and a worked car can be read
back in as the next starting point.

`bodywork` and `paint` are deliberately not settable: `applyDerivedBodyBands` stays the single
writer.

**The actions are the real path**, not shortcuts. Fitting stages an install and runs
`confirmStagedWork`, the workshop floor's own Confirm. Repairing stages a repair through the same
function. Machining runs `resolveFittedMachiningLabor`. A part-laboured job stays open, so refilling
labour and pressing the same button carries it on exactly as in game, and a refusal prints the sim's
own words.

### Three temptations to compute, and what happened to each

This is the part that decides whether the bench drifts, so it is recorded in full.

1. **Per-slot value attribution.** The sketch wants `internals (worn): -Z`, and
   `carCostToBandBreakdown` returns bill yen rather than value yen. Rather than scale it in the
   screen, `restorationValueLinesFor` was added to `valueLedger.ts`: two breakdown reads split at
   the expectation band, each half at its own discount. **A decomposition of an existing formula,
   in sim, where it can be tested.** 49 roster models hold the bill half exactly to
   `carCostToMintYen` and the value half to the ledger's own `wear` plus `polish` within per-line
   rounding.
2. **The champion gate.** Not re-derived: `saleOutcomeFor(...) !== 'nothing'` **is** the gate by
   that function's own contract, and a test pins the two together. `normalizedTasteScore` was
   module-private and is now exported, which is a one-word change with no behaviour.
3. **The room's cold-clearing chance. Dropped.** Reading `bargainChance` in the game layer would
   have tripped the `duplicateFormulaBan` marker. **The guard was not weakened to fit the feature;
   the feature went.** The panel shows floor, band and ceiling, which is what the design prescribed
   anyway.

No `AUCTION_BUYOUT_PREMIUM`, `reserveFraction` or `stepThresholdYen` is read anywhere in the game
layer. The buyout-versus-room note is prose beside two figures, not a constant.

**Two sums survive**, both bookkeeping over sim's own answers and both asked for: the running total,
which is a sum of measured deltas, and yen per labour point, a labelled ratio beside a statement
that labour has no yen price and can never enter a total.

### The honesty split, honoured

- **Bill lines: exact**, per slot and per zone.
- **The aftermarket premium: one line**, with `foundationWithheldYen` beside it and copy saying why
  it is not split.
- **On the scrap floor** the per-slot value column becomes `n/a` and a warning replaces the
  counterfactuals, tested against a fully stripped car.
- **Channel odds are labelled single-day** with the Markov caveat stated.
- **The matched-only trap is surfaced rather than hidden behind a zero.** When a channel is
  `matchedOnly`, arrival is possible and offer chance is zero, the screen says in words that the
  visit ages the listing and can never pay.
- **Machining hire is its own line** in an "off this car's ledger" table, beside the sim's own
  attribution.

### The guard, in three tiers

1. **Round trip.** A real generated lot read into a bench spec and rebuilt reproduces mileage,
   factory colour, the zone table, symptoms, and every slot's `partId`, `band` and `machining`.
2. **The guard proper.** The same car seated by the bench, and acquired the normal way through a
   real `AuctionLot` and `resolveBuyoutInstant` then moved into a service bay, produce identical
   `marketValueYen`, identical `valueLedgerFor` by deep equality, identical `foundationWithheldYen`
   and identical `computeDerivedStats`.
3. **The guard after work.** The identical repair run on both states leaves identical value-bearing
   part fields, identical `zoneState` and identical `marketValueYen`.

Two guard failures were genuine diagnoses and both were case (a), the test asserting more than the
guard is about: part-instance ids and `origin.day` legitimately differ because the bench re-stamps
provenance when rebuilding from a spec, and neither reaches any price; and `tyres` is a
`wheelAssembly` member so `resolveRemovePart` correctly refuses it, which is now its own passing
test.

### Four gaps closed after first use, and what closing them found

The bench was used, found to be misleading in two places and silent in four, and both were fixed.
**Its failure mode is prose, not numbers**: every bug found in it has been a correct figure beside a
label saying something else, and none was visible to 32 passing tests, because no test read a
sentence against the value next to it. That is now a standing precedent, applied three times: a
sentence's numerals must each be a figure sim answered for that exact car, asserted by regex.

**The sale.** The bench could list a car and never take an offer, so realised profit, the reputation
delta and the heat move were unreachable. Three actions now drive the real path: `drawDailyOffers`
at a typed seed, `resolveSellViaWalkIn` (the garage's own sale button), and a weekly settle.

Two findings fell out of building it:

- **A sale moves no heat on the day.** The resolver bumps a counter; heat only moves when
  `updateMarketHeat` reads it at the week boundary. Hence the settle button, and prose saying so
  rather than a zero left to be misread.
- **The bench could not report a profit at all**, because a seated car has no `purchaseYen` and sim
  rightly never fabricates one. A "Bought for" control writes it through `setCarLedger`, the same
  primitive every acquisition uses. Left empty it stays null and the screen says why.

**Stats and lap times.** Absent entirely, so half the open questions could not be asked on it.
`evaluateBuild` split cleanly into `evaluateCarInstance`, shared with the performance sandbox rather
than written twice, plus `supportVerdict` and `coherenceFactorForCar`, which neither screen had.
`lapBlockers` sits beside the laps, because `lapTimeSecondsFor` returns null on a car with a scrap
critical part and a bare blank reads as a broken model.

**Stat and lap deltas in the running log**, measured the same way the yen already was. This is the
one that answers "is this rung worth its money". Five stat columns always visible with a dash where
nothing moved, and one lap column against a selected course, all four measured and stored so the
selector re-reads rather than recomputes. **A sale has no after**, so its deltas are null rather than
zero and the row reads `car gone`.

**The channel-realised price.** The buyer table showed the standard taste band, not
`valuateCarForBuyerViaChannel`, **so the six scene-standing dials were moving nothing visible.** One
channel at a time from a selector, because seven buyers by six channels is forty-two prices nobody
holds, and flipping the selector is what makes the dials legible. The test that proves the point:
raising all six standings to `shop` moves the channel-price column and leaves the buyer table
byte-identical.

The trade network needed one new pure sim readout, `channelPriceBandRangeFor`, because it has no
buyer pool and the alternative was arithmetic in the screen, which the governing rule forbids. Same
precedent as `restorationValueLinesFor`: when the bench needs a number, it goes into sim where it
can be tested.

### What sim could not answer, and still cannot

- **A per-buyer value ledger does not exist.** `valueLedgerFor` takes no `coherenceTolerance`, so
  the buyer panel calls `valuateCarForBuyer` directly and the screen says so.
- **No multi-day arrival probability exists**, by design. The screen labels its figures rather than
  iterating the chain.
- **Labour has no yen price**, so the cost side cannot total a play including time. The ratio is all
  that is honest.

### A finding about the game, not the tool

**No freshly generated lot matched any buyer's taste**, across all roster models at the seed tested.
So `tunerMagazine`, `weekendMeet` and `collectorNetwork`, all `matchedOnly`, can never produce an
offer on an unbuilt car: they burn an `offersSeen` tick and pay nothing.

That is consistent with the champion gate's intent, that a car should need work before a scene wants
it. But **burning staleness for a structurally impossible sale is a trap rather than a gradient**,
and one seed is not a measurement. The bench is now the instrument that can settle it.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 625 passed |
| `pnpm test --project sim` | 2785 passed |
| `pnpm test --project game` | 1024 passed |
| `npx eslint` / `prettier --check` | clean |
| `packages/content/data/` diff | empty |

Four rules were added to `duplicateFormulaBan.test.ts` in the first wave (now 13) covering
`reserveFraction`, `bargainChance`, `stepThresholdYen` and `AUCTION_BUYOUT_PREMIUM`, all allowed
only in `bidding.ts`, so the room's pricing cannot quietly come back to the game layer.
