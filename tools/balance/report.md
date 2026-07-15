# Midnight Garage - Balance Report

One row per strategy per checkpoint day, across every seeded career (see `careers.manifest.json` for the run size).

| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) | Reputation pts (median) |
|---|---|---|---|---|---|---|
| balanced-player | 25 | Y75,470 | Y151,020 | Y267,633 | 1.0 | 0.0 |
| balanced-player | 40 | Y104,770 | Y182,056 | Y229,359 | 0.0 | 0.0 |
| balanced-player | 70 | Y64,358 | Y90,878 | Y144,811 | 0.0 | 0.0 |
| balanced-player | 100 | Y-15,325 | Y11,656 | Y69,244 | 0.0 | 0.0 |
| cautious-restorer | 25 | Y15,089 | Y86,434 | Y222,988 | 1.0 | 0.0 |
| cautious-restorer | 40 | Y-18,959 | Y138,716 | Y185,753 | 0.0 | 1.0 |
| cautious-restorer | 70 | Y-118,959 | Y57,034 | Y98,891 | 0.0 | 0.0 |
| cautious-restorer | 100 | Y-198,959 | Y-22,858 | Y19,083 | 0.0 | 0.0 |
| competent-policy | 25 | Y111,272 | Y286,378 | Y381,078 | 0.0 | 16.0 |
| competent-policy | 40 | Y112,839 | Y305,156 | Y417,117 | 0.0 | 25.0 |
| competent-policy | 70 | Y98,817 | Y342,766 | Y473,111 | 0.0 | 63.0 |
| competent-policy | 100 | Y67,193 | Y401,414 | Y551,666 | 0.0 | 102.5 |
| flipper | 25 | Y28,818 | Y89,251 | Y218,069 | 1.0 | 0.0 |
| flipper | 40 | Y6,664 | Y69,368 | Y192,014 | 1.0 | 0.0 |
| flipper | 70 | Y-92,459 | Y-26,183 | Y91,649 | 1.0 | 0.0 |
| flipper | 100 | Y-172,459 | Y-106,183 | Y1,004 | 1.0 | 0.0 |
| handyman | 25 | Y54,346 | Y117,254 | Y240,000 | 1.0 | 0.0 |
| handyman | 40 | Y62,854 | Y169,714 | Y205,358 | 0.0 | 0.0 |
| handyman | 70 | Y48,117 | Y80,207 | Y118,768 | 0.0 | 0.0 |
| handyman | 100 | Y-31,883 | Y258 | Y38,857 | 0.0 | 0.0 |
| investor | 25 | Y18,882 | Y88,727 | Y146,616 | 1.0 | 0.0 |
| investor | 40 | Y-21,118 | Y45,620 | Y96,807 | 1.0 | 0.0 |
| investor | 70 | Y-121,118 | Y-54,380 | Y-3,193 | 1.0 | 0.0 |
| investor | 100 | Y-201,118 | Y-134,380 | Y-83,193 | 1.0 | 0.0 |
| passive-grinder | 25 | Y240,000 | Y240,000 | Y240,000 | 0.0 | 0.0 |
| passive-grinder | 40 | Y200,000 | Y200,000 | Y200,000 | 0.0 | 0.0 |
| passive-grinder | 70 | Y100,000 | Y100,000 | Y100,000 | 0.0 | 0.0 |
| passive-grinder | 100 | Y20,000 | Y20,000 | Y20,000 | 0.0 | 0.0 |
| random | 25 | Y52,945 | Y131,383 | Y258,844 | 1.0 | 0.0 |
| random | 40 | Y58,690 | Y169,604 | Y213,203 | 0.0 | 0.0 |
| random | 70 | Y48,962 | Y85,905 | Y135,893 | 0.0 | 0.0 |
| random | 100 | Y-30,886 | Y6,934 | Y62,032 | 0.0 | 0.0 |
| service-grinder | 25 | Y262,611 | Y329,426 | Y383,147 | 0.0 | 23.0 |
| service-grinder | 40 | Y261,988 | Y347,752 | Y421,341 | 0.0 | 40.0 |
| service-grinder | 70 | Y255,461 | Y379,248 | Y469,169 | 0.0 | 78.0 |
| service-grinder | 100 | Y248,148 | Y418,498 | Y527,642 | 0.0 | 113.0 |

## Days-to-tier (Sprint 23, competent-policy probe)

First day each seeded `competent-policy` career reaches each reputation tier or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); `known`/`respected` are informational against sprint23.md's own pacing targets (day 50-70 and day 90-120 respectively).

| Tier | Reached | p10 | p50 | p90 |
|---|---|---|---|---|
| local | 948/1000 | 10 | 16 | 43 |
| known | 801/1000 | 30 | 50 | 83 |
| respected | 386/1000 | 67 | 84 | 97 |

## Specialty (Sprint 38, informational)

Day-100 top specialty group (most common across seeds) and its median point value, per strategy. `engine`/0 means the strategy never earned any (the argmax default).

| Strategy | Most common top group | Points (median) |
|---|---|---|
| balanced-player | engine | 0.0 |
| cautious-restorer | engine | 0.0 |
| competent-policy | engine | 45.0 |
| flipper | engine | 0.0 |
| handyman | engine | 0.0 |
| investor | engine | 0.0 |
| passive-grinder | engine | 0.0 |
| random | engine | 0.0 |
| service-grinder | engine | 50.0 |

## Roster coherence (Sprint 55, economy-bible.md law 4)

