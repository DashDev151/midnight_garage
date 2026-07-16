# Diagnosis - the detective game

*Feature spec, v2 (2026-07-15). Status: NOT scoped into a sprint. Supersedes v1 (the four-layers
/ hidden-deviation draft) in full: design discussion 2026-07-15 rejected pay-to-reveal as loot-box
shaped and rebuilt the mechanic around symptoms, causes, and tests. This remains a return to
canonical GDD scope (§3.2, §4.1, §6.5, §7): inspection costs 1 labour slot plus a travel fee,
hidden issues exist, hints exist. What changed is HOW knowing works.*

---

## The fantasy is the spec

The yard opens at 6. The auction starts at 8. You have the hour, a torch, and a compression
tester. There are forty cars and three of them are interesting: one smokes, one clunks over bumps,
one will not start at all. The room has already priced its fear into all three. Your job is to
find out, car by car, whether the fear is wrong.

That is the game: House MD with cars. Decision-paced throughout, no reflex input anywhere.

## Why v1 died (recorded so it stays dead)

v1 hid a rolled deviation behind a paid reveal. The maintainer killed it with one dichotomy: if
the value exists whether or not you inspect, the fee is dead weight; if the fee gates the value,
it is a loot box. Any mechanic shaped "pay to reveal a pre-rolled outcome" fails one horn or the
other. The fix is structural: **the paid action must be a test that resolves the player's
hypothesis, never a purchase of an outcome.** Value is converted through the player's bid at a
contested auction, not through a fee-gate on the car.

## The model

### Symptoms are free, honest, and public

