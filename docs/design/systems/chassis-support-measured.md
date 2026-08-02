# Chassis support, measured

**The six values in this file are APPROVED and BUILT.** `docs/sprints/sprint167.md` is the design
of record for what shipped, and `statFormulas.chassisSupport` in `economy.json` carries the
numbers. This file stays as the measurement they were chosen on and is deliberately NOT rewritten
to match, because it is the record of how they were chosen.

Two things it measures were overturned by the two rulings in section 7, both of which the sprint
adopted. It measures gain in MECHANICAL grip and reads the brake shortfall as the worse of the two
brake slots; what shipped measures gain in EFFECTIVE grip (so a wing pays towards the bar it
raises) and splits the brake share across both brake slots (so the first brake part bought is
worth something). Both make the loss larger than the tables below. Freshly measured on all 26
shipped cars, an unsupported build loses 0/0/1 handling points at street, 1/3/3 at sport and
11/15/19 at race, against the 0/0/1, 1/2/2 and 10/11/13 in section 1. One support part added to an
unsupported race build returns 3/3/5 for brake pads alone, 5/7/9 for both brake slots, 4/5/7 for
steering and 6/7/9 for the chassis. Every other property holds exactly as measured, including the
ladder: 572 comparisons, 0 violations, tightest step +3 on the Wagon R.

The previous contents of this file measured the FLAT-penalty version of this rule (a fixed amount
of grip subtracted per unsupported slot). It is superseded and has been deleted: a flat penalty
broke the grade ladder, because the grip ladder is back-loaded (a street rung pays 3 to 10 handling
points, a race rung 24 to 43) while the penalty charged the same 10 to 12 at every rung.

## The system measured

```text
requiredGrade = highest grade among tyres, dampers, springs, antiRollBars, aero
gain          = max(0, builtGrip - factoryGrip)
lossFraction  = byGrade[requiredGrade]
missingShare  = sum of share[slot] over brakes, steering, chassis below requiredGrade
usableGrip    = builtGrip - gain * lossFraction * missingShare
```

Identical to `factoryGrip + gain * (1 - lossFraction * missingShare)`, written as a subtraction so
the `max(0, ...)` has one place to live (section 5c: three shipped builds have negative gain).

- `builtGrip` / `factoryGrip` are `effectiveGrip` with and without the fitted build, both at the
  car's OWN parts condition. Mechanical grip only, the one quantity the readout and the lap share.
- `brakes` is `min(brakePadsDiscs, brakeCalipersLines)`. `share` sums to 1 across the three.
- Nothing else. No subsystem, no ratio, no threshold, no weakest link, no cap.

**The values proposed, derived in section 3:**

| lever | street | sport | race |
| --- | ---: | ---: | ---: |
| `byGrade` | **0.10** | **0.20** | **0.35** |

| lever | brakes | steering | chassis |
| --- | ---: | ---: | ---: |
| `share` | **0.45** | **0.35** | **0.20** |

Every figure came from a throwaway probe driving the shipped sim on real content:
`computeDerivedStats`, `effectiveGrip`, `effectiveDownforce`, `buildFactors`,
`physicalConditionFactors`, `gripToDisplay`, `balanceOf`, `lapTime`. Only the five lines above are
probe code. The probe asserted, on all 26 cars and every build in these tables (and at a sub-mint
band, where the condition fraction is not 1), that its own unloaded handling expression reproduces
the shipped `StatBlock.handling` exactly before applying anything. The probe has been deleted.
Cars are at mint and the lap is Hakone unless stated. "Grip parts" means all five grip slots at that
grade; "support" means the three support slots at the same grade as the grip parts.

---

## 1. The four cars

Grip is mechanical lateral g. `with system` is the same build under the loss.

### Suzuki Alto Works (HA21S), entry, kei, aeroCeiling 0.30

