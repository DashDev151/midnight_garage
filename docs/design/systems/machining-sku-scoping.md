# Machining as a new SKU: what it costs the catalogue

**Status: MEASUREMENT of a model that was then REJECTED. Not live design.** Established from the
shipped code and content on 2026-08-02; nothing here was ever a proposal. No code, content, lever or
test was changed to produce it. Every claim cites a file and a symbol, and every claim about the
code held against the tree it was written from, which is the tree BEFORE machining was built
(commit `b214520`). Several of them have since moved with the implementation: `machiningCost` no
longer returns 0, `PartInstanceSchema` now carries `machining`, `SAVE_VERSION` is 56, and the
`proportionalPower.test.ts` caps quoted in section 3c are now x1.45 / x1.60 / x2.30 / x1.65 / x1.88.

**What happened to it.** The catalogue cost measured below (864 new SKUs, 472 to 1,336) is why
machining ships as a property of a `PartInstance` instead. `machining-system-design.md` is the
design of record and carries that decision. **Read this file as the arithmetic behind a rejection,
never as a live option**: in particular, the nine open decisions in section 11 are moot, and section
4's grade-follows-source resolution, section 8's pricing product and section 10's derived-SKU
variants describe a catalogue the game will not have.

**The ruling this was scoped against** (maintainer, 2026-08-02, since replaced by the property model
in `machining-system-design.md`): machining is a **transformation that
consumes a part and produces a new one**. A machined race block is not a race block carrying a flag,
it is a different part called "race block, machined". Three properties fall out for free: the part
travels because it IS a part; machining is irreversible because the original was consumed; and it is
worth more because it is a dearer SKU, on the same axis a race block already outranks a street one.
**No band above mint is needed and none will be added.**

The other documents are `machining-system.md` (the superseded 13-operation baseline table this was
scoped against), `machining-integration-map.md` (the shipped-code map) and
`machining-system-design.md` (the design of record, which post-dates this measurement and does not
adopt the SKU model).

---

## 1. The SKU arithmetic

### 1a. What the catalogue is today

| quantity | value | source |
| --- | --- | --- |
| `PARTS.length` | **472** | `packages/content/tests/integrity.test.ts:365`, verified against `parts.json` |
| slots (`CarPartId`) | 29 | `CarPartIdSchema`, `packages/content/src/tags.ts` |
| fitment classes | 4 (`entry`, `everyday`, `enthusiast`, `flagship`) | `PartFitmentClassSchema` |
| grades | 4 (`stock`, `street`, `sport`, `race`) | `GradeSchema` |
| SKUs per ordinary slot | **exactly 16** (4 classes x 4 grades) | `integrity.test.ts:294` |
| the arithmetic | 28 non-`paint` slots x 16 = 448, plus `paint` 4, plus 20 zone panels = **472** | `integrity.test.ts:356-365` |

The four slots machining addresses each carry exactly 16 today (counted directly from `parts.json`):
`block` 16, `internals` 16, `headValvetrain` 16, `camsTiming` 16.

### 1b. The 13 operations mapped onto real slots

`ALL_CAR_PART_IDS` is a closed 29-member enum. Four of the table's named components
(`rotating assembly`, `con rods`, `crankshaft`, `flywheel`) are not `CarPartId`s;
`machining-integration-map.md` section 13 establishes `internals` as the nearest home for all of
them.

| slot | operations | n |
| --- | --- | --- |
| `headValvetrain` | port & polish, 3/5-angle valve job, milling, deshrouding | **4** |
| `block` | bore & hone, decking, O-ringing the deck | **3** |
| `internals` | full balance, con-rod shot peen, journal polish, knife-edging, flywheel lightening | **5** |
| `camsTiming` | camshaft regrind | **1** |
| | | **13** |

### 1c. The count, three ways

Both multipliers are forced. **Fitment class x4 is not optional**: the source part is authored per
class and economy-bible law 3 requires the class to match the car (`partFitsCar`, and the assembly
form at `assemblies.ts:90-94`), so a machined block for a kei is not a machined block for a Skyline.
**Grade x4 is not optional either** under the ruling as stated: "a machined race block" says machining
applies at every grade, and the numbers-matching restoration case is machining a `stock` part.

| model | what a SKU means | states | x classes x grades | **new SKUs** | new `PARTS.length` | growth |
| --- | --- | --- | --- | --- | --- | --- |
| **A. one per operation** | operations never combine | 13 | x16 | **208** | 680 | **+44%** |
| **B. one per operation SET** | operations combine, order ignored | 54 | x16 | **864** | **1,336** | **+183% (x2.83)** |
| **C. one per operation SEQUENCE** | order recorded | 405 | x16 | **6,480** | 6,952 | +1,373% (x14.7) |

Model A is not available: see section 2. **Model B is the honest reading of the ruling**, and it adds
more SKUs than the entire current catalogue contains.

