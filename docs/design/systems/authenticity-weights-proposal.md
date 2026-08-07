# Per-slot authenticity weights: a proposal

**Status: IMPLEMENTED AS PROPOSED (Sprint 151), NOT SIGNED.** All 29 weights below are live in
`parts-taxonomy.json`'s `statWeights.authenticity` column, exactly as tabled. They are
preliminary figures accepted as sane defaults; `sprint151.md` records them as the values
implemented rather than approved under directive 22, so a later pass can move them. Sections 3
and 4 below (the structural findings and the calls this document is least confident about)
remain open exactly as written. Serves
`desirability-system.md` section 3, which specifies

    stockness = sum(weight_s * isStock(s)) / sum(weight_s)   over every slot s

and lists the 29 per-slot weights as the one piece of authoring it still needs. The weights are
consumed exactly like the existing `statWeights.style` column: `weightedBandFactor`
(`packages/sim/src/derivedStats.ts`) skips any slot whose weight is 0 and takes a weighted mean
over the rest.

The question each number answers: **how much does this part being non-original matter to whether
the car is authentic?** The judge is a purist inspecting the car in 1990s Japan.

---

## 1. The weights

They total **100** on a forced-induction car, so `stockness` reads directly as a percentage of the
authored weight a car has kept. That is a convenience for review, not a requirement; the weights
are relative and any scale works. An NA car's `forcedInduction` slot is legitimately absent and
drops out of both sums, so its total is 97.

### The heart and the skin (48 of 100 across four slots)

| slot | weight | why |
| --- | ---: | --- |
| `block` | **18** | Numbers matching. The stamped block is the car's identity, and a swapped one is close to disqualifying. |
| `paint` | **11** | Original paint cannot be put back. A resprayed car is a different object to a purist. |
| `bodywork` | **11** | Original steel. Replaced wings and a filled quarter show up under a torch forever. |
| `internals` | **8** | Forged rods and pistons mean the engine is no longer the one the car left the factory with. |

### Significant (35 of 100 across seven slots)

| slot | weight | why |
| --- | ---: | --- |
| `aero` | **10** | A kit, a wing or a splitter is the loudest possible statement that the car is not original. |
| `rims` | **7** | Original wheels are the single most-noticed spec item on any car; a purist clocks them across the car park. |
| `headValvetrain` | **6** | A swapped head changes what the engine is, not just how it is set up. |
| `gearbox` | **6** | The second numbers-matching item, and the one most often quietly replaced. |
| `camsTiming` | **4** | Aftermarket cams are the classic first betrayal of a standard engine. |
| `seats` | **4** | Buckets are the most-noticed interior change, and the original trim rarely survives the swap. |
| `forcedInduction` | **3** | A hybrid turbo is a serious deviation where the slot exists; low only because it competes with the block above it. |

### Noticed, then shrugged at (17 of 100 across eleven slots)

Ten of these are 1. The point of the band is that a great many things are a demerit rather than a
problem, and eleven of them together still cost a car less than its block alone.

| slot | weight | why |
| --- | ---: | --- |
| `springs` | **2** | Lowering springs are a permanent, visible change to how the car sits. |
| `steering` | **1** | A rack is a rack. The wheel is the only bit anyone looks at, and it is a five-minute reversal. |
| `chassis` | **1** | Seam welding is irreversible, but it is also invisible and nobody counts it. |
| `differential` | **1** | An LSD or a welded diff is a real change that cannot be seen from outside. |
| `dampers` | **1** | Dampers wear out. Every honest 25-year-old car has had shocks; coilovers are still a demerit. |
| `brakeCalipersLines` | **1** | Braided hoses are servicing. A four-pot conversion behind an open wheel is noticed, barely. |
| `underbody` | **1** | Underseal and arch liners are maintenance; the weight is here so a rusty floor reaches the condition factor. |
| `exhaust` | **1** | Exhausts rot through on their own, so a replacement is expected. A loud silencer is still heard. |
| `ignitionEcu` | **1** | Plugs, leads and a cap are service items. A piggyback box is a mod, and a small one. |
| `intake` | **1** | A cone filter on a standard manifold is the cheapest, most reversible modification there is. |
| `dashGauges` | **1** | A boost gauge in a pod is visible and means nothing. |

### Zero (seven slots)