| build | required | short | grip | usable | downforce | handling | with system | delta | lap | with system |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 stock | stock | none | 0.768 | 0.768 | 0.000 | 19 | 19 | 0 | 133.3 | 133.3 |
| 2 street grip | street | all three | 0.825 | 0.819 | 0.030 | 25 | 24 | -1 | 129.2 | 129.6 |
| 3 sport grip | sport | all three | 0.867 | 0.847 | 0.120 | 31 | 29 | -2 | 126.6 | 127.8 |
| 4 race grip | race | all three | 1.060 | 0.958 | 0.360 | 55 | 45 | -10 | 116.8 | 121.5 |
| 5 + race brakes | race | steering, chassis | 1.060 | 1.004 | 0.360 | 55 | 50 | -5 | 116.4 | 118.8 |
| 6 + race steering | race | brakes, chassis | 1.060 | 0.994 | 0.360 | 55 | 49 | -6 | 116.8 | 119.8 |
| 7 + race chassis | race | brakes, steering | 1.113 | 1.016 | 0.360 | 61 | 51 | -10 | 114.7 | 118.7 |
| 8 race everything | race | none | 1.113 | 1.113 | 0.360 | 61 | 61 | 0 | 114.3 | 114.3 |

### Nissan Silvia (S13), everyday, aeroCeiling 0.85

| build | required | short | grip | usable | downforce | handling | with system | delta | lap | with system |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 stock | stock | none | 0.850 | 0.850 | 0.265 | 33 | 33 | 0 | 120.3 | 120.3 |
| 2 street grip | street | all three | 0.876 | 0.873 | 0.350 | 37 | 37 | 0 | 118.6 | 118.8 |
| 3 sport grip | sport | all three | 0.923 | 0.908 | 0.605 | 47 | 46 | -1 | 115.7 | 116.5 |
| 4 race grip | race | all three | 1.139 | 1.038 | 1.285 | 83 | 72 | -11 | 105.4 | 109.4 |
| 5 + race brakes | race | steering, chassis | 1.139 | 1.083 | 1.285 | 83 | 77 | -6 | 105.0 | 107.1 |
| 6 + race steering | race | brakes, chassis | 1.139 | 1.073 | 1.285 | 83 | 76 | -7 | 105.4 | 108.0 |
| 7 + race chassis | race | brakes, steering | 1.196 | 1.099 | 1.285 | 90 | 79 | -11 | 103.8 | 106.9 |
| 8 race everything | race | none | 1.196 | 1.196 | 1.285 | 90 | 90 | 0 | 103.3 | 103.3 |

### Mazda RX-7 (FD3S), enthusiast, aeroCeiling 1.00

| build | required | short | grip | usable | downforce | handling | with system | delta | lap | with system |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 stock | stock | none | 0.910 | 0.910 | 0.248 | 39 | 39 | 0 | 113.7 | 113.7 |
| 2 street grip | street | all three | 0.915 | 0.915 | 0.348 | 41 | 41 | 0 | 113.3 | 113.3 |
| 3 sport grip | sport | all three | 0.966 | 0.954 | 0.648 | 53 | 51 | -2 | 110.3 | 110.8 |
| 4 race grip | race | all three | 1.196 | 1.096 | 1.448 | 93 | 81 | -12 | 100.1 | 103.4 |
| 5 + race brakes | race | steering, chassis | 1.196 | 1.141 | 1.448 | 93 | 86 | -7 | 99.6 | 101.2 |
| 6 + race steering | race | brakes, chassis | 1.196 | 1.131 | 1.448 | 93 | 85 | -8 | 100.1 | 102.1 |
| 7 + race chassis | race | brakes, steering | 1.256 | 1.159 | 1.448 | 99 | 88 | -11 | 99.1 | 101.0 |
| 8 race everything | race | none | 1.256 | 1.256 | 1.448 | 99 | 99 | 0 | 98.6 | 98.6 |

### Nissan Skyline GT-R (BNR32), flagship, aeroCeiling 1.00

