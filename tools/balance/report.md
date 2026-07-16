# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y51,723 | Y121,220 | Y183,406 | 1.0 | 0.0 |
| balanced-player | 40 | Y12,495 | Y79,666 | Y130,282 | 1.0 | 0.0 |
| balanced-player | 70 | Y-87,505 | Y-20,334 | Y30,575 | 1.0 | 0.0 |
| balanced-player | 100 | Y-167,505 | Y-100,334 | Y-49,425 | 1.0 | 0.0 |
| cautious-restorer | 25 | Y19,096 | Y88,006 | Y151,347 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y-20,904 | Y47,886 | Y108,818 | 1.0 | 0.0 |
| cautious-restorer | 70 | Y-120,904 | Y-52,114 | Y8,818 | 1.0 | 0.0 |
| cautious-restorer | 100 | Y-200,904 | Y-132,114 | Y-71,182 | 1.0 | 0.0 |
| competent-policy | 25 | Y71,926 | Y158,344 | Y280,609 | 1.0 | 0.0 |
| competent-policy | 40 | Y31,390 | Y104,856 | Y207,475 | 1.0 | 0.0 |
| competent-policy | 70 | Y-68,610 | Y4,734 | Y92,414 | 1.0 | 0.0 |
| competent-policy | 100 | Y-148,610 | Y-75,266 | Y15,224 | 1.0 | 0.0 |
| flipper | 25 | Y36,638 | Y95,911 | Y174,014 | 1.0 | 0.0 |
| flipper | 40 | Y2,495 | Y63,222 | Y144,300 | 1.0 | 0.0 |
| flipper | 70 | Y-97,505 | Y-27,920 | Y66,609 | 1.0 | 0.0 |
| flipper | 100 | Y-177,505 | Y-107,920 | Y3,605 | 1.0 | 0.0 |
| handyman | 25 | Y45,271 | Y115,360 | Y172,430 | 1.0 | 0.0 |
| handyman | 40 | Y5,271 | Y72,344 | Y124,529 | 1.0 | 0.0 |
| handyman | 70 | Y-94,729 | Y-27,656 | Y24,529 | 1.0 | 0.0 |
| handyman | 100 | Y-174,729 | Y-107,656 | Y-55,471 | 1.0 | 0.0 |
| investor | 25 | Y19,197 | Y89,786 | Y147,332 | 1.0 | 0.0 |
| investor | 40 | Y-20,803 | Y46,773 | Y98,338 | 1.0 | 0.0 |
| investor | 70 | Y-120,803 | Y-53,227 | Y-1,662 | 1.0 | 0.0 |
| investor | 100 | Y-200,803 | Y-133,227 | Y-81,662 | 1.0 | 0.0 |
| passive-grinder | 25 | Y240,000 | Y240,000 | Y240,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y200,000 | Y200,000 | Y200,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y100,000 | Y100,000 | Y100,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y20,000 | Y20,000 | Y20,000 | 0.0 | 0.0 |
| random | 25 | Y43,062 | Y106,046 | Y166,360 | 1.0 | 0.0 |
| random | 40 | Y3,062 | Y65,258 | Y119,985 | 1.0 | 0.0 |
| random | 70 | Y-96,938 | Y-34,742 | Y19,985 | 1.0 | 0.0 |
| random | 100 | Y-176,938 | Y-114,742 | Y-60,015 | 1.0 | 0.0 |
| service-grinder | 25 | Y231,200 | Y266,771 | Y317,500 | 0.0 | 0.0 |
| service-grinder | 40 | Y199,664 | Y249,824 | Y312,162 | 0.0 | 0.0 |
| service-grinder | 70 | Y113,552 | Y186,433 | Y270,741 | 0.0 | 0.0 |
| service-grinder | 100 | Y58,740 | Y149,352 | Y243,853 | 0.0 | 0.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 0/1000 | - | - | - |
| known | 0/1000 | - | - | - |
| respected | 0/1000 | - | - | - |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 6.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | body | 16.0 |

## Roster coherence (Sprint 55, economy-bible.md law 4)

