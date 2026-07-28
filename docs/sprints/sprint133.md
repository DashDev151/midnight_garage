# Sprint 133: re-tier the roster, and split tier from rarity from origin

**Status:** designed, NOT started. Blocked on the rarity assignments in section 5.

## 1. Goal

`RarityTier` currently does three unrelated jobs under one enum, and the canonical
book values have made that untenable. Split it into three axes, re-cut the four
tiers on market position rather than rarity words, and sweep every consumer.

The trigger is measurable rather than aesthetic. Against the canon prices the
buckets are scrambled: the Beat at 580,000 is `shitbox` while the S13 at 500,000 is
`uncommon`; the Aristo is `rare` and cheaper than ten cars, four of them
`uncommon`. Parts prices key off tier, so a car in the wrong bucket is charged the
wrong basket for everything it needs.

## 2. Reuse analysis (directive 16)

**New mechanisms: exactly one.** A `rarity` field on `CarModel`, plus an `origin`
field. Everything else is a rename and a re-assignment over machinery that already
exists.

| Concern | The existing thing that already covers it |
| --- | --- |
| Tier to parts class | `fitmentClassForTier` in `partFitment.ts`, already the one mapping every call site threads a `CarModel` through. Keeps its job; only its inputs are renamed. |
| Tier to market expectations | `expectationForCar` reading `economy.valuation.expectationByTier`. Unchanged shape, renamed keys. |
| Rarity to spawn behaviour | **`auctionTierForRarity(tier)` in `auctions.ts` is already the single chokepoint** where a tier becomes auction placement. It becomes `auctionTierForRarity(rarity)`. This is the whole reason the decoupling is cheap. |
| Rarity to flash-sale duration | The same file's duration-by-rarity roll. Same chokepoint, same change. |
| Buyer taste | `buyers.json` already keys preferences by tier; it re-keys, it does not gain a mechanism. |
| Origin as a channel | Nothing yet. The field is authored now and read by the Import Broker when that is built (`TODO.md`). Do NOT build the broker here. |

**What must NOT be built:** a fifth tier. The parts catalogue is exactly four
fitment classes of 118 SKUs; changing the count means re-authoring 472 parts. Four
in, four out.

## 3. The three axes

One enum currently answers three questions badly. After this sprint:

| Axis | Values | Answers | Drives |
| --- | --- | --- | --- |
| `tier` | `entry` `everyday` `enthusiast` `flagship` | What league does this car play in? | Parts fitment class, `expectationByTier`, `cleanSaleMinBand`, repair economics |
| `rarity` | `common` `uncommon` `rare` `legend` | How often do you see one? | Auction tier placement, spawn weighting, flash-sale duration, desirability |
| `origin` | `jdm` `gaisha` | Where did it come from? | The Import Broker channel, when it exists. Inert for now. |

`gaisha` stops being a tier because "foreign" was never a level, and `legend` stops
being a tier because "hard to find" is not a price band.

**Naming note:** none of the four tier labels describes a body type, deliberately.
A car that is neither kei nor compact can sit in `entry` without the label lying.
None of them collides with a part `grade` either (`stock`/`street`/`sport`/`race`),
which a `sport` tier would have done, three lines from `part.grade === 'sport'`.

## 4. Tier assignment (APPROVED, maintainer 2026-07-28)

| tier | cars (book value) |
| --- | --- |
| `entry` | City E 130,000 · Wagon R 230,000 · City Turbo II 320,000 · Alto Works 400,000 · Beat 580,000 |
| `everyday` | Sunny 150,000 · Carina 250,000 · Sera 340,000 · Cefiro 620,000 |
| `enthusiast` | CR-X 480,000 · Prelude 490,000 · S13 500,000 · MR2 AW11 510,000 · Civic EG6 650,000 · 180SX 750,000 · Aristo 770,000 · FC RX-7 850,000 · Chaser 870,000 · AE86 890,000 · S14 1,020,000 · MR2 SW20 1,180,000 |
| `flagship` | FD3S 1,450,000 · Impreza GC8 1,800,000 · Z32 1,850,000 · Supra RZ 2,890,000 · BNR32 3,500,000 |

Price spread per bucket falls from 27x across four scrambled classes to
**4.5x / 4.1x / 2.5x / 2.4x**.

