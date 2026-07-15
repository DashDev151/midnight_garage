# Diagnosis - the information game

*Feature spec, first draft, 2026-07-15. Status: NOT scoped into a sprint. This restores a system
the GDD already specifies (§3.2, §4.1, §6.5, §7) and that actual-Sprint 26 paused and removed. It
is therefore a RETURN to canonical scope, not new surface: no GDD amendment needed. It does require
retiring one law that has been contradicting the GDD since Sprint 27 (see "What this retires").*

---

## The fantasy is the spec

You are standing in a cold auction yard at 6am with a torch and one hour. There are forty cars.
You cannot look at forty cars. The sheet says grade 4, the paint looks straight, and the bloke
next to you says it smokes on startup. Do you spend your morning crawling under this one, or do
you bid on the paperwork and hope?

That is the game. It does not exist right now.

## What is actually wrong today

The player sees **everything, for free, before bidding**: exact per-part condition bands, the exact
restoration bill, the exact guide value. Buying is therefore arithmetic - read the guide, pay less
than it, done. There is no hunt, no risk, no reason to spend a labor slot before bid day, and no
verb between "hunt" and "build".

This is a real deviation from the canonical doc, not a gap in it. The GDD specifies:

| GDD | Says | Built |
|---|---|---|
| §3.2 | "Inspect an auction car properly: 1 slot (else you bid on photos alone - risk!)" | no |
| §4.1 | "**Hidden issues** revealed only by inspection (rust in the rails, blown turbo seals, accident history)" | removed (Sprint 26) |
| §6.5 | "each lot shows photos, mileage, an auction grade (paperwork), and *hints*" | grade yes, hints no |
| §6.5 | "**Inspection** (1 labor slot + travel fee) reveals hidden issues before bid day" | no |
| §6.5 | "**sliding-scale lemons:** hidden-issue variance scales with discount from book value" | no |
| §7 | staff trait *Auction rat:* free inspections at Local Yard | trait content exists, system does not |

Half the architecture is already standing. Sprint 50's `computeAuctionGrade` IS the auction sheet
§6.5 asks for - an overall number grade plus exterior/interior letters, partitioned so nothing is
scored twice. It was built as a display-only summary of visible truth. It becomes the **free
information layer**, which is what it was always shaped like.

## The model: four layers of knowing

Every layer is honest. Nothing lies to the player. The layers differ in **precision**, not
truthfulness.

| Layer | Cost | Tells you |
|---|---|---|
| **1. The sheet** | free | `computeAuctionGrade` over APPARENT condition: overall grade, ext/int letters, R flag. Plus year, mileage, colour, provenance. |
| **2. Hints** | free | One diegetic line per hidden issue, naming the GROUP, never the part or the severity: "smokes on startup", "sat a long time", "panel gaps aren't factory". |
| **3. Inspection** | 1 labor slot + travel fee | The truth for THIS lot: real per-part bands, real bill, real guide value. Permanent for that lot. |
| **4. Ownership** | - | Reveals nothing by itself. §4.1: "revealed only by inspection". A bought car you never inspected is still a mystery on your own ramp. |

Layer 4 is the one that makes **diagnosis a real verb in the loop** rather than a pre-bid tax.
Inspecting a car you already own costs 1 slot and no travel fee. So the loop becomes:

**hunt → diagnose → build → sell**

...which is what the loop has always claimed to be.

### Apparent vs true condition

One new field on the rolled car: every part has its real band (as today) and the generation step
additionally records what the sheet *shows*. The sheet is built from `apparent`; every economic
function keeps reading `true`.

Generation order (extends the existing Sprint 34 chain, does not replace it):

1. Roll the car exactly as today. This is **apparent** condition.
2. Compute apparent guide value. `listedDiscount = 1 - apparentGuide / model.bookValueYen`.
3. **Variance budget** = `f(listedDiscount)` - a content curve. Near book: near zero. Deep
   discount: wide.
4. Roll a hidden deviation inside that budget, signed. Negative = lemon. Positive = goldmine.
5. **True** condition = apparent + deviation. Run the existing `enforceMaxBillFraction` guard on
   TRUE (see Law 2 below).

This resolves §6.5's apparent circularity ("variance scales with discount" - but discount depends
on condition) by ordering it: the LISTED discount is knowable before the hidden roll, because it is
computed off apparent condition against a static `bookValueYen`. A car that already looks rough is
the one that might be even rougher - or might be hiding a genuine one-owner history.

It also delivers the GDD's promise literally: *"a fair, honest purchase is always safe enough to
learn on"* falls out of the curve, it is not a special case.

## Costs, pros, limitations

**Cost.** 1 labor slot + a travel fee (per auction tier - Collector Network is a long way away).
The slot is the point. With 6 slots/day and a busy board, **you cannot inspect everything**, so
inspection competes directly with repair work for the day's labor. That is §3.2's "what do we work
on today?" crunch, applied to the hunt.

**Pro.** You bid on truth instead of paperwork. You learn the real bill before committing. On your
own car, you learn what to fix.

**Limitations, deliberately.**
- Inspection is **per lot**, and dies with the lot. Inspecting a lot you then lose is spent labor.
- It reveals, it does not repair. Knowing the block is cracked does not uncrack it.
- The travel fee makes speculative inspection of cheap lots genuinely marginal - which is exactly
  the tier where the slot machine lives.
