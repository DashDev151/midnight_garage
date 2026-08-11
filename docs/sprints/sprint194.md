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

### The pinned preview, and two things the builder was lying about

Used again, the bench was found to be a black box for a BUILDER edit: an edit set the dirty flag and
showed nothing, because Rebuild is destructive (it replaces the car, resets the till and clears the
log) and so could not be run on a keystroke.

**The answer is a preview, not an auto-rebuild.** `economyBenchPreview.ts` builds a THROWAWAY
`CarInstance` and `GameState` from the pending spec through `benchCarInstance`/`benchGameState`, the
same pair Rebuild itself calls, and prices it through `valueLedgerFor`. Nothing about the session
moves. A pinned panel above the builder carries it: the value now, the value as typed and the
change; the realised profit either side where a purchase is recorded; a diff of the two ledger line
sets as the WHY; and the five stat deltas and four lap deltas, measured by the log's own
`statDeltasBetween`/`lapMeasurementsBetween` rather than a second pair.

**Measured cost: 1.18 ms for the value preview and 1.85 ms for the build delta**, about 3 ms per
keystroke, so nothing is debounced.

`realisedProfitYen` was extracted out of `resolveSellViaWalkIn` into `carLedger.ts` and the resolver
now calls it: profit on the bench is the sale's own definition rather than a second copy of it.

**Two builder defects the work exposed, both prose or shape rather than arithmetic:**

- **A zone colour was a free text box.** Colour is a palette id, and a stock-grade respray is refused
  with `wrong-colour` outside the car's factory set, so the box accepted values the game rejects. It
  is now a picker over `PAINT_COLOURS`, grouped by the same families the paint dev screen reads, with
  the car's own factory colours marked. `factoryColourSet` is exported from `bodyPipeline.ts` and now
  answers that question for the bench AND for `CarDetailScreen.vue`, which had its own copy of the
  split.
- **A hand-built car wore its two-tone token as a colour.** `cleanZoneStates` wrote `factoryColour`
  straight onto all nine zones, so a car whose first pool entry is `a+b` wore a shade no tin holds
  and no stock respray could lay. It now deals the halves through `factoryReferenceColours`, exactly
  as generation's own `original` paint state does.

**And the zone table now says which way its axes run**: lower is better on all three, and the chain
(beat and weld, then filler, then primer, then paint, then polish) with each stage's own refusal,
read out of `bodyPipeline.ts` and quoting `MAX_REPAIRABLE_METAL`/`BEYOND_REPAIR_METAL` rather than
typed rungs.

The standing prose precedent held again: the preview's value sentence is asserted by regex to quote
exactly three figures and each of them to be one sim answered for that car, and the guard proper is
that a previewed figure equals what the same spec produces after a Rebuild.

### The pinned bar carries numbers, and the prose that was in it lives here

Used a third time, the pinned panel was found to be spending the most valuable real estate on the
screen on about eighty words of caveat and definition. The maintainer's requirement, in their own
words: *"I need to see ON SCREEN how what I am doing affects the COST / VALUE / PROFIT."*

**The bar is now three figures and the reasons they moved.** Left to right, equal weight, one glance:

    Cost (books)          Value (market)        Profit (vs book cost)
    ¥400,000              ¥1,830,000            +¥1,430,000
    if rebuilt ¥400,000   if rebuilt ¥1,910,000 if rebuilt +¥1,510,000
    change            ¥0  change      +¥80,000  change        +¥80,000
    [bought for ____] [desk price]

    moved   mileage -¥80,000 (-¥12,000 to -¥92,000)   coherence ...
    > lines that did not move

The two "if rebuilt" rows appear only while the builder is dirty. Below the figures sit the moved
ledger lines as one wrapping row of chips (each carrying its delta, and its before and after), the
foundation-withheld pair when it changes, the stat and lap deltas, and a collapsible holding the
lines that did not move.

**Cost is new on this panel and it is the point of the rework.** It comes from `bookCostYen`, added
to `carLedger.ts` beside `realisedProfitYen`, which now calls it: purchase plus repairs plus parts
fitted plus listing fees, or null when no purchase was recorded. One basis, so profit is value less
cost to the yen by construction rather than by coincidence, and a screen test asserts exactly that
against the three rendered figures. No behaviour changed anywhere: it is the same sum, named.

**It also makes a basis shift visible that the old panel hid.** A rebuild starts a new car, so the
pending world's ledger opens at the purchase price alone and carries none of the session's repairs,
parts or fees. The old panel showed only profit, which silently absorbed that reset; the cost figure
now moves in plain sight beside it, and the "if rebuilt" caption carries the reason on its tooltip.

**No purchase price recorded** is a state, not a sentence. Cost and profit each read a dash rather
than a zero, independently on each side of a pending change, and the "bought for" box and the "desk
price" button moved out of the shop panel into the cost cell, so the one input those two figures
need is where they are.

**The three paragraphs that were deleted, in full, so nothing is lost:**

1. The missing-purchase sentence: *"No purchase price is recorded, so no profit is measured against
   one. Set Bought for in the shop panel."* Now the dashed cost and profit figures with the input
   beside them.
2. The profit definition: *"Profit here is that market value less everything the books say this car
   has cost, which is the sim's own realised profit asked of a hypothetical sale at exactly market
   value. A real sale is a buyer's own price through a channel, in section 4, so this is a yardstick
   and not a forecast. Neither figure carries machine-shop hire or rent, by the design law that keeps
   both off a car's ledger."* Now a `title` on the "Profit (vs book cost)" label, and recorded here.
3. The panel-behaviour explainer: *"Change anything in the builder and this panel prices it: what it
   would be worth instead, what the change is, and which ledger lines moved. Nothing is built until
   Rebuild."* Deleted outright: a working panel demonstrates it, and section 1's own stale warning
   already says what a rebuild does.

Two further paragraphs became tooltips on the labels they belonged to rather than standing prose:
the ledger-diff note (*"a line a ledger does not carry is an adjustment of nothing rather than a
gap"*) and the foundation-withheld note. The foundation row keeps its exact claim in four words on
screen, "foundation withheld, not a ledger line", with the rest on the tooltip. The
"nothing has been built" note went too: it repeated section 1's stale warning verbatim in substance.

**The honesty rule is unchanged and the labels carry it**: "Profit (vs book cost)" says what the
figure is measured against, "Value (market)" says whose price it is, and every caveat that is
genuinely load-bearing is a tooltip away rather than deleted.

Four prose guard assertions were retargeted, all case (a), the implementation having changed what is
correct to display: the clean-state test now asserts the dashed figures and the in-bar input rather
than the deleted sentence; the profit test asserts the dashed and measured figures on both sides of a
pending change rather than two phrases; the unmoved-line test asserts the chip's contents and its
place in the collapsible rather than a table row's exact concatenated text; and the pending test
reads section 1's stale warning rather than the deleted panel note. The value-sentence guard (exactly
three figures, each one sim's) needed no change and still passes against the new layout.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 626 passed |
| `pnpm test --project sim` | 2804 passed |
| `pnpm test --project game` | 1076 passed |
| `npx eslint` / `prettier --check` | clean |
| `packages/content/data/` diff | empty |

Four rules were added to `duplicateFormulaBan.test.ts` in the first wave (now 13) covering
`reserveFraction`, `bargainChance`, `stepThresholdYen` and `AUCTION_BUYOUT_PREMIUM`, all allowed
only in `bidding.ts`, so the room's pricing cannot quietly come back to the game layer.
