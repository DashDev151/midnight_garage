# Consumables you buy and keep

**Status: BUILT, 2026-08-04.** Raised in the playtest of 2026-08-03 and implemented as designed.
Every price below is what shipped.

**Verified: the per-car economy did not move.** A full solid respray is 12,600 as three small tins,
exactly what nine per-use charges cost before, or 11,350 as one large, which is the bulk discount the
player chose to take.

**One consequence worth knowing.** A single-panel job now costs 4,200 up front rather than 1,400,
because you buy a tin rather than a squirt. Two uses stay on the shelf, so nothing is lost, but cash
leaves earlier. That is stock working as intended and not a price rise.

**Stock counts USES, not tins**, which is why a small and a large tin of the same colour merge on the
shelf: once bought, they are the same paint. Size only decides how many uses a purchase adds and what
it costs.

**The staged-job question is answered: staging stays free.** A stage can be planned with no stock at
all, exactly as a repair can be staged with no cash. Confirm is where it is checked, and an action
short of materials refuses on its own while the rest of the batch resolves. That is the same
treatment an under-laboured repair already gets, so it needed no new rule.

## The complaint, and it is right

Today a consumable is charged into a stage's cost line the moment you work it. You never buy filler,
you never keep primer, and you never run out of paint. The maintainer:

> I want to buy body filler, sanding paper, primer, paint (different colours), underseal, polish etc.
> We should make these all purchasable parts in a consumables sub menu, with all of them having set
> use rates (a tin of putty can do 4 panels, a paint tin can do a whole car). That makes it much more
> interesting than just auto charging the player a set amount for work. That's not fun, it's tax.

**A charge you cannot see, cannot plan for and cannot run out of is a tax.** A shelf with two tins of
primer on it is a decision.

## What changes

**A consumable becomes something you buy, keep, and use up.** The workshop stops conjuring materials
and starts drawing them off a shelf. A stage that needs primer and finds none refuses, exactly as a
stage that needs a panel and finds none already refuses.

## Not a `PartInstance`

Parts carry a condition band, provenance, a donor car and a history. **A tin carries none of that:
tins are fungible.** Two tins of primer are the same tin.

So consumables are **a count, not an inventory of objects**: `consumableStock`, a map of consumable
id to how many you have. That is smaller than the parts inventory, needs no per-instance identity,
and cannot drift into a second parts system.

## Paint carries a colour, and that is the point

A tin of paint is mixed to a colour. **Buying paint means buying a colour**, which makes restoring a
car to its factory shade a deliberate purchase rather than a menu choice, and makes a wrong-colour
respray a consequence of what was on the shelf.

**It does NOT mean a SKU per colour.** 34 colours times 3 finishes would be 102 catalogue entries for
no gain. Paint stock is keyed by what it is: finish and colour together. You order a tin of a shade,
the same way you would take a paint code to the factor.

## Use rates, and why the prices must move with them

**This is the part that is easy to get wrong.** A tin that does a whole car cannot cost what one
zone costs today, or bodywork gets nine times cheaper by accident.

The rule is the one the maintainer already approved for the zone rescale: **hold the per-car total.**
A tin's price is its per-use price times how many uses it holds.

**Bigger tins leave MORE on the shelf, not less.** A tin doing eight panels when the car needed three
leaves five behind; a tin doing two leaves nothing. That is the whole trade, and it is why paint
needs a different answer from everything else.

### Paint comes in two sizes, because paint is colour-locked

A tin of paint is mixed to one colour, so **leftover paint can be dead money**: buying a whole car's
worth of a shade to touch up one wing means twelve thousand yen of a colour that may never be used
again. Two sizes fixes that without making a full respray tedious.

**The large tin is slightly cheaper per panel**, so buying ahead for a full job is rewarded and
buying small for a touch-up is not punished.

| paint | small, 3 zones | large, 9 zones | per zone, small | per zone, large |
| --- | ---: | ---: | ---: | ---: |
| solid | 4,200 | **11,350** | 1,400 | 1,261 |
| metallic | 8,250 | **22,300** | 2,750 | 2,478 |
| pearl | 12,450 | **33,600** | 4,150 | 3,733 |

A whole-car respray is three small tins at 12,600, or one large at 11,350. About ten per cent for
committing up front.

### Everything else is one size, and that is deliberate

Primer, polish, filler and paper are **locked to nothing**. A large tin of primer always gets used
eventually, so a second size would be extra SKUs buying nothing.

| consumable | per use today | uses per tin | tin price | covers |
| --- | ---: | ---: | ---: | --- |
| `filler` | 1,250 | 4 | 5,000 | four panels, so a rough car needs two |
| `paper` | 350 | 4 | 1,400 | four panels |
| `primer` | 650 | 9 | 5,850 | a whole car |
| `polish` | 450 | 9 | 4,050 | a whole car |

**A player who paints a whole car pays what they pay today**, give or take the bulk discount they
chose to take. Nothing about the economy moves; what moves is when you pay, whether you can be caught
short, and whether planning ahead is worth anything.

## What it makes possible, once it exists

- **Running out**, mid-job, on a Sunday. A real reason to keep stock.
- **Buying ahead** when cash is good, which is a decision rather than a menu.
- **Mastery mattering to material**, which was rejected as a standalone idea because yield with no
  stock is invisible, but is felt immediately once tins are finite.
- **Underseal coming back.** It was deleted with the chassis zone; it belongs on the shelf.

## Levers (directive 22)

**Approved 2026-08-04.** Two paint sizes, small covering 3 panels and large covering 9, with the
large slightly cheaper per panel. Every price above follows arithmetically from the per-use prices
already approved for the zone rescale, so **no per-use cost moves**: a full respray lands within ten
per cent of today either way, and that ten per cent is a bulk discount the player chooses.

Still open, and neither blocks a first build:

1. **Whether a part-worn tin can be sold**, and for how much.
2. **Whether the store stocks every colour**, or only some, with the rest to order. The second is more
   interesting and gives the parts shop a reason to be somewhere you travel to.

## Open

- **What happens to a job already staged when stock runs out.** Refusing at Confirm is honest but
  could strand a player mid-plan.
- **Whether consumables live in the warehouse room** once the world work matures. They probably do.
- **Whether buying paint requires knowing the colour code**, which would make the inspection of a
  resprayed car worth something.
