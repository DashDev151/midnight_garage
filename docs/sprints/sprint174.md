# Sprint 174: the garage interior

**Design of record:** `docs/design/systems/world-and-rooms.md`, agreed with the maintainer
2026-08-03. The overworld is Sprint 173 and lands first.

## Goal

**The garage becomes rooms you move between**, in the same top-down oblique projection as the
overworld, and what you can do is decided by where you are standing.

**The tab bar stays, in full.** Additive, exactly as in 173.

## The rooms

| room | holds | destination |
| --- | --- | --- |
| **Alley** | parking, and the road out to the overworld | the parking and forecourt screens, merged |
| **Main workshop floor** | in-progress cars, service bays, owned tools, workbenches | the garage and car detail screens |
| **Warehouse** | the parts inventory | the inventory screen |
| **Machine shop** | machining | the machining flow |
| **Body and paint shop** | the body pipeline and the paint stage | the body and paint flows |
| **Office** | the phone, the cash register, the sales corkboard, the photo wall, the radio | see below |

**The alley settles a playtest complaint by layout rather than by rule.** The maintainer objected to
holding service bays, parking bays AND forecourt bays as three things. The alley is simply where a
car sits, whether it is waiting or for sale, so the distinction disappears without needing a
mechanic to remove it.

## The office, object by object

**The sales pipeline is a corkboard.** One index card per listed car, pinned. The whole pipeline
readable at a glance, which is the actual job. Channels are sections or different pins, a stale
listing is a card gone yellow, an offer is a note stuck to its card.

**Shop reviews are a photo wall.** Every finished car gets a photograph pinned up with its owner
beside it. Reputation is how much wall you have covered: a new shop has three curling snapshots, a
legend has a wall you cannot see the paint through. **It needs no number at all**, which is exactly
what the progression bible's pull-not-push law wants.

**Specialty is framed certificates beside the photos.** One per technique earned. Same wall, two
readings: the photos say how known you are, the frames say what you are known for.

**The cash register** is the weekly financial summary, which already exists. **The phone** is jobs.
**The radio** is music.

## Unbuilt rooms are derelict, not absent

**The space is already yours and it is full of somebody else's rubbish.** An old industrial unit: the
machine shop is there from day one, visible through a doorway, with a dead lathe and thirty years of
junk in it.

Three reasons this beats a locked door. You can **see what you could have** from the first day,
which is aspirational rather than hidden. Opening it is diegetic work rather than a purchase screen.
And **the existing rent mechanic already scales with what you have opened**, so the money side needs
no new system.

**Clearing a room turns things up.** A box of old parts, a magazine from 1988, a photograph of
whoever had the unit before you. Story in the world with no story system attached.

**That last part is a flourish and is cut first if the sprint runs long.** The load-bearing version
is a derelict room you clear.

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| Reaching a screen | Vue Router, exactly as the overworld does it |
| Rent scaling with what you own | the existing rent mechanic, which already scales with owned bays |
| Every room's contents | the existing screens. A room is a way in, not a rewrite |
| Sprites at integer scale | the overworld's own sprite pipeline from 173 |
| Reputation and specialty values | already computed. The wall and the frames are a rendering of them, not a second source |

**Genuinely new:** the room scenes and their sprites, the derelict-room state and what opening one
costs, and the three office objects as readable art.

## Tasks

**A. The art.** Six room scenes and their objects, 16px grid, top-down oblique, matching 173.

**B. The rooms.** Movement between them, and each room's way into the screen it fronts.

**C. The office objects.** The corkboard reading live listings, the photo wall reading reputation,
the certificates reading earned techniques.

**D. Derelict rooms.** Which rooms start closed, what opening one costs, and the rent consequence.

## Definition of done

1. Every room is reachable and fronts the screen it should.
2. The alley holds parked and for-sale cars as one thing.
3. The corkboard shows real listings; the wall shows real reputation; the frames show real
   techniques.
4. A derelict room is visibly there before it is yours.
5. The tab bar still works exactly as it does today.
6. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Levers (directive 22)

**One, and it must be signed before task D is implemented:** what opening a derelict room costs, and
what it adds to weekly rent. Every other part of this sprint moves no value.

## Deferred

- **Final art.**
- **Retiring the tab bar.**
- **The junk-clearing story hook**, if the sprint runs long.

## Exit

_To be completed at the end of the sprint._