A generated car may carry zero or more **symptoms**: diegetic lines on the lot card ("smokes on
startup", "clunk over bumps", "non starter", "slight tick at idle"). Symptoms are visible to
everyone, player and rivals alike, for free. Most cars have none and are exactly what they look
like; the existing sheet (Sprint 50's `computeAuctionGrade`) keeps covering visible condition.

### Every symptom has an open cause table

A symptom maps to a small authored set of possible causes (2 to 4), each mapping to concrete part
damage at a very different repair price. The list itself is public knowledge; the lot card shows
it with derived repair estimates:

```text
'92 Silvia K's        "won't idle"
  [ ] vacuum leak         ~15,000 yen
  [ ] tired ECU           ~90,000 yen
  [ ] worn cam lobes      ~120,000 yen
```

The car's TRUE cause was rolled at generation and is fixed. Nothing about the risk is hidden; what
is unknown is which cause this car has. Cause repair costs are never authored: they derive from
the existing centralised repair pricing (economy bible Law 4) via the part damage each cause
inflicts.

### Inspection is running tests

**One labour slot = one inspection visit to one auction house**, plus a per-tier travel fee
(trivial at the Local Yard, real money at the Collector Network). A visit grants a diegetic time
budget (the hour) spent across ANY lots at that house. Each test costs minutes and eliminates
causes:

- Cold start observation (10 min): smoke colour separates oil from coolant from fuel.
- Compression test (25 min): separates top-end from bottom-end causes.
- Undercarriage look (15 min): rules visible structural causes in or out.
- Carb cleaner spray test (10 min): confirms or kills a vacuum leak.

Results are diegetic plus a plain interpretation; the game does the bookkeeping (crossing entries
off the cause list), the player does the choosing. Which cars get the hour, and which tests they
get, is the whole minigame. **Partial resolution is normal**: killing the worst case and bidding
with a cushion is a good hour's work.

- No bulk action, ever. The hour is the scarcity.
- Tests are reliable. A fallible inspector is RNG resentment; the tension is which tests to run,
  not whether the tester works.
- An owned car on the lift: 1 slot, no fee, no clock, full workup. The hour-pressure game lives
  only at the yard, where the stakes are.
- Buying unresolved is legitimate: the cause list rides home with the car, and the bench tells the
  rest. Per `component-hierarchy-spec.md`, uninstalling a part reveals its true condition (it is
  in your hands), so the reveal happens with the teardown labour already sunk and BEFORE the
  repair decision: you pulled the box expecting synchros, found a chewed gearset, and now choose
  repair, replace, or reassemble and sell honest. Fine on a flip, reckless on a deadline
  commission. Depth prices the information: tests on buried-slot symptoms are worth the most
  because reaching those slots costs the most teardown.

## The pricing law (maintainer ruling 2026-07-15)

**The room prices the symptom; the player prices the cause.**

- The auction house and every rival value a symptomatic lot off the symptom's **face-value fear**:
  a discount derived from the cause table's expected repair cost (weights times derived costs,
  through the same market-repair machinery as everything else), optionally times a small fear
  premium (content dial). Reserve, buyout, and rival bid caps all read this number.
- **Rivals never see inspection results.** Test outcomes are the player's alone. A rival bids the
  same pessimistic number before and after the player's hour under the car.
- The player's inspected estimate recomputes guide and bill from the RESOLVED causes.

The divergence between fear and truth is two-directional by design, and content wants both shapes
deliberately:

- **Sleeper factory**: high-fear symptoms whose common cause is benign. "Non starter" craters the
  room's bidding, and it is usually a dead battery; occasionally it is a seized engine, which is
  the trap inside the sleeper pile.
- **Trap factory**: low-fear symptoms with a fatal tail. "Slight tick at idle" barely dents the
  price, and it is usually a lifter; sometimes it is rod knock, which the room walks into and the
  informed player sidesteps.

**Guardrail (closed-form, coherence table, not a bot test):** blind-buying a symptom class at
sheet price must be roughly break-even over many lots. The fear discount tracks expected true
cost; any small fear premium stays small. If scary symptoms were systematically over-discounted,
buying every non-starter blind would beat inspecting and the mechanic dies. Per symptom:
`fearDiscountYen` versus `sum(weight * derivedRepairCostYen)` asserted within a tolerance band.

## Where the fun is

The reveal is never "surprise, +200,000 yen". It is **"I was right."** The player forms a
hypothesis from the symptom, spends scarce minutes testing it, and beats a room that priced the
average. Earned goldmines, walked-away traps, and the confident overbid on a car everyone else
fears. Knowledge compounds: the cause tables are stable, learnable content, so two hundred days in
the player prices "blue smoke, fades" from memory and spends the hour only where it pays. Veteran
knowledge lives in the player's head, which is the progression no meter can grant.

## Generation order

1. Roll the car exactly as today.
2. Roll symptom presence (chance keyed to tier and condition: rough, discounted cars carry more).
3. Per symptom, roll the TRUE cause from its weighted table; apply that cause's part damage to the
   true condition.
4. The sheet and all room-facing numbers read the pre-damage view plus the symptom's fear
   discount; every economic function on the sold/repaired car reads truth.
5. Run `enforceMaxBillFraction` on the TRUE car (economy Law 2). Non-negotiable; a hidden cause
   must never push a generatable car past the bill ceiling. The coherence table asserts it.

## How it fits everything else

- **Sprint 66 expectation bands**: a nasty cause drags a part below the tier's band, where
  `marketRepairDiscount` applies, so a lemon is recoverable work on a shitbox and a real hole on a
  rare car. That gradient is free and good.
- **Component hierarchy (component-hierarchy-spec.md)**: ships BEFORE diagnosis. It supplies the
  uninstall-reveals-truth verb this spec's ownership flow relies on, so diagnosis lands on the
  final repair model instead of being reworked one sprint later.
- **Story builds (story-builds-spec.md)**: hard interlock, diagnosis ships first. Deadlines and
  budget caps are what make buying unresolved spicy; without diagnosis a commission is a solved
  shopping list.
- **Service jobs**: unaffected now; the customer states tasks. A future sprint can have a customer
  walk in with a symptom instead of a task list ("it's making a noise"): same machinery,
  explicitly out of scope here.
- **Selling**: walk-in buyers price the true car, as today.
- **Sprint 27's pre-bid transparency law is repealed** (it contradicted GDD §6.5 from the day it
  landed; Sprint 56 already amended it once). Guide value is not hidden: an anchorless board is
  how the market seized in Sprint 27. Symptomatic lots show honest estimates off the sheet plus
  the open cause list.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- `computeAuctionGrade` (Sprint 50): unchanged, still the visible-condition sheet.