| build | required | short | grip | usable | downforce | handling | with system | delta | lap | with system |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 stock | stock | none | 0.886 | 0.886 | 0.339 | 38 | 38 | 0 | 114.1 | 114.1 |
| 2 street grip | street | all three | 0.913 | 0.911 | 0.439 | 43 | 43 | 0 | 112.5 | 112.6 |
| 3 sport grip | sport | all three | 0.964 | 0.948 | 0.739 | 54 | 52 | -2 | 109.6 | 110.3 |
| 4 race grip | race | all three | 1.194 | 1.086 | 1.539 | 94 | 82 | -12 | 99.6 | 103.2 |
| 5 + race brakes | race | steering, chassis | 1.194 | 1.135 | 1.539 | 94 | 87 | -7 | 99.2 | 101.0 |
| 6 + race steering | race | brakes, chassis | 1.194 | 1.124 | 1.539 | 94 | 86 | -8 | 99.6 | 101.8 |
| 7 + race chassis | race | brakes, steering | 1.253 | 1.151 | 1.539 | 99 | 89 | -10 | 98.7 | 100.8 |
| 8 race everything | race | none | 1.253 | 1.253 | 1.539 | 99 | 99 | 0 | 98.3 | 98.3 |

Builds 5 to 7 each fit ONE support part to build 4, so their `delta` is measured against their own
unloaded figure. What the player sees is the `with system` column moving: 45 to 50, 49, 51.

### The loss by tier, all 26 cars

| tier, unsupported | min | median | max | median build | median with system |
| --- | ---: | ---: | ---: | ---: | ---: |
| street grip | 0 | **0** | 1 | 36 | 35 |
| sport grip | 1 | **2** | 2 | 45 | 43 |
| race grip | 10 | **11** | 13 | 78 | 67 |

---

## 2. What each support part is worth (brief question 3)

Added to build 4 (race grip parts, nothing supported), one at a time, in handling points.

| car | unsupported | + brakes | + steering | + chassis | + all three | + pads alone |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Alto Works | 45 | 50 (+5) | 49 (+4) | 51 (+6) | 61 (+16) | 45 (+0) |
| Silvia S13 | 72 | 77 (+5) | 76 (+4) | 79 (+7) | 90 (+18) | 72 (+0) |
| RX-7 FD3S | 81 | 86 (+5) | 85 (+4) | 88 (+7) | 99 (+18) | 81 (+0) |
| Skyline GT-R | 82 | 87 (+5) | 86 (+4) | 89 (+7) | 99 (+17) | 82 (+0) |

| purchase | min | median | max | (all 26) |
| --- | ---: | ---: | ---: | --- |
| brakes (both slots) | 4 | **5** | 5 | |
| steering | 3 | **4** | 4 | |
| chassis | 6 | **7** | 7 | |
| all three | 15 | **17** | 19 | |
| brake pads alone | 0 | **0** | 0 | see section 7 |

**No support part is worth 0.** A race steering rack carries no `physicalModifiers` at all and is
worth exactly 0 handling points in the shipped game; here it is worth 3 to 4 on every car. Chassis
returns more than its share buys because a race chassis SKU also carries
`physicalModifiers.grip` 1.05 and raises handling the ordinary way on top: about 2 points of its 6
to 7 is the shortfall it clears, the rest is the part itself.

**All three together return 15 to 19 against a loss of 10 to 13**, for the same reason.

---

## 3. Why these six numbers

### `byGrade`: handling points lost, unsupported, all 26 cars

The split is irrelevant here (`share` sums to 1, so an unsupported build has `missingShare` 1
whatever the split).