### 1d. Model B, per slot

Non-empty subsets of n operations = 2^n - 1.

| slot | n ops | states (2^n - 1) | machined SKUs (states x 16) | slot total | today |
| --- | --- | --- | --- | --- | --- |
| `headValvetrain` | 4 | 15 | 240 | **256** | 16 |
| `block` | 3 | 7 | 112 | **128** | 16 |
| `internals` | 5 | 31 | 496 | **512** | 16 |
| `camsTiming` | 1 | 1 | 16 | **32** | 16 |
| | | **54** | **864** | | |

`internals` alone ends up carrying more SKUs than the whole shipped catalogue's engine group.

### 1e. Sensitivity: what shrinks it

| variant | states | new SKUs | new total | growth |
| --- | --- | --- | --- | --- |
| Model B as stated | 54 | 864 | 1,336 | +183% |
| minus flywheel lightening (zero effect on both power columns, no dial in `PhysicalModifierSchema`) | 38 | 608 | 1,080 | +129% |
| minus all four operations naming a non-`CarPartId` component (balance, journal polish, knife-edging, flywheel) | 24 | 384 | 856 | +81% |
| Model B, `stock` grade only (machining is a restoration mechanic) | 54 states x 4 classes | 216 | 688 | +46% |
| both restrictions (stock grade only, real slots only) | 24 states x 4 classes | 96 | 568 | **+20%** |

**The cheapest coherent version of the ruling still adds 96 SKUs. The version as stated adds 864.**

---

## 2. Can operations combine? Yes, and it is why Model A is unavailable

The table puts **three operations on `block`** and **four on `headValvetrain`**, and they are
physically independent: a block can be bored, decked and O-ringed, and a boost build does all three.
`machining-system.md`'s own footnote describes the turbo column as a single roughly +55 per cent
enabled gain "divided across components by how much each one enables it", which only makes sense if
several are applied at once.

**Under a transformation model, every intermediate state must exist as a real SKU.** Bore consumes
"stock block" and produces "stock block, bored". Deck then consumes "stock block, bored" and produces
"stock block, bored and decked". There is no way to reach the three-operation block without the
one- and two-operation blocks existing first, so the count is the full subset lattice, not just the
maximal sets. That is what makes it 2^n - 1 rather than n.

**Order does not need to be recorded** (Model C). Nothing physical distinguishes bored-then-decked
from decked-then-bored, and recording it multiplies `internals` alone from 31 states to 325. Model C
is listed only so the number is on the record; if the operation set is stored sorted, Model C never
arises.

**One combinatorial escape exists and is worth naming**: rule the operations within a slot into a
single ordered LADDER (like grades), so a block is unmachined, or freshened, or ported, or fully
boost-prepped, and a player picks a rung rather than a set. That collapses `block` from 7 states to 3,
`headValvetrain` from 15 to 4, `internals` from 31 to 5, `camsTiming` 1 to 1: **13 states, x16 = 208
SKUs**, which is Model A's number arrived at legitimately. It costs the table its independence
(you cannot O-ring without boring) and it is a change to the maintainer's own baseline data, so it is
listed in section 11 as a decision, not adopted here.

---

## 3. Every hard-count guard, and what it becomes

Figures below are Model B (864 new SKUs), with `parts.json` authored so machined SKUs carry a real
`powerFraction`.

### 3a. Guards that FAIL outright

| guard | file:line | the pin today | under Model B |
| --- | --- | --- | --- |
| exactly 16 SKUs per ordinary slot | `content/tests/integrity.test.ts:294` | `candidates.length === 1` per (slot, class, grade), over `PARTS.filter(p => p.zoneId === undefined)` | **fails on 64 assertions.** `block` finds 8, `headValvetrain` 16, `internals` 32, `camsTiming` 2 |
| catalogue size | `content/tests/integrity.test.ts:365` | `PARTS.length === 472` | **1,336** |
| catalogue size (second copy) | `content/tests/powerFraction.test.ts:151` | `PARTS.length === 472` | **1,336** |
| catalogue size (third copy) | `content/tests/statModifierShape.test.ts:36` | `PARTS.length === 472` | **1,336** |
| non-zero `powerFraction` SKUs | `content/tests/powerFraction.test.ts:160` | `=== 96` | **944** (see 3b) |
| 12 per power-bearing slot | `content/tests/powerFraction.test.ts:168` | `=== 12` for all 8 slots | `block` **124**, `headValvetrain` **252**, `internals` **492**, `camsTiming` **28**; `intake`/`exhaust`/`ignitionEcu`/`forcedInduction` unchanged at 12 |
| **every stock-grade SKU carries zero `powerFraction`** | `content/tests/powerFraction.test.ts:94` | zero on all three characters | **fails on 212 SKUs** (216 stock-grade machined SKUs minus the 4 flywheel-only ones). See section 4 |
| **every stock-grade SKU prices at its taxonomy stock-replacement price** | `content/tests/integrity.test.ts:273` | `part.priceYen === entry.stockReplacementPriceYenByClass[class]`, skipping only `zoneId !== undefined` | **fails on all 216 machined stock-grade SKUs**, or holds only by pricing a machined stock block identically to an unmachined one, which contradicts the ruling outright. **This is the sharpest collision in the file** |

