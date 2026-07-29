# partPricing.json: the period calibration and what it produces

**Status: LIVE. The sheet described here is what ships**, and it is approval-gated by
`packages/content/tests/economyApprovalGate.test.ts`, which pins the whole file. Nothing in
it moves without the maintainer signing the specific lever and value.

Calibrated against `parts-prices.md` (period 1994 to 2004 catalogue data: HKS, Endless, Cusco,
RAYS) plus the aero and tuning-package figures from part 4m of the car-price research
(MAZDASPEED, August 1998), which fills the aero gap the parts sweep flagged.

**Reading the research correctly:** every figure in the parts sweep is a *premium* brand
(HKS, Endless, Cusco and RAYS were the top of the market) and the sweep itself says a real
budget tier sat well below them. So the calibration rule is: **premium catalogue price is
roughly the game's `sport` or `race` grade on a mid-tier car**, with `street` representing the
budget and local-shop tier the sweep could not reach. Accessories (harnesses, mounting stays,
metal catalysts, a real 20 to 35 per cent of period bills) are **baked into the base costs**
rather than modelled separately. A future reader comparing `exhaust: 40000` against a
catalogue muffler price will think it is too high. It is not.

---

## 1. Changed base costs (9 of 30)

| Part | Old | New | Anchor |
|---|---:|---:|---|
| exhaust | 25,000 | **40,000** | The best-populated ladder in the research: Legal 42k entry, 62.8k to 78k volume, 128k to 136k flagship. Old base gave a 50k "sport" exhaust, below the real entry point. |
| springs | 14,000 | **18,000** | HKS Racing Spring was 18k *per pair*, and a car needs two pairs (36k); car-specific sets ran 37k to 40k. |
| dampers | 26,000 | **40,000** | The biggest correction. Damper kits were 127k to 148k, full coilovers 178k to 208k. The old base priced a "race" damper at 73k, under half the real entry kit. |
| brakePadsDiscs | 8,000 | **15,000** | Premium pads alone were 25k 本体. New stock 15k is OEM-replacement pads and discs. |
| brakeCalipersLines | 18,000 | **45,000** | The research's headline finding: above pads, brakes jump eightfold in one step. Endless 4POT plus pads plus the mandatory stay was 203k; full system kits 288k to 408k. The old base put a "sport" caliper set at 36k, off by nearly an order of magnitude. |
| intake | 15,000 | **18,000** | Induction kits were 37.8k to 39.8k. A filter element at 3.9k stays sensibly below any grade. |
| ignitionEcu | 20,000 | **28,000** | Three real rungs: single-function boxes 11.8k to 12.8k, boost controllers 42.8k to 64.8k, and an ECU at 100k plus a mandatory 10k to 20k harness, so 110k to 120k fitted. |
| rims | 30,000 | **34,000** | Forged TE37 sets ran 120k (13 inch) to 276k (18 inch) and were the market top; the 1992 wheel-clearance advert had new premium sets at 178k to 540k. |
| aero | 18,000 | **26,000** | Anchored from part 4m, since the parts sweep found no aero at all: MAZDASPEED wing 86k, side skirts 92k, front nose 118k, all unpainted with fitting extra. |

## 2. Validated and deliberately unchanged

Three existing bases land almost exactly on the period data, so they are *confirmed* rather
than merely untouched:

- **forcedInduction 90,000.** Reaches the GT2510 bolt-on kit (182k to 202k), GT-R twin-kit
  money (320k to 358k) and single-turbo conversion territory (438k to 548k) across the ladder.
- **differential 55,000.** Lands on Cusco type A (75k) and its supercharged-application
  variant (104k).
- **dashGauges 12,000.** Gauges were 11.5k to 12.5k each and a console 26k, so street is one
  gauge, sport a pair, race a trio plus housing.

The remaining bases (block, internals, headValvetrain, camsTiming, fuelSystem, cooling,
gearbox, clutch, driveline, chassis, antiRollBars, steering, tyres, panels, paint, underbody,
seats, zonePanel) have **no period anchor in either research file**: the sweep never reached
engine hard parts, clutches, tyres or bodywork. They are internally coherent as they stand, so
they were left alone rather than adjusted on guesswork. **If a second sweep is ever
commissioned, clutches, tyres and paint or bodywork rates (the back pages of Option and
CARBOY) are the gaps.**

## 3. The factors, as they now stand

- **`gradeFactors`: stock 1.0, street 1.3, sport 2.0, race 3.0.** The `race` rung was
  stretched from 2.8 to land the race rungs on their anchors. The period top-end spreads
  (suspension twelvefold, brakes sixteenfold, engine management ninefold) argue race could go
  higher still; 3.0 keeps race builds affordable against the car roster (see section 4).
