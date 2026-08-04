# The world and its rooms

**Status: DESIGN, agreed with the maintainer 2026-08-03.** Not yet built. This is the design of
record for how the game is navigated.

## What this replaces

Navigation by tab bar. The game becomes **a place you move around in**, rendered as art, with
decent placeholder sprites first and final art later. A menu survives only as what you see once you
are already somewhere.

**The tab bar stays, in full, for now.** This is additive: the world is built alongside it and the
tabs are retired later, deliberately, rather than the world shipping half-finished as the only way
to reach a screen.

**It also answers an open call in the art bible.** Section 7 lists "the navigation tab object" as
undecided, with the cassette rack retired and candidates to be picked during the cohesion pass.
There is no navigation object: you walk.

## What the art bible already locks, and this obeys

- **Elevated three-quarter, top-down oblique, the Stardew and Pokemon lineage, explicitly NOT
  isometric.** Locked 2026-07-22.
- **640x360 stage. Props on a 16px base grid (16/32/48 canvases). Integer-only scaling.** Locked
  2026-07-13.

So the overworld is a 640x360 scene and a building is a 32px or 48px prop, not free illustration.

## The overworld

**A tourist map, not a survey map.** Scale is deliberately not uniform: the central
industrial-adjacent district is geographically tiny and takes most of the page, because that is
where every day is spent. Everything else compresses toward the edges.

**Distance is conveyed by compression and depth, never by empty tarmac.** Far places sit smaller and
hazier, behind a treeline or a bridge, with the road narrowing toward them. A transit map does this
and nobody finds it confusing.

### Placement

| where | what |
| --- | --- |
| **centre** | the garage |
| across the street | **cafe** (building only, no function yet) |
| nearby | tool hire, parts shop |
| a little further | local yard, staff centre, **bank** (building only, no function yet) |
| top left | the mountains, and the touge |
| top right | regional auction |
| bottom right | the highway and the wangan, out to the premium auction |
| bottom left | the larger city: dealer network, collector network, international raceway |

**Travel costs nothing.** Not time, not labour. Making it cost something would turn navigation into
a mechanic, and that is a decision to take deliberately later if at all.

## Inside the garage

Same projection. Rooms you move between.

| room | holds |
| --- | --- |
| **Alley** | parking, and the road out to the overworld |
| **Main workshop floor** | in-progress cars, service bays, the tools you own, workbenches |
| **Warehouse** | the parts inventory |
| **Machine shop** | machining |
| **Body and paint shop** | the body pipeline and the paint stage |
| **Office** | the phone, the cash register, the sales corkboard, the photo wall, the radio |

### The office, object by object

**The sales pipeline is a corkboard, and the corkboard IS the sell screen.** One index card per car
you have listed, pinned. The whole pipeline readable at a glance, which is the actual job. Channels
are sections or different pins, a stale listing is a card gone yellow, an offer is a note stuck to
its card. The most 1995 object in the room and it needs no explaining.

**This is where listing lives.** There is no standalone sell screen today: a car is listed from its
own detail page, one at a time, with no view of the whole pipeline. The corkboard replaces that with
the view a person actually wants.

**And the fax machine sits beside it.** The dealer network is `sellingChannels.tradeNetwork`, whose
buyer the code already calls "a fax to the dealer circle": offers three times as often, price around
plain market value, no taste roll, no matched premium, no forecourt bay needed. **Click the fax, pick
a car, it is sold.** No buyer to wait for and nothing to negotiate, which is the whole point of it
and the reason the price is what it is.

That also settles what the `dealer-network` building on the overworld should do: it is a fax, not a
place you visit, so the map either takes you to the office or stops pretending it is a destination.

*Rejected: the answering machine. The phone is already in the room doing jobs and two message-y
objects would blur.*

**Shop reviews are a photo wall.** Every finished car gets a photograph pinned up with its owner
beside it. Reputation is how much wall you have covered: a new shop has three curling snapshots, a
legend has a wall you cannot see the paint through. **It is the one progression display that needs
no number at all**, which the progression bible's pull-not-push law will like.

**Specialty is framed certificates beside the photos.** One per technique earned. Same wall, two
readings: the photos say how known you are, the frames say what you are known for.

**The cash register** is the weekly financial summary. **The phone** is jobs. **The radio** is music.

## Unbuilt rooms are derelict, not absent

**The space is already yours and it is full of somebody else's rubbish.** An old industrial unit: the
machine shop is there from day one, visible through a doorway, with a dead lathe and thirty years of
junk in it.

Better than a locked door or blank space for three reasons. You can **see what you could have** from
the first day, which is aspirational rather than hidden. Opening it is diegetic work rather than a
purchase screen. And the existing rent mechanic already scales with what you have opened, so the
money side needs no new system.

**Clearing a room turns things up.** A box of old parts, a magazine from 1988, a photograph of
whoever had the unit before you. Story in the world with no story system attached. A flourish rather
than load-bearing: the cheap version is simply a derelict room you clear.

## The test track

**Take a car there and run it through the physics model for a time.** That model is locked,
validated to about 2 per cent on blind predictions, and already ships four calibrated courses, so
this is wiring rather than inventing.

### This requires amending a hard design rule

`CLAUDE.md` currently reads "No driving gameplay - events resolve via pre-run decisions + animated
resolution."

**The maintainer's rule, 2026-08-03, replaces it: nothing may REQUIRE driving to progress. Optional
driving, for fun, is allowed.** A drive mode is planned for later.

**The reflex-input ban is untouched and stays absolute**: no QTEs, no timing bars, everything
decision-paced.

## What is deliberately not built

- **Bank loans.** The building goes up; it does nothing. Loans with interest change the shape of the
  early game outright, so they are a real mechanic and a real exception to the v1.0 feature freeze,
  to be taken deliberately rather than because a building needed a purpose.
- **The cafe's function.** Building only. The labour-restoring coffee is a separate approved idea
  that has not been designed.
- **Travel cost.**
- **Retiring the tab bar.**

Everything else here is re-presentation of systems that already exist: same actions, same economy,
different navigation. That is why it sits inside the feature freeze and loans do not.

## Open

- **What an overworld location looks like before you can use it.** The garage's derelict rooms have
  an answer; the premium auction and the collector network do not.
- **Whether the world eventually replaces the tab bar or lives beside it permanently.**
- **The exact 640x360 composition**, which the art bible also lists as open for the hero scene.
