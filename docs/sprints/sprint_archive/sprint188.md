# Sprint 188: make the copies agree, and stop new ones appearing

**Status: IMPLEMENTED, ready for review.**

Raised by a repo-wide DRY sweep (five read-only audits, 2026-08-06). The sweep's verdict was that the
architecture is sound: the boundary law holds (`packages/game` reaches sim only through the barrel,
44 of 44 sites), `gameStore` is a thin adapter rather than a god object, `formatYen` is canonical,
and three of the largest sim files are correctly large. It found **one systemic failure**, and this
sprint is that failure.

## The failure

**A preview and an apply that are meant to agree, with nothing asserting that they do.** Seven
instances. Three have already drifted.

| rule | preview | apply | state |
| --- | --- | --- | --- |
| foundation withheld yen | `gameStore.ts:1965` | `marketValue.ts:340` | **drifted, about 3.3x** |
| machine shop open | `garageCapability.ts:18`, `CarDetailScreen.vue:132` | `machiningJobs.ts:133` | **drifted** |
| cart express total | `gameStore.ts:4513` | `parts.ts:139` | drifted, sub-yen |
| lot inspected | three different predicates | `diagnosis.ts` | divergent |
| machining authenticity | `derivedStats.ts:196`, `machiningJobs.ts:543`, `:605` | | two of three disagree |
| scrap shell price | `gameStore.ts:4924` + two probes | `selling.ts:1212` | in sync, unasserted |
| repair-or-replace cost | four implementations | | in sync, unasserted |

**The foundation warning is a live player-facing bug.** The panel says *"That's holding back about
¥X of the parts you've fitted."* The value formula credits
`foundationFactor * aftermarketReturn * premium`; the panel computes `premium * (1 - foundationFactor)`
and drops `aftermarketReturn` entirely. That term is 0.3 on a common-tier car, so the panel
overstates what is at stake by about three and a third times. The player fixes the brakes and the
value moves a third of what was promised.

The doc comment directly above it reads *"so what the panel says and what the price does can never
disagree."* The comment asserts the invariant the code breaks.

## Reuse analysis (directive 16)

**New: nothing. Not one mechanism.** Every task here deletes a copy and calls a function that
already exists. If an agent finds itself writing a new formula, it has misread the task.

**Existing mechanisms reused:**

- **`valueLedger.test.ts` is the template.** `valueLedger.ts` deliberately reproduces
  `marketValue.ts` term by term, and its test proves the sum equals `marketValueYen` to the yen for
  every roster model. That is what a justified copy looks like: asserted against the original.
- **The guard already exists.** `packages/content/tests/duplicateFormulaBan.test.ts` was written for
  exactly this failure mode. It checks one identifier pair and only scans `packages/sim/src`. It has
  never looked at `packages/game`, which is where all three drifted copies live. **The guard is not
  new work; its scope is the hole.**
- **`roomConfigFrom` (`auctionRoom.ts:56`) is the precedent**: a previous fix of this same failure
  (two reserve fractions five points apart, folded into one).
- Every sim function named below already exists and already works. Nothing about the economy,
  the value model, or any gate's meaning changes.

## Tasks

1. **Fix the foundation warning.** Export a `foundationWithheldYen(...)` from `marketValue.ts`,
   beside the term it subtracts from, and have `foundationWarningFor` call it. Add a test that
   asserts the panel's figure equals the actual delta in `marketValueYen` between a car with the
   failing foundation and the same car with it sound. `CarDetailScreen.test.ts:785` currently
   asserts only `> 0`, which is why this survived.

2. **Widen the guard to `packages/game`.** `duplicateFormulaBan.test.ts` scans only
   `packages/sim/src` for one identifier pair. It must scan `packages/game/src` too, and cover the
   identifiers these findings are built on. **Widen it first**: the tasks below are then whatever it
   catches, rather than a list somebody hand-maintained.

3. **One inspected predicate.** `gameStore.ts:2601` uses
   `runTestIds.length > 0 || remainingCauseIds.length <= 1`, `AuctionRoomScreen.vue:124` uses the
   first clause alone, `TutorialOverlay.vue:105` the second alone. Sim's canonical form is
   `remainingCauseIds.length <= 1`, itself written longhand at five sites in `diagnosis.ts` with no
   helper. Export one `symptomResolved(...)`; use it everywhere.

4. **One machining authenticity rule.** Three sites, and they disagree on an unresolvable SKU:
   `derivedStats.ts:196` and `machiningJobs.ts:543` treat it as non-stock, `machiningJobs.ts:605`
   treats it as stock. One function, three call sites. **Pick the behaviour deliberately and say
   which**: an unknown SKU is not a stock part, so it should not be charged authenticity.