- **No inspection-all button, ever.** The scarcity IS the mechanic.

**What makes it a decision rather than a tax.** If inspection were strictly +EV and always
affordable, it would be a mandatory click. Three things stop that: the slot budget (you have 6, the
board has ~12), the travel fee (real yen on a cheap lot), and hints (a free, partial signal that
lets you *target* inspection instead of sampling at random). The skill is choosing which cars to
look at.

## How it fits the economy (the part that must not break)

- **Law 2, no value traps.** `enforceMaxBillFraction` MUST run on TRUE condition, after the hidden
  roll. Otherwise a hidden lemon could push a generatable car past the bill ceiling and reopen the
  value trap Sprint 54 closed. Non-negotiable; the coherence check should assert it.
- **Sprint 66's expectation bands.** A hidden issue drags a part BELOW the tier's expectation band,
  which is where `marketRepairDiscount` (1.5) applies - so a lemon is not just a loss, it is
  *work*, and work below the band pays. A lemon on a shitbox is recoverable; a lemon on a rare car
  is a real hole. That gradient is free and it is good.
- **Reserve and buyout** price off the SHEET (the auction house graded it and does not know either).
  Consistent, and it keeps Sprint 27's hard-won lesson intact: value and reserve stay coupled to
  the same number, which is what stopped the market seizing.
- **Rivals bid on the sheet too.** They are not omniscient. If rivals knew the truth, every cheap
  lot would be a trap they had already avoided and the goldmine tail would not exist. Hidden value
  is genuinely hidden from the room; inspection is the player's edge, not a catch-up mechanic.
- **You buy on the sheet, you sell on the truth.** Walk-in buyers price the real car. That
  asymmetry IS the flip's risk, and it is the thing that has been missing.
- **Service jobs are unaffected.** The customer TELLS you what they want done. A stated task list
  needs no diagnosis. (An "upsell what else you found" mechanic is a real idea and explicitly out
  of scope here - flag it, do not build it.)

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**
- `computeAuctionGrade` (Sprint 50) - already the sheet. Point it at apparent condition.
- The Sprint 34 generation chain - the hidden roll is one more step on the end, not a new pipeline.
- `enforceMaxBillFraction` (Sprint 54) - runs unchanged, on the true car.
- Labor slots and the job system - inspection is a 1-slot job, not a new resource.
- `marketValueYen` / `carCostToMintYen` - untouched; they read the true car. The *estimate* is the
  same functions over the apparent car.
- `LotDetail` / the car page - both gain a "sheet vs inspected" state, not a new screen.
- The Sprint 52 `machineListing` precedent for per-tier travel fees in content.

**Genuinely new:**
1. An `apparent` condition record on a generated car, and the hidden-deviation roll.
2. The variance curve keyed on listed discount.
3. A hint pool (content) and its generation.
4. An `inspect` day-action + `inspectedLotIds` / `inspectedCarIds` state.
5. The estimate-vs-truth UI state on the lot card and the car page.

## What this retires

**Sprint 27's pre-bid transparency law is repealed.** It has been contradicting GDD §6.5 since it
landed, and the GDD is canonical for mechanics. Sprint 56 already amended it once (grade stamps
replaced band chips on the card) - this finishes the job. The lot card keeps its grades, gains
hints, and its guide/bill figures become clearly-labelled **estimates off the sheet** until
inspected.

Guide value is NOT hidden outright. An anchorless board is how the market seized in Sprint 27, and
the estimate is an honest number - it is what the car is worth *if the sheet is right*.

## Decisions needed from the maintainer

1. **The variance curve's shape.** How brutal is a deep-discount lot? This is the single dial that
   decides whether the slot machine is thrilling or infuriating.
2. **Does a hidden issue ever go the player's way?** The GDD says yes (goldmine: undisclosed rare
   options, genuine low mileage). Confirm - a signed deviation is more work than a one-sided one.
3. **Does ownership reveal?** I propose no, per §4.1's literal "revealed only by inspection",
   because it is what makes diagnosis a loop verb. It is also the harshest reading. Confirm.
4. **Travel fee scale.** Free at Local Yard (the *Auction rat* trait implies a nonzero baseline
   there), rising to real money at Collector Network?

## Definition of done

- A generated car carries apparent and true condition; the sheet, hints, reserve and buyout read
  apparent; every economic function reads true; `enforceMaxBillFraction` runs on true and the
  coherence table asserts it.
- Inspection is a 1-slot job with a per-tier travel fee, per lot, permanent, with no bulk action.
- An uninspected car - lot or owned - shows grades, hints, and estimates clearly marked as such;
  inspecting replaces them with truth.
- The variance curve, hint pool, and travel fees all live in `packages/content`.
- Probes: a fairly-priced lot's true bill never deviates more than the curve's floor; a
  deep-discount lot can deviate both ways; Law 2 holds on every generatable TRUE car.
- Harness: bots inspect (they currently cannot; the harness rework in `TODO.md` is a prerequisite
  for trusting any figure this produces - disclose, do not paper over).
- No em dashes, no decorative Unicode, yen throughout.