Originality is not a real concept for these. Note the second effect, which is deliberate: a weight
of 0 also removes the slot from `weightedBandFactorForStat(..., 'authenticity', ...)`, so these
parts' **condition** stops feeding authenticity too. That is correct. A bald tyre, a glazed clutch
and a furred radiator say nothing about whether a car is the car it claims to be.

| slot | weight | why |
| --- | ---: | --- |
| `tyres` | **0** | Original tyres would be perished and dangerous. Nobody expects them, nobody wants them. |
| `brakePadsDiscs` | **0** | Friction material is consumed by use. Already `repairable: false` in the taxonomy. |
| `clutch` | **0** | A wear item, and `repairable: false`. Every honest car has had one. |
| `cooling` | **0** | Radiators, hoses, thermostats and water pumps are service items on any car this age. |
| `fuelSystem` | **0** | Pumps, filters and rubber lines perish. Replacing them is maintenance, not modification. |
| `driveline` | **0** | Boots and universal joints are service items; a propshaft is a propshaft. |
| `antiRollBars` | **0** | Invisible, bolt-on, and reversible in an afternoon. The purest example of a slot nobody counts. |

### Copy-paste list

```
block 18   paint 11   bodywork 11   aero 10   internals 8   rims 7
headValvetrain 6   gearbox 6   camsTiming 4   seats 4   forcedInduction 3
springs 2
steering 1   chassis 1   differential 1   dampers 1   brakeCalipersLines 1
underbody 1   exhaust 1   ignitionEcu 1   intake 1   dashGauges 1
tyres 0   brakePadsDiscs 0   clutch 0   cooling 0   fuelSystem 0
driveline 0   antiRollBars 0
```

29 slots. Sum 100.

---

## 2. Cross-checks

All three assume `conditionFactor = 1` (every part mint) and `machiningCost = 0` (no machining
system exists yet), so `authenticity = round(100 * stockness)`.

### Check 1: the consumables car

A car whose tyres, brake pads and clutch have been replaced with aftermarket parts.

    lost   = 0 (tyres) + 0 (pads) + 0 (clutch) = 0
    stock  = (100 - 0) / 100 = 1.000
    result = 100

Widening it to everything a sane owner replaces without apology (add a radiator, a fuel pump and a
propshaft: `cooling` 0, `fuelSystem` 0, `driveline` 0) leaves it at **100**. The strictest possible
reading, counting `dampers` (1) as a service item too, gives 99/100 = **99**.

Essentially authentic, as required.

### Check 2: the engine swap

Three readings, because "swapped engine" is not one thing.

**Block alone, everything else original:**

    lost   = 18
    stock  = (100 - 18) / 100 = 0.820
    result = 82

**The long block** (`block` 18, `internals` 8, `headValvetrain` 6, `camsTiming` 4):

    lost   = 36
    stock  = (100 - 36) / 100 = 0.640
    result = 64

**A real swap**, which always drags its ancillaries with it (long block 36, plus `intake` 1,
`exhaust` 1, `ignitionEcu` 1, `fuelSystem` 0, `cooling` 0, `forcedInduction` 3):

    lost   = 42
    stock  = (100 - 42) / 100 = 0.580
    result = 58

The same swap into an NA car, where `forcedInduction` is absent from both sums (T = 97, lost 39):
58/97 = 0.598, **60**.

Badly compromised: 21 to 27 points below `concoursSaleMinAuthenticityPercent` (85) and about 30
below the collector's 0.90 target at importance 1.00. Not annihilated, which is right: the shell,
the paint, the interior and the chassis are all still the original car.

**`block` at 18 is calibrated on this check.** A block swap and nothing else must fail concours by
itself, which needs the block to own more than 15 per cent of the total. 18 clears that with three
points to spare.

### Check 3: the bodykit car

**As stated in the brief** (aftermarket `aero` and `rims`, drivetrain untouched):

    lost   = 10 (aero) + 7 (rims) = 17
    stock  = (100 - 17) / 100 = 0.830
    result = 83

**As a player actually builds it** (a stance build: `aero`, `rims`, `springs`, `dampers`, `seats`):

    lost   = 10 + 7 + 2 + 1 + 4 = 24
    stock  = (100 - 24) / 100 = 0.760
    result = 76

