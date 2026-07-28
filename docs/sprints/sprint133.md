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

- [ ] **T1.** Split the enum in `tags.ts`: `CarTierSchema`, `CarRaritySchema`,
      `CarOriginSchema`. Keep `RarityTier` exported as a deprecated alias only if
      something genuinely needs it mid-sweep; delete it before the sprint closes.
- [ ] **T2.** Add `rarity` and `origin` to `carModel.ts`, both required, and author
      all 26 in `cars.json` per sections 5 and 6.
- [ ] **T3.** Re-key the four tier-keyed content blocks with values byte-identical
      to today. Assert that separately: a test that the renamed table has the same
      numbers as the old one is worth writing and then deleting.
- [ ] **T4.** Sweep `packages/content/src` and `packages/sim/src`. **`auctions.ts`
      by hand, reference by reference.**
- [ ] **T5.** Sweep `packages/game/src`, including the display strings. Regenerate
      `dev/sandboxCars.ts` via `pnpm sandbox:cars`.
- [ ] **T6.** Dexie version bump. Nothing else (directive 19).
- [ ] **T7.** Bring the generation weight table decision to the maintainer.
- [ ] **T8.** Re-measure the donor law and Law 3, and record the numbers here.

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

Not started.
