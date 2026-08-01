# Sprint 163: a body panel can be something other than the one it left with

## Goal

The three body carriers, `panels`, `paint` and `underbody`, are the only slots in the game that can
never hold anything but the factory item. Every other slot separates **what a part is** (`partId`)
from **what state it is in** (`band`). The body wired the second and never wired the first.

Three consequences, all live today:

1. **A body kit cannot be expressed as a body part.** The twelve kits that ship sit on the `aero`
   slot instead, where six of them are purely cosmetic and silently take the car's functional
   downforce with them when fitted.
2. **Twenty-three of the hundred authenticity points can never be lost.** `panels` and `paint` carry
   eleven each and `underbody` one, and because the slot is permanently stock, a resprayed,
   rebumpered, widebodied car still reads as factory original.
3. **Six of the style condition weight can only ever drag style down**, never lift it, for the same
   reason.

## Definition of done

1. The three body carriers can hold a non-stock SKU, while their band keeps deriving from zone
   state.
2. Cosmetic body kits live on a body slot. Functional aero stays on `aero` and keeps making
   downforce.
3. Fitting a cosmetic kit no longer removes the car's functional aero.
4. A modified body loses its authenticity, in proportion to the weight the taxonomy already gives
   it.
5. A body kit can raise style, and the reach maths is measured rather than assumed.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.**

- `partId` versus `band` is how all twenty-nine slots already work. This does not invent a concept,
  it extends one to the three slots that were skipped.
- The `bodyKit` price basis already exists and already prices all twelve kits. No SKU is repriced.
- `applyDerivedBodyBands` already owns the band. It keeps owning it; only the identity is new.
- `planSwapPanel` already models fitting a fresh panel: new metal, bare finish, paint owed. Fitting
  a kit is the same event and should reuse the same semantics rather than inventing a second one.
- The authenticity formula already reads `isStock(slot)` per slot and already weights it. Nothing
  about the formula changes; three slots simply stop lying to it.
- `installFitGate`, the parts market and the workshop already handle fitting a non-stock SKU.

**Genuinely new.**

- Nothing structural. The work is removing the two invariants that pin these slots to stock.

## Design

**The band still comes from the zones.** Identity and condition stay orthogonal, exactly as they are
everywhere else. A dented widebody is a widebody that is dented: the kit says what the car is, the
zone state says what shape it is in. Anything that makes fitting a kit heal damage, or makes damage
un-fit a kit, has confused the two axes.

**Fitting a kit is a panel swap.** The affected zones get fresh metal and a bare finish, so the car
owes its paint afterwards. That is what `planSwapPanel` already does and what a real body kit
actually needs, and it means a widebody build has a paint job in it rather than arriving finished.

**Cosmetic and functional are different parts.** A bumper-and-skirt kit changes how a car looks. A
wing changes what it does. They have been sharing one slot, which is why fitting the first destroys
the second.

## Known blockers

Two invariants pin these slots and both must move:

1. `removable: false` on the three carriers in the taxonomy, which means `installFitGate`'s
   `slotEmpty` can never be true.
2. `applyDerivedBodyBands` refills an empty carrier from the **stock** SKU, so identity is
   overwritten every time bands re-derive.

`integrity.test.ts` asserts the current shape and will need re-basing.

## Levers (directive 22)

**No lever value moves without being brought back first.** One is expected to come under pressure:
letting body carriers contribute style adds points to a ladder currently saturating at
`styleSaturationPoints` 66. **Measure what the change does to style reach and report the numbers.
Do not move the saturation point.** If the maths demands it, that is a finding for the maintainer.

The twelve kits keep their prices. `baseCostYen.bodyKit` stays at 28,000.

## Tasks

1. [x] Let the three carriers hold a non-stock SKU without losing zone-derived bands.
2. [x] Split cosmetic kits from functional aero; put cosmetic kits on a body slot.
3. [x] Make fitting a kit reuse the panel-swap semantics.
4. [x] Bring the twenty-three authenticity points to life. Twelve of them; `paint` ships no
   aftermarket SKU and the remaining eleven stay unloseable (`TODO.md`).
5. [x] Measure style reach before and after, and the authenticity distribution before and after.

## User-only tasks

Rule on any style lever the measurement shows is needed. **One is: fitted style points on offer
went 88 to 108 against a `styleSaturationPoints` of 66, and the best-first route to the ceiling
went seven parts to six.** No lever was moved.

A second ruling is owed on the `underbody` style ladder, which does not climb with its grades
(street 8, sport 8, race 6). See the Exit and `TODO.md`.

## Exit

