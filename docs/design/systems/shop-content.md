# What the three shops do: the capability gate, and the work above it

**Status: PROPOSAL, unsigned. Nothing here is built.**

Sprint 190 gave the tool ladder three shops at the top and left them thin. This is the proposal for
what hangs off them, and for the one thing that must exist first.

Every claim below is measured against the shipped tree. Where a previously-recorded design turns out
to be wrong, this document says so and says why.

---

## Part 1: the capability gate, which is step one

### The contradiction that has to be resolved first

`tier-three-unlocks.md` says two incompatible things. Build a gate where *"a part or an operation
declares the line and tier it needs"*; and, of the grade rule, *"no 600-part sweep, no new field on
a SKU"*.

**The facts decide it.** `parts.json` is **580 hand-authored rows with no generator** (the only
derived field is `priceYen`, computed at load from `partPricing.json`). A required new field is a
580-row manual edit. And every one of the five existing gates already reduces to the same
expression:

```
toolLevelsFor(state, context)[group] >= level
```

They differ only in how they derive the pair.

**So the part declares nothing. A rule table derives `(group, level)` from what a part already
carries.** Grade, `carPartId`, `zoneId` and the car's own state are enough for every rule anyone has
proposed. The grade rule then costs zero rows, widebody costs zero rows, and there is one refusal
type instead of five.

### The shape

One function, in sim:

```
partCapabilityRequirement(part, car, state, context) -> { group, level } | null
```

It composes the rules in order and returns the first that binds:

| rule | derives from | requires |
| --- | --- | --- |
| grade ladder (signed 2026-08-04, unbuilt) | `part.grade` | that part's own line at the table's level |
| NA to turbo (built, bespoke today) | `carPartId === 'forcedInduction'` and the car is factory-NA | engine at 3 |
| widebody (proposed below) | `part.zoneId != null` and `part.grade` above a threshold | body at 3 |

The existing bespoke checks collapse into it. Nothing new is expressible that was not expressible
before; five mechanisms become one.

### Where it must be wired, and the two holes nobody has noticed

There are **three** install paths, and only one of them runs `installFitGate`:

| path | what it fits | gates it runs today |
| --- | --- | --- |
| `installFitGate` (`jobs.ts:1022`) | ordinary slot parts | scrap, slot, ownership, NA-to-turbo, blocked-by |
| `resolveSwapAssemblyMember` (`assemblies.ts:428`) | bench members, including tyres | fitment class, slot, scrap, the wheels tyre gate |
| `resolvePipelineInstallPanelAction` (`stagedWork.ts:489`) | **all 144 zone panels** | zoneId and fitment class. **No capability gate of any kind** |

**A gate wired only into `installFitGate` misses widebody entirely**, because a zone panel never
goes near it. All three need the one check.

Two further constraints, both load-bearing:

- **Bots call `installFitGate` directly** (`advanceDay.ts:128-131`), not through `findOrCreateJob`.
  A gate placed in the wrong one of those two silently exempts every bot.
- **The UI filters ungated parts out of the list.** `installablePartsForPart` drops anything failing
  `partFitsCar`. `tier-three-unlocks.md` requires the opposite: *"everything is visible before it is
  reachable... a tier-3 part shows in the shop with the tool it needs, named."* That is a UI shape
  change, not a copy change, and it is the whole point: a part you cannot fit yet is an advert for
  the shop that fits it.

### Why not `requiredTags`

It cannot be reused, for three independent reasons. Its values are `TagSchema`, a closed enum of
**platform** facts (layout, induction, era, origin) shared with `CarModel.tags`, buyer preferences
and event suitability, so widening it for tools widens all of those. It is checked against the CAR,
inside `partFitsCar`, which takes no `GameState`. And failing it produces `part-does-not-fit`, which
the UI uses to **hide** a part rather than refuse it.

It is used by **0 of 580 SKUs**, and that is deliberate rather than an oversight: the codebase chose
to let a turbo go onto an NA car and gated the interesting half on tools instead.

---

## Part 2: the machine shop needs nothing

Eleven machining operations plus NA-to-turbo conversion. It is the one shop that was always
stocked. **No content proposed.**

---

## Part 3: the body and trim shop

### 3a. Widebody is not missing content, it is a broken feature

**The over-fenders already ship.** 144 zone-scoped panel SKUs, four grades across nine zones and
four fitment classes, with authored style points: street 5, sport 9, race 12. Real names, real
prices, real art direction.

**Their style points can never reach a car.** The chain, every link measured:

1. `partFitsCar` refuses any SKU carrying a `zoneId` outright (`parts.ts:74`).
2. The only non-zone `panels` SKUs are four stock carriers with `style: 0`.
3. `stylePercentOf` sums `car.parts[partId].installed` only (`derivedStats.ts:276`).
4. The panel install path writes to `car.zoneState[zoneId]` and never to
   `car.parts.panels.installed` (`stagedWork.ts:518`), recording only `panelGrade`.
5. `bodyPipeline.ts:145` states it outright: *"every non-stock panel SKU is zone-scoped and can never
   reach `car.parts.panels.installed.partId`"*.

**So fitting a full carbon widebody today does exactly two things: it forfeits the `panels` slot's
11 authenticity points, and it drops the paint band until resprayed.** All cost, no gain. The style
the SKUs were authored with is unreachable.

**And a test is passing on a build the game cannot produce.** `style.test.ts:38` picks the
highest-style SKU per `carPartId` **without filtering `zoneId`** and force-installs it, so the
"a fully dressed mint car scores exactly its own `styleCeiling`" assertion holds on a car no player
can build. `docs/carstats/style.md:84` lists the panels ladder as live for the same reason.

**The proposal: make zone panel grade reach style.** `stylePercentOf` already walks the car; it
gains a term summing the nine zones' `panelGrade` against the same authored ladder. No new SKU, no
new slot, no new schema field, and the 144 SKUs stop being decoration.

**Then gate it.** Sport and race zone panels require **body at level 3**. That is the widebody
unlock, it costs zero authoring rows, and it uses the gate from Part 1 at the exact path that has no
gate today.

**This is the strongest item in this document**: it converts a live defect into the body shop's
headline feature, and the content already exists.

### 3b. The chassis jig, as previously designed, should be cut

`tier-three-unlocks.md` pitches it as rescuing a written-off car. **There is no written-off car.**

- Severity 4 is already fully recoverable by any tier-1 shop that can buy a panel. A stock panel
  ships for all nine zones in all four classes and is listed in the market.
- The jig would save **¥2,600 (entry) to ¥25,400 (flagship)** and cost **four extra labour points**.
  On an entry car the weld route costs more in materials than the panel it replaces.
- It fires on almost nothing: upper bound about 5 per cent of entry cars, 0.1 per cent of flagships,
  and Law 2 walks most of those back before the lot ships. The one shipped measurement is
  **1 car in 1,560**.
- **The doc's build estimate is wrong.** It claims the jig is *"a gate on a clamp that already
  exists (`clampRepairTarget`, `repairCeilingForLevel`)"*. Neither function is reachable from any
  zone code path; body-derived carriers are skipped before they get there (`bands.ts:445`). The real
  change threads a new argument through the stage planner **and** `zoneNeedsPanel`, which is
  deliberately the single shared gate for the planner, the repair bill and the workshop
  affordances, so it moves all three at once.

**Cut it.** A discount on one car in 1,560, costing a three-way change to a deliberately-shared
gate, is not a shop's headline feature.

### 3c. What a chassis jig should be instead, if it is built at all

There **is** a genuinely unrecoverable state, and nothing tells the player about it.

`chassis` is `removable: false`, so it can never be pulled. `canRepair` refuses anything at `scrap`.
**So a scrap chassis is permanently unfixable.** It carries no `scrapDisablesCar`, so the car still
runs; it simply drags reliability (weight 2) and originality (weight 1) forever with no route out
and no copy explaining why.

That is what a jig should fix, and it is a real rescue rather than a discount: the tier-3 body shop
would be the only thing in the game that can repair a scrap chassis.

**Open, and it decides whether this is real: can a chassis actually generate at `scrap`?** If it
cannot, this dies with 3b and the body shop rests on widebody alone. Establish before proposing.

### 3d. The roll cage

**Expressible today with no new mechanism**, and there are two homes:

**As a `chassis` SKU.** The precedent ships: `namazu-tube-chassis-kit` is a race chassis carrying
`physicalModifiers.grip: 1.05`, the largest grip modifier in the catalogue. A cage would sit beside
it.

**As a machining operation.** `MachiningOperationSchema` is the richest lever in the game: one
entry moves `powerFraction`, `spec`, `handlingFraction`, `style`, `reliabilityConditionBonus` and
`authenticityCost`, and `race-prep` on `dampers` is exactly this shape today. A cage-as-operation
needs **no schema change at all**, only an entry in `economy.json`.

**But the design intent does not survive contact with the model.** `tier-three-unlocks.md` wants a
cage to *"make the car worse to live with... help Racers and Touge and actively hurt Daily
Drivers"*. Measured:

- **A cage cannot add mass.** `PhysicalModifierSchema.mass` is `.max(1)` by schema, with the reason
  stated in the code: a below-1 modifier would get *better* as it wears. Weight-adding is not
  expressible.