| loss fraction | street: min/med/max | sport: min/med/max | race: min/med/max |
| ---: | --- | --- | --- |
| 0.05 | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 / 2 |
| **0.10** | **0 / 0 / 1** | 0 / 1 / 1 | 2 / 3 / 4 |
| 0.15 | 0 / 1 / 1 | 0 / 1 / 2 | 4 / 5 / 6 |
| **0.20** | 0 / 1 / 1 | **1 / 2 / 2** | 6 / 6 / 8 |
| 0.25 | 0 / 1 / 2 | 1 / 2 / 3 | 7 / 8 / 10 |
| 0.30 | 0 / 1 / 2 | 1 / 2 / 3 | 8 / 9 / 12 |
| **0.35** | 0 / 1 / 2 | 2 / 3 / 4 | **10 / 11 / 13** |
| 0.45 | 0 / 1 / 3 | 2 / 4 / 6 | 12 / 14 / 17 |
| 0.60 | 0 / 2 / 4 | 3 / 5 / 8 | 17 / 19 / 23 |

- **race 0.35**, because it lands the loss at 10 to 13 points off a build reading 76 to 99, and 3.3
  to 5.3 seconds a lap (section 6). That is the magnitude the flat pass measured and the maintainer
  accepted; nothing in this sweep argues for moving it. Below 0.20 it is noise next to the 17 points
  a wing alone hands the same car.
- **street 0.10**, because it is the largest value at which the median car loses NOTHING and no car
  on the roster loses more than 1 point. Someone bolting street dampers onto stock brakes should
  read a number that went up.
- **sport 0.20**, because it is the smallest value that is always visible (min 1, never 0) without
  reaching the race band. It sits on the straight line between the other two, which is the whole
  claim the ladder makes: the harder the parts, the more of their gain you cannot use.

### `share`: what each purchase returns on a race build

| split (brakes/steering/chassis) | brakes | steering | chassis |
| --- | ---: | ---: | ---: |
| 0.40 / 0.30 / 0.30 | 4 / 4 / 5 | 3 / 3 / 4 | 7 / 8 / 9 |
| 0.34 / 0.33 / 0.33 | 3 / 4 / 4 | 3 / 4 / 4 | 7 / 8 / 9 |
| 0.40 / 0.35 / 0.25 | 4 / 4 / 5 | 3 / 4 / 4 | 6 / 7 / 8 |
| **0.45 / 0.35 / 0.20** | **4 / 5 / 5** | **3 / 4 / 4** | **6 / 7 / 7** |
| 0.50 / 0.30 / 0.20 | 5 / 5 / 6 | 3 / 3 / 4 | 6 / 7 / 7 |

Each cell is min / median / max over the 26 cars. The total is fixed at 15 to 19 in every row, so
the split only decides how it is distributed.

**0.45 / 0.35 / 0.20 is the split whose three purchases land closest together** (5, 4, 6), because
it is the one that compensates for the chassis SKU carrying its own grip modifier: an equal split
makes chassis worth twice what steering is. Pushing chassis below 0.20 buys nothing, since its own
SKU modifier is then most of what it returns. Brakes taking the largest share is also the sentence
the system exists to say.

---

## 4. The ladder proof (the invariant)

**26 cars x 11 support levels x 3 grip tiers = 572 adjacent comparisons. 0 violations.** The
tightest step up the ladder is **+3** (Suzuki Wagon R, all three support slots at street: street
grip 19, sport grip 22). Support levels are the 8 subsets of {brakes, steering, chassis} fitted at
the build's own grade, plus all three fitted uniformly at street, sport and race.

This cannot invert as long as `gain` rises faster up the ladder than `lossFraction` does, and it
does, by an order of magnitude: mechanical grip gained over factory is 0.019 to 0.081 at street,
0.082 to 0.144 at sport, and 0.317 to 0.385 at race, against loss fractions of 0.10, 0.20 and 0.35.
A race build gives up a third of four times the gain, which is still nearly three times what a sport
build keeps.

### Nissan Silvia (S13), handling under the system

