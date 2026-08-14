# What is mastery for?

**ANSWERED, 2026-08-04.** The design of record is
`docs/design/systems/scene-standing-refactor.md`: **your shop becomes known in buyer scenes, not car
parts, and being known changes who walks in, what they will pay, and what you can build.**

This document is kept because the reasoning behind the rejections is what got there, and the
constraints listed below are still the test any future idea has to pass. The repo is
<https://github.com/DashDev151/midnight_garage>.

**The answer to the question this page asks**, in its own terms: a player with standing can point at
the shop ledger, at the actual cars they delivered to a scene, and at a craft operation nobody
without that standing can perform. Not at a number.

## The one-line problem

**The specialty system does not feel substantial.** It should change the game world, not move an
invisible number.

## What the game is

**Ran When Parked** is a browser-based, turn-based garage management sim set in Japan from 1995 to
2005. Synthwave pixel art, JDM car culture. The loop is hunt, build, sell: you buy tatty cars at
auction, diagnose what is actually wrong with them, repair or upgrade them, and sell them on. It is
decision-paced with no reflex input anywhere, and a day passes only when you end it.

It is a solo project heading for a Steam release.

## What specialty is today

There are two progression axes, and the design deliberately separates them:

- **Reputation** is the vertical axis: general standing, five named tiers from unknown to legend.
- **Specialty** is the horizontal axis: per-discipline standing, across six component groups
  (engine, drivetrain, suspension, wheels, body, interior).

**Specialty currently does exactly four things**, and every one of them lives inside the
service-job lane (the side of the game where customers bring you their cars):

| | |
| --- | --- |
| **Techniques** | six, one per discipline, unlocked at 120 points. Each unlocks one signature service job: blueprint engine building, dog-box conversion, corner weighting, show fitment, one-off panel fabrication, bespoke trim |
| **Offer bias** | your strong discipline's jobs arrive more often |
| **Payout premium** | +15 per cent on jobs in your discipline, from 40 points |
| **Shop title** | a derived name at 80 points, plus a further offer multiplier |

## Why it feels thin, stated precisely

**You can be the best engine builder in the city and it changes nothing about buying a car, fixing
it, or selling it. It only changes which phone calls you get.**

That is not an implementation failure. The game's own progression bible confines specialty to
"DEPTH: specialty offer mix, in-lane premium pay, techniques, shop title" and explicitly forbids it
from touching repair speed, repair cost, or whether basic work is possible. The system does exactly
what it was designed to do. **The design was drawn too narrowly.**

There is also a second, separate fault: **nothing credits specialty for work you actually
performed.** Points are awarded only when a job or mission resolves, and a mission's discipline is a
hand-written tag with no link to its own requirements. The tutorial pays 15 Body points for a job
where the player did tyre and engine work, because the mission is tagged `body`. That one is a plain
bug and is worth fixing whatever else is decided.

## Ideas already rejected, and why

Four ideas were put up and knocked down. **The reasons are more useful than the ideas.**

**Labour efficiency: rejected.** Work in your discipline costs less labour.
> "For what purpose? Just to get more done in a day? So what? Still doesn't get you anything."

The principle that fell out of that, and it is the sharpest thing in this document:
**a rate multiplier changes how fast, never what.** In a turn-based game with no time pressure,
compressing time produces nothing a player can point at. **Any future idea that is secretly a rate
multiplier should die on the same grounds.**

**Material yield: rejected**, same reasoning. More panels per tin of filler is a discount, not a
capability.

**Sharper diagnosis: rejected**, but only because it is already planned as a staff perk. A master
hearing a fault others cannot is thematically perfect; it is simply spoken for.

**Teardowns preserving parts: not chosen.** A novice pulling a head costs it a condition band; a
master's comes out as it went in.

## Two ideas that were accepted, and the wall they hit

**Your builds exceed the catalogue.** A race cam fitted by a master delivers more than the same cam
fitted by anyone else. Visible on the dyno and in a lap time, and directly comparable between two
builds. **This is the strongest idea so far** because it puts skill physically inside the car.

**Your machining costs less originality.** Machining is the existing mechanic for making a part
better than it left the factory, and it charges authenticity for doing so. A master's work is
properly done and costs the car less of its originality. This is the money path, because in this
game **value never reads performance**: a car is never worth more for being faster, so any "your work
is worth more" mechanic has to run through authenticity or style.

**The wall: machining is an engine operation.** Suspension, wheels, body and interior have no
equivalent craft operation at all, so a mechanism hung on machining works in one and a half
disciplines out of six.

**The possible way through**, unexplored: the six techniques ARE the missing operations, by name.
Corner weighting. Show fitment. One-off panel fabrication. Bespoke trim. They are currently wired to
unlock service jobs, which is to say a phone call. **Rewiring them to do something to your own car**
would give all six disciplines a craft operation and would need no new vocabulary. Nobody has worked
out whether that holds up.

## The constraints any answer has to respect

1. **It must change the game world, not an invisible number.** This is the whole ask.
2. **No rate multipliers.** See above.
3. **Value never reads performance.** Making a car faster cannot make it worth more. Money runs
   through authenticity, style and condition.
4. **Nothing basic may ever be locked.** A first law of the progression design: if a player can be
   shown work they cannot start, the design is wrong.
5. **It should not be a gate.** A gate moves existing content behind a wall; it does not add
   anything. The maintainer: "I don't want to use it as simply another progress gate."
6. **The vocabulary is fixed.** The words XP, skill points, levels, perk and talent tree are banned
   from the design, the code and the copy.
7. **Changing it may need a bible amendment.** The progression bible is locked and needs explicit
   approval to change, which is available but should be spent deliberately.

## The actual question

**What should mastery in a discipline give the player, such that a person who has it can point at
something in the world and say "that is because I am good at engines"?**

Secondary, and cheaper to answer: **should specialty be earned from the work you physically
performed** rather than from a job's paperwork? That fixes the tutorial bug regardless of what
mastery becomes.

## Where the detail lives

- `docs/design/systems/specialty-redesign.md` - the paused redesign, including the rejections
- `docs/design/systems/specialty-crediting-analysis.md` - how points are awarded today, caller by
  caller
- `docs/design/progression-bible.md` - the four pillars, the six laws, the banned vocabulary