### 3b. The 944, derived

Machined SKUs carrying a non-zero fraction on at least one character:

| slot | states with a power gain | machined non-zero (x16) |
| --- | --- | --- |
| `headValvetrain` | 15 of 15 (every head operation gains on at least one column) | 240 |
| `block` | 7 of 7 (O-ringing is 0 NA but +15% turbo, so non-zero on `forced`) | 112 |
| `internals` | 30 of 31 (only the singleton {flywheel lightening} is 0/0) | 480 |
| `camsTiming` | 1 of 1 | 16 |
| total | | **848** |

96 + 848 = **944**.

### 3c. Guards that PASS while their invariant silently breaks

These are the dangerous ones: no CI signal, invariant gone.

| guard | file:line | why it still passes | what is lost |
| --- | --- | --- | --- |
| the grade ladder rises strictly | `content/tests/partPricing.test.ts:129-156` | it builds `new Map(group.map(p => [p.grade, p.priceYen]))` keyed on grade. **A Map keeps the LAST entry per key**, so with 8 `block`/`everyday` SKUs it silently compares whichever machined block sits last in `parts.json` | the ladder is no longer measured at all; the result depends on file order |
| the fitment-class ladder rises strictly | `content/tests/partPricing.test.ts:158-185` | same Map-collapse, keyed on class | same |
| the 288 value-per-yen cases | `content/tests/partPricing.test.ts:372-425` | built with `PARTS.find(...)`, which returns the FIRST match in file order. Machined SKUs appended after the base ones leave all 288 cases and the 1.334961 maximum untouched | **848 new power-bearing SKUs are never measured**, which is exactly the one-correct-first-purchase defect `tuning-system.md` section 1 exists against. `machining-integration-map.md` 14e predicted this |
| the cross-slot dominance ceiling | `content/tests/partPricing.test.ts:542-589` | same `PARTS.find` first-match | machined SKUs never enter the ranking |
| `raceSkuFor` | `sim/tests/proportionalPower.test.ts:46-57` | `PARTS.find` first-match. Its own doc comment reads *"the catalogue carries exactly one race SKU per slot per class, so 'best' is really 'the' here"* | **that comment becomes false.** The maximal-build caps (x1.43 / x1.57 / x1.95 / x1.63 / x1.85) and the per-car `EXPECTED_MAX_POWER_PS` table stop describing the strongest build the catalogue can express |
| the economy approval gate | `content/tests/economyApprovalGate.test.ts:1-6` | it hashes `economy.json`, `damagePatterns.json`, `partPricing.json` and 10 mission payout pairs. **`parts.json` is not hashed by anything** (`machining-integration-map.md` 14d) | 864 SKUs carrying authored power fractions land with no approval hash moving |

### 3d. Guards that are UNTOUCHED, and this is the model's real strength

| guard | why it holds |
| --- | --- |
| `SAVE_VERSION === 55`, `game/src/save/saveCodec.test.ts` | **no new persisted field.** A machined part is a `PartInstance` whose `partId` names a different SKU. `PartInstanceSchema` (`content/src/part.ts:116`) is unchanged |
| the two `hashState` goldens `'e254326b'` / `'4dcee9b0'`, `sim/tests/advanceDay.test.ts:245,:413` | same: `hashState` is FNV-1a over the persisted `GameState`, and nothing new is persisted |
| the seventeen production write sites that rebuild `CarPartState` as a fresh literal (`machining-integration-map.md` section 5) | all of them either spread `...installed` or replace the instance. A `partId` is carried by both |
| `sim/tests/derivedStats.test.ts:178`, no installed SKU adjusts authenticity | structurally true: authenticity reads `grade === 'stock'` and the taxonomy weights, never a SKU field. See section 4 for why that is also the problem |
| `content/tests/statModifierShape.test.ts:25`, `StatModifierSchema` is exactly `style` + `powerFraction` | holds, provided machined SKUs carry no new stat field |
| `sim/tests/valueModelProbes.test.ts` ceiling probe; `sim/tests/stockCarValuationInvariant.test.ts` | hold **unchanged**, because a machined stock SKU is still `grade === 'stock'` and `installedPartsValueYen` skips it. They break only if section 5's change is made |
| `sim/tests/aftermarketPhysics.test.ts`, one upgrade never charged twice | holds while machined SKUs move only `powerFraction`, never `physicalModifiers` |

**The transformation model is materially cheaper than any state-on-the-instance model on exactly one
axis, and it is a big one: it costs nothing in save schema, nothing in golden hashes, and nothing in
the seventeen-write-site trap. Everything it costs, it costs in the catalogue.**