Per-model closed-form facts at the worst plausible roll (post Law-2 generation guard): clean value, the softened worst-case restoration bill and its ratio to clean value (must stay <= `maxBillFraction`), the flip margin buying at reserve + fully restoring TO MINT + selling at guide would clear (must stay positive), and the full consumable-replacement share of book value (must stay under the content cap).

Read **Sensible margin** first (Sprint 66). Since Law 1 gained a per-tier expectation band, a full mint restore is no longer the play the economy asks for on a cheap car - the market barely discounts a worn kei, so you pay near clean value for one and the mint bill burns the margin. **Sensible margin** is the real core loop: buy rough (every slot `poor`) at reserve, repair up to the tier's expectation band and not a yen past, sell at the resulting guide. **Mint flip** stays gated as Law 2's literal claim (full restoration must always be *capable* of profit), but on the shitbox tier it correctly collapses.

**Wage** (Law 6) is the value a repair returns over its own cost, less the rent accrued over the labour it takes, on a rough-but-fixable car at a fresh shop's tier-1 tools. It must stay positive on common/uncommon/rare models (gated); on the shitbox tier it is honestly negative once the full teardown chain is priced (Sprint 72), a disclosed gap, not a gate. The **xRent** ratio is the tuning dial: it is invariant to the target band (cost and labour both scale with grade count), and falls down the roster because repair labour is value-blind while the margin scales with part price.

| Model | Class | Clean value | Worst bill | Ratio | Sensible margin | Mint flip | Wage | xRent | Consumables share |
|---|---|---|---|---|---|---|---|---|---|
| honda-city-e-aa | shitbox | Y135,000 | Y66,840 | 49.5% | Y34,309 (25.4%) | Y3,202 | Y-20,725 | 0.39x | 8.1% |
| honda-civic-sir2-eg6 | common | Y487,500 | Y267,200 | 54.8% | Y92,995 (19.1%) | Y124,348 | Y58,886 | 2.29x | 8.9% |
| mazda-rx7-fd3s | rare | Y2,400,000 | Y997,000 | 41.5% | Y787,800 (32.8%) | Y860,300 | Y366,000 | 7.10x | 4.5% |
| mazda-savanna-rx7-fc3s | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y360,723 (26.7%) | Y443,475 | Y134,141 | 3.82x | 5.2% |
| nissan-180sx-rps13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y79,418 (9.6%) | Y251,651 | Y134,141 | 3.82x | 8.4% |
| nissan-silvia-ks-s14 | uncommon | Y1,125,000 | Y638,080 | 56.7% | Y270,723 (24.1%) | Y353,475 | Y134,141 | 3.82x | 6.2% |
| suzuki-wagon-r-ct21s | shitbox | Y165,000 | Y93,010 | 56.4% | Y46,309 (28.1%) | Y22,155 | Y-20,725 | 0.39x | 6.6% |
| toyota-chaser-tourer-v-jzx90 | uncommon | Y1,200,000 | Y638,080 | 53.2% | Y300,723 (25.1%) | Y383,475 | Y134,141 | 3.82x | 5.8% |
| toyota-sprinter-trueno-ae86 | uncommon | Y1,050,000 | Y594,880 | 56.7% | Y250,515 (23.9%) | Y330,387 | Y121,646 | 3.66x | 6.6% |
| toyota-supra-rz-jza80 | rare | Y3,150,000 | Y997,000 | 31.7% | Y1,087,800 (34.5%) | Y1,160,300 | Y366,000 | 7.10x | 3.5% |

## Donor coherence (Sprint 71 decision 8, the teardown game)

Whole-car sale value against parting out the same clean car (haircut `economy.teardown.usedPartSaleFraction`, plus scrapping the stripped shell). **Whole must always beat parted** - a clean car should never be worth more destroyed for parts. **Parting wins?** measures the SEPARATE worst-case-car question: does stripping the worst plausible generatable roll's still-good parts (better than `poor`) beat that same model's sensible-repair margin - disclosed against a 45% bill-to-clean break-even, not force-gated to it.

