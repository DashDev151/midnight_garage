# Sprint 197: four numbers, and a cage that is a decision

**Status: IMPLEMENTED, ready for review.** Levers signed before implementation.

Four values that have been blocking work, decided together because they were measured together.

## LEVERS (directive 22) - SIGNED

**The maintainer delegated the choice** (*"please select the best numbers you can on your own"*) and
approved the four below by name and value (*"numbers fine"*) before any implementing agent launched.

| lever | file | from | to |
| --- | --- | ---: | ---: |
| `buyers.json` daily-drivers `statTargets.handling.upper` | `buyers.json` | none authored | **0.60** |
| underglow operation `style` | `economy.json` | does not exist | **6** |
| underglow operation `authenticityCost` | `economy.json` | does not exist | **0.3** |
| `machining.valuePremiumPerOperation` | `economy.json` | 0.03 | **0.08** |

### The cage's `upper`, and why 0.60

**This lever is the whole feature.** Measured earlier: a cage cannot add mass
(`PhysicalModifierSchema.mass` is `.max(1)` by schema), costs about one authenticity point on the
`chassis` slot (weight 1 of 99), and **no buyer reads a part** - buyers read the five derived stats,
the model's culture and its tier. So without an `upper` a cage is a strict upgrade, which is the
opposite of *"makes the car worse to live with"*.

`StatTasteSchema`'s own doc names this exact case: *"the point past which the car starts actively
working against the buyer (a caged race car putting off a Daily Drivers buyer)"*. The mechanism
ships and is authored on **power only**, at 0.55, for daily-drivers and touge.

**0.60 rather than 0.55**, deliberately: the handling display curve puts **55 at 1.10 g, which is
the top of stock**. An upper of 0.55 would trip on any well-sorted standard car, which is not the
intent. At 0.60 a stock sporty car sits inside the band and only genuinely modified handling starts
working against the buyer.

**Touge does not get one.** Handling is their champion stat at target 0.50 and importance 1.0; a
ceiling there would fight the archetype.

### Underglow, 6 and 0.3

Against the authored ladder where a race wing is 18 and `show-fitment` gives 5: **6** sits just above
show fitment because it is more visible, and well under a wing because a wing is a functional
statement and this is decoration.

**0.3** sits between `corner-weighting` (0.25) and `show-fitment` (0.35). A light kit is less
irreversible than rolling arches, and it is plainly not how the car left the factory.

### `valuePremiumPerOperation`, 0.03 to 0.08

Measured on flagship engine parts (block 144,000, internals 81,000, head 63,000, cams 45,000):

| | at 0.03 | at 0.08 |
| --- | ---: | ---: |
| a fully machined block, 4 operations | +12 per cent | **+32 per cent** |
| the whole engine set, 11 operations | 31,590 | **84,240** |
| per labour point, 55 spent | 574 | **1,532** |

At 0.03 a full engine's machining returns less than a day's labour is worth against a day pool of
80 points. **This is the lever the authenticity rescale left carrying the whole question of whether
machining is worth choosing**, since that change removed most of its downside.

## Two levers deliberately NOT moved, with the argument

**Race body panel mass stays 0.975.** It reads 0.238s at Hakone, louder than predicted, and the
maintainer expected near-zero. But 25 to 35 kg on a 1,200 kg car genuinely is 2.5 per cent, which is
a quarter of the existing race-mass ladder and where it belongs. Dropping to 0.994 would mean a full
carbon set saves 8 kg, which is not a carbon set. **The number is physically honest; the expectation
was the imprecise part.**

**`partPricing.baseCostYen.bodyKit` stays.** The "style per yen is an order out" framing that raised
it compared a 121,000 yen carbon shell giving 12 style against a 12,500 yen wing giving 18. **That
comparison no longer holds:** since sprint 192 body panels also carry market value through
`installedPartsValueYen` and race panels save mass, so the shell buys three things and the wing buys
one.

## Reuse analysis (directive 16)

**New: one operation entry.** Underglow is a `machining.operations` row, not a part and not a slot.
It gates on the body and trim shop for free, because `craftOperationCapabilityGateReason` derives
the required line from the operation's own `carPartId` group and `chassis` is `body`.

**Everything else is a value moving in a table that already exists.** The `upper` mechanism ships and
is exercised by power today; `valuePremiumPerOperation` is already read by
`machiningPremiumYenOf`.

## Tasks

1. **Author underglow** as an operation on `chassis`, `performedOn: 'fitted-part'`, carrying `style`
   and `authenticityCost`. It belongs on the car's own screen beside corner weighting and show
   fitment.
2. **Author the daily-drivers handling `upper`.**
3. **Move `valuePremiumPerOperation`.**
4. **Re-pin the `economy.json` hash** with all three of its changes recorded, and the `buyers.json`
   hash if that file is gated.