### 3e. Two things nothing guards at all

- **A machined SKU is buyable.** `resolveBuyPart` (`sim/src/parts.ts:94-101`) resolves any id through
  `context.partsById` and has **no delisting gate whatsoever**. The only delisting that ships is a
  Vue-side filter over three body slots (`isDelisted`, `PartsMarketScreen.vue:249`). So a machined
  block appears in the shop and can be bought outright, which bypasses the mint gate, the labour cost
  and the irreversibility all at once. Delisting machined SKUs is a new gate in the sim, not a UI
  tweak.
- **864 SKUs need 864 names.** `PartCatalogEntrySchema` requires a kebab-case `id`, a `brand` and a
  `name` on every entry, and parts are parody-branded from day one (engineering law 3). The
  maintainer personally sweeps all flavour copy.

---

## 4. What grade a machined part carries

### 4a. The two arms of the trap, with the real weights

`stocknessOf` (`sim/src/derivedStats.ts:116-133`) reads exactly one thing about a fitted part:
`partsById[installed.partId]?.grade === 'stock'`. Authenticity weights from `parts-taxonomy.json`:

| slot | `statWeights.authenticity` |
| --- | --- |
| `block` | **18** |
| `internals` | 8 |
| `headValvetrain` | 6 |
| `camsTiming` | 4 |
| (all 29 slots) | 100 |

| if the machined SKU's grade is... | authenticity | support (`specByGrade`) | value (`installedPartsValueYen`) | price guard |
| --- | --- | --- | --- | --- |
| **`stock`** | costs **0** through stockness. Machining is free to a collector | `specByGrade.stock = 0`: **five support operations and the two support-only ones contribute nothing** | **skipped: zero yen** | `integrity.test.ts:273` forces the unmachined stock price. **It cannot be dearer** |
| **anything else** | costs the **full slot weight**: 18 for a bored block, identical to fitting a race block. The map's inversion, confirmed | works: 0.25 / 0.60 / 1.0 | credited at `priceYen x retention` | free to be dearer |

### 4b. How `machiningCost` must work under this model

`machiningCost(car)` (`sim/src/derivedStats.ts:153`) is `void car; return 0` today, called from exactly
one place, `authenticityPercentOf` (`:193`), as `raw = 100 * stockness - machiningCost(car)`.

The only coherent resolution the code admits:

1. **A machined SKU's `grade` is its SOURCE part's grade.** A machined stock block is `grade: 'stock'`;
   a machined race block is `grade: 'race'`. `stocknessOf` then charges the aftermarket cost when and
   only when there genuinely is one, exactly as today.
2. **The machined SKU carries its operation set as a field on `PartCatalogEntry`.** That is the only
   thing `machiningCost` can read, because the ruling puts the record on the SKU rather than the
   instance.
3. **`machiningCost` walks the 29 slots, resolves each installed `partId` through `partsById`, reads
   that SKU's operation set, and sums the ratings from a content table.** Its `CarInstance` signature
   is already correct, and the whole authenticity cost of machining arrives through this one term.

**The double-charge this rules out**: if a machined SKU carried a non-stock grade AND an operation set,
the car would pay the slot weight through `stocknessOf` and the operation ratings through
`machiningCost` for the same work. Grade-follows-source is what prevents that.

### 4c. The numbers this produces

Against a base of 100 x stockness, with the table's stand-in ratings:

| build | operations | cost |
| --- | --- | --- |
| careful freshen | valve job 1 + full balance 1 + journal polish 1 | **3** |
| bored, decked, O-ringed stock block | 8 + 6 + 9 | **23** |
| every one of the 13 operations | 6+1+5+5+8+6+9+1+2+1+6+4+7 | **61** |

`reputation.concoursSaleMinAuthenticityPercent` is 85, so a concours car may give up at most 15 points
(`machining-integration-map.md` 11d). The freshen holds concours; the boost-prepped block does not.

**One ordering worth flagging to the maintainer**: a bored, decked and O-ringed original block costs
23 authenticity points, while simply fitting a race block costs the `block` weight of 18. So on the
table's own ratings the boost trio costs MORE originality than replacing the block. That is the
table saying what it says (O-ringing alone is rated 9, "a collector weeps"), not a modelling error,
but it is the opposite of the framing in `machining-system.md`'s "why this exists" section, which
puts boring "in the middle but much closer to the authentic end".

### 4d. What the new-SKU model does NOT solve

**Support.** `slotContribution` (`sim/src/support.ts:63-160`) derives `spec` from the single
expression `specByGrade[part.grade]`. With grade-follows-source, a machined stock block reads
`specByGrade.stock = 0` and contributes nothing, and **O-ringing the deck and con-rod shot peening,
which are support-only with 0 per cent direct gain on both columns, do literally nothing.** The
new-SKU model changes where the record lives; it does not open the support door. That door
(`machining-integration-map.md` D4) is unchanged by this ruling and still has to be answered.

