# Paint

**Status: BUILT.** The colour pool landed as Sprint 169 and the system as Sprint 170. This document
is the design of record and describes what the game does.

## The gap this closed

`paint` was the only slot in the game with no aftermarket SKU at any fitment class. Its twelve
finish SKUs were retired when the derived body carriers landed, and nothing replaced them.

So paint was **pure subtraction on two stats at once**:

- **11 of authenticity's 100 points** could never be lost. A resprayed car read as wearing its
  factory colour, because `stocknessOf` asks whether the fitted SKU is `grade: 'stock'` and the only
  `paint` SKU there was, was stock.
- **2 of style's 14 condition weight**, which is 14.3 per cent of the whole number, could only ever
  drag style down. Bad paint cost a car an eighth of its style and a respray could never win a point
  back.

A player could spend a week making a car's paint perfect and the game would not notice it was better
than the day they bought it, only that it was no longer worse.

**What closed it needed no new formula.** `stocknessOf` was already right: it credits a slot only
when its fitted SKU is stock grade. Installing the correct paint SKU at generation, and swapping it
at the paint stage, delivers the whole mechanic. One gate carries it: the factory-correct job may
only be laid in the car's own colour.

## What paint should be

**Three separate facts about a car's paint, each doing one job.** They are independent and the
system is confused today because it only models one of them.

| fact | what it answers | today |
| --- | --- | --- |
| **condition** | is the paint in good order | modelled, on the `finish` axis |
| **originality** | is this the paint it left the factory with | not modelled |
| **finish quality** | how good a paint job is it | not modelled |

## Originality: what the car is wearing right now

**Authenticity asks what colour and finish the car is in, not what has been done to it.** A car
wearing its factory colour in a factory finish is original. Respray it in something else and it is
not. **Respray it back and it is again.**

That is a deliberate choice over the strictly truthful reading, which is that a respray is a respray
even in the correct shade. A one-way loss makes paint a dice roll the player is stuck with, and a
decision you keep making is better than one you lose once.

| the car is wearing | authenticity | style |
| --- | --- | --- |
| **factory colour, factory finish** | **full** | none |
| anything else | **reduced** | **raised** |

So the 11 points come alive and stay in play. Paint becomes the one part of a car whose originality
you can win back, which is worth having: everything else in the game is either irreversible
(machining) or needs the original part kept (fitting aftermarket).

### Two facts, and both are needed

**The model carries the pool it was sold in. The instance carries the one it left in.**

- **`spec.factoryColours`**, a list, authored per car for all 94 roster rows under directive 24.
  This is the real authoring cost of the feature and there is no way round it: without it a Honda
  Beat generates in Bayside Blue and the game calls that factory.
- **`CarInstance.factoryColour`**, rolled at generation from that pool. A model was sold in a dozen
  colours; a particular car left in one.

**A car can then arrive already resprayed, in any colour from the whole palette**, and that is the
case worth having. A Beat in Bayside Blue is perfectly possible, and it reads as exactly what it is:
somebody else's choice, on a car that is not wearing its own paint. A player who knows the cars
spots it on sight, and putting it back is real work with a real payoff.

That is the whole reason the pool has to exist. Without it there is no such thing as a wrong colour.

## Finish quality: the ladder, and where style comes from

The retired ladder came back as what a player chooses when they paint, on the grades that already
exist and already price themselves. The `Nurikabe` line carries it, and the grade is also the ramp
finish `rampFor` renders:

| grade | finish | authenticity | style | tin |
| --- | --- | --- | --- | --- |
| **stock** | factory-correct respray | **restores it, in the factory colour** | none | solid |
| street | straight respray | costs it | 5 | solid |
| sport | metallic | costs it | 10 | metallic |
| race | pearl | costs it | 15 | pearl |

The tin is charged **per zone**, so the grade scales with how much of the car is painted rather than
being a flat fee for choosing a finish.

**This is what gives paint a way up**, and it is the only reason anyone would pay for more than the
cheapest job. It is also what makes the choice interesting rather than obvious: the expensive paint
is the one that costs you originality, and the factory-correct job is the cheap one that gives no
style at all.

A restoration and a show car want opposite things from this slot, which is the point.

## Colour: what you choose, and what it costs

Colour is the other half of the same question. `paintColours.json` ships 34, each carrying an id, a
name, the shade brief the art works to, and the base hex its four-tone ramp is derived from.

**Repainting in the car's own factory colour, at stock grade, is the restoration.** Anything else
trades originality for style, and the trade is the same whichever colour is picked: the game does
not rank one colour above another.

**Whether buyers should prefer particular colours is deliberately out of scope.** It is a buyer-model
change rather than a paint change, it needs authoring against every colour and every archetype, and
paint was worth fixing without it. Worth revisiting once this has been played.

## The colours

The generic twelve were retired. Pearl White, Silver Mist, Gunmetal and the rest were a period
palette carrying none of what makes a colour matter, and a wrong colour only reads as wrong if the
right ones mean something.

**The 34 came out of research, then consolidation.** What each of the 94 cars was actually sold in
was researched and sourced first, because that is the only thing that makes a wrong colour read as
wrong and it cannot be invented. Roughly 480 researched names then merged hard: five near-identical
light blues across five manufacturers are one colour in a game rendered in a four-tone ramp. The
research is `docs/design/reference/colour-palette-consolidated.md` and the four
`factory-colours-*.md` files behind it; the pools themselves are canonical in the roster CSV.