5. **One scrap-shell price and one express price.** `scrapShellPriceYen(model, economy)` out of
   `selling.ts` (four hand copies today, one authoritative); `expressPriceYen(part, economy)` out of
   `parts.ts`, so the cart total rounds the way the charge rounds. The cart bug is worth at most
   half a yen per line and is being fixed because the fix is one import, not because the magnitude
   demands it.

6. **One `coherenceFactorForCar` helper.** The expression
   `coherenceFactorFor(supportVerdict(car, model, partsById, economy).headline, economy)` is written
   out at five sites (`derivedStats.ts:658`, `:740`, `marketValue.ts:330`, `valueLedger.ts:115`,
   `gameStore.ts:1958`). One helper, five call sites.

7. **Assert the pairs that survive.** Any copy left standing after the above gets a test proving it
   equals its original, on the `valueLedger.test.ts` model. A copy nobody asserts is a copy that
   will drift; that is the whole lesson of this sprint.

## The design question this raises, NOT decided here

`machineShopOpen` gates the ROOM on `toolTiers.engine`. Sim gates each OPERATION on that
operation's own line. After sprint 187 the machine shop holds thirteen loose-part operations, and
two of them are not engine work: `race-prep` (dampers, suspension) and `sorting` (differential,
drivetrain). So a player at suspension tier 3 and engine tier 2 cannot enter the room to do work
they are qualified for.

**Task 2 fixes the duplication, not the gate.** `machineShopOpen` is currently written twice inside
`packages/game` and neither copy reads sim; that is a defect and it gets one source. Whether the
room should open on any qualifying line rather than on engine alone is a progression decision for
the maintainer, and it is raised rather than taken.

## Definition of done

- The foundation panel's figure equals the actual value delta, proven by a test.
- `duplicateFormulaBan.test.ts` scans `packages/game/src` as well as `packages/sim/src`, and fails
  on a reintroduced copy of every rule in the table above.
- Each rule in the table has exactly one implementation, or a test proving its copies agree.
- No `economy.json` value moves. No gate changes meaning. No mechanism is added.
- `pnpm typecheck` clean (exported symbols move between modules), all three projects green.

## Deliberately not here

- **The structural work.** `gameStore.types.ts` (905 lines of type declarations, zero coupling),
  `jobEngine.ts` (kills two of the three import cycles, which all pass through the same three
  symbols), `machineLine.ts`, dropping `balanceProbes` from the public barrel. Real wins, no
  correctness stake, their own sprint.
- **The screen splits.** `CarDetailScreen.vue` at 3088 lines and `TutorialOverlay.vue`'s 436 lines
  of untestable pure logic. Later, and note that `PartActionPanel` specifically should NOT be
  extracted: `dropZones` is deliberately built once across all part ids for stable pointer identity.
- **`BackLink.vue`, `formatPercent.ts`, `gateCopy.ts`.** Cheap and worth doing, but they are copy
  and layout duplication, not rule duplication. Different sprint, lower stakes.

## Exit

Every task landed. Built in two waves: the foundation bug, then the guard and the copies it caught.

### The foundation warning, corrected

The withheld figure is `round(1 * aftermarketReturn * premium) - round(foundationFactor *
aftermarketReturn * premium)`, derived from `marketValue.ts` rather than from the sprint doc's
looser phrasing: the old store form dropped `aftermarketReturn` **and** subtracted before rounding.

`marketValue.ts` gained a private `premiumCredit(...)` returning `{ creditedYen, withheldYen }` from
one evaluation of the premium. `marketValueYen` sums the first, the exported
`foundationWithheldYen(...)` returns the second. **They are two fields of one result rather than two
functions that agree**, so drift is structurally impossible rather than merely absent. Multiplication
order and rounding points are byte-for-byte the old ones, so no float re-association can move a yen.

| tier | panel said | panel says | `marketValueYen` |
| --- | --- | --- | --- |
| entry (Today JW1) | 4,598 | 1,379 | 97,099, unchanged |
| everyday (Eunos Roadster) | 5,203 | 3,122 | unchanged |
| enthusiast (LJ71) | 13,068 | 11,761 | unchanged |
| flagship (JZA80) | 29,403 | 29,403 | unchanged |

**Flagship was always correct because its `aftermarketReturn` is 1.0, which is why this hid**: the
one tier where the missing term is the identity is the tier anyone would check first.

The test compares `marketValueYen` with the foundation failing against the same car sound, **minus
the same delta on a stock control car**. The control is necessary: repairing the tyres moves the
price twice, once for the repair's own restoration value and once for the released premium. The
modified car carries race springs, which have a catalogue price but no `powerFraction` and no
support-weight slot, so both cars share a support verdict, a coherence factor and a restoration bill
bit-for-bit. The first term cancels exactly, so the assertion is `toBe` with no tolerance, across all
96 roster models.

