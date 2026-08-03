# Sprint 167: grip you cannot use

## Goal

Nothing in the game asks whether a car can cope with the grip it makes. Bolt slicks and a race wing
to a shell with stock brakes, stock steering and a stock chassis and the handling number rises as
though the car could use all of it. In life that car is quick in a straight line and frightening
everywhere else.

Two symptoms of the same hole:

- **A race steering rack has no `physicalModifiers` at any grade.** It costs money and does nothing.
  It is the only upgradeable slot in the game with no effect whatsoever.
- **Brakes carry handling condition weight but cannot contribute to handling**, because handling
  means cornering grip and braking is not that.

Giving steering a grip modifier would be the easy fix and it would be wrong. A steering rack does
not create grip; it lets you use grip you already have.

## The system

**A proportion of the grip a build has GAINED becomes unusable when the parts that control it are
not up to the job, and the proportion rises with how much grip was added.**

```
gain      = builtGrip - factoryGrip                      // 0 on a stock car
required  = highest grade among tyres, dampers, springs, antiRollBars, aero
missing   = sum of share[slot] for each support slot below `required`
usable    = factoryGrip + gain * (1 - lossByGrade[required] * missing)
```

Three support slots: brakes (two slots, sharing one figure), steering, chassis.

**Race tyres are always better than sport, which are always better than street. They are simply
less better when unsupported.** A proportion of a larger gain is still larger, so the ladder cannot
invert. This holds by construction rather than by tuning, and it is why the design is proportional
rather than a flat subtraction: a flat penalty inverted the ladder on 327 measured builds.

### Three rulings folded in

**Downforce counts toward the gain.** A wing loading a car at speed demands brakes and steering
exactly as mechanical grip does. Measuring gain in mechanical grip alone exempted the single
largest handling upgrade in the game, worth 17 points on an S13, from the whole system.

**The brake share splits across both brake slots.** Reading the worse of pads and calipers made the
first brake part a player bought worth nothing and the second worth five, which reads as a bug at
the parts counter.

**A downgrade is correct behaviour and passes through untouched.** Three shipped cars (Aristo,
FD3S, Supra RZ) left the factory on `sport` rubber, which is better than the `performance` compound
a street SKU maps to, so fitting street tyres genuinely makes them worse. That is a feature: there
may be good reasons to downgrade a car. **The loss applies only to positive gain**, because there
is no extra grip to support. Clamping the gain to zero would have erased the downgrade instead, and
leaving negative gain in the formula would have made missing support IMPROVE a downgraded car.

### Two traps, both closed by design

**`factoryGrip` is read at the car's own condition band, not at mint.** Against a mint reference
every rough car shows a gain of exactly zero and dodges the loss entirely, which would make letting
a car rot an exploit.

**The loss is applied to grip, not to the display.** So the handling readout and the lap time read
one number and cannot contradict each other.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.** `effectiveGrip` and `effectiveDownforce` already resolve what a
build makes. `gradeOf` already reads a fitted SKU's grade. The parts taxonomy already names every
slot involved. `lapTime` already reads grip, so routing the loss through grip makes the lap agree
for free.

**Genuinely new.** One content block of six numbers, and one function.

## Levers (directive 22)

Magnitudes approved on the measurements in `docs/design/systems/chassis-support-measured.md`.

| lever | value | what it buys |
| --- | ---: | --- |
| `lossByGrade.street` | **0.10** | the largest value at which the median car loses nothing and no car loses more than 1 |
| `lossByGrade.sport` | **0.20** | the smallest value always visible, never 0, without reaching the race band |
| `lossByGrade.race` | **0.35** | 10 to 13 handling points and 3.3 to 5.3 seconds a lap, off builds reading 76 to 99 |
| `share.brakes` | **0.45** | split across `brakePadsDiscs` and `brakeCalipersLines` |
| `share.steering` | **0.35** | |
| `share.chassis` | **0.20** | lower because the chassis SKU already carries its own grip modifier |

The split lands the three purchases close together at roughly 5, 4 and 6 points. Equal thirds made
the chassis worth twice the steering.

## Tests

1. **The ladder never inverts.** Street below sport below race, on all 26 cars at every support
   level. The measured sweep was 572 comparisons with no violations; pin it.
2. **Stock cars are unchanged**, all 26, on grip, handling and all four lap times.
3. **`harnessAcceptance.test.ts` passes untouched**, run explicitly.
4. **Each support part is worth buying on its own**, in visible handling points, and none is worth
   zero. Including the first brake part.
5. **A downgrade stays a downgrade**: street tyres on an FD read the same with the system as
   without it, and missing support does not improve them.
6. **Rot does not dodge the loss**: an unsupported race build at `poor` still loses.
7. **The lap and the readout agree** on every build.

## Exit

Ready for review.

### What landed

- **`statFormulas.chassisSupport`** (`packages/content/data/economy.json`, schema in
  `packages/content/src/economy.ts`): the six approved values exactly as tabled, plus
  `lossByGrade.stock` pinned at 0 by `z.literal(0)` so a stock car cannot be moved from content.
- **`usableGripFraction`** (`packages/sim/src/support.ts`): the whole model, one function. Reads
  the highest grade across tyres/dampers/springs/antiRollBars/aero, sums the share of the support
  slots below it (brakes split evenly across their two slots), and returns the fraction of built
  grip that survives. Returns 1 early on a stock required grade, on nothing missing, and on
  non-positive gain.