**Every pool carries the confidence behind it**, in `factoryColoursBasis`, on the same footing
`priceStatus` sits beside `priceYen`. 54 of the 94 rest on a dated catalogue or a real list for that
car, 17 on real sources with named gaps, and 23 do not. Three cars could not be honestly authored
and say so rather than shipping an invention as research.

### The iconic names are a layer, not a colour

The 34 palette names are generic by construction ("Deep Blue", "Sand Beige") and carry no trademark,
so the naming layer does not touch them. The 37 iconic names are a separate table binding a real
name, a parody name, a colour and the cars that carried it, flipping through `NAMING_MODE` exactly
as brands do.

**That is why the binding is per car rather than per colour.** `blue-deep` on an R34 is Bayside
Blue; the identical ramp on an FD3S is Montego Blue. One colour, two names, decided by which car is
wearing it. The table is keyed on `uid`, never on roster number, because the roster is ordered by
price and inserting one car renumbers every row below it.

**The bar for those names is the copy bar.** A parody colour name is player-facing text on a car a
player already loves, so it has to be worth reading rather than merely legally distinct.

### A body colour is a ramp, not a swatch

Four tones, not one hex. `art-direction.md` excludes car bodies from the 24-to-32 environment
palette cap outright, because bodies use an indexed four-tone template with runtime palette
swapping, and arbitrary body colour is what that system was built for.

`rampFor` is the one place that rule lives: it derives shade and highlight from the base hex per
finish, so solid, metallic and pearl are the same colour rendered three ways rather than three
authored ramps.

**Quantise the grid rather than leaving it continuous**, for two reasons. It keeps the ramps
predictable for the art, and it lets a colour's **name derive from its coordinates** rather than
being blank. "Deep Blue", "Pale Green", "Vivid Orange" are readable in a listing, in a buyer's
want-line and in the copy; a hex is not, and the game's voice cannot describe a car as being
`#A3F2C1`.

## Generation: five states, never random per zone

**Most cars wear their own paint.** A respray is the exception and reads as one. Roster-wide the mix
is **70 original, 16 resprayed, 9 with a mismatched panel, 5 with a panel in primer**.

A car rolls **one of five whole-car states**. It never draws a colour per zone, and that is what
keeps clown cars out by construction rather than by luck:

| state | zones | paint SKU installed |
| --- | --- | --- |
| **original** | every panel zone the factory colour | stock |
| **resprayed** | every panel zone one other colour from the 34 | street |
| **mismatched panel** | factory colour, except one zone in a near neighbour from the same colour family | stock |
| **primed panel** | factory colour, except one zone bare, with no colour | stock |
| **factory two-tone** | both colours of the authored scheme | stock |

**A mismatch is always exactly one zone.** Three panels can never disagree. And the wrong panel is
always a family neighbour, so it is the wrong white rather than a random colour: `white` against
`white-ivory`, one silver against another.

A mismatched or primed panel leaves the car ORIGINAL in the authenticity sense, which is right: it
is still wearing its own paint, with one panel repaired badly. It loses through the paint band's
mismatch penalty and its finish, which is what those are for.

**A resprayed car always arrives at street grade**, a cheap solid job, so it has lost its 11
authenticity points and gained only 5 style. Metallic and pearl are what the PLAYER pays for.

**Which cars get resprayed is not uniform.** It follows `culture`, which the roster already
carries, so no new axis was needed:

| more likely | why |
| --- | --- |
| Front-drive tuner, Drift, Touge | the scene repaints cars, that is the whole point of it |
| Oddball | bought with the heart, kept the same way |

| less likely | why |
| --- | --- |
| Honest transport | nobody resprays a commuter, they just drive it |
| Kyusha, Exotic | originality is the value, and the owner knew it |

That gives the lot texture for free: the wrong-colour Civic is a common sight and the wrong-colour
Hakosuka is a story.

## The factory two-tone

Seven roster cars carry a genuine factory two-tone, and `derivePaintBand` penalises zones that
disagree on colour, so without an exception they would all read as damaged.

**A two-tone car's factory scheme is the SET of colours it legitimately wears**, and the mismatch
penalty does not fire while every zone colour is in that set. A single-colour car's set has one
member, so nothing else changed.

**Which panel takes which half is deliberately not modelled.** The research could not establish the
panel arrangement for most of the seven, and inventing one would be exactly the failure that
research spent its effort avoiding. Two-tone rendering is not attempted either.

## What this does not do

- **It does not change the `finish` axis or the body pipeline.** Condition already works and is a
  separate question from both colour and finish quality.
- **It does not make colour reach value directly.** Colour reaches money through style and
  authenticity, like everything else, and buyer colour preference is its own future thing.
- **It does not give a respray an arbitrary colour picker.** A repaint chooses from the same 34.
  The quantised hue, saturation and brightness grid, with a name derived from its coordinates, is a
  later thing and nothing here forecloses it.

## Where originality is read from

**Per zone, collapsed the way the paint band already collapses.** Zones each carry a `colour`, and
the derived `paint` band already governs worst-first across five of them. Reading originality the
same way is consistent and truthful, since a car really can have one wing in the wrong shade.

The alternative considered and rejected was a single car-level colour: simpler, but it throws away a
distinction the body model already makes.