### The guard, widened first

`duplicateFormulaBan.test.ts` now scans `packages/sim/src` and `packages/game/src`, `.ts` and
`.vue`. Nine rules, each naming the module that owns a formula, any file allowed an asserted copy,
and the markers a file must hold all of to count as re-deriving it. One `it` per rule, so a failure
names the rule and the line.

**Widening before fixing was the right order: the guard found two copies this doc did not list**,
`AuctionRoomDemoScreen.vue:189` and `gameStore.ts:1470`. One false positive was tightened rather
than accepted (`CarDetailScreen.vue` reads `offer.authenticityCost` for display 240 lines from an
unrelated `grade === 'stock'`, so the marker is now `operation.authenticityCost`: reaching for the
raw rating is the decision, rendering an offer row is not).

### `inspected` needed two predicates, not one

The three sites were not three copies of one rule. They were two rules and a conflation, and both
are now exported from `diagnosis.ts`:

- **`symptomResolved(s)`**, `remainingCauseIds.length <= 1`: knowledge. The content schema defines
  `lotInspected` as "narrowed to one cause", and a separate `testRun` condition kind already exists
  for the other question, so forcing the behavioural form here would collapse two tutorial steps
  into one.
- **`symptomTested(s)`**, `runTestIds.length > 0`: behaviour. The auction room's goad reacts to
  being seen ("Somebody saw you under that car earlier"), and the design forbids the room reading
  the player's knowledge. Forcing the knowledge form here would leak knowledge into room behaviour
  and silently stop the goad for a player who tested and then ran out of minutes.

`gameStore.lotDetail`'s `OR` collapses to `symptomTested`, and **nothing changes for a player**: only
`runDiagnosticTest` narrows a lot's causes, and all 17 shipped symptoms carry 2 to 5 causes, so the
dropped clause is unreachable on a lot.

### The rest

- **Machining authenticity**: `machiningAuthenticityCostOf(operation, part)` in `machining.ts`,
  three call sites. `machiningJobs.ts:605` changes as decided: a fitted slot holding an unresolvable
  SKU now quotes 0 rather than the operation's full rating. It was the only site that disagreed.
- **`scrapShellPriceYen`** from `selling.ts`, four sites to one. **`expressPriceYen`** from
  `parts.ts`, and `cartExpressTotalYen` now sums per part. Its signature is `(part)` rather than
  `(part, economy)` because the surcharge lives in `constants.ts`, not in content.
- **`coherenceFactorForCar`** landed in `derivedStats.ts`, **not** `marketValue.ts` as this doc
  said: `marketValue.ts` would have created a new `derivedStats` cycle, and `derivedStats.ts`
  already imports both atoms. Five sites to one.
- **`machineShopOpen`**: `CarDetailScreen.vue` imports it from `garageCapability.ts`. **The gate's
  meaning is untouched**, still `toolTiers.engine` alone.

### An honest correction on the cart

The express-total divergence is **latent, not live**. Every one of the 580 shipped part prices is a
multiple of 10, so `price * 1.1` is always whole and the two rounding orders cannot disagree against
real content. Earlier analysis in this arc put it at up to half a yen per line; that was the
arithmetic bound, not the shipped reality. The fix is structural, and the test asserts the
quote-equals-till invariant rather than a divergence that cannot be constructed.

### Deliberately not done

**The repair-or-replace cost row.** Its four sites (`bands.costToBandYen`, `plays.ts`,
`balanceProbes.ts`, `serviceJobs.ts`) are not one function written four times: three are whole-car
planners that also account labour, fit fresh parts and mutate a car. Consolidating them is a real
refactor rather than a copy deletion, and no guard rule was added that would drag it in. Left for a
decision.

**The machine-shop room gate.** After sprint 187 the room holds `race-prep` (suspension) and
`sorting` (drivetrain), but opens on `toolTiers.engine` alone, so a player at suspension 3 and
engine 2 cannot enter a room to do work they are qualified for. `garageCapability.test.ts` now holds
`machineShopOpen` to sim's gate for the engine line only, and says so, so it cannot be read as
answering this. Reserved for the maintainer.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 618 passed |
| `pnpm test --project sim` | 2583 passed |
| `pnpm test --project game` | 965 passed |
| `duplicateFormulaBan` | 9 of 9 |
| `npx eslint` / `prettier --check` on changed files | clean |
| `packages/content/data/` diff | empty |

One test was case (b) under directive 17, and it was the agent's own new one rather than a
pre-existing one: a quote-versus-sheet case expected 23 and got 24, because it built the car from a
scene-filtered operations list while the machine shop quotes every loose-part operation on the slot.
The test's construction was wrong, not the code. No pre-existing test needed touching.
