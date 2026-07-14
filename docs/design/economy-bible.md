# The Economy Bible

*Canonical rules for all economy design in Midnight Garage. Locked with the maintainer
2026-07-14 during the Economy Rebuild arc (Sprints 53-55), triggered by a playtest that found the
core repair loop paying a net loss on the exact play it should reward. Every sprint, feature, or
tuning change that touches car value, repair cost, or parts pricing MUST be checked against this
document before implementation. Deviating from it is a bug, not a creative choice. Amendments
require explicit maintainer approval recorded here with a date. No em dashes anywhere in this file
or anything derived from it (CLAUDE.md directive 15).*

## The fantasy is the spec

You find a wreck nobody wants, you make it good, you sell it for more than you put in. **Repairing
a car and improving its condition must almost always be profitable.** Every economy formula is
judged against that sentence. A formula that makes the core loop a trap, however well-intentioned
its individual pieces, is a bug, not a balance choice.

Deliberate anti-realism, stated openly: in 1995 reality a worn-out kei car IS a write-off, not
worth fixing. The game's fantasy is profitable restoration regardless of where a car starts. The
economy serves the fantasy, not the other way around.

## The diagnosis that produced this document (2026-07-14)

A maintainer playtest bought a Y3,868 shitbox (Honda City E (AA), 1983, 116,226 km, every group
`poor`), spent Y45,000 on real triage repairs and consumable replacement, and watched the car's
guide value not move at all - net Y41,133 in the red. Four stacked causes, all traced to live code
at the time:

1. **A flat, tier-blind parts catalog priced against a 23x car-value ladder.** One global parts
   price list served every car regardless of value tier, so a cheap car's full restoration bill
   could run 2-4x its own restored ceiling - not an edge case, the norm for the cheapest tier.
2. **A silent regression collapsed the value floor 4.4x** (`floorFraction` 0.22 quietly became
   `scrapValueFraction` 0.05 during a formula rewrite, with no re-tune discussion). A damaged car's
   guide value sat pinned to a near-zero floor through the first ~Y55,000-95,000 of repair spend,
   producing exactly zero visible feedback for real work.
3. **A guaranteed-loss zone even without the floor.** Above a threshold, the value formula
   discounted every repair yen at a 60% loss rate - structurally negative return on the majority
   of any damaged car's repair range.
4. **No trap guard at generation.** The auction rolled per-part condition with zero check against
   whether the resulting car could ever be restored profitably - value-trap lots were the norm,
   not the exception, at the only tier a new player can afford.

Full arithmetic trace: `docs/sprints/sprint53.md`'s Diagnosis section (this bible condenses it;
that sprint doc is the historical record).

## The four laws

