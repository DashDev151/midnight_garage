# Live auction model (design of record)

**Status:** prototyped as the dev-only auction room demo
(`packages/game/src/screens/auctionRoomDemo.ts` + `AuctionRoomDemoScreen.vue`), slated to
replace the overnight auction resolution as the game's live buying system. This documents
the model and, per the maintainer's request, the clearing-price odds.

## The model in one paragraph

Each lot has a fair-odds **room read**: the value the auction sheet prints
(`sheetGuideValueYen`), the market's best guess given the doubt, priced across the
possible causes at their odds. Before the auction the player **inspects** (the real
diagnosis mechanic: run tests, narrow the causes) and learns the car's **true worth**,
which can sit above the read (a steal) or below it (a trap). When the auction runs, the
room draws ONE **clearing price** up front, the most the floor will pay, as a seeded
fraction of the read. The floor then climbs dealer-against-dealer up to that price and no
further; the player wins by topping it. Dealers are pure presentation (named silhouettes
that thin as the board climbs); there are no per-dealer valuations behind them.

## The single tuning surface (`ROOM_TUNING`)

Every knob lives in one exported block; nothing else feeds the bidding.

- `clockMs` - the per-bid fuse (5000 = 5s). Leading at fuse-out wins; trailing loses.
- `reserveFraction` - the opening bid, as a fraction of the read (0.55).
- `bidDelayMs {min, max}` - the delay before each room raise (always < `clockMs`).
- `bargainChance` - the chance a room is cold and clears below its floor (0.05).
- bid step - `stepBelowYen` (5000) for a car under `stepThresholdYen` (500,000) of value,
  `stepAboveYen` (10,000) at or above it.
- `turnout` - per crowd: the dealer count and the `clearMin`/`clearMax` band the room
  clears in, as a fraction of the read. Thin: 2 dealers, 0.70-0.85. Packed: 6 dealers,
  0.75-0.95.

## The clearing odds (the bid odds)

The hammer price is a fraction of the car's value, drawn once per room. It falls into two
bands, uniform within each:

- **95%** of rooms are normal: the fraction is uniform inside the turnout band.
- **5%** of rooms are cold: the fraction is uniform between the reserve (0.55) and the
  turnout floor - a bargain.

The fractions depend only on turnout; the yen scales with the car's value. The hammer
lands on the nearest bid rung just under the drawn fraction (within one bid step).

**Thin room (2 dealers), clears 0.70-0.85 normally:**

| Sells for (x value) | Chance |
|---|---|
| 0.55-0.70 (cold bargain) | 5% |
| 0.70-0.75 | ~32% |
| 0.75-0.80 | ~32% |
| 0.80-0.85 | ~32% |

Typical thin sale: ~0.77 x value.

**Packed room (6 dealers), clears 0.75-0.95 normally:**

| Sells for (x value) | Chance |
|---|---|
| 0.55-0.75 (cold bargain) | 5% |
| 0.75-0.80 | ~24% |
| 0.80-0.85 | ~24% |
| 0.85-0.90 | ~24% |
| 0.90-0.95 | ~24% |

Typical packed sale: ~0.84 x value.

Rule of thumb, any car: a thin room hands it over around three-quarters of value, a packed
room around 85%, and roughly one room in twenty is cold and lets it go cheap. All of it
tunes from `ROOM_TUNING`.

## What inspection knowledge moves (the value delta)

The room read prices the doubt at the ODDS: the probability-weighted average over the
possible causes. Inspection reveals the actual cause, so the player's number can differ
from the read. That difference is the market's markdown for the true repair the car needs.

The value model discounts an unrepaired below-expectation fault at `marketRepairDiscount`
(currently 1.3x): a car worth ~V clean is worth `V - 1.3 x (repair bill to reach the
tier's expectation band)`. So a value delta of, say, 20,000 between the odds read and the
true worth corresponds to the true repair being ~15,000 (20,000 / 1.3) more than the odds
implied. It manifests two ways: the car costs ~15,000 more to make sellable, or it fetches
~20,000 less if sold on as-is.

**The stakes lever (decided):** an ordinary below-expectation repair still returns more
than its cost (1.3x), so a routine "issue" reads as upside, not a trap. The teeth come
from the rare CATASTROPHE instead. Eight doubts now carry a low-weight worst cause that
sets an expensive or foundational part (block, internals, gearbox, differential, chassis)
to the terminal `scrap` band, whose true worth collapses toward the `scrapValueFraction`
floor: a genuine "walk away" that the odds read only lightly discounts, so an uninspected
bidder overpays the grenades and underbids the gems. Toning `marketRepairDiscount` from
1.5 to 1.3 keeps the routine repair lucrative-but-not-a-money-printer while the scrap-band
tail supplies the real downside; the swings are now two-directional and scale with the car
via per-class part costs.