| support level | street grip | sport grip | race grip |
| --- | ---: | ---: | ---: |
| none | 37 | 46 | 72 |
| brakes | 37 | 46 | 77 |
| steering | 37 | 46 | 76 |
| chassis | 39 | 49 | 79 |
| brakes + steering | 37 | 47 | 81 |
| brakes + chassis | 39 | 50 | 85 |
| steering + chassis | 39 | 50 | 83 |
| full, at own grade | 39 | 51 | 90 |
| all three at street | 39 | 47 | 73 |
| all three at sport | 41 | 51 | 75 |
| all three at race | 42 | 52 | 90 |

### Suzuki Alto Works (HA21S), handling under the system

| support level | street grip | sport grip | race grip |
| --- | ---: | ---: | ---: |
| none | 24 | 29 | 45 |
| brakes | 25 | 30 | 50 |
| steering | 24 | 29 | 49 |
| chassis | 26 | 32 | 51 |
| brakes + steering | 25 | 30 | 54 |
| brakes + chassis | 26 | 33 | 57 |
| steering + chassis | 26 | 32 | 55 |
| full, at own grade | 26 | 34 | 61 |
| all three at street | 26 | 30 | 46 |
| all three at sport | 28 | 34 | 47 |
| all three at race | 29 | 35 | 61 |

### An unsupported race build against a supported sport build (brief question 1)

| car | stock | sport, supported | race, unsupported | race, supported | margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Suzuki Wagon R | 12 | 25 | 34 | 49 | +9 |
| Suzuki Alto Works | 19 | 34 | 45 | 61 | +11 |
| Honda Civic SiR-II | 25 | 40 | 58 | 74 | +18 |
| Nissan Silvia S13 | 33 | 51 | 72 | 90 | +21 |
| Mazda RX-7 FD3S | 39 | 56 | 81 | 99 | +25 |
| Nissan Skyline GT-R | 38 | 57 | 82 | 99 | +25 |

**Across all 26: margin +9 minimum, +19 median, +25 maximum.** Race rubber on stock brakes still
beats a fully sorted sport car, everywhere, which is what the ladder implies and what the system
must not overturn. It is merely 10 to 13 points short of what it could be.

---

## 5. Sanity checks

### a. Stock cars are exactly unchanged, all 26 (brief question 4)

**0 of 26 moved**, on grip, on handling, and on all four course laps, checked directly on every
shipped car rather than inferred. Two independent reasons, both structural: `requiredGrade` is
`stock` so `lossFraction` is 0, and `gain` is 0 because a stock car's build IS its factory
reference.

### b. Every car can recover fully

At the maximal build (all five grip slots and all three support slots at race), **0 of 26 cars are
short of anything**, `missingShare` is 0, and the worst handling delta across the roster is **0**.
The lap is identical to the unloaded lap on all four courses (table 5, build 8 rows). Every fitment
class in the catalogue carries a street, sport and race SKU for all three support slots, so nothing
is unbuyable on any car.

### c. Three shipped builds have NEGATIVE gain

Swept over every single-slot grip build on the roster (26 cars x 5 grip slots x 3 grades):

| build | gain |
| --- | ---: |
| Mazda RX-7 FD3S, street tyres alone | -0.0215 |
| Toyota Supra RZ, street tyres alone | -0.0207 |
| Toyota Aristo 3.0V, street tyres alone | -0.0201 |

Their factory rubber beats what a street tyre SKU maps to (existing shipped behaviour, not caused by
this system). Without `max(0, gain)` the loss layer would ADD grip back to a downgrade. With it, the
term is inert and the car reads exactly what it reads today.

### d. The reference is the car at its OWN condition band (brief question 6)

`factoryGrip` is read at the same `physicalConditionFactors` as the build. The right-hand columns
show what happens if it is read at mint instead.