1. **Repair margin (Law 1).** The marginal value returned per repair yen is >= 1 at every
   reachable state of every car - first-pass 1.2 (buyers pay a premium for done-ness; the hassle
   premium is the flipper's edge). No zone anywhere with slope < 1. *Litmus: can a maintainer point
   to any car, any damage state, where spending a repair yen returns less than a yen of value? If
   yes, the formula is wrong, not the maintainer's play.* (Sprint 54.)
2. **No value traps (Law 2).** Every car the game generates satisfies `worstCaseBill <=
   maxBillFraction x cleanValue` (first-pass 0.7) - buy at reserve, fully restore, sell at guide
   clears a positive margin on every generatable lot. Enforced at generation and as a closed-form
   invariant over the whole roster, forever. *Litmus: pick any lot ever generated - is full
   restoration mathematically capable of turning a profit?* (Sprint 54, guarded forever by
   Sprint 55.)
3. **Proportionate parts (Law 3).** Parts and repair costs scale with the car's fitment class, and
   cross-class arbitrage is physically impossible (a part that doesn't fit doesn't install) - so
   "brake pads cost twice the car" cannot exist by construction, not by tuning. *Litmus: does any
   single part's price approach or exceed a car it could plausibly be bolted to?* (Sprint 53.)
4. **One ledger, derived (Law 4).** Every yen number in the game is either a named anchor in one
   content sheet or a pure function of one; cross-price coherence is machine-checked on every
   change, not eyeballed. *Litmus: if two prices drifted apart, would a test catch it before a
   playtest does?* (Sprint 55.)

## Fitment classes (Sprint 53)

Four classes, deliberately identical to the existing roster tiers so every car already carries one
with zero mapping cost: `shitbox`, `common`, `uncommon`, `rare` (code identifiers; `gaisha`/`legend`
fold into `rare` until the roster grows past PoC scope and earns a real mapping). Player-facing
copy never shows a raw tier id - it uses the diegetic class names:

| Code | Player-facing name |
|---|---|
| `shitbox` | Kei & Compact |
| `common` | Family |
| `uncommon` | Sports |
| `rare` | Grand Touring |

Every component slot ships as four real, separately named catalog SKUs per quality grade (16 SKUs
per slot: 4 classes x 4 grades - stock/street/sport/race) - real, distinct store entries, never a
single part with a runtime price switch. Exactly one class's four SKUs fit any given car; the
install gate refuses a mismatch outright, sim-side, so there is no path around it. The existing
116-part catalog (pre-Sprint-53) is kept, unchanged in id, as the `common` class's SKUs - both to
preserve every historical save-migration test that resolves those exact ids, and because their
prices already sit at what the class system calls the baseline (`common` class factor = 1.0).

**Naming convention:** a SKU's `id`/`brand`/`name`/`grade` describe the part itself, identical
across all four classes of the same part+grade (e.g. `brand: "Hagane", name: "Stroker Kit"` is the
same string whether it's the kei, family, sports, or GT version) - the class lives in the SKU's own
`fitmentClass` field, not baked into the name string. The UI prefixes the diegetic class label at
render time ("Kei & Compact Hagane Stroker Kit"), so renaming a class ("Sports" -> "Performance")
or adding a fifth class later is a one-line content edit, never a 116-string rewrite.

## The centralised pricing sheet (Sprint 53)

Every SKU's price resolves at content-load time, not at authoring time, from `partPricing.json`:

    priceYen = override[skuId] ?? round100(baseCostYen[carPartId] x classFactor[class]
                                            x gradeFactor[grade] x globalFactor)

- `baseCostYen`: one number per part TYPE (29 entries, one per `CarPartId`) - what a stock-grade
  version of that part type costs at the `common`/family baseline. Extracted directly from the
  pre-Sprint-53 catalog's existing stock prices, so `common`-class stock prices are unchanged.
- `classFactors` (first-pass, tuning bait): `{shitbox: 0.25, common: 1.0, uncommon: 1.6, rare: 2.5}`.
- `gradeFactors` (first-pass, fitted to the pre-existing catalog's own ratios, tuning bait):
  `{stock: 1.0, street: 1.3, sport: 2.0, race: 2.8}`.
- `globalFactor`: one whole-market volume lever, starts at 1.0.
- `overrides`: a sparse `skuId -> priceYen` map that wins outright over the formula. Ships EMPTY;
  every entry is a deliberate, individually-justified maintainer decision, and Sprint 55's
  coherence report lists every active override plus flags any that drifts far from its derived
  price, so the list can never silently rot into a second hand-typed catalog.

**The tuning grammar this buys** (the whole reason this sheet exists): "everything's too
expensive" moves `globalFactor`; "brake pads specifically" moves one `baseCostYen` entry; "kei
parts too cheap" moves one class factor; "race parts should cost more" moves one grade factor;
"this one specific part is wrong" gets one override line. A whole-market rebalance is a handful of
multiplications, never a mass content edit.

A part-type's flat, un-classed **stock-replacement price** (what fills a genuinely empty or
scrapped slot) derives the same way, per class: it is simply that class's own stock-grade SKU
price - never a separately hand-authored number, so it can never drift from the catalog it
describes.

## The anchor inventory (v1 - full audit lands Sprint 55)

Hand-authored anchors (change these and everything downstream recomputes):

- Car `bookValueYen` per model (`cars.json`).
- `partPricing.json`'s `baseCostYen`/`classFactors`/`gradeFactors`/`globalFactor`/`overrides`.
- Labor rate, callout fee, rent, starting cash, reserve fraction, offer spreads, mileage/condition
  generation curves (`economy.json`).

Derived (never edit directly; edit the anchor that feeds them):

- Every SKU's `priceYen` and every taxonomy entry's per-class stock-replacement price (Sprint 53).
- Repair/restoration bills (`bands.ts`'s `costToMintYen` family) - a fraction of the INSTALLED
  part's own resolved price, never the host car's identity (Sprint 44's anti-arbitrage law,
  preserved).
- Guide/market value (`marketValue.ts`) - clean value minus a repair-margin-scaled bill discount
  (Sprint 54).
- Auction reserve, buyout premium, service-job payouts - all fractions or margins over guide value
  or task cost, never independently authored.

Sprint 55 promotes this section into a machine-checked table (per-model bill/value ratios, flip
margins, consumables-vs-car-value share) so a maintainer can eyeball the whole roster's economy on
one page instead of discovering a drift via playtest.

## Amendment log

- 2026-07-14: document created; Law 3 and the fitment-class/pricing-sheet system implemented
  (Sprint 53). Laws 1 and 2 designed, implementation pending (Sprint 54). Law 4's full machine-
  checked audit designed, implementation pending (Sprint 55).
