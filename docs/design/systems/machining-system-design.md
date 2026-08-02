# Machining: the design

**Status: DESIGN OF RECORD, complete. Every ruling below is the maintainer's.** The power figures
are signed and live in `machining-performance-table.md`; the implementing sprint is
`docs/sprints/sprint168.md`.

**The document set, and what each is for:**

| document | what it is |
| --- | --- |
| **this file** | the design of record: what machining is and how it integrates |
| `machining-performance-table.md` | **the numbers**: the power ladder, every operation, all three engine characters |
| `machining-integration-map.md` | the code investigation that constrained the design |
| `machining-sku-scoping.md` | the new-SKU model, measured and REJECTED |
| `machining-system.md` | the maintainer's preliminary baseline, **SUPERSEDED** by the performance table |

## What machining is

**The third way a part gets better.** Repair restores a part to what it was. Fitting aftermarket
replaces it with something else. **Machining improves the original**, and that is its whole
character: the part stays the car's own.

## The rulings

**Machining is a property of the part, not the car.** A machined block that is removed and fitted
to another car is still machined. The record travels with the part.

**It costs labour and tooling, not money per operation.** Machining is gated behind the engine
line's tier 3, which `toolLines.json` already names "Machine-shop tooling" at 1,500,000 yen. Once a
player owns the means of production, the work costs their time and nothing further.

**Labour IS the cost, and it is a real one.** Five labour units an operation, on gains that are
sometimes marginal, against every other thing a shop could be doing with that time. The
1,500,000 yen of tooling buys the right to spend labour this way; it does not make the labour free.
Machining is not a "when", it is a "whether this engine, this operation, this week".

**It is irreversible.** A bored block is bored. Nothing un-machines a part, so machining
permanently narrows what that part can become.

**It costs a little reliability.** The mechanism exists so the cost is real on every sale rather
than only to collectors, but it is deliberately small: a few percentage points at most.

**It costs authenticity, but only on the car's own parts.** On the scale already authored: purists
shrug at 1-2, raise an eyebrow at 4-6, weep at 7-9. **A stock-grade part pays; an aftermarket one
does not**, because that slot's whole weight went the moment the aftermarket part was fitted and
charging again would book one loss twice. Boring a race block does not make it less factory than it
already was.

## How it integrates

### State: on the part

```text
PartInstance.machining: MachiningOperationId[]
```

The integration map established that a record on `CarPartState` is silently erased by seventeen
production sites that rebuild the slot as a fresh object literal, so a repair job would undo the
work. `PartInstance` survives all of them, and it is what makes the maintainer's travel ruling true
by construction rather than by care.

`machiningCost(car)` becomes a walk over the car's installed parts, summing each applied operation's
authenticity rating. Its contract is already written and already wired into
`authenticityPercentOf`; this fills it in.

### Power: the existing shape already fits

An operation carries a `powerFraction` keyed by engine character, exactly as every SKU already
does, additive and independent. **No boost input is needed and none is added.** A forced-induction
engine gets more from the same work because that is what the fractions say, not because a new
mechanic was built to say it.

**The figures are in `machining-performance-table.md`** and are not restated here, so there is one
copy. What matters to the design: machining scales with the grade of the part being machined (a
better part can use more of what machining unlocks), and **a machined part never reaches the next
grade up**, on any engine character. That interleaving is what keeps the money ladder meaningful
while machining stays worth doing, and it is structural rather than tuned.

**Marginal operations are a lesson, not a defect.** Machining the internals of a naturally
aspirated engine is worth under one per cent for a full labour slot. That is the correct answer:
the player should learn not to do it, and spend the labour somewhere it pays. An operation being
poor value on one engine and excellent on another is the system working.

**One inherited oddity, so it is not filed as a machining defect.** Fitting forced induction to a
naturally aspirated car does not change its engine character: a turbocharged Beat stays
`high-strung-na` forever. So on a converted car, milling still pays its NA power even though the
engine is now boosted and the operation would in life be the wrong call. That is the power model's
behaviour rather than machining's, it predates this feature, and machining only makes it visible.

### Support: the door that has to open

Five operations are support-side and two of them (**O-ringing the deck**, **con-rod shot peening**)
give no power at all, by design: they exist for support, which is what they are for on a real
engine and what stops machining being paid twice for one job. Today `slotContribution` derives
`spec` from one expression, `specByGrade[part.grade]`, and a machined original part is `stock`,
which is 0. **Without this, those two operations would be literally inert.**