Per-model closed-form facts at the worst plausible roll (post Law-2 generation guard): clean value, the softened worst-case restoration bill and its ratio to clean value (must stay <= `maxBillFraction`), the flip margin buying at reserve + fully restoring TO MINT + selling at guide would clear (must stay positive), and the full consumable-replacement share of book value (must stay under the content cap).

Read **Sensible margin** first (Sprint 66). Since Law 1 gained a per-tier expectation band, a full mint restore is no longer the play the economy asks for on a cheap car - the market barely discounts a worn kei, so you pay near clean value for one and the mint bill burns the margin. **Sensible margin** is the real core loop: buy rough (every slot `poor`) at reserve, repair up to the tier's expectation band and not a yen past, sell at the resulting guide. **Mint flip** stays gated as Law 2's literal claim (full restoration must always be *capable* of profit), but on the shitbox tier it correctly collapses.

**Wage** (Law 6) is the value a repair returns over its own cost, less the rent accrued over the labour it takes, on a rough-but-fixable car at a fresh shop's tier-1 tools. It must stay positive. The **xRent** ratio is the tuning dial: it is invariant to the target band (cost and labour both scale with grade count), and falls down the roster because repair labour is value-blind while the margin scales with part price.

| Model | Class | Clean value | Worst bill | Ratio | Sensible margin | Mint flip | Wage | xRent | Consumables share |
|---|---|---|---|---|---|---|---|---|---|
| honda-city-e-aa | shitbox | Y135,000 | Y66,840 | 49.5% | Y34,309 (25.4%) | Y3,202 | Y1,180 | 1.10x | 8.1% |
| honda-civic-sir2-eg6 | common | Y487,500 | Y267,200 | 54.8% | Y92,995 (19.1%) | Y124,348 | Y80,790 | 4.39x | 8.9% |
| mazda-rx7-fd3s | rare | Y2,400,000 | Y997,000 | 41.5% | Y787,800 (32.8%) | Y860,300 | Y388,857 | 11.47x | 4.5% |
| mazda-savanna-rx7-fc3s | uncommon | Y1,350,000 | Y638,080 | 47.3% | Y360,723 (26.7%) | Y443,475 | Y156,998 | 7.34x | 5.2% |
| nissan-180sx-rps13 | uncommon | Y825,000 | Y456,320 | 55.3% | Y79,418 (9.6%) | Y251,651 | Y156,998 | 7.34x | 8.4% |
| nissan-silvia-ks-s14 | uncommon | Y1,125,000 | Y638,080 | 56.7% | Y270,723 (24.1%) | Y353,475 | Y156,998 | 7.34x | 6.2% |
| suzuki-wagon-r-ct21s | shitbox | Y165,000 | Y93,010 | 56.4% | Y46,309 (28.1%) | Y22,155 | Y1,180 | 1.10x | 6.6% |
| toyota-chaser-tourer-v-jzx90 | uncommon | Y1,200,000 | Y638,080 | 53.2% | Y300,723 (25.1%) | Y383,475 | Y156,998 | 7.34x | 5.8% |
| toyota-sprinter-trueno-ae86 | uncommon | Y1,050,000 | Y594,880 | 56.7% | Y250,515 (23.9%) | Y330,387 | Y143,550 | 7.03x | 6.6% |
| toyota-supra-rz-jza80 | rare | Y3,150,000 | Y997,000 | 31.7% | Y1,087,800 (34.5%) | Y1,160,300 | Y388,857 | 11.47x | 3.5% |

## Auction calibration (Sprint 20, auction rework II)

Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot bid on and lost or won (see `auctionWins.manifest.json` for the run size). steal < 0.65, mid 0.65-0.9, frenzy > 0.9. Target: steal 10-25% (patient bidding beating buyout most of the time), mid the majority, frenzy 5-15%.

| Bucket | Share | Target |
|---|---|---|
| steal | 3.8% | 10%-25% |
| mid | 21.0% | 50%-100% |
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

`balance.cli check` hard-gates 11 checks against this data: days-to-`local` p50 in [10, 35] (competent-policy probe), buyout share of acquisitions < 30%, the 3 legacy Sprint 03/09 checks (Passive Grinder solvency, Flipper-vs-Passive separation, sanity floor), and 6 roster-coherence checks (economy-bible.md law 4, Sprints 55 and 66): every model's worst-case bill-to-clean ratio <= `maxBillFraction` (law 2), every model's flip margin at the worst roll is positive (law 1), every model's SENSIBLE-play margin is positive (law 1 as amended, Sprint 66), every model's repair wage beats the rent over the labour it takes (law 6, Sprint 66), every model's full consumable-replacement share of book value <= the content cap (law 3), and the service-job payout margin floor clears the profitability invariant's required coverage (law 4 - the full per-template/per-model proof is `serviceJobPayout.test.ts`, already gated in the standard test suite). 3 more are measured and reported but NOT gated (kept informational rather than promoted, since no maintainer has signed off on hard-gating them yet) - see `invariants.py`'s module docstring for their history. All 3 currently read BADLY, and deliberately so: as of Sprint 66 most strategies lose money (Flipper is well below its own starting cash) and the auction tail is frenzy-dominant. Do not tune the economy against those figures. They measure BOT behaviour, and the bots restore every car to mint - which economy-bible law 1, as amended in Sprint 66, now correctly punishes on a cheap car. The closed-form coherence table above is bot-free and proves the same cars clear a healthy margin on the play the economy actually asks for. The bots needing a rework to play the real game is a known, recorded defect (`TODO.md`), not an economy failure - see `docs/sprints/sprint66.md`'s Exit.
