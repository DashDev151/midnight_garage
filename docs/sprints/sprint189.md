# Sprint 189: the machine shop becomes a room, and machining stops costing more than it can pay

**Status: IMPLEMENTED, ready for review.**

Two things, both raised by the maintainer 2026-08-06, and they land together because they are the
two halves of machining being unusable: you could not get into the room, and if you had you would
have ruined the one kind of car the work exists for.

## Half one: the machine shop is a room, not a gate

The maintainer's ruling, which is the whole of the design:

> *"The tool shop is not just a magical concept, it's a room. That's it. What's IN the room is what
> is important. Each tool line should correspond with a physical piece of equipment. It's this
> equipment that gets unlocked at tier 3, not the room."*

**Sim is already right.** `craftOperationCapabilityGateReason` gates each operation on that
operation's own tool line and always has. `machineShopOpen`
(`packages/game/src/screens/garageCapability.ts`) is a game-side invention that duplicates the real
gate and then narrows it to the engine line, so the room renders derelict below engine tier 3.

**The symptom.** After the workbench sprint the machine shop holds `race-prep` (dampers,
suspension) and `sorting` (differential, drivetrain). A player at suspension tier 3 and engine tier
2 cannot enter a room to do work they are fully qualified for.

**The model.** The room is always enterable. What it contains is equipment, one piece per tool line,
present or absent by that line's tier. An empty machine shop is a room with nothing in it, not a
locked door.

### The equipment already exists, fully named

`toolLines.json` already authors all eighteen rungs as physical objects. Nothing needs writing:

| line | tier 1 | tier 2 | tier 3 |
| --- | --- | --- | --- |
| engine | Hand tools and timing kit | Engine crane and stand | **Machine-shop tooling** |
| drivetrain | Driveline hand tools | Transmission bench | **Driveline rebuild bench and press** |
| suspension | Trolley jack and axle stands | Two-post lift | **Drive-on alignment lift** |
| wheels | Tyre levers and bubble balancer | Tyre machine and balancer | Laser alignment and balance rig |
| body | Filler, sandpaper and rattle cans | MIG welder and panel tools | Spray booth and chassis jig |
| interior | Hand stitching and trim tools | Upholstery and trim bench | Full trim shop |

`dayLogFormat.ts` already surfaces the tier-2 names as the machines, and `machiningJobs.ts` and
`economy.ts` both carry comments noting the engine tier-3 rung is already called "Machine-shop
tooling". The code knows the equipment has names; only the room does not.

### Which lines have machine-shop work

Measured from the operation table, and it decides what the room contains:

| line | loose-part operations, i.e. work done at a machine |
| --- | --- |
| engine | **11** (nine on block/internals/head/cams, plus `blueprint-building` and `period-correct-restoration`) |
| drivetrain | **1** (`sorting`) |
| suspension | **1** (`race-prep`; `corner-weighting` is fitted-part and lives on the car) |
| wheels | 0 (`show-fitment` is fitted-part) |
| body, interior | 0 |

So the room holds **three** pieces of tier-3 equipment, not six. Rendering six would put three
machines in it that can never do anything, which is worse than the door it replaces.

### Scope decision: the room shows its own equipment, not the whole shop

Equipment is physically distributed: a spray booth belongs in body and paint, a two-post lift on the
workshop floor. **This sprint does not relocate any equipment**, because that is the whole-garage
question the maintainer reserved. It renders the machine shop's own three machines, and the derelict
scene means "no machining equipment owned" rather than "you may not come in".

### Deliberately NOT moved, and worth its own decision