| car | band | factory grip | built grip | gain | handling | with system | mint-ref gain | mint-ref handling |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Alto Works | mint | 0.768 | 1.060 | 0.292 | 55 | **45** | 0.292 | 45 |
| Alto Works | fine | 0.737 | 1.000 | 0.263 | 42 | **33** | 0.233 | 34 |
| Alto Works | worn | 0.676 | 0.895 | 0.220 | 24 | **19** | 0.128 | 21 |
| Alto Works | poor | 0.568 | 0.736 | 0.167 | 8 | **5** | 0.000 | 8 |
| Silvia S13 | mint | 0.850 | 1.139 | 0.289 | 83 | **72** | 0.289 | 72 |
| Silvia S13 | fine | 0.816 | 1.075 | 0.259 | 64 | **56** | 0.225 | 57 |
| Silvia S13 | worn | 0.748 | 0.962 | 0.214 | 40 | **35** | 0.112 | 37 |
| Silvia S13 | poor | 0.629 | 0.791 | 0.162 | 16 | **13** | 0.000 | 16 |
| RX-7 FD3S | poor | 0.673 | 0.830 | 0.157 | 18 | **16** | 0.000 | 18 |
| Skyline GT-R | poor | 0.656 | 0.828 | 0.172 | 19 | **16** | 0.000 | 19 |

**A mint reference lets a car dodge the whole loss by rotting.** At `poor` the mint-reference gain
is 0.000 on every car measured, so the penalty vanishes entirely and the readout is the unloaded
one. The same-band reference keeps it proportionate the whole way down: an unsupported race build at
`poor` reads **13 on the S13 against 16 unloaded** (and 5 against 8 on the Alto), which is the same
3 to 4 point bite, scaled to the 3 to 4 points of gain the wreck actually still delivers.

### e. `harnessAcceptance.test.ts` cannot be disturbed (brief question 5)

Two independent reasons, both checked against the file as it stands:

1. It calls `lapTime(model, courseById(courseId), spec.stockPowerPs, spec.tyreCompound, ECONOMY)`
   with no `aeroEffect`, no `condition` and no `build`, so it runs on `STOCK_BUILD_FACTORS`. There
   is no `CarInstance` anywhere in the file, and the rule needs one to read a fitted grade. The loss
   layer is unreachable from it.
2. Every car it times is stock, and section 5a is stock cars.

---

## 6. The loss reaches the lap (brief question 5)

It is applied to mechanical grip, which is the quantity `gripToDisplay` reads and the quantity
`carBlock` corners, brakes and launches on, so the readout and the lap move together by
construction. Nothing is applied twice and nothing has to be kept in step by hand. The probe routed
it as a scale on the build's grip factor, since `effectiveGrip` is linear in that factor.

| car | hakone | wangan | misaki | yatabe |
| --- | ---: | ---: | ---: | ---: |
| Alto Works | 116.8 -> 121.5 (+4.7) | 181.2 -> 183.3 (+2.1) | 132.3 -> 134.2 (+1.9) | 31.9 -> 32.2 (+0.3) |
| Silvia S13 | 105.4 -> 109.4 (+4.0) | 134.4 -> 136.4 (+2.0) | 100.3 -> 102.9 (+2.6) | 26.3 -> 26.4 (+0.1) |
| RX-7 FD3S | 100.1 -> 103.4 (+3.3) | 120.7 -> 122.9 (+2.2) | 91.6 -> 94.3 (+2.7) | 24.1 -> 24.2 (+0.1) |
| Skyline GT-R | 99.6 -> 103.2 (+3.6) | 123.8 -> 125.9 (+2.1) | 92.9 -> 95.8 (+2.9) | 24.0 -> 24.1 (+0.1) |

Build 4 (race grip parts, unsupported). **Hakone across all 26: +3.3 minimum, +4.0 median, +5.3
maximum.** The costs are proportionate: a tight mountain course is grip-limited throughout, the two
mid courses cost 2 to 3 seconds, and a standing kilometre with no corners costs a tenth. On build 8
the lap is identical to the unloaded lap on all four courses, on all four cars.

