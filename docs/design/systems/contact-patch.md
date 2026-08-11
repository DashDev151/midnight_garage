# Contact patch: wide bodywork, wide tyres

**Status: DESIGN, unsigned. Nothing here is built.**

The maintainer's goal: *"make wide bodyparts a prerequisite for wider tyres."* Over-fenders exist to
cover a wider track, so bodywork stops being cosmetic and becomes the gate on the grippiest rubber.

## The finding that decides the whole design

**The locked performance model already has a tyre-width term, and it is already physically honest.**
`performance.ts` computes it and `formulas.md` documents it as design of record:

```
we = clamp((cm - 0.7) / 0.3, 0.4, 1)
wa = clamp((width - 200) / 1100, -0.03, 0.045) * we
mu = cm + wa
```

Linear in width, hard-clamped at both ends to model saturation, and scaled by `we` so **better
rubber gains more from area than a hard touring tyre does**. That last coupling is the physically
correct part: the adhesive component of rubber friction is the part that scales with contact area,
and it is a larger share of a soft compound's grip.

**What is missing is any route from a fitted part to it.** `tyreWidthMm` reads
`model.spec.stockTyre` and nothing else. `handling.md` states the gap outright: *"No part changes
it; a wider tyre is not purchasable."*

**So the physics is done. Only the wiring is not.** This design adds no formula.

## The mechanism: recompute the existing term, apply the difference

```
fittedWidthAdj = wa(fittedWidthMm) - wa(stockWidthMm)
mu = cm + wa(stockWidthMm) + fittedWidthAdj
```

**One function, called twice.** Not a second width term.

That single choice answers every objection raised against bolting a new term on top:

| objection to a second term | why this avoids it |
| --- | --- |
| the `+0.045` saturation clamp is escaped | both calls go through the same clamped function, so a car already near the ceiling gains almost nothing, which is what saturation means |
| an absolute delta gives a kei car and a GT-R the same gain | each car is measured against **its own** stock width |
| two width blocks with different reference points | there is one block, read twice |
| the `we` compound coupling has to be duplicated or dropped | it is inside `wa`, so it applies to both calls for free |

## Why this satisfies the zero-revalidation checklist

The model is validated to about 2 per cent against 45 driven laps, and `harnessAcceptance` holds
every shipped car on every course to a tenth of a second. Four conditions make this change provably
invisible to both:

1. **`computeGrip(model, spec.tyreCompound)` returns bit-identically.** At stock width
   `fittedWidthAdj` is `wa(w) - wa(w)`, which is exactly zero. Not approximately.
2. **`trackOf` stays pinned to stock width.** See the hazard below.
3. **The new term is reachable only through a `CarInstance`.** Every calibration run and every
   harness run passes a bare `CarModel`, so none of them can see it.
4. **No existing constant moves.**

**Every validation car is stock.** So the harness stays bit-identical on all 45 cars and the driven
laps are untouched. That is a property of the construction, not an argument about magnitudes.

**A redistribution would not have this property**, which is why it is rejected: splitting existing
grip between compound and width moves the 15 formula-only cars, and 1 per cent of `mu` is 0.7 to 1.5
seconds at Hakone against a 0.2 second tolerance.

## The hazard, and it is real

`trackOf` reads width too, and it is a **step function**: crossing 245 mm flips track from 1470 to
1560 mm, which changes the weight-transfer term. At a typical centre-of-mass height that is a
**+1.4 per cent jump in `mu` at exactly one millimetre of width**.

**`trackOf` must keep reading the car's stock width.** Fitted rubber does not widen the chassis; that
threshold is classifying the car, not the tyre. Leaving it stock also satisfies checklist point 2 for
free.

## Where the fitted width comes from

**Wide tyre SKUs, carrying an explicit width, gated on bodywork.**

Rejected alternatives, with reasons:

- **Width from the bodywork alone**, so over-fenders grant grip directly. Simpler, but it makes body
  panels a performance part and removes the tyre as the decision. The maintainer asked for bodywork
  as a **prerequisite for wider tyres**, not as a substitute for them.
- **Width implied by grade**, so race slicks are automatically wider. It conflates compound and
  width, which the model deliberately treats as orthogonal (that is what `we` is for), and it would
  change existing race tyres, breaking checklist point 1.
- **A tyre `physicalModifiers.grip`**, the zero-physics option. Rejected: it breaks a LOCKED law
  (`README.md` section 7c), requires **deleting** a live test rather than adjusting it, escapes the
  saturation clamp, and lifts the maximal build above the x1.40 acceptance pinned against two driven
  cars. It is cheaper to write and more expensive to own.

**The shape:** tyre SKUs gain an optional width field, absent on all sixteen existing SKUs so nothing
moves. New wide variants carry a width expressed as a **delta over the car's own stock width**, so
one authored number is proportionate across a roster spanning 145 to 245 mm.

Minimum authoring: wide variants of **sport and race only**, four fitment classes, so **eight new
SKUs**. Nobody fits wide eco tyres.

## The gate

`partCapabilityRequirement` is the single choke point every install path runs through, it already
takes a `CarInstance`, and its own doc comment anticipates a bodywork-derived rule. The predicate is
the four corner zones at `sport` or `race` `panelGrade`, with `panelMissing` false, which
`fittedZonePanels` already walks.

**Two blockers, both real:**

1. **The sport and race body panel gate was signed in sprint 191 and never built.** Over-fenders are
   currently ungated, so the prerequisite does not yet exist to depend on.
2. **"You need over-fenders" cannot be expressed as a tool tier.** `partCapabilityRequirement`
   returns a `{ group, level }` pair and callers turn a non-null into the `job-blocked` reason
   `'tool-tier'`. Saying that would name the wrong thing. An honest refusal needs a new literal in
   the reason enum, which is a `GameState` log-schema change.

## What it delivers, and the one thing to look at before signing

**Small cars gain most.** Because each car is measured against its own stock width and the clamp
saturates, a kei car on 145s gains several times what a flagship on 245s gains from the same
authored delta.

**That is the model talking, and it is physically right** - load sensitivity means a narrow tyre
under the same load benefits far more from extra section. It also makes wide-arch kei builds
genuinely worthwhile, which is characterful and true to the era.

**But it should be measured before it is signed**, because a flagship gaining almost nothing from a
visibly dramatic modification may read wrong in play even when the physics is correct. **No shipped
car is currently at the top clamp** (the widest is 245 mm against a clamp that bites at 249.5), so
there is headroom on every car; the question is whether the gradient across the roster feels right.

## Levers this will need

None are proposed here. Signing wants measurement first:

- the authored width delta for a wide tyre, one number
- whether sport and race panels grant different widths, or the same
- the body level the panel gate requires, already signed in sprint 191 at level 3 but unbuilt

## What this does not do

It does not model unsprung mass, rolling resistance, aerodynamic drag from a wider track, warm-up,
or the downside of a wide tyre on a road car. `PhysicalModifierSchema` cannot express a grip penalty
or a mass increase, so **a wide tyre in this design has no cost except money and the bodywork it
demands.** Whether that needs a counterweight is a design question this document does not answer.