An operation therefore carries its own `spec` contribution, added to the slot's grade-derived one.
This is the smallest possible opening: the support model keeps reading grade, and machining adds to
what it reads rather than replacing it. It also honours `support.ts`'s own stated reason for reading
grade rather than band, that specification does not decay, which is precisely the category machining
belongs to.

### Reliability: small by design

A machined engine runs closer to its limits. One lever, applied per operation, defaulting low
enough that the effect is a few percentage points across a full build rather than a deterrent.

Whether machining gains also feed `totalGainFractionOf`, and so the existing intensity term, is
settled in the implementing sprint: they describe the same thing (more energy through every part)
and double-charging it would make the small lever misleading.

### Value: a machined part is a dearer part

**A machined part is worth more money.** A machined race block is a better object than a race block.
This is not performance moving value, which never happens and must not start here: it is the part
itself being worth more, on the same axis where a race block already outranks a street one.

**Machining requires the part at `mint`.** You do not bore a worn block, you rebuild it first, and
the game should say so.

`installedPartsValueYen` currently skips `grade === 'stock'`, so a machined stock part would add
nothing at all. That has to change, or the value ruling is inert on exactly the restoration case
machining exists for.

**`beyondDiscount` is NOT what this activates, and the two have come apart.** That lever scales
outstanding repair work and is subtracted, so a flagship's structurally-zero outstanding bill leaves
it multiplying nothing. Machining cannot reach it by any route. It stays dead content and wants its
own answer.

### Why not a new SKU per machined part

Making "race block, machined" a real SKU was considered and rejected on measurement. A
transformation needs every intermediate state to exist as a part, so it is the full subset lattice
rather than one entry per operation: **864 new SKUs, taking the catalogue from 472 to 1,336**, with
`internals` alone growing to 512, more than the whole shipped engine group. The only escape was
ruling each slot's operations into an ordered ladder, which would cost the operations their
independence: no O-ringing without boring first.

A property keeps every tier machinable, keeps the operations independent, and adds nothing to the
catalogue.

### The work itself

Reuse the existing job system. Directive 16 exists because a parallel job system was built here
once and had to be reworked.

## Settled

**Generated cars never arrive machined**, for now. It would put an irreversible property on a car
the player did not choose. Revisit once the mechanic is in players' hands.

**A machined part can be sold.** It travels with the part, so the bin and the market are already
reachable, and a machined block changing hands is a good trade to have in the game. **It wants
measuring before it ships**: a player who machines cheap blocks to sell is either a nice emergent
business or an exploit, and only the numbers will say which.

**Machining happens on its own workshop page.** `workshop-topology.md` records that the facility
does not exist, so this sprint builds it.

**The page shows everything to begin with**: every operation, its power on this engine's character,
its support contribution, its authenticity cost, its labour, and what it does to reliability. Strip
back once it has been used rather than guessing now what a player does not need.

## To measure during implementation

Not open design questions. Each has an answer the arithmetic gives, and the sprint carries them.

1. **Does the reliability cost feed `totalGainFractionOf`?** It and the intensity term describe the
   same thing, more energy through every part, so charging both would make the small lever
   misleading.
2. **Machining for resale.** A machined part can be sold, so a machining job turns labour into yen.
   Whether that beats the alternatives per labour point decides whether the sale value of a machined
   part needs answering for it.
3. **Parting out a machined car.** If the premium reaches a loose part more readily than an
   installed one, a fully machined car is worth more in pieces than whole, by construction. Measure
   both paths.

## What this closes

- `machiningCost` stops returning a literal 0.
- Engine tool tier 3 gets its purpose, which the design docs have promised it for some time.
- The last unbuilt avenue of the tuning model.

## What this deliberately does not do

- **It does not revive `beyondDiscount`.** That lever stays dead and wants its own answer.
- **It does not add a band above `mint`.** Machining requires mint and produces a dearer part, not
  a higher condition.
- **It does not touch weight.** Flywheel lightening was cut for that reason; weight reduction is
  parked in `TODO.md` as its own system.
- **It does not machine anything outside the four engine slots.** The performance table records
  which slots were excluded and why, so nobody adds them by accident.