---

## 7. Open questions for the maintainer

### a. A wing alone is free

| car | build | grip | usable | handling | with system | loss |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Silvia S13 | race tyres alone | 1.045 | 0.977 | 54 | 47 | -7 |
| Silvia S13 | race wing alone | 0.850 | 0.850 | 50 | **50** | **0** |
| Silvia S13 | race dampers alone | 0.875 | 0.866 | 36 | 35 | -1 |
| Silvia S13 | race grip parts less aero | 1.139 | 1.038 | 63 | 53 | -10 |
| Skyline GT-R | race wing alone | 0.886 | 0.886 | 58 | **58** | **0** |
| RX-7 FD3S | race wing alone | 0.910 | 0.910 | 60 | **60** | **0** |

**A race wing alone costs 0 on all 26 cars**, because downforce is not mechanical grip and `gain` is
therefore 0, while the wing itself is worth +17 handling on the S13 (33 stock to 50). Aero is in the
set that sets `requiredGrade`, so the wing raises the bar and pays nothing towards it.

Two honest options, and this is a design call rather than a measurement:

1. **Leave it.** The loss is a statement about mechanical grip and a wing does not add any. The
   moment the same car gets tyres or springs, the wing's `requiredGrade` is already in force and the
   whole build is charged at the race rate.
2. **Measure `gain` in effective grip** (mu times the aero multiplier at the display curve's own
   reference speed) and convert the loss back to mu. That closes the hole at the cost of one extra
   multiply and divide, and would make a bare wing cost about what a bare set of race tyres does.

### b. The first brake part bought is worth 0

`brakes` is `min(brakePadsDiscs, brakeCalipersLines)`, so the brake shortfall does not move until
BOTH slots are race. Buying pads alone is worth exactly 0 points on all 26 cars and the second
purchase is worth 5. Deliberate, but it will read as a bug at the counter. Splitting the brake share
across the two slots costs no extra arithmetic (the same sum, over four slots rather than three) and
measures as:

| variant | pads alone | both brake slots |
| --- | ---: | ---: |
| `min(pads, calipers)` as briefed | 0 / 0 / 0 | 4 / 5 / 5 |
| brake share split across the two slots | 2 / 2 / 3 | 4 / 5 / 5 |

### c. Support is a race-build concern, by design

On a sport build the whole shortfall is 2 points, so no individual support part can return more than
that (measured: brakes 0 to 1, steering 0 to 1, chassis 3 to 4, the last being mostly its own grip
modifier). That is the proportional system working as intended, not a gap: a sport build gains
0.08 to 0.14 of mechanical grip and there is very little of it to lose. Support becomes a real
purchase exactly when the build becomes a real build.

---

## Recommendation

1. **Adopt the six values** in the header: `byGrade` 0.10 / 0.20 / 0.35, `share` 0.45 / 0.35 / 0.20.
   Every outcome the brief asked for is met and measured: an unsupported race build loses 10 to 13
   handling points and 3.3 to 5.3 seconds a lap and is worth fixing; a street build loses 0 (median)
   and never more than 1; all three support parts are worth 4 to 7 points each and none is worth 0;
   and every car on the roster recovers every point.
2. **Take the `max(0, gain)` guard with it.** Three shipped builds have negative gain and without it
   the loss layer would reward a tyre downgrade.
3. **Read `factoryGrip` at the car's own condition band.** A mint reference lets a `poor` car dodge
   the loss entirely (section 5d), and the whole of the difference is which condition factor one
   call reads.
4. **Apply it to mechanical grip**, so the lap inherits it from the same expression as the readout
   and `harnessAcceptance.test.ts` cannot see it (section 5e).
5. **Answer 7a and 7b before implementation.** Both are one-line changes and both change what a
   player is charged for.

None of this is approved. The six numbers are new sim constants and belong in `economy.json` under
directive 22 before any of it is built.