`CarDetailScreen.vue`'s machine-hire panel is **already a text inventory of this room**: six named
physical machines, each owned, hired today, or hireable for the day, bolted onto the one screen
where it makes least physical sense. Its own comment concedes the point (*"It never shows up on a
car's own bill; it's a running cost, same as rent"*), and it carries a second entrance to the
machine shop from a car screen.

Moving it into the garage is probably right and is not free: tier-2 hire and tier-3 machining are
different rungs, and `bodyLineCapability.fullCapability` already treats a body hire as granting the
whole line where machining hire grants tier 2 only. Making one machine stand for both rungs would
have to settle that inconsistency first. Recorded, not done.

## Half two: machining costs authenticity a collector car cannot afford

The maintainer's framing: machining is meant to be *"an avenue of adding value to collectors cars
while preserving authenticity"*. Today the operations' `authenticityCost` values sum to more than a
collector's gate allows, so the one buyer the work exists for is the one buyer it disqualifies you
from.

## LEVERS (directive 22)

**Approved by the maintainer 2026-08-06, before any implementing agent launched. This is a
signature on a RULE rather than on a list of numbers**, on the same footing as the champion gate:
the maintainer named the outcome, the values are derived to satisfy it, and the derived table is
reviewed after the fact rather than before.

**The approved spec, in their words:**

> *"A player will be able to fully machine all parts on a collector car and still clear the
> collector's gate."*

Their instruction on how to land it: *"implement with working numbers or closest possible, I review
tomorrow."*

**What this approval covers:** the `authenticityCost` value of each
`economy.json` `machining.operations` entry, and any constant a mechanism needs if scaling the costs
alone cannot satisfy the spec without making machining free on every other car. The derived table
goes in the Exit with its working.

**What this approval does NOT cover, and is tabled instead:** `machining.valuePremiumPerOperation`
(0.03). The maintainer called it *"probably too low"* and attached no target to it, so there is
nothing to derive from. It needs a number named and signed, and it does not move in this sprint.

### What the measurement found

Authenticity is `round(clamp((100 * stockness - machiningCost) * conditionFactor, 0, 100))`
(`derivedStats.ts:234`). The Collector's champion stat is authenticity at importance 1.00, target
0.90, so **the bar is 90 and the budget for machining is 10 points**.

| state, on a stock mint 2000GT | machining cost | authenticity | against the bar |
| --- | ---: | ---: | --- |
| untouched | 0 | 100 | +10 |
| every machine-shop operation (9) | 48 | 52 | **short by 38** |
| every operation (15) | 60 | 40 | **short by 50** |

Only **6 of 15** operations fit in the budget, and only with all six scenes at Shop. Machine shop
alone: **3 of 9**.

**The incoherence this exposes, which matters more than the shortfall.** Machining the block (all
four operations, 24 points) costs **more authenticity than throwing the block away** and bolting on
a race replacement (18.18 points). Work done to preserve the original part is priced above
destroying it. No scale factor makes that right on its own; the relationship is backwards.

**And the objection I raised against scaling turns out to be wrong.**
`machiningAuthenticityCostOf` returns 0 unless the part's `grade === 'stock'`
(`machining.ts:256`), so **machining authenticity has only ever bitten a stock car.** A race build
pays nothing today and will pay nothing after. Scaling therefore cannot make machining "free on
every other car", because it was already free there. The lever's entire reach is the one car type
it is supposed to serve.

### The derived table

Every value scaled by about 0.117 to bring the full-machining total inside the budget with margin,
preserving the authored ordering so the relative cost of one operation against another is untouched.
`authenticityCost` is `z.number().nonnegative()`, so fractions need no schema change.

| operation | slot | now | derived |
| --- | --- | ---: | ---: |
| `deck-o-ring` | block | 9 | 1.0 |
| `bore-and-hone` | block | 8 | 0.9 |
| `cam-regrind` | camsTiming | 7 | 0.8 |
| `port-and-polish` | headValvetrain | 6 | 0.7 |
| `decking` | block | 6 | 0.7 |
| `head-skim` | headValvetrain | 5 | 0.6 |
| `balance-and-polish` | internals | 4 | 0.5 |
| `race-prep` | dampers | 3 | 0.35 |
| `show-fitment` | rims | 3 | 0.35 |
| `con-rod-peening` | internals | 2 | 0.25 |
| `corner-weighting` | springs | 2 | 0.25 |
| `sorting` | differential | 2 | 0.25 |
| `multi-angle-valve-job` | headValvetrain | 1 | 0.1 |
| `blueprint-building` | internals | 1 | 0.1 |
| **`period-correct-restoration`** | block | 1 | **0** |
| **total** | | **60** | **6.85** |

**What it buys:**

| state | machining cost | authenticity | against the bar |
| --- | ---: | ---: | --- |
| every operation (15) | 6.85 | **93** | clears, 3 to spare |
| every machine-shop operation (9) | 5.55 | **94** | clears, 4 to spare |
| the whole block machined (4) | 2.6 | 97 | vs 18.18 for binning it |

The spec is satisfied: a fully machined collector car clears the gate. The three points of margin
are deliberate, because `conditionFactor` multiplies the raw score, so a car a shade off mint would
otherwise fall through a bar it exactly met.

**`period-correct-restoration` goes to zero** rather than negative. Its name says it restores a part
to factory specification, so charging originality for it was always backwards. The schema forbids a
negative cost, and zero is the achievable version of paying it back without a schema change.

**Still tabled, NOT changed:** `machining.valuePremiumPerOperation` (0.03). Measured on the same
car, all fifteen operations pay **¥39,115**, which is 0.17 per cent of a ¥23,000,000 book value, for
**75 labour points**. That looks far too low, which is what the maintainer suspected, but no target
was given to derive a value from, so it needs a number named and signed.

## Reuse analysis (directive 16)

**New: nothing in sim.** Half one is game-side only, because sim's per-operation gate is already
the correct mechanism and the room gate is the thing being deleted. Half two moves content values
and, if the measurement demands it, adds one mechanism to the existing
`machiningAuthenticityCostOf` path consolidated in sprint 188.

**Existing mechanisms reused:**

- `craftOperationCapabilityGateReason` already answers "can this line do this operation", per line.
  The room stops asking its own version of that question and starts rendering the answer.
- `toolLines.json` already carries the tier ladder per line. Equipment presence reads it.
- `machineShopAssist` already models the tier-2 machine as a thing that is owned or hired for the
  day, with a fee per group. That is already "a physical piece of equipment per tool line" in
  everything but presentation.
- `machiningAuthenticityCostOf` (`machining.ts`) is the single authenticity rule as of sprint 188.
  Any change to how machining costs authenticity goes there and nowhere else.
- `GarageInteriorScreen` already draws the room in open and derelict states.

## Constraint carried from TODO

**Every rendered garage room is currently a backdrop** and the maintainer has reserved the question
of whether room art becomes the interface. So this sprint keeps the machine shop's controls in the
existing text-panel idiom and does NOT invent a click-the-machine mechanism, which that decision
would throw away.

## Definition of done

- The machine shop is enterable at any tool tier. No room-level gate remains anywhere.
- The room shows equipment per tool line, present or absent by tier, and says what each is for.
- An operation is offered or refused on its own line's tier, matching sim exactly, with no engine
  gate on a suspension or drivetrain operation.
- A fully machined collector car clears the Collector's gate, proven by a test that machines every
  applicable operation onto a real shipped car and asserts the sale outcome.
- The derived lever table is recorded above with its working, and the `economy.json` approval hash
  re-pinned in the same change.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Exit

Both halves landed, built by two agents working in parallel on disjoint files.

### Half one: the room

**`machineShopOpen` is deleted.** With it went the machine-shop tab's derelict flag, the
`machine-shop-refusal` copy, and the `v-else` that hid the enter button. `bodyPaintShopOpen` is
untouched: body and paint was not in scope and its tier-2-owned-or-hired rule is deliberate.

**The room states what it holds.** A new `machineShopEquipment.ts` returns one row per tool line
that has loose-part work, deriving that list from the operation table rather than typing it in, so
it is three lines today and follows the content if that changes. Each row carries the tier-3
`displayName`, `upgradePriceYen`, `minReputationTier` and the taxonomy names of the slots it works
on. **Every string and number is read from content; no equipment name was authored.**

**Presence is sim's own gate, not a new comparison.** A machine is present when
`craftOperationCapabilityGateReason` does not return `'tool-tier'` for that line's operations. A
scene operation still short of standing is therefore a machine that is present and idle, which is
the honest reading and is covered by a test.

The empty room reads:

> *Nothing in here but a bench and the dust. The bench lists what a machine would cost.*

and the door stays open beside it. `sceneIdFor` now picks the open scene on owning any of the three
machining lines, so the driveline press alone un-derelicts the room.

**The `machine-shop-chip` was removed rather than reworded.** It claimed "In-house" for a room you
have always owned, inside a list where every other row is a machine you can hire. The room is not a
machine, cannot be hired and cannot be bought, so an ownership chip on it had nothing true to say.
The row survives as the door it actually is.

**The guard rule was rewritten, not deleted.** Its old subject no longer exists, but the thing worth
guarding does: it now names `craftOperationCapabilityGateReason` as the owner of "can this line run
this operation", and was verified non-vacuous by checking that the deleted line would still be
caught as an offender.

### Half two: the scale

Applied exactly as the derived table above states. Measured through the real path
(`machiningCost` to `authenticityPercentOf` to `championStatFor` to `saleOutcomeFor`), on a stock
mint Toyota 2000GT:

| case | cost | authenticity | verdict |
| --- | ---: | ---: | --- |
| untouched | 0 | 100 | sells |
| all 15 operations | 6.85 | **93** | `satisfied`, clears by 3 |
| the 9 tool-gated ones | 5.55 | **94** | `satisfied`, clears by 4 |

**The approved spec is satisfied.** It reads `satisfied` rather than `delighted` because a 2000GT is
still short of the Collector's power target even machined, which is the taste model working:
authenticity is their champion stat and it is what the gate tests.

Reliability holds at **73** against the Collector's target of 60, so nothing was traded away for it.
`reliabilityCostPerOperation` did not move.

`economy.json` moved **fifteen lines, every one an `authenticityCost`**.
`valuePremiumPerOperation` and `reliabilityCostPerOperation` are byte-identical. Hash re-pinned in
the same change.

### The knock-on, caught and fixed

Fractional costs broke a display: `CarDetailScreen.vue` built its figure as `'-' + cost`, so a setup
offer rendered "Originality -0.25" and a zero-cost operation would have read "-0". Both screens now
share `machiningFigures.ts`, which also absorbed a reliability formatter that was already written
twice. **Zero renders as `nothing`, never `-0`**, because a cost of nothing is not a penalty; and
decimals follow the data rather than being padded, so 0.7 reads `-0.7` rather than `-0.70`, which
would look like currency on a shop sheet.

### Tests

Two files that did not exist now do: `GarageInteriorScreen.test.ts` (the room tabs, the refusal copy
and `sceneIdFor` were entirely untested) and `machineShopEquipment.test.ts`. The garage screen's
tests stub Pixi, which has no renderer under happy-dom, and assert the scene choice directly.

**The two cases the old gate broke are now pinned end to end**: a damper at suspension 3 with engine
2 runs `race-prep`, and a differential at drivetrain 3 with engine 2 runs `sorting`. Both were
impossible before, because neither player could enter the room.

Every changed test was directive 17 case (a), including all three machine-shop tests in
`garageCapability.test.ts`, one of which carried a comment saying it deliberately did not answer
whether the room should open per line. That question is now answered. **No test was case (b).**

Two pins deliberately did not move and still pass: "all stock, all mint is exactly 100 on every
shipped car", and `TOTAL_WEIGHT === 99`. Either moving would have meant something was broken.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 618 passed |
| `pnpm test --project sim` | 2588 passed |
| `pnpm test --project game` | 982 passed, 79 files |
| `npx eslint` / `prettier --check` on changed files | clean |
| `packages/content/data/` diff | 15 lines, all `authenticityCost` |

### The coherence question this opens, and it is the real one

Seven live specs were reasoning from the dead ratings and are corrected. One correction is worth
reading, because it says something about the design rather than about a number.

`tuning-system.md` section 4a holds that *"money and originality sit on opposite sides of a
permanent choice, on every component."* On the machining side that is now thin. A fully machined
engine reads 94, so the choice costs almost nothing.

**That is the ruling working, not a defect.** Machining was always meant to be the way to add value
to a collector's car while preserving its originality, and preserving it is exactly what a 6.85
point charge does. What follows is the part that needs a decision:

**machining now has almost no downside, and it never had much upside.** Its costs are labour (75
points for the full set), money, tier 3 on four tool lines, six scenes at Shop, and about six per
cent of reliability. Its payoff is `valuePremiumPerOperation` at 0.03, which pays ¥39,115 on a
¥23,000,000 car. Lowering the authenticity charge removed the thing that made the decision
interesting without putting anything in its place.

**So the two levers are coupled**, and only one of them has been signed. With the authenticity
charge where it now is, `valuePremiumPerOperation` is the only lever left that can make machining
worth choosing.

### Still open, and deliberately not taken

- **`machining.valuePremiumPerOperation` (0.03) carries no approval and did not move.** Measured on
  the same car, fifteen operations pay ¥39,115, which is 0.17 per cent of a ¥23,000,000 book value,
  for 75 labour points. It wants a number named and signed, and per the section above it is now
  carrying the whole weight of whether machining is a decision at all.
- **A pre-existing docs disagreement, unrelated to this change and worth its own look.**
  `statWeights.authenticity` sums to **99 over 28 slots** in content (`underbody` carries no
  authenticity weight), while `carstats/authenticity.md`, `machining-sku-scoping.md` and
  `desirability-system.md` all state 29 slots summing to 100. The sweep avoided asserting either
  total rather than picking a side.
- **The machine-hire panel still lives on `CarDetailScreen`**, where it is a text inventory of six
  named machines on the one screen where that makes least physical sense. Moving it into the garage
  needs the tier-2-versus-tier-3 hire inconsistency settled first (`bodyLineCapability` treats a
  hire as granting the whole line; machining hire grants tier 2 only).
- **No garage room art was made clickable.** Whether room art becomes the interface is reserved, and
  a click-the-machine mechanism would be thrown away by that decision.
