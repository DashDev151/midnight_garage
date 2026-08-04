# Tier 3: where the interesting work lives

**Status: DESIGN, unsigned.** Nothing here is built. Raised 2026-08-04 out of the scene-standing
arc, when the tool ladder turned out to have a rung that bought nothing.

## The problem it solves

`economy.repairBandCeilingByTier` is `{1: "fine", 2: "mint", 3: "mint"}`. **Tier 2 already reaches
mint, so tier 3 buys no quality at all.** Everything it adds today is elsewhere: labour per band step
(5 / 4 / 3) and exactly two capability unlocks.

So the maintainer's intended ladder cannot exist as a single scale:

```
tier 1  <  tier 1 + craft  <  tier 2  <  tier 2 + craft  <  tier 3  <  tier 3 + craft
```

**The resolution: tier 3 stops claiming reach and claims capability.** The ladder is two-dimensional
and that is fine:

| | |
| --- | --- |
| **Reach** (how good a finish) | tier 1 < tier 2 = tier 3 |
| **Capability** (what work is possible) | tier 1 = tier 2 < **tier 3** |

**Tier 3 is where the cool non-standard work lives.** Not a better finish: different work.

## The tool lines already named their own answer

This is the useful part. Each line's tier 3 is already named for what it should unlock, so most of
this is authoring rather than inventing.

| line | tier 3, as it already ships | price | unlocks |
| --- | --- | ---: | --- |
| **engine** | Machine-shop tooling | 1,500,000 | machining, NA-to-turbo. **Already stocked** |
| **drivetrain** | Driveline rebuild bench and press | 1,800,000 | race-grade gearbox and differential work |
| **suspension** | Drive-on alignment lift | 400,000 | geometry: extended lock, custom alignment |
| **wheels** | Laser alignment and balance rig | 350,000 | aggressive fitment: extreme offset, stretch |
| **body** | Spray booth and **chassis jig** | 1,400,000 | **straightening a bent shell**, widebody fabrication, underglow |
| **interior** | Full trim shop | 700,000 | roll cage, full retrim |

## The thing that has to be built first

**There is no general tool gate on parts, and every existing gate is bespoke.**

- `requiredTags` on a part gates on the CAR's tags (`model.tags`), not on tools, and **no shipped SKU
  uses it at all**.
- Machining gates on `machining.minEngineToolTier`, checked inside the machining flow.
- NA-to-turbo gates on `toolCeilings.naToTurboConversionEngineTier`.
- Body work gates through `bodyLineCapability` and `hasMachineLineFor`.

Three different mechanisms for one idea. **Build one general capability gate** - a part or an
operation declares the line and tier it needs, and one check answers it everywhere - and most of the
table above becomes authoring. Doing it six more bespoke ways is how this ends up unmaintainable.

## The six, in detail

### Body: straightening a bent shell

**The best idea in the set, and the cheapest.** `MAX_REPAIRABLE_METAL` is 3, so metal severity 4
means beyond saving: the panel must be replaced and a shell that bad is effectively written off.

**A chassis jig should make severity 4 repairable.** That turns a written-off car into a project only
a tier-3 body shop can take on, which is exactly what a jig is for and exactly the kind of work
nobody else in town can do.

It is a gate on a clamp that already exists (`clampRepairTarget`, `repairCeilingForLevel`), not a new
system.

### Body: widebody, and underglow

**Widebody is a gate on fitting, not a new part.** Over-fenders already ship as sport and race panel
SKUs on all four corners from the zone-model work. Tier 3 gates fitting them.

**Underglow returns here.** It was cut when `underbody` was deleted, precisely because it had no
home. This is the home.

### Interior: the roll cage

A cage adds rigidity and weight, and **makes the car worse to live with**. That is the point: it
should help Racers and Touge and actively hurt Daily Drivers, so fitting one is a decision about who
you are building for rather than a strict upgrade.

The one genuinely new part in this design, and the one with the most interesting taste authoring.

### Drivetrain: the race driveline

Race-grade gearbox and differential work needs the press. **This is a behaviour change**, not just an
addition: today any part is fittable the moment it is affordable, so gating race parts stops a
player skipping straight to them.

### Suspension and wheels: geometry and fitment

Extended lock and custom alignment (suspension), extreme offset and stretch (wheels).

**These overlap with the scene arc's craft operations by design.** Corner weighting is a Touge
operation and it wants the drive-on lift; show fitment is a Show Crowd operation and it wants the
balance rig. **Both conditions, deliberately: the standing says you know how, the tool says you can.**
That interaction needs ruling on rather than assuming.

## Cut, and deferred

**NOS is cut.** Its entire appeal is moment-to-moment - ten seconds, on the straight - and this game
has no driving and treats power as a static number. It would render as a worse turbo with a better
name.

**Engine swaps are deferred to their own sprint.** Iconic enough to be worth building, but a swap
changes the car's engine spec, which the locked performance model treats as per-car identity. That
touches the model rather than sitting on top of it.

## Everything is visible before it is reachable

**Already the house style, not a new rule.** The progression bible's law 5 is that every gate is a
named real thing, and the tool wall already shows the reputation a purchase needs whether or not it
is met.

So: a tier-3 part shows in the shop with **the tool it needs, named**. A bent shell shows as
straightenable-by-somebody rather than as scrap. Seeing the widebody you cannot fit yet is what makes
1,400,000 yen read as a goal rather than a receipt.

## Open questions

1. **Does gating race-grade drivetrain parts change the early game too much?** Today any part is
   fittable when affordable. This is the only item here that takes something away.
2. **Do craft operations need the tool AND the standing?** Coherent, and it makes both ladders matter,
   but it is a ruling.
3. **The roll cage's taste shape.** How much it helps Racers and Touge, how much it hurts Daily
   Drivers.
4. **What saving a severity-4 shell costs**, and whether generation changes now that such a car is
   worth buying.
5. **Should tier 2 get capability unlocks too**, or is capability strictly a tier-3 claim? As drawn,
   tier 2's whole claim is reaching mint.