| Model | Whole sale | Parted yield | Strip labour | Bill/clean | Parting wins? |
|---|---|---|---|---|---|
| honda-city-e-aa | Y189,000 | Y134,235 | 27 slots | 49.5% | yes |
| honda-civic-sir2-eg6 | Y682,500 | Y533,000 | 27 slots | 54.8% | yes |
| mazda-rx7-fd3s | Y3,360,000 | Y1,535,000 | 28 slots | 41.5% | no |
| mazda-savanna-rx7-fc3s | Y1,890,000 | Y970,000 | 28 slots | 47.3% | no |
| nissan-180sx-rps13 | Y1,155,000 | Y935,000 | 28 slots | 55.3% | yes |
| nissan-silvia-ks-s14 | Y1,575,000 | Y955,000 | 28 slots | 56.7% | no |
| suzuki-wagon-r-ct21s | Y231,000 | Y136,235 | 27 slots | 56.4% | no |
| toyota-chaser-tourer-v-jzx90 | Y1,680,000 | Y960,000 | 28 slots | 53.2% | no |
| toyota-sprinter-trueno-ae86 | Y1,470,000 | Y870,800 | 27 slots | 56.7% | no |
| toyota-supra-rz-jza80 | Y4,410,000 | Y1,585,000 | 28 slots | 31.7% | no |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 4.2% | 10%-25% |
| mid | 20.8% | 50%-100% |
| frenzy | 75.1% | 5%-15% |

## Buyout vs. bid (external review 2026-07, finding 2)

Share of successful auction acquisitions made via instant buyout vs. a won competitive bid, per strategy. A strategy near 100% buyout means the bidding screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a 25% premium over the value anchor, Sprint 20) is cheap enough that certainty always wins. Bots never buy out as of Sprint 20 (buyout is a player-impatience valve only), so this section's bot-side numbers are expected to read as 0% buyout going forward - kept for the player-side telemetry hook and as a regression check that bots really have stopped buying out.

| Strategy | Bid | Buyout |
|---|---|---|
| balanced-player | 100.0% | 0.0% |
| cautious-restorer | 100.0% | 0.0% |
| competent-policy | 100.0% | 0.0% |
| flipper | 100.0% | 0.0% |
| handyman | 100.0% | 0.0% |
| investor | 100.0% | 0.0% |
| random | 100.0% | 0.0% |

## Invariants enforced (Sprint 23 decision 7, Sprint 55 decision 2)

`balance.cli check` hard-gates 11 checks against this data: days-to-`local` p50 in [10, 35] (competent-policy probe), buyout share of acquisitions < 30%, the 3 legacy Sprint 03/09 checks (Passive Grinder solvency, Flipper-vs-Passive separation, sanity floor), and 6 roster-coherence checks (economy-bible.md law 4, Sprints 55, 66, and 72): every model's worst-case bill-to-clean ratio <= `maxBillFraction` (law 2), every model's flip margin at the worst roll is positive (law 1), every model's SENSIBLE-play margin is positive (law 1 as amended, Sprint 66), every COMMON/UNCOMMON/RARE model's repair wage beats the rent over the labour it takes (law 6, Sprint 66; the shitbox tier is measured separately below, Sprint 72), every model's full consumable-replacement share of book value <= the content cap (law 3), and the service-job payout margin floor clears the profitability invariant's required coverage (law 4 - the full per-template/per-model proof is `serviceJobPayout.test.ts`, already gated in the standard test suite). 4 more are measured and reported but NOT gated (kept informational rather than promoted, since no maintainer has signed off on hard-gating them yet) - see `invariants.py`'s module docstring for their history. The first 3 currently read BADLY, and deliberately so: as of Sprint 66 most strategies lose money (Flipper is well below its own starting cash) and the auction tail is frenzy-dominant. Do not tune the economy against those figures. They measure BOT behaviour, and the bots restore every car to mint - which economy-bible law 1, as amended in Sprint 66, now correctly punishes on a cheap car. The closed-form coherence table above is bot-free and proves the same cars clear a healthy margin on the play the economy actually asks for. The bots needing a rework to play the real game is a known, recorded defect (`TODO.md`), not an economy failure - see `docs/sprints/sprint66.md`'s Exit. The 4th (Sprint 72): honestly pricing a non-surface repair's full teardown chain surfaces a genuine shitbox-tier law 6 loss (cheap parts return too little repair gain to outearn the rent the teardown labour burns) - measured and disclosed, not silently loosened, pending a maintainer economy-tuning decision (`TODO.md`).
