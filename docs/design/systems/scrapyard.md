# The scrapyard (解体屋)

**Status: IDEA, captured 2026-07-28 from the maintainer. Not designed, not scheduled.**
Written down so the thinking survives; every mechanic below is a proposal, and the
economic numbers are all unapproved.

## The maintainer's ask, in their words

A new shop where the player can find used parts and "really fuckedup cars, like half
the parts are missing and the other half is poor or worn". Players can also sell
scrap and poor parts here "for a small profit, like steel scrap value small". This
is also where "scrap the chassis" goes, so the shell is actually sold to somebody
rather than evaporating. The point is an outlet where, with luck and some digging,
the player finds usable parts cheap instead of paying full retail for new ones.
Possibly with a puzzle mechanic in the spirit of the inspection game.

## 1. Why it is worth building, beyond flavour

**It gives the parts economy a supply side.** Today there is exactly one way to
obtain a part you do not already own: buy it new at full retail. That makes repair
a pure cost and it makes the parts catalogue a vending machine. A yard introduces
the choice every real mechanic makes twenty times a week: new and certain, or used
and cheap and a gamble.

**It gives the teardown loop a source.** The four-play ordering settled in Sprint
133's follow-up makes stripping a car deliberately unprofitable, which is correct
for a car worth buying whole. But it leaves the loop the maintainer actually wants
(buy a part car, strip it, recondition, use the parts) without a good subject. A
yard that sells half-stripped wrecks is that subject: a car nobody would repair,
bought for the four good parts on it.

**It gives `poor` and `scrap` parts an honest exit.** At the settled resale curve a
poor part fetches about 3 per cent of new, which is correctly near-worthless but
means the player's warehouse silts up with things not worth the click. Steel money
at the yard is a clean-out, not a business.

## 2. What the player does there

Four transactions, in rough order of importance:

1. **Buy used parts.** The core of it. Cheaper than new, with the catch in
   section 3.
2. **Buy wrecks.** Cars generated with slots genuinely missing and the remainder
   `poor` or `worn`. Bought for harvest, not repair.
3. **Sell scrap and poor parts.** Weight money. Small, certain, instant.
4. **Sell a shell.** `scrapShell` stops being an abstract payout and becomes a
   transaction with a counterparty.

## 3. The catch, which is the whole design

A yard that reliably sells the part you need at half price destroys the parts
economy that was just calibrated. It has to be **unreliable in a way the player can
work with**, not merely expensive. Three constraints, any two of which are probably
enough:

- **Stock is what it is.** A rotating, limited inventory. The yard has what it has;
  it does not have your part because you want it. This alone does most of the work,
  because it makes the shop the thing you fall back on when the yard fails you.
- **Condition is uncertain until you look.** The game already has the primitive:
  `CarInstance.apparentBandByPartId` and the whole diagnosis mechanic exist to
  express "what it looks like" versus "what it is". A yard part shows an apparent
  band; the true one is revealed by inspecting, or by fitting it and finding out.
  **Reuse that, do not build a second uncertainty system.**
- **Digging costs time.** Surfacing more of the yard's stock costs labour points,
  the same currency as everything else. That makes "spend the morning at the yard"
  a real decision against "spend the morning at the bench".

The puzzle the maintainer floated fits precisely here. The inspection game is a
routing problem under a time budget: which tests, in what order, before the clock
runs out. A yard visit is the same shape with a different question, which is not
"what is wrong with this car" but **"which of these is worth taking home"**. Same
mechanic, different verb. That is the strongest argument for it: it is not a new
system, it is the existing one pointed at a new object.

## 4. Economic implications, unresolved

Every number here is unapproved and several are load-bearing.

**Used part price.** Presumably a fraction of new, and it must sit above what the
player gets for selling one (currently 0.30 of new at mint) or the yard becomes a
laundering machine: buy at the yard, sell at the shop, repeat. The spread between
buy and sell price at the yard IS the yard's margin and it must be positive.

**The repair economy shifts underneath.** Cheap used parts make repair cheaper,
which makes repairing-and-selling more profitable, which strengthens the ordering
the maintainer asked for rather than threatening it. But it also moves the value of
every generated car's restoration bill, so `partsGeneration.maxBillFraction` and the
coherence probes all need re-measuring after, not before.

**Scrap prices.** "Steel scrap value small" is the brief. Real breakers pay by
weight, which the sim does not model. The nearest honest analogue is a small
fraction of the part's own price, floored, so a heavy cheap part and a light dear
one do not read identically.

**The wreck's purchase price.** A car with half its slots empty currently prices
through `marketValueYen` like any other, and the value floor makes several of them
collapse to `bookValueYen x 0.05`. That needs checking before wrecks are priced, or
every wreck in the yard costs the same nothing.

## 5. Style

Period-authentic and already well referenced. `docs/design/reference/period-scans/`
carries a first-hand account of what these places looked like, gathered from period
magazine scans: corrugated iron on exposed trusses, unpainted walls, bare concrete,
no ceiling lighting worth the name, work done on the ground with a trolley jack
rather than on a lift. Stacked shells, parts on pallets under tarpaulins, a shed
office reached by telephone rather than a website.

This is the least polished place in the game world and should look it. The art
bible's diegetic law applies: the yard's stock list should read as a hand-written
board or a grubby ledger, not a shop UI.

## 6. Open questions before this becomes a sprint

1. Is the yard a **venue** like an auction house (unlocked, visited) or a **screen**
   like the parts market (always available)? The unlock question decides whether it
   is early-game relief or a mid-game reward.
2. Does yard stock **rotate on a clock** or regenerate per visit? A clock makes
   visiting a decision; per-visit makes it a slot machine.
3. Does the digging puzzle earn its build cost, or is limited rotating stock enough
   friction on its own? Build the simple version first and find out.
4. How does it interact with **part provenance**, which `TODO.md` already records as
   needing a rework? A yard part has no history, which is either a feature (cheap,
   anonymous) or a problem (the game tracks where parts came from).
5. Does the yard **buy cars** as well as shells? If so it is a floor under every car
   price in the game, which is a large economic commitment.

## 7. Relationship to what already exists

Do NOT build any of the following again; the yard should read them:

| Concern | What already exists |
| --- | --- |
| Uncertain condition | `apparentBandByPartId`, the diagnosis and workup mechanics |
| A routed decision under a time budget | the inspection-visit minute budget |
| Buying a part into inventory | `resolveBuyPart`, with its standard and express delivery split |
| Selling a loose part | `resolveSellPart` and `resolveScrapPart` |
| Scrapping a shell | `resolveScrapShell`, which this feature relocates rather than replaces |
| Generating a rough car | the auction generator's own guards, which already know how to make a bad car without making an impossible one |