5. **Re-derive every pin that moves, from real runs.** `valuePremiumPerOperation` reaches
   `installedPartsValueYen`, so expect value pins and golden masters. The `upper` reaches taste, so
   expect sale-outcome and reputation pins.
6. **Measure and record what the `upper` actually does.** How many shipped cars, stock and built,
   now fall outside daily-drivers' handling band? If the answer is none, the lever is inert and
   that is worth knowing rather than assuming.

## Definition of done

- A cage is expressible as a real decision rather than a strict upgrade, proven by a test showing a
  high-handling car scoring worse with daily-drivers than a moderate one.
- Underglow exists, gates on the body and trim shop, and appears on the car's screen.
- Machining pays enough per labour point to be worth choosing.
- Every moved pin re-derived from a real run with its reason recorded.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here

- **The cage itself.** This sprint authors the lever that makes it possible. The SKU is content and
  follows.
- **The matched-only channel question.** It needs a measurement rather than a number, and the bench
  is now the instrument for it.

## Exit

All four signed values landed. Nothing else in any content file moved.

### The `upper` is live, and 0.60 was the right number for a measurable reason

Measured across all 48 shipped cars through `computeDerivedStats`, `normalizedTasteScore` and
`saleOutcomeFor`:

| | result |
| --- | --- |
| **stock, mint, all stock parts** | **0 of 48 cross 0.60.** Highest is the NSX-R at 56, then the 22B at 45 |
| **built** (race dampers, springs, anti-roll bars, tyres, aero scaled by each car's own ceiling) | **24 of 48 cross it**, from 61 to 94 |
| of those 24, against a daily-drivers buyer | **20 fall from `delighted` to `satisfied`** |
| taste cost | 0.3 to 9.2 per cent |

**This confirms the choice of 0.60 over 0.55 exactly, and by measurement rather than by argument:
0.55 would have tripped the NSX-R on a bone-stock car**, which is the outcome the number was chosen
to avoid.

The taste penalty is modest, capped at about 10.8 per cent of the match. **The real teeth are the
binary loss of `delighted`**, which halves what the sale pays in reputation, 30 to 15. So a cage is
now a decision about who you are building for, which is what the lever existed to make possible.

Kept as a permanent test in `valuation.test.ts`: the ceiling clears every shipped car's stock trim,
is crossed by a real build on more than a third of the roster, and costs an S13 both taste and
delight once crossed.

### Underglow

An operation on `chassis`, `performedOn: 'fitted-part'`, no `scene`. Its copy:

> Runs neon tubes along the sills and under the bumpers, wired in off the ignition. Buys nothing on
> the road and everything in a car park at midnight.

**It gates on the body and trim shop for free, verified rather than assumed.**
`craftOperationCapabilityGateReason` reads `partsTaxonomyById['chassis'].group`, which is `body`, and
requires level 3 there. Carrying no scene it takes the `minEngineToolTier` branch rather than
`craftOperationToolTier`, but both are 3, so the requirement is identical. Proven in both directions:
body shop owned gives `null`, engine shop owned with body at rung 2 gives `tool-tier`.

It appears on the car's own screen beside corner weighting and show fitment, and the machine shop
refuses it as `unknown-operation`, both covered by tests.

### One pin moved, and that is measured too

`economy.json` hash only. **No value pin and no golden master moved**, which was checked rather than
assumed: every site quoting a machining premium reads the constant from content, and no scripted
career, mission probe or golden-master run machines anything, so `valuePremiumPerOperation` 0.03 to
0.08 left the suite green. No sale-outcome or reputation pin moved either, because no fixture builds
a car over 0.60 handling.

`buyers.json` is not hashed anywhere, so its change is recorded in the same ledger rather than
pinned.

### Five stale tests, one root cause

All case (a), none a regression, and all five were the same mistake: **`scene === undefined` was
being used as a proxy for "an engine machining operation"**, and underglow breaks that proxy by
having no scene while being fitted-part work.

Tightened to `scene === undefined && performedOn === 'loose-part'`, which is what those tests always
meant. The same stale filter was fixed in `machiningPowerModel.test.ts`, which was passing only
because underglow happens to carry zero power.

One test was renamed rather than just fixed: "sells after the nine the tooling alone can do" became
"the nine done at the machine", because since the tool ladder rework every operation unlocks on
tooling alone and the old name no longer distinguished anything.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 626 passed |
| `pnpm test --project sim` | 2,799 passed |
| `pnpm test --project game` | 1,036 passed |
| `npx eslint` / `prettier --check` | clean |
| content value diff | the four signed values, plus `labourPoints: 5` on the new operation, which the schema requires and every other operation carries |

### Still open

**The cage SKU itself.** This sprint authored the lever that makes it a decision rather than a free
upgrade. The part is content and follows.

**The array's name.** `economy.machining.operations` now holds three things that are not machining:
corner weighting, show fitment and underglow. Recorded in `TODO.md`.
