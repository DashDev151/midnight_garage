# The world and its rooms

**Status: DESIGN, unsigned, not scheduled.** The structure below is the maintainer's, recorded
2026-08-03 so it stops living in a chat log. Everything else here is open.

## What this replaces

Navigation by tab bar. The game becomes **a place you move around in**, rendered physically, with
block placeholders first and real art later. A menu survives only as what you see once you are
already somewhere.

## The overworld

Locations you travel to, laid out as a top-down back street with distance meaning something: the
local yard is close, the regional auction further out, the premium auction down the highway, the
collector network out in the larger city.

| location | holds |
| --- | --- |
| **Garage** | home, and a world of its own (below) |
| **Auction yards** | local, regional, premium, each its own room |
| **Test tracks** | the touge up near the mountains, the wangan stretch on the highway, the international raceway further out |
| **Workshop tool hire** | the tool tiers |
| **Staff hire** | |
| **Parts store** | |
| **Bank** | not yet planned, named as a location |

## Inside the garage

| room or object | holds |
| --- | --- |
| **Warehouse** | the parts inventory |
| **Main workshop floor** | in-progress cars, service bays, purchased workshop tools, workbenches |
| **Machine shop** | |
| **Body and paint shop** | |
| **Alley** | parking, and the road out to the overworld |
| **Office** | the phone, the cash register (financials), sales pipelines, the radio (music), shop reviews (reputation and mastery) |

## What this settles that was open

**Parking bays and forecourt bays are one thing: the alley.** The maintainer's objection to holding
service bays, parking bays AND forecourt bays separately is answered by the layout rather than by a
rule, because the alley is physically where a car sits whether it is waiting or for sale.

**The inventory rework is the warehouse.** Structure, filters, sorting and the duplicate
inventory popup in the repair screen are all one job, and that job is building a room rather than
fixing a list.

**The service diagram's proper art is the workshop floor.** Its current version is an accepted
temporary stand-in.

## Open

- **Test tracks with no driving gameplay.** The hard design rules ban driving, and drive mode is
  post-launch. What a player DOES at a test track needs deciding: read a lap time against the
  performance model, prove a build, or something else.
- **What the bank is for.** Named but not designed.
- **How much of the tab bar survives.** A physical world still needs a way to reach a screen
  quickly, and a player who has to walk to the office to check cash will tire of it.
- **Whether travel costs anything.** Time, labour, or nothing. Distance meaning something implies
  it might.
- **The order rooms arrive in**, and what a room looks like before it is built.