- **`classFactors`: entry 0.14, everyday 0.16, enthusiast 0.40, flagship 0.90.** These are
  **not** the values this research proposed, and the difference matters. They were re-derived
  later, against a binding constraint the original calibration did not consider: **the
  cheapest car in each tier must not be strippable for profit.** A tier's whole stock-parts
  basket now lands at 0.56, 0.66, 0.68 and 0.62 of what a typical car in that tier is worth,
  where the original factors gave 0.93, 4.05, 2.73 and 3.47. The entry-to-everyday step is
  small on purpose: the roster re-tier put those two tiers in the same price band, and the old
  fourfold step was calibrated when the bottom class meant "cheap car" rather than "kei-sized
  components".
- **`globalFactor` 1.0**, unchanged.
- **`classFactors.legend` was proposed at 4.0 and is not in the sheet.** A plain Zod object
  strips an unknown key, so it parsed green, did nothing, and read to any future maintainer as
  a live lever, which is the worst of the available states. The `legend` fitment class is
  deferred rather than rejected; picking it up drags the `gaisha` mapping question and three
  new `expectationByTier.legend` values with it. `TODO.md` carries it.

## 4. What the sheet actually produces (measured, not projected)

**Measured against the shipped catalogue and the canonical roster book values.** The figures
in an earlier version of this section were computed against the old class names and the old
factors and were wrong in both. These are the real ones.

| tier | cars | cheapest car | median car | first-stage street build | full race build | build against median car |
|---|---:|---:|---:|---:|---:|---:|
| entry | 5 | 130,000 | 320,000 | 16,600 | 501,600 | **1.57x** |
| everyday | 4 | 150,000 | 340,000 | 18,800 | 573,000 | **1.69x** |
| enthusiast | 12 | 480,000 | 770,000 | 47,400 | 1,432,800 | **1.86x** |
| flagship | 5 | 1,450,000 | 1,850,000 | 106,600 | 3,223,800 | **1.74x** |

First-stage street build is exhaust, intake, springs and pads at `street`.

**Three things worth reading out of that table:**

- **The first stage is pocket money on every tier**, at 7 to 13 per cent of even the cheapest
  car in the tier. A player can always afford to start.
- **A full race build costs more than the car**, at 1.57 to 1.86 times the median. That is
  period-true: the car research documents a 4.8M restoration on a 3.85M Z432 and a 7M
  restoration against a 5.8M ask. **The car is the cheap part**, which is both authentic and
  good game economy.
- **The multiple is deliberately flat across tiers.** No tier is the one where building is
  cheap relative to what you are building on, so the choice of what to build is about the car
  rather than about arbitrage.

**The brake cliff survives**, at exactly threefold from pads to calipers at every class and
grade (entry 4,200 to 12,600; flagship 27,000 to 81,000), which the ladder test pins.

**The wheel spread** runs 6,200 for entry street rims to 91,800 for flagship race rims, a
fifteenfold canyon that mirrors the real cast-to-forged one.

## 5. The three suggested overrides cannot be expressed, and will not be

An earlier draft of this document proposed three `overrides`: rotary engine parts at plus 30
to 50 per cent, exotics at 1.6 to 2.0 times, and kei drivetrain parts at 0.8 times.

**The schema cannot express any of them, and this is recorded here so the next reader does not
propose them again.** `overrides` is `z.record(z.string(), z.number().int().nonnegative())`:
it is keyed by **SKU id** and valued as an **absolute yen price**. There are no multipliers,
no car-level keys and no car-type keys.

Taken literally, "rotary plus 40 per cent" means hand-authoring an absolute yen figure for
every rotary engine SKU, which is precisely the mass content edit this sheet exists to
prevent, and it would drift the moment any base cost moved again.

**Decision (maintainer, 2026-07-28): `overrides` stays empty**, which is what its own schema
comment intends ("ships EMPTY; every entry is a deliberate, individually-justified decision").
A test asserts it is empty, because an override wins outright and a non-empty map would
silently exempt a SKU from every ladder assertion.

**The rotary premium is sanctioned as its own mechanic instead**, in the maintainer's words:
"add another Rotary modifier that modifies the pricing of certain parts when a car is tagged
rotary." It is genuinely new, so it gets a real design rather than a config line, and it
carries three open points: where the rotary tag lives (a car's engine layout may already be
derivable from `engineConfig`, and deriving beats a second source of truth), which parts it
touches (a rotary's exhaust, brakes and suspension cost what any other car's do, so the
premium belongs on the engine hard parts, and `camsTiming` is a live question rather than a
multiplier because a rotary has no camshafts at all), and its value, which is an unapproved
lever needing a named number.

## 6. Two period truths the sheet encodes

1. **Exhaust is the gateway drug.** The tightest, cheapest ladder in the data, which is why
   every 90s catalogue led with it. A street exhaust is the cheapest meaningful upgrade on any
   car, exactly as it was.
2. **Brakes have a cliff.** Pads are cheap and the very next step is many times the money. The
   two brake parts sit either side of that cliff instead of pretending it is a ramp.