- **A cage on `chassis` costs almost no authenticity.** That slot's weight is 1 of 99, so roughly
  one point. Invisible to everyone including the Collector.
- **No buyer reads a part.** Buyers read the five derived stats, `model.spec.culture` and
  `model.tier`. A cage cannot be disliked *as a cage*, only through a number it moved.

**So as things stand a cage is a strict upgrade with no downside**, which is precisely what the
design says it must not be.

**The mechanism that would make it a real decision already exists and is unauthored.** `upper` on
a `StatTaste` is the point past which a stat starts working against the buyer, and the schema doc
names this exact case: *"a caged race car putting off a Daily Drivers buyer"*. It ships on **power
only**, at 0.55, for daily-drivers and touge. It is unauthored on handling, style, reliability and
authenticity for every buyer.

**So the cage proposal is: a `chassis`-slot part carrying grip, plus an authored `upper` on
handling for daily-drivers.** The second half is a `buyers.json` lever and needs signing. Without
it, the cage is a stat stick and the "who are you building for" framing is words.

### 3e. Underglow is an operation, not a part

An earlier draft of this document proposed cutting it, on the grounds that it needs a slot and that
adding a slot re-scales `stocknessOf`'s denominator for every car in the game. **That was the wrong
frame: it only needs a slot if it is a part.**

It is not a part. Nothing is fitted that the game needs to track the condition of, sell separately,
or reason about the originality of. It is work done to a car.

**So it is an operation**, and the mechanism is already there:

- `MachiningOperationSchema` carries `style` directly. `show-fitment` is exactly this shape today,
  giving 5 style points on `rims`.
- `performedOn: 'fitted-part'` means it happens on an assembled car, like `corner-weighting` and
  `show-fitment`, so it appears on the car's own screen rather than at a bench.
- **The tool gate falls out for free.** `craftOperationCapabilityGateReason` derives the required
  line from `partsTaxonomyById[operation.carPartId].group`. Target `chassis`, whose group is `body`,
  and the operation gates on the body and trim shop with no wiring at all.

**Cost: one entry in `economy.json`.** No schema change, no new slot, no SKU, no denominator move,
no migration.

`chassis` is the right target on its own terms: underglow mounts to the underside of the shell, and
the operation is work done to that shell.

**Two things to settle when it is authored**, both of which are the usual per-operation questions
rather than new design:

- **Its `authenticityCost`.** Non-zero: a lit-up underside is not how the car left the factory. Small,
  in the current 0 to 1.0 band.
- **Its `style` points.** It should read against the authored ladder, where the top of the catalogue
  is a race wing at 18 and `show-fitment` gives 5.

**One naming problem, flagged not fixed.** The array is `economy.machining.operations`, and
underglow is not machining. Neither is `corner-weighting` (scales under a car) nor `show-fitment`
(rolling arches). The array has already outgrown its name; renaming it is churn and belongs in
whatever change next touches that block, not here.

---

## Part 4: the chassis shop

Four operations today (`race-prep`, `corner-weighting`, `show-fitment`, `sorting`) and no proposal
in `tier-three-unlocks.md` beyond two names: custom ratios and dog-box conversion.

**Honest position: I do not yet have a mechanically grounded proposal for this shop.** A dog box
makes a car accelerate faster between shifts, and the performance model has no gear-shift term to
hang that on; the nearest expressible thing would be `powerFraction` on `gearbox`, which would be
lying about what the part does. The grade rule (race parts need their line at rung 2) gives the
shop's three lines something, but that is the ladder working, not shop content.

**What it probably wants is the aero grade above `race` that `car-performance/README.md` records as
deliberately open** (mechanical grip tops out around 1.25 and the rest of the range is reached
through aero, so the missing rung is the missing top of the whole grip scale). That is a physics
question, sits in the wheels/suspension family, and is the one thing that would make the chassis
shop the top of a real ladder.

Recorded as open rather than filled with something that sounds plausible.

---

## Summary of what is proposed

| item | shop | status | cost |
| --- | --- | --- | --- |
| the capability gate | all | **step one, nothing works without it** | sim + 3 wiring sites + a UI shape change |
| widebody reaches style | body and trim | **strongest item, fixes a live defect** | one term in `stylePercentOf`, zero rows |
| the grade rule | all | signed 2026-08-04, unbuilt | one content table, zero rows |
| roll cage | body and trim | needs one `buyers.json` lever to be a real decision | one SKU family plus an `upper` |
| chassis jig, as designed | body and trim | **cut** | n/a |
| chassis jig, as a scrap-chassis rescue | body and trim | open, blocked on one measurement | unknown |
| underglow | body and trim | **proposed as an operation, not a part** | one `economy.json` entry, no schema change |
| the chassis shop's own content | chassis | **open, no honest proposal yet** | unknown |
