# Paint

**Status: DESIGN, unsigned.** Nothing here is built.

## The gap

`paint` is the only slot in the game with no aftermarket SKU at any fitment class. Its twelve finish
SKUs were retired when the derived body carriers landed, and nothing replaced them.

So paint is **pure subtraction on two stats at once**:

- **11 of authenticity's 100 points** can never be lost. A resprayed car reads as wearing its
  factory colour, because `stocknessOf` asks whether the fitted SKU is `grade: 'stock'` and the only
  `paint` SKU there is, is stock.
- **2 of style's 14 condition weight**, which is 14.3 per cent of the whole number, can only ever
  drag style down. Bad paint costs a car an eighth of its style and a respray can never win a point
  back.

A player can spend a week making a car's paint perfect and the game will not notice it is better
than the day they bought it, only that it is no longer worse.

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

The retired ladder comes back as what a player chooses when they paint, on the grades that already
exist and already price themselves:

| grade | finish | authenticity | style |
| --- | --- | --- | --- |
| **stock** | factory-correct respray | **restores it, in the factory colour** | none |
| street | straight respray | costs it | a little |
| sport | metallic | costs it | more |
| race | pearl | costs it | most |

**This is what gives paint a way up**, and it is the only reason anyone would pay for more than the
cheapest job. It is also what makes the choice interesting rather than obvious: the expensive paint
is the one that costs you originality, and the factory-correct job is the cheap one that gives no
style at all.

A restoration and a show car want opposite things from this slot, which is the point.

## Colour: what you choose, and what it costs

Colour is the other half of the same question. `paintColours.json` already ships twelve with a name
and a hex.

**Repainting in the car's own factory colour, at stock grade, is the restoration.** Anything else
trades originality for style, and the trade is the same whichever colour is picked: the game does
not currently rank one colour above another.

**Whether buyers should prefer particular colours is deliberately out of scope.** It is a buyer-model
change rather than a paint change, it needs authoring against twelve colours and every archetype,
and paint is worth fixing without it. Worth revisiting once this has been played.

## The colours: two different problems

**The current twelve are retired.** Pearl White, Silver Mist, Gunmetal and the rest are a generic
period palette that carries none of what makes a colour matter. Factory and aftermarket colour are
different problems and get different answers.

### Factory colours: a research job, then a consolidation

**Research first.** What each of the 94 cars was actually sold in. That is the only thing that makes
a wrong colour read as wrong, and it cannot be invented.

**Then consolidate, hard.** Five near-identical light blues across five manufacturers are one colour
in a game rendered in a four-tone ramp. Where two period colours are close enough that nobody would
call them apart on a pixel-art sprite, they merge. The list that comes out of research is the input;
the shipped palette is what survives merging.

**Iconic colours survive consolidation and get parody names.** Bayside Blue and Midnight Purple are
the reason a colour pool is worth having at all: they are the ones a player recognises. They are
also manufacturers' names for manufacturers' colours, so they follow the naming layer exactly as
brands do. Midnight Purple becomes something like "Dead of Night Indigo" in front of the flag, with
the real name behind it.

**The bar for those names is the copy bar.** A parody colour name is player-facing text on a car a
player already loves, so it has to be worth reading rather than merely legally distinct.

### Aftermarket colours: no authoring at all

**A resprayed car does not need a catalogue. It needs a colour picker.** Hue, saturation and
brightness on a quantised grid, and the player takes whatever they fancy. No content to author, no
list to maintain, and it matches what a respray actually is: somebody's choice rather than a
factory option.

**The art architecture already supports this.** `art-direction.md` excludes car bodies from the
24-to-32 environment palette cap outright, because bodies use an indexed four-tone template with
runtime palette swapping. Arbitrary body colour is what that system was built for.

**The one real constraint: a body colour is a ramp, not a swatch.** Four tones, not one hex. So a
picked colour has to generate its own ramp (base, shade, highlight, line) rather than being dropped
in as a single value. That is arithmetic on the coordinates and wants doing once, properly.

**Quantise the grid rather than leaving it continuous**, for two reasons. It keeps the ramps
predictable for the art, and it lets a colour's **name derive from its coordinates** rather than
being blank. "Deep Blue", "Pale Green", "Vivid Orange" are readable in a listing, in a buyer's
want-line and in the copy; a hex is not, and the game's voice cannot describe a car as being
`#A3F2C1`.

## Generation: what arrives, and on what

**Most cars wear their own paint.** A respray is the exception and should read as one. If half the
lot is resprayed, an original car stops being worth noticing.

**And which cars get resprayed is not uniform.** It follows `culture`, which the roster already
carries, so no new axis is needed:

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

## What this does not do

- **It does not change the `finish` axis or the body pipeline.** Condition already works and is a
  separate question from both colour and finish quality.
- **It does not touch the two-tone mismatch rule**, which is correct as of its fix.
- **It does not make colour reach value directly.** Colour reaches money through style and
  authenticity, like everything else, and buyer colour preference is its own future thing.

## What it needs

1. **`spec.factoryColours` authored for all 94 roster rows** (directive 24). The real cost of the
   feature, and it wants the palette settled first.
2. `CarInstance` carries the colour and finish grade it left the factory in, rolled from that pool
   at generation, along with whether it still wears them.
3. `stocknessOf` reading, for the `paint` slot, whether the car is currently in that colour at stock
   grade, rather than reading the carrier SKU's grade.
4. Three `paint` SKUs per fitment class carrying style points, plus the stock factory-correct job.
5. The paint stage asking which finish as well as which colour.

## Open

**Where the current colour is read from.** Zones already carry a `colour` each, and the derived
`paint` band already collapses five of them worst-governs. Reading originality the same way is
consistent and truthful, since a car really can have one wing in the wrong shade, and the two-tone
mismatch rule already handles the disagreement case.

The alternative is a single car-level colour, which is simpler but throws away a distinction the
body model already makes. **Per zone, collapsed the way the band already collapses, is probably
right**, and it wants deciding before implementation rather than during.
