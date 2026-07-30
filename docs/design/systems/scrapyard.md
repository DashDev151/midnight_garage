# The scrapyard (解体屋)

**Status: DESIGNED, NOT IMPLEMENTED, not scheduled. Nothing in this document exists
in the game.** Drafted 2026-07-28.

Supersedes the idea capture of the same date. Every number is a proposal and
unapproved; every mechanic below is designed against machinery that already ships.

---

## 1. The problem this solves

Three gaps, and it closes all of them with one venue.

**Parts have no supply side.** There is exactly one way to obtain a part today: buy
it new at full retail. That makes the catalogue a vending machine and repair a pure
cost. Every real mechanic makes the same choice twenty times a week, and the game
never offers it: new and certain, or used and cheap and a gamble.

**The teardown loop has no subject.** The four-play ordering settled on 2026-07-28
makes stripping a car deliberately loss-making, which is right for a car worth
buying whole. But the maintainer's stated intent for the parts system is "buy a
part car, strip it, repair the parts, use them in other builds", and no such car
exists in the game. Every lot at every auction house is a car you could repair.

**`poor` and `scrap` parts have no exit.** At the settled resale curve a poor part
fetches about 3 per cent of new. Correctly near-worthless, but it means the
warehouse silts up with things not worth the click.

---

## 2. The core mechanic: wrecks are readable, not random

This is the whole design and everything else serves it.

The maintainer's own image is the specification: *"new Wreck in the yard, head on
collision, engine bay is gone, but the back body panels and coilovers look
clean."*

**Damage is localised, and the pattern tells a story.** A wreck is not a car with
randomly bad parts. It is a car that had one specific thing happen to it, and what
survived follows from what that was. A player who learns to read damage learns to
find value, and that learning is the game rather than a dice roll.

### Damage archetypes

Each wreck is generated from one archetype, which decides which zones are destroyed
and therefore which parts are plausibly intact.

| Archetype | Destroys | Survives well | The read |
| --- | --- | --- | --- |
| **Head-on** | bonnet, front chassis, engine bay contents, cooling, front suspension | boot, roof, rear panels, gearbox, differential, rear suspension, interior | Everything behind the bulkhead |
| **Rear-end** | boot, rear chassis, exhaust rear, rear panels | **the entire engine and front suspension**, bonnet, front panels | The drivetrain is untouched. The best engine donor in the yard |
| **Side impact** | one of left or right, that side's suspension and glass | the opposite side, the whole drivetrain, roof, both ends | Half a car's panels, and everything mechanical |
| **Rollover** | roof, glass, both sides' upper panels, interior | **drivetrain, suspension, brakes, wheels** entirely untouched | Mechanically perfect, cosmetically dead |
| **Engine fire** | engine bay entire, bonnet, wiring, cooling | gearbox onward, all body except the bonnet, interior if caught early | A rolling shell with a good back half |
| **Flood** | electrics, interior, ignition, ECU, gauges, seats | **body panels are straight**, engine may be salvageable, brakes and suspension fine | Looks perfect, is electrically dead. The trap |
| **Stripped** | whatever the previous owner or a thief wanted (wheels, seats, ECU, turbo) | everything unfashionable | Someone got here first, and their taste tells you what is left |
| **Tired** | nothing acutely; everything is simply worn out | nothing is good, nothing is destroyed | No prizes. The yard's filler, and the honest majority |

**Flood is the trap and it deserves to exist.** A flood car is the one that looks
best in the yard and is worth least. That single archetype teaches the player that
looking is not knowing, which is the lesson the whole venue rests on.

### It maps onto machinery that already ships

`CarInstance.zoneState` already carries six zones (`bonnet`, `boot`, `left`,
`right`, `roof`, `chassis`), each with `metal` 0-3, `surface` 0-2, `finish` 0-3 and
`panelMissing`. **A damage archetype is a zone-state pattern plus a set of part
band overrides.** Nothing new is needed to express one.

The three workshop views (body, engine bay, underside) already render exactly the
three places a player would look at a wreck.

---

## 3. The second layer: what survived is not necessarily good

Reading the archetype tells you what the *crash* did. It tells you nothing about
what the car's life did before it.

A rear-ended Cefiro's engine is untouched by the impact. It might also have 240,000
km on it. **So every wreck asks two questions, and only the first is free:**

1. **What survived?** Visible. Readable from the damage, at a glance, at no cost.
2. **Is what survived any good?** Hidden. Costs time to find out, or you gamble.

`CarInstance.apparentBandByPartId` already exists for precisely this looks-versus-truth
seam, built for the diagnosis mechanic. A yard part shows its apparent band; the
true one is revealed by inspecting it, or by fitting it and discovering.