- **`physicalFactorsFor`** (`packages/sim/src/derivedStats.ts`): the one assembly of a car's
  condition and build factors, and the only place the loss is applied. It lands on the build's
  GRIP factor, so the readout and the lap spend one number. All three real callers go through it:
  `computeDerivedStats`, `lapTimeSecondsFor`, and the performance sandbox. `buildFactors` stays
  the pure product of the fitted SKUs' modifiers.

### The four traps, closed

1. Only POSITIVE gain is reduced. Negative gain returns early and untouched, so a downgrade is
   neither erased (a clamp to zero) nor rewarded (a negative through the multiply).
2. Gain is effective grip, mu times the downforce multiplier at the display curve's own reference
   speed, converted back to mu on the way out. A bare race wing is now charged on all 26 cars.
3. `factoryGrip` is read at the car's OWN condition band, so an unsupported race build at `poor`
   still loses (S13: 12 against 16).
4. The loss is applied to grip, never to a display.

### Measured on the shipped model, all 26 cars

Handling lost by an unsupported build, min/median/max: street **0/0/1**, sport **1/3/3**, race
**11/15/19**. What one support part returns on an unsupported race build: brake pads alone
**3/3/5**, both brake slots **5/7/9**, steering **4/5/7**, chassis **6/7/9**. None is zero.

The Silvia S13, with the model and without it, Hakone:

| build | handling | without | hakone | without |
| --- | ---: | ---: | ---: | ---: |
| stock | 33 | 33 | 120.3 | 120.3 |
| race grip, unsupported | 67 | 83 | 111.5 | 105.4 |
| + brake pads | 70 | 83 | 109.8 | 105.2 |
| + both brake slots | 74 | 83 | 108.1 | 105.0 |
| + steering | 72 | 83 | 109.2 | 105.4 |
| + chassis | 74 | 90 | 108.4 | 103.8 |
| fully supported | 90 | 90 | 103.3 | 103.3 |

**These magnitudes are larger than `chassis-support-measured.md` section 1**, which measured gain
in mechanical grip alone and read the brake shortfall as the worse of the two brake slots. Both
rulings above overturn that, and both make the loss bigger. The six approved values are unchanged.

One consequence worth naming: a race wing bolted to an otherwise stock FD now COSTS 1.9 s at
Hakone (113.7 to 115.6) where it used to buy 1.5. The pass is 11 m switchbacks taken far too
slowly for downforce to pay, and the loss is charged at the race rate against a car with stock
brakes, stock steering and a stock shell. It still buys 2.4 s at Misaki and 3.2 s on the Wangan,
and fitting the support returns all of it.

### Tests written and run

`packages/sim/tests/chassisSupport.test.ts`, 13 cases covering all seven asked for. Every
comparison is against the same content with `lossByGrade` zeroed, so a difference is this model
and nothing else.

- **The ladder never inverts**: 26 cars x 11 support levels (the 8 subsets at the build's own
  grade, plus all three uniformly at street, sport and race) x 2 adjacent pairs = **572
  comparisons, 0 violations**. Tightest step +3 (Wagon R, all support at street, 19 against 22),
  the same figure the measurement recorded.
- **Stock unchanged**: build factors at the stock identity on all 26, handling and all four laps
  identical to the model-off run, and still identical at every condition band below mint.
- `harnessAcceptance.test.ts` **passes untouched**, 27 tests, run explicitly.
- Every support part raises handling on its own on all 26, including the first brake part; a fully
  supported build recovers every point and every lap tenth.
- A downgrade (FD3S, Supra RZ, Aristo on street tyres) reads identically with the model and
  without, laps identically, sits below stock, and does not move whatever support is fitted.
- Rot does not dodge the loss, at `fine`, `worn` and `poor`.
- Handling never rises and no lap on any course ever falls across the build sweep; on an
  unsupported race build both move strictly.

Two existing files were touched, both directive 17 case (a):

- `packages/sim/tests/aero.test.ts` - three pinned figures for a wing fitted with nothing else
  (City E handling 43 to 42 and 47 to 45; the Wagon R and FD lap tables). They pinned what a wing
  was worth while a wing was exempt from this model, and ruling 2 deliberately ends that
  exemption. What each test is FOR is unchanged and still asserted.
- `packages/content/tests/economyApprovalGate.test.ts` - the economy hash re-pinned in the same
  change as the recorded approval, with the full ledger entry.

### Content moved with it

`storyMissions.json`, `the-column-clock`'s `lapTimeCeiling.maxSeconds` **125.7 -> 125.8**. A
formula-derived threshold, re-derived from a fresh `storyMissionProbes.test.ts` run: its probe
fits street tyres to an AE86 with stock brakes, steering and chassis, so it laps a tenth slower
and the ceiling derived from it rises with it. `under-one-fifteen` holds, every taste-match
multiplier holds, and every payout and budget cap holds.

Both `advanceDay` golden hashes were re-run and **held unchanged**, as did `balanceProbes` and
`valueModelProbes`. `damagePatterns.json` and `partPricing.json` are untouched.

`pnpm typecheck` clean across content, sim and game (directive 20 carve-out: new schema field and
new exported symbols).