- The Sprint 34 generation chain: symptom and cause rolls are appended steps, not a new pipeline.
- `enforceMaxBillFraction` (Sprint 54): runs unchanged, on the true car.
- Centralised repair pricing (economy bible Law 4): cause costs derive through it.
- Labour slots and the day-action machinery: an inspection visit is a 1-slot action.
- Rival bidding and reserve pricing: they already price off a lot valuation; the fear discount
  plugs into that same number.
- `provenanceNote` and the flavour-pool idiom (`serviceJobTemplates.json` `flavorPool`): the
  symptom line pools follow the same content shape.
- The ServiceTaskList checklist idiom (`[ ]`/`[x]`): the cause-list UI reuses the look.
- The Sprint 52 `machineListing` precedent for per-tier fees in content.

**Genuinely new:**

1. Symptom and cause-table content (JSON, Zod schema): symptom line, fear derivation inputs,
   weighted causes, per-cause part damage, test-result copy.
2. Test definitions (minute costs, which causes each discriminates) in content.
3. The inspection-visit day action, its hour budget, and `resolvedCauses` state per car.
4. The inspection UI: cause checklists on the lot card, the visit screen with tests and the
   countdown, the mid-repair discovery moment.
5. The fear-discount hook in lot valuation and the coherence-table guardrail.

## Hooks, not scope

- Tool tiers can unlock better tests later (a leak-down kit separating what compression cannot).
- The Auction Rat staff trait becomes "extra minutes at the Local Yard" once staff exists (the
  trait is content-only today; do not grow a staff dependency here).
- Rare positive provenance windfalls (undisclosed options) can ride as flavour on the sale side;
  they are seasoning, never a paid layer.

## Dials, decided (defaults set 2026-07-15; tune from play, all live in content)

1. **The hour**: 60 minutes per visit; tests cost 10 to 30 minutes each (authored per test), so a
   visit covers roughly one deep workup plus one quick check, or three quick checks across lots.
2. **Fear premium**: 1.10. The room over-discounts a symptom by 10% of its expected cost, so
   engaging with symptomatic lots is gently positive-EV before any testing, and the guardrail
   band stays tight.
3. **Symptom frequency** (chance a generated car carries at least one): shitbox 0.45, common
   0.30, uncommon 0.22, rare 0.12; conditional chance of a second symptom 0.15; hard cap 2 per
   car.
4. **Travel fees per visit**: local-yard 2,000 yen, regional 8,000 yen, premium 20,000 yen,
   collector-network 50,000 yen.
5. **Bench-only ambiguity**: yes. At least one symptom's cause pair is separable only by the
   owned-car workup or the bench, so partial information is a real state the yard hour can end in.

## Definition of done

- Symptomatic cars generate with fixed true causes; the room's pricing reads fear, the player's
  resolved estimate reads tests, all economics read truth; Law 2 holds on every generatable TRUE
  car and the coherence table asserts the blind-buy guardrail per symptom.
- Inspection visit is a 1-slot, per-house, per-tier-fee action with an in-visit time budget and
  per-test costs; owned-car workup is 1 slot, complete.
- Cause lists render on the lot card and the car page; unresolved causes carry to ownership;
  uninstalling an implicated part reveals its truth on the bench before the repair decision (via
  the component-hierarchy reveal hook).
- All symptom, cause, test, fee, and fear numbers live in `packages/content`.
- Bots do not inspect (harness rework in `TODO.md` still pending); every harness figure touching
  symptomatic lots is disclosed as such, not force-passed.
- No em dashes, no decorative Unicode, yen throughout.