Ready for review. **No lever value moved.** `economy.json`, `partPricing.json` and every
`statModifiers` figure are untouched; the twelve kits carry the prices they carried before, which
the existing `partPricing.test.ts` pin asserts unchanged.

### 1. Authenticity, before and after

5,200 real generated lots (26 shipped models x 200 seeds, `generateAuctionCarInstance` at 1995 with
symptoms and missing slots enabled), measured through a throwaway Vitest probe that built TWO
`SimContext`s from one code base: the shipped catalogue, and the same catalogue with the twelve
cosmetic kits put back on `aero`. That second one reproduces the pre-sprint game exactly, since the
move changes no price (all three slots ride the default grade ladder and every kit carries an
explicit `priceBasisPartId`). Both probes have been deleted.

| class | n | authenticity mean / p10 / p50 / p90, before -> after | lots carrying a body-carrier kit | mean market value, before -> after |
| --- | ---: | --- | ---: | --- |
| entry | 1,400 | 55.52 / 35 / 56 / 75 -> **55.02 / 34 / 56 / 75** | 0 -> **180** (12.9%) | 200,771 -> 200,670 (**-0.05%**) |
| everyday | 1,600 | 64.39 / 43 / 66 / 81 -> **63.77 / 43 / 65 / 81** | 0 -> **185** (11.6%) | 547,473 -> 547,508 (+0.01%) |
| enthusiast | 1,800 | 69.15 / 51 / 71 / 84 -> **68.55 / 50 / 70 / 84** | 0 -> **210** (11.7%) | 1,148,610 -> 1,149,517 (+0.08%) |
| flagship | 400 | 76.81 / 64 / 79 / 88 -> **76.12 / 63 / 78 / 87** | 0 -> **36** (9.0%) | 3,244,872 -> 3,247,395 (+0.08%) |
| ALL | 5,200 | 64.60 / 42 / 67 / 82 -> **64.02 / 41 / 66 / 82** | 0 -> **611** (11.8%) | 869,708 -> 870,200 (+0.06%) |

Two readings. **The points are alive**: 11.8 per cent of lots now arrive with a body-carrier kit
on them, where none ever could before, and the whole distribution shifts about half a point down.
**The economy does not notice**: mean guide value moves between -0.05 and +0.08 per cent, because
the authenticity a kit costs and the aftermarket premium it adds very nearly cancel.

The worked case, a mint all-stock `nissan-silvia-s13` (authenticity exactly 100):

| fitted | before | after |
| --- | ---: | ---: |
| Sport Body Kit | 90 (`aero`, weight 10) | **89** (`panels`, weight 11) |
| Underglow Kit | 90 (`aero`, weight 10) | **99** (`underbody`, weight 1) |
| GT Wing | 90 (`aero`, weight 10) | 90 (`aero`, unchanged) |
| Sport Body Kit **and** GT Wing | 90 - they shared one slot | **79** |

The last row is the whole change in one line: two modifications now cost two slots' weight, in
exact proportion to the taxonomy's own column (`panels` 11, `underbody` 1, `aero` 10).

### 2. Style reach, before and after. **This one needs a ruling.**

Best-in-slot `statModifiers.style` across the catalogue, identical at every fitment class:

| | before | after |
| --- | ---: | ---: |
| slots carrying style | 10 | **12** |
| fitted points on offer | 88 | **108** |
| against `styleSaturationPoints` | 66 | **66** (unmoved) |
| overshoot | 133% | **164%** |
| loudest three slots | 42 of 88 (48%) | 44 of 108 (**41%**) |
| best-first parts to reach half the gap | 3 | 3 |
| ...four fifths | 5 | **4** |
| ...the whole gap | 7 | **6** |

The ladder, everyday class, after: `aero` 18, `rims` 14, **`panels` 12**, `seats` 10, `dampers` 8,
**`underbody` 8**, `dashGauges` 8, `exhaust` 7, `springs` 7, `brakeCalipersLines` 6, `tyres` 6,
`intake` 4.

**Does it still saturate sensibly? Yes, and it overshoots more than it did.** The ladder was
already past saturation before this sprint (88 against 66), and the two new slots widen the margin
to 164 per cent while making the top of it LESS concentrated: no three slots can finish a car, and
the loudest three now carry 41 per cent of what is available rather than 48. What genuinely gets
shorter is the route: six best-in-slot parts finish a car where seven did.

`styleSaturationPoints` was NOT moved and no proposal to move it is made here. The maintainer's
call. `style.test.ts`'s parts-to-the-ceiling measurement was re-pinned to the measured 3/4/6
(directive 17 case (a)).

### 3. A cosmetic kit no longer takes the downforce with it

`effectiveDownforce` (`performance.ts`), a mint car with a GT wing fitted, then a Carbon Body Kit
fitted on top:

| model | factory | GT wing | GT wing + carbon body kit, BEFORE | ...AFTER |
| --- | ---: | ---: | ---: | ---: |
| `honda-civic-sir2-eg6` | 0.0000 | 0.4000 | **0.0000** | **0.4000** |
| `nissan-silvia-s13` | 0.2650 | 0.4000 | **0.2650** | **0.4000** |
| `toyota-supra-rz-jza80` | 0.1644 | 0.4000 | **0.1644** | **0.4000** |

The defect was verified before it was acted on: a cosmetic kit occupied the `aero` slot, so
`effectiveDownforce` found a SKU without `aeroFunctional` and fell back to `factoryAeroOf`. On a
car with no measured factory downforce that is a wing thrown away for nothing.

### 4. A dented widebody stays a widebody

Traced through the shipped code and pinned in `packages/sim/tests/bodyCarrierIdentity.test.ts`:

- damage arrives (`setZoneCarrierToAtLeastBand`) -> the band re-derives -> `applyDerivedBodyBands`
  writes `{ ...installed, band }`, so the kit's `partId` survives and the band reads `poor`;
- repairing the zones back takes the band to `mint` and the kit is still fitted;
- five consecutive re-derivations change nothing.

Nothing about fitting a kit heals damage that is not on the zones it covers: a `panels` kit refits
the five panel zones and leaves the chassis exactly as it found it, and an `underbody` kit refits
the chassis and leaves the panel zones alone. `paint` names no zone of its own, so a paint SKU
would move nothing (none ships).

### 5. What was built

**Two invariants moved, and the second one moved differently from the brief's expectation.**

1. `installFitGate`'s emptiness check now reads "the slot takes this part", which a body value
   carrier always does. `applyJobToCar` installs over the occupied slot, refits the carrier's zones
   through `planSwapPanel` and re-derives the bands.
2. **`removable: false` STAYS on all three carriers, deliberately.** The sprint doc named the flag
   as the blocker, and the analysis it came from offered the alternative ("or add a
   body-carrier-specific replace path"); that alternative is what landed, because flipping the flag
   costs far more than it buys: `plays.ts`'s `stripAndSell` gates on `removable`, so a strippable
   shell would put a 19,600-to-126,000 yen `panels` SKU into every part-out yield and move the
   donor invariant Sprint 162 had just measured green; `carCostToMintYen` would charge a full
   replacement for the momentarily-empty slot and `hasScrapOrMissingPart` would read it as a lemon;
   and the UI would grow a "Take it off" control on Paint. Keeping the flag also dissolves the
   brief's second blocker outright: `applyDerivedBodyBands`'s stock-SKU fallback fires only on a
   NULL carrier slot, and with replacement-in-place the slot is never null, so a fitted kit is
   never overwritten. Its doc comment now records that it writes the band and nothing else.

**The consequence of keeping the flag, disclosed rather than smoothed over:** the part coming off
is discarded, not harvested, and the parts market delists the stock body carriers, so fitting a kit
is currently one-way. Logged in `TODO.md` with the two candidate fixes; neither is taken here,
because both are economy decisions.

**Content.** Twelve SKUs (24 catalogue entries across four fitment classes) moved off `aero`: the
three FRP body kits to `panels`, the three underside kits to `underbody`. **Zero SKUs added,
removed or repriced** - the catalogue is still 472 entries, and every kit's price is byte-identical
because `panels`, `underbody` and `aero` all ride the default grade ladder and every kit already
carried an explicit `priceBasisPartId`. `aero` is now exactly the four-grade performance slot and
every non-stock SKU on it is `aeroFunctional`, which `integrity.test.ts` now asserts in both
directions.

**Reachability.** `panels` and `underbody` had no workshop-view region, so without one the feature
would have been unreachable in play. Each has one now: the frame the body plan sits inside, and the
sills down the lift's long edges. Both are disjoint from every existing rectangle (the layout's own
law) and neither needs new art, since backdrops are per-view. `paint` still has none - it has
nothing to fit.

**Fitting semantics.** `refitCarrierZoneStates` (`bodyPipeline.ts`) is the only new function, and it
drives `planSwapPanel` rather than restating it. A fresh kit therefore arrives on straight metal
with a sound surface and a bare finish, so a mint kit lands the car at `panels` mint and `paint`
**poor**: a widebody build has a paint job in it, exactly as the design says. Labour is the existing
`installLaborSlotsFor` for a `surface` slot, and the fit is gated by the existing body-line
signature-slot rule (`machineShopAssist.signatureSlotsByGroup.body` already lists `panels` and
`underbody`). No new labour or gate was invented.