Clearly modified, not destroyed. Both readings fail the 85 concours gate and both miss the
collector, while sitting 18 to 25 points above the swapped car. See section 3.4 on how tight the
83 is.

### For reference: a full tuner build with the body left alone

Every engine, drivetrain, suspension, wheel and interior slot non-stock; `paint`, `bodywork`, `aero`
and `underbody` untouched. Lost 67, **stockness 0.33**. The 33 points left are exactly the four body
slots, which is a clean read: what a tuner keeps of a car's authenticity is its skin.

---

## 3. Structural findings the maintainer should see before signing

### 3.1 `paint` can never be non-stock today

`packages/content/data/parts.json` has no aftermarket SKU for it at any of the four fitment
classes: `paint` holds `stock-paint` and its three fitment-class siblings and nothing else.
`bodywork` and `underbody` shared this gap when the weights were written and no longer do; both now
carry a street, sport and race ladder and read as modified correctly.

So **11 of the 100 points can never be lost to modification.** That weight is not dead: the same
column drives the authenticity condition factor, where it is load-bearing and correct, and rough
paint, dented panels or a rusty floor should sink a car's authenticity harder than anything else on
the list. But it does mean the brief's strongest claim, that a resprayed car is a different object,
**is not currently expressible**: a respray reads as fully original.

Fixing that is a content job (a non-stock paint or panel grade, or a `resprayed`/`replaced` flag on
the fitted part), not a weight change. Flagging it, not solving it.

### 3.2 `aero` no longer carries the whole visible-body signal

`aero` was the only slot a visible body modification could land on. `bodywork` (11) and `underbody`
(1) now carry ladders of their own, so a visible modification lands on three slots and `bodywork`
outweighs `aero`. Aero's 10 is high for what is, in the abstract, a bolt-on. I have still kept it
below `paint` and `bodywork`, because the brief's ordering is explicit and the weights should say
what is true rather than what today's SKU catalogue can express.

### 3.3 `chassis` is `removable: false` but has non-stock SKUs

Seam-weld, sport and tube-chassis kits exist at street/sport/race grade. Removal is refused
(`jobs.ts`, `removeBlockReason`), but installation appears not to be gated the same way. Worth
confirming; if a chassis kit can be fitted, the weight of 1 is live, and if it cannot, it is inert
on the stockness axis in the same way as 3.1.

### 3.4 The 85 gate leaves only 15 points of headroom, and every weight competes for it

Concours at 85 means a car may lose 15 per cent of its authored weight and no more. That is a high
bar, and it makes the two interesting checks land close to the line by construction: block alone at
82, kit and wheels at 83. Neither margin is comfortable, and they pull against each other through
the shared denominator, so making one safer makes the other tighter.

I think that is the gate doing its job rather than a fault in the numbers, and I have not contorted
the weights to widen it. If the maintainer wants more daylight, the honest lever is
`concoursSaleMinAuthenticityPercent` itself (economy content, directive 22, needs signing by name),
not a redistribution of the weights.

---

## 4. The calls I am least confident about

1. **`clutch` = 0.** It is a wear item and the taxonomy already marks it `repairable: false`, but a
   twin-plate race clutch is a genuine modification, not a service. **1** is the alternative I would
   accept without argument.
2. **`rims` = 7.** Original wheels genuinely matter enormously to purists, and equally they are the
   most trivially reversible thing on a car. 7 is high for a bolt-on, and it is partly there to make
   check 3 land below 85. It is the number most obviously doing two jobs.
3. **`gearbox` = 6.** Numbers-matching gearboxes are a European-classic obsession; on 1990s Japanese
   cars far fewer people care. **4** is defensible.
4. **`driveline` = 0 and `antiRollBars` = 0** are the two zeros I would most readily concede to 1.
   Both are close calls against `differential` and `dampers`, which I gave 1.
5. **`cooling` = 0 and `fuelSystem` = 0** remove those slots from the authenticity condition factor
   as well. I think that is right (a radiator's condition says nothing about originality) but it is
   a second-order effect worth naming rather than discovering later.
6. **`seats` 4 against `dashGauges` 1.** Buckets are far more noticed than a gauge pod, so the gap
   is right, but neither number captures the real provenance issue behind a swapped instrument
   cluster, which is the odometer. That is a different mechanism, not a weight.
