# Sprint 190: the tool ladder, three rungs and three shops

**Status: IMPLEMENTED, ready for review.** Levers signed before implementation.

Three maintainer rulings, all 2026-08-07, all recorded before any implementing agent launches.

## Ruling 1: tools are gated by money, never by standing

> *"Remove all scene gating from tools. Money only. Anyone can buy a tool. Doesn't mean you are good
> with it. The market decides."*

**This overrules the 2026-08-04 ruling in `tier-three-unlocks.md`** (*"Standing ungates the tool. A
tier-3 machine on its own performs no craft operation. Both are required and neither substitutes for
the other."*). That ruling is dead and the doc must say so.

Six operations carry a `scene` requirement today: `blueprint-building` (tuner),
`period-correct-restoration` (collector), `race-prep` (racer), `corner-weighting` (touge),
`show-fitment` (show-crowd), `sorting` (daily-drivers). The gate is
`sceneStanding[operation.scene] !== 'shop'` (`machiningJobs.ts:149`). It goes.

**Why this matters more than it sounds.** Wheels tier 3 costs ¥350,000 and, without show-crowd at
Shop, changes nothing whatsoever. Drivetrain tier 3 costs ¥1,800,000 for the same nothing. After
this ruling every rung a player buys does something the day they buy it.

**`minReputationTier` on a tool purchase STAYS** (maintainer, same day: *"keep normal rep gate for
now, add note to investigate later"*). That is overall reputation, not scene standing, and it is
doing pacing work. Recorded in `TODO.md` for a later look.

**Open, and small: what `operation.scene` means afterwards.** It stops being a gate. It can be
deleted, or kept as the association that decides which buyers care. Decide during implementation and
say which; if kept, its schema doc must stop describing it as a gate.

## Ruling 2: tier 3 becomes three shops, not six rungs

> *"Group tiers into 3 shops. Approved."*

| shop | covers | room |
| --- | --- | --- |
| **Machine shop** | engine | machine shop |
| **Chassis shop** | suspension, wheels, drivetrain | workshop floor |
| **Body and trim shop** | body, interior | body and paint |

**Tiers 1 and 2 stay per line, unchanged.** Only the top rung groups.

**Why.** Tier 3 costs ¥6,150,000 across six rungs and five of them carry one operation or none.
Interior tier 3 is ¥700,000 for a single labour point: no operation addresses `seats` or
`dashGauges`. Grouping folds that hole into a shop that has a reason to exist, without inventing
content for it. (Maintainer: *"YET. We can add later"*, so this is not a claim that interior never
gets content, only that its rung need not stand alone waiting for it.)

**Content stays thin and that is known and accepted** (*"content still thin, will work on that
next"*). This sprint changes the ladder's shape, not what hangs off it.

## Ruling 3: tier 1 kit is renamed

> *"Tier 1 names approved."*

The garage is rented, not inherited (`world-and-rooms.md`: *"The space is already yours and it is
full of somebody else's rubbish"*), so tier 1 is what you turned up with. **No character is named**,
because the recurring cast has no design and `TODO.md` reserves that decision.

| line | from | to |
| --- | --- | --- |
| engine | Hand tools & timing kit | Spanner roll and a borrowed timing light |
| drivetrain | Driveline hand tools | Breaker bar and a milk crate |
| suspension | Trolley jack & axle stands | Trolley jack and four axle stands |
| wheels | Tyre levers & bubble balancer | Tyre levers and a bubble balancer |
| body | Filler, sandpaper & rattle cans | Filler, wet-and-dry and rattle cans |
| interior | Hand stitching & trim tools | Needle, thread and a trim wedge |

These strings are rendered as physical objects in the machine shop and in the hire panel, so they
are object names rather than tier labels.

## LEVERS (directive 22) - SIGNED

**Approved by the maintainer 2026-08-07, by name and value, before any implementing agent
launched.** Their words: *"No. Reorder and more expensive."*

| shop | covers | price | rep gate |
| --- | --- | ---: | --- |
| Machine shop | engine | **3,500,000** | known |
| Chassis shop | suspension, wheels, drivetrain | **2,500,000** | known |
| Body and trim shop | body, interior | **1,500,000** | known |
| | **total** | **7,500,000** | |

**The proposal this replaced** was to sum the rungs each shop absorbs (1,500,000 / 2,550,000 /
2,100,000, total 6,150,000 unchanged). The maintainer rejected it and reordered.

**What the signed table does, stated plainly:**

- **The top of the tool ladder gets dearer by 22 per cent**, 6,150,000 to 7,500,000.
- **The order now matches content rather than equipment count.** The machine shop is the dearest
  thing you can buy, at more than double engine tier 3's old 1,500,000, and it carries eleven
  operations plus forced-induction conversion. The body and trim shop is the cheapest, and it is
  the thinnest until its content lands.
- **The old drivetrain rung is gone as a separate purchase.** It was 1,800,000 for a single
  operation, the worst value in the game; it is now folded into a 2,500,000 shop covering three
  lines.

The six tier-3 prices in `toolLines.json` are retired with the rungs they priced.

## Reuse analysis (directive 16)

**New: one concept, the shop.** A shop is a named purchase covering one or more tool lines at the
top rung. It reuses `minReputationTier`, the classifieds listing mechanic, and the purchase flow
already built for tool tiers.

**Existing mechanisms reused:**

- `craftOperationCapabilityGateReason` is already the one gate for operations and already reads the
  operation's own line. It keeps that job; it loses its scene clause and its tier check becomes a
  shop check.
- `toolLines.json` keeps tiers 1 and 2 exactly as they are.
- `machineShopEquipment.ts` already renders equipment presence per line from content, and already
  derives which lines have work from the operation table.
- The Upgrades screen's ladder, the classifieds listing window, and the day-log copy all already
  exist and take the new shape as data.

**Nothing parallel is stood up.** No second purchase flow, no second gate.

## Tasks

1. **Remove the scene gate from operations.** `machiningJobs.ts:149` and every consumer. Decide the
   fate of `operation.scene` and say which.
2. **Introduce the shop.** Content shape, schema, and the three entries. `GameState.toolTiers`
   becomes 1 or 2 per line, plus the set of shops owned. `SAVE_VERSION` bump, no migration
   (directive 19).
3. **Re-point every tier-3 read at its shop.** The exhaustive list, measured:
   `craftOperationCapabilityGateReason` (machining), `naToTurboConversionBlocked`,
   `bodyLineCapability.fullCapability`, `taskToolDeficit` (service-job offers),
   `energyPerBandStepByToolTier[3]`, `repairBandCeilingByTier[3]`.
   **Note `repairBandCeilingByTier[3]` is inert today** (`{1: fine, 2: mint, 3: mint}`) and stays
   inert; do not quietly give a shop a repair reach it never had.
4. **Rename the six tier-1 strings.**
5. **The Upgrades screen and the machine shop room** render two per-line rungs plus three shops.
6. **Fix `gameStore.sellValueForPart`**, which drops the machining premium while `resolveSellPart`
   includes it, so the counter under-quotes every machined part. Unrelated to the ladder, found
   while reading it, and small.

## Definition of done

- No operation anywhere requires scene standing. Buying a rung always does something.
- Three shop purchases replace six tier-3 rungs; tiers 1 and 2 are untouched per line.
- Every tier-3 capability still gates, now on its shop, with no capability gained or lost.
- The economy hash re-pinned in the same change as the signed lever table.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here

- **Content for the thin shops.** Widebody, roll cage, dog-box conversion, underglow, and the
  chassis jig making a severity-4 shell repairable. That is the next piece of work and the jig is
  the only one specified enough to build.
- **The general capability gate on PARTS.** `tier-three-unlocks.md` names it as the prerequisite for
  most of its table: `requiredTags` exists and is used by zero of 580 SKUs, while machining,
  NA-to-turbo and the body line each gate bespokely. Operations have their single gate; parts do
  not. Out of scope here, and it blocks the content work above.
- **The signed-but-unbuilt grade rule** (`race` grade needs its line at tier 2).

## Exit

All three rulings landed, in two waves.

### The abstraction that made it fall out

**`ToolTier` (1 or 2) is the purchasable per-line rung. `ToolLevel` (1, 2 or 3) is the capability a
line works at**, derived by `toolLevelsFor(state, context)`: the rung, or 3 when the covering shop
is owned. Everything capability-shaped reads levels; only the shop is bought.

**`economy.json` did not move by a single byte.** `energyPerBandStepByToolTier`,
`repairBandCeilingByTier`, `minEngineToolTier`, `craftOperationToolTier` and
`naToTurboConversionEngineTier` are all keyed or valued by level, and level 3 still exists. It is
bought as a shop now rather than as six rungs.

### The hazard grouping created, caught by a test

**The six rungs were sequential, so tier 3 implied tier 2, which implied owning the machinery. A
shop implies no rung.** So buying the machine shop first left a player able to bore a block and
unable to lift the engine out of the car.

`partWorkSequence.test.ts` failed on it as a genuine regression, directive 17 case (b), the only one
in the sprint. `ownsMachineForGroup` now reads the derived level rather than the raw rung, restoring
an implication the old ladder gave away by accident. Four further tier-3 reads beyond the six the
plan listed were found the same way: `machineShopEquipment`'s top-rung lookup,
`gameStore.installBlockedReason`'s NA-to-turbo copy, and `upgradeHintFor`, which returned null at
the top of the ladder instead of naming what closes a deficit.

### Two decisions taken deliberately rather than defaulted

- **A shop keeps the labour improvement** (3 per grade against tier 2's 4). Removing it would breach
  this sprint's own "no capability gained or lost", it was bought by every old top rung regardless
  of operation content, and stripping it would leave the body and trim shop worth almost nothing
  until its content lands.
- **`operation.scene` survives, because something other than the gate reads it.** `standingView`
  uses it to show each scene the craft that speaks to it, which is exactly the association that
  justifies keeping a field. Its schema doc now says it gates nothing.

### The repair ceiling did not move

`repairBandCeilingByTier` is untouched at `{1: fine, 2: mint, 3: mint}`, and a shop maps to level 3,
whose ceiling equals tier 2's. Pinned as an equality in `bands.test.ts` so retuning either entry
alone trips it rather than silently handing a shop a reach it never had.

### Rooms and shops are different axes, and the room says so

The machine shop room is where all loose-part machining happens, including `race-prep` (suspension)
and `sorting` (drivetrain), whose benches now arrive with the **Chassis shop**. So the room holds
machines from more than one purchase, which is true of a real machine shop. Each bench is titled by
the line it serves and states which shop brought it.

### A guard hole closed

`economyApprovalGate.test.ts` hashed `economy.json`, `partPricing.json`, `storyMissions.json` and
`damagePatterns.json`. **It had never hashed `toolLines.json`**, so every tool price and reputation
floor has always been unguarded, and `toolShops.json` would have inherited that. Both are now
hashed, with every rung price, shop price and reputation floor listed by name and value in the
ledger. Adding a guard moves no value.

### Copy

The register the tier-1 renames set:

> Spanner roll and a borrowed timing light. Breaker bar and a milk crate. Needle, thread and a trim
> wedge.

The shops read:

> **A shop is not another rung on a line. It is one purchase covering several lines at once, and
> every one of them reaches its top the day it lands.**
>
> In this week's paper. / Watch the classifieds, nobody is selling up this week.
>
> Topped by the Chassis shop. / Chassis shop, in-house.

And the room:

> **The benches in here did not all arrive together. Each one says which shop brought it.**
>
> Comes in with the Chassis shop.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 621 passed |
| `pnpm test --project sim` | 2591 passed |
| `pnpm test --project game` | 995 passed |
| `pnpm build` | green |
| `npx eslint` / `prettier --check` | clean |
| `economy.json` diff | empty |

### Found, not fixed, not ours

`UpgradesScreen.vue` carries a second `.maxed` rule setting `visibility: hidden` unless `.shown`,
so the **Facilities cards' "Fully equipped" label is invisible in the running app** when a bay type
maxes out. Pre-existing, unrelated to the ladder, and recorded rather than swept into this change.
The new shop cards avoid inheriting it by carrying their own class.

### Still open

- **Content for the three shops.** Widebody, roll cage, dog-box conversion, underglow, and the
  chassis jig making a written-off shell repairable, which is the only one specified enough to
  build. The body and trim shop is ¥1,500,000 for one polish rung until this lands.
- **The general capability gate on PARTS.** `requiredTags` exists and is used by zero of 580 SKUs,
  while machining, NA-to-turbo and the body line each gate bespokely. Operations have one gate;
  parts do not, and it blocks most of the content above.
- **Whether a tool purchase should need reputation at all**, deferred by the maintainer and recorded
  in `TODO.md`.
- **`machining.valuePremiumPerOperation` (0.03).** Still unsigned, still the only lever that makes
  machining worth choosing.