---

## 5. `installedPartsValueYen`, and what the value ruling costs

### 5a. What a machined stock part is worth today

Zero. `installedPartsValueYen` (`sim/src/marketValue.ts:228-243`):

```ts
if (!part || part.grade === 'stock') continue
total += part.priceYen * retention
```

Its own doc comment states the law: *"A `grade === 'stock'` installed part contributes NOTHING here,
stock is the baseline every slot starts from, not an upgrade."* With grade-follows-source (4b), a
machined stock block is `grade: 'stock'`, so **every yen of machining premium on the restoration
route evaporates**, which is the exact case machining exists to serve.

A machined non-stock part is fine already: it is credited at its own (dearer) `priceYen`, so the
machining premium reaches value for free on a race block.

### 5b. The minimal change, and why it needs a source pointer

The skip cannot simply be dropped for machined parts. Crediting `part.priceYen` for a machined stock
block credits **the unmachined block's price too**, which is precisely what the stock-skip law
withholds, and which would push every stock car above clean value the moment one slot is machined.
**Only the machining premium may be credited**, which means the machined SKU must be able to name its
source SKU. Two shapes:

| shape | change | cost |
| --- | --- | --- |
| **branch**: skip an unmachined stock part; for a machined stock part credit `priceYen - sourceSku.priceYen` | one extra condition plus a `machinedFrom` field on `PartCatalogEntry` | two branches doing similar arithmetic; non-stock machined parts keep crediting the whole price |
| **generalise**: credit `priceYen - stockPriceForSlotAndClass` for **every** part | no branch at all; for an unmachined stock part the term is exactly 0, reproducing today's skip by arithmetic | changes what a race block is worth (today the whole race price, then the race-minus-stock delta). Re-pins the premium in `valueModelProbes.test.ts` and every measured margin |

### 5c. Three consequences of making that change

| consequence | detail |
| --- | --- |
| `sim/tests/stockCarValuationInvariant.test.ts:37` and the `valueModelProbes.test.ts` ceiling probe | both assert an all-stock car values at exactly clean value. Their predicate is "no aftermarket parts", not "unmachined". A machined stock car is an all-stock-parts car worth more than clean value, so each gains an explicit "and unmachined" clause. Directive 17 applies: this is case (a), the tests would be asserting stale behaviour |
| `aftermarketReturn` withholds it by tier | entry 0.3, everyday 0.6, enthusiast 0.9, flagship 1.0 (`economy.json`, verified). Machine time on an entry car returns 30 per cent, which is right for a bought part and arguable for labour. `desirability-system.md` section 4 rules `aftermarketReturn` unmovable |
| the restoration bill moves the other way | `carCostToBandYen` (`sim/src/bands.ts:196-234`) prices repair off `catalogPart.priceYen`. A machined SKU is dearer, so a **worn** machined part enlarges the bill that `instanceBaseValueYen` deducts. Machining a part you then let wear costs value twice |

### 5d. `beyondDiscount` is dead, and stays dead

`TODO.md`'s machining entry reserves `valuation.expectationByTier.flagship.beyondDiscount` (1.3) for
machining, on the reading that machining is an above-mint state. **That is wrong twice over**, and
`machining-system-design.md` now rules the same way ("it does not revive `beyondDiscount`").

```ts
// sim/src/marketValue.ts:134-147
const billAboveYen = billToMintYen - billBelowYen
const raw = cleanValue - marketRepairDiscount * billBelowYen - expectation.beyondDiscount * billAboveYen
```

1. `beyondDiscount` scales **outstanding repair work**, not spend already made, and it is
   **subtracted**. It is a discount on a remaining bill, never a return on investment. Machining
   cannot reach it through any route.
2. `billAboveYen` is non-zero only when a car's expectation band sits below `mint`. A flagship's is
   `mint` (verified in `economy.json`), so it is always exactly 0, and **the ruling that no band above
   mint will be added makes that permanent**.

So machining's value arrives entirely through Stage D (`installedPartsValueYen`, scaled by
`retentionFor`, `foundationFactor` and `aftermarketReturn`), and `beyondDiscount` 1.3 remains dead
content with no reservation left on it. That retires `machining-integration-map.md`'s D5 and the
`TODO.md` reservation, and it is the finding `machining-system-design.md` adopted.

---

## 6. Where the transformation happens mechanically

### 6a. The closest analogue: it already exists and it is exact

**`resolvePipelineSwapPanelAction`, `sim/src/stagedWork.ts:296-376.`** Its own doc comment: *"consumes
the picked zone-panel `PartInstance` from inventory, fits it ... and pushes the zone's OLD panel into
inventory."* In code:

```ts
let partInventory = state.partInventory.filter((p) => p.id !== action.partInstanceId)  // consumed
partInventory = [...partInventory, {
  id: `panel-${state.day}-${partInventory.length}`,
  partId: oldPanelCatalogPart.id,      // a DIFFERENT SKU
  band: bandForSeverity(zone.metal),
  origin: makeCarOrigin(...),
}]                                      // produced
```

That is consume-one-produce-another, shipped and tested. What it does not give machining: it is
car-scoped (`findWorkableCar`), it is a staged action rather than a `Job`, so no multi-day labour, and
it mints a fresh instance, which loses `pricePaidYen` and needs a new `PartOrigin`.

### 6b. The better answer: the recondition path can already express it

`updateLoosePart` (`sim/src/jobs.ts:1177`, module-private to `jobs.ts`, which is where a machining
resolver would live anyway) takes `fn: (instance) => PartInstance` and writes the result back in
place, in the parts bin **or** an open assembly container. Its signature does not constrain which
fields change, so:

```text
updateLoosePart(state, id, inst => ({ ...inst, partId: machinedSkuId }))
```

is a legal transformation today with **no new writer, no new field and no schema change**. It
preserves the instance `id`, the immutable `origin` (correct: the block is still off that car) and
`pricePaidYen`, which `resolveReconditionLabor` already increments with the work's charge
(`jobs.ts:1337-1340`), the same sink machining needs.

| | swapPanel harvest | recondition path |
| --- | --- | --- |
| addresses | a car and its inventory | **a loose `PartInstance`**, bin or bench (`findLoosePart`, `jobs.ts:1160`) |
| consume-and-produce | yes, two instances | yes, one instance with a rewritten `partId` |
| multi-day labour | no | **yes** (`applyAvailableLaborToJob`) |
| service bay | required | **exempt** |
| cost sink | the car ledger | the instance's own `pricePaidYen` |
| preserves origin / price paid | no | **yes** |

**Assessment: the recondition path is the reusable analogue, and the transformation is a `partId`
rewrite inside its existing writer.** That agrees with `machining-integration-map.md` section 7's
conclusion, reached there for different reasons.

### 6c. The one thing this breaks, already predicted

`refitLaborSlotsFor` (`sim/src/jobs.ts:66`) grants a free refit when a returning instance matches the
slot's `vacatedBaseline` on `{partId, band}` only. **A machined part's `partId` no longer matches**, so
pulling an engine, machining the block and refitting it charges full install labour on every member.
`machining-integration-map.md` 11e flagged exactly this: *"if machining ever changed the effective
`partId`, the free refit would silently stop working."* The new-SKU ruling makes that certain rather
than hypothetical. No test covers it.

---

## 7. The mint gate, and the band the produced part starts at

**Where the gate lives:** in the machining planner, beside `planReconditionPart`'s own band gates
(`jobs.ts:261-267`, `canRepair(instance.band, entry)` and the `bandIndex` comparison). One condition:
refuse unless `instance.band === 'mint'`.

**What band the produced part starts at: `mint`, and it is untouched.** Under a `partId` rewrite the
`band` field never moves, and that is the only answer consistent with "no band above mint is needed
and none will be added" (`ConditionBand` tops out at `mint` and `climbBand` clamps there,
`sim/src/bands.ts:41`). Three properties fall out:

- a machined part wears exactly like any other part, from `mint` downward;
- a worn machined part reconditions back to `mint` through the shipped path, and the machining
  survives, because the machining IS the `partId`;
- the repair bill for that recondition prices off the machined SKU's dearer `priceYen`, so restoring
  a machined block costs proportionally more than restoring a plain one. Consistent, and it is a real
  ongoing cost the player will feel.

**One consequence of gating on a loose part**: machining an installed engine becomes remove, machine,
refit, and section 6c means the refit is no longer free. If machining is instead allowed on a fitted
part, it needs car-scoped addressing, which the recondition path does not have.

---

## 8. Pricing a machined SKU

### 8a. The formula, and its four multiplicands

```ts
// content/src/partPricing.ts:171-192
const override = sheet.overrides[entry.id]
if (override !== undefined) return override
const raw = baseCostYen * sheet.classFactors[class] * gradeFactorsFor(carPartId, ...)[grade] * sheet.globalFactor
return Math.round(raw / 100) * 100
```

- **`overrides` is pinned empty by test** (`partPricing.test.ts:234-241`), and it is keyed by SKU id in
  absolute yen. Hand-authoring 864 numbers is both banned and exactly what the question asks to avoid.
- **`gradeFactorsFor` keys on the SLOT**, so a machined block gets the same ladder as a plain block. It
  cannot differentiate them.
- **`priceBasisPartId` REPLACES the base**, it does not add to it. A `machinedBlock` basis would divorce
  the machined price from the block base entirely, so the two could drift apart silently. The zone-panel
  precedent exists, but zone panels are genuinely a different object; a machined block is definitionally
  a function of the block.

