# The tool ladder: three rungs, three claims

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

**The resolution, maintainer 2026-08-04: every rung gets its own claim.**

| tier | reach | parts it can fit | capability |
| --- | --- | --- | --- |
| **1** | fine | stock, street, **sport** | ordinary work, just slower |
| **2** | **mint** | **+ race** | do it properly |
| **3** | mint | + race | **work nobody else in town can do** |

**Grade gates on tool tier, and that is one small table rather than per-part authoring.** Every SKU
already carries a `grade`, so the whole rule is:

```
{ stock: 1, street: 1, sport: 1, race: 2 }
```

No 600-part sweep, no new field on a SKU, and it cannot drift because it reads the grade that
already decides everything else about a part.

**It also creates a progression nobody had to design.** The cheap tool lines gate the cheap thrills:
suspension tier 2 is 250,000 and wheels 350,000, so race handling parts arrive early, while engine is
600,000 and drivetrain 900,000, so race power arrives late. **A player naturally builds a car that
turns before one that pulls**, which is the right order and falls straight out of prices that already
ship.

**No conflict with the first law.** Tier 1 of every line is owned from day one and basic work stays
possible in every discipline. Fitting a race differential was never basic work.

**Tier 3 is then where the cool non-standard work lives.** Not a better finish, and not better parts:
different work.

## The tool lines already named their own answer

This is the useful part. Each line's tier 3 is already named for what it should unlock, so most of
this is authoring rather than inventing.

| line | tier 3, as it already ships | price | unlocks |
| --- | --- | ---: | --- |
| **engine** | Machine-shop tooling | 1,500,000 | machining, NA-to-turbo. **Already stocked** |
| **drivetrain** | Driveline rebuild bench and press | 1,800,000 | custom ratios, dog-box conversion |
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

Covered by the grade rule above rather than by anything bespoke: race gearboxes and differentials
need the press because **all** race parts need their line at tier 2.

What is left for drivetrain tier 3 specifically is the work rather than the parts: **custom ratios
and dog-box conversion**, which is also a scene craft operation and therefore wants both the tool and
the standing.

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

## Rulings, maintainer 2026-08-04

**Race grade gates on tier 2, and the early game should not be dealing in race parts.** Approved as
drawn.

**Race parts you cannot fit can be REMOVED but not INSTALLED.** So a bought car or a stripped donor
can hand you parts beyond your tools: hoard them for later or sell them. Needs copy that makes the
refusal read as a shop's honest limit rather than a rule.

**Standing ungates the tool.** A tier-3 machine on its own performs no craft operation. Standing in
the scene is the key that opens what the machine can do, and the machine is what performs it. Both
are required and neither substitutes for the other, which keeps the ladder
`t1 < t1+craft < t2 < t2+craft < t3 < t3+craft` intact.

**The cage's taste shape and the cost of straightening a shell take sane defaults**, tuned after
play rather than argued now.

## Open questions

1. **Does gating race grade on tier 2 change the early game too much?** Today any part is fittable
   the moment it is affordable. This is the only thing in the design that takes something away, and
   it takes it away across every line at once rather than just the drivetrain.
2. **Do craft operations need the tool AND the standing?** Coherent, and it makes both ladders matter,
   but it is a ruling.
3. **The roll cage's taste shape.** How much it helps Racers and Touge, how much it hurts Daily
   Drivers.
4. **What saving a severity-4 shell costs**, and whether generation changes now that such a car is
   worth buying.
5. **Does gating race grade on tier 2 need a grace period?** A player who buys a car with race parts
   already fitted, or pulls race parts from a donor, holds parts they cannot yet fit. Selling them is
   the obvious answer and is probably enough, but it should be a decision rather than a discovery.