Two rules the assignment follows, worth stating so later additions are consistent:

- **Same chassis, same tier.** City E and City Turbo II are one car with two states
  of tune, so they share a bucket and therefore a parts basket.
- **A kei is `entry` regardless of price.** The Beat at 580,000 sits above four
  `everyday` cars and belongs in `entry` anyway, because its components are
  kei-sized. This incidentally closes something the parts research already flagged:
  the ABC sports trio are kei-sized parts currently priced as full-size ones.

## 5. Rarity assignment (PROPOSED, needs sign-off)

Every car needs a value; this is the new field's whole content. Assigned on how
scarce and sought-after the car actually was in the game's own era, which is now a
separate question from what it cost.

| rarity | cars |
| --- | --- |
| `common` | Sunny · Wagon R · Carina · Alto Works · Prelude · S13 · Cefiro · Civic EG6 · 180SX · Aristo · Chaser · S14 · MR2 SW20 · Z32 · City E |
| `uncommon` | City Turbo II · Sera · CR-X · MR2 AW11 · Beat · FC RX-7 · AE86 · FD3S · Impreza GC8 |
| `rare` | Supra RZ · BNR32 |
| `legend` | (none) |

**`legend` ships empty, deliberately.** `TODO.md` already records that no
legend-rarity car exists in content and that the collector auction tier is held
back for exactly that reason. This sprint does not change that; it just gives the
rung somewhere to live.

**Worth your eye:** the Sera is `everyday` and `uncommon` at once, which is the
decoupling doing its job. The AE86 is `uncommon` on the strength of the period
research, which found it already trading at a specialist premium in 1997.

## 6. Origin assignment

All 26 in-game cars are `jdm`. The `gaisha` value exists for the 59 research
entries and for the Import Broker. Nothing reads the field this sprint.

## 7. Blast radius

Measured, not estimated. `RarityTier` is referenced directly by **12 files**;
`model.tier` is read in about **20**. Beware `.tier` also matching `toolTier` and
`reputationTier`, which are unrelated and must not be swept.

**Content, 5 JSON files keyed by tier:** `cars.json` (per-car value, plus the two
new fields), `economy.json` (`expectationByTier`, `cleanSaleMinBand`, generation
weights), `partPricing.json` (`classFactors`), `parts.json` (SKU fitment classes),
`buyers.json` (taste weighting).

**Schema and mapping, `packages/content/src`:** `tags.ts` (the enum itself),
`carModel.ts`, `partFitment.ts`, `economy.ts`, `buyer.ts`.

**Sim, `packages/sim/src`:** `auctions.ts` (**8 reads, the densest file and the one
that splits across two axes**), `bands.ts`, `marketValue.ts`, `coherence.ts`,
`selling.ts`, `parts.ts`, `serviceJobs.ts`, `stagedWork.ts`, `tutorial.ts`,
`bots/runCareer.ts`.

**Game, `packages/game/src`:** `stores/gameStore.ts` (6 reads),
`save/saveCodec.ts`, `CarDetailScreen.vue`, `AuctionScreen.vue`,
`PartsMarketScreen.vue`, `UpgradesScreen.vue`, `StandingScreen.vue`,
`TutorialOverlay.vue`, `dayLogFormat.ts`, plus the dev sandbox
(`PerformanceSandboxScreen.vue`, `dev/sandboxModel.ts`, `dev/sandboxCars.ts`, the
last being generated by `tools/sandbox/generateCars.mjs` and needing regeneration).

**Tests:** `integrity.test.ts`, `auctions.test.ts`, `storyMissionProbes.test.ts`
(6 reads), `valueModelProbes.test.ts` (5), `coherence.test.ts`, plus the game-side
screen and store tests.

**The one genuinely hard call, and where to be careful:** `auctions.ts` is the only
file where the two new axes both apply and must be told apart line by line.
`fitmentClassForTier(model.tier)` at lines 141 and 377 stays on `tier`;
`auctionTierForRarity` and the flash-sale duration roll move to `rarity`; the
generation weight table needs a deliberate decision about which axis it keys off.
**Do not sweep this file mechanically.** Read every one of its eight tier
references and decide each on its meaning.