**Do not build a second uncertainty system.** This one is already load-bearing
elsewhere and the player already knows how to read it.

### A failure mode worth designing for: a part that takes the engine with it

**Maintainer note, 2026-07-30, from the tuning arc's reliability discussion.** Not every
worn part merely underperforms. Some fail in a way that destroys something else, and a
turbocharger is the clearest example on the roster.

A tired turbo has three separate paths to killing an engine, and none of them is "down
on power":

- **Worn centre bearing and shaft play** lets the oil seals go, so the turbo passes oil
  into the intake charge. Oil in the combustion chamber lowers the effective octane and
  provokes detonation, which is what breaks pistons and ring lands.
- **Compressor or turbine wheel contact** produces debris. Compressor shrapnel travels
  downstream into the engine, and ingesting a blade means a new engine, not a rebuild.
- **Boost control failing the other way** overboosts, which detonates and holes a piston.
  The turbo working too well is its own hazard.

**Why this belongs to the scrapyard specifically.** The yard is the one venue that sells
parts of genuinely unknown condition, and the looks-versus-truth seam above is exactly
the mechanism that would make this land: a yard turbo that looks fine, is not, and takes
the bottom end with it some days after fitting. That is a consequence with real teeth
and it is not a random punishment, because inspecting the part was always available.

**Deliberately NOT scoped here, and it must not be smuggled in.** The game has no
random catastrophic loss anywhere, by design, and adding one is a maintainer decision
rather than a detail of this venue. Two things would have to be settled first: whether
a fitted part can damage a different part at all (nothing in the sim does this today),
and how a player could have avoided it, since a mechanic that destroys an engine with no
readable warning is a punishment rather than a decision. Both are open questions for
section 10, not assumptions for the build order.

---

## 4. The visit is a routing problem, and that is the puzzle

The maintainer asked whether an inspection-style puzzle could work here. It can,
and it needs no new mechanic: **the inspection visit is already a routing problem
under a time budget**, and a yard visit is the same shape asking a different
question.

| | Inspection visit | Yard visit |
| --- | --- | --- |
| Budget | minutes | minutes |
| The question | what is wrong with this car | which of these is worth taking home |
| The choice | which tests, in what order | which wrecks to read, which parts to check |
| The failure | you buy a car with a hidden fault | you buy a shell, or you leave the good engine behind |

A visit gives the player a fixed budget and a yard containing several wrecks and a
shelf of loose parts. Actions cost from that budget:

- **Walk past a wreck** (free): its archetype and its obvious damage.
- **Look it over** (cheap): which specific slots are present versus missing, and
  every part's *apparent* band.
- **Check a part** (moderate): that part's true band.
- **Rummage the shelves** (moderate): surfaces more of the loose stock than is on
  display.

So the decision is real and it is the same decision every time in a different
shape: three careful checks on the one wreck that looks promising, or a quick read
of everything to find the one nobody else spotted.

**Build the simple version first.** Rolling stock plus visible archetypes plus
apparent bands may be enough friction on its own. The timed routing layer is the
enhancement, not the foundation, and it should only be built if the simple version
proves too easy.

---

## 5. What is for sale

**Wrecks.** Bought whole, cheap, for harvest. Priced as what they are: a car whose
value is its surviving parts minus the labour to extract them.

**Loose parts.** Pulled from previous wrecks, on shelves. This is where the player
who just needs *a gearbox* goes. Cheaper than new, uncertain condition, and
crucially **the yard has what it has**. It does not stock what you need because you
need it.

**Nothing the player can order.** No search, no filter by part, no "notify me". The
absence of a catalogue is the mechanic.

### And what the yard buys

- **Scrap and poor parts**, at weight money. Small, certain, instant. This is the
  warehouse clean-out the maintainer asked for.
- **Shells.** `resolveScrapShell` stops being an abstract payout and becomes a
  transaction with a counterparty, which is where it always belonged.

---

## 6. Rolling stock

Yard inventory rotates on the day clock, not per visit. Per-visit regeneration
turns the venue into a slot machine the player rerolls by leaving and returning;
a clock makes visiting a decision with a cost.

**A new wreck arriving is an event worth surfacing in the day log**, in the same
voice as an auction lot appearing. "A rear-ended Cefiro came in" is a reason to go,
and it is the single best hook the venue has.

Proposal, all unapproved: the yard holds four to six wrecks and eight to twelve
loose parts; roughly one wreck is replaced every two to three days; a wreck that
has been picked over is eventually crushed and leaves. That last part matters,
because **a wreck the player passed on should be able to disappear.** Deciding not
to buy has to be able to cost something or it is not a decision.