### 8b. The only shape that fits

**A fifth multiplicand, per operation, multiplied together:**

```text
price = round100(base x classFactor x gradeFactor x globalFactor x PROD over applied ops of machiningFactor[op])
```

| property | consequence |
| --- | --- |
| dearer by construction | guaranteed iff every factor > 1, which the schema can enforce (`z.number().gt(1)`), so it is a type-level guarantee rather than an authoring convention |
| no per-SKU number | 13 factors price all 864 SKUs; the whole-market-rebalance property the sheet's doc comment claims survives intact |
| composes correctly | a bored-and-decked block is dearer than a bored one, automatically, for every combination |
| scales with the source | a machined flagship block costs more than a machined kei block, because class and grade are still in the product |
| it is a lever block | `PartPricingSheetSchema` gains a key, `partPricing.json`'s hash moves, and `economyApprovalGate.test.ts` fires. **Correct**: 13 factors are 13 directive-22 levers and they should be signed one by one |
| it breaks one guard by design | `integrity.test.ts:273` (section 3a) must gain a machining exemption in the same change, on the `zoneId` precedent. Directive 17 case (a) |

An additive alternative (`price = base + sum of operation charges`) is available but is a larger change:
the formula is purely multiplicative today, and an additive term would not scale with class or grade,
so a kei block and a Skyline block would pay the same yen for the same bore.

---

## 9. Selling a machined part

**It works for free, and that is the model's second real win.**

```ts
// sim/src/bands.ts:117-125
export function usedPartSaleValueYen(partPriceYen, band, economy) {
  if (band === 'scrap') return 0
  return Math.round(partPriceYen * resaleBandFactors[band] * usedPartSaleFraction)
}
```

`resolveSellPart` (`sim/src/parts.ts:307-310`) passes `context.partsById[instance.partId].priceYen`, so a
machined instance resolves the machined SKU and fetches the machined price. With
`usedPartSaleFraction` 0.3 and `resaleBandFactors.mint` 1.0 (verified in `economy.json`), a mint
machined part sells for **30 per cent of its machined catalogue price**, with no code change at all.
Compare the state-on-the-instance model, where `machining-integration-map.md` section 9 shows a
machined block fetches an unmachined block's price and machining is a one-way money burn.

### 9a. But the exploit the design doc asked to be measured is now arithmetic

The maintainer's ruling is that machining **costs labour and tooling, not money per operation**. Put
that beside a dearer SKU:

| quantity | value |
| --- | --- |
| revenue from machining a mint part and selling it | `0.3 x (machinedPrice - basePrice)` |
| cash cost | **0** |
| total cost | labour only |

**So machining for resale is unconditionally profitable per labour point, bounded only by how much
labour an operation costs.** It strictly dominates reconditioning, which yields
`0.3 x price x (band factor delta)` but pays a real cash repair charge (`chargeRepairWork`,
`jobs.ts:748`). `machining-system-design.md` flagged this as wanting measurement before it ships; under
the new-SKU ruling it does not need measuring, it needs a labour cost chosen against a target margin,
or a cash charge after all.

`sim/tests/plays.test.ts` asserts **"fixing is the best use of a day on every car"** by yen per labour
point. Machining-to-sell is a fifth play in exactly those units and is the claim that test exists to
falsify.

### 9b. The donor invariant

`computeDonorBalanceProbe` (`sim/src/balanceProbes.ts:645`) asserts a clean car is never worth more
parted out than sold whole, summing `usedPartSaleValueYen(part.priceYen, 'mint', economy)` over
removable slots. A machined car's parts are dearer, so **the parted-out side rises immediately**, while
the whole-car side rises only through `installedPartsValueYen`, which skips stock grade (section 5a).

**A fully machined all-stock car is worth more parted out than whole, by construction, unless section
5b's change is made.** That binds the value question and the selling question into one decision rather
than two.

---

## 10. The alternative: derived SKUs rather than authored ones

**The shape:** `parts.json` keeps its 472 hand-authored entries. A machined SKU is **generated at
content-load time**, beside `resolvePartsCatalog` (`content/src/part.ts:78-83`), from (source SKU x
operation set):