**Save schema:** `saveCodec.ts` persists tier. Directive 19 applies, so this is a
Dexie version bump and nothing else. No migration, no legacy branch, no
golden-save test. An old save breaking is the correct outcome.

## 8. Levers (directive 22)

The tier RENAME moves no value: every `expectationByTier` entry keeps its numbers
and only its key changes, and the same holds for `classFactors`,
`cleanSaleMinBand` and the buyer tables. **That is a hard requirement of this
sprint.** If a value moves, the re-measurement in section 10 cannot attribute
anything.

Two things that are not renames and need signing before implementation:

1. **The generation weight table.** `auctions.ts` rolls which tier of car appears.
   Under the old enum that table encoded rarity and price at once. Split apart, it
   has to key off one axis, and whichever it keys off, the other axis's
   distribution changes. Bring the current table and the proposed split to the
   maintainer with numbers rather than guessing.
2. **Any `rarity` value driving spawn frequency**, since `common`/`uncommon`/`rare`
   now mean something the generator reads directly.

## 9. Tasks

- [x] **T1.** Split the enum in `tags.ts`: `CarTierSchema`, `CarRaritySchema`,
      `CarOriginSchema`. Keep `RarityTier` exported as a deprecated alias only if
      something genuinely needs it mid-sweep; delete it before the sprint closes.
- [x] **T2.** Add `rarity` and `origin` to `carModel.ts`, both required, and author
      all 26 in `cars.json` per sections 5 and 6.
- [x] **T3.** Re-key the four tier-keyed content blocks with values byte-identical
      to today. Assert that separately: a test that the renamed table has the same
      numbers as the old one is worth writing and then deleting.
- [x] **T4.** Sweep `packages/content/src` and `packages/sim/src`. **`auctions.ts`
      by hand, reference by reference.**
- [x] **T5.** Sweep `packages/game/src`, including the display strings. Regenerate
      `dev/sandboxCars.ts` via `pnpm sandbox:cars`.
- [x] **T6.** Dexie version bump. Nothing else (directive 19).
- [x] **T7.** Bring the generation weight table decision to the maintainer.
- [x] **T8.** Re-measure the donor law and Law 3, and record the numbers here.

## 10. What this sprint does NOT fix

**The donor law and Law 3 remain open, and are expected to remain open.**
Re-tiering shrinks both because each bucket's price spread falls from 27x to under
5x, so a car is no longer charged a basket calibrated for something four times its
value. It does not eliminate either, because a spread still exists inside every
bucket.

Both are currently red and stay red. Do not tune `usedPartSaleFraction` or
`maxConsumablesShareOfBookValue` in this sprint: measure them after the re-tier
(T8) and bring the maintainer the new numbers. Tuning against the old buckets is
what this sprint exists to stop.

Recorded so it is not lost: **strip labour does not enter the donor law's
arithmetic.** `stripLaborSlots` is disclosed alongside the comparison, not gated by
it, so Sprint 132's `removePart` 0 to 2 change made the donor route cost a player a
day and changed the law's verdict by nothing. Whatever fixes the donor law, it is
not labour cost.

Also open, from Sprint 132: `restoredToBand` lifts part bands but leaves
`zoneState` untouched, so the sensible-play probe pays the body bill and is still
penalised for it in the sale price. Margins read conservative rather than
optimistic, so no assertion is unsafe, but it is a real defect.

## 11. Definition of done

1. `RarityTier` no longer exists. Three axes, each with one job.
2. Every value in the four tier-keyed content blocks is byte-identical to before,
   proven rather than asserted.
3. `auctions.ts` reviewed reference by reference, with each decision recorded.
4. Section 5's rarity assignments signed and authored.
5. The generation weight table signed (T7).
6. Donor law and Law 3 re-measured, numbers in this doc's Exit.
7. `pnpm test` green except the two known-open economy questions above, which are
   named rather than silently passing.

## Exit

Built. `RarityTier` no longer exists anywhere in the repo; `tier`, `rarity` and `origin` are three
fields with one job each. Ready for review, with five things below that need a maintainer decision
and are deliberately left undone.

### The rename moved no value, proven rather than asserted

