# Workshop topology and the physical UI

**Status: PROBLEM STATEMENT, not a design. Nothing here is decided.**

Raised by the maintainer 2026-07-29. Captured so the questions survive; the answers
are a design arc of their own, to run **after** the systems arc lands.

---

## 1. The problem

**Every system we have just designed creates physical acts that have nowhere to
happen.**

The maintainer's questions, verbatim in substance:

> In the physical gameplay screens, in the game world, what should it look like to
> remove an engine? What should it feel like to bore a block? How does it feel, and
> what are the mechanics and UI steps of removing a part and repairing it? Where does
> the repairing happen? What are the physical steps of taking a part to a workstation
> and reconditioning it? Where is the workstation?

And separately: **the current car diagram is bad and needs redesigning.**

None of those is a rendering question. They are all the same question, which is that
**the game has views of a car but no model of a place.**

---

## 2. Why this is now urgent rather than cosmetic

The systems arc adds acts that are meaningless without somewhere to perform them:

| system | the act it invents | where does it happen? |
| --- | --- | --- |
| Teardown (shipped) | removing a part, refitting it | undefined |
| Bench repair (shipped) | reconditioning a loose part | "the bench", which is a word, not a place |
| Machining (`tuning-system.md` 4) | boring a block, porting a head | **nowhere. The facility does not exist** |
| The dyno (`tuning-system.md` 14) | a dyno session | **nowhere** |
| Engine swaps (`engine-swaps.md`) | pulling an engine, fitting another | **nowhere** |
| The scrapyard (`scrapyard.md`) | rummaging a wreck, pulling a part off it | **nowhere** |

**Four designed features all need the same missing thing.** Building any of them
without it means each invents its own screen, and the game ends up with four
unrelated ways to do physically similar work. That is exactly the failure directive 16
exists to prevent, and it is the failure the Sprint 08 service-jobs rework was caused
by.

---

## 3. What already exists, and what it is not

**The workshop views** (`WorkshopViews.vue`, `workshopViewLayout.ts`,
`workshopViewSprites.ts`, shipped in the workshop rework) show a car from three
angles: body, engine bay, underside.

**Those are views of a car, not places in a shop.** They answer "what is wrong with
this vehicle", which is a different question from "where am I standing and what can I
do here".

The three backdrop sprites are also explicitly placeholders under the art bible's
no-AI-assets law, and `TODO.md` already carries them as launch-blocking.

**The maintainer's verdict on the current diagram is that it is bad.** That judgement
is recorded here as the brief; this document does not attempt to diagnose it, because
the person who has looked at it is the one who should say what is wrong with it.

---

## 4. The framing that probably unlocks it

The art bible already states the law:

> **Every interactive control is an in-world object. The screen IS the shop, not a
> website about the shop.**

If the screen is the shop, then **the shop needs a topology**: a set of places, each
with a purpose, and things that move between them. That is what turns "recondition
part" from a button into an act.

A first sketch of what the places might be, offered as vocabulary rather than as a
proposal:

| place | what happens there | gated by |
| --- | --- | --- |
| the bay | a car sits, comes apart, goes back together | bay count |
| the bench | a loose part is cleaned, inspected, reconditioned | tool tier |
| the machine shop | a part is made better than it was built | **tool tier 3, currently purposeless** |
| the dyno | a built car is measured | a facility |
| the shelves | parts wait, and clutter | storage |

**Parts moving between places is the mechanic.** Take the block out of the bay, carry
it to the bench, then to the machine shop, then back. That is what makes boring a
block feel like work rather than like a purchase, and it is what gives the labour
system something physical to be about.

---

## 5. Questions this arc must answer

1. **Is the shop one screen or several?** A single space you move around in, or rooms
   you switch between?
2. **Do parts have a location?** Today a loose part is in an abstract inventory. If it
   physically sits on a bench or a shelf, that is new state and it is what makes space
   a constraint.
3. **What does a multi-step job look like?** Removing an engine is a sequence, not a
   click. Where does the player see it in progress, and can they leave it half done?
4. **What replaces the car diagram**, and what was wrong with it? The maintainer's
   judgement is the starting point.
5. **How much of this is animation versus static state?** The art bible's feedback
   stack demands a real pressed or moved art state within about 100 ms, and bans
   anything that "cannot clunk". That is a real asset cost.
6. **Does the workshop's physical layout upgrade with tool tiers?** A tier-3 shop
   having a visibly different room is the most legible progression the game could
   have, and also the most expensive.

---

## 6. Constraints that already bind this work

- **The diegetic UI law** (art bible section 4): controls are in-world objects, with
  accessible semantics underneath. Banned outright: "any control whose art has no
  pressed/active state. If it cannot clunk, it does not ship."
- **The canvas-island model**: 640x360 logical stage, integer-only scaling,
  nearest-neighbour, no fractional zoom, 16px prop grid.
- **No AI-generated assets, ever**, in the build or in public materials.
- **The cohesion pass** (`TODO.md`) gates outside playtesting: a cohesive if unpolished
  art pass must land before strangers see the game.
- **No reflex input.** Physical acts are decision-paced; an engine hoist is not a
  timing challenge.

---

## 7. Sequencing

**This arc runs after the systems arc**, by the maintainer's own steer, and that
ordering is right: the systems decide which acts exist, and it would be wasteful to
design screens for mechanics that then change shape.

**But two things should be decided before the systems arc finishes**, because they are
cheap now and expensive later:

- **Where machining happens**, at least in outline, because `tuning-system.md` 4c
  hangs tool tier 3 on it.
- **Whether parts have a location**, because that is state. Pre-launch that is a Dexie
  version bump and nothing else (directive 19 suspends migrations), but it still
  means touching everything that reads inventory, and the later it lands the more
  that is.