| generated field | rule |
| --- | --- |
| `id` | `${sourceId}--${sortedOperationIds.join('-')}` |
| `priceYen` | section 8b's product, applied to the source's resolved price |
| `powerFraction` | source fraction plus the sum of the operations' own per-character fractions |
| `grade`, `fitmentClass`, `carPartId`, `requiredTags` | copied from the source (section 4b's grade-follows-source) |
| `name` | source name plus an operation suffix |
| `machinedFrom` | the source SKU's id, which section 5b needs anyway |

**What it changes:**

| | authored | derived |
| --- | --- | --- |
| lines of content to write | 864 entries, each with a name and a brand | 13 operation rows plus one generator |
| `PARTS.length` | 1,336 | **still 1,336** |
| every hard count in section 3 | breaks | **breaks identically** |
| a machined SKU's shape at every consumer | a `Part` | **a `Part`**, byte-identical by the time anything reads it |
| drift risk between a machined SKU and its source | real: 864 hand numbers | none: derived by rule |
| flavour copy | 864 names for the maintainer to sweep | 13 suffixes to sweep, composed mechanically |
| the guards | must each learn a machining exemption | can split on "authored" vs "derived", exactly as they already split on `zoneId` |

**The honest trade-off: deriving solves the AUTHORING problem completely and the COUNTING problem not
at all.** Every `PARTS.length` pin, every per-slot count, the Map-collapse in the ladder tests and the
first-match `PARTS.find` hazard are unchanged, because the catalogue really does contain 1,336 SKUs
either way. What it buys is that the 864 are correct by construction and cheap to re-generate when a
lever moves.

**A third variant exists and is worth naming:** generate lazily, minting a machined SKU into a
runtime catalogue only when a machining job completes. That keeps `PARTS` at 472 and every count
intact, but `SimContext.partsById` stops being a static content projection, which breaks the purity
every sim function and every guard assumes. Listed, not recommended.

**Not picked here.** All three are live.

---

## 11. The decisions forced

Options with costs, unanswered.

### D1. Do operations combine freely, or as a ladder?

| option | SKUs | cost |
| --- | --- | --- |
| free combination (Model B) | **+864** | the catalogue nearly triples; the table keeps its physical independence |
| a ladder per slot | **+208** | you cannot O-ring without boring; changes the maintainer's own baseline table; 13 rungs instead of 54 states |
| free combination, restricted to `stock` grade | +216 | machining becomes a restoration-only mechanic; "a machined race block" stops being expressible |
| ladder, `stock` grade only | **+52** | the cheapest version that exists, and the least of what was ruled |

### D2. Which of the 13 operations survive?

Four name a component that is not a `CarPartId` (full balance, journal polish, knife-edging, flywheel
lightening) and one of those (flywheel) has no expressible effect of any kind: 0 per cent on both power
columns, no rotational inertia in `performance.ts`, no dial in `PhysicalModifierSchema`. Folding four
operations onto `internals` costs 496 SKUs; cutting them costs the table four rows.

### D3. Does `machining-system.md`'s support column get a home?

Unchanged by this ruling. Five operations are support-side and two (**O-ringing the deck**, **con-rod
shot peen**) have zero direct gain on both columns, so with grade-follows-source they do **literally
nothing**. Either `slotContribution.spec` gains a second additive term, or those two operations are
cut, or machined SKUs carry a non-stock grade and section 4a's authenticity inversion returns.

### D4. Is the machining premium credited to value, and how?

| option | cost |
| --- | --- |
| leave `installedPartsValueYen` alone | machining on the restoration route is worth zero yen, and section 9b's donor invariant inverts |
| credit the delta for machined stock parts only | one branch plus a `machinedFrom` field; two of the three stock-car identities gain an "and unmachined" clause |
| credit `priceYen - stockPrice` universally | no branch; changes what every aftermarket part is worth and re-pins every measured premium |

Note in all three cases: `beyondDiscount` is not reachable and stays dead (section 5d).

### D5. What does an operation cost the player, in what currency?

The ruling says labour and tooling, not money. Section 9a shows that with a dearer SKU and no cash
charge, machining-to-sell is unconditionally profitable per labour point and dominates reconditioning.
Either the labour figure is chosen against a target yen-per-labour-point margin (and measured against
`plays.test.ts`), or there is a cash charge after all, or machined parts cannot be sold. The third
contradicts the ruling.

### D6. Which guards are re-pinned, which gain exemptions, and which are rewritten?

Four counts must move (472, 96, 12-per-slot, 16-per-slot). Two guards must gain a machining exemption
on the `zoneId` precedent (`integrity.test.ts:273` and `:294`). **Four guards pass while their
invariant breaks** (section 3c) and must be rewritten to be worth anything: the two Map-collapsed
ladder tests, the 288 value-per-yen cases and the cross-slot dominance ceiling. `parts.json` is hashed
by nothing, so 864 SKUs land without an approval gate firing.

### D7. Authored, derived at load, or derived lazily?

Section 10. None of the three changes the count; they differ in authoring cost, drift risk and how
much of `SimContext`'s purity survives.

### D8. Are machined SKUs buyable?

`resolveBuyPart` has no delisting gate (section 3e). Either a machined SKU is purchasable over the
counter, which bypasses the mint gate and the whole mechanic, or a delisting predicate lands in the
sim, which is a new concept there.

### D9. Does a machined part refit for free?

`refitLaborSlotsFor` matches on `{partId, band}`, so it does not (section 6c). Either the free-refit
rule learns about machining, or pulling an engine to machine it charges full install labour on the way
back, which is a real cost on the exact workflow machining creates.