### 6. Two findings that are the maintainer's to rule on

**a. The style overshoot above (108 against 66).** Not moved.

**b. The `underbody` grade ladder does not climb in style.** Underglow (street) 8, skirt and
splitter (sport) 8, flat floor (race) 6. This was invisible while all six kits shared the `aero`
slot, because that slot's best-per-grade came from the wing ladder (8 / 13 / 18). It is arguably
correct - neon is louder than a race flat floor, and on that slot the grade ladders function rather
than volume - but it breaks a guard that held on every other slot, so it is recorded rather than
decided. `style.test.ts` now carves `underbody` out by name with the reasoning written down;
`TODO.md` carries the decision.

**c. What a body kit costs against the panels it replaces**, disclosed because fitting one refits
five zones:

| class | body kit street/sport/race | five zone panels | stock shell |
| --- | ---: | ---: | ---: |
| entry | 5,100 / 7,800 / 11,800 | 21,000 | 19,600 |
| everyday | 5,800 / 9,000 / 13,400 | 24,000 | 22,400 |
| enthusiast | 14,600 / 22,400 / 33,600 | 60,000 | 56,000 |
| flagship | 32,800 / 50,400 / 75,600 | 135,000 | 126,000 |

A street body kit re-panels five zones for about a quarter of what five zone panels cost, and the
car still owes five zones of prime and paint (5 x 3,700 = 18,500) plus 11 of 100 authenticity. No
price was changed to address this; it is the shape the shipped `bodyKit` basis already had.

### 7. Every test touched, with directive 17's case

| file | what changed | case |
| --- | --- | --- |
| `packages/sim/tests/bodyCarrierIdentity.test.ts` | **new**, 10 tests: the gate, the unremovability, the zone refit per carrier, the paint-owed result, and three dented-widebody traces | new coverage |
| `packages/sim/tests/authenticity.test.ts` | the "recorded limitation" block asserted that no non-stock SKU exists for the three carriers and that 23 points are unloseable. Its own comment said this test is what fails when the limitation is fixed. Replaced with the ladder assertion, the per-slot weight arithmetic, and the 11 points `paint` still holds | **(a)** the block existed to record a gap this sprint closes |
| `packages/sim/tests/aero.test.ts` | `BODY_KIT` resolved a cosmetic SKU on the `aero` slot; no such SKU exists now, so the two tests using it had gone VACUOUS (passing against an undefined part, i.e. a stock car). Re-pointed at the `panels` kit and strengthened: both now also assert a fitted race wing survives the kit | **(a)**, and the vacancy is the reason it could not be left alone |
| `packages/sim/tests/style.test.ts` | the grade-ladder guard now carves out `underbody` by name with the reasoning; the parts-to-the-ceiling pin moved 3/5/7 -> 3/4/6 | **(a)** for the pin (two style-bearing slots were added). The carve-out is a disclosed exception, finding 6b, not a loosening: the bar is unchanged on all eleven other slots |
| `packages/content/tests/integrity.test.ts` | the 16-SKU matrix now excepts `paint` alone; the stock-only carrier test narrowed to `paint`; the "widened aero" 3-per-grade count replaced by the aeroFunctional split assertion; the underglow-kit fit test re-pointed to `underbody` | **(a)** all four asserted the pre-split catalogue shape |
| `packages/content/tests/partPricing.test.ts` | the twelve body kits are asserted on the `panels` slot rather than `aero`. Prices asserted unchanged | **(a)** |
| `packages/game/src/components/workshopViewLayout.test.ts` | coverage excepted three carriers; now excepts `paint` alone | **(a)** two carriers gained a region |
| `packages/game/src/screens/PerformanceSandboxScreen.test.ts` | set-all-to-race held three slots; now holds `paint` alone | **(a)** `panels` and `underbody` have a race grade now |
| `packages/game/src/screens/CarDetailScreen.test.ts` | **new test**: a body carrier offers Replace while occupied, never "Take it off", and fitting a kit leaves the car owing its paint | new coverage |

Nothing else was edited, and no bound was relaxed anywhere else.

### 8. Checks

`pnpm typecheck` clean across content, sim and game (directive 20's carve-out: this reshapes slot
semantics and adds a `CarPartRowView` field, so it was run - twice, the second time after the last
edit).

```text
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

Green: the whole `content` project (26 files, 573 tests), the whole `game` project (63 files, 851
tests), and every `sim` test file including `bots/` (run in batches to find breakage, not as a
safety sweep). No bot career was run (directive 21). Both measurement probes were throwaway Vitest
files under `packages/sim/tests/` and have been deleted; `git status` carries no artefact from them.