---

## 7. Economics, and the risk this venue carries

**The design risk is the whole design, and the keyword is `reliably`.** A yard that
reliably sells the part you want at a fraction of retail destroys the parts economy
settled on 2026-07-28. The defence is not price, it is availability: the yard
cannot be relied upon, so the parts shop remains what you use when you actually
need something.

Four constraints, and the venue needs all of them:

1. **Limited, rotating stock.** It does not have your part.
2. **Uncertain condition.** What it has may be worse than it looks.
3. **A visit costs time**, so shopping there is not free even when it works.
4. **The buy-sell spread at the yard is positive**, or the player buys at the yard
   and sells at the shop in a loop. This is the one hard arithmetic constraint and
   it must be asserted by a test.

### Numbers to be derived, not guessed

Every one of these is an unapproved economy lever and each needs measuring against
the settled model before it is proposed:

- **Used part price**, as a fraction of new. Must sit above what a player receives
  for selling one (0.30 of new at mint) with a real margin between.
- **Scrap payment for poor and scrap parts.** "Steel scrap value small" is the
  brief. The sim has no mass model, so the nearest honest analogue is a small
  fraction of the part's own price, floored so a heavy cheap part and a light dear
  one do not read identically.
- **Wreck purchase price.** Careful here: a car with half its slots empty currently
  prices through `marketValueYen` and the scrap-value backstop floor, which several
  cars already collapse to. Priced naively, every wreck in the yard costs the same
  nothing. **A wreck probably needs its own pricing path**, valuing it as the sum of
  its surviving parts at yard rates rather than as a car.

### What it does to the rest of the economy

Cheap used parts make repair cheaper, which makes repair-and-sell more profitable,
which **strengthens** the four-play ordering rather than threatening it. But it also
moves every generated car's restoration bill, so `partsGeneration.maxBillFraction`,
the donor law and the consumables-share check all need re-measuring after the venue
lands, not before.

---

## 8. Reuse analysis (directive 16)

**Genuinely new:** the venue itself, its stock model and rotation, the damage
archetypes as content, and a wreck-specific pricing path. That is all.

| Concern | What already exists and must be reused |
| --- | --- |
| Localised body damage | `zoneState`, six zones with metal/surface/finish/panelMissing |
| Looks versus truth | `apparentBandByPartId` and `diagnosis.ts`'s `apparentViewOf` |
| A routed decision under a time budget | the inspection visit's minute budget |
| Buying a part into inventory | `resolveBuyPart`, with its standard/express split |
| Selling and scrapping a loose part | `resolveSellPart`, `resolveScrapPart` |
| Scrapping a shell | `resolveScrapShell`, relocated rather than replaced |
| Generating a rough car without making an impossible one | the auction generator's own guards |
| Viewing damage in three places | the body, engine bay and underside workshop views |
| A venue that unlocks | the auction houses' guarantor unlocks |

**What must NOT be built:** a second uncertainty mechanic, a second part-condition
model, a parts search or filter, or a second way to price a part.

---

## 9. Build order

**Phase 1, the venue.** A screen, rotating stock of loose parts at yard prices with
apparent bands, and buying scrap and poor parts and shells. No wrecks yet. This
alone closes the supply-side gap and the warehouse-clutter gap, and it is small.

**Phase 2, wrecks.** Damage archetypes as content, wreck generation, the
wreck-specific pricing path, and the three views showing damage. This is the
feature.

**Phase 3, the routing puzzle.** The timed visit, inspect-a-part, rummage. Only if
phase 2 proves too easy.

Phases 1 and 2 are separately shippable and phase 1 is worth having on its own.

---

## 10. Open questions for the maintainer

1. **Venue or screen?** Unlocked and visited like an auction house, or always
   available like the parts market? The unlock decides whether this is early-game
   relief or a mid-game reward. **My read: always available from the start.** The
   yard is where a poor player shops, and gating it hurts exactly the player it
   helps most.
2. **Does the yard buy cars?** If it takes any car for scrap money, it becomes a
   price floor under the entire market. That is a large economic commitment and I
   would say no: shells only.
3. **How does a yard part interact with provenance?** `TODO.md` already records the
   provenance rework as owed. A yard part has no history, which is either a feature
   (cheap, anonymous, no story) or a problem (the game tracks where parts came
   from). Worth settling in the same pass.
4. **Can the player sell a wreck back?** If they buy one and misjudge it, is the
   shell all they have left? I think yes, and that the mistake should sting.
5. **Does reputation reach the yard?** Every other venue is gated or coloured by it.
   The yard could plausibly be the one place that does not care who you are, which
   would say something true about it.