A temporary test (`packages/content/tests/sprint133RekeyProof.test.ts`) transcribed the pre-sprint
literals and reached every one of them through its new key. Ten cases, all green, then deleted as
the task specified:

- `valuation.expectationByTier`, `partsGeneration.minWorkBillFractionByTier`,
  `diagnosis.symptomChanceByTier` and the three `partsGeneration.zoneStates` weight tables:
  byte-identical under shitbox -> entry, common -> everyday, uncommon -> enthusiast, rare -> flagship.
- `partPricing.classFactors`: 0.25 / 1.0 / 1.6 / 2.5 unchanged.
- **All 472 catalogue SKUs re-resolve to exactly the same yen price.** This is the real proof: a
  moved class factor or a mis-mapped SKU would surface as a price, and none did.
- Buyer preference weights unchanged on all five archetypes.
- The catalogue is still exactly four fitment classes of 118 SKUs.

`cleanSaleMinBand` turns out never to have been tier-keyed at all: it is a scalar `"fine"` on
`reputation`. Section 8 lists it among the tier-keyed blocks, which is a small error in the doc.
It is untouched.

### What the rename could NOT carry, recorded as dropped

Three tables were keyed by the OLD enum's full six values, `gaisha` and `legend` included, which is
what marks them as scarcity tables rather than price-band ones. Their surviving values are
byte-identical; the two keys that were never rarities are gone:

| table | dropped |
| --- | --- |
| `auction.rarityWeightsByReputation.unknown` | `shitbox: 3` (the table's only entry) |
| `selling.offerChanceByTier` -> `offerChanceByRarity` | `shitbox: 1.1`, `gaisha: 0.6` |
| `sellingChannels.freeAdsPaper.offerChanceFactorByTierClass` -> `offerChanceFactorByRarity` | `shitbox: 1.5`, `gaisha: 0.5` |
| `partPricing.classFactors` | `legend: 4` (already dead: the schema stripped it) |
| `buyers.json` collector | `legend: 1`, `gaisha: 0.9` (no tier equivalent exists) |

The two field renames are deliberate: a rarity-keyed table called `...ByTier` would carry the exact
confusion this sprint exists to end.

### The generation weight table: keyed to rarity, and thereby made inert

Keyed to rarity by name-matching as instructed. `shitbox: 3` had no name match and was dropped,
leaving `{}`.

**The finding that matters is structural, not numeric: keyed to rarity this table cannot do
anything at all.** `auctionTierForRarity` partitions rooms by rarity, so every candidate in a room
carries the identical weight and it normalises straight out of the weighted draw. `pickWeightedModel`
is correct and live and has nothing left to separate. Pinned in `auctions.test.ts`.

Spawn distribution, exact rather than sampled (closed-form over the draw; a Monte Carlo would only
add noise). Day-1 board, `unknown` reputation, Local Yard only:

| | before | after |
| --- | --- | --- |
| eligible models | 12 | 15 |
| book value range | Y130,000 - Y650,000 (5.0x) | Y130,000 - Y1,850,000 (14.2x) |
| per-model share | 10.71% each for 8 cheap models, 3.57% each for 4 | 6.67% each, uniform |
| expected book value on the board | Y333,214 | Y657,333 |
| share buyable at the 0.6 reserve on Y300,000 | 82.1% | 46.7% |

With all rooms unlocked the room shares are unchanged (they follow `AUCTION_DAILY_SPAWN_RATE`), but
Premium now holds 2 models rather than 5, so the Supra and BNR32 go from 4.52% to 11.29% each.

**Not tuned, per the brief.** Keyed to TIER the table would work again, since a room now holds all
four tiers. That is the decision. (Signed and applied in the 2026-07-28 follow-up below, which
replaced the table outright rather than re-keying it.)

### Donor law and Law 3, re-measured (T8)

Both were expected to shrink. **Both grew.**

| check | before | after |
| --- | --- | --- |
| donor law (worth more parted than whole) | 11 of 26 | **14 of 26** |
| Law 3 (consumables over 15% of book value) | 6 models | **9 models** |

The cause is measured, not guessed. Re-tiering changed which parts basket eight cars are charged
against an unchanged book value:

| direction | cars | basket change |
| --- | --- | --- |
| dearer | Sunny, Carina, Sera | x4.00 (0.25 -> 1.0) |
| dearer | CR-X, Prelude, MR2 AW11, Civic EG6 | x1.60 (1.0 -> 1.6) |
| dearer | Impreza | x1.56 (1.6 -> 2.5) |
| cheaper | Aristo | x0.64 (2.5 -> 1.6) |
| cheaper | Cefiro | x0.63 (1.6 -> 1.0) |
| unchanged | the other 16 | - |

Worst cases: Sunny at Y150,000 now carries a 48.9% consumables share and parts out at Y542,100
against Y157,500 whole. `partPricing.classFactors` was calibrated when the cheapest class spanned
Y130,000 to Y580,000 and meant "cheap car"; it now means "kei-sized components" and holds five cars,
while the 1.0x class inherited the cheap saloons. **The re-tier is not the defect. It made the real
one legible, and the real one is the class-factor ladder.** That is a directive-22 lever and is
untouched, as is `usedPartSaleFraction` and `maxConsumablesShareOfBookValue`.

### Suite state

`pnpm typecheck` clean across content, sim and game. Red, all named, none silently passing:

1. **Donor law and Law 3** (`coherence.test.ts`, 2 tests). Known-open before this sprint, explicitly
   not this sprint's to fix. Numbers above.
2. **Four story-mission payouts** (`storyMissionProbes.test.ts`). `payoutYen` is derived as
   `ceil1000(1.3 x probe cost)`, and the probe cost moved with the cars' baskets and market values:
   `first-proper-car` 519,000 wants 425,000; `make-it-pull` 949,000 wants 1,113,000;
   `the-fleet-spare` 237,000 wants 266,000; `the-showroom-standard` 926,000 wants 800,000. The
   directions differ because a dearer basket raises repair cost but lowers a worn car's purchase
   price. **Mission payouts are named in directive 22 and are not on this sprint's lever list, so
   execution stopped here rather than pulling an unlisted lever.** The other six missions hold.
   (Signed and applied in the 2026-07-28 follow-up below.)

Re-derived rather than loosened, each documented by the test's own re-derivation rule:

- Both `advanceDay` golden-master hashes, from a real run of the same scripted career.
- The `valueModelProbes` no-bench-work disclosure list: the Aristo dropped out, correctly, because
  its basket got cheaper and the Law 2 ceiling no longer forces every slot to `fine`.
- The auction-room demo's pinned prices: the fixed seed now rolls an S13 and an S14 where it rolled
  a Prelude and an MR2 AW11.
- `SAVE_VERSION` 47 -> 48 and the `economy.json` approval-gate hash, the latter with a full ledger
  entry recording exactly what moved and what did not.

### Notes for the next pass

- **`auctionTierForRarity` is now total.** It used to return `null` for `gaisha`, which is how GDD
  4.5's "no import reaches a regular auction" rule was enforced. That is an ORIGIN rule now, and
  section 6 says nothing reads `origin` this sprint, so the rule has no implementation: it rests on
  every shipped car being `jdm`, which `auctions.test.ts` asserts. Recorded in `TODO.md` as owed by
  the Import Broker.
- **Part SKU ids keep their old class prefixes** (`shitbox-stock-block` is an `entry`-class SKU).
  Ids are opaque, persisted in saves, and referenced by tests and tooling; renaming 472 of them buys
  nothing the `fitmentClass` field does not already say. Deliberate, not an oversight.
- **The integrity guard's per-tier book-value bands were re-cut**, since the old ones encoded the
  scrambled buckets as intentional. Now entry 100k-700k, everyday 120k-800k, enthusiast 400k-1.4M,
  flagship 1.2M-6M: tight, with the overlap that remains being the deliberate "a kei is entry
  regardless of price" rule.
- **`tools/sandbox/generateCars.mjs`'s section-to-tier map was re-derived** from the 26 in-game cars
  by its own documented rule (majority per spec-book section, ties to the lower tier). The `Flagship`
  section now derives to `enthusiast` (3 of 5), which reads oddly but is what the stated rule
  produces; the five judgement-assigned sections kept their intent (top band stays top band).
  Synthesised research entries now carry `origin` derived from the book's own Gaisha section, which
  is real data rather than a placeholder.
- **The auction-room demo bench is coupled to whichever lots its fixed seed happens to roll**, so a
  content change rewrites it wholesale: this time both lots moved (Prelude and MR2 AW11 to S13 and
  S14), taking their symptoms with them, so five tests had to be repointed onto the new symptom
  trees rather than merely re-numbered. Every claim survived the move, including the awkward one (a
  test that moves the clock without moving the money, which the S13's `clutch-drag-check` still
  provides). Worth knowing that this cost is charged again on any future content change.

## Follow-up: room-drawn catalogues, landed 2026-07-28

Section 8's flagged decision and the four off-formula payouts, both signed and both built as a
follow-up to this sprint. Recorded here because they close this sprint's two open items.

### The mechanism

`auctionTierForRarity` is gone. It mapped rarity 1:1 onto an auction house, which is why the Local
Yard was fifteen `common` cars forever and why `rarityWeightsByReputation` could not bias anything.
In its place, **every car is eligible at every house** and the draw runs in two stages:

1. **The house rolls a price band** from its own signed row,
   `economy.auction.carTierWeightsByAuctionTier` (`rollCarTier`).
2. **The band picks a car**, weighted by `economy.auction.rarityDrawMultiplier`
   (`pickModelByRarity`).

| house | entry | everyday | enthusiast | flagship |
| --- | --- | --- | --- | --- |
| `local-yard` | 70 | 28 | 2 | 0 |
| `regional` | 25 | 45 | 27 | 3 |
| `premium` | 3 | 17 | 55 | 25 |
| `collector-network` | 0 | 3 | 27 | 70 |

`rarityDrawMultiplier`: common 1.0, uncommon 0.5, rare 0.2, legend 0.05.

**Two stages rather than one weighted pool, on the maintainer's own correction, and the reason is
worth keeping.** A single pool weighting each candidate by `tierWeight x rarityMultiplier` makes a
band's realised share depend on how many models sit in it: `enthusiast` holds 12 of the 26 cars and
`flagship` 5, so Premium's signed 55/25 would have realised as 81/9, and every future roster
addition would have moved the numbers again. Two stages make the row mean literally what it says.

`canAppearAtAuctionTier` replaces the old function and answers only what it is named for: a zero
row entry keeps a band out of a house entirely, and GDD 9.2's rule that a `legend` reaches no house
but the Collector Network is now an explicit gate rather than a side effect of the 1:1 mapping. No
shipped car is `legend`, so that gate is inert, but it is implemented rather than assumed
(`auctions.test.ts` builds a synthetic legend and proves it).

`generateAuctionCatalog` lost its `reputationTier` parameter, and `catalogs.ts` stopped threading
`state.reputationTier` into it. Nothing is lost: see below.

**Edge case, decided and documented.** A band the house weights above zero but with no eligible
model today is dropped from the roll rather than re-rolled. The two give the identical distribution
(dropping renormalises exactly where an unbounded re-roll converges), but dropping costs one draw
and cannot fail to terminate. Unreachable on the shipped roster; pinned by a test that removes the
entry band from the pool and watches everyday take 28/30 of the Local Yard.

### Measured composition, 5,000 lots per house (5 seeds x 1,000)

Band mix lands on the signed row, which is the whole point of the two-stage draw:

| house | entry | everyday | enthusiast | flagship |
| --- | --- | --- | --- | --- |
| `local-yard` | 69.60% (70) | 28.38% (28) | 2.02% (2) | 0.00% (0) |
| `regional` | 24.32% (25) | 44.76% (45) | 27.66% (27) | 3.26% (3) |
| `premium` | 3.12% (3) | 16.60% (17) | 55.50% (55) | 24.78% (25) |
| `collector-network` | 0.00% (0) | 3.00% (3) | 26.22% (27) | 70.78% (70) |

Rarity mix, which is an OUTPUT here rather than an input (it follows from each band's own rarity
composition, so a house full of enthusiast cars reads mostly common because that band is):

| house | common | uncommon | rare |
| --- | --- | --- | --- |
| `local-yard` | 77.76% | 22.24% | 0.00% |
| `regional` | 80.00% | 19.44% | 0.56% |
| `premium` | 71.98% | 23.70% | 4.32% |
| `collector-network` | 52.34% | 28.00% | 12.32% |

Within a band, the multiplier does exactly what it says. Entry holds three common cars and two
uncommon (weight total 4.0), so each common takes a quarter of the band and the uncommon pair a
quarter between them: Wagon R 25.4%, Alto Works 25.1%, City E 24.5%, Beat 13.0%, City Turbo II
12.0%. Flagship holds one common, two uncommon and two rare (weight total 2.4): Z32 40.6%, FD 21.7%,
Impreza 20.3%, Supra 9.1%, BNR32 8.3%. Local Yard's enthusiast row is only 2% of the house, so its
per-model figures there sit on about 100 lots and read noisy; the same band at Regional and Premium
(about 1,400 lots each) lands within a point of the closed form.

Where a fresh career now stands, against the two prior states of this sprint:

| day-1 Local Yard | pre-Sprint-133 | Sprint 133 (uniform) | now |
| --- | --- | --- | --- |
| expected book value of a lot | Y333,214 | Y657,333 | Y324,974 |
| share buyable at the 0.6 reserve on Y300,000 | 82.1% | 46.7% | 81.1% |

The affordability bias the old `{unknown: {shitbox: 3}}` entry provided is restored, and by a
mechanism that says what it means rather than by a per-model nudge.

### Reputation conditioning: nothing measurable was lost

Checked rather than assumed. The old table was keyed by `ReputationTier` and shipped exactly one
entry, `{unknown: {shitbox: 3}}`, and by the time this sprint keyed it to rarity it was empty. So
in shipped content the parameter conditioned nothing at all, and `generateAuctionCatalog`'s
`reputationTier` argument was dead weight the moment the table emptied.

What reputation still does to the board, unchanged by this work:

- **It decides which houses exist for you.** Guarantor unlocks (Sprint 115) open regional, premium
  and collector-network; `local-yard` is open from day one. Since a house now IS a price-band
  distribution, reputation still controls the price bands a player can reach, which is what the old
  table was reaching for.
- **It sets the in-game year** (`currentGameYear(state.reputationTier)`), which still gates which
  models have been released.

**What is genuinely gone: the ability to vary the mix WITHIN one house by reputation.** A
late-career player's Local Yard is now identical to a day-1 player's. That was never expressed in
shipped content, so nothing measurable moved. If the maintainer wants it back, the honest shape is
a second table keyed by reputation over the same `CarTier` axis, either replacing a house's row or
scaling it, which is a new lever and needs signing; it is deliberately NOT invented here.

### Four payouts back on formula

Per the standing ruling of 2026-07-28 that formula-derived payouts follow the formula, measured
fresh through `storyMissionProbes`'s own `payoutYenFor` rather than transcribed:

| mission | payout and budget cap |
| --- | --- |
| `first-proper-car` | 519,000 -> 425,000 |
| `make-it-pull` | 949,000 -> 1,113,000 |
| `the-fleet-spare` | 237,000 -> 266,000 |
| `the-showroom-standard` | 926,000 -> 800,000 |

Each budget cap moves with its own payout, holding the one-price contract. `four-wheels` is
unchanged at 135,000: it sits deliberately off the generic formula.

### What this cost elsewhere, re-derived from real runs

- Both `advanceDay` golden hashes (`bf37a61a` to `b172daf3`, `0e059bb1` to `49de7d36`).
- **The auction-room demo bench, wholesale for the second sprint running.** The fixed-seed
  catalogue now rolls a Carina AT150 as the steal and a City E as the trap, in place of the S13 and
  S14, so 21 tests across three files moved: prices, room logs, dealer names at the hammer, and both
  symptom chains. The steal's damp-footwell tree still provides the awkward case the S13 used to (a
  test that moves the clock without moving the money: `coolant-check` rules out only a cause
  `trace-the-wet` has already ruled out). The packed room no longer ignites a feud at its seed,
  because the new lot's board-to-clearing gap falls under `feudMinGapRungs` as it climbs; the feud
  machinery keeps its own dedicated `bareRoom` coverage, so nothing is untested. **This bench is
  coupled to whichever lots one fixed seed rolls, and it has now charged its full cost twice in two
  sprints.** Worth its own decision at some point.
